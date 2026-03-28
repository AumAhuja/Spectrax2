import { useState } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CalibrationScreen } from './components/CalibrationScreen';
import { WorkoutScreen } from './components/WorkoutScreen';
import { SummaryScreen } from './components/SummaryScreen';
import { ReplayScreen } from './components/ReplayScreen';
import { exercises, ExerciseConfig } from './config/exercises';

type Screen = 'welcome' | 'calibration' | 'workout' | 'summary' | 'replay';

interface WorkoutStats {
  reps: number;
  totalReps: number;
  correctReps: number;
  repScores: number[];
  duration: number;
  accuracy: number;
  exerciseName: string;
  mistakes: Record<string, number>;
  bestStreak: number;
}

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseConfig>(exercises.squat);
  const [stats, setStats] = useState<WorkoutStats>({ 
    reps: 0, 
    totalReps: 0,
    correctReps: 0,
    repScores: [],
    duration: 0, 
    accuracy: 0, 
    exerciseName: exercises.squat.name,
    mistakes: {},
    bestStreak: 0
  });

  const navigateTo = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const handleWorkoutEnd = (finalStats: Omit<WorkoutStats, 'exerciseName'>) => {
    setStats({ ...finalStats, exerciseName: selectedExercise.name });
    navigateTo('summary');
  };

  const handleSelectExercise = (key: string) => {
    if (exercises[key]) {
      setSelectedExercise(exercises[key]);
    }
  };

  return (
    <main className="spectrax-app">
      {currentScreen === 'welcome' && (
        <WelcomeScreen onStart={() => navigateTo('calibration')} />
      )}
      
      {currentScreen === 'calibration' && (
        <CalibrationScreen 
          selectedExercise={selectedExercise}
          onSelectExercise={handleSelectExercise}
          onNext={() => navigateTo('workout')} 
          onBack={() => navigateTo('welcome')} 
        />
      )}
      
      {currentScreen === 'workout' && (
        <WorkoutScreen 
          exercise={selectedExercise}
          onEnd={handleWorkoutEnd} 
        />
      )}
      
      {currentScreen === 'summary' && (
        <SummaryScreen 
          stats={stats}
          onRestart={() => navigateTo('welcome')} 
          onViewReplay={() => navigateTo('replay')} 
        />
      )}
      
      {currentScreen === 'replay' && (
        <ReplayScreen onBack={() => navigateTo('summary')} />
      )}
    </main>
  );
}

export default App;
