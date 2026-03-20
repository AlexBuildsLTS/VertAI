// This defines the strict shape of the JSON returned by Gemini and stored in Supabase.
export interface AiInsightsPayload {
  summary: string;
  chapters: Array<{ time: string; title: string }>;
  seo_metadata: {
    tags: string[];
    suggested_titles: string[];
    description: string;
  };
}

export interface DeepgramWord {
  /** Raw word token as returned by Deepgram. */
  word: string;
  /** Word with punctuation applied (e.g. "Hello," vs "Hello"). Present on Nova-2+. */
  punctuated_word: string;
  start: number;
  end: number;
  confidence: number;
  /** Speaker diarisation index; present when diarize is enabled. */
  speaker?: number;
}

export interface TranscriptJsonPayload {
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: DeepgramWord[];
      }>;
    }>;
  };
}
