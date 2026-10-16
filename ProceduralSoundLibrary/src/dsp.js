// Procedural DSP primitives. Pure JavaScript, no Node or DOM APIs, so the same
// module runs in the browser (Web Audio playback in ui/) and in Node (WAV export
// in src/render-library.mjs). Every generator is deterministic for a given seed.

export const TAU = Math.PI * 2;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const db2lin = (db) => Math.pow(10, db / 20);
export const lin2db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

// ---------------------------------------------------------------- random ----

// Mulberry32 with a small helper API. Same seed => same sound, always.
export function rng(seed = 1) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss() {
      let u = 0;
      while (u === 0) u = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * next());
    },
    // exponential inter-arrival time with the given mean (Poisson process)
    expo: (mean) => -Math.log(1 - next()) * mean,
  };
}

// ---------------------------------------------------------------- buffers ---

export const samplesFor = (sec, sr) => Math.max(1, Math.round(sec * sr));
export const alloc = (n) => new Float32Array(Math.max(1, Math.floor(n)));

export function fill(n, fn) {
  const a = alloc(n);
  for (let i = 0; i < n; i++) a[i] = fn(i);
  return a;
}

// Add src into dst starting at sample offset `at` (may be negative or past end).
export function addAt(dst, src, at, gain = 1) {
  const o = Math.round(at);
  const s0 = Math.max(0, -o);
  const d0 = o + s0;
  const n = Math.min(src.length - s0, dst.length - d0);
  for (let i = 0; i < n; i++) dst[d0 + i] += src[s0 + i] * gain;
  return dst;
}

export function scaleInPlace(x, g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function mixOf(...bufs) {
  const n = Math.max(...bufs.map((b) => b.length));
  const out = alloc(n);
  for (const b of bufs) addAt(out, b, 0, 1);
  return out;
}

// ------------------------------------------------------------------ noise ---

export function whiteNoise(n, r) {
  return fill(n, () => r.next() * 2 - 1);
}

// Paul Kellet's pink-noise filter (about -3 dB/octave).
export function pinkNoise(n, r) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return fill(n, () => {
    const w = r.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    return out;
  });
}

export function brownNoise(n, r) {
  let x = 0;
  return fill(n, () => {
    x = clamp(x * 0.998 + (r.next() * 2 - 1) * 0.06, -1, 1);
    return x;
  });
}

// ---------------------------------------------------------------- filters ---

// RBJ biquad (lowpass / highpass / bandpass, constant 0 dB peak gain). `fc` may be
// a number or a per-sample array, which is how sweeps (scratches, creaks, tyre
// drift) are expressed. Unlike a Chamberlin SVF this stays stable up to Nyquist.
export function svf(x, fc, q, sr, mode = "bp") {
  const out = alloc(x.length);
  const Q = Math.max(0.3, q);
  const nyq = sr * 0.49;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let lastF = -1;
  for (let i = 0; i < x.length; i++) {
    const f = typeof fc === "number" ? fc : fc[i];
    const fq = Math.min(Math.max(f, 5), nyq);
    if (fq !== lastF) {
      lastF = fq;
      const w0 = (TAU * fq) / sr;
      const cw = Math.cos(w0);
      const alpha = Math.sin(w0) / (2 * Q);
      const a0 = 1 + alpha;
      a1 = (-2 * cw) / a0;
      a2 = (1 - alpha) / a0;
      if (mode === "lp") {
        b0 = (1 - cw) / 2 / a0;
        b1 = (1 - cw) / a0;
        b2 = b0;
      } else if (mode === "hp") {
        b0 = (1 + cw) / 2 / a0;
        b1 = -(1 + cw) / a0;
        b2 = b0;
      } else {
        b0 = alpha / a0;
        b1 = 0;
        b2 = -alpha / a0;
      }
    }
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi;
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

export function lowpass(x, fc, sr) {
  return svf(x, fc, 0.5, sr, "lp");
}
export function highpass(x, fc, sr) {
  return svf(x, fc, 0.5, sr, "hp");
}
export function bandpass(x, fc, q, sr) {
  return svf(x, fc, q, sr, "bp");
}

// -------------------------------------------------------------- envelopes ---

export function expDecay(n, sr, tau) {
  const k = Math.exp(-1 / (Math.max(tau, 1e-5) * sr));
  const out = alloc(n);
  let v = 1;
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v *= k;
  }
  return out;
}

export function applyFade(x, sr, fadeIn = 0.002, fadeOut = 0.01) {
  const fi = Math.min(x.length >> 1, Math.round(fadeIn * sr));
  const fo = Math.min(x.length >> 1, Math.round(fadeOut * sr));
  for (let i = 0; i < fi; i++) x[i] *= i / fi;
  for (let i = 0; i < fo; i++) x[x.length - 1 - i] *= i / fo;
  return x;
}

export function softClip(x, drive = 1) {
  const norm = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) / norm;
  return x;
}

// ----------------------------------------------------------- oscillators ----

// Phase-accumulated additive tone with an arbitrary per-sample frequency.
// harmonics: [[multiple, amplitude], ...]; harmonics above Nyquist are skipped.
export function tone(n, sr, freqFn, harmonics = [[1, 1]], phase0 = 0) {
  const out = alloc(n);
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    const f = freqFn(i);
    ph += (TAU * f) / sr;
    if (ph > TAU * 1000) ph -= TAU * 1000;
    let v = 0;
    for (const [k, a] of harmonics) {
      if (k * f < sr * 0.45) v += a * Math.sin(k * ph);
    }
    out[i] = v;
  }
  return out;
}

// Sawtooth in [-1, 1] from a phase given in cycles (stick-slip driver).
export const saw = (cycles) => 2 * (cycles - Math.floor(cycles)) - 1;

// Integrate a per-sample frequency into a running cycle count.
export function cyclesOf(n, sr, freqFn, cycle0 = 0) {
  const out = alloc(n);
  let c = cycle0;
  for (let i = 0; i < n; i++) {
    c += freqFn(i) / sr;
    out[i] = c;
  }
  return out;
}

// ----------------------------------------------------------------- modal ----

// Excite a bank of damped resonators with an impulse at `at` (sample index).
// modes: [{ f: Hz, t60: seconds, a: amplitude }].
// Exact sampled recurrence: h[n] = A r^n sin(w (n+1)), no per-sample sin() calls.
export function modal(dst, at, sr, modes, gain = 1, maxSec = 6) {
  for (const m of modes) {
    if (!(m.f > 15) || m.f >= sr * 0.45 || !(m.t60 > 0)) continue;
    const tau = m.t60 / 6.9078;
    const r = Math.exp(-1 / (tau * sr));
    const w = (TAU * m.f) / sr;
    const c = 2 * r * Math.cos(w);
    const d = r * r;
    const len = Math.min(
      Math.round(9.2 * tau * sr),
      Math.round(maxSec * sr),
      dst.length - Math.max(0, Math.round(at))
    );
    const o = Math.max(0, Math.round(at));
    if (len <= 0) continue;
    const A = gain * m.a;
    let y2 = A * Math.sin(w);            // y[0]
    let y1 = A * r * Math.sin(2 * w);    // y[1]
    dst[o] += y2;
    if (len > 1) dst[o + 1] += y1;
    for (let n = 2; n < len; n++) {
      const y = c * y1 - d * y2;
      dst[o + n] += y;
      y2 = y1;
      y1 = y;
    }
  }
  return dst;
}

// Very short noise-or-click transient used for contact moments.
export function click(r, sr, tauSec, fcHz, q = 1.2, amp = 1, n = null) {
  const len = n ?? samplesFor(Math.max(0.002, tauSec * 7), sr);
  const env = expDecay(len, sr, tauSec);
  const noise = whiteNoise(len, r);
  const shaped = bandpass(noise, fcHz, q, sr);
  for (let i = 0; i < len; i++) shaped[i] *= env[i] * amp;
  return shaped;
}

// ------------------------------------------------------------ reverb/space --

// Schroeder-style room tail. mix 0..1, decaySec = RT60-ish, damp 0..1 (higher = darker).
export function reverb(x, sr, { mix = 0.2, decaySec = 1.2, damp = 0.5 } = {}) {
  if (mix <= 0.001) return x;
  const tail = Math.round(decaySec * 2.5 * sr);
  const total = x.length + tail;
  const scale = sr / 44100;
  const combDelays = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) =>
    Math.max(8, Math.round(d * scale))
  );
  const wet = alloc(total);
  for (const D of combDelays) {
    const buf = alloc(D);
    const g = Math.pow(0.001, D / sr / Math.max(0.05, decaySec));
    let idx = 0, lp = 0;
    for (let n = 0; n < total; n++) {
      const inp = n < x.length ? x[n] : 0;
      const y = buf[idx];
      lp = y * (1 - damp) + lp * damp;
      buf[idx] = inp + lp * g;
      idx = (idx + 1) % D;
      wet[n] += y * 0.125;
    }
  }
  const apDelays = [556, 441, 341, 225].map((d) => Math.max(4, Math.round(d * scale)));
  let stage = wet;
  for (const D of apDelays) {
    const buf = alloc(D);
    const out = alloc(total);
    const g = 0.5;
    let idx = 0;
    for (let n = 0; n < total; n++) {
      const inp = stage[n];
      const v = buf[idx];
      const o = -g * inp + v;
      buf[idx] = inp + g * o;
      idx = (idx + 1) % D;
      out[n] = o;
    }
    stage = out;
  }
  const res = alloc(total);
  for (let n = 0; n < total; n++) {
    res[n] = (n < x.length ? x[n] : 0) * (1 - mix * 0.5) + stage[n] * mix * 0.9;
  }
  return res;
}

// ------------------------------------------------------------- analysis -----

// Iterative radix-2 FFT magnitude of a Hann-windowed frame (length power of 2).
export function spectrum(frame) {
  const n = frame.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((TAU * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-TAU) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const mags = new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) mags[k] = Math.hypot(re[k], im[k]) / n;
  return mags;
}

export function measure(x, sr) {
  let peak = 0, sum = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    sum += x[i] * x[i];
  }
  const rms = Math.sqrt(sum / x.length);
  const N = 2048, hop = 1024;
  const acc = new Float64Array(N / 2);
  let frames = 0;
  for (let s = 0; s + N <= x.length && frames < 96; s += hop) {
    const mag = spectrum(x.subarray(s, s + N));
    for (let k = 0; k < mag.length; k++) acc[k] += mag[k];
    frames++;
  }
  let num = 0, den = 0;
  for (let k = 1; k < acc.length; k++) {
    num += acc[k] * ((k * sr) / N);
    den += acc[k];
  }
  return {
    durationSec: x.length / sr,
    peakDb: lin2db(peak),
    rmsDb: lin2db(rms),
    centroidHz: den > 0 ? num / den : 0,
  };
}

// ---------------------------------------------------------------- output ----

export function normalizePeak(x, peak = 0.89) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 1e-9) scaleInPlace(x, peak / m);
  return x;
}

// Encode mono float PCM as a 16-bit WAV file (Uint8Array).
export function encodeWav(x, sr) {
  const dataBytes = x.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < x.length; i++) {
    const s = clamp(x[i], -1, 1);
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}
