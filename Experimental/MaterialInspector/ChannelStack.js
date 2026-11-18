// ChannelStack.js — the shared channel list ("channel dropdown") used by every Project Zero card that writes channels:
// Material Inspector (material channels), Brush Studio (the channels each tool paints, erases, stamps, writes as text …)
// and the Paint workspace's Layer Inspector (the channels a paint layer contributes).
//
// Looks exactly like the Material Inspector's channel list: collapsible group heads (chevron · name · count · on-count ·
// swatch peeks when folded), one row per channel (swatch · name + hint · readout chip · enable switch) and an inline card
// under the open row with that channel's own fields.  The caller decides which fields a channel card has — a brush card
// shows value / source / amount / flow / blend, an eraser card shows strength / edge, a Move tool shows none at all.
//
//   ChannelStack(Spec) → html                         (pure string template, no state)
//   NormaliseStack(Raw, Card, Default) → { on, per }   (coerce stored / imported values)
//   StackDefault(On, Card, Overrides) → { on, per }
//   AssignStackField(Value, Ch, Key, Raw, Card) → { on, per }
//   ToggleStackChannel(Value, Ch, Min = 1) → { on, per } | null (null = would leave fewer than Min on)
//   StackAction(Act, El, Value, Ui, Card) → { Ui: true } | { Next } | null      (one click handler for every consumer)
//   ParseStackBind("b|mat.stack@roughness.value") → { Base: "b|mat.stack", Ch: "roughness", Key: "value" }
//
// Bind addresses: every card field binds as `${Bind}@${Channel}.${Key}`, so a consumer's existing data-bind plumbing only
// needs to split on "@".  Acts: cs-open · cs-group · cs-toggle · cs-group-toggle · cs-bulk · cs-set (seg / select pick: data-bind + data-value)
// · cs-search (input).  Sliders, colour and hex inputs carry data-bind and fire the host's ordinary input handler.

import { icon } from "./Icons.js";
import { Esc, Pct, Toggle, Knob, Segments, Dropdown, ColourField } from "./CardKit.js";
import { ALL_PAINT_CHANNELS } from "./Engine/PbrChannelDefinitions.js";

// ------------------------------------------------------------------------------------------------ paint channel catalogue
// TextureStudio's 22 paint channels, read from its registry (Engine/PbrChannelDefinitions.js, copied verbatim — 19 scalar /
// core / emissive + 3 tint channels).  This file only adds the UI layer: the five groups, a swatch tint per channel, and
// display units — scalars read 0‥100 % of the engine's 0‥1 range (height −100‥100, normal 0‥200, glow power 0‥400).
export const PAINT_GROUPS = Object.freeze(["Core", "Surface", "Coat", "Optics", "Emission"]);
const GROUP_OF = {
  albedo: "Core", roughness: "Core", metalness: "Core", height: "Core", normal: "Core", ao: "Core", opacity: "Core",
  specular: "Surface", specularColor: "Surface", anisotropy: "Surface",
  clearcoat: "Coat", coatRoughness: "Coat", sheen: "Coat", sheenRoughness: "Coat", sheenColor: "Coat",
  iridescence: "Optics", iridescenceThickness: "Optics", transmission: "Optics", thickness: "Optics", attenuationColor: "Optics",
  emissive: "Emission", emissiveIntensity: "Emission",
};
const TINT = {
  albedo: "#e8c27a", roughness: "#9a9a9a", metalness: "#c9d2dc", height: "#7f7fff", normal: "#8f8fff", ao: "#b9b9b9", opacity: "#d9d9d9",
  specular: "#e8e8e8", specularColor: "#ffffff", anisotropy: "#a8b4c4", clearcoat: "#cfe3ff", coatRoughness: "#8fa3bf", sheen: "#e6c9f0",
  sheenRoughness: "#b49cc0", sheenColor: "#f3e6ff", iridescence: "#9ee6d8", iridescenceThickness: "#7fc9e0", transmission: "#bfe8ff",
  thickness: "#ffb7a0", attenuationColor: "#ffd9cc", emissive: "#ff7a3b", emissiveIntensity: "#ffb07a",
};
const Pct100 = (V) => Math.round(V * 100);
export const PAINT_CHANNELS = Object.freeze(PAINT_GROUPS.flatMap((G) => ALL_PAINT_CHANNELS.filter((C) => GROUP_OF[C.key] === G)).map((C) => Object.freeze({
  Id: C.key, Label: C.label, Hint: C.sub, Short: C.short, Group: GROUP_OF[C.key], Tint: TINT[C.key],
  Type: C.isColor ? "colour" : "scalar", Unit: C.isColor ? "" : "%",
  Min: C.isColor ? 0 : Pct100(C.min), Max: C.isColor ? 100 : Pct100(C.max), Def: C.isColor ? C.default : Pct100(C.default),
})));
export const PAINT_CHANNEL = Object.freeze(Object.fromEntries(PAINT_CHANNELS.map((C) => [C.Id, C])));
export const CORE_CHANNELS = Object.freeze(PAINT_CHANNELS.filter((C) => C.Group === "Core").map((C) => C.Id));
// From scalar display units back to the engine's 0‥1 (‥2, ‥4, ±1) value, and forward.
export const ToEngine = (ChId, V) => (PAINT_CHANNEL[ChId]?.Type === "scalar" ? V / 100 : V);
export const FromEngine = (ChId, V) => (PAINT_CHANNEL[ChId]?.Type === "scalar" ? Pct100(V) : V);
export const BLEND_CHANNEL = Object.freeze(["Normal", "Multiply", "Screen", "Overlay", "Add", "Subtract", "Lighten", "Darken", "Replace"]);

// ------------------------------------------------------------------------------------------------ values
const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
const HEX = /^#[0-9a-f]{6}$/i;
const Def = (F, Ch) => structuredClone(typeof F.Def === "function" ? F.Def(Ch) : F.Def);
// Value-like fields (K "value", or Ranged: true) use the channel's own range; everything else is 0‥100 %.
const ChannelRanged = (F) => F.K === "value" || F.Ranged;
const Range = (F, Ch) => ({ Min: F.Min ?? (ChannelRanged(F) ? Ch.Min : 0), Max: F.Max ?? (ChannelRanged(F) ? Ch.Max : 100), Step: F.Step ?? 1 });
// A card field can be limited to channel types (For: ["scalar"]) or ids (Only: ["height"]) and hidden by When(per, Ch).
export const CardFields = (Card, Ch) => (typeof Card === "function" ? Card(Ch) : Card || []).filter((F) => (!F.For || F.For.includes(Ch.Type)) && (!F.Only || F.Only.includes(Ch.Id)) && (!F.Skip || !F.Skip.includes(Ch.Id)));
export const VisibleCardFields = (Card, Ch, Per) => CardFields(Card, Ch).filter((F) => !F.When || F.When(Per || {}, Ch));

function CoerceField(F, Ch, V) {
  switch (F.T) {
    case "slider": { const R = Range(F, Ch); return Number.isFinite(+V) ? Clamp(Math.round(+V / R.Step) * R.Step, R.Min, R.Max) : Def(F, Ch); }
    case "seg": case "select": return F.Opts.includes(V) ? V : Def(F, Ch);
    case "colour": return HEX.test(V || "") ? V.toLowerCase() : Def(F, Ch);
    case "switch": return typeof V === "boolean" ? V : Def(F, Ch);
    default: return V ?? Def(F, Ch);
  }
}

export function CardDefaults(Card, Ch) {
  return Object.fromEntries(CardFields(Card, Ch).filter((F) => F.T !== "note").map((F) => [F.K, Def(F, Ch)]));
}

export function NormaliseStack(Raw, Card, Default, Channels = PAINT_CHANNELS) {
  const Ids = Channels.map((C) => C.Id);
  const Src = Raw && typeof Raw === "object" && !Array.isArray(Raw) ? Raw : Array.isArray(Raw) ? { on: Raw } : {};
  const On = Array.isArray(Src.on) ? Ids.filter((C) => Src.on.includes(C)) : null;
  const Base = Default || { on: Ids.slice(0, 1), per: {} };
  const Out = { on: On?.length ? On : [...Base.on], per: {} };
  for (const Ch of Channels) {
    const Fields = CardFields(Card, Ch).filter((F) => F.T !== "note");
    if (!Fields.length) continue;
    const From = { ...(Base.per?.[Ch.Id] || {}), ...(Src.per?.[Ch.Id] || {}) };
    Out.per[Ch.Id] = Object.fromEntries(Fields.map((F) => [F.K, CoerceField(F, Ch, From[F.K])]));
  }
  return Out;
}

export function StackDefault(On, Card, Overrides = {}, Channels = PAINT_CHANNELS) {
  return NormaliseStack({ on: On, per: Overrides }, Card, { on: On, per: Overrides }, Channels);
}

export function AssignStackField(Value, ChId, Key, Raw, Card, Channels = PAINT_CHANNELS) {
  const Ch = Channels.find((C) => C.Id === ChId), F = Ch && CardFields(Card, Ch).find((E) => E.K === Key);
  if (!F) return Value;
  return { on: [...(Value.on || [])], per: { ...Value.per, [ChId]: { ...(Value.per[ChId] || CardDefaults(Card, Ch)), [Key]: CoerceField(F, Ch, F.T === "slider" ? +Raw : Raw) } } };
}

export function ToggleStackChannel(Value, ChId, Min = 1, Channels = PAINT_CHANNELS) {
  const On = Value.on.includes(ChId) ? Value.on.filter((C) => C !== ChId) : Channels.map((C) => C.Id).filter((C) => C === ChId || Value.on.includes(C));
  return On.length < Min ? null : { ...Value, on: On };
}

export function ToggleStackGroup(Value, Group, Enable, Min = 1, Channels = PAINT_CHANNELS) {
  const InGroup = Channels.filter((C) => C.Group === Group).map((C) => C.Id);
  const On = Channels.map((C) => C.Id).filter((C) => (InGroup.includes(C) ? Enable : Value.on.includes(C)));
  return On.length < Min ? null : { ...Value, on: On };
}

export function ParseStackBind(Bind) {
  const At = String(Bind).lastIndexOf("@");
  if (At < 0) return null;
  const [Ch, ...Rest] = Bind.slice(At + 1).split(".");
  return { Base: Bind.slice(0, At), Ch, Key: Rest.join(".") };
}

// ------------------------------------------------------------------------------------------------ linked stacks
// A host that already stores some channel settings as flat keys (Brush Studio: "mat.channels", "mat.roughness", …;
// tool studios: "channels", "height", …) keeps them as the source of truth.  The stack's own store key holds only the
// settings that have no flat key (per-channel flow, blend, opacity and every channel beyond the old five).
//   Link: { on: "mat.channels", "roughness.value": "mat.roughness", "emissive.strength": "mat.emissive", … }
//   const L = LinkedStack({ Key: "mat.stack", Link, Card, On: ["albedo"] })
//   L.Read(Flat) → { on, per }        L.Assign(Full) → patch { flat keys…, [Key]: store }
//   L.Field(Flat, Ch, K, Raw) → patch L.Store(Raw) → normalised store (for the host's Normalise)
export function LinkedStack({ Key, Link = {}, Card, On = ["albedo"], Overrides = {}, Channels = PAINT_CHANNELS }) {
  const Linked = Object.entries(Link).filter(([A]) => A !== "on").map(([A, F]) => { const [Ch, K] = A.split("."); return { Ch, K, F }; });
  const Default = StackDefault(On, Card, Overrides, Channels);
  const Strip = (Full) => {
    const per = structuredClone(Full.per || {});
    for (const L of Linked) if (per[L.Ch]) delete per[L.Ch][L.K];
    for (const Ch of Object.keys(per)) if (!Object.keys(per[Ch]).length) delete per[Ch];
    return Link.on ? { per } : { on: [...Full.on], per };
  };
  const Store = (Raw) => Strip(NormaliseStack(Raw, Card, Default, Channels));
  const Read = (Flat) => {
    const S = Flat[Key] || {}, Full = NormaliseStack({ on: Link.on ? Flat[Link.on] : S.on, per: S.per }, Card, Default, Channels);
    for (const L of Linked) if (Full.per[L.Ch] && L.F in Flat) Full.per[L.Ch][L.K] = Flat[L.F];
    return Full;
  };
  const Assign = (Full) => {
    const Patch = { [Key]: Strip(Full) };
    if (Link.on) Patch[Link.on] = [...Full.on];
    for (const L of Linked) if (Full.per[L.Ch] && L.K in Full.per[L.Ch]) Patch[L.F] = Full.per[L.Ch][L.K];
    return Patch;
  };
  return { Key, Link, Card, Channels, Default, Store, Read, Assign, Field: (Flat, Ch, K, Raw) => Assign(AssignStackField(Read(Flat), Ch, K, Raw, Card, Channels)) };
}

// UI state lives with the consumer, one object per stack: { Open, Opened, Folds: { Group: bool }, Query }.
// Rows open independently: Opened lists every expanded row; Open is the last one touched (focus / host hand-offs).
export const StackUi = () => ({ Open: null, Opened: [], Folds: {}, Query: "" });

export const StackRowOpen = (Ui, Id) => Ui.Open === Id || (Ui.Opened || []).includes(Id);

// Expand / collapse one row without touching the others.
export function StackReveal(Ui, Id, Show = true) {
  const List = (Ui.Opened || (Ui.Open ? [Ui.Open] : [])).filter((K) => K !== Id);
  if (Show) List.push(Id);
  Ui.Opened = List;
  Ui.Open = Show ? Id : (Ui.Open === Id ? List[List.length - 1] ?? null : Ui.Open);
}

export function StackFoldAll(Ui) { Ui.Open = null; Ui.Opened = []; }

// One click handler for every consumer.  Returns { Ui: true } when only UI state changed (re-render), { Next } with the
// new stack value when channels were switched, or null when the act is not a stack act / was refused.
export function StackAction(Act, El, Value, Ui, Card, { Min = 1, Channels = PAINT_CHANNELS, Groups = PAINT_GROUPS } = {}) {
  const Ch = El.dataset.ch, Group = El.dataset.group;
  switch (Act) {
    case "cs-open": StackReveal(Ui, Ch, !StackRowOpen(Ui, Ch)); return { Ui: true };
    case "cs-group": Ui.Folds[Group] = El.dataset.open !== "true"; return { Ui: true };
    case "cs-toggle": { const Next = ToggleStackChannel(Value, Ch, Min, Channels); if (Next && Next.on.includes(Ch) && CardFields(Card, Channels.find((C) => C.Id === Ch)).length) StackReveal(Ui, Ch); return Next ? { Next } : { Refused: `Keep at least ${Min} channel${Min > 1 ? "s" : ""} on` }; }
    case "cs-group-toggle": { const All = Channels.filter((C) => C.Group === Group).every((C) => Value.on.includes(C.Id)); const Next = ToggleStackGroup(Value, Group, !All, Min, Channels); return Next ? { Next } : { Refused: "Keep at least one channel on" }; }
    case "cs-bulk": {
      const Ids = Channels.map((C) => C.Id), First = Channels.find((C) => C.Group === Groups[0])?.Id || Ids[0];
      const On = El.dataset.value === "all" ? Ids : El.dataset.value === "core" ? Channels.filter((C) => C.Group === Groups[0]).map((C) => C.Id) : [Value.on.includes(First) ? First : Value.on[0] || First];
      return { Next: { ...Value, on: On } };
    }
    default: return null;
  }
}

// ------------------------------------------------------------------------------------------------ template
// Spec: {
//   Id, Bind, Title = "Channels", Hint, Channels = PAINT_CHANNELS, Groups = PAINT_GROUPS,
//   Value: { on, per }  (omit for display-only stacks such as the Material Inspector), Card (fields per channel),
//   Ui: { Open, Folds, Query },  Switch = true, Search (default: > 10 channels), Bulk = true, FlatBelow = 0,
//   Field(F, Value, Bind, Ch) → html   (optional renderer, e.g. Brush Studio's edited / reset aware fields)
//   Swatch(Ch) / Readout(Ch) → { Text, Kind } / Head(Ch) → html / Editor(Ch) → html / GroupBadge(Group, Ids) → html
//   Acts: { Open, Group } (rename the row / group acts for a host with its own handlers),  Tone: "" | "blue",  Extra (title tools)
//   Edited(Ch) → bool (blue edit dot on the row — Brush Studio),  DefaultOpen(Group, Ids) → bool (fold default),  Empty (no-match text),  Bare (rows only — the host draws title and search)
// }
export function ChannelStack(Spec) {
  const S = { Title: "Channels", Channels: PAINT_CHANNELS, Groups: PAINT_GROUPS, Switch: true, Bulk: true, FlatBelow: 0, Ui: StackUi(), Acts: {}, ...Spec };
  const Ui = { Open: null, Opened: [], Folds: {}, Query: "", ...S.Ui };
  const OpenAct = S.Acts.Open || "cs-open", GroupAct = S.Acts.Group || "cs-group";
  const On = S.Value ? S.Value.on : S.Channels.map((C) => C.Id), Per = S.Value?.per || {};
  const Q = (Ui.Query || "").trim().toLowerCase();
  const Visible = S.Channels.filter((C) => !Q || `${C.Label} ${C.Hint} ${C.Group} ${C.Short || ""}`.toLowerCase().includes(Q));
  const Search = S.Search ?? S.Channels.length > 10;
  const Attr = `data-stack="${Esc(S.Id || S.Bind || "")}" ${S.Bind ? `data-bind="${Esc(S.Bind)}"` : ""}`;

  const Swatch = (C) => {
    if (S.Swatch) return S.Swatch(C);
    const V = Per[C.Id]?.value ?? C.Def;
    if (C.Type === "colour") return `<span class="mi-swatch" style="background:${C.Id === "albedo" && S.Albedo ? S.Albedo : HEX.test(V) ? V : C.Tint}"></span>`;
    return `<span class="mi-swatch scalar" style="--fill:${Pct(+V, C.Min, C.Max)}"></span>`;
  };
  const Readout = (C) => {
    if (S.Readout) return S.Readout(C);
    if (!On.includes(C.Id)) return { Text: "Off", Kind: "off" };
    const Pv = Per[C.Id];
    if (!Pv) return { Text: "On", Kind: "on" };
    if (C.Type === "colour") return { Text: C.Id === "albedo" && S.AlbedoText ? S.AlbedoText : String(Pv.value ?? C.Def).toUpperCase(), Kind: "value" };
    const Main = "value" in Pv ? `${Pv.value}${C.Unit === "%" ? " %" : ` ${C.Unit}`}` : "strength" in Pv ? `${Pv.strength} %` : "start" in Pv ? `${Pv.start} → ${Pv.end} %` : "On";
    return { Text: Main, Kind: Pv.source && Pv.source !== "None" && Pv.source !== "Flat" ? "field" : "value" };
  };
  const FieldOf = (F, C) => {
    const Bind = `${S.Bind}@${C.Id}.${F.K}`, V = Per[C.Id]?.[F.K] ?? Def(F, C);
    if (S.Field) return S.Field({ ...F, ...Range(F, C), L: F.L, Unit: F.Unit ?? (ChannelRanged(F) ? C.Unit : "%") }, V, Bind, C);
    switch (F.T) {
      case "slider": { const R = Range(F, C); return Knob({ Bind, Label: F.L, Value: V, Min: R.Min, Max: R.Max, Step: R.Step, Unit: F.Unit ?? (ChannelRanged(F) ? C.Unit : "%"), Hint: F.Hint || "" }); }
      case "seg": return `<div class="cs-field"><span class="cs-label">${Esc(F.L)}${F.Hint ? `<small>${Esc(F.Hint)}</small>` : ""}</span>${(F.Opts.length > 4 ? Dropdown : Segments)("cs-set", F.Opts.map((O) => [O, O]), V, { Label: F.L, Extra: `data-bind="${Esc(Bind)}"` })}</div>`;
      case "select": return `<div class="cs-field"><span class="cs-label">${Esc(F.L)}</span>${Dropdown("cs-set", F.Opts.map((O) => [O, O]), V, { Label: F.L, Extra: `data-bind="${Esc(Bind)}"`, Fid: Bind })}</div>`;
      case "colour": return `<div class="cs-field"><span class="cs-label">${Esc(F.L)}</span>${ColourField(Bind, F.L, V, "")}</div>`;
      case "note": return `<p class="mi-note">${Esc(typeof F.Text === "function" ? F.Text(C) : F.Text)}</p>`;
      default: return "";
    }
  };
  const Card = (C) => {
    if (S.Editor) return S.Editor(C);
    const Fields = VisibleCardFields(S.Card, C, Per[C.Id]);
    if (!Fields.length) return "";
    const IsOn = On.includes(C.Id);
    return `<div class="mi-editor cs-card" data-editor="${Esc(C.Id)}">
      ${IsOn ? "" : `<p class="mi-note cs-off-note">${icon("info", 11)} Off — switch the channel on to write it. Settings are kept.</p>`}
      ${Fields.map((F) => FieldOf(F, C)).join("")}
      <div class="mi-editor-foot"><code title="Parameter address">${Esc(`${S.Bind}@${C.Id}`)}</code><span class="cs-foot-tag">${Esc(C.Group)} · ${Esc(C.Short || C.Label)}</span></div>
    </div>`;
  };
  const Row = (C) => {
    const Open = StackRowOpen(Ui, C.Id), IsOn = On.includes(C.Id), HasCard = !!(S.Editor || VisibleCardFields(S.Card, C, Per[C.Id]).length);
    const R = Readout(C);
    const Head = S.Head ? S.Head(C) : `<button type="button" class="mi-row-head" data-act="${OpenAct}" ${Attr} data-ch="${Esc(C.Id)}" data-fid="cs:${Esc(S.Bind || S.Id)}:${Esc(C.Id)}" aria-expanded="${Open}" ${HasCard ? "" : `aria-disabled="true"`}>
        ${Swatch(C)}${S.Edited?.(C) ? `<i class="cs-dot" title="Edited"></i>` : ""}<span class="mi-row-name">${Esc(C.Label)}<small>${Esc(C.Hint)}</small></span>
        <span class="mi-readout kind-${R.Kind}">${R.Kind === "field" ? icon("field", 11) : ""}${Esc(R.Text)}</span>
      </button>`;
    const Line = S.Switch ? `<div class="cs-row-line">${Head}${Toggle("cs-toggle", IsOn, `${C.Label} ${IsOn ? "on" : "off"}`, `${Attr} data-ch="${Esc(C.Id)}" data-fid="cs-t:${Esc(S.Bind || S.Id)}:${Esc(C.Id)}"`)}</div>` : Head;
    return `<div class="mi-row cs-row ${Open && HasCard ? "open" : ""} ${IsOn ? "" : "off"} ${S.Edited?.(C) ? "edited" : ""}" data-row="${Esc(C.Id)}">${Line}${Open && HasCard ? Card(C) : ""}</div>`;
  };

  let Body;
  if (!Visible.length) Body = `<p class="mi-empty">${Esc(S.Empty || `No channel matches “${Ui.Query}”.`)}</p>`;
  else if (Visible.length <= S.FlatBelow || S.Groups.filter((G) => Visible.some((C) => C.Group === G)).length === 1) Body = `<div class="mi-group open flat">${Visible.map(Row).join("")}</div>`;
  else Body = S.Groups.map((G) => {
    const Rows = Visible.filter((C) => C.Group === G);
    if (!Rows.length) return "";
    const OnHere = Rows.filter((C) => On.includes(C.Id)).length, AllHere = S.Channels.filter((C) => C.Group === G);
    const Open = Q ? true : Ui.Folds[G] ?? (S.DefaultOpen ? S.DefaultOpen(G, Rows.map((C) => C.Id)) : G === S.Groups[0] || OnHere > 0 || Rows.some((C) => StackRowOpen(Ui, C.Id)));
    const Badge = S.GroupBadge ? S.GroupBadge(G, Rows.map((C) => C.Id)) : S.Value ? `<span class="cs-on ${OnHere ? "lit" : ""}" title="${OnHere} of ${AllHere.length} on">${OnHere}/${AllHere.length}</span>` : "";
    const Head = `<button type="button" class="mi-group-head" data-act="${GroupAct}" ${Attr} data-group="${Esc(G)}" data-group-id="${Esc(`${S.Id || S.Bind}:${G}`)}" data-open="${Open}" aria-expanded="${Open}">
        <span class="mi-chev">${icon("chevron", 11)}</span><span>${Esc(G)}</span><small>${Rows.length}</small>${Badge}
        ${Open ? "" : `<span class="mi-peek">${Rows.slice(0, 6).map((C) => (On.includes(C.Id) ? Swatch(C) : `<span class="mi-swatch cs-peek-off"></span>`)).join("")}</span>`}
      </button>`;
    const GroupSwitch = S.Switch && S.Value ? Toggle("cs-group-toggle", AllHere.every((C) => On.includes(C.Id)), `All ${G} channels`, `${Attr} data-group="${Esc(G)}" title="Switch every ${Esc(G)} channel"`) : "";
    return `<div class="mi-group ${Open ? "open" : ""}" data-group="${Esc(G)}">${GroupSwitch ? `<div class="cs-group-line">${Head}${GroupSwitch}</div>` : Head}${Open ? Rows.map(Row).join("") : ""}</div>`;
  }).join("");

  if (S.Bare) return Body;
  const Count = S.Value ? `${On.length}/${S.Channels.length} ON` : `${S.Channels.length}`;
  return `<section class="cs-stack ${S.Tone ? `tone-${S.Tone}` : ""}" ${Attr} aria-label="${Esc(S.Title)}">
    <div class="cs-head"><h3>${Esc(S.Title)}</h3><small>${Esc(Count)}${S.Hint ? ` · ${Esc(S.Hint)}` : ""}</small>
      ${S.Bulk && S.Value && S.Switch ? `<span class="cs-bulk">${[["All", "all"], [S.Groups[0], "core"], ["One", "none"]].map(([L, V]) => `<button type="button" class="mi-text-btn" data-act="cs-bulk" ${Attr} data-value="${V}" title="${V === "none" ? "Keep only the first channel" : `Switch on ${V === "all" ? "every" : `the ${S.Groups[0]}`} channel${V === "all" ? "" : "s"}`}">${Esc(L)}</button>`).join("")}</span>` : ""}
      ${S.Extra || ""}
    </div>
    ${Search ? `<label class="mi-search cs-search">${icon("search", 13)}<input type="search" data-act="cs-search" ${Attr} data-fid="cs-q:${Esc(S.Bind || S.Id)}" value="${Esc(Ui.Query || "")}" placeholder="Filter ${S.Channels.length} channels…" aria-label="Filter ${Esc(S.Title.toLowerCase())}"></label>` : ""}
    <div class="mi-list cs-list" data-list>${Body}</div>
  </section>`;
}
