// 📦 Inspector forms — builds the property cards for the landscape, layers, masks and generator or erosion specs.

import { GeneratorCatalogue, DefaultGeneratorParams } from "./Generators.js";
import { MaskCatalogue, DefaultMaskParams, CompleteMaskSpec } from "./Masks.js";
import { ErosionCatalogue, DefaultErosionParams } from "./Erosion.js";
import { BlendModes } from "./Pipeline.js";
import { Palettes } from "./Satmap.js";

const IconPaths = {
    generator: '<path d="M2 12.5 6 6.5l3 4 2-2.5 3 4.5"/><path d="M2 13.5h12"/>',
    erosion: '<path d="M8 2c2.6 3.6 4.2 5.8 4.2 8a4.2 4.2 0 0 1-8.4 0C3.8 7.8 5.4 5.6 8 2z"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    eyeOff: '<path d="M2 2l12 12"/><path d="M6.6 3.7A6.7 6.7 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-2 2.4"/><path d="M4.3 5A11 11 0 0 0 1.5 8S4 12.5 8 12.5a6.6 6.6 0 0 0 3.2-.8"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    down: '<path d="M8 3v10M4 9l4 4 4-4"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>',
    copy: '<rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5v-7A1 1 0 0 1 4 2.5h7"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
};

/// in    Name     [-]  icon key from IconPaths
/// out   Markup   [-]  inline SVG markup
export function Icon(Name) {
    return `<svg viewBox="0 0 16 16" aria-hidden="true">${IconPaths[Name] ?? ""}</svg>`;
}

/// in    Value    [-]  number to display
/// in    Digits   [-]  decimals
/// out   Text     [-]  fixed-point text without a negative zero
export function Fixed(Value, Digits = 0) {
    const Text = Number(Value).toFixed(Digits);
    return /^-0(\.0*)?$/.test(Text) ? Text.slice(1) : Text;
}

/// in    Text     [-]  untrusted text
/// out   Escaped  [-]  HTML-escaped text
export function Escape(Text) {
    return String(Text ?? "").replace(/[&<>"']/g, (Char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[Char]);
}

/// in    Step     [-]  increment of a control
/// out   Digits   [-]  decimals needed to display the step
function DecimalsOf(Step) {
    if (!(Step > 0) || Step >= 1) {
        return 0;
    }
    return Math.min(4, Math.ceil(-Math.log10(Step)));
}

/// in    Value    [-]  number or non-number
/// in    Min      [-]  lower bound
/// in    Max      [-]  upper bound
/// out   Fill     [%]  position of the value inside the bounds, 0–100
function FillOf(Value, Min, Max) {
    const Span = Max - Min || 1;
    return Math.min(100, Math.max(0, ((Number(Value) - Min) / Span) * 100));
}

/// in    Label    [-]  caption
/// in    Control  [-]  control markup
/// out   Markup   [-]  labelled field row
function Field(Label, Control) {
    return `<div class="field"><span class="field-label" title="${Escape(Label)}">${Escape(Label)}</span><div class="field-control">${Control}</div></div>`;
}

/// in    Title    [-]  card heading
/// in    Body     [-]  card markup
/// in    Hint     [-]  optional right-aligned hint
/// out   Markup   [-]  property card
export function Card(Title, Body, Hint = "") {
    return `<section class="property-card"><div class="property-card-head"><h2>${Escape(Title)}</h2><span class="hint">${Escape(Hint)}</span></div>${Body}</section>`;
}

/// Form collects bindings for one render pass. Each control carries data-bind="index" which the editor
/// looks up in the Bindings array. Set(Value, Phase) receives 'input' while dragging and 'commit' on release.
export class Form {
    /// in    Ctx   [-]  { Mutate(change, phase, structural), Rerender() }
    constructor(Ctx) {
        this.Ctx = Ctx;
        this.Bindings = [];
    }

    /// in    Set    [-]  handler receiving (Value, Phase)
    /// out   Index  [-]  binding index written to data-bind
    Register(Set) {
        this.Bindings.push({ Set });
        return this.Bindings.length - 1;
    }

    /// in    Label, Owner, Key   [-]  caption and target object/property
    /// in    Min, Max, Step      [-]  control range
    /// in    Unit, Fallback      [-]  suffix and value used when the property is missing
    /// out   Markup              [-]  range slider with a numeric box
    Number(Label, Owner, Key, Min, Max, Step, Unit = "", Fallback = 0, Structural = false) {
        const Current = Owner[Key] ?? Fallback;
        const Index = this.Register((Next, Phase) => {
            const Clamped = Math.min(Max, Math.max(Min, Number.isFinite(Next) ? Next : Fallback));
            this.Ctx.Mutate(() => {
                Owner[Key] = Clamped;
            }, Phase, Structural);
        });
        const Digits = DecimalsOf(Step);
        const Control = `<div class="slider-pill" style="--fill:${FillOf(Current, Min, Max).toFixed(2)}%">` +
            `<input type="range" data-bind="${Index}" data-kind="range" min="${Min}" max="${Max}" step="${Step}" value="${Number(Current)}" aria-label="${Escape(Label)}">` +
            `<div class="split-value"><input type="number" data-bind="${Index}" data-kind="number" min="${Min}" max="${Max}" step="${Step}" value="${Number(Current).toFixed(Digits)}" aria-label="${Escape(Label)} value"><small>${Escape(Unit)}</small></div>` +
            `</div>`;
        return Field(Label, Control);
    }

    /// in    Label, Owner, Key   [-]  caption and target object/property
    /// in    Options             [-]  array of { Id, Label, Group? }
    /// in    OnChange            [-]  optional (Owner, Next) callback applied with the value
    /// in    Numeric             [-]  convert the selected identifier to a number
    /// out   Markup              [-]  select element
    Choice(Label, Owner, Key, Options, OnChange = null, Numeric = false, Structural = true) {
        const Index = this.Register((Next, Phase) => {
            const Value = Numeric ? Number(Next) : Next;
            this.Ctx.Mutate(() => {
                if (OnChange) {
                    OnChange(Owner, Value);
                } else {
                    Owner[Key] = Value;
                }
            }, Phase, Structural);
        });
        const Current = String(Owner[Key]);
        const Groups = new Map();
        for (const Option of Options) {
            const Group = Option.Group ?? "";
            if (!Groups.has(Group)) {
                Groups.set(Group, []);
            }
            Groups.get(Group).push(Option);
        }
        let Inner = "";
        for (const [Group, Items] of Groups) {
            const Body = Items.map((Option) => `<option value="${Escape(Option.Id)}"${String(Option.Id) === Current ? " selected" : ""}>${Escape(Option.Label)}</option>`).join("");
            Inner += Group ? `<optgroup label="${Escape(Group)}">${Body}</optgroup>` : Body;
        }
        return Field(Label, `<select data-bind="${Index}" data-kind="choice" aria-label="${Escape(Label)}">${Inner}</select>`);
    }

    /// in    Label, Owner, Key   [-]  caption and target object/property
    /// in    Structural          [-]  re-render the inspector after toggling
    /// out   Markup              [-]  switch-style toggle
    Toggle(Label, Owner, Key, Structural = false) {
        const Index = this.Register(() => {
            this.Ctx.Mutate(() => {
                Owner[Key] = !Owner[Key];
            }, "commit", Structural);
        });
        const On = Boolean(Owner[Key]);
        return Field(Label, `<button type="button" class="field-toggle" data-toggle="${Index}" aria-pressed="${On}" aria-label="${Escape(Label)}"></button>`);
    }

    /// in    Label, Owner, Key   [-]  caption and target object/property
    /// out   Markup              [-]  single-line text input committed on change
    Text(Label, Owner, Key) {
        const Index = this.Register((Next) => {
            this.Ctx.Mutate(() => {
                Owner[Key] = String(Next).slice(0, 80) || Owner[Key];
            }, "commit", false);
        });
        return Field(Label, `<input type="text" data-bind="${Index}" data-kind="text" value="${Escape(Owner[Key])}" aria-label="${Escape(Label)}">`);
    }

    /// in    Owner    [-]  object whose Params hold the values
    /// in    Schema   [-]  array of NumberParam or ChoiceParam records from a catalogue
    /// out   Markup   [-]  one field per schema entry
    Params(Owner, Schema) {
        let Html = "";
        for (const Param of Schema) {
            if (Param.Kind === "choice") {
                Html += this.Choice(Param.Label, Owner, Param.Key, Param.Options, null, false, false);
            } else {
                Html += this.Number(Param.Label, Owner, Param.Key, Param.Min, Param.Max, Param.Step, Param.Unit, Param.Default, false);
            }
        }
        return Html;
    }
}

/// in    Catalogue   [-]  object keyed by identifier with Name and Group
/// out   Options     [-]  array of { Id, Label, Group }
function CatalogueOptions(Catalogue) {
    return Object.entries(Catalogue).map(([Id, Entry]) => ({ Id, Label: Entry.Name, Group: Entry.Group ?? "" }));
}

/// in    Spec    [-]  generator specification { Type, Seed, Params }
/// in    Form    [-]  form builder
/// out   Markup  [-]  type selector, seed, and parameter fields
function GeneratorFields(Spec, Form) {
    const Entry = GeneratorCatalogue[Spec.Type] ?? GeneratorCatalogue.Perlin;
    return Form.Choice("Type", Spec, "Type", CatalogueOptions(GeneratorCatalogue), (Owner, Next) => {
        Owner.Type = Next;
        Owner.Params = DefaultGeneratorParams(Next);
    }) +
        `<p class="summary">${Escape(Entry.Summary)}</p>` +
        Form.Number("Seed", Spec, "Seed", 1, 9999, 1, "", 1, false) +
        Form.Params(Spec.Params ?? (Spec.Params = DefaultGeneratorParams(Spec.Type)), Entry.Params);
}

/// in    Mask    [-]  mask record
/// in    Form    [-]  form builder
/// out   Markup  [-]  one mask card with its own parameters and optional generator
function MaskCard(Mask_, Form) {
    const Entry = MaskCatalogue[Mask_.Kind] ?? MaskCatalogue.Coastal;
    let Body = Form.Choice("Kind", Mask_, "Kind", CatalogueOptions(MaskCatalogue), (Owner, Next) => {
        Owner.Kind = Next;
        Owner.Params = DefaultMaskParams(Next);
        if (MaskCatalogue[Next].Generator) {
            Owner.Generator = CompleteMaskSpec({ Kind: Next }).Generator;
        } else {
            delete Owner.Generator;
        }
    });
    Body += Form.Toggle("Invert", Mask_, "Invert", false);
    Body += Form.Number("Strength", Mask_, "Strength", 0, 1, 0.01, "", 1, false);
    Body += Form.Number("Seed", Mask_, "Seed", 1, 9999, 1, "", 3, false);
    Body += `<p class="hint-text">${Escape(Entry.Summary)}</p>`;
    Body += Form.Params(Mask_.Params, Entry.Params);
    if (Entry.Generator) {
        Mask_.Generator ??= CompleteMaskSpec({ Kind: Mask_.Kind }).Generator;
        Body += `<p class="sub-title">Mask noise</p>` + GeneratorFields(Mask_.Generator, Form);
    }
    const Head = `<div class="mask-card-head">` +
        `<button type="button" class="field-toggle" style="width:36px;height:20px" data-toggle="${Form.Register(() => Form.Ctx.Mutate(() => {
            Mask_.Enabled = !Mask_.Enabled;
        }, "commit", true))}" aria-pressed="${Boolean(Mask_.Enabled)}" aria-label="Enable mask"></button>` +
        `<span class="hint">${Escape(Entry.Name)}</span>` +
        `<div class="row-actions"><button type="button" class="icon-button button-danger" data-action="remove-mask" data-id="${Escape(Mask_.Id)}" title="Remove mask" aria-label="Remove mask">${Icon("trash")}</button></div>` +
        `</div>`;
    return `<div class="mask-card${Mask_.Enabled ? "" : " is-disabled"}">${Head}${Body}</div>`;
}

/// in    Layer     [-]  generator or erosion layer
/// in    Index     [-]  zero-based index in the stack
/// in    Count     [-]  number of layers
/// in    Form      [-]  form builder
/// out   Markup    [-]  heading row with the editable name and stack order buttons
export function LayerHeading(Layer, Index, Count, Form) {
    const Kind = Layer.Kind === "Erosion" ? "Erosion" : "Generator";
    const NameIndex = Form.Register((Next) => Form.Ctx.Mutate(() => {
        Layer.Name = String(Next).slice(0, 60) || Layer.Name;
    }, "commit", false));
    return `<div class="inspector-heading-row">` +
        `<input type="text" value="${Escape(Layer.Name)}" data-bind="${NameIndex}" data-kind="text" aria-label="Layer name">` +
        `<div class="row-actions">` +
        `<button type="button" class="icon-button" data-action="move" data-dir="-1" data-id="${Escape(Layer.Id)}" title="Move down" aria-label="Move layer down" ${Index === 0 ? "disabled" : ""}>${Icon("down")}</button>` +
        `<button type="button" class="icon-button" data-action="move" data-dir="1" data-id="${Escape(Layer.Id)}" title="Move up" aria-label="Move layer up" ${Index >= Count - 1 ? "disabled" : ""}>${Icon("up")}</button>` +
        `<button type="button" class="icon-button" data-action="duplicate" data-id="${Escape(Layer.Id)}" title="Duplicate" aria-label="Duplicate layer">${Icon("copy")}</button>` +
        `<button type="button" class="icon-button button-danger" data-action="delete" data-id="${Escape(Layer.Id)}" title="Delete layer" aria-label="Delete layer">${Icon("trash")}</button>` +
        `</div></div>` +
        `<p class="eyebrow" style="margin-top:6px">${Kind} · layer ${Index + 1} of ${Count}</p>`;
}

/// in    Layer     [-]  generator or erosion layer
/// in    Form      [-]  form builder
/// out   Markup    [-]  property cards: stack, source or erosion, modulation and masks
export function LayerCards(Layer, Form) {
    let Html = "";
    Html += Card("Stack", [
        Form.Toggle("Visible", Layer, "Visible", true),
        Form.Choice("Blend", Layer, "Blend", BlendModes, null, false, false),
        Form.Number("Opacity", Layer, "Opacity", 0, 1, 0.01, "", 1, false),
        Layer.Kind === "Generator" ? Form.Number("Amplitude", Layer, "Amplitude", -4000, 4000, 10, "m", 800, false) : "",
        Layer.Kind === "Generator" ? Form.Number("Offset", Layer, "Offset", -2000, 2000, 10, "m", 0, false) : "",
    ].join(""), Layer.Kind === "Generator" ? "Generator" : "Erosion");

    if (Layer.Kind === "Generator") {
        Html += Card("Source", GeneratorFields(Layer.Source, Form), "Base shape");
    } else {
        const Entry = ErosionCatalogue[Layer.Erosion.Type] ?? ErosionCatalogue.Hydraulic;
        const Body = Form.Choice("Type", Layer.Erosion, "Type", CatalogueOptions(ErosionCatalogue), (Owner, Next) => {
            Owner.Type = Next;
            Owner.Params = DefaultErosionParams(Next);
        }) +
            `<p class="summary">${Escape(Entry.Summary)}</p>` +
            Form.Number("Seed", Layer, "Seed", 1, 9999, 1, "", 11, false) +
            Form.Params(Layer.Erosion.Params, Entry.Params);
        Html += Card("Erosion", Body, Entry.Group ?? "");

        const Modulation = Layer.Modulation;
        const ModulationBody = Form.Toggle("Enabled", Modulation, "Enabled", true) +
            Form.Number("Influence", Modulation, "Influence", 0, 1, 0.01, "", 0.5, false) +
            (Modulation.Enabled ? `<p class="sub-title">Hardness source</p>` + GeneratorFields(Modulation.Source, Form) : "");
        Html += Card("Rock hardness", ModulationBody, "Modulation");
    }

    const Masks = Layer.Masks.map((Mask_) => MaskCard(Mask_, Form)).join("");
    const Add = `<select data-action="add-mask" class="menu-select" style="width:100%;margin-top:6px" aria-label="Add mask">` +
        `<option value="">+ Add mask…</option>` +
        CatalogueOptions(MaskCatalogue).map((Option) => `<option value="${Escape(Option.Id)}">${Escape(Option.Label)}</option>`).join("") +
        `</select>`;
    Html += Card("Masks", (Masks || `<p class="hint-text">No masks. The layer applies everywhere.</p>`) + Add, `${Layer.Masks.length} active`);
    return Html;
}

/// in    Project    [-]  landscape record
/// in    Form       [-]  form builder
/// out   Markup     [-]  landscape settings card plus a live container for statistics
export function ProjectCards(Project, Form) {
    return Card("Landscape", [
        Form.Text("Name", Project, "Name"),
        Form.Choice("Resolution", Project, "Resolution", [128, 192, 256, 384, 512].map((Size) => ({ Id: String(Size), Label: `${Size} × ${Size}` })), null, true, true),
        Form.Number("World size", Project, "WorldSize", 512, 32768, 64, "m", 4096, false),
        Form.Number("Sea level", Project, "SeaLevel", -1000, 3000, 5, "m", 300, false),
        Form.Number("Seed", Project, "Seed", 1, 9999, 1, "", 1, false),
        Form.Choice("Palette", Project, "Palette", Object.entries(Palettes).map(([Id, Entry]) => ({ Id, Label: Entry.Name })), null, false, false),
    ].join(""), "World") + `<div data-live="stats">${StatsCards(null)}</div>`;
}

/// in    Result     [-]  last evaluation or null
/// out   Markup     [-]  statistics and per-layer evaluation timings
export function StatsCards(Result) {
    if (!Result) {
        return Card("Statistics", `<p class="hint-text">Waiting for the first evaluation…</p>`, "");
    }
    const Stats = Result.Stats;
    const Rows = Result.Stages.map((Stage) => `<li><span>${Escape(Stage.Name)}</span><span class="${Stage.Cached ? "is-cached" : ""}">${Stage.Cached ? "cached" : Stage.Ms.toFixed(0) + " ms"}</span></li>`).join("");
    return Card("Statistics", `<dl class="stat-list">` +
        `<div><dt>Minimum</dt><dd>${Fixed(Stats.Minimum)} m</dd></div>` +
        `<div><dt>Maximum</dt><dd>${Fixed(Stats.Maximum)} m</dd></div>` +
        `<div><dt>Land</dt><dd>${(Stats.LandFraction * 100).toFixed(1)} %</dd></div>` +
        `<div><dt>Rivers</dt><dd>${Stats.RiverLengthKm.toFixed(1)} km</dd></div>` +
        `<div><dt>Cell</dt><dd>${Stats.Cell.toFixed(1)} m</dd></div>` +
        `<div><dt>Compute</dt><dd>${Stats.ComputeMs.toFixed(0)} ms</dd></div>` +
        `</dl>`, `${Stats.N}²`) +
        Card("Evaluation", `<ol class="stage-timing">${Rows}</ol>`, `${Result.Stages.length} layers`);
}

/// in    Layer     [-]  layer record
/// in    Result    [-]  evaluation result or null
/// out   Markup    [-]  preview pair with output and mask thumbnails and stage timing
export function PreviewCard(Layer, Result) {
    const Stage = Result?.Stages.find((Entry) => Entry.Id === Layer.Id);
    const Timing = Stage ? (Stage.Cached ? "cached" : `${Stage.Ms.toFixed(0)} ms`) : "—";
    const Size = Result?.N ?? 256;
    return Card("Preview", `<div class="preview-pair">` +
        `<figure><canvas data-preview="output" width="${Size}" height="${Size}"></canvas><figcaption>Output</figcaption></figure>` +
        `<figure><canvas data-preview="mask" width="${Size}" height="${Size}"></canvas><figcaption>Mask</figcaption></figure>` +
        `</div><p class="hint-text">Layer compute: ${Timing}. Mask shows the combined weight applied to this layer.</p>`, "");
}
