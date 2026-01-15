import React, { useEffect, useRef, useState, useCallback } from "react";
import SketchContainer from "./components/SketchContainer";
import { initializeVision, analyzeFrame } from "./services/visionService";
import { TreeState, FlowerStyle } from "./types";
import { TreeEventType } from "./services/treeSketch";

interface StatsState {
  blooms: number;
  date: string;
}

// Minimalist Flower Icon Component
const FlowerIcon = ({ style, isSelected }: { style: FlowerStyle, isSelected: boolean }) => {
  const baseClass = "w-8 h-8 transition-all duration-300";
  // Active state is brighter (pink-400), glowing, and fully opaque. Inactive is dimmed (white/30).
  const stateClass = isSelected 
    ? "text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)] scale-110 opacity-100" 
    : "text-white/30 hover:text-white/60 hover:scale-105 opacity-70";

  return (
    <div className={`${baseClass} ${stateClass}`} title={style.charAt(0).toUpperCase() + style.slice(1)}>
      <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
        <g transform="translate(50,50)">
          {style === 'peach' && (
            // Peach: 5 Round petals
            [0, 72, 144, 216, 288].map(r => (
               <ellipse key={r} cx="0" cy="-25" rx="16" ry="20" transform={`rotate(${r})`} />
            ))
          )}
          {style === 'sakura' && (
            // Sakura: 5 Pointed petals (Star-like shape) to match reference
             [0, 72, 144, 216, 288].map(r => (
               <path key={r} d="M0 0 Q -20 -25 0 -45 Q 20 -25 0 0" transform={`rotate(${r})`} />
            ))
          )}
          {style === 'delonix' && (
            // Delonix: 5 Spoon/Matchstick shapes (thin stem, round head) to match reference
            [0, 72, 144, 216, 288].map(r => (
               <path key={r} d="M0 0 L -1.5 -26 A 6 8 0 1 1 1.5 -26 L 0 0" transform={`rotate(${r})`} />
            ))
          )}
          {/* Center dot for all */}
          <circle cx="0" cy="0" r="8" fill="currentColor" className="opacity-50" />
        </g>
      </svg>
    </div>
  );
};

// Extract SearchBar to be reusable in both views
const SearchBar = () => (
  <form 
    action="https://www.google.com/search" 
    method="get" 
    className="w-full relative group pointer-events-auto"
  >
    {/* Input */}
    <input
      type="text"
      name="q"
      placeholder="Search Google..."
      autoComplete="off"
      className="w-full bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 rounded-full py-3 px-6 pl-12 text-white placeholder-white/40 outline-none focus:bg-white/10 focus:border-white/30 focus:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all shadow-lg text-base"
    />
    {/* Icon */}
    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
      <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  </form>
);

const App: React.FC = () => {
  // App States
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [flowerStyle, setFlowerStyle] = useState<FlowerStyle>('peach');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
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

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
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

  // Landing / Start Screen (New Tab Mode - Minimalist)
  if (!hasStarted) {
    return (
      <div className="relative w-full h-screen overflow-hidden font-sans flex flex-col items-center justify-center">
        {/* Background Gradient matching reference */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111425] via-[#2a2d55] to-[#d8a895] z-0"></div>

        {/* Ambient Glow */}
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-400/20 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute top-[10%] right-[20%] w-2 h-2 bg-white/40 rounded-full blur-[1px]"></div>

        {/* 1. Google Search Bar (Prominent but integrated) */}
        <div className="relative z-20 w-full max-w-xl px-4 mb-16">
           <SearchBar />
        </div>

        {/* 2. Minimalist Centerpiece */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 animate-[fadeIn_1s_ease-out]">
          
          {/* Mini Tree Graphic (SVG) */}
          <div className="relative group cursor-pointer" onClick={handleStartExperience}>
            {/* Glow behind tree */}
            <div className="absolute inset-0 bg-pink-400/20 blur-xl rounded-full scale-75 group-hover:scale-110 transition-transform duration-700"></div>
            
            <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg transition-transform duration-500 group-hover:-translate-y-1">
              {/* Trunk */}
              <path d="M50 90C50 90 50 70 50 60C50 50 40 40 30 35" stroke="#8D6E63" strokeWidth="3" strokeLinecap="round" />
              <path d="M50 60C50 50 60 40 70 30" stroke="#8D6E63" strokeWidth="3" strokeLinecap="round" />
              <path d="M50 60C50 45 45 30 50 20" stroke="#8D6E63" strokeWidth="2.5" strokeLinecap="round" />
              
              {/* Blossoms - Animated pulse */}
              <g className="animate-pulse">
                <circle cx="30" cy="35" r="5" fill="#F48FB1" fillOpacity="0.9" />
                <circle cx="70" cy="30" r="4.5" fill="#F48FB1" fillOpacity="0.8" />
                <circle cx="50" cy="20" r="6" fill="#F8BBD0" fillOpacity="0.95" />
                <circle cx="40" cy="45" r="3" fill="#F06292" fillOpacity="0.7" />
                <circle cx="60" cy="40" r="3.5" fill="#F06292" fillOpacity="0.7" />
                <circle cx="45" cy="28" r="4" fill="#F8BBD0" fillOpacity="0.8" />
              </g>
            </svg>
          </div>

          {/* Lightweight Button with Breathing Animation */}
          <button
            onClick={handleStartExperience}
            disabled={!modelsLoaded}
            className={`
              text-sm font-medium tracking-widest uppercase px-6 py-2 rounded-full border border-white/20 
              transition-all duration-300 backdrop-blur-sm
              ${modelsLoaded 
                ? "text-pink-100 hover:bg-white/10 hover:border-pink-200/50 hover:text-white hover:shadow-[0_0_15px_rgba(244,143,177,0.3)] animate-breathe" 
                : "text-white/30 border-white/5 cursor-not-allowed"}
            `}
          >
            {modelsLoaded ? "Smile Everyday" : "Loading..."}
          </button>
        </div>
      </div>
    );
  }

  // Main App Interface
  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans bg-gradient-to-b from-[#111425] via-[#2a2d55] to-[#d8a895]">
      {/* Background P5 Sketch */}
      {!permissionError && (
        <SketchContainer 
          treeStateRef={treeStateRef} 
          onTreeEvent={handleTreeEvent}
          flowerStyle={flowerStyle}
        />
      )}

      {/* Foreground UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
        
        {/* Persistent Search Bar for "New Tab" functionality */}
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-50 transition-opacity duration-500 hover:opacity-100 opacity-0 md:opacity-100">
           <SearchBar />
        </div>
        
        {/* Header and Controls */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-4 pointer-events-auto">
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

            {/* Minimalist Flower Style Selector Icons */}
            <div className="flex gap-4 mt-2">
              <button
                onClick={() => setFlowerStyle('peach')}
                className="outline-none focus:scale-110 transition-transform"
                aria-label="Select Peach"
              >
                <FlowerIcon style="peach" isSelected={flowerStyle === 'peach'} />
              </button>
              <button
                onClick={() => setFlowerStyle('sakura')}
                className="outline-none focus:scale-110 transition-transform"
                aria-label="Select Sakura"
              >
                <FlowerIcon style="sakura" isSelected={flowerStyle === 'sakura'} />
              </button>
              <button
                onClick={() => setFlowerStyle('delonix')}
                className="outline-none focus:scale-110 transition-transform"
                aria-label="Select Delonix"
              >
                <FlowerIcon style="delonix" isSelected={flowerStyle === 'delonix'} />
              </button>
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

            <div className="flex gap-2">
                {/* Fullscreen Toggle (New: Makes Web Version feel like Extension) */}
                <button
                  onClick={toggleFullscreen}
                  className="pointer-events-auto bg-black/40 backdrop-blur-md hover:bg-white/10 text-white/60 hover:text-white p-2 rounded-full transition-all border border-white/10"
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
                
                {/* Return to Home/Close Button */}
                <button 
                  onClick={() => {
                    isLooping.current = false;
                    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
                    setHasStarted(false);
                  }}
                  className="pointer-events-auto bg-black/40 backdrop-blur-md hover:bg-white/10 text-white/60 hover:text-white p-2 rounded-full transition-all border border-white/10"
                  title="Return to Start"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
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