//lib/api/queue.ts
import { supabase } from '../supabase/client';
import { YouTubeService } from '../../services/youtube';
import { Database } from '../../types/database/database.types';

type VideoInsert = Database['public']['Tables']['videos']['Insert'];

export const submitBatchJob = async (
  workspaceId: string,
  videoUrls: string[],
  batchName: string,
) => {
  const { data: batch, error: batchError } = await supabase
    .from('batch_jobs')
    .insert({
      workspace_id: workspaceId,
      name: batchName,
      status: 'processing',
    })
    .select('id')
    .single();

  if (batchError) throw batchError;

  const videoInserts: VideoInsert[] = videoUrls.map((url) => {
    const videoId = YouTubeService.extractId(url);
    if (!videoId) throw new Error(`Invalid YouTube URL: ${url}`);

    return {
      workspace_id: workspaceId,
      batch_id: batch.id,
      youtube_url: url,
      status: 'queued' as const, // Fixes the enum type mismatch
      youtube_video_id: videoId, // Fixes the 'any' type error
    };
  });

  const { error: videosError } = await supabase
    .from('videos')
    .insert(videoInserts);

  if (videosError) throw videosError;

  return batch.id;
};
