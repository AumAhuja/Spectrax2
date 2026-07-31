# SpectraX 🎯
**AI-Powered Fitness Tracker & Real-Time Pose Visualization**

An advanced fitness companion that tracks workouts, analyzes form in real time, 
and visualizes your body in 3D — entirely from a browser webcam. 
No wearables. No hardware.

## What it does
- 🏋️ **Intelligent Rep Counting** — auto-counts reps for squats, push-ups, 
  bicep curls, lunges, shoulder press, flutter kicks, and more
- 📐 **Real-Time Form Scoring** — scores each rep based on joint angles 
  and posture accuracy
- 🔍 **Auto Exercise Detection** — AI classifies your exercise without 
  manual selection
- 🎥 **3D Skeleton Rendering** — live Three.js skeleton with volumetric fog 
  and biomechanical stress shaders
- 🧠 **Anomaly Detection** — pure-TypeScript ML engine (Z-Score, Modified 
  Z-Score, Isolation Forest) flags form deviations
- 🔄 **Session Replay** — review workouts in full 3D with camera orbit controls
- 🏆 **Gamification** — XP leveling, badges, streaks, and achievements

## Tech Stack
| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| 3D / Shaders | Three.js, WebGL, GLSL |
| AI / Pose | MediaPipe Pose, Transformers.js |
| Backend | Node.js, Express, Socket.io |
| Auth & DB | Firebase Auth, Firestore |
| PWA | vite-plugin-pwa, Workbox |
| Testing | Vitest, React Testing Library |
| CI/CD | GitHub Actions |
| Deployment | Vercel |

## Performance
- ~30 FPS pose detection
- ~94% rep counting accuracy  
- <100ms detection latency
- 33 3D keypoints tracked
- 2 Web Workers (pose + activity classification)

## Quick Start
```bash
git clone https://github.com/AumAhuja/Spectrax2.git
cd spectrax-track-main
npm install
cd server && npm install && cd ..
cd server && npm run dev   # Terminal 1
npm run dev                # Terminal 2
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:3001`

## Supported Exercises
Squats · Push-Ups · Bicep Curls · Shoulder Press · Lunges · 
Flutter Kicks · Plank
