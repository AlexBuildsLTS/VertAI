/**
 * supabase/functions/process-video/deepgram.ts
 * Universal Deepgram Relay Engine
 */

export interface DeepgramResult {
  text: string;
  json: Record<string, any>;
}

// METHOD A: For direct URL processing (Vimeo, Patreon, Raw Audio, etc.)
export async function transcribeUrl(mediaUrl: string): Promise<DeepgramResult> {
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY_MISSING');

  console.log(`[Deepgram] Routing universal URL directly to Nova-2 API...`);

  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: mediaUrl }),
  });

  return processDeepgramResponse(response);
}

// METHOD B: For Buffer processing (When we strictly need to bypass YouTube IP blocks)
export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<DeepgramResult> {
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY_MISSING');

  console.log(`[Deepgram] Uploading ${audioBuffer.byteLength} bytes to Nova-2 API...`);

  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/octet-stream',
    },
    body: audioBuffer,
  });

  return processDeepgramResponse(response);
}

// Shared Response Handler
async function processDeepgramResponse(response: Response): Promise<DeepgramResult> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TRANSCRIPTION_REJECTED_${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const extractedText = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('TRANSCRIPTION_EMPTY_RESULT: Deepgram returned no spoken text.');
  }

  return {
    text: extractedText,
    json: payload
  };
}