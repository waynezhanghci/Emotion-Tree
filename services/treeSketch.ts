import p5 from "p5";
import { TreeState, FlowerStyle } from "../types";

export type TreeEventType = 'bloom' | 'wither';

export const createSketch = (
  getTreeState: () => TreeState,
  getFlowerStyle: () => FlowerStyle,
  onTreeEvent?: (event: TreeEventType) => void
) => (p: p5) => {
  let currentMood = 0; // smoothed mood
  let currentWind = 0; // smoothed wind (signed)
  
  // State tracking for event triggers (Hysteresis)
  let wasBlooming = false;
  
  // Particle system for falling leaves/flowers
  interface Particle {
    pos: p5.Vector;
    vel: p5.Vector;
    acc: p5.Vector;
    color: p5.Color;
    size: number;
    life: number; 
    
    // Type needed to render correct shape
    type: 'leaf' | 'flower';

    // Grounding logic
    isGrounded: boolean;
    groundY: number;

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
  const MAX_PARTICLES = 300; 
  
  // Palette variables (initialized in setup)
  let COL_TRUNK_DORMANT: p5.Color;
  let COL_TRUNK_THRIVE: p5.Color;
  let COL_LEAF_TENDER: p5.Color;
  let COL_FLOWER_PINK: p5.Color;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.frameRate(30); 
    
    // Peach Tree Palette
    COL_TRUNK_DORMANT = p.color(35, 30, 30); // Dark Charcoal/Brown
    COL_TRUNK_THRIVE = p.color(100, 70, 50); // Warm Brown
    COL_LEAF_TENDER = p.color(120, 210, 100, 230); // Bright Tender Green
    COL_FLOWER_PINK = p.color(255, 140, 170, 240); // Peach Blossom Pink
    
    // Generate the static tree skeleton ONCE
    buildTreeSkeleton();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
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

  // --- Flower Drawing Helpers ---
  const drawFlowerShape = (style: FlowerStyle, size: number) => {
    p.noStroke();
    switch (style) {
      case 'sakura':
        // Sakura: 5 petals, sharp pointed shape (Star/Diamond like)
        // Matching UI Icon path: M0 0 Q -20 -25 0 -45 Q 20 -25 0 0
        p.fill(COL_FLOWER_PINK);
        for(let i=0; i<5; i++) {
            p.push();
            p.rotate(p.TWO_PI/5 * i);
            
            const pLen = size * 0.85; 
            const pWidth = size * 0.45;

            p.beginShape();
            p.vertex(0, 0); 
            // Curve outwards then in to a sharp tip
            p.quadraticVertex(-pWidth, -pLen * 0.5, 0, -pLen);
            p.quadraticVertex(pWidth, -pLen * 0.5, 0, 0);
            p.endShape(p.CLOSE);
            p.pop();
        }
        // Center
        p.fill(255, 255, 255, 220); 
        p.circle(0, 0, size * 0.2);
        break;

      case 'delonix':
        // Delonix: 5 petals, Spoon/Matchstick shape
        // Matching UI Icon path: M0 0 L -1.5 -26 A 6 8 0 1 1 1.5 -26 L 0 0
        // Thin stem, round/oval head.
        
        p.fill(COL_FLOWER_PINK);
        
        for(let i=0; i<5; i++) {
           p.push();
           p.rotate(p.TWO_PI/5 * i);
           
           const totalLen = size * 0.95;
           const headWidth = size * 0.35;
           const headHeight = size * 0.4;
           const stemLen = totalLen - headHeight * 0.8;
           const stemHalfWidth = size * 0.04; // Very thin stem

           p.beginShape();
           p.vertex(0, 0);
           // Stem Left
           p.vertex(-stemHalfWidth, -stemLen);
           
           // Head (Spoon bowl)
           // Draw a bulb shape at the end of the stem
           p.bezierVertex(
               -headWidth, -stemLen - headHeight * 0.2, // Control Bottom-Left
               -headWidth, -totalLen,                   // Control Top-Left
               0, -totalLen                             // Top Tip
           );
           p.bezierVertex(
               headWidth, -totalLen,                    // Control Top-Right
               headWidth, -stemLen - headHeight * 0.2,  // Control Bottom-Right
               stemHalfWidth, -stemLen                  // Stem Right
           );

           // Stem Right back to center
           p.vertex(0, 0);
           p.endShape(p.CLOSE);
           p.pop();
        }

        // Small center dot
        p.fill(255, 200, 100, 150); 
        p.circle(0, 0, size * 0.15);
        break;

      case 'peach':
      default:
        // Classic 5 round petals
        p.fill(COL_FLOWER_PINK);
        for(let i=0; i<5; i++) {
            p.rotate(p.TWO_PI/5);
            p.ellipse(0, size*0.4, size*0.5, size*0.6);
        }
        // Center
        p.fill(255, 220, 100); 
        p.circle(0, 0, size * 0.3);
        break;
    }
  };

  p.draw = () => {
    // 1. Get State
    const state = getTreeState();
    const flowerStyle = getFlowerStyle();
    
    // Faster mood smoothing for responsiveness
    currentMood = p.lerp(currentMood, state.mood, 0.1);
    
    // Wind Smoothing
    const targetWind = state.windForce;
    currentWind = p.lerp(currentWind, targetWind, 0.12);

    // --- Event Logic (Hysteresis) ---
    if (!wasBlooming && currentMood > 0.6) {
        wasBlooming = true;
        if (onTreeEvent) onTreeEvent('bloom');
    } else if (wasBlooming && currentMood < 0.2) {
        wasBlooming = false;
    }

    // 2. Background handling (Transparency for CSS Gradient)
    p.clear();
    
    // Mood Overlay
    p.push();
    p.noStroke();
    if (currentMood > 0) {
        p.fill(255, 230, 200, currentMood * 20); 
    } else {
        p.fill(5, 5, 15, Math.abs(currentMood) * 180);
    }
    p.rect(0, 0, p.width, p.height);
    p.pop();

    // 3. Wind Physics
    const time = p.millis() * 0.001;
    const noiseSway = p.map(p.noise(time * 0.6), 0, 1, -0.04, 0.04);
    const windSign = currentWind < 0 ? -1 : 1;
    const effectiveWind = windSign * Math.pow(Math.abs(currentWind), 1.4);
    const activeSway = Math.sin(time * 2.5) * (effectiveWind * 0.1) + (effectiveWind * 0.3);
    const totalWindAngle = noiseSway + activeSway;

    // 4. Draw Tree
    if (rootBranch) {
      p.push();
      p.translate(p.width / 2, p.height); 
      
      const startX = p.width / 2;
      const startY = p.height;
      
      renderBranch(rootBranch, rootBranch.len, rootBranch.thick, totalWindAngle, startX, startY, 0, flowerStyle);
      p.pop();
    }

    // 5. Particles
    updateParticles(currentWind, flowerStyle);
  };

  const renderBranch = (
    branch: Branch,
    len: number, 
    thick: number, 
    windAngle: number,
    x: number, 
    y: number, 
    cumAngle: number,
    flowerStyle: FlowerStyle
  ) => {
    const bloomFactor = p.map(currentMood, 0, 1, 0, 1, true); 
    let branchCol = p.lerpColor(COL_TRUNK_DORMANT, COL_TRUNK_THRIVE, bloomFactor);

    p.stroke(branchCol);
    p.strokeWeight(thick);
    p.strokeCap(p.ROUND);
    p.line(0, 0, 0, -len);
    
    const tipX = x + Math.sin(cumAngle) * len;
    const tipY = y - Math.cos(cumAngle) * len;

    p.translate(0, -len);

    if (branch.depth > MAX_DEPTH - 4) {
      const isAttached = bloomFactor > branch.noiseThreshold;

      if (isAttached) {
         drawAttachedFoliage(windAngle, branch.hasFlower, bloomFactor, flowerStyle);
      }

      const time = p.millis();
      const spawnNoise = p.noise(tipX * 0.1, tipY * 0.1, time * 0.008);
      
      if (bloomFactor > 0.3) {
          if ((spawnNoise * 100) % 1.0 < 0.02) {
              spawnFallingParticle(tipX, tipY);
          }
      }
    }

    if (branch.depth >= MAX_DEPTH || len < 4) return;

    const flexibility = p.map(branch.depth, 0, MAX_DEPTH, 0.05, 1.3);
    const localWind = windAngle * flexibility;

    for (const child of branch.children) {
      p.push();
      const nextAngle = child.angleOffset + localWind;
      p.rotate(nextAngle);
      
      renderBranch(
        child,
        len * child.lenMult, 
        thick * 0.7, 
        windAngle, 
        tipX, 
        tipY, 
        cumAngle + nextAngle,
        flowerStyle
      );
      p.pop();
    }
  };

  const drawAttachedFoliage = (windAngle: number, hasFlower: boolean, bloomFactor: number, style: FlowerStyle) => {
    p.noStroke();
    const breathe = 1 + Math.sin(p.millis() * 0.004) * 0.08;
    const foliageSway = windAngle * 3.0;
    
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

    // Draw Flower
    if (hasFlower && bloomFactor > 0.25) {
        const flowerSize = 14 * breathe * growthScale;
        p.push();
        p.rotate(foliageSway);
        drawFlowerShape(style, flowerSize);
        p.pop();
    }
  };

  const spawnFallingParticle = (x: number, y: number) => {
    if (x < -50 || x > p.width + 50 || y > p.height) return;

    const vx = p.random(-0.5, 0.5) + currentWind * 2.5;
    const vy = p.random(1.5, 3.5); 
    const groundY = p.height - p.random(0, 15);
    const isFlower = p.random(1) > 0.5;

    particles.push({
      pos: p.createVector(x, y), 
      vel: p.createVector(vx, vy), 
      acc: p.createVector(0, 0), 
      color: isFlower ? COL_FLOWER_PINK : COL_LEAF_TENDER, 
      type: isFlower ? 'flower' : 'leaf',
      size: p.random(7, 12),
      life: 255,
      isGrounded: false,
      groundY: groundY,
      angle: p.random(p.TWO_PI),
      angleVel: p.random(-0.15, 0.15),
      flip: p.random(p.TWO_PI),
      flipSpeed: p.random(0.05, 0.2),
      swayPhase: p.random(p.TWO_PI),
      swayFreq: p.random(0.05, 0.1),
      swayAmp: p.random(0.02, 0.05)
    });
  };

  const updateParticles = (windForce: number, currentStyle: FlowerStyle) => {
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];

      if (!part.isGrounded) {
        // Falling Physics
        part.acc.set(0, 0.1); 
        const turbulence = p.noise(part.pos.x * 0.01, part.pos.y * 0.01, p.frameCount * 0.02) - 0.5;
        const windEffect = windForce * 0.25; 
        part.acc.x += windEffect + (turbulence * 0.15);
        const swayForce = Math.sin(p.frameCount * part.swayFreq + part.swayPhase) * part.swayAmp;
        part.acc.x += swayForce;

        part.vel.add(part.acc);
        part.vel.mult(0.94);
        part.pos.add(part.vel);

        part.angle += part.angleVel;
        part.flip += part.flipSpeed;

        if (part.pos.y >= part.groundY) {
            part.isGrounded = true;
            part.pos.y = part.groundY; 
            part.vel.set(0, 0); 
        }
      }

      // Render
      p.push();
      p.translate(part.pos.x, part.pos.y);
      p.rotate(part.angle); 
      
      const tumbleScale = Math.cos(part.flip);
      const renderScale = part.isGrounded ? 0.2 : Math.abs(tumbleScale);
      
      p.scale(1, Math.max(0.1, renderScale)); 
      
      const c = p.color(part.color);
      c.setAlpha(part.isGrounded ? 200 : 255);
      
      if (part.type === 'flower') {
        // Use the global style for flowers, so they update instantly when user clicks
        drawFlowerShape(currentStyle, part.size);
      } else {
        // Leaves
        p.fill(c);
        p.noStroke();
        p.ellipse(0, 0, part.size, part.size * 0.7);
      }
      p.pop();

      if (part.pos.x < -100 || part.pos.x > p.width + 100) {
        particles.splice(i, 1);
      }
    }
  };
};