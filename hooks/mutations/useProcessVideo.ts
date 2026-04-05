/**
 * hooks/mutations/useProcessVideo.ts
 * Pipeline Dispatcher
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase/client';
import { useVideoStore } from '../../store/useVideoStore';
import { parseVideoUrl } from '../../utils/videoParser';
import { fetchClientCaptions } from '../../utils/clientCaptions';

interface ProcessVideoParams {
    videoUrl: string;
    language?: string;
    difficulty?: string;
}

interface EdgeResponse {
    success: boolean;
    error?: string;
    id?: string;
}

export const useProcessVideo = () => {
    const queryClient = useQueryClient();
    const setActiveVideoId = useVideoStore((state) => state.setActiveVideoId);
    const setError = useVideoStore((state) => state.setError);

    return useMutation({
        mutationFn: async ({ videoUrl, language = 'English', difficulty = 'standard' }: ProcessVideoParams) => {
            const parsed = parseVideoUrl(videoUrl);
            if (!parsed.isValid || !parsed.videoId || !parsed.normalizedUrl) {
                throw new Error('INVALID_MEDIA: URL format not recognized.');
            }

            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (authError || !session?.user) {
                throw new Error('UNAUTHORIZED: Session required.');
            }

            const videoUuid = crypto.randomUUID();
            setActiveVideoId(videoUuid);

            const { error: dbError } = await supabase.from('videos').insert({
                id: videoUuid,
                user_id: session.user.id,
                youtube_url: parsed.normalizedUrl,
                youtube_video_id: parsed.videoId,
                platform: parsed.platform,
                status: 'queued',
            });

            if (dbError) throw new Error(`DB_INIT_FAILED: ${dbError.message}`);

            let clientTranscript: string | null = null;
            try {
                clientTranscript = await fetchClientCaptions(parsed.videoId, parsed.platform);
            } catch {
                // Silent — edge handles extraction
            }

            try {
                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
                const response = await fetch(`${supabaseUrl}/functions/v1/process-video`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        video_id: videoUuid,
                        video_url: parsed.normalizedUrl,
                        platform: parsed.platform,
                        transcript_text: clientTranscript,
                        language,
                        difficulty,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`EDGE_HTTP_ERROR: ${response.status}`);
                }

                const data = await response.json() as EdgeResponse;

                if (!data.success) {
                    throw new Error(data.error ?? 'EDGE_PROCESSING_FAILED');
                }

                return { success: true, videoId: videoUuid };

            } catch (invokeError: unknown) {
                const msg = invokeError instanceof Error ? invokeError.message : String(invokeError);

                await supabase.from('videos').update({
                    status: 'failed',
                    error_message: msg,
                    processing_completed_at: new Date().toISOString(),
                }).eq('id', videoUuid);

                throw invokeError;
            }
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['history'] });
            queryClient.invalidateQueries({ queryKey: ['videos'] });
        },

        onError: (error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            setError(msg);
        },
    });
};
