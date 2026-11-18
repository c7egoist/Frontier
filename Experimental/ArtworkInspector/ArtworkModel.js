// ArtworkModel.js — pure document model behind the Pattern Studio / Stamp Studio inspector card.
//
// The document is TextureStudio's own `frontier.artwork.v2` layer-stack document (ArtworkStackEngine.js, copied byte-identical
// into ./Engine), so anything authored here opens in TextureStudio and vice versa.  Every edit returns a new document
// (structuredClone + mutate), which keeps undo trivial and lets the card coalesce a slider drag into one history step.

import {
  ARTWORK_SIZE, ARTWORK_FINISHES, MOTIF_TYPES, MODIFIER_DEFINITIONS, ARTWORK_PBR_CHANNELS, ARTWORK_PBR_CHANNEL_MAP,
  createArtworkLayer, createDefaultModifier, ensureArtworkLayerSurface, setArtworkLayerPbrMask, getArtworkChannelValue,
  setArtworkChannelValue, normalizeGradientStops, evaluateLayerInstances, evaluateArtworkDocument, artworkDocumentToSvgString,
  artworkDocumentLayersSvg, normalizePointGradient2D, gradientPlacement, GRADIENT_INTERPOLATIONS, POINT_GRADIENT_INTERPOLATIONS, normalizeGradientInterp,
} from "./Engine/Patterns/ArtworkStackEngine.js";
import { NOISE_SCALED_STARTERS, STAMP_STARTERS } from "./Engine/Patterns/ArtworkStarters.js";

export { ARTWORK_SIZE, ARTWORK_FINISHES, MOTIF_TYPES, MODIFIER_DEFINITIONS, ARTWORK_PBR_CHANNELS, ARTWORK_PBR_CHANNEL_MAP, GRADIENT_INTERPOLATIONS, POINT_GRADIENT_INTERPOLATIONS };

const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
const HEX = /^#[0-9a-f]{6}$/i;
export const Slug = (Name) => (Name || "artwork").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artwork";

// ------------------------------------------------------------------------------------------------ modes + catalog
export const MODES = Object.freeze({
  pattern: { Id: "pattern", Title: "Pattern Studio", Tag: "SEAMLESS TILE", Glyph: "pattern", Starters: NOISE_SCALED_STARTERS },
  stamp: { Id: "stamp", Title: "Stamp Studio", Tag: "PBR DECAL", Glyph: "stamp", Starters: STAMP_STARTERS },
});
export const STORAGE_PREFIX = "Frontier.ArtworkInspector.v1:";
export const LAYER_KINDS = Object.freeze([
  { Kind: "motif", Label: "Motif", Glyph: "motif", Hint: "Vector shape with modifiers" },
  { Kind: "text", Label: "Text", Glyph: "text", Hint: "Stencil / label lettering" },
  { Kind: "gradient", Label: "Gradient", Glyph: "gradient", Hint: "Full-tile colour wash" },
]);
export const BLENDS = Object.freeze(["Normal", "Multiply", "Screen", "Overlay", "Add", "Darken"]);
export const RESOLUTIONS = Object.freeze([256, 512, 1024, 2048]);
export const BLEND_HINTS = Object.freeze({ Normal: "Paints over", Multiply: "Darkens", Screen: "Lightens", Overlay: "Contrast", Add: "Glows", Darken: "Keeps the darker" });

// A 16 px glyph of each motif, drawn by the engine itself (cached) — the lead icon of the Shape dropdown.
const GlyphCache = new Map();
export function MotifGlyph(Type) {
  if (GlyphCache.has(Type)) return GlyphCache.get(Type);
  let Svg = "";
  try {
    const Layer = createArtworkLayer("motif", { transform: { x: 32, y: 32, width: 44, height: 44, rotation: 0 }, shape: { motifType: Type, color: "#d6d6d6" }, modifiers: [] });
    ensureArtworkLayerSurface(Layer);
    const { defs, body } = artworkDocumentLayersSvg({ size: 64, mode: "stamp", layers: [Layer] }, { idPrefix: `glyph-${Type}` });
    Svg = `<svg viewBox="0 0 64 64" width="16" height="16" aria-hidden="true"><defs>${defs}</defs>${body.replace(/cursor:[a-z]+/g, "")}</svg>`;
  } catch { Svg = ""; }
  GlyphCache.set(Type, Svg);
  return Svg;
}


export function Catalog(Mode) {
  return MODES[Mode].Starters.map((S) => ({ Id: S.id, Name: S.name, Group: S.group || "Starters", Description: S.description || "" }));
}

export function Create(Mode, Id) {
  const Starters = MODES[Mode].Starters, Entry = Starters.find((S) => S.id === Id) || Starters[0];
  const Doc = structuredClone(Entry.build());
  Doc.mode = Mode;
  Doc.starterId = Entry.id;
  Doc.resolution = Doc.resolution || 1024;
  return Normalise(Doc);
}

function Normalise(Doc) {
  Doc.size = Doc.size || ARTWORK_SIZE;
  Doc.background = { enabled: false, color: "#171a1f", colorB: "#0b0b0b", opacity: 1, finish: "ink", roughness: 0.8, metalness: 0, height: 0, ...(Doc.background || {}) };
  Doc.tiling = { mode: "straight", repeats: Doc.mode === "pattern" ? 2 : 1, showGrid: false, ...(Doc.tiling || {}) };
  Doc.layers = (Doc.layers || []).map((L) => (L.kind === "folder" ? L : NormaliseLayer(L)));
  if (!Doc.layers.some((L) => L.id === Doc.selectedLayerId)) Doc.selectedLayerId = (Doc.layers.filter((L) => L.kind !== "folder").at(-1) || Doc.layers.at(-1))?.id || null;
  return Doc;
}

function NormaliseLayer(L) {
  const N = createArtworkLayer(L.kind || "motif", L);
  ensureArtworkLayerSurface(N);
  return N;
}

// Accepts a TextureStudio project file ({ schema: "frontier.<mode>.v1", document }) or a bare artwork document.
export function Load(Text, ModeHint = "pattern") {
  const Raw = typeof Text === "string" ? JSON.parse(Text) : Text;
  const Doc = Raw?.document || Raw;
  if (!Doc || !Array.isArray(Doc.layers) || !Doc.layers.length) throw Error("Not an artwork document — no layers.");
  const Kinds = new Set(["motif", "text", "gradient", "image", "folder"]);
  for (const L of Doc.layers) {
    if (!L || typeof L !== "object" || !Kinds.has(L.kind || "motif")) throw Error(`Unknown layer kind “${L?.kind}”.`);
    if (L.modifiers && !Array.isArray(L.modifiers)) throw Error("Layer modifiers must be a list.");
  }
  const Mode = Doc.mode === "stamp" || Doc.mode === "pattern" ? Doc.mode : String(Raw.schema || "").includes("stamp") ? "stamp" : ModeHint;
  const Out = structuredClone(Doc);
  Out.mode = Mode;
  Out.schema = "frontier.artwork.v2";
  Out.name = String(Out.name || "Imported artwork").slice(0, 80);
  const Res = Math.round(+Raw.resolution);
  Out.resolution = Number.isFinite(Res) && Res >= 64 && Res <= 4096 ? Res : Out.resolution || 1024;
  return Normalise(Out);
}

// TextureStudio's project format (performSaveProject in ArtworkStackWorkspace.js) — opens there with “Open project”.
export function ExportProject(Doc) {
  const { resolution, ...Document } = Doc;
  return JSON.stringify({ schema: `frontier.${Doc.mode}.v1`, resolution: resolution || 1024, savedAt: new Date().toISOString(), document: Document }, null, 2);
}

export function ExportSvg(Doc, Size = 512) {
  return artworkDocumentToSvgString(Doc, { width: Size, height: Size, showBg: Doc.background?.enabled !== false });
}

// ------------------------------------------------------------------------------------------------ edits
export const FindLayer = (Doc, Id) => Doc.layers.find((L) => L.id === Id) || null;
export const Selected = (Doc) => FindLayer(Doc, Doc.selectedLayerId) || Doc.layers.at(-1);

export function Edit(Doc, Fn) {
  const Next = structuredClone(Doc);
  Fn(Next);
  return Next;
}

export function EditLayer(Doc, Id, Fn) {
  return Edit(Doc, (D) => { const L = FindLayer(D, Id); if (L) Fn(L, D); });
}

// Dotted-path write on a layer (e.g. "transform.x", "shape.innerRatio", "mask.threshold").
export function SetPath(Target, Path, Value) {
  const Keys = Path.split(".");
  let O = Target;
  for (const K of Keys.slice(0, -1)) { if (typeof O[K] !== "object" || O[K] === null) O[K] = {}; O = O[K]; }
  O[Keys.at(-1)] = Value;
}
export function GetPath(Target, Path) { return Path.split(".").reduce((O, K) => (O == null ? undefined : O[K]), Target); }

export function AddLayer(Doc, Kind) {
  const Count = Doc.layers.filter((L) => L.kind === Kind).length + 1;
  const Size = Doc.size || ARTWORK_SIZE;
  const Presets = {
    motif: { name: `Motif ${Count}`, transform: { x: Size / 2, y: Size / 2, width: Doc.mode === "stamp" ? 180 : 48, height: Doc.mode === "stamp" ? 180 : 48, rotation: 0 }, shape: { motifType: "circle", color: "#e8c27a" },
      modifiers: Doc.mode === "pattern" ? [{ ...createDefaultModifier("array-grid"), layout: "grid", columns: 6, rows: 6 }] : [] },
    text: { name: `Text ${Count}`, transform: { x: Size / 2, y: Size / 2, width: 260, height: 80, rotation: 0 }, text: { value: "FRONTIER", fontSize: 48 }, shape: { color: "#eff4cf" } },
    gradient: { name: `Gradient ${Count}`, opacity: 0.6, blend: "Overlay", transform: { x: Size / 2, y: Size / 2, width: Size, height: Size, rotation: 0 }, shape: { fillMode: "linear", color: "#e8c27a", colorB: "#5a7692", gradientAngle: 45 } },
  };
  const L = createArtworkLayer(Kind, Presets[Kind] || {});
  ensureArtworkLayerSurface(L);
  const Next = Edit(Doc, (D) => {
    const At = D.layers.findIndex((E) => E.id === D.selectedLayerId);
    D.layers.splice(At < 0 ? D.layers.length : At + 1, 0, L);
    D.selectedLayerId = L.id;
  });
  return { Doc: Next, Id: L.id };
}

export function DuplicateLayer(Doc, Id) {
  const Src = FindLayer(Doc, Id);
  if (!Src || Src.kind === "folder") return { Doc, Id };
  const Copy = createArtworkLayer(Src.kind, { ...structuredClone(Src), id: undefined, name: `${Src.name} copy` });
  Copy.modifiers = Copy.modifiers.map((M) => ({ ...M, id: createDefaultModifier(M.type).id }));
  const Next = Edit(Doc, (D) => { D.layers.splice(D.layers.findIndex((E) => E.id === Id) + 1, 0, Copy); D.selectedLayerId = Copy.id; });
  return { Doc: Next, Id: Copy.id };
}

export function RemoveLayer(Doc, Id) {
  if (Doc.layers.filter((L) => L.kind !== "folder").length <= 1) return Doc;
  return Edit(Doc, (D) => {
    const At = D.layers.findIndex((L) => L.id === Id);
    if (At < 0) return;
    D.layers.splice(At, 1);
    D.layers.forEach((L) => { if (L.parentId === Id) L.parentId = null; });
    D.selectedLayerId = (D.layers[Math.max(0, At - 1)] || D.layers[0]).id;
  });
}

// Delta +1 moves a layer up the visual stack (later in doc.layers = drawn on top).
export function MoveLayer(Doc, Id, Delta) {
  return Edit(Doc, (D) => {
    const At = D.layers.findIndex((L) => L.id === Id), To = Clamp(At + Delta, 0, D.layers.length - 1);
    if (At < 0 || To === At) return;
    const [L] = D.layers.splice(At, 1);
    D.layers.splice(To, 0, L);
  });
}

// ------------------------------------------------------------------------------------------------ outliner edits
// Groups are TextureStudio "folder" layers: children point at them through parentId; the draw order stays doc.layers.
export function AddFolder(Doc) {
  const Count = Doc.layers.filter((L) => L.kind === "folder").length + 1;
  const F = createArtworkLayer("folder", { name: `Group ${Count}` });
  const Next = Edit(Doc, (D) => {
    const Sel = D.layers.find((E) => E.id === D.selectedLayerId);
    const At = Sel ? D.layers.indexOf(Sel) : D.layers.length - 1;
    D.layers.splice(At + 1, 0, F);
    // The selected layer (if it is loose) moves into the new group, the way "Group selection" works in TextureStudio.
    if (Sel && Sel.kind !== "folder" && !Sel.parentId) Sel.parentId = F.id;
  });
  return { Doc: Next, Id: F.id };
}

// Folders never nest; a folder moves together with its children.
export const CanNest = (Doc, DragId, TargetId) => FindLayer(Doc, TargetId)?.kind === "folder" && FindLayer(Doc, DragId)?.kind !== "folder";

// Drop DragId relative to TargetId in the *visual* (top → bottom) order: "before" = above, "after" = below,
// "inside" = top of a folder.
export function PlaceLayer(Doc, DragId, TargetId, Where) {
  const Drag = FindLayer(Doc, DragId), Target = FindLayer(Doc, TargetId);
  if (!Drag || !Target || DragId === TargetId) return Doc;
  if (Where === "inside" && !CanNest(Doc, DragId, TargetId)) Where = "before";
  if (Drag.kind === "folder" && Target.parentId === DragId) return Doc;
  return Edit(Doc, (D) => {
    const Ids = new Set([DragId, ...(Drag.kind === "folder" ? D.layers.filter((L) => L.parentId === DragId).map((L) => L.id) : [])]);
    const Block = D.layers.filter((L) => Ids.has(L.id));
    D.layers = D.layers.filter((L) => !Ids.has(L.id));
    const Anchor = D.layers.find((L) => L.id === TargetId);
    let At = D.layers.indexOf(Anchor);
    const Moved = Block.find((L) => L.id === DragId);
    if (Where === "inside") { Moved.parentId = TargetId; }
    else {
      Moved.parentId = Drag.kind === "folder" ? null : Anchor.parentId || null;
      if (Where === "before") {
        At += 1;
        // Above a folder means above its whole block: past every child that sits later in the array.
        if (Anchor.kind === "folder") D.layers.forEach((L, I) => { if (L.parentId === Anchor.id && I >= At) At = I + 1; });
      } else if (Anchor.kind === "folder") {
        D.layers.forEach((L, I) => { if (L.parentId === Anchor.id && I < At) At = I; });
      }
    }
    D.layers.splice(At, 0, ...Block);
  });
}

export const SetLocked = (Doc, Id, Locked) => EditLayer(Doc, Id, (E) => { E.locked = !!Locked; });

export function AddModifier(Doc, LayerId, Type) {
  const M = createDefaultModifier(Type);
  return { Doc: EditLayer(Doc, LayerId, (L) => { L.modifiers = [...(L.modifiers || []), M]; }), Id: M.id };
}
export function RemoveModifier(Doc, LayerId, ModId) {
  return EditLayer(Doc, LayerId, (L) => { L.modifiers = (L.modifiers || []).filter((M) => M.id !== ModId); });
}
export function MoveModifier(Doc, LayerId, ModId, Delta) {
  return EditLayer(Doc, LayerId, (L) => {
    const At = L.modifiers.findIndex((M) => M.id === ModId), To = Clamp(At + Delta, 0, L.modifiers.length - 1);
    if (At < 0 || At === To) return;
    const [M] = L.modifiers.splice(At, 1);
    L.modifiers.splice(To, 0, M);
  });
}
export function PatchModifier(Doc, LayerId, ModId, Key, Value) {
  return EditLayer(Doc, LayerId, (L) => { const M = L.modifiers.find((E) => E.id === ModId); if (M) M[Key] = Value; });
}

// ---- colour slots: fill / stroke on a layer, ground on the document
const SLOT = {
  fill: { Mode: "fillMode", Stops: "fillStops", A: "color", B: "colorB", Angle: "gradientAngle", Point: "fillPointGradient", Place: "fillPlace", Interp: "fillInterp" },
  stroke: { Mode: "strokeMode", Stops: "strokeStops", A: "strokeColor", B: "strokeColorB", Angle: "strokeGradientAngle", Point: "strokePointGradient", Place: "strokePlace", Interp: "strokeInterp" },
  ground: { Mode: "fillMode", Stops: "fillStops", A: "color", B: "colorB", Angle: "gradientAngle", Point: "fillPointGradient", Place: "fillPlace", Interp: "fillInterp" },
};
export const SLOT_KEYS = SLOT;
const SlotHost = (D, LayerId, Slot) => (Slot === "ground" ? D.background : FindLayer(D, LayerId)?.shape);

export function SlotState(Doc, LayerId, Slot) {
  const H = SlotHost(Doc, LayerId, Slot), K = SLOT[Slot];
  if (!H) return null;
  const Kind = Slot === "fill" && FindLayer(Doc, LayerId)?.kind === "gradient";
  const Mode = H[K.Mode] || (Kind ? "linear" : "solid");
  const Stops = normalizeGradientStops(H[K.Stops], H[K.A], H[K.B]);
  const Point = Mode === "point" ? normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], Doc.size || ARTWORK_SIZE) : null;
  return {
    Mode, Stops, Colour: Mode === "solid" ? (HEX.test(H[K.A]) ? H[K.A] : Stops[0].color) : Stops[0].color, Angle: H[K.Angle] ?? 45, AllowSolid: !Kind,
    Interp: Point ? normalizeGradientInterp(Point.interp, true) : normalizeGradientInterp(H[K.Interp]),
    Placed: Point ? true : !!H[K.Place], Point,
    Space: H[K.Place]?.space === "scene" ? "scene" : "shape", Spans: Slot !== "ground" && FindLayer(Doc, LayerId)?.kind !== "gradient",
  };
}

// Interpolation: stop ramps keep it on the slot; point fields keep it inside their own point-gradient record.
export function AssignSlotInterp(Doc, LayerId, Slot, Interp) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    if ((H[K.Mode] || "solid") === "point") {
      const G = normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], D.size || ARTWORK_SIZE);
      const V = normalizeGradientInterp(Interp, true);
      if (V === "gaussian") delete G.interp; else G.interp = V;
      H[K.Point] = G;
    } else H[K.Interp] = normalizeGradientInterp(Interp);
  });
}

// Each shape carries the ramp ("shape") or one ramp crosses the whole canvas ("scene"); anchors stay put on the canvas.
export function AssignSlotSpace(Doc, LayerId, Slot, Space) {
  return Edit(Doc, (D) => {
    const L = FindLayer(D, LayerId), K = SLOT[Slot];
    if (Slot === "ground" || !L || L.kind === "gradient" || !K) return;
    const H = L.shape, Mode = H[K.Mode] || "solid", Size = D.size || ARTWORK_SIZE;
    if (Mode !== "linear" && Mode !== "radial") return;
    const From = H[K.Place]?.space === "scene" ? "scene" : "shape";
    if (From === Space) return;
    const T = L.transform, W = Math.max(1, T.width), Hh = Math.max(1, T.height), R = ((T.rotation || 0) * Math.PI) / 180;
    const P = gradientPlacement(Mode, H[K.Place], H[K.Angle] ?? 45, From === "scene" ? Size : W, From === "scene" ? Size : Hh);
    const ToDoc = (Q) => (From === "scene" ? [Size * (0.5 + Q[0]), Size * (0.5 + Q[1])] : [T.x + Q[0] * W * Math.cos(R) - Q[1] * Hh * Math.sin(R), T.y + Q[0] * W * Math.sin(R) + Q[1] * Hh * Math.cos(R)]);
    const FromDoc = (X) => {
      if (Space === "scene") return [X[0] / Size - 0.5, X[1] / Size - 0.5];
      const Dx = X[0] - T.x, Dy = X[1] - T.y;
      return [(Dx * Math.cos(-R) - Dy * Math.sin(-R)) / W, (Dx * Math.sin(-R) + Dy * Math.cos(-R)) / Hh];
    };
    const Round = (Q) => Q.map((V) => Math.round(V * 10000) / 10000);
    H[K.Place] = { a: Round(FromDoc(ToDoc(P.a))), b: Round(FromDoc(ToDoc(P.b))), ...(Space === "scene" ? { space: "scene" } : {}) };
  });
}

// Back to the angle-driven layout (linear / radial) — drops the viewport placement.
export function ResetSlotPlace(Doc, LayerId, Slot) {
  return Edit(Doc, (D) => { const H = SlotHost(D, LayerId, Slot); if (H) delete H[SLOT[Slot].Place]; });
}

// Point-field colours, base colour and spread (the points themselves are placed on the TextureStudio canvas).
export function AssignPointColour(Doc, LayerId, Slot, Index, Hex) {
  if (!HEX.test(Hex)) return Doc;
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    const G = normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], D.size || ARTWORK_SIZE);
    if (G.points[Index]) G.points[Index].color = Hex.toLowerCase();
    H[K.Point] = G;
  });
}
export function AssignPointField(Doc, LayerId, Slot, Key, Value) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    const G = normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], D.size || ARTWORK_SIZE);
    if (Key === "falloff" && Number.isFinite(+Value)) G.falloff = Clamp(+Value, 0.2, 3);
    if (Key === "background" && HEX.test(Value)) G.background = Value.toLowerCase();
    H[K.Point] = G;
  });
}
const POINT_PALETTE = ["#eff4cf", "#e8c27a", "#5a7692", "#c87849", "#699c8c", "#d890a8", "#8fb8de"];
export function PointCount(Doc, LayerId, Slot, Add) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    const Size = D.size || ARTWORK_SIZE;
    const G = normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], Size);
    if (Add && G.points.length < 12) {
      const N = G.points.length, A = (N * 2.399963) % (Math.PI * 2);
      G.points.push({ id: `pg_${Date.now().toString(36)}_${N}`, x: Size * (0.5 + Math.cos(A) * 0.28), y: Size * (0.5 + Math.sin(A) * 0.28), color: POINT_PALETTE[N % POINT_PALETTE.length], radius: Math.round(Size * 0.42), weight: 1 });
    } else if (!Add && G.points.length > 1) G.points.pop();
    H[K.Point] = G;
  });
}

function WriteStops(H, K, Stops) {
  const N = normalizeGradientStops(Stops, H[K.A], H[K.B]);
  H[K.Stops] = N;
  H[K.A] = N[0].color;
  H[K.B] = N.at(-1).color;
}

export function SetSlotMode(Doc, LayerId, Slot, Mode) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    H[K.Mode] = Mode;
    if (Mode !== "solid" && (!Array.isArray(H[K.Stops]) || H[K.Stops].length < 2)) WriteStops(H, K, null);
    if (Mode === "point") H[K.Point] = normalizePointGradient2D(H[K.Point], H[K.A], H[K.B], D.size || ARTWORK_SIZE);
  });
}

export function SetSlotColour(Doc, LayerId, Slot, Index, Hex) {
  if (!HEX.test(Hex)) return Doc;
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    const Stops = normalizeGradientStops(H[K.Stops], H[K.A], H[K.B]);
    if (Index === "solid" || (H[K.Mode] || "solid") === "solid") { Stops[0] = { ...Stops[0], color: Hex.toLowerCase() }; WriteStops(H, K, Stops); H[K.A] = Hex.toLowerCase(); return; }
    if (Stops[Index]) Stops[Index] = { ...Stops[Index], color: Hex.toLowerCase() };
    WriteStops(H, K, Stops);
  });
}

export function SetSlotAngle(Doc, LayerId, Slot, Angle) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    H[K.Angle] = Clamp(+Angle, -180, 360);
    // A placed linear ramp turns about its midpoint and keeps its length.
    const P = H[K.Place];
    if (P?.a && P?.b && (H[K.Mode] || "solid") === "linear") {
      const Mx = (P.a[0] + P.b[0]) / 2, My = (P.a[1] + P.b[1]) / 2, Len = Math.hypot(P.b[0] - P.a[0], P.b[1] - P.a[1]) / 2;
      const R = (H[K.Angle] * Math.PI) / 180, Cx = Math.cos(R) * Len, Cy = Math.sin(R) * Len;
      H[K.Place] = { ...P, a: [Mx - Cx, My - Cy], b: [Mx + Cx, My + Cy] };
    }
  });
}

// Adds a stop between the last two (keeps both ends), or removes the stop before the last.
export function SlotStops(Doc, LayerId, Slot, Add) {
  return Edit(Doc, (D) => {
    const H = SlotHost(D, LayerId, Slot), K = SLOT[Slot];
    if (!H) return;
    const Stops = normalizeGradientStops(H[K.Stops], H[K.A], H[K.B]);
    if (Add && Stops.length < 12) {
      const A = Stops.at(-2), B = Stops.at(-1);
      Stops.splice(Stops.length - 1, 0, { color: MixHex(A.color, B.color, 0.5), offset: (A.offset + B.offset) / 2 });
    } else if (!Add && Stops.length > 2) Stops.splice(Stops.length - 2, 1);
    WriteStops(H, K, Stops);
  });
}

// ---- surface
export function SetFinish(Doc, LayerId, Finish) {
  const Preset = ARTWORK_FINISHES[Finish];
  if (!Preset) return Doc;
  return EditLayer(Doc, LayerId, (L) => {
    ensureArtworkLayerSurface(L);
    Object.assign(L.surface, { finish: Finish, roughness: Preset.roughness, metalness: Preset.metalness, height: Preset.height });
  });
}
export function SetChannelOn(Doc, LayerId, Key, On) {
  return EditLayer(Doc, LayerId, (L) => {
    ensureArtworkLayerSurface(L);
    setArtworkLayerPbrMask(L, { ...L.surface.channels, [Key]: !!On });
  });
}
export function SetChannelValue(Doc, LayerId, Key, Value) {
  return EditLayer(Doc, LayerId, (L) => { setArtworkChannelValue(L, Key, Value); });
}
export const ChannelValue = (Layer, Key) => getArtworkChannelValue(Layer, Key);

// ------------------------------------------------------------------------------------------------ editor schemas
// The knobs each modifier exposes.  T: r = range, c = colour, s = switch, o = options ([label, value] pairs).
const O = (...Pairs) => Pairs;
export const MODIFIER_FIELDS = Object.freeze({
  "noise-scale": [
    { Key: "noiseType", Label: "Noise", T: "o", Options: O(["FBM", "fbm"], ["Perlin", "perlin"], ["Worley", "worley"], ["Ridged", "ridged"], ["Radial", "radial"]) },
    { Key: "target", Label: "Modulates", T: "o", Options: O(["Scale + colour", "scale-color"], ["Scale", "scale"], ["Scale + opacity", "scale-opacity"], ["Scale + relief", "scale-height"]) },
    { Key: "minScale", Label: "Min scale", T: "r", Min: 0.05, Max: 2, Step: 0.01, Unit: "×" },
    { Key: "maxScale", Label: "Max scale", T: "r", Min: 0.2, Max: 3, Step: 0.01, Unit: "×" },
    { Key: "frequency", Label: "Frequency", T: "r", Min: 0.5, Max: 14, Step: 0.25 },
    { Key: "octaves", Label: "Octaves", T: "r", Min: 1, Max: 6, Step: 1 },
    { Key: "contrast", Label: "Contrast", T: "r", Min: 0.2, Max: 3, Step: 0.05 },
    { Key: "dropoutThreshold", Label: "Dropout", T: "r", Min: 0, Max: 0.9, Step: 0.01 },
    { Key: "seed", Label: "Seed", T: "r", Min: 0, Max: 9999, Step: 1, Seed: true },
    { Key: "colorB", Label: "Colour B", T: "c", When: (M) => M.target === "scale-color" },
    { Key: "invert", Label: "Invert field", T: "s" },
  ],
  "array-grid": [
    { Key: "layout", Label: "Lattice", T: "o", Options: O(["Grid", "grid"], ["Brick", "brick"], ["Hex", "hex"], ["Drop", "half-drop"]) },
    { Key: "columns", Label: "Columns", T: "r", Min: 1, Max: 32, Step: 1 },
    { Key: "rows", Label: "Rows", T: "r", Min: 1, Max: 32, Step: 1 },
    { Key: "spanX", Label: "Span X", T: "r", Min: 32, Max: 1024, Step: 8, Unit: "px" },
    { Key: "spanY", Label: "Span Y", T: "r", Min: 32, Max: 1024, Step: 8, Unit: "px" },
    { Key: "alternateRotate", Label: "Alt rotate", T: "r", Min: 0, Max: 180, Step: 1, Unit: "°" },
    { Key: "alternateColor", Label: "Alternate colour", T: "s" },
    { Key: "colorB", Label: "Alt colour", T: "c", When: (M) => M.alternateColor },
  ],
  "array-radial": [
    { Key: "count", Label: "Count", T: "r", Min: 2, Max: 48, Step: 1 },
    { Key: "rings", Label: "Rings", T: "r", Min: 1, Max: 6, Step: 1 },
    { Key: "radius", Label: "Radius", T: "r", Min: 8, Max: 256, Step: 1, Unit: "px" },
    { Key: "ringStep", Label: "Ring step", T: "r", Min: 8, Max: 160, Step: 1, Unit: "px" },
    { Key: "startAngle", Label: "Start", T: "r", Min: -180, Max: 180, Step: 1, Unit: "°" },
    { Key: "sweep", Label: "Sweep", T: "r", Min: 10, Max: 360, Step: 1, Unit: "°" },
    { Key: "scaleDecay", Label: "Ring scale", T: "r", Min: 0.3, Max: 1.5, Step: 0.01, Unit: "×" },
    { Key: "alignTangent", Label: "Align to tangent", T: "s" },
  ],
  mirror: [
    { Key: "axis", Label: "Axis", T: "o", Options: O(["X", "x"], ["Y", "y"], ["Quad", "xy"], ["Diagonal", "diag"]) },
    { Key: "pivotX", Label: "Pivot X", T: "r", Min: 0, Max: 512, Step: 1, Unit: "px" },
    { Key: "pivotY", Label: "Pivot Y", T: "r", Min: 0, Max: 512, Step: 1, Unit: "px" },
  ],
  "inset-echo": [
    { Key: "copies", Label: "Copies", T: "r", Min: 1, Max: 10, Step: 1 },
    { Key: "stepPx", Label: "Inset step", T: "r", Min: 2, Max: 120, Step: 1, Unit: "px" },
    { Key: "opacityDecay", Label: "Fade", T: "r", Min: 0, Max: 0.5, Step: 0.01 },
    { Key: "heightDecay", Label: "Relief step", T: "r", Min: 0, Max: 0.5, Step: 0.01 },
    { Key: "alternateColor", Label: "Alternate colour", T: "s" },
    { Key: "colorB", Label: "Alt colour", T: "c", When: (M) => M.alternateColor },
  ],
  "noise-jitter": [
    { Key: "posJitter", Label: "Offset", T: "r", Min: 0, Max: 120, Step: 1, Unit: "px" },
    { Key: "rotJitter", Label: "Rotation", T: "r", Min: 0, Max: 180, Step: 1, Unit: "°" },
    { Key: "scaleJitter", Label: "Scale", T: "r", Min: 0, Max: 1, Step: 0.01 },
    { Key: "dropout", Label: "Dropout", T: "r", Min: 0, Max: 0.9, Step: 0.01 },
    { Key: "seed", Label: "Seed", T: "r", Min: 0, Max: 9999, Step: 1, Seed: true },
  ],
  warp: [
    { Key: "warpType", Label: "Warp", T: "o", Options: O(["Wave", "wave"], ["Swirl", "swirl"], ["Curl", "curl"], ["Pinch", "pinch"]) },
    { Key: "amplitude", Label: "Amplitude", T: "r", Min: 0, Max: 160, Step: 1, Unit: "px" },
    { Key: "frequency", Label: "Frequency", T: "r", Min: 0.25, Max: 10, Step: 0.25 },
    { Key: "seed", Label: "Seed", T: "r", Min: 0, Max: 9999, Step: 1, Seed: true },
  ],
  "edge-wear": [
    { Key: "chipAmount", Label: "Chipping", T: "r", Min: 0, Max: 0.95, Step: 0.01 },
    { Key: "chipScale", Label: "Chip scale", T: "r", Min: 2, Max: 48, Step: 1 },
    { Key: "bevelHeight", Label: "Bevel", T: "r", Min: 0, Max: 1, Step: 0.01 },
    { Key: "outlineWidth", Label: "Outline", T: "r", Min: 0, Max: 16, Step: 0.5, Unit: "px" },
    { Key: "seed", Label: "Seed", T: "r", Min: 0, Max: 9999, Step: 1, Seed: true },
    { Key: "outlineColor", Label: "Outline colour", T: "c", When: (M) => M.outlineWidth > 0 },
  ],
});
export const MODIFIER_GLYPH = Object.freeze({ "noise-scale": "noise", "array-grid": "grid", "array-radial": "radial", mirror: "mirror", "inset-echo": "echo", "noise-jitter": "scatter", warp: "warp", "edge-wear": "wear" });

// Shape-specific parameters (only the ones the engine reads for that motif).
export const SHAPE_FIELDS = Object.freeze({
  ring: [{ Key: "innerRatio", Label: "Inner ratio", Min: 0.1, Max: 0.92, Step: 0.01 }],
  arc: [{ Key: "innerRatio", Label: "Inner ratio", Min: 0.2, Max: 0.85, Step: 0.01 }],
  star: [{ Key: "points", Label: "Points", Min: 3, Max: 16, Step: 1 }, { Key: "innerRatio", Label: "Inner ratio", Min: 0.15, Max: 0.85, Step: 0.01 }],
  cross: [{ Key: "innerRatio", Label: "Arm width", Min: 0.1, Max: 0.8, Step: 0.01 }],
  roundedRect: [{ Key: "cornerRadius", Label: "Corner", Min: 0, Max: 1, Step: 0.01 }],
  hexagon: [{ Key: "sides", Label: "Sides", Min: 3, Max: 12, Step: 1 }],
  gear: [{ Key: "points", Label: "Teeth", Min: 6, Max: 20, Step: 1 }, { Key: "innerRatio", Label: "Root", Min: 0.45, Max: 0.9, Step: 0.01 }],
});

// ------------------------------------------------------------------------------------------------ readouts
const MotifLabel = (Id) => MOTIF_TYPES.find((M) => M.id === Id)?.label || Id;
const Num = (V, D = 0) => (+V).toFixed(D);

export function ModifierReadout(M) {
  switch (M.type) {
    case "noise-scale": return `${(M.noiseType || "fbm").toUpperCase()} · ${Num(M.minScale, 2)}–${Num(M.maxScale, 2)}×`;
    case "array-grid": return `${{ grid: "Grid", brick: "Brick", hex: "Hex", "half-drop": "Drop" }[M.layout] || "Grid"} ${M.columns}×${M.rows}`;
    case "array-radial": return `${M.count} × ${M.rings} ring${M.rings > 1 ? "s" : ""} · r${Math.round(M.radius)}`;
    case "mirror": return { x: "Mirror X", y: "Mirror Y", xy: "Quad", diag: "Diagonal" }[M.axis] || "Mirror";
    case "inset-echo": return `${M.copies} copies · ${Math.round(M.stepPx)} px`;
    case "noise-jitter": return `±${Math.round(M.posJitter)} px · ±${Math.round(M.rotJitter)}°${M.dropout > 0 ? ` · ${Math.round(M.dropout * 100)}% out` : ""}`;
    case "warp": return `${(M.warpType || "wave")[0].toUpperCase()}${(M.warpType || "wave").slice(1)} · ${Math.round(M.amplitude)} px`;
    case "edge-wear": return `Chip ${Math.round((M.chipAmount || 0) * 100)}% · bevel ${Num(M.bevelHeight, 2)}`;
    default: return M.type;
  }
}

function SlotText(S) {
  if (!S) return "—";
  if (S.Mode === "solid") return S.Colour.toUpperCase();
  if (S.Mode === "point") return `Point field`;
  return `${S.Mode === "linear" ? "Linear" : "Radial"} · ${S.Stops.length} stops`;
}
export function SlotCss(S) {
  if (!S) return "#2a2a2a";
  if (S.Mode === "solid") return S.Colour;
  const Stops = S.Stops.map((E) => `${E.color} ${(E.offset * 100).toFixed(0)}%`).join(", ");
  return S.Mode === "radial" || S.Mode === "point" ? `radial-gradient(circle, ${Stops})` : `linear-gradient(${(S.Angle || 0) + 90}deg, ${Stops})`;
}

// The quiet property rows of the selected layer, in display order.  Each is { Id, Label, Hint, Text, Glyph }.
export function LayerRows(Doc, Layer) {
  if (!Layer || Layer.kind === "folder") return [];
  const Rows = [];
  const Fill = SlotState(Doc, Layer.id, "fill"), Stroke = SlotState(Doc, Layer.id, "stroke");
  const T = Layer.transform, Surf = ensureArtworkLayerSurface(structuredClone(Layer));
  const On = ARTWORK_PBR_CHANNELS.filter((C) => Surf.channels[C.key]).length;
  if (Layer.kind === "motif") Rows.push({ Id: "shape", Label: "Shape", Hint: "Motif primitive", Glyph: "shape", Text: MotifLabel(Layer.shape.motifType) });
  if (Layer.kind === "text") Rows.push({ Id: "text", Label: "Text", Hint: "Lettering", Glyph: "text", Text: `“${String(Layer.text.value).slice(0, 14)}” · ${Math.round(Layer.text.fontSize)} px` });
  Rows.push({ Id: "fill", Label: "Fill", Hint: Layer.kind === "gradient" ? "Wash colours" : "Albedo source", Glyph: "fill", Text: Layer.kind === "motif" && Layer.shape.fillEnabled === false ? "Off" : SlotText(Fill), Swatch: Layer.shape.fillEnabled === false ? null : SlotCss(Fill) });
  if (Layer.kind !== "gradient") Rows.push({ Id: "stroke", Label: "Outline", Hint: "Contour stroke", Glyph: "stroke", Text: (Layer.shape.strokeWidth || 0) > 0 ? `${Num(Layer.shape.strokeWidth, Layer.shape.strokeWidth % 1 ? 1 : 0)} px · ${SlotText(Stroke)}` : "None", Swatch: (Layer.shape.strokeWidth || 0) > 0 ? SlotCss(Stroke) : null });
  Rows.push({ Id: "place", Label: "Placement", Hint: "Position · size · turn", Glyph: "move", Text: `${Math.round(T.x)}, ${Math.round(T.y)} · ${Math.round(T.width)}×${Math.round(T.height)}${T.rotation ? ` · ${Math.round(T.rotation)}°` : ""}` });
  Rows.push({ Id: "blend", Label: "Blend", Hint: "Compositing", Glyph: "blend", Text: `${Layer.blend || "Normal"} · ${Math.round((Layer.opacity ?? 1) * 100)}%` });
  Rows.push({ Id: "surface", Label: "Surface", Hint: "PBR channels", Glyph: "layers", Text: `${ARTWORK_FINISHES[Surf.finish]?.label || "Custom"} · ${On} ch` });
  Rows.push({ Id: "mask", Label: "Mask", Hint: "Layer cut-out", Glyph: "mask", Text: Layer.mask?.enabled ? `${(Layer.mask.mode || "noise")[0].toUpperCase()}${(Layer.mask.mode || "noise").slice(1)} · ${Math.round((Layer.mask.threshold ?? 0.45) * 100)}%${Layer.mask.invert ? " · inv" : ""}` : "Off" });
  return Rows;
}

export function LayerCaption(Layer) {
  if (Layer.kind === "folder") return "GROUP";
  const Mods = (Layer.modifiers || []).filter((M) => M.enabled !== false).length;
  const Head = Layer.kind === "motif" ? MotifLabel(Layer.shape.motifType) : Layer.kind === "text" ? "Text" : Layer.kind === "gradient" ? "Wash" : "Image";
  return `${Head.toUpperCase()}${Mods ? ` · ${Mods} MOD` : ""}`;
}

export function LayerColour(Layer) {
  if (Layer.kind === "folder") return "#6a6a6a";
  const S = Layer.shape || {};
  return HEX.test(S.color) ? S.color : "#9a9a9a";
}

// ------------------------------------------------------------------------------------------------ statistics
function HexRgb(Hex) { const H = HEX.test(Hex) ? Hex.slice(1) : "808080"; return [0, 2, 4].map((I) => parseInt(H.slice(I, I + 2), 16)); }
function MixHex(A, B, T) { const X = HexRgb(A), Y = HexRgb(B); return "#" + X.map((V, I) => Math.round(V + (Y[I] - V) * T).toString(16).padStart(2, "0")).join(""); }
const Luma = (Hex) => { const [R, G, B] = HexRgb(Hex); return (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255; };

const VisibleLayers = (Doc) => {
  const Folders = new Map(Doc.layers.filter((L) => L.kind === "folder").map((F) => [F.id, F]));
  const Vis = (L) => L.visible !== false && (!L.parentId || !Folders.has(L.parentId) || Vis(Folders.get(L.parentId)));
  return Doc.layers.filter((L) => L.kind !== "folder" && Vis(L));
};

// The authored palette: every colour a visible layer can put on the tile (fill stops, outline, modifier colour B, ground),
// near-duplicates merged.  Contrast is the luminance spread between its darkest and lightest entry.
export function Palette(Doc) {
  const Out = [];
  const Push = (C) => { if (!HEX.test(C)) return; const c = C.toLowerCase(), [R, G, B] = HexRgb(c); if (!Out.some((E) => { const [r, g, b] = HexRgb(E); return Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < 18; })) Out.push(c); };
  if (Doc.background?.enabled) { Push(Doc.background.color); if ((Doc.background.fillMode || "solid") !== "solid") Push(Doc.background.colorB); }
  for (const L of VisibleLayers(Doc)) {
    const F = SlotState(Doc, L.id, "fill");
    if (L.shape?.fillEnabled !== false && F) (F.Mode === "solid" ? [F.Colour] : F.Stops.map((S) => S.color)).forEach(Push);
    if ((L.shape?.strokeWidth || 0) > 0) { const S = SlotState(Doc, L.id, "stroke"); (S.Mode === "solid" ? [S.Colour] : S.Stops.map((E) => E.color)).forEach(Push); }
    for (const M of (L.modifiers || []).filter((E) => E.enabled !== false)) {
      if (M.type === "noise-scale" && M.target === "scale-color") Push(M.colorB);
      if ((M.type === "array-grid" || M.type === "inset-echo") && M.alternateColor) Push(M.colorB);
      if (M.type === "edge-wear" && M.outlineWidth > 0) Push(M.outlineColor);
    }
  }
  const L = Out.map(Luma);
  return { Colours: Out, Contrast: Out.length > 1 ? Math.max(...L) - Math.min(...L) : 0 };
}

// Instance count per visible layer, motif coverage of the tile, edge behaviour (pattern: instances that wrap across the
// seam; stamp: clearance to the decal border, negative when something is clipped), palette, evaluation cost.
export function Stats(Doc, { Resolution = 96 } = {}) {
  const T0 = (globalThis.performance || Date).now();
  const Size = Doc.size || ARTWORK_SIZE;
  const PerLayer = [];
  let Wraps = 0, Margin = Infinity, Total = 0;
  for (const L of VisibleLayers(Doc)) {
    let Insts = [];
    try { Insts = evaluateLayerInstances(L, Size, Doc.mode); } catch { Insts = []; }
    PerLayer.push({ Id: L.id, Name: L.name, Count: Insts.length, Colour: LayerColour(L) });
    Total += Insts.length;
    if (L.kind === "gradient") continue;
    for (const I of Insts) {
      const A = ((I.rotation || 0) * Math.PI) / 180, C = Math.abs(Math.cos(A)), S = Math.abs(Math.sin(A));
      const Hx = (I.width * C + I.height * S) / 2, Hy = (I.width * S + I.height * C) / 2;
      const Edge = Math.min(I.x - Hx, I.y - Hy, Size - (I.x + Hx), Size - (I.y + Hy));
      if (Edge < 0) Wraps++;
      Margin = Math.min(Margin, Edge);
    }
  }
  // Coverage of the motifs alone — the ground fill would read 100 % on every pattern.
  let Coverage = 0;
  try {
    const Bare = { ...Doc, background: { ...Doc.background, enabled: false } };
    const R = evaluateArtworkDocument(Bare, Resolution, { headless: true });
    let Opaque = 0;
    for (let I = 0; I < R.coverage.length; I++) if (R.coverage[I] > 18) Opaque++;
    Coverage = Opaque / R.coverage.length;
  } catch { Coverage = 0; }
  const Pal = Palette(Doc);
  return {
    Instances: Total, PerLayer, Layers: PerLayer.length,
    Coverage, Wraps, Margin: Number.isFinite(Margin) ? Margin : Size / 2, Clipped: Doc.mode === "stamp" && Margin < -0.5,
    Palette: Pal.Colours, Contrast: Pal.Contrast,
    Milliseconds: (globalThis.performance || Date).now() - T0,
  };
}
