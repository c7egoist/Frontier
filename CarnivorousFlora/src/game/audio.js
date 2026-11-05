import * as THREE from 'three';

/** Fully procedural audio (no assets): wind bed, rustles, roars, bites. Positional via PannerNode. */
export class AudioEngine {
  constructor(camera) {
    this.camera = camera; this.ctx = null; this.enabled = true;
    this._fwd = new THREE.Vector3(); this._up = new THREE.Vector3();
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { // pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    this.noiseBuf = buf;
    // wind bed
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.28;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
    // insect shimmer
    const s2 = ctx.createBufferSource(); s2.buffer = buf; s2.loop = true; s2.playbackRate.value = 1.7;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 5200; hp.Q.value = 8;
    const g2 = ctx.createGain(); g2.gain.value = 0.06;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 7; const lg2 = ctx.createGain(); lg2.gain.value = 0.04; lfo2.connect(lg2); lg2.connect(g2.gain); lfo2.start();
    s2.connect(hp); hp.connect(g2); g2.connect(this.master); s2.start();
    // low ominous drone, level driven by proximity of danger
    this.drone = ctx.createOscillator(); this.drone.type = 'sawtooth'; this.drone.frequency.value = 48;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 140;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    this.drone.connect(dl); dl.connect(this.droneGain); this.droneGain.connect(this.master); this.drone.start();
  }

  setDanger(v) { if (this.ctx) this.droneGain.gain.setTargetAtTime(Math.min(0.16, v * 0.16), this.ctx.currentTime, 0.4); }

  update() {
    if (!this.ctx) return;
    const l = this.ctx.listener, c = this.camera;
    this._fwd.set(0, 0, -1).applyQuaternion(c.quaternion); this._up.set(0, 1, 0).applyQuaternion(c.quaternion);
    if (l.positionX) {
      l.positionX.value = c.position.x; l.positionY.value = c.position.y; l.positionZ.value = c.position.z;
      l.forwardX.value = this._fwd.x; l.forwardY.value = this._fwd.y; l.forwardZ.value = this._fwd.z;
      l.upX.value = this._up.x; l.upY.value = this._up.y; l.upZ.value = this._up.z;
    }
  }

  _panner(pos) {
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 8; p.rolloffFactor = 1.2; p.maxDistance = 400;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y + 6; p.positionZ.value = pos.z; }
    p.connect(this.master); return p;
  }

  _noise(dest, t, dur, { freq = 800, q = 1, type = 'bandpass', gain = 0.5, attack = 0.01, sweepTo = null, rate = 1 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  stir(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, p = this._panner(pos);
    this._noise(p, t, 1.4, { freq: 1800, q: 0.8, gain: 0.35, attack: 0.4, sweepTo: 4200, rate: 1.4 });
    this._noise(p, t + 0.2, 1.0, { freq: 300, type: 'lowpass', gain: 0.5, attack: 0.3 });
  }

  roar(pos, power = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, p = this._panner(pos);
    const dur = 1.3 * power + 0.4;
    for (const [f0, f1, type, vol] of [[95, 55, 'sawtooth', 0.34], [190, 85, 'square', 0.12], [47, 38, 'sawtooth', 0.3]]) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * power, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const vib = ctx.createOscillator(); vib.frequency.value = 22; const vg = ctx.createGain(); vg.gain.value = f0 * 0.05; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur);
      o.connect(fl); fl.connect(g); g.connect(p); o.start(t); o.stop(t + dur + 0.1);
    }
    this._noise(p, t, dur, { freq: 1400, q: 0.6, gain: 0.5 * power, sweepTo: 300 });
  }

  bite(pos, power = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, p = this._panner(pos);
    this._noise(p, t, 0.28, { freq: 2400, q: 0.7, gain: 0.8 * power, attack: 0.004, sweepTo: 200 });
    this._noise(p, t, 0.4, { freq: 160, type: 'lowpass', gain: 1.0 * power, attack: 0.004 });
  }

  gulp(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, p = this._panner(pos);
    for (let i = 0; i < 3; i++) this._noise(p, t + i * 0.28, 0.25, { freq: 220, type: 'lowpass', gain: 0.9, attack: 0.03, sweepTo: 70 });
  }
}
