export interface TreeState {
  // -1 (Sad/Wither) to 1 (Happy/Thrive). 0 is dormant.
  mood: number; 
  // 0 to 1, intensity of wind based on hand waving
  windForce: number;
}

export interface VisionData {
  moodScore: number; // Normalized -1 to 1
  movementScore: number; // 0 to 1
}
