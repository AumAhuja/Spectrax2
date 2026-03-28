export interface FrameData {
  timestamp: number;
  landmarks: any[];
  angles: Record<string, number>;
  feedback: string;
  exercise: string;
}

class SessionRecorder {
  private frames: FrameData[] = [];

  start() {
    this.frames = [];
  }

  recordFrame(frame: FrameData) {
    this.frames.push(frame);
  }

  download() {
    if (this.frames.length === 0) return;
    
    const exercise = this.frames[0]?.exercise || 'workout';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `spectrax_session_${exercise}_${timestamp}.json`;
    
    const dataStr = JSON.stringify(this.frames);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
}

export const sessionRecorder = new SessionRecorder();
