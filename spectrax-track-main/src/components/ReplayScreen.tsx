import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LayoutDashboard, Play, RotateCw } from 'lucide-react';

interface ReplayScreenProps {
  onBack: () => void;
}

export const ReplayScreen: React.FC<ReplayScreenProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.15);

    const camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Grid Floor
    const grid = new THREE.GridHelper(10, 20, 0x00f0ff, 0x111633);
    grid.position.y = -0.5;
    scene.add(grid);

    // Lite
    const ambient = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambient);
    const point = new THREE.PointLight(0x00f0ff, 10, 10);
    point.position.set(2, 3, 2);
    scene.add(point);

    // Skeleton Group
    const skeleton = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.5 });
    
    // Create simple body parts
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), mat);
    head.position.y = 1.7;
    skeleton.add(head);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.6), mat);
    torso.position.y = 1.25;
    skeleton.add(torso);

    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7), mat);
    lLeg.position.set(-0.2, 0.7, 0);
    skeleton.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7), mat);
    rLeg.position.set(0.2, 0.7, 0);
    skeleton.add(rLeg);

    scene.add(skeleton);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      
      // Rotate for view
      skeleton.rotation.y += 0.01;
      
      // Pulse animation
      const scale = 1 + Math.sin(Date.now() * 0.005) * 0.05;
      skeleton.scale.set(scale, scale, scale);

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="screen-container" style={{ background: 'var(--bg-primary)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <div className="ui-layer" style={{ position: 'relative', zIndex: 10, padding: '30px', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="glass animate-in" style={{ padding: '16px 24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--neon-cyan)', fontSize: '1rem', letterSpacing: '2px' }}>3D SPATIAL REPLAY</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>SQUAT MODULE — SESSION #104AB</p>
            </div>
            <button onClick={onBack} className="btn-outline animate-in" style={{ pointerEvents: 'all' }}>
                <LayoutDashboard size={14} /> EXIT REPLAY
            </button>
        </div>

        <div className="animate-in animate-delay-4" style={{ position: 'absolute', bottom: '120px', left: '30px', right: '30px', pointerEvents: 'all' }}>
            <div className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>
                    <span>SESSION TIMELINE</span>
                    <span>100% ANALYZED</span>
                 </div>
                 <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, width: '65%', background: 'var(--neon-cyan)', boxShadow: '0 0 10px var(--neon-cyan)' }} />
                    <div style={{ position: 'absolute', left: '42%', top: 0, width: '2px', height: '100%', background: 'var(--neon-red)', boxShadow: '0 0 8px var(--neon-red)' }} />
                 </div>
                 <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                    <button className="ctrl-btn" style={{ padding: '8px', border: 'none', background: 'transparent', color: 'var(--neon-cyan)', cursor: 'pointer' }}><RotateCw size={18} /></button>
                    <button className="ctrl-btn" style={{ padding: '12px 24px', border: 'none', borderRadius: '20px', background: 'var(--neon-cyan)', color: 'var(--bg-primary)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Play size={14} fill="currentColor" /> RESUME PLAYBACK</button>
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
};
