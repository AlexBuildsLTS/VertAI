/**
 * Converts raw seconds into MM:SS or HH:MM:SS format.
 *
 * When hours are present the hours component is zero-padded to two digits so
 * that the output is valid in SRT (`HH:MM:SS,mmm`) and WebVTT (`HH:MM:SS.mmm`)
 * subtitle timestamps as well as general display use.
 *
 * @param rawSeconds - Time in seconds (e.g., 125.4)
 * @returns Formatted string (e.g., "02:05" or "01:05:30")
 */
export const formatTranscriptTime = (rawSeconds: number): string => {
  const roundedSeconds = Math.floor(rawSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const paddedHours = hours.toString().padStart(2, '0');
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
};
