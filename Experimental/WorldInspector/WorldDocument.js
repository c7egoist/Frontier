// WorldDocument.js — the World Inspector document.
//
// The cards edit the same records World Mirror edits: the showcase rows and values (ShowcaseGalleryScene.js) for the
// sun, atmosphere, clouds, moon, stars, camera, render settings and every scene object, plus singleton records for the
// panels the showcase does not instance (post, wind, lens flare, fogs, precipitation, rainbow).  Field ranges, units,
// decimals and defaults come from NativePanels.json (the C++ inspector catalogue), never from hand-copied numbers.
// Compile() runs World Mirror's own CompileLiveGtxScene, so every graphic reads exactly what the renderer would.

import { ShowcaseInitialRows, ShowcaseInitialValues, CompileLiveGtxScene } from "../FrontierWorldMirror/ShowcaseGalleryScene.js";
import { Solar } from "../FrontierWorldMirror/Solar.mjs";
import { ConvertAzimuthElevationToWorldAxis } from "../FrontierWorldMirror/CelestialEphemerisSolver.js";

export const STORE_KEY = "frontier.world-inspector.v1";

// Panels the showcase scene does not instance.  They get a row under World so CompileLiveGtxScene sees them
// (wind drives cloud drift, post drives exposure).
export const EXTRA_PANELS = [
  ["post", "Post Process"],
  ["wind", "Wind"],
  ["flare", "Lens Flare"],
  ["height-fog", "Height Fog"],
  ["aerial-fog", "Aerial Perspective"],
  ["precipitation", "Precipitation"],
  ["rainbow", "Rainbow"],
];

let Catalogue = null;

export function UseCatalogue(Panels) {
  Catalogue = Panels;
}

export function CataloguePanels() {
  if (!Catalogue) throw new Error("World Inspector: NativePanels catalogue not loaded");
  return Catalogue;
}

export function FieldMeta(Panel, Label) {
  const Field = CataloguePanels()[Panel]?.find((F) => F.Label === Label);
  if (!Field) return null;
  const Decimals = Number.isFinite(Field.Decimals) ? Field.Decimals : 2;
  return {
    Panel,
    Label,
    Control: Field.Control || "Readout",
    Group: Field.Group || "",
    Min: Field.Minimum,
    Max: Field.Maximum,
    Decimals,
    Step: Decimals <= 0 ? 1 : Number((10 ** -Decimals).toFixed(Decimals)),
    Unit: Field.Unit || "",
    Options: Field.Options || null,
    Default: Field.Default,
    ReadOnly: !!Field.ReadOnly || Field.Control === "Readout",
  };
}

export function PanelFields(Panel, Group = null) {
  return (CataloguePanels()[Panel] || []).filter((F) => Group === null || F.Group === Group).map((F) => FieldMeta(Panel, F.Label));
}

function CatalogueRecord(Panel) {
  const Rec = {};
  for (const F of CataloguePanels()[Panel] || []) {
    if (F.Control === "Readout" || F.Default === "—") continue;
    Rec[F.Label] = Array.isArray(F.Default) ? [...F.Default] : F.Default;
  }
  return Rec;
}

export function CreateDocument() {
  const Rows = ShowcaseInitialRows.map((R) => ({ ...R }));
  const Values = structuredClone(ShowcaseInitialValues);
  for (const [Panel, Name] of EXTRA_PANELS) {
    if (Rows.some((R) => R.Panel === Panel)) continue;
    Rows.push({ Id: Panel, Name, Panel, Parent: "world", Icon: "", Description: "" });
    Values[Panel] = CatalogueRecord(Panel);
  }
  // Without a wind row CompileLiveGtxScene drifts the clouds at 6.5 m/s from 25°.  Seed the wind record with exactly
  // that, so adding the card does not move the showcase sky.
  Object.assign(Values.wind, { Speed: 6.5, Bearing: 25 });
  // Catalogue fields the showcase record does not author (e.g. sun Speed / Day duration) start at the catalogue default.
  for (const Row of Rows) {
    if (!CataloguePanels()[Row.Panel] || ["geometry", "light", "group"].includes(Row.Panel)) continue;
    const Rec = (Values[Row.Id] ??= {});
    for (const [K, V] of Object.entries(CatalogueRecord(Row.Panel))) if (Rec[K] === undefined) Rec[K] = V;
  }
  const FirstObject = Rows.find((R) => R.Panel === "geometry")?.Id || null;
  const FirstLight = Rows.find((R) => R.Panel === "light")?.Id || null;
  const FirstGroup = Rows.find((R) => R.Panel === "group")?.Id || null;
  return { Version: 1, Rows, Values, Hidden: {}, Selected: { geometry: FirstObject, light: FirstLight, group: FirstGroup } };
}

export function RowOf(Doc, Panel) {
  return Doc.Rows.find((R) => R.Panel === Panel) || null;
}

export function RecordOf(Doc, PanelOrId) {
  const Row = Doc.Rows.find((R) => R.Id === PanelOrId) || RowOf(Doc, PanelOrId);
  return Row ? (Doc.Values[Row.Id] ??= {}) : {};
}

export function ObjectRows(Doc, Panel = "geometry") {
  return Doc.Rows.filter((R) => R.Panel === Panel);
}

// Reads a catalogue field, honouring the moon's "moon0:" carrier the showcase record uses.
export function Read(Doc, PanelOrId, Label) {
  const Rec = RecordOf(Doc, PanelOrId);
  if (Rec[`moon0:${Label}`] !== undefined) return Rec[`moon0:${Label}`];
  if (Rec[Label] !== undefined) return Rec[Label];
  const Row = Doc.Rows.find((R) => R.Id === PanelOrId) || RowOf(Doc, PanelOrId);
  return FieldMeta(Row?.Panel || PanelOrId, Label)?.Default;
}

const SUN_CLOCK = ["Local Hours", "Month", "Day of Month", "Latitude", "Longitude"];

export function SolveSunDirection(Rec) {
  const Solved = Solar({
    LocalHours: Number(Rec["Local Hours"] ?? 12),
    Month: Number(Rec.Month ?? 10),
    Day: Number(Rec["Day of Month"] ?? 4),
    Latitude: Number(Rec.Latitude ?? -26.19),
    Longitude: Number(Rec.Longitude ?? 28.32),
    UtcOffset: Number(Rec.UtcOffset ?? 2),
  });
  return ConvertAzimuthElevationToWorldAxis(Solved.Azimuth, Solved.Elevation).map((C) => Number(C.toFixed(4)));
}

// The same side effects World Mirror's inspector applies (Inspectors.jsx Change()): the clock re-solves the sun
// direction, a moon preset picks its size, and speed / day duration stay coupled.
export function Edit(Doc, PanelOrId, Label, Next) {
  const Row = Doc.Rows.find((R) => R.Id === PanelOrId) || RowOf(Doc, PanelOrId);
  if (!Row) return;
  const Rec = (Doc.Values[Row.Id] ??= {});
  if (Rec[`moon0:${Label}`] !== undefined) Rec[`moon0:${Label}`] = Next;
  Rec[Label] = Next;
  if (Row.Panel === "sun" && SUN_CLOCK.includes(Label)) Rec.Direction = SolveSunDirection(Rec);
  if (Row.Panel === "moon" && Label === "Preset") Edit(Doc, Row.Id, "Size", [0.52, 1.6, 1.2, 1.1, 2.4, 0.6][Next] ?? 0.52);
  if (Row.Panel === "sun" && Label === "Speed" && Next < 4) Rec["Day duration"] = 24 / [1, 8, 30, 100][Next];
  if (Row.Panel === "sun" && Label === "Day duration") Rec.Speed = 4;
}

// Day-cycle animation, the same arithmetic as the World Mirror sun inspector's 100 ms ticker.
export function AdvanceClock(Doc, Seconds) {
  const Rec = RecordOf(Doc, "sun");
  if (!Rec.Animate || !(Seconds > 0)) return false;
  const Duration = Number(Rec["Day duration"] ?? 3) || 3;
  Rec["Local Hours"] = (Number(Rec["Local Hours"] ?? 12) + (Seconds * 24) / Duration / 60) % 24;
  Rec.Direction = SolveSunDirection(Rec);
  return true;
}

export function ResetPanel(Doc, PanelOrId) {
  const Fresh = CreateDocument();
  const Row = Doc.Rows.find((R) => R.Id === PanelOrId) || RowOf(Doc, PanelOrId);
  if (Row && Fresh.Values[Row.Id]) Doc.Values[Row.Id] = structuredClone(Fresh.Values[Row.Id]);
}

let CompileCache = { Key: "", Scene: null };

export function Compile(Doc) {
  const Key = JSON.stringify([Doc.Values, Doc.Hidden]);
  if (Key === CompileCache.Key && CompileCache.Scene) return CompileCache.Scene;
  const Scene = CompileLiveGtxScene(Doc.Rows, Doc.Values, Doc.Hidden || {});
  CompileCache = { Key, Scene };
  return Scene;
}

export function Save(Doc, Storage = globalThis.localStorage) {
  try {
    Storage?.setItem(STORE_KEY, JSON.stringify({ Version: 1, Values: Doc.Values, Hidden: Doc.Hidden, Selected: Doc.Selected }));
    return true;
  } catch {
    return false;
  }
}

export function Load(Storage = globalThis.localStorage) {
  const Doc = CreateDocument();
  try {
    const Raw = Storage?.getItem(STORE_KEY);
    if (!Raw) return Doc;
    const Saved = JSON.parse(Raw);
    if (Saved?.Version !== 1) return Doc;
    for (const [Id, Rec] of Object.entries(Saved.Values || {})) if (Doc.Values[Id] && Rec && typeof Rec === "object") Doc.Values[Id] = { ...Doc.Values[Id], ...Rec };
    for (const [Id, Off] of Object.entries(Saved.Hidden || {})) if (Off && Doc.Rows.some((R) => R.Id === Id)) Doc.Hidden[Id] = true;
    for (const K of ["geometry", "light", "group"]) if (Doc.Rows.some((R) => R.Id === Saved.Selected?.[K])) Doc.Selected[K] = Saved.Selected[K];
  } catch {
    /* corrupt store: start from the showcase */
  }
  return Doc;
}

export function ExportJson(Doc) {
  const Out = {};
  for (const Row of Doc.Rows) if (Doc.Values[Row.Id] && Row.Panel !== "group") Out[Row.Id] = { Panel: Row.Panel, Name: Row.Name, ...Doc.Values[Row.Id] };
  return JSON.stringify({ Format: "frontier.world-inspector", Version: 1, Records: Out }, null, 2);
}
