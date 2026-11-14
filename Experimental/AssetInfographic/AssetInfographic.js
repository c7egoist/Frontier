// Asset Infographic — a data-driven dark-glass dashboard for an asset library.
// Everything on screen is derived from one JSON catalogue (editable live, importable,
// downloadable). The backdrop is a procedural relief atlas or any image you drop in.

import { DefaultCatalogue } from "./DefaultCatalogue.js";

import { Query, Format, Escape, Tones, CategoryHues, ComparePalette, Glyph, Icons, ResolveLods, SeededRandom, Sum, BudgetTone, DeriveTrend, SparkPath } from "./Kit.js";
import { Boards, DeriveIssues } from "./Boards.js";
import { InstallFloatTip, Toasts, CommandPalette, AnimateCounts } from "./Components.js";

const StorageKey = "Frontier.AssetInfographic.Catalogue";
const BoardByLabel = { overview: "Atlas", "live map": "Atlas", map: "Atlas", atlas: "Atlas", library: "Library", assets: "Library", budgets: "Budgets", budget: "Budgets", analytics: "Analytics", insights: "Analytics", pipeline: "Pipeline", builds: "Pipeline", issues: "Issues", incidents: "Issues" };

class AssetInfographic {
    constructor() {
        this.Catalogue = null;
        this.SelectedId = null;
        this.CategoryFilter = null;
        this.StatusFilter = null;
        this.SearchText = "";
        this.Layer = "Status";
        this.MetricIndex = 0;
        this.Section = 0;
        this.View = { X: 0, Y: 0, Scale: 1 };
        this.Compare = [];
        this.Brush = null;
        this.LastBoard = null;
        this.BoardPrefs = {
            LibraryMode: "Grid", LibrarySort: ["Label", 1], LibraryGroup: false,
            TreemapMetric: "TextureMb", HeatMode: "Requests",
            IssueSeverity: "All", Expanded: new Set(), Snoozed: new Set(),
        };
    }

    Start() {
        let Stored = null;
        try { Stored = JSON.parse(localStorage.getItem(StorageKey) || "null"); } catch { Stored = null; }
        InstallFloatTip();
        this.Toasts = new Toasts(Query("Toasts"));
        this.Palette = new CommandPalette(this);
        this.ApplyCatalogue(Stored || structuredClone(DefaultCatalogue), { Persist: false });
        this.ConstructInteractions();
        let ResizeTimer;
        new ResizeObserver(() => {
            this.FitAtlas(); this.RenderChart();
            clearTimeout(ResizeTimer);
            ResizeTimer = setTimeout(() => { if (this.ResolveBoard() !== "Atlas") this.RenderBoard(); }, 120);
        }).observe(document.body);
        window.AssetInfographic = this; // inspection handle
    }

    // ------------------------------------------------------------- catalogue
    ApplyCatalogue(Catalogue, { Persist = true, UpdateEditor = true } = {}) {
        const Problems = ValidateCatalogue(Catalogue);
        if (Problems.length) throw new Error(Problems.join(" · "));
        this.Catalogue = Catalogue;
        for (const Metric of Catalogue.Metrics) if (!Array.isArray(Metric.Series)) Metric.Series = SynthesiseSeries(Metric);
        if (!Catalogue.Assets.some((Asset) => Asset.Id === this.SelectedId)) this.SelectedId = Catalogue.Selected || Catalogue.Assets[0].Id;
        this.Compare = this.Compare.filter((Id) => Catalogue.Assets.some((Asset) => Asset.Id === Id));
        this.Brush = null;
        this.Section = Math.min(this.Section, Catalogue.Sections.length - 1);
        this.MetricIndex = Math.min(this.MetricIndex, Catalogue.Metrics.length - 1);
        if (Persist) try { localStorage.setItem(StorageKey, JSON.stringify(StripSynthesised(Catalogue))); } catch { /* quota */ }
        if (UpdateEditor) Query("DatasetText").value = JSON.stringify(StripSynthesised(Catalogue), null, 2);
        document.title = `${Catalogue.Title} · Asset Infographic`;
        this.RenderAtlasBackground();
        this.RenderAll();
    }

    get Assets() { return this.Catalogue.Assets; }
    get Selected() { return this.Assets.find((Asset) => Asset.Id === this.SelectedId) || this.Assets[0]; }
    Category(Key) { return this.Catalogue.Categories.find((Category) => Category.Key === Key) || { Key, Label: Key, Icon: "generic" }; }
    Status(Key) { return this.Catalogue.Statuses.find((Status) => Status.Key === Key) || { Key, Label: Key, Tone: "idle" }; }

    Matches(Asset, { IgnoreCategory = false, IgnoreBrush = false } = {}) {
        if (!IgnoreCategory && this.CategoryFilter && Asset.Category !== this.CategoryFilter) return false;
        if (!IgnoreBrush && this.Brush && !this.Brush.has(Asset.Id)) return false;
        if (this.StatusFilter && Asset.Status !== this.StatusFilter) return false;
        if (this.SearchText) {
            const Haystack = `${Asset.Label} ${Asset.Id} ${Asset.Category} ${(Asset.Tags || []).join(" ")}`.toLowerCase();
            if (!Haystack.includes(this.SearchText)) return false;
        }
        return true;
    }

    RenderAll() {
        this.RenderNav();
        this.RenderCategories();
        this.RenderStatuses();
        this.RenderMetric();
        this.RenderPins();
        this.RenderSelection();
        this.RenderLayerSegment();
        this.RenderLegend();
        this.RenderDropdown();
        this.RenderComposition();
        this.RenderCompareTray();
        this.RenderBoard();
    }

    // ------------------------------------------------------------- header + filters
    RenderNav() {
        const Sections = this.Catalogue.Sections;
        const Urgent = DeriveIssues(this).filter((Issue) => Issue.Severity === "Critical" && !this.BoardPrefs.Snoozed.has(Issue.Id)).length;
        Query("NavPills").innerHTML = Sections.map((Section, Index) => {
            const Badge = this.ResolveBoard(Section) === "Issues" && Urgent ? `<span class="NavBadge" aria-label="${Urgent} critical">${Urgent}</span>` : "";
            return `<button data-section="${Index}" ${Index === this.Section ? 'aria-current="page"' : ""} title="${Escape(Section.Label)} (${Index + 1})">${Escape(Section.Label)}${Badge}</button>`;
        }).join("");
        const Section = Sections[this.Section] || Sections[0];
        Query("Headline").textContent = Section.Headline || this.Catalogue.Title;
    }

    RenderCategories() {
        Query("CategoryRow").innerHTML = this.Catalogue.Categories.slice(0, 4).map((Category) => {
            const Count = Category.Count ?? this.Assets.filter((Asset) => Asset.Category === Category.Key).length;
            return `<button class="CategoryChip" data-category="${Escape(Category.Key)}" aria-pressed="${this.CategoryFilter === Category.Key}"><b>${Count}</b>${Escape(Category.Label)}</button>`;
        }).join("");
    }

    RenderStatuses() {
        const Highlighted = (this.Catalogue.HighlightStatuses || this.Catalogue.Statuses.map((Status) => Status.Key)).slice(0, 2);
        Query("StatusRow").innerHTML = Highlighted.map((Key) => {
            const Status = this.Status(Key);
            const Count = this.Assets.filter((Asset) => Asset.Status === Key && (!this.CategoryFilter || Asset.Category === this.CategoryFilter)).length;
            const Icon = Status.Tone === "ok"
                ? `<svg class="StatusIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${Tones.ok}" stroke="none"/><path d="m7 12.5 3.2 3L17 9" stroke="#0d200f" stroke-width="2.4"/></svg>`
                : Status.Tone === "bad" || Status.Tone === "warn"
                    ? `<svg class="StatusIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1z" fill="${Tones[Status.Tone]}" stroke="none"/><path d="M12 9v5.5" stroke="#fff" stroke-width="2.2"/><circle cx="12" cy="18" r="1.3" fill="#fff" stroke="none"/></svg>`
                    : `<svg class="StatusIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${Tones[Status.Tone] || Tones.idle}" stroke="none"/></svg>`;
            return `<button class="StatusTile" data-status="${Escape(Key)}" aria-pressed="${this.StatusFilter === Key}">${Icon}<span class="StatusLabel">${Escape(Status.Label)}</span><span class="StatusSub">${Escape(Status.Hint || "")}</span><span class="StatusCount">${Count}</span></button>`;
        }).join("");
    }

    // ------------------------------------------------------------- metric + chart
    RenderMetric() {
        const Metric = this.Catalogue.Metrics[this.MetricIndex];
        const Series = Metric.Series;
        const Reading = Metric.Reading ?? Series.reduce((Sum, S) => Sum + S, 0) / Series.length;
        const [Whole, Fraction] = Reading.toFixed(1).split(".");
        Query("MetricTitle").textContent = Metric.Title;
        Query("MetricValue").innerHTML = `${Whole}<span class="Fraction">.${Fraction}</span><span class="Unit">${Escape(Metric.Unit || "")}</span>`;
        Query("MetricTarget").textContent = `Target: ${Metric.Target}${Metric.Unit || ""}`;
        const Half = Math.floor(Series.length / 2);
        const Earlier = Series.slice(0, Half).reduce((A, B) => A + B, 0) / Math.max(1, Half);
        const Later = Series.slice(Half).reduce((A, B) => A + B, 0) / Math.max(1, Series.length - Half);
        const Delta = Later - Earlier;
        Query("MetricDelta").innerHTML = `<span class="${Delta >= 0 ? "Up" : "Down"}">${Delta >= 0 ? "▲" : "▼"} ${Math.abs(Delta).toFixed(1)}${Escape(Metric.Unit || "")}</span> since ${Escape(Metric.Axis?.[Math.floor((Metric.Axis?.length || 1) / 2)] || "midday")}`;
        this.RenderChart();
    }

    RenderChart() {
        const Svg = Query("Chart");
        if (!this.Catalogue || !Svg.clientWidth) return;
        const Metric = this.Catalogue.Metrics[this.MetricIndex];
        const Series = Metric.Series;
        const Width = Svg.clientWidth, Height = Svg.clientHeight;
        const Left = 0, Right = Width - 52, Top = 26, Bottom = Height - 30;
        const Range = Metric.Range || [15, 105];
        const X = (Index) => Left + (Index / (Series.length - 1)) * (Right - Left);
        const Y = (S) => Bottom - ((S - Range[0]) / (Range[1] - Range[0])) * (Bottom - Top);
        const Unit = Metric.Unit || "";
        const Ticks = Metric.Ticks || [25, 50, 75, 100];
        let Markup = "";
        for (const Tick of Ticks) Markup += `<line class="Grid" x1="${Left}" x2="${Right}" y1="${Y(Tick)}" y2="${Y(Tick)}"/><text x="${Width}" y="${Y(Tick) + 4}" text-anchor="end">${Tick}${Unit}</text>`;
        const TargetStart = Metric.TargetStart ?? Metric.Target + 3, TargetEnd = Metric.Target;
        Markup += `<line class="TargetLine" x1="${Left}" x2="${Right}" y1="${Y(TargetStart)}" y2="${Y(TargetEnd)}"/>`;
        Markup += `<text x="${Right}" y="${Y(Metric.High) - 8}" text-anchor="end">&gt;${Metric.High}${Unit}</text>`;
        const PathOf = (From, To) => { let D = ""; for (let I = From; I <= To; I++) D += `${I === From ? "M" : "L"}${X(I).toFixed(1)} ${Y(Series[I]).toFixed(1)}`; return D; };
        // Runs above High (peaks) and below Low.
        const Runs = (Test) => {
            const Found = [];
            let Start = -1;
            for (let I = 0; I < Series.length; I++) {
                if (Test(Series[I])) { if (Start < 0) Start = I; }
                else if (Start >= 0) { Found.push([Math.max(0, Start - 1), I]); Start = -1; }
            }
            if (Start >= 0) Found.push([Math.max(0, Start - 1), Series.length - 1]);
            return Found.filter(([A, B]) => B - A >= 2);
        };
        const Peaks = Runs((S) => S > Metric.High), Lows = Runs((S) => S < Metric.Low);
        for (const [A, B] of Peaks) Markup += `<rect class="Band" x="${X(A)}" y="${Y(Metric.Target)}" width="${X(B) - X(A)}" height="${Bottom - Y(Metric.Target)}"/>`;
        Markup += `<path class="Series" d="${PathOf(0, Series.length - 1)}"/>`;
        for (const [A, B] of Peaks) Markup += `<path class="Peak" d="${PathOf(A, B)}"/><circle class="Dot" cx="${X(A)}" cy="${Y(Series[A])}" r="3.6"/><circle class="Dot" cx="${X(B)}" cy="${Y(Series[B])}" r="3.6"/>`;
        for (const [A, B] of Lows) Markup += `<path class="Low" d="${PathOf(A, B)}"/><circle class="LowDot" cx="${X(A)}" cy="${Y(Series[A])}" r="3.6"/><circle class="LowDot" cx="${X(B)}" cy="${Y(Series[B])}" r="3.6"/>`;
        const Axis = Metric.Axis || ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
        Axis.forEach((Label, Index) => {
            const Anchor = Index === 0 ? "start" : Index === Axis.length - 1 ? "end" : "middle";
            Markup += `<text x="${Left + (Index / (Axis.length - 1)) * (Right - Left)}" y="${Height - 4}" text-anchor="${Anchor}">${Escape(Label)}</text>`;
        });
        Markup += `<g id="ChartCursor" visibility="hidden"><line class="Cursor" y1="${Top}" y2="${Bottom}"/><circle class="CursorDot" r="4.5"/></g>`;
        Svg.setAttribute("viewBox", `0 0 ${Width} ${Height}`);
        Svg.innerHTML = Markup;
        this.ChartGeometry = { X, Y, Left, Right, Series, Axis, Unit, Metric };
        Svg.setAttribute("aria-label", `${Metric.Title}: ${Peaks.length} periods above ${Metric.High}${Unit}, ${Lows.length} below ${Metric.Low}${Unit}`);
    }

    HoverChart(Event) {
        const G = this.ChartGeometry;
        if (!G) return;
        const Rect = Query("Chart").getBoundingClientRect();
        const Px = Event.clientX - Rect.left;
        const Index = Math.round(((Px - G.Left) / (G.Right - G.Left)) * (G.Series.length - 1));
        const Cursor = Query("ChartCursor"), Tip = Query("ChartTip");
        if (Index < 0 || Index >= G.Series.length) { Cursor.setAttribute("visibility", "hidden"); Tip.hidden = true; return; }
        const Cx = G.X(Index), Cy = G.Y(G.Series[Index]);
        Cursor.setAttribute("visibility", "visible");
        Cursor.querySelector("line").setAttribute("x1", Cx); Cursor.querySelector("line").setAttribute("x2", Cx);
        Cursor.querySelector("circle").setAttribute("cx", Cx); Cursor.querySelector("circle").setAttribute("cy", Cy);
        Tip.hidden = false;
        Tip.style.left = `${Cx}px`; Tip.style.top = `${Cy}px`;
        Tip.innerHTML = `${Escape(InterpolateAxis(G.Axis, Index / (G.Series.length - 1)))} · <b>${G.Series[Index].toFixed(1)}${Escape(G.Unit)}</b>`;
    }

    // ------------------------------------------------------------- selection panels
    RenderSelection() {
        const Asset = this.Selected;
        const Category = this.Category(Asset.Category), Status = this.Status(Asset.Status);
        const Lods = ResolveLods(Asset);
        const Feature = Query("FeaturePanel");
        const [ToneA, ToneB] = Asset.Tones || Category.Tones || ["#8c9a86", "#3a3f3a"];
        Feature.style.setProperty("--tone-a", ToneA);
        Feature.style.setProperty("--tone-b", ToneB);
        Feature.innerHTML = `<span class="Kicker">${Escape(Category.Label)} · ${Escape(Asset.Id)}</span>
            <h3>${Escape(Asset.Label)}</h3>
            <span class="StatusBadge" style="--dot:${Tones[Status.Tone] || Tones.idle}"><i></i>${Escape(Status.Label)}</span>
            <div class="Silhouette">${Glyph(Asset.Icon || Category.Icon)}</div>
            <div class="FeatureFacts"><div><b>${Format(Asset.Triangles || Lods[0] || 0)}</b><span>Triangles</span></div><div><b>${Lods.length}</b><span>LOD levels</span></div><div><b>${Asset.TextureMb ?? "—"}</b><span>Texture MB</span></div></div>`;

        const Max = Math.max(1, ...Lods);
        Query("ChainPanel").innerHTML = `<header class="PanelHeader"><h3>LOD chain</h3><span class="Spacer"></span><span class="Hint">${Lods.length ? `${(Lods[0] / Math.max(1, Lods[Lods.length - 1])).toFixed(0)}× range` : ""}</span></header>
            <div class="ChainBars">${Lods.slice(0, 7).map((Count, Level) => `<div class="ChainBar"><span>L${Level}</span><i style="width:${Math.max(3, (Count / Max) * 100)}%;animation-delay:${Level * 40}ms"></i><span>${Format(Count)}</span></div>`).join("") || '<p class="Hint">No LOD data.</p>'}</div>`;

        const Budget = Math.max(0, Math.min(1.5, Asset.BudgetUse ?? 0.5));
        const Trend = DeriveTrend(Asset), TrendTop = Math.max(1.15, ...Trend) * 1.05;
        const Circumference = 2 * Math.PI * 30;
        Query("DetailPanel").innerHTML = `<header><div><h3>${Escape(Asset.Label)}</h3><div class="Sub">${Escape(Asset.Owner || "Unassigned")} · updated ${Escape(Asset.Updated || "—")}</div></div><span class="Spacer"></span>
                <button class="IconButton" id="FocusSelected" aria-label="Centre on ${Escape(Asset.Label)}"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg></button></header>
            <div class="Gauge"><svg viewBox="0 0 74 74" aria-hidden="true"><circle class="Track" cx="37" cy="37" r="30"/><circle class="Fill" cx="37" cy="37" r="30" stroke-dasharray="${Circumference}" stroke-dashoffset="${Circumference * (1 - Math.min(1, Budget))}" style="stroke:${Budget > 1 ? Tones.bad : Budget > 0.85 ? Tones.warn : "#f0f0f0"}"/></svg>
                <div class="GaugeText"><b>${Math.round(Budget * 100)}%</b><span>of ${Escape(Category.Label.toLowerCase())} budget</span></div></div>
            <div class="Facts">
                <div class="Fact"><b>${Format(Asset.Triangles || Lods[0] || 0)}</b><span>Source triangles</span></div>
                <div class="Fact"><b>${Asset.Materials ?? "—"}</b><span>Materials</span></div>
                <div class="Fact"><b>${Asset.TextureMb ?? "—"}<small> MB</small></b><span>Texture memory</span></div>
                <div class="Fact"><b>${Asset.Instances ?? "—"}</b><span>Placed instances</span></div>
            </div>
            <div class="Trend" data-tip="${Escape(`Budget use · last 12 weeks\n${Trend.map((V) => Math.round(V * 100) + "%").join(" → ")}`)}"><span>12-week budget trend</span>
                <svg viewBox="0 0 220 40" preserveAspectRatio="none" aria-hidden="true"><line class="Limit" x1="0" x2="220" y1="${40 - 4 - (1 / TrendTop) * 32}" y2="${40 - 4 - (1 / TrendTop) * 32}"/><path class="Area" d="${SparkPath(Trend, 220, 40, 4, [0, TrendTop])}L216 40L4 40Z"/><path d="${SparkPath(Trend, 220, 40, 4, [0, TrendTop])}" style="stroke:${BudgetTone(Budget)}"/></svg></div>
            <div class="Tags">${(Asset.Tags || []).map((Tag) => `<span>${Escape(Tag)}</span>`).join("")}</div>
            <div class="DetailActions">
                <div class="StatusSwitch" role="group" aria-label="Change status">${this.Catalogue.Statuses.map((Entry) => `<button data-status-set="${Escape(Entry.Key)}" aria-pressed="${Entry.Key === Asset.Status}" style="--dot:${Tones[Entry.Tone] || Tones.idle}"><i></i>${Escape(Entry.Label)}</button>`).join("")}</div>
                <button class="GhostPill" id="CompareSelected" aria-pressed="${this.Compare.includes(Asset.Id)}">${Icons.star}${this.Compare.includes(Asset.Id) ? "Comparing" : "Compare"}</button>
            </div>`;
        Query("FocusSelected").addEventListener("click", () => this.FocusAsset(Asset));
        Query("CompareSelected").addEventListener("click", () => this.ToggleCompare(Asset.Id));
        for (const Button of Query("DetailPanel").querySelectorAll("[data-status-set]")) Button.addEventListener("click", () => this.SetStatus(Asset.Id, Button.dataset.statusSet));

        Query("AssetDropdownIcon").innerHTML = Glyph(Asset.Icon || Category.Icon);
        Query("AssetDropdownLabel").textContent = Asset.Label;
        for (const Pin of document.querySelectorAll(".Pin")) {
            const Pressed = Pin.dataset.asset === Asset.Id;
            Pin.setAttribute("aria-pressed", String(Pressed));
            const Tag = Pin.querySelector(".PinTag");
            if (Tag) Tag.hidden = !Pressed;
        }
    }

    Select(Id) {
        this.SelectedId = Id;
        this.RenderSelection();
        this.RenderDropdown();
        this.RenderCompareTray();
        if (this.ResolveBoard() !== "Atlas") this.RenderBoard();
    }

    // ------------------------------------------------------------- pins + atlas
    PinColour(Asset) {
        if (this.Layer === "Category") return CategoryHues[Math.max(0, this.Catalogue.Categories.findIndex((Category) => Category.Key === Asset.Category)) % CategoryHues.length];
        if (this.Layer === "Budget") { const B = Asset.BudgetUse ?? 0.5; return B > 1 ? Tones.bad : B > 0.85 ? Tones.warn : Tones.ok; }
        return Tones[this.Status(Asset.Status).Tone] || Tones.idle;
    }

    RenderPins() {
        Query("Pins").innerHTML = this.Assets.map((Asset) => {
            const [U, V] = Asset.Atlas || [0.5, 0.5];
            const Category = this.Category(Asset.Category);
            return `<button class="Pin ${this.Matches(Asset) ? "" : "Dim"}" data-asset="${Escape(Asset.Id)}" style="left:${U * 100}%;top:${V * 100}%;--pin:${this.PinColour(Asset)}" aria-label="${Escape(Asset.Label)}, ${Escape(this.Status(Asset.Status).Label)}" aria-pressed="${Asset.Id === this.SelectedId}">${Glyph(Asset.Icon || Category.Icon)}<span class="PinTag" ${Asset.Id === this.SelectedId ? "" : "hidden"}>${Escape(Asset.Label)}</span></button>`;
        }).join("");
        this.ApplyView();
    }

    RenderLayerSegment() {
        Query("LayerSegment").innerHTML = ["Status", "Category", "Budget"].map((Layer) => `<button data-layer="${Layer}" aria-pressed="${this.Layer === Layer}">${Layer}</button>`).join("");
    }

    RenderLegend() {
        let Entries;
        if (this.Layer === "Category") Entries = this.Catalogue.Categories.map((Category, Index) => [CategoryHues[Index % CategoryHues.length], Category.Label]);
        else if (this.Layer === "Budget") Entries = [[Tones.ok, "Under 85%"], [Tones.warn, "85–100%"], [Tones.bad, "Over budget"]];
        else Entries = this.Catalogue.Statuses.map((Status) => [Tones[Status.Tone] || Tones.idle, Status.Label]);
        const Visible = this.Assets.filter((Asset) => this.Matches(Asset)).length;
        Query("Legend").innerHTML = Entries.map(([Colour, Label]) => `<span><i style="background:${Colour}"></i>${Escape(Label)}</span>`).join("") + `<span style="color:var(--ink-3)">${Visible}/${this.Assets.length} shown</span>`;
    }

    RenderDropdown() {
        Query("AssetDropdownList").innerHTML = this.Assets.filter((Asset) => this.Matches(Asset)).map((Asset) =>
            `<li role="option" data-asset="${Escape(Asset.Id)}" aria-selected="${Asset.Id === this.SelectedId}" tabindex="-1"><i style="background:${Tones[this.Status(Asset.Status).Tone] || Tones.idle}"></i>${Escape(Asset.Label)}<small>${Escape(Asset.Id)}</small></li>`).join("") || `<li aria-disabled="true">No assets match</li>`;
    }

    RefreshFilters() {
        this.RenderCategories();
        this.RenderStatuses();
        this.RenderLegend();
        this.RenderDropdown();
        for (const Pin of document.querySelectorAll(".Pin")) {
            const Asset = this.Assets.find((Entry) => Entry.Id === Pin.dataset.asset);
            Pin.classList.toggle("Dim", !this.Matches(Asset));
            Pin.style.setProperty("--pin", this.PinColour(Asset));
        }
        this.RenderComposition();
        this.RenderBoard();
    }

    RenderAtlasBackground() {
        const Image = Query("AtlasImage"), Canvas = Query("AtlasCanvas");
        const Source = this.BackgroundOverride || this.Catalogue.Background;
        if (Source) {
            Image.src = Source;
            Image.hidden = false;
            Canvas.hidden = true;
            Query("Routes").innerHTML = "";
        } else {
            Image.hidden = true;
            Canvas.hidden = false;
            if (this.AtlasSeed !== (this.Catalogue.AtlasSeed ?? 7)) {
                this.AtlasSeed = this.Catalogue.AtlasSeed ?? 7;
                PaintReliefAtlas(Canvas, this.AtlasSeed);
            }
            Query("Routes").innerHTML = ConstructRoutes(this.Assets, this.AtlasSeed);
        }
        this.FitAtlas();
    }

    FitAtlas() {
        const Width = window.innerWidth, Height = window.innerHeight;
        const LayerWidth = Math.max(Width, Height * 1.6), LayerHeight = LayerWidth / 1.6;
        const Layer = Query("AtlasLayer");
        Layer.style.width = `${LayerWidth}px`;
        Layer.style.height = `${LayerHeight}px`;
        this.LayerSize = [LayerWidth, LayerHeight];
        this.ApplyView();
    }

    ClampView() {
        const [LW, LH] = this.LayerSize || [1, 1];
        const V = this.View;
        V.Scale = Math.min(4, Math.max(1, V.Scale));
        V.X = Math.min(0, Math.max(window.innerWidth - LW * V.Scale, V.X));
        V.Y = Math.min(0, Math.max(window.innerHeight - LH * V.Scale, V.Y));
    }

    ApplyView() {
        this.ClampView();
        const V = this.View;
        Query("AtlasLayer").style.transform = `translate(${V.X}px, ${V.Y}px) scale(${V.Scale})`;
        Query("Pins").style.setProperty("--inverse", (1 / V.Scale).toFixed(4));
    }

    FocusAsset(Asset) {
        const [LW, LH] = this.LayerSize;
        const [U, V] = Asset.Atlas || [0.5, 0.5];
        const Stage = document.querySelector(".Stage").getBoundingClientRect();
        this.View.Scale = Math.max(this.View.Scale, 1.6);
        this.View.X = Stage.left + Stage.width / 2 - U * LW * this.View.Scale;
        this.View.Y = Stage.top + Stage.height * 0.55 - V * LH * this.View.Scale;
        Query("AtlasLayer").style.transition = "transform .7s cubic-bezier(.16,1,.3,1)";
        this.ApplyView();
        setTimeout(() => (Query("AtlasLayer").style.transition = ""), 750);
    }

    // ------------------------------------------------------------- interactions
    // ------------------------------------------------------------- boards + shared actions
    ResolveBoard(Section = this.Catalogue.Sections[this.Section]) {
        if (!Section) return "Atlas";
        if (Section.Board && (Section.Board === "Atlas" || Boards[Section.Board])) return Section.Board;
        return BoardByLabel[String(Section.Label).toLowerCase()] || "Atlas";
    }

    GoSection(Index) {
        this.Section = Math.max(0, Math.min(this.Catalogue.Sections.length - 1, Index));
        const Section = this.Catalogue.Sections[this.Section];
        if (Section.Metric !== undefined) this.MetricIndex = Math.min(Section.Metric, this.Catalogue.Metrics.length - 1);
        this.RenderNav();
        this.RenderMetric();
        this.RenderCompareTray();
        this.RenderBoard();
    }

    RenderBoard() {
        if (!this.Catalogue) return;
        const Name = this.ResolveBoard(), Host = Query("BoardHost");
        document.body.dataset.board = Name;
        document.body.classList.toggle("BoardMode", Name !== "Atlas");
        if (Name === "Atlas") { Host.hidden = true; Host.innerHTML = ""; this.LastBoard = Name; return; }
        const Entering = this.LastBoard !== Name;
        const Scroll = Entering ? 0 : Host.scrollTop;
        Host.hidden = false;
        Host.innerHTML = Boards[Name].Render(this);
        Boards[Name].Mount?.(this, Host);
        Host.scrollTop = Scroll;
        if (Entering) { Host.classList.remove("Entering"); void Host.offsetWidth; Host.classList.add("Entering"); AnimateCounts(Host); }
        this.LastBoard = Name;
    }

    CategoryHue(Key) { return CategoryHues[Math.max(0, this.Catalogue.Categories.findIndex((Category) => Category.Key === Key)) % CategoryHues.length]; }
    StatusKeyByTone(Tone) { return this.Catalogue.Statuses.find((Status) => Status.Tone === Tone)?.Key; }

    // Budgets live in the catalogue; missing values get sensible defaults (≈10–15% headroom).
    get Budgets() {
        const C = this.Catalogue;
        C.Budgets ??= {};
        const B = C.Budgets;
        B.TextureMb ??= Math.ceil(Sum(C.Assets, (Asset) => Asset.TextureMb) * 1.1 / 10) * 10;
        B.Triangles ??= Math.ceil(Sum(C.Assets, (Asset) => Asset.Triangles) * 1.1 / 1e4) * 1e4;
        B.Categories ??= {};
        for (const Category of C.Categories) B.Categories[Category.Key] ??= Math.ceil(Sum(C.Assets.filter((Asset) => Asset.Category === Category.Key), (Asset) => Asset.TextureMb) * 1.15 / 5) * 5 || 10;
        return B;
    }

    Toast(Message, Options) { this.Toasts.Show(Message, Options); }

    Commit({ Render = true } = {}) {
        try { localStorage.setItem(StorageKey, JSON.stringify(StripSynthesised(this.Catalogue))); } catch { /* sandboxed or full */ }
        Query("DatasetText").value = JSON.stringify(StripSynthesised(this.Catalogue), null, 2);
        if (Render) this.RenderAll();
    }

    // Apply a change to one asset, persist, and offer an undo toast.
    Mutate(Id, Change, Message, Tone = "info") {
        const Index = this.Assets.findIndex((Asset) => Asset.Id === Id);
        if (Index < 0) return;
        const Before = structuredClone(this.Assets[Index]);
        Change(this.Assets[Index]);
        this.Commit();
        this.Toast(Message, { Tone, Action: { Label: "Undo", Run: () => { this.Assets[Index] = Before; this.Commit(); } } });
    }

    SetStatus(Id, Key) {
        const Asset = this.Assets.find((Entry) => Entry.Id === Id);
        if (!Asset || Asset.Status === Key) return;
        const Status = this.Status(Key);
        this.Mutate(Id, (Target) => { Target.Status = Key; }, `${Asset.Label} → ${Status.Label}`, Status.Tone);
    }

    ToggleCompare(Id) {
        const Asset = this.Assets.find((Entry) => Entry.Id === Id);
        if (!Asset) return;
        if (this.Compare.includes(Id)) this.Compare = this.Compare.filter((Other) => Other !== Id);
        else {
            if (this.Compare.length >= 4) { this.Toast("Compare holds up to 4 assets — remove one first", { Tone: "warn" }); return; }
            this.Compare = [...this.Compare, Id];
        }
        this.RenderSelection();
        this.RenderCompareTray();
        this.RenderBoard();
    }

    RenderCompareTray() {
        const Tray = Query("CompareTray");
        const Items = this.Compare.map((Id) => this.Assets.find((Asset) => Asset.Id === Id)).filter(Boolean);
        Tray.hidden = !Items.length;
        if (!Items.length) return;
        const AnalyticsIndex = this.Catalogue.Sections.findIndex((Section) => this.ResolveBoard(Section) === "Analytics");
        Tray.innerHTML = `<span class="TrayLabel">${Icons.compare}Compare</span>${Items.map((Asset, Index) => `<span class="TrayItem" style="--c:${ComparePalette[Index % 4]}"><i></i><button class="TrayName" data-tray-select="${Escape(Asset.Id)}">${Escape(Asset.Label)}</button><button class="IconButton" data-tray-remove="${Escape(Asset.Id)}" aria-label="Remove ${Escape(Asset.Label)}">${Icons.close}</button></span>`).join("")}
            ${AnalyticsIndex >= 0 && this.Section !== AnalyticsIndex ? `<button class="GhostPill Primary" data-tray-open="${AnalyticsIndex}">Open radar</button>` : ""}<button class="GhostPill" data-tray-clear>Clear</button>`;
    }

    // Left-column infographic: texture memory composition by category + library health.
    RenderComposition() {
        const Host = Query("CompositionPanel");
        if (!Host || !this.Catalogue) return;
        const B = this.Budgets;
        const Rows = this.Catalogue.Categories.map((Category) => ({ Category, Used: Sum(this.Assets.filter((Asset) => Asset.Category === Category.Key), (Asset) => Asset.TextureMb) })).filter((Row) => Row.Used > 0);
        const Total = Sum(Rows, (Row) => Row.Used), Scale = Math.max(Total, B.TextureMb);
        const Healthy = this.Assets.filter((Asset) => this.Status(Asset.Status).Tone === "ok" && (Asset.BudgetUse ?? 0) <= 1).length;
        const Health = Healthy / this.Assets.length, C = 2 * Math.PI * 22;
        const Instances = Sum(this.Assets, (Asset) => Asset.Instances), Depth = Sum(this.Assets, (Asset) => ResolveLods(Asset).length) / this.Assets.length;
        Host.innerHTML = `<header class="PanelHeader"><h3>Texture memory</h3><span class="Spacer"></span><span class="Hint"><b style="color:${BudgetTone(Total / B.TextureMb)}">${Math.round(Total)}</b> / ${B.TextureMb} MB</span></header>
            <div class="Composition">${Rows.map(({ Category, Used }) => `<button style="flex:0 0 ${(Used / Scale) * 100}%;background:${this.CategoryHue(Category.Key)}" data-composition="${Escape(Category.Key)}" aria-pressed="${this.CategoryFilter === Category.Key}"
                data-tip="${Escape(`${Category.Label}
${Math.round(Used)} MB · ${((Used / Total) * 100).toFixed(1)}% of used
budget ${B.Categories[Category.Key]} MB`)}"></button>`).join("")}<i class="BudgetTick" style="left:${(B.TextureMb / Scale) * 100}%" data-tip="Budget ${B.TextureMb} MB"></i></div>
            <ul class="CompositionLegend">${Rows.map(({ Category, Used }) => `<li><i style="background:${this.CategoryHue(Category.Key)}"></i>${Escape(Category.Label)}<b>${((Used / Total) * 100).toFixed(0)}%</b></li>`).join("")}</ul>
            <div class="HealthRow">
                <div class="Health" data-tip="${Escape(`Library health
${Healthy} of ${this.Assets.length} assets are ready and within budget`)}"><svg viewBox="0 0 54 54" aria-hidden="true"><circle class="Track" cx="27" cy="27" r="22"/><circle class="Fill" cx="27" cy="27" r="22" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Health)}" style="stroke:${Health < 0.5 ? Tones.warn : Tones.ok}"/></svg><b>${Math.round(Health * 100)}</b></div>
                <div class="HealthFacts"><span><b>${Format(Instances)}</b>placed instances</span><span><b>${Depth.toFixed(1)}</b>avg LOD levels</span><span><b>${this.Assets.length}</b>assets</span></div>
            </div>`;
    }

    ConstructCommands() {
        const Commands = [];
        this.Catalogue.Sections.forEach((Section, Index) => Commands.push({ Group: "Go to", Label: Section.Label, Sub: Section.Headline, Keys: String(Index + 1), Icon: Icons.chevron, Run: () => this.GoSection(Index) }));
        for (const Asset of this.Assets) Commands.push({
            Group: "Assets", Label: Asset.Label, Sub: `${Asset.Id} · ${this.Category(Asset.Category).Label} · ${this.Status(Asset.Status).Label}`, Icon: Glyph(Asset.Icon || this.Category(Asset.Category).Icon),
            Run: () => { this.Select(Asset.Id); if (this.ResolveBoard() === "Atlas") this.FocusAsset(Asset); },
        });
        const Selected = this.Selected;
        Commands.push(
            { Group: "Actions", Label: this.Compare.includes(Selected.Id) ? `Remove ${Selected.Label} from compare` : `Compare ${Selected.Label}`, Keys: "C", Icon: Icons.star, Run: () => this.ToggleCompare(Selected.Id) },
            { Group: "Actions", Label: "Locate selected on map", Keys: "L", Icon: Icons.locate, Run: () => this.LocateAsset(Selected.Id) },
            ...["Status", "Category", "Budget"].map((Layer) => ({ Group: "Actions", Label: `Colour pins by ${Layer}`, Icon: Icons.grid, Run: () => { this.Layer = Layer; this.RenderLayerSegment(); this.RefreshFilters(); } })),
            { Group: "Actions", Label: "Clear all filters", Keys: "X", Icon: Icons.close, Run: () => this.ClearFilters() },
            { Group: "Actions", Label: "Next metric", Icon: Icons.chevron, Run: () => { this.MetricIndex = (this.MetricIndex + 1) % this.Catalogue.Metrics.length; this.RenderMetric(); } },
            { Group: "Actions", Label: "Reset map view", Icon: Icons.locate, Run: () => this.FitAtlas() },
            { Group: "Data", Label: "Edit catalogue JSON", Icon: Icons.list, Run: () => Query("EditButton").click() },
            { Group: "Data", Label: "Import catalogue JSON", Icon: Icons.list, Run: () => Query("DatasetInput").click() },
            { Group: "Data", Label: "Download catalogue", Icon: Icons.list, Run: () => Query("ExportButton").click() },
            { Group: "Data", Label: "Use a background image", Icon: Icons.grid, Run: () => Query("ImageInput").click() },
        );
        for (const Status of this.Catalogue.Statuses) if (Status.Key !== Selected.Status) Commands.push({ Group: "Actions", Label: `Mark ${Selected.Label} as ${Status.Label}`, Icon: Icons.wrench, Run: () => this.SetStatus(Selected.Id, Status.Key) });
        return Commands;
    }

    LocateAsset(Id) {
        const AtlasIndex = this.Catalogue.Sections.findIndex((Section) => this.ResolveBoard(Section) === "Atlas");
        this.Select(Id);
        if (AtlasIndex >= 0 && this.Section !== AtlasIndex) this.GoSection(AtlasIndex);
        this.FocusAsset(this.Selected);
    }

    ClearFilters() {
        this.CategoryFilter = null; this.StatusFilter = null; this.Brush = null; this.SearchText = "";
        Query("SearchInput").value = "";
        this.RefreshFilters();
    }

    ConstructInteractions() {
        // Delegated clicks inside the active board.
        Query("BoardHost").addEventListener("click", (Event) => {
            const Element = Event.target.closest("[data-act]");
            if (!Element) return;
            const Name = Element.dataset.act, Board = Boards[this.ResolveBoard()];
            if (Board?.Act?.(this, Name, Element, Event)) return;
            if (Name === "select") this.Select(Element.dataset.asset);
            else if (Name === "compare") { Event.stopPropagation(); this.ToggleCompare(Element.dataset.asset); }
            else if (Name === "locate") this.LocateAsset(Element.dataset.asset);
        });
        Query("BoardHost").addEventListener("keydown", (Event) => {
            if ((Event.key === "Enter" || Event.key === " ") && Event.target.matches("[data-act='select']")) { this.Select(Event.target.dataset.asset); Event.preventDefault(); }
        });
        Query("CompositionPanel").addEventListener("click", (Event) => {
            const Segment = Event.target.closest("[data-composition]");
            if (!Segment) return;
            this.CategoryFilter = this.CategoryFilter === Segment.dataset.composition ? null : Segment.dataset.composition;
            this.RefreshFilters();
        });
        Query("CompareTray").addEventListener("click", (Event) => {
            const Target = Event.target.closest("button");
            if (!Target) return;
            if (Target.dataset.traySelect) this.Select(Target.dataset.traySelect);
            else if (Target.dataset.trayRemove) this.ToggleCompare(Target.dataset.trayRemove);
            else if (Target.dataset.trayOpen) this.GoSection(Number(Target.dataset.trayOpen));
            else if (Target.hasAttribute("data-tray-clear")) { this.Compare = []; this.RenderSelection(); this.RenderCompareTray(); this.RenderBoard(); }
        });
        Query("PaletteButton").addEventListener("click", () => this.Palette.Open());

        Query("NavPills").addEventListener("click", (Event) => {
            const Button = Event.target.closest("[data-section]");
            if (!Button) return;
            this.GoSection(Number(Button.dataset.section));
        });
        Query("CategoryRow").addEventListener("click", (Event) => {
            const Chip = Event.target.closest("[data-category]");
            if (!Chip) return;
            this.CategoryFilter = this.CategoryFilter === Chip.dataset.category ? null : Chip.dataset.category;
            this.RefreshFilters();
        });
        Query("StatusRow").addEventListener("click", (Event) => {
            const Tile = Event.target.closest("[data-status]");
            if (!Tile) return;
            this.StatusFilter = this.StatusFilter === Tile.dataset.status ? null : Tile.dataset.status;
            this.RefreshFilters();
        });
        Query("SearchInput").addEventListener("input", (Event) => { this.SearchText = Event.target.value.trim().toLowerCase(); this.RefreshFilters(); });
        Query("LayerSegment").addEventListener("click", (Event) => {
            const Button = Event.target.closest("[data-layer]");
            if (!Button) return;
            this.Layer = Button.dataset.layer;
            this.RenderLayerSegment();
            this.RefreshFilters();
        });
        Query("MetricExpand").addEventListener("click", () => { this.MetricIndex = (this.MetricIndex + 1) % this.Catalogue.Metrics.length; this.RenderMetric(); });
        Query("Chart").addEventListener("pointermove", (Event) => this.HoverChart(Event));
        Query("Chart").addEventListener("pointerleave", () => { Query("ChartTip").hidden = true; const Cursor = Query("ChartCursor"); if (Cursor) Cursor.setAttribute("visibility", "hidden"); });

        // Dropdown
        const DropButton = Query("AssetDropdownButton"), List = Query("AssetDropdownList");
        const SetOpen = (Open) => { List.hidden = !Open; DropButton.setAttribute("aria-expanded", String(Open)); if (Open) (List.querySelector('[aria-selected="true"]') || List.firstElementChild)?.focus(); };
        DropButton.addEventListener("click", () => SetOpen(List.hidden));
        List.addEventListener("click", (Event) => {
            const Option = Event.target.closest("[data-asset]");
            if (!Option) return;
            this.Select(Option.dataset.asset);
            this.FocusAsset(this.Selected);
            SetOpen(false);
        });
        List.addEventListener("keydown", (Event) => {
            const Options = [...List.querySelectorAll("[data-asset]")];
            const Index = Options.indexOf(document.activeElement);
            if (Event.key === "ArrowDown") { Options[Math.min(Options.length - 1, Index + 1)]?.focus(); Event.preventDefault(); }
            else if (Event.key === "ArrowUp") { Options[Math.max(0, Index - 1)]?.focus(); Event.preventDefault(); }
            else if (Event.key === "Enter" && Index >= 0) Options[Index].click();
            else if (Event.key === "Escape") { SetOpen(false); DropButton.focus(); }
        });
        document.addEventListener("pointerdown", (Event) => { if (!Event.target.closest("#AssetDropdown")) SetOpen(false); });

        // Pins + atlas pan/zoom
        const Backdrop = Query("Backdrop");
        let Drag = null;
        Backdrop.addEventListener("pointerdown", (Event) => {
            const Pin = Event.target.closest(".Pin");
            if (Pin) { this.Select(Pin.dataset.asset); return; }
            Drag = { X: Event.clientX, Y: Event.clientY };
            Backdrop.setPointerCapture(Event.pointerId);
            Backdrop.classList.add("Dragging");
        });
        Backdrop.addEventListener("pointermove", (Event) => {
            if (!Drag) return;
            this.View.X += Event.clientX - Drag.X;
            this.View.Y += Event.clientY - Drag.Y;
            Drag = { X: Event.clientX, Y: Event.clientY };
            this.ApplyView();
        });
        const EndDrag = () => { Drag = null; Backdrop.classList.remove("Dragging"); };
        Backdrop.addEventListener("pointerup", EndDrag);
        Backdrop.addEventListener("pointercancel", EndDrag);
        Backdrop.addEventListener("wheel", (Event) => {
            Event.preventDefault();
            const Factor = Math.exp(-Event.deltaY * 0.0015);
            const Old = this.View.Scale, Next = Math.min(4, Math.max(1, Old * Factor));
            this.View.X = Event.clientX - ((Event.clientX - this.View.X) / Old) * Next;
            this.View.Y = Event.clientY - ((Event.clientY - this.View.Y) / Old) * Next;
            this.View.Scale = Next;
            this.ApplyView();
        }, { passive: false });
        Query("Pins").addEventListener("keydown", (Event) => {
            if (Event.key === "Enter" || Event.key === " ") { const Pin = Event.target.closest(".Pin"); if (Pin) { this.Select(Pin.dataset.asset); Event.preventDefault(); } }
        });

        // Editor drawer
        const Drawer = Query("EditorDrawer"), EditButton = Query("EditButton");
        const SetDrawer = (Open) => { Drawer.hidden = !Open; EditButton.setAttribute("aria-expanded", String(Open)); };
        EditButton.addEventListener("click", () => SetDrawer(Drawer.hidden));
        Query("CloseDrawer").addEventListener("click", () => SetDrawer(false));
        let EditTimer;
        Query("DatasetText").addEventListener("input", (Event) => {
            clearTimeout(EditTimer);
            EditTimer = setTimeout(() => {
                try {
                    this.ApplyCatalogue(JSON.parse(Event.target.value), { UpdateEditor: false });
                    Query("DatasetError").textContent = "";
                } catch (Failure) { Query("DatasetError").textContent = Failure.message; }
            }, 300);
        });
        Query("ResetButton").addEventListener("click", () => { try { localStorage.removeItem(StorageKey); } catch { /* sandboxed */ } this.BackgroundOverride = null; this.ApplyCatalogue(structuredClone(DefaultCatalogue), { Persist: false }); Query("DatasetError").textContent = ""; });
        Query("ExportButton").addEventListener("click", () => {
            const Blob_ = new Blob([JSON.stringify(StripSynthesised(this.Catalogue), null, 2)], { type: "application/json" });
            const Link = document.createElement("a");
            Link.href = URL.createObjectURL(Blob_);
            Link.download = `${this.Catalogue.Title.replace(/\W+/g, "")}Catalogue.json`;
            Link.click();
            setTimeout(() => URL.revokeObjectURL(Link.href), 1000);
        });

        // Imports (buttons + drag and drop anywhere)
        Query("ImportDatasetButton").addEventListener("click", () => Query("DatasetInput").click());
        Query("ImportImageButton").addEventListener("click", () => Query("ImageInput").click());
        Query("DatasetInput").addEventListener("change", (Event) => { if (Event.target.files[0]) this.ImportFile(Event.target.files[0]); Event.target.value = ""; });
        Query("ImageInput").addEventListener("change", (Event) => { if (Event.target.files[0]) this.ImportFile(Event.target.files[0]); Event.target.value = ""; });
        const Veil = Query("DropVeil");
        const CarriesFiles = (Event) => [...(Event.dataTransfer?.types || [])].includes("Files");
        window.addEventListener("dragover", (Event) => { if (!CarriesFiles(Event)) return; Event.preventDefault(); Veil.hidden = false; });
        window.addEventListener("dragleave", (Event) => { if (!Event.relatedTarget) Veil.hidden = true; });
        window.addEventListener("drop", (Event) => { if (!CarriesFiles(Event)) return; Event.preventDefault(); Veil.hidden = true; const File_ = Event.dataTransfer.files[0]; if (File_) this.ImportFile(File_); });
        window.addEventListener("keydown", (Event) => {
            if ((Event.ctrlKey || Event.metaKey) && Event.key.toLowerCase() === "k") { Event.preventDefault(); this.Palette.IsOpen ? this.Palette.Close() : this.Palette.Open(); return; }
            if (this.Palette.IsOpen) return;
            if (Event.target.matches("input, textarea, [role='slider']")) return;
            if (Event.key === "Escape") { SetDrawer(false); SetOpen(false); }
            if (Event.ctrlKey || Event.metaKey || Event.altKey) return;
            if (/^[1-9]$/.test(Event.key) && Number(Event.key) <= this.Catalogue.Sections.length) { this.GoSection(Number(Event.key) - 1); return; }
            if (Event.key === "/") { Event.preventDefault(); Query("SearchInput").focus(); return; }
            if (Event.key.toLowerCase() === "c") { this.ToggleCompare(this.SelectedId); return; }
            if (Event.key.toLowerCase() === "l") { this.LocateAsset(this.SelectedId); return; }
            if (Event.key.toLowerCase() === "x") { this.ClearFilters(); return; }
            const Index = this.Assets.findIndex((Asset) => Asset.Id === this.SelectedId);
            if (Event.key === "ArrowRight" || Event.key === "ArrowLeft") {
                const Visible = this.Assets.filter((Asset) => this.Matches(Asset));
                if (!Visible.length) return;
                const Position = Math.max(0, Visible.findIndex((Asset) => Asset.Id === this.SelectedId));
                const Next = Visible[(Position + (Event.key === "ArrowRight" ? 1 : Visible.length - 1)) % Visible.length];
                this.Select(Next.Id);
                if (Index >= 0) this.FocusAsset(Next);
            }
        });
    }

    async ImportFile(File_) {
        if (File_.type.startsWith("image/")) {
            const Reader = new FileReader();
            Reader.onload = () => { this.BackgroundOverride = Reader.result; this.RenderAtlasBackground(); this.Toast("Background image applied", { Tone: "ok" }); };
            Reader.readAsDataURL(File_);
            return;
        }
        try {
            this.ApplyCatalogue(JSON.parse(await File_.text()));
            Query("DatasetError").textContent = "";
            this.Toast(`Loaded ${this.Assets.length} assets from ${File_.name}`, { Tone: "ok" });
        } catch (Failure) {
            Query("EditorDrawer").hidden = false;
            Query("EditButton").setAttribute("aria-expanded", "true");
            Query("DatasetError").textContent = `Import failed: ${Failure.message}`;
        }
    }
}

// ----------------------------------------------------------------- catalogue helpers
function ValidateCatalogue(C) {
    const Problems = [];
    if (!C || typeof C !== "object") return ["Catalogue must be an object"];
    for (const Key of ["Title", "Sections", "Categories", "Statuses", "Metrics", "Assets"]) if (C[Key] === undefined) Problems.push(`missing ${Key}`);
    if (Problems.length) return Problems;
    if (!Array.isArray(C.Assets) || !C.Assets.length) Problems.push("Assets must be a non-empty array");
    if (!Array.isArray(C.Metrics) || !C.Metrics.length) Problems.push("Metrics must be a non-empty array");
    if (!Array.isArray(C.Sections) || !C.Sections.length) Problems.push("Sections must be a non-empty array");
    (C.Assets || []).forEach((Asset, Index) => {
        for (const Key of ["Id", "Label", "Category", "Status"]) if (!Asset[Key]) Problems.push(`Assets[${Index}] missing ${Key}`);
        if (Asset.Atlas && (!Array.isArray(Asset.Atlas) || Asset.Atlas.length !== 2)) Problems.push(`Assets[${Index}].Atlas must be [u, v]`);
    });
    (C.Metrics || []).forEach((Metric, Index) => {
        for (const Key of ["Title", "Target", "High", "Low"]) if (Metric[Key] === undefined) Problems.push(`Metrics[${Index}] missing ${Key}`);
    });
    return Problems.slice(0, 4);
}

function StripSynthesised(C) {
    return { ...C, Metrics: C.Metrics.map((Metric) => (Metric.Synthesised ? (({ Series, Synthesised, ...Rest }) => Rest)(Metric) : Metric)) };
}

// Plausible metric trace: drifting baseline, noise, a couple of excursions above High and one dip.
function SynthesiseSeries(Metric) {
    const Random = SeededRandom(Metric.Seed ?? 3);
    const Count = Metric.Samples ?? 160;
    const Series = [];
    let Drift = Metric.Base ?? Metric.Target - 8;
    const Peaks = (Metric.PeakAt || [0.42, 0.79]).map((At) => [At, 0.03 + Random() * 0.02]);
    const Dips = (Metric.DipAt || [0.07]).map((At) => [At, 0.025]);
    for (let Index = 0; Index < Count; Index++) {
        const T = Index / (Count - 1);
        Drift += (Random() - 0.5) * 1.6 + ((Metric.Base ?? Metric.Target - 6) + T * 6 - Drift) * 0.05;
        let S = Drift + (Random() - 0.5) * 4;
        for (const [At, Width] of Peaks) S += Math.exp(-((T - At) ** 2) / (2 * Width * Width)) * (Metric.High - Metric.Target + 14);
        for (const [At, Width] of Dips) S -= Math.exp(-((T - At) ** 2) / (2 * Width * Width)) * 14;
        const Ceiling = Metric.Unit === "%" ? 100 : Infinity;
        const Knee = Ceiling - 9;
        if (S > Knee) S = Knee + 8.5 * Math.tanh((S - Knee) / 8.5);
        Series.push(Math.round(S * 10) / 10);
    }
    Metric.Synthesised = true;
    return Series;
}

function InterpolateAxis(Axis, T) {
    const Parse = (Label) => { const M = /^(\d{1,2}):(\d{2})$/.exec(Label); return M ? Number(M[1]) * 60 + Number(M[2]) : null; };
    const Start = Parse(Axis[0]), End = Parse(Axis[Axis.length - 1]);
    if (Start === null || End === null) return Axis[Math.round(T * (Axis.length - 1))];
    const Minutes = Math.round(Start + (End - Start) * T);
    return `${String(Math.floor(Minutes / 60)).padStart(2, "0")}:${String(Minutes % 60).padStart(2, "0")}`;
}

// ----------------------------------------------------------------- relief atlas
function ConstructNoise(Seed) {
    const Random = SeededRandom(Seed);
    const Size = 256, Lattice = new Float32Array(Size * Size);
    for (let Index = 0; Index < Lattice.length; Index++) Lattice[Index] = Random();
    const Smooth = (T) => T * T * (3 - 2 * T);
    return (X, Y) => {
        const Xi = Math.floor(X), Yi = Math.floor(Y), Fx = Smooth(X - Xi), Fy = Smooth(Y - Yi);
        const A = (Xi & 255) + (Yi & 255) * Size, B = ((Xi + 1) & 255) + (Yi & 255) * Size, C = (Xi & 255) + ((Yi + 1) & 255) * Size, D = ((Xi + 1) & 255) + ((Yi + 1) & 255) * Size;
        return (Lattice[A] * (1 - Fx) + Lattice[B] * Fx) * (1 - Fy) + (Lattice[C] * (1 - Fx) + Lattice[D] * Fx) * Fy;
    };
}

// Coastline running from upper-right to lower-left: land above, sea below.
function CoastAt(U, Seed) {
    const P = Seed * 0.37;
    return 0.85 - 0.28 * U + 0.045 * Math.sin(U * 8.5 + P) + 0.025 * Math.sin(U * 21 + P * 2) + 0.012 * Math.sin(U * 47 + P);
}

function PaintReliefAtlas(Canvas, Seed) {
    const Width = 1120, Height = 700;
    Canvas.width = Width; Canvas.height = Height;
    const Noise = ConstructNoise(Seed);
    const Heights = new Float32Array(Width * Height);
    const Land = new Uint8Array(Width * Height);
    for (let Y = 0; Y < Height; Y++) {
        const V = Y / Height;
        for (let X = 0; X < Width; X++) {
            const U = X / Width;
            const WarpX = Noise(U * 3.1 + 40, V * 3.1) * 0.9, WarpY = Noise(U * 3.1, V * 3.1 + 40) * 0.9;
            let Amplitude = 1, Frequency = 5, Sum = 0, Ridge = 0;
            for (let Octave = 0; Octave < 7; Octave++) {
                const N = Noise((U + WarpX * 0.12) * Frequency * 1.6 + Octave * 17.1, (V + WarpY * 0.12) * Frequency + Octave * 9.3);
                Sum += N * Amplitude;
                const R = 1 - Math.abs(N * 2 - 1);
                Ridge += R * R * Amplitude;
                Amplitude *= 0.52; Frequency *= 2.07;
            }
            const Coast = CoastAt(U, Seed) + (Sum - 1) * 0.05;
            const Inland = Coast - V; // > 0 on land
            const Index = Y * Width + X;
            Land[Index] = Inland > 0 ? 1 : 0;
            Heights[Index] = Inland > 0 ? Math.min(1, Inland * 3.2) * (0.35 + Ridge * 0.55) + Sum * 0.08 : Inland * 0.6 + Sum * 0.02;
        }
    }
    const Context = Canvas.getContext("2d");
    const Pixels = Context.createImageData(Width, Height);
    const P = Pixels.data;
    const Light = [-0.62, -0.55, 0.56];
    for (let Y = 0; Y < Height; Y++) {
        for (let X = 0; X < Width; X++) {
            const Index = Y * Width + X;
            const Hl = Heights[Index - (X > 0 ? 1 : 0)], Hr = Heights[Index + (X < Width - 1 ? 1 : 0)];
            const Hu = Heights[Index - (Y > 0 ? Width : 0)], Hd = Heights[Index + (Y < Height - 1 ? Width : 0)];
            const Dx = (Hr - Hl) * 60, Dy = (Hd - Hu) * 60;
            const Length = Math.hypot(Dx, Dy, 1);
            const Shade = Math.max(0, (-Dx * Light[0] - Dy * Light[1] + Light[2]) / Length);
            const O = Index * 4;
            if (Land[Index]) {
                const Grain = Noise(X * 0.9, Y * 0.9) * 0.1;
                const L = Math.min(1, 0.035 + Shade * Shade * 0.62 + Grain * 0.8 + Heights[Index] * 0.06);
                const C = Math.round(L * 255);
                P[O] = C; P[O + 1] = Math.round(C * 0.99); P[O + 2] = Math.round(C * 0.97);
            } else {
                const Depth = Math.max(0, Math.min(1, -Heights[Index] * 4));
                const Ripple = Noise(X * 0.05, Y * 0.08) * 0.03;
                P[O] = Math.round((0.16 - Depth * 0.07 + Ripple) * 255);
                P[O + 1] = Math.round((0.19 - Depth * 0.07 + Ripple) * 255);
                P[O + 2] = Math.round((0.22 - Depth * 0.07 + Ripple) * 255);
            }
            P[O + 3] = 255;
        }
    }
    Context.putImageData(Pixels, 0, 0);
}

// Coastal highway + dashed links between neighbouring assets (atlas viewBox 1000×625).
function ConstructRoutes(Assets, Seed) {
    let Coast = "";
    for (let Step = 0; Step <= 120; Step++) {
        const U = Step / 120;
        Coast += `${Step ? "L" : "M"}${(U * 1000).toFixed(1)} ${((CoastAt(U, Seed) - 0.028 - 0.006 * Math.sin(U * 33)) * 625).toFixed(1)}`;
    }
    const Placed = Assets.filter((Asset) => Asset.Atlas);
    let Links = "";
    const Seen = new Set();
    for (const Asset of Placed) {
        const Nearest = Placed.filter((Other) => Other !== Asset)
            .map((Other) => [Other, Math.hypot(Other.Atlas[0] - Asset.Atlas[0], (Other.Atlas[1] - Asset.Atlas[1]) * 0.625)])
            .sort((A, B) => A[1] - B[1]).slice(0, 1);
        for (const [Other] of Nearest) {
            const Key = [Asset.Id, Other.Id].sort().join("|");
            if (Seen.has(Key)) continue;
            Seen.add(Key);
            const [X1, Y1] = [Asset.Atlas[0] * 1000, Asset.Atlas[1] * 625], [X2, Y2] = [Other.Atlas[0] * 1000, Other.Atlas[1] * 625];
            const Mx = (X1 + X2) / 2 + (Y2 - Y1) * 0.18, My = (Y1 + Y2) / 2 - (X2 - X1) * 0.18;
            Links += `<path class="Minor" d="M${X1} ${Y1}Q${Mx} ${My} ${X2} ${Y2}"/>`;
        }
    }
    return `<path d="${Coast}"/>${Links}`;
}

new AssetInfographic().Start();
