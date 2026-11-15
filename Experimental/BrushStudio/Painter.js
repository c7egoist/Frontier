// Painter.js — canvas rendering for the Drawing Pad: brush strokes (all six rendering modes, grain, wet / burnt edges,
// alpha threshold, blur, blend modes), and the non-brush pad operations the tool popups commit (fill, stamp, gradient,
// text, move).  Every operation also knows how to draw itself into a material channel view (roughness / metal / height /
// emission), so the pad doubles as a small texture-painting preview.
//
//   RenderStroke(Ctx, Brush, Points, Options)     → plan (or null when the brush doesn't paint the viewed channel)
//   FloodFill(Ctx, X, Y, Fill)  DrawStamp(Ctx, Stamp)  DrawGradient(Ctx, Gradient)  DrawText(Ctx, Text)  ApplyMove(Ctx, Move)
//   ChannelValue(Op, Channel)                     the flat colour an op writes into a channel view (or null = skip)
//   ShadeHeight(ImageData)                        relief shading for the height view
//   SampleImage(ImageData, X, Y, Radius)          averaged { Hex, A } (eyedropper, wet mix, smudge)

import { PlanStroke } from "./BrushEngine.js";
import { Tip, TipVariants, GrainValues, GRAIN_SIZE, MakeCanvas } from "./Sources.js";
import { FONTS } from "./ToolModel.js";

const Clamp = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, V));
const Grey = (T) => { const V = Math.round(Clamp(T) * 255).toString(16).padStart(2, "0"); return `#${V}${V}${V}`; };
const Hex2 = (N) => Math.round(Clamp(N / 255) * 255).toString(16).padStart(2, "0");

export const BLEND_OPS = Object.freeze({
  Normal: "source-over", Multiply: "multiply", Darken: "darken", "Colour burn": "color-burn", "Linear burn": "multiply",
  Screen: "screen", Lighten: "lighten", "Colour dodge": "color-dodge", Add: "lighter", Overlay: "overlay", "Soft light": "soft-light",
  "Hard light": "hard-light", Difference: "difference", Hue: "hue", Saturation: "saturation", Colour: "color", Luminosity: "luminosity",
});
export const CHANNEL_BASE = Object.freeze({ roughness: "#8c8c8c", metalness: "#000000", height: "#808080", emissive: "#000000" });

const Pool = new Map();
export function Scratch(Name, W, H) {
  let C = Pool.get(Name);
  if (!C || C.width !== W || C.height !== H) { C = MakeCanvas(W, H); C.getContext("2d", { willReadFrequently: true }); Pool.set(Name, C); }
  return C;
}

const TintCache = new Map();
function Tinted(TipC, Key, Colour) {
  const K = `${Key}|${Colour}`;
  let C = TintCache.get(K);
  if (C) return C;
  C = MakeCanvas(TipC.width, TipC.height);
  const X = C.getContext("2d");
  if (X) { X.drawImage(TipC, 0, 0); X.globalCompositeOperation = "source-in"; X.fillStyle = Colour; X.fillRect(0, 0, C.width, C.height); }
  if (TintCache.size > 420) TintCache.delete(TintCache.keys().next().value);
  TintCache.set(K, C);
  return C;
}

export function SampleImage(Img, X, Y, Radius = 0) {
  if (!Img) return null;
  const Xi = Math.round(X), Yi = Math.round(Y);
  let R = 0, G = 0, B = 0, A = 0, N = 0;
  for (let J = Yi - Radius; J <= Yi + Radius; J++) for (let I = Xi - Radius; I <= Xi + Radius; I++) {
    if (I < 0 || J < 0 || I >= Img.width || J >= Img.height) continue;
    const O = (J * Img.width + I) * 4, Al = Img.data[O + 3] / 255;
    R += Img.data[O] * Al; G += Img.data[O + 1] * Al; B += Img.data[O + 2] * Al; A += Al; N++;
  }
  if (!N || A < 0.02) return { Hex: null, A: 0 };
  return { Hex: `#${Hex2(R / A)}${Hex2(G / A)}${Hex2(B / A)}`, A: A / N };
}

// The flat value a brush / op writes into a channel view; false = the op doesn't touch that channel.
export function BrushChannel(Values, Channel) {
  if (!Channel || Channel === "albedo") return null;
  if (!Values["mat.channels"].includes(Channel)) return false;
  if (Channel === "roughness") return Grey(Values["mat.roughness"] / 100);
  if (Channel === "metalness") return Grey(Values["mat.metalness"] / 100);
  if (Channel === "height") return Grey(0.5 + Values["mat.height"] / 200);
  return null;   // emissive keeps the stroke colour (scaled by strength at composite time)
}
export function ChannelValue(Op, Channel) {
  if (!Channel || Channel === "albedo") return null;
  if (!(Op.channels || []).includes(Channel)) return false;
  if (Channel === "roughness") return Grey(Op.roughness / 100);
  if (Channel === "metalness") return Grey(Op.metalness / 100);
  if (Channel === "height") return Grey(0.5 + Op.height / 200);
  return null;
}

// ------------------------------------------------------------------------------------------------ strokes
const GRAIN_BLEND = {
  Multiply: (G) => G, "Linear burn": (G) => Clamp(G * 1.5 - 0.25), "Colour burn": (G) => Clamp(1 - (1 - G) / Math.max(0.2, G + 0.2)),
  Darken: (G) => Clamp(G * 1.2 - 0.1), Subtract: (G) => Clamp(1 - (1 - G) * 2), Overlay: (G) => (G < 0.5 ? 2 * G * G : 1 - 2 * (1 - G) ** 2),
  "Hard mix": (G) => (G > 0.5 ? 1 : 0), Height: (G) => G * G,
};

// Options: { Seed, Scale, Final, Erase, Channel, Snapshot (ImageData), Smudge (0‥1), SmudgePaint (0‥1), Strength (0‥1 multiplier) }
export function RenderStroke(Ctx, Brush, Points, O = {}) {
  const V = Brush.values, Cv = Ctx.canvas, W = Cv.width, H = Cv.height;
  let Override = null;
  if (!O.Erase && !O.Smudge) { Override = BrushChannel(V, O.Channel); if (Override === false) return null; }
  const Blending = V["render.mode"].endsWith("blending");
  const Sample = O.Snapshot && (Blending || O.Smudge) ? (X, Y) => SampleImage(O.Snapshot, X, Y, 1)?.Hex : null;
  const Plan = PlanStroke(Brush, Points, { Seed: O.Seed, Scale: O.Scale, Final: O.Final, Sample, Colour: Override || undefined, TipVariants: TipVariants(V["shape.source"]), Smudge: O.Smudge, SmudgePaint: O.SmudgePaint });
  if (!Plan.Dabs.length) return Plan;

  // Bounds of everything the dabs touch.
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const D of Plan.Dabs) { const R = D.s * 0.75 + 2; X0 = Math.min(X0, D.x - R); Y0 = Math.min(Y0, D.y - R); X1 = Math.max(X1, D.x + R); Y1 = Math.max(Y1, D.y + R); }
  const Blur = (V["wet.blur"] / 100) * Plan.Base * 0.18;
  const Pad = Math.ceil(Blur * 2 + 2);
  const Bx = Math.max(0, Math.floor(X0) - Pad), By = Math.max(0, Math.floor(Y0) - Pad);
  const Bw = Math.min(W, Math.ceil(X1) + Pad) - Bx, Bh = Math.min(H, Math.ceil(Y1) + Pad) - By;
  Plan.Box = [Bx, By, Bw, Bh];
  if (Bw <= 0 || Bh <= 0) return Plan;

  const Src = { roughness: ["mat.roughSource", "mat.roughAmount"], metalness: ["mat.metalSource", "mat.metalAmount"], height: ["mat.heightSource", "mat.heightAmount"] }[O.Channel];
  const L = Scratch("layer", W, H), Lx = L.getContext("2d");
  if (!Lx) return Plan;
  Lx.setTransform(1, 0, 0, 1, 0, 0); Lx.globalCompositeOperation = "source-over"; Lx.globalAlpha = 1; Lx.filter = "none";
  Lx.clearRect(Bx, By, Bw, Bh);
  Lx.imageSmoothingEnabled = V["shape.filtering"] !== "None";
  Lx.imageSmoothingQuality = V["shape.filtering"] === "Improved" ? "high" : "low";
  const Uniform = Plan.Mode === "uniform-glaze";
  const Flat = Src && !O.Erase && V[Src[0]] === "None";
  const Hard = Flat ? Math.max(0.9, V["shape.hardness"] / 100) : V["shape.hardness"] / 100, Falloff = Flat ? null : V["shape.falloff"], Invert = V["shape.invert"], Shape = V["shape.source"];
  let AlphaSum = 0;
  for (const D of Plan.Dabs) {
    const T = Tip(Shape, { Hardness: Hard, Falloff, Invert, Variant: D.v });
    const Tint = Tinted(T, `${Shape}|${Hard}|${JSON.stringify(Falloff)}|${Invert}|${D.v}`, D.c);
    const C = Math.cos(D.a), S = Math.sin(D.a), Kx = D.s * D.sx * D.fx, Ky = D.s * D.sy * D.fy;
    Lx.globalAlpha = Uniform ? Math.min(1, D.alpha * 2.4) : D.alpha;
    Lx.setTransform(C * Kx, S * Kx, -S * Ky, C * Ky, D.x, D.y);
    Lx.drawImage(Tint, -0.5, -0.5, 1, 1);
    AlphaSum += D.alpha;
  }
  Lx.setTransform(1, 0, 0, 1, 0, 0); Lx.globalAlpha = 1;

  // Pixel pass: grain, wet edges, burnt edges, alpha threshold.
  // Material channels texture their value with the grain only when Materials → Source says so (Amount = depth).
  if (Src && !O.Erase) Plan.Depth = V[Src[0]] === "Grain" ? V[Src[1]] / 100 : 0;
  const GrainOn = V["grain.source"] !== "none" && Plan.Depth > 0.001;
  const Wet = V["render.wetEdges"] / 100, Burnt = V["render.burntEdges"] / 100, Thr = V["render.alphaThreshold"] / 100;
  if (GrainOn || Wet || Burnt || Thr) {
    const Img = Lx.getImageData(Bx, By, Bw, Bh), D = Img.data;
    let Soft = null;
    if (Wet || Burnt) {
      const Bc = Scratch("blur", W, H), Bxx = Bc.getContext("2d");
      Bxx.clearRect(Bx, By, Bw, Bh);
      Bxx.filter = `blur(${Math.max(1.2, Plan.Base * 0.14)}px)`;
      Bxx.drawImage(L, Bx, By, Bw, Bh, Bx, By, Bw, Bh);
      Bxx.filter = "none";
      Soft = Bxx.getImageData(Bx, By, Bw, Bh).data;
    }
    const Grain = GrainOn ? GrainValues(V["grain.source"], { Invert: V["grain.invert"], Brightness: V["grain.brightness"], Contrast: V["grain.contrast"] }) : null;
    const Moving = V["grain.mode"] === "Moving";
    let Tile = (0.18 + (V["grain.scale"] / 100) ** 1.4 * 3.2) * (O.Scale ?? 1);
    if (Moving) Tile *= 1 + (V["grain.zoom"] / 100) * (Plan.Base / (24 * (O.Scale ?? 1)));
    const First = Points[0] || { x: 0, y: 0 }, LastP = Points.at(-1) || First;
    const Dir = Moving ? Math.atan2(LastP.y - First.y, LastP.x - First.x) * (V["grain.rotation"] / 100) : 0;
    const Ox = (Moving ? First.x * (V["grain.movement"] / 100) : 0) - Plan.GrainOffset[0] * Tile, Oy = (Moving ? First.y * (V["grain.movement"] / 100) : 0) - Plan.GrainOffset[1] * Tile;
    const Cr = Math.cos(-Dir), Sr = Math.sin(-Dir), Smooth = V["grain.filtering"] !== "None";
    const Blend = GRAIN_BLEND[V["grain.blend"]] || GRAIN_BLEND.Multiply, Depth = Plan.Depth;
    const Gs = GRAIN_SIZE;
    const GrainAt = (U, Vv) => {
      if (!Smooth) return Grain[(((Math.floor(Vv) % Gs) + Gs) % Gs) * Gs + (((Math.floor(U) % Gs) + Gs) % Gs)];
      const U0 = Math.floor(U), V0 = Math.floor(Vv), Fu = U - U0, Fv = Vv - V0;
      const Ix = (A) => ((A % Gs) + Gs) % Gs;
      const A = Grain[Ix(V0) * Gs + Ix(U0)], B = Grain[Ix(V0) * Gs + Ix(U0 + 1)], C = Grain[Ix(V0 + 1) * Gs + Ix(U0)], E = Grain[Ix(V0 + 1) * Gs + Ix(U0 + 1)];
      return A + (B - A) * Fu + (C - A) * Fv + (A - B - C + E) * Fu * Fv;
    };
    for (let J = 0; J < Bh; J++) for (let I = 0; I < Bw; I++) {
      const O4 = (J * Bw + I) * 4;
      let A = D[O4 + 3] / 255;
      if (A <= 0) continue;
      if (Grain) {
        const Px = Bx + I - Ox, Py = By + J - Oy;
        const U = (Px * Cr - Py * Sr) / Tile, Vv = (Px * Sr + Py * Cr) / Tile;
        A *= 1 - Depth * (1 - Blend(GrainAt(U, Vv)));
      }
      if (Soft) {
        const E = Clamp((D[O4 + 3] / 255 - Soft[O4 + 3] / 255) * 3.2);
        if (Wet) A = A * (1 - Wet * 0.55) + E * Wet * 0.95 * (D[O4 + 3] / 255);
        if (Burnt) { const K = 1 - Burnt * E * 0.75; D[O4] *= K; D[O4 + 1] *= K; D[O4 + 2] *= K; }
      }
      if (Thr) A = A < Thr ? 0 : Math.min(1, A * (1 + Thr));
      D[O4 + 3] = Math.round(Clamp(A) * 255);
    }
    Lx.putImageData(Img, Bx, By);
  }

  // Composite.
  const Op = O.Erase ? "destination-out" : BLEND_OPS[V["render.blend"]] || "source-over";
  let Alpha = Blending ? 1 : Uniform ? Plan.Opacity * Clamp(0.35 + (AlphaSum / Plan.Dabs.length) * 0.65) : Plan.Mode === "heavy-glaze" ? Math.min(1, Plan.Opacity * 1.25) : Plan.Opacity;
  if (O.Channel === "emissive" && !O.Erase) Alpha *= V["mat.emissive"] / 100;
  Alpha *= O.Strength ?? 1;
  Ctx.save();
  Ctx.globalCompositeOperation = Op === "source-over" || O.Erase || !O.Channel || O.Channel === "albedo" || O.Channel === "emissive" ? Op : "source-over";
  Ctx.globalAlpha = Clamp(Alpha);
  if (Blur > 0.3) Ctx.filter = `blur(${Blur.toFixed(1)}px)`;
  Ctx.drawImage(L, Bx, By, Bw, Bh, Bx, By, Bw, Bh);
  Ctx.restore();
  return Plan;
}

// ------------------------------------------------------------------------------------------------ fill
// Fill: { X, Y, Scope, Tolerance, Feather, Grow, Source, Colour, Grain, GrainScale, Opacity, Blend, Value (channel override) }
export function FloodFill(Ctx, Fill) {
  const W = Ctx.canvas.width, H = Ctx.canvas.height;
  const Img = Ctx.getImageData(0, 0, W, H), D = Img.data;
  const Mask = new Uint8Array(W * H);
  const Xi = Clamp(Math.round(Fill.X), 0, W - 1), Yi = Clamp(Math.round(Fill.Y), 0, H - 1);
  if (Fill.Scope === "All") Mask.fill(1);
  else {
    const S = (Yi * W + Xi) * 4, Ref = [D[S], D[S + 1], D[S + 2], D[S + 3]];
    const Tol = ((Fill.Tolerance ?? 18) / 100) ** 1.5 * 255 * 2;
    const Near = (I) => { const O = I * 4; const Da = D[O + 3] - Ref[3], Am = Math.max(D[O + 3], Ref[3]) / 255; return Math.abs(Da) + Am * (Math.abs(D[O] - Ref[0]) + Math.abs(D[O + 1] - Ref[1]) + Math.abs(D[O + 2] - Ref[2])) / 3 <= Tol; };
    if (Fill.Scope === "Similar") { for (let I = 0; I < W * H; I++) if (Near(I)) Mask[I] = 1; }
    else {
      const Stack = [Yi * W + Xi];
      Mask[Stack[0]] = 1;
      while (Stack.length) {
        const I = Stack.pop(), X = I % W, Y = (I - X) / W;
        if (X > 0 && !Mask[I - 1] && Near(I - 1)) { Mask[I - 1] = 1; Stack.push(I - 1); }
        if (X < W - 1 && !Mask[I + 1] && Near(I + 1)) { Mask[I + 1] = 1; Stack.push(I + 1); }
        if (Y > 0 && !Mask[I - W] && Near(I - W)) { Mask[I - W] = 1; Stack.push(I - W); }
        if (Y < H - 1 && !Mask[I + W] && Near(I + W)) { Mask[I + W] = 1; Stack.push(I + W); }
      }
    }
    // Grow into anti-aliased rims (dilate).
    for (let Step = 0; Step < (Fill.Grow ?? 1); Step++) {
      const Prev = Mask.slice();
      for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const I = Y * W + X;
        if (Prev[I]) continue;
        if ((X > 0 && Prev[I - 1]) || (X < W - 1 && Prev[I + 1]) || (Y > 0 && Prev[I - W]) || (Y < H - 1 && Prev[I + W])) Mask[I] = 1;
      }
    }
  }
  const M = Scratch("fill-mask", W, H), Mx = M.getContext("2d");
  const Mi = Mx.createImageData(W, H);
  for (let I = 0; I < W * H; I++) if (Mask[I]) { const O = I * 4; Mi.data[O] = Mi.data[O + 1] = Mi.data[O + 2] = 255; Mi.data[O + 3] = 255; }
  Mx.setTransform(1, 0, 0, 1, 0, 0); Mx.globalCompositeOperation = "source-over"; Mx.filter = "none";
  Mx.clearRect(0, 0, W, H);
  Mx.putImageData(Mi, 0, 0);
  // Paint layer = source (colour or grain pattern) clipped by the (feathered) mask.
  const L = Scratch("fill-layer", W, H), Lx = L.getContext("2d");
  Lx.setTransform(1, 0, 0, 1, 0, 0); Lx.globalAlpha = 1; Lx.globalCompositeOperation = "source-over"; Lx.filter = "none";
  Lx.clearRect(0, 0, W, H);
  const Colour = Fill.Value || Fill.Colour;
  if (Fill.Source === "Grain" && !Fill.Value) {
    const Vals = GrainValues(Fill.Grain), G = MakeCanvas(GRAIN_SIZE, GRAIN_SIZE), Gx = G.getContext("2d"), Gi = Gx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const [R, Gr, B] = [1, 3, 5].map((I) => parseInt(Colour.slice(I, I + 2), 16));
    for (let I = 0; I < Vals.length; I++) { const O = I * 4, K = 0.35 + Vals[I] * 0.75; Gi.data[O] = Math.min(255, R * K); Gi.data[O + 1] = Math.min(255, Gr * K); Gi.data[O + 2] = Math.min(255, B * K); Gi.data[O + 3] = 255; }
    Gx.putImageData(Gi, 0, 0);
    const Pat = Lx.createPattern(G, "repeat"), K = (Fill.GrainScale ?? 100) / 100;
    Pat?.setTransform?.({ a: K, b: 0, c: 0, d: K, e: 0, f: 0 });
    Lx.fillStyle = Pat || Colour;
  } else Lx.fillStyle = Colour;
  Lx.fillRect(0, 0, W, H);
  Lx.globalCompositeOperation = "destination-in";
  if (Fill.Feather > 0) Lx.filter = `blur(${Fill.Feather}px)`;
  Lx.drawImage(M, 0, 0);
  Lx.filter = "none"; Lx.globalCompositeOperation = "source-over";
  Ctx.save();
  Ctx.globalAlpha = Clamp((Fill.Opacity ?? 100) / 100);
  Ctx.globalCompositeOperation = Fill.Value ? "source-over" : BLEND_OPS[Fill.Blend] || "source-over";
  Ctx.drawImage(L, 0, 0);
  Ctx.restore();
  return Mask.reduce((A, B) => A + B, 0);
}

// ------------------------------------------------------------------------------------------------ stamp
// Stamp: { Points:[[x, y, angle?]], Shape, Size, SizeJitter, Rotation, RotationJitter, Mirror, Colour, Opacity, Hardness, Blend, Seed, Value }
export function DrawStamp(Ctx, St) {
  let A = (St.Seed >>> 0) || 7;
  const R = () => { A = (A * 1664525 + 1013904223) >>> 0; return A / 4294967296; };
  const T = Tip(St.Shape, { Hardness: (St.Hardness ?? 85) / 100 });
  const Tint = Tinted(T, `${St.Shape}|${St.Hardness}|stamp`, St.Value || St.Colour);
  Ctx.save();
  Ctx.globalAlpha = Clamp((St.Opacity ?? 100) / 100);
  Ctx.globalCompositeOperation = St.Value ? "source-over" : BLEND_OPS[St.Blend] || "source-over";
  for (const [X, Y, Ang = 0] of St.Points) {
    const S = St.Size * (1 - (St.SizeJitter / 100) * R() * 0.8);
    const Rot = ((St.Rotation + (R() * 2 - 1) * 180 * (St.RotationJitter / 100)) * Math.PI) / 180 + Ang;
    Ctx.setTransform(1, 0, 0, 1, X, Y);
    Ctx.rotate(Rot);
    Ctx.scale(St.Mirror ? -1 : 1, 1);
    Ctx.drawImage(Tint, -S / 2, -S / 2, S, S);
  }
  Ctx.restore();
}

// ------------------------------------------------------------------------------------------------ gradient
// Gradient: { Type, Spread, Stops, From:[x, y], To:[x, y], Opacity, Blend, Limit, Value }
export function DrawGradient(Ctx, Gr) {
  const W = Ctx.canvas.width, H = Ctx.canvas.height;
  const [X0, Y0] = Gr.From, [X1, Y1] = Gr.To;
  const Len = Math.max(1, Math.hypot(X1 - X0, Y1 - Y0)), Diag = Math.hypot(W, H);
  const Stops = Gr.Value ? [Gr.Value, Gr.Value] : Gr.Stops;
  let G, Cycles = 1;
  if (Gr.Type === "Conic" && Ctx.createConicGradient) G = Ctx.createConicGradient(Math.atan2(Y1 - Y0, X1 - X0), X0, Y0);
  else if (Gr.Type === "Radial") { Cycles = Gr.Spread === "Pad" ? 1 : Math.ceil(Diag / Len); G = Ctx.createRadialGradient(X0, Y0, 0, X0, Y0, Len * Cycles); }
  else {
    Cycles = Gr.Spread === "Pad" ? 1 : Math.ceil(Diag / Len) * 2;
    const Dx = (X1 - X0) / Len, Dy = (Y1 - Y0) / Len, Back = Gr.Spread === "Pad" ? 0 : (Cycles / 2) * Len;
    G = Ctx.createLinearGradient(X0 - Dx * Back, Y0 - Dy * Back, X0 + Dx * (Len * (Gr.Spread === "Pad" ? 1 : Cycles / 2)), Y0 + Dy * (Len * (Gr.Spread === "Pad" ? 1 : Cycles / 2)));
  }
  for (let C = 0; C < Cycles; C++) {
    const Flip = Gr.Spread === "Reflect" && C % 2 === 1;
    Stops.forEach((S, I) => {
      const T = (I / (Stops.length - 1));
      G.addColorStop(Clamp((C + (Flip ? 1 - T : T)) / Cycles), S);
    });
  }
  Ctx.save();
  Ctx.globalAlpha = Clamp((Gr.Opacity ?? 100) / 100);
  Ctx.globalCompositeOperation = Gr.Limit === "Painted" ? "source-atop" : Gr.Limit === "Empty" ? "destination-over" : Gr.Value ? "source-over" : BLEND_OPS[Gr.Blend] || "source-over";
  Ctx.fillStyle = G;
  Ctx.fillRect(0, 0, W, H);
  Ctx.restore();
}

// ------------------------------------------------------------------------------------------------ text
// Text: { Content, Font, Weight, Italic, Align, Size, Spacing, LineHeight, Arc, Rotation, Colour, Opacity, Outline,
//         OutlineColour, At:[x, y], Value }
export function DrawText(Ctx, Tx) {
  const Font = FONTS.find((F) => F.Id === Tx.Font)?.Css || FONTS[0].Css;
  Ctx.save();
  Ctx.font = `${Tx.Italic ? "italic " : ""}${Tx.Weight} ${Tx.Size}px ${Font}`;
  Ctx.textBaseline = "middle";
  Ctx.globalAlpha = Clamp((Tx.Opacity ?? 100) / 100);
  Ctx.translate(Tx.At[0], Tx.At[1]);
  Ctx.rotate((Tx.Rotation * Math.PI) / 180);
  const Lines = String(Tx.Content || "").split("\n"), LH = Tx.Size * (Tx.LineHeight / 100);
  const Paint = (Ch, X, Y) => {
    if (Tx.Outline > 0) { Ctx.lineWidth = Tx.Outline * 2; Ctx.lineJoin = "round"; Ctx.strokeStyle = Tx.Value || Tx.OutlineColour; Ctx.strokeText(Ch, X, Y); }
    Ctx.fillStyle = Tx.Value || Tx.Colour; Ctx.fillText(Ch, X, Y);
  };
  Lines.forEach((Line, Li) => {
    const Y = (Li - (Lines.length - 1) / 2) * LH;
    const Chars = [...Line], Widths = Chars.map((C) => Ctx.measureText(C).width + Tx.Spacing);
    const Total = Widths.reduce((A, B) => A + B, 0) - Tx.Spacing;
    let X = Tx.Align === "Left" ? 0 : Tx.Align === "Right" ? -Total : -Total / 2;
    const Arc = (Tx.Arc * Math.PI) / 180;
    if (Math.abs(Arc) < 0.01) { Chars.forEach((C, I) => { Paint(C, X, Y); X += Widths[I]; }); return; }
    // Bend: characters walk along a circle whose arc length is the line width.
    const R = Total / Arc, Cy = Y + R;
    Chars.forEach((C, I) => {
      const Mid = X + Widths[I] / 2 - Tx.Spacing / 2, Th = Mid / R;
      Ctx.save();
      Ctx.translate(Math.sin(Th) * R, Cy - Math.cos(Th) * R);
      Ctx.rotate(Th);
      Ctx.textAlign = "center";
      Paint(C, 0, 0);
      Ctx.restore();
      X += Widths[I];
    });
  });
  Ctx.restore();
}

// ------------------------------------------------------------------------------------------------ move
// Move: { Dx, Dy (px), Scale (%), Rotation (°), FlipX, FlipY, Wrap: Clip | Tile, Source (canvas, optional) }
export function ApplyMove(Ctx, Mv, Source = null) {
  const W = Ctx.canvas.width, H = Ctx.canvas.height;
  const Copy = Scratch("move", W, H), Cx = Copy.getContext("2d");
  Cx.setTransform(1, 0, 0, 1, 0, 0); Cx.globalCompositeOperation = "source-over"; Cx.globalAlpha = 1; Cx.filter = "none";
  Cx.clearRect(0, 0, W, H);
  Cx.drawImage(Source || Ctx.canvas, 0, 0);
  if (!Source) Ctx.clearRect(0, 0, W, H);
  Ctx.save();
  const K = Mv.Scale / 100;
  const Draw = (Ox, Oy) => {
    Ctx.setTransform(1, 0, 0, 1, W / 2 + Mv.Dx + Ox, H / 2 + Mv.Dy + Oy);
    Ctx.rotate((Mv.Rotation * Math.PI) / 180);
    Ctx.scale(K * (Mv.FlipX ? -1 : 1), K * (Mv.FlipY ? -1 : 1));
    Ctx.drawImage(Copy, -W / 2, -H / 2);
  };
  if (Mv.Wrap === "Tile") { for (let J = -1; J <= 1; J++) for (let I = -1; I <= 1; I++) Draw(I * W * K, J * H * K); }
  else Draw(0, 0);
  Ctx.restore();
}

// ------------------------------------------------------------------------------------------------ height view
export function ShadeHeight(Img, Strength = 4) {
  const { width: W, height: H, data: D } = Img;
  const Ht = new Float32Array(W * H);
  for (let I = 0; I < W * H; I++) Ht[I] = D[I * 4] / 255;
  const L = [-0.5, -0.62, 0.6], Ln = Math.hypot(...L);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const I = Y * W + X;
    const Dx = (Ht[Y * W + Math.min(W - 1, X + 1)] - Ht[Y * W + Math.max(0, X - 1)]) * Strength;
    const Dy = (Ht[Math.min(H - 1, Y + 1) * W + X] - Ht[Math.max(0, Y - 1) * W + X]) * Strength;
    const N = [-Dx, -Dy, 1], Nn = Math.hypot(...N);
    const Lam = Clamp((N[0] * L[0] + N[1] * L[1] + N[2] * L[2]) / (Nn * Ln));
    const Spec = Lam ** 24 * 0.35, Base = 0.32 + Ht[I] * 0.25;
    const O = I * 4;
    D[O] = Clamp(Base * (0.35 + Lam * 0.85) + Spec) * 255;
    D[O + 1] = Clamp(Base * 0.96 * (0.35 + Lam * 0.85) + Spec) * 255;
    D[O + 2] = Clamp(Base * 0.9 * (0.35 + Lam * 0.85) + Spec) * 255;
    D[O + 3] = 255;
  }
  return Img;
}
