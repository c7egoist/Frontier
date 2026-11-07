// Tiny procedural sound: engine hum, drift hiss, a few blips. No assets.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6; this.master.connect(ctx.destination);

    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 55; o2.frequency.value = 56;
    f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 1.5;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(this.engGain); this.engGain.connect(this.master); o1.start(); o2.start();
    this.eng = { o1, o2, f };

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8;
    this.driftGain = ctx.createGain(); this.driftGain.gain.value = 0;
    ns.connect(nf); nf.connect(this.driftGain); this.driftGain.connect(this.master); ns.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05); }
  engine(ratio, on) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.eng.o1.frequency.setTargetAtTime(45 + 120 * ratio, t, 0.1);
    this.eng.o2.frequency.setTargetAtTime(46 + 121 * ratio, t, 0.1);
    this.eng.f.frequency.setTargetAtTime(240 + 1300 * ratio, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.25);
  }
  drift(on) { if (this.ctx) this.driftGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.06); }
  blip(f0, f1, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, vol, freq = 800, q = 0.5) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.02);
  }
  coin() { this.blip(880, 1320, 0.11, 'sine', 0.12); }
  jump() { this.burst(0.18, 0.12, 600, 0.6); this.blip(220, 440, 0.15, 'triangle', 0.08); }
  land() { this.burst(0.14, 0.18, 300, 0.8); }
  hit() { this.blip(150, 40, 0.3, 'triangle', 0.5); this.burst(0.3, 0.4, 500, 0.4); }
  bump() { this.blip(300, 120, 0.12, 'triangle', 0.25); }
  boost() { this.blip(300, 900, 0.35, 'sawtooth', 0.09); }
  fall() { this.blip(500, 70, 0.7, 'sine', 0.3); }
  heart() { this.blip(660, 660, 0.1, 'sine', 0.15); this.blip(880, 880, 0.1, 'sine', 0.15, 0.1); this.blip(1320, 1320, 0.18, 'sine', 0.15, 0.2); }
  trick() { this.blip(700, 1050, 0.08, 'square', 0.05); this.blip(1050, 1400, 0.1, 'square', 0.05, 0.08); }
  scrape() { this.burst(0.08, 0.1, 2500, 1.5); }
}
