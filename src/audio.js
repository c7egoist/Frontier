// Procedural synthwave score + SFX. No assets, everything generated live.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const CHORDS = [
  { root: 45, notes: [45, 48, 52, 57] },   // Am
  { root: 41, notes: [41, 45, 48, 53] },   // F
  { root: 48, notes: [48, 52, 55, 60] },   // C
  { root: 43, notes: [43, 47, 50, 55] },   // G
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.intensity = 0;
    this.bpm = 132;
    this.step = 0;
    this.nextTime = 0;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);

      // shared noise buffer
      const len = ctx.sampleRate * 1.0;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.step = 0;
      this.nextTime = ctx.currentTime + 0.12;
      this.chordIdx = 0;
      this.resume();
    } catch (e) {
      console.warn('audio unavailable', e);
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0.0, this.ctx.currentTime, 0.05);
    return this.enabled;
  }

  /* --------------------------------------------------------- utilities */
  noise(t, dur, freq = 4000, gain = 0.2, type = 'highpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  blip(t, f0, f1, dur, gain = 0.22, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ------------------------------------------------------------- music */
  update(dt, intensity) {
    if (!this.ctx || !this.musicOn) return;
    this.intensity = intensity;
    const ctx = this.ctx;
    const spb = 60 / this.bpm / 4;
    const now = ctx.currentTime;
    let guard = 0;
    while (this.nextTime < now + 0.28 && guard++ < 40) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  schedule(step, t) {
    const s = step % 16;
    const bar = (step / 16) | 0;
    const chord = CHORDS[(bar + Math.floor(step / 16)) % CHORDS.length];
    const I = this.intensity;
    const ctx = this.ctx;

    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.noise(t, 0.045, 8200, 0.045 + I * 0.03);

    // bass: driving eighths
    if (s % 2 === 0) {
      const oct = s % 8 === 6 ? 12 : 0;
      this.bass(t, chord.root + oct, 0.16);
    }
    // arpeggio
    if (I > 0.08 && (s % 1 === 0)) {
      const seq = chord.notes;
      const n = seq[(s + (bar * 2)) % seq.length] + 12;
      this.arp(t, n, 0.1, 0.055 + I * 0.05);
    }
    // pad on bar start
    if (s === 0) this.pad(t, chord.notes, 1.9);

    void ctx;
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.24);
  }

  snare(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(t, Math.random() * 0.4); src.stop(t + 0.16);
  }

  bass(t, note, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = midi(note);
    o2.frequency.value = midi(note) * 0.5;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900 + this.intensity * 1400, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    f.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  arp(t, note, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = midi(note);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pad(t, notes, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.5);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    f.connect(g); g.connect(this.musicGain);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n + 12);
        o.detune.value = det;
        o.connect(f);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  /* ---------------------------------------------------------------- sfx */
  coin() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 1250, 1900, 0.09, 0.13, 'square');
    this.blip(t + 0.03, 1900, 2500, 0.08, 0.07, 'sine');
  }

  jump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 240, 760, 0.2, 0.16, 'sine');
    this.noise(t, 0.16, 3000, 0.06);
  }

  land(force = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 150, 55, 0.18, 0.2 * Math.min(1.4, force), 'sine');
    this.noise(t, 0.14, 1200, 0.1, 'lowpass');
  }

  launch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 320, 1100, 0.3, 0.16, 'sawtooth');
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.5, 900, 0.42, 'lowpass');
    this.noise(t, 0.24, 4200, 0.24);
    this.blip(t, 220, 40, 0.5, 0.3, 'sawtooth');
  }

  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 110, 720, 0.55, 0.2, 'sawtooth');
    this.noise(t, 0.5, 2400, 0.1);
  }

  skid() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.16, 2600, 0.09, 'bandpass');
  }

  padHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 700, 1600, 0.16, 0.14, 'square');
  }

  ui() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 900, 1400, 0.07, 0.1, 'square');
  }

  gameOver() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 400, 90, 1.1, 0.24, 'sawtooth');
    this.noise(t, 0.9, 700, 0.18, 'lowpass');
  }

  countdown() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(t, 660, 660, 0.12, 0.16, 'square');
  }
}
