// PaintModel.js — the Texture Paint document the Paint page edits (pure data, no DOM).
//
// Layers are TextureStudio's own: every layer is built by createPaintLayer and the starter by createPaintDocument
// (TextureStudio/Engine/TexturePaintEngine.js, imported — not copied), so a document saved here has the engine's
// "frontier.texture-paint.v2" shape and opens in the Texture Paint workspace.  This file only adds what a card needs:
//   · Serialise / Normalise (strip and rebuild pixel buffers and stamp rasters — the card holds no texels),
//   · the layer tree (top-first order, folders via parentId), edits (add · duplicate · remove · move · rename · mask),
//   · the layer ⇄ ChannelStack mapping (channels / channelOpacity / channelBlends + the kind's own channel values).
//
//   Create() · Normalise(raw) · Serialise(P) · Export(P) · Load(text)
//   Layer(P, Id) · TopFirst(P, EnclosingId) · Depth(P, Id) · Descends(P, Id, OuterId)
//   AddLayer(P, Type) → { Next, Id } · Duplicate(P, Id) → { Next, Id } · Remove(P, Id) · Move(P, Drag, Target, Where)
//   Edit(P, Id, Patch | Fn) · Select(P, Id) · AssignMask(P, Id, On) · UseMaterial(P, Id, PresetId)
//   LayerCard(L) · LayerStack(L) → { on, per } · AssignLayerStack(P, Id, Full) · AssignChannelField(P, Id, Ch, Key, Raw)
//   Painted(P) → channel ids written by visible layers · Stats(P)

import { createPaintLayer, createPaintDocument, createMaterialLayerOverridesFromPreset, PAINT_BLENDS, PAINT_MESH_PRESETS } from "../TextureStudio/Engine/TexturePaintEngine.js";
import { materials as MATERIALS } from "../TextureStudio/Engine/Materials/materials.js";
import { PAINT_CHANNELS, PAINT_CHANNEL, FromEngine, ToEngine, AssignStackField } from "../MaterialInspector/ChannelStack.js";

export { PAINT_CHANNELS, PAINT_CHANNEL, MATERIALS };
export const SCHEMA = "frontier.texture-paint.v2";
export const STORAGE_KEY = "frontier.paint-inspector.v1";
export const RES = 4;   // the card holds no texels; the host's paint engine owns full-resolution buffers

export const LAYER_TYPES = Object.freeze([
  { Id: "paint", Label: "Paint", Icon: "brush", Hint: "Hand-painted texels" },
  { Id: "fill", Label: "Fill", Icon: "fill", Hint: "Flat colour and channel values" },
  { Id: "material", Label: "Material", Icon: "material", Hint: "A Frontier material preset" },
  { Id: "decal", Label: "Stamp", Icon: "stamp", Hint: "Decal stamps placed on the surface" },
  { Id: "text", Label: "Text", Icon: "text", Hint: "Lettering stamped into the texture" },
  { Id: "generator", Label: "Generator", Icon: "noise", Hint: "Procedural wear, dirt and dust" },
  { Id: "folder", Label: "Folder", Icon: "folder", Hint: "Groups layers" },
]);
export const LAYER_TYPE = Object.freeze(Object.fromEntries(LAYER_TYPES.map((K) => [K.Id, K])));
export const LAYER_TONES = Object.freeze({ paint: "#ff6b9a", fill: "#4d9bff", material: "#46d267", decal: "#36d3c4", text: "#f08cff", generator: "#ffb238", folder: "#9aa4b2" });
export const BLENDS = Object.freeze([...PAINT_BLENDS]);
export const CHANNEL_BLENDS = Object.freeze(["Inherit", ...PAINT_BLENDS]);
export const GENERATORS = Object.freeze([["Edge wear", "edge-wear"], ["Crevice dirt", "crevice-dirt"], ["Top dust", "top-dust"], ["Grunge", "triplanar-grunge"]]);
export const MASK_PRESETS = Object.freeze([["Manual paint", "none"], ...GENERATORS]);
export const MESHES = PAINT_MESH_PRESETS;

const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
const Num = (V, D) => (Number.isFinite(+V) ? +V : D);

// ------------------------------------------------------------------------------------------------ document
// The engine's starter (Base Ceramic Coat + Hand Painted Layer) plus a few layers so every kind is on show.
export function Create() {
  const Doc = createPaintDocument(RES);
  const [Coat, Hand] = Doc.layers;
  const Details = createPaintLayer("folder", { res: RES, name: "Details" });
  const Wear = createPaintLayer("generator", { res: RES, name: "Edge Wear", opacity: 0.8, mask: { preset: "edge-wear" } });
  const Logo = createPaintLayer("text", { res: RES, parentId: Details.id, text: { content: "FRONTIER" } });
  const Seal = createPaintLayer("decal", { res: RES, parentId: Details.id, name: "Warning Seal" });
  Hand.channels = { ...Hand.channels, emissive: true };
  return Normalise({ ...Doc, layers: [Coat, Wear, Hand, Details, Seal, Logo], selectedLayerId: Hand.id });
}

function Rehydrate(L) {
  const Layer = createPaintLayer(L.kind, { ...L, res: RES, pixels: undefined });
  Layer.blend = BLENDS.includes(Layer.blend) ? Layer.blend : "Normal";
  Layer.opacity = Clamp(Num(Layer.opacity, 1), 0, 1);
  for (const C of PAINT_CHANNELS) {
    Layer.channels[C.Id] = !!Layer.channels[C.Id];
    Layer.channelOpacity[C.Id] = Clamp(Num(Layer.channelOpacity[C.Id], 1), 0, 1);
    if (!CHANNEL_BLENDS.includes(Layer.channelBlends[C.Id])) Layer.channelBlends[C.Id] = "Inherit";
  }
  if (Layer.mask) Layer.mask = { opacity: Clamp(Num(Layer.mask.opacity, 1), 0, 1), invert: !!Layer.mask.invert, enabled: Layer.mask.enabled !== false, preset: MASK_PRESETS.some(([, V]) => V === Layer.mask.preset) ? Layer.mask.preset : "none" };
  return Layer;
}

export function Normalise(Raw) {
  if (!Raw || typeof Raw !== "object" || !Array.isArray(Raw.layers)) throw new Error("Not a texture paint document");
  const Seen = new Set();
  const Layers = Raw.layers.filter((L) => L && LAYER_TYPE[L.kind]).slice(0, 200).map((L) => {
    const Layer = Rehydrate(L);
    while (Seen.has(Layer.id)) Layer.id = `${Layer.id}~`;
    Seen.add(Layer.id);
    return Layer;
  });
  if (!Layers.length) Layers.push(Rehydrate(createPaintLayer("paint", { res: RES })));   // a document always holds a layer
  // A parent must be an existing folder, and never the layer itself or one of its descendants.
  const Folders = new Set(Layers.filter((L) => L.kind === "folder").map((L) => L.id));
  for (const L of Layers) if (L.parentId && (!Folders.has(L.parentId) || L.parentId === L.id)) L.parentId = null;
  for (const L of Layers) { let At = L.parentId, Guard = 0; while (At && Guard++ < 64) { if (At === L.id) { L.parentId = null; break; } At = Layers.find((E) => E.id === At)?.parentId; } }
  return {
    schema: SCHEMA,
    name: String(Raw.name || "Teapot Paint").replace(/[\u0000-\u001f]/g, "").slice(0, 80) || "Teapot Paint",
    resolution: [512, 1024, 2048, 4096].includes(+Raw.resolution) ? +Raw.resolution : 512,
    meshId: MESHES.some((M) => M.id === Raw.meshId) ? Raw.meshId : "teapot",
    layers: Layers,
    selectedLayerId: Layers.some((L) => L.id === Raw.selectedLayerId) ? Raw.selectedLayerId : Layers.at(-1)?.id || null,
    editingMask: !!Raw.editingMask,
    bakedMaps: null,
  };
}

// Pixel buffers and stamp rasters are the paint engine's; the document keeps everything that describes a layer.
export function Serialise(P) {
  return {
    ...P,
    layers: P.layers.map((L) => ({ ...L, pixels: null, decal: { ...L.decal, stampMaps: null }, stamps: L.stamps.map((S) => ({ ...S, stampData: null })) })),
  };
}
export const Export = (P) => JSON.stringify(Serialise(P), null, 2);
export function Load(Text) {
  const Raw = JSON.parse(Text);
  if (Raw.schema && Raw.schema !== SCHEMA) throw new Error(`Unsupported schema ${Raw.schema}`);
  return Normalise(Raw);
}

// ------------------------------------------------------------------------------------------------ tree
export const Layer = (P, Id) => P.layers.find((L) => L.id === Id) || null;
export const Selected = (P) => Layer(P, P.selectedLayerId);
// Layers are stored bottom-to-top (compositing order); the outliner lists them top-first.
export const TopFirst = (P, EnclosingId = null) => P.layers.filter((L) => (L.parentId || null) === EnclosingId).reverse();
export function Depth(P, Id) { let D = 0, At = Layer(P, Id)?.parentId; while (At && D < 16) { D++; At = Layer(P, At)?.parentId; } return D; }
export function Descends(P, Id, OuterId) { let At = Layer(P, Id)?.parentId, Guard = 0; while (At && Guard++ < 64) { if (At === OuterId) return true; At = Layer(P, At)?.parentId; } return false; }
export const Effective = (P, L) => { let Vis = L.visible, At = L.parentId; while (At && Vis) { const F = Layer(P, At); Vis = !!F?.visible; At = F?.parentId; } return Vis; };

// ------------------------------------------------------------------------------------------------ edits
const Replace = (P, Id, Next) => ({ ...P, layers: P.layers.map((L) => (L.id === Id ? Next : L)) });
export function Edit(P, Id, Patch) {
  const L = Layer(P, Id);
  if (!L) return P;
  const Delta = typeof Patch === "function" ? Patch(L) : Patch;
  return Replace(P, Id, Rehydrate({ ...L, ...Delta }));
}
export const Select = (P, Id) => (Layer(P, Id) ? { ...P, selectedLayerId: Id } : P);
export const Rename = (P, Id, Name) => Edit(P, Id, { name: String(Name).replace(/[\u0000-\u001f]/g, "").slice(0, 80) || Layer(P, Id).name });

// New layers land above the selection (inside it when the selection is a folder).
export function AddLayer(P, Type) {
  const Sel = Selected(P);
  const EnclosingId = Sel?.kind === "folder" ? Sel.id : Sel?.parentId || null;
  const New = Rehydrate(createPaintLayer(Type, { res: RES, parentId: EnclosingId }));
  const At = Sel ? P.layers.indexOf(Sel) + 1 : P.layers.length;
  const Layers = [...P.layers];
  Layers.splice(At, 0, New);
  return { Next: { ...P, layers: Layers, selectedLayerId: New.id }, Id: New.id };
}

export function Duplicate(P, Id) {
  const L = Layer(P, Id);
  if (!L) return { Next: P, Id };
  const Copy = Rehydrate({ ...structuredClone(Serialise({ ...P, layers: [L] }).layers[0]), id: undefined, name: `${L.name} copy`.slice(0, 80) });
  const Layers = [...P.layers];
  Layers.splice(P.layers.indexOf(L) + 1, 0, Copy);
  return { Next: { ...P, layers: Layers, selectedLayerId: Copy.id }, Id: Copy.id };
}

// Removing a folder keeps its layers (they move up to the folder's parent).
export function Remove(P, Id) {
  const L = Layer(P, Id);
  if (!L || P.layers.length <= 1) return P;
  const Layers = P.layers.filter((E) => E.id !== Id).map((E) => (E.parentId === Id ? { ...E, parentId: L.parentId } : E));
  const Below = P.layers[P.layers.indexOf(L) - 1] || Layers.at(-1);
  return { ...P, layers: Layers, selectedLayerId: P.selectedLayerId === Id ? Below?.id || null : P.selectedLayerId };
}

// Drag in the top-first outliner: "before" = above the target, "after" = below it, "inside" = top of a folder.
export function Move(P, DragId, TargetId, Where) {
  const Drag = Layer(P, DragId), Target = Layer(P, TargetId);
  if (!Drag || !Target || DragId === TargetId || Descends(P, TargetId, DragId)) return P;
  if (Where === "inside" && Target.kind !== "folder") return P;
  const Rest = P.layers.filter((L) => L.id !== DragId);
  const Moved = { ...Drag, parentId: Where === "inside" ? Target.id : Target.parentId || null };
  let At = Rest.indexOf(Rest.find((L) => L.id === TargetId));
  if (Where === "before") At += 1;
  if (Where === "inside") { const Kids = Rest.filter((L) => L.parentId === Target.id); At = Kids.length ? Rest.indexOf(Kids.at(-1)) + 1 : At; }
  Rest.splice(At, 0, Moved);
  return { ...P, layers: Rest };
}

export const AssignMask = (P, Id, On) => Edit(P, Id, { mask: On ? { opacity: 1, invert: false, enabled: true, preset: "none" } : null });

export function UseMaterial(P, Id, PresetId) {
  const M = MATERIALS.find((E) => E.id === PresetId);
  if (!M) return P;
  const Ov = createMaterialLayerOverridesFromPreset(M, RES);
  return Edit(P, Id, (L) => ({ material: Ov.material, extValues: Ov.extValues, name: L.name === "Material Layer" || MATERIALS.some((E) => E.name === L.name) ? Ov.name : L.name }));
}

// ------------------------------------------------------------------------------------------------ channels
// Where a kind keeps its per-channel values: fill / material / generator hold colour + roughness / metalness / height +
// the extended values in their own block (the engine spreads createDefaultExtendedValues into each).  Paint layers keep
// texels; stamps and text take their values from the stamp — those kinds expose opacity and blend per channel only.
const VALUE_HOME = { fill: "fill", material: "material", generator: "generator" };
export const QueryLayerValues = (L) => !!VALUE_HOME[L?.kind];
const ReadValue = (L, Ch) => { const H = L[VALUE_HOME[L.kind]]; return Ch === "albedo" ? H.color : H[Ch]; };

export function LayerCard(L) {
  const Value = QueryLayerValues(L) ? [
    { K: "value", L: "Value", T: "slider", For: ["scalar"], Def: (Ch) => Ch.Def },
    { K: "value", L: "Colour", T: "colour", For: ["colour"], Def: (Ch) => Ch.Def },
  ] : [];
  return [
    ...Value,
    { K: "opacity", L: "Channel opacity", T: "slider", Def: 100, Hint: "Scales this channel only" },
    { K: "blend", L: "Channel blend", T: "select", Opts: CHANNEL_BLENDS, Def: "Inherit", Hint: "Inherit uses the layer blend" },
    ...(L?.kind === "paint" ? [{ K: "note", T: "note", Text: "Painted texels live in the layer; the brush decides what is written (Brush page → Materials)." }] : []),
    ...(L?.kind === "decal" || L?.kind === "text" ? [{ K: "note", T: "note", Text: "Values come from the stamp; this sets how much of it lands in the channel." }] : []),
  ];
}

export function LayerStack(L) {
  return {
    on: PAINT_CHANNELS.filter((C) => L.channels[C.Id]).map((C) => C.Id),
    per: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, {
      ...(QueryLayerValues(L) ? { value: FromEngine(C.Id, ReadValue(L, C.Id) ?? ToEngine(C.Id, C.Def)) } : {}),
      opacity: Math.round(L.channelOpacity[C.Id] * 100), blend: L.channelBlends[C.Id],
    }])),
  };
}

export function AssignLayerStack(P, Id, Full) {
  return Edit(P, Id, (L) => {
    const Patch = {
      channels: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, Full.on.includes(C.Id)])),
      channelOpacity: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, Clamp(Num(Full.per[C.Id]?.opacity, 100), 0, 100) / 100])),
      channelBlends: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, CHANNEL_BLENDS.includes(Full.per[C.Id]?.blend) ? Full.per[C.Id].blend : "Inherit"])),
    };
    if (QueryLayerValues(L)) {
      const Home = VALUE_HOME[L.kind], Block = { ...L[Home] }, Ext = { ...L.extValues };
      for (const C of PAINT_CHANNELS) {
        const V = Full.per[C.Id]?.value;
        if (V === undefined) continue;
        if (C.Id === "albedo") Block.color = V;
        else { Block[C.Id] = ToEngine(C.Id, V); if (C.Id in Ext) Ext[C.Id] = Block[C.Id]; }
      }
      Patch[Home] = Block;
      if (L.kind === "material") Patch.extValues = Ext;
    }
    return Patch;
  });
}

export function AssignChannelField(P, Id, Ch, Key, Raw) {
  const L = Layer(P, Id);
  if (!L || !PAINT_CHANNEL[Ch]) return P;
  return AssignLayerStack(P, Id, AssignStackField(LayerStack(L), Ch, Key, Raw, LayerCard(L)));
}

// ------------------------------------------------------------------------------------------------ statistics
export function Painted(P) {
  const On = new Set();
  for (const L of P.layers) if (L.kind !== "folder" && Effective(P, L)) for (const C of PAINT_CHANNELS) if (L.channels[C.Id]) On.add(C.Id);
  return PAINT_CHANNELS.map((C) => C.Id).filter((C) => On.has(C));
}
export function Stats(P) {
  const Content = P.layers.filter((L) => L.kind !== "folder");
  return {
    Layers: Content.length, Visible: Content.filter((L) => Effective(P, L)).length, Folders: P.layers.length - Content.length,
    Masks: P.layers.filter((L) => L.mask).length, Locked: P.layers.filter((L) => L.locked).length, Painted: Painted(P).length,
    Stamps: P.layers.reduce((A, L) => A + (L.kind === "decal" || L.kind === "text" ? L.stamps.length : 0), 0),
  };
}
export const MeshLabel = (P) => MESHES.find((M) => M.id === P.meshId)?.label || P.meshId;
export const PartOptions = (P) => [["All parts", -1], ...(MESHES.find((M) => M.id === P.meshId)?.parts || []).map((N, I) => [N, I])];
