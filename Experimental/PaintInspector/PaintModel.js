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
//   TypeOf(L) → LAYER_TYPE id (a paint layer holding a point gradient reads as "gradient")
//   Focus(L, Pick) → the point / stamp the values belong to · AddPoint · RemovePoint · EditPoint (gradient layers)
//   LayerCard(L) · LayerStack(L, Pick) → { on, per } · AssignLayerStack(P, Id, Full, Pick) · AssignChannelField(P, Id, Ch, Key, Raw, Pick)
//   Painted(P) → channel ids written by visible layers · Stats(P)

import { createPaintLayer, createPaintDocument, createMaterialLayerOverridesFromPreset, normalizePointGradient3D, fillPointGradientValues, PAINT_BLENDS, PAINT_MESH_PRESETS } from "../TextureStudio/Engine/TexturePaintEngine.js";
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
  { Id: "gradient", Label: "Gradient", Icon: "gradient", Hint: "Placed points, each with its own surface" },
  { Id: "folder", Label: "Folder", Icon: "folder", Hint: "Groups layers" },
]);
export const LAYER_TYPE = Object.freeze(Object.fromEntries(LAYER_TYPES.map((K) => [K.Id, K])));
export const LAYER_TONES = Object.freeze({ paint: "#ff6b9a", fill: "#4d9bff", material: "#46d267", decal: "#36d3c4", text: "#f08cff", generator: "#ffb238", gradient: "#b58cff", folder: "#9aa4b2" });
// A gradient layer is an engine paint layer that keeps its point gradient; everything else is its engine kind.
export const TypeOf = (L) => (L?.kind === "paint" && L.gradient ? "gradient" : L?.kind);
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
  if (L.gradient && Layer.kind === "paint") Layer.gradient = GradientOf(L.gradient, Layer.extValues);
  if (Layer.mask) Layer.mask = { opacity: Clamp(Num(Layer.mask.opacity, 1), 0, 1), invert: !!Layer.mask.invert, enabled: Layer.mask.enabled !== false, preset: MASK_PRESETS.some(([, V]) => V === Layer.mask.preset) ? Layer.mask.preset : "none" };
  return Layer;
}

// ------------------------------------------------------------------------------------------------ gradient layers
// Surface values for points the card has not seen filled (the workspace fills new points from the brush).
const GRADIENT_DEFAULTS = Object.freeze({ roughness: 0.34, metalness: 0.12, height: 0.25, extValues: {} });
const GradientOf = (Raw, Ext = {}) => fillPointGradientValues(Raw, { ...GRADIENT_DEFAULTS, extValues: Ext });
export const BACKGROUND = "background";
export const MAX_POINTS = 12;
function StarterGradient() {
  const G = normalizePointGradient3D();
  const Looks = [{ roughness: 0.22, metalness: 0.85, height: 0.2 }, { roughness: 0.72, metalness: 0, height: -0.1 }];
  return GradientOf({ ...G, backgroundSurface: { roughness: 0.5, metalness: 0, height: 0 }, points: G.points.map((Pt, I) => ({ ...Pt, ...(Looks[I] || {}) })) });
}
const Entry = (G, Pick) => (Pick === BACKGROUND ? { id: BACKGROUND, color: G.background, ...G.backgroundSurface } : G.points.find((Pt) => Pt.id === Pick) || G.points[0] || { id: BACKGROUND, color: G.background, ...G.backgroundSurface });
// The gradient entry or stamp the inspector's values belong to (Pick is the card's choice, kept per layer).
export function Focus(L, Pick) {
  if (TypeOf(L) === "gradient") return Entry(L.gradient, Pick).id;
  if (L?.kind === "decal" || L?.kind === "text") return (L.stamps.find((St) => St.id === Pick) || L.stamps.find((St) => St.id === L.selectedStampId) || L.stamps[0])?.id || null;
  return null;
}
const WriteEntry = (G, Pick, Fn) => {
  if (Pick === BACKGROUND) { const Next = Fn({ color: G.background, ...G.backgroundSurface }); const { color, ...Surface } = Next; return { ...G, background: color, backgroundSurface: Surface }; }
  return { ...G, points: G.points.map((Pt) => (Pt.id === Pick ? Fn(Pt) : Pt)) };
};
export function EditPoint(P, Id, Pick, Patch) {
  const L = Layer(P, Id);
  if (!L?.gradient) return P;
  const Clean = { ...Patch };
  if ("radius" in Clean) Clean.radius = Clamp(Num(Clean.radius, 1.1), 0.12, 3.5);
  if ("weight" in Clean) Clean.weight = Clamp(Num(Clean.weight, 1), 0.05, 1);
  if ("falloff" in Clean) return Edit(P, Id, { gradient: { ...L.gradient, falloff: Clamp(Num(Clean.falloff, 1), 0.2, 3) } });
  return Edit(P, Id, { gradient: WriteEntry(L.gradient, Pick, (E) => ({ ...E, ...Clean })) });
}
// A new point copies the picked one, mirrored across the object so it lands somewhere visible.
export function AddPoint(P, Id, Pick) {
  const L = Layer(P, Id), G = L?.gradient;
  if (!G || G.points.length >= MAX_POINTS) return { Next: P, Point: null };
  const From = G.points.find((Pt) => Pt.id === Pick) || G.points.at(-1);
  let N = G.points.length + 1;
  while (G.points.some((Pt) => Pt.id === `gp_${N}`)) N++;
  const Point = { ...structuredClone(From || G.points[0] || {}), id: `gp_${N}`, position: From ? From.position.map((V, I) => (I === 1 ? V : -V)) : [0, 0.6, 0.6] };
  return { Next: Edit(P, Id, { gradient: { ...G, points: [...G.points, Point] } }), Point: Point.id };
}
export function RemovePoint(P, Id, Pick) {
  const L = Layer(P, Id), G = L?.gradient;
  if (!G || G.points.length <= 1 || Pick === BACKGROUND) return P;
  return Edit(P, Id, { gradient: { ...G, points: G.points.filter((Pt) => Pt.id !== Pick) } });
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
  const New = Type === "gradient"
    ? Rehydrate({ ...createPaintLayer("paint", { res: RES, parentId: EnclosingId, name: "Gradient Layer" }), gradient: StarterGradient() })
    : Rehydrate(createPaintLayer(Type, { res: RES, parentId: EnclosingId }));
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
// Where each kind keeps the values its channels write:
//   fill / material / generator → their own block (colour + roughness / metalness / height + extended values),
//   gradient → the picked point (or the background): every point has its own colour and surface values,
//   text → the text spec (colour, roughness, metalness, height; the raster is rebuilt) + the stamp's extended values,
//   stamp (decal) → the picked stamp: tint, roughness / metalness overrides (unset = the stamp image), height gain,
//   paint → texels; the brush decides what a stroke writes, so the layer shows opacity and blend only.
const VALUE_HOME = { fill: "fill", material: "material", generator: "generator" };
export const QueryLayerValues = (L) => !!L && (!!VALUE_HOME[L.kind] || ["gradient", "text", "decal"].includes(TypeOf(L)));
const COLOUR = (Ch) => PAINT_CHANNEL[Ch]?.Type === "colour";
const Stamp = (L, Pick) => L.stamps.find((St) => St.id === Focus(L, Pick)) || null;

function ReadValue(L, Ch, Pick) {
  const Type = TypeOf(L);
  if (VALUE_HOME[L.kind]) { const H = L[VALUE_HOME[L.kind]]; return Ch === "albedo" ? H.color : H[Ch]; }
  if (Type === "gradient") {
    const E = Entry(L.gradient, Focus(L, Pick));
    if (Ch === "albedo") return E.color;
    if (Ch in E && Ch !== "extValues") return E[Ch];
    return E.extValues?.[Ch] ?? (COLOUR(Ch) ? E.color : L.extValues?.[Ch]);
  }
  const St = Stamp(L, Pick);
  if (Type === "text") {
    if (Ch === "albedo" || Ch === "roughness" || Ch === "metalness" || Ch === "height") return L.text[Ch === "albedo" ? "color" : Ch];
    return St?.extValues?.[Ch] ?? L.extValues?.[Ch];
  }
  if (Type === "decal") {
    if (!St) return undefined;
    if (Ch === "albedo") return St.tint;
    if (Ch === "roughness" || Ch === "metalness") return St[Ch] ?? undefined;   // unset: the stamp image decides
    if (Ch === "height") return St.heightStrength;
    return St.extValues?.[Ch] ?? L.extValues?.[Ch];
  }
  return undefined;
}

const NOTES = {
  paint: "Painted texels live in the layer; the brush decides what each stroke writes. This layer sets how much of each channel shows.",
  gradient: "Values belong to the picked point (or the background). Points blend into each other in every channel, colour and surface alike.",
  text: "Colour, roughness, metalness and height style the lettering; the other channels set what the text writes.",
  decal: "Values belong to the picked stamp. Roughness and metalness follow the stamp image until you set them here.",
};
export function LayerCard(L) {
  const Value = QueryLayerValues(L) ? [
    { K: "value", L: "Value", T: "slider", For: ["scalar"], Def: (Ch) => Ch.Def },
    { K: "value", L: "Colour", T: "colour", For: ["colour"], Def: (Ch) => Ch.Def },
  ] : [];
  const Note = NOTES[TypeOf(L)];
  return [
    ...Value,
    { K: "opacity", L: "Channel opacity", T: "slider", Def: 100, Hint: "Scales this channel only" },
    { K: "blend", L: "Channel blend", T: "select", Opts: CHANNEL_BLENDS, Def: "Inherit", Hint: "Inherit uses the layer blend" },
    ...(Note ? [{ K: "note", T: "note", Text: Note }] : []),
  ];
}

export function LayerStack(L, Pick) {
  const Values = QueryLayerValues(L);
  return {
    on: PAINT_CHANNELS.filter((C) => L.channels[C.Id]).map((C) => C.Id),
    per: Object.fromEntries(PAINT_CHANNELS.map((C) => {
      const Raw = Values ? ReadValue(L, C.Id, Pick) : undefined;
      const Value = Raw === undefined || Raw === null ? (Values && TypeOf(L) !== "decal" ? FromEngine(C.Id, ToEngine(C.Id, C.Def)) : undefined) : FromEngine(C.Id, Raw);
      return [C.Id, { ...(Value !== undefined ? { value: COLOUR(C.Id) ? Value : Math.round(Value) } : {}), opacity: Math.round(L.channelOpacity[C.Id] * 100), blend: L.channelBlends[C.Id] }];
    })),
  };
}

const SURFACE = ["roughness", "metalness", "height"];
export function AssignLayerStack(P, Id, Full, Pick) {
  return Edit(P, Id, (L) => {
    const Channels = Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, Full.on.includes(C.Id)]));
    const Patch = {
      channels: Channels,
      channelOpacity: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, Clamp(Num(Full.per[C.Id]?.opacity, 100), 0, 100) / 100])),
      channelBlends: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, CHANNEL_BLENDS.includes(Full.per[C.Id]?.blend) ? Full.per[C.Id].blend : "Inherit"])),
    };
    if (!QueryLayerValues(L)) return Patch;
    const Before = LayerStack(L, Pick).per;
    // Only values that changed are written, so an untouched decal roughness stays "from the stamp image".
    const Changed = PAINT_CHANNELS.filter((C) => Full.per[C.Id]?.value !== undefined && Full.per[C.Id].value !== Before[C.Id]?.value);
    const Engine = (C) => (COLOUR(C.Id) ? Full.per[C.Id].value : ToEngine(C.Id, Full.per[C.Id].value));
    const Type = TypeOf(L);
    if (VALUE_HOME[L.kind]) {
      const Home = VALUE_HOME[L.kind], Block = { ...L[Home] }, Ext = { ...L.extValues };
      for (const C of Changed) {
        if (C.Id === "albedo") Block.color = Engine(C);
        else { Block[C.Id] = Engine(C); if (C.Id in Ext) Ext[C.Id] = Block[C.Id]; }
      }
      Patch[Home] = Block;
      if (L.kind === "material") Patch.extValues = Ext;
    } else if (Type === "gradient") {
      Patch.gradient = WriteEntry(L.gradient, Focus(L, Pick), (E) => {
        const Next = { ...E, extValues: { ...(E.extValues || {}) } };
        for (const C of Changed) {
          if (C.Id === "albedo") Next.color = Engine(C);
          else if (SURFACE.includes(C.Id)) Next[C.Id] = Engine(C);
          else Next.extValues[C.Id] = Engine(C);
        }
        return Next;
      });
    } else if (Type === "text") {
      const Text = { ...L.text }, Ext = {};
      for (const C of Changed) {
        if (C.Id === "albedo") Text.color = Engine(C);
        else if (SURFACE.includes(C.Id)) Text[C.Id] = Engine(C);
        else Ext[C.Id] = Engine(C);
      }
      const Restyled = JSON.stringify(Text) !== JSON.stringify(L.text);
      Patch.text = Text;
      Patch.stamps = L.stamps.map((St) => ({ ...St, channels: { ...Channels }, extValues: { ...(St.extValues || {}), ...Ext }, ...(Restyled ? { text: { ...(St.text || L.text), ...Text }, stampData: null } : {}) }));
    } else if (Type === "decal") {
      const Target = Focus(L, Pick);
      Patch.stamps = L.stamps.map((St) => {
        const Next = { ...St, channels: { ...Channels } };
        if (St.id !== Target) return Next;
        Next.extValues = { ...(St.extValues || {}) };
        for (const C of Changed) {
          if (C.Id === "albedo") Next.tint = Engine(C);
          else if (C.Id === "roughness" || C.Id === "metalness") Next[C.Id] = Engine(C);
          else if (C.Id === "height") Next.heightStrength = Clamp(Engine(C), -1, 1);
          else Next.extValues[C.Id] = Engine(C);
        }
        return Next;
      });
    }
    return Patch;
  });
}

export function AssignChannelField(P, Id, Ch, Key, Raw, Pick) {
  const L = Layer(P, Id);
  if (!L || !PAINT_CHANNEL[Ch]) return P;
  return AssignLayerStack(P, Id, AssignStackField(LayerStack(L, Pick), Ch, Key, Raw, LayerCard(L)), Pick);
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
