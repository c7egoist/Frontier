// MaterialInspector.js — the single Material Inspector card (TextureStudio Material workspace), Project Zero styling.
//
// One card, top to bottom:
//   identity (name · library pick) → metric trio (scrub) → strata strip → channel list (grouped, one inline editor)
//   → stratum knobs (folded) → export.
// The old inspector stacked a pill cloud of every channel, then an "Inspect channel" dropdown, a "Source" dropdown, a
// "Generator" dropdown and a column of sliders under it.  Here every channel is one quiet row with its live value;
// opening a row expands that channel's editor in place, and source / generator choice are visible segments and chips.

import * as M from "./MaterialModel.js";
import { icon } from "./Icons.js";

const Esc = (S) => String(S).replace(/[&<>"']/g, (C) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[C]);
const Fixed = (V, Step) => (Step >= 1 ? String(Math.round(V)) : (+V).toFixed(Step >= 0.1 ? 1 : 2));
const Pct = (V, Lo, Hi) => `${(((V - Lo) / (Hi - Lo || 1)) * 100).toFixed(1)}%`;
const GLYPH = { value: "value", field: "field", ramp: "ramp", texture: "image", pattern: "pattern" };
const MODEL_GLYPH = { surface: "surface", coat: "coat", flakes: "flakes", detail: "detail" };
const SHORT_GEN = { "camouflage-smooth": "Camo soft", camouflage: "Camo pixel", noise: "Noise", stripes: "Grain", checker: "Checker", cells: "Cells", ridged: "Ridged", rings: "Rings" };

const S = {
  P: null, LayerId: null, Channel: null, Query: "",
  Groups: {}, Folds: {}, AddOpen: false, Renaming: null,
  History: [], Future: [], Pending: null, Status: "", StatusTimer: 0,
};

let Root = null;
const Store = (() => { try { return globalThis.localStorage; } catch { return null; } })();

// ------------------------------------------------------------------------------------------------ document plumbing
const Layer = () => M.FindLayer(S.P, S.LayerId) || S.P.Authoring.Layers.find((L) => L.Model === "surface") || S.P.Authoring.Layers[0];

function Save() {
  if (!Store) return;
  try {
    Store.setItem(M.STORAGE_PREFIX + S.P.id, JSON.stringify(S.P));
    Store.setItem(M.STORAGE_CURRENT, S.P.id);
  } catch { Flash("Storage full — changes kept in this tab only"); }
}

function LoadStored(Id) {
  try {
    const Raw = Store?.getItem(M.STORAGE_PREFIX + Id);
    if (Raw) return M.Load(Raw);
  } catch { /* fall through to the library version */ }
  return M.CreateMaterial(Id);
}

function Apply(Next, Live = false) {
  if (!Next || Next === S.P) return;
  if (S.Pending === null) S.Pending = JSON.stringify(S.P);
  S.P = Next;
  if (!Live) Settle();
}

function Settle() {
  if (S.Pending === null) return;
  if (S.Pending !== JSON.stringify(S.P)) {
    S.History.push(S.Pending);
    if (S.History.length > 80) S.History.shift();
    S.Future = [];
    Save();
  }
  S.Pending = null;
}

function Step(Back) {
  Settle();
  const From = Back ? S.History : S.Future, To = Back ? S.Future : S.History;
  if (!From.length) return;
  To.push(JSON.stringify(S.P));
  S.P = JSON.parse(From.pop());
  if (!M.FindLayer(S.P, S.LayerId)) S.LayerId = Layer().Identity;
  if (S.Channel && !Layer().Channels.includes(S.Channel)) S.Channel = null;
  Save();
  Render();
  Flash(Back ? "Undone" : "Redone");
}

function Flash(Text) {
  S.Status = Text;
  const El = Root?.querySelector("[data-status]");
  if (El) { El.textContent = Text; El.classList.add("on"); }
  clearTimeout(S.StatusTimer);
  S.StatusTimer = setTimeout(() => { S.Status = ""; const E = Root?.querySelector("[data-status]"); if (E) { E.classList.remove("on"); E.textContent = "Saved locally"; } }, 1800);
}

function Select(Material) {
  S.P = Material;
  S.LayerId = Layer().Identity;
  S.Channel = Layer().Channels.includes("colour") ? "colour" : Layer().Channels[0];
  S.History = []; S.Future = []; S.Pending = null; S.Query = ""; S.AddOpen = false; S.Groups = {};
  Save();
}

// ------------------------------------------------------------------------------------------------ small templates
function Knob({ Bind, Label, Value, Min, Max, Step: St, Unit = "", Hint = "" }) {
  return `<div class="mi-knob">
    <span class="mi-knob-label">${Esc(Label)}${Hint ? `<small>${Esc(Hint)}</small>` : ""}</span>
    <div class="slider-pill">
      <span class="split-value"><input type="number" data-bind="${Bind}" data-fid="n:${Bind}" min="${Min}" max="${Max}" step="${St}" value="${Fixed(Value, St)}" aria-label="${Esc(Label)}"><small>${Esc(Unit || "—")}</small></span>
      <input type="range" data-bind="${Bind}" data-fid="r:${Bind}" min="${Min}" max="${Max}" step="${St}" value="${Value}" style="--fill:${Pct(Value, Min, Max)}" aria-label="${Esc(Label)} slider">
    </div>
  </div>`;
}

function ColourField(Bind, Label, Value) {
  return `<div class="mi-colour">
    <label class="mi-colour-chip" style="background:${Value}"><input type="color" data-bind="${Bind}" data-fid="c:${Bind}" value="${Value}" aria-label="${Esc(Label)}"></label>
    <input class="mi-hex" data-bind="${Bind}" data-hex data-fid="h:${Bind}" value="${Value.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="${Esc(Label)} hex">
    <small>sRGB</small>
  </div>`;
}

function Stops(Bind, Stops, Max = 8) {
  return `<div class="mi-stops" data-stops="${Bind}">
    <div class="mi-stops-bar" style="background:linear-gradient(90deg, ${Stops.join(", ")})"></div>
    <div class="mi-stops-row">
      ${Stops.map((C, I) => `<label class="mi-stop" style="background:${C}" title="Stop ${I + 1} · ${C}"><input type="color" data-bind="${Bind}:${I}" data-fid="s:${Bind}:${I}" value="${C}" aria-label="Stop ${I + 1}"></label>`).join("")}
      <span class="mi-stops-tools">
        <button type="button" class="mi-mini" data-act="stop-remove" data-target="${Bind}" ${Stops.length <= 2 ? "disabled" : ""} aria-label="Remove last stop">${icon("minus", 12)}</button>
        <button type="button" class="mi-mini" data-act="stop-add" data-target="${Bind}" ${Stops.length >= Max ? "disabled" : ""} aria-label="Add stop">${icon("plus", 12)}</button>
      </span>
    </div>
  </div>`;
}

function Toggle(Act, On, Label) {
  return `<button type="button" class="toggle ${On ? "on" : ""}" data-act="${Act}" role="switch" aria-checked="${On}" aria-label="${Esc(Label)}"><i></i></button>`;
}

// ------------------------------------------------------------------------------------------------ channel rows
function SwatchHtml(L, Key) {
  const Spec = M.CHANNEL[Key], Source = M.ChannelSource(S.P, L, Key), Kind = M.SourceKind(Source.Mode);
  if (Kind === "ramp") return `<span class="mi-swatch" style="background:${M.RampCss(Source)}"></span>`;
  if (Kind === "field") return `<span class="mi-swatch" data-thumb="${Esc(Key)}" style="background:linear-gradient(135deg, ${(Source.Stops || ["#333", "#999"]).join(", ")})"></span>`;
  if (Kind === "texture") return Source.Texture ? `<span class="mi-swatch" style="background:url(${Source.Texture.dataUrl}) center/cover"></span>` : `<span class="mi-swatch empty">${icon("image", 12)}</span>`;
  const V = M.ReadChannel(S.P, L, Key);
  if (Spec.Type === "colour") return `<span class="mi-swatch" style="background:${V}"></span>`;
  if (Spec.Type === "vector") return `<span class="mi-swatch vector"><i style="background:rgb(${V.map((C) => Math.round((C * 0.5 + 0.5) * 255)).join(",")})"></i></span>`;
  return `<span class="mi-swatch scalar" style="--fill:${Pct(V, Spec.Minimum, Spec.Maximum)}"></span>`;
}

function RowHead(L, Key) {
  const Spec = M.CHANNEL[Key], R = M.ChannelReadout(S.P, L, Key), Open = S.Channel === Key;
  const Scrub = R.Kind === "value" && Spec.Type === "scalar";
  return `<button type="button" class="mi-row-head" data-act="open" data-ch="${Key}" data-fid="row:${Key}" aria-expanded="${Open}">
      ${SwatchHtml(L, Key)}
      <span class="mi-row-name">${Esc(Spec.Caption)}<small>${Esc(Spec.Hint)}</small></span>
      <span class="mi-readout ${Scrub ? "scrub" : ""} kind-${R.Kind}" ${Scrub ? `data-scrub="${Key}" title="Drag to scrub · Shift for fine"` : ""}>${R.Kind !== "value" ? icon(GLYPH[R.Kind], 11) : ""}${Esc(R.Text)}</span>
    </button>`;
}

function GroupsHtml(L) {
  const Q = S.Query.trim().toLowerCase();
  const Visible = L.Channels.filter((K) => !Q || (M.CHANNEL[K].Caption + " " + M.CHANNEL[K].Hint + " " + M.CHANNEL[K].Group).toLowerCase().includes(Q));
  if (!Visible.length) return `<p class="mi-empty">No channel on this stratum matches “${Esc(S.Query)}”.</p>`;
  // Short strata (coat, flakes, fresh detail) read better as one flat list; group heads only pay off on long ones.
  const Single = Visible.length <= 8 || M.GROUPS.filter((G) => Visible.some((K) => M.CHANNEL[K].Group === G)).length === 1;
  const RowHtml = (K) => `<div class="mi-row ${S.Channel === K ? "open" : ""}" data-row="${K}">${RowHead(L, K)}${S.Channel === K ? EditorHtml(L, K) : ""}</div>`;
  if (Single) return `<div class="mi-group open flat">${Visible.map(RowHtml).join("")}</div>`;
  return M.GROUPS.map((G) => {
    const Keys = Visible.filter((K) => M.CHANNEL[K].Group === G);
    if (!Keys.length) return "";
    const Authored = Keys.filter((K) => M.ChannelSource(S.P, L, K).Mode !== "value").length;
    const Id = `${L.Identity}:${G}`;
    const Open = Q ? true : S.Groups[Id] ?? (G === "Core" || Authored > 0 || Keys.includes(S.Channel));
    return `<div class="mi-group ${Open ? "open" : ""}" data-group="${Esc(G)}">
      <button type="button" class="mi-group-head" data-act="group" data-group-id="${Esc(Id)}" data-open="${Open}" aria-expanded="${Open}">
        <span class="mi-chev">${icon("chevron", 11)}</span><span>${Esc(G)}</span><small>${Keys.length}</small>
        ${Authored ? `<span class="mi-auth" title="${Authored} channel${Authored > 1 ? "s" : ""} driven by a field, ramp or image">${icon("field", 10)}${Authored}</span>` : ""}
        ${Open ? "" : `<span class="mi-peek">${Keys.slice(0, 6).map((K) => SwatchHtml(L, K)).join("")}</span>`}
      </button>
      ${Open ? Keys.map(RowHtml).join("") : ""}
    </div>`;
  }).join("");
}

// ------------------------------------------------------------------------------------------------ inline channel editor
function ValueEditor(L, Key) {
  const Spec = M.CHANNEL[Key], V = M.ReadChannel(S.P, L, Key);
  if (Spec.Type === "colour") return ColourField("ch", Spec.Caption, V);
  if (Spec.Type === "vector")
    return `<div class="mi-axes">${["X", "Y", "Z"].map((A, I) => `<label><b class="axis-${A}">${A}</b><input type="number" data-bind="vec:${I}" data-fid="v:${I}" min="-1" max="1" step="0.01" value="${V[I].toFixed(2)}" aria-label="${Spec.Caption} ${A}"></label>`).join("")}
      <button type="button" class="mi-mini" data-act="vec-flat" title="Reset to flat +Z" aria-label="Reset to flat">${icon("reset", 12)}</button></div>`;
  const Span = Spec.Maximum - Spec.Minimum, St = Span > 100 ? 5 : Span > 4 ? 0.05 : 0.01;
  return Knob({ Bind: "ch", Label: Spec.Caption, Value: V, Min: Spec.Minimum, Max: Spec.Maximum, Step: St, Unit: Spec.Unit || (Span > 4 ? "×" : "") });
}

function EditorHtml(L, Key) {
  const Spec = M.CHANNEL[Key], Source = M.ChannelSource(S.P, L, Key), Kind = M.SourceKind(Source.Mode);
  const Address = M.ResolveAddress(S.P, M.ChannelAddress(L, Key));
  const Tabs = `<div class="segmented fill mi-source" role="tablist" aria-label="${Esc(Spec.Caption)} source">
    ${M.SOURCES.map((E) => `<button type="button" role="tab" class="${Kind === E.Id ? "active" : ""}" aria-selected="${Kind === E.Id}" data-act="source" data-kind="${E.Id}">${icon(GLYPH[E.Id], 12)}${E.Label}</button>`).join("")}
  </div>`;
  let Body = "";
  if (Kind === "value") {
    Body = ValueEditor(L, Key);
  } else if (Kind === "field") {
    const G = S.P.Authoring.Generators.find((E) => E.Identity === Source.Generator);
    const Def = M.GeneratorDefinitions.find((D) => D.identity === G?.Procedure);
    const Camo = G?.Procedure.startsWith("camouflage");
    Body = `<div class="mi-field">
        <canvas class="mi-preview" width="72" height="72" data-preview="${Key}" aria-label="Field preview"></canvas>
        <div class="mi-field-side">
          <div class="mi-gen-title">${Esc(Def?.label || "Field")}<small>${Esc(Def?.description || "")}</small></div>
          <div class="mi-gen-grid" role="radiogroup" aria-label="Field generator">
            ${M.GeneratorDefinitions.map((D) => `<button type="button" role="radio" aria-checked="${D.identity === G?.Procedure}" class="mi-chip ${D.identity === G?.Procedure ? "active" : ""}" data-act="gen" data-gen="${D.identity}" title="${Esc(D.label)}">${Esc(SHORT_GEN[D.identity] || D.label)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="mi-knob-grid">
        ${M.FIELD_KNOBS.map((K) => Knob({ Bind: `field:${K.Key}`, Label: K.Label, Value: M.FieldInput(S.P, G.Identity, K.Key), Min: K.Minimum, Max: K.Maximum, Step: K.Step, Unit: K.Unit })).join("")}
      </div>
      <div class="mi-sub-label">${Camo ? "Camouflage palette" : "Field colour ramp"}</div>
      ${Camo
        ? `<div class="mi-stops-row camo">${[0, 1, 2, 3].map((I) => { const C = M.FieldInput(S.P, G.Identity, `colour${I}`); return `<label class="mi-stop" style="background:${C}"><input type="color" data-bind="camo:${I}" data-fid="camo:${I}" value="${C}" aria-label="Camo colour ${I + 1}"></label>`; }).join("")}</div>`
        : Stops("stop", Source.Stops || ["#000000", "#ffffff"])}`;
  } else if (Kind === "ramp") {
    Body = `<div class="mi-field">
        <canvas class="mi-preview" width="72" height="72" data-preview="${Key}" aria-label="Ramp preview"></canvas>
        <div class="mi-field-side">
          <div class="segmented small fill" role="radiogroup" aria-label="Ramp shape">
            ${M.RAMP_SHAPES.map((R) => `<button type="button" role="radio" aria-checked="${Source.Mode === R}" class="${Source.Mode === R ? "active" : ""}" data-act="ramp" data-shape="${R}">${R[0].toUpperCase() + R.slice(1)}</button>`).join("")}
          </div>
          ${Source.Mode === "radial" ? `<p class="mi-note">Centre-to-edge falloff in UV space.</p>` : Knob({ Bind: "angle", Label: "Angle", Value: Source.Angle || 0, Min: -180, Max: 180, Step: 1, Unit: "°" })}
        </div>
      </div>
      ${Stops("stop", Source.Stops || ["#000000", "#ffffff"])}`;
  } else if (Kind === "texture") {
    Body = `<label class="mi-drop ${Source.Texture ? "has" : ""}">
        ${Source.Texture ? `<img src="${Source.Texture.dataUrl}" alt="${Esc(Source.Texture.name)}">` : `<span class="mi-drop-empty">${icon("image", 22)}<small>Drop or choose a tile</small></span>`}
        <input type="file" accept="image/png,image/jpeg,image/webp" data-act="texture-file" aria-label="Choose channel image">
      </label>
      <div class="mi-texture-meta">
        <span>${Source.Texture ? `${Esc(Source.Texture.name)}<small>${Source.Texture.width} × ${Source.Texture.height} · embedded PNG</small>` : `No image<small>Resampled to ≤256 px PNG, stored in the material</small>`}</span>
        ${Source.Texture ? `<button type="button" class="mi-mini" data-act="texture-clear" aria-label="Remove image">${icon("close", 12)}</button>` : ""}
      </div>`;
  } else {
    Body = `<p class="mi-note">Driven by the active tileable pattern (Pattern workspace). Switch source to edit it here.</p>`;
  }
  const Direct = Kind !== "value" ? `<div class="switch-row"><span>Drive directly<small>${Source.Direct ? "Source replaces the base value" : "Source modulates the base value"}</small></span>${Toggle("direct", !!Source.Direct, "Drive directly")}</div>` : "";
  const Base = Kind !== "value" && Spec.Type !== "vector" ? `<div class="mi-sub-label">Base value</div>${ValueEditor(L, Key)}` : "";
  return `<div class="mi-editor" data-editor="${Key}">
    ${Tabs}
    ${Body}
    ${Base}
    ${Direct}
    <div class="mi-editor-foot">
      <code title="Parameter address">${Esc(Address)}</code>
      <button type="button" class="mi-text-btn" data-act="remove-channel" ${L.Channels.length <= 1 ? "disabled" : ""}>${icon("close", 11)}Remove</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------------------------------------ card
function StratumKnobs(L) {
  const Knobs = M.STRATUM_KNOBS[L.Model] || [];
  const Title = { surface: "Surface finish", coat: "Coat optics", flakes: "Flake dispersion", detail: "Detail presets" }[L.Model];
  const Open = S.Folds[L.Model] ?? false;
  let Inner = Knobs.map((K) => Knob({ Bind: `flat:${K.Key}`, Label: K.Label, Value: Number.isFinite(S.P[K.Key]) ? S.P[K.Key] : K.Default, Min: K.Minimum, Max: K.Maximum, Step: K.Step, Unit: K.Unit || "" })).join("");
  if (L.Model === "flakes") {
    const Colours = S.P.colors?.length ? S.P.colors : [S.P.color || "#e8c27a", "#ffffff"];
    Inner += `<div class="mi-sub-label">Flake palette</div>${Stops("palette", Colours, 8)}`;
  }
  if (L.Model === "detail")
    Inner += `<div class="mi-preset-row">${M.DETAIL_PRESETS.map((P) => `<button type="button" class="mi-chip" data-act="preset" data-preset="${P.Id}"><span class="mi-chip-swatch" style="background:linear-gradient(90deg, ${P.Stops.join(", ")})"></span>${P.Label}</button>`).join("")}</div><p class="mi-note">Presets drive this stratum's colour with a coded field.</p>`;
  return `<details class="mi-fold" data-fold="${L.Model}" ${Open ? "open" : ""}>
    <summary>${icon("sliders", 13)}<span>${Title}</span><small>${Esc(L.Name)}</small><span class="mi-chev">${icon("chevron", 11)}</span></summary>
    <div class="mi-fold-body">${Inner}</div>
  </details>`;
}

function AddMenu(L) {
  if (!S.AddOpen) return "";
  const Missing = M.CHANNELS.filter((C) => !L.Channels.includes(C.Key) && !(L.Model === "surface" && C.Key === "coverage"));
  return `<div class="mi-pop" role="menu" aria-label="Add channel">
    ${Missing.length ? M.GROUPS.map((G) => { const Items = Missing.filter((C) => C.Group === G); return Items.length ? `<div class="mi-pop-group"><small>${G}</small>${Items.map((C) => `<button type="button" role="menuitem" data-act="add-channel" data-ch="${C.Key}">${Esc(C.Caption)}<small>${Esc(C.Hint)}</small></button>`).join("")}</div>` : ""; }).join("") : `<p class="mi-empty">Every channel is already on this stratum.</p>`}
  </div>`;
}

function CardHtml() {
  const P = S.P, L = Layer(), Sum = M.Summary(P);
  const Entry = M.CATALOG.find((E) => E.id === P.id);
  return `<article class="mi-card" aria-label="Material Inspector">
    <header class="mi-head">
      <span class="mi-mark">${icon("material", 15)}</span>
      <div class="mi-head-title"><b>Material Inspector</b><small>LOOK-DEV PBR</small></div>
      <div class="mi-head-tools">
        <button type="button" class="icon-btn" data-act="undo" ${S.History.length ? "" : "disabled"} title="Undo (Ctrl+Z)" aria-label="Undo">${icon("undo", 14)}</button>
        <button type="button" class="icon-btn" data-act="redo" ${S.Future.length ? "" : "disabled"} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon("redo", 14)}</button>
        <label class="icon-btn" title="Import material JSON" aria-label="Import material JSON">${icon("upload", 14)}<input type="file" accept=".json,application/json" data-act="import" hidden></label>
        <button type="button" class="icon-btn" data-act="reset" title="Reset to library version" aria-label="Reset to library version">${icon("reset", 14)}</button>
      </div>
    </header>

    <section class="mi-ident">
      <span class="mi-eyebrow">${Esc((P.category || "Material").toUpperCase())} / ${String(M.CATALOG.findIndex((E) => E.id === P.id) + 1).padStart(2, "0")}</span>
      <input class="mi-name" data-act="name" data-fid="name" value="${Esc(P.name)}" maxlength="80" spellcheck="false" aria-label="Material name">
      <div class="mi-ident-row">
        <span class="mi-sub">${Esc(P.label || Entry?.label || "")}</span>
        <select class="mi-library" data-act="library" aria-label="Material library">
          ${M.CATALOG.map((E) => `<option value="${E.id}" ${E.id === P.id ? "selected" : ""}>${Esc(E.name)}</option>`).join("")}
          ${Entry ? "" : `<option value="${Esc(P.id)}" selected>${Esc(P.name)} (imported)</option>`}
        </select>
      </div>
    </section>

    <section class="mi-metrics">
      <div class="mi-metric hot" data-scrub-flat="roughness" title="Drag to scrub roughness"><span>Roughness</span><strong data-metric="roughness">${Sum.Roughness.toFixed(2)}</strong><small>Microfacet</small></div>
      <div class="mi-metric" data-scrub-flat="metalness" title="Drag to scrub metalness"><span>Metalness</span><strong data-metric="metalness">${Math.round(Sum.Metalness * 100)}%</strong><small>Conductor</small></div>
      <div class="mi-metric"><span>Strata</span><strong>${Sum.Enabled}/${Sum.Total}</strong><small>${Sum.Authored} driven</small></div>
    </section>

    <section class="mi-strata">
      <div class="mi-section-title"><h3>Strata</h3><small>TOP → BOTTOM</small>
        <button type="button" class="mi-text-btn" data-act="add-detail" ${P.Authoring.Layers.length >= 16 ? "disabled" : ""}>${icon("plus", 11)}Detail</button></div>
      <div class="mi-strata-strip" role="tablist" aria-label="Strata">
        ${P.Authoring.Layers.map((E) => `<div class="mi-stratum ${E.Identity === L.Identity ? "active" : ""} ${E.Enabled ? "" : "off"}" role="tab" aria-selected="${E.Identity === L.Identity}">
          <button type="button" class="mi-dot" data-act="layer-toggle" data-layer="${E.Identity}" role="switch" aria-checked="${E.Enabled}" title="${E.Enabled ? "Disable" : "Enable"} ${Esc(E.Name)}" aria-label="${E.Enabled ? "Disable" : "Enable"} ${Esc(E.Name)}"></button>
          ${S.Renaming === E.Identity
            ? `<input class="mi-rename" data-act="rename" data-layer="${E.Identity}" data-fid="rename" value="${Esc(E.Name)}" maxlength="80" aria-label="Stratum name">`
            : `<button type="button" class="mi-stratum-name" data-act="layer" data-layer="${E.Identity}" title="${Esc(E.Name)} · double-click to rename">${icon(MODEL_GLYPH[E.Model], 13)}<span class="mi-label">${Esc(E.Name)}</span><small>${Esc(M.MODELS[E.Model].Label.toUpperCase())} · ${E.Channels.length} CH</small></button>`}
          ${E.Model === "detail" && E.Identity === L.Identity ? `<button type="button" class="mi-x" data-act="remove-layer" data-layer="${E.Identity}" aria-label="Remove ${Esc(E.Name)}">${icon("close", 10)}</button>` : ""}
        </div>`).join("")}
      </div>
    </section>

    <section class="mi-channels">
      <div class="mi-section-title"><h3>Channels</h3><small>${L.Channels.length} ON ${Esc(M.MODELS[L.Model].Label.toUpperCase())}</small>
        <div class="mi-add-wrap">
          <button type="button" class="mi-text-btn" data-act="add-toggle" aria-expanded="${S.AddOpen}">${icon("plus", 11)}Channel</button>
          ${AddMenu(L)}
        </div>
      </div>
      <label class="mi-search">${icon("search", 13)}<input type="search" data-act="search" data-fid="search" value="${Esc(S.Query)}" placeholder="Filter ${L.Channels.length} channels…" aria-label="Filter channels"></label>
      <div class="mi-list" data-list>${GroupsHtml(L)}</div>
    </section>

    ${StratumKnobs(L)}

    <footer class="mi-foot">
      <div class="mi-export">
        <button type="button" class="primary" data-act="export-toml">${icon("download", 13)}.material</button>
        <button type="button" data-act="export-json">${icon("download", 13)}JSON</button>
        <button type="button" data-act="copy-toml" title="Copy .material TOML">${icon("copy", 13)}Copy</button>
      </div>
      <div class="mi-foot-line"><span class="mi-status ${S.Status ? "on" : ""}" data-status>${Esc(S.Status || "Saved locally")}</span><span>Drag values to scrub · ↑↓ channels</span></div>
    </footer>
  </article>`;
}

// ------------------------------------------------------------------------------------------------ previews
const ThumbCache = new Map();
function Ctx(Canvas) { try { return Canvas.getContext("2d"); } catch { return null; } }

function Paint(Canvas, Source) {
  const C = Ctx(Canvas);
  if (!C) return false;
  const W = Canvas.width, H = Canvas.height, Img = C.createImageData(W, H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const [R, G, B] = M.SampleSource(S.P, Source, (X + 0.5) / W, (Y + 0.5) / H), O = (Y * W + X) * 4;
    Img.data[O] = R; Img.data[O + 1] = G; Img.data[O + 2] = B; Img.data[O + 3] = 255;
  }
  C.putImageData(Img, 0, 0);
  return true;
}

function FieldKey(Source) {
  const G = Source.Generator, Inputs = Object.entries(S.P.Authoring.Inputs).filter(([K]) => K.startsWith(`field:${G}:`));
  const Proc = S.P.Authoring.Generators.find((E) => E.Identity === G)?.Procedure;
  return JSON.stringify([Proc, Source.Stops, Inputs]);
}

function DrawPreviews() {
  const L = Layer();
  for (const Canvas of Root.querySelectorAll("canvas[data-preview]")) Paint(Canvas, M.ChannelSource(S.P, L, Canvas.dataset.preview));
  for (const El of Root.querySelectorAll("[data-thumb]")) {
    const Source = M.ChannelSource(S.P, L, El.dataset.thumb);
    if (Source.Mode !== "field") continue;
    const Key = FieldKey(Source);
    let Url = ThumbCache.get(Key);
    if (Url === undefined) {
      const Canvas = document.createElement("canvas");
      Canvas.width = Canvas.height = 24;
      Url = null;
      try { if (Paint(Canvas, Source)) Url = Canvas.toDataURL("image/png"); } catch { Url = null; }
      if (ThumbCache.size > 200) ThumbCache.clear();
      ThumbCache.set(Key, Url);
    }
    if (Url) El.style.background = `url(${Url}) center/cover`;
  }
}

// ------------------------------------------------------------------------------------------------ render
function Render() {
  const Focus = document.activeElement?.closest?.(".mi-card") ? document.activeElement.dataset.fid : null;
  const Sel = Focus && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const Scroll = document.scrollingElement?.scrollTop ?? 0;
  Root.innerHTML = CardHtml();
  DrawPreviews();
  if (Focus) {
    const El = Root.querySelector(`[data-fid="${CSS.escape(Focus)}"]`);
    if (El) { El.focus({ preventScroll: true }); if (Sel) try { El.setSelectionRange(...Sel); } catch { /* number inputs */ } }
  }
  if (document.scrollingElement) document.scrollingElement.scrollTop = Scroll;
}

// Cheap refresh during drags: metrics, the open row's head and its previews; inputs being dragged keep their own state.
function RefreshLive() {
  const Sum = M.Summary(S.P), L = Layer();
  const R = Root.querySelector('[data-metric="roughness"]'), Mt = Root.querySelector('[data-metric="metalness"]');
  if (R) R.textContent = Sum.Roughness.toFixed(2);
  if (Mt) Mt.textContent = `${Math.round(Sum.Metalness * 100)}%`;
  for (const Row of Root.querySelectorAll("[data-row]")) {
    const Key = Row.dataset.row, Head = Row.querySelector(".mi-row-head");
    if (!Head) continue;
    const T = document.createElement("template");
    T.innerHTML = RowHead(L, Key).trim();
    const Fresh = T.content.firstElementChild;
    // Patch in place (never replace): a scrub drag holds pointer capture on the readout element.
    for (const Selector of [".mi-swatch", ".mi-readout"]) {
      const Old = Head.querySelector(Selector), New = Fresh.querySelector(Selector);
      if (!Old || !New) continue;
      Old.className = New.className;
      Old.setAttribute("style", New.getAttribute("style") || "");
      if (Old.innerHTML !== New.innerHTML) Old.innerHTML = New.innerHTML;
      for (const A of ["data-thumb", "data-scrub", "title"]) New.hasAttribute(A) ? Old.setAttribute(A, New.getAttribute(A)) : Old.removeAttribute(A);
    }
  }
  for (const Bar of Root.querySelectorAll("[data-stops]")) {
    const Colours = [...Bar.querySelectorAll('.mi-stop input[type="color"]')].map((I) => I.value);
    Bar.querySelector(".mi-stops-bar").style.background = `linear-gradient(90deg, ${Colours.join(", ")})`;
    Bar.querySelectorAll(".mi-stop").forEach((S, I) => { S.style.background = Colours[I]; });
  }
  DrawPreviews();
}

// ------------------------------------------------------------------------------------------------ bindings
function Write(Bind, Raw) {
  const L = Layer(), Key = S.Channel;
  const Source = Key ? M.ChannelSource(S.P, L, Key) : null;
  if (Bind === "ch") return M.WriteChannel(S.P, L, Key, M.CHANNEL[Key].Type === "scalar" ? +Raw : Raw);
  if (Bind.startsWith("vec:")) { const V = [...M.ReadChannel(S.P, L, Key)]; V[+Bind.slice(4)] = Math.max(-1, Math.min(1, +Raw || 0)); return M.WriteChannel(S.P, L, Key, V); }
  if (Bind.startsWith("field:")) return M.WriteFieldInput(S.P, Source.Generator, Bind.slice(6), +Raw);
  if (Bind.startsWith("camo:")) return /^#[0-9a-f]{6}$/i.test(Raw) ? M.WriteFieldInput(S.P, Source.Generator, `colour${Bind.slice(5)}`, Raw) : S.P;
  if (Bind === "angle") return M.PatchSource(S.P, L, Key, { Angle: +Raw });
  if (Bind.startsWith("stop:")) { const Stops = [...(Source.Stops || ["#000000", "#ffffff"])]; Stops[+Bind.slice(5)] = Raw; return M.PatchSource(S.P, L, Key, { Stops }); }
  if (Bind.startsWith("palette:")) {
    if (!/^#[0-9a-f]{6}$/i.test(Raw)) return S.P;
    const Next = structuredClone(S.P), Colours = Next.colors?.length ? Next.colors : [Next.color || "#e8c27a", "#ffffff"];
    Colours[+Bind.slice(8)] = Raw.toLowerCase(); Next.colors = Colours;
    return Next;
  }
  if (Bind.startsWith("flat:")) {
    const K = M.STRATUM_KNOBS[L.Model].find((E) => E.Key === Bind.slice(5));
    if (!K) return S.P;
    const V = Math.max(K.Minimum, Math.min(K.Maximum, +Raw));
    return Number.isFinite(V) ? M.WriteParameter(S.P, K.Key, V) : S.P;
  }
  return S.P;
}

function SyncSiblings(El) {
  const Bind = El.dataset.bind;
  for (const Other of Root.querySelectorAll(`[data-bind="${CSS.escape(Bind)}"]`)) {
    if (Other === El) continue;
    if (Other.type === "range") { Other.value = El.value; Other.style.setProperty("--fill", Pct(+El.value, +Other.min, +Other.max)); }
    else if (Other.type === "number") Other.value = Fixed(+El.value, +Other.step);
    else if (Other.type === "color") { Other.value = El.value; Other.parentElement.style.background = El.value; }
    else if (Other.dataset.hex !== undefined) Other.value = El.value.toUpperCase();
  }
  if (El.type === "range") El.style.setProperty("--fill", Pct(+El.value, +El.min, +El.max));
  if (El.type === "color") El.parentElement.style.background = El.value;
}

function SetChannel(Key) {
  S.Channel = Key;
  S.AddOpen = false;
}

function VisibleRows() { return [...Root.querySelectorAll(".mi-row-head")].map((E) => E.dataset.ch); }

// ------------------------------------------------------------------------------------------------ events
function OnClick(Event) {
  const El = Event.target.closest("[data-act]");
  if (!El || !Root.contains(El) || El.disabled) {
    if (S.AddOpen && !Event.target.closest(".mi-add-wrap")) { S.AddOpen = false; Render(); }
    return;
  }
  const Act = El.dataset.act, L = Layer();
  if (["search", "name", "rename", "library", "import", "texture-file"].includes(Act)) return;
  if (Act === "open") {
    if (Event.target.closest("[data-scrub]")?.dataset.dragged === "1") return;
    SetChannel(S.Channel === El.dataset.ch ? null : El.dataset.ch);
  } else if (Act === "group") S.Groups[El.dataset.groupId] = El.dataset.open !== "true";
  else if (Act === "layer") {
    if (Event.detail >= 2) { S.Renaming = El.dataset.layer; Render(); Root.querySelector(".mi-rename")?.select(); return; }
    if (S.LayerId !== El.dataset.layer) {
      S.LayerId = El.dataset.layer; S.Query = ""; S.AddOpen = false;
      const Next = Layer();
      if (!Next.Channels.includes(S.Channel)) S.Channel = Next.Channels.includes("colour") ? "colour" : Next.Channels[0];
    }
  } else if (Act === "layer-toggle") {
    const Target = M.FindLayer(S.P, El.dataset.layer);
    Apply(M.PatchLayer(S.P, Target.Identity, { Enabled: !Target.Enabled }));
    Flash(`${Target.Name} ${Target.Enabled ? "disabled" : "enabled"}`);
  } else if (Act === "add-detail") {
    const R = M.AddDetailLayer(S.P);
    if (R.Identity) { Apply(R.P); S.LayerId = R.Identity; S.Channel = "colour"; Flash("Detail stratum added"); }
  } else if (Act === "remove-layer") {
    const Name = M.FindLayer(S.P, El.dataset.layer)?.Name;
    Apply(M.RemoveLayer(S.P, El.dataset.layer));
    S.LayerId = Layer().Identity; S.Channel = Layer().Channels[0];
    Flash(`${Name} removed`);
  } else if (Act === "source") {
    Apply(M.SetSourceMode(S.P, L, S.Channel, El.dataset.kind));
  } else if (Act === "ramp") {
    Apply(M.SetSourceMode(S.P, L, S.Channel, "ramp", El.dataset.shape));
  } else if (Act === "gen") {
    Apply(M.SetGeneratorProcedure(S.P, M.ChannelSource(S.P, L, S.Channel).Generator, El.dataset.gen));
  } else if (Act === "direct") {
    Apply(M.PatchSource(S.P, L, S.Channel, { Direct: !M.ChannelSource(S.P, L, S.Channel).Direct }));
  } else if (Act === "vec-flat") {
    Apply(M.WriteChannel(S.P, L, S.Channel, [0, 0, 1]));
  } else if (Act === "stop-add" || Act === "stop-remove") {
    const Target = El.dataset.target;
    const Colours = Target === "palette" ? [...(S.P.colors?.length ? S.P.colors : [S.P.color || "#e8c27a", "#ffffff"])] : [...(M.ChannelSource(S.P, L, S.Channel).Stops || ["#000000", "#ffffff"])];
    if (Act === "stop-add" && Colours.length < 8) {
      const A = M.HexRgb(Colours.at(-2)), B = M.HexRgb(Colours.at(-1));
      Colours.splice(Colours.length - 1, 0, M.RgbHex(A.map((V, I) => (V + B[I]) / 2)));
    } else if (Act === "stop-remove" && Colours.length > 2) Colours.pop();
    if (Target === "palette") { const Next = structuredClone(S.P); Next.colors = Colours; Apply(Next); }
    else Apply(M.PatchSource(S.P, L, S.Channel, { Stops: Colours }));
  } else if (Act === "texture-clear") {
    Apply(M.PatchSource(S.P, L, S.Channel, { Texture: null }));
  } else if (Act === "remove-channel") {
    const Key = S.Channel, Rows = VisibleRows(), At = Rows.indexOf(Key);
    Apply(M.RemoveChannel(S.P, L.Identity, Key));
    S.Channel = Rows.filter((K) => K !== Key)[Math.max(0, At - 1)] || Layer().Channels[0];
    Flash(`${M.CHANNEL[Key].Caption} removed from ${L.Name}`);
  } else if (Act === "add-toggle") S.AddOpen = !S.AddOpen;
  else if (Act === "add-channel") {
    Apply(M.AddChannel(S.P, L.Identity, El.dataset.ch));
    SetChannel(El.dataset.ch);
    S.Query = "";
    S.Groups[`${L.Identity}:${M.CHANNEL[El.dataset.ch].Group}`] = true;
    Flash(`${M.CHANNEL[El.dataset.ch].Caption} added`);
  } else if (Act === "preset") {
    Apply(M.ApplyDetailPreset(S.P, L.Identity, El.dataset.preset));
    SetChannel("colour");
  } else if (Act === "undo") return Step(true);
  else if (Act === "redo") return Step(false);
  else if (Act === "reset") {
    Select(M.CreateMaterial(S.P.id));
    Flash("Reset to library version");
  } else if (Act === "export-toml") return Download(M.ExportToml(S.P), `${M.Slug(S.P.name)}.material`, "text/plain"), Flash("Exported .material TOML");
  else if (Act === "export-json") return Download(M.ExportJson(S.P), `${M.Slug(S.P.name)}.json`, "application/json"), Flash("Exported material JSON");
  else if (Act === "copy-toml") {
    const Text = M.ExportToml(S.P);
    (navigator.clipboard?.writeText(Text) || Promise.reject()).then(() => Flash("Copied .material TOML"), () => Flash("Clipboard unavailable"));
    return;
  }
  Render();
  if (Act === "open" && S.Channel) Root.querySelector(`[data-fid="row:${S.Channel}"]`)?.focus({ preventScroll: true });
}

function Download(Text, Name, Type) {
  const Url = URL.createObjectURL(new Blob([Text], { type: Type })), A = document.createElement("a");
  A.href = Url; A.download = Name; A.click();
  setTimeout(() => URL.revokeObjectURL(Url), 1000);
}

function OnInput(Event) {
  const El = Event.target;
  if (El.dataset.act === "search") { S.Query = El.value; Render(); return; }
  if (El.dataset.act === "name") { Apply({ ...S.P, name: El.value.slice(0, 80) || "Untitled material" }, true); return; }
  if (!El.dataset.bind || El.dataset.hex !== undefined) return;
  if (El.type === "number" && (El.value === "" || !Number.isFinite(+El.value))) return;
  Apply(Write(El.dataset.bind, El.value), true);
  SyncSiblings(El);
  RefreshLive();
}

async function OnChange(Event) {
  const El = Event.target, Act = El.dataset.act;
  if (Act === "library") {
    Settle();
    Select(LoadStored(El.value));
    Render();
    Flash(`Loaded ${S.P.name}`);
    return;
  }
  if (Act === "name") { Settle(); Render(); return; }
  if (Act === "rename") return FinishRename(El);
  if (Act === "import") {
    const File = El.files?.[0];
    El.value = "";
    if (!File) return;
    try {
      const P = M.Load(await File.text());
      if (!P.id) P.id = M.Slug(P.name);
      Select(P);
      Render();
      Flash(`Imported ${P.name}`);
    } catch (Error) { Flash(`Import failed · ${Error.message}`); }
    return;
  }
  if (Act === "texture-file") {
    const File = El.files?.[0];
    if (!File) return;
    try {
      const { importTextureSource } = await import("./Engine/textureSource.js");
      const Texture = await importTextureSource(File);
      Apply(M.PatchSource(S.P, Layer(), S.Channel, { Texture }));
      Render();
      Flash("Image embedded");
    } catch (Error) { Flash(Error.message || "Image could not be decoded"); }
    return;
  }
  if (El.dataset.hex !== undefined) {
    const V = El.value.trim().startsWith("#") ? El.value.trim() : "#" + El.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(V)) Apply(Write(El.dataset.bind, V.toLowerCase()));
    Render();
    return;
  }
  if (El.dataset.bind) {
    if (El.type === "number" && Number.isFinite(+El.value) && El.value !== "") Apply(Write(El.dataset.bind, El.value), true);
    Settle();
    Render();
  }
}

function FinishRename(El) {
  if (S.Renaming === null) return;
  const Id = S.Renaming;
  S.Renaming = null;
  Apply(M.PatchLayer(S.P, Id, { Name: El.value.trim() || "Stratum" }));
  Render();
}

function OnKey(Event) {
  const T = Event.target, Typing = T.matches?.("input, textarea, select");
  if ((Event.ctrlKey || Event.metaKey) && !Event.altKey && (Event.key === "z" || Event.key === "Z" || Event.key === "y")) {
    if (Typing && T.type !== "range" && T.type !== "color") return;
    Event.preventDefault();
    return Step(!(Event.key === "y" || Event.shiftKey));
  }
  if (T.dataset?.act === "rename") {
    if (Event.key === "Enter") { Event.preventDefault(); FinishRename(T); }
    else if (Event.key === "Escape") { S.Renaming = null; Render(); }
    return;
  }
  if (T.dataset?.hex !== undefined && Event.key === "Enter") { T.blur(); return; }
  if (T.classList?.contains("mi-row-head") && (Event.key === "ArrowDown" || Event.key === "ArrowUp")) {
    Event.preventDefault();
    const Rows = VisibleRows(), At = Rows.indexOf(T.dataset.ch), Next = Rows[Math.max(0, Math.min(Rows.length - 1, At + (Event.key === "ArrowDown" ? 1 : -1)))];
    if (Next && Next !== T.dataset.ch) { SetChannel(Next); Render(); Root.querySelector(`[data-fid="row:${Next}"]`)?.focus(); }
    return;
  }
  if (Event.key === "Escape" && !Typing) {
    if (S.AddOpen) S.AddOpen = false;
    else if (S.Channel) S.Channel = null;
    else return;
    Render();
  }
}

// Drag-to-scrub on row readouts (scalar channels) and on the roughness / metalness tiles.
function OnPointerDown(Event) {
  const Readout = Event.target.closest("[data-scrub]"), Tile = Event.target.closest("[data-scrub-flat]");
  if ((!Readout && !Tile) || Event.button !== 0) return;
  const L = Layer();
  const Key = Readout ? Readout.dataset.scrub : null, Flat = Tile ? Tile.dataset.scrubFlat : null;
  const Spec = Key ? M.CHANNEL[Key] : { Minimum: 0, Maximum: 1 };
  const Start = Key ? M.ReadChannel(S.P, L, Key) : +(S.P[Flat] ?? 0);
  const X0 = Event.clientX, Target = Readout || Tile;
  let Moved = false;
  if (Readout) Readout.dataset.dragged = "0";
  Target.setPointerCapture?.(Event.pointerId);
  const Move = (E) => {
    const Dx = E.clientX - X0;
    if (!Moved && Math.abs(Dx) < 3) return;
    Moved = true;
    Root.classList.add("scrubbing");
    const Span = Spec.Maximum - Spec.Minimum, V = Math.max(Spec.Minimum, Math.min(Spec.Maximum, Start + (Dx / (E.shiftKey ? 800 : 200)) * Span));
    const Rounded = Span > 100 ? Math.round(V) : Math.round(V * 1000) / 1000;
    Apply(Key ? M.WriteChannel(S.P, L, Key, Rounded) : M.WriteParameter(S.P, Flat, Rounded), true);
    RefreshLive();
  };
  const Up = () => {
    Target.removeEventListener("pointermove", Move);
    Target.removeEventListener("pointerup", Up);
    Target.removeEventListener("pointercancel", Up);
    Root.classList.remove("scrubbing");
    if (!Moved) return;
    const Dragged = Root.querySelector(`[data-scrub="${Key}"]`);
    if (Dragged) Dragged.dataset.dragged = "1";
    Settle();
    // Swallow the click that follows a drag, then rebuild so open editors show the new value.
    setTimeout(Render, 0);
  };
  Target.addEventListener("pointermove", Move);
  Target.addEventListener("pointerup", Up);
  Target.addEventListener("pointercancel", Up);
}

function OnToggle(Event) {
  const Fold = Event.target.closest?.("[data-fold]");
  if (Fold) S.Folds[Fold.dataset.fold] = Fold.open;
}

function OnStorage(Event) {
  if (!Event.key || Event.key !== M.STORAGE_PREFIX + S.P.id || !Event.newValue) return;
  try {
    const P = M.Load(Event.newValue);
    S.P = P;
    if (!M.FindLayer(S.P, S.LayerId)) S.LayerId = Layer().Identity;
    if (S.Channel && !Layer().Channels.includes(S.Channel)) S.Channel = null;
    Render();
    Flash("Synced from another window");
  } catch { /* ignore malformed writes */ }
}

// ------------------------------------------------------------------------------------------------ boot
export function Mount(Host, Options = {}) {
  Root = Host;
  const Wanted = Options.material || new URLSearchParams(location.search).get("material") || Store?.getItem(M.STORAGE_CURRENT) || M.CATALOG[0].id;
  Select(LoadStored(M.CATALOG.some((E) => E.id === Wanted) ? Wanted : M.CATALOG[0].id));
  Root.addEventListener("click", OnClick);
  Root.addEventListener("input", OnInput);
  Root.addEventListener("change", OnChange);
  Root.addEventListener("pointerdown", OnPointerDown);
  Root.addEventListener("toggle", OnToggle, true);
  Root.addEventListener("focusout", (E) => { if (E.target.dataset?.act === "rename") FinishRename(E.target); });
  Root.addEventListener("dragover", (E) => { if (E.target.closest(".mi-drop")) E.preventDefault(); });
  Root.addEventListener("drop", (E) => {
    const Drop = E.target.closest(".mi-drop");
    if (!Drop || !E.dataTransfer?.files?.length) return;
    E.preventDefault();
    const Input = Drop.querySelector("input[type=file]");
    try { Input.files = E.dataTransfer.files; Input.dispatchEvent(new Event("change", { bubbles: true })); } catch { /* read-only FileList in some engines */ }
  });
  document.addEventListener("keydown", OnKey);
  document.addEventListener("click", (E) => { if (S.AddOpen && E.target.isConnected && !Root.contains(E.target)) { S.AddOpen = false; Render(); } });
  globalThis.addEventListener?.("storage", OnStorage);
  Render();
  return { State: S, Render, Model: M };
}
