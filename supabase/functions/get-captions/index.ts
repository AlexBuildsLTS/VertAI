/**
 * supabase/functions/get-captions/index.ts
 * Server-side caption proxy — timedtext API then Invidious fallback.
 * Returns { transcript: string | null }.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const logger = {
  // deno-lint-ignore no-console
  log: (...a: unknown[]) => console.log(...a),
  // deno-lint-ignore no-console
  warn: (...a: unknown[]) => console.warn(...a),
};

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://iv.ggtyler.dev',
  'https://inv.tux.pizza',
  'https://yt.drgnz.club',
  'https://invidious.kavin.rocks',
  'https://iv.melmac.space',
  'https://invidious.perennialte.ch',
];

function decodeHtml(t: string): string {
  return t
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseJson3(data: any): string | null {
  if (!data?.events?.length) return null;
  const text = data.events
    .filter((e: any) => e.segs)
    .flatMap((e: any) =>
      e.segs.map((s: any) => (s.utf8 ?? '').replace(/\n/g, ' ')),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 50 ? text : null;
}

function stripVtt(vtt: string): string {
  return vtt
    .replace(/WEBVTT.*?\n\n/s, '')
    .replace(/\d{2}:\d{2}[:.]\d{2,3} --> \d{2}:\d{2}[:.]\d{2,3}.*?\n/g, '')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l: string) => decodeHtml(l.trim()))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function viaTimedtext(id: string): Promise<string | null> {
  for (const lang of ['en', 'en-US', 'en-GB', 'a.en']) {
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?v=${id}&lang=${lang}&fmt=json3&xorb=2&xobt=3&xovt=3`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(7000),
        },
      );
      if (!res.ok) continue;
      const text = parseJson3(await res.json());
      if (text) {
        logger.log(`[get-captions] timedtext(${lang}): ${text.length}c`);
        return text;
      }
    } catch (_) {
      /* next */
    }
  }
  return null;
}

async function viaInvidious(id: string): Promise<string | null> {
  for (const inst of INVIDIOUS) {
    try {
      const listRes = await fetch(`${inst}/api/v1/captions/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!listRes.ok) continue;
      const list = await listRes.json();
      if (!list?.captions?.length) continue;

      const track =
        list.captions.find(
          (c: any) => c.language_code === 'en' && !c.label?.includes('auto'),
        ) ||
        list.captions.find((c: any) => c.language_code === 'en') ||
        list.captions.find((c: any) => c.language_code?.startsWith('en')) ||
        list.captions[0];
      if (!track?.url) continue;

      const vttUrl = track.url.startsWith('http')
        ? track.url
        : `${inst}${track.url}`;
      const vttRes = await fetch(vttUrl, { signal: AbortSignal.timeout(6000) });
      if (!vttRes.ok) continue;

      const text = stripVtt(await vttRes.text());
      if (text.length > 50) {
        logger.log(`[get-captions] Invidious(${inst}): ${text.length}c`);
        return text;
      }
    } catch (_) {
      /* next */
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  try {
    const { video_id } = await req.json();
    if (!video_id) {
      return new Response(JSON.stringify({ error: 'video_id required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    logger.log(`[get-captions] Start: ${video_id}`);
    const transcript =
      (await viaTimedtext(video_id)) ?? (await viaInvidious(video_id)) ?? null;
    logger.log(
      `[get-captions] Result: ${transcript ? transcript.length + 'c' : 'null'}`,
    );

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    logger.warn('[get-captions] Error:', err.message);
    return new Response(
      JSON.stringify({ transcript: null, error: err.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});
