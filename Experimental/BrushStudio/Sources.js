// Sources.js — procedural brush shapes (tips) and grains, drawn into canvases and cached.
//
//   Tip(Id, { Hardness, Falloff, Invert, Variant })   128 px white-on-alpha stamp (variant for the random shapes)
//   TipVariants(Id)                                    how many distinct variants a shape has (1 or 6)
//   Grain(Id, { Invert, Brightness, Contrast })        256 px tileable grain, value in the alpha channel
//   GrainValues(...)                                   the same grain as a Float32Array (for the renderer's pixel pass)
//   ShapeThumb(Id) / GrainThumb(Id)                    small preview data-URLs for the pickers (cached)
//
// Nothing here is a bitmap file: every shape is a function of (x, y, seed), so the studio ships without image assets and
// imported brushes only carry ids.  `SetCanvasFactory` lets tests run without a DOM canvas.

import { sampleCurve } from "./Engine/BrushDynamics.js";

let Factory = (W, H) => Object.assign(document.createElement("canvas"), { width: W, height: H });
export const SetCanvasFactory = (F) => { Factory = F; TipCache.clear(); GrainCache.clear(); ThumbCache.clear(); };
export const MakeCanvas = (W, H) => Factory(W, H);

const TIP = 128, GRAIN = 256;
const Clamp = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, V));
const Smooth = (E0, E1, X) => { const T = Clamp((X - E0) / Math.max(1e-6, E1 - E0)); return T * T * (3 - 2 * T); };
const Fract = (X) => X - Math.floor(X);

// ------------------------------------------------------------------------------------------------ noise
function Hash(X, Y, S = 0) { return Fract(Math.sin(X * 127.1 + Y * 311.7 + S * 74.7) * 43758.5453); }
// Value noise that tiles with period P (so grains wrap seamlessly).
function Noise(X, Y, P, S = 0) {
  const Xi = Math.floor(X), Yi = Math.floor(Y), Xf = X - Xi, Yf = Y - Yi;
  const W = (A) => ((A % P) + P) % P;
  const U = Xf * Xf * (3 - 2 * Xf), V = Yf * Yf * (3 - 2 * Yf);
  const A = Hash(W(Xi), W(Yi), S), B = Hash(W(Xi + 1), W(Yi), S), C = Hash(W(Xi), W(Yi + 1), S), D = Hash(W(Xi + 1), W(Yi + 1), S);
  return A + (B - A) * U + (C - A) * V + (A - B - C + D) * U * V;
}
function Fbm(X, Y, P, Oct = 4, S = 0) {
  let Sum = 0, Amp = 0.5, F = 1, Norm = 0;
  for (let I = 0; I < Oct; I++) { Sum += Noise(X * F, Y * F, P * F, S + I * 13) * Amp; Norm += Amp; Amp *= 0.5; F *= 2; }
  return Sum / Norm;
}
// Tileable Worley (distance to nearest feature point), period P cells.
function Worley(X, Y, P, S = 0) {
  const Xi = Math.floor(X), Yi = Math.floor(Y);
  let D1 = 9, D2 = 9, Id = 0;
  for (let J = -1; J <= 1; J++) for (let I = -1; I <= 1; I++) {
    const Cx = Xi + I, Cy = Yi + J, Wx = ((Cx % P) + P) % P, Wy = ((Cy % P) + P) % P;
    const Px = Cx + Hash(Wx, Wy, S), Py = Cy + Hash(Wx, Wy, S + 5);
    const D = Math.hypot(Px - X, Py - Y);
    if (D < D1) { D2 = D1; D1 = D; Id = Hash(Wx, Wy, S + 9); } else if (D < D2) D2 = D;
  }
  return { D1, D2, Id };
}

// ------------------------------------------------------------------------------------------------ shapes
export const RANDOM_SHAPES = new Set(["bristle", "splatter", "spray", "blot", "cloud", "chalk", "pencil"]);
export const TipVariants = (Id) => (RANDOM_SHAPES.has(Id) ? 6 : 1);

// Coverage 0‥1 at (X, Y) ∈ [-1, 1]², before the hardness / falloff envelope.  Returns [coverage, radial distance].
function ShapeAt(Id, X, Y, S, Hard) {
  const R = Math.hypot(X, Y);
  const Edge = (D, W = 0.04) => 1 - Smooth(1 - W - (1 - Hard) * 0.55, 1, D);
  switch (Id) {
    case "hard": return [Edge(R, 0.02), R];
    case "square": { const D = Math.max(Math.abs(X), Math.abs(Y)) / 0.86; return [Edge(D, 0.03), D]; }
    case "flat": { const D = Math.max(Math.abs(X) / 0.92, Math.abs(Y) / 0.24); return [Edge(D, 0.06), Math.abs(Y) / 0.24]; }
    case "chalk": { const N = Fbm(X * 4 + 9, Y * 4, 64, 4, S); const D = R + (N - 0.5) * 0.5; return [Edge(D, 0.05) * Smooth(0.25, 0.55, Fbm(X * 14, Y * 14, 64, 3, S + 3)), R]; }
    case "pencil": { const N = Hash(Math.floor((X + 1) * 40), Math.floor((Y + 1) * 40), S); return [Edge(R, 0.2) * (0.35 + 0.65 * Smooth(0.25, 0.75, N)), R]; }
    case "bristle": {
      let C = 0;
      for (let I = 0; I < 15; I++) {
        const By = -0.85 + (I / 14) * 1.7 + (Hash(I, 1, S) - 0.5) * 0.08, Bx = (Hash(I, 2, S) - 0.5) * 0.35, Br = 0.08 + Hash(I, 3, S) * 0.07;
        C = Math.max(C, (1 - Smooth(Br * 0.5, Br, Math.hypot((X - Bx) * 0.75, Y - By))) * (0.55 + 0.45 * Hash(I, 4, S)));
      }
      return [C * Edge(R, 0.3), R];
    }
    case "splatter": {
      let C = 0;
      for (let I = 0; I < 18; I++) {
        const A = Hash(I, 1, S) * Math.PI * 2, Dd = Math.sqrt(Hash(I, 2, S)) * 0.78, Br = 0.04 + (1 - Dd) * 0.22 * Hash(I, 3, S);
        C = Math.max(C, 1 - Smooth(Br * 0.75, Br, Math.hypot(X - Math.cos(A) * Dd, Y - Math.sin(A) * Dd)));
      }
      return [C, R];
    }
    case "spray": {
      const Cell = 26, Cx = Math.floor((X + 1) * Cell), Cy = Math.floor((Y + 1) * Cell);
      const H = Hash(Cx, Cy, S), Dot = Math.hypot(Fract((X + 1) * Cell) - 0.5, Fract((Y + 1) * Cell) - 0.5);
      const Density = Math.exp(-R * R * 3.2);
      return [H < Density * 0.42 ? 1 - Smooth(0.16, 0.36, Dot) : 0, R];
    }
    case "leaf": { const W = Math.max(0, 1 - X * X) * 0.46; const D = Math.max(Math.abs(Y) / Math.max(1e-3, W), Math.abs(X)); return [Edge(D, 0.08) * (Math.abs(Y) < 0.012 ? 0.55 : 1), D]; }
    case "blot": { const A = Math.atan2(Y, X); const Rr = 0.72 + (Fbm(Math.cos(A) * 2 + 4, Math.sin(A) * 2 + 4, 64, 3, S) - 0.5) * 0.55; return [Edge(R / Rr, 0.03), R / Rr]; }
    case "cloud": { const N = Fbm(X * 2.2 + 3, Y * 2.2, 64, 5, S); return [Clamp((N - 0.2 - R * 0.62) * 2.6), R]; }
    case "star": { const D = 1 + PolyDist(X, Y, STAR) * 2.2; return [Edge(Math.max(0, D), 0.04), R]; }
    case "sparkle": {
      const Ax = Math.abs(X), Ay = Math.abs(Y);
      const Ray = Math.max(1 - Smooth(0, 0.07 * (1 - Ax), Ay) * 1, 1 - Smooth(0, 0.07 * (1 - Ay), Ax)) * (1 - Smooth(0.7, 1, Math.max(Ax, Ay)));
      return [Clamp(Math.max(Ray, 1 - Smooth(0.08, 0.3, R))), R];
    }
    case "hex": { const D = 1 + PolyDist(X, Y, HEXAGON) * 2.2; return [Edge(Math.max(0, D), 0.03), R]; }
    case "knife": { const U = X * 0.8 + Y * 0.6, V = -X * 0.6 + Y * 0.8; const D = Math.max(Math.abs(U) / 0.95, Math.abs(V + U * 0.12) / 0.1); return [Edge(D, 0.1), Math.abs(V) / 0.1]; }
    default: return [Edge(R, 0.02), R];   // round
  }
}

// Signed distance to a polygon (negative inside), for the star and hexagon tips.
const Ring = (N, Ro, Ri, Rot = -Math.PI / 2) => Array.from({ length: N * (Ri ? 2 : 1) }, (_, I) => { const R = Ri && I % 2 ? Ri : Ro, A = Rot + (I * Math.PI * 2) / (N * (Ri ? 2 : 1)); return [Math.cos(A) * R, Math.sin(A) * R]; });
const STAR = Ring(5, 0.96, 0.42), HEXAGON = Ring(6, 0.92, 0, 0);
function PolyDist(X, Y, V) {
  let D = Infinity, Inside = false;
  for (let I = 0, J = V.length - 1; I < V.length; J = I++) {
    const [Ax, Ay] = V[J], [Bx, By] = V[I];
    const Ex = Bx - Ax, Ey = By - Ay, T = Clamp(((X - Ax) * Ex + (Y - Ay) * Ey) / (Ex * Ex + Ey * Ey));
    D = Math.min(D, Math.hypot(X - Ax - Ex * T, Y - Ay - Ey * T));
    if ((Ay > Y) !== (By > Y) && X < ((Bx - Ax) * (Y - Ay)) / (By - Ay) + Ax) Inside = !Inside;
  }
  return Inside ? -D : D;
}

const TipCache = new Map();
export function Tip(Id, { Hardness = 0.8, Falloff = null, Invert = false, Variant = 0 } = {}) {
  const V = RANDOM_SHAPES.has(Id) ? Variant % 6 : 0;
  const Key = `${Id}|${Hardness.toFixed(2)}|${Falloff ? JSON.stringify(Falloff) : ""}|${Invert ? 1 : 0}|${V}`;
  if (TipCache.has(Key)) return TipCache.get(Key);
  const C = MakeCanvas(TIP, TIP), X = C.getContext("2d");
  if (X) {
    const Img = X.createImageData(TIP, TIP), D = Img.data;
    for (let J = 0; J < TIP; J++) for (let I = 0; I < TIP; I++) {
      const Px = ((I + 0.5) / TIP) * 2 - 1, Py = ((J + 0.5) / TIP) * 2 - 1;
      let [A, R] = ShapeAt(Id, Px, Py, V + 1, Hardness);
      // Round tips get the classic soft envelope; every tip gets the falloff curve (rim → centre).
      if (Id === "round") A = 1 - Smooth(Hardness * 0.97, 1, Math.hypot(Px, Py));
      if (Falloff) A *= sampleCurve(Falloff, Clamp(1 - R));
      if (Invert) A = (1 - A) * (Math.hypot(Px, Py) < 1 ? 1 : 0);
      const O = (J * TIP + I) * 4;
      D[O] = D[O + 1] = D[O + 2] = 255; D[O + 3] = Math.round(Clamp(A) * 255);
    }
    X.putImageData(Img, 0, 0);
  }
  if (TipCache.size > 160) TipCache.delete(TipCache.keys().next().value);
  TipCache.set(Key, C);
  return C;
}

// ------------------------------------------------------------------------------------------------ grains
function GrainAt(Id, U, V) {   // U, V ∈ [0, 1) — must tile
  const P = 8;
  switch (Id) {
    case "paper": return 0.55 + (Fbm(U * 16, V * 16, 16, 4, 1) - 0.5) * 0.9 + (Hash(Math.floor(U * 256), Math.floor(V * 256), 2) - 0.5) * 0.25;
    case "canvas": { const W = Math.sin(U * Math.PI * 64) * Math.sin(V * Math.PI * 64); return 0.55 + W * 0.32 + (Fbm(U * 32, V * 32, 32, 2, 3) - 0.5) * 0.4; }
    case "linen": { const H = Math.abs(Math.sin((V * 48 + Fbm(U * 8, V * 8, 8, 2, 4) * 0.8) * Math.PI)), Vv = Math.abs(Math.sin((U * 40 + Fbm(U * 8, V * 8, 8, 2, 5) * 0.8) * Math.PI)); return 0.25 + 0.4 * H ** 0.6 + 0.35 * Vv ** 0.6 * (Noise(U * 64, V * 4, 64, 6) > 0.4 ? 1 : 0.55); }
    case "concrete": { const B = Fbm(U * P, V * P, P, 5, 7); const W = Worley(U * 24, V * 24, 24, 8).D1; return B * 0.8 + 0.25 - (W < 0.12 ? 0.45 : 0); }
    case "charcoal": return Smooth(0.28, 0.75, Fbm(U * 4, V * 48, 4, 4, 9) * 0.6 + Fbm(U * 64, V * 64, 64, 2, 10) * 0.4);
    case "wood": { const R = V * 18 + Fbm(U * 4, V * 4, 4, 4, 11) * 2.5; return 0.4 + 0.45 * Smooth(0.2, 0.9, Math.abs(Math.sin(R * Math.PI))) + (Noise(U * 128, V * 4, 128, 12) - 0.5) * 0.3; }
    case "halftone": { const Cell = 24, X = Fract(U * Cell) - 0.5, Y = Fract(V * Cell) - 0.5, R = 0.18 + 0.2 * Fbm(U * 4, V * 4, 4, 2, 13); return 1 - Smooth(R - 0.05, R + 0.05, Math.hypot(X, Y)); }
    case "noise": return Hash(Math.floor(U * 256), Math.floor(V * 256), 14);
    case "sponge": { const W = Worley(U * 10, V * 10, 10, 15); return Smooth(0.08, 0.3, W.D2 - W.D1) * (0.6 + 0.4 * Fbm(U * 16, V * 16, 16, 3, 16)); }
    case "hatch": { const L = Math.abs(Fract((U + V) * 24) - 0.5) * 2, M = Math.abs(Fract((U - V) * 16) - 0.5) * 2; return Math.max(Smooth(0.55, 0.85, L), Smooth(0.7, 0.95, M) * 0.6) * (0.8 + 0.2 * Noise(U * 64, V * 64, 64, 17)); }
    case "flakes": { const W = Worley(U * 16, V * 16, 16, 18); return 0.3 + W.Id * 0.7 - (W.D2 - W.D1 < 0.06 ? 0.3 : 0); }
    default: return 1;
  }
}

const GrainCache = new Map();
export function GrainValues(Id, { Invert = false, Brightness = 0, Contrast = 0 } = {}) {
  const Key = `${Id}|${Invert ? 1 : 0}|${Brightness}|${Contrast}`;
  if (GrainCache.has(Key)) return GrainCache.get(Key);
  const Out = new Float32Array(GRAIN * GRAIN);
  const K = Contrast >= 0 ? 1 + (Contrast / 100) * 3 : 1 + Contrast / 100;
  for (let J = 0; J < GRAIN; J++) for (let I = 0; I < GRAIN; I++) {
    let G = Id === "none" ? 1 : Clamp(GrainAt(Id, I / GRAIN, J / GRAIN));
    if (Id !== "none") {
      if (Invert) G = 1 - G;
      G = Clamp((G - 0.5) * K + 0.5 + Brightness / 200);
    }
    Out[J * GRAIN + I] = G;
  }
  if (GrainCache.size > 24) GrainCache.delete(GrainCache.keys().next().value);
  GrainCache.set(Key, Out);
  return Out;
}
export const GRAIN_SIZE = GRAIN;

export function Grain(Id, Options = {}) {
  const Vals = GrainValues(Id, Options), C = MakeCanvas(GRAIN, GRAIN), X = C.getContext("2d");
  if (X) {
    const Img = X.createImageData(GRAIN, GRAIN);
    for (let I = 0; I < Vals.length; I++) { const O = I * 4; Img.data[O] = Img.data[O + 1] = Img.data[O + 2] = 255; Img.data[O + 3] = Math.round(Vals[I] * 255); }
    X.putImageData(Img, 0, 0);
  }
  return C;
}

// ------------------------------------------------------------------------------------------------ thumbnails
const ThumbCache = new Map();
function ToUrl(C) { try { return C.toDataURL("image/png"); } catch { return ""; } }
export function ShapeThumb(Id, Size = 44) {
  const Key = `s|${Id}|${Size}`;
  if (ThumbCache.has(Key)) return ThumbCache.get(Key);
  const C = MakeCanvas(Size, Size), X = C.getContext("2d");
  if (X) { X.drawImage(Tip(Id, { Hardness: Id === "round" ? 0.55 : 0.85 }), 2, 2, Size - 4, Size - 4); }
  const Url = ToUrl(C);
  ThumbCache.set(Key, Url);
  return Url;
}
export function GrainThumb(Id, Size = 44) {
  const Key = `g|${Id}|${Size}`;
  if (ThumbCache.has(Key)) return ThumbCache.get(Key);
  const Vals = GrainValues(Id), C = MakeCanvas(Size, Size), X = C.getContext("2d");
  if (X) {
    const Img = X.createImageData(Size, Size), Step = GRAIN / Size / 1.5;
    for (let J = 0; J < Size; J++) for (let I = 0; I < Size; I++) {
      const G = Vals[(Math.floor(J * Step) % GRAIN) * GRAIN + (Math.floor(I * Step) % GRAIN)], O = (J * Size + I) * 4, L = Math.round(30 + G * 200);
      Img.data[O] = Img.data[O + 1] = Img.data[O + 2] = L; Img.data[O + 3] = 255;
    }
    X.putImageData(Img, 0, 0);
  }
  const Url = ToUrl(C);
  ThumbCache.set(Key, Url);
  return Url;
}
