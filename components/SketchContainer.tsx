import React, { useRef, useEffect } from "react";
import p5 from "p5";
import { createSketch, TreeEventType } from "../services/treeSketch";
import { TreeState } from "../types";

interface SketchContainerProps {
  treeStateRef: React.MutableRefObject<TreeState>;
  onTreeEvent?: (event: TreeEventType) => void;
}

const SketchContainer: React.FC<SketchContainerProps> = ({ treeStateRef, onTreeEvent }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize p5
    const sketch = createSketch(() => treeStateRef.current, onTreeEvent);
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