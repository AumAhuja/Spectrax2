import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface ReplayFrame {
  timestamp: number;
  landmarks: { x: number; y: number; z: number }[];
  angles?: Record<string, number>;
  feedback: string;
  exercise?: string;
}

export interface Replay3DProps {
  frames: ReplayFrame[];
}

const BONES_CONNECTIONS = [
  // Torso
  [11, 12], [12, 24], [24, 23], [23, 11],
  // Left Arm
  [11, 13], [13, 15],
  // Right Arm
  [12, 14], [14, 16],
  // Left Leg
  [23, 25], [25, 27],
  // Right Leg
  [24, 26], [26, 28]
];

const COLOR_GREEN = new THREE.Color(0x00ff00);
const COLOR_YELLOW = new THREE.Color(0xffff00);
const COLOR_RED = new THREE.Color(0xff0000);

// Helper to deduce issues and colors from feedback string
const parseFeedback = (feedback: string) => {
  if (typeof feedback !== 'string' || feedback.includes("ESTABLISHING") || feedback.includes("Get into position") || feedback.includes("READY 🟢")) {
    return { baseColor: COLOR_YELLOW, badJoints: new Set<number>() };
  }
  if (feedback.includes("Good form ✅")) {
    return { baseColor: COLOR_GREEN, badJoints: new Set<number>() };
  }
  
  // It's a mistake frame
  const badJoints = new Set<number>();
  let baseColor = COLOR_YELLOW; // Defaults to yellow for issues
  let mistakeColor = COLOR_RED;

  if (feedback.includes("Keep your back straight ❌")) {
    baseColor = COLOR_RED; 
    [11, 12, 23, 24].forEach(j => badJoints.add(j));
  }
  if (feedback.includes("Go lower for full range")) {
    [13, 14].forEach(j => badJoints.add(j));
  }
  if (feedback.includes("over-bend knees")) {
    [25, 26].forEach(j => badJoints.add(j));
  }
  if (feedback.includes("hips lower") || feedback.includes("Drop your hips") || feedback.includes("Hips too high")) {
    [23, 24].forEach(j => badJoints.add(j));
  }
  if (feedback.includes("Squeeze at the top") || feedback.includes("Keep elbows at side")) {
    [11, 12, 13, 14].forEach(j => badJoints.add(j));
  }
  if (feedback.includes("Raise arms higher")) {
    [11, 12].forEach(j => badJoints.add(j));
  }

  return { baseColor: COLOR_YELLOW, badJoints, mistakeColor };
};

export const Replay3D: React.FC<Replay3DProps> = ({ frames }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  // References to Three.js objects to avoid recreating meshes
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const jointsRef = useRef<THREE.Mesh[]>([]);
  const bonesRef = useRef<{ line: THREE.Line; startIdx: number; endIdx: number }[]>([]);
  const reqIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    console.log("Replay frames:", frames?.length || 0);
  }, [frames]);

  useEffect(() => {
    if (!frames || frames.length === 0) return;
    if (!mountRef.current) return;

    // --- Setup Three.js Scene ---
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 2, 2);
    scene.add(dirLight);

    // --- Create Skeleton ---
    const jointGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const jointMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });

    const createdJoints: THREE.Mesh[] = [];
    for (let i = 0; i < 33; i++) {
      const sphere = new THREE.Mesh(jointGeometry, jointMaterial.clone());
      scene.add(sphere);
      createdJoints.push(sphere);
    }
    jointsRef.current = createdJoints;

    const createdBones: { line: THREE.Line; startIdx: number; endIdx: number }[] = [];
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });

    BONES_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, lineMaterial.clone());
      scene.add(line);
      createdBones.push({ line, startIdx, endIdx });
    });
    bonesRef.current = createdBones;

    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, [frames]);

  // --- Animation Engine & Frame Visualization ---
  useEffect(() => {
    if (!frames || frames.length === 0) return;

    const renderLoop = (time: number) => {
      reqIdRef.current = requestAnimationFrame(renderLoop);

      // Animation FPS ~ 30
      if (isPlaying && (time - lastTimeRef.current > 1000 / 30)) {
        setCurrentFrameIdx((prev) => (prev + 1) % frames.length);
        lastTimeRef.current = time;
      }

      const frame = frames[currentFrameIdx];
      if (!frame || !frame.landmarks) {
        rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
        return;
      }

      // Base color based on mapped feedback string
      const { baseColor, badJoints, mistakeColor } = parseFeedback(frame.feedback);
      const jointTargetColors = new Array(33).fill(baseColor);
      
      badJoints.forEach(j => {
         jointTargetColors[j] = mistakeColor || COLOR_RED;
      });

      // Apply to Joints
      for (let i = 0; i < 33; i++) {
        const landmark = frame.landmarks[i];
        if (!landmark) continue;

        const mesh = jointsRef.current[i];
        if (!mesh) continue;

        // Map Landmarks to 3D 
        const scale = 2;
        const targetX = (landmark.x - 0.5) * scale;
        const targetY = -(landmark.y - 0.5) * scale;
        const targetZ = -(landmark.z) * scale; 

        mesh.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.5);

        // Smooth Color Transitions
        const mat = mesh.material as THREE.MeshLambertMaterial;
        mat.color.lerp(jointTargetColors[i], 0.2);
      }

      // Apply to Bones
      bonesRef.current.forEach(bone => {
        const startMesh = jointsRef.current[bone.startIdx];
        const endMesh = jointsRef.current[bone.endIdx];
        if (!startMesh || !endMesh) return;

        const positions = bone.line.geometry.attributes.position.array as Float32Array;
        positions[0] = startMesh.position.x;
        positions[1] = startMesh.position.y;
        positions[2] = startMesh.position.z;
        positions[3] = endMesh.position.x;
        positions[4] = endMesh.position.y;
        positions[5] = endMesh.position.z;
        bone.line.geometry.attributes.position.needsUpdate = true;

        const isBadBone = badJoints.has(bone.startIdx) || badJoints.has(bone.endIdx);
        const targetBoneColor = isBadBone ? (mistakeColor || COLOR_RED) : baseColor;
        
        const mat = bone.line.material as THREE.LineBasicMaterial;
        mat.color.lerp(targetBoneColor, 0.2);
      });

      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    reqIdRef.current = requestAnimationFrame(renderLoop);

    return () => cancelAnimationFrame(reqIdRef.current);
  }, [frames, currentFrameIdx, isPlaying]);

  // --- Empty State Handling ---
  if (!frames || frames.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#fff', background: '#111', borderRadius: 8 }}>
        No session data available
      </div>
    );
  }

  // --- Controls ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div 
        ref={mountRef} 
        style={{ flex: 1, minHeight: '400px', width: '100%', borderRadius: '8px', overflow: 'hidden' }} 
      />
      
      <div style={{ padding: '15px', background: '#222', display: 'flex', alignItems: 'center', gap: '15px', borderRadius: '8px', marginTop: '10px' }}>
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ padding: '8px 16px', background: 'var(--neon-purple, #9D4EDD)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        
        <input 
          type="range" 
          min="0" 
          max={frames.length - 1} 
          value={currentFrameIdx}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentFrameIdx(Number(e.target.value));
          }}
          style={{ flex: 1, cursor: 'pointer' }}
        />
        
        <span style={{ color: '#aaa', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>
          {currentFrameIdx} / {frames.length - 1}
        </span>
      </div>
    </div>
  );
};
