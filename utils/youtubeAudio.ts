/**
 * utils/youtubeAudio.ts
 * Client-side audio URL resolution for ANY video platform.
 * Bypasses datacenter IP blocks by running on user's residential IP.
 *
 * Priority: Direct Link → RapidAPI → Piped → Invidious → Cobalt
 * Supports: YouTube, Vimeo, TikTok, Twitter, and more via Cobalt
 */

import { detectPlatform, type VideoPlatform } from './youtube';

const PROXY = 'https://corsproxy.io/?';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.tokhmi.xyz',
] as const;

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://iv.ggtyler.dev',
  'https://inv.tux.pizza',
] as const;

const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://co.wuk.sh',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AudioStream {
  url?: string;
  mimeType?: string;
  type?: string;
  bitrate?: number;
  quality?: string;
}

interface AudioResult {
  url: string;
  method: string;
  platform: VideoPlatform;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROXY FETCH UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

async function proxyFetch(
  url: string,
  options?: RequestInit,
  timeoutMs = 10000,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proxiedUrl = `${PROXY}${encodeURIComponent(url)}`;
    const res = await fetch(proxiedUrl, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? res : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function directFetch(
  url: string,
  options?: RequestInit,
  timeoutMs = 10000,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? res : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE AUDIO METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Method 1: RapidAPI YouTube audio services (most reliable)
 */
async function tryRapidAPI(ytId: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;
  if (!apiKey) {
    console.log('[Audio] RapidAPI key not configured, skipping');
    return null;
  }

  const providers = [
    { host: 'youtube-mp36.p.rapidapi.com', path: `/dl?id=${ytId}` },
    { host: 'yt-api.p.rapidapi.com', path: `/dl?id=${ytId}` },
  ];

  for (const { host, path } of providers) {
    try {
      console.log(`[Audio] Trying RapidAPI (${host})...`);
      const res = await directFetch(
        `https://${host}${path}`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': host,
          },
        },
        15000,
      );

      if (!res) continue;

      const data = await res.json();
      if (data.status === 'ok' && data.link) {
        console.log(`[Audio] ✓ RapidAPI (${host})`);
        return data.link;
      }
      if (data.url) {
        console.log(`[Audio] ✓ RapidAPI (${host})`);
        return data.url;
      }
    } catch (e) {
      console.log(`[Audio] RapidAPI ${host} error:`, e);
    }
  }
  return null;
}

/**
 * Method 2: Piped instances (public, free)
 */
async function tryPiped(ytId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      console.log(`[Audio] Trying Piped (${base})...`);
      const res = await proxyFetch(`${base}/streams/${ytId}`, {}, 8000);
      if (!res) continue;

      const data = await res.json();
      const streams: AudioStream[] = data.audioStreams ?? [];

      // Prefer mp4 audio, then webm, sorted by bitrate
      const stream = streams
        .filter(
          (s) =>
            s.url &&
            (s.mimeType?.includes('audio/mp4') ||
              s.mimeType?.includes('audio/webm')),
        )
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

      if (stream?.url) {
        console.log(`[Audio] ✓ Piped (${base})`);
        return stream.url;
      }
    } catch {
      // Continue to next instance
    }
  }
  return null;
}

/**
 * Method 3: Invidious instances (public, free)
 */
async function tryInvidious(ytId: string): Promise<string | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[Audio] Trying Invidious (${base})...`);
      const res = await proxyFetch(
        `${base}/api/v1/videos/${ytId}?fields=adaptiveFormats`,
        {},
        8000,
      );
      if (!res) continue;

      const data = await res.json();
      const formats: AudioStream[] = data.adaptiveFormats ?? [];

      const stream = formats
        .filter((f) => f.url && f.type?.includes('audio'))
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

      if (stream?.url) {
        console.log(`[Audio] ✓ Invidious (${base})`);
        return stream.url;
      }
    } catch {
      // Continue to next instance
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL AUDIO (COBALT) - Works for many platforms
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cobalt.tools - Universal video/audio downloader
 * Supports: YouTube, Vimeo, TikTok, Twitter, Instagram, SoundCloud, etc.
 */
async function tryCobalt(videoUrl: string): Promise<string | null> {
  for (const base of COBALT_INSTANCES) {
    try {
      console.log(`[Audio] Trying Cobalt (${base})...`);
      const res = await directFetch(
        `${base}/api/json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            url: videoUrl,
            aFormat: 'mp3',
            isAudioOnly: true,
            filenamePattern: 'basic',
          }),
        },
        20000,
      );

      if (!res) continue;

      const data = await res.json();

      if (data.status === 'stream' && data.url) {
        console.log(`[Audio] ✓ Cobalt (${base})`);
        return data.url;
      }
      if (data.status === 'redirect' && data.url) {
        console.log(`[Audio] ✓ Cobalt redirect (${base})`);
        return data.url;
      }
      if (data.audio) {
        console.log(`[Audio] ✓ Cobalt audio (${base})`);
        return data.audio;
      }
    } catch (e) {
      console.log(`[Audio] Cobalt ${base} error:`, e);
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIMEO AUDIO
// ═══════════════════════════════════════════════════════════════════════════════

async function tryVimeo(vimeoId: string): Promise<string | null> {
  try {
    console.log(`[Audio] Trying Vimeo API...`);
    const res = await proxyFetch(
      `https://vimeo.com/api/v2/video/${vimeoId}.json`,
      {},
      10000,
    );
    if (!res) return null;

    const data = await res.json();
    // Vimeo API doesn't provide direct audio URLs - use Cobalt instead
    if (data[0]?.url) {
      return tryCobalt(`https://vimeo.com/${vimeoId}`);
    }
  } catch {
    // Fall through to Cobalt
  }
  return tryCobalt(`https://vimeo.com/${vimeoId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolves audio URL for any supported video platform.
 * Runs client-side on residential IP to bypass datacenter blocks.
 *
 * @param videoUrl - Full video URL
 * @param videoId - Optional pre-extracted video ID
 * @returns Audio stream URL or null
 */
export async function fetchYouTubeAudioUrl(
  videoUrl: string,
  videoId?: string,
): Promise<string | null> {
  console.log('[Audio] Starting audio resolution for:', videoUrl);
  const startTime = Date.now();

  const platform = detectPlatform(videoUrl);

  // 🟢 ADDED: Handle direct links immediately
  if (platform === 'direct') {
    console.log(
      `[Audio] Direct media link detected. Bypassing extraction (${Date.now() - startTime}ms)`,
    );
    return videoUrl;
  }

  // YouTube-specific methods (most reliable)
  if (platform === 'youtube') {
    const ytId = videoId || extractYouTubeIdFromUrl(videoUrl);
    if (ytId) {
      // Try YouTube-specific methods first
      const rapidApi = await tryRapidAPI(ytId);
      if (rapidApi) {
        console.log(`[Audio] Resolved in ${Date.now() - startTime}ms`);
        return rapidApi;
      }

      const piped = await tryPiped(ytId);
      if (piped) {
        console.log(`[Audio] Resolved in ${Date.now() - startTime}ms`);
        return piped;
      }

      const invidious = await tryInvidious(ytId);
      if (invidious) {
        console.log(`[Audio] Resolved in ${Date.now() - startTime}ms`);
        return invidious;
      }
    }
  }

  // Vimeo-specific
  if (platform === 'vimeo' && videoId) {
    const vimeo = await tryVimeo(videoId);
    if (vimeo) {
      console.log(`[Audio] Resolved in ${Date.now() - startTime}ms`);
      return vimeo;
    }
  }

  // Universal fallback - Cobalt supports many platforms
  const cobalt = await tryCobalt(videoUrl);
  if (cobalt) {
    console.log(`[Audio] Resolved via Cobalt in ${Date.now() - startTime}ms`);
    return cobalt;
  }

  console.log(`[Audio] All methods failed after ${Date.now() - startTime}ms`);
  return null;
}

/**
 * Helper to extract YouTube ID from URL
 */
function extractYouTubeIdFromUrl(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/|m\/watch\?v=))([\w-]{11})/i,
  );
  return match?.[1] ?? null;
}

/**
 * Resolves audio with full metadata
 */
export async function fetchAudioWithMetadata(
  videoUrl: string,
  videoId?: string,
): Promise<AudioResult | null> {
  const platform = detectPlatform(videoUrl);
  const url = await fetchYouTubeAudioUrl(videoUrl, videoId);

  if (url) {
    return {
      url,
      method: 'client',
      platform,
    };
  }

  return null;
}

export default fetchYouTubeAudioUrl;
