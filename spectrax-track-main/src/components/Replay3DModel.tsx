import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ReplayFrame {
  timestamp: number;
  landmarks: { x: number; y: number; z: number }[];
  angles?: Record<string, number>;
  feedback: string;
  exercise?: string;
}

export interface Replay3DModelProps {
  frames: ReplayFrame[];
  modelUrl?: string;
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

const parseFeedback = (feedback: string) => {
  if (typeof feedback !== 'string' || feedback.includes("ESTABLISHING") || feedback.includes("Get into position") || feedback.includes("READY 🟢")) {
    return { baseColor: COLOR_YELLOW, badJoints: new Set<number>() };
  }
  if (feedback.includes("Good form ✅")) {
    return { baseColor: COLOR_GREEN, badJoints: new Set<number>() };
  }
  
  const badJoints = new Set<number>();
  let baseColor = COLOR_YELLOW;
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

  return { baseColor, badJoints, mistakeColor };
};

export const Replay3DModel: React.FC<Replay3DModelProps> = ({ frames, modelUrl = '/model.glb' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  
  // Fallback refs
  const jointsRef = useRef<THREE.Mesh[]>([]);
  const bonesRef = useRef<{ line: THREE.Line; startIdx: number; endIdx: number }[]>([]);
  
  // GLTF refs
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const boneMapRef = useRef<Record<string, THREE.Bone>>({});
  const skinnedMeshesRef = useRef<THREE.SkinnedMesh[]>([]);
  const restDataRef = useRef<Record<string, { worldQuat: THREE.Quaternion, localQuat: THREE.Quaternion, dir: THREE.Vector3 }>>({});
  const rootOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 2, 2);
    scene.add(dirLight);

    // --- Create Fallback Skeleton ---
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

    // --- Load GLTF Model ---
    const loader = new GLTFLoader();
    loader.load(modelUrl, (gltf) => {
      const model = gltf.scene;
      model.position.y = -1; // Center model at hips roughly
      scene.add(model);
      modelGroupRef.current = model;

      const bones: Record<string, THREE.Bone> = {};
      model.traverse((o) => {
        if (o.type === 'Bone') {
           const name = o.name.toLowerCase();
           if (name.includes('leftarm') && !name.includes('fore')) bones.leftShoulder = o as THREE.Bone;
           if (name.includes('leftforearm')) bones.leftElbow = o as THREE.Bone;
           if (name.includes('lefthand') || name.includes('leftwrist')) bones.leftWrist = o as THREE.Bone;
           
           if (name.includes('rightarm') && !name.includes('fore')) bones.rightShoulder = o as THREE.Bone;
           if (name.includes('rightforearm')) bones.rightElbow = o as THREE.Bone;
           if (name.includes('righthand') || name.includes('rightwrist')) bones.rightWrist = o as THREE.Bone;

           if (name.includes('leftupleg') || name.includes('lefthip')) bones.leftHip = o as THREE.Bone;
           if (name.includes('leftleg') || name.includes('leftknee')) bones.leftKnee = o as THREE.Bone;
           if (name.includes('leftfoot') || name.includes('leftankle')) bones.leftAnkle = o as THREE.Bone;

           if (name.includes('rightupleg') || name.includes('righthip')) bones.rightHip = o as THREE.Bone;
           if (name.includes('rightleg') || name.includes('rightknee')) bones.rightKnee = o as THREE.Bone;
           if (name.includes('rightfoot') || name.includes('rightankle')) bones.rightAnkle = o as THREE.Bone;

           if (name.includes('spine')) bones.spine = o as THREE.Bone;
           if (name.includes('hips') && !name.includes('left') && !name.includes('right')) bones.hips = o as THREE.Bone;
        }
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
           const mesh = o as THREE.SkinnedMesh;
           skinnedMeshesRef.current.push(mesh);
           // Fix: Avoid array material cloning crash by creating a fresh green holographic material
           mesh.material = new THREE.MeshStandardMaterial({ 
              color: 0x00ff00, 
              roughness: 0.2, 
              metalness: 0.8,
              emissive: 0x00ff00,
              emissiveIntensity: 0.1
           });
        }
      });
      boneMapRef.current = bones;

      // --- Record Resting Data for FK ---
      model.updateMatrixWorld(true);

      const hipPos = new THREE.Vector3();
      if (bones.hips) {
          bones.hips.getWorldPosition(hipPos);
          rootOffsetRef.current = model.position.clone().sub(hipPos);
      }

      const recordRest = (boneKey: string, childKey: string) => {
         const bone = bones[boneKey];
         const childBone = bones[childKey];
         if (!bone || !childBone) return;
         
         const pPos = new THREE.Vector3();
         bone.getWorldPosition(pPos);
         const cPos = new THREE.Vector3();
         childBone.getWorldPosition(cPos);
         
         const dir = new THREE.Vector3().subVectors(cPos, pPos).normalize();
         if (dir.lengthSq() < 0.001) return;
         
         const worldQ = new THREE.Quaternion();
         bone.getWorldQuaternion(worldQ);
         
         restDataRef.current[boneKey] = {
            worldQuat: worldQ.clone(),
            localQuat: bone.quaternion.clone(),
            dir: dir.clone()
         };
      }

      recordRest('leftShoulder', 'leftElbow');
      recordRest('leftElbow', 'leftWrist');
      recordRest('rightShoulder', 'rightElbow');
      recordRest('rightElbow', 'rightWrist');
      recordRest('leftHip', 'leftKnee');
      recordRest('leftKnee', 'leftAnkle');
      recordRest('rightHip', 'rightKnee');
      recordRest('rightKnee', 'rightAnkle');

      setModelLoaded(true);

      // Hide fallback
      jointsRef.current.forEach(j => j.visible = false);
      bonesRef.current.forEach(b => b.line.visible = false);

    }, 
    undefined, 
    (err) => {
      console.warn("Replay3DModel: Failed to load GLTF model, falling back to joint skeleton.", err);
      setModelLoaded(false);
    });

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
  }, [frames, modelUrl]);

  // --- Animation Engine ---
  useEffect(() => {
    if (!frames || frames.length === 0) return;

    const renderLoop = (time: number) => {
      reqIdRef.current = requestAnimationFrame(renderLoop);

      if (isPlaying && (time - lastTimeRef.current > 1000 / 15)) {
        setCurrentFrameIdx((prev) => (prev + 1) % frames.length);
        lastTimeRef.current = time;
      }

      const frame = frames[currentFrameIdx];
      if (!frame || !frame.landmarks) {
        rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
        return;
      }

      const { baseColor, badJoints, mistakeColor } = parseFeedback(frame.feedback);

      if (modelLoaded) {
        if (!modelGroupRef.current) return;
        // --- Output to GLTF Skinned Mesh ---
        const getLm = (idx: number) => {
            const lm = frame.landmarks[idx];
            if (!lm) return null;
            return new THREE.Vector3((lm.x - 0.5) * 2, -(lm.y - 0.5) * 2, -lm.z * 2);
        };

        // Torso Alignment & Root Motion
        const lShoulder = getLm(11);
        const rShoulder = getLm(12);
        const lHip = getLm(23);
        const rHip = getLm(24);

        if (lShoulder && rShoulder && lHip && rHip) {
            const shoulderCenter = new THREE.Vector3().addVectors(lShoulder, rShoulder).multiplyScalar(0.5);
            const hipCenter = new THREE.Vector3().addVectors(lHip, rHip).multiplyScalar(0.5);

            // Up vector (hips pointing UP to shoulders)
            const up = new THREE.Vector3().subVectors(shoulderCenter, hipCenter).normalize();
            
            // Right vector (User Left Shoulder 11 to User Right Shoulder 12 mapping physical right)
            const right = new THREE.Vector3().subVectors(lShoulder, rShoulder).normalize();
            
            // Back vector (cross product produces orthogonal depth Z)
            const forward = new THREE.Vector3().crossVectors(right, up).normalize();
            
            // Perfect orthogonal matrix
            right.crossVectors(up, forward).normalize();
            const mat = new THREE.Matrix4();
            mat.makeBasis(right, up, forward);
            const torsoQuat = new THREE.Quaternion().setFromRotationMatrix(mat);

            // Apply smoothed physical turning and squat dropping
            modelGroupRef.current.quaternion.slerp(torsoQuat, 0.2);
            
            const rotatedOffset = rootOffsetRef.current.clone().applyQuaternion(modelGroupRef.current.quaternion);
            const targetPos = hipCenter.clone().add(rotatedOffset);
            modelGroupRef.current.position.lerp(targetPos, 0.2);

            // Update model matrix since we moved it, so FK calculation has the correct parent offsets!
            modelGroupRef.current.updateMatrixWorld(true);
        }

        const applyPose = (boneKey: string, startIdx: number, endIdx: number) => {
            const bone = boneMapRef.current[boneKey];
            const rest = restDataRef.current[boneKey];
            if (!bone || !rest) return;

            const startV = getLm(startIdx);
            const endV = getLm(endIdx);
            if (!startV || !endV) return;

            // Target direction from MediaPipe
            const targetDir = new THREE.Vector3().subVectors(endV, startV).normalize();
            if (targetDir.lengthSq() < 0.0001) return;
            
            // Quaternion to rotate rest direction to target direction in world space
            const deltaQ = new THREE.Quaternion().setFromUnitVectors(rest.dir, targetDir);
            
            // Multiply resting world rotation by delta to get the new target world rotation
            const targetWorldQ = rest.worldQuat.clone().premultiply(deltaQ);
            
            // Convert to Local Rotation: LocalQ = ParentWorldQ_inverse * TargetWorldQ
            const parentWorldQ = new THREE.Quaternion();
            if (bone.parent) {
                bone.parent.getWorldQuaternion(parentWorldQ);
            }
            
            const targetLocalQ = targetWorldQ.clone().premultiply(parentWorldQ.invert());
            
            // Slerp for smooth, natural transition without jitter
            bone.quaternion.slerp(targetLocalQ, 0.2);
        };

        // MediaPipe indices to bone targets
        applyPose('leftShoulder', 11, 13);
        applyPose('leftElbow', 13, 15);
        applyPose('rightShoulder', 12, 14);
        applyPose('rightElbow', 14, 16);
        applyPose('leftHip', 23, 25);
        applyPose('leftKnee', 25, 27);
        applyPose('rightHip', 24, 26);
        applyPose('rightKnee', 26, 28);
        
        // Error Highlight logic for GLTF model
        skinnedMeshesRef.current.forEach(mesh => {
            if (!mesh.material) return;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            const hasError = badJoints.size > 0;
            const targetColor = hasError ? (mistakeColor || COLOR_RED) : baseColor;
            
            // Lerp model tint to highlight issues
            mat.color.lerp(targetColor, 0.2);
            mat.emissive.lerp(targetColor, 0.2);
        });

      } else {
        // --- Output to Fallback Skeleton ---
        const jointTargetColors = new Array(33).fill(baseColor);
        badJoints.forEach(j => {
           jointTargetColors[j] = mistakeColor || COLOR_RED;
        });

        for (let i = 0; i < 33; i++) {
          const landmark = frame.landmarks[i];
          if (!landmark || !jointsRef.current[i]) continue;
          
          const mesh = jointsRef.current[i];
          const targetX = (landmark.x - 0.5) * 2;
          const targetY = -(landmark.y - 0.5) * 2;
          const targetZ = -(landmark.z) * 2; 

          mesh.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.5);
          (mesh.material as THREE.MeshLambertMaterial).color.lerp(jointTargetColors[i], 0.2);
        }

        bonesRef.current.forEach(bone => {
          const startMesh = jointsRef.current[bone.startIdx];
          const endMesh = jointsRef.current[bone.endIdx];
          if (!startMesh || !endMesh) return;

          const positions = bone.line.geometry.attributes.position.array as Float32Array;
          positions[0] = startMesh.position.x; positions[1] = startMesh.position.y; positions[2] = startMesh.position.z;
          positions[3] = endMesh.position.x; positions[4] = endMesh.position.y; positions[5] = endMesh.position.z;
          bone.line.geometry.attributes.position.needsUpdate = true;

          const isBadBone = badJoints.has(bone.startIdx) || badJoints.has(bone.endIdx);
          const targetBoneColor = isBadBone ? (mistakeColor || COLOR_RED) : baseColor;
          (bone.line.material as THREE.LineBasicMaterial).color.lerp(targetBoneColor, 0.2);
        });
      }

      if (sceneRef.current && cameraRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    reqIdRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(reqIdRef.current);
  }, [frames, currentFrameIdx, isPlaying, modelLoaded]);

  if (!frames || frames.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#fff', background: '#111', borderRadius: 8 }}>No session data available</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ flex: 1, minHeight: '400px', width: '100%', borderRadius: '8px', overflow: 'hidden' }} />
      
      <div style={{ padding: '15px', background: '#222', display: 'flex', alignItems: 'center', gap: '15px', borderRadius: '8px', marginTop: '10px' }}>
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ padding: '8px 16px', background: 'var(--neon-purple, #9D4EDD)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <input 
          type="range" min="0" max={frames.length - 1} value={currentFrameIdx}
          onChange={(e) => { setIsPlaying(false); setCurrentFrameIdx(Number(e.target.value)); }}
          style={{ flex: 1, cursor: 'pointer' }}
        />
        <span style={{ color: '#aaa', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>
          {currentFrameIdx} / {frames.length - 1}
        </span>
      </div>
    </div>
  );
};
