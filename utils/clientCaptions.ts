/**
 * utils/clientCaptions.ts
 * Client-Side YouTube Caption Extractor
 */

interface TimedTextSegment {
  utf8?: string;
}

interface TimedTextEvent {
  segs?: TimedTextSegment[];
  tStartMs?: number;
  dDurationMs?: number;
}

interface TimedTextResponse {
  events?: TimedTextEvent[];
}

export async function fetchClientCaptions(
  videoId: string,
  platform: string = 'youtube',
): Promise<string | null> {
  if (!videoId || platform !== 'youtube') return null;

  console.log(`[Captions:Client] Extracting for ${videoId}...`);

  const languageCodes = ['en', 'a.en', 'en-US', 'en-GB'];

  const proxies = [
    'https://corsproxy.io/?url=',         // Highest reliability for small payloads (like JSON transcripts)
    'https://api.allorigins.win/raw?url=', // Solid fallback, though can be slower
    'https://cors.sh',              // High-speed modern alternative often used as a replacement for cors-anywhere
    'https://api.codetabs.com/v1/proxy?quest=', // Good backup with a 5MB per-request limit
    'https://workers.dev?'      // Cloudflare-based proxy that handles moderate traffic well
  ];

  const parseTranscript = async (
    proxy: string,
    lang: string,
    signal: AbortSignal,
  ): Promise<string> => {
    const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;

    // All proxies require the full target URL to be encoded so that
    // query parameters (&lang=, &fmt=) are not misread as the proxy's own params.
    const response = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const data = await response.json() as TimedTextResponse;

    if (!data?.events || !Array.isArray(data.events)) {
      throw new Error('NO_EVENTS');
    }

    const text = data.events
      .filter((e): e is TimedTextEvent & { segs: TimedTextSegment[] } =>
        Array.isArray(e.segs)
      )
      .map(e => e.segs.map(s => s.utf8 ?? '').join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\\n/g, ' ')
      .trim();

    if (text.length < 50) throw new Error('TOO_SHORT');

    return text;
  };

  for (const proxy of proxies) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const transcript = await Promise.any(
        languageCodes.map(lang => parseTranscript(proxy, lang, controller.signal)),
      );
      clearTimeout(timeoutId);
      const host = proxy.split('/')[2];
      console.log(`[Captions:Client] Success via ${host}. Words: ${transcript.split(/\s+/).length}`);
      return transcript;
    } catch {
      clearTimeout(timeoutId);
      const host = proxy.split('/')[2];
      console.warn(`[Captions:Client] ${host} failed or timed out.`);
    }
  }

  console.warn('[Captions:Client] All proxies exhausted. Deferring to edge.');
  return null;
}
