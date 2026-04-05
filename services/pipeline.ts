/**
 * services/pipeline.ts
 * Enterprise-Grade Orchestration Engine (2026 Standard)
 * ----------------------------------------------------------------------------
 * FEATURES:
 * 1. TRANSACTIONAL SAFETY: Postgres handles UUID generation.
 * 2. CHUNKED BATCHING: Prevents DB payload overflows on massive URL lists.
 * 3. EXPONENTIAL BACKOFF: Network resilience for Edge Function invocations.
 * 4. HYBRID ALIGNMENT: Perfectly synced with the Edge fast-path parameters.
 */

import { supabase } from '../lib/supabase/client';
import { Database } from '../types/database/database.types';
import { parseVideoUrl } from '../utils/videoParser';

type VideoInsert = Database['public']['Tables']['videos']['Insert'];
type VideoStatus = Database['public']['Enums']['video_status'];

export interface PipelineResult {
    success: boolean;
    videoId?: string;
    batchId?: string;
    error?: string;
}

// ─── UTILITY: EXPONENTIAL BACKOFF RETRY ─────────────────────────────────────
async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    baseDelayMs: number = 1000
): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error: any) {
            attempt++;
            if (attempt >= maxRetries) throw error;
            console.warn(`[Pipeline:Retry] Operation failed. Retrying ${attempt}/${maxRetries}...`);
            await new Promise((res) => setTimeout(res, baseDelayMs * Math.pow(2, attempt - 1)));
        }
    }
    throw new Error('Retry loop failed.');
}

// ─── UTILITY: ARRAY CHUNKING ────────────────────────────────────────────────
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

export class PipelineService {
    /**
     * HEADLESS SINGLE ORCHESTRATOR
     * Background processing bypass. Includes hybrid fast-path routing.
     */
    static async processSingleVideo(
        url: string,
        language: string = 'English',
        difficulty: string = 'standard',
        clientTranscript: string | null = null
    ): Promise<PipelineResult> {
        try {
            const parsed = parseVideoUrl(url);
            if (!parsed.isValid || !parsed.normalizedUrl) {
                throw new Error('INVALID_MEDIA: URL format not recognized.');
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) throw new Error('UNAUTHORIZED: Valid session required.');

            // PRE-INSERT
            const { data: videoRecord, error: dbError } = await supabase
                .from('videos')
                .insert({
                    user_id: session.user.id,
                    youtube_url: parsed.normalizedUrl,
                    youtube_video_id: parsed.videoId,
                    status: 'queued' as VideoStatus,
                    platform: parsed.platform,
                })
                .select('id')
                .single();

            if (dbError || !videoRecord) throw new Error(`DB_SYNC_ERROR: ${dbError?.message}`);

            // EDGE INVOCATION WITH RETRY SHIELD
            await withRetry(async () => {
                const { data, error: fnError } = await supabase.functions.invoke('process-video', {
                    body: {
                        video_id: videoRecord.id,
                        video_url: parsed.normalizedUrl,
                        platform: parsed.platform,
                        language,
                        difficulty,
                        transcript_text: clientTranscript,
                    },
                });

                if (fnError) throw new Error(`EDGE_GATEWAY_ERROR: ${fnError.message}`);
                if (data?.error) throw new Error(`EDGE_EXECUTION_ERROR: ${data.error}`);
            });

            return { success: true, videoId: videoRecord.id };
        } catch (err: any) {
            console.error('[PipelineService:Single] Critical Failure:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * HIGH-VOLUME BATCH ORCHESTRATOR
     * Fault-tolerant. Filters invalid links and chunks DB inserts to prevent 413 Payload Too Large.
     */
    static async submitBatch(
        urls: string[],
        batchName: string
    ): Promise<PipelineResult> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) throw new Error('UNAUTHORIZED: Session expired.');

            const validVideos = urls.map(url => parseVideoUrl(url)).filter(p => p.isValid && p.normalizedUrl);

            if (validVideos.length === 0) {
                throw new Error('VALIDATION_FAILED: No valid video URLs found in batch.');
            }

            const { data: batch, error: batchError } = await supabase
                .from('batch_jobs')
                .insert({
                    user_id: session.user.id,
                    name: batchName,
                    status: 'processing',
                    total_videos: validVideos.length,
                    completed_videos: 0,
                    failed_videos: 0,
                })
                .select('id')
                .single();

            if (batchError || !batch) throw new Error(`BATCH_INIT_FAILED: ${batchError?.message}`);

            const videoInserts: VideoInsert[] = validVideos.map((parsed) => ({
                user_id: session.user.id,
                batch_job_id: batch.id,
                youtube_url: parsed.normalizedUrl!,
                youtube_video_id: parsed.videoId,
                status: 'queued' as VideoStatus,
                platform: parsed.platform,
            }));

            // Chunk inserts to handle massive lists (e.g., 500+ URLs) safely
            const chunks = chunkArray(videoInserts, 50);
            for (const chunk of chunks) {
                const { error: chunkError } = await supabase.from('videos').insert(chunk);
                if (chunkError) throw new Error(`CHUNK_INSERT_FAILED: ${chunkError.message}`);
            }

            console.log(`[PipelineService:Batch] Dispatched ${validVideos.length} entities to Batch: ${batch.id}`);

            return { success: true, batchId: batch.id };
        } catch (err: any) {
            console.error('[PipelineService:Batch] Critical Failure:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * PROCESS TERMINATION
     */
    static async killProcess(videoId: string): Promise<boolean> {
        try {
            const { error } = await supabase.from('videos').delete().eq('id', videoId);
            if (error) throw error;
            console.log(`[PipelineService:Kill] Terminated process: ${videoId}`);
            return true;
        } catch (err: any) {
            console.error(`[PipelineService:Kill] Failed to terminate: ${err.message}`);
            return false;
        }
    }
}