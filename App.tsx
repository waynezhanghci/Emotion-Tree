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
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLooping = useRef(false);
  
  // We use a ref for the state to pass it to p5 without re-rendering the React component constantly
  const treeStateRef = useRef<TreeState>({
    mood: 0,
    windForce: 0,
  });

  // Daily Statistics State
  const [stats, setStats] = useState<StatsState>({ blooms: 0, date: "" });

  // Load and initialize stats
  useEffect(() => {
    const today = new Date().toLocaleDateString();
    try {
      const stored = localStorage.getItem('emotionTreeStats');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === today) {
          // Keep existing data, ensuring we only care about blooms now
          setStats({ blooms: data.blooms || 0, date: data.date });
        } else {
          // Reset for new day
          const newStats = { blooms: 0, date: today };
          setStats(newStats);
          localStorage.setItem('emotionTreeStats', JSON.stringify(newStats));
        }
      } else {
        // Initialize new
        const newStats = { blooms: 0, date: today };
        setStats(newStats);
        localStorage.setItem('emotionTreeStats', JSON.stringify(newStats));
      }
    } catch (e) {
      console.warn("LocalStorage error", e);
      setStats({ blooms: 0, date: today });
    }
  }, []);

  // Callback from p5.js when a significant event occurs
  const handleTreeEvent = useCallback((event: TreeEventType) => {
    if (event !== 'bloom') return;

    setStats((prev) => {
      const next = { ...prev };
      // Ensure date is current on update
      next.date = new Date().toLocaleDateString(); 
      next.blooms += 1;
      
      localStorage.setItem('emotionTreeStats', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const startApp = async () => {
      try {
        await initializeVision();
        
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Explicitly play video to ensure frames are served
          await videoRef.current.play();
          
          // Robustly handle video loading
          const handleLoadedData = () => {
             if (isLooping.current) return;
             isLooping.current = true;
             setIsLoading(false);
             predictLoop();
          };

          // If video is already ready (race condition), trigger immediately
          if (videoRef.current.readyState >= 2) { 
             handleLoadedData();
          } else {
             videoRef.current.addEventListener("loadeddata", handleLoadedData);
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
        setPermissionError(true);
        setIsLoading(false);
      }
    };

    const predictLoop = () => {
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        const { moodScore, movementScore } = analyzeFrame(videoRef.current);
        
        treeStateRef.current = {
          mood: moodScore,
          windForce: movementScore,
        };
      }
      animationFrameId = requestAnimationFrame(predictLoop);
    };

    startApp();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      isLooping.current = false;
      
      // Cleanup: Stop all tracks to release camera
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
         const videoStream = videoRef.current.srcObject as MediaStream;
         videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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

        {/* Loading / Error States */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-xl">Initializing AI Models...</p>
              <p className="text-sm text-gray-500 mt-2">Please allow camera access</p>
            </div>
          </div>
        )}

        {permissionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
            <div className="text-center max-w-lg p-6 border border-red-500/50 bg-red-900/20 rounded-xl">
              <h2 className="text-2xl text-red-400 mb-2">Camera Access Required</h2>
              <p className="text-gray-300">
                This experience requires your camera to detect expressions and gestures. 
                Please enable camera permissions and reload the page.
              </p>
            </div>
          </div>
        )}

        {/* Hidden Video Element for MediaPipe Logic - Removed from UI */}
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