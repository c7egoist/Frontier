/*==========================================================================================================================================
                                                          CHECKCARDDOCK.MJS
==========================================================================================================================================*/
/* Browser check for CardDock.js — the Project Zero cards seated in Texture Studio's workspaces. Drives the live page through
   window.__frontierTextureStudio and asserts both directions of every hand-off:

     Material   card edit → workspace params        workspace library pick → card
     Pattern    card edit → workspace artwork doc   Stamp tab → same card in stamp mode
     Baking     card study → bake stage             card request → workspace baker (real maps back)
     Paint      card edit → engine layer (texels kept)   engine layer add → card
     Brush      right-click a brush tool → Brush Studio menu   card colour / size → workspace brush

   Run (Texture Studio served at the URL; puppeteer-core + @sparticuz/chromium installed in PUPPETEER_DIR):
     PUPPETEER_DIR=/tmp/chr node Experimental/TextureStudio/Scripts/CheckCardDock.mjs http://127.0.0.1:8101/Experimental/TextureStudio/ */

import { createRequire } from "node:module";
import { join } from "node:path";

const Url = process.argv[2] || "http://127.0.0.1:8101/Experimental/TextureStudio/";
const Dir = process.env.PUPPETEER_DIR || "/tmp/chr";
const Need = createRequire(join(Dir, "package.json"));
const { default: chromium } = await import(Need.resolve("@sparticuz/chromium"));
const { default: puppeteer } = await import(Need.resolve("puppeteer-core"));

const Results = [];
const Errors = [];
const Check = (Name, Pass, Detail = "") => { Results.push({ Name, Pass: !!Pass, Detail }); console.log(`${Pass ? "pass" : "FAIL"}  ${Name}${Detail ? `  · ${Detail}` : ""}`); };
const Sleep = (Ms) => new Promise((R) => setTimeout(R, Ms));

const Browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1560, height: 980 } });
try {
  const Page = await Browser.newPage();
  Page.on("pageerror", (E) => Errors.push(E.message));
  Page.on("console", (M) => { if (M.type() === "error" && /CardDock|Shader Error/.test(M.text())) Errors.push(M.text().slice(0, 200)); });
  await Page.goto(`${Url}#material`, { waitUntil: "load", timeout: 90000 });
  await Page.waitForFunction(() => window.__frontierTextureStudio?.card?.("material"), { timeout: 60000 });
  await Sleep(1500);
  const Run = (Fn, ...Args) => Page.evaluate(Fn, ...Args);
  const Switch = async (Id) => { await Run((W) => window.__frontierTextureStudio.switchWorkspace(W), Id); await Sleep(1800); };

  // ------------------------------------------------------------------------------------------ Material
  let R = await Run(() => {
    const Grid = document.querySelector(".studio-grid");
    return {
      Docked: Grid.classList.contains("cd-docked"),
      Card: !!document.querySelector(".cd-right > .cd-material .mi-card"),
      Outliner: !!document.querySelector(".cd-left > .cd-material-outliner .ol-card"),
      NativeHidden: [...document.querySelectorAll(".cd-native")].every((E) => getComputedStyle(E).display === "none"),
      Viewport: !!document.querySelector(".viewport-column canvas"),
    };
  });
  Check("material · grid docked, card right, outliner left", R.Docked && R.Card && R.Outliner, JSON.stringify(R));
  Check("material · native panels hidden, viewport kept", R.NativeHidden && R.Viewport);

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("material"), Api = T.workspaceApi();
    const P = structuredClone(Card.State.P);
    const Key = ["Roughness", "roughness"].find((K) => typeof P[K] === "number") || Object.keys(P).find((K) => typeof P[K] === "number");
    const Next = Math.round(((P[Key] + 0.37) % 1) * 1000) / 1000;
    P[Key] = Next;
    Card.Apply(P); Card.Render();
    await new Promise((Ok) => setTimeout(Ok, 250));
    return { Key, Next, Stage: Api.getParams()[Key] };
  });
  Check("material · card edit reaches the stage params", Math.abs(R.Stage - R.Next) < 1e-6, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("material");
    const Before = Card.State.P.Name || Card.State.P.name;
    const Entry = T.getAssetBrowser()?.items?.find?.((I) => I.assetKind === "material" && (I.name || I.label) !== Before);
    const Ok = Entry ? T.applyAsset("material", Entry.id) : false;
    await new Promise((Done) => setTimeout(Done, 400));
    return { Before, After: Card.State.P.Name || Card.State.P.name, Ok: !!Ok, Tried: !!Entry };
  });
  if (R.Tried) Check("material · library pick reaches the card", R.Before !== R.After, JSON.stringify(R));

  // ------------------------------------------------------------------------------------------ Pattern / Stamp
  await Switch("pattern");
  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("artwork"), Api = T.workspaceApi();
    const Seated = !!document.querySelector(".cd-right > .cd-artwork .mi-card") && !!document.querySelector(".cd-left > .cd-artwork-outliner");
    const Same = Card.State.Doc.layers.length === Api.currentDocument().layers.length && Card.State.Mode === "pattern";
    const Doc = structuredClone(Card.State.Doc);
    const Layer = Doc.layers[Doc.layers.length - 1];
    Layer.name = "Dock Check Layer";
    Layer.opacity = 0.41;
    Card.Apply(Doc); Card.Render();
    await new Promise((Ok) => setTimeout(Ok, 300));
    const Stage = Api.currentDocument().layers.find((L) => L.id === Layer.id);
    return { Seated, Same, Name: Stage?.name, Opacity: Stage?.opacity };
  });
  Check("pattern · card seated with the stage document", R.Seated && R.Same, JSON.stringify(R));
  Check("pattern · card edit reaches the SVG stage", R.Name === "Dock Check Layer" && Math.abs(R.Opacity - 0.41) < 1e-6, JSON.stringify(R));

  await Switch("stamp");
  R = await Run(() => {
    const T = window.__frontierTextureStudio, Card = T.card("artwork");
    return { Mode: Card.State.Mode, Seated: !!document.querySelector(".cd-right > .cd-artwork .mi-card"), Layers: Card.State.Doc.layers.length === T.workspaceApi().currentDocument().layers.length };
  });
  Check("stamp · same card follows in stamp mode", R.Mode === "stamp" && R.Seated && R.Layers, JSON.stringify(R));

  // ------------------------------------------------------------------------------------------ Baking
  await Switch("bake");
  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("bake"), Api = T.workspaceApi();
    const Seated = !!document.querySelector(".cd-right > .cd-bake .mi-card") && !!document.querySelector(".cd-left > .cd-bake-outliner");
    const Plan = Card.Model;
    Card.Apply(Plan.SetValue(Card.State.P, "studyId", "box")); Card.Render();
    await new Promise((Ok) => setTimeout(Ok, 400));
    const Study = Api.currentStudy();
    // a small, quick bake through the card: two surface maps at 64 px on the CPU reference path
    let P = Plan.SetValue(Card.State.P, "selected", ["ao", "curvature"]);
    P = Plan.SetValue(P, "resolution", 64); P = Plan.SetValue(P, "samples", 4); P = Plan.SetValue(P, "deviceMode", "cpu");
    Card.Apply(P); Card.Render();
    await Card.Bake();
    const Result = Card.State.Result;
    return { Seated, Study, Dry: Result?.Dry, Maps: Result?.Maps, Device: Result?.Device, Baked: !!Api.getSnapshot().hasSurface };
  });
  Check("bake · card seated", R.Seated);
  Check("bake · card study drives the stage", R.Study === "box", R.Study);
  Check("bake · card request runs the workspace baker", R.Dry === false && R.Baked && R.Maps?.length === 2, JSON.stringify(R));

  // ------------------------------------------------------------------------------------------ Texture Paint + Brush
  await Switch("paint");
  await Sleep(1500);
  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("paint"), Api = T.workspaceApi();
    const Engine = Api.currentDocument();
    const Seated = !!document.querySelector(".cd-right > .cd-paint .mi-card") && !!document.querySelector(".cd-left > .cd-paint-outliner .ol-card");
    const Same = Card.State.P.layers.map((L) => L.id).join() === Engine.layers.map((L) => L.id).join();
    const Painted = Engine.layers.find((L) => L.pixels);
    const Texels = Painted?.pixels?.res || Painted?.pixels?.albedo?.length || 0;
    Card.Edit(Painted.id, { opacity: 0.37, name: "Dock Check Paint" });
    await new Promise((Ok) => setTimeout(Ok, 300));
    const After = Api.currentDocument().layers.find((L) => L.id === Painted.id);
    const Kept = (After?.pixels?.res || After?.pixels?.albedo?.length || 0) === Texels && After.pixels === Painted.pixels;
    return { Seated, Same, Opacity: After?.opacity, Name: After?.name, Kept };
  });
  Check("paint · outliner + layer inspector seated on the engine document", R.Seated && R.Same, JSON.stringify(R));
  Check("paint · card edit reaches the engine layer, texels kept", Math.abs(R.Opacity - 0.37) < 1e-6 && R.Name === "Dock Check Paint" && R.Kept, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("paint"), Api = T.workspaceApi();
    const Id = Card.Add("fill");
    await new Promise((Ok) => setTimeout(Ok, 300));
    const Engine = Api.currentDocument();
    const Added = Engine.layers.find((L) => L.id === Id);
    return { Added: !!Added, Kind: Added?.kind, FullRes: !!Added && Engine.layers.length === Card.State.P.layers.length };
  });
  Check("paint · card layer add builds an engine layer", R.Added && R.Kind === "fill" && R.FullRes, JSON.stringify(R));

  R = await Run(() => {
    const B = document.querySelector("[data-tool-id='paint']"), Box = B.getBoundingClientRect();
    B.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Box.left, clientY: Box.bottom }));
    const Menu = document.querySelector(".cd-brush-menu");
    return { Open: !!Menu && !Menu.hidden, Studio: !!Menu?.querySelector(".bs-studio"), Library: !!Menu?.querySelector(".bs-lib"), Popup: !!document.querySelector(".tool-popup-menu") };
  });
  Check("brush · right-click the Brush tool opens Brush Studio (not the old popup)", R.Open && R.Studio && R.Library && !R.Popup, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("brush"), Api = T.workspaceApi();
    Card.SetValue("colour.primary", "#3a7bd5");
    Card.SetValue("prop.size", 50);
    await new Promise((Ok) => setTimeout(Ok, 200));
    const B = Api.currentBrush();
    return { Color: B.color, Size: B.size, Radius: B.pixelRadius };
  });
  Check("brush · studio colour / size reach the workspace brush", R.Color === "#3a7bd5" && Math.abs(R.Size - 0.465) < 0.01, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("brush"), Api = T.workspaceApi();
    Api.selectTool("erase");
    await new Promise((Ok) => setTimeout(Ok, 100));
    const Tool = Card.State.Tool;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const Menu = document.querySelector(".cd-brush-menu");
    // keys typed outside the docked cards must not reach them
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true }));
    return { Tool, Closed: Menu.hidden, StudioTool: Card.State.Tool };
  });
  Check("brush · workspace tool change follows into the studio", R.Tool === "erase", JSON.stringify(R));
  Check("brush · Esc closes the menu; stray keys stay out of the studio", R.Closed && R.StudioTool === "erase", JSON.stringify(R));

  // ------------------------------------------------------------------------------------------ remount
  await Switch("material");
  R = await Run(() => ({ Cards: document.querySelectorAll(".cd-material").length, Menu: document.querySelectorAll(".cd-brush-menu").length, Hidden: document.querySelector(".cd-brush-menu").hidden }));
  Check("remount · cards mount once and move with the workspace", R.Cards === 1 && R.Menu === 1 && R.Hidden, JSON.stringify(R));

  Check("no page errors", !Errors.length, Errors.slice(0, 3).join(" | "));
} finally {
  await Browser.close();
}

const Failed = Results.filter((E) => !E.Pass).length;
console.log(`\nCheckCardDock: ${Results.length - Failed} passed, ${Failed} failed`);
process.exit(Failed ? 1 : 0);
