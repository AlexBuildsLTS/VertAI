// deno-lint-ignore-file no-import-prefix require-await no-unused-vars
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Attempts to extract the audio stream URL using multiple fallback proxies.
 * Required because YouTube actively blocks cloud datacenter IPs.
 */
async function getAudioStreamUrl(youtubeUrl: string): Promise<string> {
  const ytIdMatch = youtubeUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  const ytId = ytIdMatch ? ytIdMatch[1] : null;

  // Attempt 1: Cobalt API Proxy
  try {
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: youtubeUrl, isAudioOnly: true }),
    });
    if (cobaltRes.ok) {
      const data = await cobaltRes.json();
      if (data.url) return data.url;
    }
  } catch (e) {
    console.log('Cobalt extraction failed, falling back to Piped...');
  }

  // Attempt 2: Piped API Primary Instance
  if (ytId) {
    try {
      const pipedRes = await fetch(
        `https://pipedapi.kavin.rocks/streams/${ytId}`,
      );
      if (pipedRes.ok) {
        const data = await pipedRes.json();
        const stream = data.audioStreams?.find(
          (s: any) =>
            s.mimeType.includes('audio/mp4') ||
            s.mimeType.includes('audio/webm'),
        );
        if (stream?.url) return stream.url;
      }
    } catch (e) {
      console.log('Piped primary failed, falling back to secondary...');
    }
  }

  // Attempt 3: Piped API Secondary Instance
  if (ytId) {
    try {
      const pipedRes2 = await fetch(
        `https://pipedapi.tokhmi.xyz/streams/${ytId}`,
      );
      if (pipedRes2.ok) {
        const data = await pipedRes2.json();
        const stream = data.audioStreams?.find(
          (s: any) =>
            s.mimeType.includes('audio/mp4') ||
            s.mimeType.includes('audio/webm'),
        );
        if (stream?.url) return stream.url;
      }
    } catch (e) {
      console.log('Piped secondary failed.');
    }
  }

  throw new Error(
    'Extraction blocked by YouTube protections. Cloud IP rejected.',
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let processingVideoId: string | null = null;

  try {
    const { video_id, youtube_url } = await req.json();
    if (!video_id || !youtube_url)
      throw new Error('video_id and youtube_url are required');
    processingVideoId = video_id;

    const updateStatus = async (
      status: string,
      errMsg: string | null = null,
    ) => {
      await supabaseAdmin
        .from('videos')
        .update({ status, error_message: errMsg })
        .eq('id', video_id);
    };

    // ========================================================================
    // PHASE 1: EXTRACTION
    // ========================================================================
    await updateStatus('downloading');

    const audioUrl = await getAudioStreamUrl(youtube_url);

    // ========================================================================
    // PHASE 2: DEEPGRAM TRANSCRIPTION
    // ========================================================================
    await updateStatus('transcribing');

    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramKey)
      throw new Error('DEEPGRAM_API_KEY is missing in Supabase Secrets.');

    const deepgramRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      },
    );

    if (!deepgramRes.ok) {
      const errText = await deepgramRes.text();
      throw new Error(`Deepgram Error: ${errText}`);
    }

    const transcriptData = await deepgramRes.json();
    const rawTranscriptText =
      transcriptData.results?.channels[0]?.alternatives[0]?.transcript || '';

    if (!rawTranscriptText) {
      throw new Error('Deepgram returned an empty transcript.');
    }

    await supabaseAdmin.from('transcripts').insert([
      {
        video_id: video_id,
        transcript_text: rawTranscriptText,
        transcript_json: transcriptData,
        confidence_score:
          transcriptData.results?.channels[0]?.alternatives[0]?.confidence || 0,
        language_code: 'en',
      },
    ]);

    // ========================================================================
    // PHASE 3: GEMINI AI INSIGHTS
    // ========================================================================
    await updateStatus('ai_processing');

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey)
      throw new Error('GEMINI_API_KEY is missing in Supabase Secrets.');

    const prompt = `
      Analyze the following YouTube transcript. Return ONLY a valid JSON object. Do not include markdown formatting or backticks.
      Required JSON format:
      {
        "summary": "A 2-paragraph summary.",
        "chapters": [{ "timestamp": "00:00", "title": "Introduction" }],
        "seo_metadata": { "tags": ["tag1"], "suggested_titles": ["Title 1"], "description": "SEO description." }
      }
      Transcript: ${rawTranscriptText.substring(0, 25000)}
    `;

    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini Error: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    let rawAiText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    rawAiText = rawAiText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const aiInsights = JSON.parse(rawAiText);

    await supabaseAdmin.from('ai_insights').insert([
      {
        video_id: video_id,
        summary: aiInsights.summary || 'Summary unavailable.',
        chapters: aiInsights.chapters || [],
        seo_metadata: aiInsights.seo_metadata || {},
      },
    ]);

    // ========================================================================
    // PHASE 4: FINALIZATION
    // ========================================================================
    await updateStatus('completed');

    return new Response(JSON.stringify({ success: true, video_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Edge Function Error:', error.message);

    if (processingVideoId) {
      await supabaseAdmin
        .from('videos')
        .update({
          status: 'failed',
          error_message: error.message.substring(0, 250),
        })
        .eq('id', processingVideoId);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
