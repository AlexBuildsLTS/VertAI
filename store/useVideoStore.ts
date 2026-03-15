import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';

const extractYoutubeId = (url: string) => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/,
  );
  return match ? match[1] : `unknown-${Date.now()}`;
};

interface VideoState {
  isProcessing: boolean;
  currentVideoId: string | null;
  error: string | null;
  processVideo: (youtubeUrl: string, workspaceId: string) => Promise<void>;
}

export const useVideoStore = create<VideoState>((set) => ({
  isProcessing: false,
  currentVideoId: null,
  error: null,

  processVideo: async (youtubeUrl: string, workspaceId: string) => {
    set({ isProcessing: true, error: null, currentVideoId: null });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated to system.');

      const videoId = extractYoutubeId(youtubeUrl);

      // 1. Create the database record (Status: queued)
      const { data, error } = await supabase
        .from('videos')
        .insert([
          {
            youtube_url: youtubeUrl,
            youtube_video_id: videoId,
            workspace_id: workspaceId,
            uploaded_by: user.id,
            status: 'queued',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      set({ currentVideoId: data.id });

      // 2. THE MISSING LINK: Actually tell the Edge Function to start working!
      // This runs asynchronously in the background.
      supabase.functions
        .invoke('process-video', {
          body: { video_id: data.id, youtube_url: youtubeUrl },
        })
        .catch((err) => console.error('Edge Function Invocation Error:', err));
    } catch (err: any) {
      console.error('Database Insert Error:', err);
      set({ error: err.message, isProcessing: false });
    }
  },
}));
