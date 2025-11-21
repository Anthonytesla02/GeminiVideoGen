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
