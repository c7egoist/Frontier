// WorldInspectorValidation.mjs — proves the World Inspector cards edit real World Mirror state.
//
// Part A (always): document + compile mapping — every card edit is pushed through CompileLiveGtxScene and the compiled
// scene must move the way the renderer expects; reference formulas behind the infographics are checked against
// published values; every card renders with no NaN / undefined.
// Part B (when jsdom is available): boots index.html in jsdom and drives the cards the way a user does — nav pills,
// sliders, dropdowns, switches, graphic drags, undo / redo, export and reload from storage.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/WorldInspector/WorldInspectorValidation.mjs
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)) + "/";
const Panels = JSON.parse(readFileSync(HERE + "../FrontierWorldMirror/NativePanels.json", "utf8")).Panels;
const Wdoc = await import("./WorldDocument.js");
const D = await import("./WorldDerived.js");
const G = await import("./WorldGraphics.js");
const Scene = await import("../FrontierWorldMirror/ShowcaseGalleryScene.js");

let Passed = 0, Failed = 0;
const Suites = [];
function Check(Cond, Message) {
  if (Cond) Passed++;
  else { Failed++; console.error(`  FAIL ${Message}`); }
}
const Near = (A, B, Tol) => Math.abs(A - B) <= Tol;
async function Suite(Name, Fn) {
  const Before = Failed;
  try { await Fn(); } catch (Err) { Failed++; console.error(`  FAIL ${Name} threw: ${Err.stack || Err}`); }
  Suites.push([Name, Failed === Before]);
  console.log(`${Failed === Before ? "PASS" : "FAIL"}  ${Name}`);
}

Wdoc.UseCatalogue(Panels);
const Fresh = () => Wdoc.CreateDocument();

// ------------------------------------------------------------------------------------------------ Part A
await Suite("1 document mirrors the showcase and compiles identically", () => {
  const Doc = Fresh();
  const Base = Scene.CompileLiveGtxScene(Scene.ShowcaseInitialRows, structuredClone(Scene.ShowcaseInitialValues), {});
  const Mine = Wdoc.Compile(Doc);
  for (const K of ["SunDir", "SunIrradiance", "SkyRadiance"]) Check(Mine[K].every((V, I) => Near(V, Base[K][I], 1e-9)), `${K} matches the showcase compile`);
  Check(JSON.stringify(Mine.Clouds) === JSON.stringify(Base.Clouds), "cloud record identical, wind seeding keeps the 6.5 m/s · 25° drift");
  Check(Near(Mine.ExposureGain, Base.ExposureGain, 1e-12), "exposure gain identical with the added post row");
  Check(JSON.stringify(Mine.Moon) === JSON.stringify(Base.Moon) && JSON.stringify(Mine.Stars) === JSON.stringify(Base.Stars), "moon + stars identical");
  Check(Mine.Primitives.length === Base.Primitives.length && Mine.AreaLights.length === Base.AreaLights.length, "same primitives + lights");
  for (const P of ["post", "wind", "flare", "height-fog", "aerial-fog", "precipitation", "rainbow"]) Check(!!Wdoc.RowOf(Doc, P), `row added for ${P}`);
  Check(Wdoc.Read(Doc, "flare", "Ghosts") === Wdoc.FieldMeta("flare", "Ghosts").Default, "extra panels seeded from NativePanels defaults");
});

await Suite("2 sun clock edits re-solve the direction the renderer uses", () => {
  const Doc = Fresh(), Before = Wdoc.Compile(Doc).SunDir;
  Wdoc.Edit(Doc, "sun", "Local Hours", 7.0);
  const After = Wdoc.Compile(Doc);
  Check(After.SunDir.some((V, I) => !Near(V, Before[I], 1e-3)), "Local Hours moves SunDir");
  const S = D.SolveSun(Wdoc.RecordOf(Doc, "sun"));
  Check(Near(Math.asin(After.SunDir[2]) * 180 / Math.PI, S.Elevation, 0.05), "compiled elevation equals Solar.mjs elevation");
  Wdoc.Edit(Doc, "sun", "Latitude", 60);
  Check(!Near(Wdoc.Compile(Doc).SunDir[2], After.SunDir[2], 1e-3), "latitude moves the sun");
  const Day = D.SunDay({ "Local Hours": 12, Month: 10, "Day of Month": 4, Latitude: -26.19, Longitude: 28.32 });
  // Johannesburg, 4 October: sunrise ≈ 05:40, sunset ≈ 18:10 SAST (geometric horizon, no refraction → a few minutes later / earlier).
  Check(Day.Rise > 5.5 && Day.Rise < 6.0, `sunrise ${D.ClockText(Day.Rise)} near 05:40`);
  Check(Day.Fall > 17.9 && Day.Fall < 18.4, `sunset ${D.ClockText(Day.Fall)} near 18:10`);
  Check(Near(Day.Daylight, 12.4, 0.35), `daylight ${D.DurationText(Day.Daylight)} ≈ 12h 25m`);
  Wdoc.Edit(Doc, "sun", "Animate", true);
  const H0 = Wdoc.RecordOf(Doc, "sun")["Local Hours"];
  Wdoc.AdvanceClock(Doc, 10);
  const Dur = Wdoc.RecordOf(Doc, "sun")["Day duration"];
  Check(Near(Wdoc.RecordOf(Doc, "sun")["Local Hours"] - H0, (10 * 24) / Dur / 60, 1e-9), "day-cycle animation uses the World Mirror ticker arithmetic");
});

await Suite("3 sun colour, intensity, disc and power reach the compile", () => {
  const Doc = Fresh(), I0 = Wdoc.Compile(Doc).SunIrradiance;
  Wdoc.Edit(Doc, "sun", "Intensity", 10.8);
  Check(Near(Wdoc.Compile(Doc).SunIrradiance[1] / I0[1], 2, 1e-9), "Intensity ×2 doubles irradiance");
  Wdoc.Edit(Doc, "sun", "Colour source", 1); Wdoc.Edit(Doc, "sun", "Temperature", 3000);
  const Warm = Wdoc.Compile(Doc).SunIrradiance;
  Check(Warm[0] / Warm[2] > I0[0] / I0[2] * 1.5, "3000 K reddens the sun");
  const K = D.KelvinToLinear(3000), T = Wdoc.Compile(Doc).Solar.Tint;
  Check(K.every((V, I) => Near(V, T[I], 1e-9)), "Kelvin swatch uses the compile's Kelvin curve");
  Wdoc.Edit(Doc, "sun", "Angular Diameter", 4);
  Check(Near(Wdoc.Compile(Doc).SunAngularRadiusRad, (2 * Math.PI) / 180, 1e-9), "angular diameter → disc radius");
  Wdoc.Edit(Doc, "sun", "Powered", false);
  Check(Wdoc.Compile(Doc).SunIrradiance.every((V) => V === 0), "Powered off zeroes the sun");
});

await Suite("4 atmosphere, clouds, moon, stars, wind and EV edits reach the compile", () => {
  const Doc = Fresh();
  Wdoc.Edit(Doc, "atmosphere", "Rayleigh", 2.5); Wdoc.Edit(Doc, "atmosphere", "Mie Anisotropy", 0.6);
  let S = Wdoc.Compile(Doc);
  Check(S.Atmosphere.rayleigh === 2.5 && S.Atmosphere.mieG === 0.6, "atmosphere scattering");
  Wdoc.Edit(Doc, "clouds", "Coverage", 0.8); Wdoc.Edit(Doc, "clouds", "Base", 2500); Wdoc.Edit(Doc, "clouds", "Enabled", false);
  S = Wdoc.Compile(Doc);
  Check(S.Clouds.coverage === 0.8 && S.Clouds.baseM === 2500 && S.Clouds.enabled === false, "clouds coverage / base / enable");
  Wdoc.Edit(Doc, "wind", "Speed", 20); Wdoc.Edit(Doc, "wind", "Bearing", 90);
  S = Wdoc.Compile(Doc);
  Check(Near(S.Clouds.windX, 20, 1e-9) && Near(S.Clouds.windY, 0, 1e-9), "wind card drives cloud drift");
  Wdoc.Edit(Doc, "moon", "Phase", 0.5); Wdoc.Edit(Doc, "moon", "Preset", 2);
  S = Wdoc.Compile(Doc);
  Check(S.Moon.phase === 0.5 && S.Moon.preset === 2 && Near(S.Moon.sizeRad, (1.2 * 0.5 * Math.PI) / 180, 1e-9), "moon phase + preset (preset picks its size)");
  Wdoc.Edit(Doc, "stars", "Limiting magnitude", 7); Wdoc.Edit(Doc, "stars", "Twinkle", false);
  S = Wdoc.Compile(Doc);
  Check(S.Stars.limMag === 7 && S.Stars.twinkle === false, "stars magnitude + twinkle");
  const G0 = S.ExposureGain;
  Wdoc.Edit(Doc, "post", "EV Compensation", 2);
  Check(Near(Wdoc.Compile(Doc).ExposureGain, G0 * 4, 1e-9), "+2 EV quadruples exposure gain");
  Wdoc.Edit(Doc, "camera", "Focal Length", 50);
  Check(Wdoc.Compile(Doc).VerticalFovRad < S.VerticalFovRad, "longer focal length narrows the renderer FOV");
});

await Suite("5 object, light and group edits reach the compile", async () => {
  const H = (await import("./WorldInspector.js")).MountHeadless(Panels, Fresh());
  const Doc = H.State.Doc;
  Check(H.Write("obj:chrome-sphere|Position:2", 0.9), "position write");
  let P = Wdoc.Compile(Doc).Primitives.find((Pr) => Pr.OwnerId === "chrome-sphere");
  Check(Near(P.Center[2], 0.9, 0.2), "position moves the primitive");
  H.Write("mat:chrome-sphere|roughness", 0.6);
  P = Wdoc.Compile(Doc).Primitives.find((Pr) => Pr.OwnerId === "chrome-sphere");
  Check(P.ResolvedMaterial.Channels.roughness.Fill === 0.6, "roughness reaches the resolved material");
  H.Write("mat:chrome-sphere|reflectance", 1.8);
  Check(Wdoc.RecordOf(Doc, "chrome-sphere").Material.Channels.ior.Fill === 1.8, "reflectance shares the IOR carrier");
  H.Act({ act: "mat-type", target: "gold-pedestal", value: "Glass" });
  P = Wdoc.Compile(Doc).Primitives.find((Pr) => Pr.OwnerId === "gold-pedestal");
  Check(P.ResolvedMaterial.Type === "Glass" && P.ResolvedMaterial.Channels.transmission.Fill === 1, "material type preset");
  const L0 = Wdoc.Compile(Doc).AreaLights[0].Radiance[1];
  H.Write("lt:ceiling-softbox|lumens", 4800);
  Check(Near(Wdoc.Compile(Doc).AreaLights[0].Radiance[1], L0 * 2, 1e-9), "lumens ×2 doubles area radiance");
  H.Write("lt:ceiling-softbox|width", 2.4);
  Check(Near(Wdoc.Compile(Doc).AreaLights[0].HalfWidth, 1.2, 1e-9), "light width reaches the quad (Scale + reference kept in step)");
  H.Act({ act: "flip", target: "ceiling-softbox|Powered" });
  Check(Wdoc.Compile(Doc).AreaLights.length === 0, "Powered off removes the emitter");
  H.Act({ act: "hide-flip", target: "chrome-sphere" });
  Check(!Wdoc.Compile(Doc).Primitives.some((Pr) => Pr.OwnerId === "chrome-sphere"), "hiding a member removes it from the render");
  H.Act({ act: "hide", target: "world", value: "1" });
  Check(Wdoc.Compile(Doc).Atmosphere.enabled === false && Wdoc.Compile(Doc).Clouds.enabled === false, "hiding the World group disables the sky");
  H.Act({ act: "undo" });
  Check(Wdoc.Compile(Doc).Atmosphere.enabled === true, "undo restores the group");
  H.Act({ act: "flip", target: "chrome-sphere|Cast shadows" });
  Check(Wdoc.RecordOf(Doc, "chrome-sphere")["Cast shadows"] === false, "shadow switch flips the record");
});

await Suite("6 reference formulas behind the graphics", () => {
  Check(Near(D.AirMass(90), 1, 0.001) && Near(D.AirMass(0), 37.9, 0.3), "Kasten–Young air mass: 1 at zenith, ≈ 38 at horizon");
  Check(D.Beaufort(7).Force === 4 && D.Beaufort(0.2).Force === 0 && D.Beaufort(33).Force === 12, "Beaufort scale");
  Check(Near(D.Visibility(0.003912), 1000, 1e-6), "Koschmieder visibility");
  Check(Near(D.CctFromLinear([1, 1, 1]), 6504, 30), "McCamy CCT of D65 white ≈ 6504 K");
  Check(Near(D.F0FromIor(1.5), 0.04, 1e-9), "F0 at IOR 1.5 is 4 %");
  Check(Near(D.MoonIllumination(0.5), 1, 1e-12) && Near(D.MoonIllumination(0.25), 0.5, 1e-12), "moon illumination");
  const O = D.CameraOptics(50, 36, 8, 10);
  Check(Near(O.Hfov, 39.6, 0.1) && Near(O.Hyperfocal, 10.47, 0.05), "50 mm full frame: 39.6° HFOV, f/8 hyperfocal 10.5 m");
  Check(Near(D.ForwardShare(0), 0.5, 1e-3) && D.ForwardShare(0.78) > 0.9, "HG forward share");
  Check(Near(D.ToneCurve(0, 1, 1), D.Display(0.18, 1), 1e-12), "tone curve at mid grey equals the renderer display transform");
  Check(D.CloudProfile(0.5, 0.5) === 1 && D.CloudProfile(0, 0.5) === 0, "cloud profile ramps match the cloud march");
});

await Suite("7 every card renders cleanly (no NaN, no undefined)", async () => {
  const H = (await import("./WorldInspector.js")).MountHeadless(Panels, Fresh());
  for (const Hour of [3, 6.2, 13.4, 18.1, 22]) {
    Wdoc.Edit(H.State.Doc, "sun", "Local Hours", Hour);
    const Html = H.Html();
    Check((Html.match(/data-card="/g) || []).length === 14, `14 cards at ${Hour} h`);
    const Bad = Html.match(/NaN|undefined|\[object Object\]/);
    Check(!Bad, `clean markup at ${Hour} h${Bad ? `: …${Html.slice(Math.max(0, Bad.index - 120), Bad.index + 20)}` : ""}`);
  }
  for (const Id of Wdoc.ObjectRows(H.State.Doc).map((R) => R.Id)) {
    H.Act({ act: "select", target: "geometry", value: Id });
    Check(!/NaN|undefined/.test(H.Html()), `object card clean for ${Id}`);
  }
  for (const Gid of H.State.Doc.Rows.filter((R) => R.Panel === "group").map((R) => R.Id)) {
    H.Act({ act: "select", target: "group", value: Gid });
    Check(!/NaN|undefined/.test(H.Html()), `group card clean for ${Gid}`);
  }
  const Svg = G.SunChart(D.SunDay({ Latitude: 78, Month: 6, "Day of Month": 21 }), 12, "#fff");
  Check(!/NaN/.test(Svg), "polar day (78° N, June) renders");
  Check(!/NaN/.test(G.SunChart(D.SunDay({ Latitude: 78, Month: 12, "Day of Month": 21 }), 12, "#fff")), "polar night renders");
});

await Suite("8 every catalogue control on the environment cards is a real field", async () => {
  const H = (await import("./WorldInspector.js")).MountHeadless(Panels, Fresh());
  const Html = H.Html();
  const Binds = [...new Set([...Html.matchAll(/data-bind="([^"]+)"/g)].map((M) => M[1].replace(/&quot;/g, '"')))];
  let Unknown = [];
  for (const B of Binds) {
    const [Head, Field] = B.split("|");
    if (/^(obj|mat|lt|grp):/.test(Head) || Head === "render-settings") continue;
    const Row = H.State.Doc.Rows.find((R) => R.Id === Head);
    if (!Row || !Wdoc.FieldMeta(Row.Panel, Field)) Unknown.push(B);
  }
  Check(Unknown.length === 0, `unknown binds: ${Unknown.join(", ")}`);
  Check(Binds.length > 120, `${Binds.length} bound controls`);
  const Targets = [...Html.matchAll(/data-act="(flip|pick)"[^>]*data-target="([^"]+)"/g)].map((M) => M[2]);
  Check(Targets.length > 30, `${Targets.length} switches + pickers`);
  const Before = JSON.stringify(H.State.Doc.Values);
  for (const T of new Set(Targets)) H.Act({ act: "flip", target: T });
  Check(JSON.stringify(H.State.Doc.Values) !== Before, "switches change the document");
});

// Negative control: a document whose sun record keeps a fixed Direction but has its clock edited directly (bypassing
// Edit) must NOT move — the check in suite 2 would otherwise be vacuous.
await Suite("9 negative control: raw clock writes without the re-solve do not move the sun", () => {
  const Doc = Fresh(), Before = Wdoc.Compile(Doc).SunDir;
  Wdoc.RecordOf(Doc, "sun")["Local Hours"] = 7;
  Check(Wdoc.Compile(Doc).SunDir.every((V, I) => V === Before[I]), "fixed Direction wins without Edit()");
});

// ------------------------------------------------------------------------------------------------ Part B
const JsdomDir = process.env.JSDOM_DIR || "/tmp/smoke";
if (!existsSync(resolve(JsdomDir, "node_modules/jsdom"))) console.log("SKIP  UI suites (set JSDOM_DIR to a jsdom install)");
else await Suite("10 UI: boots, switches cards, edits through sliders, dropdowns, switches and drags", async () => {
  const { JSDOM } = createRequire(pathToFileURL(resolve(JsdomDir) + "/"))("jsdom");
  const Html = readFileSync(HERE + "index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const Dom = new JSDOM(Html, { url: "http://localhost:8103/Experimental/WorldInspector/", pretendToBeVisual: true });
  const W = Dom.window, Errors = [];
  W.addEventListener("error", (E) => Errors.push(String(E.error?.stack || E.message)));
  let Painted = 0;
  W.HTMLCanvasElement.prototype.getContext = function (Kind) {
    if (Kind !== "2d") return null;
    return { createImageData: (Wd, Ht) => ({ width: Wd, height: Ht, data: new Uint8ClampedArray(Wd * Ht * 4) }), putImageData: () => { Painted++; }, drawImage: () => {}, getImageData: (X, Y, Wd, Ht) => ({ data: new Uint8ClampedArray(Wd * Ht * 4) }) };
  };
  W.Element.prototype.setPointerCapture = function () {};
  for (const U of [W.URL, globalThis.URL]) { U.createObjectURL = () => "blob:x"; U.revokeObjectURL = () => {}; }
  const Downloads = [];
  W.HTMLAnchorElement.prototype.click = function () { Downloads.push(this.download); };
  for (const K of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "localStorage", "location", "history", "CSS", "Blob", "Image", "requestAnimationFrame"])
    try { Object.defineProperty(globalThis, K, { value: W[K], configurable: true, writable: true }); } catch { /* read-only */ }
  globalThis.CSS ||= { escape: (S) => String(S).replace(/["\\:|]/g, "\\$&") };
  const Ui = await import("./WorldInspector.js?ui");
  const Root = W.document.getElementById("World");
  const Api = await Ui.Mount(Root, { Catalogue: Panels, Storage: W.localStorage });
  const Q = (S) => Root.querySelector(S), QA = (S) => [...Root.querySelectorAll(S)];
  const Fire = (El, T) => El.dispatchEvent(new W.Event(T, { bubbles: true }));
  const Click = (El) => El.dispatchEvent(new W.MouseEvent("click", { bubbles: true, cancelable: true }));
  const Sleep = (Ms) => new Promise((R) => setTimeout(R, Ms));
  const Doc = () => Api.State.Doc;

  Check(QA(".wi-card").length === 14, "14 cards on the All view");
  Check(QA(".wi-nav a").length === 15, "nav pill: All + 14 cards");
  Check(!Q(".wi-canvas") || QA("[data-canvas]").length >= 4, "canvas placeholders present");
  await Sleep(120);
  Check(Painted > 0, "sky / moon / ball canvases painted from the solvers");

  Click(Q('.wi-nav a[data-value="sun"]'));
  Check(QA(".wi-card").length === 1 && Q('.wi-card[data-card="sun"]'), "nav isolates the Sun card");
  const Range = Q('input[type="range"][data-bind="sun|Local Hours"]');
  const Dir0 = Api.Compile().SunDir;
  Range.value = "8"; Fire(Range, "input");
  Check(Q('input[type="number"][data-bind="sun|Local Hours"]').value.startsWith("8"), "slider mirrors into its number box");
  Check(Api.Compile().SunDir.some((V, I) => Math.abs(V - Dir0[I]) > 1e-3), "slider input moves the compiled sun");
  Check(Q('[data-live="sun-legend"]').textContent.includes("08:00"), "live legend follows the slider mid-drag");
  Check(Root.contains(Range), "the dragged slider is not replaced mid-drag");
  Fire(Range, "change");

  // Graphic drag on the solar chart: the scrub rect spans x0..x1 of the viewBox; mock the layout box.
  const Host = Q('[data-live="sun-chart"]');
  W.SVGElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 400, height: 176, right: 400, bottom: 176 }; };
  const Scrub = Host.querySelector("[data-scrub]");
  const X0 = Number(Scrub.dataset.x0) * 400, X1 = Number(Scrub.dataset.x1) * 400;
  const Pe = (T, X, Y) => { const E = new W.MouseEvent(T, { bubbles: true, clientX: X, clientY: Y, button: 0 }); E.pointerId = 1; return E; };
  Scrub.dispatchEvent(Pe("pointerdown", X0 + (X1 - X0) * 0.75, 50));
  Host.dispatchEvent(Pe("pointermove", X0 + (X1 - X0) * 0.75, 50));
  Host.dispatchEvent(Pe("pointerup", 0, 0));
  Check(Math.abs(Wdoc.RecordOf(Doc(), "sun")["Local Hours"] - 18) < 0.05, `dragging the chart to 75 % sets 18:00 (got ${Wdoc.RecordOf(Doc(), "sun")["Local Hours"]})`);

  Click(Q('.wi-nav a[data-value="all"]'));
  const Opt = Q('.mi-dd-opt[data-act="pick"][data-target="clouds|Type"][data-value="2"]');
  Opt.closest("details").open = true; Click(Opt);
  Check(Wdoc.Compile(Doc()).Clouds.type === 2, "cloud type dropdown reaches the compile");
  Click(Q('[data-act="flip"][data-target="moon|Visible"]'));
  Check(Wdoc.Compile(Doc()).Moon.visible === false, "moon visibility switch");
  Click(Q('[data-act="moon-phase"][data-value="0.5"]'));
  Check(Wdoc.Compile(Doc()).Moon.phase === 0.5, "clicking the full-moon glyph sets phase 0.5");
  Click(Q('[data-act="fstop"][data-value="11"]'));
  Check(Wdoc.Read(Doc(), "camera", "Aperture") === 11, "f-stop strip");

  // Wind rose: drag due east → bearing 90.
  const Rose = Q('[data-live="wind-rose"]');
  W.SVGElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 160, height: 160, right: 160, bottom: 160 }; };
  Rose.querySelector("[data-scrub-angle]").dispatchEvent(Pe("pointerdown", 150, 80));
  Rose.dispatchEvent(Pe("pointerup", 0, 0));
  Check(Math.abs(Wdoc.Read(Doc(), "wind", "Bearing") - 90) < 1, "wind rose drag sets bearing 90°");
  Check(Math.abs(Wdoc.Compile(Doc()).Clouds.windX - Wdoc.Read(Doc(), "wind", "Speed")) < 1e-6, "…and the clouds drift east");

  // Object card: pick another object, edit its colour through the hex field.
  const Obj = Q('.mi-dd-opt[data-act="select"][data-target="geometry"][data-value="gold-pedestal"]');
  Obj.closest("details").open = true; Click(Obj);
  const Hex = Q('input[data-hex][data-bind="mat:gold-pedestal|colour"]');
  Hex.value = "#336699"; Fire(Hex, "input"); Fire(Hex, "change");
  Check(Wdoc.Compile(Doc()).Primitives.find((P) => P.OwnerId === "gold-pedestal").ResolvedMaterial.Channels.colour.Fill === "#336699", "object colour reaches the resolved material");

  const Hours = Wdoc.RecordOf(Doc(), "sun")["Local Hours"];
  Click(Q('[data-act="undo"]'));
  Check(Wdoc.Compile(Doc()).Primitives.find((P) => P.OwnerId === "gold-pedestal").ResolvedMaterial.Channels.colour.Fill !== "#336699", "undo reverts the colour");
  Click(Q('[data-act="redo"]'));
  Check(Wdoc.Compile(Doc()).Primitives.find((P) => P.OwnerId === "gold-pedestal").ResolvedMaterial.Channels.colour.Fill === "#336699", "redo re-applies it");

  Click(Q('[data-act="export"]'));
  Check(Downloads.includes("world-inspector.json"), "World JSON export");
  await Sleep(400);
  const Reloaded = Wdoc.Load(W.localStorage);
  Check(Reloaded.Values.sun["Local Hours"] === Hours && Reloaded.Values["gold-pedestal"].Material.Channels.colour.Fill === "#336699", "state persists to localStorage and reloads");
  Click(Q('[data-act="reset"][data-target="sun"]'));
  Check(Wdoc.RecordOf(Doc(), "sun")["Local Hours"] === Scene.ShowcaseInitialValues.sun["Local Hours"], "card reset restores the showcase sun");
  Check(Errors.length === 0, `no window errors: ${Errors.join(" | ")}`);
});

console.log(`\n${Passed} checks passed, ${Failed} failed · ${Suites.filter((S) => S[1]).length}/${Suites.length} suites`);
if (Failed) { console.log("WORLD INSPECTOR VALIDATION FAILED"); process.exit(1); }
console.log(`ALL ${Suites.length} WORLD INSPECTOR SUITES PASSED`);
process.exit(0);
