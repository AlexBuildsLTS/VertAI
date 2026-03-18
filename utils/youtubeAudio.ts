/**
 * utils/youtubeAudio.ts
 *
 * Client-side audio URL resolution.
 * NOTE: CORS restrictions prevent direct YouTube audio access from browsers.
 * The edge function handles all audio resolution server-side via Innertube.
 * This function returns null immediately so the client doesn't waste time.
 */

export async function fetchYouTubeAudioUrl(
  _videoUrl: string,
  _ytId: string,
): Promise<string | null> {
  return null;
}
