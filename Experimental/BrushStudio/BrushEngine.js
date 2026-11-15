// BrushEngine.js — the pure half of the Drawing Pad engine: input stabilisation and dab planning (no DOM, no canvas).
//
//   Stabilise(Points, Values)            StreamLine → stabilisation window → motion filtering, catching up at the end
//   PlanStroke(Brush, Points, Options)   walks the path and returns every dab with its position, size, roundness, angle,
//                                        alpha, colour and tip variant, plus the stroke-level rendering decisions
//
// Everything is seeded, so re-rendering a recorded stroke with edited settings reproduces the same random choices — the
// pad can re-render your scribbles live while you drag a slider.  Colour / opacity dynamics and the stroke curves go
// through TextureStudio's own resolveDabVariation (Engine/BrushDynamics.js, verbatim), so they match the texture painter.

import { sampleCurve, shiftHslHex, resolveDabVariation, COLOUR_GRADIENT_PRESETS, sampleHexGradient } from "./Engine/BrushDynamics.js";
import { EffectiveSize, EffectiveOpacity } from "./BrushModel.js";

const Clamp = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, V));
const Lerp = (A, B, T) => A + (B - A) * T;
const Smooth = (E0, E1, X) => { const T = Clamp((X - E0) / Math.max(1e-6, E1 - E0)); return T * T * (3 - 2 * T); };

export function Rng(Seed) {
  let A = (Seed >>> 0) || 0x9e3779b9;
  return () => { A = (A + 0x6d2b79f5) >>> 0; let T = A; T = Math.imul(T ^ (T >>> 15), T | 1); T ^= T + Math.imul(T ^ (T >>> 7), T | 61); return ((T ^ (T >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ stabilisation
// Point: { x, y, p (0‥1), alt (radians, π/2 = upright), az (radians), t (ms), pen (bool) }
export function Stabilise(Points, V) {
  if (Points.length < 3) return Points.map((P) => ({ ...P }));
  const Stream = V["stab.streamline"] / 100, StreamP = V["stab.streamlinePressure"] / 100;
  const Window = Math.round((V["stab.amount"] / 100) * 18);
  const Motion = V["stab.motion"] / 100, Expression = V["stab.expression"] / 100;
  const PSmooth = V["pen.smoothing"] / 100;
  const Out = [];
  let Sx = Points[0].x, Sy = Points[0].y, Sp = Points[0].p;
  for (let I = 0; I < Points.length; I++) {
    const P = Points[I];
    // StreamLine: a spring that lags behind the hand; heavier with pressure when StreamLine pressure is up.
    const Amount = Clamp(Stream * (1 - StreamP + StreamP * P.p * 1.4), 0, 0.97);
    const K = 1 - Amount * 0.93;
    Sx += (P.x - Sx) * K; Sy += (P.y - Sy) * K;
    Sp += (P.p - Sp) * (1 - PSmooth * 0.9);
    Out.push({ ...P, x: Sx, y: Sy, p: Sp });
  }
  // Stabilisation: centred moving average (speed independent).
  let Res = Out;
  if (Window > 0) {
    Res = Out.map((P, I) => {
      let X = 0, Y = 0, N = 0;
      for (let J = Math.max(0, I - Window); J <= Math.min(Out.length - 1, I + Window); J++) { X += Out[J].x; Y += Out[J].y; N++; }
      return { ...P, x: X / N, y: Y / N };
    });
  }
  // Motion filtering: pull toward a long average, keeping `Expression` of the wobble.
  if (Motion > 0) {
    const Long = 10, Pull = Motion * (1 - Expression * 0.75);
    Res = Res.map((P, I) => {
      let X = 0, Y = 0, N = 0;
      for (let J = Math.max(0, I - Long); J <= Math.min(Res.length - 1, I + Long); J++) { X += Res[J].x; Y += Res[J].y; N++; }
      return { ...P, x: Lerp(P.x, X / N, Pull), y: Lerp(P.y, Y / N, Pull) };
    });
  }
  // Catch up: the stroke ends where the hand lifted (Procreate behaviour), easing over the last few points.
  const Last = Points.at(-1), Tail = Math.min(6, Res.length - 1);
  for (let I = 0; I <= Tail; I++) {
    const R = Res[Res.length - 1 - Tail + I], T = I / Math.max(1, Tail);
    R.x = Lerp(R.x, Last.x, T * T); R.y = Lerp(R.y, Last.y, T * T);
  }
  Res[0] = { ...Res[0], x: Points[0].x, y: Points[0].y };
  return Res;
}

// ------------------------------------------------------------------------------------------------ colour
// Linear-light mix by default; Luminance blending mixes the gamma-encoded values (darker, more painterly midpoints).
export function MixHex(A, B, T, Perceptual = false) {
  const H = (S) => [1, 3, 5].map((I) => parseInt(S.slice(I, I + 2), 16) / 255);
  const X = H(A), Y = H(B), K = Clamp(T);
  return "#" + X.map((C, I) => {
    const V = Perceptual ? Lerp(C, Y[I], K) : Lerp(C ** 2.2, Y[I] ** 2.2, K) ** (1 / 2.2);
    return Math.round(Clamp(V) * 255).toString(16).padStart(2, "0");
  }).join("");
}

// The TextureStudio brush object resolveDabVariation expects, built from studio values.
function TsBrush(V) {
  const Grad = COLOUR_GRADIENT_PRESETS.find((G) => G.id === V["colour.gradient"]) || COLOUR_GRADIENT_PRESETS[0];
  return {
    color: V["colour.primary"], angle: 0, followDirection: false, flow: 1,
    jitter: {},
    colourDynamics: {
      mode: V["colour.mode"], gradientStops: Grad.stops, gradientLength: V["colour.gradientLength"], gradientWrap: V["colour.gradientWrap"],
      paletteColors: V["colour.palette"], temperatureShift: V["colour.temperature"] / 100,
      opacityMode: V["colour.opacityMode"] === "curve" ? "constant" : V["colour.opacityMode"], opacityMin: V["colour.opacityMin"] / 100, opacityPulseFreq: V["colour.opacityPulse"] / 100,
      strokeGradient: JSON.stringify(V["colour.hueCurve"]) !== "[[0,0.5],[1,0.5]]",
    },
    curves: { sizeOverStroke: V["dyn.sizeCurve"], opacityOverStroke: V["dyn.opacityCurve"], hueOverStroke: V["colour.hueCurve"] },
  };
}

// ------------------------------------------------------------------------------------------------ planning
// Options: { Seed, Scale (px per brush px), Final (stroke finished → apply end taper), Pen (stylus input), Sample(x, y) →
//            hex | null for wet-mix pull, TipVariants (count), Colour (override) }
export function PlanStroke(Brush, RawPoints, Options = {}) {
  const V = Brush.values, R = Rng(Options.Seed ?? 1), Scale = Options.Scale ?? 1;
  const Points = Stabilise(RawPoints, V);
  const Base = EffectiveSize(V, Scale), Opacity = EffectiveOpacity(V);
  const Mode = V["render.mode"], Blending = Mode.endsWith("blending");
  const Boost = Mode.startsWith("intense") ? 1.6 : Mode === "heavy-glaze" ? 2.5 : 1;
  const Pen = Options.Pen ?? Points.some((P) => P.pen);
  const Classic = V["taper.classic"];
  const TaperStart = (Pen || Classic ? V["taper.pressureStart"] : V["taper.touchStart"]) / 100;
  const TaperEnd = (Pen || Classic ? V["taper.pressureEnd"] : V["taper.touchEnd"]) / 100;
  const Ts = TsBrush(V);
  const Primary = Options.Colour || V["colour.primary"], Secondary = Options.Colour || V["colour.secondary"];
  const Lum = V["render.luminance"];

  // Arc length of the stabilised path.
  const Cum = [0];
  for (let I = 1; I < Points.length; I++) Cum.push(Cum[I - 1] + Math.hypot(Points[I].x - Points[I - 1].x, Points[I].y - Points[I - 1].y));
  const Length = Cum.at(-1) || 0;
  const KnownEnd = Options.Final || V["taper.tipAnimation"];

  // Per-stroke random choices.
  const StrokeAngle = V["shape.randomized"] ? R() * Math.PI * 2 : 0;
  const StrokeColour = (() => {
    let C = Primary;
    const H = V["colour.strokeHue"] / 100, Sa = V["colour.strokeSat"] / 100, Br = V["colour.strokeBright"] / 100;
    if (H || Sa || Br) C = shiftHslHex(C, (R() * 2 - 1) * H * 0.5, (R() * 2 - 1) * Sa * 0.75, (R() * 2 - 1) * Br * 0.6);
    if (V["colour.strokeSecondary"] && R() < V["colour.strokeSecondary"] / 100) C = Secondary;
    return C;
  })();
  const GrainOffset = V["grain.offsetJitter"] ? [R() * 4096, R() * 4096] : [0, 0];
  const DepthJitter = 1 - R() * (V["grain.depthJitter"] / 100);

  const Dabs = [];
  if (!Points.length) return { Dabs, Length, Base, Opacity, Blending, Boost, Mode, GrainOffset, Depth: 0, Pressure: 0 };
  const Spacing = (S) => Math.max(0.5 * Scale, S * (0.075 + (V["stroke.spacing"] / 100) ** 1.6 * 2.6));
  const Charge = (V["wet.charge"] / 100) ** 2 * 5200 + 24 * Scale;
  const Range = V["stroke.falloff"] > 0 ? Lerp(6000, 60, (V["stroke.falloff"] / 100) ** 0.6) * Scale : Infinity;
  const PressureCurve = V["pen.pressureCurve"];
  let D = 0, Seg = 0, Index = 0, SumP = 0, Last = null, Speed = 0.35;
  const At = (Dist) => {
    while (Seg < Points.length - 2 && Cum[Seg + 1] < Dist) Seg++;
    const A = Points[Seg], B = Points[Math.min(Points.length - 1, Seg + 1)], L = Math.max(1e-6, Cum[Seg + 1] - Cum[Seg] || 1e-6);
    const T = Clamp((Dist - Cum[Seg]) / L);
    const Dt = Math.max(1, (B.t ?? 0) - (A.t ?? 0));
    const Sp = Clamp(L / Dt / (2.2 * Scale));
    return { x: Lerp(A.x, B.x, T), y: Lerp(A.y, B.y, T), p: Lerp(A.p ?? 0.5, B.p ?? 0.5, T), alt: Lerp(A.alt ?? Math.PI / 2, B.alt ?? Math.PI / 2, T), az: Lerp(A.az ?? 0, B.az ?? 0, T), dir: Math.atan2(B.y - A.y, B.x - A.x), speed: Sp };
  };

  const Guard = 6000;
  while (D <= Length + 1e-6 && Dabs.length < Guard) {
    const P = At(D);
    Speed += (P.speed - Speed) * 0.25;
    const StrokeT = Length > 0 ? D / Length : 0;
    // Pressure through the stylus curve.
    let Pr = Clamp(sampleCurve(PressureCurve, Clamp(P.p)));
    // Taper: distance-based entry, length-based exit (exit only once the stroke length is known / tip animation on).
    const Ref = Base * 9;
    const In = TaperStart > 0 ? Smooth(0, TaperStart * Ref, D) : 1;
    const Out = TaperEnd > 0 && KnownEnd ? Smooth(0, TaperEnd * Ref, Length - D) : 1;
    const Tf = Math.min(In, Out);
    const Tip = V["taper.tip"] / 100;
    Pr *= Lerp(1, Tf, V["taper.pressure"] / 100);
    // Tilt: below the tilt angle the stylus is "on its side".
    const AltDeg = (P.alt * 180) / Math.PI, TiltAngle = V["pen.tiltAngle"];
    const Tilt = TiltAngle > 0 && AltDeg < TiltAngle ? 1 - AltDeg / TiltAngle : 0;
    const Dyn = resolveDabVariation(Ts, StrokeT, (Options.Seed ?? 1) * 7919 + Index, null, { dabIndex: Index, speed: Speed });
    let Size = Base * Lerp(1, Pr, V["pen.size"] / 100) * Lerp(1, Lerp(Tip * 0.6, 1, Tf), V["taper.size"] / 100);
    Size *= 1 + (V["dyn.speedSize"] / 100) * (Speed - 0.3) * 1.6;
    Size *= 1 + (V["dyn.jitterSize"] / 100) * (R() * 2 - 1) * 0.8;
    Size *= 1 + Tilt * (V["pen.tiltSize"] / 100) * 1.8;
    Size *= Dyn.sizeScale;
    Size = Math.max(0.25 * Scale, Size);
    // Alpha.
    let Alpha = (V["render.flow"] / 100) * Lerp(1, Pr, V["pen.opacity"] / 100) * Lerp(1, Pr, V["pen.flow"] / 100);
    Alpha *= Lerp(1, Tf, V["taper.opacity"] / 100);
    Alpha *= Clamp(1 + (V["dyn.speedOpacity"] / 100) * (Speed - 0.3) * 1.6, 0.05, 2);
    Alpha *= 1 - (V["dyn.jitterOpacity"] / 100) * R();
    Alpha *= 1 - Tilt * (V["pen.tiltOpacity"] / 100) * 0.85;
    Alpha *= Dyn.flow;   // opacity modes + opacity curve (TextureStudio)
    if (Range !== Infinity) Alpha *= Clamp(1 - D / Range);
    // Wet mix: paint load, water, attack, wetness.
    Alpha *= Clamp(1 - D / Charge) * (1 - (V["wet.dilution"] / 100) * 0.85) * (0.15 + 0.85 * (V["wet.attack"] / 100)) * (1 - (V["wet.wetnessJitter"] / 100) * R() * 0.8);
    Alpha *= Boost;
    if (Blending) Alpha *= Opacity;
    // Colour: TextureStudio mode → stroke jitter → stamp jitter → pressure / tilt → wet-mix pull.
    let Colour = V["colour.mode"] === "solid" ? StrokeColour : Dyn.color;
    const Sh = V["colour.stampHue"] / 100, Ss = V["colour.stampSat"] / 100, Sb = V["colour.stampBright"] / 100, Sd = V["colour.stampDark"] / 100;
    if (Sh || Ss || Sb || Sd) Colour = shiftHslHex(Colour, (R() * 2 - 1) * Sh * 0.5, (R() * 2 - 1) * Ss * 0.75, (R() * 2 - 1) * Sb * 0.6 - R() * Sd * 0.6);
    if (V["colour.stampSecondary"] && R() < V["colour.stampSecondary"] / 100) Colour = Secondary;
    const Ph = V["colour.pressureHue"] / 100, Ps = V["colour.pressureSat"] / 100, Pb = V["colour.pressureBright"] / 100;
    if (Ph || Ps || Pb) Colour = shiftHslHex(Colour, Ph * (Pr - 0.5) * 0.5, Ps * (Pr - 0.5), Pb * (Pr - 0.5) * 0.8);
    if (V["colour.pressureSecondary"]) Colour = MixHex(Colour, Secondary, (V["colour.pressureSecondary"] / 100) * Pr, Lum);
    const Th = V["colour.tiltHue"] / 100, Tsat = V["colour.tiltSat"] / 100, Tb = V["colour.tiltBright"] / 100;
    if (Tilt && (Th || Tsat || Tb)) Colour = shiftHslHex(Colour, Th * Tilt * 0.5, Tsat * Tilt, Tb * Tilt * 0.8);
    if (Tilt && V["colour.tiltSecondary"]) Colour = MixHex(Colour, Secondary, (V["colour.tiltSecondary"] / 100) * Tilt, Lum);
    const Pull = (V["wet.pull"] / 100) * (1 - (V["wet.grade"] / 100) * 0.6);
    if (Pull > 0 && Options.Sample && !Options.Smudge) { const Under = Options.Sample(P.x, P.y); if (Under) Colour = MixHex(Colour, Under, Pull * 0.85, Lum); }
    if (Options.Colour && V["colour.mode"] !== "solid") Colour = Options.Colour;   // material channel views paint a flat value
    // Smudge: carry the colour from where the previous dab sat; nothing under it → nothing to drag.
    if (Options.Smudge) {
      const Under = Options.Sample?.(Last ? Last.x : P.x, Last ? Last.y : P.y);
      Colour = Under ? (Options.SmudgePaint ? MixHex(Under, Primary, Options.SmudgePaint, Lum) : Under) : null;
      Alpha = Under ? Clamp(Options.Smudge) * (0.45 + 0.55 * Pr) : 0;
    }
    // Geometry.
    const Rot = V["shape.rotation"] / 100;
    const Normal = P.dir + Math.PI / 2;
    const Lateral = (V["stroke.jitterLateral"] / 100) * (R() * 2 - 1) * Size * 1.6;
    const Linear = (V["stroke.jitterLinear"] / 100) * (R() * 2 - 1) * Size * 1.6;
    const Round = Clamp((V["shape.roundness"] / 100) * Lerp(1, Lerp(0.25, 1, Pr), V["shape.pressureRoundness"] / 100), 0.04, 1);
    const Compress = V["pen.sizeCompression"] ? 1 : 1 - Tilt * 0.55;
    const Count = Math.max(1, Math.round(V["shape.count"] * (1 - (V["shape.countJitter"] / 100) * R())));
    const BlurPick = (V["wet.blur"] / 100) * (1 - (V["wet.blurJitter"] / 100) * R());
    for (let K = 0; K < Count && Colour; K++) {
      const Spread = Count > 1 ? Size * 0.45 * (1 + V["shape.countJitter"] / 100) : 0;
      const Ox = K ? (R() * 2 - 1) * Spread : 0, Oy = K ? (R() * 2 - 1) * Spread : 0;
      const Angle = P.dir * Rot + StrokeAngle + (V["shape.azimuth"] ? P.az : 0) + (R() * 2 - 1) * Math.PI * (V["shape.scatter"] / 100);
      Dabs.push({
        x: P.x + Math.cos(Normal) * Lateral + Math.cos(P.dir) * Linear + Ox,
        y: P.y + Math.sin(Normal) * Lateral + Math.sin(P.dir) * Linear + Oy,
        s: Size, sx: (1 - (V["shape.jitterH"] / 100) * R() * 0.8), sy: Round * Compress * (1 - (V["shape.jitterV"] / 100) * R() * 0.8),
        a: Angle, alpha: Clamp(Alpha / (Count > 1 ? Math.sqrt(Count) * 0.8 : 1), 0, 1), c: Colour,
        fx: V["shape.flipX"] && R() < 0.5 ? -1 : 1, fy: V["shape.flipY"] && R() < 0.5 ? -1 : 1,
        v: Math.floor(R() * (Options.TipVariants || 6)), blur: BlurPick, p: Pr, t: StrokeT,
      });
    }
    SumP += Pr; Index++;
    Last = P;
    D += Spacing(Size);
    if (Length === 0) break;
  }
  const Pressure = Index ? SumP / Index : 0.5;
  const Depth = Clamp((V["grain.depth"] / 100) * Lerp(V["grain.depthMin"] / 100, 1, Pressure) * DepthJitter * (1 + (V["pen.bleed"] / 100) * (1 - Pressure)));
  return { Dabs, Length, Base, Opacity, Blending, Boost, Mode, GrainOffset, Depth, Pressure, Last };
}

// A synthetic preview stroke (the S-curve the library and pad show): pressure swells and fades, a little tilt mid-way.
export function PreviewPoints(W, H, { Pad = 0.12, Pen = true } = {}) {
  const Out = [], N = 90;
  for (let I = 0; I <= N; I++) {
    const T = I / N;
    Out.push({
      x: W * (Pad + (1 - Pad * 2) * T), y: H * (0.5 + Math.sin(T * Math.PI * 2) * 0.24),
      p: Clamp(Math.sin(T * Math.PI) * 0.85 + 0.12), alt: Math.PI / 2 - Math.sin(T * Math.PI) * 0.6, az: T * Math.PI, t: I * 14, pen: Pen,
    });
  }
  return Out;
}

export { sampleCurve, sampleHexGradient };
