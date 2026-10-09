// 📦 Landscape editor controller — owns state, undo history, layer actions, compute scheduling, the outliner, presets and export.

import { CompleteProject } from "./Pipeline.js";
import { Presets, PresetProject, Gen, Ero, Mask, NewLayerId } from "./Presets.js";
import { GeneratorCatalogue, DefaultGeneratorParams } from "./Generators.js";
import { MaskCatalogue, DefaultMaskParams, CompleteMaskSpec } from "./Masks.js";
import { ErosionCatalogue } from "./Erosion.js";
import { SatmapModes } from "./Satmap.js";
import { CreateTerrainViewer } from "./Renderer.js";
import { Form, Escape, Fixed, Icon, LayerHeading, LayerCards, ProjectCards, StatsCards, PreviewCard } from "./Inspector.js";

const StorageKey = "Frontier.LandscapeEditor.v1";
const HistoryLimit = 80;

const State = {
    Project: null,
    Selected: null,
    Result: null,
    Heights: null,
    Satmap: null,
    Form: null,
    History: [],
    Future: [],
    Drag: null,
    InFlight: null,
    RequestId: 0,
    Pending: false,
    Timer: 0,
    Filter: "",
    Progress: null,
    Thumbs: {},
    ThumbQueue: [],
    ThumbBusy: false,
    View: { Satmap: "Composite", Shading: 0, Top: false, Water: true, Contours: false, Exaggeration: 1 },
    Viewer: null,
};

let Compute = null;

/// in    Id     [-]  element identifier
/// out   Node   [-]  element, throws when missing so markup errors surface immediately
function El(Id) {
    const Node = document.getElementById(Id);
    if (!Node) {
        throw new Error(`Missing element #${Id}`);
    }
    return Node;
}

/// in    Message   [-]  text shown in the error banner
/// out   None      [-]  shows the banner and logs the message
function ShowError(Message) {
    const Banner = El("error-banner");
    Banner.textContent = Message;
    Banner.hidden = false;
    console.error(Message);
}

/// in    Project   [-]  complete project record
/// out   Json      [-]  deterministic JSON text used for history snapshots
function Snapshot(Project) {
    return JSON.stringify(Project);
}

/// in    Snapshot   [-]  JSON text captured before a change
/// out   None       [-]  appends to undo history and clears redo
function PushHistory(SnapshotText) {
    State.History.push(SnapshotText);
    if (State.History.length > HistoryLimit) {
        State.History.shift();
    }
    State.Future = [];
}

/// in    Change     [-]  function mutating State.Project in place
/// in    Phase      [-]  'input' while dragging (no history yet) or 'commit' on release
/// in    Structural [-]  true when the inspector form must be rebuilt
/// out   None       [-]  applies the change, records one history step on commit and schedules a compute
function Mutate(Change, Phase = "commit", Structural = false) {
    if (!State.Drag) {
        State.Drag = { Before: Snapshot(State.Project) };
    }
    Change();
    if (Phase === "commit") {
        PushHistory(State.Drag.Before);
        State.Drag = null;
    }
    Persist();
    if (Structural) {
        RenderAll();
    } else {
        RenderOutliner();
        RenderHeaderState();
    }
    ScheduleCompute(Phase === "commit" ? 0 : 220);
}

/// out   Layer   [-]  currently selected layer record or null when the landscape is selected
function SelectedLayer() {
    return State.Project.Layers.find((Layer) => Layer.Id === State.Selected) ?? null;
}

/// out   Summary   [-]  text used in the outliner subtitle for a layer
function LayerSubtitle(Layer) {
    const Masks = Layer.Masks.length ? ` · ${Layer.Masks.length} mask${Layer.Masks.length > 1 ? "s" : ""}` : "";
    if (Layer.Kind === "Erosion") {
        return `${ErosionCatalogue[Layer.Erosion.Type]?.Name ?? Layer.Erosion.Type} · ${Layer.Blend}${Masks}`;
    }
    const Type = GeneratorCatalogue[Layer.Source.Type]?.Name ?? Layer.Source.Type;
    return `${Type} · ${Layer.Amplitude} m · ${Layer.Blend}${Masks}`;
}

/// out   None   [-]  rebuilds the outliner rows and stack counters
function RenderOutliner() {
    const Layers = State.Project.Layers;
    const Erosion = Layers.filter((Layer) => Layer.Kind === "Erosion").length;
    const Masks = Layers.reduce((Total, Layer) => Total + Layer.Masks.length, 0);
    El("stack-stats").innerHTML = [
        ["Layers", Layers.length],
        ["Erosion", Erosion],
        ["Masks", Masks],
    ].map(([Label, Value]) => `<div class="stat-card"><strong>${Value}</strong><span>${Label}</span></div>`).join("");
    El("stack-title").textContent = State.Project.Name;
    El("viewport-tab-name").textContent = State.Project.Name;

    const Filter = State.Filter.trim().toLowerCase();
    const Rows = [];
    const Top = Layers.slice().reverse();
    for (const Layer of Top) {
        const Haystack = `${Layer.Name} ${Layer.Kind} ${Layer.Kind === "Erosion" ? Layer.Erosion.Type : Layer.Source.Type}`.toLowerCase();
        if (Filter && !Haystack.includes(Filter)) {
            continue;
        }
        const Glyph = Layer.Kind === "Erosion" ? "erosion" : "generator";
        const Selected = State.Selected === Layer.Id;
        Rows.push(`<div class="outliner-row${Selected ? " is-selected" : ""}${Layer.Visible ? "" : " is-hidden"}" role="treeitem" aria-selected="${Selected}" data-row="${Escape(Layer.Id)}" tabindex="0">` +
            `<span class="row-glyph is-${Layer.Kind === "Erosion" ? "erosion" : "generator"}">${Icon(Glyph)}</span>` +
            `<span class="outliner-text"><span class="outliner-title">${Escape(Layer.Name)}</span><span class="outliner-sub">${Escape(LayerSubtitle(Layer))}</span></span>` +
            `<span class="row-actions">` +
            `<button type="button" class="icon-button" data-action="toggle-visible" data-id="${Escape(Layer.Id)}" title="${Layer.Visible ? "Hide" : "Show"} layer" aria-label="${Layer.Visible ? "Hide" : "Show"} layer">${Icon(Layer.Visible ? "eye" : "eyeOff")}</button>` +
            `</span></div>`);
    }
    if (!Layers.length) {
        Rows.push(`<p class="outliner-empty">No layers yet. Add a generator to shape the base terrain, or start from a preset.</p>`);
    } else if (!Rows.length) {
        Rows.push(`<p class="outliner-empty">No layers match “${Escape(State.Filter)}”.</p>`);
    }
    const Root = State.Selected === null;
    const Head = `<div class="outliner-row${Root ? " is-selected" : ""}" role="treeitem" aria-selected="${Root}" data-row="" tabindex="0">` +
        `<span class="row-glyph">${Icon("generator")}</span>` +
        `<span class="outliner-text"><span class="outliner-title">${Escape(State.Project.Name)}</span><span class="outliner-sub">${State.Project.Resolution}² · ${State.Project.WorldSize} m · sea ${State.Project.SeaLevel} m</span></span>` +
        `<span></span></div><p class="outliner-divider">Stack · top applies last</p>`;
    El("outliner").innerHTML = Head + Rows.join("");
}

/// out   None   [-]  refreshes the footer status and the restore buttons
function RenderHeaderState() {
    El("undo").disabled = State.History.length === 0;
    El("redo").disabled = State.Future.length === 0;
    El("status").innerHTML = StatusText();
}

/// out   Text   [-]  HTML footer line with the current landscape totals
function StatusText() {
    const Project = State.Project;
    const Visible = Project.Layers.filter((Layer) => Layer.Visible).length;
    const Result = State.Result;
    const Parts = [
        `${Project.Resolution}² · cell ${(Project.WorldSize / Project.Resolution).toFixed(1)} m`,
        `world ${(Project.WorldSize / 1000).toFixed(2)} km`,
        `${Visible}/${Project.Layers.length} layers visible`,
        `seed ${Project.Seed}`,
    ];
    if (Result) {
        Parts.push(`land <b>${(Result.Stats.LandFraction * 100).toFixed(1)}%</b>`);
        Parts.push(`rivers <b>${Result.Stats.RiverLengthKm.toFixed(1)} km</b>`);
        Parts.push(`range <b>${Fixed(Result.Stats.Minimum)} … ${Fixed(Result.Stats.Maximum)} m</b>`);
        Parts.push(`compute <b>${Result.Stats.ComputeMs.toFixed(0)} ms</b>`);
    }
    if (State.InFlight !== null) {
        Parts.push("evaluating");
    }
    return Parts.map((Part) => `<span>${Part}</span>`).join("");
}

/// out   None   [-]  rebuilds the inspector for the current selection
function RenderInspector() {
    const Layer = SelectedLayer();
    if (State.Selected !== null && !Layer) {
        State.Selected = null;
    }
    const Form_ = new Form({ Mutate, Rerender: RenderAll });
    State.Form = Form_;
    const Heading = El("inspector-heading");
    const Body = El("inspector");
    const Footer = El("inspector-footer");
    if (!Layer) {
        Heading.innerHTML = `<p class="eyebrow">Landscape</p><h1>${Escape(State.Project.Name)}</h1>` +
            `<p class="dock-caption">World settings, sea level and evaluation statistics. Select a layer to edit its source, erosion and masks.</p>`;
        Body.innerHTML = ProjectCards(State.Project, Form_);
        Footer.innerHTML = `<span class="dock-footer-meta">${Escape(State.Project.Palette)} palette · ${State.Project.Layers.length} layers</span>`;
    } else {
        const Index = State.Project.Layers.indexOf(Layer);
        Heading.innerHTML = LayerHeading(Layer, Index, State.Project.Layers.length, Form_);
        Body.innerHTML = `<div data-live="preview">${PreviewCard(Layer, State.Result)}</div>` + LayerCards(Layer, Form_);
        Footer.innerHTML = `<span class="dock-footer-meta">${Escape(Layer.Kind)} · ${Escape(Layer.Name)}</span>`;
    }
    State.Form.Bindings = Form_.Bindings;
    UpdateLive();
}

/// out   None   [-]  refreshes statistics and layer previews without rebuilding the form
function UpdateLive() {
    const Stats = document.querySelector('[data-live="stats"]');
    if (Stats) {
        Stats.innerHTML = StatsCards(State.Result);
    }
    const Preview = document.querySelector('[data-live="preview"]');
    const Layer = SelectedLayer();
    if (Preview && Layer) {
        Preview.innerHTML = PreviewCard(Layer, State.Result);
    }
    DrawPreviews();
}

/// in    Canvas    [-]  destination canvas
/// in    Field     [-]  Uint8Array N×N greyscale
/// in    Size      [-]  edge length
/// out   None      [-]  paints the greyscale field into the canvas
function PaintGrey(Canvas, Field, Size) {
    const Context = Canvas.getContext("2d");
    const Image = Context.createImageData(Size, Size);
    for (let Index = 0; Index < Field.length; Index++) {
        const Value = Field[Index];
        Image.data[Index * 4] = Value;
        Image.data[Index * 4 + 1] = Value;
        Image.data[Index * 4 + 2] = Value;
        Image.data[Index * 4 + 3] = 255;
    }
    Context.putImageData(Image, 0, 0);
}

/// out   None   [-]  draws the output and mask previews of the selected layer
function DrawPreviews() {
    const Result = State.Result;
    if (!Result || Result.Selected !== State.Selected) {
        return;
    }
    const Output = document.querySelector('[data-preview="output"]');
    const Mask = document.querySelector('[data-preview="mask"]');
    if (Output && Result.Previews.Output) {
        PaintGrey(Output, Result.Previews.Output, Result.N);
    }
    if (Mask && Result.Previews.Mask) {
        PaintGrey(Mask, Result.Previews.Mask, Result.N);
    }
}

/// out   None   [-]  full rebuild of every panel
function RenderAll() {
    RenderOutliner();
    RenderInspector();
    RenderHeaderState();
    RenderLegend();
    if (!El("presets-drawer").hidden) {
        RenderPresetGrid();
    }
    Persist();
}

/// out   None   [-]  shows a legend for analytical satmap modes
function RenderLegend() {
    const Legend = El("legend");
    const Mode = SatmapModes.find((Entry) => Entry.Id === State.View.Satmap);
    if (!Mode || Mode.Id === "Composite") {
        Legend.hidden = true;
        return;
    }
    const Result = State.Result;
    const Span = {
        Height: Result ? `${Fixed(Result.Stats.Minimum)} m` : "low",
        Slope: "0°",
        Protrusion: "hollow",
        Rivers: "dry",
        Sediment: "none",
        Erosion: "none",
        Moisture: "dry",
        Coast: "land",
    }[Mode.Id] ?? "low";
    const High = {
        Height: Result ? `${Fixed(Result.Stats.Maximum)} m` : "high",
        Slope: "60°",
        Protrusion: "crest",
        Rivers: "channel",
        Sediment: "deposit",
        Erosion: "removed",
        Moisture: "wet",
        Coast: "sea",
    }[Mode.Id] ?? "high";
    Legend.hidden = false;
    Legend.innerHTML = `<strong style="color:#f0f0f0;font-weight:400">${Escape(Mode.Label)}</strong>` +
        `<div class="legend-bar" style="background:linear-gradient(90deg,#1d2b4f,#3d7c5a,#d9c27a,#f4f2ee)"></div>` +
        `<div class="legend-scale"><span>${Escape(Span)}</span><span>${Escape(High)}</span></div>` +
        `<p style="margin:6px 0 0;line-height:1.4">${Escape(Mode.Hint)}</p>`;
}

/// in    Ms   [ms]  debounce delay
/// out   None  [-]  restarts the debounce timer; the latest project is sent when it fires
function ScheduleCompute(Ms) {
    clearTimeout(State.Timer);
    State.Timer = setTimeout(RequestCompute, Ms);
}

/// out   None   [-]  posts the current project to the worker unless a request is already running
function RequestCompute() {
    if (State.InFlight !== null) {
        State.Pending = true;
        return;
    }
    State.RequestId += 1;
    State.InFlight = State.RequestId;
    State.Progress = { Position: 0, Total: State.Project.Layers.length, Name: "Starting" };
    ShowProgress();
    El("error-banner").hidden = true;
    Compute.postMessage({
        Type: "evaluate",
        Id: State.InFlight,
        Project: State.Project,
        Mode: State.View.Satmap,
        Selected: State.Selected,
    });
    RenderHeaderState();
}

/// out   None   [-]  shows the compute chip with the current stage
function ShowProgress() {
    const Chip = El("progress-chip");
    if (State.InFlight === null || !State.Progress) {
        Chip.hidden = true;
        return;
    }
    Chip.hidden = false;
    Chip.textContent = `Computing ${State.Progress.Position + 1}/${State.Progress.Total} · ${State.Progress.Name}${State.Progress.Cached ? " (cached)" : ""}`;
}

/// in    Message   [-]  reply from the worker
/// out   None      [-]  applies results, uploads meshes and textures, then schedules any pending request
function OnWorkerMessage(Event) {
    const Message = Event.data;
    if (Message.Type === "progress") {
        if (Message.Id === State.InFlight) {
            State.Progress = Message;
            ShowProgress();
        }
        return;
    }
    if (Message.Type === "thumbnail") {
        State.ThumbBusy = false;
        const Canvas = document.querySelector(`[data-thumb="${CSS.escape(Message.Preset)}"]`);
        State.Thumbs[Message.Preset] = Message;
        if (Canvas) {
            PaintThumb(Canvas, Message);
        }
        PumpThumbs();
        return;
    }
    if (Message.Type === "satmap") {
        State.Satmap = Message.Satmap;
        if (State.Viewer && State.Result) {
            State.Viewer.SetSatmap(Message.Satmap, State.Result.N);
        }
        return;
    }
    if (Message.Type === "error") {
        ShowError(`Evaluation failed:\n${Message.Message}`);
        if (Message.Id === State.InFlight) {
            State.InFlight = null;
            ShowProgress();
            RenderHeaderState();
        }
        return;
    }
    if (Message.Type === "result") {
        if (Message.Id !== State.InFlight) {
            return;
        }
        State.InFlight = null;
        State.Result = {
            Stats: Message.Stats,
            Stages: Message.Stages,
            Previews: Message.Previews,
            N: Message.N,
            Cell: Message.Cell,
            Sea: Message.Sea,
            World: Message.World,
            Selected: Message.Selected,
            Palette: Message.Palette,
        };
        State.Heights = Message.Heights;
        State.Satmap = Message.Satmap;
        if (State.Viewer) {
            State.Viewer.SetHeights(State.Heights, Message.N, Message.World, Message.Sea);
            State.Viewer.SetSatmap(State.Satmap, Message.N);
        }
        ShowProgress();
        RenderOutliner();
        RenderHeaderState();
        RenderLegend();
        UpdateLive();
        if (State.Pending) {
            State.Pending = false;
            RequestCompute();
        }
    }
}

/// in    Pixels   [-]  RGBA thumbnail reply
/// in    Canvas   [-]  destination canvas
/// out   None     [-]  paints the thumbnail
function PaintThumb(Canvas, Message) {
    Canvas.width = Message.N;
    Canvas.height = Message.N;
    const Context = Canvas.getContext("2d");
    Context.putImageData(new ImageData(new Uint8ClampedArray(Message.Pixels), Message.N, Message.N), 0, 0);
}

/// out   None   [-]  requests the next missing preset thumbnail
function PumpThumbs() {
    if (State.ThumbBusy || !State.ThumbQueue.length) {
        return;
    }
    const Next = State.ThumbQueue.shift();
    if (State.Thumbs[Next]) {
        PumpThumbs();
        return;
    }
    State.ThumbBusy = true;
    Compute.postMessage({ Type: "thumbnail", Id: Next, Preset: Next });
}

/// out   None   [-]  rebuilds the presets drawer cards and queues missing thumbnails
function RenderPresetGrid() {
    const Grid = El("preset-grid");
    Grid.innerHTML = Presets.map((Preset) => {
        const Current = State.Project.Name === Preset.Name ? " is-current" : "";
        return `<button type="button" class="preset-card${Current}" data-preset="${Escape(Preset.Id)}">` +
            `<canvas data-thumb="${Escape(Preset.Id)}" width="128" height="128"></canvas>` +
            `<strong>${Escape(Preset.Name)}</strong><span>${Escape(Preset.Summary)}</span></button>`;
    }).join("");
    for (const Preset of Presets) {
        const Canvas = Grid.querySelector(`[data-thumb="${CSS.escape(Preset.Id)}"]`);
        if (State.Thumbs[Preset.Id]) {
            PaintThumb(Canvas, State.Thumbs[Preset.Id]);
        } else if (!State.ThumbQueue.includes(Preset.Id)) {
            State.ThumbQueue.push(Preset.Id);
        }
    }
    PumpThumbs();
}

/// in    Project   [-]  complete landscape record to load
/// out   None      [-]  replaces the landscape, records history and recomputes
function LoadProject(Project) {
    PushHistory(Snapshot(State.Project));
    State.Project = CompleteProject(Project);
    State.Selected = null;
    State.Result = null;
    State.Drag = null;
    State.Pending = false;
    RenderAll();
    ScheduleCompute(0);
}

/// in    Kind   [-]  'Generator' or 'Erosion'
/// out   None   [-]  inserts a new layer above the selection and selects it
function AddLayer(Kind) {
    const Layer = Kind === "Erosion"
        ? Ero("Erosion", "Hydraulic", { Seed: 11 + State.Project.Layers.length })
        : Gen("Generator", "Perlin", { Amplitude: 400, Seed: 1 + State.Project.Layers.length, Params: DefaultGeneratorParams("Perlin") });
    const Anchor = State.Project.Layers.findIndex((Entry) => Entry.Id === State.Selected);
    Mutate(() => {
        State.Project.Layers.splice(Anchor < 0 ? State.Project.Layers.length : Anchor + 1, 0, Layer);
        State.Selected = Layer.Id;
    }, "commit", true);
}

/// in    Id     [-]  layer identifier
/// in    Step   [-]  -1 moves down the stack, +1 moves up
/// out   None   [-]  swaps the layer with its neighbour
function MoveLayer(Id, Step) {
    Mutate(() => {
        const Layers = State.Project.Layers;
        const Index = Layers.findIndex((Layer) => Layer.Id === Id);
        const Target = Index + Step;
        if (Index < 0 || Target < 0 || Target >= Layers.length) {
            return;
        }
        [Layers[Index], Layers[Target]] = [Layers[Target], Layers[Index]];
    }, "commit", true);
}

/// in    Id     [-]  layer identifier
/// out   None   [-]  inserts a copy above the original with fresh identifiers
function DuplicateLayer(Id) {
    Mutate(() => {
        const Layers = State.Project.Layers;
        const Index = Layers.findIndex((Layer) => Layer.Id === Id);
        if (Index < 0) {
            return;
        }
        const Copy = JSON.parse(JSON.stringify(Layers[Index]));
        Copy.Id = NewLayerId(Copy.Kind === "Erosion" ? "Ero" : "Gen");
        Copy.Name = `${Copy.Name} copy`;
        Copy.Masks = Copy.Masks.map((Mask_) => ({ ...Mask_, Id: NewLayerId("Mask") }));
        Layers.splice(Index + 1, 0, Copy);
        State.Selected = Copy.Id;
    }, "commit", true);
}

/// in    Id     [-]  layer identifier
/// out   None   [-]  removes the layer and selects the one below it
function DeleteLayer(Id) {
    Mutate(() => {
        const Layers = State.Project.Layers;
        const Index = Layers.findIndex((Layer) => Layer.Id === Id);
        if (Index < 0) {
            return;
        }
        Layers.splice(Index, 1);
        if (State.Selected === Id) {
            State.Selected = Layers[Math.max(0, Index - 1)]?.Id ?? null;
        }
    }, "commit", true);
}

/// in    Id     [-]  layer identifier
/// out   None   [-]  toggles visibility from the outliner
function ToggleVisible(Id) {
    const Layer = State.Project.Layers.find((Entry) => Entry.Id === Id);
    if (!Layer) {
        return;
    }
    Mutate(() => {
        Layer.Visible = !Layer.Visible;
    }, "commit", false);
}

/// in    Layer   [-]  layer that receives the mask
/// in    Kind    [-]  mask catalogue key
/// out   None    [-]  appends a new mask with catalogue defaults
function AddMask(Layer, Kind) {
    const Extra = MaskCatalogue[Kind].Generator ? { Generator: CompleteMaskSpec({ Kind }).Generator } : {};
    Mutate(() => {
        Layer.Masks.push(Mask(Kind, DefaultMaskParams(Kind), Extra));
    }, "commit", true);
}

/// in    Layer   [-]  owning layer
/// in    MaskId  [-]  mask identifier
/// out   None    [-]  removes the mask
function RemoveMask(Layer, MaskId) {
    Mutate(() => {
        Layer.Masks = Layer.Masks.filter((Mask_) => Mask_.Id !== MaskId);
    }, "commit", true);
}

/// out   None   [-]  steps back one history entry
function Undo() {
    if (!State.History.length) {
        return;
    }
    State.Future.push(Snapshot(State.Project));
    State.Project = CompleteProject(JSON.parse(State.History.pop()));
    State.Drag = null;
    RestoreSelection();
    RenderAll();
    ScheduleCompute(0);
}

/// out   None   [-]  steps forward one history entry
function Redo() {
    if (!State.Future.length) {
        return;
    }
    State.History.push(Snapshot(State.Project));
    State.Project = CompleteProject(JSON.parse(State.Future.pop()));
    State.Drag = null;
    RestoreSelection();
    RenderAll();
    ScheduleCompute(0);
}

/// out   None   [-]  clears a selection that no longer exists after undo or redo
function RestoreSelection() {
    if (State.Selected !== null && !State.Project.Layers.some((Layer) => Layer.Id === State.Selected)) {
        State.Selected = null;
    }
}

/// in    Name    [-]  landscape name
/// in    Suffix  [-]  file suffix including dot
/// out   Name    [-]  file-system safe name
function SafeName(Name, Suffix) {
    return `${String(Name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "landscape"}${Suffix}`;
}

/// in    Blob    [-]  content to save
/// in    Name    [-]  file name
/// out   None    [-]  triggers a browser download
function Download(Blob, Name) {
    const Url = URL.createObjectURL(Blob);
    const Link = document.createElement("a");
    Link.href = Url;
    Link.download = Name;
    document.body.appendChild(Link);
    Link.click();
    Link.remove();
    setTimeout(() => URL.revokeObjectURL(Url), 1000);
}

/// out   None   [-]  writes the heightmap as 16-bit little-endian raw, normalised to its own min and max
function ExportRaw() {
    if (!State.Heights || !State.Result) {
        ShowError("Nothing to export yet — wait for the first evaluation.");
        return;
    }
    const { Minimum, Maximum } = State.Result.Stats;
    const Span = Math.max(Maximum - Minimum, 1e-3);
    const Samples = new Uint16Array(State.Heights.length);
    for (let Index = 0; Index < Samples.length; Index++) {
        Samples[Index] = Math.round(Math.min(1, Math.max(0, (State.Heights[Index] - Minimum) / Span)) * 65535);
    }
    const Name = `${SafeName(State.Project.Name, "")}_${State.Result.N}x${State.Result.N}_z${Math.round(Minimum)}-${Math.round(Maximum)}m.r16`;
    Download(new Blob([Samples.buffer], { type: "application/octet-stream" }), Name);
}

/// out   None   [-]  saves the current satmap as PNG
function ExportSatmap() {
    if (!State.Satmap || !State.Result) {
        ShowError("Nothing to export yet — wait for the first evaluation.");
        return;
    }
    const Size = State.Result.N;
    const Canvas = document.createElement("canvas");
    Canvas.width = Size;
    Canvas.height = Size;
    Canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(State.Satmap), Size, Size), 0, 0);
    Canvas.toBlob((Blob) => Download(Blob, `${SafeName(State.Project.Name, "")}_satmap_${State.View.Satmap.toLowerCase()}.png`), "image/png");
}

/// out   None   [-]  downloads the project as JSON
function SaveJson() {
    Download(new Blob([JSON.stringify(State.Project, null, 2)], { type: "application/json" }), `${SafeName(State.Project.Name, ".landscape.json")}`);
}

/// out   None   [-]  persists the project and view to localStorage
function Persist() {
    try {
        localStorage.setItem(StorageKey, JSON.stringify({ Project: State.Project, Selected: State.Selected, View: State.View }));
    } catch (Failure) {
        console.warn("Persist skipped", Failure);
    }
}

/// out   Restored   [-]  true when a saved landscape was restored
function Restore() {
    try {
        const Saved = JSON.parse(localStorage.getItem(StorageKey) ?? "null");
        if (!Saved?.Project) {
            return false;
        }
        State.Project = CompleteProject(Saved.Project);
        State.Selected = State.Project.Layers.some((Layer) => Layer.Id === Saved.Selected) ? Saved.Selected : null;
        State.View = { ...State.View, ...(Saved.View ?? {}) };
        return true;
    } catch (Failure) {
        console.warn("Stored landscape ignored", Failure);
        return false;
    }
}

/// in    Canvas   [-]  element that receives pointer and wheel input
/// out   None     [-]  wires orbit and zoom to the terrain viewer
function BindViewport(Canvas) {
    let Dragging = false;
    Canvas.addEventListener("pointerdown", (Event) => {
        Dragging = true;
        Canvas.setPointerCapture(Event.pointerId);
    });
    Canvas.addEventListener("pointermove", (Event) => {
        if (!Dragging || !State.Viewer) {
            return;
        }
        State.Viewer.Orbit(Event.movementX, Event.movementY);
    });
    const Release = () => {
        Dragging = false;
    };
    Canvas.addEventListener("pointerup", Release);
    Canvas.addEventListener("pointercancel", Release);
    Canvas.addEventListener("wheel", (Event) => {
        Event.preventDefault();
        State.Viewer?.Zoom(Event.deltaY);
    }, { passive: false });
}

/// in    Mode   [-]  satmap identifier
/// out    None  [-]  changes the satmap texture without recomputing the terrain
function SetSatmapMode(Mode) {
    State.View.Satmap = Mode;
    if (State.Result) {
        Compute.postMessage({ Type: "satmap", Id: `satmap-${Mode}`, Mode, Palette: State.Project.Palette });
    }
    RenderLegend();
    Persist();
}

/// in    Event   [-]  change event from a form control
/// out   Handled [-]  true when the event belonged to an action control
function HandleChangeAction(Target) {
    const Action = Target.dataset.action;
    if (Action === "add-mask" && Target.value) {
        const Layer = SelectedLayer();
        if (Layer) {
            AddMask(Layer, Target.value);
        }
        return true;
    }
    return false;
}

/// in    Target   [-]  element that received input or change
/// in    Phase    [-]  'input' or 'commit'
/// out   Handled  [-]  true when a bound inspector control consumed the event
function HandleBinding(Target, Phase) {
    const Index = Target.dataset.bind;
    if (Index === undefined || !State.Form) {
        return false;
    }
    const Binding = State.Form.Bindings[Number(Index)];
    if (!Binding) {
        return false;
    }
    const Kind = Target.dataset.kind;
    if (Kind === "number" && Phase === "input") {
        return true;
    }
    let Value = Target.value;
    if (Kind === "range" || Kind === "number") {
        Value = Number(Target.value);
        if (Kind === "range") {
            const Companion = Target.closest(".slider-pill")?.querySelector('input[type="number"]');
            if (Companion) {
                Companion.value = Value.toFixed(Math.min(4, Math.max(0, -Math.floor(Math.log10(Number(Target.step) || 1)))));
            }
        }
    }
    Binding.Set(Value, Phase);
    return true;
}

/// in    Root   [-]  inspector container or heading that holds bound controls and layer actions
/// out   None   [-]  routes clicks, input and change events to the form bindings and layer actions
function WireInspectorRoot(Root) {
    Root.addEventListener("click", (Event) => {
        const Toggle = Event.target.closest("[data-toggle]");
        if (Toggle && State.Form) {
            State.Form.Bindings[Number(Toggle.dataset.toggle)]?.Set(null, "commit");
            return;
        }
        const Action = Event.target.closest("[data-action]");
        if (!Action) {
            return;
        }
        const Layer = SelectedLayer();
        if (Action.dataset.action === "remove-mask" && Layer) {
            RemoveMask(Layer, Action.dataset.id);
        } else if (Action.dataset.action === "move" && Layer) {
            MoveLayer(Layer.Id, Number(Action.dataset.dir));
        } else if (Action.dataset.action === "duplicate" && Layer) {
            DuplicateLayer(Layer.Id);
        } else if (Action.dataset.action === "delete" && Layer) {
            DeleteLayer(Layer.Id);
        }
    });
    Root.addEventListener("input", (Event) => {
        HandleBinding(Event.target, "input");
    });
    Root.addEventListener("change", (Event) => {
        if (HandleChangeAction(Event.target)) {
            return;
        }
        HandleBinding(Event.target, "commit");
    });
}

/// out   None   [-]  attaches every event listener for the static interface
function WireInterface() {
    const Outliner = El("outliner");
    Outliner.addEventListener("click", (Event) => {
        const Action = Event.target.closest("[data-action]");
        if (Action) {
            Event.stopPropagation();
            if (Action.dataset.action === "toggle-visible") {
                ToggleVisible(Action.dataset.id);
            }
            return;
        }
        const Row = Event.target.closest("[data-row]");
        if (Row) {
            State.Selected = Row.dataset.row || null;
            RenderAll();
            ScheduleCompute(0);
        }
    });
    Outliner.addEventListener("keydown", (Event) => {
        if ((Event.key === "Enter" || Event.key === " ") && Event.target.dataset?.row !== undefined) {
            Event.preventDefault();
            State.Selected = Event.target.dataset.row || null;
            RenderAll();
            ScheduleCompute(0);
        }
    });
    El("layer-filter").addEventListener("input", (Event) => {
        State.Filter = Event.target.value;
        RenderOutliner();
    });
    El("add-generator").addEventListener("click", () => AddLayer("Generator"));
    El("add-layer-quick").addEventListener("click", () => AddLayer("Generator"));
    El("add-erosion").addEventListener("click", () => AddLayer("Erosion"));

    for (const Root of [El("inspector"), El("inspector-heading")]) {
        WireInspectorRoot(Root);
    }

    El("recompute").addEventListener("click", () => {
        State.Result = null;
        ScheduleCompute(0);
    });
    El("presets-toggle").addEventListener("click", (Event) => {
        const Drawer = El("presets-drawer");
        Drawer.hidden = !Drawer.hidden;
        Event.currentTarget.setAttribute("aria-expanded", String(!Drawer.hidden));
        if (!Drawer.hidden) {
            RenderPresetGrid();
        }
    });
    El("preset-grid").addEventListener("click", (Event) => {
        const Card_ = Event.target.closest("[data-preset]");
        if (!Card_) {
            return;
        }
        LoadProject(PresetProject(Card_.dataset.preset));
    });

    for (const Button of document.querySelectorAll("[data-view]")) {
        Button.addEventListener("click", () => {
            State.View.Top = Button.dataset.view === "top";
            for (const Other of document.querySelectorAll("[data-view]")) {
                Other.classList.toggle("is-active", Other === Button);
            }
            State.Viewer?.SetOptions({ Top: State.View.Top });
            Persist();
        });
    }
    const Satmap = El("satmap-mode");
    Satmap.innerHTML = SatmapModes.map((Mode) => `<option value="${Escape(Mode.Id)}">${Escape(Mode.Label)}</option>`).join("");
    Satmap.value = State.View.Satmap;
    Satmap.addEventListener("change", () => SetSatmapMode(Satmap.value));

    const Shading = El("shading-mode");
    Shading.value = String(State.View.Shading);
    Shading.addEventListener("change", () => {
        State.View.Shading = Number(Shading.value);
        State.Viewer?.SetOptions({ Shading: State.View.Shading });
        Persist();
    });
    const Water = El("water-toggle");
    const Contours = El("contour-toggle");
    const SyncChips = () => {
        Water.classList.toggle("is-on", State.View.Water);
        Water.setAttribute("aria-pressed", String(State.View.Water));
        Contours.classList.toggle("is-on", State.View.Contours);
        Contours.setAttribute("aria-pressed", String(State.View.Contours));
    };
    Water.addEventListener("click", () => {
        State.View.Water = !State.View.Water;
        State.Viewer?.SetOptions({ Water: State.View.Water });
        SyncChips();
        Persist();
    });
    Contours.addEventListener("click", () => {
        State.View.Contours = !State.View.Contours;
        State.Viewer?.SetOptions({ Contours: State.View.Contours });
        SyncChips();
        Persist();
    });
    SyncChips();
    const Exaggeration = El("exaggeration");
    Exaggeration.value = String(State.View.Exaggeration);
    const ShowExaggeration = () => {
        El("exaggeration-value").textContent = `${Number(Exaggeration.value).toFixed(2)}×`;
    };
    Exaggeration.addEventListener("input", () => {
        State.View.Exaggeration = Number(Exaggeration.value);
        ShowExaggeration();
        State.Viewer?.SetOptions({ Exaggeration: State.View.Exaggeration });
    });
    Exaggeration.addEventListener("change", Persist);
    ShowExaggeration();

    El("undo").addEventListener("click", Undo);
    El("redo").addEventListener("click", Redo);
    El("export-raw").addEventListener("click", ExportRaw);
    El("export-png").addEventListener("click", ExportSatmap);
    El("save-json").addEventListener("click", SaveJson);
    El("open-json").addEventListener("click", () => El("open-json-file").click());
    El("open-json-file").addEventListener("change", async (Event) => {
        const File = Event.target.files?.[0];
        Event.target.value = "";
        if (!File) {
            return;
        }
        try {
            LoadProject(JSON.parse(await File.text()));
        } catch (Failure) {
            ShowError(`Could not open ${File.name}: ${Failure.message}`);
        }
    });

    document.addEventListener("keydown", (Event) => {
        const Tag = Event.target?.tagName;
        if (Tag === "INPUT" || Tag === "SELECT" || Tag === "TEXTAREA") {
            return;
        }
        if ((Event.ctrlKey || Event.metaKey) && Event.key.toLowerCase() === "z" && !Event.shiftKey) {
            Event.preventDefault();
            Undo();
        } else if ((Event.ctrlKey || Event.metaKey) && (Event.key.toLowerCase() === "y" || (Event.key.toLowerCase() === "z" && Event.shiftKey))) {
            Event.preventDefault();
            Redo();
        }
    });
    window.addEventListener("resize", () => State.Viewer?.Resize());
}

/// in    Canvas   [-]  viewport canvas
/// out   Viewer   [-]  terrain viewer, or null with a banner when WebGL2 is unavailable
function StartViewer(Canvas) {
    try {
        State.Viewer = CreateTerrainViewer(Canvas);
        State.Viewer.SetOptions({
            Top: State.View.Top,
            Shading: State.View.Shading,
            Water: State.View.Water,
            Contours: State.View.Contours,
            Exaggeration: State.View.Exaggeration,
        });
        BindViewport(Canvas);
        const Loop = () => {
            State.Viewer?.Frame();
            requestAnimationFrame(Loop);
        };
        requestAnimationFrame(Loop);
    } catch (Failure) {
        State.Viewer = null;
        ShowError(`The 3D view could not start.\n${Failure.message}\nThe layer stack and inspector still work.`);
    }
}

/// out   None   [-]  boots the editor: restores or loads a default landscape, starts the worker and the viewer
export function StartEditor() {
    Compute = new Worker(new URL("./Worker.js", import.meta.url), { type: "module" });
    Compute.addEventListener("message", OnWorkerMessage);
    Compute.addEventListener("error", (Failure) => ShowError(`Compute worker failed: ${Failure.message}`));

    if (!Restore()) {
        State.Project = PresetProject("Himalayan");
    }
    State.History = [];
    WireInterface();
    StartViewer(El("viewport-canvas"));
    RenderAll();
    ScheduleCompute(0);
}

