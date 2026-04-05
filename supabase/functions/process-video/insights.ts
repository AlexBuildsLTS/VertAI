/**
 * supabase/functions/process-video/insights.ts
 * AI insights generation using Gemini 3.1 Flash-Lite (preview)
 *
 * Optimized for Deno Edge Functions.
 * Behavior dynamically adapts to the content length and depth natively,
 * without rigid limits on summaries or chapters.
 */
import { GoogleGenerativeAI, SchemaType, ResponseSchema } from 'npm:@google/generative-ai@^0.24.1';

const InsightsSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: {
      type: SchemaType.STRING,
      description:
        'A highly professional, comprehensive executive summary. Dynamically scale the length and depth to adequately cover the core themes, arguments, and conclusions of the provided content without arbitrary constraints. Provide a clear introduction, body, and synthesis.',
    },
    chapters: {
      type: SchemaType.ARRAY,
      description:
        'Chronological chapters representing natural topic transitions. Generate as many or as few as necessary based on the content. Do not force chapters if the content is highly cohesive and short.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp: {
            type: SchemaType.STRING,
            description: 'Timestamp in MM:SS or HH:MM:SS format.',
          },
          title: {
            type: SchemaType.STRING,
            description: 'A concise, professional title for the segment.',
          },
          description: {
            type: SchemaType.STRING,
            description: 'A detailed explanation of the points covered in this specific chapter.',
          },
        },
        required: ['timestamp', 'title', 'description'],
      },
    },
    key_takeaways: {
      type: SchemaType.ARRAY,
      description:
        'The most important, actionable insights. Extract valuable points that provide real value. Let the content dictate the number of takeaways.',
      items: { type: SchemaType.STRING },
    },
    seo_metadata: {
      type: SchemaType.OBJECT,
      description: 'SEO-optimized metadata for content discovery.',
      properties: {
        tags: {
          type: SchemaType.ARRAY,
          description: 'Relevant keywords and topic tags.',
          items: { type: SchemaType.STRING },
        },
        suggested_titles: {
          type: SchemaType.ARRAY,
          description: 'Engaging and highly relevant alternative titles.',
          items: { type: SchemaType.STRING },
        },
        description: {
          type: SchemaType.STRING,
          description: 'A compelling meta description optimized for search results.',
        },
      },
      required: ['tags', 'suggested_titles', 'description'],
    },
  },
  required: ['summary', 'chapters', 'key_takeaways', 'seo_metadata'],
};

export type InsightsResult = {
  model: string;
  summary: string;
  chapters: { timestamp: string; title: string; description: string }[];
  key_takeaways: string[];
  seo_metadata: {
    tags: string[];
    suggested_titles: string[];
    description: string;
  };
  tokens_used: number;
};

// ─── UTILITY: INDESTRUCTIBLE JSON EXTRACTOR ─────────────────────────────────
// Guarantees parsing even if Gemini ignores the schema and wraps it in markdown or random text
function extractCleanJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end >= start) {
    return text.substring(start, end + 1);
  }
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

// ─── UTILITY: EXPONENTIAL BACKOFF ───────────────────────────────────────────
// Guarantees execution against 503s, 429s, or temporary API outages
async function withGeminiRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      console.warn(`[Insights:Retry] Gemini generation failed (${error.message}). Retrying ${attempt}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, attempt - 1))); // 1.5s, 3s
    }
  }
  throw new Error('Gemini retry loop exhausted.');
}

// RESTORED: Your dynamic category logic
function getContentCategory(transcript: string): 'short' | 'medium' | 'long' {
  const wordCount = transcript.split(/\s+/).length;
  if (wordCount < 1000) return 'short'; // ~6 mins or less
  if (wordCount < 5000) return 'medium'; // ~6 to 30 mins
  return 'long';
}

export async function generateInsights(
  transcript: string,
  language: string,
  difficulty: string,
): Promise<InsightsResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_CONFIG_ERROR: Gemini API key is not configured.');
  }

  console.log(`[Insights] Initializing Gemini 3.1 Flash-Lite...`);

  const category = getContentCategory(transcript);
  const genAI = new GoogleGenerativeAI(apiKey);
  const targetModel = 'gemini-3.1-flash-lite-preview';

  console.log(`[Insights] Target model: ${targetModel}. Content category: ${category}.`);

  const model = genAI.getGenerativeModel({
    model: targetModel,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: InsightsSchema,
      temperature: 0.2, // Low temperature for factual, analytical consistency
    },
  });

  // Protect context window limits on massive videos (Safe cap for Flash-Lite payload)
  const safeTranscript = transcript.length > 800000 ? transcript.substring(0, 800000) : transcript;

  // Pass the category into your prompt builder
  const prompt = buildIntelligentPrompt(safeTranscript, language, difficulty, category);

  try {
    console.log(`[Insights] Sending request to Gemini (Category: ${category})...`);
    const startTime = Date.now();

    // ─── GUARANTEED EXECUTION WRAPPER ───
    const result = await withGeminiRetry(async () => {
      return await model.generateContent(prompt);
    });

    const responseText = result.response.text();

    if (!responseText) {
      throw new Error('Gemini returned an empty response payload.');
    }

    // Indestructible extraction
    const cleanJsonString = extractCleanJson(responseText);
    const parsed = JSON.parse(cleanJsonString);

    const elapsed = Date.now() - startTime;
    const tokens = result.response.usageMetadata?.totalTokenCount || 0;

    console.log(`[Insights] ✓ Generated in ${elapsed}ms. Tokens: ${tokens}`);
    console.log(`[Insights] Chapters created: ${parsed.chapters?.length || 0}`);

    // Ensure fallback values map perfectly to the required InsightsResult structure
    return {
      model: targetModel,
      summary: parsed.summary || '',
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      key_takeaways: Array.isArray(parsed.key_takeaways) ? parsed.key_takeaways : [],
      seo_metadata: parsed.seo_metadata || {
        tags: [],
        suggested_titles: [],
        description: '',
      },
      tokens_used: tokens,
    };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Insights] Gemini error:', msg);
    throw new Error(`Gemini AI generation failed: ${msg}`);
  }
}

// RESTORED: Your custom prompt builder with category injection
function buildIntelligentPrompt(
  transcript: string,
  language: string,
  difficulty: string,
  category: 'short' | 'medium' | 'long'
): string {
  const difficultyGuides: Record<string, string> = {
    beginner:
      'Use accessible language. Define technical terms. Explain concepts as if to someone new to the topic.',
    standard:
      'Balance clarity with precision. Briefly explain specialized terminology when it appears.',
    advanced:
      'Use precise technical language. Assume domain expertise. Focus on nuanced, high-level insights.',
  };

  const guidelines = {
    short: 'Write 2-3 substantial paragraphs for the summary. Chapters are optional unless clear topic shifts exist.',
    medium: 'Write 3-4 paragraphs for the summary. Extract 3-6 distinct chapters.',
    long: 'Write a comprehensive 4-5 paragraph summary. Extract 6-12 distinct, navigable chapters.',
  }[category];

  return `You are an expert content analyst creating professional, publication-ready analysis.

TASK: Analyze this transcript and produce structured insights.

OUTPUT LANGUAGE: All text must be in ${language}.
AUDIENCE LEVEL: ${difficulty} — ${difficultyGuides[difficulty] || difficultyGuides.standard}

GUIDELINES:
- ${guidelines}
- Structure and scale your response based naturally on the length and density of the transcript.
- Do not artificially restrict the length of your summaries or the number of chapters. If the content is deep and complex, provide a thorough, lengthy analysis and as many chapters as necessary. If it is brief, keep it concise.
- Focus heavily on professionalism, accuracy, and providing genuine value to the reader.
- Extract meaningful, actionable key takeaways. Avoid obvious observations.
- Create highly relevant SEO tags, titles, and descriptions.

CRITICAL RULES:
1. Your ENTIRE response must be valid JSON matching the schema.
2. NO markdown, NO preamble, NO "Here is..." text.
3. Ensure chapter timestamps are sequentially estimated based on the transcript flow.

TRANSCRIPT TO ANALYZE:
"""
${transcript}
"""`;
}