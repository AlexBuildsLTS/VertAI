/**
 * store/useVideoStore.ts
 * ══════════════════════════════════════════════════════════════════════════════
 * THE MAIN ORCHESTRATION STORE (ROBUST ERROR HANDLING VERSION)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is the heart of TranscriberPro. It orchestrates the full 3-phase pipeline.
 *
 * NOTE: All console.error calls have been converted to console.warn/log to
 * prevent Expo's intrusive Error Overlay (RedBox/BlackBox) from blocking the UI
 * during expected Edge Function or extraction failures.
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import {
  fetchYouTubeCaptions,
  extractYouTubeId,
} from '../utils/youtubeCaptions';
import { fetchYouTubeAudioUrl } from '../utils/youtubeAudio';
import {
  parseVideoUrl,
  extractVideoId,
  type VideoPlatform,
} from '../utils/youtube';
import type { Session } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type VideoStatus =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'transcribing'
  | 'ai_processing'
  | 'completed'
  | 'failed';

export type ProcessingPhase =
  | 'idle'
  | 'validating'
  | 'fetching_captions'
  | 'fetching_audio'
  | 'uploading'
  | 'transcribing'
  | 'generating_insights'
  | 'completed'
  | 'failed';

interface ProcessingProgress {
  phase: ProcessingPhase;
  message: string;
  percent: number;
}

interface VideoState {
  // Processing State
  isProcessing: boolean;
  currentVideoId: string | null;
  currentVideoUrl: string | null;
  currentVideoStatus: VideoStatus;
  progress: ProcessingProgress;
  error: string | null;

  // Methods
  processVideo: (videoUrl: string, language?: string) => Promise<void>;
  retryVideo: (videoId: string, videoUrl: string) => Promise<void>;
  updateVideoStatus: (videoId: string, status: VideoStatus) => void;
  clearError: () => void;
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ERROR_MESSAGES = {
  INVALID_URL: 'Please enter a valid video URL',
  UNSUPPORTED_PLATFORM: 'This video platform is not yet supported',
  NOT_AUTHENTICATED: 'Please sign in to continue',
  NETWORK_ERROR: 'Network error. Please check your connection',
  CAPTION_FAILED: 'Could not extract captions',
  AUDIO_FAILED: 'Could not extract audio',
  TRANSCRIPTION_FAILED: 'Transcription failed',
  AI_FAILED: 'AI insight generation failed',
  EDGE_FUNCTION_FAILED: 'Server processing failed',
  DB_ERROR: 'Database error',
  UNKNOWN: 'An unexpected error occurred',
} as const;

const PROGRESS_STATES: Record<ProcessingPhase, ProcessingProgress> = {
  idle: { phase: 'idle', message: 'Ready', percent: 0 },
  validating: { phase: 'validating', message: 'Validating URL...', percent: 5 },
  fetching_captions: {
    phase: 'fetching_captions',
    message: 'Extracting captions (fast path)...',
    percent: 15,
  },
  fetching_audio: {
    phase: 'fetching_audio',
    message: 'Extracting audio (fallback)...',
    percent: 25,
  },
  uploading: {
    phase: 'uploading',
    message: 'Uploading to server...',
    percent: 40,
  },
  transcribing: {
    phase: 'transcribing',
    message: 'Transcribing with AI...',
    percent: 60,
  },
  generating_insights: {
    phase: 'generating_insights',
    message: 'Generating insights...',
    percent: 85,
  },
  completed: { phase: 'completed', message: 'Complete!', percent: 100 },
  failed: { phase: 'failed', message: 'Failed', percent: 0 },
};

const INITIAL_STATE = {
  isProcessing: false,
  currentVideoId: null,
  currentVideoUrl: null,
  currentVideoStatus: 'idle' as VideoStatus,
  progress: PROGRESS_STATES.idle,
  error: null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ensures user is authenticated
 */
async function requireSession(): Promise<Session> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.warn('[Auth] Session error:', error.message);
    throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
  }

  if (!session) {
    throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
  }

  return session;
}

/**
 * Creates initial video record in database
 */
async function createVideoRecord(
  videoUrl: string,
  videoId: string | null,
  userId: string,
  platform: VideoPlatform,
): Promise<string> {
  const { data, error } = await supabase
    .from('videos')
    .insert({
      youtube_url: videoUrl, // We use youtube_url for all platforms (legacy naming)
      youtube_video_id: videoId,
      user_id: userId,
      status: 'queued' as const,
      processing_provider: platform,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[DB] Insert error:', error.message);
    throw new Error(ERROR_MESSAGES.DB_ERROR);
  }

  if (!data?.id) {
    throw new Error(ERROR_MESSAGES.DB_ERROR);
  }

  return data.id;
}

/**
 * Updates video status in database safely
 */
async function updateVideoRecord(
  recordId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('videos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', recordId);

    if (error) {
      console.warn('[DB] Update error:', error.message);
    }
  } catch (err) {
    console.warn('[DB] Failed to execute update request:', err);
  }
}

/**
 * Invokes the process-video Edge Function
 */
async function invokeProcessVideo(
  recordId: string,
  videoUrl: string,
  language: string,
  session: Session,
  transcriptText?: string | null,
  audioUrl?: string | null,
): Promise<void> {
  console.log('[Edge] Invoking process-video...');
  console.log('[Edge] Payload:', {
    video_id: recordId,
    video_url: videoUrl,
    has_transcript: !!transcriptText,
    has_audio: !!audioUrl,
  });

  const { data, error } = await supabase.functions.invoke('process-video', {
    body: {
      video_id: recordId,
      video_url: videoUrl,
      language,
      transcript_text: transcriptText,
      audio_url: audioUrl,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.warn('[Edge] Function network error:', error.message);
    throw new Error(error.message || ERROR_MESSAGES.EDGE_FUNCTION_FAILED);
  }

  // Check for application-level errors inside the returned data
  if (data && typeof data === 'object') {
    if ('success' in data && data.success === false) {
      const errMsg =
        (data as { error?: string }).error ||
        ERROR_MESSAGES.EDGE_FUNCTION_FAILED;
      throw new Error(errMsg);
    }
    if ('error' in data && data.error) {
      throw new Error(String(data.error));
    }
  }

  console.log('[Edge] Success payload received');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN STORE
// ═══════════════════════════════════════════════════════════════════════════════

export const useVideoStore = create<VideoState>((set, get) => ({
  ...INITIAL_STATE,

  /**
   * Clears current error
   */
  clearError: () => set({ error: null }),

  /**
   * Resets store to initial state
   */
  reset: () => set(INITIAL_STATE),

  /**
   * Updates video status (called by realtime subscription)
   */
  updateVideoStatus: (videoId: string, status: VideoStatus) => {
    const state = get();
    if (state.currentVideoId === videoId) {
      set({
        currentVideoStatus: status,
        isProcessing: !['completed', 'failed'].includes(status),
      });

      // Update progress based on status
      if (status === 'transcribing') {
        set({ progress: PROGRESS_STATES.transcribing });
      } else if (status === 'ai_processing') {
        set({ progress: PROGRESS_STATES.generating_insights });
      } else if (status === 'completed') {
        set({ progress: PROGRESS_STATES.completed, isProcessing: false });
      } else if (status === 'failed') {
        set({ progress: PROGRESS_STATES.failed, isProcessing: false });
      }
    }
  },

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * MAIN PROCESSING FUNCTION
   * ═══════════════════════════════════════════════════════════════════════════
   */
  processVideo: async (videoUrl: string, language = 'english') => {
    const state = get();

    // Prevent concurrent processing
    if (state.isProcessing) {
      console.log('[Process] Already processing, ignoring');
      return;
    }

    // Reset and start
    set({
      ...INITIAL_STATE,
      isProcessing: true,
      currentVideoUrl: videoUrl,
      progress: PROGRESS_STATES.validating,
    });

    const startTime = Date.now();

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 1: VALIDATE URL & DETECT PLATFORM
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[Process] ═══ STEP 1: VALIDATING URL ═══');

      const videoInfo = parseVideoUrl(videoUrl);

      if (!videoInfo.isValid) {
        throw new Error(ERROR_MESSAGES.INVALID_URL);
      }

      console.log('[Process] Platform:', videoInfo.platform);
      console.log('[Process] Video ID:', videoInfo.videoId);

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 2: AUTHENTICATE
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[Process] ═══ STEP 2: AUTHENTICATING ═══');

      const session = await requireSession();
      console.log('[Process] User:', session.user.id);

      // ─────────────────────────────────────────────────────────────────────────
      // PHASE 1: CAPTIONS (THE FAST PATH)
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[Process] ═══ PHASE 1: CAPTIONS (FAST PATH) ═══');
      set({ progress: PROGRESS_STATES.fetching_captions });

      let transcriptText: string | null = null;

      // Only YouTube has reliable caption APIs
      if (videoInfo.platform === 'youtube' && videoInfo.videoId) {
        try {
          console.log('[Process] Attempting client-side caption extraction...');
          transcriptText = await fetchYouTubeCaptions(videoInfo.videoId);

          if (transcriptText) {
            console.log(
              `[Process] ✓ CAPTIONS FOUND: ${transcriptText.length} chars`,
            );
            console.log(
              `[Process] Fast path success in ${Date.now() - startTime}ms`,
            );
          } else {
            console.log('[Process] No captions available');
          }
        } catch (e) {
          console.warn(
            '[Process] Caption extraction issue (non-fatal):',
            e instanceof Error ? e.message : e,
          );
        }
      } else {
        console.log(
          `[Process] Platform ${videoInfo.platform} - skipping caption scrape`,
        );
      }

      // ─────────────────────────────────────────────────────────────────────────
      // PHASE 2: AUDIO EXTRACTION (FALLBACK - ONLY IF NO CAPTIONS)
      // ─────────────────────────────────────────────────────────────────────────
      let audioUrl: string | null = null;

      if (!transcriptText) {
        console.log('[Process] ═══ PHASE 2: AUDIO EXTRACTION (FALLBACK) ═══');
        set({ progress: PROGRESS_STATES.fetching_audio });

        try {
          console.log(
            '[Process] Attempting client-side audio URL resolution...',
          );
          audioUrl = await fetchYouTubeAudioUrl(
            videoUrl,
            videoInfo.videoId ?? undefined,
          );

          if (audioUrl) {
            console.log(`[Process] ✓ AUDIO URL FOUND`);
          } else {
            console.log(
              '[Process] No audio URL resolved (Edge Function will try)',
            );
          }
        } catch (e) {
          console.warn(
            '[Process] Audio extraction issue (non-fatal):',
            e instanceof Error ? e.message : e,
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 3: CREATE DATABASE RECORD
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[Process] ═══ STEP 3: CREATING DB RECORD ═══');
      set({ progress: PROGRESS_STATES.uploading });

      const recordId = await createVideoRecord(
        videoUrl,
        videoInfo.videoId,
        session.user.id,
        videoInfo.platform,
      );

      console.log('[Process] Record ID:', recordId);

      set({
        currentVideoId: recordId,
        currentVideoStatus: 'queued',
      });

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 4: INVOKE EDGE FUNCTION (PHASE 3 HAPPENS SERVER-SIDE)
      // ─────────────────────────────────────────────────────────────────────────
      console.log('[Process] ═══ STEP 4: INVOKING EDGE FUNCTION ═══');
      set({ progress: PROGRESS_STATES.transcribing });

      await invokeProcessVideo(
        recordId,
        videoUrl,
        language,
        session,
        transcriptText,
        audioUrl,
      );

      // Success - Edge Function is now processing
      console.log(
        `[Process] ═══ HANDOFF COMPLETE in ${Date.now() - startTime}ms ═══`,
      );

      set({
        progress: {
          ...PROGRESS_STATES.transcribing,
          message: transcriptText
            ? 'Generating AI insights...'
            : 'Transcribing audio...',
        },
      });
    } catch (error) {
      // ─────────────────────────────────────────────────────────────────────────
      // ERROR HANDLING
      // ─────────────────────────────────────────────────────────────────────────
      const message =
        error instanceof Error
          ? error.message
          : String(error) || ERROR_MESSAGES.UNKNOWN;

      // Changed from console.error to console.warn to prevent Expo's intrusive RedBox
      console.warn('[Process] ═══ PROCESS FAILED ═══', message);

      const videoId = get().currentVideoId;
      if (videoId) {
        // Run background DB update safely without risking another throw
        updateVideoRecord(videoId, {
          status: 'failed',
          error_message: message,
        });
      }

      set({
        isProcessing: false,
        currentVideoStatus: 'failed',
        progress: PROGRESS_STATES.failed,
        error: message,
      });
    }
  },

  /**
   * Retries a failed video safely
   */
  retryVideo: async (videoId: string, videoUrl: string) => {
    const state = get();

    if (state.isProcessing) {
      return;
    }

    set({
      ...INITIAL_STATE,
      isProcessing: true,
      currentVideoId: videoId,
      currentVideoUrl: videoUrl,
      progress: PROGRESS_STATES.validating,
    });

    try {
      const session = await requireSession();
      const videoInfo = parseVideoUrl(videoUrl);

      // Fetch retry count safely
      const { data: video, error: fetchErr } = await supabase
        .from('videos')
        .select('retry_count')
        .eq('id', videoId)
        .single();

      if (fetchErr) {
        console.warn(
          '[Process] Could not fetch retry count:',
          fetchErr.message,
        );
      }

      const newRetryCount = (video?.retry_count ?? 0) + 1;

      await updateVideoRecord(videoId, {
        status: 'queued',
        error_message: null,
        retry_count: newRetryCount,
        last_retry_at: new Date().toISOString(),
      });

      set({
        currentVideoStatus: 'queued',
        progress: PROGRESS_STATES.validating,
      });

      set({ progress: PROGRESS_STATES.fetching_captions });

      // Try captions again
      let transcriptText: string | null = null;
      if (videoInfo.platform === 'youtube' && videoInfo.videoId) {
        try {
          transcriptText = await fetchYouTubeCaptions(videoInfo.videoId);
        } catch (e) {
          console.warn('[Process] Retry caption extraction issue:', e);
        }
      }

      // Try audio if no captions
      let audioUrl: string | null = null;
      if (!transcriptText) {
        set({ progress: PROGRESS_STATES.fetching_audio });
        try {
          audioUrl = await fetchYouTubeAudioUrl(
            videoUrl,
            videoInfo.videoId ?? undefined,
          );
        } catch (e) {
          console.warn('[Process] Retry audio extraction issue:', e);
        }
      }

      set({ progress: PROGRESS_STATES.transcribing });

      await invokeProcessVideo(
        videoId,
        videoUrl,
        'english',
        session,
        transcriptText,
        audioUrl,
      );

      set({
        currentVideoStatus: 'queued',
        progress: {
          ...PROGRESS_STATES.transcribing,
          message: 'Retrying processing...',
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error) || ERROR_MESSAGES.UNKNOWN;

      // Log cleanly as a warning
      console.warn('[Process] ═══ RETRY FAILED ═══', message);

      updateVideoRecord(videoId, {
        status: 'failed',
        error_message: message,
      });

      set({
        isProcessing: false,
        currentVideoStatus: 'failed',
        progress: PROGRESS_STATES.failed,
        error: message,
      });
    }
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

export const selectIsProcessing = (state: VideoState) => state.isProcessing;
export const selectCurrentVideoId = (state: VideoState) => state.currentVideoId;
export const selectProgress = (state: VideoState) => state.progress;
export const selectError = (state: VideoState) => state.error;
export const selectVideoStatus = (state: VideoState) =>
  state.currentVideoStatus;

export default useVideoStore;
