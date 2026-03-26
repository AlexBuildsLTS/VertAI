/**
 * The primary interface for triggering Supabase Edge Functions.
 */
import { supabase } from '../supabase/client';

export const EdgeFunctions = {
  /**
   * Triggers the process-video pipeline.
   * @param videoId The UUID of the record in the 'videos' table.
   * @param videoUrl The full YouTube URL.
   * @param language Targeted language for AI processing.
   */
  async processVideo(
    videoId: string,
    videoUrl: string,
    language: string = 'english',
  ) {
    const { data, error } = await supabase.functions.invoke('process-video', {
      body: {
        videoId,
        videoUrl,
        language,
      },
    });

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[EdgeFunction] Invocation error:', error);
      }
      throw new Error(error.message || 'Failed to trigger video processing');
    }

    return data;
  },
};
