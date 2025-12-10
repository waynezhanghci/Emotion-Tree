import {
  FilesetResolver,
  FaceLandmarker,
  GestureRecognizer,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm";

import { VisionData } from "../types";

let faceLandmarker: FaceLandmarker | null = null;
let gestureRecognizer: GestureRecognizer | null = null;
let lastVideoTime = -1;
let lastHandX = 0;

// Singleton promise to prevent double initialization in React Strict Mode
let initializationPromise: Promise<void> | null = null;

export const initializeVision = (): Promise<void> => {
  // If already initializing or initialized, return the existing promise
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );

      // Initialize Face Landmarker
      // Removed delegate: "GPU" to prevent fallback errors and hangs on incompatible devices.
      // Defaulting to CPU/WASM is more stable for this version.
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });

      // Initialize Gesture Recognizer
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
    } catch (error) {
      console.error("Failed to initialize vision models:", error);
      // Reset promise so retry is possible
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
};

export const analyzeFrame = (video: HTMLVideoElement): VisionData => {
  // Safety check: Ensure models are loaded and video has valid dimensions
  if (
    !faceLandmarker || 
    !gestureRecognizer || 
    video.currentTime === lastVideoTime ||
    video.videoWidth === 0 || 
    video.videoHeight === 0
  ) {
    return { moodScore: 0, movementScore: 0 };
  }

  lastVideoTime = video.currentTime;
  let moodScore = 0;
  let movementScore = 0;

  // 1. Face Analysis
  try {
    const faceResult = faceLandmarker.detectForVideo(video, performance.now());
    
    if (
      faceResult.faceBlendshapes &&
      faceResult.faceBlendshapes.length > 0 &&
      faceResult.faceBlendshapes[0].categories
    ) {
      const shapes = faceResult.faceBlendshapes[0].categories;
      
      // Extract smile and frown probabilities
      const smileLeft = shapes.find((s) => s.categoryName === "mouthSmileLeft")?.score || 0;
      const smileRight = shapes.find((s) => s.categoryName === "mouthSmileRight")?.score || 0;
      const frownLeft = shapes.find((s) => s.categoryName === "mouthFrownLeft")?.score || 0;
      const frownRight = shapes.find((s) => s.categoryName === "mouthFrownRight")?.score || 0;

      const smileAvg = (smileLeft + smileRight) / 2;
      const frownAvg = (frownLeft + frownRight) / 2;

      // ULTRA HIGH SENSITIVITY
      const THRESHOLD = 0.005; 
      
      if (smileAvg > THRESHOLD) {
        moodScore = Math.min((smileAvg - THRESHOLD) * 40.0, 1);
      } else if (frownAvg > THRESHOLD) {
        moodScore = -Math.min((frownAvg - THRESHOLD) * 40.0, 1);
      } else {
        moodScore = 0;
      }
    }
  } catch (e) {
    console.warn("Face detection error:", e);
  }

  // 2. Hand/Gesture Analysis (Waving)
  try {
    const gestureResult = gestureRecognizer.recognizeForVideo(video, performance.now());
    
    if (gestureResult.landmarks && gestureResult.landmarks.length > 0) {
      const wrist = gestureResult.landmarks[0][0];
      const currentX = wrist.x;
      
      // Calculate signed delta X for directional wind
      const deltaX = currentX - lastHandX;
      const speed = Math.abs(deltaX);

      // Lower threshold for movement detection
      if (speed > 0.0005) {
         // Massive multiplier for instant wind reaction
         movementScore = Math.max(-1, Math.min(deltaX * 150, 1));
      }
      
      lastHandX = currentX;
    } else {
      movementScore = 0;
    }
  } catch (e) {
    console.warn("Gesture detection error:", e);
  }

  return { moodScore, movementScore };
};