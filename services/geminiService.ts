import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, VideoConfig, VideoLength, VideoFormat, VoiceName } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Models ---
const SCRIPT_MODEL = "gemini-2.5-flash"; 
const IMAGE_MODEL = "gemini-2.5-flash-image"; 
const AUDIO_MODEL = "gemini-2.5-flash-preview-tts";

// Helper: Wait function for backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry wrapper for API calls
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 2000, fallbackValue?: T): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
      
      if (isRateLimit && i < retries - 1) {
        const waitTime = delay * Math.pow(2, i); // 2s, 4s, 8s
        console.warn(`Rate limit hit. Retrying in ${waitTime}ms...`);
        await wait(waitTime);
        continue;
      }
      
      if (i === retries - 1) {
        console.error("Max retries reached or non-retriable error:", error);
        if (fallbackValue !== undefined) return fallbackValue;
        throw error;
      }
    }
  }
  throw new Error("Unexpected retry loop exit");
}

// Scene Counts
const getSceneCount = (length: VideoLength): number => {
  switch (length) {
    case VideoLength.SHORT: return 15;   // ~15 shots (45s @ 3s/shot)
    case VideoLength.SEMI: return 30;    // ~30 shots (1.5m)
    case VideoLength.MEDIUM: return 45;  // ~45 shots
    case VideoLength.LONG: return 60;    // Capped for free tier
    default: return 15;
  }
};

const getRandomEffect = () => {
  const effects = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'] as const;
  return effects[Math.floor(Math.random() * effects.length)];
};

export const generateVideoScript = async (topic: string, config: VideoConfig): Promise<Scene[]> => {
  const sceneCount = getSceneCount(config.length);
  
  // Pacing logic
  const pacingInstruction = config.length === VideoLength.SHORT 
    ? "FAST PACED: Sentences must be short (5-10 words). Cut fast." 
    : "RHYTHMIC PACING: Sentences can be slightly longer (10-15 words) for a 3-second visual hold.";

  const prompt = `
    You are an expert video director creating a "Kinetic" style documentary video about: "${topic}".
    
    Configuration:
    - Format: ${config.format}
    - Style: ${config.style}
    - Total Shots: EXACTLY ${sceneCount}
    
    Instructions:
    1. ${pacingInstruction}
    2. KEYWORD HIGHLIGHTING: Identify the most important Noun or Verb in every sentence and wrap it in asterisks. Example: "The *universe* is expanding *rapidly*."
    3. STRUCTURE: 
       - Scenes 1-5: THE HOOK. Extremely punchy, short sentences.
       - If detailing a process, use "Step 1:", "Step 2:" at the start of text.
    4. VISUALS:
       - Aesthetics: Minimalist, Moody, Cinematic Lighting, 8k resolution.
       - Backgrounds: Deep colors, clean compositions suitable for text overlay.
    
    Output a strictly valid JSON array of objects:
    [
      {
        "text": "Voiceover text with *highlighted* words.",
        "imagePrompt": "Detailed visual description..."
      }
    ]
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: SCRIPT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              imagePrompt: { type: Type.STRING },
            },
            required: ["text", "imagePrompt"],
          },
        },
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No script generated");

    const rawScenes = JSON.parse(jsonText);
    return rawScenes.map((s: any, index: number) => ({
      id: Date.now() + index,
      text: s.text,
      imagePrompt: s.imagePrompt,
      duration: config.length === VideoLength.SHORT ? 2.5 : 3.5, // Default duration fallback
      isGeneratingImage: false,
      isGeneratingAudio: false,
      effect: getRandomEffect(),
    }));
  });
};

export const generateSceneImage = async (prompt: string, format: VideoFormat): Promise<string> => {
  const fallbackImage = `https://placehold.co/${format === 'portrait' ? '720x1280' : '1280x720'}/0a192f/FFFFFF/png?text=Visual+Load+Error`;
  
  return withRetry(async () => {
    const aspectRatio = format === 'portrait' ? '9:16' : '16:9';
    // Append style modifiers to every prompt for consistency
    const styledPrompt = `${prompt}, cinematic lighting, minimalist composition, highly detailed, 8k, moody atmosphere, no text`;
    
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [{ text: styledPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio, 
        }
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data returned");
  }, 3, 3000, fallbackImage);
};

export const generateSceneAudio = async (text: string, voice: VoiceName): Promise<string> => {
  // Clean text for TTS (remove asterisks used for visual highlighting)
  const cleanText = text.replace(/\*/g, '');
  
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: AUDIO_MODEL,
      contents: { parts: [{ text: cleanText }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data; 
        }
      }
    }
    throw new Error("No audio data returned");
  }, 3, 2000, "");
};