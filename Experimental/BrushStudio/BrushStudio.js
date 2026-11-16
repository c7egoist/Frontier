// BrushStudio.js — Procreate-style Brush Studio for texture painting, in the Project Zero visual language.
//
// Layout (left → right): Brush Library card · blank workspace Viewport · Studio card (section list | settings).
// The viewport carries the tool rail (Paint · Smudge · Erase | Fill · Stamp · Gradient · Text · Curve · Move | Eyedropper),
// the size / opacity sliders and the closable Drawing Pad — a small previewer, not the workspace.  Every tool has its
// own dedicated studio (Brush Studio, Stamp Studio for decals, Text Studio, Eraser Studio …) laid out the same way:
// pick a tool on the rail and the Studio card switches to it.
//
//   Mount(Host, { brush, tool, pad }) → Hub { State, Brush(), SetValue(), Select(), Section(), Tool(), Studio(), TogglePad(), Pad, Render }

import { icon } from "../MaterialInspector/Icons.js";
import { Esc, Knob, ColourField, Stops, SwitchRow, Toggle, Segments, Dropdown, Clamp, Pct, Fixed, SyncSiblings, Download, History } from "../MaterialInspector/CardKit.js";
import * as M from "./BrushModel.js";
import { TOOLS, TOOL, CreateTools, SetToolValue, PatchTool, TOOL_STACKS, VisibleToolFields, ERASERS, STUDIOS, TOOL_COLOURS, PALETTE, ToolChanged, ToolChangedBySection, SectionGroups, ToolDefault } from "./ToolModel.js";
import { ChannelStack, StackAction, StackUi, ParseStackBind, VisibleCardFields } from "../MaterialInspector/ChannelStack.js";
import { MountViewport } from "../MaterialInspector/Viewport.js";
import { paintTool, toolSchema, toolArtURL } from "./Engine/PaintToolCatalogue.js";
import { RenderStroke } from "./Painter.js";
import { PreviewPoints, sampleCurve } from "./BrushEngine.js";
import { ShapeThumb, GrainThumb, Tip, GrainValues, GRAIN_SIZE } from "./Sources.js";
import { CreatePad } from "./Pad.js";

const FAMILY_COLOURS = { pen: "#3b82f6", pencil: "#c98a3a", "colored-pencil": "#e0603f", brush: "#a855f7", marker: "#2f6d75", eraser: "#d67a8b", stylus: "#22c55e", spray: "#2a86c9", dry: "#b3a85e", glitter: "#d4af37" };
const FAMILY_LABEL = (K) => ({ "colored-pencil": "Coloured pencil", dry: "Dry media" })[K] || K[0].toUpperCase() + K.slice(1);
const PAPERS = { paper: "#efece4", grey: "#8a8a86", dark: "#151515" };
const VIEWS = [["Colour", "albedo"], ["Rough", "roughness"], ["Metal", "metalness"], ["Height", "height"], ["Glow", "emissive"]];
const RAIL = [["paint", "smudge", "erase"], ["fill", "stamp", "gradient", "text", "curve", "move"], ["eyedropper"]];
const PARAM_TARGETS = {
  size: "Properties · Size", opacity: "Properties · Opacity", strength: "Properties · Opacity", flow: "Rendering · Flow", smoothing: "StreamLine",
  pressure: "Stylus · Pressure size", bleed: "Stylus · Bleed", tilt: "Stylus · Tilt size", grain: "Grain · Depth", softness: "Shape · Hardness",
  wetness: "Wet mix · Pull, Dilution", taperAmt: "Taper · Size", scatter: "Stroke · Jitter lateral", jitter: "Dynamics · Size jitter",
  spread: "Stroke · Jitter lateral", density: "Shape · Count", buildup: "Rendering · Flow", pigment: "Wet mix · Grade", smear: "Wet mix · Pull",
  streak: "Rendering · Wet edges", glow: "Materials · Emission", sparkle: "Colour · Stamp brightness", taper: "Taper · Size", nib: "Shape · Roundness", hardness: "Shape · Hardness",
};

export function Mount(Host, Options = {}) {
  const St = {
    Brushes: {}, Custom: [], ActiveId: Options.brush || "brush-hog-bristle-flat-12-oil", Section: "stroke", Open: new Set(), Filter: "",
    Tool: TOOL[Options.tool] ? Options.tool : "paint", PrevTool: "paint", Studio: null, ToolSection: {}, PadOpen: Options.pad !== false, View: "albedo", Paper: "paper", Live: true, Preview: true,
    Tools: CreateTools(), Recent: [], Colours: [], Stats: {}, Note: "",
    Stacks: {},   // ChannelStack UI per stack bind: { Open, Folds, Query }
  };
  St.Studio = St.Tool;
  if (!M.PAINT_TOOLS.some((T) => T.id === St.ActiveId)) St.ActiveId = M.PAINT_TOOLS.find((T) => T.key === "brush").id;
  St.Open.add(paintTool(St.ActiveId).key);
  const Cache = new Map();
  const Base = (Id) => { if (!Cache.has(Id)) Cache.set(Id, M.FromInstrument(Id)); return Cache.get(Id); };
  const BrushOf = (Id) => St.Brushes[Id] || Base(Id);
  const Brush = () => BrushOf(St.ActiveId);
  const H = History(120);
  const Hub = { State: St, Brush, BrushOf };

  // ---------------------------------------------------------------------------------------------- skeleton
  Host.innerHTML = `<div class="bs-shell" data-pad="${St.PadOpen ? "open" : "closed"}">
    <aside class="mi-card bs-lib" aria-label="Brush library"></aside>
    <div class="bs-view vp-host"></div>
    <section class="mi-card bs-studio" aria-label="Tool studio">
      <header class="mi-head bs-head"></header>
      <div class="bs-body">
        <nav class="bs-sections" aria-label="Studio sections"></nav>
        <div class="bs-settings" role="region" aria-label="Section settings"></div>
      </div>
    </section>
    <input type="file" class="bs-file" accept=".json,.brush,application/json" hidden>
  </div>`;
  const $ = (S) => Host.querySelector(S);
  const Vp = MountViewport($(".bs-view"), { Title: "Viewport", Meta: "Texture painting", Views: VIEWS, View: St.View, Chips: ["Texture painting"], OnView: (V) => { St.View = V; Pad.Replay(); RenderPadBar(); } });
  Vp.Body.innerHTML = `<div class="bs-rail" role="toolbar" aria-label="Paint tools"></div>
    <div class="bs-side"></div>
    <div class="bs-pad" role="dialog" aria-label="Drawing pad preview">
      <div class="bs-padbar"></div>
      <div class="bs-stage" data-paper="paper">
        <canvas class="bs-canvas" aria-label="Drawing pad"></canvas>
        <canvas class="bs-guide" aria-hidden="true"></canvas>
      </div>
      <footer class="bs-foot"></footer>
    </div>
    <div class="bs-toast" aria-live="polite"></div>`;
  const Shell = $(".bs-shell"), Lib = $(".bs-lib"), Head = $(".bs-head"), Nav = $(".bs-sections"), Settings = $(".bs-settings");
  const PadBar = $(".bs-padbar"), Stage = $(".bs-stage"), Rail = $(".bs-rail"), Side = $(".bs-side"), Foot = $(".bs-foot"), Toast = $(".bs-toast");

  // ---------------------------------------------------------------------------------------------- derived brushes for tools
  let EraseMemo = null, SmudgeMemo = null;
  function EraserBrush() {
    const T = St.Tools.erase, Src = T.useBrush ? Brush() : Base(T.instrument);
    const Key = JSON.stringify(T) + (T.useBrush ? St.ActiveId + JSON.stringify(Src.values) : T.instrument);
    if (EraseMemo?.Key === Key) return EraseMemo.Brush;
    const V = { ...Src.values, "prop.size": T.size, "prop.opacity": 100, "render.flow": T.flow, "stab.streamline": T.streamline, "pen.size": T.pressure, "taper.size": T.taper ? Math.max(40, Src.values["taper.size"]) : 0, "render.blend": "Normal", "render.mode": "light-glaze" };
    if (!T.useBrush) {
      V["shape.hardness"] = T.hardness;
      V["shape.source"] = T.edge === "Hard" ? "hard" : "round";
      V["grain.source"] = T.edge === "Grain" ? "paper" : "none";
      V["grain.depth"] = 85;
    }
    EraseMemo = { Key, Brush: { ...Src, values: M.Normalise(V) } };
    return EraseMemo.Brush;
  }
  function SmudgeBrush() {
    const T = St.Tools.smudge, Src = Brush();
    const Key = JSON.stringify(T) + St.ActiveId + (T.useBrush ? JSON.stringify(Src.values) : "");
    if (SmudgeMemo?.Key === Key) return SmudgeMemo.Brush;
    const V = T.useBrush ? { ...Src.values } : { ...M.DEFAULTS, "shape.source": "round", "shape.hardness": T.hardness, "prop.size": T.size, "prop.maxSize": 60, "taper.size": 30 };
    Object.assign(V, { "stroke.spacing": T.spacing, "stab.streamline": T.streamline, "render.mode": "light-glaze", "render.blend": "Normal", "prop.opacity": 100 });
    SmudgeMemo = { Key, Brush: { ...Src, values: M.Normalise(V) } };
    return SmudgeMemo.Brush;
  }

  // ---------------------------------------------------------------------------------------------- pad
  const Pad = CreatePad(Stage, {
    Brush, Tools: () => St.Tools, Tool: () => St.Tool, View: () => St.View, Live: () => St.Live, Preview: () => St.Preview,
    EraserBrush, SmudgeBrush, Emit: OnPad,
  });
  Hub.Pad = Pad;

  function OnPad(Kind, Data) {
    if (Kind === "stats") { St.Stats = Data; RenderFoot(); }
    else if (Kind === "ops") { RenderRail(); RenderFoot(); }
    else if (Kind === "tool-set") {
      const [Tool, Key, Value] = Data;
      St.Tools = { ...St.Tools, [Tool]: { ...St.Tools[Tool], [Key]: Value } };
      Pad.Schedule();
      RefreshReadouts();
    } else if (Kind === "move-reset") { St.Tools = SetToolValue(St.Tools, "move", "u", 0); Object.assign(St.Tools.move, { v: 0, dx: 0, dy: 0, scale: 100, rotation: 0, flipX: false, flipY: false }); RenderToolUi(); Pad.Render(); }
    else if (Kind === "sample") Sampled(Data);
  }

  function Sampled({ X, Y, Final }) {
    const E = St.Tools.eyedropper, Radius = { Point: 0, "3×3": 1, "5×5": 2, "11×11": 5 }[E.size] ?? 1;
    const S = Pad.SampleAt(X, Y, Math.round(Radius * Pad.Dpr), E.from === "Pad", PAPERS[St.Paper]);
    E.last = S?.Hex ? S : null;
    RefreshSample();
    if (!Final || !S?.Hex) return;
    const Key = E.target === "Secondary" ? "colour.secondary" : "colour.primary";
    EditBrush((B) => M.SetValue(B, Key, S.Hex));
    E.history = [S.Hex, ...E.history.filter((C) => C !== S.Hex)].slice(0, 12);
    RememberColour(S.Hex);
    Flash(`Sampled ${S.Hex.toUpperCase()} → ${E.target.toLowerCase()}`);
    if (E.returnTool && St.PrevTool !== "eyedropper") SetTool(St.PrevTool);
    else RenderToolUi();
  }

  // ---------------------------------------------------------------------------------------------- editing
  function EditBrush(Fn, { Live = false } = {}) {
    const Before = Brush();
    if (!Live) H.Begin({ Id: St.ActiveId, Brush: Before });
    else H.Begin({ Id: St.ActiveId, Brush: Before });
    const Next = Fn(Before);
    if (Next === Before) return;
    St.Brushes[St.ActiveId] = Next;
    if (!Live) H.Settle({ Id: St.ActiveId, Brush: Next });
    AfterBrushChange();
  }
  Hub.SetValue = (Key, Value) => EditBrush((B) => M.SetValue(B, Key, Value));
  Hub.Settle = () => { if (H.Settle({ Id: St.ActiveId, Brush: Brush() })) RenderHead(); };

  let SigSettings = "";
  function AfterBrushChange() {
    RenderSections();
    RenderHead();
    RenderSide();
    if (SettingsSig() !== SigSettings) RenderSettings(); else { RefreshEdited(); PaintPreviews(); }
    RenderRail();
    Pad.Schedule(St.Live && Pad.Ops.some((O) => O.Kind === "paint"));
    ScheduleThumb(St.ActiveId);
  }

  function Step(Back) {
    const Snap = H.Step(Back, { Id: St.ActiveId, Brush: Brush() });
    if (!Snap) return;
    St.Brushes[Snap.Id] = Snap.Brush;
    if (Snap.Id !== St.ActiveId) { St.ActiveId = Snap.Id; RenderLibrary(); }
    RenderAllBrushParts();
  }
  function RenderAllBrushParts() { RenderHead(); RenderSections(); RenderSettings(); RenderSide(); RenderRail(); Pad.Schedule(St.Live); ScheduleThumb(St.ActiveId); }

  function Select(Id) {
    if (!M.PAINT_TOOLS.some((T) => T.id === Id) && !St.Brushes[Id]) return;
    St.ActiveId = Id;
    St.Recent = [Id, ...St.Recent.filter((R) => R !== Id)].slice(0, 6);
    H.Clear();
    RenderLibrary();
    RenderAllBrushParts();
  }
  Hub.Select = Select;

  function RememberColour(Hex) { St.Colours = [Hex, ...St.Colours.filter((C) => C !== Hex)].slice(0, 10); }

  // Bind addresses: b|sec.key  ·  p|param  ·  t|tool|key  ·  m|meta   (palette / stop entries add :index)
  function Write(Bind, Raw, { Live = false } = {}) {
    const At = ParseStackBind(Bind);
    if (At) { const S = StackOf(At.Base); if (S) ApplyStackPatch(S, S.L.Field(S.Flat, At.Ch, At.Key, Raw), { Live }); return; }
    const [Scope, A, B2] = Bind.split("|");
    if (Scope === "b") {
      const [Key, Index] = A.split(":"), F = M.FIELDS[Key];
      if (!F) return;
      let V = Raw;
      if (F.T === "slider") { V = +Raw; if (!Number.isFinite(V)) return; }
      if (F.T === "colour" && !M.HEX.test(V)) return;
      if (Index != null) { if (!M.HEX.test(V)) return; const L = [...Brush().values[Key]]; L[+Index] = V; V = L; }
      EditBrush((Br) => M.SetValue(Br, Key, V), { Live });
      if (F.T === "colour" && !Live) RememberColour(V);
    } else if (Scope === "p") {
      const C = toolSchema(Brush().instrument).flatMap((G) => G.controls).find((E) => E.k === A);
      if (!C) return;
      const V = C.type === "slider" ? +Raw : Raw;
      EditBrush((Br) => M.SetParam(Br, A, V), { Live });
    } else if (Scope === "t") {
      const [Key, Index] = B2.split(":");
      let V = Raw;
      const F = TOOL[A].Groups.flatMap((G) => G.Fields).find((E) => E.K === Key);
      if (F?.T === "slider") V = +Raw;
      if (Index != null) { const L = [...St.Tools[A][Key]]; if (!M.HEX.test(V)) return; L[+Index] = V; V = L; }
      if (F?.T === "colour" && !M.HEX.test(V)) return;
      St.Tools = SetToolValue(St.Tools, A, Key, V);
      if (A === "erase") EraseMemo = null;
      if (A === "smudge") SmudgeMemo = null;
      if (SettingsSig() !== SigSettings || Key === "preset") RenderSettings(); else { RefreshEdited(); PaintPreviews(); }
      RenderSections(); RenderHead(); RenderSide();
      Pad.Schedule();
    } else if (Scope === "m") {
      const Clean = String(Raw).replace(/[\u0000-\u001f]/g, "").slice(0, A === "signature" ? 120 : 80);
      St.Brushes[St.ActiveId] = { ...Brush(), [A]: Clean };
      if (!Live) { RenderLibrary(); RenderHead(); RenderSections(); }
      else { RenderHead(); }
    }
  }

  // ---------------------------------------------------------------------------------------------- channel stacks
  // Paint channels are a ChannelStack (MaterialInspector/ChannelStack.js) everywhere: the brush's Materials section, the
  // Paint / Curve tool popups (both show the brush's stack) and each tool's own channel stack (Fill, Stamp, Text,
  // Gradient, Erase, Smudge, Move).  Bind "b|mat.stack" or "t|<tool>|stack"; card fields bind "<stack>@<channel>.<key>".
  const ToolBase = CreateTools();
  const StackUiOf = (Bind) => (St.Stacks[Bind] ||= StackUi());
  function StackOf(Base) {
    const [Scope, A, B2] = Base.split("|");
    if (Scope === "b" && M.FIELDS[A]?.T === "stack") return { Scope, Bind: Base, L: M.FIELDS[A].Stack, Flat: Brush().values, Reset: Brush().reset.values };
    if (Scope === "t" && B2 === "stack" && TOOL_STACKS[A]) return { Scope, Bind: Base, Tool: A, L: TOOL_STACKS[A], Flat: St.Tools[A], Reset: ToolBase[A] };
    return null;
  }
  function ApplyStackPatch(S, Patch, { Live = false } = {}) {
    if (S.Scope === "b") EditBrush((Br) => ({ ...Br, values: M.Normalise({ ...Br.values, ...Patch }) }), { Live });
    else {
      St.Tools = PatchTool(St.Tools, S.Tool, Patch);
      if (S.Tool === "erase") EraseMemo = null;
      if (S.Tool === "smudge") SmudgeMemo = null;
      if (SettingsSig() !== SigSettings) RenderSettings(); else { RefreshEdited(); PaintPreviews(); }
      RenderSections(); RenderHead(); RenderSide();
    }
    Pad.Schedule(St.View !== "albedo" || S.Scope === "b");
  }
  const StackFieldEdited = (S, Ch, K) => { const A = S.L.Read(S.Flat).per[Ch], B = S.L.Read(S.Reset).per[Ch]; return JSON.stringify(A?.[K]) !== JSON.stringify(B?.[K]); };
  function StackAlbedo(S) {
    if (S.Scope === "b") return { Albedo: Brush().values["colour.primary"], AlbedoText: Brush().values["colour.primary"].toUpperCase() };
    const V = St.Tools[S.Tool];
    if (S.Tool === "gradient") return { Albedo: `linear-gradient(90deg, ${V.stops.join(", ")})`, AlbedoText: `${V.stops.length} stops` };
    return V.colour ? { Albedo: V.colour, AlbedoText: V.colour.toUpperCase() } : {};
  }
  function StackHtml(Title, Bind) {
    const S = StackOf(Bind);
    if (!S) return "";
    const Full = S.L.Read(S.Flat), Base = S.L.Read(S.Reset);
    const Edited = (C) => Full.on.includes(C.Id) !== Base.on.includes(C.Id) || JSON.stringify(Full.per[C.Id]) !== JSON.stringify(Base.per[C.Id]);
    return ChannelStack({
      Bind, Title, Value: Full, Card: S.L.Card, Ui: StackUiOf(Bind), Tone: "blue", Edited, ...StackAlbedo(S),
      Hint: S.Scope === "b" ? "this brush" : `${TOOL[S.Tool].Label.toLowerCase()} tool`,
      Field: (F, V, B, Ch) => FieldHtml(F, V, B, StackFieldEdited(S, Ch.Id, F.K)),
    });
  }
  function StackSig(Bind) {
    const S = StackOf(Bind);
    if (!S) return "";
    const Full = S.L.Read(S.Flat), Ui = StackUiOf(Bind), Ch = Ui.Open && M.PAINT_CHANNEL[Ui.Open];
    return `${Full.on.join(",")}~${Ui.Open}~${JSON.stringify(Ui.Folds)}~${Ui.Query}~${Ch ? VisibleCardFields(S.L.Card, Ch, Full.per[Ch.Id]).map((F) => F.K).join(",") : ""}`;
  }
  const FieldSig = (F, Tool) => (F.T === "stack" ? StackSig(Tool ? `t|${Tool}|${F.K}` : `b|${F.K}`) : F.K === "@mat.stack" ? StackSig("b|mat.stack") : "");
  // After a slider drag: refresh row readouts and swatches without rebuilding the open card.
  function RefreshStacks() {
    for (const El of Settings.querySelectorAll(".cs-stack[data-bind]")) {
      const T = document.createElement("template");
      T.innerHTML = StackHtml(El.getAttribute("aria-label"), El.dataset.bind);
      for (const Row of El.querySelectorAll(".cs-row")) {
        const Twin = T.content.querySelector(`.cs-row[data-row="${Row.dataset.row}"]`);
        if (!Twin) continue;
        Row.classList.toggle("edited", Twin.classList.contains("edited"));
        for (const Sel of [".mi-readout", ".mi-swatch"]) { const A = Row.querySelector(`.mi-row-head ${Sel}`), B = Twin.querySelector(`.mi-row-head ${Sel}`); if (A && B && A.outerHTML !== B.outerHTML) A.outerHTML = B.outerHTML; }
      }
      const Count = El.querySelector(".cs-head small"), Twin = T.content.querySelector(".cs-head small");
      if (Count && Twin) Count.textContent = Twin.textContent;
    }
  }

  // ---------------------------------------------------------------------------------------------- field rendering
  const Changed = () => M.Changed(Brush());
  const ResetBtn = (Bind, On) => (On ? `<button type="button" class="bs-reset" data-act="field-reset" data-bind="${Bind}" title="Back to the reset point" aria-label="Reset">${icon("reset", 10)}</button>` : "");
  const Label = (L, Hint, Bind, Edited) => `<span class="bs-label ${Edited ? "edited" : ""}"><span>${Esc(L)}${Hint ? `<small>${Esc(Hint)}</small>` : ""}</span>${ResetBtn(Bind, Edited)}</span>`;

  function CurveHtml(Bind, Points, Label2, Edited) {
    return `<div class="bs-curve ${Edited ? "edited" : ""}" data-curve="${Bind}">
      ${Label("" + Label2, "", Bind, Edited)}
      <svg viewBox="0 0 320 132" class="bs-curve-svg" role="img" aria-label="${Esc(Label2)} curve">${CurveSvg(Points)}</svg>
      <div class="bs-curve-presets">${Object.keys(M.CURVE_PRESETS).map((K) => `<button type="button" class="bs-preset ${JSON.stringify(M.CURVE_PRESETS[K]) === JSON.stringify(Points) ? "active" : ""}" data-act="curve-preset" data-bind="${Bind}" data-value="${K}" title="${K}"><svg viewBox="0 0 24 16">${MiniCurve(M.CURVE_PRESETS[K])}</svg></button>`).join("")}</div>
    </div>`;
  }
  const CX = (X) => 10 + X * 300, CY = (Y) => 122 - Y * 112;
  function CurveSvg(Points) {
    const Grid = [0.25, 0.5, 0.75].map((T) => `<line x1="${CX(T)}" y1="10" x2="${CX(T)}" y2="122"/><line x1="10" y1="${CY(T)}" x2="310" y2="${CY(T)}"/>`).join("");
    const Path = Array.from({ length: 65 }, (_, I) => { const X = I / 64; return `${I ? "L" : "M"}${CX(X).toFixed(1)} ${CY(sampleCurve(Points, X)).toFixed(1)}`; }).join(" ");
    return `<rect x="10" y="10" width="300" height="112" rx="10" class="bs-curve-bg"/><g class="bs-curve-grid">${Grid}</g>
      <path d="${Path} L310 122 L10 122 Z" class="bs-curve-fill"/><path d="${Path}" class="bs-curve-line"/>
      ${Points.map(([X, Y], I) => `<circle cx="${CX(X)}" cy="${CY(Y)}" r="6.5" class="bs-curve-pt" data-i="${I}"/>`).join("")}`;
  }
  const MiniCurve = (P) => `<path d="${Array.from({ length: 17 }, (_, I) => `${I ? "L" : "M"}${(2 + (I / 16) * 20).toFixed(1)} ${(14 - sampleCurve(P, I / 16) * 12).toFixed(1)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;

  // Shape / grain source: a large preview of the current source beside a dropdown of every source (with thumbnails).
  const SourcePick = (Bind, List, Value, Thumb, Label2, Kind) => {
    const Cur = List.find((S) => S.Id === Value) || List[0];
    return `<div class="bs-source-pick ${Kind}"><img class="bs-source-big" alt="${Esc(Cur.Label)}" src="${Thumb(Cur.Id)}">${Dropdown("set", List.map((S) => [S.Label, S.Id, `<img alt="" src="${Thumb(S.Id)}">`]), Value, { Label: Label2, Extra: `data-bind="${Bind}"`, Class: `bs-dd-thumbs ${Kind}` })}</div>`;
  };

  // One field → HTML.  `Value` read from the right scope by the caller.
  function FieldHtml(F, Value, Bind, Edited = false) {
    switch (F.T) {
      case "slider": return Knob({ Bind, Label: F.L, Value, Min: F.Min, Max: F.Max, Step: F.Step, Unit: F.Unit, Hint: F.Hint, Tools: ResetBtn(Bind, Edited) }).replace('class="mi-knob"', `class="mi-knob ${Edited ? "edited" : ""}"`);
      case "switch": return `<div class="bs-switch ${Edited ? "edited" : ""}">${SwitchRow("toggle", Value, F.L, F.Hint, `data-bind="${Bind}"`)}${ResetBtn(Bind, Edited)}</div>`;
      case "seg": return `<div class="bs-field">${Label(F.L, F.Hint, Bind, Edited)}${(F.Opts.length > 4 ? Dropdown : Segments)("set", F.Opts.map((O) => [F.Labels?.[O] || O, O]), Value, { Label: F.L, Extra: `data-bind="${Bind}"` })}</div>`;
      case "select": return `<div class="bs-field">${Label(F.L, F.Hint, Bind, Edited)}${Dropdown("set", F.Opts.map((O) => [F.Labels?.[O] || O, O]), Value, { Label: F.L, Extra: `data-bind="${Bind}"`, Fid: Bind })}</div>`;
      case "colour": return `<div class="bs-field">${Label(F.L, F.Hint, Bind, Edited)}${ColourField(Bind, F.L, Value, "")}</div>`;
      case "curve": return CurveHtml(Bind, Value, F.L, Edited);
      case "shape": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}${SourcePick(Bind, M.SHAPES, Value, ShapeThumb, "Shape source", "")}</div>`;
      case "grain": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}${SourcePick(Bind, M.GRAINS, Value, GrainThumb, "Grain source", "grain")}</div>`;
      case "render": return `<div class="bs-field">${Label(F.L || "Rendering mode", "", Bind, Edited)}${Dropdown("set", M.RENDER_MODES.map((R, I) => [R.Label, R.Id, `<i class="bs-render-art m${I}"></i>`, R.Hint]), Value, { Label: "Rendering mode", Extra: `data-bind="${Bind}"`, Class: "bs-dd-render", Search: false })}</div>`;
      case "gradient": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}${Dropdown("set", M.COLOUR_GRADIENT_PRESETS.map((G) => [G.label, G.id, `<i class="bs-dd-grad" style="background:linear-gradient(90deg, ${G.stops.join(", ")})"></i>`, G.sub || ""]), Value, { Label: F.L, Extra: `data-bind="${Bind}"` })}</div>`;
      case "stack": return StackHtml(F.L, Bind);
      case "palette": case "stops": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}${Stops(Bind, Value, 8, 2)}</div>`;
      case "text": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}<textarea class="bs-text" data-bind="${Bind}" data-fid="${Bind}" rows="2" spellcheck="false" aria-label="${Esc(F.L)}">${Esc(Value)}</textarea></div>`;
      default: return "";
    }
  }

  // ---------------------------------------------------------------------------------------------- library card
  function RenderLibrary() {
    const Q = St.Filter.trim().toLowerCase();
    const Match = (Id) => !Q || BrushOf(Id).name.toLowerCase().includes(Q) || paintTool(BrushOf(Id).instrument).key.includes(Q);
    const Edited = (Id) => St.Brushes[Id] && M.Changed(St.Brushes[Id]).size > 0;
    const Row = (Id) => {
      const B = BrushOf(Id), Active = Id === St.ActiveId;
      return `<button type="button" class="bs-lib-row ${Active ? "active" : ""}" data-act="pick" data-id="${Esc(Id)}" aria-current="${Active}" title="${Esc(B.name)}">
        <canvas class="bs-thumb" data-thumb="${Esc(Id)}" width="380" height="64"></canvas>
        <span class="bs-lib-name"><b>${Esc(B.name)}</b>${Edited(Id) ? `<i class="bs-dot" title="Edited"></i>` : ""}</span>
      </button>`;
    };
    const Mine = St.Custom.filter(Match);
    const Groups = M.PAINT_FAMILIES.map((F) => ({ F, Ids: M.PAINT_TOOLS.filter((T) => T.key === F.key).map((T) => T.id).filter(Match) })).filter((G) => G.Ids.length);
    const Total = M.PAINT_TOOLS.length + St.Custom.length;
    Lib.innerHTML = `<header class="bs-lib-head">
        <h1>Brushes</h1>
        <span class="bs-count">${Total}</span>
        <button type="button" class="ol-round" data-act="duplicate" title="New brush from the active one" aria-label="Duplicate active brush">${icon("plus", 14)}</button>
      </header>
      <label class="mi-search bs-lib-search">${icon("search", 13)}<input type="search" data-act="filter" value="${Esc(St.Filter)}" placeholder="Search ${Total} brushes" aria-label="Search brushes"></label>
      <div class="bs-lib-list">
        ${Mine.length ? `<div class="bs-fam open"><div class="bs-fam-head mine"><i style="background:#ff6b9a"></i><b>My brushes</b><small>${Mine.length}</small></div>${Mine.map(Row).join("")}</div>` : ""}
        ${Groups.map(({ F, Ids }) => {
          const Open = Q || St.Open.has(F.key);
          return `<div class="bs-fam ${Open ? "open" : ""}">
            <button type="button" class="bs-fam-head" data-act="family" data-family="${F.key}" aria-expanded="${!!Open}"><span class="mi-chev">${icon("chevron", 10)}</span><i style="background:${FAMILY_COLOURS[F.key]}"></i><b>${Esc(FAMILY_LABEL(F.key))}</b><small>${Ids.length}</small></button>
            ${Open ? Ids.map(Row).join("") : ""}
          </div>`;
        }).join("") || `<p class="mi-empty">No brush matches “${Esc(St.Filter)}”.</p>`}
      </div>
`;
    PaintThumbs();
  }

  // Library stroke thumbnails are drawn by the real engine, a few per frame.
  let ThumbQueue = [], ThumbFrame = 0;
  function PaintThumbs() { ThumbQueue = [...Lib.querySelectorAll("canvas[data-thumb]")]; PumpThumbs(); }
  function ScheduleThumb(Id) { for (const C of Host.querySelectorAll(`canvas[data-thumb="${CSS.escape(Id)}"]`)) if (!ThumbQueue.includes(C)) ThumbQueue.push(C); PumpThumbs(); }
  function PumpThumbs() {
    if (ThumbFrame || !ThumbQueue.length) return;
    const Raf = globalThis.requestAnimationFrame || ((F) => setTimeout(F, 16));
    ThumbFrame = Raf(() => {
      ThumbFrame = 0;
      const T0 = Date.now();
      while (ThumbQueue.length && Date.now() - T0 < 14) { const C = ThumbQueue.shift(); if (C.isConnected) StrokeThumb(C, BrushOf(C.dataset.thumb)); }
      PumpThumbs();
    });
  }
  function StrokeThumb(C, B, { Fill = 0.34, Seed = 7 } = {}) {
    const X = C.getContext("2d");
    if (!X) return;
    X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, C.width, C.height);
    const Stamp = B.values["prop.stampPreview"];
    const Size = M.EffectiveSize(B.values), Scale = Clamp((C.height * Fill) / Size, 0.04, 3);
    const Pts = Stamp ? [{ x: C.width / 2, y: C.height / 2, p: 0.8, t: 0 }, { x: C.width / 2 + 0.01, y: C.height / 2, p: 0.8, t: 16 }] : PreviewPoints(C.width, C.height, { Pad: 0.06 }).map((P) => ({ ...P, y: C.height / 2 + (P.y - C.height / 2) * 0.62 }));
    const Light = { ...B, values: { ...B.values, "colour.primary": LightInk(B.values["colour.primary"]) } };
    RenderStroke(X, Light, Pts, { Seed, Scale: Stamp ? (C.height * 0.8) / Size : Scale, Final: true });
  }
  // Library strokes sit on dark cards, so very dark inks are lifted for legibility (the brush colour itself is unchanged).
  function LightInk(Hex) {
    const [R, G, B] = [1, 3, 5].map((I) => parseInt(Hex.slice(I, I + 2), 16));
    return 0.2126 * R + 0.7152 * G + 0.0722 * B < 90 ? "#e9e4da" : Hex;
  }

  // ---------------------------------------------------------------------------------------------- studio head
  // The Studio card follows the tool: Brush Studio for Paint, Stamp Studio (decals) for Stamp, Text Studio for Text …
  const IsBrushStudio = () => St.Studio === "paint";
  const StudioSections = (Tool = St.Studio) => Tool === "paint" ? [...STUDIOS.paint.Sections, ...M.SECTIONS] : STUDIOS[Tool].Sections;
  const SectionId = () => IsBrushStudio() ? St.Section : (St.ToolSection[St.Studio] || STUDIOS[St.Studio].Sections[0].Id);
  const ToolSec = () => (IsBrushStudio() ? STUDIOS.paint.Sections : STUDIOS[St.Studio].Sections).find((S) => S.Id === SectionId()) || null;
  const SecColour = (Id, Tool = St.Studio) => PALETTE[Math.max(0, StudioSections(Tool).findIndex((S) => S.Id === Id)) % PALETTE.length];
  const Glyph = (Name, Size, Colour) => `<span class="bs-glyph" style="--c:${Colour}">${icon(Name, Size)}</span>`;

  function RenderHead() {
    const Studio = STUDIOS[St.Studio], T = TOOL[St.Studio];
    const Pad1 = `<button type="button" class="icon-btn bs-padtoggle ${St.PadOpen ? "on" : ""}" data-act="pad-toggle" aria-pressed="${St.PadOpen}" title="${St.PadOpen ? "Hide" : "Show"} the drawing pad preview" aria-label="Drawing pad">${icon(St.PadOpen ? "eye" : "eye-off", 14)}</button>`;
    const Back = St.Studio !== St.Tool ? `<button type="button" class="mi-text-btn bs-back" data-act="studio-back" title="Back to the ${Esc(TOOL[St.Tool].Label)} studio">${icon("chevron", 9)}${Esc(STUDIOS[St.Tool].Title)}</button>` : "";
    if (IsBrushStudio()) {
      const B = Brush(), Count = Changed().size;
      Head.innerHTML = `${Glyph(T.Glyph, 18, TOOL_COLOURS.paint)}
        <span class="mi-head-title"><b>${Studio.Title}</b><small title="${Esc(B.name)}">${Esc(B.name)}${Count ? ` · ${Count} edited` : ""}</small></span>
        <span class="mi-head-tools">${Back}
          <button type="button" class="icon-btn" data-act="undo" ${H.Past.length ? "" : "disabled"} title="Undo setting (Alt+Z)" aria-label="Undo setting">${icon("undo", 14)}</button>
          <button type="button" class="icon-btn" data-act="redo" ${H.Future.length ? "" : "disabled"} title="Redo setting" aria-label="Redo setting">${icon("redo", 14)}</button>
          <button type="button" class="icon-btn" data-act="reset-all" ${Count ? "" : "disabled"} title="Back to the reset point" aria-label="Reset brush">${icon("reset", 14)}</button>
          <button type="button" class="icon-btn" data-act="export" title="Export this brush" aria-label="Export brush">${icon("download", 14)}</button>
          ${Pad1}
        </span>`;
      return;
    }
    const Count = ToolChanged(St.Studio, St.Tools[St.Studio]).size;
    Head.innerHTML = `${Glyph(T.Glyph, 18, TOOL_COLOURS[St.Studio])}
      <span class="mi-head-title"><b>${Studio.Title}</b><small>${Esc(Studio.Sub)}${Count ? ` · ${Count} edited` : ""}</small></span>
      <span class="mi-head-tools">${Back}
        <button type="button" class="icon-btn" data-act="tool-reset" ${Count ? "" : "disabled"} title="Reset every ${Esc(T.Label.toLowerCase())} setting" aria-label="Reset ${Esc(T.Label)} settings">${icon("reset", 14)}</button>
        ${Pad1}
      </span>`;
  }

  // ---------------------------------------------------------------------------------------------- section list
  function RenderSections() {
    const Tool = St.Studio, Active = SectionId();
    const ToolBy = ToolChangedBySection(Tool, St.Tools[Tool]);
    const By = IsBrushStudio() ? { ...M.ChangedBySection(Brush()), ...ToolBy } : ToolBy;
    const Row = (S) => `<button type="button" class="bs-sec ${S.Id === Active ? "active" : ""}" data-act="section" data-section="${S.Id}" aria-current="${S.Id === Active}" title="${Esc(S.Hint)}" style="--c:${SecColour(S.Id)}">
        ${Glyph(S.Glyph, 14, SecColour(S.Id))}<span class="bs-sec-label">${Esc(S.Label)}</span>${By[S.Id] ? `<i class="bs-sec-count" title="${By[S.Id]} edited">${By[S.Id]}</i>` : ""}
      </button>`;
    Nav.innerHTML = IsBrushStudio()
      ? `<small class="bs-sec-cap">Paint</small>${STUDIOS.paint.Sections.map(Row).join("")}<small class="bs-sec-cap">Brush</small>${M.SECTIONS.map(Row).join("")}`
      : `<small class="bs-sec-cap">${Esc(TOOL[Tool].Label)}</small>${STUDIOS[Tool].Sections.map(Row).join("")}`;
  }

  // ---------------------------------------------------------------------------------------------- settings column
  function ToolSig() {
    const Sec = ToolSec(), Tool = St.Studio, V = St.Tools[Tool], Bv = Brush().values;
    return `${Tool}|${Sec.Id}|${St.ActiveId}|` + SectionGroups(Tool, Sec).filter((G) => !G.When || G.When(V, Bv)).map((G) => VisibleToolFields(G, V, Bv).map((F) => F.K + FieldSig(F, Tool)).join(",")).join(";");
  }
  function SettingsSig() {
    if (ToolSec()) return ToolSig();
    const Sec = M.SECTIONS.find((S) => S.Id === St.Section), V = Brush().values;
    if (St.Section === "instrument") return `${St.Section}|${Brush().instrument}|${JSON.stringify(Brush().params)}`;
    if (St.Section === "about") return `${St.Section}|${St.ActiveId}`;
    return `${St.Section}|${St.ActiveId}|` + Sec.Groups.filter((G) => !G.When || G.When(V)).map((G) => M.VisibleFields(G, V).map((F) => F.K + FieldSig(F)).join(",")).join(";");
  }

  function RenderSettings() {
    if (ToolSec()) return RenderToolSettings();
    const Sec = M.SECTIONS.find((S) => S.Id === St.Section), B = Brush(), V = B.values, Ch = Changed();
    const Count = M.ChangedBySection(B)[Sec.Id];
    let Body = "";
    if (Sec.Id === "instrument") Body = InstrumentHtml(B);
    else if (Sec.Id === "about") Body = AboutHtml(B);
    else Body = Sec.Groups.filter((G) => !G.When || G.When(V)).map((G) => {
      const Fields = M.VisibleFields(G, V);
      if (!Fields.length) return "";
      return `<div class="bs-group"><div class="bs-group-title"><b>${Esc(G.Title)}</b>${G.Hint ? `<small>${Esc(G.Hint)}</small>` : ""}</div>
        ${Fields.map((F) => FieldHtml(F, V[F.K], `b|${F.K}`, Ch.has(F.K))).join("")}
        ${G.Title === "Shape source" ? `<div class="bs-preview-row"><canvas class="bs-tip-preview" width="168" height="168" aria-label="Stamp preview"></canvas><span><b>Stamp preview</b><small>Live tip with hardness, falloff, roundness and invert applied.</small></span></div>` : ""}
        ${G.Title === "Grain source" ? `<div class="bs-preview-row"><canvas class="bs-grain-preview" width="168" height="168" aria-label="Grain preview"></canvas><span><b>Grain preview</b><small>Scale, brightness, contrast and invert applied. Tiles seamlessly.</small></span></div>` : ""}
      </div>`;
    }).join("");
    Settings.innerHTML = `<div class="bs-set-head">
        ${Glyph(Sec.Glyph, 18, SecColour(Sec.Id))}
        <div><h2>${Esc(Sec.Label)}</h2><small>${Esc(Sec.Hint)}</small></div>
        ${Sec.Id !== "about" ? `<button type="button" class="mi-text-btn" data-act="reset-section" ${Count ? "" : "disabled"}>${icon("reset", 10)}Reset section</button>` : ""}
      </div>
      <div class="bs-set-body">${Body}</div>`;
    SigSettings = SettingsSig();
    PaintPreviews();
  }

  // A tool studio section: the tool's groups for this section, or its About page.
  function RenderToolSettings() {
    const Tool = St.Studio, T = TOOL[Tool], Sec = ToolSec(), V = St.Tools[Tool], Bv = Brush().values;
    const Count = ToolChangedBySection(Tool, V)[Sec.Id];
    const Scroll = Settings.scrollTop;
    const Body = Sec.Id === "about" ? ToolAboutHtml(Tool)
      : SectionGroups(Tool, Sec).filter((G) => !G.When || G.When(V, Bv)).map((G) => {
        const Fields = VisibleToolFields(G, V, Bv);
        if (!Fields.length) return "";
        return `<div class="bs-group"><div class="bs-group-title"><b>${Esc(G.Title)}</b>${G.Hint ? `<small>${Esc(G.Hint)}</small>` : ""}</div>${Fields.map((F) => ToolFieldHtml(Tool, F)).join("")}</div>`;
      }).join("");
    Settings.innerHTML = `<div class="bs-set-head">
        ${Glyph(Sec.Glyph, 18, SecColour(Sec.Id))}
        <div><h2>${Esc(Sec.Label)}</h2><small>${Esc(Sec.Hint)}</small></div>
        ${Sec.Id !== "about" ? `<button type="button" class="mi-text-btn" data-act="reset-section" ${Count ? "" : "disabled"}>${icon("reset", 10)}Reset section</button>` : ""}
      </div>
      <div class="bs-set-body" data-tool="${T.Id}">${Body}</div>`;
    Settings.scrollTop = Scroll;
    SigSettings = SettingsSig();
    PaintPreviews();
  }

  function ToolAboutHtml(Tool) {
    const T = TOOL[Tool], By = ToolChangedBySection(Tool, St.Tools[Tool]), Total = Object.values(By).reduce((A, N) => A + N, 0);
    const Rows = STUDIOS[Tool].Sections.filter((S) => By[S.Id]).map((S) => `<button type="button" class="bs-about-row" data-act="section" data-section="${S.Id}">${Glyph(S.Glyph, 11, SecColour(S.Id))}<span>${Esc(S.Label)}</span><i style="width:${Math.min(100, By[S.Id] * 20)}%;background:${SecColour(S.Id)}"></i><b>${By[S.Id]}</b></button>`).join("");
    const Uses = { smudge: "the active brush when “Smudge with current brush” is on", erase: "a catalogue eraser, or the active brush", curve: "the active brush" }[Tool];
    return `<div class="bs-tool-card" style="--c:${TOOL_COLOURS[Tool]}">${Glyph(T.Glyph, 30, TOOL_COLOURS[Tool])}
        <div><b>${Esc(T.Label)}</b><small>${Esc(T.Verb)}</small><small>Shortcut <kbd>${T.Key}</kbd>${Uses ? ` · paints with ${Esc(Uses)}` : ""}</small></div></div>
      <div class="bs-group"><div class="bs-group-title"><b>Since the defaults</b><small>${Total} setting${Total === 1 ? "" : "s"}</small></div>
        ${Rows || `<p class="mi-empty">Nothing edited — ${Esc(T.Label.toLowerCase())} is at its defaults.</p>`}
      </div>
      <div class="bs-group"><div class="bs-group-title"><b>Tool</b></div>
        <div class="bs-actions">
          ${St.Tool !== Tool ? `<button type="button" class="primary" data-act="tool" data-tool="${Tool}">${icon("check", 11)}Use ${Esc(T.Label)}</button>` : ""}
          <button type="button" data-act="tool-reset" ${Total ? "" : "disabled"}>${icon("reset", 11)}Reset all settings</button>
        </div>
      </div>`;
  }

  function RefreshEdited() {
    // Cheap pass after slider drags: edited dots and field reset buttons, without rebuilding inputs.
    const Ch = Changed(), B = Brush(), TCh = {};
    for (const K of Settings.querySelectorAll(".mi-knob, .bs-switch, .bs-field, .bs-curve")) {
      const El = K.querySelector("[data-bind]");
      if (!El) continue;
      const Bind = El.dataset.bind;
      let On;
      const At = ParseStackBind(Bind);
      if (At) { const S = StackOf(At.Base); if (!S) continue; On = StackFieldEdited(S, At.Ch, At.Key); }
      else if (Bind.startsWith("t|")) { const [, Tl, K2] = Bind.split("|"); if (!TCh[Tl]) TCh[Tl] = ToolChanged(Tl, St.Tools[Tl]); On = TCh[Tl].has(K2.split(":")[0]); }
      else {
        const Key = Bind.startsWith("b|") ? Bind.slice(2).split(":")[0] : Bind.startsWith("p|") ? `instrument.${Bind.slice(2)}` : null;
        if (!Key) continue;
        On = Ch.has(Key);
      }
      K.classList.toggle("edited", On);
      const Lab = K.querySelector(".bs-label"); Lab?.classList.toggle("edited", On);
      const Slot = K.querySelector(".mi-knob-label") || Lab || K;
      const Btn = Slot.querySelector(".bs-reset");
      if (On && !Btn) Slot.insertAdjacentHTML("beforeend", ResetBtn(Bind, true));
      if (!On && Btn) Btn.remove();
    }
    RefreshStacks();
    const Count = ToolSec() ? ToolChangedBySection(St.Studio, St.Tools[St.Studio])[SectionId()] : M.ChangedBySection(B)[St.Section];
    const RS = Settings.querySelector('[data-act="reset-section"]');
    if (RS) RS.disabled = !Count;
    for (const C of Settings.querySelectorAll(".bs-curve")) {
      const Bind = C.dataset.curve, Key = Bind.slice(2);
      const Pts = B.values[Key];
      if (!Pts) continue;
      for (const P of C.querySelectorAll(".bs-preset")) P.classList.toggle("active", JSON.stringify(M.CURVE_PRESETS[P.dataset.value]) === JSON.stringify(Pts));
    }
  }

  function InstrumentHtml(B) {
    const Tool = paintTool(B.instrument), Ch = Changed();
    const Schema = toolSchema(B.instrument);
    return `<div class="bs-instrument">
        <img alt="" src="${toolArtURL(B.instrument, true)}">
        <div><b>${Esc(Tool.label)}</b><small>${Esc(FAMILY_LABEL(Tool.key))} · TextureStudio catalogue</small><small>These are the catalogue tool's own controls. Each one drives studio settings, noted under it.</small></div>
      </div>
      ${Schema.map((G) => `<div class="bs-group"><div class="bs-group-title"><b>${Esc(G.title)}</b></div>
        ${G.controls.filter((C) => !C.when || C.when(B.params)).map((C) => {
          const Bind = `p|${C.k}`, V = B.params[C.k], Edited = Ch.has(`instrument.${C.k}`);
          const F = C.type === "slider" ? { T: "slider", L: C.label, Min: C.min, Max: C.max, Step: C.step || 1, Unit: C.unit || "", Hint: PARAM_TARGETS[C.k] ? `→ ${PARAM_TARGETS[C.k]}` : "" }
            : C.type === "switch" ? { T: "switch", L: C.label, Hint: PARAM_TARGETS[C.k] ? `→ ${PARAM_TARGETS[C.k]}` : "" }
            : { T: C.type === "seg" ? "seg" : "select", L: C.label, Opts: C.opts, Hint: PARAM_TARGETS[C.k] ? `→ ${PARAM_TARGETS[C.k]}` : "Character of the instrument" };
          return FieldHtml(F, V, Bind, Edited);
        }).join("")}
      </div>`).join("")}`;
  }

  function AboutHtml(B) {
    const By = M.ChangedBySection(B), Total = Object.values(By).reduce((A, N) => A + N, 0);
    const Rows = M.SECTIONS.filter((S) => By[S.Id]).map((S) => `<button type="button" class="bs-about-row" data-act="section" data-section="${S.Id}">${Glyph(S.Glyph, 11, SecColour(S.Id, "paint"))}<span>${Esc(S.Label)}</span><i style="width:${Math.min(100, By[S.Id] * 14)}%;background:${SecColour(S.Id, "paint")}"></i><b>${By[S.Id]}</b></button>`).join("");
    return `<div class="bs-about-card">
        <canvas class="bs-about-stroke" width="660" height="150" aria-label="Brush stroke"></canvas>
        <div class="bs-about-meta"><canvas class="bs-about-stamp" width="120" height="120" aria-label="Brush stamp"></canvas>
          <div><b>${Esc(B.name)}</b><small>${Esc(M.Caption(B))}</small><small>Made with ${Esc(paintTool(B.instrument).label)}</small></div></div>
        ${B.signature ? `<div class="bs-signature">${Esc(B.signature)}</div>` : ""}
      </div>
      <div class="bs-group"><div class="bs-group-title"><b>Brush</b></div>
        <div class="bs-field">${Label("Name", "", "m|name", B.name !== B.reset.name)}<input class="bs-input" data-bind="m|name" data-fid="m|name" value="${Esc(B.name)}" maxlength="80" aria-label="Brush name"></div>
        <div class="bs-field">${Label("Author", "", "m|author", false)}<input class="bs-input" data-bind="m|author" data-fid="m|author" value="${Esc(B.author)}" maxlength="80" aria-label="Author"></div>
        <div class="bs-field">${Label("Signature", "Shown on the brush card", "m|signature", false)}<input class="bs-input script" data-bind="m|signature" data-fid="m|signature" value="${Esc(B.signature)}" maxlength="120" placeholder="Sign your brush" aria-label="Signature"></div>
        <div class="bs-kv"><span>Created</span><b>${Esc(B.created)}</b><span>Instrument</span><b>${Esc(paintTool(B.instrument).label)}</b><span>Schema</span><b>${Esc(M.SCHEMA_ID)}</b></div>
      </div>
      <div class="bs-group"><div class="bs-group-title"><b>Since the reset point</b><small>${Total} setting${Total === 1 ? "" : "s"}</small></div>
        ${Rows || `<p class="mi-empty">Nothing edited — this brush matches its reset point.</p>`}
      </div>
      <div class="bs-group"><div class="bs-group-title"><b>Reset point</b><small>What “Reset” returns to</small></div>
        <div class="bs-actions">
          <button type="button" data-act="reset-point">${icon("check", 11)}Create new reset point</button>
          <button type="button" data-act="reset-all" ${Total ? "" : "disabled"}>${icon("reset", 11)}Reset all settings</button>
        </div>
      </div>
      <div class="bs-group"><div class="bs-group-title"><b>Share</b></div>
        <div class="bs-actions">
          <button type="button" data-act="duplicate">${icon("duplicate", 11)}Duplicate</button>
          <button type="button" data-act="export">${icon("download", 11)}Export .brush.json</button>
          <button type="button" data-act="import">${icon("upload", 11)}Import</button>
        </div>
      </div>`;
  }

  // Previews inside the settings column (stamp, grain, about card).
  function PaintPreviews() {
    const B = Brush(), V = B.values;
    const Tp = Settings.querySelector(".bs-tip-preview");
    if (Tp) {
      const X = Tp.getContext("2d");
      if (X) {
        X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, Tp.width, Tp.height);
        const T = Tip(V["shape.source"], { Hardness: V["shape.hardness"] / 100, Falloff: V["shape.falloff"], Invert: V["shape.invert"] });
        const S = Tp.width * 0.82;
        X.translate(Tp.width / 2, Tp.height / 2); X.scale(1, V["shape.roundness"] / 100);
        X.drawImage(T, -S / 2, -S / 2, S, S);
      }
    }
    const Gp = Settings.querySelector(".bs-grain-preview");
    if (Gp) {
      const X = Gp.getContext("2d");
      if (X) {
        const Vals = GrainValues(V["grain.source"], { Invert: V["grain.invert"], Brightness: V["grain.brightness"], Contrast: V["grain.contrast"] });
        const Img = X.createImageData(Gp.width, Gp.height), Tile = 0.18 + (V["grain.scale"] / 100) ** 1.4 * 3.2;
        for (let J = 0; J < Gp.height; J++) for (let I = 0; I < Gp.width; I++) {
          const U = Math.floor(I / Tile) % GRAIN_SIZE, W = Math.floor(J / Tile) % GRAIN_SIZE, G = Vals[W * GRAIN_SIZE + U], O = (J * Gp.width + I) * 4, L = 22 + G * 210;
          Img.data[O] = L; Img.data[O + 1] = L * 0.97; Img.data[O + 2] = L * 0.92; Img.data[O + 3] = 255;
        }
        X.putImageData(Img, 0, 0);
      }
    }
    const Ct = Settings.querySelector(".bs-card-thumb");
    if (Ct) StrokeThumb(Ct, Brush(), { Fill: 0.32 });
    const As = Settings.querySelector(".bs-about-stroke");
    if (As) StrokeThumb(As, B, { Fill: 0.3 });
    const Am = Settings.querySelector(".bs-about-stamp");
    if (Am) {
      const X = Am.getContext("2d");
      if (X) { X.setTransform(1, 0, 0, 1, 0, 0); X.clearRect(0, 0, Am.width, Am.height); RenderStroke(X, { ...B, values: { ...V, "colour.primary": LightInk(V["colour.primary"]), "stroke.jitterLateral": 0, "shape.count": 1 } }, [{ x: 60, y: 60, p: 0.9, t: 0 }, { x: 60.01, y: 60, p: 0.9, t: 16 }], { Seed: 3, Scale: 84 / M.EffectiveSize(V), Final: true }); }
    }
  }

  // ---------------------------------------------------------------------------------------------- pad chrome
  function RenderPadBar() {
    const View = VIEWS.find(([, Id]) => Id === St.View)?.[0] || "Colour";
    PadBar.innerHTML = `<span class="bs-padbar-title"><b>Drawing pad</b><small>Preview · ${Esc(View)} · ${Esc(TOOL[St.Tool].Label)}</small></span>
      <span class="bs-papers" role="radiogroup" aria-label="Paper">${Object.entries(PAPERS).map(([Id, C]) => `<button type="button" role="radio" aria-checked="${Id === St.Paper}" class="bs-paper ${Id === St.Paper ? "active" : ""}" data-act="paper" data-value="${Id}" style="--p:${C}" title="${Id[0].toUpperCase() + Id.slice(1)} paper" aria-label="${Id} paper"></button>`).join("")}</span>
      <button type="button" class="bs-ibtn ${St.Live ? "on" : ""}" data-act="live" aria-pressed="${St.Live}" title="Live — re-render your strokes as you edit the brush" aria-label="Live">${icon("play", 11)}</button>
      <button type="button" class="bs-ibtn ${St.Preview ? "on" : ""}" data-act="preview" aria-pressed="${St.Preview}" title="Show the preview stroke" aria-label="Preview stroke">${icon("wave", 12)}</button>
      <button type="button" class="bs-ibtn" data-act="clear" title="Clear the pad (undoable)" aria-label="Clear the pad">${icon("trash", 12)}</button>
      <button type="button" class="bs-ibtn" data-act="pad-toggle" title="Close the drawing pad" aria-label="Close the drawing pad">${icon("close", 11)}</button>`;
    Stage.dataset.paper = St.Paper;
    Stage.dataset.view = St.View;
  }

  function RenderRail() {
    Rail.innerHTML = RAIL.map((Group) => `<span class="bs-rail-group">${Group.map((Id) => {
      const T = TOOL[Id], Active = Id === St.Tool;
      return `<button type="button" class="bs-tool ${Active ? "active" : ""}" data-act="tool" data-tool="${Id}" aria-pressed="${Active}" title="${Esc(T.Label)} (${T.Key}) — opens the ${Esc(STUDIOS[Id].Title)}" style="--c:${TOOL_COLOURS[Id]}">${icon(T.Glyph, 16)}${Active && Id === "paint" ? `<i class="bs-tool-ink" style="background:${Brush().values["colour.primary"]}"></i>` : ""}</button>`;
    }).join("")}</span>`).join("") + `<span class="bs-rail-group">
      <button type="button" class="bs-tool plain" data-act="pad-undo" ${Pad.CanUndo() ? "" : "disabled"} title="Undo on the pad (Ctrl+Z)" aria-label="Undo on the pad">${icon("undo", 14)}</button>
      <button type="button" class="bs-tool plain" data-act="pad-redo" ${Pad.CanRedo() ? "" : "disabled"} title="Redo on the pad (Ctrl+Shift+Z)" aria-label="Redo on the pad">${icon("redo", 14)}</button>
      <button type="button" class="bs-tool plain ${St.PadOpen ? "on" : ""}" data-act="pad-toggle" aria-pressed="${St.PadOpen}" title="${St.PadOpen ? "Hide" : "Show"} the drawing pad" aria-label="Drawing pad">${icon("image", 14)}</button>
    </span>`;
  }

  function RenderSide() {
    const V = Brush().values;
    const Tool = St.Tool, T = St.Tools;
    const [SizeBind, Size, OpBind, Op] = Tool === "erase" ? ["t|erase|size", T.erase.size, "t|erase|strength", T.erase.strength]
      : Tool === "smudge" && !T.smudge.useBrush ? ["t|smudge|size", T.smudge.size, "t|smudge|strength", T.smudge.strength]
      : Tool === "smudge" ? ["b|prop.size", V["prop.size"], "t|smudge|strength", T.smudge.strength]
      : ["b|prop.size", V["prop.size"], "b|prop.opacity", V["prop.opacity"]];
    Side.innerHTML = `<label class="bs-vslider" title="Size"><input type="range" orient="vertical" data-bind="${SizeBind}" data-fid="side-size" min="${SizeBind.startsWith("t|erase") || SizeBind.startsWith("t|smudge") ? 1 : 0}" max="100" step="1" value="${Size}" style="--fill:${Pct(Size, 0, 100)}" aria-label="Size"><small>${Math.round(Size)}</small></label>
      <label class="bs-vslider" title="Opacity"><input type="range" orient="vertical" data-bind="${OpBind}" data-fid="side-op" min="1" max="100" step="1" value="${Op}" style="--fill:${Pct(Op, 0, 100)}" aria-label="Opacity"><small>${Math.round(Op)}%</small></label>`;
  }

  function RenderFoot() {
    const S = St.Stats || {}, V = Brush().values;
    Foot.innerHTML = [
      [`${Fixed(M.EffectiveSize(V), 0.1)}`, "px"],
      [`${Math.round(M.EffectiveOpacity(V) * 100)}`, "%"],
      [`${S.LiveDabs && Pad.Ops.length ? S.LiveDabs : S.Dabs ?? 0}`, "dabs"],
      [`${Fixed(S.Ms ?? 0, 0.1)}`, "ms"],
      [`${Pad.Ops.length}`, Pad.Ops.length === 1 ? "item" : "items"],
    ].map(([Vv, U]) => `<span class="bs-stat"><b>${Esc(Vv)}</b>${Esc(U)}</span>`).join("");
    Vp.SetMeta(`${STUDIOS[St.Tool].Title.replace(" Studio", "")} · ${Brush().name}`);
  }

  // ---------------------------------------------------------------------------------------------- tool popups
  function ToolFieldHtml(Tool, F) {
    const V = St.Tools[Tool], B = Brush(), Bv = B.values;
    if (F.T === "brush") {
      const Key = F.K.slice(1), Bf = M.FIELDS[Key];
      return FieldHtml({ ...Bf, L: F.L || Bf.L, Hint: F.Hint ?? Bf.Hint }, Bv[Key], `b|${Key}`, Changed().has(Key));
    }
    const Bind = `t|${Tool}|${F.K}`, Edited = ToolChanged(Tool, V).has(F.K);
    switch (F.T) {
      case "brushcard": return `<div class="bs-brushcard">
          <canvas class="bs-card-thumb" width="400" height="84" aria-label="Active brush stroke"></canvas>
          <div class="bs-brushcard-row"><span><b>${Esc(B.name)}</b><small>${Esc(M.Caption(B))}</small></span>
            <button type="button" class="mi-text-btn" data-act="studio" title="Edit this brush in the Brush Studio">${icon("sliders", 10)}Brush Studio</button></div>
          ${St.Recent.length > 1 ? `<div class="bs-brushcard-recent">${St.Recent.slice(0, 6).map((Id) => `<button type="button" class="bs-recent ${Id === St.ActiveId ? "active" : ""}" data-act="pick" data-id="${Esc(Id)}" title="${Esc(BrushOf(Id).name)}"><img alt="" src="${toolArtURL(BrushOf(Id).instrument, true)}"></button>`).join("")}</div>` : ""}
        </div>`;
      case "colours": {
        const Sw = [...new Set([...(M.PAINT_SWATCHES[paintTool(B.instrument).key] || []), ...St.Colours])].slice(0, 14);
        return `<div class="bs-colours">
          <div class="bs-discs"><label class="bs-disc primary" style="background:${Bv["colour.primary"]}" title="Primary"><input type="color" data-bind="b|colour.primary" value="${Bv["colour.primary"]}" aria-label="Primary colour"></label>
            <label class="bs-disc secondary" style="background:${Bv["colour.secondary"]}" title="Secondary"><input type="color" data-bind="b|colour.secondary" value="${Bv["colour.secondary"]}" aria-label="Secondary colour"></label>
            <button type="button" class="mi-mini bs-swap" data-act="swap-colours" title="Swap primary and secondary" aria-label="Swap colours">${icon("reset", 11)}</button></div>
          <div class="bs-colours-side"><input class="mi-hex" data-bind="b|colour.primary" data-hex data-fid="pop-hex" value="${Bv["colour.primary"].toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Primary hex">
            <div class="bs-swatches">${Sw.map((C) => `<button type="button" class="bs-sw ${C === Bv["colour.primary"] ? "active" : ""}" style="background:${C}" data-act="swatch" data-value="${C}" title="${C}" aria-label="Use ${C}"></button>`).join("")}</div></div>
        </div>`;
      }
      case "instrument": return `<div class="bs-field">${Label(F.L, "", Bind, Edited)}<div class="bs-erasers">${ERASERS.map((Id) => `<button type="button" class="bs-eraser ${V.instrument === Id ? "active" : ""}" data-act="set" data-bind="${Bind}" data-value="${Id}" title="${Esc(paintTool(Id).label)}"><img alt="" src="${toolArtURL(Id, true)}"><span>${Esc(paintTool(Id).label.replace(/ Eraser$/, ""))}</span></button>`).join("")}</div></div>`;
      case "sample": {
        const L = V.last;
        if (!L?.Hex) return `<div class="bs-sample empty"><i></i><span><b>No sample yet</b><small>Click or drag on the pad.</small></span></div>`;
        const [R, G, Bb] = [1, 3, 5].map((I) => parseInt(L.Hex.slice(I, I + 2), 16));
        const Mx = Math.max(R, G, Bb) / 255, Mn = Math.min(R, G, Bb) / 255, Lum = 0.2126 * R + 0.7152 * G + 0.0722 * Bb;
        let Hh = 0;
        if (Mx !== Mn) { const D = Mx - Mn, Rr = R / 255, Gg = G / 255, B3 = Bb / 255; Hh = Mx === Rr ? ((Gg - B3) / D) % 6 : Mx === Gg ? (B3 - Rr) / D + 2 : (Rr - Gg) / D + 4; Hh = Math.round(((Hh * 60) + 360) % 360); }
        const Li = (Mx + Mn) / 2, Sa = Mx === Mn ? 0 : (Mx - Mn) / (1 - Math.abs(2 * Li - 1));
        return `<div class="bs-sample"><i style="background:${L.Hex}"></i><span><b>${L.Hex.toUpperCase()}</b>
          <small>RGB ${R} · ${G} · ${Bb}</small><small>HSL ${Hh}° · ${Math.round(Sa * 100)}% · ${Math.round(Li * 100)}%</small><small>Luminance ${Math.round((Lum / 255) * 100)}% · ${St.View === "albedo" ? "colour" : St.View} view</small></span>
          <span class="bs-sample-use"><button type="button" class="mi-text-btn" data-act="use-sample" data-value="primary">Primary</button><button type="button" class="mi-text-btn" data-act="use-sample" data-value="secondary">Secondary</button></span></div>`;
      }
      case "history": return V.history.length ? `<div class="bs-swatches big">${V.history.map((C) => `<button type="button" class="bs-sw" style="background:${C}" data-act="swatch" data-value="${C}" title="${C}" aria-label="Use ${C}"></button>`).join("")}</div>` : `<p class="mi-empty">Samples you take collect here.</p>`;
      case "nudge": return `<div class="bs-nudge">${[["←", -1, 0], ["↑", 0, -1], ["↓", 0, 1], ["→", 1, 0]].map(([L, X, Y]) => `<button type="button" class="mi-mini" data-act="nudge" data-x="${X}" data-y="${Y}" aria-label="Nudge ${L}">${L}</button>`).join("")}<small>${Math.round(V.dx)} · ${Math.round(V.dy)} px dragged</small></div>`;
      case "readout": return `<p class="bs-readout" data-readout="${Tool}">${Esc(Readout(Tool))}</p>`;
      case "actions": return `<div class="bs-actions">${F.Items.map(([L, A, G, Tone]) => `<button type="button" class="${Tone === "primary" ? "primary" : ""}" data-act="${A}">${icon(G, 11)}${Esc(L)}</button>`).join("")}</div>`;
      case "switch": return `<div class="bs-switch ${Edited ? "edited" : ""}">${SwitchRow("toggle", V[F.K], F.L, F.Hint, `data-bind="${Bind}"`)}${ResetBtn(Bind, Edited)}</div>`;
      default: return FieldHtml(F, V[F.K], Bind, Edited);
    }
  }

  function Readout(Tool) {
    const T = St.Tools[Tool];
    if (Tool === "gradient") { if (!T.line) return "Drag across the pad to set the line."; const L = T.line, D = Math.hypot((L[1][0] - L[0][0]) * Pad.W, (L[1][1] - L[0][1]) * Pad.H); return `Line ${Math.round(D)} px · drag the end handles to adjust.`; }
    if (Tool === "text") return T.at ? `Placed at ${Math.round(T.at[0] * 100)}%, ${Math.round(T.at[1] * 100)}% · drag to move · Enter applies.` : "Click the pad to place the text.";
    if (Tool === "curve") return T.points.length ? `${T.points.length} point${T.points.length === 1 ? "" : "s"} · ${T.points.length < 2 ? "add one more" : "Enter or double-click to stroke"}` : "Click the pad to drop points.";
    return "";
  }
  function RefreshReadouts() {
    for (const R of Settings.querySelectorAll("[data-readout]")) R.textContent = Readout(R.dataset.readout);
    const Nd = Settings.querySelector(".bs-nudge small"); if (Nd) Nd.textContent = `${Math.round(St.Tools.move.dx)} · ${Math.round(St.Tools.move.dy)} px dragged`;
  }
  function RefreshSample() {
    const El = Settings.querySelector(".bs-sample");
    if (El) El.outerHTML = ToolFieldHtml("eyedropper", { K: "sample", T: "sample" });
  }

  // Re-render whatever shows tool state: the active studio section (when it is a tool section) and its counts.
  function RenderToolUi() { RenderHead(); RenderSections(); if (ToolSec()) RenderSettings(); RenderRail(); }

  function OpenStudio(Tool, Section) {
    if (!STUDIOS[Tool]) return;
    St.Studio = Tool;
    if (Section) { if (Tool === "paint" && !STUDIOS.paint.Sections.some((S) => S.Id === Section)) St.Section = Section; else if (Tool === "paint") St.Section = Section; else St.ToolSection[Tool] = Section; }
    RenderHead(); RenderSections(); RenderSettings(); Settings.scrollTop = 0;
  }
  Hub.Studio = OpenStudio;

  function SetTool(Id) {
    if (!TOOL[Id]) return;
    if (Id !== St.Tool) St.PrevTool = St.Tool;
    St.Tool = Id;
    St.Studio = Id;
    RenderHead(); RenderSections(); RenderSettings(); Settings.scrollTop = 0;
    RenderPadBar(); RenderRail(); RenderSide(); RenderFoot();
    Pad.Render();
  }
  Hub.Tool = SetTool;

  function TogglePad(Open = !St.PadOpen) {
    St.PadOpen = !!Open;
    Shell.dataset.pad = St.PadOpen ? "open" : "closed";
    RenderHead(); RenderRail();
    if (St.PadOpen) { Pad.Resize(); Pad.Replay(); }
  }
  Hub.TogglePad = TogglePad;

  function Flash(Text) {
    Toast.textContent = Text;
    Toast.classList.add("show");
    clearTimeout(Flash.T);
    Flash.T = setTimeout(() => Toast.classList.remove("show"), 1800);
  }

  // ---------------------------------------------------------------------------------------------- brush lifecycle
  function DuplicateActive() {
    const D = M.Duplicate(Brush());
    D.reset = structuredClone({ values: D.values, params: D.params, name: D.name });
    St.Brushes[D.id] = D;
    St.Custom = [D.id, ...St.Custom];
    Select(D.id);
    St.Section = "about";
    OpenStudio("paint");
    Flash(`Saved “${D.name}”`);
  }
  function ExportActive() { const B = Brush(); Download(M.Export(B), `${M.Slug ? M.Slug(B.name) : B.name.replace(/\W+/g, "-").toLowerCase()}.brush.json`, "application/json"); Flash("Exported"); }
  async function ImportText(Text) {
    try {
      const B = M.Import(Text);
      if (St.Brushes[B.id] || M.PAINT_TOOLS.some((T) => T.id === B.id)) B.id = `${B.instrument}~${Math.random().toString(36).slice(2, 8)}`;
      St.Brushes[B.id] = B; St.Custom = [B.id, ...St.Custom];
      Select(B.id);
      Flash(`Imported “${B.name}”`);
    } catch (E) { Flash(`Import failed — ${E.message}`); }
  }
  Hub.Import = ImportText;
  Hub.Export = () => M.Export(Brush());

  // ---------------------------------------------------------------------------------------------- events
  function ApplyToggle(Bind) {
    const [Scope, A, B2] = Bind.split("|");
    if (Scope === "b") EditBrush((Br) => M.SetValue(Br, A, !Br.values[A]));
    else if (Scope === "p") EditBrush((Br) => M.SetParam(Br, A, !Br.params[A]));
    else if (Scope === "t") Write(Bind, !St.Tools[A][B2]);
  }
  function ApplySet(Bind, Value) {
    const [Scope] = Bind.split("|");
    if (Scope === "b" || Scope === "p" || Scope === "t") Write(Bind, Value);
  }
  function FieldReset(Bind) {
    const At = ParseStackBind(Bind);
    if (At) { const S = StackOf(At.Base); if (S) { ApplyStackPatch(S, S.L.Field(S.Flat, At.Ch, At.Key, S.L.Read(S.Reset).per[At.Ch]?.[At.Key])); RenderSettings(); } return; }
    const [Scope, A] = Bind.split("|"), B = Brush();
    if (Scope === "b") EditBrush((Br) => ({ ...Br, values: M.Normalise({ ...Br.values, [A]: structuredClone(B.reset.values[A]) }) }));
    else if (Scope === "p") EditBrush((Br) => M.SetParam(Br, A, B.reset.params[A]));
    else if (Scope === "m") EditBrush((Br) => ({ ...Br, [A]: Br.reset[A] ?? Br[A] }));
    else if (Scope === "t") { const K2 = Bind.split("|")[2]; St.Tools = SetToolValue(St.Tools, A, K2, ToolDefault(A, K2)); EraseMemo = SmudgeMemo = null; RenderToolUi(); RenderSide(); Pad.Schedule(); return; }
    RenderSettings();
  }

  Host.addEventListener("input", (E) => {
    const El = E.target;
    if (El.dataset.act === "cs-search") {
      StackUiOf(El.dataset.bind).Query = El.value; const Pos = El.selectionStart; RenderSettings();
      const N = Settings.querySelector(`[data-act="cs-search"][data-bind="${CSS.escape(El.dataset.bind)}"]`); N?.focus(); try { N?.setSelectionRange(Pos, Pos); } catch { /* */ }
      return;
    }
    if (El.dataset.act === "filter") { St.Filter = El.value; const Pos = El.selectionStart; RenderLibrary(); const N = Lib.querySelector('[data-act="filter"]'); N?.focus(); try { N?.setSelectionRange(Pos, Pos); } catch { /* */ } return; }
    const Bind = El.dataset.bind;
    if (!Bind) return;
    if (El.type === "file") return;
    if (El.dataset.hex !== undefined) { const V = El.value.trim().startsWith("#") ? El.value.trim() : `#${El.value.trim()}`; if (M.HEX.test(V)) { Write(Bind, V.toLowerCase(), { Live: true }); SyncSiblings(Host, Object.assign(El, {})); } return; }
    if (El.type === "range" || El.type === "number" || El.type === "color") {
      SyncSiblings(Host, El);
      if (El.type === "color") { const Lab = El.closest(".bs-disc"); if (Lab) Lab.style.background = El.value; }
      const Small = El.closest(".bs-vslider")?.querySelector("small"); if (Small) Small.textContent = El.dataset.fid === "side-op" ? `${El.value}%` : El.value;
      Write(Bind, El.value, { Live: true });
      return;
    }
    if (El.tagName === "TEXTAREA" || El.tagName === "INPUT") Write(Bind, El.value, { Live: true });
  });
  Host.addEventListener("change", (E) => {
    const El = E.target;
    if (El.classList.contains("bs-file")) { const F = El.files?.[0]; if (F) F.text().then(ImportText); El.value = ""; return; }
    const Bind = El.dataset.bind;
    if (!Bind) return;
    if (El.tagName === "SELECT") { Write(Bind, El.value); return; }
    if (Bind.startsWith("m|")) { Write(Bind, El.value); H.Settle({ Id: St.ActiveId, Brush: Brush() }); return; }
    if (El.type === "color" && Bind.startsWith("b|")) RememberColour(El.value);
    if (Bind.startsWith("b|") || Bind.startsWith("p|")) { H.Settle({ Id: St.ActiveId, Brush: Brush() }); RenderHead(); }
    if (Bind.startsWith("t|")) RenderToolUi();
  });

  Host.addEventListener("click", (E) => {
    const El = E.target.closest("[data-act]");
    if (!El || El.disabled || El.tagName === "INPUT") return;
    const Act = El.dataset.act, Bind = El.dataset.bind;
    switch (Act) {
      case "pick": Select(El.dataset.id); break;
      case "family": { const K = El.dataset.family; St.Open.has(K) ? St.Open.delete(K) : St.Open.add(K); RenderLibrary(); break; }
      case "section": { const Id = El.dataset.section; if (IsBrushStudio() && !STUDIOS.paint.Sections.some((S) => S.Id === Id)) St.Section = Id; else if (IsBrushStudio()) St.Section = Id; else St.ToolSection[St.Studio] = Id; RenderSections(); RenderSettings(); Settings.scrollTop = 0; break; }
      case "set": ApplySet(Bind, El.dataset.value); if (Bind.startsWith("b|") || Bind.startsWith("p|")) RenderSettings(); break;
      case "toggle": ApplyToggle(Bind); if (!Bind.startsWith("t|")) RenderSettings(); break;
      case "cs-open": case "cs-group": case "cs-toggle": case "cs-group-toggle": case "cs-bulk": {
        const S = StackOf(Bind);
        if (!S) break;
        const Res = StackAction(Act, El, S.L.Read(S.Flat), StackUiOf(Bind), S.L.Card);
        if (Res?.Refused) Flash(Res.Refused);
        else if (Res?.Next) ApplyStackPatch(S, S.L.Assign(Res.Next));
        RenderSettings();
        break;
      }
      case "curve-preset": { const [, Key] = Bind.split("|"); EditBrush((Br) => M.SetValue(Br, Key, structuredClone(M.CURVE_PRESETS[El.dataset.value]))); RedrawCurves(); break; }
      case "stop-add": case "stop-remove": {
        const Target = El.dataset.target, [Scope, A, B2] = Target.split("|");
        const List = Scope === "b" ? Brush().values[A] : St.Tools[A][B2];
        const Next = Act === "stop-add" ? [...List, List.at(-1)] : List.slice(0, -1);
        if (Scope === "b") { EditBrush((Br) => M.SetValue(Br, A, Next)); RenderSettings(); } else { Write(Target, Next); RenderSettings(); }
        break;
      }
      case "field-reset": FieldReset(Bind); break;
      case "reset-section": {
        if (ToolSec()) {
          const Tool = St.Studio, Sec = ToolSec();
          for (const G of SectionGroups(Tool, Sec)) for (const F of G.Fields) if (!F.K.startsWith("@") && "Def" in F && F.T !== "history") St.Tools = SetToolValue(St.Tools, Tool, F.K, ToolDefault(Tool, F.K));
          EraseMemo = SmudgeMemo = null;
          RenderToolUi(); RenderSide(); Pad.Schedule(); Flash(`${Sec.Label} reset`);
          break;
        }
        const Sec = M.SECTIONS.find((S) => S.Id === St.Section), R = Brush().reset;
        if (Sec.Id === "instrument") EditBrush((Br) => ({ ...Br, params: structuredClone(R.params), values: M.Normalise(M.ApplyInstrumentParams(Br.values, R.params)) }));
        else EditBrush((Br) => { const V = { ...Br.values }; for (const G of Sec.Groups) for (const F of G.Fields) V[F.K] = structuredClone(R.values[F.K]); return { ...Br, values: M.Normalise(V) }; });
        RenderSettings(); Flash(`${Sec.Label} reset`);
        break;
      }
      case "reset-all": EditBrush((Br) => M.ResetBrush(Br)); RenderAllBrushParts(); RenderLibrary(); Flash("Brush reset"); break;
      case "reset-point": EditBrush((Br) => M.MakeResetPoint(Br)); RenderAllBrushParts(); RenderLibrary(); Flash("New reset point saved"); break;
      case "duplicate": DuplicateActive(); break;
      case "export": ExportActive(); break;
      case "import": Host.querySelector(".bs-file").click(); break;
      case "undo": Step(true); break;
      case "redo": Step(false); break;
      case "tool": SetTool(El.dataset.tool); break;
      case "tool-reset": { const Tool = St.Studio, Fresh = CreateTools()[Tool]; St.Tools = { ...St.Tools, [Tool]: { ...Fresh, history: St.Tools[Tool].history ?? Fresh.history } }; EraseMemo = SmudgeMemo = null; RenderToolUi(); RenderSide(); Pad.Render(); Flash(`${TOOL[Tool].Label} reset`); break; }
      case "studio": OpenStudio("paint", St.Section === "about" ? "stroke" : St.Section); Flash("Brush Studio — the curve, smudge and eraser tools share this brush"); break;
      case "studio-back": OpenStudio(St.Tool); break;
      case "swap-colours": { const V = Brush().values; EditBrush((Br) => M.SetValue(M.SetValue(Br, "colour.primary", V["colour.secondary"]), "colour.secondary", V["colour.primary"])); RenderSettings(); RenderRail(); break; }
      case "swatch": {
        const Key = St.Studio === "eyedropper" && St.Tools.eyedropper.target === "Secondary" ? "colour.secondary" : "colour.primary";
        EditBrush((Br) => M.SetValue(Br, Key, El.dataset.value)); RenderSettings(); break;
      }
      case "pad-toggle": TogglePad(); break;
      case "use-sample": { const L = St.Tools.eyedropper.last; if (L?.Hex) { EditBrush((Br) => M.SetValue(Br, El.dataset.value === "secondary" ? "colour.secondary" : "colour.primary", L.Hex)); Flash(`${L.Hex.toUpperCase()} → ${El.dataset.value}`); } break; }
      case "nudge": { const D = E.shiftKey ? 10 : 1; St.Tools.move = { ...St.Tools.move, dx: St.Tools.move.dx + D * +El.dataset.x, dy: St.Tools.move.dy + D * +El.dataset.y }; RefreshReadouts(); Pad.Render(); break; }
      case "gradient-apply": if (!Pad.CommitGradient()) Flash("Drag on the pad first"); else Flash("Gradient applied"); break;
      case "gradient-clear": St.Tools.gradient = { ...St.Tools.gradient, line: null }; RefreshReadouts(); Pad.Render(); break;
      case "text-apply": if (!Pad.CommitText()) Flash("Click the pad to place text first"); else Flash("Text applied"); break;
      case "text-cancel": St.Tools.text = { ...St.Tools.text, at: null }; RefreshReadouts(); Pad.Render(); break;
      case "curve-commit": if (!Pad.CommitCurve()) Flash("Add at least two points"); else Flash("Curve stroked"); break;
      case "curve-undo": St.Tools.curve = { ...St.Tools.curve, points: St.Tools.curve.points.slice(0, -1) }; RefreshReadouts(); Pad.Render(); break;
      case "curve-clear": St.Tools.curve = { ...St.Tools.curve, points: [] }; RefreshReadouts(); Pad.Render(); break;
      case "move-apply": if (!Pad.CommitMove()) Flash("Nothing to move yet"); else Flash("Moved"); break;
      case "move-reset": OnPad("move-reset"); break;
      case "pad-undo": Pad.Undo(); break;
      case "pad-redo": Pad.Redo(); break;
      case "view": Vp.SetView(El.dataset.value); break;
      case "paper": St.Paper = El.dataset.value; RenderPadBar(); break;
      case "live": St.Live = !St.Live; RenderPadBar(); Pad.Replay(); break;
      case "preview": St.Preview = !St.Preview; RenderPadBar(); Pad.Schedule(); break;
      case "clear": Pad.Clear(); Flash("Pad cleared — undo brings it back"); break;
      default: break;
    }
  });

  // Curve editor: drag points, double-click to add / remove.
  let CurveDrag = null;
  function CurvePoint(Svg, E) {
    const R = Svg.getBoundingClientRect(), K = 320 / (R.width || 320);
    return [Clamp(((E.clientX - R.left) * K - 10) / 300, 0, 1), Clamp((122 - (E.clientY - R.top) * K) / 112, 0, 1)];
  }
  function RedrawCurves() {
    for (const C of Host.querySelectorAll("[data-curve]")) {
      const Key = C.dataset.curve.slice(2);
      const Svg = C.querySelector("svg.bs-curve-svg");
      if (Svg) Svg.innerHTML = CurveSvg(Brush().values[Key]);
    }
    RefreshEdited();
  }
  Host.addEventListener("pointerdown", (E) => {
    const Svg = E.target.closest?.("svg.bs-curve-svg");
    if (!Svg) return;
    const Bind = Svg.closest("[data-curve]").dataset.curve, Key = Bind.slice(2);
    const Pts = Brush().values[Key];
    const [X, Y] = CurvePoint(Svg, E);
    let I = Pts.findIndex(([Px, Py]) => Math.hypot((Px - X) * 300, (Py - Y) * 112) < 12);
    if (I < 0) return;
    E.preventDefault();
    Svg.setPointerCapture?.(E.pointerId);
    CurveDrag = { Svg, Key, I };
    H.Begin({ Id: St.ActiveId, Brush: Brush() });
  });
  Host.addEventListener("pointermove", (E) => {
    if (!CurveDrag) return;
    const { Svg, Key, I } = CurveDrag, Pts = Brush().values[Key].map((P) => [...P]);
    let [X, Y] = CurvePoint(Svg, E);
    if (I === 0) X = Math.min(X, Pts[1][0] - 0.01, Pts[0][0] === 0 ? 0 : X);
    else if (I === Pts.length - 1) X = Math.max(X, Pts[I - 1][0] + 0.01, Pts[I][0] === 1 ? 1 : X);
    else X = Clamp(X, Pts[I - 1][0] + 0.01, Pts[I + 1][0] - 0.01);
    if (I === 0 && Pts[0][0] === 0) X = 0;
    if (I === Pts.length - 1 && Pts[I][0] === 1) X = 1;
    Pts[I] = [+X.toFixed(3), +Y.toFixed(3)];
    St.Brushes[St.ActiveId] = M.SetValue(Brush(), Key, Pts);
    Svg.innerHTML = CurveSvg(Brush().values[Key]);
    AfterBrushChange();
  });
  const EndCurve = () => { if (!CurveDrag) return; CurveDrag = null; H.Settle({ Id: St.ActiveId, Brush: Brush() }); RenderHead(); RefreshEdited(); };
  Host.addEventListener("pointerup", EndCurve);
  Host.addEventListener("pointercancel", EndCurve);
  Host.addEventListener("dblclick", (E) => {
    const Svg = E.target.closest?.("svg.bs-curve-svg");
    if (!Svg) return;
    const Key = Svg.closest("[data-curve]").dataset.curve.slice(2), Pts = Brush().values[Key].map((P) => [...P]);
    const [X, Y] = CurvePoint(Svg, E);
    const I = Pts.findIndex(([Px, Py]) => Math.hypot((Px - X) * 300, (Py - Y) * 112) < 12);
    let Next;
    if (I > 0 && I < Pts.length - 1) Next = Pts.filter((_, J) => J !== I);
    else if (I < 0 && Pts.length < 12) Next = [...Pts, [+X.toFixed(3), +Y.toFixed(3)]].sort((A, B) => A[0] - B[0]);
    if (Next) { EditBrush((Br) => M.SetValue(Br, Key, Next)); RedrawCurves(); }
  });

  // Keyboard: tool keys, [ ] size, Enter commits, Esc closes, Ctrl+Z pad undo, Alt+Z settings undo.
  const Keys = Object.fromEntries(TOOLS.map((T) => [T.Key.toLowerCase(), T.Id]));
  function OnKey(E) {
    const Typing = /INPUT|TEXTAREA|SELECT/.test(E.target?.tagName || "") && E.target.type !== "range";
    if (E.key === "Escape") { if (St.Studio !== St.Tool) { OpenStudio(St.Tool); E.preventDefault(); } return; }
    if (Typing) return;
    const Mod = E.ctrlKey || E.metaKey;
    if (Mod && E.key.toLowerCase() === "z") { E.preventDefault(); E.shiftKey ? Pad.Redo() : Pad.Undo(); return; }
    if (E.altKey && E.key.toLowerCase() === "z") { E.preventDefault(); Step(!E.shiftKey); return; }
    if (Mod || E.altKey) return;
    if (E.key === "Enter") {
      const Done = St.Tool === "curve" ? Pad.CommitCurve() : St.Tool === "text" ? Pad.CommitText() : St.Tool === "gradient" ? Pad.CommitGradient() : St.Tool === "move" ? Pad.CommitMove() : false;
      if (Done) { E.preventDefault(); Flash("Applied"); }
      return;
    }
    if (E.key === "Backspace" && St.Tool === "curve" && St.Tools.curve.points.length) { St.Tools.curve = { ...St.Tools.curve, points: St.Tools.curve.points.slice(0, -1) }; RefreshReadouts(); Pad.Render(); E.preventDefault(); return; }
    if (E.key === "[" || E.key === "]") { const D = E.key === "]" ? 4 : -4; Hub.SetValue("prop.size", Clamp(Brush().values["prop.size"] + D, 0, 100)); RenderSide(); return; }
    const Id = Keys[E.key.toLowerCase()];
    if (Id) { SetTool(Id); E.preventDefault(); }
  }
  document.addEventListener("keydown", OnKey);

  // ---------------------------------------------------------------------------------------------- first paint
  St.Recent = [St.ActiveId];
  Hub.Render = () => { RenderLibrary(); RenderHead(); RenderSections(); RenderSettings(); RenderPadBar(); RenderRail(); RenderSide(); RenderFoot(); Pad.Resize(); Pad.Replay(); };
  Hub.Section = (Id) => { if (IsBrushStudio() || M.SECTIONS.some((S) => S.Id === Id)) { if (!IsBrushStudio()) St.Studio = "paint"; St.Section = Id; } else St.ToolSection[St.Studio] = Id; RenderHead(); RenderSections(); RenderSettings(); };
  Hub.SetView = (V) => Vp.SetView(V);
  Hub.Viewport = Vp;
  Hub.Destroy = () => { document.removeEventListener("keydown", OnKey); Pad.Destroy(); };
  Hub.Render();
  return Hub;
}
