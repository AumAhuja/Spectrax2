import React from 'react';
import { LayoutDashboard } from 'lucide-react';

import { Replay3DModel } from './Replay3DModel';
import { sessionRecorder } from '../services/sessionRecorder';

interface ReplayScreenProps {
  onBack: () => void;
}

export const ReplayScreen: React.FC<ReplayScreenProps> = ({ onBack }) => {

  return (
    <div className="screen-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Minimal integration snippet as requested */}
        <Replay3DModel frames={(sessionRecorder as any).frames || []} />
      </div>

      <div className="ui-layer" style={{ position: 'absolute', zIndex: 10, top: 0, 
      left: 0, padding: '30px', pointerEvents: 'none', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="glass animate-in" style={{ padding: '16px 24px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--neon-cyan)', fontSize: '1rem', letterSpacing: '2px' }}>3D SPATIAL REPLAY</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>SQUAT MODULE — SESSION #104AB</p>
            </div>
            <button onClick={onBack} className="btn-outline animate-in" style={{ pointerEvents: 'all' }}>
                <LayoutDashboard size={14} /> EXIT REPLAY
            </button>
        </div>

          {/* Removed the fake timeline UI since Replay3D handles its own controls now */}
      </div>
    </div>
  );
};
