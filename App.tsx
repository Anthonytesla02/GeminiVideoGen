import React, { useState } from 'react';
import { Scene, GenerationStep, VideoConfig, VideoLength, VideoStyle, VideoFormat, VoiceName } from './types';
import { generateVideoScript, generateSceneImage, generateSceneAudio } from './services/geminiService';
import Player from './components/Player';
import Timeline from './components/Timeline';
import { Sparkles, Video, AlertCircle, Zap, Command, Smartphone, Palette, Clock, Mic, Download, FileText, Loader2, Copy, Check } from 'lucide-react';

export default function App() {
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<GenerationStep>(GenerationStep.IDLE);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // UI State
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Config State
  const [config, setConfig] = useState<VideoConfig>({
    format: 'landscape',
    length: VideoLength.SHORT,
    style: VideoStyle.REALISTIC,
    voice: VoiceName.KORE,
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    setError(null);
    setStatus(GenerationStep.SCRIPTING);
    setScenes([]);
    setProgress(0);
    setIsExporting(false);

    try {
      // 1. Generate Script
      const generatedScenes = await generateVideoScript(topic, config);
      setScenes(generatedScenes);
      setStatus(GenerationStep.GENERATING_ASSETS);

      // 2. Generate Assets with Serial Execution (Safe for Free Tier)
      const updateSceneState = (id: number, updates: Partial<Scene>) => {
        setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      };

      let completedCount = 0;
      const totalTasks = generatedScenes.length * 2; 

      for (const scene of generatedScenes) {
        // Start Image
        updateSceneState(scene.id, { isGeneratingImage: true });
        try {
          const url = await generateSceneImage(scene.imagePrompt, config.format);
          updateSceneState(scene.id, { imageUrl: url, isGeneratingImage: false });
        } catch (e) {
          console.error(e);
          updateSceneState(scene.id, { isGeneratingImage: false });
        }
        completedCount++;
        setProgress((completedCount / totalTasks) * 100);

        // Start Audio
        updateSceneState(scene.id, { isGeneratingAudio: true });
        try {
          const audio = await generateSceneAudio(scene.text, config.voice);
          updateSceneState(scene.id, { audioData: audio, isGeneratingAudio: false });
        } catch (e) {
           console.error(e);
           updateSceneState(scene.id, { isGeneratingAudio: false });
        }
        completedCount++;
        setProgress((completedCount / totalTasks) * 100);

        // Rate Limit Buffer
        await new Promise(resolve => setTimeout(resolve, 1500));
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
    if (currentSceneIndex === fromIndex) setCurrentSceneIndex(toIndex);
  };

  const handleExport = () => {
    if (status !== GenerationStep.READY) return;
    setCurrentSceneIndex(0);
    setIsExporting(true);
  };

  const handleExportComplete = () => {
    setIsExporting(false);
    setCurrentSceneIndex(0);
  };

  const handleCopyTranscript = () => {
    const fullText = scenes.map(s => s.text.replace(/\*/g, '')).join(' ');
    navigator.clipboard.writeText(fullText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
             <a href="/GUIDE.md" target="_blank" className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-white transition-colors">
               <FileText className="w-3 h-3" /> Documentation
             </a>
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
              Create viral <span className="text-blue-500">kinetic</span> video.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Intelligent pacing, dynamic visuals, and professional audio engineering.
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

             {/* Voice Selector */}
             <div className="flex flex-col gap-1">
               <label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider flex items-center gap-1">
                 <Mic className="w-3 h-3" /> Narrator
               </label>
               <select 
                 className="bg-gray-800 border border-gray-700 text-sm rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                 value={config.voice}
                 onChange={(e) => setConfig({...config, voice: e.target.value as VoiceName})}
                 disabled={status !== GenerationStep.IDLE && status !== GenerationStep.READY}
               >
                 {Object.values(VoiceName).map(v => <option key={v} value={v}>{v}</option>)}
               </select>
             </div>

             {/* Length */}
             <div className="flex flex-col gap-1">
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
             
             {/* Action Bar */}
             {status === GenerationStep.READY && (
               <div className="flex justify-end">
                  <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isExporting ? "Rendering..." : "Export Video"}
                  </button>
               </div>
             )}

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
                       videoLength={config.length}
                       isExporting={isExporting}
                       onExportComplete={handleExportComplete}
                     />
                   </div>
                </div>

                {/* Script/Details Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full max-h-[600px] overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                      <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                      Shot List
                    </h3>
                    <button 
                      onClick={handleCopyTranscript}
                      className="text-xs flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md border border-gray-700"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {isCopied ? "Copied" : "Copy Transcript"}
                    </button>
                  </div>
                  
                  <div className="space-y-2 flex-1">
                    {scenes.map((scene, idx) => (
                      <div 
                        key={scene.id} 
                        onClick={() => !isExporting && setCurrentSceneIndex(idx)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex gap-3 
                          ${idx === currentSceneIndex ? 'bg-gray-800 border-blue-500/50' : 'bg-gray-800/30 border-transparent hover:bg-gray-800'}
                          ${isExporting ? 'cursor-not-allowed opacity-50' : ''}
                        `}
                      >
                         <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-mono text-gray-400">
                            {idx + 1}
                         </div>
                         <div className="flex-1">
                            <p className="text-gray-200 text-sm font-medium mb-1">"{scene.text}"</p>
                            <p className="text-xs text-gray-500 line-clamp-1">{scene.imagePrompt}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
             </div>

             {/* Timeline Area */}
             <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="mb-2 text-xs text-gray-500 font-mono uppercase tracking-wider">Timeline</div>
                <Timeline 
                  scenes={scenes}
                  currentSceneIndex={currentSceneIndex}
                  onSceneSelect={(idx) => !isExporting && setCurrentSceneIndex(idx)}
                  onReorder={handleReorder}
                />
             </div>
          </div>
        )}

      </main>
    </div>
  );
}