// deno-lint-ignore-file no-import-prefix require-await no-unused-vars
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const STT_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')!; // Recommending Deepgram for speed
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { video_id, youtube_url } = await req.json();

    // 1. Update status to downloading
    await supabase
      .from('videos')
      .update({ status: 'downloading' })
      .eq('id', video_id);

    // 2. Extract Audio (Simulated here - in production, use a dedicated microservice like browserless.io or a custom EC2 worker for yt-dlp to avoid Edge Function memory limits)
    const audioUrl = await extractAudioMicroservice(youtube_url);

    // 3. Update status to transcribing
    await supabase
      .from('videos')
      .update({ status: 'transcribing' })
      .eq('id', video_id);

    // 4. Call High-Speed STT API (Deepgram Nova-2)
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${STT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      },
    );

    if (!response.ok) throw new Error('Transcription API failed');
    const result = await response.json();

    // 5. Save Transcript
    await supabase.from('transcripts').insert({
      video_id,
      language_code: 'en',
      transcript_text: result.results.channels[0].alternatives[0].transcript,
      transcript_json: result.results,
      confidence_score: result.results.channels[0].alternatives[0].confidence,
    });

    // 6. Update Final Status
    await supabase
      .from('videos')
      .update({ status: 'ai_processing' })
      .eq('id', video_id);

    // (Trigger webhook or next Edge Function for AI Insights here)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractAudioMicroservice(url: string): Promise<string> {
  // Integration point for yt-dlp worker
  return 'https://your-storage.com/temp-audio.mp3';
}
