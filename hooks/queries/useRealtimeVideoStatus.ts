/**
 * hooks/queries/useRealtimeVideoStatus.ts
 * Active WebSocket Listener & Store Synchronizer
 * ----------------------------------------------------------------------------
 * Listens to postgres updates on the specific video ID and pushes 
 * updates straight into the Zustand global store and React Query cache.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { useVideoStore } from '../../store/useVideoStore';
import { Database } from '../../types/database/database.types';

type VideoRow = Database['public']['Tables']['videos']['Row'];

export const useRealtimeVideoStatus = (videoId: string | null) => {
  const queryClient = useQueryClient();
  const { setActiveVideoId, setError } = useVideoStore();

  // 1. Initial State Fetch
  const { data, isLoading, error } = useQuery({
    queryKey: ['video_base', videoId],
    queryFn: async () => {
      if (!videoId) return null;
      const { data: dbData, error: dbError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();

      if (dbError) {
        if (dbError.code === 'PGRST116') return null;
        throw new Error(dbError.message);
      }
      return dbData as VideoRow;
    },
    enabled: !!videoId,
  });

  // 2. Link initial state to global store
  useEffect(() => {
    if (videoId) setActiveVideoId(videoId);
  }, [videoId, setActiveVideoId]);

  // 3. Establish WebSocket Connection
  useEffect(() => {
    if (!videoId) return;

    const channel = supabase
      .channel(`video-realtime-${videoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: `id=eq.${videoId}`,
        },
        (payload) => {
          const updatedRow = payload.new as VideoRow;

          // Push fatal errors directly to the UI overlay
          if (updatedRow.status === 'failed' && updatedRow.error_message) {
            setError(updatedRow.error_message);
          }

          // Instantly update the relational query cache to reflect the new status
          queryClient.setQueryData(['video_relational', videoId], (oldData: any) => {
            if (!oldData) return updatedRow;
            return { ...oldData, ...updatedRow };
          });

          // Trigger a full relational refetch if the pipeline completes
          if (updatedRow.status === 'completed' || updatedRow.status === 'failed') {
            queryClient.invalidateQueries({ queryKey: ['video_relational', videoId] });
            queryClient.invalidateQueries({ queryKey: ['video-history'] });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Synchronized with Node ${videoId.slice(0, 8)}`);
        }
      });

    // Teardown sequence
    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, queryClient, setError]);

  return { data, isLoading, error };
};