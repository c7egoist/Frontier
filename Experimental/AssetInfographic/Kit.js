// Shared helpers for the Asset Infographic: formatting, glyphs, seeded randomness and
// small layout/geometry routines used by the infographic boards.

export const Query = (Id) => document.getElementById(Id);
export const Format = (N) => (N >= 1e6 ? (N / 1e6).toFixed(N >= 1e7 ? 0 : 1) + "M" : N >= 1e4 ? Math.round(N / 1e3) + "k" : N >= 1e3 ? (N / 1e3).toFixed(1) + "k" : String(Math.round(N)));
export const Escape = (Text) => String(Text ?? "").replace(/[&<>"']/g, (C) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[C]);
export const Tones = { ok: "#3fbf5a", warn: "#f2a33a", bad: "#e5322d", info: "#7fa6ff", idle: "#9a9aa2" };
export const CategoryHues = ["#e9e9e9", "#8fc7ff", "#c6a6ff", "#ffd27a", "#8fe0b0", "#ff9f8a"];
export const ComparePalette = ["#ffffff", "#8fc7ff", "#ffd27a", "#c6a6ff"];
export const Clamp = (V, Lo, Hi) => Math.min(Hi, Math.max(Lo, V));
export const Sum = (Items, Pick = (V) => V) => Items.reduce((Total, Item) => Total + (Number(Pick(Item)) || 0), 0);
export const BudgetTone = (Use) => (Use > 1 ? Tones.bad : Use > 0.85 ? Tones.warn : Tones.ok);

const Glyphs = {
    boulder: '<path d="M4 17 3 11l4-6 7-1 6 5 1 7-5 4H8z"/><path d="m7 5 2 6-6 0M9 11l5 2 7 3M14 13l-2 8"/>',
    terrain: '<path d="M2 19 8 9l4 6 3-4 7 8z"/><path d="m8 9 2 3"/>',
    knot: '<path d="M8 6c4-3 10 0 9 5s-7 7-10 4 0-9 5-9 7 6 3 10-10 2-10-3 4-7 8-6"/>',
    column: '<path d="M6 3h12M7 21h10M8 3v18M12 3v18M16 3v18M5 21h14"/>',
    character: '<circle cx="12" cy="6" r="3"/><path d="M6 21v-6a6 6 0 0 1 12 0v6M9 13l-3 4M15 13l3 4"/>',
    vehicle: '<path d="M3 15v-3l2-5h14l2 5v3z"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M5 12h14"/>',
    tree: '<path d="M12 3 6 12h3l-4 6h14l-4-6h3z"/><path d="M12 18v3"/>',
    crate: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
    building: '<path d="M4 21V8l8-5 8 5v13z"/><path d="M9 21v-6h6v6M8 10h2M14 10h2"/>',
    lamp: '<path d="M12 3v4M7 7h10l-2 6H9z"/><path d="M12 13v8M9 21h6"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/>',
    generic: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4 12h16M12 4v16"/>',
};
export const Glyph = (Name, Extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true" ${Extra}>${Glyphs[Name] || Glyphs.generic}</svg>`;

export const Icons = {
    grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>',
    list: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9"/><circle cx="2.5" cy="4" r=".6"/><circle cx="2.5" cy="8" r=".6"/><circle cx="2.5" cy="12" r=".6"/></svg>',
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
    locate: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>',
    left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4-4 4 4 4"/></svg>',
    right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>',
    snooze: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/></svg>',
    wrench: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2a3.5 3.5 0 0 0-3.3 4.6L2.5 11.3a1.4 1.4 0 0 0 2 2l4.7-4.7A3.5 3.5 0 0 0 13.8 5l-2 2-1.9-.4-.4-1.9 2-2A3.5 3.5 0 0 0 10.5 2z"/></svg>',
    command: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6zm0 0h4m-4 0v4m4-4V4.5A1.5 1.5 0 1 1 11.5 6H10zm0 0v4m0 0h1.5a1.5 1.5 0 1 1-1.5 1.5V10zm0 0H6m0 0v1.5A1.5 1.5 0 1 1 4.5 10H6z"/></svg>',
    compare: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M3 5h3v6H3zM10 3h3v10h-3z"/></svg>',
};

export function SeededRandom(Seed) {
    let S = (Seed >>> 0) || 1;
    return () => { S = (Math.imul(S, 1664525) + 1013904223) >>> 0; return S / 4294967296; };
}

export function Hash(Text) {
    let H = 2166136261;
    for (const Char of String(Text)) { H ^= Char.charCodeAt(0); H = Math.imul(H, 16777619); }
    return H >>> 0;
}

export function ResolveLods(Asset) {
    if (Array.isArray(Asset.Lods)) return Asset.Lods;
    const Count = Asset.LodLevels ?? 0, Base = Asset.Triangles ?? 0;
    return Array.from({ length: Count }, (_, Level) => Math.round(Base / 2 ** Level));
}

// "12 Nov" / "2026-11-12" → sortable number (0 when unknown).
export function ParseDay(Text) {
    if (!Text) return 0;
    const Direct = Date.parse(Text);
    if (!Number.isNaN(Direct)) return Direct;
    const WithYear = Date.parse(`${Text} ${new Date().getFullYear()}`);
    return Number.isNaN(WithYear) ? 0 : WithYear;
}

// Twelve weeks of plausible budget-use history ending at the asset's current BudgetUse.
export function DeriveTrend(Asset, Count = 12) {
    const Random = SeededRandom(Hash(Asset.Id));
    const End = Asset.BudgetUse ?? 0.5;
    const Out = [];
    let V = End * (0.55 + Random() * 0.3);
    for (let Index = 0; Index < Count; Index++) {
        const T = Index / (Count - 1);
        V += (End - V) * (0.18 + T * 0.4) + (Random() - 0.5) * 0.08;
        Out.push(Index === Count - 1 ? End : Math.max(0.02, V));
    }
    return Out;
}

export function SparkPath(Values, Width, Height, Pad = 2, Range = null) {
    const Lo = Range ? Range[0] : Math.min(...Values), Hi = Range ? Range[1] : Math.max(...Values);
    const Span = Hi - Lo || 1;
    return Values.map((V, Index) => `${Index ? "L" : "M"}${(Pad + (Index / Math.max(1, Values.length - 1)) * (Width - Pad * 2)).toFixed(1)} ${(Height - Pad - ((V - Lo) / Span) * (Height - Pad * 2)).toFixed(1)}`).join("");
}

// Annular sector between radii R0..R1 and angles A0..A1 (radians, 0 = +x, clockwise in screen space).
export function ArcPath(Cx, Cy, R0, R1, A0, A1) {
    A1 = Math.min(A1, A0 + Math.PI * 2 - 1e-4);
    const P = (R, A) => `${(Cx + R * Math.cos(A)).toFixed(2)} ${(Cy + R * Math.sin(A)).toFixed(2)}`;
    const Large = A1 - A0 > Math.PI ? 1 : 0;
    if (R0 <= 0) return `M${Cx} ${Cy}L${P(R1, A0)}A${R1} ${R1} 0 ${Large} 1 ${P(R1, A1)}Z`;
    return `M${P(R1, A0)}A${R1} ${R1} 0 ${Large} 1 ${P(R1, A1)}L${P(R0, A1)}A${R0} ${R0} 0 ${Large} 0 ${P(R0, A0)}Z`;
}

// Squarified treemap (Bruls, Huizing, van Wijk). Items: [{ Value, ... }] → [{ Item, X, Y, W, H }].
export function Squarify(Items, X, Y, W, H) {
    const Total = Sum(Items, (Item) => Item.Value);
    if (!Total || W <= 0 || H <= 0) return [];
    const Scale = (W * H) / Total;
    const Pending = Items.filter((Item) => Item.Value > 0).sort((A, B) => B.Value - A.Value).map((Item) => ({ Item, Area: Item.Value * Scale }));
    const Out = [];
    let Box = { X, Y, W, H }, Row = [];
    const Worst = (Candidate, Side) => {
        const S = Sum(Candidate, (R) => R.Area);
        const Max = Math.max(...Candidate.map((R) => R.Area)), Min = Math.min(...Candidate.map((R) => R.Area));
        return Math.max((Side * Side * Max) / (S * S), (S * S) / (Side * Side * Min));
    };
    const Place = (Candidate) => {
        const S = Sum(Candidate, (R) => R.Area);
        if (Box.W >= Box.H) {
            const Wide = S / Box.H; let Cursor = Box.Y;
            for (const R of Candidate) { const Tall = R.Area / Wide; Out.push({ Item: R.Item, X: Box.X, Y: Cursor, W: Wide, H: Tall }); Cursor += Tall; }
            Box = { X: Box.X + Wide, Y: Box.Y, W: Box.W - Wide, H: Box.H };
        } else {
            const Tall = S / Box.W; let Cursor = Box.X;
            for (const R of Candidate) { const Wide = R.Area / Tall; Out.push({ Item: R.Item, X: Cursor, Y: Box.Y, W: Wide, H: Tall }); Cursor += Wide; }
            Box = { X: Box.X, Y: Box.Y + Tall, W: Box.W, H: Box.H - Tall };
        }
    };
    for (const R of Pending) {
        const Side = Math.min(Box.W, Box.H);
        if (!Row.length || Worst([...Row, R], Side) <= Worst(Row, Side)) Row.push(R);
        else { Place(Row); Row = [R]; }
    }
    if (Row.length) Place(Row);
    return Out;
}

// Dark → white ramp with an orange hot end, for heat cells.
export function HeatColour(V) {
    const T = Clamp(V, 0, 1);
    if (T > 0.88) return `rgb(242, ${Math.round(163 - (T - 0.88) * 300)}, 58)`;
    const L = Math.round(30 + T * 200);
    return `rgb(${L}, ${L}, ${Math.round(L + 6)})`;
}
