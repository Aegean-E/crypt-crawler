/**
 * Synthesizes retro dark fantasy sound effects and continuous procedural ambient music
 * using the Web Audio API. Zero external audio assets required.
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.sfxMuted = false;
    this.musicMuted = false;
    this.musicPlaying = false;
    this.musicNodes = [];
    this.chimeTimer = null;
    this.pulseTimer = null;
    this.musicGain = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggleSFX() {
    this.sfxMuted = !this.sfxMuted;
    return this.sfxMuted;
  }

  toggleMusic() {
    this.musicMuted = !this.musicMuted;
    if (this.musicMuted) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.musicMuted;
  }

  // -------------------------------------------------------------
  // Procedural Dark Ambient Music Engine
  // -------------------------------------------------------------
  startMusic() {
    if (this.musicMuted || this.musicPlaying) return;
    this.init();
    if (!this.ctx) return;

    this.musicPlaying = true;
    const now = this.ctx.currentTime;

    // Master music gain
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.001, now);
    this.musicGain.gain.linearRampToValueAtTime(0.09, now + 2.5);
    this.musicGain.connect(this.ctx.destination);

    // 1. Deep Sub-Bass Drone (D2 / 73.4 Hz + A1 / 55 Hz)
    const drone1 = this.ctx.createOscillator();
    const drone2 = this.ctx.createOscillator();
    const droneFilter = this.ctx.createBiquadFilter();

    drone1.type = "sawtooth";
    drone1.frequency.setValueAtTime(55.0, now); // A1
    drone2.type = "sine";
    drone2.frequency.setValueAtTime(73.4, now); // D2

    droneFilter.type = "lowpass";
    droneFilter.frequency.setValueAtTime(140, now);
    droneFilter.Q.setValueAtTime(3.0, now);

    // Subtle LFO filter sweep
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.15, now); // slow 0.15 Hz sweep
    lfoGain.gain.setValueAtTime(45, now);
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);

    drone1.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(this.musicGain);

    drone1.start(now);
    drone2.start(now);
    lfo.start(now);

    this.musicNodes = [drone1, drone2, lfo, droneFilter, this.musicGain];

    // 2. Haunting Ethereal Bell / Chime Arpeggiator (D-minor pentatonic / Dorian)
    const scale = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00, 440.00];
    const triggerChime = () => {
      if (!this.musicPlaying || this.musicMuted || !this.ctx) return;
      const freq = scale[Math.floor(Math.random() * scale.length)];
      this._playAmbientChime(freq);

      // Random spacing between notes (1.6s to 3.2s)
      const nextDelay = 1600 + Math.random() * 1600;
      this.chimeTimer = setTimeout(triggerChime, nextDelay);
    };
    this.chimeTimer = setTimeout(triggerChime, 1200);

    // 3. Low Catacomb Heartbeat Pulse (every ~3.8 seconds)
    const triggerPulse = () => {
      if (!this.musicPlaying || this.musicMuted || !this.ctx) return;
      this._playDungeonPulse();
      this.pulseTimer = setTimeout(triggerPulse, 3800);
    };
    this.pulseTimer = setTimeout(triggerPulse, 2000);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.chimeTimer) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }

    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.linearRampToValueAtTime(0.001, now + 1.0);
      setTimeout(() => {
        this.musicNodes.forEach((node) => {
          try {
            if (node.stop) node.stop();
            if (node.disconnect) node.disconnect();
          } catch (_) {}
        });
        this.musicNodes = [];
      }, 1100);
    }
  }

  _playAmbientChime(freq) {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    overtone.type = "triangle";
    overtone.frequency.setValueAtTime(freq * 2.01, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

    osc.connect(gain);
    overtone.connect(gain);
    gain.connect(this.musicGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 2.3);
    overtone.stop(now + 2.3);
  }

  _playDungeonPulse() {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(52, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  // -------------------------------------------------------------
  // Sound Effects
  // -------------------------------------------------------------
  playStep() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playHit(isCrit = false) {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isCrit ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(isCrit ? 260 : 160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + (isCrit ? 0.25 : 0.15));

    gain.gain.setValueAtTime(isCrit ? 0.25 : 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.25 : 0.15));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isCrit ? 0.26 : 0.16));
  }

  playStun() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(280, now + 0.08);
    osc.frequency.setValueAtTime(140, now + 0.16);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  playShieldWall() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.31);
  }

  playSpell(spellType = "fireball") {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (spellType === "fireball") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    } else {
      // Heal
      osc.type = "sine";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.3);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  playPotion() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.08, 0.16].forEach((delay, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300 + idx * 120, now + delay);
      osc.frequency.exponentialRampToValueAtTime(450 + idx * 120, now + delay + 0.06);

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
    });
  }

  playShrine() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [220, 277.18, 329.63, 440].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.42);
    });
  }

  playUrn() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  playLevelUp() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.1;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  playChest() {
    if (this.sfxMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(480, now + 0.1);
    osc.frequency.setValueAtTime(640, now + 0.2);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }
}

export const sounds = new SoundSystem();
