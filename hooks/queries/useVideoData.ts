/**
 * hooks/queries/useVideoData.ts
 * Enterprise Relational Data Fetcher
 * ----------------------------------------------------------------------------
 * Fetches a video record joined with its transcripts and ai_insights.
 * Designed to strictly match Database['public']['Tables'].
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { Database } from '../../types/database/database.types';

// ─── STRICT DOMAIN TYPES ─────────────────────────────────────────────────────

type VideoRow = Database['public']['Tables']['videos']['Row'];
type TranscriptRow = Database['public']['Tables']['transcripts']['Row'];
type AiInsightRow = Database['public']['Tables']['ai_insights']['Row'];
export type VideoStatus = Database['public']['Enums']['video_status'];

/**
 * Supabase returns joined relations as arrays. We normalize them here so the UI 
 * doesn't have to deal with array indexing for 1-to-1 relationships.
 */
export interface VideoWithRelations extends VideoRow {
  transcripts: TranscriptRow[];
  ai_insights: AiInsightRow | null;
}

export const videoQueryKeys = {
  detail: (videoId: string) => ['video_relational', videoId] as const,
} as const;

// ─── POLLING CONSTANTS ───────────────────────────────────────────────────────

const TERMINAL_VIDEO_STATUSES = new Set<VideoStatus>(['completed', 'failed']);
const POLL_INTERVAL_MS = 2000;

// ─── NORMALIZATION ENGINE ────────────────────────────────────────────────────

function normaliseVideoPayload(raw: any): VideoWithRelations {
  // Defensive normalization to ensure the UI never crashes on undefined arrays
  return {
    ...raw,
    ai_insights: Array.isArray(raw.ai_insights) ? (raw.ai_insights[0] ?? null) : (raw.ai_insights ?? null),
    transcripts: Array.isArray(raw.transcripts) ? raw.transcripts : [],
  };
}

// ─── QUERY HOOK ──────────────────────────────────────────────────────────────

export const useVideoData = (videoId: string | null) => {
  return useQuery({
    queryKey: videoId ? videoQueryKeys.detail(videoId) : ['video_relational', null],

    queryFn: async (): Promise<VideoWithRelations | null> => {
      if (!videoId) return null;

      // Single efficient query to grab the entity and its children
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          transcripts (*),
          ai_insights (*)
        `)
        .eq('id', videoId)
        .single();

      if (error) {
        // PGRST116 = No rows returned. Treat as a soft 404.
        if (error.code === 'PGRST116') return null;
        throw new Error(`[useVideoData] ${error.code}: ${error.message}`);
      }

      if (!data) return null;

      return normaliseVideoPayload(data);
    },

    enabled: !!videoId,

    // Smart Polling: Polls every 2s ONLY if the video is still processing.
    // Stops permanently once status is 'completed' or 'failed'.
    refetchInterval: (query) => {
      const status = query.state.data?.status as VideoStatus | undefined;
      return status && TERMINAL_VIDEO_STATUSES.has(status) ? false : POLL_INTERVAL_MS;
    },

    refetchIntervalInBackground: false,
    staleTime: POLL_INTERVAL_MS,
    retry: 1, // Fail fast on network errors
  });
};