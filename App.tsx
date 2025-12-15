import React, { useEffect, useRef, useState, useCallback } from "react";
import SketchContainer from "./components/SketchContainer";
import { initializeVision, analyzeFrame } from "./services/visionService";
import { TreeState } from "./types";
import { TreeEventType } from "./services/treeSketch";

interface StatsState {
  blooms: number;
  date: string;
}

const App: React.FC = () => {
  // App States
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isLooping = useRef(false);
  const requestRef = useRef<number>(0);
  
  // Tree State Ref
  const treeStateRef = useRef<TreeState>({
    mood: 0,
    windForce: 0,
  });

  // Daily Statistics State
  const [stats, setStats] = useState<StatsState>({ blooms: 0, date: "" });

  // 1. Initialize Stats
  useEffect(() => {
    const today = new Date().toLocaleDateString();
    try {
      const stored = localStorage.getItem('emotionTreeStats');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === today) {
          setStats({ blooms: data.blooms || 0, date: data.date });
        } else {
          const newStats = { blooms: 0, date: today };
          setStats(newStats);
          localStorage.setItem('emotionTreeStats', JSON.stringify(newStats));
        }
      } else {
        const newStats = { blooms: 0, date: today };
        setStats(newStats);
        localStorage.setItem('emotionTreeStats', JSON.stringify(newStats));
      }
    } catch (e) {
      console.warn("LocalStorage error", e);
      setStats({ blooms: 0, date: today });
    }
  }, []);

  // 2. Initialize AI Models on Mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        await initializeVision();
        setModelsLoaded(true);
      } catch (err) {
        console.error("Model load error:", err);
      }
    };
    loadModels();
  }, []);

  // 3. Cleanup on Unmount
  useEffect(() => {
    return () => {
      isLooping.current = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Callback from p5.js
  const handleTreeEvent = useCallback((event: TreeEventType) => {
    if (event !== 'bloom') return;

    setStats((prev) => {
      const next = { ...prev };
      next.date = new Date().toLocaleDateString(); 
      next.blooms += 1;
      localStorage.setItem('emotionTreeStats', JSON.stringify(next));
      return next;
    });
  }, []);

  // 4. Start Camera Logic (Request permission -> Store Stream -> Render App)
  const handleStartExperience = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      
      streamRef.current = stream;
      // Trigger render of the main app view which contains the <video> element
      setHasStarted(true); 
    } catch (err) {
      console.error("Camera permission error:", err);
      setPermissionError(true);
      setHasStarted(true); // Show error state in main UI
    }
  };

  // 5. Initialize Video and Loop AFTER mount of main view
  useEffect(() => {
    const initVideo = async () => {
      if (hasStarted && streamRef.current && videoRef.current && !isLooping.current) {
        videoRef.current.srcObject = streamRef.current;
        try {
          await videoRef.current.play();
          isLooping.current = true;
          predictLoop();
        } catch (e) {
          console.error("Video play error:", e);
        }
      }
    };
    
    initVideo();
  }, [hasStarted]);

  const predictLoop = () => {
    if (!isLooping.current) return;
    
    if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
      const { moodScore, movementScore } = analyzeFrame(videoRef.current);
      treeStateRef.current = {
        mood: moodScore,
        windForce: movementScore,
      };
    }
    requestRef.current = requestAnimationFrame(predictLoop);
  };

  // --- Render Helpers ---

  // Landing / Start Screen
  if (!hasStarted) {
    return (
      <div className="relative w-full h-screen overflow-hidden font-sans flex items-center justify-center">
        {/* Background Gradient matching reference */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111425] via-[#2a2d55] to-[#d8a895] z-0"></div>

        {/* Ambient Glow */}
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-400/20 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute top-[10%] right-[20%] w-2 h-2 bg-white/40 rounded-full blur-[1px]"></div>

        {/* Glassmorphism Card */}
        <div className="relative z-10 w-full max-w-md mx-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center text-center">
          
          {/* Glowing Orb/Sun Graphic */}
          <div className="mb-6 relative">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-200 to-indigo-300 rounded-full blur-sm opacity-90 mx-auto"></div>
            <div className="absolute inset-0 bg-white/30 rounded-full blur-xl animate-pulse"></div>
          </div>

          <h1 className="text-3xl md:text-4xl font-serif text-white mb-2 tracking-wide drop-shadow-md">
            Emotion Tree
          </h1>
          
          <p className="text-blue-100/80 text-sm mb-6 font-light">
            An interactive generative art experience.
          </p>

          <div className="space-y-2 text-white/90 text-sm font-light mb-8 leading-relaxed">
            <p>Use your <span className="font-semibold text-blue-200">smile</span> to bloom.</p>
            <p>Use your <span className="font-semibold text-blue-200">frown</span> to wither.</p>
            <p>Use your <span className="font-semibold text-blue-200">hand</span> to wave.</p>
          </div>

          {/* Icons Row */}
          <div className="flex items-center justify-center gap-8 mb-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 text-white/80">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <span className="text-[10px] text-white/60 uppercase tracking-wider">Face Tracking</span>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex flex-col items-center gap-2">
               <div className="w-6 h-6 text-white/80">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                </svg>
              </div>
              <span className="text-[10px] text-white/60 uppercase tracking-wider">Camera Access</span>
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartExperience}
            disabled={!modelsLoaded}
            className={`
              group relative overflow-hidden rounded-full px-8 py-3 w-full max-w-[240px] flex items-center justify-center gap-2 transition-all duration-300
              ${modelsLoaded 
                ? "bg-white text-[#2a2d55] hover:bg-blue-50 active:scale-95 shadow-lg shadow-blue-900/20 cursor-pointer" 
                : "bg-white/20 text-white/50 cursor-not-allowed"}
            `}
          >
            <span className="font-medium tracking-wide">
              {modelsLoaded ? "Start Experience" : "Loading Models..."}
            </span>
            {modelsLoaded && (
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Main App Interface
  return (
    <div className="relative w-full h-screen overflow-hidden bg-zinc-900 text-white font-sans">
      {/* Background P5 Sketch */}
      {!permissionError && (
        <SketchContainer 
          treeStateRef={treeStateRef} 
          onTreeEvent={handleTreeEvent}
        />
      )}

      {/* Foreground UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-pink-200 opacity-90 drop-shadow-lg">
              Emotion Tree
            </h1>
            <div className="text-sm text-gray-400 mt-2 flex flex-col gap-1">
              <p>Smile to bloom</p>
              <p>Frown to wither</p>
              <p>Wave for wind</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 items-end">
            {/* Daily Stats Module */}
            <div className="bg-black/40 backdrop-blur-md rounded-lg p-3 border border-white/10 w-32">
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1 text-center">
                Today
              </div>
              <div className="text-center">
                <div>
                  <div className="text-3xl font-bold text-pink-300 drop-shadow">{stats.blooms}</div>
                  <div className="text-[10px] text-pink-200/70">Blooms 🌸</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {permissionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 pointer-events-auto">
            <div className="text-center max-w-lg p-6 border border-red-500/50 bg-red-900/20 rounded-xl">
              <h2 className="text-2xl text-red-400 mb-2">Camera Access Required</h2>
              <p className="text-gray-300 mb-4">
                This experience requires your camera to detect expressions and gestures. 
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 rounded-lg transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        )}

        {/* Hidden Video Element for MediaPipe Logic */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute opacity-0 pointer-events-none"
          style={{ width: 1, height: 1, top: 0, left: 0, zIndex: -1 }}
        />
      </div>
    </div>
  );
};

export default App;