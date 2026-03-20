export const YouTubeService = {
  /**
   * services/youtube.ts Extracts the 11-character YouTube video ID from standard and short URLs.
   */
  extractId: (url: string): string | null => {
    const regex =
      /(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|)([\w-]{11})(?:\S+)?/;
    const match = url.match(regex);
    return match ? match[1] : null;
  },

  /**
   * Validates if a given URL is a valid YouTube URL.
   */
  isValidUrl: (url: string): boolean => {
    return YouTubeService.extractId(url) !== null;
  },
};
