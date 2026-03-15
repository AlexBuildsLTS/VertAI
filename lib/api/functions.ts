import { supabase } from '../supabase/client';

export const EdgeFunctions = {
  /**
   * Triggers the STT pipeline for a specific YouTube video
   */
  processVideo: async (videoId: string, youtubeUrl: string) => {
    const { data, error } = await supabase.functions.invoke('process-video', {
      body: { videoId, youtubeUrl },
    });

    if (error) {
      console.error('Edge Function Error:', error);
      throw new Error(error.message || 'Failed to process video');
    }

    return data;
  },

  /**
   * Manually regenerate AI insights if the user requests it
   */
  generateInsights: async (videoId: string, transcriptText: string) => {
    const { data, error } = await supabase.functions.invoke(
      'generate-ai-insights',
      {
        body: { videoId, text: transcriptText },
      },
    );

    if (error) throw new Error(error.message);
    return data;
  },
};
