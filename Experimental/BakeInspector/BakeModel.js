// BakeModel.js — pure settings model behind the Map Baking inspector card.
//
// Settings mirror TextureStudio's BakingWorkspace state field for field, so a request built here can be handed straight to
// its bakers (bakeMeshMaps / bakeVolumeSdf / GpuBakeSession).  The card itself never bakes: it estimates cost, tracks
// whether results are stale, and asks its host to run the bake.
//
// Bake sets.  One character is many meshes — body, head, hat, jacket, pants, boots, a backpack, a sidearm — and each
// needs its own high → low pair, cage and map queue, but they belong together (one name, one output, one bake).  A
// settings document with `set: null` is the original single-study bake; with a `set`, every enabled part is baked in
// turn and the output is per-part texture sets, one shared atlas, or one UDIM tile per part.  (Code says "bake set" and
// "part"; the UI says character / asset.)

import { BAKE_MAP_CATALOG, BAKE_STUDY_SHAPES } from "./Engine/BakeCatalog.js";

export { BAKE_MAP_CATALOG, BAKE_STUDY_SHAPES };

const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
export const STORAGE_KEY = "Frontier.BakeInspector.v1";
export const GROUPS = Object.freeze(["Normals", "Surface", "Masks & IDs", "Volume & Distance"]);
export const GROUP_COLOURS = Object.freeze({ Normals: "#4d9bff", Surface: "#ffb238", "Masks & IDs": "#46d267", "Volume & Distance": "#c48cff" });
export const RESOLUTIONS = Object.freeze([256, 512, 1024, 2048]);
export const SDF_DIMS = Object.freeze([24, 36, 48, 64]);
export const DEVICES = Object.freeze([["Auto", "auto"], ["GPU", "gpu"], ["CPU", "cpu"]]);
export const MAP = Object.freeze(Object.fromEntries(BAKE_MAP_CATALOG.map((M) => [M.id, M])));
// Queue / display order: by card group (Normals first — curvature derives from them), then catalog order within a group.
const ORDER = Object.fromEntries(GROUPS.flatMap((G) => BAKE_MAP_CATALOG.filter((M) => M.group === G)).map((M, I) => [M.id, I]));

export const DEFAULTS = Object.freeze({
  studyId: "teapot", selected: ["normalTangent", "ao", "curvature", "height", "volumeSdf"],
  resolution: 512, samples: 12, frontDistance: 0.14, rearDistance: 0.14, aoDistance: 0.45, thicknessRange: 1.8,
  padding: 6, normalY: "+Y", sdfRes: 36, sdfPadding: 0.16, sdfSigned: true, deviceMode: "auto",
  lowSource: null, highSource: null,
  set: null,
});

// Every numeric setting (BakingWorkspace slider ranges).
export const SETTINGS = Object.freeze({
  samples: { Label: "Rays per texel", Min: 4, Max: 36, Step: 2, Unit: "", Hint: "Hemisphere samples" },
  aoDistance: { Label: "Max ray distance", Min: 0.1, Max: 2, Step: 0.02, Unit: "m", Hint: "Occlusion reach" },
  frontDistance: { Label: "Cage front", Min: 0.02, Max: 0.8, Step: 0.01, Unit: "m", Hint: "Outward search" },
  rearDistance: { Label: "Cage rear", Min: 0.02, Max: 0.8, Step: 0.01, Unit: "m", Hint: "Inward search" },
  thicknessRange: { Label: "Thickness range", Min: 0.2, Max: 4, Step: 0.05, Unit: "m", Hint: "Interior ray depth" },
  padding: { Label: "UV edge padding", Min: 0, Max: 14, Step: 1, Unit: "px", Hint: "Dilation past seams" },
  sdfPadding: { Label: "Bounds padding", Min: 0.05, Max: 0.45, Step: 0.01, Unit: "", Hint: "Around the high mesh" },
});

// Which settings shape which map (the map's inline editor shows exactly these) and how many rays one texel costs.
export const MAP_PARAMS = Object.freeze({
  normalTangent: { Keys: ["frontDistance", "rearDistance"], Convention: true, Rays: () => 2 },
  normalWorld: { Keys: ["frontDistance", "rearDistance"], Rays: () => 2 },
  normalObject: { Keys: ["frontDistance", "rearDistance"], Rays: () => 2 },
  bentNormal: { Keys: ["samples", "aoDistance"], Rays: (S) => S.samples },
  bevelNormal: { Keys: ["frontDistance"], Rays: () => 8, Note: "Rounds hard edges with 8 fixed probe rays inside the front cage." },
  ao: { Keys: ["samples", "aoDistance"], Rays: (S) => S.samples },
  secondaryAo: { Keys: ["samples", "aoDistance"], Rays: (S) => S.samples, Note: "Short-range pass at a quarter of the AO distance for contact creases." },
  curvature: { Keys: [], Rays: () => 0, Note: "Derived from the baked normals in UV space — no extra rays." },
  convexity: { Keys: [], Rays: () => 0, Note: "Positive half of curvature — derived, no extra rays." },
  concavity: { Keys: [], Rays: () => 0, Note: "Negative half of curvature — derived, no extra rays." },
  thickness: { Keys: ["samples", "thicknessRange"], Rays: (S) => S.samples },
  height: { Keys: ["frontDistance", "rearDistance"], Rays: () => 2 },
  topDust: { Keys: ["samples"], Rays: (S) => Math.max(4, Math.round(S.samples / 2)), Note: "Upward-facing sky visibility (half the AO samples)." },
  uvIslandId: { Keys: [], Rays: () => 0, Note: "Rasterised from UV charts — free." },
  partId: { Keys: [], Rays: () => 0, Note: "Rasterised from sub-mesh membership — free." },
  position: { Keys: [], Rays: () => 0, Note: "Rasterised bounding-box XYZ — free." },
  wireframe: { Keys: [], Rays: () => 0, Note: "Rasterised UV edges — free." },
  volumeSdf: { Keys: ["sdfPadding"], Volume: true, Rays: () => 0 },
});

// Which other selected maps share a setting (shown as a hint so editing one place is not a surprise elsewhere).
export function SharedWith(S, Key, Except) {
  return S.selected.filter((Id) => Id !== Except && MAP_PARAMS[Id]?.Keys.includes(Key)).map((Id) => MAP[Id].label);
}

// ------------------------------------------------------------------------------------------------ documents
export function Create(Overrides = {}) {
  return Normalise({ ...structuredClone(DEFAULTS), ...Overrides });
}

export function Normalise(Raw) {
  const S = { ...structuredClone(DEFAULTS), ...(Raw || {}) };
  if (!BAKE_STUDY_SHAPES.some((E) => E.id === S.studyId)) S.studyId = DEFAULTS.studyId;
  S.selected = [...new Set((Array.isArray(S.selected) ? S.selected : []).filter((Id) => MAP[Id]))];
  S.selected.sort((A, B) => ORDER[A] - ORDER[B]);
  S.resolution = RESOLUTIONS.includes(+S.resolution) ? +S.resolution : DEFAULTS.resolution;
  S.sdfRes = SDF_DIMS.includes(+S.sdfRes) ? +S.sdfRes : DEFAULTS.sdfRes;
  for (const [K, Spec] of Object.entries(SETTINGS)) S[K] = Number.isFinite(+S[K]) ? Clamp(+S[K], Spec.Min, Spec.Max) : DEFAULTS[K];
  S.normalY = S.normalY === "-Y" ? "-Y" : "+Y";
  S.sdfSigned = S.sdfSigned !== false;
  S.deviceMode = DEVICES.some(([, V]) => V === S.deviceMode) ? S.deviceMode : "auto";
  for (const K of ["lowSource", "highSource"]) S[K] = NormaliseSource(S[K]);
  S.set = NormaliseSet(S.set, S);
  return S;
}

export function SetValue(S, Key, Value) { return Normalise({ ...S, [Key]: Value }); }
export function ToggleMap(S, Id) { return Normalise({ ...S, selected: S.selected.includes(Id) ? S.selected.filter((E) => E !== Id) : [...S.selected, Id] }); }
export function SetGroup(S, Group, On) {
  const Ids = BAKE_MAP_CATALOG.filter((M) => M.group === Group).map((M) => M.id);
  return Normalise({ ...S, selected: On ? [...S.selected, ...Ids] : S.selected.filter((E) => !Ids.includes(E)) });
}

// Queue presets (BakingWorkspace's quick chips).
export const PRESETS = Object.freeze([
  { Id: "core", Label: "PBR Core", Maps: ["normalTangent", "ao", "curvature", "height", "thickness"] },
  { Id: "volume", Label: "PBR + Volume", Maps: ["normalTangent", "ao", "curvature", "height", "thickness", "volumeSdf"] },
  { Id: "normals", Label: "Normals", Maps: BAKE_MAP_CATALOG.filter((M) => M.group === "Normals").map((M) => M.id) },
  { Id: "all", Label: "All", Maps: BAKE_MAP_CATALOG.map((M) => M.id) },
]);
export const ApplyPreset = (S, Id) => Normalise({ ...S, selected: [...(PRESETS.find((P) => P.Id === Id)?.Maps || S.selected)] });
export const PresetMatch = (S) => PRESETS.find((P) => P.Maps.length === S.selected.length && P.Maps.every((M) => S.selected.includes(M)))?.Id || null;

export function ExportPreset(S) {
  const { lowSource, highSource, ...Settings } = S;
  if (Settings.set) Settings.set = { ...Settings.set, parts: Settings.set.parts.map(({ lowSource: L, highSource: H, ...Part }) => Part) };
  return JSON.stringify({ schema: "frontier.bake.v1", savedAt: new Date().toISOString(), settings: Settings }, null, 2);
}

export function Load(Text) {
  const Raw = typeof Text === "string" ? JSON.parse(Text) : Text;
  const Body = Raw?.settings || Raw;
  if (!Body || typeof Body !== "object" || !Array.isArray(Body.selected)) throw Error("Not a bake preset — no map selection.");
  return Normalise(Body);
}

// The payload a host bakes from — split exactly the way BakingWorkspace.runBake splits it.  A bake set sends one entry
// per enabled part (frontier.bake-request.v2); the host runs them in order and reports progress per job.
export function Request(S) {
  if (S.set) return SetRequest(S);
  const Surface = S.selected.filter((Id) => !MAP[Id].isVolume);
  return {
    schema: "frontier.bake-request.v1",
    studyId: S.studyId, device: S.deviceMode, lowSource: S.lowSource, highSource: S.highSource,
    surface: Surface.length ? { resolution: S.resolution, channels: Surface, samples: S.samples, frontDistance: S.frontDistance, rearDistance: S.rearDistance, aoDistance: S.aoDistance, thicknessRange: S.thicknessRange, padding: S.padding, normalY: S.normalY } : null,
    volume: S.selected.includes("volumeSdf") ? { nx: S.sdfRes, ny: S.sdfRes, nz: S.sdfRes, padding: S.sdfPadding, signMode: S.sdfSigned ? "signed" : "unsigned" } : null,
  };
}

// Fingerprint of everything that changes bake output — results from a different fingerprint are stale.
export function Fingerprint(S) {
  if (S.set) return JSON.stringify(EnabledParts(S).map((P) => [P.id, PartFingerprint(S, P)]));
  const { deviceMode, set, ...Rest } = S;
  return JSON.stringify(Rest);
}

// ------------------------------------------------------------------------------------------------ estimates
export const Study = (S) => BAKE_STUDY_SHAPES.find((E) => E.id === S.studyId) || BAKE_STUDY_SHAPES[0];
export function StudyTris(S) {
  const M = /([\d.]+)\s*k/i.exec(Study(S).complexity || "");
  return M ? Math.round(+M[1] * 1000) : 5000;
}

const UV_FILL = 0.72;               // typical share of the atlas covered by charts
const THROUGHPUT = { gpu: 320e6, cpu: 4.5e6 }; // rays / second, measured order of magnitude for the TextureStudio bakers
const BYTES_PER_TEXEL = 4;          // baked maps are held as RGBA8

// Cost of one map — for the study, or for one part of a bake set (its own resolution, or its share of the atlas).
export function MapCost(S, Id, Part = null) {
  const P = MAP_PARAMS[Id], Texels = Part ? PartTexels(S, Part) : S.resolution * S.resolution;
  if (P.Volume) {
    const Voxels = S.sdfRes ** 3;
    return { Bytes: Voxels * 4, Rays: Voxels * Math.ceil(Math.log2(Math.max(2, Part ? PartTris(Part) : StudyTris(S)))) * 6, Voxels };
  }
  return { Bytes: Math.round(Texels * BYTES_PER_TEXEL), Rays: Math.round(P.Rays(S) * Texels * UV_FILL) };
}

export function Estimate(S) {
  if (S.set) return SetEstimate(S);
  const Device = S.deviceMode === "cpu" ? "cpu" : "gpu";
  const ByGroup = Object.fromEntries(GROUPS.map((G) => [G, 0]));
  let Bytes = 0, Rays = 0;
  for (const Id of S.selected) {
    const C = MapCost(S, Id);
    Bytes += C.Bytes; Rays += C.Rays;
    ByGroup[MAP[Id].group] += C.Bytes;
  }
  const Seconds = S.selected.length ? 0.12 + Rays / THROUGHPUT[Device] : 0;
  return { Bytes, Rays, Seconds, Device, ByGroup, Maps: S.selected.length, Surface: S.selected.filter((Id) => !MAP[Id].isVolume).length };
}

export const Seconds = (Rays, Device) => 0.12 + Rays / THROUGHPUT[Device === "cpu" ? "cpu" : "gpu"];
export const Bytes = (N) => (N >= 1048576 ? `${(N / 1048576).toFixed(N >= 10485760 ? 0 : 1)} MB` : N >= 1024 ? `${Math.round(N / 1024)} KB` : `${N} B`);
export const Count = (N) => (N >= 1e9 ? `${(N / 1e9).toFixed(1)} G` : N >= 1e6 ? `${(N / 1e6).toFixed(N >= 1e7 ? 0 : 1)} M` : N >= 1e3 ? `${Math.round(N / 1e3)} k` : String(Math.round(N)));
export const Duration = (Sec) => (Sec >= 60 ? `${Math.floor(Sec / 60)} m ${Math.round(Sec % 60)} s` : Sec >= 10 ? `${Math.round(Sec)} s` : Sec >= 1 ? `${Sec.toFixed(1)} s` : `${Math.max(1, Math.round(Sec * 1000))} ms`);

// ================================================================================================ bake sets
export const PART_CATEGORIES = Object.freeze(["Body", "Clothing", "Props"]);
export const CATEGORY_GLYPH = Object.freeze({ Body: "person", Clothing: "jacket", Props: "prop" });
export const CATEGORY_COLOURS = Object.freeze({ Body: "#ff8a8a", Clothing: "#7cc4ff", Props: "#46d267" });
// Tris are the typical high-poly budget the estimate starts from (a custom high mesh replaces it with a size-based guess).
export const PART_KINDS = Object.freeze([
  { Id: "body", Label: "Body", Category: "Body", Glyph: "person", Tris: 24000, Hint: "Torso and limbs" },
  { Id: "head", Label: "Head", Category: "Body", Glyph: "head", Tris: 16000, Hint: "Face and neck" },
  { Id: "hands", Label: "Hands", Category: "Body", Glyph: "hand", Tris: 6000, Hint: "Both hands" },
  { Id: "hair", Label: "Hair", Category: "Body", Glyph: "hair", Tris: 18000, Hint: "Cards or groom shell", Maps: ["normalTangent", "ao", "height"] },
  { Id: "eyes", Label: "Eyes", Category: "Body", Glyph: "eye3", Tris: 1200, Hint: "Small, low resolution", Maps: ["normalTangent", "ao"], Resolution: 256 },
  { Id: "hat", Label: "Hat", Category: "Clothing", Glyph: "hat", Tris: 5000, Hint: "Headwear" },
  { Id: "jacket", Label: "Jacket", Category: "Clothing", Glyph: "jacket", Tris: 14000, Hint: "Outer layer" },
  { Id: "shirt", Label: "Shirt", Category: "Clothing", Glyph: "shirt", Tris: 8000, Hint: "Under layer" },
  { Id: "pants", Label: "Pants", Category: "Clothing", Glyph: "pants", Tris: 9000, Hint: "Legwear" },
  { Id: "boots", Label: "Boots", Category: "Clothing", Glyph: "boot", Tris: 7000, Hint: "Footwear" },
  { Id: "gloves", Label: "Gloves", Category: "Clothing", Glyph: "glove", Tris: 4000, Hint: "Handwear" },
  { Id: "belt", Label: "Belt & straps", Category: "Clothing", Glyph: "belt", Tris: 3000, Hint: "Webbing, buckles" },
  { Id: "backpack", Label: "Backpack", Category: "Props", Glyph: "bag", Tris: 9000, Hint: "Carried gear" },
  { Id: "tool", Label: "Hand prop", Category: "Props", Glyph: "prop", Tris: 5000, Hint: "Weapon or tool" },
  { Id: "prop", Label: "Prop", Category: "Props", Glyph: "cube", Tris: 4000, Hint: "Anything else" },
]);
export const KIND = Object.freeze(Object.fromEntries(PART_KINDS.map((K) => [K.Id, K])));
export const OUTPUTS = Object.freeze([
  { Id: "parts", Label: "Per part", Glyph: "layers", Hint: "One texture set per part — swap clothes freely" },
  { Id: "atlas", Label: "Atlas", Glyph: "atlas", Hint: "Every part packed into one sheet per map" },
  { Id: "udim", Label: "UDIM", Glyph: "tiles", Hint: "One tile per part (1001, 1002, …) in one texture set" },
]);
export const ISOLATIONS = Object.freeze([
  { Id: "name", Label: "Match by name", Glyph: "isolate", Hint: "Each low part projects only onto its own high part" },
  { Id: "together", Label: "All together", Glyph: "layers", Hint: "Parts see each other — contact shading, may bleed" },
  { Id: "exploded", Label: "Exploded", Glyph: "move", Hint: "Parts pulled apart first — clean, no contact shading" },
]);
export const ATLAS_RES = Object.freeze([1024, 2048, 4096, 8192]);

export const SET_TEMPLATES = Object.freeze([
  { Id: "outfit", Label: "Character · full outfit", Name: "Ranger", Hint: "Body, clothes and props — 12 parts",
    Parts: [["body"], ["head"], ["eyes"], ["hair"], ["hat", "Field cap"], ["jacket", "Field jacket"], ["shirt"], ["pants", "Cargo pants"], ["boots"], ["gloves"], ["backpack"], ["tool", "Sidearm"]] },
  { Id: "base", Label: "Character · base body", Name: "Base body", Hint: "Body, head, hands, eyes, hair",
    Parts: [["body"], ["head"], ["hands"], ["eyes"], ["hair"]] },
  { Id: "kit", Label: "Gear kit · props", Name: "Field kit", Hint: "Props that ship with a character",
    Parts: [["backpack"], ["tool", "Rifle"], ["prop", "Canteen"], ["belt", "Holster"]] },
]);

const Slug = (T) => String(T).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "part";
function NormaliseSource(V) { return V && typeof V === "object" ? { name: String(V.name || "mesh").slice(0, 80), size: +V.size || 0 } : null; }
const MapList = (List) => [...new Set((Array.isArray(List) ? List : []).filter((Id) => MAP[Id]))].sort((A, B) => ORDER[A] - ORDER[B]);

function NormalisePart(Raw, Index, Taken) {
  const K = KIND[Raw?.kind] || KIND.prop;
  let Id = typeof Raw?.id === "string" && /^[a-z0-9-]{1,24}$/.test(Raw.id) ? Raw.id : `p${Index + 1}`;
  while (Taken.has(Id)) Id = `${Id}x`;
  Taken.add(Id);
  const P = {
    id: Id, name: String(Raw?.name || K.Label).slice(0, 60) || K.Label, kind: K.Id, enabled: Raw?.enabled !== false,
    tris: Number.isFinite(+Raw?.tris) && +Raw.tris > 0 ? Math.round(Clamp(+Raw.tris, 100, 5e6)) : K.Tris,
    lowSource: NormaliseSource(Raw?.lowSource), highSource: NormaliseSource(Raw?.highSource),
    maps: Raw?.maps === null || Raw?.maps === undefined ? null : MapList(Raw.maps),
    resolution: RESOLUTIONS.includes(+Raw?.resolution) ? +Raw.resolution : null,
    cage: null, contactAo: Raw?.contactAo !== false,
  };
  if (Raw?.cage && typeof Raw.cage === "object") {
    P.cage = {};
    for (const Key of ["frontDistance", "rearDistance"]) { const Spec = SETTINGS[Key], V = +Raw.cage[Key]; P.cage[Key] = Number.isFinite(V) ? Clamp(V, Spec.Min, Spec.Max) : DEFAULTS[Key]; }
  }
  return P;
}

function NormaliseSet(Raw) {
  if (!Raw || typeof Raw !== "object") return null;
  const Taken = new Set();
  return {
    name: String(Raw.name || "Character").slice(0, 60) || "Character",
    template: SET_TEMPLATES.some((T) => T.Id === Raw.template) ? Raw.template : null,
    output: OUTPUTS.some((O) => O.Id === Raw.output) ? Raw.output : "parts",
    isolation: ISOLATIONS.some((O) => O.Id === Raw.isolation) ? Raw.isolation : "name",
    atlasRes: ATLAS_RES.includes(+Raw.atlasRes) ? +Raw.atlasRes : 4096,
    parts: (Array.isArray(Raw.parts) ? Raw.parts : []).slice(0, 64).map((P, I) => NormalisePart(P, I, Taken)),
  };
}

// ------------------------------------------------------------------------------------------------ set edits (pure)
export function UseTemplate(S, Id) {
  const T = SET_TEMPLATES.find((E) => E.Id === Id);
  if (!T) return Normalise({ ...S, set: null });
  return Normalise({ ...S, set: { name: T.Name, template: T.Id, output: "parts", isolation: "name", atlasRes: 4096,
    parts: T.Parts.map(([Kind, Name], I) => ({ id: `p${I + 1}`, kind: Kind, name: Name || KIND[Kind].Label, maps: KIND[Kind].Maps || null, resolution: KIND[Kind].Resolution || null })) } });
}
export const SetSet = (S, Key, Value) => Normalise({ ...S, set: { ...S.set, [Key]: Value } });
export const FindPart = (S, Id) => S.set?.parts.find((P) => P.id === Id) || null;
export function EditPart(S, Id, Patch) {
  return Normalise({ ...S, set: { ...S.set, parts: S.set.parts.map((P) => (P.id === Id ? { ...P, ...(typeof Patch === "function" ? Patch(P) : Patch) } : P)) } });
}
export function NextPartId(S) { let N = (S.set?.parts.length || 0) + 1; while (FindPart(S, `p${N}`)) N++; return `p${N}`; }
export function AddPart(S, Kind, Name) {
  const K = KIND[Kind] || KIND.prop, Id = NextPartId(S);
  const Base = S.set || { name: "Character", output: "parts", isolation: "name", atlasRes: 4096, parts: [] };
  const Same = Base.parts.filter((P) => P.kind === K.Id).length;
  return { Next: Normalise({ ...S, set: { ...Base, parts: [...Base.parts, { id: Id, kind: K.Id, name: Name || (Same ? `${K.Label} ${Same + 1}` : K.Label), maps: K.Maps || null, resolution: K.Resolution || null }] } }), Id };
}
export function DuplicatePart(S, Id) {
  const P = FindPart(S, Id); if (!P) return { Next: S, Id: null };
  const NewId = NextPartId(S), At = S.set.parts.indexOf(P);
  const Parts = [...S.set.parts]; Parts.splice(At + 1, 0, { ...structuredClone(P), id: NewId, name: `${P.name} copy`.slice(0, 60) });
  return { Next: Normalise({ ...S, set: { ...S.set, parts: Parts } }), Id: NewId };
}
export const RemovePart = (S, Id) => Normalise({ ...S, set: { ...S.set, parts: S.set.parts.filter((P) => P.id !== Id) } });
export const TogglePart = (S, Id) => EditPart(S, Id, (P) => ({ enabled: !P.enabled }));
export function SetCategory(S, Category, On) {
  return Normalise({ ...S, set: { ...S.set, parts: S.set.parts.map((P) => (KIND[P.kind].Category === Category ? { ...P, enabled: On } : P)) } });
}
// Toggling a map on a part that follows the set queue gives it its own copy of the queue first.
export function TogglePartMap(S, Id, Map) {
  return EditPart(S, Id, (P) => { const Cur = P.maps ?? S.selected; return { maps: Cur.includes(Map) ? Cur.filter((M) => M !== Map) : [...Cur, Map] }; });
}

// ------------------------------------------------------------------------------------------------ set queries
export function Ordered(S) {
  return S.set ? PART_CATEGORIES.flatMap((C) => S.set.parts.filter((P) => KIND[P.kind].Category === C)) : [];
}
export const EnabledParts = (S) => Ordered(S).filter((P) => P.enabled);
export const PartMaps = (S, P) => P.maps ?? S.selected;
export const PartRes = (S, P) => P.resolution ?? S.resolution;
export const PartCage = (S, P, Key) => P.cage?.[Key] ?? S[Key];
export const PartTris = (P) => (P.highSource?.size ? Math.max(500, Math.round(P.highSource.size / 50)) : P.tris);
export function AtlasShare(S, P) {
  const W = (Q) => Math.sqrt(PartTris(Q)), All = EnabledParts(S);
  const Total = All.reduce((A, Q) => A + W(Q), 0);
  return P.enabled && Total ? W(P) / Total : 0;
}
export function PartTexels(S, P) {
  if (S.set?.output === "atlas") return S.set.atlasRes ** 2 * AtlasShare(S, P);
  return PartRes(S, P) ** 2;
}
export const UdimTile = (S, P) => 1001 + EnabledParts(S).findIndex((Q) => Q.id === P.id);

// Every (part, map) job in bake order: body → clothing → props, maps in queue order, the volume last within a part.
const Queue = (M) => [...M.filter((Id) => !MAP[Id].isVolume), ...(M.includes("volumeSdf") ? ["volumeSdf"] : [])];
export function Jobs(S, Only = null) {
  if (!S.set) return Queue(S.selected).map((Map) => ({ Part: null, Map }));
  return EnabledParts(S).filter((P) => !Only || Only.includes(P.id)).flatMap((P) => Queue(PartMaps(S, P)).map((Map) => ({ Part: P.id, Map })));
}

export function FileName(S, P, Map) {
  const Set = Slug(S.set?.name || Study(S).name), Ext = MAP[Map].isVolume ? "fvol" : "png";
  if (!S.set || !P) return `${Set}_${Map}.${Ext}`;
  if (MAP[Map].isVolume) return `${Set}_${Slug(P.name)}_${Map}.fvol`;
  if (S.set.output === "atlas") return `${Set}_${Map}.png`;
  if (S.set.output === "udim") return `${Set}_${Map}.${UdimTile(S, P)}.png`;
  return `${Set}_${Slug(P.name)}_${Map}.png`;
}

export function PartCost(S, P) {
  const M = PartMaps(S, P);
  let Bytes = 0, Rays = 0;
  for (const Id of M) { const C = MapCost(S, Id, P); Rays += C.Rays; Bytes += C.Bytes; }
  return { Bytes, Rays, Maps: M.length, Seconds: M.length ? Seconds(Rays, S.deviceMode) : 0 };
}

// What changes one part's output.  With "All together" every part's mesh is an occluder of every other part; with
// "Match by name" only contact AO (when on) looks at the others.  An atlas re-packs when the enabled parts change.
export function PartFingerprint(S, P) {
  const { deviceMode, set, studyId, lowSource, highSource, selected, resolution, frontDistance, rearDistance, ...Shared } = S;
  const Others = (S.set.isolation === "together" || (S.set.isolation === "name" && P.contactAo))
    ? EnabledParts(S).filter((Q) => Q.id !== P.id).map((Q) => [Q.id, Q.highSource?.name || Q.kind, PartTris(Q)]) : null;
  return JSON.stringify({ Shared, Iso: S.set.isolation, Out: S.set.output, Atlas: S.set.output === "atlas" ? [S.set.atlasRes, AtlasShare(S, P).toFixed(4)] : null,
    Tile: S.set.output === "udim" ? UdimTile(S, P) : null, P: [P.kind, P.lowSource, P.highSource, PartTris(P), PartMaps(S, P), PartRes(S, P), PartCage(S, P, "frontDistance"), PartCage(S, P, "rearDistance"), P.contactAo], Others });
}

function SetEstimate(S) {
  const Device = S.deviceMode === "cpu" ? "cpu" : "gpu", Out = S.set.output, Enabled = EnabledParts(S);
  const ByGroup = Object.fromEntries(GROUPS.map((G) => [G, 0])), PerPart = {};
  let Bytes = 0, Rays = 0, Files = 0;
  const Atlas = new Set();
  for (const P of Enabled) {
    const C = PartCost(S, P);
    PerPart[P.id] = C;
    Rays += C.Rays;
    for (const Id of PartMaps(S, P)) {
      if (Out === "atlas" && !MAP[Id].isVolume) { Atlas.add(Id); continue; }
      const MC = MapCost(S, Id, P);
      Bytes += MC.Bytes; ByGroup[MAP[Id].group] += MC.Bytes; Files++;
    }
  }
  for (const Id of Atlas) { const N = S.set.atlasRes ** 2 * BYTES_PER_TEXEL; Bytes += N; ByGroup[MAP[Id].group] += N; Files++; }
  const J = Jobs(S);
  return { Bytes, Rays, Seconds: J.length ? 0.12 * Enabled.length + Rays / THROUGHPUT[Device] : 0, Device, ByGroup, Maps: J.length, Jobs: J.length,
    Surface: J.filter((E) => !MAP[E.Map].isVolume).length, Parts: Enabled.length, TotalParts: S.set.parts.length, Files, PerPart };
}

function SetRequest(S) {
  const Out = S.set.output;
  return {
    schema: "frontier.bake-request.v2", device: S.deviceMode,
    set: { name: S.set.name, output: Out, isolation: S.set.isolation, atlas: Out === "atlas" ? { resolution: S.set.atlasRes, padding: S.padding, packing: "by-area" } : null, udim: Out === "udim" ? { firstTile: 1001 } : null },
    shared: { samples: S.samples, aoDistance: S.aoDistance, thicknessRange: S.thicknessRange, padding: S.padding, normalY: S.normalY },
    parts: EnabledParts(S).map((P) => {
      const M = PartMaps(S, P), Surface = M.filter((Id) => !MAP[Id].isVolume);
      return {
        id: P.id, name: P.name, kind: P.kind, category: KIND[P.kind].Category, lowSource: P.lowSource, highSource: P.highSource, tris: PartTris(P),
        matchBy: S.set.isolation === "name" ? Slug(P.name) : null, contactAo: S.set.isolation === "name" ? P.contactAo : S.set.isolation === "together",
        tile: Out === "udim" ? UdimTile(S, P) : null, atlasShare: Out === "atlas" ? +AtlasShare(S, P).toFixed(4) : null,
        surface: Surface.length ? { resolution: Out === "atlas" ? S.set.atlasRes : PartRes(S, P), channels: Surface, frontDistance: PartCage(S, P, "frontDistance"), rearDistance: PartCage(S, P, "rearDistance"),
          files: Surface.map((Id) => FileName(S, P, Id)) } : null,
        volume: M.includes("volumeSdf") ? { nx: S.sdfRes, ny: S.sdfRes, nz: S.sdfRes, padding: S.sdfPadding, signMode: S.sdfSigned ? "signed" : "unsigned", file: FileName(S, P, "volumeSdf") } : null,
      };
    }),
  };
}
