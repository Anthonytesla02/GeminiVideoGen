import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Models ---
// Using 2.5 Flash for everything to maximize speed and rate limits for the user
const SCRIPT_MODEL = "gemini-2.5-flash"; 
const IMAGE_MODEL = "gemini-2.5-flash-image"; 
const AUDIO_MODEL = "gemini-2.5-flash-preview-tts";

export const generateVideoScript = async (topic: string): Promise<Scene[]> => {
  const prompt = `
    Create a 4-scene video script about: "${topic}".
    The tone should be engaging and professional (like Invideo).
    Each scene must have:
    1. "text": The voiceover script (keep it under 20 words per scene).
    2. "imagePrompt": A highly detailed, cinematic description of the visual background for this scene. Avoid text in images.
    
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
      id: index,
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

export const generateSceneImage = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        // Image config works differently for flash-image vs imagen.
        // For flash-image, we just prompt.
        // Using standard generation, expecting inlineData in response.
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
    return `https://picsum.photos/seed/${Math.random()}/1024/1024`;
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
