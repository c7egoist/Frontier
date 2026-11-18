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

  // every Material Inspector channel lands on the stage material; Height (reliefHeight) now scales the shader relief
  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("material"), Api = T.workspaceApi();
    const P = structuredClone(Card.State.P);
    P.reliefHeight = 0.83;
    Card.Apply(P); Card.Render();
    await new Promise((Ok) => setTimeout(Ok, 400));
    const M = Api.currentMaterial?.();
    return { Params: Api.getParams().reliefHeight, Uniform: M?.userData?.shader?.uniforms?.uReliefHeight?.value ?? null, Material: M?.userData?.params?.reliefHeight };
  });
  Check("material · Height channel reaches the relief uniform", Math.abs(R.Params - 0.83) < 1e-6 && Math.abs((R.Uniform ?? R.Material) - 0.83) < 1e-6, JSON.stringify(R));

  // docked panels wear TextureStudio's theme (cards keep their own greys on their own pages)
  R = await Run(() => {
    const Css = (Sel, Prop) => { const E = document.querySelector(Sel); return E ? getComputedStyle(E)[Prop] : null; };
    return {
      Card: Css(".cd-right > .cd-material .mi-card", "backgroundImage"),
      CardBorder: Css(".cd-right > .cd-material .mi-card", "borderTopColor"),
      Outliner: Css(".cd-left .ol-card", "borderTopColor"),
      Row: Css(".cd-left .ol-row", "borderTopColor"),
      Stat: Css(".cd-left .ol-stat", "borderTopColor"),
      Icon: Css(".cd-left .ol-icon", "backgroundColor"),
      Disc: Css(".cd-left .ol-disc:not(.muted):not(.warn)", "backgroundColor"),
    };
  });
  const Clear = (C) => C === "rgba(0, 0, 0, 0)" || C === "transparent";
  Check("theme · docked card surfaces use the studio card colours", /rgb\(32, 33, 36\)/.test(R.Card || "") && Clear(R.CardBorder), JSON.stringify(R));
  Check("theme · outliners have no outlines; icon tiles have no tint", Clear(R.Outliner) && Clear(R.Row) && Clear(R.Stat) && Clear(R.Icon), JSON.stringify(R));
  Check("theme · status discs are white, not green", !R.Disc || R.Disc === "rgb(255, 255, 255)", JSON.stringify(R));

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

  // ------------------------------------------------------------------------------------------ Fill placement + tool menus
  R = await Run(async () => {
    const Engine = await import(new URL("./Engine/Patterns/ArtworkStackEngine.js", location.href).href);
    const Api = window.__frontierTextureStudio.workspaceApi(), Doc = structuredClone(Api.currentDocument());
    const Layer = Doc.layers.find((L) => L.id === Doc.selectedLayerId) || Doc.layers.find((L) => L.shape);
    Doc.layers = [Layer];
    Object.assign(Layer.shape, { fillMode: "linear", fillStops: [{ offset: 0, color: "#ff0000" }, { offset: 0.5, color: "#00ff00" }, { offset: 1, color: "#0000ff" }], fillPlace: { a: [-0.5, 0], b: [0.5, 0] } });
    const Sum = (Interp) => {
      Layer.shape.fillInterp = Interp;
      const C = Engine.renderArtworkDocument(Doc, 96), Px = (C.albedo || C.canvas || C).getContext("2d").getImageData(0, 0, 96, 96).data;
      let H = 0; for (let I = 0; I < Px.length; I += 4) H = (H * 31 + Px[I] * 3 + Px[I + 1] * 5 + Px[I + 2] * 7) >>> 0;
      return H;
    };
    const Out = { linear: Sum("linear"), cubic: Sum("cubic"), step: Sum("step"), bezier: Sum("bezier") };
    return { ...Out, Distinct: new Set(Object.values(Out)).size };
  });
  Check("fill · interpolation modes render differently", R.Distinct === 4, JSON.stringify(R));

  R = await Run(async () => {
    const Wait = (Ms) => new Promise((Ok) => setTimeout(Ok, Ms));
    const Api = window.__frontierTextureStudio.workspaceApi();
    Api.useGradientMode("radial");
    Api.editGradient("fill");
    await Wait(200);
    const Canvas = document.querySelector(".se-canvas"), Box = Canvas.getBoundingClientRect();
    const Fire = (El, Type, X, Y) => El.dispatchEvent(new PointerEvent(Type, { bubbles: true, cancelable: true, clientX: X, clientY: Y, button: 0, buttons: Type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true }));
    const Cx = Box.left + Box.width / 2, Cy = Box.top + Box.height / 2;
    Fire(Canvas, "pointerdown", Cx - 60, Cy - 40);
    for (let I = 1; I <= 5; I++) Fire(Canvas, "pointermove", Cx - 60 + I * 20, Cy - 40 + I * 14);
    Fire(Canvas, "pointerup", Cx + 40, Cy + 30);
    await Wait(300);
    const Layer = () => { const D = Api.currentDocument(); return D.layers.find((L) => L.id === D.selectedLayerId); };
    const Made = structuredClone(Layer()?.shape?.fillPlace || null), Mode = Layer()?.shape?.fillMode;
    const Handle = document.querySelector("[data-ramp-end='a'] rect"), H = Handle?.getBoundingClientRect();
    if (H) {
      const Hx = H.left + H.width / 2, Hy = H.top + H.height / 2;
      Fire(Handle, "pointerdown", Hx, Hy);
      for (let I = 1; I <= 4; I++) Fire(Canvas, "pointermove", Hx + I * 12, Hy + I * 5);
      Fire(Canvas, "pointerup", Hx + 48, Hy + 20);
      await Wait(300);
    }
    const Moved = Layer()?.shape?.fillPlace;
    return { Mode, Made, Moved, Overlay: document.querySelector(".se-ramp-overlay")?.getAttribute("data-ramp-mode"), Tool: Api.getSnapshot().vectorTool };
  });
  const Shift = R.Made && R.Moved && Math.abs(R.Moved.a[0] - R.Made.a[0]) > 0.01;
  const RimKept = Shift && Math.abs((R.Moved.b[0] - R.Moved.a[0]) - (R.Made.b[0] - R.Made.a[0])) < 0.01;
  Check("fill · viewport drag places a radial ramp; centre handle moves it with the rim", R.Mode === "radial" && R.Overlay === "radial" && R.Tool === "gradient" && Shift && RimKept, JSON.stringify(R));

  R = await Run(async () => {
    const Wait = (Ms) => new Promise((Ok) => setTimeout(Ok, Ms));
    const Api = window.__frontierTextureStudio.workspaceApi(), Out = {};
    for (const [Tool, View] of [["gradient", "gradient"], ["circle", "shapes"], ["pen", "path"]]) {
      const B = document.querySelector(`[data-tool-id='${Tool}']`);
      if (!B) { Out[Tool] = "no button"; continue; }
      const Box = B.getBoundingClientRect();
      B.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Box.left, clientY: Box.bottom }));
      await Wait(120);
      const Menu = document.querySelector(".atm-menu:not([hidden])");
      Out[Tool] = Menu?.getAttribute("data-view") === View ? (Menu.querySelectorAll("[data-act], [data-bind]").length > 3 ? "ok" : "empty") : Menu?.getAttribute("data-view") || "closed";
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Wait(60);
    }
    const B = document.querySelector("[data-tool-id='text']"), Box = B.getBoundingClientRect();
    B.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Box.left, clientY: Box.bottom }));
    await Wait(250);
    const Menu = document.querySelector(".cd-brush-menu");
    Out.text = Menu && !Menu.hidden ? Menu.querySelectorAll(".bs-ltile[data-kind='font']").length : 0;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await Wait(60);
    Api.selectTool?.("select");
    return Out;
  });
  Check("menus · right-click gradient / shape / pen tools opens their context menus", R.gradient === "ok" && R.circle === "ok" && (R.pen === "ok" || R.pen === "no button"), JSON.stringify(R));
  Check("menus · right-click the Text tool opens the Brush Studio text library (fonts)", R.text === 6, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("artwork"), Api = T.workspaceApi();
    Card.State.Placer?.("fill", "linear");
    await new Promise((Ok) => setTimeout(Ok, 200));
    return { Tool: Api.getSnapshot().vectorTool, Slot: Api.getSnapshot().gradientSlot, Mode: Api.getSnapshot().gradientToolMode, Placer: typeof Card.State.Placer };
  });
  Check("fill · card 'Place in viewport' hands the gradient tool to the stage", R.Tool === "gradient" && R.Slot === "fill", JSON.stringify(R));

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

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("bake"), Api = T.workspaceApi();
    Card.State.Open = "curvature"; Card.Render();
    await new Promise((Ok) => setTimeout(Ok, 200));
    return { Inspect: Api.getSnapshot().inspectChannel };
  });
  Check("bake · the map open in the card is the map the stage inspects", R.Inspect === "curvature", JSON.stringify(R));

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

  R = await Run(async () => {
    await new Promise((Ok) => setTimeout(Ok, 600));
    const Rows = [...document.querySelectorAll(".cd-paint-outliner .ol-row[data-row^='layer:']")];
    const Engine = window.__frontierTextureStudio.workspaceApi().currentDocument();
    const Folder = new Set(Engine.layers.filter((L) => L.kind === "folder").map((L) => `layer:${L.id}`));
    const Img = Rows.filter((E) => E.querySelector(".ol-icon img.pi-thumb"));
    const Loaded = Img.filter((E) => E.querySelector("img.pi-thumb").src.startsWith("data:image/png"));
    return { Rows: Rows.length, Thumbs: Img.length, Loaded: Loaded.length, FolderThumbs: Img.filter((E) => Folder.has(E.dataset.row)).length, Layers: Rows.filter((E) => !Folder.has(E.dataset.row)).length };
  });
  Check("paint · layer rows show each layer's real texture", R.Thumbs > 0 && R.Thumbs === R.Layers && R.Loaded === R.Thumbs && !R.FolderThumbs, JSON.stringify(R));

  R = await Run(() => {
    const B = document.querySelector("[data-tool-id='paint']"), Box = B.getBoundingClientRect();
    B.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: Box.left, clientY: Box.bottom }));
    const Menu = document.querySelector(".cd-brush-menu");
    const Lib = Menu?.querySelector(".bs-lib");
    return { Open: !!Menu && !Menu.hidden, Studio: !!Menu?.querySelector(".bs-studio"), SideHidden: !Lib || getComputedStyle(Lib).display === "none", Popup: !!document.querySelector(".tool-popup-menu"),
      Section: Menu?.querySelector(".bs-sec.active")?.dataset.section, Tiles: Menu?.querySelectorAll(".bs-lgrid .bs-ltile[data-kind='brush']").length || 0,
      Grid: getComputedStyle(Menu?.querySelector(".bs-lgrid") || document.body).display };
  });
  Check("brush · right-click the Brush tool opens Brush Studio (not the old popup)", R.Open && R.Studio && !R.Popup, JSON.stringify(R));
  Check("brush · side preset list hidden; Library section shows the brushes as a grid", R.SideHidden && R.Section === "library" && R.Tiles > 20 && R.Grid === "grid", JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("brush"), Api = T.workspaceApi();
    Card.SetValue("colour.primary", "#3a7bd5");
    Card.SetValue("prop.size", 50);
    // the hand-off is coalesced: poll briefly instead of one fixed wait (slow under load)
    for (let I = 0; I < 20 && Api.currentBrush().color !== "#3a7bd5"; I++) await new Promise((Ok) => setTimeout(Ok, 100));
    const B = Api.currentBrush();
    return { Color: B.color, Size: B.size, Radius: B.pixelRadius, Tool: Card.State.Tool, Prim: Card.Brush?.().values?.["colour.primary"], Ws: Api.getSnapshot?.().tool, Hash: location.hash };
  });
  Check("brush · studio colour / size reach the workspace brush", R.Color === "#3a7bd5" && Math.abs(R.Size - 0.465) < 0.01, JSON.stringify(R));

  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("brush"), Api = T.workspaceApi();
    const On = [...(Card.Brush().values["mat.channels"] || [])].filter((C) => C !== "metalness");
    Card.SetValue("mat.channels", [...On, "sheen"]);
    Card.SetValue("mat.stack", { per: { ...(Card.Brush().values["mat.stack"]?.per || {}), sheen: { value: 61 } } });
    await new Promise((Ok) => setTimeout(Ok, 200));
    const B = Api.currentBrush();
    return { Sheen: B.paintChannels.sheen, Metal: B.paintChannels.metalness, Value: B.extValues.sheen };
  });
  Check("brush · Paint channel stack reaches the workspace channel map and values", R.Sheen === true && R.Metal === false && Math.abs(R.Value - 0.61) < 1e-6, JSON.stringify(R));

  // each tool's Library section lists that tool's presets
  R = await Run(async () => {
    const T = window.__frontierTextureStudio, Card = T.card("brush"), Api = T.workspaceApi(), Out = {};
    const Menu = document.querySelector(".cd-brush-menu");
    for (const [Tool, Kind] of [["erase", "eraser"], ["fill", "fill-colour"], ["stamp", "stamp"], ["gradient", "gradient"], ["text", "font"]]) {
      Api.selectTool(Tool);
      await new Promise((Ok) => setTimeout(Ok, 80));
      Menu.querySelector(".bs-sec[data-section='library']")?.click();
      await new Promise((Ok) => setTimeout(Ok, 60));
      Out[Tool] = Menu.querySelectorAll(`.bs-lgrid .bs-ltile[data-kind='${Kind}']`).length;
    }
    // picking a gradient tile sets the gradient tool's preset
    Api.selectTool("gradient");
    await new Promise((Ok) => setTimeout(Ok, 80));
    Menu.querySelector(".bs-sec[data-section='library']")?.click();
    const Tile = [...Menu.querySelectorAll(".bs-ltile[data-kind='gradient']")].find((E) => E.getAttribute("aria-pressed") !== "true");
    Tile?.click();
    await new Promise((Ok) => setTimeout(Ok, 60));
    Out.Picked = Card.State.Tools.gradient.preset === Tile?.dataset.value;
    Api.selectTool("paint");
    return Out;
  });
  Check("brush · Library grid per tool (erasers, fills, stamps, gradients, fonts)", R.erase > 0 && R.fill > 0 && R.stamp > 0 && R.gradient > 0 && R.text === 6 && R.Picked, JSON.stringify(R));

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

  // ------------------------------------------------------------------------------------------ several rows open at once
  await Switch("material");
  R = await Run(async () => {
    const Card = window.__frontierTextureStudio.card("material"), L = Card.Layer();
    const Want = ["emission", "emissive", "emissiveColour", "emissionColour"].find((K) => L.Channels.includes(K));
    const Keys = [Want || L.Channels.find((K) => K !== "roughness" && K !== "colour"), "roughness"].filter((K) => K && L.Channels.includes(K));
    Card.FoldChannels(); Card.Render();
    for (const K of Keys) Card.OpenChannel(L.Identity, K);
    const Seat = document.querySelector(".cd-right > .cd-material");   // the card's root: its innerHTML is rebuilt on render
    const Open = [...Seat.querySelectorAll(".mi-row.open")].map((E) => E.dataset.row);
    const Editors = [...Seat.querySelectorAll(".mi-editor")].map((E) => E.dataset.editor);
    // closing one leaves the other
    Seat.querySelector(`.mi-row-head[data-ch="${Keys[0]}"]`)?.click();
    const After = [...Seat.querySelectorAll(".mi-row.open")].map((E) => E.dataset.row);
    return { Keys, Open, Editors, After };
  });
  Check("material · channel rows open side by side (emission + roughness) and close independently",
    R.Keys.length === 2 && R.Keys.every((K) => R.Open.includes(K) && R.Editors.includes(K)) && !R.After.includes(R.Keys[0]) && R.After.includes(R.Keys[1]), JSON.stringify(R));

  await Switch("pattern");
  R = await Run(async () => {
    const Card = window.__frontierTextureStudio.card("artwork"), Root = document.querySelector(".cd-right > .cd-artwork");
    Card.FoldRows(); Card.Render();
    const Ids = [...Root.querySelectorAll('[data-act="open"][data-id]')].map((E) => E.dataset.id).filter((Id) => ["text", "fill", "stroke", "shape", "placement"].includes(Id)).slice(0, 2);
    for (const Id of Ids) Root.querySelector(`[data-act="open"][data-id="${Id}"]`).click();
    const Open = [...Root.querySelectorAll(".mi-row.open")].map((E) => E.dataset.row);
    Card.FoldRows(); Card.Render();
    return { Ids, Open, Thumb: !!Root.querySelector(".ai-thumb, [data-thumb]") };
  });
  Check("pattern · property rows open side by side (e.g. fill + outline)", R.Ids.length === 2 && R.Ids.every((Id) => R.Open.includes(Id)), JSON.stringify(R));
  Check("pattern · docked inspector carries no preview thumbnail (the viewport is the preview)", !R.Thumb, JSON.stringify(R));

  await Switch("paint");
  R = await Run(async () => {
    const Root = document.querySelector(".cd-right > .cd-paint");
    const Heads = [...Root.querySelectorAll('.cs-row .mi-row-head[data-act="cs-open"]:not([aria-disabled="true"])')].slice(0, 2);
    const Ids = Heads.map((H) => H.dataset.ch);
    for (const Id of Ids) { Root.querySelector(`.cs-row .mi-row-head[data-ch="${Id}"]`)?.click(); await new Promise((Ok) => setTimeout(Ok, 60)); }
    const Open = [...Root.querySelectorAll(".cs-row.open")].map((E) => E.dataset.row);
    for (const Id of Ids) { Root.querySelector(`.cs-row.open .mi-row-head[data-ch="${Id}"]`)?.click(); await new Promise((Ok) => setTimeout(Ok, 60)); }
    return { Ids, Open };
  });
  Check("paint · layer channel rows open side by side", R.Ids.length === 2 && R.Ids.every((Id) => R.Open.includes(Id)), JSON.stringify(R));

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
