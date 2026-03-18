/**
 * hooks/queries/useRealtimeVideoStatus.ts
 * Subscribes to Postgres changes for a single video row.
 * Pushes live status to Zustand and invalidates the React Query cache
 * so useVideoData stops polling the moment the job finishes.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { useVideoStore } from '../../store/useVideoStore';
import { videoQueryKeys, TERMINAL_VIDEO_STATUSES, VideoStatus } from './useVideoData';


export const useRealtimeVideoStatus = (videoId: string | null): void => {
  const updateVideoStatus = useVideoStore((s) => s.updateVideoStatus);
  const queryClient = useQueryClient();

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
          const status = payload.new?.status as VideoStatus | undefined;
          if (!status) return;

          // Sync Zustand so processing indicators update immediately
          updateVideoStatus(videoId, status as Parameters<typeof updateVideoStatus>[1]);

          // Always invalidate so the query re-fetches latest transcript + insights
          queryClient.invalidateQueries({ queryKey: videoQueryKeys.detail(videoId) });

          // Invalidate the history list once the job reaches a terminal state
          if (TERMINAL_VIDEO_STATUSES.has(status)) {
            queryClient.invalidateQueries({ queryKey: ['video-history'] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, updateVideoStatus, queryClient]);
};
