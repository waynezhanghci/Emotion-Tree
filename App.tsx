import React, { useEffect, useRef, useState } from "react";
import SketchContainer from "./components/SketchContainer";
import { initializeVision, analyzeFrame } from "./services/visionService";
import { TreeState } from "./types";

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

  // Debug state for UI feedback
  const [debugInfo, setDebugInfo] = useState({ mood: 0, wind: 0 });

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

        // Throttle UI updates to avoid react lag
        if (Math.random() > 0.92) {
            setDebugInfo({ mood: moodScore, wind: movementScore });
        }
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
      {!permissionError && <SketchContainer treeStateRef={treeStateRef} />}

      {/* Foreground UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-pink-200 opacity-90 drop-shadow-lg">
              Emotion Tree
            </h1>
            <p className="text-sm text-gray-400 mt-2 max-w-md">
              Smile to bloom. Frown to wither. Wave for wind.
            </p>
          </div>
          
          {/* Debug / Status Indicator */}
          <div className="bg-black/40 backdrop-blur-md rounded-lg p-3 text-xs border border-white/10">
            <div className="mb-1 flex items-center gap-2">
              <span className="w-16">Mood:</span>
              <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${debugInfo.mood > 0 ? 'bg-green-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.abs(debugInfo.mood) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16">Wind:</span>
              <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-400 transition-all duration-100"
                  style={{ width: `${Math.abs(debugInfo.wind) * 100}%` }}
                />
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

        {/* Hidden Video Element for MediaPipe */}
        <div className="absolute bottom-4 right-4 pointer-events-auto">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-32 h-24 object-cover rounded-lg border border-white/20 opacity-50 hover:opacity-100 transition-opacity"
              style={{ transform: "scaleX(-1)" }} 
            />
            <p className="text-[10px] text-center mt-1 text-gray-500">Camera Feed</p>
        </div>
      </div>
    </div>
  );
};

export default App;