import React, { useState, useCallback } from 'react';
import { Scene, GenerationStep } from './types';
import { generateVideoScript, generateSceneImage, generateSceneAudio } from './services/geminiService';
import Player from './components/Player';
import Timeline from './components/Timeline';
import { Sparkles, Video, AlertCircle, Zap, Command } from 'lucide-react';

export default function App() {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<GenerationStep>(GenerationStep.IDLE);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    setError(null);
    setStatus(GenerationStep.SCRIPTING);
    setScenes([]);

    try {
      // 1. Generate Script
      const generatedScenes = await generateVideoScript(topic);
      setScenes(generatedScenes);
      setStatus(GenerationStep.GENERATING_ASSETS);

      // 2. Generate Assets (Parallelized but throttled for safety)
      // We trigger generation for all scenes, but updates happen asynchronously
      const updatedScenes = [...generatedScenes];

      // Helper to update state
      const updateScene = (index: number, updates: Partial<Scene>) => {
        setScenes(prev => {
          const next = [...prev];
          next[index] = { ...next[index], ...updates };
          return next;
        });
      };

      // Start generation processes
      const assetPromises = generatedScenes.map(async (scene, index) => {
        // Generate Image
        updateScene(index, { isGeneratingImage: true });
        generateSceneImage(scene.imagePrompt)
          .then(url => updateScene(index, { imageUrl: url, isGeneratingImage: false }))
          .catch(e => console.error(e));

        // Generate Audio
        updateScene(index, { isGeneratingAudio: true });
        generateSceneAudio(scene.text)
          .then(audio => updateScene(index, { audioData: audio, isGeneratingAudio: false }))
          .catch(e => console.error(e));
      });
      
      await Promise.all(assetPromises);
      setStatus(GenerationStep.READY);

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setStatus(GenerationStep.IDLE);
    }
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
              Flash Powered
            </span>
          </div>
          <div className="flex items-center gap-4">
             <a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Documentation</a>
             <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold">
                AI
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        
        {/* Input Section */}
        <div className="mb-12 max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
            Turn ideas into video. <br/>
            <span className="text-blue-500">Instantly.</span>
          </h2>
          <p className="text-lg text-gray-400">
            Using Gemini 2.5 Flash for high-speed scripting, image generation, and speech synthesis. 
            An efficient alternative to fragmented tools.
          </p>

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
                placeholder="Describe your video topic (e.g., 'The history of coffee in 30 seconds')"
                className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-600 px-4 py-3 text-lg"
                disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
              />
              <button 
                onClick={handleGenerate}
                disabled={!topic || (status !== GenerationStep.IDLE && status !== GenerationStep.READY)}
                className={`
                  px-6 py-3 rounded-lg font-medium text-white transition-all flex items-center gap-2
                  ${!topic || (status !== GenerationStep.IDLE && status !== GenerationStep.READY) ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20'}
                `}
              >
                {status === GenerationStep.SCRIPTING || status === GenerationStep.GENERATING_ASSETS ? (
                   <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing</>
                ) : (
                   <><Sparkles className="w-5 h-5" /> Generate</>
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
             
             {/* Player Area */}
             <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Player */}
                <div className="lg:col-span-2">
                   <Player 
                     scenes={scenes} 
                     currentSceneIndex={currentSceneIndex}
                     onSceneChange={setCurrentSceneIndex}
                   />
                </div>

                {/* Script/Details Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full max-h-[500px] overflow-y-auto custom-scrollbar">
                  <h3 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
                    <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                    Script & Prompts
                  </h3>
                  
                  <div className="space-y-6">
                    {scenes.map((scene, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setCurrentSceneIndex(idx)}
                        className={`p-4 rounded-lg border transition-all cursor-pointer ${idx === currentSceneIndex ? 'bg-gray-800 border-blue-500/50' : 'bg-gray-800/30 border-transparent hover:bg-gray-800'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-mono text-blue-400">Scene {idx + 1}</span>
                          <span className="text-xs text-gray-500">~5s</span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mb-3">"{scene.text}"</p>
                        <div className="text-xs text-gray-500 bg-black/20 p-2 rounded border border-gray-700/50">
                           <span className="uppercase tracking-wider text-[10px] text-gray-600 font-bold block mb-1">Visual Prompt</span>
                           {scene.imagePrompt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
             </div>

             {/* Timeline Area */}
             <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <Timeline 
                  scenes={scenes}
                  currentSceneIndex={currentSceneIndex}
                  onSceneSelect={setCurrentSceneIndex}
                />
             </div>
          </div>
        )}

      </main>
    </div>
  );
}
