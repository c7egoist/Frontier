// Infographic boards: one interactive board per nav section (Overview keeps the atlas).
// Each board exposes Render(App) → markup, optional Mount(App, Host) for pointer-driven widgets
// (drag, brush, measure) and Act(App, Name, Element, Event) for delegated clicks on [data-act].

import {
    Escape, Format, Tones, Glyph, Icons, ResolveLods, SeededRandom, ParseDay, Squarify, ArcPath, SparkPath,
    HeatColour, Clamp, Sum, BudgetTone, ComparePalette,
} from "./Kit.js";

// ----------------------------------------------------------------- shared bits
const Card = (Title, Body, { Span = 12, Hint = "", Tools = "", Class = "", Rows = "" } = {}) =>
    `<section class="Card ${Class}" style="--span:${Span}${Rows ? `;--rows:${Rows}` : ""}"><header class="CardHeader"><h3>${Title}</h3>${Hint ? `<span class="Hint">${Hint}</span>` : ""}<span class="Spacer"></span>${Tools}</header>${Body}</section>`;
const Segment = (Act, Options, Current, Label = "") =>
    `<div class="MiniSegment" role="group" ${Label ? `aria-label="${Escape(Label)}"` : ""}>${Options.map(([Value, Text]) => `<button data-act="${Act}" data-value="${Escape(Value)}" aria-pressed="${Value === Current}">${Text}</button>`).join("")}</div>`;
const Kpi = (Value, Label, { Decimals = 0, Suffix = "", Tone = "" } = {}) =>
    `<div class="Kpi"><b ${Tone ? `style="color:${Tone}"` : ""} data-count="${Value}" data-decimals="${Decimals}" data-suffix="${Escape(Suffix)}">${Number(Value).toFixed(Decimals)}${Escape(Suffix)}</b><span>${Escape(Label)}</span></div>`;
const Dot = (Colour) => `<i class="Dot" style="background:${Colour}"></i>`;
const StatusTone = (App, Asset) => Tones[App.Status(Asset.Status).Tone] || Tones.idle;
const Visible = (App, Options) => App.Assets.filter((Asset) => App.Matches(Asset, Options));
const PowerLabel = (Exponent) => (Exponent >= 6 ? `${10 ** (Exponent - 6)}M` : Exponent >= 3 ? `${10 ** (Exponent - 3)}k` : String(10 ** Exponent));
const Empty = (Text = "No assets match the current filters.") => `<p class="EmptyNote">${Escape(Text)}</p>`;

function MiniLods(Lods) {
    if (!Lods.length) return "";
    const Shown = Lods.slice(0, 8), Max = Math.log10(Math.max(10, Shown[0]));
    const Width = 80 / 8;
    return `<svg class="MiniLods" viewBox="0 0 80 18" aria-hidden="true">${Shown.map((Count, Level) => {
        const H = Math.max(1.5, (Math.log10(Math.max(1, Count)) / Max) * 16);
        return `<rect x="${Level * Width + 1}" y="${18 - H}" width="${Width - 2.5}" height="${H}" rx="1"/>`;
    }).join("")}</svg>`;
}

function Meter(Use, Label = "Budget") {
    const U = Use ?? 0;
    return `<div class="Meter" data-tip="${Escape(`${Label} ${Math.round(U * 100)}%`)}"><i style="width:${Clamp(U / 1.5, 0, 1) * 100}%;background:${BudgetTone(U)}"></i><b></b></div>`;
}

// ================================================================= Library
const SortKeys = [["Label", "Name"], ["Triangles", "Triangles"], ["TextureMb", "Texture"], ["BudgetUse", "Budget"], ["Updated", "Updated"]];

function SortAssets(Items, [Key, Direction]) {
    const Value = (Asset) => (Key === "Updated" ? ParseDay(Asset.Updated) : Key === "Label" ? String(Asset.Label).toLowerCase() : Asset[Key] ?? -1);
    return [...Items].sort((A, B) => { const X = Value(A), Y = Value(B); return (X < Y ? -1 : X > Y ? 1 : 0) * Direction; });
}

const Library = {
    Render(App) {
        const Prefs = App.BoardPrefs;
        const [SortKey, Direction] = Prefs.LibrarySort;
        const Items = SortAssets(Visible(App), Prefs.LibrarySort);
        const Toolbar = `<div class="BoardToolbar">
            ${Segment("library-mode", [["Grid", `${Icons.grid}Grid`], ["List", `${Icons.list}List`]], Prefs.LibraryMode, "Layout")}
            <div class="MiniSegment" role="group" aria-label="Sort">${SortKeys.map(([Key, Text]) => `<button data-act="library-sort" data-value="${Key}" aria-pressed="${SortKey === Key}">${Text}${SortKey === Key ? `<span class="SortArrow">${Direction > 0 ? "↑" : "↓"}</span>` : ""}</button>`).join("")}</div>
            <button class="Switch" data-act="library-group" aria-pressed="${Prefs.LibraryGroup}"><i></i>Group by category</button>
            <span class="Spacer"></span><span class="Hint">${Items.length} of ${App.Assets.length} assets</span></div>`;
        if (!Items.length) return Toolbar + Empty();
        const Groups = Prefs.LibraryGroup
            ? App.Catalogue.Categories.map((Category) => [Category, Items.filter((Asset) => Asset.Category === Category.Key)]).filter(([, Group]) => Group.length)
            : [[null, Items]];
        const MaxTriangles = Math.max(1, ...Items.map((Asset) => Asset.Triangles || 0));
        const MaxTexture = Math.max(1, ...Items.map((Asset) => Asset.TextureMb || 0));
        const Body = Groups.map(([Category, Group]) => {
            const Heading = Category ? `<h4 class="GroupHeading">${Dot(App.CategoryHue(Category.Key))}${Escape(Category.Label)}<span>${Group.length}</span></h4>` : "";
            if (Prefs.LibraryMode === "List") {
                return `${Heading}<div class="Ledger" role="list">${Group.map((Asset) => LedgerRow(App, Asset, MaxTriangles, MaxTexture)).join("")}</div>`;
            }
            return `${Heading}<div class="CardGrid">${Group.map((Asset) => AssetCard(App, Asset)).join("")}</div>`;
        }).join("");
        const LedgerHead = Prefs.LibraryMode === "List" ? `<div class="LedgerRow LedgerHead" aria-hidden="true"><span></span><span>Asset</span><span>Status</span><span>Triangles</span><span>Texture</span><span>Budget</span><span>Updated</span><span></span></div>` : "";
        return Toolbar + LedgerHead + Body;
    },
    Act(App, Name, Element) {
        const Prefs = App.BoardPrefs;
        if (Name === "library-mode") Prefs.LibraryMode = Element.dataset.value;
        else if (Name === "library-group") Prefs.LibraryGroup = !Prefs.LibraryGroup;
        else if (Name === "library-sort") {
            const Key = Element.dataset.value;
            Prefs.LibrarySort = Prefs.LibrarySort[0] === Key ? [Key, -Prefs.LibrarySort[1]] : [Key, Key === "Label" ? 1 : -1];
        } else return false;
        App.RenderBoard();
        return true;
    },
};

function AssetCard(App, Asset) {
    const Category = App.Category(Asset.Category), Status = App.Status(Asset.Status);
    const [ToneA, ToneB] = Asset.Tones || Category.Tones || ["#8c9a86", "#3a3f3a"];
    const Compared = App.Compare.includes(Asset.Id);
    return `<article class="AssetCard" data-act="select" data-asset="${Escape(Asset.Id)}" aria-current="${Asset.Id === App.SelectedId}" tabindex="0" style="--tone-a:${ToneA};--tone-b:${ToneB}">
        <div class="CardArt">${Glyph(Asset.Icon || Category.Icon)}
            <span class="StatusBadge" style="--dot:${Tones[Status.Tone] || Tones.idle}"><i></i>${Escape(Status.Label)}</span>
            <button class="Star" data-act="compare" data-asset="${Escape(Asset.Id)}" aria-pressed="${Compared}" aria-label="Compare ${Escape(Asset.Label)}" data-tip="${Compared ? "Remove from compare" : "Add to compare"}">${Icons.star}</button>
        </div>
        <div class="CardBody">
            <b>${Escape(Asset.Label)}</b><small>${Escape(Asset.Id)} · ${Escape(Category.Label)}</small>
            <div class="CardStrip">${MiniLods(ResolveLods(Asset))}${Meter(Asset.BudgetUse)}</div>
            <div class="CardFacts"><span>${Format(Asset.Triangles || 0)} tris</span><span>${Asset.TextureMb ?? "—"} MB</span><span>×${Asset.Instances ?? 0}</span></div>
        </div></article>`;
}

function LedgerRow(App, Asset, MaxTriangles, MaxTexture) {
    const Category = App.Category(Asset.Category), Status = App.Status(Asset.Status);
    const Compared = App.Compare.includes(Asset.Id);
    return `<div class="LedgerRow" role="listitem" data-act="select" data-asset="${Escape(Asset.Id)}" aria-current="${Asset.Id === App.SelectedId}" tabindex="0">
        <span class="LedgerGlyph" style="color:${App.CategoryHue(Asset.Category)}">${Glyph(Asset.Icon || Category.Icon)}</span>
        <span class="LedgerName"><b>${Escape(Asset.Label)}</b><small>${Escape(Asset.Id)} · ${Escape(Category.Label)}</small></span>
        <span class="StatusBadge" style="--dot:${Tones[Status.Tone] || Tones.idle}"><i></i>${Escape(Status.Label)}</span>
        <span class="InlineBar"><i style="width:${((Asset.Triangles || 0) / MaxTriangles) * 100}%"></i><em>${Format(Asset.Triangles || 0)}</em></span>
        <span class="InlineBar"><i style="width:${((Asset.TextureMb || 0) / MaxTexture) * 100}%"></i><em>${Asset.TextureMb ?? "—"} MB</em></span>
        <span>${Meter(Asset.BudgetUse)}</span>
        <span class="Muted">${Escape(Asset.Updated || "—")}</span>
        <button class="Star" data-act="compare" data-asset="${Escape(Asset.Id)}" aria-pressed="${Compared}" aria-label="Compare ${Escape(Asset.Label)}">${Icons.star}</button>
    </div>`;
}

// ================================================================= Budgets
function SemiGauge(Used, Budget, Caption, Unit) {
    const U = Budget ? Used / Budget : 0;
    const Cx = 100, Cy = 104, R = 84, Width = 14, Start = Math.PI;
    const Track = ArcPath(Cx, Cy, R - Width, R, Start, Start + Math.PI);
    const Fill = ArcPath(Cx, Cy, R - Width, R, Start, Start + Math.PI * Clamp(U, 0.0001, 1));
    const Over = U > 1 ? ArcPath(Cx, Cy, R - Width, R, Start + Math.PI * Math.max(0, 2 - U), Start + Math.PI) : "";
    const Ticks = [0, 0.25, 0.5, 0.75, 1].map((T) => {
        const A = Start + Math.PI * T, X0 = Cx + (R + 4) * Math.cos(A), Y0 = Cy + (R + 4) * Math.sin(A), X1 = Cx + (R + 9) * Math.cos(A), Y1 = Cy + (R + 9) * Math.sin(A);
        return `<line class="Tick" x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y1}"/>`;
    }).join("");
    const WarnAngle = Start + Math.PI * 0.85;
    return `<svg class="SemiGauge" viewBox="-6 6 212 112" role="img" aria-label="${Escape(Caption)} ${Math.round(U * 100)} percent of budget">
        <path class="Track" d="${Track}"/>
        <path class="Fill" d="${Fill}" style="fill:${U > 1 ? "#f0f0f0" : U > 0.85 ? Tones.warn : "#f0f0f0"}"/>
        ${Over ? `<path d="${Over}" style="fill:${Tones.bad}"/>` : ""}
        ${Ticks}<line class="Tick Warn" x1="${Cx + (R - Width - 3) * Math.cos(WarnAngle)}" y1="${Cy + (R - Width - 3) * Math.sin(WarnAngle)}" x2="${Cx + (R + 3) * Math.cos(WarnAngle)}" y2="${Cy + (R + 3) * Math.sin(WarnAngle)}"/>
        <text class="GaugeValue" x="${Cx}" y="${Cy - 18}" text-anchor="middle">${Math.round(U * 100)}%</text>
        <text class="GaugeCaption" x="${Cx}" y="${Cy}" text-anchor="middle">${Escape(Unit(Used))} of ${Escape(Unit(Budget))}</text>
    </svg>`;
}

const TreemapMetrics = [["TextureMb", "Texture"], ["Triangles", "Triangles"], ["Scene", "Scene cost"]];
const TreemapValue = (Asset, Metric) => (Metric === "Scene" ? (Asset.Triangles || 0) * Math.max(1, Asset.Instances || 1) : Asset[Metric] || 0);
const TreemapFormat = (V, Metric) => (Metric === "TextureMb" ? `${Format(V)} MB` : `${Format(V)} tris`);

const Budgets = {
    Render(App) {
        const B = App.Budgets, Prefs = App.BoardPrefs;
        const TextureUsed = Sum(App.Assets, (Asset) => Asset.TextureMb), TriangleUsed = Sum(App.Assets, (Asset) => Asset.Triangles);
        const Slider = (Key, Value, Min, Max, Step) => `<label class="Slider"><span>Budget</span><input type="range" data-budget="${Key}" min="${Min}" max="${Max}" step="${Step}" value="${Value}" aria-label="${Key} budget"><output>${Key === "TextureMb" ? `${Value} MB` : Format(Value)}</output></label>`;
        const TextureGauge = Card("Texture memory", `<div class="GaugeSlot" data-gauge="TextureMb">${SemiGauge(TextureUsed, B.TextureMb, "Texture memory", (V) => `${Math.round(V)} MB`)}</div>${Slider("TextureMb", B.TextureMb, Math.round(TextureUsed * 0.5 / 10) * 10, Math.round(TextureUsed * 2 / 10) * 10, 10)}`, { Span: 6, Hint: "all assets" });
        const TriangleGauge = Card("Source triangles", `<div class="GaugeSlot" data-gauge="Triangles">${SemiGauge(TriangleUsed, B.Triangles, "Source triangles", Format)}</div>${Slider("Triangles", B.Triangles, Math.round(TriangleUsed * 0.5 / 1e4) * 1e4, Math.round(TriangleUsed * 2 / 1e4) * 1e4, 1e4)}`, { Span: 6, Hint: "level 0" });

        const Rows = App.Catalogue.Categories.map((Category) => {
            const Used = Sum(App.Assets.filter((Asset) => Asset.Category === Category.Key), (Asset) => Asset.TextureMb);
            return { Category, Used, Budget: B.Categories[Category.Key] };
        });
        const ScaleMax = Math.max(1, ...Rows.map((Row) => Math.max(Row.Used, Row.Budget))) * 1.3;
        const Bullets = `<div class="Bullets" data-scale="${ScaleMax}">${Rows.map(({ Category, Used, Budget }) => {
            const U = Budget ? Used / Budget : 0;
            return `<div class="Bullet" data-category="${Escape(Category.Key)}">
                <span class="BulletLabel">${Dot(App.CategoryHue(Category.Key))}${Escape(Category.Label)}</span>
                <div class="BulletTrack" data-tip="${Escape(`${Category.Label}\nDrag the marker to set the budget`)}">
                    <i class="BulletBand" style="width:${(Budget * 0.85 / ScaleMax) * 100}%"></i>
                    <i class="BulletFill" style="width:${(Used / ScaleMax) * 100}%;background:${BudgetTone(U)}"></i>
                    <span class="BulletMarker" style="left:${(Budget / ScaleMax) * 100}%" role="slider" tabindex="0" aria-label="${Escape(Category.Label)} budget" aria-valuenow="${Budget}" aria-valuemin="0" aria-valuemax="${Math.round(ScaleMax)}"></span>
                </div>
                <span class="BulletValue"><b style="color:${BudgetTone(U)}">${Math.round(U * 100)}%</b> ${Math.round(Used)} / <em>${Math.round(Budget)}</em> MB</span>
            </div>`;
        }).join("")}</div>`;
        const BulletCard = Card("Category budgets", Bullets, { Span: 12, Hint: "texture MB · drag markers or use ← →" });

        const Treemap = Card("Footprint treemap", `<div class="Treemap" aria-label="Treemap of assets"></div>`, {
            Span: 12, Class: "TreemapCard", Hint: "area = value · click a tile to select",
            Tools: Segment("treemap-metric", TreemapMetrics, Prefs.TreemapMetric, "Treemap value"),
        });

        const Offenders = Visible(App).filter((Asset) => Asset.BudgetUse !== undefined).sort((A, Z) => Z.BudgetUse - A.BudgetUse).slice(0, 6);
        const OffenderList = Offenders.length ? `<ol class="Offenders">${Offenders.map((Asset, Index) => `<li data-act="select" data-asset="${Escape(Asset.Id)}" aria-current="${Asset.Id === App.SelectedId}">
            <span class="Rank">${Index + 1}</span><span class="OffenderName">${Escape(Asset.Label)}<small>${Escape(App.Category(Asset.Category).Label)}</small></span>
            <span class="OffenderBar"><i style="width:${Clamp(Asset.BudgetUse / 1.5, 0, 1) * 100}%;background:${BudgetTone(Asset.BudgetUse)}"></i><b style="left:${100 / 1.5}%"></b></span>
            <span class="OffenderValue" style="color:${BudgetTone(Asset.BudgetUse)}">${Math.round(Asset.BudgetUse * 100)}%</span></li>`).join("")}</ol>` : Empty();
        const OffenderCard = Card("Top budget users", OffenderList, { Span: 7, Hint: "line = 100%" });

        const Kpis = Card("At a glance", `<div class="KpiGrid">
            ${Kpi(App.Assets.filter((Asset) => (Asset.BudgetUse ?? 0) > 1).length, "over budget", { Tone: Tones.bad })}
            ${Kpi(App.Assets.filter((Asset) => (Asset.BudgetUse ?? 0) > 0.85 && (Asset.BudgetUse ?? 0) <= 1).length, "near budget", { Tone: Tones.warn })}
            ${Kpi(B.TextureMb - TextureUsed, "MB headroom", { Tone: B.TextureMb - TextureUsed < 0 ? Tones.bad : "" })}
            ${Kpi(Sum(App.Assets, (Asset) => Asset.BudgetUse ?? 0) / App.Assets.length * 100, "mean use", { Suffix: "%" })}
        </div>`, { Span: 5 });
        return `<div class="BoardGrid">${TextureGauge}${TriangleGauge}${BulletCard}${Treemap}${OffenderCard}${Kpis}</div>`;
    },

    Mount(App, Host) {
        // Global budget sliders: live gauge update, persist on release.
        for (const Input of Host.querySelectorAll("input[data-budget]")) {
            const Key = Input.dataset.budget;
            Input.addEventListener("input", () => {
                App.Budgets[Key] = Number(Input.value);
                const Used = Sum(App.Assets, (Asset) => Asset[Key]);
                Host.querySelector(`[data-gauge="${Key}"]`).innerHTML = Key === "TextureMb"
                    ? SemiGauge(Used, App.Budgets[Key], "Texture memory", (V) => `${Math.round(V)} MB`)
                    : SemiGauge(Used, App.Budgets[Key], "Source triangles", Format);
                Input.nextElementSibling.textContent = Key === "TextureMb" ? `${Input.value} MB` : Format(Number(Input.value));
            });
            Input.addEventListener("change", () => { App.Commit({ Render: false }); App.RenderComposition(); App.RenderBoard(); });
        }

        // Draggable bullet markers (pointer + keyboard).
        const Scale = Number(Host.querySelector(".Bullets")?.dataset.scale || 1);
        for (const Row of Host.querySelectorAll(".Bullet")) {
            const Key = Row.dataset.category, Track = Row.querySelector(".BulletTrack"), Marker = Row.querySelector(".BulletMarker");
            const Used = Sum(App.Assets.filter((Asset) => Asset.Category === Key), (Asset) => Asset.TextureMb);
            const Apply = (Budget) => {
                Budget = Math.max(5, Math.round(Budget / 5) * 5);
                App.Budgets.Categories[Key] = Budget;
                const U = Used / Budget;
                Marker.style.left = `${Clamp(Budget / Scale, 0, 1) * 100}%`;
                Marker.setAttribute("aria-valuenow", String(Budget));
                Row.querySelector(".BulletBand").style.width = `${Clamp(Budget * 0.85 / Scale, 0, 1) * 100}%`;
                Row.querySelector(".BulletFill").style.background = BudgetTone(U);
                Row.querySelector(".BulletValue").innerHTML = `<b style="color:${BudgetTone(U)}">${Math.round(U * 100)}%</b> ${Math.round(Used)} / <em>${Budget}</em> MB`;
            };
            const FromPointer = (Event) => { const Rect = Track.getBoundingClientRect(); Apply(Clamp((Event.clientX - Rect.left) / Rect.width, 0, 1) * Scale); };
            let Dragging = false;
            Track.addEventListener("pointerdown", (Event) => { Dragging = true; Track.setPointerCapture(Event.pointerId); Row.classList.add("Active"); FromPointer(Event); Event.preventDefault(); });
            Track.addEventListener("pointermove", (Event) => { if (Dragging) FromPointer(Event); });
            const End = () => { if (!Dragging) return; Dragging = false; Row.classList.remove("Active"); App.Commit({ Render: false }); App.RenderComposition(); };
            Track.addEventListener("pointerup", End);
            Track.addEventListener("pointercancel", End);
            Marker.addEventListener("keydown", (Event) => {
                if (Event.key !== "ArrowLeft" && Event.key !== "ArrowRight") return;
                Apply(App.Budgets.Categories[Key] + (Event.key === "ArrowRight" ? 5 : -5));
                App.Commit({ Render: false });
                Event.preventDefault();
                Event.stopPropagation();
            });
        }

        // Treemap needs real pixel size.
        const Box = Host.querySelector(".Treemap");
        if (Box) {
            const Metric = App.BoardPrefs.TreemapMetric;
            const Items = Visible(App).map((Asset) => ({ Asset, Value: TreemapValue(Asset, Metric) }));
            const Total = Sum(Items, (Item) => Item.Value);
            const Tiles = Squarify(Items, 0, 0, Box.clientWidth, Box.clientHeight);
            Box.innerHTML = Tiles.map(({ Item, X, Y, W, H }) => {
                const Asset = Item.Asset, Share = Total ? (Item.Value / Total) * 100 : 0;
                const Roomy = W > 86 && H > 44, Tiny = W < 40 || H < 26;
                return `<button class="Tile" data-act="select" data-asset="${Escape(Asset.Id)}" aria-current="${Asset.Id === App.SelectedId}" style="left:${X}px;top:${Y}px;width:${W}px;height:${H}px;--hue:${App.CategoryHue(Asset.Category)};--status:${StatusTone(App, Asset)}"
                    data-tip="${Escape(`${Asset.Label}\n${TreemapFormat(Item.Value, Metric)} · ${Share.toFixed(1)}% of shown\n${App.Category(Asset.Category).Label} · ${App.Status(Asset.Status).Label}`)}">
                    ${Tiny ? "" : `<span class="TileLabel">${Escape(Asset.Label)}</span>`}${Roomy ? `<span class="TileValue">${TreemapFormat(Item.Value, Metric)} · ${Share.toFixed(0)}%</span>` : ""}
                    ${(Asset.BudgetUse ?? 0) > 1 ? '<i class="TileFlag"></i>' : ""}</button>`;
            }).join("") || Empty();
        }
    },

    Act(App, Name, Element) {
        if (Name !== "treemap-metric") return false;
        App.BoardPrefs.TreemapMetric = Element.dataset.value;
        App.RenderBoard();
        return true;
    },
};

// ================================================================= Analytics
const RadarAxes = [
    ["Triangles", (Asset) => Math.log10(Math.max(1, Asset.Triangles || 1))],
    ["Texture", (Asset) => Asset.TextureMb || 0],
    ["Materials", (Asset) => Asset.Materials || 0],
    ["Instances", (Asset) => Math.log10((Asset.Instances || 0) + 1)],
    ["LOD depth", (Asset) => ResolveLods(Asset).length],
    ["Budget", (Asset) => Asset.BudgetUse || 0],
];

function StreamingHeat(Seed, Mode) {
    const Random = SeededRandom(Seed * 31 + (Mode === "Misses" ? 7 : 1));
    const Cells = [];
    for (let Day = 0; Day < 7; Day++) {
        const Weekend = Day >= 5;
        for (let Hour = 0; Hour < 24; Hour++) {
            const Midday = Math.exp(-((Hour - 13) ** 2) / 18), Evening = Math.exp(-((Hour - (Weekend ? 21 : 20.5)) ** 2) / (Weekend ? 12 : 7));
            let V = 0.12 + 0.5 * Midday * (Weekend ? 0.8 : 1) + 0.8 * Evening * (Weekend ? 1.25 : 1);
            if (Mode === "Misses") V = 0.08 + V * V * 0.55 + (Random() < 0.05 ? 0.45 : 0);
            Cells.push(Math.max(0, V + (Random() - 0.5) * 0.12));
        }
    }
    const Max = Math.max(...Cells);
    return Cells.map((V) => V / Max);
}

const Analytics = {
    Render(App) {
        const Prefs = App.BoardPrefs;
        const Assets = Visible(App, { IgnoreCategory: true });

        // Donut: triangles by category.
        const Slices = App.Catalogue.Categories.map((Category) => ({ Category, Value: Sum(Assets.filter((Asset) => Asset.Category === Category.Key), (Asset) => Asset.Triangles) })).filter((Slice) => Slice.Value > 0);
        const Total = Sum(Slices, (Slice) => Slice.Value);
        let Angle = -Math.PI / 2;
        const Arcs = Slices.map(({ Category, Value }) => {
            const Span = (Value / Total) * Math.PI * 2, A0 = Angle + 0.012, A1 = Angle + Span - 0.012;
            Angle += Span;
            const Mid = (A0 + A1) / 2, Active = App.CategoryFilter === Category.Key;
            return `<path class="Slice" d="${ArcPath(110, 110, Active ? 60 : 64, Active ? 100 : 94, A0, A1)}" style="fill:${App.CategoryHue(Category.Key)};--dx:${Math.cos(Mid) * 5}px;--dy:${Math.sin(Mid) * 5}px" data-act="filter-category" data-category="${Escape(Category.Key)}" aria-pressed="${Active}"
                data-tip="${Escape(`${Category.Label}\n${Format(Value)} triangles · ${((Value / Total) * 100).toFixed(1)}%\nClick to filter`)}"/>`;
        }).join("");
        const Donut = Card("Triangles by category", Slices.length ? `<div class="DonutWrap"><svg class="Donut" viewBox="0 0 220 220" role="img" aria-label="Triangles by category">${Arcs}
                <text x="110" y="106" text-anchor="middle" class="DonutValue">${Format(Total)}</text><text x="110" y="128" text-anchor="middle" class="DonutCaption">triangles</text></svg>
            <ul class="DonutLegend">${Slices.map(({ Category, Value }) => `<li data-act="filter-category" data-category="${Escape(Category.Key)}" aria-pressed="${App.CategoryFilter === Category.Key}">${Dot(App.CategoryHue(Category.Key))}<span>${Escape(Category.Label)}</span><b>${((Value / Total) * 100).toFixed(0)}%</b></li>`).join("")}</ul></div>` : Empty(), { Span: 5 });

        // Bubble scatter: triangles (log) × texture, radius = instances.
        const Points = Visible(App, { IgnoreBrush: true });
        const W = 440, H = 270, L = 38, R = 12, T = 14, B = 30;
        const LogMin = Math.floor(Math.log10(Math.max(1, Math.min(...Points.map((Asset) => Asset.Triangles || 1))))), LogMax = Math.ceil(Math.log10(Math.max(10, ...Points.map((Asset) => Asset.Triangles || 1)))) || LogMin + 1;
        const TexMax = Math.max(10, ...Points.map((Asset) => Asset.TextureMb || 0)) * 1.1, InstMax = Math.sqrt(Math.max(1, ...Points.map((Asset) => Asset.Instances || 0)));
        const X = (Asset) => L + ((Math.log10(Math.max(1, Asset.Triangles || 1)) - LogMin) / Math.max(1, LogMax - LogMin)) * (W - L - R);
        const Y = (Asset) => H - B - ((Asset.TextureMb || 0) / TexMax) * (H - T - B);
        const XTicks = Array.from({ length: LogMax - LogMin + 1 }, (_, Index) => LogMin + Index);
        const YTicks = [0, 0.25, 0.5, 0.75, 1].map((F) => Math.round(TexMax * F));
        const Bubbles = Points.map((Asset) => {
            const In = !App.Brush || App.Brush.has(Asset.Id);
            const Radius = 4 + (Math.sqrt(Asset.Instances || 0) / InstMax) * 18;
            return `<circle class="Bubble ${In ? "" : "Out"}" data-act="select" data-asset="${Escape(Asset.Id)}" cx="${X(Asset).toFixed(1)}" cy="${Y(Asset).toFixed(1)}" r="${Radius.toFixed(1)}" aria-current="${Asset.Id === App.SelectedId}" style="--fill:${App.CategoryHue(Asset.Category)}"
                data-tip="${Escape(`${Asset.Label}\n${Format(Asset.Triangles || 0)} tris · ${Asset.TextureMb ?? 0} MB · ×${Asset.Instances ?? 0}`)}"/>`;
        }).sort((A, Z) => (A.includes('aria-current="true"') ? 1 : 0) - (Z.includes('aria-current="true"') ? 1 : 0)).join("");
        const Scatter = Card("Asset footprint", `<div class="ScatterWrap"><svg class="Scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Triangles versus texture memory">
                ${YTicks.map((V) => `<line class="Grid" x1="${L}" x2="${W - R}" y1="${H - B - (V / TexMax) * (H - T - B)}" y2="${H - B - (V / TexMax) * (H - T - B)}"/><text x="${L - 8}" y="${H - B - (V / TexMax) * (H - T - B) + 4}" text-anchor="end">${V}</text>`).join("")}
                ${XTicks.map((V) => `<text x="${L + ((V - LogMin) / Math.max(1, LogMax - LogMin)) * (W - L - R)}" y="${H - 10}" text-anchor="middle">${PowerLabel(V)}</text>`).join("")}
                <text x="${W - R}" y="${H - B - 6}" text-anchor="end" class="AxisName">triangles →</text><text x="${L + 6}" y="${T + 10}" class="AxisName">↑ texture MB</text>
                ${Bubbles}<rect class="BrushRect" hidden/></svg></div>`, {
            Span: 7, Hint: App.Brush ? "" : "drag to brush-select",
            Tools: App.Brush ? `<button class="Chip" data-act="clear-brush">${App.Brush.size} brushed ${Icons.close}</button>` : "",
        });

        // Heatmap
        const Heat = StreamingHeat(App.Catalogue.AtlasSeed ?? 7, Prefs.HeatMode);
        const Days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const Describe = (V) => (Prefs.HeatMode === "Misses" ? `${(V * 9).toFixed(1)}% cache misses` : `${Format(Math.round(V * 2400))} requests/s`);
        const PeakIndex = Heat.indexOf(Math.max(...Heat));
        const HeatCard = Card("Streaming load", `<div class="Heatmap">
                <span></span>${Array.from({ length: 24 }, (_, Hour) => `<span class="HeatHour">${Hour % 3 === 0 ? String(Hour).padStart(2, "0") : ""}</span>`).join("")}
                ${Days.map((Day, Row) => `<span class="HeatDay">${Day}</span>${Array.from({ length: 24 }, (_, Hour) => { const V = Heat[Row * 24 + Hour]; return `<i data-row="${Row}" data-col="${Hour}" class="${Row * 24 + Hour === PeakIndex ? "Peak" : ""}" style="background:${HeatColour(V)}" data-tip="${Escape(`${Day} ${String(Hour).padStart(2, "0")}:00\n${Describe(V)}`)}"></i>`; }).join("")}`).join("")}
            </div><div class="HeatScale"><span>low</span><i></i><span>peak</span><span class="Spacer"></span><span class="Hint">Peak: ${Days[Math.floor(PeakIndex / 24)]} ${String(PeakIndex % 24).padStart(2, "0")}:00 · ${Describe(1)}</span></div>`, {
            Span: 12, Hint: "last 7 days · hover a cell",
            Tools: Segment("heat-mode", [["Requests", "Requests"], ["Misses", "Cache misses"]], Prefs.HeatMode, "Heatmap measure"),
        });

        // Radar
        const Subjects = (App.Compare.length ? App.Compare : [App.SelectedId]).map((Id) => App.Assets.find((Asset) => Asset.Id === Id)).filter(Boolean);
        const Ranges = RadarAxes.map(([, Pick]) => { const Values = App.Assets.map(Pick); return [Math.min(...Values), Math.max(...Values)]; });
        const Normal = (Asset, Index) => { const [Lo, Hi] = Ranges[Index]; return 0.12 + 0.88 * (Hi > Lo ? (RadarAxes[Index][1](Asset) - Lo) / (Hi - Lo) : 0.5); };
        const Cx = 150, Cy = 128, Radius = 92;
        const Point = (Index, V) => { const A = -Math.PI / 2 + (Index / RadarAxes.length) * Math.PI * 2; return [Cx + Math.cos(A) * Radius * V, Cy + Math.sin(A) * Radius * V]; };
        const Polygon = (Values) => Values.map((V, Index) => Point(Index, V).map((N) => N.toFixed(1)).join(",")).join(" ");
        let Average = null;
        if (Subjects.length === 1) {
            const Peers = App.Assets.filter((Asset) => Asset.Category === Subjects[0].Category);
            Average = RadarAxes.map((_, Index) => Sum(Peers, (Asset) => Normal(Asset, Index)) / Peers.length);
        }
        const Radar = Card("Compare", `<div class="RadarWrap"><svg class="Radar" viewBox="0 0 300 256" role="img" aria-label="Radar comparison">
                ${[0.25, 0.5, 0.75, 1].map((Ring) => `<polygon class="Ring" points="${Polygon(RadarAxes.map(() => Ring))}"/>`).join("")}
                ${RadarAxes.map(([Name], Index) => { const [X1, Y1] = Point(Index, 1), [LX, LY] = Point(Index, 1.2); return `<line class="Spoke" x1="${Cx}" y1="${Cy}" x2="${X1}" y2="${Y1}"/><text x="${LX}" y="${LY + 4}" text-anchor="middle">${Name}</text>`; }).join("")}
                ${Average ? `<polygon class="Average" points="${Polygon(Average)}"/>` : ""}
                ${Subjects.map((Asset, Index) => `<polygon class="Subject" points="${Polygon(RadarAxes.map((_, Axis) => Normal(Asset, Axis)))}" style="--c:${ComparePalette[Index % 4]}"/>${RadarAxes.map((_, Axis) => { const [PX, PY] = Point(Axis, Normal(Asset, Axis)); return `<circle cx="${PX}" cy="${PY}" r="3" style="fill:${ComparePalette[Index % 4]}" data-tip="${Escape(`${Asset.Label}\n${RadarAxes[Axis][0]}`)}"/>`; }).join("")}`).join("")}
            </svg>
            <ul class="RadarLegend">${Subjects.map((Asset, Index) => `<li>${Dot(ComparePalette[Index % 4])}<span data-act="select" data-asset="${Escape(Asset.Id)}">${Escape(Asset.Label)}</span>${App.Compare.includes(Asset.Id) ? `<button class="IconButton" data-act="compare" data-asset="${Escape(Asset.Id)}" aria-label="Remove ${Escape(Asset.Label)}">${Icons.close}</button>` : ""}</li>`).join("")}
                ${Average ? `<li class="Muted"><i class="Dot Dashed"></i>${Escape(App.Category(Subjects[0].Category).Label)} average</li>` : ""}
                ${App.Compare.length < 4 ? `<li class="Muted Small">${App.Compare.length ? "Add up to 4 with ☆" : "Star assets (☆ / C) to compare"}</li>` : ""}</ul></div>`, { Span: 6, Hint: "normalised to catalogue range" });

        // LOD reduction curves (log scale)
        const Curves = Visible(App).map((Asset) => ({ Asset, Lods: ResolveLods(Asset) })).filter((Entry) => Entry.Lods.length > 1);
        const CW = 300, CH = 256, CL = 40, CR = 10, CT = 14, CB = 30;
        const MaxLevel = Math.max(1, ...Curves.map((Entry) => Entry.Lods.length - 1));
        const AllCounts = Curves.flatMap((Entry) => Entry.Lods).filter((V) => V > 0);
        const YLo = Math.floor(Math.log10(Math.max(1, Math.min(...AllCounts, 1e9)))), YHi = Math.ceil(Math.log10(Math.max(10, ...AllCounts)));
        const PX = (Level) => CL + (Level / MaxLevel) * (CW - CL - CR), PY = (V) => CH - CB - ((Math.log10(Math.max(1, V)) - YLo) / Math.max(1, YHi - YLo)) * (CH - CT - CB);
        const Highlight = new Set([App.SelectedId, ...App.Compare]);
        const CurvePaths = Curves.sort((A, Z) => Number(Highlight.has(A.Asset.Id)) - Number(Highlight.has(Z.Asset.Id))).map(({ Asset, Lods }) => {
            const D = Lods.map((V, Level) => `${Level ? "L" : "M"}${PX(Level).toFixed(1)} ${PY(V).toFixed(1)}`).join("");
            const CompareIndex = App.Compare.indexOf(Asset.Id);
            const Colour = CompareIndex >= 0 ? ComparePalette[CompareIndex % 4] : Asset.Id === App.SelectedId ? "#fff" : null;
            return `<g class="Curve ${Colour ? "Hot" : ""}" data-act="select" data-asset="${Escape(Asset.Id)}" data-tip="${Escape(`${Asset.Label}\n${Lods.length} levels · ${Format(Lods[0])} → ${Format(Lods[Lods.length - 1])}`)}"><path class="Hit" d="${D}"/><path class="Line" d="${D}" ${Colour ? `style="stroke:${Colour}"` : ""}/></g>`;
        }).join("");
        const CurveCard = Card("LOD reduction", Curves.length ? `<svg class="CurvesChart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Triangles per LOD level">
                ${Array.from({ length: YHi - YLo + 1 }, (_, Index) => YLo + Index).map((E) => `<line class="Grid" x1="${CL}" x2="${CW - CR}" y1="${PY(10 ** E)}" y2="${PY(10 ** E)}"/><text x="${CL - 6}" y="${PY(10 ** E) + 4}" text-anchor="end">${Format(10 ** E)}</text>`).join("")}
                ${Array.from({ length: MaxLevel + 1 }, (_, Level) => (Level % 2 === 0 ? `<text x="${PX(Level)}" y="${CH - 10}" text-anchor="middle">L${Level}</text>` : "")).join("")}
                ${CurvePaths}</svg>` : Empty("No LOD chains to plot."), { Span: 6, Hint: "triangles per level · log" });

        return `<div class="BoardGrid">${Donut}${Scatter}${HeatCard}${Radar}${CurveCard}</div>`;
    },

    Mount(App, Host) {
        // Brush selection on the scatter.
        const Svg = Host.querySelector(".Scatter");
        if (Svg) {
            const Rect = Svg.querySelector(".BrushRect");
            const Local = (Event) => { const P = Svg.createSVGPoint(); P.x = Event.clientX; P.y = Event.clientY; return P.matrixTransform(Svg.getScreenCTM().inverse()); };
            let Origin = null;
            Svg.addEventListener("pointerdown", (Event) => {
                if (Event.target.closest(".Bubble")) return;
                Origin = Local(Event);
                Svg.setPointerCapture(Event.pointerId);
                Rect.removeAttribute("hidden");
                for (const [Key, V] of Object.entries({ x: Origin.x, y: Origin.y, width: 0, height: 0 })) Rect.setAttribute(Key, V);
            });
            Svg.addEventListener("pointermove", (Event) => {
                if (!Origin) return;
                const P = Local(Event);
                Rect.setAttribute("x", Math.min(P.x, Origin.x)); Rect.setAttribute("y", Math.min(P.y, Origin.y));
                Rect.setAttribute("width", Math.abs(P.x - Origin.x)); Rect.setAttribute("height", Math.abs(P.y - Origin.y));
            });
            const End = () => {
                if (!Origin) return;
                Origin = null;
                const X = Number(Rect.getAttribute("x")), Y = Number(Rect.getAttribute("y")), W = Number(Rect.getAttribute("width")), H = Number(Rect.getAttribute("height"));
                Rect.setAttribute("hidden", "");
                if (W < 5 && H < 5) { if (App.Brush) { App.Brush = null; App.RefreshFilters(); } return; }
                const Picked = new Set([...Svg.querySelectorAll(".Bubble")].filter((Circle) => { const Cx = Number(Circle.getAttribute("cx")), Cy = Number(Circle.getAttribute("cy")); return Cx >= X && Cx <= X + W && Cy >= Y && Cy <= Y + H; }).map((Circle) => Circle.dataset.asset));
                App.Brush = Picked.size ? Picked : null;
                App.RefreshFilters();
                if (Picked.size) App.Toast(`${Picked.size} asset${Picked.size === 1 ? "" : "s"} brushed — the whole dashboard is filtered`, { Action: { Label: "Clear", Run: () => { App.Brush = null; App.RefreshFilters(); } } });
            };
            Svg.addEventListener("pointerup", End);
            Svg.addEventListener("pointercancel", End);
        }
        // Crosshair highlight on the heatmap.
        const Heat = Host.querySelector(".Heatmap");
        if (Heat) {
            Heat.addEventListener("pointerover", (Event) => {
                const Cell = Event.target.closest("i[data-row]");
                for (const Other of Heat.querySelectorAll("i.Cross")) Other.classList.remove("Cross");
                if (!Cell) return;
                for (const Other of Heat.querySelectorAll(`i[data-row="${Cell.dataset.row}"], i[data-col="${Cell.dataset.col}"]`)) Other.classList.add("Cross");
            });
            Heat.addEventListener("pointerleave", () => { for (const Other of Heat.querySelectorAll("i.Cross")) Other.classList.remove("Cross"); });
        }
    },

    Act(App, Name, Element) {
        if (Name === "heat-mode") { App.BoardPrefs.HeatMode = Element.dataset.value; App.RenderBoard(); return true; }
        if (Name === "clear-brush") { App.Brush = null; App.RefreshFilters(); return true; }
        if (Name === "filter-category") { const Key = Element.dataset.category; App.CategoryFilter = App.CategoryFilter === Key ? null : Key; App.RefreshFilters(); return true; }
        return false;
    },
};

// ================================================================= Pipeline
function DeriveStages(App) {
    const Tone = (Asset) => App.Status(Asset.Status).Tone;
    const Validated = App.Assets.filter((Asset) => Tone(Asset) !== "bad");
    const Built = Validated.filter((Asset) => ResolveLods(Asset).length >= 4);
    const Reviewed = Built.filter((Asset) => Tone(Asset) === "ok");
    const Ready = Reviewed.filter((Asset) => (Asset.BudgetUse ?? 0) <= 1);
    return [["Imported", App.Assets], ["Validated", Validated], ["LODs built", Built], ["Reviewed", Reviewed], ["Ship-ready", Ready]];
}

function SynthesiseBuilds(App) {
    const Random = SeededRandom((App.Catalogue.AtlasSeed ?? 7) * 977 + App.Assets.length);
    const Broken = App.Assets.filter((Asset) => App.Status(Asset.Status).Tone === "bad").length;
    return Array.from({ length: 32 }, (_, Index) => {
        const Minutes = 5.5 + Random() * 5 + (Index % 9 === 0 ? 4 : 0);
        return { Number: 1238 + Index, Minutes, Failed: Random() < 0.06 + Broken * 0.025, Changed: 1 + Math.floor(Random() * 7), HoursAgo: (31 - Index) * 5 + Math.floor(Random() * 3) };
    });
}

const Pipeline = {
    Render(App) {
        const Stages = DeriveStages(App), Total = Math.max(1, App.Assets.length);
        const Funnel = Card("Release funnel", `<div class="Funnel">${Stages.map(([Name, Items], Index) => {
            const Previous = Index ? Stages[Index - 1][1].length : Items.length;
            const Conversion = Previous ? Math.round((Items.length / Previous) * 100) : 0;
            return `<div class="FunnelStage" data-tip="${Escape(`${Name}\n${Items.map((Asset) => Asset.Label).slice(0, 8).join(", ")}${Items.length > 8 ? "…" : ""}`)}">
                <span class="FunnelName">${Name}</span>
                <div class="FunnelTrack"><i style="width:${(Items.length / Total) * 100}%;opacity:${1 - Index * 0.13}"></i></div>
                <span class="FunnelCount">${Items.length}</span><span class="FunnelRate">${Index ? `${Conversion}%` : ""}</span></div>`;
        }).join("")}</div>`, { Span: 7, Hint: "stage → stage conversion" });

        const ReadyCount = Stages[4][1].length, Share = ReadyCount / Total;
        const Segments = 48;
        const Ring = Array.from({ length: Segments }, (_, Index) => {
            const A0 = -Math.PI / 2 + (Index / Segments) * Math.PI * 2 + 0.02, A1 = A0 + (Math.PI * 2) / Segments - 0.04;
            return `<path d="${ArcPath(80, 80, 58, 72, A0, A1)}" class="${Index / Segments < Share ? "Lit" : ""}"/>`;
        }).join("");
        const Readiness = Card("Readiness", `<div class="ReadyWrap"><svg class="ReadyRing" viewBox="0 0 160 160" role="img" aria-label="${Math.round(Share * 100)} percent ship-ready">${Ring}
                <text x="80" y="82" text-anchor="middle" class="ReadyValue">${Math.round(Share * 100)}%</text><text x="80" y="102" text-anchor="middle" class="ReadyCaption">${ReadyCount} of ${Total} ship-ready</text></svg>
            <ul class="ReadyLegend">${App.Catalogue.Statuses.map((Status) => `<li>${Dot(Tones[Status.Tone] || Tones.idle)}${Escape(Status.Label)}<b>${App.Assets.filter((Asset) => Asset.Status === Status.Key).length}</b></li>`).join("")}</ul></div>`, { Span: 5 });

        const Columns = App.Catalogue.Statuses.map((Status, Index) => {
            const Items = Visible(App).filter((Asset) => Asset.Status === Status.Key);
            return `<div class="KanbanColumn" data-status="${Escape(Status.Key)}" style="--dot:${Tones[Status.Tone] || Tones.idle}">
                <header><i></i>${Escape(Status.Label)}<span>${Items.length}</span></header>
                <div class="KanbanCards">${Items.map((Asset) => `<article class="KanbanCard" draggable="true" data-act="select" data-asset="${Escape(Asset.Id)}" aria-current="${Asset.Id === App.SelectedId}">
                    <span class="KanbanGlyph">${Glyph(Asset.Icon || App.Category(Asset.Category).Icon)}</span>
                    <span class="KanbanName"><b>${Escape(Asset.Label)}</b><small>${Escape(Asset.Id)} · ${Escape(Asset.Owner || "Unassigned")}</small>${Meter(Asset.BudgetUse)}</span>
                    <span class="KanbanMove">${Index > 0 ? `<button class="IconButton" data-act="shift-status" data-asset="${Escape(Asset.Id)}" data-direction="-1" aria-label="Move left">${Icons.left}</button>` : ""}${Index < App.Catalogue.Statuses.length - 1 ? `<button class="IconButton" data-act="shift-status" data-asset="${Escape(Asset.Id)}" data-direction="1" aria-label="Move right">${Icons.right}</button>` : ""}</span>
                </article>`).join("") || '<p class="KanbanEmpty">Drop assets here</p>'}</div></div>`;
        }).join("");
        const Kanban = Card("Status board", `<div class="Kanban" style="--columns:${App.Catalogue.Statuses.length}">${Columns}</div>`, { Span: 12, Hint: "drag cards between columns · changes persist and can be undone" });

        const Builds = SynthesiseBuilds(App);
        const MaxMinutes = Math.max(...Builds.map((Build) => Build.Minutes));
        const BW = 560, BH = 150, Gap = 3, BarWidth = (BW - Gap * (Builds.length - 1)) / Builds.length;
        const Success = Builds.filter((Build) => !Build.Failed).length / Builds.length;
        const Sorted = [...Builds].map((Build) => Build.Minutes).sort((A, B) => A - B), Median = Sorted[Math.floor(Sorted.length / 2)];
        const LastFail = [...Builds].reverse().find((Build) => Build.Failed);
        const BuildCard = Card("Build history", `<div class="KpiRow">${Kpi(Success * 100, "success rate", { Suffix: "%", Tone: Success < 0.85 ? Tones.warn : "" })}${Kpi(Median, "median minutes", { Decimals: 1 })}${Kpi(Builds.length, "builds this week")}${Kpi(LastFail ? LastFail.HoursAgo : 0, LastFail ? "hours since a failure" : "no failures", { Tone: LastFail && LastFail.HoursAgo < 24 ? Tones.bad : "" })}</div>
            <svg class="Builds" viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="none" role="img" aria-label="Recent build durations">
                <line class="Grid" x1="0" x2="${BW}" y1="${BH - (Median / MaxMinutes) * (BH - 10)}" y2="${BH - (Median / MaxMinutes) * (BH - 10)}"/>
                ${Builds.map((Build, Index) => { const H = (Build.Minutes / MaxMinutes) * (BH - 10); return `<rect class="${Build.Failed ? "Failed" : ""}" x="${Index * (BarWidth + Gap)}" y="${BH - H}" width="${BarWidth}" height="${H}" rx="2" data-tip="${Escape(`Build #${Build.Number}${Build.Failed ? " — failed" : ""}\n${Build.Minutes.toFixed(1)} min · ${Build.Changed} assets changed\n${Build.HoursAgo} h ago`)}"/>`; }).join("")}
            </svg>`, { Span: 12, Hint: "bar height = duration · dashed = median" });

        return `<div class="BoardGrid">${Funnel}${Readiness}${Kanban}${BuildCard}</div>`;
    },

    Mount(App, Host) {
        for (const Card_ of Host.querySelectorAll(".KanbanCard")) {
            Card_.addEventListener("dragstart", (Event) => { Event.dataTransfer.setData("text/x-asset", Card_.dataset.asset); Event.dataTransfer.effectAllowed = "move"; Card_.classList.add("Dragging"); });
            Card_.addEventListener("dragend", () => Card_.classList.remove("Dragging"));
        }
        for (const Column of Host.querySelectorAll(".KanbanColumn")) {
            Column.addEventListener("dragover", (Event) => { if (!Event.dataTransfer.types.includes("text/x-asset")) return; Event.preventDefault(); Column.classList.add("DropTarget"); });
            Column.addEventListener("dragleave", (Event) => { if (!Column.contains(Event.relatedTarget)) Column.classList.remove("DropTarget"); });
            Column.addEventListener("drop", (Event) => {
                const Id = Event.dataTransfer.getData("text/x-asset");
                if (!Id) return;
                Event.preventDefault();
                Event.stopPropagation();
                Column.classList.remove("DropTarget");
                App.SetStatus(Id, Column.dataset.status);
            });
        }
    },

    Act(App, Name, Element) {
        if (Name !== "shift-status") return false;
        const Keys = App.Catalogue.Statuses.map((Status) => Status.Key);
        const Asset = App.Assets.find((Entry) => Entry.Id === Element.dataset.asset);
        const Next = Keys[Clamp(Keys.indexOf(Asset.Status) + Number(Element.dataset.direction), 0, Keys.length - 1)];
        App.SetStatus(Asset.Id, Next);
        return true;
    },
};

// ================================================================= Issues
const Severities = [["Critical", Tones.bad], ["Warning", Tones.warn], ["Info", Tones.info]];
const SeverityRank = { Critical: 0, Warning: 1, Info: 2 };

export function DeriveIssues(App) {
    const Issues = [];
    const OkKey = App.StatusKeyByTone("ok"), WarnKey = App.StatusKeyByTone("warn");
    for (const Asset of App.Assets) {
        const Tone = App.Status(Asset.Status).Tone, Use = Asset.BudgetUse ?? 0, Lods = ResolveLods(Asset);
        const Category = App.Category(Asset.Category).Label.toLowerCase();
        const Push = (Kind, Severity, Title, Detail, Fix = null) => Issues.push({ Id: `${Asset.Id}:${Kind}`, Asset, Severity, Title, Detail, Fix });
        if (Tone === "bad") Push("Validation", "Critical", "Failed validation", `Flagged: ${(Asset.Tags || []).join(", ") || "see import log"}. Fix the source and resubmit for review.`,
            WarnKey && { Label: "Send to review", Run: () => App.SetStatus(Asset.Id, WarnKey) });
        if (Use > 1) Push("Budget", "Critical", `Over budget by ${Math.round((Use - 1) * 100)}%`, `Uses ${Math.round(Use * 100)}% of the ${Category} budget. Halving texture resolution typically recovers ~30%.`,
            { Label: "Halve textures", Run: () => App.Mutate(Asset.Id, (Target) => { Target.TextureMb = Math.max(1, Math.round((Target.TextureMb || 0) / 2)); Target.BudgetUse = Math.round(Use * 0.7 * 100) / 100; }, `${Asset.Label}: textures halved`) });
        else if (Use > 0.85) Push("Budget", "Warning", "Near budget", `At ${Math.round(Use * 100)}% of the ${Category} budget — little headroom for new variants.`);
        if (Tone === "warn") Push("Review", "Warning", "Awaiting review", `${Asset.Owner || "The owner"} is waiting on sign-off. Updated ${Asset.Updated || "recently"}.`,
            OkKey && { Label: "Approve", Run: () => App.SetStatus(Asset.Id, OkKey) });
        if (Lods.length < 5 && (Asset.Triangles || 0) > 20000) Push("Lods", "Info", "Shallow LOD chain", `${Lods.length} levels for ${Format(Asset.Triangles)} triangles — the last level is still ${Format(Lods[Lods.length - 1] || 0)}.`,
            { Label: "Add 2 levels", Run: () => App.Mutate(Asset.Id, (Target) => { Target.LodLevels = (Target.LodLevels ?? Lods.length) + 2; delete Target.Lods; }, `${Asset.Label}: LOD chain extended`) });
        if ((Asset.Materials || 0) >= 6) Push("Materials", "Info", "High material count", `${Asset.Materials} materials means ${Asset.Materials} passes per instance. Consider an atlas.`);
    }
    return Issues.sort((A, B) => SeverityRank[A.Severity] - SeverityRank[B.Severity] || A.Asset.Label.localeCompare(B.Asset.Label));
}

const SeverityIcon = (Severity, Colour) => Severity === "Critical"
    ? `<svg viewBox="0 0 24 24" class="SevIcon" aria-hidden="true"><path d="M12 2.5 23 21.5H1z" fill="${Colour}" stroke="none"/><path d="M12 9v5.5" stroke="#fff" stroke-width="2.2"/><circle cx="12" cy="18" r="1.3" fill="#fff" stroke="none"/></svg>`
    : Severity === "Warning"
        ? `<svg viewBox="0 0 24 24" class="SevIcon" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${Colour}" stroke="none"/><path d="M12 7v6" stroke="#1b1206" stroke-width="2.2"/><circle cx="12" cy="16.6" r="1.2" fill="#1b1206" stroke="none"/></svg>`
        : `<svg viewBox="0 0 24 24" class="SevIcon" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${Colour}" stroke="none"/><path d="M12 11v6" stroke="#0b1430" stroke-width="2.2"/><circle cx="12" cy="7.6" r="1.2" fill="#0b1430" stroke="none"/></svg>`;

const Issues = {
    Render(App) {
        const Prefs = App.BoardPrefs;
        const All = DeriveIssues(App).filter((Issue) => App.Matches(Issue.Asset) && !Prefs.Snoozed.has(Issue.Id));
        const Shown = Prefs.IssueSeverity === "All" ? All : All.filter((Issue) => Issue.Severity === Prefs.IssueSeverity);
        const Counts = Object.fromEntries(Severities.map(([Name]) => [Name, All.filter((Issue) => Issue.Severity === Name).length]));
        const Tiles = `<div class="SevTiles">${Severities.map(([Name, Colour]) => `<button class="SevTile" data-act="issue-severity" data-value="${Name}" aria-pressed="${Prefs.IssueSeverity === Name}" style="--sev:${Colour}">
                ${SeverityIcon(Name, Colour)}<span>${Name}</span><b data-count="${Counts[Name]}">${Counts[Name]}</b></button>`).join("")}
            <div class="SevBar" aria-hidden="true">${Severities.map(([Name, Colour]) => `<i style="flex:${Counts[Name] || 0.0001};background:${Colour}" data-tip="${Escape(`${Name}\n${Counts[Name]} open`)}"></i>`).join("")}</div></div>`;
        const List = Shown.length ? `<div class="IssueList">${Shown.map((Issue) => {
            const Colour = Severities.find(([Name]) => Name === Issue.Severity)[1];
            const Open = Prefs.Expanded.has(Issue.Id);
            return `<div class="IssueRow" aria-expanded="${Open}" style="--sev:${Colour}">
                <button class="IssueHead" data-act="issue-expand" data-issue="${Escape(Issue.Id)}" aria-expanded="${Open}">
                    ${SeverityIcon(Issue.Severity, Colour)}<span class="IssueTitle"><b>${Escape(Issue.Title)}</b><small>${Escape(Issue.Asset.Label)} · ${Escape(Issue.Asset.Id)}</small></span>
                    <span class="IssueOwner">${Escape(Issue.Asset.Owner || "Unassigned")}</span><span class="IssueChevron">${Icons.chevron}</span></button>
                ${Open ? `<div class="IssueBody"><p>${Escape(Issue.Detail)}</p><div class="IssueActions">
                    <button class="GhostPill" data-act="locate" data-asset="${Escape(Issue.Asset.Id)}">${Icons.locate}Locate on map</button>
                    ${Issue.Fix ? `<button class="GhostPill Primary" data-act="issue-fix" data-issue="${Escape(Issue.Id)}">${Icons.wrench}${Escape(Issue.Fix.Label)}</button>` : ""}
                    <button class="GhostPill" data-act="issue-snooze" data-issue="${Escape(Issue.Id)}">${Icons.snooze}Snooze</button></div></div>` : ""}
            </div>`;
        }).join("")}</div>` : `<div class="AllClear"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg><b>All clear</b><span>No ${Prefs.IssueSeverity === "All" ? "" : Prefs.IssueSeverity.toLowerCase() + " "}issues for the current filters.</span></div>`;

        const Owners = [...new Set(All.map((Issue) => Issue.Asset.Owner || "Unassigned"))].map((Owner) => ({ Owner, Items: All.filter((Issue) => (Issue.Asset.Owner || "Unassigned") === Owner) })).sort((A, Z) => Z.Items.length - A.Items.length);
        const MaxOwner = Math.max(1, ...Owners.map((Entry) => Entry.Items.length));
        const OwnerBars = Owners.length ? `<ul class="OwnerBars">${Owners.map(({ Owner, Items }) => `<li><span>${Escape(Owner)}</span><div class="Stack" style="width:${(Items.length / MaxOwner) * 100}%">${Severities.map(([Name, Colour]) => { const N = Items.filter((Issue) => Issue.Severity === Name).length; return N ? `<i style="flex:${N};background:${Colour}" data-tip="${Escape(`${Owner}\n${N} ${Name.toLowerCase()}`)}"></i>` : ""; }).join("")}</div><b>${Items.length}</b></li>`).join("")}</ul>` : Empty("Nobody has open issues.");

        const Snoozed = Prefs.Snoozed.size ? `<button class="Chip" data-act="issue-unsnooze">${Prefs.Snoozed.size} snoozed · show ${Icons.close}</button>` : "";
        return `<div class="BoardGrid">
            ${Card("Open issues", Tiles, { Span: 12, Hint: `${All.length} total · click a tile to filter`, Tools: Snoozed })}
            ${Card(Prefs.IssueSeverity === "All" ? "All issues" : `${Prefs.IssueSeverity} issues`, List, { Span: 8, Hint: "expand a row for actions", Tools: Prefs.IssueSeverity !== "All" ? `<button class="Chip" data-act="issue-severity" data-value="All">Show all ${Icons.close}</button>` : "" })}
            ${Card("By owner", OwnerBars, { Span: 4 })}
        </div>`;
    },

    Act(App, Name, Element) {
        const Prefs = App.BoardPrefs;
        const Find = () => DeriveIssues(App).find((Issue) => Issue.Id === Element.dataset.issue);
        if (Name === "issue-severity") Prefs.IssueSeverity = Prefs.IssueSeverity === Element.dataset.value ? "All" : Element.dataset.value;
        else if (Name === "issue-expand") { const Id = Element.dataset.issue; Prefs.Expanded.has(Id) ? Prefs.Expanded.delete(Id) : Prefs.Expanded.add(Id); }
        else if (Name === "issue-fix") { Find()?.Fix?.Run(); return true; }
        else if (Name === "issue-snooze") {
            const Id = Element.dataset.issue;
            Prefs.Snoozed.add(Id);
            App.Toast("Issue snoozed for this session", { Action: { Label: "Undo", Run: () => { Prefs.Snoozed.delete(Id); App.RenderBoard(); App.RenderNav(); } } });
            App.RenderNav();
        } else if (Name === "issue-unsnooze") { Prefs.Snoozed.clear(); App.RenderNav(); }
        else return false;
        App.RenderBoard();
        return true;
    },
};

export const Boards = { Library, Budgets, Analytics, Pipeline, Issues };
