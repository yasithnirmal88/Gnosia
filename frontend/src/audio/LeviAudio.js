// Levi — Ship AI Voice System
// Filenames match exactly: backend/src/main/resources/static/audio/levi/

const BASE = '/audio/levi';

// ─── Lookup Tables ────────────────────────────────────────────────────────────

// e.g. 7crw.lobby.mp3
const CREW_FILES = {
  3:  '3crw.lobby',
  4:  '4crw.lobby',
  5:  '5crw.lobby',
  6:  '6crw.lobby',
  7:  '7crw.lobby',
  8:  '8crw.lobby',
  9:  '9crw.lobby',
  10: '10crw.lobby',
  11: '11crw.lobby',
  12: '12crw.lobby',
  13: '13crw.lobby',
  14: '14crw.lobby',
  15: '15crw.lobby',
};

// e.g. 2g.lobby.mp3
const GNOSIA_FILES = {
  1: '1g.lobby',
  2: '2g.lobby',
  3: '3g.lobby',
  4: '4g.lobby',
};

// Key = roles sorted alphabetically, joined by comma
// e.g. Engineer.doctor.roles.mp3
const ROLE_FILES = {
  'engineer':                       'Engineer.roles',
  'doctor':                         'doctor.roles',
  'doctor,engineer':                'Engineer,doctor.roles',
  'engineer,guardian_angel':        'Engineer,guardianangel.roles',
  'doctor,guardian_angel':          'doctor,guardianangel.roles',
  'doctor,engineer,guardian_angel': 'Engineer,doctor,guardianangel.roles',
};

// e.g. Jina.coldsleep.mp3
const COLD_SLEEP_FILES = {
  chipie:     'Chipie.coldsleep',
  comet:      'Comet.coldsleep',
  jina:       'Jina.coldsleep',
  jonas:      'Jonas.coldsleep',
  kukurushka: 'Kukurushka.coldsleep',
  otome:      'Otome.coldsleep',
  raqio:      'Raqio.coldsleep',
  remnan:     'Remnan.coldsleep',
  setsu:      'Setsu.coldsleep',
  'sha-ming': 'Sha-ming.coldsleep',
  shigemichi: 'Shigemichi.coldsleep',
  sq:         'SQ.coldsleep',
  stella:     'Stella.coldsleep',
  yuri:       'Yuri.coldsleep',
  yuriko:     'Yuriko.coldsleep',
};

// e.g. Jina.presence.mp3
const WARP_MISSING_FILES = {
  chipie:     'Chipie.presence',
  comet:      'Comet.presence',
  jina:       'Jina.presence',
  jonas:      'Jonas.presence',
  kukurushka: 'Kukurushka.presence',
  otome:      'Otome.presence',
  raqio:      'Raqio.presence',
  remnan:     'Remnan.presence',
  setsu:      'Setsu.presence',
  'sha-ming': 'Sha-ming.presence',
  shigemichi: 'Shigemichi.presence',
  sq:         'SQ.presence',
  stella:     'Stella.presence',
  yuri:       'Yuri.presence',
  yuriko:     'Yuriko.presence',
};

const SPECIAL = {
  warp:           'warp',
  start_voting:   'start.voting',
  end_voting:     'end.voting',
  victory_human:  'victory_human',
  victory_gnosia: 'victory_gnosia',
};

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
  playBackground(type) {
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
}

const engine = new LeviAudioEngine();

// ─── Scenario API ─────────────────────────────────────────────────────────────

export const LeviAudio = {

  engine,

  /** Backward compatibility for UseGame phase mapping */
  play(phase) {
    // This is called by useGame effect. 
    // Usually mapping to background music, which is handled separately now.
    console.log(`[Levi] Phase transition: ${phase}`);
  },

  playEffect(filename) {
    // This is called by the LEVI_ANNOUNCEMENT event
    // The filename from backend is now expected to have .mp3 suffix removed for the engine
    const cleanName = filename.replace('.mp3', '');
    engine.play(cleanName);
  },

  /** "Seven crew members are confirmed aboard." */
  async announceCrewCount(count) {
    const f = CREW_FILES[count];
    if (!f) return console.warn(`[Levi] No crew file for count: ${count}`);
    await engine.play(f);
  },

  /** "Two Gnosia infectees have been detected." */
  async announceGnosia(count) {
    const f = GNOSIA_FILES[count];
    if (!f) return console.warn(`[Levi] No gnosia file for count: ${count}`);
    await engine.play(f);
  },

  /**
   * "There appears to be an Engineer and a Doctor on board."
   * @param {string[]} roles  e.g. ['engineer', 'doctor', 'guardian_angel']
   */
  async announceRoles(roles = []) {
    const key = [...roles].map(r => r.toLowerCase()).sort().join(',');
    const f   = ROLE_FILES[key];
    if (!f) return console.warn(`[Levi] No roles file for combo: "${key}"`);
    await engine.play(f);
  },

  /** Full round start: crew count → gnosia count → roles */
  async announceRoundStart(crewCount, gnosiaCount, roles = []) {
    await LeviAudio.announceCrewCount(crewCount);
    await LeviAudio.announceGnosia(gnosiaCount);
    if (roles.length > 0) await LeviAudio.announceRoles(roles);
  },

  /** "Jina will be put into cold sleep." */
  async announceColdSleep(playerName) {
    const f = COLD_SLEEP_FILES[playerName.toLowerCase()];
    if (!f) return console.warn(`[Levi] No cold sleep file for: ${playerName}`);
    await engine.play(f);
  },

  /**
   * Warp sequence → then one line per missing player.
   * @param {string[]} missingPlayers  e.g. ['setsu', 'jina']
   */
  async announceWarp(missingPlayers = []) {
    await engine.play(SPECIAL.warp);
    for (const name of missingPlayers) {
      const f = WARP_MISSING_FILES[name.toLowerCase()];
      if (!f) { console.warn(`[Levi] No presence file for: ${name}`); continue; }
      await engine.play(f);
    }
  },

  /** Voting phase started */
  async announceVotingStart() {
    await engine.play(SPECIAL.start_voting);
  },

  /** Voting phase ended */
  async announceVotingEnd() {
    await engine.play(SPECIAL.end_voting);
  },

  /** Crew wins */
  async announceCrewWin() {
    await engine.play(SPECIAL.victory_human);
  },

  /** Gnosia wins */
  async announceGnosiaWin() {
    await engine.play(SPECIAL.victory_gnosia);
  },
};
