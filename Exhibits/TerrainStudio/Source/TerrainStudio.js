//============================================================================================================================================
//                                                              TERRAINSTUDIO.JS
//============================================================================================================================================
// 🧩 Frontier Terrain Studio: a combined SDF/voxel + heightfield terrain generator inside the latest
//    Frontier Editor chrome. Geological layer stack on the right, field-tested presets and the channel
//    registry on the left, and a live AAA-lit viewport in between.
//
// 📝 The design hinges on channels: fluvial incision writes Flow and Water, droplets write Wear and
//    Deposition, strata write Hardness — and any of those can be painted by hand, then pointed at from
//    any layer's mask or read directly by the material splat. Sculpt strokes live in their own delta
//    field applied by a stack layer, so hand work survives downstream re-erosion like real geology.

import { ReliefField, LatticeNoise, Resolution, TexelSize, WorldExtent, DerivedChannels, MaterialPaintChannels } from "./ReliefField.js";
import { LayerStackEvaluation, LayerTypes, LayerTypeById, ConstructLayer } from "./LayerStackEvaluation.js";
import { ReliefPresets } from "./ReliefPresets.js";
import { ReliefRasterization } from "./ReliefRasterization.js";
import { PolygoniseStamps, ConstructStamp, StampShapes } from "./DistanceStamps.js";
import { Cancellation, BakeSurfaceData } from "./ErosionSequence.js";

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  GLYPHS
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 24×24, 1.65 stroke, round caps — the EngineContent/Icons drafting rules. A few path sets (layers,
//    plus, search, save, reset) are reused verbatim from the shared icon collection.

const GlyphPaths =
{
    layers:  '<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 9 10 6 10-6M2 15l10 6 10-6"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>',
    search:  '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    save:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    reset:   '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    check:   '<path d="M20 6 9 17l-5-5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    panels:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    camera:  '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.4"/>',
    export:  '<path d="M12 3v11M7.5 6.5 12 2l4.5 4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    library: '<path d="M4 20V6a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 20Zm0 0a2.5 2.5 0 0 0 2.5 2H19v-4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
    help:    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3A2.6 2.6 0 1 1 12 12.6V14"/><circle cx="12" cy="17.4" r="0.4" fill="currentColor"/>',
    cube:    '<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
    expand:  '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
    zoomin:  '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8.5v5M8.5 11h5"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8.5 11h5"/>',
    eye:     '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/>',
    chevrondown: '<path d="m6 9 6 6 6-6"/>',
    grip:    '<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
    trash:   '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    star:    '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z"/>',
    brush:   '<path d="m14.5 4.5 5 5L9 20H4v-5Z"/><path d="m12.5 6.5 5 5M4 20c2.8.3 4.8-.7 5.6-2.9"/>',
    orbit:   '<circle cx="12" cy="12" r="3.2"/><path d="M20.5 9.5A9 9 0 1 0 21 13"/><path d="M21 5v4.5h-4.5"/>',
    raise:   '<path d="M3 19c3-7 6-10 9-10s6 3 9 10"/><path d="M12 9V4M9.5 6 12 3.5 14.5 6"/>',
    lower:   '<path d="M3 19c3-7 6-10 9-10s6 3 9 10"/><path d="M12 3.5V8M9.5 5.8 12 8.3l2.5-2.5"/>',
    flatten: '<path d="M3 18c2.5-4.5 5-7 7-7h4c2 0 4.5 2.5 7 7"/><path d="M8 7.5h8"/>',
    smooth:  '<path d="M3 18c3.5 0 4.5-8 9-8s5.5 8 9 8"/><path d="M3 18h18" stroke-dasharray="2.5 3"/>',
    strata:  '<path d="M3 7h18M3 12h18M3 17h18"/><path d="M7 7v5M14 12v5M10 17v2"/>',
    droplet: '<path d="M12 3.5s6 6.3 6 10.4a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5Z"/>',
    arch:    '<path d="M4 20v-4a8 8 0 0 1 16 0v4"/><path d="M8.5 20v-4.2a3.5 3.5 0 0 1 7 0V20"/>',
    erase:   '<path d="m6 18 9.5-11.5a1.8 1.8 0 0 1 2.6 0l2.4 2.6a1.8 1.8 0 0 1 0 2.5L13 20H7.5a2 2 0 0 1-1.5-2Zm-2.5 3h17"/>',
    massif:  '<path d="M3 19 9 7l4 6 3-4 5 10Z"/><path d="M9 7 7.8 9.2M9 7l1.2 2.2"/>',
    ridge:   '<path d="M3 19 7.5 8 11 14l3-7 7 12"/><path d="M7.5 8 6.2 10.4M14 7l-1.2 2.6"/>',
    front:   '<path d="M3 19c5-1 5-9 10-11 3.5-1.4 6 .5 8-.5"/><path d="M12 8l-1.5 3M16.5 6 15 9.5"/>',
    mesa:    '<path d="M4 19 7 9h10l3 10Z"/><path d="M7 9h10"/>',
    warp:    '<path d="M4 8c4-3.5 8 2.5 12 0"/><path d="M4 15c4-3.5 8 2.5 12 0"/><path d="M17.5 5.5 16 8l2.8.6M17.5 12.5 16 15l2.8.6"/>',
    river:   '<path d="M12 3v4c0 4-7 4.5-7 9v5"/><path d="M12 7c0 4 7 4.5 7 9"/><path d="M5 21h14"/>',
    glacier: '<path d="M3 20c4-9 8-13 12-13 2 0 4 1 6 3"/><path d="M8 13c2 1.6 2 4.4 0 7M13.5 10c2 2.4 2 6.6 0 10"/>',
    talus:   '<path d="M4 20 15 5l1 15"/><circle cx="9" cy="17.5" r="0.5" fill="currentColor"/><circle cx="11.5" cy="14.5" r="0.5" fill="currentColor"/><circle cx="13" cy="18.5" r="0.5" fill="currentColor"/>',
    wind:    '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 17h7"/>',
    snow:    '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 3l-2 2.5M12 3l2 2.5M12 21l-2-2.5M12 21l2-2.5"/>',
    sculpt:  '<path d="m5 19 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18l-4 1Z"/>',
    shuffle: '<path d="M4 6h4l10 12h2M20 6h-4l-2.5 3M4 18h4l2.5-3"/><path d="m17.5 3.5 2.5 2.5-2.5 2.5M17.5 15.5 20 18l-2.5 2.5"/>',
    spire:   '<path d="M12 3 8.5 20h7Z"/><path d="M12 3v17"/>',
    crag:    '<circle cx="9" cy="14" r="4.5"/><circle cx="15.5" cy="11" r="4"/><circle cx="14" cy="16.5" r="3.6"/>',
    fin:     '<path d="M6 20V7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5V20"/>',
};

function GlyphSvg(Name)
{
    const Paths = GlyphPaths[Name] || GlyphPaths.cube;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${Paths}</svg>`;
}

function HydrateGlyphs(Root)
{
    for (const Element of Root.querySelectorAll("i[data-glyph]"))
        Element.innerHTML = GlyphSvg(Element.dataset.glyph);
}

function GlyphSpan(Name)
{
    const Span = document.createElement("span");
    Span.className = "glyph";
    Span.innerHTML = GlyphSvg(Name);
    return Span;
}

function Construct(Tag, ClassName, Text)
{
    const Element = document.createElement(Tag);
    if (ClassName)
        Element.className = ClassName;
    if (Text !== undefined)
        Element.textContent = Text;
    return Element;
}

function ById(Id)
{
    return document.getElementById(Id);
}

function DeepClone(Reading)
{
    return JSON.parse(JSON.stringify(Reading));
}

function ShowToast(Message, GlyphName)
{
    const Root = ById("toast-root");
    const Toast = Construct("div", "toast");
    Toast.appendChild(GlyphSpan(GlyphName || "check"));
    Toast.appendChild(Construct("span", "", Message));
    Root.appendChild(Toast);
    setTimeout(() => Toast.remove(), 4200);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  POPOVER MENU
//--------------------------------------------------------------------------------------------------------------------------------------------

let OpenPopover = null;

function CloseMenu()
{
    if (OpenPopover)
    {
        OpenPopover.remove();
        OpenPopover = null;
    }
}

// Entries: {Group} or {Label, Sub, Glyph, Swatch, Checked, Action}
function OpenMenu(Anchor, Entries)
{
    if (OpenPopover && OpenPopover.Anchor === Anchor)
    {
        CloseMenu();
        return;
    }
    CloseMenu();
    const Menu = Construct("div", "popover-menu");
    Menu.Anchor = Anchor;
    for (const Entry of Entries)
    {
        if (Entry.Group)
        {
            Menu.appendChild(Construct("div", "menu-group-label", Entry.Group));
            continue;
        }
        const Button = Construct("button", "menu-entry");
        if (Entry.Swatch)
        {
            const Swatch = Construct("span", "swatch");
            Swatch.style.background = Entry.Swatch;
            Button.appendChild(Swatch);
        }
        else if (Entry.Glyph)
        {
            Button.appendChild(GlyphSpan(Entry.Glyph));
        }
        const TextBox = Construct("span");
        TextBox.appendChild(document.createTextNode(Entry.Label));
        if (Entry.Sub)
            TextBox.appendChild(Construct("span", "menu-sub", Entry.Sub));
        Button.appendChild(TextBox);
        if (Entry.Checked)
        {
            const Check = GlyphSpan("check");
            Check.classList.add("menu-check");
            Button.appendChild(Check);
        }
        Button.addEventListener("click", () =>
        {
            CloseMenu();
            if (Entry.Action)
                Entry.Action();
        });
        Menu.appendChild(Button);
    }
    ById("menu-root").appendChild(Menu);
    OpenPopover = Menu;
    const AnchorRect = Anchor.getBoundingClientRect();
    const MenuWidth = Menu.offsetWidth;
    const MenuHeight = Menu.offsetHeight;
    let Left = Math.min(AnchorRect.left, window.innerWidth - MenuWidth - 10);
    let Top = AnchorRect.bottom + 6;
    if (Top + MenuHeight > window.innerHeight - 8)
        Top = Math.max(8, AnchorRect.top - MenuHeight - 6);
    Menu.style.left = Math.max(8, Left) + "px";
    Menu.style.top = Top + "px";
}

document.addEventListener("pointerdown", (Event) =>
{
    if (OpenPopover && !OpenPopover.contains(Event.target) && OpenPopover.Anchor !== Event.target && !OpenPopover.Anchor.contains(Event.target))
        CloseMenu();
});

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  CONTROL CONSTRUCTORS
//--------------------------------------------------------------------------------------------------------------------------------------------

function FormatReading(Reading, Step)
{
    if (Math.abs(Reading) >= 10000)
        return String(Math.round(Reading));
    const Decimals = Step >= 1 ? 0 : Step >= 0.1 ? 1 : Step >= 0.01 ? 2 : 4;
    return Number(Reading.toFixed(Decimals)).toString();
}

function ConstructSlider(Spec)
{
    // Spec: {Label, Min, Max, Step, Unit, Get, Set(Reading, Committed)}
    const Root = Construct("div", "control");
    const Head = Construct("div", "control-head");
    Head.appendChild(Construct("span", "control-label", Spec.Label));
    const Pill = Construct("span", "value-pill");
    const NumberInput = document.createElement("input");
    NumberInput.type = "text";
    NumberInput.inputMode = "decimal";
    Pill.appendChild(NumberInput);
    Pill.appendChild(Construct("span", "unit", Spec.Unit || ""));
    Head.appendChild(Pill);
    Root.appendChild(Head);

    const Slider = document.createElement("input");
    Slider.type = "range";
    Slider.className = "pill-slider";
    Slider.min = Spec.Min;
    Slider.max = Spec.Max;
    Slider.step = Spec.Step;
    Root.appendChild(Slider);

    const Refresh = () =>
    {
        const Reading = Spec.Get();
        Slider.value = Reading;
        const Fill = (Reading - Spec.Min) / (Spec.Max - Spec.Min) * 100.0;
        Slider.style.setProperty("--fill", Fill.toFixed(1) + "%");
        if (document.activeElement !== NumberInput)
            NumberInput.value = FormatReading(Reading, Spec.Step);
    };
    Slider.addEventListener("input", () =>
    {
        Spec.Set(parseFloat(Slider.value), false);
        Refresh();
    });
    Slider.addEventListener("change", () =>
    {
        Spec.Set(parseFloat(Slider.value), true);
        Refresh();
    });
    NumberInput.addEventListener("change", () =>
    {
        let Reading = parseFloat(NumberInput.value);
        if (Number.isFinite(Reading))
        {
            Reading = Math.min(Spec.Max, Math.max(Spec.Min, Reading));
            Spec.Set(Reading, true);
        }
        Refresh();
    });
    Refresh();
    Root.Refresh = Refresh;
    return Root;
}

function ConstructToggle(Label, Sub, Get, Set)
{
    const Row = Construct("label", "switch-row");
    const TextBox = Construct("span");
    TextBox.appendChild(document.createTextNode(Label));
    if (Sub)
        TextBox.appendChild(Construct("small", "", Sub));
    Row.appendChild(TextBox);
    const Toggle = Construct("span", "toggle");
    Toggle.appendChild(Construct("span", "toggle-knob"));
    Row.appendChild(Toggle);
    const Refresh = () => Toggle.classList.toggle("on", !!Get());
    Row.addEventListener("click", (Event) =>
    {
        Event.preventDefault();
        Set(!Get());
        Refresh();
    });
    Refresh();
    Row.Refresh = Refresh;
    return Row;
}

function ConstructMiniToggle(Get, Set)
{
    const Toggle = Construct("span", "toggle mini");
    Toggle.appendChild(Construct("span", "toggle-knob"));
    const Refresh = () => Toggle.classList.toggle("on", !!Get());
    Toggle.addEventListener("click", (Event) =>
    {
        Event.stopPropagation();
        Set(!Get());
        Refresh();
    });
    Refresh();
    Toggle.Refresh = Refresh;
    return Toggle;
}

function ConstructSelectRow(Label, Get, Options, Set)
{
    // Options: [{Id, Label, Swatch?, Sub?}]
    const Row = Construct("div", "select-row");
    Row.appendChild(Construct("span", "control-label", Label));
    const Button = Construct("button", "select-button");
    const LabelSpan = Construct("span");
    Button.appendChild(LabelSpan);
    Button.appendChild(GlyphSpan("chevrondown"));
    Row.appendChild(Button);
    const Refresh = () =>
    {
        const Current = Options.find((Option) => Option.Id === Get());
        LabelSpan.textContent = Current ? Current.Label : Get();
    };
    Button.addEventListener("click", () =>
    {
        OpenMenu(Button, Options.map((Option) => ({
            Label: Option.Label,
            Sub: Option.Sub,
            Swatch: Option.Swatch,
            Checked: Option.Id === Get(),
            Action: () => { Set(Option.Id); Refresh(); },
        })));
    });
    Refresh();
    Row.Refresh = Refresh;
    return Row;
}

function ConstructCard(Title, GlyphName, Subtitle)
{
    const Card = Construct("div", "card");
    const Heading = Construct("div", "card-heading");
    const Left = Construct("span");
    Left.appendChild(GlyphSpan(GlyphName));
    Left.appendChild(document.createTextNode(Title));
    Heading.appendChild(Left);
    const Chevron = GlyphSpan("chevrondown");
    Chevron.classList.add("card-chevron");
    Heading.appendChild(Chevron);
    Card.appendChild(Heading);
    if (Subtitle)
        Card.appendChild(Construct("div", "card-subtitle", Subtitle));
    const Content = Construct("div", "card-content");
    Card.appendChild(Content);
    Heading.addEventListener("click", () => Card.classList.toggle("collapsed"));
    Card.Content = Content;
    return Card;
}

function TintCss(Tint)
{
    const To255 = (C) => Math.round(Math.min(Math.max(C, 0), 1) * 255);
    return `rgb(${To255(Tint[0])}, ${To255(Tint[1])}, ${To255(Tint[2])})`;
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  VIEW MODES
//--------------------------------------------------------------------------------------------------------------------------------------------

const ViewModes =
[
    { Id: 0,  Label: "Shaded" },
    { Id: 1,  Label: "Height" },
    { Id: 2,  Label: "Slope" },
    { Id: 3,  Label: "Flow accumulation" },
    { Id: 4,  Label: "Standing water" },
    { Id: 5,  Label: "Erosion wear" },
    { Id: 6,  Label: "Deposition" },
    { Id: 7,  Label: "Rock hardness" },
    { Id: 8,  Label: "Snow & ice" },
    { Id: 9,  Label: "Soil moisture" },
    { Id: 10, Label: "Normals" },
    { Id: 11, Label: "Channel · inspected" },
    { Id: 12, Label: "Occlusion (baked)" },
    { Id: 13, Label: "Protrusion (baked)" },
    { Id: 14, Label: "Traced density" },
];

const SunPresets =
[
    { Label: "Dawn",         Azimuth: 95,  Elevation: 9,  Intensity: 2.3, Exposure: 1.0, Clouds: 0.35 },
    { Label: "Morning",      Azimuth: 120, Elevation: 26, Intensity: 3.0, Exposure: 1.05, Clouds: 0.4 },
    { Label: "Afternoon sun", Azimuth: 140, Elevation: 42, Intensity: 3.3, Exposure: 1.05, Clouds: 0.4 },
    { Label: "Golden hour",  Azimuth: 252, Elevation: 11, Intensity: 2.6, Exposure: 1.1, Clouds: 0.45 },
    { Label: "Overcast",     Azimuth: 170, Elevation: 55, Intensity: 1.7, Exposure: 0.95, Clouds: 0.95 },
];

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  TERRAIN STUDIO
//--------------------------------------------------------------------------------------------------------------------------------------------

export class TerrainStudio
{
    constructor()
    {
        this.Field      = new ReliefField();
        this.Evaluation = new LayerStackEvaluation(this.Field);
        this.Raster     = new ReliefRasterization(ById("gl-canvas"));
        this.Layers     = [];
        this.Stamps     = [];
        this.Environment = null;
        this.ActivePreset = null;
        this.WorldName  = "Untitled";
        this.CustomPresets = this.LoadCustomPresets();

        this.SelectedLayerSerial = -1;
        this.InspectorPage = "layers";
        this.LibraryPage = "presets";
        this.ViewDimension = "3d";
        this.ViewMode = 0;
        this.InspectedChannel = "Flow";
        this.Shadows = true;
        this.ShowGrid = false;
        this.Autorotate = false;
        this.CloudAmount = 0.4;

        this.Brush =
        {
            Tool: "orbit",
            Radius: 95.0,
            Strength: 0.6,
            Softness: 0.55,
            ChannelName: "Water",
            ChannelSign: 1,
            Material: "PaintMeadow",
            StampShape: "Arch",
            StampScale: 115.0,
            StampRotation: 25.0,
            TerraceStep: 12.0,
        };

        this.Pointer =
        {
            Inside: false, NdcX: 0, NdcY: 0, Dirty: true,
            Hit: null, Dragging: null, LastX: 0, LastY: 0,
            Stroke: null, LastDab: null, FlattenTarget: 0,
        };

        this.History = [];
        this.HistoryIndex = -1;
        this.Evaluating = false;
        this.PendingRebuild = -1;
        this.EvalToken = null;
        this.RebuildTimer = null;
        this.LastUploadStamp = 0;
        this.Favourite = false;
        this.TimeOrigin = performance.now();

        this.ConstructChrome();
        this.ConstructPresetGrid();
        this.ConstructChannelList();
        this.ConstructSceneControls();
        this.ConstructBrushControls();
        this.BindViewport();
        this.BindKeyboard();
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              CHROME
    //--------------------------------------------------------------------------------------------------------

    ConstructChrome()
    {
        // Workspace segmented ⇄ inspector pages.
        for (const Button of ById("workspace-tabs").querySelectorAll("button"))
        {
            Button.addEventListener("click", () =>
            {
                const Page = Button.dataset.workspace === "layers" ? "layers"
                           : Button.dataset.workspace === "brush" ? "brush" : "scene";
                this.SetInspectorPage(Page);
            });
        }
        for (const Button of ById("inspector-tabs").querySelectorAll("button"))
            Button.addEventListener("click", () => this.SetInspectorPage(Button.dataset.page));

        for (const Button of ById("library-tabs").querySelectorAll("button"))
            Button.addEventListener("click", () => this.SetLibraryPage(Button.dataset.library));

        for (const Tab of document.querySelectorAll(".viewport-tab"))
            Tab.addEventListener("click", () => this.SetViewDimension(Tab.dataset.view));

        ById("panels-toggle").addEventListener("click", () => document.body.classList.toggle("panels-hidden"));
        ById("snapshot-button").addEventListener("click", () => this.Snapshot());
        ById("toolbar-snapshot").addEventListener("click", () => this.Snapshot());
        ById("export-button").addEventListener("click", (Event) => this.OpenExportMenu(Event.currentTarget));
        ById("import-button").addEventListener("click", () => ById("import-file").click());
        ById("import-file").addEventListener("change", (Event) => this.ImportProject(Event.target.files[0]));
        ById("rebuild-button").addEventListener("click", () => this.RebuildFrom(0));
        ById("progress-cancel").addEventListener("click", () =>
        {
            if (this.EvalToken)
                this.EvalToken.Requested = true;
        });
        ById("favourite-button").addEventListener("click", (Event) =>
        {
            this.Favourite = !this.Favourite;
            Event.currentTarget.classList.toggle("active", this.Favourite);
        });
        ById("about-button").addEventListener("click", () =>
            ShowToast("Terrain Studio — 1024² geological layer stack + SDF voxel stamps. Channels are reusable everywhere: paint Water, then mask a layer by it.", "compass"));
        ById("blank-world").addEventListener("click", () => this.LoadBlankWorld());
        ById("new-channel").addEventListener("click", () => this.CreateAuthoredChannel());
        ById("save-stack-button").addEventListener("click", () => this.SaveAsCustomPreset());

        // Viewport rail + pills.
        ById("zoom-in").addEventListener("click", () => { this.Raster.Camera.DistanceGoal *= 0.75; });
        ById("zoom-out").addEventListener("click", () => { this.Raster.Camera.DistanceGoal *= 1.33; });
        ById("frame-view").addEventListener("click", () => this.FrameCamera());
        ById("reset-camera").addEventListener("click", () =>
        {
            if (this.ActivePreset)
                this.FrameCamera();
            else
                this.Raster.Camera.Frame(-38, 24, 2600, this.Field.Maximum * 0.35);
        });
        ById("fullscreen-button").addEventListener("click", () =>
        {
            const Stage = ById("viewport-stage");
            if (document.fullscreenElement)
                document.exitFullscreen();
            else
                Stage.requestFullscreen().catch(() => {});
        });
        const AutorotateToggle = ById("autorotate-toggle");
        AutorotateToggle.addEventListener("click", () =>
        {
            this.Autorotate = !this.Autorotate;
            AutorotateToggle.classList.toggle("on", this.Autorotate);
        });
        ById("viewmode-select").addEventListener("click", (Event) =>
        {
            OpenMenu(Event.currentTarget, ViewModes.map((Mode) => ({
                Label: Mode.Id === 11 ? `Channel · ${this.InspectedChannel}` : Mode.Label,
                Checked: Mode.Id === this.ViewMode,
                Action: () => this.SetViewMode(Mode.Id),
            })));
        });
        ById("sun-select").addEventListener("click", (Event) =>
        {
            OpenMenu(Event.currentTarget, SunPresets.map((Preset) => ({
                Label: Preset.Label,
                Glyph: "sun",
                Action: () =>
                {
                    this.Environment.SunAzimuth = Preset.Azimuth;
                    this.Environment.SunElevation = Preset.Elevation;
                    this.Environment.SunIntensity = Preset.Intensity;
                    this.Environment.Exposure = Preset.Exposure;
                    this.CloudAmount = Preset.Clouds;
                    ById("sun-label").textContent = Preset.Label;
                    this.ConstructSceneControls();
                },
            })));
        });

        // Preset search + filters.
        ById("preset-search").addEventListener("input", () => this.ConstructPresetGrid());
        for (const Button of ById("preset-filters").querySelectorAll("button"))
        {
            Button.addEventListener("click", () =>
            {
                for (const Other of ById("preset-filters").querySelectorAll("button"))
                    Other.classList.remove("active");
                Button.classList.add("active");
                this.ConstructPresetGrid();
            });
        }

        // Brush tool tiles.
        for (const Tile of ById("tool-grid").querySelectorAll(".tool-tile"))
            Tile.addEventListener("click", () => this.SetTool(Tile.dataset.tool));

        ById("add-layer-button").addEventListener("click", (Event) => this.OpenAddLayerMenu(Event.currentTarget));
    }

    SetInspectorPage(Page)
    {
        this.InspectorPage = Page;
        for (const Button of ById("inspector-tabs").querySelectorAll("button"))
            Button.classList.toggle("active", Button.dataset.page === Page);
        for (const Button of ById("workspace-tabs").querySelectorAll("button"))
        {
            const Mapped = Button.dataset.workspace === "layers" ? "layers"
                         : Button.dataset.workspace === "brush" ? "brush" : "scene";
            Button.classList.toggle("active", Mapped === Page);
        }
        ById("page-layers").classList.toggle("hidden", Page !== "layers");
        ById("page-brush").classList.toggle("hidden", Page !== "brush");
        ById("page-scene").classList.toggle("hidden", Page !== "scene");
        if (Page === "brush" && this.Brush.Tool === "orbit")
            this.SetHint("Pick a brush — sculpt strokes live in their own stack layer and survive re-erosion");
    }

    SetLibraryPage(Page)
    {
        this.LibraryPage = Page;
        for (const Button of ById("library-tabs").querySelectorAll("button"))
            Button.classList.toggle("active", Button.dataset.library === Page);
        ById("presets-page").classList.toggle("hidden", Page !== "presets");
        ById("channels-page").classList.toggle("hidden", Page !== "channels");
        ById("crumb-current").textContent = Page === "presets" ? "Terrain explorer" : "Channel registry";
    }

    SetViewDimension(Dimension)
    {
        this.ViewDimension = Dimension;
        for (const Tab of document.querySelectorAll(".viewport-tab"))
        {
            const Active = Tab.dataset.view === Dimension;
            Tab.classList.toggle("active", Active);
            Tab.classList.toggle("inactive", !Active);
        }
        ById("viewport-title").classList.toggle("hidden", Dimension !== "3d");
        ById("gl-canvas").classList.toggle("hidden", Dimension !== "3d");
        ById("field2d-canvas").classList.toggle("hidden", Dimension !== "2d");
        if (Dimension === "2d")
        {
            this.Render2DField();
            this.SetHint("2D field — paint channels and sculpt from above; the 3D world follows on release");
        }
    }

    SetViewMode(ModeId)
    {
        this.ViewMode = ModeId;
        this.Raster.UseRaymarch = (ModeId === 14);
        const Mode = ViewModes.find((Candidate) => Candidate.Id === ModeId);
        ById("viewmode-label").textContent = ModeId === 11 ? `Channel · ${this.InspectedChannel}` : Mode.Label;
        ById("status-view").textContent = ModeId === 11 ? `Channel ${this.InspectedChannel}` : Mode.Label;
        const Chip = ById("chip-viewmode");
        Chip.classList.toggle("hidden", ModeId === 0);
        Chip.textContent = ModeId === 11 ? `Channel · ${this.InspectedChannel}` : Mode.Label;
        if (this.ViewDimension === "2d")
            this.Render2DField();
    }

    SetHint(Text)
    {
        ById("viewport-hint").textContent = Text;
    }

    SetSyncState(Text, Busy)
    {
        ById("sync-text").textContent = Text;
        ById("sync-dot").classList.toggle("busy", !!Busy);
        const Badge = ById("stack-badge");
        Badge.textContent = Busy ? "Building" : "Ready";
        Badge.classList.toggle("stale", !!Busy);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              PRESET GRID + THUMBNAILS
    //--------------------------------------------------------------------------------------------------------

    AllPresets()
    {
        return [...ReliefPresets, ...this.CustomPresets];
    }

    ConstructPresetGrid()
    {
        const Grid = ById("preset-grid");
        Grid.textContent = "";
        const Query = (ById("preset-search").value || "").toLowerCase();
        const ActiveFilter = ById("preset-filters").querySelector("button.active");
        const Filter = ActiveFilter ? ActiveFilter.dataset.filter : "all";
        let Shown = 0;
        for (const Preset of this.AllPresets())
        {
            if (Filter !== "all" && Preset.Category !== Filter)
                continue;
            if (Query && !(Preset.Label + " " + Preset.Region).toLowerCase().includes(Query))
                continue;
            Shown++;
            const Card = Construct("button", "preset-card");
            if (this.ActivePreset && this.ActivePreset.Id === Preset.Id)
                Card.classList.add("active");
            const Thumb = document.createElement("canvas");
            Thumb.width = 160;
            Thumb.height = 116;
            this.DrawSyntheticThumb(Thumb, Preset);
            Card.appendChild(Thumb);
            const Badge = Construct("span", "preset-check");
            Badge.innerHTML = GlyphSvg("check");
            Card.appendChild(Badge);
            Card.appendChild(Construct("div", "preset-name", Preset.Label));
            Card.appendChild(Construct("div", "preset-kind", Preset.Category + " · 1024²"));
            Card.title = Preset.Blurb;
            Card.addEventListener("click", () => this.LoadPreset(Preset));
            Grid.appendChild(Card);
            Preset._thumbCanvas = Thumb;
        }
        ById("preset-shown").textContent = Shown;
        ById("preset-count").textContent = this.AllPresets().length;
        if (this.ActivePreset && this.ActivePreset._builtHeights)
            this.DrawRealThumb(this.ActivePreset);
    }

    // 📝 A fast impressionistic hillshade per geology, replaced by the true relief once built.
    DrawSyntheticThumb(Canvas, Preset)
    {
        const Ctx = Canvas.getContext("2d");
        const W = Canvas.width, H = Canvas.height;
        const Noise = new LatticeNoise(Preset.SeedMark || 99);
        const Heights = new Float32Array(W * H);
        for (let Y = 0; Y < H; Y++)
        {
            for (let X = 0; X < W; X++)
            {
                const Nx = X / W * 5.2, Ny = Y / H * 5.2;
                let Reading;
                if (Preset.Id === "Canyon")
                {
                    Reading = Noise.Fractal(Nx * 0.5, Ny * 0.5, 4, 2.0, 0.5) * 0.5 + 0.5;
                    Reading = Math.pow(Reading, 0.45);
                    Reading = Math.round(Reading * 7.0) / 7.0 + Noise.Fractal(Nx * 2.0, Ny * 2.0, 3, 2.0, 0.5) * 0.05;
                }
                else if (Preset.Id === "RockyDesert")
                {
                    const Cell = Noise.Cellular(Nx * 0.9, Ny * 0.9);
                    Reading = Math.min(Math.max((Cell - 0.05) / 0.5, 0), 1) * 0.75 + Noise.Fractal(Nx, Ny, 3, 2.0, 0.5) * 0.16 + 0.1;
                }
                else
                {
                    Reading = Noise.Ridged(Nx, Ny, 5, 2.05, 0.52, 1.6) * 0.72 + Noise.Fractal(Nx * 0.5 + 9, Ny * 0.5, 4, 2.0, 0.5) * 0.28 + 0.12;
                }
                Heights[Y * W + X] = Reading;
            }
        }
        this.HillshadeToCanvas(Ctx, W, H, (Px, Py) => Heights[Math.min(H - 1, Math.max(0, Py)) * W + Math.min(W - 1, Math.max(0, Px))], 1.9, Preset.Category);
    }

    DrawRealThumb(Preset)
    {
        const Canvas = Preset._thumbCanvas;
        if (!Canvas)
            return;
        const Ctx = Canvas.getContext("2d");
        const W = Canvas.width, H = Canvas.height;
        const FieldHeights = this.Field.Heights;
        const Range = Math.max(this.Field.Maximum - this.Field.Minimum, 1.0);
        const Sample = (Px, Py) =>
        {
            const Tx = Math.min(Resolution - 1, Math.max(0, Math.floor(Px / W * Resolution)));
            const Ty = Math.min(Resolution - 1, Math.max(0, Math.floor(Py / H * Resolution)));
            return (FieldHeights[Ty * Resolution + Tx] - this.Field.Minimum) / Range;
        };
        this.HillshadeToCanvas(Ctx, W, H, Sample, 60.0, Preset.Category);
        Preset._builtHeights = true;
        // Identity thumb mirrors the built world.
        const Identity = ById("identity-thumb");
        const ICtx = Identity.getContext("2d");
        const SampleSquare = (Px, Py) =>
        {
            const Tx = Math.min(Resolution - 1, Math.max(0, Math.floor(Px / 96 * Resolution)));
            const Ty = Math.min(Resolution - 1, Math.max(0, Math.floor(Py / 96 * Resolution)));
            return (FieldHeights[Ty * Resolution + Tx] - this.Field.Minimum) / Range;
        };
        this.HillshadeToCanvas(ICtx, 96, 96, SampleSquare, 60.0, Preset.Category);
    }

    HillshadeToCanvas(Ctx, W, H, Sample, GradientScale, Category)
    {
        const Image = Ctx.createImageData(W, H);
        const Pixels = Image.data;
        const LightX = -0.52, LightY = -0.40, LightZ = 0.76;
        for (let Y = 0; Y < H; Y++)
        {
            for (let X = 0; X < W; X++)
            {
                const Centre = Sample(X, Y);
                const GradX = (Sample(X + 1, Y) - Sample(X - 1, Y)) * GradientScale;
                const GradY = (Sample(X, Y + 1) - Sample(X, Y - 1)) * GradientScale;
                let Nx = -GradX, Ny = -GradY, Nz = 1.0;
                const Len = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
                Nx /= Len; Ny /= Len; Nz /= Len;
                const Shade = 0.22 + 0.95 * Math.max(Nx * LightX + Ny * LightY + Nz * LightZ, 0.0);
                let R, G, B;
                if (Category === "Arid")
                {
                    const Band = Math.sin(Centre * 40.0) * 0.5 + 0.5;
                    R = 0.52 + Band * 0.20; G = 0.32 + Band * 0.10; B = 0.19;
                    const Valley = Math.max(0, 0.35 - Centre) * 1.2;
                    R += Valley * 0.2; G += Valley * 0.22; B += Valley * 0.05;
                }
                else
                {
                    R = 0.30 + Centre * 0.28; G = 0.33 + Centre * 0.26; B = 0.34 + Centre * 0.30;
                    if (Centre > 0.68)
                    {
                        const SnowT = Math.min((Centre - 0.68) / 0.2, 1.0);
                        R += SnowT * 0.5; G += SnowT * 0.52; B += SnowT * 0.55;
                    }
                    const Low = Math.max(0, 0.3 - Centre);
                    G += Low * 0.5; R -= Low * 0.1;
                }
                const Offset = (Y * W + X) * 4;
                Pixels[Offset]     = Math.min(R * Shade * 340, 255);
                Pixels[Offset + 1] = Math.min(G * Shade * 340, 255);
                Pixels[Offset + 2] = Math.min(B * Shade * 340, 255);
                Pixels[Offset + 3] = 255;
            }
        }
        Ctx.putImageData(Image, 0, 0);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              CHANNEL LIST
    //--------------------------------------------------------------------------------------------------------

    ConstructChannelList()
    {
        const DerivedHost = ById("channel-list-derived");
        const AuthoredHost = ById("channel-list-authored");
        DerivedHost.textContent = "";
        AuthoredHost.textContent = "";
        this.ChannelPreviewCanvases = new Map();
        let Count = 0;
        for (const Channel of this.Field.Channels.values())
        {
            Count++;
            const Row = Construct("button", "channel-row");
            if (Channel.Name === this.Brush.ChannelName || Channel.Name === this.InspectedChannel)
                Row.classList.add("selected");
            const Preview = document.createElement("canvas");
            Preview.width = 38;
            Preview.height = 38;
            Row.appendChild(Preview);
            this.ChannelPreviewCanvases.set(Channel.Name, Preview);
            const TextBox = Construct("span");
            TextBox.appendChild(Construct("div", "channel-name", Channel.Label));
            TextBox.appendChild(Construct("div", "channel-writer", Channel.Writer));
            Row.appendChild(TextBox);
            const Actions = Construct("span", "channel-actions");
            const ViewButton = Construct("button", "icon-button");
            ViewButton.innerHTML = GlyphSvg("eye");
            ViewButton.title = "Inspect in viewport";
            ViewButton.addEventListener("click", (Event) =>
            {
                Event.stopPropagation();
                this.InspectChannel(Channel.Name);
            });
            const PaintButton = Construct("button", "icon-button");
            PaintButton.innerHTML = GlyphSvg("brush");
            PaintButton.title = "Paint this channel";
            PaintButton.addEventListener("click", (Event) =>
            {
                Event.stopPropagation();
                this.Brush.ChannelName = Channel.Name;
                this.SetInspectorPage("brush");
                this.SetTool("channel");
            });
            Actions.appendChild(ViewButton);
            Actions.appendChild(PaintButton);
            Row.appendChild(Actions);
            Row.addEventListener("click", () => this.InspectChannel(Channel.Name));
            (Channel.Authored ? AuthoredHost : DerivedHost).appendChild(Row);
        }
        ById("channel-count").textContent = Count;
        this.RefreshChannelPreviews();
    }

    RefreshChannelPreviews()
    {
        if (!this.ChannelPreviewCanvases)
            return;
        for (const [Name, Canvas] of this.ChannelPreviewCanvases)
        {
            const Channel = this.Field.Channel(Name);
            if (!Channel)
                continue;
            const Ctx = Canvas.getContext("2d");
            const W = 38, H = 38;
            const Image = Ctx.createImageData(W, H);
            const Step = Resolution / W;
            for (let Y = 0; Y < H; Y++)
            {
                for (let X = 0; X < W; X++)
                {
                    const Index = Math.floor(Y * Step) * Resolution + Math.floor(X * Step);
                    const Reading = Math.min(Math.max(Channel.Samples[Index], 0), 1);
                    const Offset = (Y * W + X) * 4;
                    Image.data[Offset]     = 10 + Reading * Channel.Tint[0] * 245;
                    Image.data[Offset + 1] = 10 + Reading * Channel.Tint[1] * 245;
                    Image.data[Offset + 2] = 10 + Reading * Channel.Tint[2] * 245;
                    Image.data[Offset + 3] = 255;
                }
            }
            Ctx.putImageData(Image, 0, 0);
        }
    }

    InspectChannel(Name)
    {
        const Channel = this.Field.Channel(Name);
        if (!Channel)
            return;
        this.InspectedChannel = Name;
        this.Raster.UploadOverlay(Channel.Samples, Channel.Tint);
        const DerivedIndex = { Flow: 3, Water: 4, Wear: 5, Deposition: 6, Hardness: 7, Snow: 8, Moisture: 9, Occlusion: 12, Protrusion: 13 }[Name];
        this.SetViewMode(DerivedIndex !== undefined ? DerivedIndex : 11);
        this.ConstructChannelList();
    }

    CreateAuthoredChannel()
    {
        let Serial = 1;
        while (this.Field.Channel("Mask " + Serial))
            Serial++;
        const Name = "Mask " + Serial;
        const Tints = [[1.0, 0.45, 0.75], [0.45, 0.9, 1.0], [1.0, 0.8, 0.3], [0.65, 1.0, 0.5]];
        this.Field.RegisterChannel(Name, Name, Tints[(Serial - 1) % Tints.length], true, "Authored mask");
        this.Brush.ChannelName = Name;
        this.ConstructChannelList();
        this.ConstructBrushControls();
        ShowToast(`Channel “${Name}” registered — paint it, then use it as any layer's mask`, "droplet");
    }

    ChannelOptions()
    {
        const Options = [];
        for (const Channel of this.Field.Channels.values())
            Options.push({ Id: Channel.Name, Label: Channel.Label, Swatch: TintCss(Channel.Tint) });
        return Options;
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              WORLD LOADING + EVALUATION
    //--------------------------------------------------------------------------------------------------------

    LoadPreset(Preset)
    {
        this.ActivePreset = Preset;
        this.WorldName = Preset.Label;
        this.Layers = Preset.BuildLayers();
        this.Stamps = (Preset.Stamps || []).map((Spec) =>
        {
            const Stamp = ConstructStamp(Spec.Shape, Spec.X, Spec.Z, Spec.Scale, Spec.Rotation);
            if (Spec.Blend) Stamp.Blend = Spec.Blend;
            if (Spec.Sink) Stamp.Sink = Spec.Sink;
            return Stamp;
        });
        this.Environment = DeepClone(Preset.Environment);
        this.Raster.SetEnvironment(this.Environment);
        this.Field.Heights.fill(0.0);
        this.Field.SculptDelta.fill(0.0);
        for (const Channel of this.Field.Channels.values())
            Channel.Samples.fill(0.0);
        this.Evaluation.Cache = [];
        this.History = [];
        this.HistoryIndex = -1;
        this.SelectedLayerSerial = this.Layers.length ? this.Layers[this.Layers.length - 1].Serial : -1;

        ById("doc-name").textContent = Preset.Label;
        ById("identity-name").textContent = Preset.Label;
        const PresetIndex = ReliefPresets.indexOf(Preset);
        ById("title-region").textContent = `${PresetIndex >= 0 ? String(PresetIndex + 1).padStart(2, "0") : "★"} / ${Preset.Category} collection · ${Preset.Region}`;
        ById("title-name").textContent = Preset.Label;
        ById("title-blurb").textContent = Preset.Blurb;
        ById("layer-count").textContent = this.Layers.length;

        this.ConstructPresetGrid();
        this.RenderLayerStack();
        this.RenderLayerProperties();
        this.ConstructSceneControls();
        if (Preset.Camera)
            this.Raster.Camera.Frame(Preset.Camera.Azimuth, Preset.Camera.Elevation, Preset.Camera.Distance, 260);
        this.FrameAfterBuild = true;
        this.RebuildFrom(0);
    }

    LoadBlankWorld()
    {
        const Blank =
        {
            Id: "Blank",
            Label: "Blank upland",
            Region: "Nowhere yet",
            Category: "Alpine",
            Blurb: "One continental layer. The rest of the geology is yours to stack.",
            SeedMark: 7,
            BuildLayers: () => [
                ConstructLayer("ContinentalMass", { Label: "First landmass", Blend: "Replace", Seed: 7,
                    Params: { Amplitude: 380, BaseElevation: 20, Wavelength: 950 } }),
            ],
            Environment: DeepClone(ReliefPresets[0].Environment),
            Stamps: [],
            Camera: { Azimuth: -38, Elevation: 24, Distance: 2600 },
        };
        this.LoadPreset(Blank);
    }

    RebuildFrom(Index)
    {
        this.PendingRebuild = this.PendingRebuild >= 0 ? Math.min(this.PendingRebuild, Index) : Index;
        if (this.EvalToken)
            this.EvalToken.Requested = true;
        if (!this.Evaluating)
            this.RunRebuildLoop();
    }

    async RunRebuildLoop()
    {
        this.Evaluating = true;
        const Pill = ById("progress-pill");
        while (this.PendingRebuild >= 0)
        {
            const FromIndex = this.PendingRebuild;
            this.PendingRebuild = -1;
            const Token = new Cancellation();
            this.EvalToken = Token;
            const StartedAt = performance.now();
            Pill.classList.remove("hidden");
            this.SetSyncState("Building terrain…", true);
            try
            {
                await this.Evaluation.Evaluate(this.Layers, FromIndex, (Stage, Fraction) =>
                {
                    ById("progress-fill").style.width = (Fraction * 100).toFixed(0) + "%";
                    ById("progress-label").textContent = Stage;
                    ById("progress-pct").textContent = (Fraction * 100).toFixed(0) + "%";
                    this.SetSyncState(`Building — ${Stage}`, true);
                }, Token);
                const Elapsed = performance.now() - StartedAt;
                ById("status-eval").textContent = `Built in ${(Elapsed / 1000).toFixed(1)} s · ${this.Layers.length} layers`;
                this.AfterBuild();
                if (this.FrameAfterBuild && FromIndex === 0)
                {
                    this.FrameAfterBuild = false;
                    this.FrameCamera();
                }
                this.SetSyncState("Workspace up to date", false);
            }
            catch (Failure)
            {
                if (Failure && Failure.message === "Cancelled")
                {
                    // Restore the last complete layer snapshot so a cancelled erosion never strands us.
                    for (let Index = this.Evaluation.Cache.length - 1; Index >= 0; Index--)
                    {
                        if (this.Evaluation.Cache[Index])
                        {
                            this.Field.Heights.set(this.Evaluation.Cache[Index]);
                            break;
                        }
                    }
                    this.Field.MeasureRange();
                    this.AfterBuild();
                    this.SetSyncState("Rebuild cancelled — showing last complete layer", false);
                }
                else
                {
                    console.error(Failure);
                    this.SetSyncState("Build failed — see console", false);
                    ShowToast("Build failed: " + Failure.message, "help");
                }
            }
        }
        Pill.classList.add("hidden");
        this.Evaluating = false;
        this.EvalToken = null;
    }

    // The 2 km frame is a diorama, not a continent: ease the outer rim down toward the valley
    // floor so the world grounds itself against the water sheet instead of ending in a cliff
    // at the texture border. Applied after evaluation (and to the top cache), so the geology
    // in the interior is untouched and sculpting stays consistent with what is drawn.
    ApplyBorderTaper()
    {
        const Heights = this.Field.Heights;
        const Target = this.Field.Minimum - 25.0;
        this.BorderTarget = Target;
        const Rim = Math.floor(Resolution * 0.085);
        for (let Z = 0; Z < Resolution; Z++)
        {
            for (let X = 0; X < Resolution; X++)
            {
                const EdgeDist = Math.min(X, Z, Resolution - 1 - X, Resolution - 1 - Z);
                if (EdgeDist >= Rim)
                    continue;
                let T = EdgeDist / Rim;
                T = T * T * (3.0 - 2.0 * T);
                const Index = Z * Resolution + X;
                Heights[Index] = Target + (Heights[Index] - Target) * T;
            }
        }
        this.Field.MeasureRange();
        const TopCache = this.Evaluation.Cache[this.Layers.length - 1];
        if (TopCache)
            TopCache.set(Heights);
    }

    AfterBuild()
    {
        this.ApplyBorderTaper();
        // Bake the data maps the splat shader textures from (occlusion + protrusion).
        BakeSurfaceData(this.Field);
        this.Raster.UploadField(this.Field);
        this.Raster.UploadPaint(this.Field);
        const Inspected = this.Field.Channel(this.InspectedChannel);
        if (Inspected)
            this.Raster.UploadOverlay(Inspected.Samples, Inspected.Tint);
        // Strata band period follows the topmost strata layer, so colour banding matches the terraces.
        this.Raster.StrataBand = 26.0;
        for (const Layer of this.Layers)
        {
            if (Layer.TypeId === "StrataTerrace" && Layer.Enabled)
                this.Raster.StrataBand = Layer.Params.BandMetres;
        }
        this.RefreshChannelPreviews();
        this.RefreshSurvey();
        if (this.ActivePreset)
            this.DrawRealThumb(this.ActivePreset);
        if (this.ViewDimension === "2d")
            this.Render2DField();
        if (this.Stamps.length)
            this.RefreshStamps();
    }

    RefreshSurvey()
    {
        ById("metric-peak").innerHTML = `${Math.round(this.Field.Maximum)}<small>m</small>`;
        ById("metric-relief").innerHTML = `${Math.round(this.Field.Maximum - this.Field.Minimum)}<small>m</small>`;
        ById("survey-line").textContent =
            `Relief ${Math.round(this.Field.Minimum)}…${Math.round(this.Field.Maximum)} m over 2.0 km · ` +
            `${this.Stamps.length} SDF stamp${this.Stamps.length === 1 ? "" : "s"} · ` +
            `${(this.Raster.StampIndexCount / 3).toLocaleString()} stamp triangles`;
        ById("footer-stats").textContent =
            `Peak ${Math.round(this.Field.Maximum)} m · relief ${Math.round(this.Field.Maximum - this.Field.Minimum)} m · 1024²`;
    }

    RefreshStamps()
    {
        const StartedAt = performance.now();
        this.SetSyncState("Polygonising SDF stamps…", true);
        setTimeout(() =>
        {
            const Surface = PolygoniseStamps(this.Field, this.Stamps);
            this.Raster.SetStampSurface(Surface);
            this.RefreshSurvey();
            this.SetSyncState(`Stamps polygonised in ${Math.round(performance.now() - StartedAt)} ms`, false);
        }, 30);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              LAYER STACK UI
    //--------------------------------------------------------------------------------------------------------

    SelectedLayer()
    {
        return this.Layers.find((Layer) => Layer.Serial === this.SelectedLayerSerial) || null;
    }

    RenderLayerStack()
    {
        const Host = ById("layer-stack");
        Host.textContent = "";
        ById("layer-count").textContent = this.Layers.length;
        // Geological order on screen: youngest (last evaluated) at the top, basement at the bottom.
        for (let DisplayIndex = this.Layers.length - 1; DisplayIndex >= 0; DisplayIndex--)
        {
            const Layer = this.Layers[DisplayIndex];
            const Type = LayerTypeById(Layer.TypeId);
            const Card = Construct("div", "layer-card");
            Card.dataset.index = DisplayIndex;
            if (Layer.Serial === this.SelectedLayerSerial)
                Card.classList.add("selected");
            if (!Layer.Enabled)
                Card.classList.add("disabled");

            const Grip = Construct("span", "layer-grip");
            Grip.innerHTML = GlyphSvg("grip");
            Grip.title = "Drag to restack";
            Card.appendChild(Grip);

            const GlyphBox = Construct("span", "layer-glyph");
            GlyphBox.innerHTML = GlyphSvg(Type.Glyph);
            Card.appendChild(GlyphBox);

            const TextBox = Construct("span", "layer-text");
            TextBox.appendChild(Construct("div", "layer-name", Layer.Label));
            const Sub = Construct("div", "layer-sub");
            Sub.appendChild(document.createTextNode(Type.Label));
            if (Layer.MaskChannel)
                Sub.appendChild(Construct("span", "mask-chip", "Mask · " + Layer.MaskChannel));
            TextBox.appendChild(Sub);
            Card.appendChild(TextBox);

            const IndexOfLayer = DisplayIndex;
            Card.appendChild(ConstructMiniToggle(() => Layer.Enabled, (On) =>
            {
                Layer.Enabled = On;
                this.RenderLayerStack();
                this.RebuildFrom(IndexOfLayer);
            }));

            const DeleteButton = Construct("button", "layer-delete");
            DeleteButton.innerHTML = GlyphSvg("trash");
            DeleteButton.title = "Remove layer";
            DeleteButton.addEventListener("click", (Event) =>
            {
                Event.stopPropagation();
                this.Layers.splice(IndexOfLayer, 1);
                this.Evaluation.InvalidateFrom(IndexOfLayer);
                if (this.SelectedLayerSerial === Layer.Serial)
                    this.SelectedLayerSerial = this.Layers.length ? this.Layers[Math.min(IndexOfLayer, this.Layers.length - 1)].Serial : -1;
                this.RenderLayerStack();
                this.RenderLayerProperties();
                this.RebuildFrom(IndexOfLayer);
            });
            Card.appendChild(DeleteButton);

            Card.addEventListener("click", () =>
            {
                this.SelectedLayerSerial = Layer.Serial;
                this.RenderLayerStack();
                this.RenderLayerProperties();
            });

            // Drag restacking.
            Grip.addEventListener("pointerdown", () => { Card.draggable = true; });
            Card.addEventListener("dragstart", (Event) =>
            {
                Event.dataTransfer.setData("text/plain", String(IndexOfLayer));
                Event.dataTransfer.effectAllowed = "move";
            });
            Card.addEventListener("dragend", () => { Card.draggable = false; });
            Card.addEventListener("dragover", (Event) =>
            {
                Event.preventDefault();
                Card.classList.add("drag-over");
            });
            Card.addEventListener("dragleave", () => Card.classList.remove("drag-over"));
            Card.addEventListener("drop", (Event) =>
            {
                Event.preventDefault();
                Card.classList.remove("drag-over");
                const From = parseInt(Event.dataTransfer.getData("text/plain"), 10);
                if (!Number.isFinite(From) || From === IndexOfLayer)
                    return;
                const Moved = this.Layers.splice(From, 1)[0];
                this.Layers.splice(IndexOfLayer, 0, Moved);
                const Lowest = Math.min(From, IndexOfLayer);
                this.Evaluation.InvalidateFrom(Lowest);
                this.RenderLayerStack();
                this.RenderLayerProperties();
                this.RebuildFrom(Lowest);
            });

            Host.appendChild(Card);
        }
    }

    OpenAddLayerMenu(Anchor)
    {
        const Groups = ["Formation", "Erosion", "Surface"];
        const Entries = [];
        for (const Group of Groups)
        {
            Entries.push({ Group });
            for (const Type of LayerTypes)
            {
                if (Type.Group !== Group)
                    continue;
                Entries.push({
                    Label: Type.Label,
                    Sub: Type.Blurb,
                    Glyph: Type.Glyph,
                    Action: () =>
                    {
                        const Layer = ConstructLayer(Type.Id, { Seed: 1000 + Math.floor(Math.random() * 89999) });
                        this.Layers.push(Layer);
                        this.SelectedLayerSerial = Layer.Serial;
                        this.RenderLayerStack();
                        this.RenderLayerProperties();
                        this.RebuildFrom(this.Layers.length - 1);
                    },
                });
            }
        }
        OpenMenu(Anchor, Entries);
    }

    ScheduleRebuild(Index, Committed)
    {
        ById("stack-badge").textContent = "Stale";
        ById("stack-badge").classList.add("stale");
        if (this.RebuildTimer)
            clearTimeout(this.RebuildTimer);
        const Delay = Committed ? 60 : 550;
        this.RebuildTimer = setTimeout(() => this.RebuildFrom(Index), Delay);
    }

    RenderLayerProperties()
    {
        const Host = ById("layer-properties");
        Host.textContent = "";
        const Layer = this.SelectedLayer();
        if (!Layer)
        {
            Host.appendChild(Construct("p", "muted", "Select a layer to edit its geology."));
            return;
        }
        const Type = LayerTypeById(Layer.TypeId);
        const LayerIndex = this.Layers.indexOf(Layer);

        if (Type.Params.length)
        {
            const ParamCard = ConstructCard(Type.Label, Type.Glyph, Type.Blurb);
            for (const Definition of Type.Params)
            {
                ParamCard.Content.appendChild(ConstructSlider(
                {
                    Label: Definition.Label,
                    Min: Definition.Min, Max: Definition.Max, Step: Definition.Step, Unit: Definition.Unit,
                    Get: () => Layer.Params[Definition.Key],
                    Set: (Reading, Committed) =>
                    {
                        Layer.Params[Definition.Key] = Reading;
                        this.ScheduleRebuild(LayerIndex, Committed);
                    },
                }));
            }
            Host.appendChild(ParamCard);
        }

        const BlendCard = ConstructCard("Blend & mask", "layers", "Mask by any channel — including ones you paint");
        if (Type.Build)
        {
            BlendCard.Content.appendChild(ConstructSelectRow("Blend operation",
                () => Layer.Blend,
                ["Add", "Subtract", "Replace", "Maximum", "Minimum"].map((Name) => ({ Id: Name, Label: Name })),
                (Chosen) => { Layer.Blend = Chosen; this.ScheduleRebuild(LayerIndex, true); }));
        }
        BlendCard.Content.appendChild(ConstructSlider(
        {
            Label: "Layer strength", Min: 0, Max: 1.5, Step: 0.01, Unit: "",
            Get: () => Layer.Strength,
            Set: (Reading, Committed) => { Layer.Strength = Reading; this.ScheduleRebuild(LayerIndex, Committed); },
        }));
        const MaskOptions = [
            { Id: "", Label: "No mask" },
            { Id: "Height", Label: "Height (normalised)" },
            { Id: "Slope", Label: "Slope" },
            ...this.ChannelOptions(),
        ];
        BlendCard.Content.appendChild(ConstructSelectRow("Mask channel",
            () => Layer.MaskChannel, MaskOptions,
            (Chosen) =>
            {
                Layer.MaskChannel = Chosen;
                this.RenderLayerStack();
                this.ScheduleRebuild(LayerIndex, true);
            }));
        BlendCard.Content.appendChild(ConstructSlider(
        {
            Label: "Mask low", Min: 0, Max: 1, Step: 0.01, Unit: "",
            Get: () => Layer.MaskLow,
            Set: (Reading, Committed) => { Layer.MaskLow = Reading; this.ScheduleRebuild(LayerIndex, Committed); },
        }));
        BlendCard.Content.appendChild(ConstructSlider(
        {
            Label: "Mask high", Min: 0, Max: 1, Step: 0.01, Unit: "",
            Get: () => Layer.MaskHigh,
            Set: (Reading, Committed) => { Layer.MaskHigh = Reading; this.ScheduleRebuild(LayerIndex, Committed); },
        }));
        BlendCard.Content.appendChild(ConstructToggle("Invert mask", "",
            () => Layer.MaskInvert,
            (On) => { Layer.MaskInvert = On; this.ScheduleRebuild(LayerIndex, true); }));

        const SeedRow = Construct("div", "seed-row");
        SeedRow.appendChild(Construct("span", "control-label", "Seed"));
        const SeedInput = Construct("input", "seed-input");
        SeedInput.value = Layer.Seed;
        SeedInput.addEventListener("change", () =>
        {
            const Parsed = parseInt(SeedInput.value, 10);
            if (Number.isFinite(Parsed))
            {
                Layer.Seed = Parsed;
                this.ScheduleRebuild(LayerIndex, true);
            }
        });
        SeedRow.appendChild(SeedInput);
        const ShuffleButton = Construct("button", "icon-button");
        ShuffleButton.innerHTML = GlyphSvg("shuffle");
        ShuffleButton.title = "Randomise seed";
        ShuffleButton.addEventListener("click", () =>
        {
            Layer.Seed = 1000 + Math.floor(Math.random() * 89999);
            SeedInput.value = Layer.Seed;
            this.ScheduleRebuild(LayerIndex, true);
        });
        SeedRow.appendChild(ShuffleButton);
        BlendCard.Content.appendChild(SeedRow);
        Host.appendChild(BlendCard);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              SCENE CONTROLS
    //--------------------------------------------------------------------------------------------------------

    ConstructSceneControls()
    {
        const Host = ById("scene-controls");
        if (!Host || !this.Environment)
            return;
        Host.textContent = "";
        const Env = this.Environment;

        const SunCard = ConstructCard("Sun & sky", "sun", "Directional light + hemisphere ambient");
        SunCard.Content.appendChild(ConstructSlider({
            Label: "Sun azimuth", Min: 0, Max: 360, Step: 1, Unit: "°",
            Get: () => Env.SunAzimuth, Set: (R) => { Env.SunAzimuth = R; } }));
        SunCard.Content.appendChild(ConstructSlider({
            Label: "Sun elevation", Min: 4, Max: 80, Step: 0.5, Unit: "°",
            Get: () => Env.SunElevation, Set: (R) => { Env.SunElevation = R; } }));
        SunCard.Content.appendChild(ConstructSlider({
            Label: "Sun intensity", Min: 0.4, Max: 5, Step: 0.05, Unit: "",
            Get: () => Env.SunIntensity, Set: (R) => { Env.SunIntensity = R; } }));
        SunCard.Content.appendChild(ConstructSlider({
            Label: "Cloud cover", Min: 0, Max: 1, Step: 0.01, Unit: "",
            Get: () => this.CloudAmount, Set: (R) => { this.CloudAmount = R; } }));
        Host.appendChild(SunCard);

        const AirCard = ConstructCard("Atmosphere & water", "droplet", "Aerial perspective and the water sheet");
        AirCard.Content.appendChild(ConstructSlider({
            Label: "Exposure", Min: 0.4, Max: 2, Step: 0.01, Unit: "",
            Get: () => Env.Exposure, Set: (R) => { Env.Exposure = R; } }));
        AirCard.Content.appendChild(ConstructSlider({
            Label: "Fog density", Min: 0, Max: 45, Step: 0.5, Unit: "·10⁻⁵",
            Get: () => Env.FogDensity * 1e5, Set: (R) => { Env.FogDensity = R / 1e5; } }));
        AirCard.Content.appendChild(ConstructSlider({
            Label: "Water level", Min: -80, Max: 1100, Step: 1, Unit: "m",
            Get: () => Env.WaterLevel, Set: (R) => { Env.WaterLevel = R; } }));
        Host.appendChild(AirCard);

        const SurfaceCard = ConstructCard("Surface response", "layers", "Procedural splat weighting, live on the GPU");
        SurfaceCard.Content.appendChild(ConstructSlider({
            Label: "Vegetation", Min: 0, Max: 1.3, Step: 0.01, Unit: "",
            Get: () => Env.Vegetation, Set: (R) => { Env.Vegetation = R; } }));
        SurfaceCard.Content.appendChild(ConstructSlider({
            Label: "Strata contrast", Min: 0, Max: 1, Step: 0.01, Unit: "",
            Get: () => Env.StrataContrast, Set: (R) => { Env.StrataContrast = R; } }));
        Host.appendChild(SurfaceCard);

        const DisplayCard = ConstructCard("Display", "eye", "");
        DisplayCard.Content.appendChild(ConstructToggle("Shadow mapping", "2048² sun shadows over the whole field",
            () => this.Shadows, (On) => { this.Shadows = On; }));
        DisplayCard.Content.appendChild(ConstructToggle("Survey grid", "32 m grid overlay (G)",
            () => this.ShowGrid, (On) => { this.ShowGrid = On; }));
        DisplayCard.Content.appendChild(ConstructToggle("Autorotate", "",
            () => this.Autorotate, (On) =>
            {
                this.Autorotate = On;
                ById("autorotate-toggle").classList.toggle("on", On);
            }));
        Host.appendChild(DisplayCard);

        const TraceCard = ConstructCard("Traced density", "eye", "Sphere-traced implicit surface — select it from the view menu (Shaded ▾). Density lives in the shader; detail octaves fade in as you zoom, past the heightmap's 1024².");
        TraceCard.Content.appendChild(ConstructSlider({
            Label: "Trace detail", Min: 0, Max: 2.5, Step: 0.05, Unit: "x",
            Get: () => this.Raster.RaymarchDetail, Set: (R) => { this.Raster.RaymarchDetail = R; } }));
        TraceCard.Content.appendChild(ConstructSlider({
            Label: "Trace steps (quality)", Min: 48, Max: 384, Step: 4, Unit: "",
            Get: () => this.Raster.RaymarchSteps, Set: (R) => { this.Raster.RaymarchSteps = R; } }));
        Host.appendChild(TraceCard);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              BRUSH CONTROLS
    //--------------------------------------------------------------------------------------------------------

    SetTool(Tool)
    {
        this.Brush.Tool = Tool;
        for (const Tile of ById("tool-grid").querySelectorAll(".tool-tile"))
            Tile.classList.toggle("active", Tile.dataset.tool === Tool);
        const Labels =
        {
            orbit: "Orbit", raise: "Raise", lower: "Lower", flatten: "Flatten", smooth: "Smooth",
            terrace: "Terrace", channel: "Paint channel", material: "Paint material",
            stamp: "SDF stamp", stampErase: "Remove stamp",
        };
        ById("brush-badge").textContent = Labels[Tool] || Tool;
        this.ConstructBrushControls();
        const Hints =
        {
            orbit: "Drag to orbit · Wheel to zoom · Right-drag to pan · Double-click to set pivot",
            raise: "Paint to raise relief — strokes accumulate in the Sculpt layer · [ ] brush size · X swaps to Lower",
            lower: "Paint to carve relief · [ ] brush size · X swaps to Raise",
            flatten: "First touch sets the bench height; paint to level toward it",
            smooth: "Paint to relax relief toward its local average",
            terrace: "Paint to snap relief into benches",
            channel: "Painting writes straight into the channel — masks and materials read it live · Alt subtracts",
            material: "Painted materials override the procedural splat in proportion to coverage",
            stamp: "Click the terrain to plant a voxel SDF stamp — arches and fins truly overhang",
            stampErase: "Click near a stamp to remove it",
        };
        this.SetHint(Hints[Tool] || Hints.orbit);
        if (Tool === "channel")
        {
            const Channel = this.Field.Channel(this.Brush.ChannelName);
            if (Channel)
                this.Raster.UploadOverlay(Channel.Samples, Channel.Tint);
        }
    }

    IsSculptTool(Tool)
    {
        return ["raise", "lower", "flatten", "smooth", "terrace"].includes(Tool || this.Brush.Tool);
    }

    IsBrushTool(Tool)
    {
        return this.IsSculptTool(Tool) || ["channel", "material"].includes(Tool || this.Brush.Tool);
    }

    ConstructBrushControls()
    {
        const Host = ById("brush-controls");
        if (!Host)
            return;
        Host.textContent = "";
        const Brush = this.Brush;
        const Tool = Brush.Tool;

        if (Tool === "orbit")
        {
            const Card = ConstructCard("Navigation", "orbit", "The Material workspace camera feel — exponential glide");
            Card.Content.appendChild(Construct("p", "muted",
                "Left-drag orbits, right-drag pans, the wheel dollies toward the pivot, and a double-click plants the pivot on the land itself. " +
                "Hold Space to orbit with any brush in hand. F frames the world, P hides the panels, G toggles the survey grid."));
            Host.appendChild(Card);
            return;
        }

        const BrushCard = ConstructCard("Brush", "brush", "");
        BrushCard.Content.appendChild(ConstructSlider({
            Label: "Radius", Min: 8, Max: 420, Step: 1, Unit: "m",
            Get: () => Brush.Radius, Set: (R) => { Brush.Radius = R; } }));
        if (Tool !== "stamp" && Tool !== "stampErase")
        {
            BrushCard.Content.appendChild(ConstructSlider({
                Label: "Strength", Min: 0.02, Max: 1, Step: 0.01, Unit: "",
                Get: () => Brush.Strength, Set: (R) => { Brush.Strength = R; } }));
            BrushCard.Content.appendChild(ConstructSlider({
                Label: "Edge softness", Min: 0, Max: 0.95, Step: 0.01, Unit: "",
                Get: () => Brush.Softness, Set: (R) => { Brush.Softness = R; } }));
        }
        Host.appendChild(BrushCard);

        if (this.IsSculptTool(Tool))
        {
            const Card = ConstructCard("Sculpt strokes", "sculpt", "A delta field, applied by its own stack layer");
            if (Tool === "terrace")
            {
                Card.Content.appendChild(ConstructSlider({
                    Label: "Bench step", Min: 3, Max: 60, Step: 1, Unit: "m",
                    Get: () => Brush.TerraceStep, Set: (R) => { Brush.TerraceStep = R; } }));
            }
            const SculptIndex = this.Layers.findIndex((Layer) => Layer.TypeId === "SculptDelta");
            Card.Content.appendChild(Construct("p", "muted",
                SculptIndex < 0
                    ? "The first stroke creates a “Sculpt strokes” layer at the top of the stack. Because strokes are a delta, re-running erosion beneath them keeps your hand-work intact."
                    : (SculptIndex === this.Layers.length - 1
                        ? "Sculpt layer is topmost — strokes composite live."
                        : "Sculpt layer sits mid-stack — strokes apply on release, then everything above it re-erodes over your edits.")));
            const Actions = Construct("div", "brush-actions");
            const ClearButton = Construct("button", "pill-button", "Clear sculpt");
            ClearButton.addEventListener("click", () =>
            {
                this.Field.SculptDelta.fill(0.0);
                this.RebuildFrom(Math.max(SculptIndex, 0));
                ShowToast("Sculpt delta cleared", "sculpt");
            });
            Actions.appendChild(ClearButton);
            Card.Content.appendChild(Actions);
            Host.appendChild(Card);
        }

        if (Tool === "channel")
        {
            const Card = ConstructCard("Channel target", "droplet", "Writes land directly in the registry");
            Card.Content.appendChild(ConstructSelectRow("Channel",
                () => Brush.ChannelName, this.ChannelOptions(),
                (Chosen) =>
                {
                    Brush.ChannelName = Chosen;
                    const Channel = this.Field.Channel(Chosen);
                    if (Channel)
                        this.Raster.UploadOverlay(Channel.Samples, Channel.Tint);
                    this.ConstructBrushControls();
                }));
            const PillHost = Construct("div", "radio-pills");
            for (const [Sign, Label] of [[1, "Add"], [-1, "Subtract"]])
            {
                const Pill = Construct("button", "", Label);
                Pill.classList.toggle("active", Brush.ChannelSign === Sign);
                Pill.addEventListener("click", () =>
                {
                    Brush.ChannelSign = Sign;
                    this.ConstructBrushControls();
                });
                PillHost.appendChild(Pill);
            }
            Card.Content.appendChild(PillHost);
            const Channel = this.Field.Channel(Brush.ChannelName);
            if (Channel && !Channel.Authored)
            {
                Card.Content.appendChild(Construct("p", "muted",
                    `“${Channel.Label}” is derived by ${Channel.Writer.toLowerCase()}. Your paint is honoured everywhere until that writer next rebuilds — paint a lake into Water and mask a snow layer by “not Water”, for instance.`));
            }
            else
            {
                Card.Content.appendChild(Construct("p", "muted",
                    "Authored channel — it persists through every rebuild and can be any layer's mask."));
            }
            Host.appendChild(Card);
        }

        if (Tool === "material")
        {
            const Card = ConstructCard("Material", "layers", "Overrides the procedural splat");
            const PillHost = Construct("div", "radio-pills");
            const Choices =
            [
                { Id: "PaintRock", Label: "Rock", Swatch: "#7a6a58" },
                { Id: "PaintMeadow", Label: "Meadow", Swatch: "#59823c" },
                { Id: "PaintSand", Label: "Sand", Swatch: "#d9b26e" },
                { Id: "PaintSnow", Label: "Snow", Swatch: "#eef2ff" },
                { Id: "Erase", Label: "Erase", Swatch: "#444" },
            ];
            for (const Choice of Choices)
            {
                const Pill = Construct("button");
                const Dot = Construct("span", "swatch");
                Dot.style.background = Choice.Swatch;
                Pill.appendChild(Dot);
                Pill.appendChild(document.createTextNode(Choice.Label));
                Pill.classList.toggle("active", Brush.Material === Choice.Id);
                Pill.addEventListener("click", () =>
                {
                    Brush.Material = Choice.Id;
                    this.ConstructBrushControls();
                });
                PillHost.appendChild(Pill);
            }
            Card.Content.appendChild(PillHost);
            const Actions = Construct("div", "brush-actions");
            const ClearButton = Construct("button", "pill-button", "Clear material paint");
            ClearButton.addEventListener("click", () =>
            {
                for (const Definition of MaterialPaintChannels)
                    this.Field.ChannelSamples(Definition.Name).fill(0.0);
                this.Raster.UploadPaint(this.Field);
                this.RefreshChannelPreviews();
                ShowToast("Material paint cleared", "brush");
            });
            Actions.appendChild(ClearButton);
            Card.Content.appendChild(Actions);
            Host.appendChild(Card);
        }

        if (Tool === "stamp" || Tool === "stampErase")
        {
            const Card = ConstructCard("Voxel SDF stamps", "arch", "Analytic distance fields, surface-netted into the terrain");
            if (Tool === "stamp")
            {
                const PillHost = Construct("div", "radio-pills");
                for (const Shape of StampShapes)
                {
                    const Pill = Construct("button", "", Shape.Label.replace("Natural ", "").replace("Rock ", "").replace(" cluster", "").replace("Sandstone ", ""));
                    Pill.title = Shape.Blurb;
                    Pill.classList.toggle("active", Brush.StampShape === Shape.Id);
                    Pill.addEventListener("click", () =>
                    {
                        Brush.StampShape = Shape.Id;
                        this.ConstructBrushControls();
                    });
                    PillHost.appendChild(Pill);
                }
                Card.Content.appendChild(PillHost);
                Card.Content.appendChild(ConstructSlider({
                    Label: "Stamp scale", Min: 30, Max: 340, Step: 1, Unit: "m",
                    Get: () => Brush.StampScale, Set: (R) => { Brush.StampScale = R; } }));
                Card.Content.appendChild(ConstructSlider({
                    Label: "Rotation", Min: 0, Max: 360, Step: 1, Unit: "°",
                    Get: () => Brush.StampRotation, Set: (R) => { Brush.StampRotation = R; } }));
            }
            Card.Content.appendChild(Construct("p", "muted",
                `${this.Stamps.length} stamp${this.Stamps.length === 1 ? "" : "s"} planted · ${(this.Raster.StampIndexCount / 3).toLocaleString()} triangles. ` +
                "Each stamp is unioned against the heightfield's own distance field and polygonised at a voxel size matched to its scale — that is the overhang a pure heightfield cannot grow."));
            Host.appendChild(Card);
        }
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              VIEWPORT INTERACTION
    //--------------------------------------------------------------------------------------------------------

    BindViewport()
    {
        const Canvas = ById("gl-canvas");
        const Pointer = this.Pointer;

        const UpdateNdc = (Event) =>
        {
            const Rect = Canvas.getBoundingClientRect();
            Pointer.NdcX = ((Event.clientX - Rect.left) / Rect.width) * 2.0 - 1.0;
            Pointer.NdcY = -(((Event.clientY - Rect.top) / Rect.height) * 2.0 - 1.0);
            Pointer.Dirty = true;
        };

        Canvas.addEventListener("pointerenter", (Event) =>
        {
            Pointer.Inside = true;
            UpdateNdc(Event);
        });
        Canvas.addEventListener("pointerleave", () =>
        {
            Pointer.Inside = false;
            Pointer.Hit = null;
        });
        Canvas.addEventListener("pointermove", (Event) =>
        {
            UpdateNdc(Event);
            const Camera = this.Raster.Camera;
            if (Pointer.Dragging === "orbit")
            {
                Camera.AzimuthGoal -= (Event.clientX - Pointer.LastX) * 0.0052;
                Camera.ElevationGoal = Math.min(1.45, Math.max(0.03,
                    Camera.ElevationGoal + (Event.clientY - Pointer.LastY) * 0.0052));
            }
            else if (Pointer.Dragging === "pan")
            {
                const Basis = Camera.Basis();
                const Speed = Camera.Distance * 0.0016;
                const Dx = (Event.clientX - Pointer.LastX) * Speed;
                const Dy = (Event.clientY - Pointer.LastY) * Speed;
                Camera.TargetGoal.X -= Basis.Right[0] * Dx - Basis.Forward[0] * Dy;
                Camera.TargetGoal.Z -= Basis.Right[2] * Dx - Basis.Forward[2] * Dy;
                Camera.TargetGoal.X = Math.min(WorldExtent * 0.6, Math.max(-WorldExtent * 0.6, Camera.TargetGoal.X));
                Camera.TargetGoal.Z = Math.min(WorldExtent * 0.6, Math.max(-WorldExtent * 0.6, Camera.TargetGoal.Z));
            }
            Pointer.LastX = Event.clientX;
            Pointer.LastY = Event.clientY;
        });

        Canvas.addEventListener("pointerdown", (Event) =>
        {
            Canvas.setPointerCapture(Event.pointerId);
            UpdateNdc(Event);
            Pointer.LastX = Event.clientX;
            Pointer.LastY = Event.clientY;
            this.RefreshHoverHit();
            const WantsOrbit = this.Brush.Tool === "orbit" || Event.altKey || this.SpaceHeld;
            if (Event.button === 2 || Event.button === 1)
            {
                Pointer.Dragging = "pan";
                return;
            }
            if (Event.button !== 0)
                return;
            if (WantsOrbit)
            {
                Pointer.Dragging = "orbit";
                return;
            }
            if (!Pointer.Hit)
                return;
            if (this.Brush.Tool === "stamp")
            {
                this.PlaceStamp(Pointer.Hit);
                return;
            }
            if (this.Brush.Tool === "stampErase")
            {
                this.EraseStampAt(Pointer.Hit);
                return;
            }
            this.BeginStroke(Pointer.Hit, Event);
        });

        Canvas.addEventListener("pointerup", (Event) =>
        {
            if (Pointer.Stroke)
                this.EndStroke();
            Pointer.Dragging = null;
        });
        Canvas.addEventListener("pointercancel", () =>
        {
            if (Pointer.Stroke)
                this.EndStroke();
            Pointer.Dragging = null;
        });
        Canvas.addEventListener("wheel", (Event) =>
        {
            Event.preventDefault();
            const Camera = this.Raster.Camera;
            Camera.DistanceGoal = Math.min(9000, Math.max(55, Camera.DistanceGoal * Math.exp(Event.deltaY * 0.0011)));
        }, { passive: false });
        Canvas.addEventListener("dblclick", () =>
        {
            this.RefreshHoverHit();
            if (Pointer.Hit)
            {
                const Camera = this.Raster.Camera;
                Camera.TargetGoal = { X: Pointer.Hit.X, Y: Pointer.Hit.Y, Z: Pointer.Hit.Z };
            }
        });
        Canvas.addEventListener("contextmenu", (Event) => Event.preventDefault());

        // 2D field painting.
        const Field2D = ById("field2d-canvas");
        const Ring = ById("field2d-ring");
        const Field2DHit = (Event) =>
        {
            const Rect = Field2D.getBoundingClientRect();
            const U = (Event.clientX - Rect.left) / Rect.width;
            const V = (Event.clientY - Rect.top) / Rect.height;
            if (U < 0 || U > 1 || V < 0 || V > 1)
                return null;
            const X = (U - 0.5) * WorldExtent;
            const Z = (V - 0.5) * WorldExtent;
            return { X, Y: this.Field.HeightAt(X, Z), Z };
        };
        Field2D.addEventListener("pointermove", (Event) =>
        {
            const Rect = Field2D.getBoundingClientRect();
            const StageRect = ById("viewport-stage").getBoundingClientRect();
            const RingSize = this.Brush.Radius * 2.0 / WorldExtent * Rect.width;
            Ring.style.width = RingSize + "px";
            Ring.style.height = RingSize + "px";
            Ring.style.left = (Event.clientX - StageRect.left) + "px";
            Ring.style.top = (Event.clientY - StageRect.top) + "px";
            Ring.classList.toggle("hidden", !this.IsBrushTool());
            const Hit = Field2DHit(Event);
            if (Hit)
            {
                Pointer.Hit = Hit;
                if (Pointer.Stroke)
                    this.StrokeTo(Hit, Event);
            }
        });
        Field2D.addEventListener("pointerdown", (Event) =>
        {
            const Hit = Field2DHit(Event);
            if (!Hit)
                return;
            Field2D.setPointerCapture(Event.pointerId);
            if (this.Brush.Tool === "stamp") { this.PlaceStamp(Hit); return; }
            if (this.Brush.Tool === "stampErase") { this.EraseStampAt(Hit); return; }
            if (this.IsBrushTool())
                this.BeginStroke(Hit, Event);
        });
        Field2D.addEventListener("pointerup", () =>
        {
            if (Pointer.Stroke)
                this.EndStroke();
        });
        Field2D.addEventListener("pointerleave", () => Ring.classList.add("hidden"));
    }

    RefreshHoverHit()
    {
        const Pointer = this.Pointer;
        if (!Pointer.Inside || this.ViewDimension !== "3d")
            return;
        const Canvas = ById("gl-canvas");
        const Aspect = Canvas.width / Math.max(Canvas.height, 1);
        const Ray = this.Raster.Camera.RayFromNdc(Pointer.NdcX, Pointer.NdcY, Aspect, this.Raster.FovRadians);
        Pointer.Hit = this.Field.IntersectRay(
            Ray.Origin[0], Ray.Origin[1], Ray.Origin[2],
            Ray.Direction[0], Ray.Direction[1], Ray.Direction[2]);
        Pointer.Dirty = false;
        if (Pointer.Stroke && Pointer.Hit)
            this.StrokeTo(Pointer.Hit, null);
        this.RefreshBrushMetrics();
    }

    RefreshBrushMetrics()
    {
        const Hit = this.Pointer.Hit;
        if (!Hit)
            return;
        const TexelX = Math.min(Resolution - 1, Math.max(0, Math.floor((Hit.X / WorldExtent + 0.5) * Resolution)));
        const TexelZ = Math.min(Resolution - 1, Math.max(0, Math.floor((Hit.Z / WorldExtent + 0.5) * Resolution)));
        const Heights = this.Field.Heights;
        const Index = TexelZ * Resolution + TexelX;
        const GradX = (Heights[TexelZ * Resolution + Math.min(TexelX + 1, Resolution - 1)] - Heights[TexelZ * Resolution + Math.max(TexelX - 1, 0)]) / (2 * TexelSize);
        const GradZ = (Heights[Math.min(TexelZ + 1, Resolution - 1) * Resolution + TexelX] - Heights[Math.max(TexelZ - 1, 0) * Resolution + TexelX]) / (2 * TexelSize);
        const SlopeDeg = Math.atan(Math.sqrt(GradX * GradX + GradZ * GradZ)) * 180.0 / Math.PI;
        ById("metric-elevation").innerHTML = `${Math.round(Hit.Y)}<small>m</small>`;
        ById("metric-slope").innerHTML = `${SlopeDeg.toFixed(0)}<small>°</small>`;
        ById("metric-flow").textContent = this.Field.ChannelSamples("Flow")[Index].toFixed(2);
        ById("status-cursor").textContent =
            `x ${Math.round(Hit.X)} · z ${Math.round(Hit.Z)} · ${Math.round(Hit.Y)} m · ${SlopeDeg.toFixed(0)}°`;
    }

    BindKeyboard()
    {
        this.SpaceHeld = false;
        window.addEventListener("keydown", (Event) =>
        {
            const Target = Event.target;
            const Editing = Target && (Target.tagName === "INPUT" || Target.tagName === "TEXTAREA");
            if (Event.code === "Space" && !Editing)
            {
                this.SpaceHeld = true;
                Event.preventDefault();
            }
            if (Editing)
                return;
            if ((Event.ctrlKey || Event.metaKey) && Event.key.toLowerCase() === "z")
            {
                Event.preventDefault();
                if (Event.shiftKey) this.Redo(); else this.Undo();
                return;
            }
            if ((Event.ctrlKey || Event.metaKey) && Event.key.toLowerCase() === "y")
            {
                Event.preventDefault();
                this.Redo();
                return;
            }
            switch (Event.key)
            {
                case "/":
                    Event.preventDefault();
                    ById("preset-search").focus();
                    break;
                case "f": case "F": this.FrameCamera(); break;
                case "g": case "G":
                    this.ShowGrid = !this.ShowGrid;
                    this.ConstructSceneControls();
                    break;
                case "p": case "P": document.body.classList.toggle("panels-hidden"); break;
                case "[":
                    this.Brush.Radius = Math.max(8, this.Brush.Radius * 0.88);
                    this.ConstructBrushControls();
                    break;
                case "]":
                    this.Brush.Radius = Math.min(420, this.Brush.Radius * 1.14);
                    this.ConstructBrushControls();
                    break;
                case "x": case "X":
                    if (this.Brush.Tool === "raise") this.SetTool("lower");
                    else if (this.Brush.Tool === "lower") this.SetTool("raise");
                    else if (this.Brush.Tool === "channel")
                    {
                        this.Brush.ChannelSign *= -1;
                        this.ConstructBrushControls();
                    }
                    break;
                case "Escape":
                    CloseMenu();
                    if (this.EvalToken)
                        this.EvalToken.Requested = true;
                    break;
            }
        });
        window.addEventListener("keyup", (Event) =>
        {
            if (Event.code === "Space")
                this.SpaceHeld = false;
        });
    }

    FrameCamera()
    {
        const Range = Math.max(this.Field.Maximum - this.Field.Minimum, 120);
        const Preset = this.ActivePreset;
        const Camera = (Preset && Preset.Camera) || { Azimuth: -38, Elevation: 24, Distance: 2700 };
        this.Raster.Camera.Frame(Camera.Azimuth, Camera.Elevation,
            Math.max(Camera.Distance, 1750 + Range * 1.35),
            this.Field.Minimum + Range * 0.40);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              STAMPS
    //--------------------------------------------------------------------------------------------------------

    PlaceStamp(Hit)
    {
        const Stamp = ConstructStamp(this.Brush.StampShape, Hit.X, Hit.Z, this.Brush.StampScale, this.Brush.StampRotation);
        this.Stamps.push(Stamp);
        this.PushHistory({ Kind: "stamp-add", Stamp });
        this.RefreshStamps();
        this.ConstructBrushControls();
        ShowToast(`${Stamp.Shape} planted at ${Math.round(Hit.X)}, ${Math.round(Hit.Z)} — polygonising the voxel field`, "arch");
    }

    EraseStampAt(Hit)
    {
        let Nearest = null;
        let NearestDist = Infinity;
        for (const Stamp of this.Stamps)
        {
            const Dist = Math.hypot(Stamp.X - Hit.X, Stamp.Z - Hit.Z);
            if (Dist < NearestDist && Dist < Math.max(Stamp.Scale * 0.8, 40))
            {
                Nearest = Stamp;
                NearestDist = Dist;
            }
        }
        if (!Nearest)
        {
            ShowToast("No stamp within reach of that click", "erase");
            return;
        }
        this.Stamps.splice(this.Stamps.indexOf(Nearest), 1);
        this.PushHistory({ Kind: "stamp-remove", Stamp: Nearest });
        this.RefreshStamps();
        this.ConstructBrushControls();
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              PAINTING
    //--------------------------------------------------------------------------------------------------------

    SculptLayerIndex()
    {
        return this.Layers.findIndex((Layer) => Layer.TypeId === "SculptDelta");
    }

    EnsureSculptLayer()
    {
        let Index = this.SculptLayerIndex();
        if (Index < 0)
        {
            const Layer = ConstructLayer("SculptDelta", { Label: "Sculpt strokes" });
            this.Layers.push(Layer);
            Index = this.Layers.length - 1;
            this.RenderLayerStack();
            ById("layer-count").textContent = this.Layers.length;
        }
        return Index;
    }

    SculptCompositeLive()
    {
        const Index = this.SculptLayerIndex();
        if (Index < 0)
            return false;
        const Layer = this.Layers[Index];
        const AboveAllDisabled = this.Layers.slice(Index + 1).every((Candidate) => !Candidate.Enabled);
        return AboveAllDisabled && !Layer.MaskChannel;
    }

    CompositeSculptNow()
    {
        const Index = this.SculptLayerIndex();
        const Heights = this.Field.Heights;
        const Delta = this.Field.SculptDelta;
        const Underneath = Index > 0 ? this.Evaluation.Cache[Index - 1] : null;
        const Strength = this.Layers[Index].Strength;
        for (let Texel = 0; Texel < Heights.length; Texel++)
            Heights[Texel] = (Underneath ? Underneath[Texel] : 0.0) + Delta[Texel] * Strength;
        if (!this.Evaluation.Cache[Index])
            this.Evaluation.Cache[Index] = new Float32Array(Heights.length);
        this.Evaluation.Cache[Index].set(Heights);
        this.Field.MeasureRange();
        if (this.BorderTarget !== undefined)
        {
            // Keep the rim grounded while sculpting live (same easing as ApplyBorderTaper).
            const HeightsNow = this.Field.Heights;
            const Rim = Math.floor(Resolution * 0.085);
            for (let Z = 0; Z < Resolution; Z++)
            {
                for (let X = 0; X < Resolution; X++)
                {
                    const EdgeDist = Math.min(X, Z, Resolution - 1 - X, Resolution - 1 - Z);
                    if (EdgeDist >= Rim)
                        continue;
                    let T = EdgeDist / Rim;
                    T = T * T * (3.0 - 2.0 * T);
                    const Idx = Z * Resolution + X;
                    HeightsNow[Idx] = this.BorderTarget + (HeightsNow[Idx] - this.BorderTarget) * T;
                }
            }
            this.Evaluation.Cache[Index].set(HeightsNow);
            this.Field.MeasureRange();
        }
        this.Raster.UploadHeights(this.Field);
    }

    StrokeTarget()
    {
        // Returns {Samples, Flush()} for the active painting tool.
        const Tool = this.Brush.Tool;
        if (this.IsSculptTool(Tool))
        {
            return {
                Samples: this.Field.SculptDelta,
                Flush: () =>
                {
                    if (this.SculptCompositeLive())
                        this.CompositeSculptNow();
                },
            };
        }
        if (Tool === "channel")
        {
            const Name = this.Brush.ChannelName;
            return {
                Samples: this.Field.ChannelSamples(Name),
                Flush: () =>
                {
                    this.Raster.UploadChannelGroup(this.Field, Name);
                    const Channel = this.Field.Channel(Name);
                    if (Channel)
                        this.Raster.UploadOverlay(Channel.Samples, Channel.Tint);
                },
            };
        }
        if (Tool === "material")
        {
            return {
                Samples: this.Brush.Material === "Erase" ? this.Field.ChannelSamples("PaintRock") : this.Field.ChannelSamples(this.Brush.Material),
                Flush: () => this.Raster.UploadPaint(this.Field),
            };
        }
        return null;
    }

    BeginStroke(Hit, Event)
    {
        const Target = this.StrokeTarget();
        if (!Target)
            return;
        if (this.IsSculptTool())
            this.EnsureSculptLayer();
        const Pointer = this.Pointer;
        Pointer.Stroke =
        {
            Target,
            Snapshot: new Float32Array(Target.Samples),
            SnapshotB: this.Brush.Tool === "material"
                ? MaterialPaintChannels.map((Definition) => new Float32Array(this.Field.ChannelSamples(Definition.Name)))
                : null,
            MinX: Resolution, MaxX: -1, MinZ: Resolution, MaxZ: -1,
            Touched: false,
        };
        Pointer.LastDab = { X: Hit.X, Z: Hit.Z };
        if (this.Brush.Tool === "flatten")
            Pointer.FlattenTarget = Hit.Y;
        this.ApplyDab(Hit.X, Hit.Z, Event);
        Target.Flush();
    }

    StrokeTo(Hit, Event)
    {
        const Pointer = this.Pointer;
        if (!Pointer.Stroke || !Pointer.LastDab)
            return;
        const Spacing = Math.max(this.Brush.Radius * 0.22, 2.0);
        const TotalDist = Math.hypot(Hit.X - Pointer.LastDab.X, Hit.Z - Pointer.LastDab.Z);
        const Steps = Math.max(1, Math.floor(TotalDist / Spacing));
        for (let StepIndex = 1; StepIndex <= Steps; StepIndex++)
        {
            const T = StepIndex / Steps;
            this.ApplyDab(
                Pointer.LastDab.X + (Hit.X - Pointer.LastDab.X) * T,
                Pointer.LastDab.Z + (Hit.Z - Pointer.LastDab.Z) * T,
                Event);
        }
        Pointer.LastDab = { X: Hit.X, Z: Hit.Z };
        const NowStamp = performance.now();
        if (NowStamp - this.LastUploadStamp > 48)
        {
            this.LastUploadStamp = NowStamp;
            Pointer.Stroke.Target.Flush();
            if (this.ViewDimension === "2d")
                this.Render2DField();
        }
    }

    EndStroke()
    {
        const Pointer = this.Pointer;
        const Stroke = Pointer.Stroke;
        Pointer.Stroke = null;
        Pointer.LastDab = null;
        if (!Stroke)
            return;
        Stroke.Target.Flush();

        // Push a region-sliced undo record.
        if (Stroke.Touched && Stroke.MaxX >= Stroke.MinX)
        {
            const Width = Stroke.MaxX - Stroke.MinX + 1;
            const HeightRows = Stroke.MaxZ - Stroke.MinZ + 1;
            const Slice = (Source, Array) =>
            {
                const Out = new Float32Array(Width * HeightRows);
                for (let Row = 0; Row < HeightRows; Row++)
                    Out.set(Array.subarray((Stroke.MinZ + Row) * Resolution + Stroke.MinX,
                                           (Stroke.MinZ + Row) * Resolution + Stroke.MinX + Width), Row * Width);
                return Out;
            };
            if (Stroke.SnapshotB)
            {
                const Records = MaterialPaintChannels.map((Definition, ChannelIndex) =>
                {
                    const Samples = this.Field.ChannelSamples(Definition.Name);
                    return { Samples, Before: Slice(null, Stroke.SnapshotB[ChannelIndex]), After: Slice(null, Samples) };
                });
                this.PushHistory({ Kind: "field-multi", Records, Region: { X: Stroke.MinX, Z: Stroke.MinZ, W: Width, H: HeightRows } });
            }
            else
            {
                this.PushHistory({
                    Kind: "field",
                    Samples: Stroke.Target.Samples,
                    Before: Slice(null, Stroke.Snapshot),
                    After: Slice(null, Stroke.Target.Samples),
                    Region: { X: Stroke.MinX, Z: Stroke.MinZ, W: Width, H: HeightRows },
                });
            }
        }

        // Post-stroke geology consequences.
        if (this.IsSculptTool())
        {
            const Index = this.SculptLayerIndex();
            if (!this.SculptCompositeLive() && Index >= 0)
                this.RebuildFrom(Index);
            else
            {
                this.RefreshSurvey();
                BakeSurfaceData(this.Field);
                this.Raster.UploadChannelGroup(this.Field, "Occlusion");
                if (this.Stamps.length)
                    this.RefreshStamps();
            }
        }
        else if (this.Brush.Tool === "channel")
        {
            this.RefreshChannelPreviews();
            const MaskedIndex = this.Layers.findIndex((Layer) => Layer.MaskChannel === this.Brush.ChannelName);
            if (MaskedIndex >= 0)
            {
                ShowToast(`“${this.Brush.ChannelName}” masks layer “${this.Layers[MaskedIndex].Label}” — rebuilding from there`, "layers");
                this.RebuildFrom(MaskedIndex);
            }
        }
        else if (this.Brush.Tool === "material")
        {
            this.RefreshChannelPreviews();
        }
        if (this.ViewDimension === "2d")
            this.Render2DField();
    }

    DabWeight(Distance01)
    {
        const Inner = 1.0 - this.Brush.Softness;
        if (Distance01 <= Inner)
            return 1.0;
        if (Distance01 >= 1.0)
            return 0.0;
        let T = (Distance01 - Inner) / Math.max(1.0 - Inner, 0.001);
        T = 1.0 - T;
        return T * T * (3.0 - 2.0 * T);
    }

    ApplyDab(WorldX, WorldZ, Event)
    {
        const Stroke = this.Pointer.Stroke;
        if (!Stroke)
            return;
        const Brush = this.Brush;
        const Tool = Brush.Tool;
        const CentreX = (WorldX / WorldExtent + 0.5) * Resolution;
        const CentreZ = (WorldZ / WorldExtent + 0.5) * Resolution;
        const RadiusTexels = Brush.Radius / TexelSize;
        const MinX = Math.max(0, Math.floor(CentreX - RadiusTexels));
        const MaxX = Math.min(Resolution - 1, Math.ceil(CentreX + RadiusTexels));
        const MinZ = Math.max(0, Math.floor(CentreZ - RadiusTexels));
        const MaxZ = Math.min(Resolution - 1, Math.ceil(CentreZ + RadiusTexels));
        Stroke.MinX = Math.min(Stroke.MinX, MinX);
        Stroke.MaxX = Math.max(Stroke.MaxX, MaxX);
        Stroke.MinZ = Math.min(Stroke.MinZ, MinZ);
        Stroke.MaxZ = Math.max(Stroke.MaxZ, MaxZ);
        Stroke.Touched = true;

        const Sculpting = this.IsSculptTool(Tool);
        const Heights = this.Field.Heights;
        const Delta = this.Field.SculptDelta;
        const SculptIndex = Sculpting ? this.SculptLayerIndex() : -1;
        const Underneath = Sculpting && SculptIndex > 0 ? this.Evaluation.Cache[SculptIndex - 1] : null;
        const Rate = Brush.Strength * 2.6;
        const ChannelSign = (Event && Event.altKey) ? -Brush.ChannelSign : Brush.ChannelSign;

        const PaintArrays = Tool === "material"
            ? MaterialPaintChannels.map((Definition) => this.Field.ChannelSamples(Definition.Name))
            : null;
        const PaintTargetIndex = PaintArrays
            ? MaterialPaintChannels.findIndex((Definition) => Definition.Name === Brush.Material)
            : -1;

        for (let Z = MinZ; Z <= MaxZ; Z++)
        {
            for (let X = MinX; X <= MaxX; X++)
            {
                const Dx = X + 0.5 - CentreX;
                const Dz = Z + 0.5 - CentreZ;
                const Distance01 = Math.sqrt(Dx * Dx + Dz * Dz) / RadiusTexels;
                if (Distance01 > 1.0)
                    continue;
                const Weight = this.DabWeight(Distance01);
                if (Weight <= 0.0)
                    continue;
                const Index = Z * Resolution + X;

                if (Sculpting)
                {
                    const Under = Underneath ? Underneath[Index] : 0.0;
                    const CompositeHere = Under + Delta[Index];
                    switch (Tool)
                    {
                        case "raise": Delta[Index] += Weight * Rate; break;
                        case "lower": Delta[Index] -= Weight * Rate; break;
                        case "flatten":
                        {
                            const DesiredDelta = this.Pointer.FlattenTarget - Under;
                            Delta[Index] += (DesiredDelta - Delta[Index]) * Weight * Math.min(Brush.Strength * 1.6, 1.0);
                            break;
                        }
                        case "smooth":
                        {
                            const X0 = Math.max(X - 2, 0), X1 = Math.min(X + 2, Resolution - 1);
                            const Z0 = Math.max(Z - 2, 0), Z1 = Math.min(Z + 2, Resolution - 1);
                            const NeighbourAvg = (Heights[Z * Resolution + X0] + Heights[Z * Resolution + X1]
                                                + Heights[Z0 * Resolution + X] + Heights[Z1 * Resolution + X]) * 0.25;
                            Delta[Index] += (NeighbourAvg - CompositeHere) * Weight * Brush.Strength * 0.55;
                            break;
                        }
                        case "terrace":
                        {
                            const Quantised = Math.round(CompositeHere / Brush.TerraceStep) * Brush.TerraceStep;
                            Delta[Index] += (Quantised - CompositeHere) * Weight * Math.min(Brush.Strength * 1.5, 1.0);
                            break;
                        }
                    }
                }
                else if (Tool === "channel")
                {
                    const Samples = Stroke.Target.Samples;
                    Samples[Index] = Math.min(1.0, Math.max(0.0, Samples[Index] + ChannelSign * Weight * Brush.Strength * 0.22));
                }
                else if (Tool === "material" && PaintArrays)
                {
                    if (Brush.Material === "Erase")
                    {
                        for (const Array of PaintArrays)
                            Array[Index] = Math.max(0.0, Array[Index] - Weight * Brush.Strength * 0.3);
                    }
                    else
                    {
                        const Add = Weight * Brush.Strength * 0.26;
                        for (let PaintIndex = 0; PaintIndex < PaintArrays.length; PaintIndex++)
                        {
                            if (PaintIndex === PaintTargetIndex)
                                PaintArrays[PaintIndex][Index] = Math.min(1.0, PaintArrays[PaintIndex][Index] + Add);
                            else
                                PaintArrays[PaintIndex][Index] = Math.max(0.0, PaintArrays[PaintIndex][Index] - Add * 0.55);
                        }
                    }
                }
            }
        }
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              UNDO
    //--------------------------------------------------------------------------------------------------------

    PushHistory(Record)
    {
        this.History.length = this.HistoryIndex + 1;
        this.History.push(Record);
        if (this.History.length > 28)
            this.History.shift();
        this.HistoryIndex = this.History.length - 1;
    }

    WriteRegion(Samples, Region, Source)
    {
        for (let Row = 0; Row < Region.H; Row++)
        {
            Samples.set(Source.subarray(Row * Region.W, Row * Region.W + Region.W),
                        (Region.Z + Row) * Resolution + Region.X);
        }
    }

    ApplyHistory(Record, Direction)
    {
        const Undoing = Direction < 0;
        if (Record.Kind === "field")
        {
            this.WriteRegion(Record.Samples, Record.Region, Undoing ? Record.Before : Record.After);
            this.RefreshAfterFieldEdit(Record.Samples);
        }
        else if (Record.Kind === "field-multi")
        {
            for (const Part of Record.Records)
                this.WriteRegion(Part.Samples, Record.Region, Undoing ? Part.Before : Part.After);
            this.Raster.UploadPaint(this.Field);
            this.RefreshChannelPreviews();
        }
        else if (Record.Kind === "stamp-add")
        {
            if (Undoing) this.Stamps.splice(this.Stamps.indexOf(Record.Stamp), 1);
            else this.Stamps.push(Record.Stamp);
            this.RefreshStamps();
        }
        else if (Record.Kind === "stamp-remove")
        {
            if (Undoing) this.Stamps.push(Record.Stamp);
            else this.Stamps.splice(this.Stamps.indexOf(Record.Stamp), 1);
            this.RefreshStamps();
        }
    }

    RefreshAfterFieldEdit(Samples)
    {
        if (Samples === this.Field.SculptDelta)
        {
            if (this.SculptCompositeLive())
            {
                this.CompositeSculptNow();
                this.RefreshSurvey();
            }
            else
            {
                this.RebuildFrom(Math.max(this.SculptLayerIndex(), 0));
            }
            return;
        }
        for (const Channel of this.Field.Channels.values())
        {
            if (Channel.Samples === Samples)
            {
                this.Raster.UploadChannelGroup(this.Field, Channel.Name);
                if (Channel.Name === this.Brush.ChannelName || Channel.Name === this.InspectedChannel)
                    this.Raster.UploadOverlay(Channel.Samples, Channel.Tint);
                const MaskedIndex = this.Layers.findIndex((Layer) => Layer.MaskChannel === Channel.Name);
                if (MaskedIndex >= 0)
                    this.RebuildFrom(MaskedIndex);
                break;
            }
        }
        this.RefreshChannelPreviews();
        if (this.ViewDimension === "2d")
            this.Render2DField();
    }

    Undo()
    {
        if (this.HistoryIndex < 0)
            return;
        this.ApplyHistory(this.History[this.HistoryIndex--], -1);
    }

    Redo()
    {
        if (this.HistoryIndex >= this.History.length - 1)
            return;
        this.ApplyHistory(this.History[++this.HistoryIndex], 1);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              2D FIELD VIEW
    //--------------------------------------------------------------------------------------------------------

    Render2DField()
    {
        const Canvas = ById("field2d-canvas");
        const Ctx = Canvas.getContext("2d");
        const W = Canvas.width, H = Canvas.height;
        const Image = Ctx.createImageData(W, H);
        const Pixels = Image.data;
        const SampleNorm = (Samples, Px, Py) =>
        {
            const X = (Px / W - 0.5) * WorldExtent;
            const Z = (Py / H - 0.5) * WorldExtent;
            return this.Field.SampleBilinear(Samples, X, Z);
        };
        const Mode = this.ViewMode;
        const ChannelForMode =
        {
            3: "Flow", 4: "Water", 5: "Wear", 6: "Deposition", 7: "Hardness", 8: "Snow", 9: "Moisture",
        }[Mode];
        const Range = Math.max(this.Field.Maximum - this.Field.Minimum, 1.0);
        for (let Y = 0; Y < H; Y++)
        {
            for (let X = 0; X < W; X++)
            {
                let R, G, B;
                const HeightHere = SampleNorm(this.Field.Heights, X, Y);
                const HeightNorm = (HeightHere - this.Field.Minimum) / Range;
                const GradScale = 900.0;
                const Gx = (SampleNorm(this.Field.Heights, X + 2, Y) - SampleNorm(this.Field.Heights, X - 2, Y)) / Range * GradScale * 0.01;
                const Gy = (SampleNorm(this.Field.Heights, X, Y + 2) - SampleNorm(this.Field.Heights, X, Y - 2)) / Range * GradScale * 0.01;
                const Shade = Math.min(Math.max(0.55 - Gx * 0.9 - Gy * 0.6, 0.12), 1.15);
                if (Mode === 0 || Mode === 1)
                {
                    // Hypsometric tint under hillshade.
                    const Stops = [[0.16, 0.32, 0.12], [0.42, 0.40, 0.22], [0.48, 0.38, 0.28], [0.62, 0.60, 0.58], [0.95, 0.96, 1.0]];
                    const Pos = Math.min(Math.max(HeightNorm, 0), 0.999) * (Stops.length - 1);
                    const Low = Math.floor(Pos);
                    const Frac = Pos - Low;
                    R = (Stops[Low][0] + (Stops[Low + 1][0] - Stops[Low][0]) * Frac) * Shade;
                    G = (Stops[Low][1] + (Stops[Low + 1][1] - Stops[Low][1]) * Frac) * Shade;
                    B = (Stops[Low][2] + (Stops[Low + 1][2] - Stops[Low][2]) * Frac) * Shade;
                    const WaterHere = SampleNorm(this.Field.ChannelSamples("Water"), X, Y);
                    if (WaterHere > 0.25 || HeightHere < this.Environment.WaterLevel)
                    {
                        R = 0.10; G = 0.32; B = 0.55;
                    }
                }
                else if (Mode === 2)
                {
                    const Slope = Math.min(Math.sqrt(Gx * Gx + Gy * Gy) * 1.4, 1.0);
                    R = Slope; G = Slope * 0.45; B = 0.12;
                }
                else if (Mode === 10)
                {
                    R = 0.5 - Gx * 0.5; G = 0.5 - Gy * 0.5; B = 0.9;
                }
                else
                {
                    const Name = Mode === 11 ? this.InspectedChannel : ChannelForMode;
                    const Channel = this.Field.Channel(Name);
                    const Reading = Channel ? Math.min(Math.max(SampleNorm(Channel.Samples, X, Y), 0), 1) : 0;
                    const Tint = Channel ? Channel.Tint : [1, 1, 1];
                    R = (0.05 + Reading * Tint[0]) * Shade;
                    G = (0.05 + Reading * Tint[1]) * Shade;
                    B = (0.05 + Reading * Tint[2]) * Shade;
                }
                const Offset = (Y * W + X) * 4;
                Pixels[Offset] = Math.min(R * 255, 255);
                Pixels[Offset + 1] = Math.min(G * 255, 255);
                Pixels[Offset + 2] = Math.min(B * 255, 255);
                Pixels[Offset + 3] = 255;
            }
        }
        Ctx.putImageData(Image, 0, 0);
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              EXPORT / IMPORT / PRESETS
    //--------------------------------------------------------------------------------------------------------

    DownloadBlob(Blob, Filename)
    {
        const Url = URL.createObjectURL(Blob);
        const Link = document.createElement("a");
        Link.href = Url;
        Link.download = Filename;
        Link.click();
        setTimeout(() => URL.revokeObjectURL(Url), 4000);
    }

    FileStem()
    {
        return this.WorldName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "terrain";
    }

    OpenExportMenu(Anchor)
    {
        OpenMenu(Anchor, [
            { Group: "Heightfield" },
            { Label: "Heightmap PNG · 16-bit", Sub: "1024² grayscale, normalised to the relief range", Glyph: "massif",
              Action: () => this.ExportHeightPng16() },
            { Label: "Heightmap RAW · Float32", Sub: "Metres, row-major — straight into an engine", Glyph: "save",
              Action: () => this.DownloadBlob(new Blob([this.Field.Heights.buffer.slice(0)], { type: "application/octet-stream" }), this.FileStem() + "-height-1024.r32") },
            { Group: "Channels" },
            { Label: "Mask pack PNG", Sub: "R wear · G flow · B water · A deposition", Glyph: "layers",
              Action: () => this.ExportMaskPack() },
            { Label: "Inspected channel PNG", Sub: `Currently: ${this.InspectedChannel} (8-bit)`, Glyph: "droplet",
              Action: () => this.ExportChannelPng(this.InspectedChannel) },
            { Group: "Project" },
            { Label: "Project JSON", Sub: "Layer stack, atmosphere, stamps, authored fields", Glyph: "export",
              Action: () => this.ExportProject() },
            { Label: "Viewport PNG", Sub: "Whatever the camera sees right now", Glyph: "camera",
              Action: () => this.Snapshot() },
        ]);
    }

    Crc32Table()
    {
        if (this._crcTable)
            return this._crcTable;
        const Table = new Int32Array(256);
        for (let N = 0; N < 256; N++)
        {
            let C = N;
            for (let K = 0; K < 8; K++)
                C = (C & 1) ? (0xEDB88320 ^ (C >>> 1)) : (C >>> 1);
            Table[N] = C;
        }
        this._crcTable = Table;
        return Table;
    }

    PngChunk(Type, Body)
    {
        const Table = this.Crc32Table();
        const Length = Body.length;
        const Out = new Uint8Array(12 + Length);
        const View = new DataView(Out.buffer);
        View.setUint32(0, Length);
        for (let I = 0; I < 4; I++)
            Out[4 + I] = Type.charCodeAt(I);
        Out.set(Body, 8);
        let Crc = 0xFFFFFFFF;
        for (let I = 4; I < 8 + Length; I++)
            Crc = Table[(Crc ^ Out[I]) & 0xFF] ^ (Crc >>> 8);
        View.setUint32(8 + Length, (Crc ^ 0xFFFFFFFF) >>> 0);
        return Out;
    }

    async ExportHeightPng16()
    {
        try
        {
            const N = Resolution;
            const Range = Math.max(this.Field.Maximum - this.Field.Minimum, 0.001);
            const Raw = new Uint8Array(N * (1 + N * 2));
            const Heights = this.Field.Heights;
            for (let Z = 0; Z < N; Z++)
            {
                let Cursor = Z * (1 + N * 2);
                Raw[Cursor++] = 0;   // filter: none
                for (let X = 0; X < N; X++)
                {
                    const Unit = Math.min(Math.max((Heights[Z * N + X] - this.Field.Minimum) / Range, 0), 1);
                    const Word = Math.round(Unit * 65535);
                    Raw[Cursor++] = (Word >> 8) & 0xFF;
                    Raw[Cursor++] = Word & 0xFF;
                }
            }
            const Stream = new Blob([Raw]).stream().pipeThrough(new CompressionStream("deflate"));
            const Compressed = new Uint8Array(await new Response(Stream).arrayBuffer());
            const Header = new Uint8Array(13);
            const HeaderView = new DataView(Header.buffer);
            HeaderView.setUint32(0, N);
            HeaderView.setUint32(4, N);
            Header[8] = 16;   // bit depth
            Header[9] = 0;    // colour type: greyscale
            const Png = new Blob(
            [
                new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
                this.PngChunk("IHDR", Header),
                this.PngChunk("IDAT", Compressed),
                this.PngChunk("IEND", new Uint8Array(0)),
            ], { type: "image/png" });
            this.DownloadBlob(Png, this.FileStem() + "-height-1024.png");
            ShowToast(`16-bit heightmap exported · range ${Math.round(this.Field.Minimum)}…${Math.round(this.Field.Maximum)} m`, "export");
        }
        catch (Failure)
        {
            console.warn("16-bit PNG path failed, falling back to 8-bit", Failure);
            this.ExportChannelPng(null);
        }
    }

    ExportChannelPng(Name)
    {
        const Canvas = document.createElement("canvas");
        Canvas.width = Resolution;
        Canvas.height = Resolution;
        const Ctx = Canvas.getContext("2d");
        const Image = Ctx.createImageData(Resolution, Resolution);
        const Source = Name ? this.Field.ChannelSamples(Name) : this.Field.Heights;
        const Range = Name ? 1.0 : Math.max(this.Field.Maximum - this.Field.Minimum, 0.001);
        const Base = Name ? 0.0 : this.Field.Minimum;
        for (let Index = 0; Index < Source.length; Index++)
        {
            const Unit = Math.min(Math.max((Source[Index] - Base) / Range, 0), 1);
            const Byte = Math.round(Unit * 255);
            Image.data[Index * 4] = Byte;
            Image.data[Index * 4 + 1] = Byte;
            Image.data[Index * 4 + 2] = Byte;
            Image.data[Index * 4 + 3] = 255;
        }
        Ctx.putImageData(Image, 0, 0);
        Canvas.toBlob((Blob) => this.DownloadBlob(Blob, this.FileStem() + "-" + (Name ? Name.toLowerCase() : "height8") + "-1024.png"), "image/png");
    }

    ExportMaskPack()
    {
        const Canvas = document.createElement("canvas");
        Canvas.width = Resolution;
        Canvas.height = Resolution;
        const Ctx = Canvas.getContext("2d");
        const Image = Ctx.createImageData(Resolution, Resolution);
        const Wear = this.Field.ChannelSamples("Wear");
        const Flow = this.Field.ChannelSamples("Flow");
        const Water = this.Field.ChannelSamples("Water");
        const Deposition = this.Field.ChannelSamples("Deposition");
        const Byte = (Reading) => Math.round(Math.min(Math.max(Reading, 0), 1) * 255);
        for (let Index = 0; Index < Wear.length; Index++)
        {
            Image.data[Index * 4] = Byte(Wear[Index]);
            Image.data[Index * 4 + 1] = Byte(Flow[Index]);
            Image.data[Index * 4 + 2] = Byte(Water[Index]);
            Image.data[Index * 4 + 3] = Byte(Deposition[Index]);
        }
        Ctx.putImageData(Image, 0, 0);
        Canvas.toBlob((Blob) => this.DownloadBlob(Blob, this.FileStem() + "-maskpack-1024.png"), "image/png");
        ShowToast("Mask pack exported — R wear · G flow · B water · A deposition", "layers");
    }

    Snapshot()
    {
        this.Raster.Render(this.RenderOptions(performance.now()));
        ById("gl-canvas").toBlob((Blob) =>
        {
            if (Blob)
                this.DownloadBlob(Blob, this.FileStem() + "-viewport.png");
        }, "image/png");
    }

    EncodeFieldBase64(Samples)
    {
        const Bytes = new Uint8Array(Samples.buffer, Samples.byteOffset, Samples.byteLength);
        let Binary = "";
        const ChunkSize = 32768;
        for (let Offset = 0; Offset < Bytes.length; Offset += ChunkSize)
            Binary += String.fromCharCode.apply(null, Bytes.subarray(Offset, Offset + ChunkSize));
        return btoa(Binary);
    }

    DecodeFieldBase64(Text, Target)
    {
        const Binary = atob(Text);
        const Bytes = new Uint8Array(Target.buffer, Target.byteOffset, Target.byteLength);
        for (let Index = 0; Index < Math.min(Binary.length, Bytes.length); Index++)
            Bytes[Index] = Binary.charCodeAt(Index);
    }

    FieldHasContent(Samples)
    {
        for (let Index = 0; Index < Samples.length; Index += 29)
        {
            if (Samples[Index] !== 0.0)
                return true;
        }
        return false;
    }

    SerialiseProject(IncludeFields)
    {
        const Project =
        {
            Format: "FrontierTerrain/1",
            Name: this.WorldName,
            Layers: this.Layers.map((Layer) =>
            ({
                TypeId: Layer.TypeId, Label: Layer.Label, Enabled: Layer.Enabled, Blend: Layer.Blend,
                Strength: Layer.Strength, MaskChannel: Layer.MaskChannel, MaskLow: Layer.MaskLow,
                MaskHigh: Layer.MaskHigh, MaskInvert: Layer.MaskInvert, Seed: Layer.Seed,
                Params: { ...Layer.Params },
            })),
            Environment: DeepClone(this.Environment),
            Stamps: this.Stamps.map((Stamp) =>
            ({
                Shape: Stamp.Shape, X: Stamp.X, Z: Stamp.Z, Scale: Stamp.Scale,
                Rotation: Stamp.Rotation, Blend: Stamp.Blend, Sink: Stamp.Sink,
            })),
        };
        if (IncludeFields)
        {
            if (this.FieldHasContent(this.Field.SculptDelta))
                Project.SculptDelta = this.EncodeFieldBase64(this.Field.SculptDelta);
            Project.AuthoredChannels = {};
            for (const Channel of this.Field.Channels.values())
            {
                if (Channel.Authored && this.FieldHasContent(Channel.Samples))
                {
                    Project.AuthoredChannels[Channel.Name] =
                    {
                        Label: Channel.Label, Tint: Channel.Tint, Writer: Channel.Writer,
                        Samples: this.EncodeFieldBase64(Channel.Samples),
                    };
                }
            }
        }
        return Project;
    }

    ExportProject()
    {
        const Text = JSON.stringify(this.SerialiseProject(true));
        this.DownloadBlob(new Blob([Text], { type: "application/json" }), this.FileStem() + ".terrain.json");
        ShowToast("Project exported — stack, atmosphere, stamps and authored fields", "export");
    }

    ApplyProject(Project)
    {
        if (!Project || Project.Format !== "FrontierTerrain/1")
        {
            ShowToast("That file is not a FrontierTerrain/1 project", "help");
            return;
        }
        this.WorldName = Project.Name || "Imported terrain";
        this.Layers = (Project.Layers || []).map((Serialised) =>
        {
            const Layer = ConstructLayer(Serialised.TypeId);
            Object.assign(Layer, Serialised);
            Layer.Params = { ...Layer.Params, ...(Serialised.Params || {}) };
            return Layer;
        });
        this.Stamps = (Project.Stamps || []).map((Spec) =>
        {
            const Stamp = ConstructStamp(Spec.Shape, Spec.X, Spec.Z, Spec.Scale, Spec.Rotation);
            Stamp.Blend = Spec.Blend;
            Stamp.Sink = Spec.Sink;
            return Stamp;
        });
        this.Environment = DeepClone(Project.Environment);
        this.Raster.SetEnvironment(this.Environment);
        this.Field.SculptDelta.fill(0.0);
        if (Project.SculptDelta)
            this.DecodeFieldBase64(Project.SculptDelta, this.Field.SculptDelta);
        if (Project.AuthoredChannels)
        {
            for (const [Name, Record] of Object.entries(Project.AuthoredChannels))
            {
                const Channel = this.Field.RegisterChannel(Name, Record.Label, Record.Tint, true, Record.Writer);
                this.DecodeFieldBase64(Record.Samples, Channel.Samples);
            }
        }
        this.ActivePreset = null;
        this.Evaluation.Cache = [];
        this.History = [];
        this.HistoryIndex = -1;
        this.SelectedLayerSerial = this.Layers.length ? this.Layers[this.Layers.length - 1].Serial : -1;
        ById("doc-name").textContent = this.WorldName;
        ById("identity-name").textContent = this.WorldName;
        ById("title-name").textContent = this.WorldName;
        ById("title-region").textContent = "Imported project";
        ById("title-blurb").textContent = "A saved stack, rebuilt from its own geology.";
        this.ConstructPresetGrid();
        this.ConstructChannelList();
        this.RenderLayerStack();
        this.RenderLayerProperties();
        this.ConstructSceneControls();
        this.FrameCamera();
        this.RebuildFrom(0);
        ShowToast(`Project “${this.WorldName}” imported — rebuilding`, "export");
    }

    ImportProject(File)
    {
        if (!File)
            return;
        File.text().then((Text) =>
        {
            try
            {
                this.ApplyProject(JSON.parse(Text));
            }
            catch (Failure)
            {
                ShowToast("Import failed: " + Failure.message, "help");
            }
        });
        ById("import-file").value = "";
    }

    LoadCustomPresets()
    {
        try
        {
            const Stored = JSON.parse(localStorage.getItem("TerrainStudio.CustomPresets") || "[]");
            return Stored.map((Record) =>
            ({
                Id: Record.Id,
                Label: Record.Label,
                Region: "Saved stack",
                Category: "Custom",
                Blurb: "Your own geology, saved from the inspector.",
                SeedMark: 31,
                BuildLayers: () => Record.ProjectLayers.map((Serialised) =>
                {
                    const Layer = ConstructLayer(Serialised.TypeId);
                    Object.assign(Layer, DeepClone(Serialised));
                    return Layer;
                }),
                Environment: DeepClone(Record.Environment),
                Stamps: Record.Stamps || [],
                Camera: { Azimuth: -38, Elevation: 24, Distance: 2600 },
            }));
        }
        catch (Failure)
        {
            return [];
        }
    }

    SaveAsCustomPreset()
    {
        const Name = window.prompt("Name this terrain stack:", this.WorldName + " — variant");
        if (!Name)
            return;
        const Project = this.SerialiseProject(false);
        const Record =
        {
            Id: "Custom-" + Date.now(),
            Label: Name,
            ProjectLayers: Project.Layers,
            Environment: Project.Environment,
            Stamps: Project.Stamps,
        };
        try
        {
            const Stored = JSON.parse(localStorage.getItem("TerrainStudio.CustomPresets") || "[]");
            Stored.push(Record);
            localStorage.setItem("TerrainStudio.CustomPresets", JSON.stringify(Stored));
        }
        catch (Failure)
        {
            console.warn("Preset persistence unavailable", Failure);
        }
        this.CustomPresets = this.LoadCustomPresets();
        this.ConstructPresetGrid();
        ShowToast(`Preset “${Name}” saved to the library`, "star");
    }

    //--------------------------------------------------------------------------------------------------------
    //                                                              FRAME LOOP
    //--------------------------------------------------------------------------------------------------------

    RenderOptions(NowStamp)
    {
        const Hit = this.Pointer.Hit;
        const ShowBrush = this.IsBrushTool() && Hit && this.ViewDimension === "3d";
        return {
            TimeSeconds: (NowStamp - this.TimeOrigin) / 1000.0,
            ViewMode: this.ViewMode === 14 ? 0 : this.ViewMode,
            Shadows: this.Shadows,
            ShowGrid: this.ShowGrid,
            CloudAmount: this.CloudAmount,
            OverlayAmount: this.Brush.Tool === "channel" && (this.ViewMode === 0 || this.ViewMode === 14) ? 0.55 : 0.0,
            Brush: {
                X: Hit ? Hit.X : 0, Y: Hit ? Hit.Y : 0, Z: Hit ? Hit.Z : 0,
                Radius: this.Brush.Radius,
                Falloff: Math.max(1.0 - this.Brush.Softness, 0.05),
                Visible: !!ShowBrush,
            },
        };
    }

    Start()
    {
        let LastStamp = performance.now();
        let FpsFrames = 0;
        let FpsStamp = LastStamp;
        const Frame = (NowStamp) =>
        {
            const Delta = Math.min((NowStamp - LastStamp) / 1000.0, 0.1);
            LastStamp = NowStamp;
            if (this.ViewDimension === "3d")
            {
                this.Raster.ResizeToDisplay();
                const Camera = this.Raster.Camera;
                if (this.Autorotate && !this.Pointer.Dragging)
                {
                    Camera.Azimuth += Delta * 0.045;
                    Camera.AzimuthGoal += Delta * 0.045;
                }
                Camera.Advance(Delta, this.Field);
                if (this.Pointer.Dirty && !this.Pointer.Dragging)
                    this.RefreshHoverHit();
                else if (this.Pointer.Stroke)
                    this.RefreshHoverHit();
                this.Raster.Render(this.RenderOptions(NowStamp));
            }
            FpsFrames++;
            if (NowStamp - FpsStamp > 600)
            {
                ById("fps-readout").textContent = Math.round(FpsFrames * 1000 / (NowStamp - FpsStamp)) + " fps";
                FpsFrames = 0;
                FpsStamp = NowStamp;
            }
            requestAnimationFrame(Frame);
        };
        requestAnimationFrame(Frame);
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  BOOT
//--------------------------------------------------------------------------------------------------------------------------------------------

HydrateGlyphs(document);
const Studio = new TerrainStudio();
Studio.Raster.SetEnvironment(DeepClone(ReliefPresets[0].Environment));
Studio.Environment = DeepClone(ReliefPresets[0].Environment);
Studio.Raster.UploadField(Studio.Field);
Studio.Raster.UploadPaint(Studio.Field);
Studio.Start();
Studio.LoadPreset(ReliefPresets[0]);
window.TerrainStudioInstance = Studio;   // console/debugging handle
