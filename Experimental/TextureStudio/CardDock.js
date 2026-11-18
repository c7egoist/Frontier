/*==========================================================================================================================================
                                                          CARDDOCK.JS
==========================================================================================================================================*/
/* Seats the Project Zero cards in Texture Studio's workspaces. The cards were built as single pages beside an outliner
   (Experimental/MaterialInspector, ArtworkInspector, BakeInspector, PaintInspector, BrushStudio); here they replace the
   native side panels while the viewport, the material catalogue, the paint engine and the baker stay Texture Studio's.

     Material        Material Outliner · viewport · Material Inspector      card params ⇄ workspace params
     Pattern, Stamp  Artwork Outliner · SVG stage · Pattern / Stamp card    card document ⇄ workspace artwork document
     Baking          Bake Outliner · bake viewport · Map Baking card        card request → the workspace's baker
     Texture Paint   Paint Outliner · 3D / UV viewport · Layer Inspector    card layers ⇄ engine layers (texels stay here)
                     right-click a brush tool → Brush Studio context menu   card brush → workspace brush

   Each card mounts ONCE per page (the Material and Artwork cards keep module state and bind document listeners); its host
   node moves into whichever workspace mount is showing. Keys reach a card only when typed inside it (Options.scoped). */

import { Mount as MountMaterialCard } from "../MaterialInspector/MaterialInspector.js";
import { MountMaterialOutliner } from "../MaterialInspector/MaterialOutliner.js";
import { Mount as MountArtworkCard } from "../ArtworkInspector/ArtworkInspector.js";
import { MountArtworkOutliner } from "../ArtworkInspector/ArtworkOutliner.js";
import { Mount as MountBakeCard } from "../BakeInspector/BakeInspector.js";
import { MountBakeOutliner } from "../BakeInspector/BakeOutliner.js";
import { Mount as MountPaintCard } from "../PaintInspector/PaintInspector.js";
import { MountPaintOutliner } from "../PaintInspector/PaintOutliner.js";
import { Mount as MountBrushStudio } from "../BrushStudio/BrushStudio.js";
import { BRUSH_STACK } from "../BrushStudio/BrushModel.js";
import { TOOL_STACKS } from "../BrushStudio/ToolModel.js";
import { PAINT_CHANNELS, PAINT_CHANNEL, ToEngine } from "../MaterialInspector/ChannelStack.js";

const Seats = new Map();     // card key → { Left, Right, Card, Extra }
let Undock = [];             // listeners to drop when the workspace unmounts

const Coalesce = (Fn) => {   // at most one host update per frame while a card slider drags
  let Pending = null, Frame = 0;
  return (Arg) => {
    Pending = Arg;
    if (Frame) return;
    Frame = requestAnimationFrame(() => { Frame = 0; const A = Pending; Pending = null; Fn(A); });
  };
};

function Host(Classes) {
  const El = document.createElement("div");
  El.className = `cd-host pz-scope ${Classes}`;
  return El;
}

// Put a card host in place of a native column. The native children stay mounted (their code still runs) but hidden.
function SeatRight(Dock, El) {
  const Col = Dock.rightCol;
  for (const C of Col.children) if (!C.classList.contains("cd-host")) C.classList.add("cd-native");
  Col.classList.add("cd-column", "cd-right");
  Col.append(El);
}

function SeatLeft(Dock, El) {
  let Col = Dock.leftCol;
  if (!Col) {
    Col = document.createElement("aside");
    Col.className = "studio-column";
    Dock.grid.insertBefore(Col, Dock.centerCol);
  }
  for (const C of Col.children) if (!C.classList.contains("cd-host")) C.classList.add("cd-native");
  Col.classList.add("cd-column", "cd-left");
  Col.append(El);
}

function SeatGrid(Dock) {
  Dock.grid.classList.remove("studio-grid-2col");
  Dock.grid.classList.add("cd-docked");
}

// ------------------------------------------------------------------------------------------------ Material
function DockMaterial(Api) {
  let Seat = Seats.get("material");
  if (!Seat) {
    const Right = Host("mi-host cd-material");
    const Left = Host("ol-host cd-material-outliner");
    const Card = MountMaterialCard(Right, { docked: true, scoped: true });
    MountMaterialOutliner(Left, Card);
    Seat = { Left, Right, Card, Adopting: false, Last: null };
    Seats.set("material", Seat);
  }
  SeatGrid(Api.dock);
  SeatLeft(Api.dock, Seat.Left);
  SeatRight(Api.dock, Seat.Right);

  // workspace → card: whatever the stage now shows (library pick, asset drop, proposed strip, tile pattern)
  const Adopt = (Params) => {
    Seat.Adopting = true;
    try { if (Seat.Card.Adopt(Params)) Seat.Last = Seat.Card.State.P; } finally { Seat.Adopting = false; }
  };
  // card → workspace: every edit, live while dragging
  const Push = Coalesce((P) => Api.assignParams(P));
  const Off = Seat.Card.Subscribe(() => {
    if (Seat.Adopting) return;
    const P = Seat.Card.State.P;
    if (P === Seat.Last) return;     // selection-only renders do not touch the stage
    Seat.Last = P;
    Push(P);
  });
  Undock.push(Off, Api.watchParams(Adopt));
  Adopt(Api.getParams());
}

// ------------------------------------------------------------------------------------------------ Pattern, Stamp
// One Artwork card serves both stages; Adopt(doc, mode) switches it between Pattern Studio and Stamp Studio.
function DockArtwork(Api, AppBridge, Mode) {
  let Seat = Seats.get("artwork");
  if (!Seat) {
    const Right = Host("mi-host cd-artwork");
    const Left = Host("ol-host cd-artwork-outliner");
    const Card = MountArtworkCard(Right, { mode: Mode, docked: true, scoped: true });
    MountArtworkOutliner(Left, Card);
    Seat = { Left, Right, Card, Adopting: false, Last: null };
    Seats.set("artwork", Seat);
  }
  SeatGrid(Api.dock);
  SeatLeft(Api.dock, Seat.Left);
  SeatRight(Api.dock, Seat.Right);

  const Adopt = (Doc) => {
    Seat.Adopting = true;
    try { if (Seat.Card.Adopt(Doc, Mode)) Seat.Last = Seat.Card.State.Doc; } finally { Seat.Adopting = false; }
  };
  const Push = Coalesce((Doc) => Api.assignDocument(Doc));
  const Off = Seat.Card.Subscribe(() => {
    if (Seat.Adopting) return;
    const Doc = Seat.Card.State.Doc;
    if (!Doc || Doc === Seat.Last) return;
    Seat.Last = Doc;
    Push(Doc);
  });
  Undock.push(Off, Api.watchDocument(Adopt));
  Adopt(Api.currentDocument());
}

// ------------------------------------------------------------------------------------------------ Baking
// The card plans the bake (maps, settings, estimate) and hands its request to the workspace's GPU / CPU baker.
function DockBake(Api) {
  let Seat = Seats.get("bake");
  if (!Seat) {
    const Right = Host("mi-host cd-bake");
    const Left = Host("ol-host cd-bake-outliner");
    Seat = { Left, Right, Card: null, Api: null, Last: null };
    Seat.Card = MountBakeCard(Right, {
      docked: true,
      scoped: true,
      Bake: (Request, Run) => {
        if (!Seat.Api) return Promise.reject(new Error("Open the Baking workspace to bake"));
        return Seat.Api.bakeRequest(Request, Run);
      },
      OnSource: (Slot, File) => Seat.Api?.loadSource?.(Slot, File),
    });
    MountBakeOutliner(Left, Seat.Card);
    Seats.set("bake", Seat);
  }
  Seat.Api = Api;
  SeatGrid(Api.dock);
  SeatLeft(Api.dock, Seat.Left);
  SeatRight(Api.dock, Seat.Right);

  // The bake stage shows one study: follow the stage on dock, then the card's study choice drives the stage.
  const P = Seat.Card.State.P;
  if (!P.set && P.studyId !== Api.currentStudy() && Api.currentStudy() !== "custom") Seat.Card.UseTarget(Api.currentStudy());
  Seat.Last = Seat.Card.State.P.studyId;
  let Inspected = null;
  const Off = Seat.Card.Subscribe(() => {
    const Open = Seat.Card.State.Open;
    if (Open && Open !== Inspected) { Inspected = Open; Api.inspectMap?.(Open); }
    const Next = Seat.Card.State.P;
    if (Next.set || Next.studyId === Seat.Last) return;
    Seat.Last = Next.studyId;
    Api.useStudy(Next.studyId);
  });
  Undock.push(Off, () => { if (Seat.Api === Api) Seat.Api = null; });
}

// ------------------------------------------------------------------------------------------------ Texture Paint
// Paint Outliner + Layer Inspector edit the engine's layers (texels stay in the workspace); right-clicking a brush tool or
// the canvas opens Brush Studio as a context menu.
const CardMask = (Doc) => ({ ...Doc, layers: Doc.layers.map((L) => (L.mask ? { ...L, mask: { ...L.mask, preset: L.mask.generatorPreset || L.mask.preset || "none" } } : L)) });

function DockPaint(Api) {
  let Seat = Seats.get("paint");
  if (!Seat) {
    const Right = Host("mi-host cd-paint");
    const Left = Host("ol-host cd-paint-outliner");
    const Card = MountPaintCard(Right, { docked: true, scoped: true, store: false });
    const Thumbs = { Api: null };
    const Outliner = MountPaintOutliner(Left, Card, { thumb: (Id) => Thumbs.Api?.layerThumb?.(Id) || null });
    Seat = { Left, Right, Card, Outliner, Thumbs, Adopting: false, Last: null };
    Seats.set("paint", Seat);
  }
  SeatGrid(Api.dock);
  SeatLeft(Api.dock, Seat.Left);
  SeatRight(Api.dock, Seat.Right);
  Seat.Thumbs.Api = Api;
  if (Api.watchThumbs) Undock.push(Api.watchThumbs(() => { if (!Seat.Outliner.State?.Renaming) Seat.Outliner.Render(); }));
  Undock.push(() => { if (Seat.Thumbs.Api === Api) Seat.Thumbs.Api = null; });

  const Adopt = (Doc) => {
    Seat.Adopting = true;
    try { if (Seat.Card.Adopt(CardMask(Doc))) Seat.Last = Seat.Card.State.P; } finally { Seat.Adopting = false; }
  };
  const Push = Coalesce((P) => Api.assignLayers(P));
  const Off = Seat.Card.Subscribe(() => {
    if (Seat.Adopting) return;
    const P = Seat.Card.State.P;
    if (!P || P === Seat.Last) return;
    Seat.Last = P;
    Push(P);
  });
  Undock.push(Off, Api.watchLayers(Adopt));
  Adopt(Api.currentDocument());
  DockBrush(Api);
}

// ------------------------------------------------------------------------------------------------ Brush Studio menu
// Brush Studio card values → the workspace brush. Sizes: the card's 0–100 slider spans the workspace's 0.03–0.9 radius.
const SIZE_LO = 0.03, SIZE_HI = 0.9;
const Unit = (V, Lo = 0, Hi = 1) => Math.max(Lo, Math.min(Hi, (+V || 0) / 100));
// Channel stacks: the active tool's stack (the brush's Paint channels for Paint / Curve) → the workspace's channel map for
// that tool, and every channel value the stack carries → the brush's PBR fields / extended values.
const CHANNEL_SLOT = { paint: "paintChannels", curve: "paintChannels", stamp: "paintChannels", erase: "eraseChannels", fill: "fillChannels", gradient: "gradientChannels", text: "textChannels" };
const CORE_FIELDS = { roughness: "roughness", metalness: "metalness", height: "height" };
const GLOW_MAX = (PAINT_CHANNEL.emissiveIntensity?.Max ?? 400) / 100;
export function ChannelPatch(Brush, Tool, Tools, Held = {}) {
  const Slot = CHANNEL_SLOT[Tool];
  if (!Slot) return {};
  const Stack = Tool === "paint" || Tool === "curve" || !TOOL_STACKS[Tool] ? BRUSH_STACK : TOOL_STACKS[Tool];
  const Full = Stack === BRUSH_STACK ? Stack.Read(Brush.values) : Stack.Read(Tools?.[Tool] || {});
  const Patch = { [Slot]: Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, Full.on.includes(C.Id)])) };
  if (Tool === "erase" || Tool === "gradient") return Patch;  // erasers and ramps carry which channels, not values
  const Ext = { ...(Held.extValues || {}) };
  for (const Id of Full.on) {
    const Per = Full.per[Id] || {};
    if (Id === "albedo") continue;
    if (Id === "emissive") {
      Ext.emissive = /^#[0-9a-f]{6}$/i.test(Per.value) ? Per.value : Brush.values["colour.primary"] || Ext.emissive;
      if (Per.strength !== undefined && !Full.on.includes("emissiveIntensity")) Ext.emissiveIntensity = (Unit(Per.strength)) * GLOW_MAX;
      continue;
    }
    if (Per.value === undefined) continue;
    if (CORE_FIELDS[Id]) { if (Stack !== BRUSH_STACK) Patch[CORE_FIELDS[Id]] = ToEngine(Id, Per.value); continue; }
    Ext[Id] = ToEngine(Id, Per.value);
  }
  Patch.extValues = Ext;
  return Patch;
}

export function BrushPatch(Brush, Tool, Tools = null, Held = {}) {
  const V = Brush.values;
  const Size = SIZE_LO + (SIZE_HI - SIZE_LO) * Unit(V["prop.size"]);
  return {
    tool: Tool,
    color: V["colour.primary"],
    size: Size,
    opacity: Unit(V["prop.opacity"], 0.01),
    flow: Unit(V["render.flow"], 0.01),
    hardness: Unit(V["shape.hardness"]),
    roundness: Unit(V["shape.roundness"], 0.05),
    spacing: Unit(V["stroke.spacing"], 0.02),
    stabilizer: Unit(V["stab.streamline"]),
    roughness: Unit(V["mat.roughness"]),
    metalness: Unit(V["mat.metalness"]),
    height: Math.max(-1, Math.min(1, (+V["mat.height"] || 0) / 100)),
    jitter: { size: Unit(V["dyn.jitterSize"]), scatter: Unit(V["stroke.jitterLateral"]), flow: Unit(V["dyn.jitterOpacity"]) },
    colourDynamics: {
      mode: V["colour.mode"] || "solid",
      gradientPreset: V["colour.gradient"] || "ember",
      gradientLength: V["colour.gradientLength"] ?? 36,
      gradientWrap: V["colour.gradientWrap"] || "pingpong",
      temperatureShift: Unit(V["colour.temperature"]),
      ...(Array.isArray(V["colour.palette"]) ? { paletteColors: [...V["colour.palette"]] } : {}),
    },
    ...ChannelPatch(Brush, Tool, Tools, Held),
  };
}
// …and back: what the studio shows when the workspace's tool, colour or size changes outside the card.
const StudioView = (Brush) => ({
  tool: Brush.tool,
  colour: Brush.color,
  size: ((Brush.size - SIZE_LO) / (SIZE_HI - SIZE_LO)) * 100,
  opacity: (Brush.opacity ?? 1) * 100,
});

function BrushSeat() {
  let Seat = Seats.get("brush");
  if (Seat) return Seat;
  const Menu = document.createElement("div");
  Menu.className = "cd-brush-menu pz-scope";
  Menu.setAttribute("role", "dialog");
  Menu.setAttribute("aria-label", "Brush Studio");
  Menu.hidden = true;
  Menu.innerHTML = `<div class="cd-brush-bar"><span class="cd-brush-title">Brush Studio</span><span class="cd-brush-tool"></span>
      <button type="button" class="icon-btn cd-brush-close" aria-label="Close Brush Studio" title="Close (Esc)">×</button></div>
    <div class="cd-brush-body"></div>`;
  document.body.append(Menu);
  const Card = MountBrushStudio(Menu.querySelector(".cd-brush-body"), { pad: false, scoped: true, library: "section" });
  Seat = { Menu, Card, Api: null, Pushing: false };
  Seats.set("brush", Seat);

  const Close = () => { Menu.hidden = true; };
  Seat.Close = Close;
  Menu.querySelector(".cd-brush-close").addEventListener("click", Close);
  document.addEventListener("pointerdown", (E) => { if (!Menu.hidden && !Menu.contains(E.target)) Close(); }, true);
  document.addEventListener("keydown", (E) => { if (E.key === "Escape" && !Menu.hidden) Close(); });

  const Push = Coalesce(([Brush, Tool, Tools]) => {
    if (!Seat.Api) return;
    Seat.Pushing = true;
    try { Seat.Api.assignBrush(BrushPatch(Brush, Tool, Tools, Seat.Api.currentBrush?.() || {})); } finally { Seat.Pushing = false; }
  });
  Card.Subscribe((Brush, Tool, Tools) => {
    Menu.querySelector(".cd-brush-tool").textContent = Card.State.Tool;
    if (Seat.Api) Push([Brush, Tool, Tools]);
  });
  return Seat;
}

function OpenBrushMenu(Seat, X, Y) {
  const { Menu, Card, Api } = Seat;
  Card.Adopt(StudioView(Api.currentBrush()));
  Menu.querySelector(".cd-brush-tool").textContent = Card.State.Tool;
  Menu.hidden = false;
  const W = Menu.offsetWidth || 760, H = Menu.offsetHeight || 560;
  const Left = Math.max(12, Math.min(innerWidth - W - 12, X));
  const Top = Math.max(12, Math.min(innerHeight - H - 12, Y));
  Menu.style.left = `${Math.round(Left)}px`;
  Menu.style.top = `${Math.round(Top)}px`;
  Menu.querySelector(".bs-settings")?.focus?.({ preventScroll: true });
}

function DockBrush(Api) {
  const Seat = BrushSeat();
  Seat.Api = Api;
  Api.useBrushMenu((X, Y) => OpenBrushMenu(Seat, X, Y));
  const OffTool = Api.watchTool((Tool) => { if (!Seat.Pushing) Seat.Card.Adopt({ tool: Tool }); });
  Undock.push(OffTool, () => { Api.useBrushMenu(null); Seat.Close(); if (Seat.Api === Api) Seat.Api = null; });
}

// ------------------------------------------------------------------------------------------------ entry
const DOCKS = {
  material: DockMaterial,
  pattern: (Api, AppBridge) => DockArtwork(Api, AppBridge, "pattern"),
  stamp: (Api, AppBridge) => DockArtwork(Api, AppBridge, "stamp"),
  bake: DockBake,
  paint: DockPaint,
};

// Called by TextureStudio.js after a workspace mounts (and before the next one does).
export function DockCards(WorkspaceId, Api, AppBridge) {
  UndockCards();
  const Dock = DOCKS[WorkspaceId];
  if (!Dock || !Api?.dock) return false;
  try { Dock(Api, AppBridge, WorkspaceId); return true; } catch (Error) { console.error(`CardDock: ${WorkspaceId}`, Error); return false; }
}

export function UndockCards() {
  for (const Off of Undock) { try { Off?.(); } catch { /* already gone */ } }
  Undock = [];
}

export const DockedCard = (Key) => Seats.get(Key)?.Card || null;
