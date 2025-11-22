import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, VideoConfig, VideoLength, VideoFormat } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Models ---
const SCRIPT_MODEL = "gemini-2.5-flash"; 
const IMAGE_MODEL = "gemini-2.5-flash-image"; 
const AUDIO_MODEL = "gemini-2.5-flash-preview-tts";

const getSceneCount = (length: VideoLength): number => {
  switch (length) {
    case VideoLength.SHORT: return 5;   // ~50s
    case VideoLength.SEMI: return 12;   // ~2-3 mins
    case VideoLength.MEDIUM: return 24; // ~5-8 mins
    case VideoLength.LONG: return 40;   // ~10+ mins (Soft cap for rate limits)
    default: return 5;
  }
};

export const generateVideoScript = async (topic: string, config: VideoConfig): Promise<Scene[]> => {
  const sceneCount = getSceneCount(config.length);
  
  const prompt = `
    Create a ${sceneCount}-scene video script about: "${topic}".
    Video Style: ${config.style}.
    Video Format: ${config.format}.
    
    The tone should be engaging and professional.
    Each scene must have:
    1. "text": The voiceover script (approx 15-20 words).
    2. "imagePrompt": A highly detailed description of the visual background for this scene. 
       Style instruction: strictly adhere to a "${config.style}" aesthetic.
       Format instruction: Describe elements suitable for ${config.format} framing.
       Avoid text in images.
    
    Return strictly JSON.
  `;

  try {
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
      duration: 5, // Default fallback duration
      isGeneratingImage: false,
      isGeneratingAudio: false,
    }));

  } catch (error) {
    console.error("Script Generation Error:", error);
    throw new Error("Failed to generate script. Please try a different topic.");
  }
};

export const generateSceneImage = async (prompt: string, format: VideoFormat): Promise<string> => {
  try {
    const aspectRatio = format === 'portrait' ? '9:16' : '16:9';
    
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio, 
        }
      },
    });

    // Iterate to find image part
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data returned");
  } catch (error) {
    console.error("Image Gen Error:", error);
    // Return a placeholder if generation fails to keep the app running
    return `https://placehold.co/${format === 'portrait' ? '720x1280' : '1280x720'}/1f2937/FFFFFF/png?text=Image+Generation+Failed`;
  }
};

export const generateSceneAudio = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: AUDIO_MODEL,
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data; // Raw Base64 PCM
        }
      }
    }
    throw new Error("No audio data returned");
  } catch (error) {
    console.error("Audio Gen Error:", error);
    return ""; 
  }
};