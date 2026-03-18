/**
 * hooks/queries/useVideoData.ts
 * Fetches a video record with its transcript and AI insights.
 * Polls every 2 s while the job is in-flight; stops automatically
 * once the Realtime hook invalidates the cache on completion/failure.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { Database } from '../../types/database/database.types';

// ─── Domain types ────────────────────────────────────────────────────────────

type VideoRow = Database['public']['Tables']['videos']['Row'];
type TranscriptRow = Database['public']['Tables']['transcripts']['Row'];
type AiInsightRow = Database['public']['Tables']['ai_insights']['Row'];

/** Narrowed from the DB enum so mis-spelled literals are caught at compile time. */
export type VideoStatus = Database['public']['Enums']['video_status'];

/**
 * transcript_json is widened to `Record<string, unknown>` rather than the
 * opaque Supabase `Json` alias so consumers can index into it without casts.
 */
type TranscriptWithParsedJson = Omit<TranscriptRow, 'transcript_json'> & {
  transcript_json: Record<string, unknown>;
};

/** Full video payload consumed by the video detail screen. */
export interface VideoWithRelations extends VideoRow {
  transcripts: TranscriptWithParsedJson[];
  /** Normalised to a single object (Supabase returns array for 1-to-1 joins) */
  ai_insights: AiInsightRow | null;
}

// ─── Query-key factory ────────────────────────────────────────────────────────
// Centralise the key shape so useRealtimeVideoStatus and any future mutations
// can invalidate/prefetch without duplicating the ['video', id] literal.

export const videoQueryKeys = {
  detail: (videoId: string) => ['video', videoId] as const,
} as const;

// ─── Polling constants ────────────────────────────────────────────────────────

/** Statuses after which polling must stop and no retry is needed. */
export const TERMINAL_VIDEO_STATUSES = new Set<VideoStatus>(['completed', 'failed']);

const POLL_INTERVAL_MS = 2_000;

// ─── Data-normalisation helper ────────────────────────────────────────────────

/** Raw shape returned by the joined PostgREST query before normalisation. */
type RawVideoPayload = VideoRow & {
  transcripts: TranscriptRow[] | TranscriptRow | null;
  ai_insights: AiInsightRow[] | AiInsightRow | null;
};

/**
 * PostgREST always returns joined relations as arrays, even for 1-to-1
 * relationships. This helper coerces the raw response into the typed shape
 * expected by callers.
 */
function normaliseVideoPayload(raw: RawVideoPayload): VideoWithRelations {
  return {
    ...raw,
    ai_insights: Array.isArray(raw.ai_insights)
      ? (raw.ai_insights[0] ?? null)
      : (raw.ai_insights ?? null),
    transcripts: Array.isArray(raw.transcripts) ? (raw.transcripts as TranscriptWithParsedJson[]) : [],
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useVideoData = (videoId: string | null) => {
  return useQuery({
    queryKey: videoId ? videoQueryKeys.detail(videoId) : ['video', null],

    queryFn: async (): Promise<VideoWithRelations | null> => {
      if (!videoId) return null;

      const { data, error } = await supabase
        .from('videos')
        .select('*, transcripts(*), ai_insights(*)')
        .eq('id', videoId)
        .single();

      // PGRST116 = "no rows returned" — treat as a soft not-found rather than
      // an exception so the UI can render a 404 state without an error boundary.
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`[useVideoData] ${error.code}: ${error.message}`);
      }

      if (!data) return null;

      return normaliseVideoPayload(data);
    },

    enabled: !!videoId,

    // Poll every 2 s while the job is in-flight.
    // The Realtime hook (useRealtimeVideoStatus) invalidates this query on
    // status change, which causes an immediate re-fetch and re-evaluation of
    // refetchInterval — stopping the poll the moment a terminal state lands.
    refetchInterval: (query) => {
      const status = query.state.data?.status as VideoStatus | undefined;
      return status && TERMINAL_VIDEO_STATUSES.has(status) ? false : POLL_INTERVAL_MS;
    },

    // Don't poll while the app is backgrounded (important on mobile).
    refetchIntervalInBackground: false,

    // Match staleTime to the poll interval so a component mount that fires
    // within the same 2 s window doesn't trigger a redundant network request.
    staleTime: POLL_INTERVAL_MS,

    // A single retry is enough — transient network blips happen, but persistent
    // errors should surface quickly rather than spinning for 30 s.
    retry: 1,
  });
};
