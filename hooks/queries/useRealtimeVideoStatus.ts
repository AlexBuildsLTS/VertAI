import { useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useVideoStore } from '../../store/slices/useVideoStore';

export const useRealtimeVideoStatus = (videoId: string | null) => {
    const updateVideoStatus = useVideoStore((state) => state.updateVideoStatus);
        

  useEffect(() => {
    if (!videoId) return;

    const channel = supabase
      .channel(`video-status-${videoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: `id=eq.${videoId}`,
        },
        (payload) => {
          // Push new status directly to Zustand for 120fps UI response
          if (payload.new && payload.new.status) {
            updateVideoStatus(videoId, payload.new.status);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, updateVideoStatus]);
};
