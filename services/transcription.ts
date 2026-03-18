/**
 * services/transcription.ts
 *
 * @deprecated This module is a compatibility shim.
 * Import directly from `lib/api/functions.ts` instead:
 *
 *   import { EdgeFunctions } from '../lib/api/functions';
 *   EdgeFunctions.processVideo(videoId, youtubeUrl);
 *
 * The `TranscriptionService` name is kept only so existing callers
 * do not break while the migration is in progress.
 */

import { EdgeFunctions } from '../lib/api/functions';

/** @deprecated Use EdgeFunctions from lib/api/functions instead. */
export const TranscriptionService = {
  processVideo: (videoId: string, youtubeUrl: string) =>
    EdgeFunctions.processVideo(videoId, youtubeUrl),

  getSupportedLanguages: () => [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese (Simplified)' },
  ],
};
