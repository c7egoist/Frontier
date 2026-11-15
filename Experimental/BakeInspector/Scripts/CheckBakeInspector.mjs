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

await Check("workspace stage: every map group has a 2D tile fill, every study a header option", async () => {
  const Src = readFileSync(ROOT + "BakeStage.js", "utf8");
  for (const G of B.GROUPS) Expect(Src.includes(`${/[^A-Za-z]/.test(G) ? `"${G}"` : G}:`), `fill for ${G}`);
  Expect(Src.includes("B.BAKE_STUDY_SHAPES.map"), "study options come from the catalogue");
  return `${B.GROUPS.length} groups · ${B.BAKE_STUDY_SHAPES.length} studies`;
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
