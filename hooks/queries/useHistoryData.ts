import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';

/**
 * History item interface - matches actual database schema
 */
export interface HistoryItem {
  id: string;
  created_at: string;
  status:
    | 'queued'
    | 'downloading'
    | 'transcribing'
    | 'ai_processing'
    | 'completed'
    | 'failed';
  youtube_video_id: string;
  youtube_url: string;
  user_id: string; // ← FIXED: was workspace_id (doesn't exist)
  title?: string | null;
  thumbnail_url?: string | null;
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
        console.error('Database Fetch Error:', error);
        throw new Error(error.message);
      }

      return data as unknown as HistoryItem[];
    },
  });
};
