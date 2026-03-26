/**
 * process-video/index.ts
 * Main orchestrator - Pass-through Architecture
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { extractYouTubeId } from './utils.ts';
import { getCaptions } from './captions.ts';
import { getAudioUrl } from './audio.ts';
import { transcribeAudio } from './deepgram.ts';
import { generateInsights } from './insights.ts';

const log = {
  info: (...args: unknown[]) => console.log('[process-video]', ...args),
  warn: (...args: unknown[]) => console.warn('[process-video]', ...args),
  error: (...args: unknown[]) => console.error('[process-video]', ...args),
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createAdminClient();
  let videoId: string | null = null;

  const updateStatus = async (status: string, error?: string) => {
    if (!videoId) return;
    try {
      await supabase
        .from('videos')
        .update({
          status,
          error_message: error ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);
      log.info(`Status → ${status}`);
    } catch (e) {
      log.warn('Status update failed:', e);
    }
  };

  try {
    const body = await req.json();
    videoId = body.video_id;
    const videoUrl: string = body.video_url ?? body.youtube_url;
    const language: string = body.language ?? 'english';
    const clientTranscript: string | undefined = body.transcript_text;
    const clientAudioUrl: string | undefined = body.audio_url; // Captured from frontend

    if (!videoId || !videoUrl) {
      return new Response(
        JSON.stringify({ error: 'video_id and video_url required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const ytId = extractYouTubeId(videoUrl);
    log.info('════════════════════════════════════════════════════════════');
    log.info(`Processing Request: ${videoId}`);
    log.info(`Direct Audio provided: ${!!clientAudioUrl}`);
    log.info('════════════════════════════════════════════════════════════');

    // PHASE 1: CAPTIONS
    let transcriptText: string | null = clientTranscript ?? null;
    let transcriptJson: unknown = clientTranscript
      ? { source: 'client', text: clientTranscript }
      : null;
    let method = clientTranscript ? 'client' : 'unknown';

    if (!transcriptText && ytId) {
      log.info('PHASE 1: Checking for captions...');
      const captionResult = await getCaptions(ytId);
      if (captionResult) {
        transcriptText = captionResult.text;
        transcriptJson = captionResult.json;
        method = captionResult.method;
        log.info(`PHASE 1 ✓: Found via ${method}`);
      }
    }

    // PHASE 2: AUDIO FALLBACK (The Fix)
    if (!transcriptText) {
      log.info('PHASE 2: Starting STT Pipeline...');
      await updateStatus('transcribing');

      let finalAudioUrl = clientAudioUrl;

      // If client didn't provide a URL, try one last server-side resolve
      if (!finalAudioUrl && ytId) {
        log.info('Resolving audio URL on server...');
        finalAudioUrl = await getAudioUrl(videoUrl, ytId);
      }

      if (!finalAudioUrl) {
        throw new Error(
          'Could not resolve audio URL. YouTube is blocking extraction.',
        );
      }

      // 100% Fix: Pass the URL to Deepgram so THEY download it, not us
      const deepgramResult = await transcribeAudio(finalAudioUrl, {
        throwOnEmptyTranscript: true,
      });
      transcriptText = deepgramResult.text;
      transcriptJson = deepgramResult.json;
      method = 'deepgram';
      log.info(`PHASE 2 ✓: Deepgram transcription successful`);
    }

    if (!transcriptText || transcriptText.length < 50) {
      throw new Error('Transcription resulted in empty or too-short text.');
    }

    // SAVE TRANSCRIPT
    log.info('Saving results...');
    const { error: tErr } = await supabase.from('transcripts').insert({
      video_id: videoId,
      transcript_text: transcriptText,
      transcript_json: transcriptJson,
      confidence_score: method === 'deepgram' ? 0.95 : 1.0,
      language_code: 'en',
      extraction_method: method,
    });

    if (tErr) throw new Error(`DB Transcript Error: ${tErr.message}`);

    // PHASE 3: AI INSIGHTS
    await updateStatus('ai_processing');
    const insights = await generateInsights(
      transcriptText,
      language,
      'standard',
    );

    const { error: iErr } = await supabase.from('ai_insights').upsert(
      {
        video_id: videoId,
        ai_model: insights.model,
        summary: insights.summary,
        chapters: insights.chapters,
        key_takeaways: insights.key_takeaways,
        seo_metadata: insights.seo_metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'video_id' },
    );

    if (iErr) log.warn('AI insight save warning:', iErr.message);

    await updateStatus('completed');
    return new Response(JSON.stringify({ success: true, method }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('FATAL ERROR:', msg);
    if (videoId) await updateStatus('failed', msg.substring(0, 250));
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
