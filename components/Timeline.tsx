import React from 'react';
import { Scene } from '../types';
import { Image as ImageIcon, Mic, CheckCircle2, Loader2 } from 'lucide-react';

interface TimelineProps {
  scenes: Scene[];
  currentSceneIndex: number;
  onSceneSelect: (index: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({ scenes, currentSceneIndex, onSceneSelect }) => {
  return (
    <div className="w-full overflow-x-auto pb-4 pt-2">
      <div className="flex gap-4 min-w-max px-1">
        {scenes.map((scene, index) => {
          const isActive = index === currentSceneIndex;
          const hasImage = !!scene.imageUrl;
          const hasAudio = !!scene.audioData;
          
          return (
            <div 
              key={scene.id}
              onClick={() => onSceneSelect(index)}
              className={`
                relative w-48 h-28 rounded-lg border-2 cursor-pointer transition-all duration-200 flex-shrink-0 overflow-hidden group
                ${isActive ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105 z-10' : 'border-gray-700 hover:border-gray-500 opacity-70 hover:opacity-100'}
                bg-gray-800
              `}
            >
              {/* Thumbnail */}
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={`Scene ${index + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                   {scene.isGeneratingImage ? <Loader2 className="w-6 h-6 animate-spin text-blue-400" /> : <ImageIcon className="w-6 h-6 text-gray-600" />}
                </div>
              )}

              {/* Status Indicators */}
              <div className="absolute bottom-1 right-1 flex gap-1">
                {scene.isGeneratingAudio ? (
                   <Loader2 className="w-4 h-4 text-blue-400 animate-spin bg-black/50 rounded-full p-0.5" />
                ) : hasAudio ? (
                   <Mic className="w-4 h-4 text-green-400 bg-black/50 rounded-full p-0.5" />
                ) : (
                   <Mic className="w-4 h-4 text-gray-500 bg-black/50 rounded-full p-0.5" />
                )}
              </div>

              {/* Scene Number */}
              <div className="absolute top-1 left-1 bg-black/60 backdrop-blur px-1.5 rounded text-xs font-mono text-white">
                #{index + 1}
              </div>
              
              {/* Active Overlay */}
              {isActive && <div className="absolute inset-0 border-4 border-blue-500 rounded-lg pointer-events-none"></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
