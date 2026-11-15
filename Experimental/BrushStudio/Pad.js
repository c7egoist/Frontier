// Pad.js — the Drawing Pad: a small texture-painting surface every tool popup acts on.
//
// The pad keeps an operation list (strokes, fills, stamps, gradients, text, moves) rather than a bitmap, so:
//   · Live mode re-renders your scribbles with the brush as you edit it (Procreate's pad only previews new strokes);
//   · the material views (roughness / metal / height / emission) replay the same operations into that channel;
//   · undo / redo is just moving operations between two stacks.
// Coordinates are stored in CSS pixels and scaled by the device pixel ratio when drawn.
//
//   CreatePad(Root, Api) → Pad
//     Api: { Brush(), Tools(), Tool(), View(), Live(), Preview(), EraserBrush(), SmudgeBrush(), Emit(kind, data) }
//     Pad: { Render(), Replay(), Schedule(full), Clear(), Undo(), Redo(), CanUndo(), CanRedo(), Ops, Stats,
//            CommitGradient(), CommitText(), CommitCurve(), CommitMove(), Resize(), Destroy(), SampleAt(x, y) }

import { RenderStroke, FloodFill, DrawStamp, DrawGradient, DrawText, ApplyMove, ShadeHeight, SampleImage, ChannelValue, CHANNEL_BASE, Scratch } from "./Painter.js";
import { PreviewPoints } from "./BrushEngine.js";
import { CurvePath, ProfilePressure } from "./ToolModel.js";
import { MakeCanvas } from "./Sources.js";
import { EffectiveSize } from "./BrushModel.js";

const Clamp = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, V));
const Now = () => (globalThis.performance?.now?.() ?? Date.now());
const OP_LIMIT = 160;

export function CreatePad(Root, Api) {
  const View = Root.querySelector("canvas.bs-canvas"), Guide = Root.querySelector("canvas.bs-guide");
  const Vx = View.getContext("2d"), Gx = Guide?.getContext("2d");
  const Committed = MakeCanvas(2, 2), Preview = MakeCanvas(2, 2), Work = MakeCanvas(2, 2);
  Committed.getContext("2d", { willReadFrequently: true });
  const Pad = { Ops: [], Future: [], Stats: { Dabs: 0, Ms: 0, Length: 0, Size: 0 }, Dpr: 1, W: 0, H: 0 };
  let Live = null, Hover = null, Frame = 0, Full = false, Drag = null, SeedCounter = 1;

  // ---------------------------------------------------------------------------------------------- sizing
  Pad.Resize = () => {
    const R = View.getBoundingClientRect?.() || { width: 640, height: 420 };
    const Dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.max(64, Math.round(R.width || View.clientWidth || 640)), H = Math.max(64, Math.round(R.height || View.clientHeight || 420));
    if (W === Pad.W && H === Pad.H && Dpr === Pad.Dpr) return;
    Object.assign(Pad, { W, H, Dpr });
    for (const C of [View, Guide, Committed, Preview, Work]) if (C) { C.width = Math.round(W * Dpr); C.height = Math.round(H * Dpr); }
    Pad.Replay();
  };

  const Ctx2 = (C) => C.getContext("2d");
  const Scale = () => Pad.Dpr;
  const Dev = (P) => ({ ...P, x: P.x * Pad.Dpr, y: P.y * Pad.Dpr });

  // ---------------------------------------------------------------------------------------------- operations
  const MirrorSets = (Points, Mode) => {
    const Sets = [Points];
    const Mx = (P) => ({ ...P, x: Pad.W - P.x, az: Math.PI - (P.az || 0) }), My = (P) => ({ ...P, y: Pad.H - P.y, az: -(P.az || 0) });
    if (Mode === "Vertical" || Mode === "Quadrant") Sets.push(Points.map(Mx));
    if (Mode === "Horizontal" || Mode === "Quadrant") Sets.push(Points.map(My));
    if (Mode === "Quadrant") Sets.push(Points.map((P) => My(Mx(P))));
    return Sets;
  };

  // Draw one op into Ctx for a channel view.  Returns the stroke plan (for stats) when it is a stroke.
  function DrawOp(Ctx, Op, Channel, { Final = true, Snapshot = null } = {}) {
    const Ch = Channel || "albedo";
    if (Op.Kind === "paint") {
      const Brush = Api.Live() ? Api.Brush() : Op.Brush;
      const Snap = Snapshot || (Brush.values["render.mode"].endsWith("blending") ? Ctx.getImageData(0, 0, Ctx.canvas.width, Ctx.canvas.height) : null);
      let Plan = null;
      MirrorSets(Op.Points, Op.Symmetry).forEach((Pts, I) => { Plan = RenderStroke(Ctx, Brush, Pts.map(Dev), { Seed: Op.Seed + I * 101, Scale: Scale(), Final, Channel: Ch, Snapshot: Snap }) || Plan; });
      return Plan;
    }
    if (Op.Kind === "erase") {
      if (!Op.Channels.includes(Ch)) return null;
      return RenderStroke(Ctx, Op.Brush, Op.Points.map(Dev), { Seed: Op.Seed, Scale: Scale(), Final, Erase: true, Strength: Op.Strength });
    }
    if (Op.Kind === "smudge") {
      const Snap = Snapshot || Ctx.getImageData(0, 0, Ctx.canvas.width, Ctx.canvas.height);
      return RenderStroke(Ctx, Op.Brush, Op.Points.map(Dev), { Seed: Op.Seed, Scale: Scale(), Final, Smudge: Op.Strength, SmudgePaint: Ch === "albedo" ? Op.Paint : 0, Snapshot: Snap, Channel: Ch });
    }
    const Value = ChannelValue(Op, Ch);
    if (Value === false) return null;
    const D = Pad.Dpr;
    if (Op.Kind === "fill") FloodFill(Ctx, { ...Op, X: Op.X * D, Y: Op.Y * D, Feather: Op.Feather * D, Grow: Math.round(Op.Grow * D), Value });
    else if (Op.Kind === "stamp") DrawStamp(Ctx, { ...Op, Size: Op.Size * D, Points: Op.Points.map(([X, Y, A]) => [X * D, Y * D, A]), Value });
    else if (Op.Kind === "gradient") DrawGradient(Ctx, { ...Op, From: [Op.From[0] * D, Op.From[1] * D], To: [Op.To[0] * D, Op.To[1] * D], Value });
    else if (Op.Kind === "text") DrawText(Ctx, { ...Op, Size: Op.Size * D, Spacing: Op.Spacing * D, Outline: Op.Outline * D, At: [Op.At[0] * D, Op.At[1] * D], Value });
    return null;
  }

  const MoveArgs = (M) => ({ ...M, Dx: M.Dx * Pad.Dpr, Dy: M.Dy * Pad.Dpr });

  // Replay every op into Committed for the current view (and the preview stroke into its own layer).
  function ReplayInto(Ctx, Ops, Channel) {
    const W = Ctx.canvas.width, H = Ctx.canvas.height;
    Ctx.setTransform(1, 0, 0, 1, 0, 0); Ctx.globalAlpha = 1; Ctx.globalCompositeOperation = "source-over"; Ctx.filter = "none";
    Ctx.clearRect(0, 0, W, H);
    if (Channel && Channel !== "albedo") { Ctx.fillStyle = CHANNEL_BASE[Channel]; Ctx.fillRect(0, 0, W, H); }
    let Dabs = 0;
    for (let I = 0; I < Ops.length; I++) {
      const Op = Ops[I], Next = Ops[I + 1];
      if (Op.Kind === "move") { if (Op.Target !== "Last item") ApplyMove(Ctx, MoveArgs(Op)); continue; }
      if (Next?.Kind === "move" && Next.Target === "Last item") {
        // Render this op alone, transform it, then lay it down.
        const Solo = Scratch("solo", W, H), Sx = Solo.getContext("2d");
        Sx.setTransform(1, 0, 0, 1, 0, 0); Sx.globalAlpha = 1; Sx.globalCompositeOperation = "source-over"; Sx.clearRect(0, 0, W, H);
        DrawOp(Sx, Op, Channel === "albedo" || !Channel ? "albedo" : Channel);
        const Moved = Scratch("solo-moved", W, H), Mx = Moved.getContext("2d");
        Mx.setTransform(1, 0, 0, 1, 0, 0); Mx.clearRect(0, 0, W, H);
        ApplyMove(Mx, MoveArgs(Next), Solo);
        Ctx.drawImage(Moved, 0, 0);
        continue;
      }
      const Plan = DrawOp(Ctx, Op, Channel);
      Dabs += Plan?.Dabs?.length || 0;
    }
    return Dabs;
  }

  Pad.Replay = () => {
    if (!Pad.W) return;
    const T0 = Now();
    const Dabs = ReplayInto(Ctx2(Committed), Pad.Ops, Api.View());
    Pad.RenderPreview();
    Pad.Stats.Replay = Now() - T0;
    Pad.Stats.OpDabs = Dabs;
    Pad.Render();
  };

  Pad.RenderPreview = () => {
    const Px = Ctx2(Preview);
    Px.setTransform(1, 0, 0, 1, 0, 0); Px.clearRect(0, 0, Preview.width, Preview.height);
    if (!Api.Preview()) return;
    const Brush = Api.Brush(), Ch = Api.View();
    const H = Math.min(140, Pad.H * 0.34), Y0 = Pad.H - H - 18;
    const Pts = PreviewPoints(Pad.W, H, { Pad: 0.1 }).map((P) => ({ ...P, y: P.y + Y0 }));
    const T0 = Now();
    const Plan = RenderStroke(Px, Brush, Pts.map(Dev), { Seed: 4242, Scale: Scale(), Final: true, Channel: Ch === "albedo" ? "albedo" : Ch });
    Pad.Stats = { ...Pad.Stats, Dabs: Plan?.Dabs.length || 0, Ms: Now() - T0, Length: Plan?.Length / Pad.Dpr || 0, Size: EffectiveSize(Brush.values) };
  };

  // ---------------------------------------------------------------------------------------------- display
  Pad.Render = () => {
    if (!Pad.W) return;
    const W = View.width, H = View.height, Ch = Api.View();
    Vx.setTransform(1, 0, 0, 1, 0, 0); Vx.globalAlpha = 1; Vx.globalCompositeOperation = "source-over"; Vx.filter = "none";
    Vx.clearRect(0, 0, W, H);
    let Source = Committed;
    const Tool = Api.Tool(), Tools = Api.Tools();
    // Live previews that render on top of a copy of the committed layer.
    const NeedWork = Live || (Tool === "gradient" && Tools.gradient.line) || (Tool === "text" && Tools.text.at) || (Tool === "move" && MoveActive(Tools.move));
    if (NeedWork) {
      const Wx = Ctx2(Work);
      Wx.setTransform(1, 0, 0, 1, 0, 0); Wx.globalAlpha = 1; Wx.globalCompositeOperation = "source-over"; Wx.filter = "none";
      Wx.clearRect(0, 0, W, H);
      if (Tool === "move" && MoveActive(Tools.move) && !Live) {
        if (Tools.move.target === "Last item" && Pad.Ops.length) {
          ReplayInto(Wx, Pad.Ops.slice(0, -1), Ch);
          const Solo = Scratch("solo-preview", W, H), Sx = Solo.getContext("2d");
          Sx.setTransform(1, 0, 0, 1, 0, 0); Sx.clearRect(0, 0, W, H);
          DrawOp(Sx, Pad.Ops.at(-1), Ch);
          ApplyMove(Wx, MoveArgs(MoveFromTool(Tools.move)), Solo);
        } else { Wx.drawImage(Committed, 0, 0); ApplyMove(Wx, MoveArgs(MoveFromTool(Tools.move))); }
        if (Ch !== "albedo") { Wx.globalCompositeOperation = "destination-over"; Wx.fillStyle = CHANNEL_BASE[Ch]; Wx.fillRect(0, 0, W, H); Wx.globalCompositeOperation = "source-over"; }
      } else {
        Wx.drawImage(Committed, 0, 0);
        if (Live) {
          const T0 = Now();
          const Plan = DrawOp(Wx, Live.Op, Ch, { Final: false, Snapshot: Live.Snapshot });
          if (Plan) Pad.Stats = { ...Pad.Stats, LiveDabs: Plan.Dabs.length, LiveMs: Now() - T0 };
        } else if (Tool === "gradient") DrawOp(Wx, GradientOp(Tools.gradient), Ch);
        else if (Tool === "text") DrawOp(Wx, TextOp(Tools.text), Ch);
      }
      Source = Work;
    }
    Vx.drawImage(Preview, 0, 0);
    Vx.drawImage(Source, 0, 0);
    if (Ch === "height") Vx.putImageData(ShadeHeight(Vx.getImageData(0, 0, W, H)), 0, 0);
    DrawGuides();
  };

  Pad.Schedule = (FullReplay = false) => {
    Full = Full || FullReplay;
    if (Frame) return;
    const Raf = globalThis.requestAnimationFrame || ((F) => setTimeout(F, 16));
    Frame = Raf(() => {
      Frame = 0;
      if (Full) { Full = false; Pad.Replay(); }
      else { Pad.RenderPreview(); Pad.Render(); }
      Api.Emit("stats", Pad.Stats);
    });
  };

  // ---------------------------------------------------------------------------------------------- guides
  function DrawGuides() {
    if (!Gx) return;
    const D = Pad.Dpr, Tool = Api.Tool(), Tools = Api.Tools();
    Gx.setTransform(1, 0, 0, 1, 0, 0);
    Gx.clearRect(0, 0, Guide.width, Guide.height);
    Gx.setTransform(D, 0, 0, D, 0, 0);
    Gx.lineWidth = 1.2;
    const Handle = (X, Y, Fill = "#4d9bff") => { Gx.beginPath(); Gx.arc(X, Y, 6, 0, Math.PI * 2); Gx.fillStyle = "#111"; Gx.fill(); Gx.beginPath(); Gx.arc(X, Y, 4, 0, Math.PI * 2); Gx.fillStyle = Fill; Gx.fill(); };
    if (Tool === "gradient" && Tools.gradient.line) {
      const [[X0, Y0], [X1, Y1]] = Tools.gradient.line.map(([X, Y]) => [X * Pad.W, Y * Pad.H]);
      Gx.setLineDash([5, 5]); Gx.strokeStyle = "#ffffffaa"; Gx.beginPath(); Gx.moveTo(X0, Y0); Gx.lineTo(X1, Y1); Gx.stroke(); Gx.setLineDash([]);
      Handle(X0, Y0, Tools.gradient.stops[0]); Handle(X1, Y1, Tools.gradient.stops.at(-1));
    }
    if (Tool === "text" && Tools.text.at) { const [X, Y] = [Tools.text.at[0] * Pad.W, Tools.text.at[1] * Pad.H]; Handle(X, Y); }
    if (Tool === "curve" && Tools.curve.points.length) {
      const C = Tools.curve, Pts = C.points.map(([X, Y]) => [X * Pad.W, Y * Pad.H]);
      const Path = CurvePath(Pts, { Mode: C.mode, Closed: C.closed, Smoothness: C.smoothness });
      Gx.strokeStyle = "#4d9bffaa"; Gx.setLineDash([4, 4]); Gx.beginPath(); Path.forEach(([X, Y], I) => (I ? Gx.lineTo(X, Y) : Gx.moveTo(X, Y))); Gx.stroke(); Gx.setLineDash([]);
      Pts.forEach(([X, Y], I) => Handle(X, Y, I === Pts.length - 1 ? "#4d9bff" : "#e8e8e8"));
    }
    if (Tool === "move" && MoveActive(Tools.move)) {
      const M = MoveFromTool(Tools.move);
      Gx.save(); Gx.translate(Pad.W / 2 + M.Dx, Pad.H / 2 + M.Dy); Gx.rotate((M.Rotation * Math.PI) / 180); Gx.scale(M.Scale / 100, M.Scale / 100);
      Gx.setLineDash([6, 5]); Gx.strokeStyle = "#4d9bffcc"; Gx.lineWidth = 1.2 / (M.Scale / 100); Gx.strokeRect(-Pad.W / 2 + 4, -Pad.H / 2 + 4, Pad.W - 8, Pad.H - 8); Gx.restore(); Gx.setLineDash([]);
    }
    // Brush outline under the cursor before touching down (Stylus → Hover preview).
    if (Hover && !Drag && ["paint", "erase", "smudge"].includes(Tool)) {
      const B = Tool === "erase" ? Api.EraserBrush() : Tool === "smudge" ? Api.SmudgeBrush() : Api.Brush();
      const R = EffectiveSize(B.values) / 2, Op = B.values["pen.hover"] / 100;
      if (Op > 0) { Gx.strokeStyle = `rgba(255,178,56,${Op})`; Gx.beginPath(); Gx.ellipse(Hover.x, Hover.y, R, R * (B.values["shape.roundness"] / 100), 0, 0, Math.PI * 2); Gx.stroke(); }
    }
    if (Hover && Tool === "stamp") {
      const S = Tools.stamp.size / 2;
      Gx.strokeStyle = "#4d9bff99"; Gx.setLineDash([3, 4]); Gx.strokeRect(Hover.x - S, Hover.y - S, S * 2, S * 2); Gx.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------------------------------------- tool → op helpers
  const MoveActive = (M) => M.dx || M.dy || M.u || M.v || M.scale !== 100 || M.rotation || M.flipX || M.flipY;
  const MoveFromTool = (M) => ({ Kind: "move", Target: M.target, Dx: M.dx + (M.u / 100) * Pad.W, Dy: M.dy + (M.v / 100) * Pad.H, Scale: M.scale, Rotation: M.rotation, FlipX: M.flipX, FlipY: M.flipY, Wrap: M.wrap });
  const Pbr = (T) => ({ channels: [...T.channels], roughness: T.roughness, metalness: T.metalness, height: T.height, emissive: T.emissive });
  const GradientOp = (G) => ({ Kind: "gradient", Type: G.type, Spread: G.spread, Stops: [...G.stops], From: [G.line[0][0] * Pad.W, G.line[0][1] * Pad.H], To: [G.line[1][0] * Pad.W, G.line[1][1] * Pad.H], Opacity: G.opacity, Blend: G.blend, Limit: G.limit, channels: ["albedo"] });
  const TextOp = (T) => ({ Kind: "text", Content: T.content, Font: T.font, Weight: T.weight, Italic: T.italic, Align: T.align, Size: T.size, Spacing: T.spacing, LineHeight: T.lineHeight, Arc: T.arc, Rotation: T.rotation, Colour: T.colour, Opacity: T.opacity, Outline: T.outline, OutlineColour: T.outlineColour, At: [T.at[0] * Pad.W, T.at[1] * Pad.H], ...Pbr(T) });

  function Push(Op) {
    Pad.Ops.push(Op);
    if (Pad.Ops.length > OP_LIMIT) Pad.Ops.shift();
    Pad.Future = []; Pad.Cleared = null;
    Api.Emit("ops", Pad.Ops.length);
  }
  const Commit = (Op) => {
    Push(Op);
    // Moves restructure everything; everything else draws incrementally on top.
    if (Op.Kind === "move") Pad.Replay();
    else { DrawOp(Ctx2(Committed), Op, Api.View()); Pad.Render(); }
  };

  Pad.CommitGradient = () => { const G = Api.Tools().gradient; if (!G.line) return false; Commit(GradientOp(G)); Api.Emit("tool-set", ["gradient", "line", null]); return true; };
  Pad.CommitText = () => { const T = Api.Tools().text; if (!T.at || !T.content.trim()) return false; Commit(TextOp(T)); Api.Emit("tool-set", ["text", "at", null]); return true; };
  Pad.CommitMove = () => {
    const M = Api.Tools().move;
    if (!MoveActive(M)) return false;
    Commit(MoveFromTool(M));
    Api.Emit("move-reset");
    return true;
  };
  Pad.CommitCurve = () => {
    const C = Api.Tools().curve;
    if (C.points.length < 2) return false;
    const Pts = CurvePath(C.points.map(([X, Y]) => [X * Pad.W, Y * Pad.H]), { Mode: C.mode, Closed: C.closed, Smoothness: C.smoothness });
    // Resample evenly so the pressure profile follows arc length.
    const Cum = [0];
    for (let I = 1; I < Pts.length; I++) Cum.push(Cum[I - 1] + Math.hypot(Pts[I][0] - Pts[I - 1][0], Pts[I][1] - Pts[I - 1][1]));
    const Len = Cum.at(-1) || 1;
    const Points = Pts.map(([X, Y], I) => ({ x: X, y: Y, p: ProfilePressure(C.profile, Cum[I] / Len, C.pressure), alt: Math.PI / 2, az: 0, t: I * 12, pen: true }));
    Commit({ Kind: "paint", Brush: Api.Brush(), Points, Seed: SeedCounter++, Symmetry: "Off" });
    Api.Emit("tool-set", ["curve", "points", []]);
    return true;
  };

  // Clear is itself undoable: the cleared ops are stashed, Undo on an empty pad brings them back, Redo clears again.
  // Drawing anything new drops the stash (Commit resets Future, and Cleared with it).
  Pad.Cleared = null;
  Pad.Clear = () => { if (!Pad.Ops.length) return; Pad.Cleared = Pad.Ops; Pad.Future = []; Pad.Ops = []; Pad.Replay(); Api.Emit("ops", 0); };
  Pad.Undo = () => {
    if (!Pad.Ops.length) { if (!Pad.Cleared) return; Pad.Ops = Pad.Cleared; Pad.Cleared = null; Pad.Future.push({ Kind: "clear" }); }
    else Pad.Future.push(Pad.Ops.pop());
    Pad.Replay(); Api.Emit("ops", Pad.Ops.length);
  };
  Pad.Redo = () => {
    const Op = Pad.Future.pop();
    if (!Op) return;
    if (Op.Kind === "clear") { Pad.Cleared = Pad.Ops; Pad.Ops = []; } else Pad.Ops.push(Op);
    Pad.Replay(); Api.Emit("ops", Pad.Ops.length);
  };
  Pad.CanUndo = () => Pad.Ops.length > 0 || !!Pad.Cleared;
  Pad.CanRedo = () => Pad.Future.length > 0;

  // Sample the visible pad (eyedropper).
  Pad.SampleAt = (X, Y, Radius, IncludePaper, Paper) => {
    const Img = Ctx2(Committed).getImageData(0, 0, Committed.width, Committed.height);
    const S = SampleImage(Img, X * Pad.Dpr, Y * Pad.Dpr, Radius);
    if (S?.Hex && S.A > 0.98) return S;
    if (!IncludePaper) return S;
    const Mix = (A, B, T) => "#" + [1, 3, 5].map((I) => Math.round(parseInt(A.slice(I, I + 2), 16) * T + parseInt(B.slice(I, I + 2), 16) * (1 - T)).toString(16).padStart(2, "0")).join("");
    return { Hex: S?.Hex ? Mix(S.Hex, Paper, S.A) : Paper, A: 1 };
  };

  // ---------------------------------------------------------------------------------------------- pointer input
  const Local = (E) => { const R = View.getBoundingClientRect(); return { x: E.clientX - R.left, y: E.clientY - R.top }; };
  function Sample(E, Prev, Brush) {
    const L = Local(E), T = E.timeStamp || Now();
    const Pen = E.pointerType === "pen";
    let P = Pen ? (E.pressure || 0.5) : 0.6;
    if (!Pen && Brush?.values["pen.simulate"] && Prev) {
      const Speed = Math.hypot(L.x - Prev.x, L.y - Prev.y) / Math.max(1, T - Prev.t);
      P = Clamp(1.05 - Speed * 0.55, 0.22, 1);
      P = Prev.p + (P - Prev.p) * 0.35;
    }
    let Alt = Math.PI / 2, Az = 0;
    if (E.altitudeAngle != null) { Alt = E.altitudeAngle; Az = E.azimuthAngle || 0; }
    else if (E.tiltX || E.tiltY) { const Tx = (E.tiltX * Math.PI) / 180, Ty = (E.tiltY * Math.PI) / 180; Alt = Math.PI / 2 - Math.min(Math.PI / 2, Math.hypot(Tx, Ty)); Az = Math.atan2(Ty, Tx); }
    return { x: L.x, y: L.y, p: P, alt: Alt, az: Az, t: T, pen: Pen };
  }

  function StartStroke(E) {
    const Tool = Api.Tool(), Tools = Api.Tools();
    const Brush = Tool === "erase" ? Api.EraserBrush() : Tool === "smudge" ? Api.SmudgeBrush() : Api.Brush();
    const P0 = Sample(E, null, Brush);
    const Op = Tool === "erase" ? { Kind: "erase", Brush, Points: [P0], Seed: SeedCounter++, Channels: [...Tools.erase.channels], Strength: Tools.erase.strength / 100 }
      : Tool === "smudge" ? { Kind: "smudge", Brush, Points: [P0], Seed: SeedCounter++, Strength: Tools.smudge.strength / 100, Paint: Tools.smudge.paint / 100 }
      : { Kind: "paint", Brush, Points: [P0], Seed: SeedCounter++, Symmetry: Tools.paint.symmetry };
    const NeedsSnapshot = Tool === "smudge" || (Tool === "paint" && Brush.values["render.mode"].endsWith("blending"));
    Live = { Op, Snapshot: NeedsSnapshot ? Ctx2(Committed).getImageData(0, 0, Committed.width, Committed.height) : null };
    Pad.Schedule();
  }

  function OnDown(E) {
    if (E.button && E.button !== 0) return;
    const Tool = Api.Tool(), Tools = Api.Tools(), L = Local(E), U = [L.x / Pad.W, L.y / Pad.H];
    View.setPointerCapture?.(E.pointerId);
    Api.Emit("pad-down", Tool);
    if (["paint", "erase", "smudge"].includes(Tool)) { StartStroke(E); Drag = { Tool }; return; }
    if (Tool === "fill") {
      const F = Tools.fill;
      Commit({ Kind: "fill", X: L.x, Y: L.y, Scope: F.scope, Tolerance: F.tolerance, Feather: F.feather, Grow: F.grow, Source: F.source, Colour: F.colour, Grain: F.grain, GrainScale: F.grainScale, Opacity: F.opacity, Blend: F.blend, ...Pbr(F) });
      return;
    }
    if (Tool === "stamp") {
      const S = Tools.stamp;
      if (S.placement === "Grid") {
        const Pts = [];
        for (let Y = (L.y % S.spacing) - S.spacing; Y < Pad.H + S.spacing; Y += S.spacing) for (let X = (L.x % S.spacing) - S.spacing; X < Pad.W + S.spacing; X += S.spacing) Pts.push([X, Y, 0]);
        Commit(StampOp(S, Pts));
        return;
      }
      Drag = { Tool, Points: [[L.x, L.y, 0]], Last: L };
      if (S.placement === "Click") { Commit(StampOp(S, Drag.Points)); Drag = null; }
      return;
    }
    if (Tool === "gradient") {
      const Line = Tools.gradient.line;
      const Near = (I) => Line && Math.hypot(Line[I][0] * Pad.W - L.x, Line[I][1] * Pad.H - L.y) < 12;
      Drag = { Tool, Handle: Near(0) ? 0 : Near(1) ? 1 : -1 };
      if (Drag.Handle < 0) Api.Emit("tool-set", ["gradient", "line", [U, U]]);
      return;
    }
    if (Tool === "text") { Api.Emit("tool-set", ["text", "at", U]); Drag = { Tool }; return; }
    if (Tool === "curve") {
      if (E.detail >= 2) { Pad.CommitCurve(); return; }
      Api.Emit("tool-set", ["curve", "points", [...Tools.curve.points, U]]);
      return;
    }
    if (Tool === "move") { Drag = { Tool, Start: L, Dx: Tools.move.dx, Dy: Tools.move.dy }; return; }
    if (Tool === "eyedropper") { Drag = { Tool }; Api.Emit("sample", { X: L.x, Y: L.y, Final: false }); }
  }

  const StampOp = (S, Pts) => ({ Kind: "stamp", Points: Pts, Shape: S.shape, Size: S.size, SizeJitter: S.sizeJitter, Rotation: S.rotation, RotationJitter: S.rotationJitter, Mirror: S.mirror, Colour: S.colour, Opacity: S.opacity, Hardness: S.hardness, Blend: S.blend, Seed: SeedCounter++, ...Pbr(S) });

  function OnMove(E) {
    const L = Local(E);
    Hover = L;
    if (!Drag) { if (Gx) DrawGuides(); return; }
    const Tool = Drag.Tool, Tools = Api.Tools();
    if (Live) {
      const Events = E.getCoalescedEvents?.() || [E];
      for (const Ev of Events) Live.Op.Points.push(Sample(Ev, Live.Op.Points.at(-1), Live.Op.Brush));
      Pad.Schedule();
      return;
    }
    if (Tool === "stamp") {
      const S = Tools.stamp, D = Math.hypot(L.x - Drag.Last.x, L.y - Drag.Last.y);
      if (D >= S.spacing * (S.size / 100)) { Drag.Points.push([L.x, L.y, S.align ? Math.atan2(L.y - Drag.Last.y, L.x - Drag.Last.x) : 0]); Drag.Last = L; }
      const Gc = Gx; if (Gc) { DrawGuides(); Gc.setTransform(Pad.Dpr, 0, 0, Pad.Dpr, 0, 0); Gc.fillStyle = "#4d9bff"; for (const [X, Y] of Drag.Points) { Gc.beginPath(); Gc.arc(X, Y, 3, 0, 7); Gc.fill(); } }
      return;
    }
    const U = [Clamp(L.x / Pad.W), Clamp(L.y / Pad.H)];
    if (Tool === "gradient") {
      const Line = Tools.gradient.line || [U, U];
      const Next = Drag.Handle === 0 ? [U, Line[1]] : [Line[0], U];
      Api.Emit("tool-set", ["gradient", "line", Next]);
    } else if (Tool === "text") Api.Emit("tool-set", ["text", "at", U]);
    else if (Tool === "move") { Api.Emit("tool-set", ["move", "dx", Drag.Dx + (L.x - Drag.Start.x)]); Api.Emit("tool-set", ["move", "dy", Drag.Dy + (L.y - Drag.Start.y)]); }
    else if (Tool === "eyedropper") Api.Emit("sample", { X: L.x, Y: L.y, Final: false });
  }

  function OnUp(E) {
    if (!Drag) return;
    const Tool = Drag.Tool;
    if (Live) {
      const Op = Live.Op;
      Live = null;
      if (Op.Points.length === 1) Op.Points.push({ ...Op.Points[0], x: Op.Points[0].x + 0.01 });
      Push(Op);
      DrawOp(Ctx2(Committed), Op, Api.View(), { Final: true });
      Pad.Render();
    } else if (Tool === "stamp" && Drag.Points?.length) Commit(StampOp(Api.Tools().stamp, Drag.Points));
    else if (Tool === "eyedropper") { const L = Local(E); Api.Emit("sample", { X: L.x, Y: L.y, Final: true }); }
    Drag = null;
    Api.Emit("pad-up", Tool);
  }

  const OnLeave = () => { Hover = null; if (Gx) DrawGuides(); };
  View.addEventListener("pointerdown", OnDown);
  View.addEventListener("pointermove", OnMove);
  View.addEventListener("pointerup", OnUp);
  View.addEventListener("pointercancel", OnUp);
  View.addEventListener("pointerleave", OnLeave);
  const Observer = globalThis.ResizeObserver ? new ResizeObserver(() => Pad.Resize()) : null;
  Observer?.observe(View);
  Pad.Destroy = () => { Observer?.disconnect(); View.removeEventListener("pointerdown", OnDown); View.removeEventListener("pointermove", OnMove); View.removeEventListener("pointerup", OnUp); };
  Pad.Resize();
  return Pad;
}
