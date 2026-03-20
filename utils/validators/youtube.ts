/**
 * Professional YouTube URL Validator and Extractor
 * Handles standard links, shortened links (youtu.be), embedded links, and mobile links.
 */

// Ironclad Regex for matching valid YouTube URLs
const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;

export const YouTubeValidator = {
  /**
   * Validates if a given string is a correctly formatted YouTube URL.
   */
  isValidUrl: (url: string): boolean => {
    if (!url) return false;
    return YOUTUBE_REGEX.test(url.trim());
  },

  /**
   * Safely extracts the 11-character Video ID from any valid YouTube URL.
   * Throws an error if the URL is invalid.
   */
  extractId: (url: string): string => {
    const cleanUrl = url.trim();
    const match = cleanUrl.match(YOUTUBE_REGEX);

    if (match && match[1].length === 11) {
      return match[1];
    }

    throw new Error('Invalid YouTube URL format. Could not extract Video ID.');
  },
};
