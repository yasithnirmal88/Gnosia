// Levi — Ship AI Voice System
// Filenames match exactly: backend/src/main/resources/static/audio/levi/

import { backendUrl } from '../config/endpoints';

const BASE = `${backendUrl().replace('/game-ws', '')}/audio/levi`;

// ─── Audio Engine ─────────────────────────────────────────────────────────────

class LeviAudioEngine {
  constructor() {
    this.cache   = new Map();
    this.volume  = 0.85;
    this.enabled = true;
    this.currentLoop = null;
  }

  async play(filename, gapMs = 400) {
    if (!this.enabled) return;
    const url = `${BASE}/${filename}.mp3`;

    return new Promise((resolve) => {
      let audio = this.cache.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.volume = this.volume;
        this.cache.set(url, audio);
      }
      audio.currentTime = 0;
      audio.onended = () => setTimeout(resolve, gapMs);
      audio.onerror = () => {
        console.warn(`[Levi] Not found: "${filename}.mp3"`);
        resolve(); // silent fail — game never breaks
      };
      audio.play().catch(() => resolve());
    });
  }

  // Background Music Loop logic (if needed for backward compatibility)
  playBackground(/* legacy: loop handles are unused */) {
    if (this.currentLoop) {
      this.currentLoop.pause();
      this.currentLoop.currentTime = 0;
    }
    // Note: The requested rewrite focuses on narrator lines.
    // If you need music loops, add them here.
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.cache.forEach(a => (a.volume = this.volume));
  }

  mute()   { this.enabled = false; }
  unmute() { this.enabled = true;  }

  /** Resume all cached audio elements (call on user gesture for autoplay policy) */
  resumeAll() {
    this.cache.forEach((audio) => {
      if (audio.paused && audio.src) {
        audio.play().catch(() => {});
      }
    });
  }
}

const engine = new LeviAudioEngine();

// ─── Scenario API ─────────────────────────────────────────────────────────────

export const LeviAudio = {

  engine,
  resumeAll: () => engine.resumeAll(),

  /** Backward compatibility for UseGame phase mapping */
  play(phase) {
    // This is called by useGame effect. 
    // Usually mapping to background music, which is handled separately now.
    console.log(`[Levi] Phase transition: ${phase}`);
  },
};