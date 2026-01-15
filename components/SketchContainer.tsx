import React, { useRef, useEffect } from "react";
import p5 from "p5";
import { createSketch, TreeEventType } from "../services/treeSketch";
import { TreeState, FlowerStyle } from "../types";

interface SketchContainerProps {
  treeStateRef: React.MutableRefObject<TreeState>;
  onTreeEvent?: (event: TreeEventType) => void;
  flowerStyle: FlowerStyle;
}

const SketchContainer: React.FC<SketchContainerProps> = ({ treeStateRef, onTreeEvent, flowerStyle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const flowerStyleRef = useRef<FlowerStyle>(flowerStyle);

  // Keep the ref updated so the sketch can access the latest value without re-init
  useEffect(() => {
    flowerStyleRef.current = flowerStyle;
  }, [flowerStyle]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize p5
    // Pass a getter for flowerStyle
    const sketch = createSketch(
      () => treeStateRef.current, 
      () => flowerStyleRef.current,
      onTreeEvent
    );
    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      // Cleanup
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
  }, []); // Only run once on mount

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};

export default SketchContainer;