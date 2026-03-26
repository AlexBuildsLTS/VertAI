/**
 * process-video/captions.ts
 * Multi-method YouTube caption extraction WITH WATCH PAGE SCRAPING
 */
import { stripVtt, parseJson3 } from './utils.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://iv.ggtyler.dev',
  'https://inv.tux.pizza',
  'https://yt.drgnz.club',
];

interface CaptionResult {
  text: string;
  json: unknown;
  method: string;
}

// Method 1: Official YouTube timedtext API
async function tryTimedtext(ytId: string): Promise<CaptionResult | null> {
  for (const lang of ['en', 'en-US', 'en-GB', 'a.en']) {
    try {
      console.log(`[Captions] Trying timedtext (${lang})`);
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?v=${ytId}&lang=${lang}&fmt=json3`,
        {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = parseJson3(data);
      if (text && text.length > 50) {
        console.log(`[Captions] ✓ timedtext (${lang})`);
        return { text, json: data, method: `timedtext_${lang}` };
      }
    } catch (e) {
      console.warn(
        `[Captions] timedtext ${lang}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return null;
}

// Method 2: WATCH PAGE SCRAPING - extracts ytInitialPlayerResponse
async function tryWatchPageScrape(ytId: string): Promise<CaptionResult | null> {
  try {
    console.log('[Captions] Trying watch page scrape...');
    const res = await fetch(`https://www.youtube.com/watch?v=${ytId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const playerMatch = html.match(
      /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|const|let|<\/script>)/,
    );
    if (!playerMatch) {
      console.warn('[Captions] No ytInitialPlayerResponse');
      return null;
    }

    const playerData = JSON.parse(playerMatch[1]);
    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      console.warn('[Captions] No caption tracks');
      return null;
    }

    const track =
      captionTracks.find(
        (t: any) => t.languageCode === 'en' && t.kind !== 'asr',
      ) ||
      captionTracks.find((t: any) => t.languageCode?.startsWith('en')) ||
      captionTracks[0];
    if (!track?.baseUrl) return null;

    const capRes = await fetch(`${track.baseUrl}&fmt=json3`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!capRes.ok) return null;

    const capData = await capRes.json();
    const text = parseJson3(capData);
    if (text && text.length > 50) {
      console.log(`[Captions] ✓ watchpage_scrape (${text.length} chars)`);
      return { text, json: capData, method: 'watchpage_scrape' };
    }
  } catch (e) {
    console.warn(
      '[Captions] Watch page scrape:',
      e instanceof Error ? e.message : e,
    );
  }
  return null;
}

// Method 3: Innertube API
async function tryInnertube(ytId: string): Promise<CaptionResult | null> {
  const clients = [
    { name: 'WEB', version: '2.20240321.01.00' },
    { name: 'TVHTML5', version: '7.20240321.08.00' },
    { name: 'ANDROID', version: '19.09.37' },
    { name: 'IOS', version: '19.09.3' },
  ];

  for (const client of clients) {
    try {
      console.log(`[Captions] Trying Innertube (${client.name})`);
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
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
                hl: 'en',
                gl: 'US',
              },
            },
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!res.ok) continue;

      const data = await res.json();
      const track =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.find(
          (t: any) => t.languageCode === 'en' && t.kind !== 'asr',
        ) ||
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0];
      if (!track?.baseUrl) continue;

      const capRes = await fetch(`${track.baseUrl}&fmt=json3`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!capRes.ok) continue;

      const capData = await capRes.json();
      const text = parseJson3(capData);
      if (text && text.length > 50) {
        console.log(`[Captions] ✓ Innertube (${client.name})`);
        return {
          text,
          json: capData,
          method: `innertube_${client.name.toLowerCase()}`,
        };
      }
    } catch (e) {
      console.warn(
        `[Captions] Innertube ${client.name}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return null;
}

// Method 4: RapidAPI transcript service
async function tryRapidAPI(ytId: string): Promise<CaptionResult | null> {
  const key = Deno.env.get('RAPIDAPI_KEY');
  if (!key) {
    console.log('[Captions] RAPIDAPI_KEY not set');
    return null;
  }

  try {
    console.log('[Captions] Trying RapidAPI transcript');
    const res = await fetch(
      `https://youtube-transcriptor.p.rapidapi.com/transcript?video_id=${ytId}&lang=en`,
      {
        headers: {
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': 'youtube-transcriptor.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const text = Array.isArray(data)
      ? data.map((item: any) => item.text).join(' ')
      : null;
    if (text && text.length > 50) {
      console.log(`[Captions] ✓ RapidAPI`);
      return { text, json: data, method: 'rapidapi' };
    }
  } catch (e) {
    console.warn('[Captions] RapidAPI:', e instanceof Error ? e.message : e);
  }
  return null;
}

// Method 5: Invidious instances
async function tryInvidious(ytId: string): Promise<CaptionResult | null> {
  for (const inst of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[Captions] Trying Invidious: ${inst}`);
      const res = await fetch(`${inst}/api/v1/captions/${ytId}`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const list = await res.json();
      if (!list?.captions?.length) continue;

      const track =
        list.captions.find((c: any) => c.language_code === 'en') ||
        list.captions[0];
      if (!track?.url) continue;

      const vttUrl = track.url.startsWith('http')
        ? track.url
        : `${inst}${track.url}`;
      const vttRes = await fetch(vttUrl, { signal: AbortSignal.timeout(6000) });
      if (!vttRes.ok) continue;

      const text = stripVtt(await vttRes.text());
      if (text.length > 50) {
        console.log(`[Captions] ✓ Invidious: ${inst}`);
        return {
          text,
          json: { source: 'invidious', url: vttUrl },
          method: 'invidious',
        };
      }
    } catch (e) {
      console.warn(
        `[Captions] Invidious ${inst}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return null;
}

/**
 * Main export - tries all methods in sequence:
 * timedtext → watchpage_scrape → innertube → rapidapi → invidious
 */
export async function getCaptions(ytId: string): Promise<CaptionResult | null> {
  console.log(`[Captions] ═══ Starting for: ${ytId} ═══`);
  const startTime = Date.now();

  const methods = [
    tryTimedtext,
    tryWatchPageScrape,
    tryInnertube,
    tryRapidAPI,
    tryInvidious,
  ];

  for (const method of methods) {
    const result = await method(ytId);
    if (result) {
      console.log(
        `[Captions] ═══ SUCCESS in ${Date.now() - startTime}ms via ${result.method} ═══`,
      );
      return result;
    }
  }

  console.log(
    `[Captions] ═══ ALL FAILED after ${Date.now() - startTime}ms ═══`,
  );
  return null;
}
