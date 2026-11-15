// CardKit.js — the small template + plumbing kit shared by the Project Zero inspector cards
// (Material Inspector, Pattern / Stamp Studio card, Map Baking card).  Pure string templates and DOM helpers; no state.

import { icon } from "./Icons.js";

export const Esc = (S) => String(S).replace(/[&<>"']/g, (C) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[C]);
export const Fixed = (V, Step) => (Step >= 1 ? String(Math.round(V)) : (+V).toFixed(Step >= 0.1 ? 1 : 2));
export const Pct = (V, Lo, Hi) => `${(((V - Lo) / (Hi - Lo || 1)) * 100).toFixed(1)}%`;
export const Clamp = (V, Lo, Hi) => Math.max(Lo, Math.min(Hi, V));
export const HEX = /^#[0-9a-f]{6}$/i;

// Labelled pill slider with a typed value box.  Bind is the data-bind address the card's Write() understands.
export function Knob({ Bind, Label, Value, Min, Max, Step: St, Unit = "", Hint = "", Tools = "" }) {
  return `<div class="mi-knob">
    <span class="mi-knob-label"><span>${Esc(Label)}</span>${Hint ? `<small>${Esc(Hint)}</small>` : ""}${Tools}</span>
    <div class="slider-pill">
      <span class="split-value"><input type="number" data-bind="${Bind}" data-fid="n:${Bind}" min="${Min}" max="${Max}" step="${St}" value="${Fixed(Value, St)}" aria-label="${Esc(Label)}"><small>${Esc(Unit || "—")}</small></span>
      <input type="range" data-bind="${Bind}" data-fid="r:${Bind}" min="${Min}" max="${Max}" step="${St}" value="${Value}" style="--fill:${Pct(Value, Min, Max)}" aria-label="${Esc(Label)} slider">
    </div>
  </div>`;
}

export function ColourField(Bind, Label, Value, Note = "sRGB") {
  return `<div class="mi-colour">
    <label class="mi-colour-chip" style="background:${Value}"><input type="color" data-bind="${Bind}" data-fid="c:${Bind}" value="${Value}" aria-label="${Esc(Label)}"></label>
    <input class="mi-hex" data-bind="${Bind}" data-hex data-fid="h:${Bind}" value="${String(Value).toUpperCase()}" maxlength="7" spellcheck="false" aria-label="${Esc(Label)} hex">
    <small>${Esc(Note)}</small>
  </div>`;
}

// Colour ramp: bar + one swatch per stop + add / remove.  Stop inputs bind as `${Bind}:${Index}`.
export function Stops(Bind, Colours, Max = 8, Min = 2) {
  return `<div class="mi-stops" data-stops="${Bind}">
    <div class="mi-stops-bar" style="background:linear-gradient(90deg, ${Colours.join(", ")})"></div>
    <div class="mi-stops-row">
      ${Colours.map((C, I) => `<label class="mi-stop" style="background:${C}" title="Stop ${I + 1} · ${C}"><input type="color" data-bind="${Bind}:${I}" data-fid="s:${Bind}:${I}" value="${C}" aria-label="Stop ${I + 1}"></label>`).join("")}
      <span class="mi-stops-tools">
        <button type="button" class="mi-mini" data-act="stop-remove" data-target="${Bind}" ${Colours.length <= Min ? "disabled" : ""} aria-label="Remove a stop">${icon("minus", 12)}</button>
        <button type="button" class="mi-mini" data-act="stop-add" data-target="${Bind}" ${Colours.length >= Max ? "disabled" : ""} aria-label="Add stop">${icon("plus", 12)}</button>
      </span>
    </div>
  </div>`;
}

export function Toggle(Act, On, Label, Extra = "") {
  return `<button type="button" class="toggle ${On ? "on" : ""}" data-act="${Act}" ${Extra} role="switch" aria-checked="${On}" aria-label="${Esc(Label)}"><i></i></button>`;
}

export function SwitchRow(Act, On, Label, Hint = "", Extra = "") {
  return `<div class="switch-row"><span>${Esc(Label)}${Hint ? `<small>${Esc(Hint)}</small>` : ""}</span>${Toggle(Act, On, Label, Extra)}</div>`;
}

// Segmented choice.  Options: [[Label, Value], …]; emits data-act=Act data-value=Value.
export function Segments(Act, Options, Current, { Small = true, Fill = true, Label = "", Extra = "" } = {}) {
  return `<div class="segmented ${Small ? "small" : ""} ${Fill ? "fill" : ""}" role="radiogroup" aria-label="${Esc(Label)}">
    ${Options.map(([L, V, Ic]) => `<button type="button" role="radio" aria-checked="${String(V) === String(Current)}" class="${String(V) === String(Current) ? "active" : ""}" data-act="${Act}" data-value="${Esc(V)}" ${Extra}>${Ic ? icon(Ic, 11) : ""}${Esc(L)}</button>`).join("")}
  </div>`;
}

// Chip grid choice (more than ~4 options).
export function Chips(Act, Options, Current, { Columns = 3, Label = "", Extra = "" } = {}) {
  return `<div class="mi-chip-grid" style="--cols:${Columns}" role="radiogroup" aria-label="${Esc(Label)}">
    ${Options.map(([L, V, Ic]) => `<button type="button" role="radio" aria-checked="${String(V) === String(Current)}" class="mi-chip ${String(V) === String(Current) ? "active" : ""}" data-act="${Act}" data-value="${Esc(V)}" ${Extra} title="${Esc(L)}">${Ic || ""}${Esc(L)}</button>`).join("")}
  </div>`;
}

// ------------------------------------------------------------------------------------------------ statistic tiles
// A stat tile is label · value · a 10 px meter · one quiet caption.  Meter kinds:
//   { Kind:"stack", Parts:[{ Share, Colour, Title }] }        — composition (layers, sources, map groups)
//   { Kind:"band", Lo, Hi, At, Tone }                           — a valid range with a tick where the value sits
//   { Kind:"fill", At, Colour }                                 — a simple 0‥1 gauge
//   { Kind:"swatches", Colours:[…] }                            — palette strip
//   { Kind:"steps", Count, Done, Active }                       — discrete progress
export function Meter(M = {}) {
  if (M.Kind === "stack") {
    const Total = M.Parts.reduce((A, P) => A + P.Share, 0) || 1;
    const Parts = M.Parts.filter((P) => P.Share > 0);
    return `<span class="mi-meter stack">${Parts.length ? Parts.map((P) => `<i style="flex:${P.Share / Total};background:${P.Colour}" title="${Esc(P.Title || "")}"></i>`).join("") : `<i class="none"></i>`}</span>`;
  }
  if (M.Kind === "band")
    return `<span class="mi-meter band"><b style="left:${Clamp(M.Lo, 0, 1) * 100}%;width:${(Clamp(M.Hi, 0, 1) - Clamp(M.Lo, 0, 1)) * 100}%"></b><em class="tone-${M.Tone || "ok"}" style="left:${Clamp(M.At, 0, 1) * 100}%"></em></span>`;
  if (M.Kind === "fill") return `<span class="mi-meter fill"><i style="width:${Clamp(M.At, 0, 1) * 100}%;background:${M.Colour || "#8d8d8d"}"></i></span>`;
  if (M.Kind === "swatches") return `<span class="mi-meter swatches">${M.Colours.slice(0, 10).map((C) => `<i style="background:${C}" title="${C}"></i>`).join("")}</span>`;
  if (M.Kind === "steps")
    return `<span class="mi-meter steps">${Array.from({ length: Math.max(1, M.Count) }, (_, I) => `<i class="${I < M.Done ? "done" : I === M.Done && M.Active ? "active" : ""}"></i>`).join("")}</span>`;
  return `<span class="mi-meter"></span>`;
}

export function StatTile({ Label, Value, Unit = "", Caption = "", Meter: Mtr, Hot = false, Tone = "", Title = "", Key = "" }) {
  return `<div class="mi-metric ${Hot ? "hot" : ""} ${Tone ? `tone-${Tone}` : ""}" ${Key ? `data-stat="${Key}"` : ""} title="${Esc(Title)}">
    <span>${Esc(Label)}</span>
    <strong>${Esc(Value)}${Unit ? `<em>${Esc(Unit)}</em>` : ""}</strong>
    ${Meter(Mtr)}
    <small>${Esc(Caption)}</small>
  </div>`;
}

// ------------------------------------------------------------------------------------------------ DOM helpers
export function SyncSiblings(Root, El) {
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

export function Download(Text, Name, Type) {
  const Url = URL.createObjectURL(new Blob([Text], { type: Type })), A = document.createElement("a");
  A.href = Url; A.download = Name; A.click();
  setTimeout(() => URL.revokeObjectURL(Url), 1000);
}

// Re-render that keeps focus, caret and page scroll (cards rebuild innerHTML wholesale).
export function Rebuild(Root, Html, Selector) {
  const Active = document.activeElement;
  const Focus = Active?.closest?.(Selector) ? Active.dataset.fid : null;
  const Sel = Focus && Active.selectionStart != null ? [Active.selectionStart, Active.selectionEnd] : null;
  const Scroll = document.scrollingElement?.scrollTop ?? 0;
  Root.innerHTML = Html;
  if (Focus) {
    const El = Root.querySelector(`[data-fid="${CSS.escape(Focus)}"]`);
    if (El) { El.focus({ preventScroll: true }); if (Sel) try { El.setSelectionRange(...Sel); } catch { /* number inputs */ } }
  }
  if (document.scrollingElement) document.scrollingElement.scrollTop = Scroll;
}

// JSON-snapshot undo history with live-edit coalescing (a drag is one step).
export function History(Limit = 80) {
  const H = { Past: [], Future: [], Pending: null };
  H.Begin = (Current) => { if (H.Pending === null) H.Pending = JSON.stringify(Current); };
  H.Settle = (Current) => {
    if (H.Pending === null) return false;
    const Changed = H.Pending !== JSON.stringify(Current);
    if (Changed) { H.Past.push(H.Pending); if (H.Past.length > Limit) H.Past.shift(); H.Future = []; }
    H.Pending = null;
    return Changed;
  };
  H.Step = (Back, Current) => {
    const From = Back ? H.Past : H.Future, To = Back ? H.Future : H.Past;
    if (!From.length) return null;
    To.push(JSON.stringify(Current));
    return JSON.parse(From.pop());
  };
  H.Clear = () => { H.Past = []; H.Future = []; H.Pending = null; };
  return H;
}

// Card switcher shown on the demo dock (outside the card) so the four cards are one click apart.
export function DockNav(Current) {
  const Cards = [["material", "Material", "../MaterialInspector/"], ["pattern", "Pattern", "../ArtworkInspector/?mode=pattern"], ["stamp", "Stamp", "../ArtworkInspector/?mode=stamp"], ["bake", "Baking", "../BakeInspector/"], ["brush", "Brush", "../BrushStudio/"]];
  return `<nav class="mi-docknav" aria-label="Inspector cards">${Cards.map(([Id, L, Href]) => `<a href="${Href}" class="${Id === Current ? "active" : ""}" ${Id === Current ? 'aria-current="page"' : ""}>${icon(Id, 12)}${L}</a>`).join("")}</nav>`;
}
