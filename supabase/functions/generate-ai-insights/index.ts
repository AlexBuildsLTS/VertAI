/**
 * supabase/functions/generate-ai-insights/index.ts
 * Standalone AI insight regeneration using Google Gemini 2.5 Pro.
 * Upserts summary, chapters, key_takeaways, and seo_metadata into ai_insights.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  try {
    const { language, difficulty } = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
    if (!language || !difficulty)
      throw new Error('Missing language or difficulty parameters');

    const { videoId, text } = await req.json();
    if (!videoId || !text)
      throw new Error('Missing videoId or text in request body.');

    const supabase = createAdminClient();

    const prompt = [
      'You are an expert SEO analyst. Analyze the YouTube transcript below.',
      'Return ONLY valid JSON, no markdown fences, no extra keys.',
      '{"summary":"2-paragraph summary","chapters":[{"timestamp":"00:00","title":"Intro"}],',
      '"key_takeaways":["Point 1","Point 2"],"seo_metadata":{"tags":["tag1"],"suggested_titles":["Title"],"description":"SEO desc"}}',
      '',
      'Transcript:',
      (text as string).substring(0, 28_000),
    ].join('\n');

    const geminiRes = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2500 },
      }),
    });

    if (!geminiRes.ok) {
      throw new Error(
        `Gemini error (${geminiRes.status}): ${await geminiRes.text()}`,
      );
    }

    const geminiData = await geminiRes.json();
    let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    raw = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const ai = JSON.parse(raw);

    const { error: dbError } = await supabase.from('ai_insights').upsert(
      {
        video_id: videoId,
        summary: ai.summary ?? 'N/A',
        chapters: Array.isArray(ai.chapters) ? ai.chapters : [],
        key_takeaways: Array.isArray(ai.key_takeaways) ? ai.key_takeaways : [],
        seo_metadata: ai.seo_metadata ?? {},
        ai_model: 'gemini-2.5-flash-lite',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'video_id' },
    );
    if (dbError) throw new Error(`DB upsert failed: ${dbError.message}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // deno-lint-ignore no-console
    console.error('[generate-ai-insights] Error:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
