// Maps to Deepgram Nova-2 JSON response structure
export interface TranscriptJsonPayload {
  channels?: Array<{
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words: Array<{
        word: string;
        punctuated_word: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
  }>;
}

export interface AiInsightsPayload {
  chapters?: any; // Replace with strict type later based on your AI prompt
  seo_metadata?: any;
}
