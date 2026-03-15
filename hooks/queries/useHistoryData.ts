import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';

/**
 * FIXED_HISTORY_INTERFACE
 * Matches your exact database column names to kill the conversion errors.
 */
export interface HistoryItem {
  id: string;
  created_at: string;
  status: 'queued' | 'downloading' | 'transcribing' | 'ai_processing' | 'completed' | 'failed';
  youtube_video_id: string; // Changed from video_url to match your DB
  workspace_id: string;
  audio_url?: string | null;
  error_message?: string | null;
  duration_seconds?: number | null;
}

export const useHistoryData = () => {
  return useQuery<HistoryItem[]>({
    queryKey: ['video-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Database Fetch Error:", error);
        throw new Error(error.message);
      }

      // Convert to unknown then to HistoryItem[] to satisfy the compiler
      return (data as any) as HistoryItem[];
    },
  });
};