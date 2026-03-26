/**
 * process-video/audio.ts
 * 100% STABLE PRODUCTION VERSION
 * Logic: RapidAPI (Paid) -> Innertube (Internal) -> Piped/Invidious (Proxy)
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://iv.ggtyler.dev',
];

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.tokhmi.xyz',
];

/** * Method 1: RapidAPI
 * Strategy: Check multiple formats. Some providers put the URL in data.link, others in data.url.
 */
async function tryRapidAPI(ytId: string): Promise<string | null> {
  const key = Deno.env.get('RAPIDAPI_KEY');
  if (!key) return null;

  const hosts = [
    { host: 'yt-api.p.rapidapi.com', path: `/dl?id=${ytId}` },
    { host: 'youtube-mp36.p.rapidapi.com', path: `/dl?id=${ytId}` },
  ];

  for (const { host, path } of hosts) {
    try {
      console.log(`[Audio] Trying RapidAPI: ${host}`);
      const res = await fetch(`https://${host}${path}`, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
      });

      if (!res.ok) continue;
      const data = await res.json();
      const audioUrl = data.link || data.url || data.data?.downloadUrl;

      // If a URL is found, validate it by making a HEAD request
      if (audioUrl) {
        // --- THE KILL SWITCH ---
        // Check if the link is actually alive before returning it
        const check = await fetch(audioUrl, { method: 'HEAD' });
        if (check.ok) {
          console.log(`[Audio] ✓ RapidAPI (${host}) link is VALID`);
          return audioUrl;
        } else {
          console.warn(
            `[Audio] RapidAPI (${host}) link was a 404/Fake. Skipping...`,
          );
        }
      }
    } catch (e) {
      console.log(
        `[Audio] ${host} error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return null;
}
/** * Method 2: Innertube (The "God Mode" fallback)
 */
async function tryInnertube(ytId: string): Promise<string | null> {
  const clients = [
    { name: 'ANDROID_TESTSUITE', version: '1.9.3' },
    { name: 'ANDROID', version: '19.09.37' },
    { name: 'IOS', version: '19.09.3' },
  ];

  for (const client of clients) {
    try {
      console.log(`[Audio] Trying Innertube: ${client.name}`);
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify({
            videoId: ytId,
            context: {
              client: {
                clientName: client.name,
                clientVersion: client.version,
              },
            },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!res.ok) continue;
      const data = await res.json();
      const formats = data?.streamingData?.adaptiveFormats || [];
      // Look for highest bitrate audio
      const audio = formats
        .filter((f: any) => f.mimeType?.includes('audio'))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (audio?.url) {
        console.log(`[Audio] ✓ Innertube (${client.name}) success`);
        return audio.url;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** * Method 3: Piped (The "Bulletproof" proxy)
 */
async function tryPiped(ytId: string): Promise<string | null> {
  for (const base of PIPED) {
    try {
      console.log(`[Audio] Trying Piped: ${base}`);
      const res = await fetch(`${base}/streams/${ytId}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const audio = data.audioStreams?.find((s: any) => s.url);
      if (audio?.url) {
        console.log(`[Audio] ✓ Piped success`);
        return audio.url;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** * Main Export
 */
export async function getAudioUrl(
  videoUrl: string,
  ytId: string | null,
): Promise<string> {
  if (!ytId) throw new Error('Invalid YouTube ID');

  console.log(`[Audio] 🚀 Starting master resolution for ${ytId}`);

  // 1. RapidAPI
  const rapid = await tryRapidAPI(ytId);
  if (rapid) return rapid;

  // 2. Innertube
  const inner = await tryInnertube(ytId);
  if (inner) return inner;

  // 3. Piped
  const piped = await tryPiped(ytId);
  if (piped) return piped;

  // 4. Invidious (Last ditch)
  for (const base of INVIDIOUS) {
    try {
      const res = await fetch(`${base}/api/v1/videos/${ytId}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      const url = data.adaptiveFormats?.find((f: any) =>
        f.type?.includes('audio'),
      )?.url;
      if (url) return url;
    } catch {
      continue;
    }
  }

  throw new Error('FATAL: All audio extraction methods blocked by YouTube.');
}
