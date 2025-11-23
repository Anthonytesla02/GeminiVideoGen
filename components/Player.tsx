import React, { useEffect, useRef, useState } from 'react';
import { Scene, VideoFormat, VideoLength } from '../types';
import { decodeBase64, decodeAudioData, createBassBoost } from '../utils/audioUtils';
import { Play, Pause, SkipForward, SkipBack, Loader2, Volume2, VolumeX } from 'lucide-react';

interface PlayerProps {
  scenes: Scene[];
  currentSceneIndex: number;
  onSceneChange: (index: number) => void;
  format: VideoFormat;
  videoLength: VideoLength;
  isExporting: boolean;
  onExportComplete: () => void;
}

const Player: React.FC<PlayerProps> = ({ scenes, currentSceneIndex, onSceneChange, format, videoLength, isExporting, onExportComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Buffer Cache for Gapless Playback
  const nextAudioBufferRef = useRef<AudioBuffer | null>(null);
  
  // Export Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentScene = scenes[currentSceneIndex];
  
  // Strict Logic: Kinetic Captions ONLY for Short Form (<60s) AND Portrait
  const isKineticMode = videoLength === VideoLength.SHORT && format === 'portrait';

  // --- Initialization ---
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return () => {
      audioContextRef.current?.close();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // --- Audio Graph Management ---
  const ensureAudioGraph = () => {
    const ctx = audioContextRef.current;
    if (!ctx) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // --- Audio Preloading (The Fix for "Presentation" Feel) ---
  const preloadNextAudio = async (index: number) => {
    const nextIndex = index + 1;
    if (nextIndex >= scenes.length) return;
    
    const nextScene = scenes[nextIndex];
    if (!nextScene.audioData) return;

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    try {
      const rawBytes = decodeBase64(nextScene.audioData);
      const buffer = await decodeAudioData(rawBytes, ctx);
      nextAudioBufferRef.current = buffer;
    } catch (e) {
      console.warn("Failed to preload next audio", e);
    }
  };

  // --- Playback Logic ---
  const playSceneAudio = async (scene: Scene, isExportRun = false) => {
    const ctx = ensureAudioGraph();
    if (!ctx || !scene.audioData) {
      // If no audio, wait duration then next
      if (isPlaying || isExportRun) setTimeout(() => handleNext(isExportRun), 3000);
      return;
    }

    try {
      // Stop previous
      if (voiceSourceRef.current) {
        try { voiceSourceRef.current.stop(); } catch (e) {}
      }

      let audioBuffer: AudioBuffer;

      // Check if we have preloaded this specific buffer
      // Note: In a real app we'd map ID to buffer, but simpler here: 
      // if nextAudioBufferRef is populated, we assume it's for the *current* scene (since we preloaded it during the previous one)
      // However, on random seek, we must decode.
      // Optimization: Only use cached if we came from previous index naturally? 
      // For simplicity: We try to use cached, if not, decode.
      
      if (nextAudioBufferRef.current) {
         audioBuffer = nextAudioBufferRef.current;
         nextAudioBufferRef.current = null; // Clear usage
      } else {
         const rawBytes = decodeBase64(scene.audioData);
         audioBuffer = await decodeAudioData(rawBytes, ctx);
      }

      // Create Source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Effects Chain
      const bassEQ = createBassBoost(ctx);
      const mainGain = ctx.createGain();
      mainGain.gain.value = isMuted && !isExportRun ? 0 : 1.0;

      source.connect(bassEQ);
      bassEQ.connect(mainGain);
      mainGain.connect(ctx.destination); // To Speakers

      // Connect to Export Destination if recording
      if (isExportRun && destNodeRef.current) {
        mainGain.connect(destNodeRef.current);
      }

      // End Handler
      source.onended = () => {
        if (isPlaying || isExportRun) handleNext(isExportRun);
      };

      // Start
      const startTime = ctx.currentTime;
      source.start(startTime);
      voiceSourceRef.current = source;

      // Start Visual Animation Loop if exporting
      if (isExportRun) {
        const duration = audioBuffer.duration;
        startCanvasAnimation(scene, startTime, duration);
      }

      // Preload NEXT audio immediately while this one plays
      if (!isExportRun && isPlaying) {
        preloadNextAudio(currentSceneIndex);
      }

    } catch (e) {
      console.error("Audio Error", e);
      if (isPlaying || isExportRun) setTimeout(() => handleNext(isExportRun), 2000);
    }
  };

  const handleNext = (isExportRun = false) => {
    if (currentSceneIndex < scenes.length - 1) {
      onSceneChange(currentSceneIndex + 1);
    } else {
      // End of Playlist
      if (isExportRun) {
        stopRecording();
      } else {
        setIsPlaying(false);
        onSceneChange(0);
      }
    }
  };

  const handlePrev = () => {
    if (currentSceneIndex > 0) onSceneChange(currentSceneIndex - 1);
  };

  const togglePlay = () => {
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
    // If starting play, clear any stale buffer and maybe decode current
    if (!isPlaying) nextAudioBufferRef.current = null; 
    setIsPlaying(!isPlaying);
  };

  // --- Export / Recording Logic ---
  
  useEffect(() => {
    if (isExporting) {
      startExportSequence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExporting, currentSceneIndex]); 

  const startExportSequence = async () => {
    if (currentSceneIndex === 0 && !mediaRecorderRef.current) {
      // Start of Export
      const ctx = ensureAudioGraph();
      if (!ctx || !canvasRef.current) return;

      // Setup Media Recorder
      const canvasStream = canvasRef.current.captureStream(30); // 30 FPS
      const destNode = ctx.createMediaStreamDestination();
      destNodeRef.current = destNode;
      
      // Combine Tracks
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destNode.stream.getAudioTracks()
      ]);

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 4000000 // 4 Mbps
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        // Trigger Download
        const a = document.createElement('a');
        a.href = url;
        a.download = `lumina_project_${Date.now()}.webm`;
        a.click();
        
        // Cleanup
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        destNodeRef.current = null;
        onExportComplete();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
    }
    
    // Play current scene (Export Mode)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
       await playSceneAudio(currentScene, true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // --- Canvas Renderer (Mimics CSS Effects) ---
  const startCanvasAnimation = (scene: Scene, startTime: number, duration: number) => {
    const ctx = audioContextRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext('2d');
    if (!ctx || !canvas || !canvasCtx || !scene.imageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = scene.imageUrl;

    const render = () => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

      const now = ctx.currentTime;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Clear
      canvasCtx.fillStyle = '#0a192f';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      // --- Apply Ken Burns ---
      let scale = 1;
      let translateX = 0;

      switch (scene.effect) {
        case 'zoom-in':
          scale = 1 + (0.15 * progress); // 1.0 -> 1.15
          break;
        case 'zoom-out':
          scale = 1.15 - (0.15 * progress); // 1.15 -> 1.0
          break;
        case 'pan-left':
          scale = 1.1;
          translateX = 0 - (30 * progress);
          break;
        case 'pan-right':
          scale = 1.1;
          translateX = 0 + (30 * progress);
          break;
      }

      // Draw Image with Transform
      canvasCtx.save();
      canvasCtx.translate(canvas.width / 2, canvas.height / 2);
      canvasCtx.scale(scale, scale);
      canvasCtx.translate(-canvas.width / 2 + translateX, -canvas.height / 2);
      
      const imgRatio = img.width / img.height;
      const canvasRatio = canvas.width / canvas.height;
      let renderW, renderH;

      if (imgRatio > canvasRatio) {
        renderH = canvas.height;
        renderW = img.width * (canvas.height / img.height);
      } else {
        renderW = canvas.width;
        renderH = img.height * (canvas.width / img.width);
      }
      canvasCtx.drawImage(img, (canvas.width - renderW) / 2, (canvas.height - renderH) / 2, renderW, renderH);
      canvasCtx.restore();

      // --- Draw Film Grain Overlay ---
      canvasCtx.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 50; i++) {
         canvasCtx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
      }

      // --- Draw Text ---
      drawCanvasText(canvasCtx, scene.text, canvas.width, canvas.height);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (img.complete) {
      render();
    } else {
      img.onload = render;
    }
  };

  const drawCanvasText = (ctx: CanvasRenderingContext2D, text: string, w: number, h: number) => {
    ctx.save();
    
    if (isKineticMode) {
      // --- KINETIC: Center, Big ---
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = format === 'portrait' ? 60 : 80;
      ctx.font = `900 ${fontSize}px Montserrat, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,1)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;

      const words = text.split(' ');
      let lines: {text: string, isHighlight: boolean}[][] = [[]];
      let currentLineIdx = 0;
      let currentLineWidth = 0;
      const maxLineWidth = w * 0.8;

      words.forEach(word => {
        const cleanWord = word.replace(/\*/g, '');
        const width = ctx.measureText(cleanWord + " ").width;
        
        if (currentLineWidth + width > maxLineWidth) {
          currentLineIdx++;
          lines[currentLineIdx] = [];
          currentLineWidth = 0;
        }
        
        lines[currentLineIdx].push({
          text: cleanWord,
          isHighlight: word.includes('*')
        });
        currentLineWidth += width;
      });

      const totalHeight = lines.length * (fontSize * 1.2);
      let startY = (h - totalHeight) / 2 + (fontSize / 2);

      lines.forEach((line) => {
         const lineWidth = line.reduce((acc, item) => acc + ctx.measureText(item.text + " ").width, 0);
         let startX = (w - lineWidth) / 2;

         line.forEach(item => {
           ctx.fillStyle = item.isHighlight ? '#FFD700' : '#FFFFFF';
           if (item.isHighlight) {
               ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
               ctx.shadowBlur = 20;
           } else {
               ctx.shadowColor = "rgba(0,0,0,1)";
               ctx.shadowBlur = 0;
           }
           ctx.fillText(item.text, startX + (ctx.measureText(item.text).width/2), startY);
           startX += ctx.measureText(item.text + " ").width;
         });
         startY += fontSize * 1.2;
      });

    } else {
      // --- SUBTITLE: Bottom, Smaller ---
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const fontSize = format === 'portrait' ? 28 : 36; // Smaller font
      ctx.font = `700 ${fontSize}px Montserrat, sans-serif`;
      
      const cleanText = text.replace(/\*/g, '');
      const maxWidth = w * 0.8; // More padding
      
      const words = cleanText.split(' ');
      let lines = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const width = ctx.measureText(currentLine + " " + words[i]).width;
        if (width < maxWidth) {
          currentLine += " " + words[i];
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
      lines.push(currentLine);

      // Draw Background Box
      const lineHeight = fontSize * 1.5;
      const bottomMargin = h * 0.1; // 10% from bottom

      let y = h - bottomMargin - ((lines.length - 1) * lineHeight);

      lines.forEach(line => {
        // Draw backing for readability
        const lineWidth = ctx.measureText(line).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect((w/2) - (lineWidth/2) - 10, y - lineHeight + 10, lineWidth + 20, lineHeight);
        
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(line, w/2, y);
        y += lineHeight;
      });
    }

    ctx.restore();
  };

  // --- Normal DOM Rendering ---
  useEffect(() => {
    if (isPlaying && currentScene && !isExporting) {
      playSceneAudio(currentScene);
    } else if (!isPlaying && !isExporting) {
      if (voiceSourceRef.current) {
        try { voiceSourceRef.current.stop(); } catch(e) {}
        voiceSourceRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSceneIndex]);


  // --- Render DOM ---
  const effectClass = isPlaying && currentScene?.imageUrl ? `effect-${currentScene.effect}` : '';

  // Helper to render DOM text
  const renderDOMText = (text: string) => {
    if (!isKineticMode) return text.replace(/\*/g, ''); // Clean text for subtitle
    
    // Kinetic parsing for shorts
    const parts = text.split(/(\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <span key={i} className="highlight-word mx-1 inline-block transform hover:scale-110 transition-transform">
            {part.slice(1, -1).toUpperCase()}
          </span>
        );
      }
      return <span key={i} className="mx-0.5">{part}</span>;
    });
  };

  if (!currentScene) return <div className="text-white">Loading...</div>;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Hidden Canvas for Export */}
      <canvas 
        ref={canvasRef} 
        width={format === 'portrait' ? 1080 : 1920} 
        height={format === 'portrait' ? 1920 : 1080} 
        className="hidden"
      />

      {/* Viewport */}
      <div className={`relative w-full bg-[#0a192f] rounded-xl overflow-hidden shadow-2xl border border-gray-800 group ${format === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'}`}>
        
        {/* Exporting Overlay */}
        {isExporting && (
          <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center text-white">
             <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
             <h3 className="text-2xl font-bold">Rendering Video...</h3>
             <p className="text-gray-400">Recording Scene {currentSceneIndex + 1} of {scenes.length}</p>
             <p className="text-xs text-gray-500 mt-2">Please do not close this tab.</p>
          </div>
        )}

        <div className="film-grain"></div>

        {/* Image Layer */}
        {currentScene.imageUrl ? (
          <div key={currentSceneIndex} className={`w-full h-full overflow-hidden`}>
            <img
              src={currentScene.imageUrl}
              alt="Scene"
              className={`w-full h-full object-cover ${effectClass}`}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a192f] text-gray-500 gap-2">
             {currentScene.isGeneratingImage ? <Loader2 className="animate-spin w-8 h-8 text-blue-500" /> : null}
             <span className="text-xs uppercase tracking-widest">{currentScene.isGeneratingImage ? "Rendering Asset..." : "Waiting..."}</span>
          </div>
        )}

        {/* Text Overlay Layer */}
        <div className="absolute inset-0 pointer-events-none">
            {isKineticMode ? (
              /* KINETIC: Short Form + Portrait ONLY */
              <div className="flex items-center justify-center w-full h-full p-8">
                <div className="text-center max-w-full">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter leading-tight text-white text-shadow-strong drop-shadow-2xl">
                    {renderDOMText(currentScene.text)}
                  </h1>
                </div>
              </div>
            ) : (
              /* SUBTITLE: Long Form or Landscape */
              <div className="flex items-end justify-center w-full h-full pb-12 px-8">
                 <div className="bg-black/70 backdrop-blur-sm px-6 py-4 rounded-lg max-w-4xl text-center shadow-lg border border-white/5">
                    <p className="text-lg md:text-xl font-bold text-white leading-relaxed drop-shadow-md">
                       {renderDOMText(currentScene.text)}
                    </p>
                 </div>
              </div>
            )}
        </div>

        {/* Controls Overlay */}
        {!isExporting && (
          <>
            <div className={`absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300`}>
               <button 
                 onClick={togglePlay}
                 className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-6 rounded-full text-white transition-all transform hover:scale-110 shadow-xl border border-white/10"
               >
                 {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
               </button>
            </div>
            
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute top-4 right-4 bg-black/40 p-2 rounded-full text-white/80 hover:text-white transition-colors z-50"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </>
        )}
      </div>

      {/* Timeline Controls */}
      <div className="flex items-center justify-between bg-[#112240] p-4 rounded-xl border border-[#233554]">
         <div className="flex items-center gap-4">
            <button onClick={handlePrev} disabled={currentSceneIndex === 0 || isExporting} className="text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>
            <span className="text-sm font-mono text-blue-300">
              SHOT {String(currentSceneIndex + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}
            </span>
            <button onClick={() => handleNext()} disabled={currentSceneIndex === scenes.length - 1 || isExporting} className="text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>
         </div>
         
         <div className="flex items-center gap-3">
           {isExporting ? (
             <span className="text-xs font-bold text-red-400 animate-pulse flex items-center gap-2">
               <div className="w-2 h-2 bg-red-500 rounded-full"></div> REC
             </span>
           ) : (
             <>
              {currentScene.isGeneratingAudio && (
                 <span className="text-[10px] text-blue-400 flex items-center gap-1 uppercase tracking-wider">
                   <Loader2 className="w-3 h-3 animate-spin" /> Synthesis
                 </span>
               )}
               <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-500'}`}></div>
               <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                 {isPlaying ? 'Live' : 'Standby'}
               </span>
             </>
           )}
         </div>
      </div>
    </div>
  );
};

export default Player;