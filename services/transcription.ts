import { supabase } from '../lib/supabase/client';

export const TranscriptionService = {
  /**
   * Triggers the Edge Function to process a specific video manually.
   */
  processVideo: async (videoId: string, youtubeUrl: string) => {
    const { data, error } = await supabase.functions.invoke('process-video', {
      body: { video_id: videoId, youtube_url: youtubeUrl },
    });

    if (error) throw new Error(`Failed to invoke processing: ${error.message}`);
    return data;
  },

  /**
   * Fetches supported languages from your backend config (mocked for now).
   */
  getSupportedLanguages: () => {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      // Add more to hit your 50+ target
    ];
  },
};
