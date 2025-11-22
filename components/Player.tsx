import React, { useEffect, useRef, useState } from 'react';
import { Scene, VideoFormat } from '../types';
import { decodeBase64, decodeAudioData } from '../utils/audioUtils';
import { Play, Pause, SkipForward, SkipBack, Loader2 } from 'lucide-react';

interface PlayerProps {
  scenes: Scene[];
  currentSceneIndex: number;
  onSceneChange: (index: number) => void;
  format: VideoFormat;
}

const Player: React.FC<PlayerProps> = ({ scenes, currentSceneIndex, onSceneChange, format }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentScene = scenes[currentSceneIndex];

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playSceneAudio = async (scene: Scene) => {
    if (!scene.audioData || !audioContextRef.current) return;

    try {
      // Stop previous audio
      if (activeSourceRef.current) {
        activeSourceRef.current.stop();
      }

      const rawBytes = decodeBase64(scene.audioData);
      const audioBuffer = await decodeAudioData(rawBytes, audioContextRef.current);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        if (isPlaying) {
           handleNext();
        }
      };

      source.start(0);
      activeSourceRef.current = source;

    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  useEffect(() => {
    if (isPlaying && currentScene) {
      playSceneAudio(currentScene);
    } else {
      if (activeSourceRef.current) {
        activeSourceRef.current.stop();
        activeSourceRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSceneIndex]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (currentSceneIndex < scenes.length - 1) {
      onSceneChange(currentSceneIndex + 1);
    } else {
      setIsPlaying(false);
      onSceneChange(0);
    }
  };

  const handlePrev = () => {
    if (currentSceneIndex > 0) {
      onSceneChange(currentSceneIndex - 1);
    }
  };

  useEffect(() => {
    setProgress(0);
  }, [currentSceneIndex]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, 100));
    }, 50);
    return () => clearInterval(interval);
  }, [isPlaying, currentSceneIndex]);

  if (!currentScene) {
    return (
      <div className={`w-full bg-black flex items-center justify-center rounded-lg shadow-2xl border border-gray-800 ${format === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'}`}>
        <p className="text-gray-500">No scenes generated yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Viewport */}
      <div className={`relative w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 group ${format === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'}`}>
        {/* Image Layer */}
        {currentScene.imageUrl ? (
          <img
            src={currentScene.imageUrl}
            alt="Scene"
            className={`w-full h-full object-cover transition-transform duration-[20000ms] ease-linear ${isPlaying ? 'scale-125' : 'scale-100'}`}
            style={{ transformOrigin: 'center center' }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-600 gap-2">
             {currentScene.isGeneratingImage ? <Loader2 className="animate-spin w-8 h-8 text-blue-500" /> : null}
             <span>{currentScene.isGeneratingImage ? "Generating Visuals..." : "Waiting for generation..."}</span>
          </div>
        )}

        {/* Subtitles Overlay */}
        <div className="absolute bottom-[10%] left-0 right-0 px-6 text-center flex justify-center">
            <span className="inline-block bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-lg md:text-xl font-medium shadow-lg max-w-[90%]">
              {currentScene.text}
            </span>
        </div>

        {/* Controls Overlay */}
        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${!isPlaying ? 'opacity-100' : ''}`}>
           <button 
             onClick={togglePlay}
             className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-6 rounded-full text-white transition-all transform hover:scale-110"
           >
             {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
           </button>
        </div>
      </div>

      {/* Timeline Controls */}
      <div className="flex items-center justify-between bg-gray-800/50 p-4 rounded-xl backdrop-blur-sm border border-gray-700">
         <div className="flex items-center gap-4">
            <button onClick={handlePrev} disabled={currentSceneIndex === 0} className="text-gray-400 hover:text-white disabled:opacity-50">
              <SkipBack className="w-5 h-5" />
            </button>
            <span className="text-sm font-mono text-gray-400">
              Scene {currentSceneIndex + 1} / {scenes.length}
            </span>
            <button onClick={handleNext} disabled={currentSceneIndex === scenes.length - 1} className="text-gray-400 hover:text-white disabled:opacity-50">
              <SkipForward className="w-5 h-5" />
            </button>
         </div>
         
         <div className="flex items-center gap-2">
           {currentScene.isGeneratingAudio && (
             <span className="text-xs text-blue-400 flex items-center gap-1">
               <Loader2 className="w-3 h-3 animate-spin" /> Synthesizing
             </span>
           )}
           <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
           <span className="text-xs uppercase tracking-wider font-bold text-gray-500">
             {isPlaying ? 'Playing' : 'Paused'}
           </span>
         </div>
      </div>
    </div>
  );
};

export default Player;