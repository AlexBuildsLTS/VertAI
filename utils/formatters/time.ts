/**
 * Converts raw seconds into MM:SS or HH:MM:SS format
 * @param rawSeconds - Time in seconds (e.g., 125.4)
 * @returns Formatted string (e.g., "02:05")
 */
export const formatTranscriptTime = (rawSeconds: number): string => {
  const roundedSeconds = Math.floor(rawSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};
