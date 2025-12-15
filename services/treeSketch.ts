import p5 from "p5";
import { TreeState } from "../types";

export type TreeEventType = 'bloom' | 'wither';

export const createSketch = (
  getTreeState: () => TreeState,
  onTreeEvent?: (event: TreeEventType) => void
) => (p: p5) => {
  let currentMood = 0; // smoothed mood
  let currentWind = 0; // smoothed wind (signed)
  
  // State tracking for event triggers (Hysteresis)
  let wasBlooming = false;
  let wasWithering = false;
  
  // Particle system for falling leaves/flowers
  interface Particle {
    pos: p5.Vector;
    vel: p5.Vector;
    acc: p5.Vector;
    color: p5.Color;
    size: number;
    life: number;
    isDead: boolean;
    
    // Rotation Z (spinning like a wheel on 2D plane)
    angle: number;
    angleVel: number;

    // Rotation X (tumbling/flipping in 3D space)
    flip: number;
    flipSpeed: number;

    // Aerodynamic sway (fluttering side to side)
    swayPhase: number;
    swayFreq: number;
    swayAmp: number;
  }

  // Baked Tree Structure Interface
  interface Branch {
    len: number;
    thick: number;
    depth: number;
    angleOffset: number; // Angle relative to parent
    children: Branch[];
    
    // Pre-calculated visual properties
    noiseThreshold: number; // Threshold for leaf visibility (0-1)
    hasFlower: boolean;
    lenMult: number; // Length multiplier
  }
  
  let particles: Particle[] = [];
  let rootBranch: Branch | null = null;
  
  // Configuration
  const MAX_DEPTH = 9;
  
  // Palette variables (initialized in setup)
  let COL_TRUNK_DORMANT: p5.Color;
  let COL_TRUNK_THRIVE: p5.Color;
  let COL_LEAF_TENDER: p5.Color;
  let COL_FLOWER_PINK: p5.Color;
  let COL_LEAF_DEAD: p5.Color;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.frameRate(30); 
    
    // Peach Tree Palette
    COL_TRUNK_DORMANT = p.color(35, 30, 30); // Dark Charcoal/Brown
    COL_TRUNK_THRIVE = p.color(100, 70, 50); // Warm Brown
    COL_LEAF_TENDER = p.color(120, 210, 100, 230); // Bright Tender Green
    COL_FLOWER_PINK = p.color(255, 140, 170, 240); // Peach Blossom Pink
    COL_LEAF_DEAD = p.color(100, 85, 70, 255); // Brown/Grey Dead Leaf
    
    // Generate the static tree skeleton ONCE
    buildTreeSkeleton();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    // Rebuild tree on resize to adjust proportions if needed
    buildTreeSkeleton();
  };

  const buildTreeSkeleton = () => {
    const isMobile = p.width < 600;
    const trunkLenRatio = isMobile ? 0.22 : 0.26;
    const trunkLen = p.height * trunkLenRatio;
    const trunkThick = p.width < 600 ? 18 : 28;

    // Recursive builder
    const createBranch = (depth: number): Branch => {
      const branch: Branch = {
        len: 0, // Assigned below based on parent
        thick: 0,
        depth,
        angleOffset: 0,
        children: [],
        noiseThreshold: p.random(0.05, 0.95), // Distributed threshold for gradual bloom
        hasFlower: p.random(1) > 0.5, // 50% chance of flower on tips
        lenMult: 0.72 + p.random(-0.08, 0.08)
      };

      if (depth < MAX_DEPTH) {
        const numBranches = 2;
        // Slightly wider angle for a sprawling peach tree look
        const baseAngle = p.PI / 5.0; 
        
        for (let i = 0; i < numBranches; i++) {
          const child = createBranch(depth + 1);
          // Calculate structure here
          let angle = p.map(i, 0, numBranches - 1, -baseAngle, baseAngle);
          angle += p.random(-0.15, 0.15); // Organic variation
          child.angleOffset = angle;
          child.thick = 0; 
          branch.children.push(child);
        }
      }
      return branch;
    };

    rootBranch = createBranch(0);
    // Set root specifics
    rootBranch.len = trunkLen;
    rootBranch.thick = trunkThick;
  };

  p.draw = () => {
    // 1. Get State & Smooth Transitions
    const state = getTreeState();
    
    // Faster mood smoothing for responsiveness
    currentMood = p.lerp(currentMood, state.mood, 0.1);
    
    // Wind Smoothing
    const targetWind = state.windForce;
    currentWind = p.lerp(currentWind, targetWind, 0.12);

    // --- Event Logic (Hysteresis) ---
    // Bloom Event: Trigger when mood > 0.6, Reset when mood < 0.2
    if (!wasBlooming && currentMood > 0.6) {
        wasBlooming = true;
        if (onTreeEvent) onTreeEvent('bloom');
    } else if (wasBlooming && currentMood < 0.2) {
        wasBlooming = false;
    }

    // Wither Event: Trigger when mood < -0.6, Reset when mood > -0.2
    if (!wasWithering && currentMood < -0.6) {
        wasWithering = true;
        if (onTreeEvent) onTreeEvent('wither');
    } else if (wasWithering && currentMood > -0.2) {
        wasWithering = false;
    }
    // --------------------------------

    // 2. Background
    let bgCol;
    if (currentMood > 0) {
        // Happy: Warm dark grey, slight light
        bgCol = p.lerpColor(p.color(20, 20, 22), p.color(45, 40, 35), currentMood * 0.6);
    } else {
        // Sad: Cold dark grey, dimming further
        bgCol = p.lerpColor(p.color(20, 20, 22), p.color(5, 5, 8), Math.abs(currentMood));
    }
    p.background(bgCol);

    // 3. Wind Physics
    const time = p.millis() * 0.001;
    const noiseSway = p.map(p.noise(time * 0.6), 0, 1, -0.04, 0.04);
    const windSign = currentWind < 0 ? -1 : 1;
    // Power function for wind feel
    const effectiveWind = windSign * Math.pow(Math.abs(currentWind), 1.4);
    // Base sway + Wind sway
    const activeSway = Math.sin(time * 2.5) * (effectiveWind * 0.1) + (effectiveWind * 0.3);
    const totalWindAngle = noiseSway + activeSway;

    // 4. Draw Tree
    if (rootBranch) {
      p.push();
      p.translate(p.width / 2, p.height); 
      
      // Calculate globals for manual coordinate tracking
      const startX = p.width / 2;
      const startY = p.height;
      
      renderBranch(rootBranch, rootBranch.len, rootBranch.thick, totalWindAngle, startX, startY, 0);
      p.pop();
    }

    // 5. Particles
    updateParticles(currentWind);
  };

  const renderBranch = (
    branch: Branch,
    len: number, 
    thick: number, 
    windAngle: number,
    x: number, 
    y: number, 
    cumAngle: number
  ) => {
    // Calculate factors
    const bloomFactor = p.map(currentMood, 0, 1, 0, 1, true); 
    // Wither Factor: 0 when neutral/happy, up to 1 when very sad (-1)
    const witherFactor = p.map(currentMood, -0.2, -1, 0, 1, true); 

    // Trunk Color
    let branchCol = p.lerpColor(COL_TRUNK_DORMANT, COL_TRUNK_THRIVE, bloomFactor);
    if (witherFactor > 0) {
        // Darken and desaturate when withering
        branchCol = p.lerpColor(branchCol, p.color(20, 18, 16), witherFactor * 0.7);
    }

    p.stroke(branchCol);
    p.strokeWeight(thick);
    p.strokeCap(p.ROUND);
    
    // Draw line
    p.line(0, 0, 0, -len);
    
    // Calculate global tip position
    const tipX = x + Math.sin(cumAngle) * len;
    const tipY = y - Math.cos(cumAngle) * len;

    // Move to tip
    p.translate(0, -len);

    // Foliage & Particles
    // Only draw foliage on the outer 40% of the tree depth
    if (branch.depth > MAX_DEPTH - 4) {
      
      // 1. Attached Foliage Visibility
      // Using pre-baked threshold: Leaves appear sequentially as bloomFactor increases
      const isAttached = bloomFactor > branch.noiseThreshold;

      if (isAttached) {
         drawAttachedFoliage(windAngle, branch.hasFlower, bloomFactor);
      }

      // 2. Falling Particles
      const time = p.millis();
      const spawnNoise = p.noise(tipX * 0.1, tipY * 0.1, time * 0.008);
      
      // Sad Mode (Dead Leaves) - "Quickly fall off"
      // Rate increases significantly with witherFactor
      if (witherFactor > 0.05) {
         // High probability of spawn to simulate "shedding"
         // If witherFactor is 1.0 (very sad), we spawn very aggressively
         if (spawnNoise > 0.3 && (spawnNoise * 100) % 1.0 < (witherFactor * 0.35)) {
             spawnFallingParticle(tipX, tipY, true);
         }
      }

      // Happy Mode (Live Leaves/Petals) - "Occasional float"
      if (bloomFactor > 0.5) {
          // Rare gentle fall
          if ((spawnNoise * 100) % 1.0 < 0.005) {
              spawnFallingParticle(tipX, tipY, false);
          }
      }
    }

    if (branch.depth >= MAX_DEPTH || len < 4) return;

    // Flexibility for wind - tips bend more
    const flexibility = p.map(branch.depth, 0, MAX_DEPTH, 0.05, 1.3);
    const localWind = windAngle * flexibility;

    for (const child of branch.children) {
      p.push();
      // Apply rotation
      const nextAngle = child.angleOffset + localWind;
      p.rotate(nextAngle);
      
      renderBranch(
        child,
        len * child.lenMult, 
        thick * 0.7, 
        windAngle, 
        tipX, 
        tipY, 
        cumAngle + nextAngle
      );
      p.pop();
    }
  };

  const drawAttachedFoliage = (windAngle: number, hasFlower: boolean, bloomFactor: number) => {
    p.noStroke();
    const breathe = 1 + Math.sin(p.millis() * 0.004) * 0.08;
    // Foliage sways MORE than branches (3x)
    const foliageSway = windAngle * 3.0;
    
    // Size scales slightly with bloomFactor for the "growing" feel on appear
    const growthScale = p.constrain(bloomFactor * 1.5, 0.5, 1);
    const leafSize = 11 * breathe * growthScale; 
    
    // Draw Leaf Pair
    p.push();
    p.rotate(p.PI / 4 + foliageSway); 
    p.fill(COL_LEAF_TENDER);
    p.ellipse(0, 0, leafSize, leafSize * 0.5);
    p.pop();
    
    p.push();
    p.rotate(-p.PI / 4 + foliageSway);
    p.fill(COL_LEAF_TENDER);
    p.ellipse(0, 0, leafSize, leafSize * 0.5);
    p.pop();

    // Draw Peach Blossom
    if (hasFlower && bloomFactor > 0.25) {
        const flowerSize = 14 * breathe * growthScale;
        p.push();
        p.rotate(foliageSway);
        
        // Petals
        p.fill(COL_FLOWER_PINK);
        for(let i=0; i<5; i++) {
            p.rotate(p.TWO_PI/5);
            p.ellipse(0, flowerSize*0.4, flowerSize*0.5, flowerSize*0.6);
        }
        
        // Center
        p.fill(255, 220, 100); 
        p.circle(0, 0, flowerSize * 0.3);
        p.pop();
    }
  };

  const spawnFallingParticle = (x: number, y: number, isDead: boolean) => {
    if (x < -50 || x > p.width + 50 || y > p.height) return;

    // Initial velocity
    const vx = isDead 
        ? p.random(-1, 1) + currentWind * 1.0 
        : p.random(-0.5, 0.5) + currentWind * 2.5;
        
    // Dead particles drop faster (gravity simulation), live ones float
    const vy = isDead 
        ? p.random(1.0, 3.0) 
        : p.random(0.0, 0.5); 

    particles.push({
      pos: p.createVector(x, y), 
      vel: p.createVector(vx, vy), 
      acc: p.createVector(0, 0), 
      color: isDead ? COL_LEAF_DEAD : (p.random(1) > 0.5 ? COL_FLOWER_PINK : COL_LEAF_TENDER),
      size: p.random(7, 12),
      life: 255,
      isDead: isDead,
      angle: p.random(p.TWO_PI),
      angleVel: p.random(-0.15, 0.15),
      flip: p.random(p.TWO_PI),
      flipSpeed: p.random(0.05, 0.2),
      swayPhase: p.random(p.TWO_PI),
      swayFreq: p.random(0.05, 0.1),
      swayAmp: p.random(0.02, 0.05)
    });
  };

  const updateParticles = (windForce: number) => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];

      // Gravity & Forces
      if (part.isDead) {
          // Heavier gravity for dead leaves to simulate "falling off"
          part.acc.set(0, 0.12); 
      } else {
          // Very light gravity for live petals
          part.acc.set(0, 0.025); 
      }

      // Wind & Turbulence
      const turbulence = p.noise(part.pos.x * 0.01, part.pos.y * 0.01, p.frameCount * 0.02) - 0.5;
      const windEffect = windForce * 0.25; 
      part.acc.x += windEffect + (turbulence * 0.15);

      // Aerodynamic Sway (Flutter)
      const swayForce = Math.sin(p.frameCount * part.swayFreq + part.swayPhase) * part.swayAmp;
      part.acc.x += swayForce;

      part.vel.add(part.acc);
      
      // Drag/Air Resistance
      const drag = part.isDead ? 0.96 : 0.94; 
      part.vel.mult(drag);
      part.pos.add(part.vel);

      // Rotation
      part.angle += part.angleVel;
      part.flip += part.flipSpeed;
      // Double fade speed: 3.0 for dead, 1.6 for live
      part.life -= part.isDead ? 3.0 : 1.6; 

      // Render
      p.push();
      p.translate(part.pos.x, part.pos.y);
      p.rotate(part.angle); 
      
      const tumbleScale = Math.cos(part.flip);
      p.scale(1, Math.abs(tumbleScale)); 
      
      const c = p.color(part.color);
      c.setAlpha(part.life);
      
      p.fill(c);
      p.noStroke();
      // Simple shape for particle (petal/leaf)
      p.ellipse(0, 0, part.size, part.size * 0.7);
      p.pop();

      if (part.life <= 0 || part.pos.y > p.height + 50) {
        particles.splice(i, 1);
      }
    }
  };
};