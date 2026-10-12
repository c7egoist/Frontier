// Procedural audio with WebAudio: engine, boost, impacts, train horn and UI ticks.
// No assets are loaded; everything is synthesised after the first user gesture.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass
    const eng = this.ctx;
    this.engGain = eng.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = eng.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engOsc1 = eng.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc2 = eng.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc2.detune.value = 7;
    const g2 = eng.createGain();
    g2.gain.value = 0.35;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start();
    this.engOsc2.start();

    // Shared noise buffer for impacts and whooshes
    const len = eng.sampleRate * 1.5;
    this.noise = eng.createBuffer(1, len, eng.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // speed in m/s, throttle 0..1, boosting bool
  engine(speed, throttle, boosting, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 60 + speed * 2.4 + (boosting ? 60 : 0);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + speed * 14 + throttle * 600, t, 0.1);
    this.engGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.05 + speed * 0.0008 : 0, t, 0.1);
  }

  _burst({ dur = 0.25, freq = 1200, q = 0.7, gain = 0.4, type = 'bandpass', sweep = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.value = freq;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start();
    src.stop(c.currentTime + dur + 0.05);
  }

  _tone({ freq, dur = 0.2, type = 'square', gain = 0.2, slide = null, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t0 = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  boost() { this._burst({ dur: 0.7, freq: 300, sweep: 4000, type: 'bandpass', q: 1.2, gain: 0.35 }); }
  impact(power = 1) { this._burst({ dur: 0.35, freq: 500, sweep: 80, type: 'lowpass', q: 0.8, gain: Math.min(0.9, 0.3 + power * 0.02) }); }
  bollard() { this.impact(14); this._tone({ freq: 180, slide: 60, dur: 0.25, type: 'triangle', gain: 0.3 }); }
  zip() {
    this._tone({ freq: 660, dur: 0.15, type: 'sine', gain: 0.18 });
    this._tone({ freq: 990, dur: 0.2, type: 'sine', gain: 0.14, delay: 0.06 });
  }
  jump() { this._burst({ dur: 0.5, freq: 600, sweep: 2400, type: 'bandpass', gain: 0.25 }); }
  land() { this.impact(8); }
  tick(high = false) { this._tone({ freq: high ? 1320 : 880, dur: 0.07, type: 'square', gain: 0.12 }); }
  go() { this._tone({ freq: 1760, dur: 0.35, type: 'square', gain: 0.16 }); }
  lane(n) { this._tone({ freq: 440 + n * 60, dur: 0.06, type: 'triangle', gain: 0.14 }); }
  horn() {
    this._tone({ freq: 196, dur: 1.4, type: 'sawtooth', gain: 0.10 });
    this._tone({ freq: 247, dur: 1.4, type: 'sawtooth', gain: 0.08 });
  }
  alarm() {
    for (let i = 0; i < 4; i++) this._tone({ freq: 900, dur: 0.12, type: 'square', gain: 0.07, delay: i * 0.25 });
  }
  finish() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.16, delay: i * 0.12 }));
  }
}
