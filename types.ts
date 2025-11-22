export interface Scene {
  id: number;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioData?: string; // Base64 string
  duration: number; // Estimated duration in seconds
  isGeneratingImage: boolean;
  isGeneratingAudio: boolean;
}

export interface VideoProject {
  topic: string;
  scenes: Scene[];
  status: 'idle' | 'scripting' | 'producing' | 'ready' | 'error';
  error?: string;
}

export enum GenerationStep {
  IDLE = 'IDLE',
  SCRIPTING = 'SCRIPTING',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  READY = 'READY',
}

export type VideoFormat = 'landscape' | 'portrait';

export enum VideoLength {
  SHORT = 'Short (< 60s)',
  SEMI = 'Semi (2-5 min)',
  MEDIUM = 'Medium (5-10 min)',
  LONG = 'Long (10-30 min)',
}

export enum VideoStyle {
  REALISTIC = 'Realistic',
  CINEMATIC = 'Cinematic',
  ANIME = 'Anime',
  CYBERPUNK = 'Cyberpunk',
  WATERCOLOR = 'Watercolor',
  MINIMALIST = 'Minimalist',
}

export interface VideoConfig {
  format: VideoFormat;
  length: VideoLength;
  style: VideoStyle;
}