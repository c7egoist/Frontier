// ArtworkInspector.js — the single Pattern Studio / Stamp Studio inspector card (TextureStudio ArtworkStackWorkspace),
// Project Zero styling, same language as the Material Inspector card.
//
// One card, top to bottom:
//   identity (name · starter library · live thumbnail) → statistics (instances · coverage · palette) → layer stack
//   → the selected layer as quiet property rows (one inline editor open at a time) → modifier stack (same rows)
//   → document fold (ground, export size) → export.
// The old inspector stacked five always-open section cards: every layer property as a slider column, a PBR channel pill
// cloud plus a value card per channel, mask sliders, a "+ Modifier" chip wall and every modifier's sliders expanded.
// Here each property and each modifier is one row with its live value; opening it edits it in place.

import * as A from "./ArtworkModel.js";
import { icon } from "../MaterialInspector/Icons.js";
import { KeyReaches, Esc, Knob, ColourField, Stops, Toggle, SwitchRow, Segments, Chips, Dropdown, StatTile, SyncSiblings, Download, Rebuild, History, HEX } from "../MaterialInspector/CardKit.js";

const S = {
  Mode: "pattern", Doc: null, Open: null, AddLayer: false, AddMod: false, Renaming: null, Folds: {},
  Status: "", StatusTimer: 0, Stats: null, StatsKey: "", Thumb: "", ThumbKey: "", ThumbBlob: "",
  Docked: false,   // true when an outliner card owns the layer stack (the strip is then left out of this card)
};
const Peers = new Set();   // outliner re-render hooks: Fn(Live)
const H = History();
let Root = null, LiveFrame = 0;
const Store = (() => { try { return globalThis.localStorage; } catch { return null; } })();
const Key = (Id) => `${A.STORAGE_PREFIX}${S.Mode}:${Id}`;

// ------------------------------------------------------------------------------------------------ document plumbing
const Layer = () => A.Selected(S.Doc);

function Save() {
  if (!Store) return;
  try {
    Store.setItem(Key(S.Doc.starterId || A.Slug(S.Doc.name)), JSON.stringify(S.Doc));
    Store.setItem(`${A.STORAGE_PREFIX}${S.Mode}#current`, S.Doc.starterId || A.Slug(S.Doc.name));
  } catch { Flash("Storage full — changes kept in this tab only"); }
}

function LoadStored(Id) {
  try {
    const Raw = Store?.getItem(Key(Id));
    if (Raw) return A.Load(Raw, S.Mode);
  } catch { /* fall back to the starter */ }
  return A.Create(S.Mode, Id);
}

function Apply(Next, Live = false) {
  if (!Next || Next === S.Doc) return;
  H.Begin(S.Doc);
  S.Doc = Next;
  if (!Live) Settle();
}

function Settle() { if (H.Settle(S.Doc)) Save(); }

function Step(Back) {
  Settle();
  const Prev = H.Step(Back, S.Doc);
  if (!Prev) return;
  S.Doc = Prev;
  if (S.Open?.startsWith("mod:") && !Layer().modifiers?.some((M) => `mod:${M.id}` === S.Open)) S.Open = null;
  Save();
  Render();
  Flash(Back ? "Undone" : "Redone");
}

function Flash(Text) {
  S.Status = Text;
  const El = Root?.querySelector("[data-status]");
  if (El) { El.textContent = Text; El.classList.add("on"); }
  clearTimeout(S.StatusTimer);
  S.StatusTimer = setTimeout(() => { S.Status = ""; const E = Root?.querySelector("[data-status]"); if (E) { E.classList.remove("on"); E.textContent = "Saved locally"; } }, 1800);
}

function Select(Doc) {
  S.Doc = Doc;
  S.Open = null; S.AddLayer = false; S.AddMod = false; S.Renaming = null;
  H.Clear();
  Save();
}

// ------------------------------------------------------------------------------------------------ statistics + thumbnail
function CurrentStats() {
  const K = JSON.stringify(S.Doc.layers) + JSON.stringify(S.Doc.background);
  if (K !== S.StatsKey) { S.Stats = A.Stats(S.Doc); S.StatsKey = K; }
  return S.Stats;
}

const Compact = (N) => (N >= 10000 ? `${Math.round(N / 1000)}k` : N >= 1000 ? `${(N / 1000).toFixed(1)}k` : String(N));

function StatsHtml() {
  const St = CurrentStats(), Pattern = S.Mode === "pattern";
  const Ink = St.PerLayer.slice().sort((X, Y) => Y.Count - X.Count)[0]?.Colour || "#d6d6d6";
  let EdgeCaption, EdgeTone = "", EdgeTitle;
  if (Pattern) {
    EdgeCaption = St.Wraps ? `${St.Wraps} wrap the seam` : "Inside the tile";
    EdgeTitle = `${St.Wraps} instance${St.Wraps === 1 ? "" : "s"} cross the tile border and are wrapped to the opposite edge, so the repeat stays seamless.`;
  } else if (St.Clipped) {
    EdgeCaption = `Clips edge ${Math.round(-St.Margin)} px`; EdgeTone = "bad";
    EdgeTitle = "Part of the decal extends past the stamp border and will be cut off when applied.";
  } else {
    EdgeCaption = `${Math.round(St.Margin)} px margin`; EdgeTone = St.Margin < 8 ? "warn" : "ok";
    EdgeTitle = "Clearance between the decal and the stamp border (for bleed and mip filtering keep ≥ 8 px).";
  }
  const LowContrast = St.Palette.length > 1 && St.Contrast < 0.25;
  return StatTile({ Key: "instances", Label: "Instances", Value: Compact(St.Instances), Hot: true,
      Caption: `${St.Layers} layer${St.Layers === 1 ? "" : "s"} · ${St.Milliseconds < 1 ? "<1" : Math.round(St.Milliseconds)} ms`,
      Meter: { Kind: "stack", Parts: St.PerLayer.map((L) => ({ Share: Math.max(L.Count, 0.0001), Colour: L.Colour, Title: `${L.Name}: ${L.Count}` })) },
      Title: `${St.Instances} evaluated motif instances. The bar splits them by layer; the time is one full evaluation in this tab.` })
    + StatTile({ Key: "coverage", Label: "Coverage", Value: String(Math.round(St.Coverage * 100)), Unit: "%", Tone: EdgeTone,
      Caption: EdgeCaption, Meter: { Kind: "fill", At: St.Coverage, Colour: Ink }, Title: `Share of the ${Pattern ? "tile" : "decal"} the motifs cover (ground excluded). ${EdgeTitle}` })
    + StatTile({ Key: "palette", Label: "Palette", Value: String(St.Palette.length), Unit: St.Palette.length === 1 ? "colour" : "colours", Tone: LowContrast ? "warn" : "",
      Caption: St.Palette.length > 1 ? `${LowContrast ? "Low contrast" : "Contrast"} ${Math.round(St.Contrast * 100)}%` : "Single colour",
      Meter: { Kind: "swatches", Colours: St.Palette.length ? St.Palette : ["#2a2a2a"] },
      Title: "Distinct authored colours (fills, outlines, modifier colours, ground). Contrast is the luminance spread between the darkest and lightest." });
}

// The thumbnail is the document's own SVG export.  It goes through a Blob URL (revoked on replace) rather than a data URI:
// a 1 000-instance layer exports ~1 MB of SVG, and re-encoding that into a style attribute on every render is costly.
function ThumbUrl() {
  const K = JSON.stringify(S.Doc.layers) + JSON.stringify(S.Doc.background);
  if (K !== S.ThumbKey) {
    S.ThumbKey = K;
    try {
      const Url = URL.createObjectURL(new Blob([A.ExportSvg(S.Doc, 128)], { type: "image/svg+xml" }));
      if (S.ThumbBlob) URL.revokeObjectURL(S.ThumbBlob);
      S.ThumbBlob = Url;
      S.Thumb = `url('${Url}')`;
    } catch { S.Thumb = "none"; }
  }
  return S.Thumb;
}

// ------------------------------------------------------------------------------------------------ editors
const Grid = (Html) => `<div class="mi-knob-grid">${Html}</div>`;
const Note = (Text) => `<p class="mi-note">${Esc(Text)}</p>`;

function SlotEditor(L, Slot, Label) {
  const St = A.SlotState(S.Doc, L?.id, Slot);
  if (!St) return "";
  const Options = [...(St.AllowSolid ? [["Solid", "solid"]] : []), ["Linear", "linear"], ["Radial", "radial"], ["Point", "point"]];
  let Body;
  if (St.Mode === "solid") Body = ColourField(`slot:${Slot}:solid`, `${Label} colour`, St.Colour);
  else if (St.Mode === "point") {
    Body = Stops(`pt:${Slot}`, St.Point.points.map((P) => P.color), 12, 1)
      + Grid(Knob({ Bind: `pf:${Slot}:falloff`, Label: "Spread", Value: St.Point.falloff, Min: 0.2, Max: 3, Step: 0.01, Unit: "×" }))
      + `<div class="ai-chan-colour"><span class="mi-knob-label"><span>Field base</span></span>${ColourField(`pf:${Slot}:background`, "Field base colour", St.Point.background)}</div>`;
  } else Body = Stops(`slot:${Slot}`, St.Stops.map((E) => E.color), 12) + (St.Mode === "linear" ? Knob({ Bind: `angle:${Slot}`, Label: "Angle", Value: St.Angle, Min: -180, Max: 180, Step: 1, Unit: "°" }) : "");
  return Segments("slot-mode", Options, St.Mode, { Label: `${Label} source`, Extra: `data-slot="${Slot}"` }) + Body
    + (St.Mode === "solid" ? "" : InterpEditor(Slot, St) + PlaceTools(Slot, St));
}

// How colour travels between stops (or between placed points) — every source except Solid.
function InterpEditor(Slot, St) {
  const List = St.Mode === "point" ? A.POINT_GRADIENT_INTERPOLATIONS : A.GRADIENT_INTERPOLATIONS;
  return `<div class="ai-interp"><span class="mi-knob-label"><span>Interpolation</span></span>${Dropdown("slot-interp", List.map((E) => [E.label, E.id, "gradient", E.hint]), St.Interp, { Label: "Interpolation", Extra: `data-slot="${Slot}"`, Search: false, Class: "compact" })}</div>`;
}

// Hand the ramp to the TextureStudio canvas: drag the line / centre / stops, or place colour points.
function PlaceTools(Slot, St) {
  if (!S.Placer) return Note(St.Mode === "point" ? "Colour points are placed on the TextureStudio canvas." : "Open this in TextureStudio to place the ramp on the canvas.");
  const Verb = St.Mode === "point" ? "Place points" : St.Mode === "radial" ? "Place centre" : "Place line";
  const Spans = St.Mode !== "point" && St.Spans ? Segments("slot-space", [["Each shape", "shape"], ["Whole canvas", "scene"]], St.Space, { Label: "Ramp spans", Extra: `data-slot="${Slot}"` }) : "";
  return Spans + `<div class="ai-inline-tools ai-place-tools"><button type="button" class="mi-text-btn" data-act="slot-place" data-slot="${Slot}">${icon("move", 11)}${Verb} in viewport</button>`
    + (St.Mode !== "point" && St.Placed ? `<button type="button" class="mi-text-btn" data-act="slot-unplace" data-slot="${Slot}">${icon("reset", 11)}Reset placement</button>` : "")
    + `</div>`;
}

function ShapeEditor(L) {
  const Types = A.MOTIF_TYPES.filter((M) => M.id !== "svg-path" || L.shape.motifType === "svg-path");
  const Fields = A.SHAPE_FIELDS[L.shape.motifType] || [];
  return Dropdown("shape", Types.map((M) => [M.label, M.id, A.MotifGlyph(M.id)]), L.shape.motifType, { Label: "Motif shape", Search: false })
    + (Fields.length ? Grid(Fields.map((F) => Knob({ Bind: `layer:shape.${F.Key}`, Label: F.Label, Value: L.shape[F.Key] ?? F.Min, Min: F.Min, Max: F.Max, Step: F.Step }))) : "")
    + (L.shape.motifType === "svg-path" ? Note("Vector paths are drawn and node-edited on the TextureStudio canvas.") : "");
}

function TextEditor(L) {
  return `<label class="ai-text-input"><input type="text" data-bind="layer:text.value" data-fid="text" value="${Esc(L.text.value)}" maxlength="40" spellcheck="false" aria-label="Text content"></label>`
    + Segments("text-weight", [["Light", 300], ["Regular", 400], ["Semi", 600], ["Bold", 800]], L.text.fontWeight, { Label: "Weight" })
    + Grid(Knob({ Bind: "layer:text.fontSize", Label: "Size", Value: L.text.fontSize, Min: 8, Max: 220, Step: 1, Unit: "px" })
      + Knob({ Bind: "layer:text.letterSpacing", Label: "Tracking", Value: L.text.letterSpacing ?? 0, Min: -10, Max: 40, Step: 0.5, Unit: "px" }));
}

function FillEditor(L) {
  const Off = L.kind === "motif" && L.shape.fillEnabled === false;
  return (L.kind === "motif" ? SwitchRow("fill-on", !Off, "Fill shape", Off ? "Outline only" : "Albedo comes from this fill") : "")
    + (Off ? "" : SlotEditor(L, "fill", "Fill"));
}

function StrokeEditor(L) {
  const W = L.shape.strokeWidth || 0;
  return Knob({ Bind: "layer:shape.strokeWidth", Label: "Width", Value: W, Min: 0, Max: 18, Step: 0.5, Unit: "px" })
    + (W > 0 || L.shape.motifType === "line" ? SlotEditor(L, "stroke", "Outline") : Note("Give the outline a width to colour it."));
}

function PlaceEditor(L) {
  const T = L.transform, Size = S.Doc.size || A.ARTWORK_SIZE;
  return Grid(Knob({ Bind: "layer:transform.x", Label: "X", Value: T.x, Min: 0, Max: Size, Step: 1, Unit: "px" })
      + Knob({ Bind: "layer:transform.y", Label: "Y", Value: T.y, Min: 0, Max: Size, Step: 1, Unit: "px" })
      + Knob({ Bind: "layer:transform.width", Label: "Width", Value: T.width, Min: 4, Max: Size * 2, Step: 1, Unit: "px" })
      + Knob({ Bind: "layer:transform.height", Label: "Height", Value: T.height, Min: 4, Max: Size * 2, Step: 1, Unit: "px" }))
    + Knob({ Bind: "layer:transform.rotation", Label: "Rotation", Value: T.rotation || 0, Min: -180, Max: 180, Step: 1, Unit: "°" })
    + `<div class="ai-inline-tools"><button type="button" class="mi-text-btn" data-act="centre">${icon("move", 11)}Centre</button><button type="button" class="mi-text-btn" data-act="square">${icon("motif", 11)}Square up</button></div>`;
}

function BlendEditor(L) {
  return Dropdown("blend", A.BLENDS.map((B) => [B, B, "blend", A.BLEND_HINTS[B]]), L.blend || "Normal", { Label: "Blend mode" })
    + Knob({ Bind: "layer:opacity", Label: "Opacity", Value: L.opacity ?? 1, Min: 0, Max: 1, Step: 0.01 });
}

function SurfaceEditor(L) {
  const Surf = L.surface, On = A.ARTWORK_PBR_CHANNELS.filter((C) => Surf.channels[C.key]);
  const Remove = (C) => `<button type="button" class="mi-x ai-chan-x" data-act="chan-off" data-key="${C.key}" title="Remove ${Esc(C.label)}" aria-label="Remove ${Esc(C.label)}">${icon("close", 10)}</button>`;
  const Scalars = On.filter((C) => !C.isColor), Colours = On.filter((C) => C.isColor && C.key !== "albedo");
  const Off = A.ARTWORK_PBR_CHANNELS.filter((C) => !Surf.channels[C.key]);
  return Dropdown("finish", Object.entries(A.ARTWORK_FINISHES).map(([K, F]) => [F.label, K, `<i class="ai-finish-dot" style="--r:${F.roughness};--m:${F.metalness}"></i>`, `rough ${F.roughness.toFixed(2)} · metal ${F.metalness.toFixed(1)} · height ${F.height.toFixed(2)}`]), Surf.finish, { Label: "Surface finish" })
    + SwitchRow("chan-albedo", !!Surf.channels.albedo, "Albedo", Surf.channels.albedo ? "Taken from the layer fill" : "Layer leaves albedo untouched")
    + (Scalars.length ? Grid(Scalars.map((C) => Knob({ Bind: `surf:${C.key}`, Label: C.label, Value: +A.ChannelValue(L, C.key), Min: C.min ?? 0, Max: C.max ?? 1, Step: C.step ?? 0.01, Tools: Remove(C) })).join("")) : "")
    + Colours.map((C) => `<div class="ai-chan-colour"><span class="mi-knob-label"><span>${Esc(C.label)}</span>${Remove(C)}</span>${ColourField(`surf:${C.key}`, C.label, String(A.ChannelValue(L, C.key) || C.defaultVal))}</div>`).join("")
    + (Off.length ? Dropdown("chan-add", Off.map((C) => [C.label, C.key, "plus", C.sub || ""]), null, { Label: "Add a PBR channel", Placeholder: `Add channel · ${Off.length} more`, Class: "compact ai-add-dd" }) : "");
}

function MaskEditor(L) {
  const M = L.mask || {};
  if (!M.enabled) return SwitchRow("mask-on", false, "Mask this layer", "Cut the layer with a procedural mask");
  return SwitchRow("mask-on", true, "Mask this layer", "Procedural cut-out")
    + Segments("mask-mode", [["Noise", "noise"], ["Radial", "radial"], ["Stripe", "stripe"]], M.mode || "noise", { Label: "Mask mode" })
    + Grid(Knob({ Bind: "mask:threshold", Label: "Threshold", Value: M.threshold ?? 0.45, Min: 0, Max: 1, Step: 0.01 })
      + Knob({ Bind: "mask:softness", Label: "Softness", Value: M.softness ?? 0.25, Min: 0.02, Max: 0.8, Step: 0.01 })
      + Knob({ Bind: "mask:frequency", Label: "Frequency", Value: M.frequency ?? 4, Min: 1, Max: 16, Step: 1 })
      + Knob({ Bind: "mask:seed", Label: "Seed", Value: M.seed ?? 211, Min: 0, Max: 9999, Step: 1, Tools: Dice("mask:seed") }))
    + SwitchRow("mask-invert", !!M.invert, "Invert", "Keep what the mask removes");
}

const Dice = (Bind) => `<button type="button" class="mi-x ai-dice" data-act="dice" data-target="${Bind}" title="New seed" aria-label="New seed">${icon("dice", 11)}</button>`;

function PropertyEditor(L, Id) {
  const Body = { shape: ShapeEditor, text: TextEditor, fill: FillEditor, stroke: StrokeEditor, place: PlaceEditor, blend: BlendEditor, surface: SurfaceEditor, mask: MaskEditor }[Id];
  return `<div class="mi-editor" data-editor="${Id}">${Body ? Body(L) : ""}</div>`;
}

function ModifierEditor(L, M, Index) {
  const Def = A.MODIFIER_DEFINITIONS.find((D) => D.type === M.type);
  const Fields = (A.MODIFIER_FIELDS[M.type] || []).filter((F) => !F.When || F.When(M));
  const Options = Fields.filter((F) => F.T === "o"), Ranges = Fields.filter((F) => F.T === "r"), Colours = Fields.filter((F) => F.T === "c"), Switches = Fields.filter((F) => F.T === "s");
  const Extra = (F) => `data-mod="${M.id}" data-key="${F.Key}"`;
  return `<div class="mi-editor" data-editor="mod:${M.id}">
    ${Note(Def?.description || "")}
    ${Options.map((F) => (F.Options.length <= 4 && F.Options.every(([Lb]) => Lb.length <= 8)
      ? Segments("mod-opt", F.Options, M[F.Key], { Label: F.Label, Extra: Extra(F) })
      : `<div class="mi-sub-label">${Esc(F.Label)}</div>` + Dropdown("mod-opt", F.Options, M[F.Key], { Label: F.Label, Extra: Extra(F) }))).join("")}
    ${Ranges.length ? Grid(Ranges.map((F) => Knob({ Bind: `mod:${M.id}:${F.Key}`, Label: F.Label, Value: +(M[F.Key] ?? F.Min), Min: F.Min, Max: F.Max, Step: F.Step, Unit: F.Unit || "", Tools: F.Seed ? Dice(`mod:${M.id}:${F.Key}`) : "" })).join("")) : ""}
    ${Colours.map((F) => `<div class="ai-chan-colour"><span class="mi-knob-label"><span>${Esc(F.Label)}</span></span>${ColourField(`mod:${M.id}:${F.Key}`, F.Label, HEX.test(M[F.Key]) ? M[F.Key] : "#7aa6d9")}</div>`).join("")}
    ${Switches.map((F) => SwitchRow("mod-switch", !!M[F.Key], F.Label, "", Extra(F))).join("")}
    <div class="mi-editor-foot">
      <code title="Evaluation order">#${Index + 1} of ${L.modifiers.length} · ${Esc(M.type)}</code>
      <span class="ai-foot-tools">
        <button type="button" class="mi-mini" data-act="mod-up" data-mod="${M.id}" ${Index === 0 ? "disabled" : ""} title="Evaluate earlier" aria-label="Move up">${icon("up", 12)}</button>
        <button type="button" class="mi-mini" data-act="mod-down" data-mod="${M.id}" ${Index === L.modifiers.length - 1 ? "disabled" : ""} title="Evaluate later" aria-label="Move down">${icon("down", 12)}</button>
        <button type="button" class="mi-text-btn" data-act="mod-remove" data-mod="${M.id}">${icon("close", 11)}Remove</button>
      </span>
    </div>
  </div>`;
}

// ------------------------------------------------------------------------------------------------ card sections
function RowSwatch(R) {
  if (R.Swatch) return `<span class="mi-swatch" style="background:${R.Swatch}"></span>`;
  return `<span class="mi-swatch ai-glyph">${icon(R.Glyph, 13)}</span>`;
}

function PropertyRows(L) {
  return A.LayerRows(S.Doc, L).map((R) => {
    const Open = S.Open === R.Id;
    return `<div class="mi-row ${Open ? "open" : ""}" data-row="${R.Id}">
      <button type="button" class="mi-row-head" data-act="open" data-id="${R.Id}" data-fid="row:${R.Id}" aria-expanded="${Open}">
        ${RowSwatch(R)}
        <span class="mi-row-name">${Esc(R.Label)}<small>${Esc(R.Hint)}</small></span>
        <span class="mi-readout">${Esc(R.Text)}</span>
      </button>
      ${Open ? PropertyEditor(L, R.Id) : ""}
    </div>`;
  }).join("");
}

function ModifierRows(L) {
  const Mods = L.modifiers || [];
  if (!Mods.length) return `<p class="mi-empty">No modifiers — the ${L.kind === "text" ? "text is" : "motif is"} drawn once. Add an array to repeat it.</p>`;
  return Mods.map((M, I) => {
    const Def = A.MODIFIER_DEFINITIONS.find((D) => D.type === M.type) || { label: M.type, badge: "" };
    const Id = `mod:${M.id}`, Open = S.Open === Id, On = M.enabled !== false;
    return `<div class="mi-row ai-mod ${Open ? "open" : ""} ${On ? "" : "off"}" data-row="${Id}">
      <div class="ai-mod-line">
        <button type="button" class="mi-dot" data-act="mod-toggle" data-mod="${M.id}" role="switch" aria-checked="${On}" title="${On ? "Bypass" : "Enable"} ${Esc(Def.label)}" aria-label="${On ? "Bypass" : "Enable"} ${Esc(Def.label)}"></button>
        <button type="button" class="mi-row-head" data-act="open" data-id="${Id}" data-fid="row:${Id}" aria-expanded="${Open}">
          <span class="mi-swatch ai-glyph">${icon(A.MODIFIER_GLYPH[M.type] || "modifier", 13)}</span>
          <span class="mi-row-name">${Esc(Def.label)}<small>${Esc(Def.badge || "")} · #${I + 1}</small></span>
          <span class="mi-readout">${Esc(A.ModifierReadout(M))}</span>
        </button>
      </div>
      ${Open ? ModifierEditor(L, M, I) : ""}
    </div>`;
  }).join("");
}

function LayerList() {
  const L = Layer(), Visual = S.Doc.layers.slice().reverse();
  return Visual.map((E) => {
    const Active = E.id === L.id, Vis = E.visible !== false, Glyph = A.LAYER_KINDS.find((K) => K.Kind === E.kind)?.Glyph || (E.kind === "folder" ? "folder" : "motif");
    const At = S.Doc.layers.indexOf(E);
    return `<div class="mi-stratum ${Active ? "active" : ""} ${Vis ? "" : "off"}" role="tab" aria-selected="${Active}" ${E.parentId ? 'data-child="1"' : ""}>
      <button type="button" class="mi-dot" data-act="layer-vis" data-layer="${E.id}" role="switch" aria-checked="${Vis}" title="${Vis ? "Hide" : "Show"} ${Esc(E.name)}" aria-label="${Vis ? "Hide" : "Show"} ${Esc(E.name)}"></button>
      ${S.Renaming === E.id
        ? `<input class="mi-rename" data-act="rename" data-layer="${E.id}" data-fid="rename" value="${Esc(E.name)}" maxlength="80" aria-label="Layer name">`
        : `<button type="button" class="mi-stratum-name" data-act="layer" data-layer="${E.id}" title="${Esc(E.name)} · double-click to rename"><i class="ai-layer-chip" style="background:${A.LayerColour(E)}"></i>${icon(Glyph, 13)}<span class="mi-label">${Esc(E.name)}</span><small>${Esc(A.LayerCaption(E))}</small></button>`}
      ${Active && E.kind !== "folder" ? `<span class="ai-layer-tools">
        <button type="button" class="mi-x" data-act="layer-up" data-layer="${E.id}" ${At === S.Doc.layers.length - 1 ? "disabled" : ""} title="Raise" aria-label="Raise layer">${icon("up", 11)}</button>
        <button type="button" class="mi-x" data-act="layer-down" data-layer="${E.id}" ${At === 0 ? "disabled" : ""} title="Lower" aria-label="Lower layer">${icon("down", 11)}</button>
        <button type="button" class="mi-x" data-act="layer-dup" data-layer="${E.id}" title="Duplicate" aria-label="Duplicate layer">${icon("duplicate", 11)}</button>
        <button type="button" class="mi-x" data-act="layer-remove" data-layer="${E.id}" ${S.Doc.layers.filter((X) => X.kind !== "folder").length <= 1 ? "disabled" : ""} title="Delete" aria-label="Delete layer">${icon("close", 10)}</button>
      </span>` : ""}
    </div>`;
  }).join("");
}

function Pop(Open, Items) {
  if (!Open) return "";
  return `<div class="mi-pop ai-pop" role="menu">${Items}</div>`;
}

function DocumentFold() {
  const Bg = S.Doc.background, Open = S.Folds.doc ?? false;
  return `<details class="mi-fold" data-fold="doc" ${Open ? "open" : ""}>
    <summary>${icon("ground", 14)}<span>Document</span><small>${Bg.enabled ? "GROUND ON" : S.Mode === "stamp" ? "TRANSPARENT" : "NO GROUND"} · ${S.Doc.resolution || 1024} PX</small><span class="mi-chev">${icon("chevron", 11)}</span></summary>
    <div class="mi-fold-body">
      ${SwitchRow("ground-on", !!Bg.enabled, "Ground fill", S.Mode === "stamp" ? "Off keeps the decal transparent" : "Colour behind the motifs")}
      ${Bg.enabled ? SlotEditor(null, "ground", "Ground") : ""}
      <div class="mi-sub-label">Export size</div>
      ${Segments("res", A.RESOLUTIONS.map((R) => [R >= 1024 ? `${R / 1024}K` : String(R), R]), S.Doc.resolution || 1024, { Label: "Export resolution" })}
      ${S.Mode === "pattern" ? Note("Tiles are evaluated seamlessly: instances crossing an edge wrap to the opposite side. The thumbnail shows a 2 × 2 repeat.") : Note("Stamps are evaluated once, centred; anything past the border is clipped.")}
    </div>
  </details>`;
}

function CardHtml() {
  const D = S.Doc, L = Layer(), Mode = A.MODES[S.Mode], Cat = A.Catalog(S.Mode);
  const Entry = Cat.find((E) => E.Id === D.starterId), Index = Cat.findIndex((E) => E.Id === D.starterId);
  const Groups = [...new Set(Cat.map((E) => E.Group))];
  const Mods = L.modifiers || [];
  return `<article class="mi-card ai-card ${S.Mode}" aria-label="${Mode.Title} inspector">
    <header class="mi-head">
      <span class="mi-mark">${icon(Mode.Glyph, 15)}</span>
      <div class="mi-head-title"><b>${Mode.Title}</b><small>${Mode.Tag}</small></div>
      <div class="mi-head-tools">
        <button type="button" class="icon-btn" data-act="undo" ${H.Past.length ? "" : "disabled"} title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 14)}</button>
        <button type="button" class="icon-btn" data-act="redo" ${H.Future.length ? "" : "disabled"} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 14)}</button>
        <label class="icon-btn" title="Open project JSON" aria-label="Open project JSON">${icon("upload", 14)}<input type="file" accept=".json,application/json" data-act="import" hidden></label>
        <button type="button" class="icon-btn" data-act="reset" title="Reset to starter" aria-label="Reset to starter">${icon("reset", 14)}</button>
      </div>
    </header>

    <section class="mi-ident ai-ident">
      <div class="ai-thumb-frame ${S.Mode}"><div class="ai-thumb" data-thumb style="background-image:${ThumbUrl()}" role="img" aria-label="${Esc(D.name)} preview"></div></div>
      <div class="ai-ident-copy">
        <span class="mi-eyebrow">${Esc((Entry?.Group || "Imported").toUpperCase())}${Index >= 0 ? ` / ${String(Index + 1).padStart(2, "0")}` : ""}</span>
        <input class="mi-name" data-act="name" data-fid="name" value="${Esc(D.name)}" maxlength="80" spellcheck="false" aria-label="${Mode.Title} name">
        <div class="mi-ident-row">
          <span class="mi-sub" title="${Esc(Entry?.Description || "")}">${Esc(Entry?.Description || (Entry ? `${D.layers.length} layer${D.layers.length === 1 ? "" : "s"} · ${S.Mode === "pattern" ? "seamless" : "decal"} ${D.size || 512} px` : "Imported document"))}</span>
          ${Dropdown("library", [...Groups.flatMap((G) => [{ Group: G }, ...Cat.filter((E) => E.Group === G).map((E) => [E.Name, E.Id])]), ...(Entry ? [] : [[`${D.name} (imported)`, ""]])], Entry ? D.starterId : "", { Label: "Starter library", Class: "compact mi-library-dd", Search: true })}
        </div>
      </div>
    </section>

    <section class="mi-metrics" data-metrics>${StatsHtml()}</section>

    ${S.Docked ? "" : `<section class="mi-strata">
      <div class="mi-section-title"><h3>Layers</h3><small>TOP → BOTTOM</small>
        <div class="mi-add-wrap">
          <button type="button" class="mi-text-btn" data-act="add-layer-toggle" aria-expanded="${S.AddLayer}">${icon("plus", 11)}Layer</button>
          ${Pop(S.AddLayer, A.LAYER_KINDS.map((K) => `<button type="button" role="menuitem" data-act="add-layer" data-kind="${K.Kind}"><span>${icon(K.Glyph, 13)}${K.Label}</span><small>${Esc(K.Hint)}</small></button>`).join(""))}
        </div>
      </div>
      <div class="mi-strata-strip" role="tablist" aria-label="Layers">${LayerList()}</div>
    </section>`}

    <section class="mi-channels">
      <div class="mi-section-title"><h3>${Esc(L.name)}</h3><small>${Esc(A.LayerCaption(L))}</small></div>
      <div class="mi-list">${PropertyRows(L)}</div>
    </section>

    ${L.kind !== "folder" && L.kind !== "gradient" ? `<section class="mi-channels">
      <div class="mi-section-title"><h3>Modifiers</h3><small>${Mods.length ? `${Mods.filter((M) => M.enabled !== false).length} OF ${Mods.length} ACTIVE · IN ORDER` : "NONE"}</small>
        <div class="mi-add-wrap">
          <button type="button" class="mi-text-btn" data-act="add-mod-toggle" aria-expanded="${S.AddMod}">${icon("plus", 11)}Modifier</button>
          ${Pop(S.AddMod, A.MODIFIER_DEFINITIONS.map((D) => `<button type="button" role="menuitem" data-act="add-mod" data-type="${D.type}" title="${Esc(D.description)}"><span>${icon(A.MODIFIER_GLYPH[D.type], 13)}${Esc(D.label)}</span><small>${Esc(D.badge)}</small></button>`).join(""))}
        </div>
      </div>
      <div class="mi-list">${ModifierRows(L)}</div>
    </section>` : ""}

    ${DocumentFold()}

    <footer class="mi-foot">
      <div class="mi-export">
        <button type="button" class="primary" data-act="export-svg">${icon("download", 13)}.svg</button>
        <button type="button" data-act="export-project" title="TextureStudio project (frontier.${S.Mode}.v1)">${icon("download", 13)}Project</button>
        <button type="button" data-act="copy-svg" title="Copy SVG markup">${icon("copy", 13)}Copy</button>
      </div>
      <div class="mi-foot-line"><span class="mi-status ${S.Status ? "on" : ""}" data-status>${Esc(S.Status || "Saved locally")}</span><span>Double-click a layer to rename · Esc closes</span></div>
    </footer>
  </article>`;
}

// ------------------------------------------------------------------------------------------------ render
function Render() {
  Rebuild(Root, CardHtml(), ".ai-card");
  for (const Fn of Peers) Fn(false);
}

// Cheap refresh while a slider or colour drags: readouts, captions, stats + thumbnail (one frame later), ramp bars.
function RefreshLive() {
  const L = Layer();
  const Rows = Object.fromEntries(A.LayerRows(S.Doc, L).map((R) => [R.Id, R]));
  for (const Row of Root.querySelectorAll("[data-row]")) {
    const Id = Row.dataset.row, Read = Row.querySelector(".mi-readout"), Sw = Row.querySelector(":scope > .mi-row-head > .mi-swatch");
    if (Id.startsWith("mod:")) { const M = L.modifiers.find((E) => `mod:${E.id}` === Id); if (M && Read) Read.textContent = A.ModifierReadout(M); continue; }
    const R = Rows[Id];
    if (!R) continue;
    if (Read) Read.textContent = R.Text;
    if (Sw && R.Swatch) Sw.style.background = R.Swatch;
  }
  for (const Bar of Root.querySelectorAll("[data-stops]")) {
    const Colours = [...Bar.querySelectorAll('.mi-stop input[type="color"]')].map((I) => I.value);
    Bar.querySelector(".mi-stops-bar").style.background = `linear-gradient(90deg, ${Colours.join(", ")})`;
    Bar.querySelectorAll(".mi-stop").forEach((E, I) => { E.style.background = Colours[I]; });
  }
  const Name = Root.querySelector(".mi-stratum.active .mi-stratum-name small");
  if (Name) Name.textContent = A.LayerCaption(L);
  const Chip = Root.querySelector(".mi-stratum.active .ai-layer-chip");
  if (Chip) Chip.style.background = A.LayerColour(L);
  cancelAnimationFrame(LiveFrame);
  LiveFrame = requestAnimationFrame(() => {
    const Metrics = Root.querySelector("[data-metrics]"), Thumb = Root.querySelector("[data-thumb]");
    if (Metrics) Metrics.innerHTML = StatsHtml();
    if (Thumb) Thumb.style.backgroundImage = ThumbUrl();
    for (const Fn of Peers) Fn(true);
  });
}

// ------------------------------------------------------------------------------------------------ bindings
function Write(Bind, Raw) {
  const L = Layer(), D = S.Doc;
  const [Head, ...Rest] = Bind.split(":");
  if (Head === "layer") {
    const Path = Rest.join(":");
    const Value = Path === "text.value" ? String(Raw).slice(0, 40) : +Raw;
    if (typeof Value === "number" && !Number.isFinite(Value)) return D;
    return A.EditLayer(D, L.id, (E) => A.SetPath(E, Path, Value));
  }
  if (Head === "slot") {
    const [Slot, Index] = Rest;
    return A.SetSlotColour(D, L.id, Slot, Index === "solid" ? "solid" : +Index, String(Raw).toLowerCase());
  }
  if (Head === "angle") return A.SetSlotAngle(D, L.id, Rest[0], +Raw);
  if (Head === "pt") return A.AssignPointColour(D, L?.id, Rest[0], +Rest[1], String(Raw).toLowerCase());
  if (Head === "pf") return A.AssignPointField(D, L?.id, Rest[0], Rest[1], Rest[1] === "background" ? String(Raw).toLowerCase() : +Raw);
  if (Head === "surf") {
    const Spec = A.ARTWORK_PBR_CHANNEL_MAP[Rest[0]];
    return A.SetChannelValue(D, L.id, Rest[0], Spec?.isColor ? (HEX.test(Raw) ? Raw.toLowerCase() : null) ?? A.ChannelValue(L, Rest[0]) : +Raw);
  }
  if (Head === "mask") return A.EditLayer(D, L.id, (E) => { E.mask[Rest[0]] = +Raw; });
  if (Head === "mod") {
    const [Id, K] = Rest, Field = Object.values(A.MODIFIER_FIELDS).flat().find((F) => F.Key === K);
    const Value = Field?.T === "c" ? (HEX.test(Raw) ? Raw.toLowerCase() : null) : +Raw;
    if (Value === null || (typeof Value === "number" && !Number.isFinite(Value))) return D;
    return A.PatchModifier(D, L.id, Id, K, Value);
  }
  return D;
}

// ------------------------------------------------------------------------------------------------ events
function OnClick(Event) {
  const El = Event.target.closest("[data-act]");
  if (!El || !Root.contains(El) || El.disabled) {
    if ((S.AddLayer || S.AddMod) && !Event.target.closest(".mi-add-wrap")) { S.AddLayer = S.AddMod = false; Render(); }
    return;
  }
  const Act = El.dataset.act, L = Layer(), D = S.Doc, V = El.dataset.value;
  // Dropdown picks for what used to be <select>s run the same change path.
  if (El.classList.contains("mi-dd-opt") && ["library", "chan-add"].includes(Act)) return OnChange({ target: { dataset: El.dataset, value: V } });
  if (["name", "rename", "library", "import", "chan-add"].includes(Act) || El.matches("input[type=file]")) return;
  switch (Act) {
    case "undo": return Step(true);
    case "redo": return Step(false);
    case "reset": Select(A.Create(S.Mode, D.starterId)); Flash("Reset to starter"); break;
    case "layer":
      if (Event.detail >= 2) { S.Renaming = El.dataset.layer; Render(); Root.querySelector(".mi-rename")?.select(); return; }
      if (D.selectedLayerId !== El.dataset.layer) { S.Doc = { ...D, selectedLayerId: El.dataset.layer }; S.Open = null; Save(); }
      break;
    case "layer-vis": { const T = A.FindLayer(D, El.dataset.layer); Apply(A.EditLayer(D, T.id, (E) => { E.visible = E.visible === false; })); Flash(`${T.name} ${T.visible === false ? "shown" : "hidden"}`); break; }
    case "layer-up": Apply(A.MoveLayer(D, El.dataset.layer, 1)); break;
    case "layer-down": Apply(A.MoveLayer(D, El.dataset.layer, -1)); break;
    case "layer-dup": { const R = A.DuplicateLayer(D, El.dataset.layer); Apply(R.Doc); Flash("Layer duplicated"); break; }
    case "layer-remove": { const Name = A.FindLayer(D, El.dataset.layer)?.name; Apply(A.RemoveLayer(D, El.dataset.layer)); S.Open = null; Flash(`${Name} deleted`); break; }
    case "add-layer-toggle": S.AddLayer = !S.AddLayer; S.AddMod = false; break;
    case "add-layer": { const R = A.AddLayer(D, El.dataset.kind); Apply(R.Doc); S.AddLayer = false; S.Open = El.dataset.kind === "text" ? "text" : El.dataset.kind === "motif" ? "shape" : "fill"; Flash(`${El.dataset.kind[0].toUpperCase()}${El.dataset.kind.slice(1)} layer added`); break; }
    case "open": S.Open = S.Open === El.dataset.id ? null : El.dataset.id; S.AddLayer = S.AddMod = false; break;
    case "add-mod-toggle": S.AddMod = !S.AddMod; S.AddLayer = false; break;
    case "add-mod": { const R = A.AddModifier(D, L.id, El.dataset.type); Apply(R.Doc); S.Open = `mod:${R.Id}`; S.AddMod = false; Flash(`${A.MODIFIER_DEFINITIONS.find((X) => X.type === El.dataset.type)?.label} added`); break; }
    case "mod-toggle": Apply(A.EditLayer(D, L.id, (E) => { const M = E.modifiers.find((X) => X.id === El.dataset.mod); M.enabled = M.enabled === false; })); break;
    case "mod-up": Apply(A.MoveModifier(D, L.id, El.dataset.mod, -1)); break;
    case "mod-down": Apply(A.MoveModifier(D, L.id, El.dataset.mod, 1)); break;
    case "mod-remove": Apply(A.RemoveModifier(D, L.id, El.dataset.mod)); S.Open = null; Flash("Modifier removed"); break;
    case "mod-opt": Apply(A.PatchModifier(D, L.id, El.dataset.mod, El.dataset.key, V)); break;
    case "mod-switch": { const M = L.modifiers.find((X) => X.id === El.dataset.mod); Apply(A.PatchModifier(D, L.id, M.id, El.dataset.key, !M[El.dataset.key])); break; }
    case "shape": Apply(A.EditLayer(D, L.id, (E) => { E.shape.motifType = V; })); break;
    case "fill-on": Apply(A.EditLayer(D, L.id, (E) => { E.shape.fillEnabled = E.shape.fillEnabled === false; })); break;
    case "slot-mode": Apply(A.SetSlotMode(D, L.id, El.dataset.slot, V)); break;
    case "stop-add": case "stop-remove": {
      const [Head, Slot] = El.dataset.target.split(":");
      Apply(Head === "pt" ? A.PointCount(D, L?.id, Slot, Act === "stop-add") : A.SlotStops(D, L?.id, Slot, Act === "stop-add"));
      break;
    }
    case "slot-interp": Apply(A.AssignSlotInterp(D, L?.id, El.dataset.slot, V)); break;
    case "slot-space": Apply(A.AssignSlotSpace(D, L?.id, El.dataset.slot, V)); Flash(V === "scene" ? "Ramp spans the canvas" : "Ramp on each shape"); break;
    case "slot-unplace": Apply(A.ResetSlotPlace(D, L?.id, El.dataset.slot)); Flash("Placement reset to the angle"); break;
    case "slot-place": Settle(); S.Placer?.(El.dataset.slot); return;
    case "text-weight": Apply(A.EditLayer(D, L.id, (E) => { E.text.fontWeight = +V; })); break;
    case "centre": Apply(A.EditLayer(D, L.id, (E) => { E.transform.x = E.transform.y = (D.size || A.ARTWORK_SIZE) / 2; })); break;
    case "square": Apply(A.EditLayer(D, L.id, (E) => { E.transform.height = E.transform.width; })); break;
    case "blend": Apply(A.EditLayer(D, L.id, (E) => { E.blend = V; })); break;
    case "finish": Apply(A.SetFinish(D, L.id, V)); break;
    case "chan-off": Apply(A.SetChannelOn(D, L.id, El.dataset.key, false)); Flash(`${A.ARTWORK_PBR_CHANNEL_MAP[El.dataset.key]?.label} removed`); break;
    case "chan-albedo": Apply(A.SetChannelOn(D, L.id, "albedo", !L.surface.channels.albedo)); break;
    case "mask-on": Apply(A.EditLayer(D, L.id, (E) => { E.mask = { ...E.mask, enabled: !E.mask?.enabled }; })); break;
    case "mask-mode": Apply(A.EditLayer(D, L.id, (E) => { E.mask.mode = V; })); break;
    case "mask-invert": Apply(A.EditLayer(D, L.id, (E) => { E.mask.invert = !E.mask.invert; })); break;
    case "dice": Apply(Write(El.dataset.target, Math.floor(Math.random() * 10000))); break;
    case "ground-on": Apply(A.Edit(D, (X) => { X.background.enabled = !X.background.enabled; if (X.background.enabled && !(X.background.opacity > 0)) X.background.opacity = 1; })); break;
    case "res": Apply({ ...D, resolution: +V }); break;
    case "export-svg": Download(A.ExportSvg(D, D.resolution || 1024), `${A.Slug(D.name)}.svg`, "image/svg+xml"); return Flash(`Exported ${A.Slug(D.name)}.svg`);
    case "export-project": Download(A.ExportProject(D), `${A.Slug(D.name)}.${S.Mode}.json`, "application/json"); return Flash("Exported TextureStudio project");
    case "copy-svg": (navigator.clipboard?.writeText(A.ExportSvg(D, D.resolution || 1024)) || Promise.reject()).then(() => Flash("Copied SVG"), () => Flash("Clipboard unavailable")); return;
    default: return;
  }
  Render();
  if (Act === "open" && S.Open) Root.querySelector(`[data-fid="row:${CSS.escape(S.Open)}"]`)?.focus({ preventScroll: true });
}

function OnInput(Event) {
  const El = Event.target;
  if (El.dataset.act === "name") { Apply({ ...S.Doc, name: El.value.slice(0, 80) || "Untitled" }, true); return; }
  if (!El.dataset.bind || El.dataset.hex !== undefined) return;
  if (El.type === "number" && (El.value === "" || !Number.isFinite(+El.value))) return;
  Apply(Write(El.dataset.bind, El.value), true);
  SyncSiblings(Root, El);
  RefreshLive();
}

async function OnChange(Event) {
  const El = Event.target, Act = El.dataset.act;
  if (Act === "library") {
    Settle();
    Select(LoadStored(El.value));
    Render();
    Flash(`Loaded ${S.Doc.name}`);
    return;
  }
  if (Act === "name") { Settle(); Render(); return; }
  if (Act === "rename") return FinishRename(El);
  if (Act === "chan-add") {
    if (El.value) { Apply(A.SetChannelOn(S.Doc, Layer().id, El.value, true)); Flash(`${A.ARTWORK_PBR_CHANNEL_MAP[El.value]?.label} added`); }
    Render();
    return;
  }
  if (Act === "import") {
    const File = El.files?.[0];
    El.value = "";
    if (!File) return;
    try {
      const Doc = A.Load(await File.text(), S.Mode);
      if (Doc.mode !== S.Mode) { Flash(`That is a ${Doc.mode} project — open it in ${A.MODES[Doc.mode].Title}`); return; }
      Doc.starterId = Doc.starterId && A.Catalog(S.Mode).some((E) => E.Id === Doc.starterId) ? Doc.starterId : `import-${A.Slug(Doc.name)}`;
      Select(Doc);
      Render();
      Flash(`Opened ${Doc.name}`);
    } catch (Error) { Flash(`Open failed · ${Error.message}`); }
    return;
  }
  if (El.dataset.hex !== undefined) {
    const V = El.value.trim().startsWith("#") ? El.value.trim() : "#" + El.value.trim();
    if (HEX.test(V)) Apply(Write(El.dataset.bind, V.toLowerCase()));
    Render();
    return;
  }
  if (El.dataset.bind) {
    if (El.type === "number" && Number.isFinite(+El.value) && El.value !== "") Apply(Write(El.dataset.bind, El.value), true);
    Settle();
    Render();
  }
}

function FinishRename(El) {
  if (S.Renaming === null) return;
  const Id = S.Renaming;
  S.Renaming = null;
  Apply(A.EditLayer(S.Doc, Id, (E) => { E.name = El.value.trim().slice(0, 80) || E.name; }));
  Render();
}

function OnKey(Event) {
  const T = Event.target, Typing = T.matches?.("input, textarea, select");
  if ((Event.ctrlKey || Event.metaKey) && !Event.altKey && (Event.key === "z" || Event.key === "Z" || Event.key === "y")) {
    if (Typing && T.type !== "range" && T.type !== "color") return;
    Event.preventDefault();
    return Step(!(Event.key === "y" || Event.shiftKey));
  }
  if (T.dataset?.act === "rename") {
    if (Event.key === "Enter") { Event.preventDefault(); FinishRename(T); }
    else if (Event.key === "Escape") { S.Renaming = null; Render(); }
    return;
  }
  if ((T.dataset?.hex !== undefined || T.dataset?.act === "name") && Event.key === "Enter") { T.blur(); return; }
  if (T.classList?.contains("mi-row-head") && (Event.key === "ArrowDown" || Event.key === "ArrowUp")) {
    Event.preventDefault();
    const Heads = [...Root.querySelectorAll(".mi-row-head")], At = Heads.indexOf(T);
    Heads[Math.max(0, Math.min(Heads.length - 1, At + (Event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    return;
  }
  if (Event.key === "Escape" && !Typing) {
    if (S.AddLayer || S.AddMod) S.AddLayer = S.AddMod = false;
    else if (S.Open) S.Open = null;
    else return;
    Render();
  }
}

function OnStorage(Event) {
  if (!Event.key || Event.key !== Key(S.Doc.starterId) || !Event.newValue) return;
  try { S.Doc = A.Load(Event.newValue, S.Mode); Render(); Flash("Synced from another window"); } catch { /* ignore malformed writes */ }
}

// ------------------------------------------------------------------------------------------------ boot
export function Mount(Host, Options = {}) {
  Root = Host;
  S.Docked = !!Options.docked;
  S.Scoped = !!Options.scoped;
  S.Placer = typeof Options.placeGradient === "function" ? Options.placeGradient : null;   // host canvas hand-off
  const Params = new URLSearchParams(globalThis.location?.search || "");
  S.Mode = Options.mode || (Params.get("mode") === "stamp" ? "stamp" : "pattern");
  const Cat = A.Catalog(S.Mode);
  const Wanted = Options.starter || Params.get("starter") || Store?.getItem(`${A.STORAGE_PREFIX}${S.Mode}#current`) || Cat[0].Id;
  Select(LoadStored(Cat.some((E) => E.Id === Wanted) ? Wanted : Cat[0].Id));
  Root.addEventListener("click", OnClick);
  Root.addEventListener("input", OnInput);
  Root.addEventListener("change", OnChange);
  Root.addEventListener("toggle", (E) => { const F = E.target.closest?.("[data-fold]"); if (F) S.Folds[F.dataset.fold] = F.open; }, true);
  Root.addEventListener("focusout", (E) => { if (E.target.dataset?.act === "rename") FinishRename(E.target); });
  document.addEventListener("keydown", (E) => { if (KeyReaches(E, Root, S.Scoped)) OnKey(E); });
  document.addEventListener("click", (E) => { if ((S.AddLayer || S.AddMod) && E.target.isConnected && !Root.contains(E.target)) { S.AddLayer = S.AddMod = false; Render(); } });
  globalThis.addEventListener?.("storage", OnStorage);
  Render();
  return Hub;
}

// What the outliner (or a host) drives the card through — every edit goes Apply → Render, so undo and storage stay whole.
const Hub = {
  State: S, Model: A, History: H, Render, Apply, Settle, Flash, Step, Layer, CurrentStats, ThumbUrl,
  Subscribe(Fn) { Peers.add(Fn); return () => Peers.delete(Fn); },
  Load(Id) { Settle(); Select(LoadStored(Id)); Render(); Flash(`Loaded ${S.Doc.name}`); },
  // Host hand-off: show the artwork document the host already owns (Texture Studio's Pattern / Stamp stage).
  Adopt(Doc, Mode) {
    Settle();
    let Next;
    try { Next = structuredClone(Doc); } catch { Next = JSON.parse(JSON.stringify(Doc)); }
    if (!Next || !Array.isArray(Next.layers)) return false;
    if (Mode) S.Mode = Mode;
    S.Doc = Next;
    if (S.Open && !A.FindLayer(S.Doc, S.Doc.selectedLayerId)) S.Open = null;
    S.AddLayer = false; S.AddMod = false; S.Renaming = null;
    H.Clear();
    Render();
    return true;
  },
  // Select a layer and optionally open one of its property / modifier rows ("fill", "mask", "mod:<id>", …).
  SelectLayer(Id, Open) {
    if (!A.FindLayer(S.Doc, Id)) return;
    if (S.Doc.selectedLayerId !== Id) { S.Doc = { ...S.Doc, selectedLayerId: Id }; S.Open = null; Save(); }
    S.AddLayer = S.AddMod = false;
    if (Open !== undefined) S.Open = Open;
    Render();
    if (Open) Root.querySelector(`[data-fid="row:${CSS.escape(Open)}"]`)?.scrollIntoView?.({ block: "nearest" });
  },
};
