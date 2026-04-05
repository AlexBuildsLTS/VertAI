/**
 * supabase/functions/process-video/captions.ts
 * Bulletproof Native YouTube Scraper (Edge Node)
 * ----------------------------------------------------------------------------
 * FEATURES:
 * 1. MULTI-PATTERN MATCHING: Catches multiple variations of YouTube's DOM injection.
 * 2. REGIONAL BYPASS: Injects strict consent cookies to bypass EU/GDPR walls.
 * 3. ZERO-THROW FALLBACK: Returns null cleanly to trigger the Deepgram failsafe without crashing.
 */

export interface CaptionExtractResult {
  text: string;
  json: { source: string; language: string; segments: any[] };
  method: string;
}

export async function getCaptions(videoId: string): Promise<CaptionExtractResult | null> {
  console.log(`[Captions:INIT] Extracting native XML tracks for ${videoId}...`);

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        // CRITICAL FOR EU/EDGE DEPLOYMENTS: Bypasses the YouTube GDPR consent screen
        'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+825'
      }
    });

    if (!response.ok) {
      console.warn(`[Captions:WARN] YouTube rejected connection (HTTP ${response.status}).`);
      return null;
    }

    const html = await response.text();

    // Catch if we hit a consent wall or captcha despite the cookie
    if (html.includes('action="https://consent.youtube.com/s"')) {
      console.warn('[Captions:WARN] Hit YouTube consent wall.');
      return null;
    }

    // MULTI-PATTERN MATCHING: YouTube injects the payload differently based on routing
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var|meta|<\/script>)/,
      /window\["ytInitialPlayerResponse"\]\s*=\s*({.+?})\s*;\s*(?:var|meta|<\/script>)/
    ];

    let playerResponseJson = null;
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          playerResponseJson = JSON.parse(match[1]);
          break;
        } catch (e) {
          // If JSON parse fails, try the next pattern
        }
      }
    }

    if (!playerResponseJson) {
      console.warn('[Captions:WARN] Could not extract player data payload from DOM.');
      return null;
    }

    const tracks = playerResponseJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!tracks || tracks.length === 0) {
      console.warn('[Captions:WARN] No native subtitles exist for this video.');
      return null;
    }

    // Force English or fallback to first available
    const track = tracks.find((t: any) =>
      t.languageCode === 'en' || t.languageCode === 'en-US' || t.languageCode === 'en-GB'
    ) || tracks[0];

    const xmlResponse = await fetch(track.baseUrl);
    if (!xmlResponse.ok) {
      console.warn('[Captions:WARN] Failed to download XML blob.');
      return null;
    }

    const xml = await xmlResponse.text();
    const textNodes = xml.match(/<text[^>]*>(.+?)<\/text>/g);

    if (!textNodes) {
      console.warn('[Captions:WARN] Failed to parse XML nodes.');
      return null;
    }

    let fullTranscript = '';
    const segments: any[] = [];

    textNodes.forEach(node => {
      let text = node.replace(/<[^>]+>/g, '');
      // Decode HTML entities
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const startMatch = node.match(/start="([\d.]+)"/);
      if (startMatch) {
        segments.push({ start: parseFloat(startMatch[1]), text });
      }

      fullTranscript += text + ' ';
    });

    const cleanText = fullTranscript.replace(/\s+/g, ' ').trim();

    if (cleanText.length < 50) {
      console.warn('[Captions:WARN] Extracted text too short. Deemed invalid.');
      return null;
    }

    console.log(`[Captions:SUCCESS] Scraped ${cleanText.split(/\s+/).length} words cleanly.`);

    return {
      text: cleanText,
      json: { source: 'youtube_native', language: track.languageCode, segments },
      method: 'native_youtube_scraper'
    };
  } catch (error: any) {
    // We catch and return null so the orchestrator doesn't crash. Seamless fallback to audio.
    console.warn(`[Captions:EXCEPTION] Handled smoothly: ${error.message}`);
    return null;
  }
}