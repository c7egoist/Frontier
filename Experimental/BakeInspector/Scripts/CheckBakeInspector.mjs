// Model checks for the Map Baking card (pure Node, no DOM).
//   node Experimental/BakeInspector/Scripts/CheckBakeInspector.mjs
// Optional: TS_DIR=…/Experimental/TextureStudio confirms the copied catalogs still match TextureStudio's BakingEngine.js.
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const B = await import(pathToFileURL(ROOT + "BakeModel.js"));
let Pass = 0, Fail = 0;
const Check = async (Name, Fn) => {
  try { const Note = await Fn(); Pass++; console.log(` ok  ${Name}${Note ? ` — ${Note}` : ""}`); }
  catch (E) { Fail++; console.log(`FAIL ${Name}\n     ${E.stack.split("\n").slice(0, 3).join("\n     ")}`); }
};
const Expect = (C, Msg) => { if (!C) throw new Error(Msg); };
const Throws = (Fn, Msg) => { try { Fn(); } catch { return; } throw new Error(Msg); };

await Check("catalog: 18 maps in 4 groups, 5 studies, every map has an editor spec", () => {
  Expect(B.BAKE_MAP_CATALOG.length === 18 && B.BAKE_STUDY_SHAPES.length === 5, "counts");
  for (const M of B.BAKE_MAP_CATALOG) { Expect(B.GROUPS.includes(M.group), `group ${M.group}`); Expect(B.MAP_PARAMS[M.id], `params ${M.id}`); }
  for (const P of Object.values(B.MAP_PARAMS)) for (const K of P.Keys) Expect(B.SETTINGS[K], `setting ${K}`);
  return B.GROUPS.map((G) => `${G} ${B.BAKE_MAP_CATALOG.filter((M) => M.group === G).length}`).join(" · ");
});

await Check("defaults match TextureStudio's BakingWorkspace", () => {
  const S = B.Create();
  Expect(S.studyId === "teapot" && S.resolution === 512 && S.samples === 12 && S.sdfRes === 36 && S.sdfSigned && S.padding === 6, "defaults");
  Expect(S.selected.join() === "normalTangent,ao,curvature,height,volumeSdf", `selection ${S.selected}`);
});

await Check("normalise clamps every setting and drops unknown maps", () => {
  const S = B.Normalise({ samples: 999, aoDistance: -3, padding: 99, resolution: 333, sdfRes: 7, normalY: "sideways", deviceMode: "quantum", selected: ["ao", "nope", "ao", "volumeSdf"], studyId: "x" });
  Expect(S.samples === 36 && S.aoDistance === 0.1 && S.padding === 14, "ranges");
  Expect(S.resolution === 512 && S.sdfRes === 36 && S.normalY === "+Y" && S.deviceMode === "auto" && S.studyId === "teapot", "enums");
  Expect(S.selected.join() === "ao,volumeSdf", "selection deduped and catalog-ordered");
});

await Check("toggle and group selection", () => {
  let S = B.ToggleMap(B.Create(), "ao");
  Expect(!S.selected.includes("ao"), "off");
  S = B.SetGroup(S, "Masks & IDs", true);
  Expect(B.BAKE_MAP_CATALOG.filter((M) => M.group === "Masks & IDs").every((M) => S.selected.includes(M.id)), "group on");
  S = B.SetGroup(S, "Normals", false);
  Expect(!S.selected.some((Id) => B.MAP[Id].group === "Normals"), "group off");
});

await Check("request splits surface maps from the volume like runBake", () => {
  const R = B.Request(B.Create());
  Expect(R.surface.channels.join() === "normalTangent,ao,curvature,height" && R.surface.resolution === 512, "surface");
  Expect(R.volume.nx === 36 && R.volume.signMode === "signed", "volume");
  const OnlyVol = B.Request(B.Normalise({ selected: ["volumeSdf"] }));
  Expect(OnlyVol.surface === null && OnlyVol.volume, "volume only");
  Expect(B.Request(B.Normalise({ selected: ["ao"] })).volume === null, "surface only");
});

await Check("estimates scale with resolution, samples and device", () => {
  const S = B.Create(), E = B.Estimate(S);
  Expect(E.Bytes === 4 * 512 * 512 * 4 + 36 ** 3 * 4, `bytes ${E.Bytes}`);
  const Flat = B.Normalise({ ...S, selected: ["normalTangent", "ao", "height"] }), F = B.Estimate(Flat), Big = B.Estimate(B.SetValue(Flat, "resolution", 1024));
  Expect(Big.Bytes === F.Bytes * 4 && Math.abs(Big.Rays / F.Rays - 4) < 0.01, "surface cost scales with texels");
  Expect(B.Estimate(B.SetValue(S, "sdfRes", 64)).Bytes - E.Bytes === (64 ** 3 - 36 ** 3) * 4, "volume cost scales with voxels");
  Expect(B.Estimate(B.SetValue(S, "samples", 24)).Rays > E.Rays, "more samples → more rays");
  Expect(B.Estimate(B.SetValue(S, "deviceMode", "cpu")).Seconds > E.Seconds * 10, "cpu slower");
  Expect(B.MapCost(S, "curvature").Rays === 0 && B.MapCost(S, "uvIslandId").Rays === 0, "derived / raster maps are free");
  Expect(B.Estimate(B.Normalise({ selected: [] })).Seconds === 0, "empty queue");
  return `${B.Bytes(E.Bytes)} · ${B.Count(E.Rays)} rays · ≈${B.Duration(E.Seconds)} GPU`;
});

await Check("fingerprint ignores the device but tracks output-affecting settings", () => {
  const S = B.Create();
  Expect(B.Fingerprint(S) === B.Fingerprint(B.SetValue(S, "deviceMode", "cpu")), "device ignored");
  Expect(B.Fingerprint(S) !== B.Fingerprint(B.SetValue(S, "padding", 2)), "padding tracked");
});

await Check("shared-setting hints", () => {
  const S = B.Create();
  Expect(B.SharedWith(S, "frontDistance", "normalTangent").includes("Height / Displacement"), "cage shared with height");
  Expect(B.SharedWith(S, "samples", "ao").length === 0, "ao alone uses samples by default");
});

await Check("preset round trip and load errors", () => {
  const S = B.Normalise({ ...B.Create(), samples: 20, lowSource: { name: "low.obj", size: 10 } });
  const Text = B.ExportPreset(S), Raw = JSON.parse(Text);
  Expect(Raw.schema === "frontier.bake.v1" && !("lowSource" in Raw.settings), "sources not exported");
  Expect(B.Load(Text).samples === 20, "reload");
  Throws(() => B.Load("{}"), "no selection");
  Throws(() => B.Load("nope"), "not json");
});

await Check("formatters", () => {
  Expect(B.Bytes(1048576) === "1.0 MB" && B.Bytes(2048) === "2 KB" && B.Count(6.7e6) === "6.7 M" && B.Duration(0.141) === "141 ms" && B.Duration(75) === "1 m 15 s", "format");
});

// ------------------------------------------------------------------------------------------------ bake sets
await Check("bake set: outfit template = body parts + clothes + props, single study untouched", () => {
  const S = B.UseTemplate(B.Create(), "outfit");
  Expect(S.set.parts.length === 12 && S.set.output === "parts" && S.set.isolation === "name", "template");
  const Cats = Object.fromEntries(B.PART_CATEGORIES.map((C) => [C, S.set.parts.filter((P) => B.KIND[P.kind].Category === C).length]));
  Expect(Cats.Body === 4 && Cats.Clothing === 6 && Cats.Props === 2, JSON.stringify(Cats));
  Expect(new Set(S.set.parts.map((P) => P.id)).size === 12, "unique ids");
  Expect(B.FindPart(S, "p3").resolution === 256 && B.FindPart(S, "p3").maps.join() === "normalTangent,ao", "eyes: low res, own small queue");
  Expect(B.Create().set === null && B.Request(B.Create()).schema === "frontier.bake-request.v1", "single study still v1");
  Expect(B.UseTemplate(S, null).set === null, "back to a single study");
  return Object.entries(Cats).map(([C, N]) => `${C} ${N}`).join(" · ");
});

await Check("bake set: estimate sums enabled parts; toggles, categories, add / duplicate / remove", () => {
  let S = B.UseTemplate(B.Create(), "outfit");
  const E = B.Estimate(S), Sum = Object.values(E.PerPart).reduce((A, C) => A + C.Rays, 0);
  Expect(E.Parts === 12 && E.Rays === Sum && E.Jobs === B.Jobs(S).length && E.Files === E.Jobs, "sum over parts");
  const Off = B.TogglePart(S, "p6"), E2 = B.Estimate(Off);
  Expect(E2.Parts === 11 && E2.Rays === Sum - E.PerPart.p6.Rays, "disabled part drops out");
  const NoProps = B.SetCategory(S, "Props", false);
  Expect(B.EnabledParts(NoProps).every((P) => B.KIND[P.kind].Category !== "Props"), "category off");
  const { Next, Id } = B.AddPart(S, "hat");
  Expect(Next.set.parts.length === 13 && B.FindPart(Next, Id).name === "Hat 2", "add numbered part");
  const D = B.DuplicatePart(Next, Id);
  Expect(D.Next.set.parts.length === 14 && B.FindPart(D.Next, D.Id).name === "Hat 2 copy", "duplicate");
  Expect(B.RemovePart(D.Next, D.Id).set.parts.length === 13, "remove");
  Expect(B.Jobs(S).map((J) => B.KIND[B.FindPart(S, J.Part).kind].Category).join().replace(/(\w+)(,\1)+/g, "$1") === "Body,Clothing,Props", "jobs ordered body → clothing → props");
  return `${E.Parts} parts · ${E.Jobs} jobs · ${B.Bytes(E.Bytes)} · ${B.Duration(E.Seconds)}`;
});

await Check("bake set: per-part queue, resolution and cage override the set", () => {
  let S = B.UseTemplate(B.Create(), "outfit");
  S = B.TogglePartMap(S, "p6", "ao");
  Expect(B.PartMaps(S, B.FindPart(S, "p6")).join() === "normalTangent,curvature,height,volumeSdf" && B.FindPart(S, "p1").maps === null, "own queue copies then toggles");
  S = B.EditPart(S, "p6", { resolution: 1024, cage: { frontDistance: 0.3, rearDistance: 0.05 } });
  const J = B.FindPart(S, "p6");
  Expect(B.PartRes(S, J) === 1024 && B.PartCage(S, J, "frontDistance") === 0.3 && B.PartCage(S, B.FindPart(S, "p1"), "frontDistance") === S.frontDistance, "overrides");
  const R = B.Request(S), RJ = R.parts.find((P) => P.id === "p6");
  Expect(R.schema === "frontier.bake-request.v2" && RJ.surface.resolution === 1024 && RJ.surface.frontDistance === 0.3 && !RJ.surface.channels.includes("ao"), "request carries overrides");
  Expect(RJ.surface.files[0] === "ranger_field_jacket_normalTangent.png" && RJ.matchBy === "field_jacket", "per-part files + match-by-name");
  Expect(B.Normalise({ ...S, set: { ...S.set, parts: [{ id: "p1", kind: "nope", resolution: 333, cage: { frontDistance: 99 } }, { id: "p1", kind: "hat" }] } }).set.parts.map((P) => `${P.id}:${P.kind}:${P.resolution}:${P.cage?.frontDistance}`).join() === "p1:prop:null:0.8,p1x:hat:null:undefined", "normalise parts");
});

await Check("bake set: atlas and UDIM outputs", () => {
  const S = B.UseTemplate(B.Create(), "outfit"), A = B.SetSet(S, "output", "atlas"), U = B.SetSet(S, "output", "udim");
  const EA = B.Estimate(A), Shares = B.EnabledParts(A).reduce((T, P) => T + B.AtlasShare(A, P), 0);
  Expect(Math.abs(Shares - 1) < 1e-9, "atlas shares sum to 1");
  const Union = new Set(B.EnabledParts(A).flatMap((P) => B.PartMaps(A, P)).filter((Id) => !B.MAP[Id].isVolume));
  const Vols = B.EnabledParts(A).filter((P) => B.PartMaps(A, P).includes("volumeSdf")).length;
  Expect(EA.Files === Union.size + Vols && EA.Bytes === Union.size * 4096 ** 2 * 4 + Vols * 36 ** 3 * 4, `atlas files ${EA.Files}`);
  Expect(B.Request(A).parts[0].surface.files[0] === "ranger_normalTangent.png" && B.Request(A).set.atlas.resolution === 4096, "atlas request");
  Expect(B.Request(U).parts.map((P) => P.tile).join() === Array.from({ length: 12 }, (_, I) => 1001 + I).join() && B.Request(U).parts[1].surface.files[0] === "ranger_normalTangent.1002.png", "udim tiles");
  return `atlas ${EA.Files} files ${B.Bytes(EA.Bytes)}`;
});

await Check("bake set: staleness is per part (jacket edit leaves the body fresh)", () => {
  const S = B.UseTemplate(B.Create(), "outfit"), FP = (X, Id) => B.PartFingerprint(X, B.FindPart(X, Id));
  const T = B.EditPart(S, "p6", { cage: { frontDistance: 0.4, rearDistance: 0.2 } });
  Expect(FP(S, "p6") !== FP(T, "p6") && FP(S, "p1") === FP(T, "p1"), "only the jacket changes");
  const NewHigh = B.EditPart(S, "p6", { highSource: { name: "jacket_hi.obj", size: 4e6 } });
  Expect(FP(S, "p1") !== FP(NewHigh, "p1"), "contact AO: a new jacket mesh re-shades the body");
  const Iso = B.EditPart(B.EditPart(S, "p1", { contactAo: false }), "p6", { highSource: { name: "jacket_hi.obj", size: 4e6 } });
  Expect(FP(B.EditPart(S, "p1", { contactAo: false }), "p1") === FP(Iso, "p1"), "without contact AO the body ignores the jacket");
  Expect(FP(S, "p1") === FP(B.SetValue(S, "deviceMode", "cpu"), "p1"), "device never stales");
  Expect(FP(S, "p1") !== FP(B.SetValue(S, "samples", 20), "p1"), "shared ray settings stale every part");
});

await Check("bake set: preset round trip drops mesh files", () => {
  const S = B.EditPart(B.UseTemplate(B.Create(), "kit"), "p1", { highSource: { name: "pack.obj", size: 9 } });
  const Raw = JSON.parse(B.ExportPreset(S));
  Expect(Raw.settings.set.parts.length === 4 && !("highSource" in Raw.settings.set.parts[0]), "no sources in preset");
  Expect(B.Load(B.ExportPreset(S)).set.parts.map((P) => P.name).join() === "Backpack,Rifle,Canteen,Holster", "reload");
});

const TS = process.env.TS_DIR;
if (TS && existsSync(TS)) {
  await Check("catalog copy matches TextureStudio's BakingEngine.js", () => {
    const Src = readFileSync(`${TS}/Engine/BakingEngine.js`, "utf8"), Ours = readFileSync(ROOT + "Engine/BakeCatalog.js", "utf8");
    for (const Table of ["BAKE_MAP_CATALOG", "BAKE_STUDY_SHAPES"]) {
      const Grab = (T) => T.slice(T.indexOf(`export const ${Table}`), T.indexOf("];", T.indexOf(`export const ${Table}`)));
      Expect(Grab(Src) === Grab(Ours), Table);
    }
  });
} else console.log("skip interop (set TS_DIR to a TextureStudio checkout)");

console.log(`\n${Pass} passed, ${Fail} failed`);
process.exit(Fail ? 1 : 0);
