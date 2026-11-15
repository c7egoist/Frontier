// Model checks for the Material Inspector card (pure Node, no DOM).
//   node Experimental/MaterialInspector/Scripts/CheckMaterialInspector.mjs
// Optional interop: point TS_DIR at a TextureStudio checkout (…/Experimental/TextureStudio) to validate exported documents
// with TextureStudio's own NormalizeMaterialAuthoring and to confirm the copied engine files are unchanged.
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const M = await import(pathToFileURL(ROOT + "MaterialModel.js"));
let Pass = 0, Fail = 0;
const Check = async (Name, Fn) => {
  try { const Note = await Fn(); Pass++; console.log(` ok  ${Name}${Note ? ` — ${Note}` : ""}`); }
  catch (E) { Fail++; console.log(`FAIL ${Name}\n     ${E.stack.split("\n").slice(0, 3).join("\n     ")}`); }
};
const Expect = (C, Msg) => { if (!C) throw new Error(Msg); };
const Throws = (Fn, Msg) => { try { Fn(); } catch { return; } throw new Error(Msg); };
const Surface = (P) => P.Authoring.Layers.find((L) => L.Model === "surface");
const Model = (P, Kind) => P.Authoring.Layers.find((L) => L.Model === Kind);

await Check("catalog materials build and validate", () => {
  const Out = M.CATALOG.map((E) => { const P = M.CreateMaterial(E.id); M.Validate(P); return `${E.id.split("-")[0]}:${P.Authoring.Layers.map((L) => L.Model[0]).join("")}`; });
  Expect(M.CreateMaterial("candy-crimson").Authoring.Layers.map((L) => L.Model).join() === "coat,flakes,surface", "candy strata");
  Expect(M.CreateMaterial("woodland-camouflage-fabric-smooth").Authoring.Layers.length === 1, "camo has no coat");
  return Out.join(" ");
});

await Check("channel registry mirrors TextureStudio PbrChannels (29 keys, groups cover all)", () => {
  Expect(M.CHANNELS.length === 29, `${M.CHANNELS.length} channels`);
  Expect(M.CHANNELS.every((C) => M.GROUPS.includes(C.Group)), "group");
  Expect(M.CHANNELS.every((C) => C.Type !== "scalar" || C.Minimum < C.Maximum), "ranges");
  Expect(Surface(M.CreateMaterial("candy-crimson")).Channels.length === 28 && !Surface(M.CreateMaterial("candy-crimson")).Channels.includes("coverage"), "surface = all but coverage");
});

await Check("ChannelAddress follows the TextureStudio carrier rules", () => {
  const P = M.CreateMaterial("candy-crimson"), Coat = Model(P, "coat"), Fl = Model(P, "flakes"), S = Surface(P);
  Expect(M.ChannelAddress(S, "colour") === "color" && M.ChannelAddress(S, "emissive") === "emissionColor", "surface targets");
  Expect(M.ChannelAddress(Coat, "coverage") === "coat" && M.ChannelAddress(Coat, "roughness") === "coatRoughness" && M.ChannelAddress(Coat, "normal") === "coatNormal", "coat carriers");
  Expect(M.ChannelAddress(Fl, "colour") === "flake-output:colour", "flake outputs");
  const { P: D, Identity } = M.AddDetailLayer(P);
  Expect(M.ChannelAddress(M.FindLayer(D, Identity), "roughness") === `layer:${Identity}:roughness`, "detail address");
});

await Check("values: read defaults, clamp scalars, reject bad colours / vectors", () => {
  let P = M.CreateMaterial("brushed-titanium"); const S = Surface(P);
  Expect(M.ReadChannel(P, S, "sheenRoughness") === 0.55, "default");
  P = M.WriteChannel(P, S, "roughness", 5);
  Expect(P.roughness === 1, "clamped high");
  P = M.WriteChannel(P, S, "iridescenceThickness", -4);
  Expect(P.filmThickness === 0, "clamped low");
  Expect(M.WriteChannel(P, S, "colour", "red") === P, "bad colour ignored");
  Expect(M.WriteChannel(P, S, "normal", [0, 1]) === P, "bad vector ignored");
  Expect(M.WriteChannel(P, S, "colour", "#ABCDEF").color === "#abcdef", "colour lower-cased");
  Throws(() => M.WriteParameter(P, "roughness", NaN), "NaN rejected");
});

await Check("sources: field declares a coded generator; value clears; field draft survives a detour", () => {
  let P = M.CreateMaterial("candy-crimson"); const S = Surface(P);
  const N0 = P.Authoring.Generators.length;
  P = M.SetSourceMode(P, S, "metallic", "field");
  const Src = M.ChannelSource(P, S, "metallic"), G = P.Authoring.Generators.find((E) => E.Identity === Src.Generator);
  Expect(P.Authoring.Generators.length === N0 + 1 && G.Coded && G.Procedure === "noise", "declared");
  Expect(M.FIELD_KNOBS.every((K) => P.Authoring.Inputs[`field:${G.Identity}:${K.Key}`] === K.Default), "knob inputs seeded");
  P = M.SetSourceMode(P, S, "metallic", "ramp", "conic");
  Expect(M.ChannelSource(P, S, "metallic").Mode === "conic", "conic");
  P = M.SetSourceMode(P, S, "metallic", "field");
  Expect(M.ChannelSource(P, S, "metallic").Generator === G.Identity && P.Authoring.Generators.length === N0 + 1, "same generator reused");
  P = M.SetSourceMode(P, S, "metallic", "value");
  Expect(!P.Authoring.Sources.metalness, "value clears the source");
  M.Validate(P);
});

await Check("ramps, stops and angle are sanitised", () => {
  let P = M.CreateMaterial("brushed-titanium"); const S = Surface(P);
  P = M.SetSourceMode(P, S, "colour", "ramp", "radial");
  P = M.PatchSource(P, S, "colour", { Stops: ["#000000"] });
  Expect(M.ChannelSource(P, S, "colour").Stops.length === 2, "<2 stops ignored");
  P = M.PatchSource(P, S, "colour", { Stops: Array.from({ length: 12 }, (_, I) => `#0000${String(I).padStart(2, "0")}`) });
  Expect(M.ChannelSource(P, S, "colour").Stops.length === 8, "max 8 stops");
  P = M.PatchSource(P, S, "colour", { Angle: 900 });
  Expect(M.ChannelSource(P, S, "colour").Angle === 180, "angle clamp");
  Throws(() => M.PatchSource(P, S, "colour", { Texture: { dataUrl: "data:image/png;base64,AAAA", width: 9999, height: 1 } }), "bad texture rejected");
  M.Validate(P);
});

await Check("generators: camouflage seeds its palette, unknown procedure throws", () => {
  let P = M.CreateMaterial("brushed-titanium"); const S = Surface(P);
  const Id = M.ChannelSource(P, S, "roughness").Generator;
  P = M.SetGeneratorProcedure(P, Id, "camouflage");
  Expect([0, 1, 2, 3].every((I) => P.Authoring.Inputs[`field:${Id}:colour${I}`] === M.CamouflagePalette[I]), "palette seeded");
  Expect(P.Authoring.Generators.find((G) => G.Identity === Id).Inputs.length === 10, "camo inputs");
  Throws(() => M.SetGeneratorProcedure(P, Id, "lava"), "unknown generator");
  Expect(M.WriteFieldInput(P, Id, "scale", 500).Authoring.Inputs[`field:${Id}:scale`] === 64, "knob clamp");
});

await Check("strata: detail add / preset / remove cleans inputs and sources; base strata cannot be removed", () => {
  let P = M.CreateMaterial("derez-lattice-dissolve-controlvehicle");
  const R = M.AddDetailLayer(P); P = R.P;
  const Order = P.Authoring.Layers.map((L) => L.Model).join();
  Expect(Order === "coat,detail,surface", Order);
  P = M.ApplyDetailPreset(P, R.Identity, "camouflage-smooth");
  Expect(M.ChannelSource(P, M.FindLayer(P, R.Identity), "colour").Mode === "field", "preset field");
  P = M.RemoveLayer(P, R.Identity);
  Expect(!M.FindLayer(P, R.Identity) && !JSON.stringify(P.Authoring.Inputs).includes(`layer:${R.Identity}`) && !JSON.stringify(P.Authoring.Sources).includes(`layer:${R.Identity}`), "cleaned");
  Expect(M.RemoveLayer(P, Surface(P).Identity) === P, "surface protected");
  let Full = P; for (let I = 0; I < 20; I++) Full = M.AddDetailLayer(Full).P;
  Expect(Full.Authoring.Layers.length === 16, "16-stratum cap");
  M.Validate(Full);
});

await Check("channel lists keep registry order and are never empty", () => {
  let P = M.CreateMaterial("candy-crimson"); const C = Model(P, "coat");
  P = M.SetLayerChannels(P, C.Identity, ["normal", "coverage", "bogus"]);
  Expect(M.FindLayer(P, C.Identity).Channels.join() === "normal,coverage", M.FindLayer(P, C.Identity).Channels.join());
  P = M.SetLayerChannels(P, C.Identity, []);
  Expect(M.FindLayer(P, C.Identity).Channels.join() === "colour", "never empty");
  Expect(M.RemoveChannel(P, C.Identity, "colour") === P, "last channel kept");
});

await Check("Validate rejects malformed documents", () => {
  const Base = M.CreateMaterial("candy-crimson");
  const Bad = (Mutate, Msg) => { const P = structuredClone(Base); Mutate(P); Throws(() => M.Validate(P), Msg); };
  Bad((P) => { P.Authoring.Layers[1].Identity = P.Authoring.Layers[0].Identity; }, "duplicate identity");
  Bad((P) => { P.Authoring.Layers[0].Model = "glitter"; }, "unknown model");
  Bad((P) => { P.Authoring.Sources.color = { Mode: "magic" }; }, "unknown source mode");
  Bad((P) => { P.Authoring.Sources.color = { Mode: "field", Generator: "00000000-0000-0000-0000-000000000000" }; }, "missing generator");
  Bad((P) => { P.Authoring.Sources.color = { Mode: "linear", Stops: ["#fff"] }; }, "bad stops");
  Bad((P) => { P.Authoring.Inputs["__proto__"] = 1; Object.defineProperty(P.Authoring.Inputs, "__proto__", { value: 1, enumerable: true }); }, "prototype key");
  Bad((P) => { P.Authoring.Version = 1; }, "version");
});

await Check("TOML export: coat only when enabled, flakes palette, emission block", () => {
  let P = M.CreateMaterial("candy-crimson");
  let T = M.ExportToml(P);
  Expect(T.startsWith("Format = 1\nName = \"Candy Crimson\"") && T.includes('Category = "Coating"') && T.includes("[AutomotivePaint]"), "full");
  P = M.PatchLayer(P, Model(P, "coat").Identity, { Enabled: false });
  P = M.PatchLayer(P, Model(P, "flakes").Identity, { Enabled: false });
  T = M.ExportToml(P);
  Expect(!T.includes("Coating") && !T.includes("AutomotivePaint"), "disabled strata skipped");
  Expect(M.ExportToml(M.CreateMaterial("molten-magma-crust-animated")).includes("[Emission]"), "emission");
});

await Check("JSON round trip (alloy.material.v6) is lossless", () => {
  const P = M.CreateMaterial("woodland-camouflage-fabric-smooth");
  const Back = M.Load(M.ExportJson(P));
  Expect(JSON.stringify(Back) === JSON.stringify(P), "round trip");
  Expect(JSON.stringify(M.Load(JSON.stringify(P))) === JSON.stringify(P), "bare document");
  Throws(() => M.Load('{"schema":"alloy.material.v6","material":{}}'), "empty rejected");
});

await Check("previews: samples are deterministic, in range, camo uses only its palette", () => {
  const P = M.CreateMaterial("woodland-camouflage-fabric-smooth"), S = Surface(P), Src = M.ChannelSource(P, S, "colour");
  const Palette = new Set(M.CamouflagePalette.map((C) => M.HexRgb(C).join()));
  for (let I = 0; I < 200; I++) {
    const U = (I * 0.137) % 1, V = (I * 0.291) % 1, A = M.SampleSource(P, Src, U, V);
    Expect(A.join() === M.SampleSource(P, Src, U, V).join(), "deterministic");
    Expect(Palette.has(A.join()), `off-palette ${A}`);
  }
  for (const Shape of M.RAMP_SHAPES) for (let I = 0; I < 50; I++) {
    const C = M.SampleSource(P, { Mode: Shape, Stops: ["#000000", "#ffffff"], Angle: 30 }, Math.random(), Math.random());
    Expect(C.every((V) => V >= 0 && V <= 255), `${Shape} range`);
  }
  Expect(M.StopsColour(["#000000", "#ffffff"], 0.5).every((V) => Math.abs(V - 127.5) < 1e-9), "midpoint");
});

await Check("readouts summarise every source kind", () => {
  const P = M.CreateMaterial("derez-lattice-dissolve-controlvehicle"), S = Surface(P);
  const Kinds = ["colour", "roughness", "emissive", "normal", "iridescenceThickness"].map((K) => `${K}=${M.ChannelReadout(P, S, K).Kind}:${M.ChannelReadout(P, S, K).Text}`);
  Expect(M.ChannelReadout(P, S, "roughness").Kind === "ramp" && M.ChannelReadout(P, S, "emissive").Kind === "field", "kinds");
  Expect(M.ChannelReadout(P, S, "normal").Text === "Flat +Z" && M.ChannelReadout(P, S, "iridescenceThickness").Text === "380 nm", "vector / large-range text");
  return Kinds.join(" ");
});

await Check("model stays DOM-free; card stays a single card", () => {
  const Src = readFileSync(ROOT + "MaterialModel.js", "utf8");
  Expect(!/\b(document|window|localStorage)\.[a-zA-Z]/.test(Src), "model touches the DOM");
  const Ui = readFileSync(ROOT + "MaterialInspector.js", "utf8");
  Expect((Ui.match(/<article /g) || []).length === 1, "one <article> card");
  Expect(!/three|WebGL|getContext\("webgl/i.test(Ui), "no renderer");
});

const TS = process.env.TS_DIR || "/tmp/ts/Experimental/TextureStudio";
if (existsSync(TS + "/Engine/Materials/MaterialSpecification.js")) {
  await Check("interop: copied engine files are byte-identical to TextureStudio", () => {
    for (const F of ["FieldSpecification.js", "textureSource.js"])
      Expect(readFileSync(ROOT + "Engine/" + F, "utf8") === readFileSync(`${TS}/Engine/Materials/${F}`, "utf8"), F);
  });
  await Check("interop: TextureStudio NormalizeMaterialAuthoring accepts every exported document", async () => {
    const T = await import(pathToFileURL(`${TS}/Engine/Materials/MaterialSpecification.js`));
    let P = M.CreateMaterial("candy-crimson");
    P = M.AddDetailLayer(P).P;
    P = M.ApplyDetailPreset(P, P.Authoring.Layers.find((L) => L.Model === "detail").Identity, "cells");
    P = M.SetSourceMode(P, Surface(P), "sheen", "ramp", "conic");
    for (const Doc of [P, ...M.CATALOG.map((E) => M.CreateMaterial(E.id))]) T.NormalizeMaterialAuthoring(M.Load(M.ExportJson(Doc)).Authoring);
    Expect(JSON.stringify(Object.keys(T.PbrChannels).sort()) === JSON.stringify(M.CHANNELS.map((C) => C.Key).sort()), "channel keys");
    for (const C of M.CHANNELS) Expect(T.PbrChannels[C.Key].Target === C.Target, `target ${C.Key}`);
    return `${M.CATALOG.length + 1} documents`;
  });
} else console.log("skip interop (set TS_DIR to a TextureStudio checkout)");

console.log(`\n${Pass} passed, ${Fail} failed`);
process.exit(Fail ? 1 : 0);
