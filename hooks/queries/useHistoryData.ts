/**
 * hooks/queries/useHistoryData.ts
 * Sovereign Archive Fetcher
 * ----------------------------------------------------------------------------
 * Fetches the complete list of video processing history for the current user.
 * Strictly typed against the Supabase Database schema.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { Database } from '../../types/database/database.types';

type VideoRow = Database['public']['Tables']['videos']['Row'];

export const useHistoryData = () => {
  return useQuery<VideoRow[]>({
    queryKey: ['video-history'],

    queryFn: async () => {
      // 1. Verify Authentication Context
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Authentication required to access the Vault.');
      }

      // 2. Fetch Historical Payloads
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[HistoryData:FAIL]', error.message);
        throw new Error(`Database Error: ${error.message}`);
      }

      // Ensure we always return an array, even if empty
      return (data || []) as VideoRow[];
    },

    // Keep history cached for 2 minutes to prevent spamming the database
    // on frequent tab switches, but rely on Realtime invalidations for updates.
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });
};