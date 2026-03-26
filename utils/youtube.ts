/**
 * utils/youtube.ts
 * Universal video URL utilities - YouTube, Vimeo, Dailymotion, and generic URLs.
 * Extracts video IDs and validates URLs from ANY video platform.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export type VideoPlatform =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'twitch'
  | 'facebook'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'patreon'
  | 'rumble'
  | 'bitchute'
  | 'odysee'
  | 'direct' // Direct video URL (mp4, webm, etc.)
  | 'unknown';

export interface VideoInfo {
  platform: VideoPlatform;
  videoId: string | null;
  originalUrl: string;
  normalizedUrl: string;
  isValid: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGEX PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const PATTERNS = {
  youtube:
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/|m\/watch\?v=))([\w-]{11})/i,
  vimeo: /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i,
  dailymotion:
    /(?:dailymotion\.com\/(?:video|embed\/video)\/|dai\.ly\/)([a-zA-Z0-9]+)/i,
  twitch: /(?:twitch\.tv\/(?:videos\/|.*\/clip\/))(\w+)/i,
  facebook: /(?:facebook\.com\/.*\/videos\/|fb\.watch\/)(\d+)/i,
  tiktok: /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/)(\d+)/i,
  instagram: /(?:instagram\.com\/(?:p|reel|tv)\/)([A-Za-z0-9_-]+)/i,
  twitter: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  rumble: /(?:rumble\.com\/(?:embed\/|v)?)([a-zA-Z0-9]+)/i,
  bitchute: /(?:bitchute\.com\/(?:video|embed)\/)([a-zA-Z0-9]+)/i,
  odysee: /(?:odysee\.com\/@[^\/]+\/)([^\/\?]+)/i,
  directVideo: /\.(mp4|webm|m4v|mov|avi|mkv|ogv)(\?|$)/i,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts YouTube video ID from any YouTube URL format
 */
export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PATTERNS.youtube);
  return match?.[1] ?? null;
}

/**
 * Extracts Vimeo video ID
 */
export function extractVimeoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PATTERNS.vimeo);
  return match?.[1] ?? null;
}

/**
 * Extracts Dailymotion video ID
 */
export function extractDailymotionId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(PATTERNS.dailymotion);
  return match?.[1] ?? null;
}

/**
 * Detects video platform from URL
 */
export function detectPlatform(url: string): VideoPlatform {
  if (!url || typeof url !== 'string') return 'unknown';

  const lower = url.toLowerCase();

  if (lower.includes('youtube.com') || lower.includes('youtu.be'))
    return 'youtube';
  if (lower.includes('vimeo.com')) return 'vimeo';
  if (lower.includes('dailymotion.com') || lower.includes('dai.ly'))
    return 'dailymotion';
  if (lower.includes('twitch.tv')) return 'twitch';
  if (lower.includes('facebook.com') || lower.includes('fb.watch'))
    return 'facebook';
  if (lower.includes('tiktok.com') || lower.includes('vm.tiktok.com'))
    return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com'))
    return 'twitter';
  if (lower.includes('patreon.com')) return 'patreon';
  if (lower.includes('rumble.com')) return 'rumble';
  if (lower.includes('bitchute.com')) return 'bitchute';
  if (lower.includes('odysee.com')) return 'odysee';
  if (PATTERNS.directVideo.test(url)) return 'direct';

  return 'unknown';
}

/**
 * Extracts video ID for any supported platform
 */
export function extractVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const platform = detectPlatform(url);

  switch (platform) {
    case 'youtube':
      return extractYouTubeId(url);
    case 'vimeo':
      return extractVimeoId(url);
    case 'dailymotion':
      return extractDailymotionId(url);
    case 'twitch': {
      const match = url.match(PATTERNS.twitch);
      return match?.[1] ?? null;
    }
    case 'facebook': {
      const match = url.match(PATTERNS.facebook);
      return match?.[1] ?? null;
    }
    case 'tiktok': {
      const match = url.match(PATTERNS.tiktok);
      return match?.[1] ?? null;
    }
    case 'instagram': {
      const match = url.match(PATTERNS.instagram);
      return match?.[1] ?? null;
    }
    case 'twitter': {
      const match = url.match(PATTERNS.twitter);
      return match?.[1] ?? null;
    }
    case 'rumble': {
      const match = url.match(PATTERNS.rumble);
      return match?.[1] ?? null;
    }
    case 'bitchute': {
      const match = url.match(PATTERNS.bitchute);
      return match?.[1] ?? null;
    }
    case 'odysee': {
      const match = url.match(PATTERNS.odysee);
      return match?.[1] ?? null;
    }
    case 'direct':
      // For direct URLs, use a hash of the URL as ID
      return hashUrl(url);
    default:
      return null;
  }
}

/**
 * Simple hash for direct video URLs
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Parses and validates video URL
 */
export function parseVideoUrl(url: string): VideoInfo {
  if (!url || typeof url !== 'string') {
    return {
      platform: 'unknown',
      videoId: null,
      originalUrl: url || '',
      normalizedUrl: '',
      isValid: false,
    };
  }

  const trimmed = url.trim();
  const platform = detectPlatform(trimmed);
  const videoId = extractVideoId(trimmed);

  // Normalize URL based on platform
  let normalizedUrl = trimmed;
  if (platform === 'youtube' && videoId) {
    normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
  } else if (platform === 'vimeo' && videoId) {
    normalizedUrl = `https://vimeo.com/${videoId}`;
  } else if (platform === 'dailymotion' && videoId) {
    normalizedUrl = `https://www.dailymotion.com/video/${videoId}`;
  }

  const isValid = platform !== 'unknown' || isValidUrl(trimmed);

  return {
    platform,
    videoId,
    originalUrl: trimmed,
    normalizedUrl,
    isValid,
  };
}

/**
 * Validates if string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Checks if URL is a supported video platform
 */
export function isSupportedVideoUrl(url: string): boolean {
  const platform = detectPlatform(url);
  return platform !== 'unknown';
}

/**
 * Checks if URL is specifically a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  return detectPlatform(url) === 'youtube';
}

/**
 * Gets thumbnail URL for video (platform-specific)
 */
export function getThumbnailUrl(url: string, videoId?: string): string | null {
  const platform = detectPlatform(url);
  const id = videoId || extractVideoId(url);

  if (!id) return null;

  switch (platform) {
    case 'youtube':
      return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    case 'vimeo':
      // Vimeo requires API call for thumbnail - return null
      return null;
    case 'dailymotion':
      return `https://www.dailymotion.com/thumbnail/video/${id}`;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORT (backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export const YouTubeService = {
  extractId: extractYouTubeId,
  isValidUrl: isYouTubeUrl,
};

export const VideoService = {
  extractId: extractVideoId,
  extractYouTubeId,
  extractVimeoId,
  extractDailymotionId,
  detectPlatform,
  parseVideoUrl,
  isValidUrl,
  isSupportedVideoUrl,
  isYouTubeUrl,
  getThumbnailUrl,
};

export default VideoService;
