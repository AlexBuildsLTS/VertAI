/**
 * supabase/functions/process-video/audio.ts
 * High-Availability Audio Extraction Engine (Buffer Mode)
 * Features: Client Proxy -> RapidAPI -> Triple-Cobalt Rotation -> Deepgram Pipe
 */

import { extractYouTubeId } from './utils.ts';

// Helper: Fetches the URL to ensure it doesn't 404 or return an HTML captcha wall
async function safeFetchBuffer(url: string, providerName: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`[Audio:Fetch] ${providerName} returned HTTP ${res.status}. Moving to next tier.`);
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.warn(`[Audio:Fetch] ${providerName} blocked by HTML wall/captcha.`);
      return null;
    }
    return await res.arrayBuffer();
  } catch (e: any) {
    console.warn(`[Audio:Fetch] ${providerName} stream download failed: ${e.message}`);
    return null;
  }
}

export async function getAudioBuffer(
  videoUrl: string,
  platform: string,
  clientAudioUrl?: string | null
): Promise<ArrayBuffer | null> {
  console.log(`[Audio:START] Resolving ${platform} source buffer...`);

  if (platform !== 'youtube') return null;

  const ytId = extractYouTubeId(videoUrl);
  if (!ytId) return null;

  // --- STRATEGY 0: CLIENT-PROVIDED FAST-PATH ---
  if (clientAudioUrl) {
    console.log('[Audio:UPSTREAM] Attempting Client-Provided Proxy Stream...');
    const buffer = await safeFetchBuffer(clientAudioUrl, 'ClientProxy');
    if (buffer && buffer.byteLength > 10000) {
      console.log('[Audio:SUCCESS] Buffer secured via Client Proxy.');
      return buffer;
    }
  }

  // --- STRATEGY 1: PREMIUM RAPID-API ---
  const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
  if (rapidApiKey) {
    try {
      console.log('[Audio:UPSTREAM] Attempting Premium RapidAPI node...');
      const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${ytId}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload?.link) {
          // WE VERIFY THE LINK IMMEDIATELY
          const buffer = await safeFetchBuffer(payload.link, 'RapidAPI');
          if (buffer) {
            console.log('[Audio:SUCCESS] Buffer secured via Premium RapidAPI.');
            return buffer;
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Audio:UPSTREAM] Premium Node request failed: ${e.message}`);
    }
  }

  // --- STRATEGY 2: AGGRESSIVE COBALT ROTATION ---
  const cobaltNodes = [
    'https://co.wuk.sh',
    'https://cobalt.q0.o.aurora.tech',
    'https://api.cobalt.tools',
  ];

  for (const node of cobaltNodes) {
    try {
      console.log(`[Audio:SCRAPE] Contacting Cobalt node: ${node}`);
      const res = await fetch(`${node}/api/json`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({ url: videoUrl, aFormat: 'mp3', isAudioOnly: true }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.url) {
          // VERIFY THE LINK
          const buffer = await safeFetchBuffer(data.url, `Cobalt(${new URL(node).hostname})`);
          if (buffer) {
            console.log(`[Audio:SUCCESS] Buffer secured via Cobalt Node.`);
            return buffer;
          }
        }
      }
    } catch (error: any) {
      console.warn(`[Audio:SCRAPE] Node ${node} timed out.`);
      continue;
    }
  }

  console.error('[Audio:FATAL] All available audio resolution layers have been exhausted.');
  return null;
}