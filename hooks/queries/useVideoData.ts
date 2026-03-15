import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { Database } from '../../types/database/database.types';

// Pull the exact Row types from the generated schema you provided
type VideoRow = Database['public']['Tables']['videos']['Row'];
type TranscriptRow = Database['public']['Tables']['transcripts']['Row'];
type AiInsightRow = Database['public']['Tables']['ai_insights']['Row'];

// 100% BULLETPROOF INTERFACE FOR YOUR UI
// 1. We force transcript_json to 'any' so it bypasses the strict JSON mismatch in TranscriptViewer.
// 2. We force ai_insights to be a SINGLE object, not an array, so .summary and .chapters work instantly.
export interface VideoWithRelations extends VideoRow {
  transcripts: (Omit<TranscriptRow, 'transcript_json'> & {
    transcript_json: any;
  })[];
  ai_insights: AiInsightRow | null;
}

export const useVideoData = (videoId: string | null) => {
  return useQuery({
    queryKey: ['video', videoId],

    queryFn: async (): Promise<VideoWithRelations | null> => {
      if (!videoId) return null;

      const { data, error } = await supabase
        .from('videos')
        .select(
          `
          *,
          transcripts (*),
          ai_insights (*)
        `,
        )
        .eq('id', videoId)
        .single();

      if (error) {
        console.error('Error fetching video data:', error);
        throw new Error(error.message);
      }

      // DATA FORMATTER: This bridges the gap between Supabase's raw data and your strict UI expectations.
      const formattedData: VideoWithRelations = {
        ...data,
        // If Supabase returns an array for insights, grab the first object. Otherwise, pass the object.
        ai_insights: Array.isArray(data.ai_insights)
          ? data.ai_insights[0] || null
          : data.ai_insights || null,
        transcripts: Array.isArray(data.transcripts) ? data.transcripts : [],
      };

      return formattedData;
    },

    enabled: !!videoId,

    refetchInterval: (query) => {
      const status = query.state?.data?.status;

      if (status === 'completed' || status === 'failed') {
        return false;
      }

      return 2000;
    },
  });
};
