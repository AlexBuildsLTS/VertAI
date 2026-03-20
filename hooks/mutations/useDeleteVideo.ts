import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';

export const useDeleteVideo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (videoId: string) => {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw new Error(error.message);
      return videoId;
    },
    onSuccess: () => {
      // Sync the key with HistoryScreen to trigger a refresh
      queryClient.invalidateQueries({ queryKey: ['video-history'] });
    },
    onError: (error: any) => {
      console.error('SYSTEM_PURGE_FAILURE:', error.message);
    },
  });
};
