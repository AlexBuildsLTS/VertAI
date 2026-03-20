/**
 * services/exportBuilder.ts
 *
 * Provides utilities to transform Deepgram transcript data and AI insights
 * into common export formats: plain text, SRT, WebVTT, and JSON.
 *
 * All types are sourced from the canonical `types/api` definitions to
 * avoid duplication and ensure consistency across the codebase.
 */

import {
  TranscriptJsonPayload,
  AiInsightsPayload,
  DeepgramWord,
} from '../types/api';
import { formatTranscriptTime } from '../utils/formatters/time';

// Re-export shared types so consumers can import from one place.
export type { TranscriptJsonPayload, AiInsightsPayload, DeepgramWord };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the best (highest-confidence) alternative from the first channel.
 * Throws a descriptive error when the payload structure is invalid.
 */
function resolvePrimaryAlternative(payload: TranscriptJsonPayload) {
  const channels = payload?.results?.channels;

  if (!channels?.length) {
    throw new Error('exportBuilder: transcript payload contains no channels.');
  }

  const alternatives = channels[0].alternatives;

  if (!alternatives?.length) {
    throw new Error('exportBuilder: first channel contains no alternatives.');
  }

  // Deepgram returns alternatives ordered by confidence descending; index 0 is best.
  return alternatives[0];
}

/**
 * Formats a timestamp in SRT notation: HH:MM:SS,mmm
 */
function toSrtTimestamp(seconds: number): string {
  let ms = Math.round((seconds % 1) * 1000);
  ms = Math.max(0, Math.min(ms, 999)); // Clamp to 0-999
  const msStr = ms.toString().padStart(3, '0');
  return `${formatTranscriptTime(seconds)},${msStr}`;
}

/**
 * Formats a timestamp in WebVTT notation: HH:MM:SS.mmm
 */
function toVttTimestamp(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000)
    .toString()
    .padStart(3, '0')
    .slice(0, 3);
  return `${formatTranscriptTime(seconds)}.${ms}`;
}

// ---------------------------------------------------------------------------
// Public export builders
// ---------------------------------------------------------------------------

/**
 * Returns the full transcript as a single plain-text string.
 *
 * @example
 * const text = exportAsPlainText(transcriptPayload);
 * // "Hello world. This is a test transcript."
 */
export function exportAsPlainText(payload: TranscriptJsonPayload): string {
  const { transcript } = resolvePrimaryAlternative(payload);

  if (!transcript.trim()) {
    throw new Error('exportBuilder: transcript text is empty.');
  }

  return transcript.trim();
}

/**
 * Groups words into subtitle cues of `wordsPerCue` words and renders them
 * as an SRT (SubRip) string.
 *
 * @param wordsPerCue - Number of words per subtitle block (default: 8)
 */
export function exportAsSrt(
  payload: TranscriptJsonPayload,
  wordsPerCue = 8,
): string {
  const { words } = resolvePrimaryAlternative(payload);

  if (!words?.length) {
    throw new Error(
      'exportBuilder: no word-level data available for SRT export.',
    );
  }

  const cues = chunkWords(words, wordsPerCue);

  return cues
    .map((cue, index) => {
      const start = toSrtTimestamp(cue[0].start);
      const end = toSrtTimestamp(cue[cue.length - 1].end);
      const text = cue.map((w) => w.punctuated_word ?? w.word).join(' ');
      return `${index + 1}\n${start} --> ${end}\n${text}`;
    })
    .join('\n\n');
}

/**
 * Groups words into subtitle cues of `wordsPerCue` words and renders them
 * as a WebVTT string.
 *
 * @param wordsPerCue - Number of words per subtitle block (default: 8)
 */
export function exportAsVtt(
  payload: TranscriptJsonPayload,
  wordsPerCue = 8,
): string {
  const { words } = resolvePrimaryAlternative(payload);

  if (!words?.length) {
    throw new Error(
      'exportBuilder: no word-level data available for VTT export.',
    );
  }

  const cues = chunkWords(words, wordsPerCue);

  const body = cues
    .map((cue) => {
      const start = toVttTimestamp(cue[0].start);
      const end = toVttTimestamp(cue[cue.length - 1].end);
      // Prefer 'punctuated_word' if available, otherwise fall back to 'word'
      const text = cue.map((w) => w.punctuated_word ?? w.word).join(' ');
      return `${start} --> ${end}\n${text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${body}`;
}
/**
 * Serialises the raw transcript payload and AI insights into a structured
 * JSON string suitable for download or further processing.
 */
export function exportAsJson(
  transcript: TranscriptJsonPayload,
  insights?: AiInsightsPayload,
): string {
  const primary = resolvePrimaryAlternative(transcript);

  const output = {
    transcript: primary.transcript,
    confidence: primary.confidence,
    words: primary.words,
    ...(insights && { insights }),
  };

  return JSON.stringify(output, null, 2);
}

// ---------------------------------------------------------------------------
// Private utilities
// ---------------------------------------------------------------------------

/**
 * Splits a flat word array into chunks of at most `size` words.
 * The last chunk may contain fewer than `size` words if the total is not divisible by `size`.
 */
function chunkWords(words: DeepgramWord[], size: number): DeepgramWord[][] {
  const chunks: DeepgramWord[][] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size));
  }
  return chunks;
}
