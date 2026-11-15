// BakeModel.js — pure settings model behind the Map Baking inspector card.
//
// Settings mirror TextureStudio's BakingWorkspace state field for field, so a request built here can be handed straight to
// its bakers (bakeMeshMaps / bakeVolumeSdf / GpuBakeSession).  The card itself never bakes: it estimates cost, tracks
// whether results are stale, and asks its host to run the bake.

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
  for (const K of ["lowSource", "highSource"]) S[K] = S[K] && typeof S[K] === "object" ? { name: String(S[K].name || "mesh").slice(0, 80), size: +S[K].size || 0 } : null;
  return S;
}

export function SetValue(S, Key, Value) { return Normalise({ ...S, [Key]: Value }); }
export function ToggleMap(S, Id) { return Normalise({ ...S, selected: S.selected.includes(Id) ? S.selected.filter((E) => E !== Id) : [...S.selected, Id] }); }
export function SetGroup(S, Group, On) {
  const Ids = BAKE_MAP_CATALOG.filter((M) => M.group === Group).map((M) => M.id);
  return Normalise({ ...S, selected: On ? [...S.selected, ...Ids] : S.selected.filter((E) => !Ids.includes(E)) });
}

export function ExportPreset(S) {
  const { lowSource, highSource, ...Settings } = S;
  return JSON.stringify({ schema: "frontier.bake.v1", savedAt: new Date().toISOString(), settings: Settings }, null, 2);
}

export function Load(Text) {
  const Raw = typeof Text === "string" ? JSON.parse(Text) : Text;
  const Body = Raw?.settings || Raw;
  if (!Body || typeof Body !== "object" || !Array.isArray(Body.selected)) throw Error("Not a bake preset — no map selection.");
  return Normalise(Body);
}

// The payload a host bakes from — split exactly the way BakingWorkspace.runBake splits it.
export function Request(S) {
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
  const { deviceMode, ...Rest } = S;
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

export function MapCost(S, Id) {
  const P = MAP_PARAMS[Id], Texels = S.resolution * S.resolution;
  if (P.Volume) {
    const Voxels = S.sdfRes ** 3;
    return { Bytes: Voxels * 4, Rays: Voxels * Math.ceil(Math.log2(Math.max(2, StudyTris(S)))) * 6, Voxels };
  }
  return { Bytes: Texels * BYTES_PER_TEXEL, Rays: Math.round(P.Rays(S) * Texels * UV_FILL) };
}

export function Estimate(S) {
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

export const Bytes = (N) => (N >= 1048576 ? `${(N / 1048576).toFixed(N >= 10485760 ? 0 : 1)} MB` : N >= 1024 ? `${Math.round(N / 1024)} KB` : `${N} B`);
export const Count = (N) => (N >= 1e9 ? `${(N / 1e9).toFixed(1)} G` : N >= 1e6 ? `${(N / 1e6).toFixed(N >= 1e7 ? 0 : 1)} M` : N >= 1e3 ? `${Math.round(N / 1e3)} k` : String(Math.round(N)));
export const Duration = (Sec) => (Sec >= 60 ? `${Math.floor(Sec / 60)} m ${Math.round(Sec % 60)} s` : Sec >= 10 ? `${Math.round(Sec)} s` : Sec >= 1 ? `${Sec.toFixed(1)} s` : `${Math.max(1, Math.round(Sec * 1000))} ms`);
