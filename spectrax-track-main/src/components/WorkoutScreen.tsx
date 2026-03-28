import React, { useState, useEffect, useRef } from 'react';
import { Activity, StopCircle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cameraService } from '../services/cameraService';
import { poseService } from '../services/poseService';
import { overlayRenderer } from '../services/overlayRenderer';
import { getJointAngles, getJointVisibility } from '../services/angleUtils';
import { exerciseEngine, EngineState } from '../services/exerciseEngine';
import { ExerciseConfig } from '../config/exercises';
import { sessionRecorder } from '../services/sessionRecorder';

interface WorkoutScreenProps {
  exercise: ExerciseConfig;
  onEnd: (stats: { reps: number; totalReps: number; correctReps: number; repScores: number[]; duration: number; accuracy: number; mistakes: Record<string, number>; bestStreak: number }) => void;
}

export const WorkoutScreen: React.FC<WorkoutScreenProps> = ({ exercise, onEnd }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seconds, setSeconds] = useState(0);

  const [engineState, setEngineState] = useState<EngineState>({
    reps: 0,
    stage: 'up',
    feedback: 'ESTABLISHING POSTURE...',
    status: 'yellow',
    lastRepTime: 0,
    isCalibrated: false,
    history: [],
    stageStartTime: 0,
    frameScore: 0,
    totalScore: 0,
    totalFrames: 0,
    allowRep: false,
    mistakes: {},
    currentStreak: 0,
    bestStreak: 0,
    isInExercisePosture: false,
    downAngleReached: 999,
    totalReps: 0,
    correctReps: 0,
    minScoreInRep: 100,
    repScores: [],
    accuracy: 100
  });

  const frameId = useRef<number>(0);
  const lastProcessTime = useRef<number>(0);
  const FPS_LIMIT = 15;

  // Use refs for real-time logic to avoid state lags in the pose callback
  const mutableState = useRef<EngineState>({
    reps: 0,
    stage: 'up',
    feedback: 'ESTABLISHING POSTURE...',
    status: 'yellow',
    lastRepTime: 0,
    isCalibrated: false,
    history: [],
    stageStartTime: 0,
    frameScore: 0,
    totalScore: 0,
    totalFrames: 0,
    allowRep: false,
    mistakes: {},
    currentStreak: 0,
    bestStreak: 0,
    isInExercisePosture: false,
    downAngleReached: 999,
    totalReps: 0,
    correctReps: 0,
    minScoreInRep: 100,
    repScores: [],
    accuracy: 100
  });


  useEffect(() => {
    let isMounted = true;

    const startWorkout = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      try {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) overlayRenderer.setContext(ctx);

        sessionRecorder.start();

        await cameraService.startCamera(videoRef.current);

        poseService.onResults(async (results) => {
          if (!isMounted || !results.poseLandmarks) return;

          // 1. Calculate angles and visibility
          const angles = getJointAngles(results.poseLandmarks);
          const visibility = getJointVisibility(results.poseLandmarks);

          // 2. Process through multi-exercise engine
          const nextState = await exerciseEngine.process(exercise, angles, visibility, mutableState.current);

          // 4. Update mutable ref for logic and React state for UI
          mutableState.current = nextState;
          setEngineState(nextState);

          sessionRecorder.recordFrame({
            timestamp: Date.now(),
            landmarks: results.poseLandmarks,
            angles: angles,
            feedback: nextState.feedback,
            exercise: exercise.key
          });

          // 5. Rendering logic
          const primaryJoints = exercise.joints?.flat() || [];
          overlayRenderer.draw(results, nextState.status, primaryJoints);
        });

        const loop = (timestamp: number) => {
          if (!isMounted) return;
          const elapsed = timestamp - lastProcessTime.current;
          if (elapsed > (1000 / FPS_LIMIT)) {
            if (videoRef.current && videoRef.current.readyState >= 2 && !videoRef.current.paused) {
              poseService.send(videoRef.current);
            }
            lastProcessTime.current = timestamp;
          }
          frameId.current = requestAnimationFrame(loop);
        };
        frameId.current = requestAnimationFrame(loop);

      } catch (err) {
        console.error("Workout camera error:", err);
      }
    };

    startWorkout();

    const timer = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameId.current);
      cameraService.stopCamera();
      clearInterval(timer);
    };
  }, [exercise]);

  const handleEnd = () => {
    const accuracy = mutableState.current.totalReps > 0
      ? Math.round((mutableState.current.correctReps / mutableState.current.totalReps) * 100)
      : 100;

    sessionRecorder.download();

    onEnd({
      reps: mutableState.current.reps,
      totalReps: mutableState.current.totalReps,
      correctReps: mutableState.current.correctReps,
      repScores: mutableState.current.repScores,
      duration: seconds,
      accuracy: accuracy,
      mistakes: mutableState.current.mistakes,
      bestStreak: mutableState.current.bestStreak
    });
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const statusColor = engineState.status === 'green' ? 'var(--neon-green)' : (engineState.status === 'yellow' ? 'var(--neon-yellow)' : 'var(--neon-red)');

  return (
    <div className="screen-container" style={{ background: 'var(--bg-primary)' }}>
      {/* Background Video Layer */}
      <div className="camera-viewport" style={{ position: 'absolute', inset: 0 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4, transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
      </div>

      {/* Top Header Controls */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', padding: '30px', pointerEvents: 'none' }}>
        <div className="glass animate-in" style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Session Focus</div>
          <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--neon-cyan)', fontSize: '1.2rem' }}>{exercise.name.toUpperCase()}</div>
        </div>

        <div className="glass animate-in" style={{ padding: '16px 24px', textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '2px', textTransform: 'uppercase' }}>Time</span>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', color: '#fff', fontSize: '1.5rem' }}>{formatTime(seconds)}</div>
        </div>
      </div>

      {/* Center Focus Area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', pointerEvents: 'none' }}>
        <div className="glass animate-in" style={{
          padding: '24px 40px',
          borderBottom: `4px solid ${statusColor}`,
          textAlign: 'center',
          background: 'rgba(10, 10, 26, 0.8)',
          minWidth: '320px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            {engineState.stage === 'down' ? <ArrowDownCircle color={statusColor} size={20} /> : <ArrowUpCircle color={statusColor} size={20} />}
            <span style={{ color: statusColor, fontWeight: 700, letterSpacing: '2px', fontSize: '1.1rem' }}>{engineState.stage.toUpperCase()}</span>
          </div>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', color: '#fff', letterSpacing: '2px', margin: '10px 0' }}>
            {engineState.feedback.toUpperCase()}
          </p>
          <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>Form Performance</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
              <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${engineState.frameScore}%`, height: '100%', background: statusColor, transition: 'width 0.2s ease' }} />
              </div>
              <span style={{ color: statusColor, fontWeight: 700, fontSize: '0.9rem' }}>{engineState.frameScore}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Metrics Bar */}
      <div style={{ position: 'relative', zIndex: 10, padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <div className="rep-counter" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '7rem', fontWeight: 900, lineHeight: 1, color: '#fff', textShadow: `0 0 40px ${statusColor}44` }}>{engineState.reps}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', letterSpacing: '4px', textTransform: 'uppercase' }}>Repetitions</div>
        </div>

        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'all' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div className="glass animate-in" style={{ padding: '12px 20px', borderLeft: `3px solid ${statusColor}` }}>
              <div style={{ fontSize: '0.75rem', color: statusColor, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <Activity size={14} /> AI ENGINE: {engineState.status === 'green' ? 'STABLE' : 'CORRECTION REQUIRED'}
              </div>
            </div>

            <div className="glass animate-in" style={{ padding: '12px 20px', borderLeft: '3px solid var(--neon-cyan)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                ACCURACY: {engineState.totalReps > 0 ? Math.round((engineState.correctReps / engineState.totalReps) * 100) : 100}%
              </div>
            </div>
          </div>

          <button onClick={handleEnd} className="btn-neon" style={{ background: 'var(--neon-red)', color: '#fff' }}>
            FINISH SESSION <StopCircle size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
