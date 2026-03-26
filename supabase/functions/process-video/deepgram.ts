/**
 * process-video/deepgram.ts
 * Deepgram Nova-2 STT wrapper - ROBUST URL PASS-THROUGH VERSION
 */

const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=true&detect_language=true';

interface DeepgramResult {
  text: string;
  json: unknown;
  method: string;
}

/**
 * Transcribes audio by passing the URL directly to Deepgram.
 * This bypasses YouTube's blocking of Data Center IPs because Deepgram
 * fetches the stream from their own trusted infrastructure.
 */
export async function transcribeAudio(
  audioUrl: string,
  options?: { throwOnEmptyTranscript?: boolean },
): Promise<DeepgramResult> {
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) {
    throw new Error(
      'DEEPGRAM_API_KEY is not configured. Cannot perform transcription.',
    );
  }

  console.log('[Deepgram] 🚀 Initiating Direct-to-Deepgram stream...');
  console.log(
    `[Deepgram] Targeting Audio URL: ${audioUrl.substring(0, 100)}...`,
  );

  const res = await fetch(DEEPGRAM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // We send the URL as JSON so Deepgram does the downloading, NOT our server
    body: JSON.stringify({ url: audioUrl }),
    signal: AbortSignal.timeout(300_000), // 5-minute timeout for long videos
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(
      `[Deepgram] API Error ${res.status}: ${body.substring(0, 500)}`,
    );

    // Check for common Deepgram errors related to the URL
    if (res.status === 400) {
      throw new Error(
        `Deepgram could not access the video link. It may have expired or been blocked.`,
      );
    }

    throw new Error(`Deepgram API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Robust extraction of the transcript text
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  const confidence =
    data.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0;
  const detectedLang = data.results?.channels?.[0]?.detected_language ?? 'en';

  console.log(
    `[Deepgram] ✓ Transcription complete: ${text.length} chars, confidence: ${(confidence * 100).toFixed(1)}%, language: ${detectedLang}`,
  );

  if (!text && options?.throwOnEmptyTranscript) {
    console.warn('[Deepgram] Received empty transcript from valid response');
    throw new Error(
      'Deepgram returned an empty transcript. The audio might be silent or unreadable.',
    );
  }

  return {
    text: text.trim(),
    json: data,
    method: 'deepgram',
  };
}
