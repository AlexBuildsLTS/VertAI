/**
 * supabase/functions/process-video/index.ts
 *
 * Pipeline:
 *   FastPath — client sent transcript_text (from browser timedtext proxy)
 *   1A — YouTube timedtext API (server-side, works from any IP)
 *   1B — Invidious caption proxy (server-side)
 *   2  — Deepgram STT sourced from:
 *          a. Innertube ANDROID/IOS/TV (most reliable, no cipher)
 *          b. Piped
 *          c. Invidious audio streams
 *   3  — Claude AI insights (non-fatal if key missing)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ── Logger ────────────────────────────────────────────────────────────────────

const log = {
  // deno-lint-ignore no-console
  info: (...a: unknown[]) => console.log('[process-video]', ...a),
  // deno-lint-ignore no-console
  warn: (...a: unknown[]) => console.warn('[process-video]', ...a),
  // deno-lint-ignore no-console
  error: (...a: unknown[]) => console.error('[process-video]', ...a),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? (m[1] ?? null) : null;
}

function stripVtt(vtt: string): string {
  return vtt
    .replace(/WEBVTT.*?\n\n/s, '')
    .replace(/\d{2}:\d{2}[:.]\d{2,3} --> \d{2}:\d{2}[:.]\d{2,3}.*?\n/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJson3(data: any): string | null {
  if (!data?.events?.length) return null;
  const text = data.events
    .filter((e: any) => e.segs)
    .flatMap((e: any) => e.segs.map((s: any) => (s.utf8 ?? '').replace(/\n/g, ' ')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 50 ? text : null;
}

// ── 1A: YouTube timedtext (server-side, no CORS) ──────────────────────────────

async function getTimedtextCaptions(id: string): Promise<string | null> {
  for (const lang of ['en', 'en-US', 'en-GB', 'a.en']) {
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?v=${id}&lang=${lang}&fmt=json3&xorb=2&xobt=3&xovt=3`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) continue;
      const text = parseJson3(await res.json());
      if (text) {
        log.info(`[1A] timedtext(${lang}): ${text.length}c`);
        return text;
      }
    } catch (_) { /* next lang */ }
  }
  return null;
}

// ── 1B: Invidious caption proxy ───────────────────────────────────────────────

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://iv.ggtyler.dev',
  'https://inv.tux.pizza',
  'https://yt.drgnz.club',
  'https://invidious.kavin.rocks',
  'https://iv.melmac.space',
  'https://invidious.perennialte.ch',
];

async function getInvidiousCaptions(id: string): Promise<string | null> {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${inst}/api/v1/captions/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.captions?.length) continue;

      const track =
        data.captions.find((c: any) => c.language_code === 'en' && !c.label?.includes('auto')) ||
        data.captions.find((c: any) => c.language_code === 'en') ||
        data.captions.find((c: any) => c.language_code?.startsWith('en')) ||
        data.captions[0];
      if (!track?.url) continue;

      const vttUrl = track.url.startsWith('http') ? track.url : `${inst}${track.url}`;
      const vttRes = await fetch(vttUrl, { signal: AbortSignal.timeout(7000) });
      if (!vttRes.ok) continue;

      const text = stripVtt(await vttRes.text());
      if (text.length > 50) {
        log.info(`[1B] Invidious(${inst}): ${text.length}c`);
        return text;
      }
    } catch (_) { /* next instance */ }
  }
  return null;
}

// ── 1C: RapidAPI YouTube Transcriptor ────────────────────────────────────────
// Uses a paid proxy service that handles auth/bot-detection for us.

async function getCaptionsViaRapidApi(ytId: string): Promise<string | null> {
  const key = Deno.env.get('RAPIDAPI_KEY');
  if (!key) return null;

  const apis = [
    {
      name: 'youtube-transcriptor',
      url: `https://youtube-transcriptor.p.rapidapi.com/transcript?video_id=${ytId}&lang=en`,
      host: 'youtube-transcriptor.p.rapidapi.com',
      parse: (data: any): string | null => {
        // API returns [{transcriptionAsText: "...", transcription: [...]}]
        const item = Array.isArray(data) ? data[0] : data;
        if (!item) return null;
        if (typeof item.transcriptionAsText === 'string' && item.transcriptionAsText.length > 50) {
          return item.transcriptionAsText;
        }
        if (Array.isArray(item.transcription) && item.transcription.length > 0) {
          const text = item.transcription.map((s: any) => s.text ?? s.utf8 ?? '').join(' ').replace(/\s+/g, ' ').trim();
          return text.length > 50 ? text : null;
        }
        return null;
      },
    },
    {
      name: 'yt-api',
      url: `https://yt-api.p.rapidapi.com/transcript?id=${ytId}`,
      host: 'yt-api.p.rapidapi.com',
      parse: (data: any): string | null => {
        const items: any[] = data?.content ?? data?.data ?? [];
        if (!items.length) return null;
        const text = items.map((s: any) => s.text ?? s.snippet ?? '').join(' ').replace(/\s+/g, ' ').trim();
        return text.length > 50 ? text : null;
      },
    },
  ];

  for (const api of apis) {
    try {
      log.info(`[1C] RapidAPI ${api.name}`);
      const res = await fetch(api.url, {
        headers: {
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': api.host,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { log.warn(`[1C] RapidAPI ${api.name} HTTP ${res.status}`); continue; }
      const data = await res.json();
      const text = api.parse(data);
      if (text) {
        log.info(`[1C] RapidAPI ${api.name} success: ${text.length}c`);
        return text;
      }
    } catch (e) {
      log.warn(`[1C] RapidAPI ${api.name} error:`, e);
    }
  }
  return null;
}

// ── 1D: Captions via Innertube player API (server-side, signed URLs) ──────────
// The same player API used for audio extraction also returns caption track URLs.
// Fetching those URLs server-side bypasses all CORS/proxy/browser-cache issues.

async function getCaptionsViaInnertube(ytId: string): Promise<string | null> {
  const clients = [
    {
      name: 'WEB',
      header: '1',
      version: '2.20240101.01.00',
      body: {
        videoId: ytId,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.01.00', hl: 'en', gl: 'US' } },
      },
    },
    {
      name: 'TVHTML5',
      header: '7',
      version: '7.20240101.08.01',
      body: {
        videoId: ytId,
        context: { client: { clientName: 'TVHTML5', clientVersion: '7.20240101.08.01', hl: 'en', gl: 'US' } },
      },
    },
    {
      name: 'WEB_EMBEDDED_PLAYER',
      header: '56',
      version: '2.20240101.01.00',
      body: {
        videoId: ytId,
        context: { client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '2.20240101.01.00', hl: 'en', gl: 'US' } },
      },
    },
  ];

  for (const client of clients) {
    try {
      log.info(`[1C] Trying ${client.name}`);
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Origin: 'https://www.youtube.com',
            Referer: 'https://www.youtube.com/',
            'X-Youtube-Client-Name': client.header,
            'X-Youtube-Client-Version': client.version,
          },
          body: JSON.stringify(client.body),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!res.ok) { log.warn(`[1C] ${client.name} HTTP ${res.status}`); continue; }

      const data = await res.json();
      const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (!tracks.length) { log.info(`[1C] ${client.name}: no caption tracks`); continue; }

      // Prefer manual English, then auto-generated English, then first track
      const track =
        tracks.find((t: any) => t.languageCode === 'en' && !t.kind) ||
        tracks.find((t: any) => t.languageCode === 'en') ||
        tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
        tracks[0];

      if (!track?.baseUrl) continue;

      // Fetch the signed caption URL directly — no proxy needed server-side
      const capUrl = `${track.baseUrl}&fmt=json3`;
      const capRes = await fetch(capUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!capRes.ok) continue;

      const capData = await capRes.json();
      const text = parseJson3(capData);
      if (text) {
        log.info(`[1C] ${client.name} success: ${text.length}c (track: ${track.languageCode}${track.kind ? '/' + track.kind : ''})`);
        return text;
      }
    } catch (e) {
      log.warn(`[1C] ${client.name} error:`, e);
    }
  }
  return null;
}

// ── 2-Innertube: YouTube internal player API ──────────────────────────────────
// ANDROID/IOS/TV/WEB_EMBEDDED clients return direct stream URLs — no cipher needed.
// Client versions updated 2025-Q1; bump these when YouTube starts rejecting them.

async function getAudioViaInnertube(ytId: string): Promise<string | null> {
  const clients = [
    {
      name: 'ANDROID',
      header: '3',
      body: {
        videoId: ytId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        },
      },
    },
    {
      name: 'IOS',
      header: '5',
      body: {
        videoId: ytId,
        context: {
          client: {
            clientName: 'IOS',
            clientVersion: '19.09.3',
            deviceModel: 'iPhone16,2',
            hl: 'en',
            gl: 'US',
          },
        },
      },
    },
    {
      name: 'TVHTML5',
      header: '7',
      body: {
        videoId: ytId,
        context: {
          client: {
            clientName: 'TVHTML5',
            clientVersion: '7.20240101.08.01',
            hl: 'en',
            gl: 'US',
          },
        },
      },
    },
    {
      // Web Embedded Player — often bypasses age-gate / auth-wall restrictions
      name: 'WEB_EMBEDDED_PLAYER',
      header: '56',
      body: {
        videoId: ytId,
        context: {
          client: {
            clientName: 'WEB_EMBEDDED_PLAYER',
            clientVersion: '2.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      },
    },
  ];

  for (const client of clients) {
    try {
      log.info(`[2-Innertube] Trying ${client.name}`);
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            Origin: 'https://www.youtube.com',
            'X-Youtube-Client-Name': client.header,
            'X-Youtube-Client-Version': client.body.context.client.clientVersion,
          },
          body: JSON.stringify(client.body),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!res.ok) {
        log.warn(`[2-Innertube] ${client.name} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const formats: any[] = [
        ...(data?.streamingData?.adaptiveFormats ?? []),
        ...(data?.streamingData?.formats ?? []),
      ];

      const best =
        formats.find((f: any) => f.mimeType?.includes('audio/mp4') && f.url) ||
        formats.find((f: any) => f.mimeType?.includes('audio/webm') && f.url) ||
        formats.find((f: any) => f.mimeType?.includes('audio') && f.url) ||
        formats.find((f: any) => f.url);

      if (best?.url) {
        log.info(`[2-Innertube] ${client.name} success: ${best.mimeType}`);
        return best.url as string;
      }
    } catch (e) {
      log.warn(`[2-Innertube] ${client.name} error:`, e);
    }
  }
  return null;
}

// ── 2-Piped: fallback audio ───────────────────────────────────────────────────

async function getAudioViaPiped(ytId: string): Promise<string | null> {
  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.adminforge.de',
    'https://api.piped.yt',
    'https://piped-api.codeberg.page',
    'https://watchapi.whatever.social',
  ];
  for (const base of instances) {
    try {
      const res = await fetch(`${base}/streams/${ytId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const s = data.audioStreams?.find(
        (s: any) => s.mimeType?.includes('audio/mp4') || s.mimeType?.includes('audio/webm'),
      );
      if (s?.url) {
        log.info(`[2-Piped] ${base} success`);
        return s.url as string;
      }
    } catch (_) { /* next */ }
  }
  return null;
}

// ── 2-Invidious: audio fallback ───────────────────────────────────────────────

async function getAudioViaInvidious(ytId: string): Promise<string | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${ytId}?fields=adaptiveFormats`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const formats: any[] = data.adaptiveFormats ?? [];
      const s =
        formats.find((f: any) => f.type?.includes('audio/mp4') && f.url) ||
        formats.find((f: any) => f.type?.includes('audio/webm') && f.url);
      if (s?.url) {
        log.info(`[2-Invidious] ${base} success`);
        return s.url as string;
      }
    } catch (_) { /* next */ }
  }
  return null;
}

/** Resolves a direct audio stream URL from best available source. */
async function resolveAudioUrl(
  videoUrl: string,
  ytId: string | null,
  clientAudioUrl?: string,
): Promise<string> {
  if (clientAudioUrl) {
    log.info('[Audio] Using client-provided URL');
    return clientAudioUrl;
  }
  if (!ytId) throw new Error('Not a YouTube URL and no client_audio_url provided.');

  const innertube = await getAudioViaInnertube(ytId);
  if (innertube) return innertube;

  const piped = await getAudioViaPiped(ytId);
  if (piped) return piped;

  const inv = await getAudioViaInvidious(ytId);
  if (inv) return inv;

  throw new Error('All audio methods failed: Innertube (ANDROID/IOS/TV), Piped, Invidious exhausted.');
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createAdminClient();

  /** Upserts video status; non-fatal on error. */
  const updateStatus = async (id: string, status: string, errMsg?: string): Promise<void> => {
    try {
      await supabase
        .from('videos')
        .update({ status, error_message: errMsg ?? null, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (_) { /* non-fatal */ }
  };

  let videoId: string | null = null;

  try {
    const body = await req.json();
    videoId = body.video_id as string | null;
    const videoUrl: string = body.video_url ?? body.youtube_url ?? '';
    const clientTranscript: string | undefined = body.transcript_text;
    const clientTranscriptMethod: string = body.transcript_method ?? 'client';
    const clientAudioUrl: string | undefined = body.client_audio_url;

    if (!videoId || !videoUrl) {
      return new Response(
        JSON.stringify({ error: 'video_id and video_url are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const ytId = extractYouTubeId(videoUrl);
    log.info(`Start — videoId=${videoId} ytId=${ytId}`);
    await updateStatus(videoId, 'downloading');

    let transcriptText: string | null = null;
    let transcriptJson: unknown = null;
    let method = 'unknown';

    // ── FastPath: client sent transcript ─────────────────────────────────────
    if (clientTranscript && clientTranscript.length > 50) {
      transcriptText = clientTranscript;
      transcriptJson = { source: clientTranscriptMethod, text: clientTranscript };
      method = clientTranscriptMethod;
      log.info(`FastPath: ${clientTranscript.length}c`);
    }

    // ── 1A: timedtext ────────────────────────────────────────────────────────
    if (!transcriptText && ytId) {
      transcriptText = await getTimedtextCaptions(ytId);
      if (transcriptText) {
        method = 'youtube_timedtext';
        transcriptJson = { source: method, text: transcriptText };
      }
    }

    // ── 1B: Invidious captions ───────────────────────────────────────────────
    if (!transcriptText && ytId) {
      transcriptText = await getInvidiousCaptions(ytId);
      if (transcriptText) {
        method = 'invidious_captions';
        transcriptJson = { source: method, text: transcriptText };
      }
    }

    // ── 1C: RapidAPI YouTube Transcriptor (paid proxy, bypasses bot detection) ─
    if (!transcriptText && ytId) {
      transcriptText = await getCaptionsViaRapidApi(ytId);
      if (transcriptText) {
        method = 'rapidapi_transcript';
        transcriptJson = { source: method, text: transcriptText };
      }
    }

    // ── 1D: Innertube player API captions (signed URLs, no proxy needed) ──────
    if (!transcriptText && ytId) {
      transcriptText = await getCaptionsViaInnertube(ytId);
      if (transcriptText) {
        method = 'innertube_captions';
        transcriptJson = { source: method, text: transcriptText };
      }
    }

    // ── 2: Deepgram STT ──────────────────────────────────────────────────────
    if (!transcriptText) {
      log.info('Phase2 — no captions, starting Deepgram STT');
      await updateStatus(videoId, 'transcribing');

      const dgKey = Deno.env.get('DEEPGRAM_API_KEY');
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY not configured.');

      const audioUrl = await resolveAudioUrl(videoUrl, ytId, clientAudioUrl);
      log.info('Phase2 — audio resolved, sending to Deepgram');

      const dgRes = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=true',
        {
          method: 'POST',
          headers: { Authorization: `Token ${dgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: audioUrl }),
          signal: AbortSignal.timeout(180_000),
        },
      );
      if (!dgRes.ok) {
        const body = await dgRes.text();
        throw new Error(`Deepgram error (${dgRes.status}): ${body.substring(0, 300)}`);
      }
      const dgData = await dgRes.json();
      transcriptText = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
      if (!transcriptText) throw new Error('Deepgram returned empty transcript.');
      transcriptJson = dgData;
      method = 'deepgram';
      log.info(`Phase2 — Deepgram success: ${transcriptText.length}c`);
    }

    // ── Save transcript ───────────────────────────────────────────────────────
    await updateStatus(videoId, 'transcribing');
    const { error: tErr } = await supabase.from('transcripts').insert([
      {
        video_id: videoId,
        transcript_text: transcriptText,
        transcript_json: transcriptJson,
        confidence_score:
          method.includes('caption') || method.includes('timedtext') ? 1.0 : 0.95,
        language_code: 'en',
      },
    ]);
    if (tErr) throw new Error(`Transcript save failed: ${tErr.message}`);

    // ── 3: AI insights (Gemini 2.5 Pro → Claude fallback) ────────────────────
    await updateStatus(videoId, 'ai_processing');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const claudeKey = Deno.env.get('ANTHROPIC_API_KEY');

    let aiSummary = `Transcript obtained`;
    let aiChapters: unknown[] = [];
    let aiKeyTakeaways: string[] = [];
    let aiSeo: unknown = { tags: [], suggested_titles: [], description: '' };
    let aiModel: string | null = null;

    const AI_PROMPT = [
      'Return ONLY valid JSON, no markdown fences.',
      '{"summary":"2-paragraph summary","chapters":[{"timestamp":"00:00","title":"Intro"}],',
      '"key_takeaways":["Point 1","Point 2"],"seo_metadata":{"tags":["tag1"],"suggested_titles":["Title"],"description":"SEO desc"}}',
      '',
      'Transcript:',
      transcriptText!.substring(0, 28_000),
    ].join('\n');

    const parseAiJson = (raw: string) => {
      raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const ai = JSON.parse(raw);
      if (ai.summary) aiSummary = ai.summary;
      if (Array.isArray(ai.chapters)) aiChapters = ai.chapters;
      if (Array.isArray(ai.key_takeaways)) aiKeyTakeaways = ai.key_takeaways;
      if (ai.seo_metadata) aiSeo = ai.seo_metadata;
    };

    // Try Gemini 2.5 Pro first (free tier, generous quota)
    if (geminiKey && !aiModel) {
      try {
        const gr = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: AI_PROMPT }] }],
              generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
            }),
            signal: AbortSignal.timeout(35_000),
          },
        );
        if (gr.ok) {
          const gd = await gr.json();
          const raw = gd.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (raw) { parseAiJson(raw); aiModel = 'gemini-2.5-pro'; log.info('Phase3 — Gemini success'); }
          else log.warn('Phase3 — Gemini empty response');
        } else {
          log.warn(`Phase3 — Gemini HTTP ${gr.status}: ${await gr.text().catch(() => '')}`);
        }
      } catch (e) { log.warn('Phase3 — Gemini failed (non-fatal):', e); }
    }

    // Fallback: Claude
    if (claudeKey && !aiModel) {
      try {
        const cr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            messages: [{ role: 'user', content: AI_PROMPT }],
          }),
          signal: AbortSignal.timeout(35_000),
        });
        if (cr.ok) {
          const cd = await cr.json();
          const raw = cd.content?.find((b: any) => b.type === 'text')?.text ?? '';
          if (raw) { parseAiJson(raw); aiModel = 'claude-3-5-sonnet-20241022'; log.info('Phase3 — Claude fallback success'); }
        } else log.warn(`Phase3 — Claude HTTP ${cr.status}`);
      } catch (e) { log.warn('Phase3 — Claude failed (non-fatal):', e); }
    }

    await supabase.from('ai_insights').upsert(
      {
        video_id: videoId,
        summary: aiSummary,
        chapters: aiChapters,
        key_takeaways: aiKeyTakeaways,
        seo_metadata: aiSeo,
        ai_model: aiModel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'video_id' },
    );

    await updateStatus(videoId, 'completed');
    log.info(`Done — videoId=${videoId} method=${method}`);

    return new Response(
      JSON.stringify({ success: true, video_id: videoId, method }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('FATAL:', message);
    if (videoId) await updateStatus(videoId, 'failed', message.substring(0, 250));
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
