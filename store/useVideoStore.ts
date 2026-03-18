/**
 * store/useVideoStore.ts
 *
 * Orchestrates video submission:
 * 1. Insert video record (status = queued)
 * 2. Run client-side caption fetch (corsproxy → YouTube timedtext / watch page)
 * 3. Run client-side audio URL resolution (corsproxy → Piped / Invidious)
 * 4. Fire edge function with whatever the client gathered
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import {
  extractYouTubeId,
  fetchYouTubeCaptions,
} from '../utils/youtubeCaptions';
import { fetchYouTubeAudioUrl } from '../utils/youtubeAudio';
import type { Enums, TablesInsert } from '../types/database/database.types';

export type VideoStatus = Enums<'video_status'>;

interface ProcessVideoPayload {
  video_id: string;
  video_url: string;
  transcript_text?: string | null;
  client_audio_url?: string | null;
}

interface VideoState {
  isProcessing: boolean;
  currentVideoId: string | null;
  currentVideoStatus: VideoStatus | null;
  error: string | null;
  clearError: () => void;
  reset: () => void;
  updateVideoStatus: (videoId: string, status: VideoStatus) => void;
  processVideo: (videoUrl: string) => Promise<void>;
}

const INITIAL_STATE = {
  isProcessing: false,
  currentVideoId: null,
  currentVideoStatus: null,
  error: null,
};

export const useVideoStore = create<VideoState>((set, get) => ({
  ...INITIAL_STATE,

  clearError: () => set({ error: null }),
  reset: () => set(INITIAL_STATE),
  updateVideoStatus: (_videoId, status) => set({ currentVideoStatus: status }),

  processVideo: async (videoUrl: string) => {
    if (get().isProcessing) return;

    const ytId = extractYouTubeId(videoUrl);
    if (!ytId) {
      set({ error: 'Please enter a valid YouTube URL.' });
      return;
    }

    set({ isProcessing: true, error: null, currentVideoId: null });

    try {
      // 1. Get Auth Session (FIXED: Capture 'session' for the token)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user || !session) throw new Error('Not authenticated.');

      // 2. Get Workspace Member
      const { data: member } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (!member) throw new Error('No workspace found.');

      // 3. Insert video record
      const videoInsert: TablesInsert<'videos'> = {
        youtube_url: videoUrl,
        youtube_video_id: ytId,
        workspace_id: member.workspace_id,
        uploaded_by: user.id,
        status: 'queued',
      };

      const { data: video, error: insertError } = await supabase
        .from('videos')
        .insert([videoInsert])
        .select('id')
        .single();

      if (insertError || !video)
        throw insertError || new Error('Failed to create video record.');

      // Store the string ID for use in filters
      const videoId = video.id;
      set({ currentVideoId: videoId, currentVideoStatus: 'queued' });

      // 4. Client-side data gathering (parallel, non-fatal)
      const [clientTranscript, clientAudioUrl] = await Promise.allSettled([
        fetchYouTubeCaptions(ytId),
        fetchYouTubeAudioUrl(videoUrl, ytId),
      ]).then((results) => [
        results[0].status === 'fulfilled' ? results[0].value : null,
        results[1].status === 'fulfilled' ? results[1].value : null,
      ]);

      // 5. Fire Edge Function (FIXED: Headers use captured session)
      const payload: ProcessVideoPayload = {
        video_url: videoUrl,
        video_id: videoId,
        transcript_text: clientTranscript,
        client_audio_url: clientAudioUrl,
      };

      supabase.functions
        .invoke('process-video', {
          body: payload,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        .then(async ({ error: fnError }) => {
          if (fnError) {
            console.error('[Store] Edge Function Error:', fnError.message);
            // FIXED: Use videoId (string) instead of video (object)
            await supabase
              .from('videos')
              .update({ status: 'failed', error_message: fnError.message })
              .eq('id', videoId);

            set({
              currentVideoStatus: 'failed',
              error: 'Processing failed to start.',
            });
          }
        })
        .catch(async (err) => {
          console.error('[Store] Invoke Exception:', err);
          // FIXED: Use videoId (string) instead of video (object)
          await supabase
            .from('videos')
            .update({
              status: 'failed',
              error_message: 'Network error contacting Edge Function',
            })
            .eq('id', videoId);

          set({
            currentVideoStatus: 'failed',
            error: 'Network error while processing.',
          });
        });
    } catch (err: any) {
      console.error('[Store] Process Error:', err);
      set({
        error: err.message || 'An unexpected error occurred.',
        isProcessing: false,
      });
    } finally {
      set({ isProcessing: false });
    }
  },
}));
