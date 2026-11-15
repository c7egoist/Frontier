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

// Pick lists — anything with more than ~4 options — are a dropdown, not a chip grid (shape, blend, finish, field generator,
// starter library, brush shape source, …).  Chips() keeps its old signature so every caller became a dropdown at once.
export function Chips(Act, Options, Current, { Label = "", Extra = "" } = {}) {
  return Dropdown(Act, Options, Current, { Label, Extra });
}

// Project Zero dropdown.  Options: [Label, Value, Lead?, Hint?] or { Group: "Heading" }.  Lead is an icon name or raw
// HTML (a swatch, a glyph, a thumbnail).  Each option is a button carrying data-act=Act data-value=Value (+ Extra), so a
// card's existing click delegation handles the pick unchanged.  Open / close, outside-click, keyboard (↑ ↓ Home End
// Enter Esc, type to filter) and viewport-safe placement live in one document-level installer (InstallDropdowns).
export function Dropdown(Act, Options, Current, { Label = "", Extra = "", Placeholder = "Choose…", Search, Class = "", Disabled = false, Fid = "" } = {}) {
  const Items = Options.filter((O) => Array.isArray(O));
  const Cur = Items.find(([, V]) => String(V) === String(Current));
  const Lead = (L) => (!L ? "" : `<span class="mi-dd-lead">${String(L).trim().startsWith("<") ? L : icon(L, 13)}</span>`);
  const Filter = Search ?? Items.length > 10;
  const Body = Options.map((O) => {
    if (!Array.isArray(O)) return `<div class="mi-dd-group" role="presentation">${Esc(O.Group)}</div>`;
    const [L, V, Ld, Hint] = O, On = String(V) === String(Current);
    return `<button type="button" role="option" aria-selected="${On}" class="mi-dd-opt ${On ? "active" : ""}" data-act="${Act}" data-value="${Esc(V)}" ${Extra} data-label="${Esc(String(L).toLowerCase())} ${Esc(String(Hint || "").toLowerCase())}">${Lead(Ld)}<span class="mi-dd-text">${Esc(L)}${Hint ? `<small>${Esc(Hint)}</small>` : ""}</span>${On ? `<span class="mi-dd-tick">${icon("check", 12)}</span>` : ""}</button>`;
  }).join("");
  return `<details class="mi-dd ${Class}" data-dd ${Disabled ? "data-disabled" : ""}>
    <summary class="mi-dd-btn" ${Fid ? `data-fid="${Esc(Fid)}"` : ""} aria-label="${Esc(Label)}${Cur ? `: ${Esc(Cur[0])}` : ""}" aria-haspopup="listbox">${Cur ? Lead(Cur[2]) : ""}<span class="mi-dd-val">${Esc(Cur ? Cur[0] : Placeholder)}</span>${Cur?.[3] ? `<small class="mi-dd-hint">${Esc(Cur[3])}</small>` : ""}<span class="mi-dd-chev">${icon("down", 12)}</span></summary>
    <div class="mi-dd-list" role="listbox" aria-label="${Esc(Label)}">${Filter ? `<input class="mi-dd-search" type="search" placeholder="Filter ${Items.length}…" aria-label="Filter ${Esc(Label)}" data-dd-search>` : ""}<div class="mi-dd-scroll">${Body}</div><p class="mi-dd-none" hidden>No match</p></div>
  </details>`;
}

export function InstallDropdowns(Doc = globalThis.document) {
  if (!Doc || Doc.__MiDropdowns) return;
  Doc.__MiDropdowns = true;
  const Win = Doc.defaultView || globalThis;
  const OpenOnes = () => [...Doc.querySelectorAll("details.mi-dd[open]")];
  const Close = (D, Focus = false) => { if (!D?.open) return; D.open = false; if (Focus) D.querySelector("summary")?.focus({ preventScroll: true }); };
  const Opts = (D) => [...D.querySelectorAll(".mi-dd-opt")].filter((B) => !B.hidden);
  // Fixed placement so a list is never clipped by a scrolling card body; flips above when there is no room below.
  const Place = (D) => {
    const List = D.querySelector(".mi-dd-list"), R = D.querySelector("summary").getBoundingClientRect();
    if (!List || !R.width) return;
    const H = Win.innerHeight || 800, Below = H - R.bottom - 12, Above = R.top - 12, Max = Math.max(160, Math.min(340, Math.max(Below, Above)));
    const Up = Below < Math.min(240, List.scrollHeight) && Above > Below;
    Object.assign(List.style, { position: "fixed", left: `${Math.round(Math.min(R.left, (Win.innerWidth || 1200) - Math.max(R.width, 200) - 8))}px`, minWidth: `${Math.round(Math.max(R.width, 200))}px`, maxHeight: `${Math.round(Max)}px`,
      top: Up ? "" : `${Math.round(R.bottom + 6)}px`, bottom: Up ? `${Math.round(H - R.top + 6)}px` : "" });
    D.classList.toggle("up", Up);
  };
  Doc.addEventListener("toggle", (E) => {
    const D = E.target;
    if (!D.matches?.("details.mi-dd") || !D.open) return;
    if (D.hasAttribute("data-disabled")) { D.open = false; return; }
    for (const O of OpenOnes()) if (O !== D) O.open = false;
    Place(D);
    const Cur = D.querySelector(".mi-dd-opt.active") || Opts(D)[0];
    Cur?.scrollIntoView?.({ block: "nearest" });
    (D.querySelector("[data-dd-search]") || Cur)?.focus({ preventScroll: true });
  }, true);
  Doc.addEventListener("click", (E) => {
    const D = E.target.closest?.("details.mi-dd");
    for (const O of OpenOnes()) if (O !== D) O.open = false;
    if (D && E.target.closest(".mi-dd-opt")) Win.setTimeout(() => { if (D.isConnected) Close(D); }, 0);
  });
  Doc.addEventListener("input", (E) => {
    if (!E.target.matches?.("[data-dd-search]")) return;
    const D = E.target.closest("details.mi-dd"), Q = E.target.value.trim().toLowerCase();
    let Shown = 0;
    for (const B of D.querySelectorAll(".mi-dd-opt")) { B.hidden = !!Q && !B.dataset.label.includes(Q); Shown += !B.hidden; }
    for (const G of D.querySelectorAll(".mi-dd-group")) G.hidden = !!Q;
    D.querySelector(".mi-dd-none").hidden = Shown > 0;
    E.stopPropagation();
  }, true);
  Doc.addEventListener("keydown", (E) => {
    const D = E.target.closest?.("details.mi-dd");
    if (!D) return;
    const InList = !!E.target.closest(".mi-dd-list");
    if (!D.open) { if (E.key === "ArrowDown" || E.key === "ArrowUp") { E.preventDefault(); D.open = true; } return; }
    const List = Opts(D), At = List.indexOf(Doc.activeElement);
    const Go = (I) => { const B = List[Math.max(0, Math.min(List.length - 1, I))]; B?.focus({ preventScroll: true }); B?.scrollIntoView?.({ block: "nearest" }); };
    if (E.key === "Escape") { E.preventDefault(); E.stopPropagation(); Close(D, true); }
    else if (E.key === "ArrowDown") { E.preventDefault(); Go(At + 1); }
    else if (E.key === "ArrowUp") { E.preventDefault(); if (At <= 0 && D.querySelector("[data-dd-search]")) D.querySelector("[data-dd-search]").focus(); else Go(At - 1); }
    else if (E.key === "Home" && InList && At > -1) { E.preventDefault(); Go(0); }
    else if (E.key === "End" && InList && At > -1) { E.preventDefault(); Go(List.length - 1); }
    else if (E.key === "Enter" && E.target.matches("[data-dd-search]")) { E.preventDefault(); List[0]?.click(); }
    else if (E.key === "Tab") Close(D);
    if (InList || D.open) E.stopPropagation();
  }, true);
  const Reflow = () => { for (const D of OpenOnes()) Place(D); };
  Win.addEventListener?.("resize", Reflow);
  Doc.addEventListener("scroll", (E) => { if (E.target.closest?.(".mi-dd-list")) return; Reflow(); }, true);
}
InstallDropdowns();

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
