import React, { useState } from 'react';
import { Scene, GenerationStep, VideoConfig, VideoLength, VideoStyle, VideoFormat } from './types';
import { generateVideoScript, generateSceneImage, generateSceneAudio } from './services/geminiService';
import Player from './components/Player';
import Timeline from './components/Timeline';
import { Sparkles, Video, AlertCircle, Zap, Command, Smartphone, Monitor, Palette, Clock } from 'lucide-react';

export default function App() {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<GenerationStep>(GenerationStep.IDLE);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Config State
  const [config, setConfig] = useState<VideoConfig>({
    format: 'landscape',
    length: VideoLength.SHORT,
    style: VideoStyle.REALISTIC,
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    setError(null);
    setStatus(GenerationStep.SCRIPTING);
    setScenes([]);
    setProgress(0);

    try {
      // 1. Generate Script
      const generatedScenes = await generateVideoScript(topic, config);
      setScenes(generatedScenes);
      setStatus(GenerationStep.GENERATING_ASSETS);

      // 2. Generate Assets with Batching (to respect Rate Limits)
      // Rate Limit Strategy: Process 3 scenes at a time.
      const BATCH_SIZE = 3; 
      
      // Create a local copy to update
      let currentScenes = [...generatedScenes];

      const updateSceneState = (id: number, updates: Partial<Scene>) => {
        setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      };

      let completedCount = 0;
      const totalTasks = generatedScenes.length * 2; // Image + Audio per scene

      for (let i = 0; i < generatedScenes.length; i += BATCH_SIZE) {
        const batch = generatedScenes.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (scene) => {
          // Trigger Image
          updateSceneState(scene.id, { isGeneratingImage: true });
          generateSceneImage(scene.imagePrompt, config.format)
            .then(url => {
              updateSceneState(scene.id, { imageUrl: url, isGeneratingImage: false });
              completedCount++;
              setProgress((completedCount / totalTasks) * 100);
            })
            .catch(e => {
              console.error(e);
              updateSceneState(scene.id, { isGeneratingImage: false });
            });

          // Trigger Audio
          updateSceneState(scene.id, { isGeneratingAudio: true });
          generateSceneAudio(scene.text)
            .then(audio => {
              updateSceneState(scene.id, { audioData: audio, isGeneratingAudio: false });
              completedCount++;
              setProgress((completedCount / totalTasks) * 100);
            })
            .catch(e => {
               console.error(e);
               updateSceneState(scene.id, { isGeneratingAudio: false });
            });
        }));

        // Minimal delay between batches to be safe with free tier
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setStatus(GenerationStep.READY);

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setStatus(GenerationStep.IDLE);
    }
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= scenes.length) return;
    setScenes(prev => {
      const newScenes = [...prev];
      const [moved] = newScenes.splice(fromIndex, 1);
      newScenes.splice(toIndex, 0, moved);
      return newScenes;
    });
    // Update current index if needed to track selection
    if (currentSceneIndex === fromIndex) setCurrentSceneIndex(toIndex);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
               <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Lumina
            </h1>
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-800/50 text-[10px] text-blue-300 font-medium ml-2">
              <Zap className="w-3 h-3" />
              Gen 2.5 Flash
            </span>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs text-gray-500 font-mono hidden sm:block">v2.0 (Efficient)</div>
             <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                AI
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        
        {/* Input & Config Section */}
        <div className="mb-12 max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
              Turn ideas into <span className="text-blue-500">video</span>.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Intelligent script-to-video generation. Optimized for speed and efficiency.
            </p>
          </div>

          {/* Configuration Toolbar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-900/50 p-4 rounded-xl border border-gray-800/50 backdrop-blur-sm">
             {/* Format */}
             <div className="flex flex-col gap-1">
               <label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider flex items-center gap-1">
                 <Smartphone className="w-3 h-3" /> Orientation
               </label>
               <select 
                 className="bg-gray-800 border border-gray-700 text-sm rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                 value={config.format}
                 onChange={(e) => setConfig({...config, format: e.target.value as VideoFormat})}
                 disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
               >
                 <option value="landscape">Landscape (16:9)</option>
                 <option value="portrait">Portrait (9:16)</option>
               </select>
             </div>

             {/* Style */}
             <div className="flex flex-col gap-1">
               <label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider flex items-center gap-1">
                 <Palette className="w-3 h-3" /> Style
               </label>
               <select 
                 className="bg-gray-800 border border-gray-700 text-sm rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                 value={config.style}
                 onChange={(e) => setConfig({...config, style: e.target.value as VideoStyle})}
                 disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
               >
                 {Object.values(VideoStyle).map(s => <option key={s} value={s}>{s}</option>)}
               </select>
             </div>

             {/* Length */}
             <div className="flex flex-col gap-1 col-span-2 md:col-span-2">
               <label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider flex items-center gap-1">
                 <Clock className="w-3 h-3" /> Duration
               </label>
               <select 
                 className="bg-gray-800 border border-gray-700 text-sm rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                 value={config.length}
                 onChange={(e) => setConfig({...config, length: e.target.value as VideoLength})}
                 disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
               >
                 {Object.values(VideoLength).map(l => <option key={l} value={l}>{l}</option>)}
               </select>
             </div>
          </div>

          {/* Search Bar */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
            <div className="relative flex items-center bg-gray-900 rounded-xl p-2 border border-gray-700 shadow-2xl">
              <div className="pl-3 text-gray-500">
                <Command className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="Describe your video topic..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-600 px-4 py-3 text-lg"
                disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
              />
              <button 
                onClick={handleGenerate}
                disabled={!topic || (status !== GenerationStep.IDLE && status !== GenerationStep.READY)}
                className={`
                  px-6 py-3 rounded-lg font-medium text-white transition-all flex items-center gap-2 whitespace-nowrap
                  ${!topic || (status !== GenerationStep.IDLE && status !== GenerationStep.READY) ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20'}
                `}
              >
                {status === GenerationStep.SCRIPTING || status === GenerationStep.GENERATING_ASSETS ? (
                   <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating ({Math.round(progress)}%)</>
                ) : (
                   <><Sparkles className="w-5 h-5" /> Generate Video</>
                )}
              </button>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-900/20 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg flex items-center gap-2 text-sm mx-auto max-w-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Workspace Section */}
        {scenes.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-8">
             
             {/* Player & Details Area */}
             <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Player */}
                <div className="lg:col-span-2 flex justify-center bg-gray-900/20 rounded-xl border border-gray-800/50 p-4">
                   <div className={`w-full ${config.format === 'portrait' ? 'max-w-sm' : 'max-w-4xl'}`}>
                     <Player 
                       scenes={scenes} 
                       currentSceneIndex={currentSceneIndex}
                       onSceneChange={setCurrentSceneIndex}
                       format={config.format}
                     />
                   </div>
                </div>

                {/* Script/Details Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full max-h-[600px] overflow-y-auto custom-scrollbar flex flex-col">
                  <h3 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
                    <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                    Script & Scenes
                  </h3>
                  
                  <div className="space-y-4 flex-1">
                    {scenes.map((scene, idx) => (
                      <div 
                        key={scene.id} 
                        onClick={() => setCurrentSceneIndex(idx)}
                        className={`p-4 rounded-lg border transition-all cursor-pointer ${idx === currentSceneIndex ? 'bg-gray-800 border-blue-500/50' : 'bg-gray-800/30 border-transparent hover:bg-gray-800'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-mono text-blue-400">Scene {idx + 1}</span>
                          <div className="flex gap-1">
                             {/* Simple Reorder Buttons for Accessibility */}
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleReorder(idx, idx - 1); }}
                               disabled={idx === 0}
                               className="text-gray-600 hover:text-white disabled:opacity-0"
                             >↑</button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleReorder(idx, idx + 1); }}
                               disabled={idx === scenes.length - 1}
                               className="text-gray-600 hover:text-white disabled:opacity-0"
                             >↓</button>
                          </div>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mb-3">"{scene.text}"</p>
                        <div className="text-xs text-gray-500 bg-black/20 p-2 rounded border border-gray-700/50">
                           <span className="uppercase tracking-wider text-[10px] text-gray-600 font-bold block mb-1">Prompt</span>
                           {scene.imagePrompt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
             </div>

             {/* Timeline Area */}
             <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="mb-2 text-xs text-gray-500 font-mono uppercase tracking-wider">Timeline (Drag to Reorder)</div>
                <Timeline 
                  scenes={scenes}
                  currentSceneIndex={currentSceneIndex}
                  onSceneSelect={setCurrentSceneIndex}
                  onReorder={handleReorder}
                />
             </div>
          </div>
        )}

      </main>
    </div>
  );
}