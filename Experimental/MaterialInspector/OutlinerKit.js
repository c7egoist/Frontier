// OutlinerKit.js — the Project Zero outliner, as a card, shared by the Material, Pattern / Stamp and Map Baking outliners.
//
// Layout follows ProjectZeroEditor's Outliner: heading (title · meta · tools) → two stat buttons → search pill + filter
// menu → active filter chips → tree rows (39 px, disclosure, icon, name + metadata, status disc, visibility on hover,
// amber selection bar) → footer readouts.  Each outliner supplies only its rows and actions; this kit owns the shared
// plumbing (search, filters, expand / collapse, keyboard navigation, inline rename, drag reorder).

import { icon } from "./Icons.js";
import { Esc, Rebuild } from "./CardKit.js";

// ------------------------------------------------------------------------------------------------ templates
// Stat: { Label, Value, Act, Tone: "on" | "muted", Glyph, Title }
export function StatButton({ Label, Value, Act = "", Tone = "on", Glyph = "check", Title = "" }) {
  return `<button type="button" class="ol-stat" ${Act ? `data-act="${Act}"` : "disabled"} title="${Esc(Title)}">
    <span class="ol-disc ${Tone}">${Glyph === "dot" ? "△" : icon(Glyph, 13)}</span><small>${Esc(Label)}</small><strong>${Esc(Value)}</strong>
  </button>`;
}

// Row: { Id, Depth, Icon (html), Name, Meta, Selected, Muted, Expandable, Expanded, Status (null | bool), StatusAct,
//        StatusTitle, Eye (null | bool), EyeAct, Badge (html), Tools (html), Draggable, Renaming, Kind, Title }
export function TreeRow(R) {
  const Status = R.Status === null || R.Status === undefined ? "" : `<button type="button" class="ol-status ${R.Status ? "on" : ""}" data-act="${R.StatusAct || "ol-status"}" data-id="${Esc(R.Id)}" role="switch" aria-checked="${!!R.Status}" title="${Esc(R.StatusTitle || "")}" aria-label="${Esc(R.StatusTitle || "Toggle")}">${R.Status ? icon("check", 10) : ""}</button>`;
  const Eye = R.Eye === null || R.Eye === undefined ? "" : `<button type="button" class="ol-eye ${R.Eye ? "" : "off"}" data-act="${R.EyeAct || "ol-eye"}" data-id="${Esc(R.Id)}" aria-label="${R.Eye ? "Hide" : "Show"} ${Esc(R.Name)}" title="${R.Eye ? "Hide" : "Show"}">${icon(R.Eye ? "eye" : "eye-off", 13)}</button>`;
  return `<div class="ol-row ${R.Selected ? "selected" : ""} ${R.Muted ? "muted" : ""} ${R.Kind ? `kind-${R.Kind}` : ""}" role="treeitem" aria-level="${(R.Depth || 0) + 1}" aria-selected="${!!R.Selected}" ${R.Expandable ? `aria-expanded="${!!R.Expanded}"` : ""}
      data-row="${Esc(R.Id)}" data-fid="row:${Esc(R.Id)}" tabindex="${R.Selected ? 0 : -1}" style="--depth:${Math.min(4, R.Depth || 0)}" ${R.Draggable ? 'draggable="true"' : ""} title="${Esc(R.Title || "")}">
    <button type="button" class="ol-caret ${R.Expandable ? "" : "empty"} ${R.Expanded ? "open" : ""}" data-act="ol-expand" data-id="${Esc(R.Id)}" tabindex="-1" aria-label="${R.Expanded ? "Collapse" : "Expand"} ${Esc(R.Name)}">${icon("chevron", 11)}</button>
    <span class="ol-icon">${R.Icon || ""}</span>
    ${R.Renaming
      ? `<input class="ol-rename" data-act="ol-rename" data-id="${Esc(R.Id)}" data-fid="ol-rename" value="${Esc(R.Name)}" maxlength="80" aria-label="Rename ${Esc(R.Name)}">`
      : `<span class="ol-identity"><span class="ol-name">${Esc(R.Name)}</span>${R.Meta ? `<small>${Esc(R.Meta)}</small>` : ""}</span>`}
    ${R.Badge || ""}
    ${R.Tools ? `<span class="ol-tools">${R.Tools}</span>` : ""}
    ${Status}${Eye}
  </div>`;
}

export const RowTool = (Act, Id, Glyph, Label, Disabled = false) =>
  `<button type="button" class="ol-tool" data-act="${Act}" data-id="${Esc(Id)}" ${Disabled ? "disabled" : ""} title="${Esc(Label)}" aria-label="${Esc(Label)}">${icon(Glyph, 11)}</button>`;

export const GroupRow = (R) => TreeRow({ ...R, Kind: `group ${R.Kind || ""}` });

// Footer column: { Label, Value, Unit, Tone }
const FootCol = ({ Label, Value, Unit = "", Tone = "" }) => `<span class="${Tone ? `tone-${Tone}` : ""}"><small>${Esc(Label)}</small><b>${Esc(Value)}${Unit ? ` <em>${Esc(Unit)}</em>` : ""}</b></span>`;

// Shell: { Label, Title, Meta, Tools, Stats:[…], Placeholder, Filters:[[Label, Value]], Chips (html, e.g. presets), Rows (html),
//          Empty, Footer:[…], Count }
export function Shell(O, St) {
  const Active = O.Filters?.filter(([, V]) => St.Filters.has(V)) || [];
  return `<article class="ol-card" aria-label="${Esc(O.Label || "Outliner")}">
    <header class="ol-head"><h1>${Esc(O.Title || "Outliner")}</h1><small>${Esc(O.Meta || "")}</small><span class="ol-head-tools">${O.Tools || ""}</span></header>
    ${O.Stats?.length ? `<div class="ol-stats">${O.Stats.map(StatButton).join("")}</div>` : ""}
    <div class="ol-search">
      <label>${icon("search", 14)}<input type="search" data-act="ol-search" data-fid="ol-search" value="${Esc(St.Query)}" placeholder="${Esc(O.Placeholder || "Search")}" aria-label="Search ${Esc(O.Label || "outliner")}"></label>
      ${O.Filters?.length ? `<div class="ol-filter-wrap">
        <button type="button" class="ol-filter ${Active.length ? "active" : ""}" data-act="ol-filter-menu" aria-expanded="${St.MenuOpen}" aria-haspopup="true">${icon("filter", 12)}Filter${Active.length ? ` · ${Active.length}` : ""}${icon("chevron", 11)}</button>
        ${St.MenuOpen ? `<div class="ol-menu" role="menu">${O.Filters.map(([L, V]) => `<button type="button" role="menuitemcheckbox" aria-checked="${St.Filters.has(V)}" class="${St.Filters.has(V) ? "on" : ""}" data-act="ol-filter" data-value="${Esc(V)}"><i>${St.Filters.has(V) ? icon("check", 11) : ""}</i>${Esc(L)}</button>`).join("")}
          ${Active.length ? `<button type="button" class="ol-menu-clear" data-act="ol-filter-clear">Clear filters</button>` : ""}</div>` : ""}
      </div>` : ""}
    </div>
    ${Active.length || O.Chips ? `<div class="ol-chips">${Active.map(([L, V]) => `<button type="button" data-act="ol-filter" data-value="${Esc(V)}" aria-label="Remove filter ${Esc(L)}">${Esc(L)} ×</button>`).join("")}${O.Chips || ""}</div>` : ""}
    <div class="ol-rows" role="tree" aria-label="${Esc(O.Label || "Outliner")} tree" aria-multiselectable="false">
      ${O.Rows || `<p class="ol-empty">${Esc(O.Empty || "Nothing matches")}</p>`}
    </div>
    ${O.Footer?.length ? `<footer class="ol-foot">${O.Footer.map(FootCol).join("")}</footer>` : ""}
  </article>`;
}

// ------------------------------------------------------------------------------------------------ controller
// Spec: { Html(St), OnSelect(Id, Event), OnAction(Act, El, Event) → true if handled (re-render is the caller's job),
//         OnRename(Id, Name), CanRename(Id), OnDelete(Id), OnDrop(DragId, TargetId, "before" | "after" | "inside"), CanDrop(DragId, TargetId) }
export function CreateOutliner(Host, Spec) {
  const St = { Query: "", Filters: new Set(), Expanded: {}, Renaming: null, MenuOpen: false, Drag: null };
  const Render = () => {
    const Scroll = Host.querySelector(".ol-rows")?.scrollTop ?? 0;
    Rebuild(Host, Spec.Html(St), ".ol-card");
    const Rows = Host.querySelector(".ol-rows");
    if (Rows) Rows.scrollTop = Scroll;
  };
  const Rows = () => [...Host.querySelectorAll("[data-row]")];
  const FocusRow = (Id) => Host.querySelector(`[data-row="${CSS.escape(Id)}"]`)?.focus({ preventScroll: false });
  const IsExpanded = (Id, Default = true) => St.Expanded[Id] ?? Default;

  function FinishRename(El, Commit = true) {
    if (St.Renaming === null) return;
    const Id = St.Renaming;
    St.Renaming = null;
    if (Commit && El.value.trim()) Spec.OnRename?.(Id, El.value.trim().slice(0, 80));
    Render();
    FocusRow(Id);
  }

  Host.addEventListener("click", (Event) => {
    const El = Event.target.closest("[data-act]"), Row = Event.target.closest("[data-row]"), Inside = !!El && Host.contains(El);
    // Clicking outside the open filter menu closes it — and still performs whatever was clicked (a chip, a row tool…).
    if (St.MenuOpen && !Event.target.closest(".ol-filter-wrap")) { St.MenuOpen = false; Render(); if (!El) return; }
    if (El && Inside && !El.disabled) {
      const Act = El.dataset.act;
      if (Act === "ol-search" || Act === "ol-rename") return;
      if (Act === "ol-expand") { const Id = El.dataset.id; St.Expanded[Id] = !(El.classList.contains("open")); Render(); FocusRow(Id); return; }
      if (Act === "ol-filter-menu") { St.MenuOpen = !St.MenuOpen; Render(); return; }
      if (Act === "ol-filter") { const V = El.dataset.value; St.Filters.has(V) ? St.Filters.delete(V) : St.Filters.add(V); Render(); return; }
      if (Act === "ol-filter-clear") { St.Filters.clear(); St.MenuOpen = false; Render(); return; }
      if (Spec.OnAction?.(Act, El, Event)) return;
    }
    if (Row && !El?.closest?.(".ol-status, .ol-eye, .ol-tool, .ol-caret")) {
      if (Event.detail >= 2 && Spec.CanRename?.(Row.dataset.row)) { St.Renaming = Row.dataset.row; Render(); Host.querySelector(".ol-rename")?.select(); return; }
      Spec.OnSelect?.(Row.dataset.row, Event);
    }
  });

  Host.addEventListener("input", (Event) => {
    if (Event.target.dataset.act !== "ol-search") return;
    St.Query = Event.target.value;
    Render();
  });

  Host.addEventListener("focusout", (Event) => { if (Event.target.dataset?.act === "ol-rename" && St.Renaming !== null) FinishRename(Event.target); });

  Host.addEventListener("keydown", (Event) => {
    const T = Event.target;
    if (T.dataset?.act === "ol-rename") {
      if (Event.key === "Enter") { Event.preventDefault(); FinishRename(T); }
      else if (Event.key === "Escape") { Event.preventDefault(); Event.stopPropagation(); FinishRename(T, false); }
      return;
    }
    if (T.dataset?.act === "ol-search") {
      if (Event.key === "ArrowDown") { Event.preventDefault(); (Host.querySelector(".ol-row.selected") || Rows()[0])?.focus(); }
      if (Event.key === "Escape" && T.value) { Event.preventDefault(); Event.stopPropagation(); St.Query = ""; Render(); }
      return;
    }
    if ((Event.ctrlKey || Event.metaKey) && Event.key.toLowerCase() === "f" && Host.contains(T)) { Event.preventDefault(); Host.querySelector('[data-act="ol-search"]')?.focus(); return; }
    const Row = T.closest?.("[data-row]");
    if (!Row || T !== Row) return;
    const List = Rows(), At = List.indexOf(Row), Id = Row.dataset.row;
    const Move = (To) => { const Next = List[Math.max(0, Math.min(List.length - 1, To))]; if (Next && Next !== Row) { Spec.OnSelect?.(Next.dataset.row, Event); FocusRow(Next.dataset.row); } };
    if (Event.key === "ArrowDown") { Event.preventDefault(); Move(At + 1); }
    else if (Event.key === "ArrowUp") { Event.preventDefault(); Move(At - 1); }
    else if (Event.key === "Home") { Event.preventDefault(); Move(0); }
    else if (Event.key === "End") { Event.preventDefault(); Move(List.length - 1); }
    else if (Event.key === "ArrowRight" && Row.hasAttribute("aria-expanded")) { Event.preventDefault(); if (Row.getAttribute("aria-expanded") === "false") { St.Expanded[Id] = true; Render(); FocusRow(Id); } else Move(At + 1); }
    else if (Event.key === "ArrowLeft") {
      Event.preventDefault();
      if (Row.getAttribute("aria-expanded") === "true") { St.Expanded[Id] = false; Render(); FocusRow(Id); return; }
      const Level = +Row.getAttribute("aria-level");
      for (let I = At - 1; I >= 0; I--) if (+List[I].getAttribute("aria-level") < Level) { Move(I); break; }
    }
    else if (Event.key === "Enter") { Event.preventDefault(); Spec.OnSelect?.(Id, Event); }
    else if (Event.key === "F2" && Spec.CanRename?.(Id)) { Event.preventDefault(); St.Renaming = Id; Render(); Host.querySelector(".ol-rename")?.select(); }
    else if ((Event.key === "Delete" || Event.key === "Backspace") && Spec.OnDelete) { Event.preventDefault(); Spec.OnDelete(Id); }
    else if (Event.key === " " && Spec.OnSpace) { Event.preventDefault(); Spec.OnSpace(Id); }
  });

  // Drag reorder — rows opt in with Draggable; drop position is the top / bottom third (before / after) or middle (inside).
  const Clear = () => Host.querySelectorAll(".drop-before, .drop-after, .drop-inside").forEach((E) => E.classList.remove("drop-before", "drop-after", "drop-inside"));
  const Where = (Row, Event) => {
    const R = Row.getBoundingClientRect(), Y = (Event.clientY - R.top) / Math.max(1, R.height);
    return Y < 0.33 ? "before" : Y > 0.67 ? "after" : Spec.CanNest?.(St.Drag, Row.dataset.row) ? "inside" : Y < 0.5 ? "before" : "after";
  };
  Host.addEventListener("dragstart", (Event) => {
    const Row = Event.target.closest?.("[data-row][draggable]");
    if (!Row) return;
    St.Drag = Row.dataset.row;
    Row.classList.add("dragging");
    try { Event.dataTransfer.setData("text/plain", St.Drag); Event.dataTransfer.effectAllowed = "move"; } catch { /* jsdom */ }
  });
  Host.addEventListener("dragover", (Event) => {
    const Row = Event.target.closest?.("[data-row]");
    if (!St.Drag || !Row || Row.dataset.row === St.Drag || !(Spec.CanDrop?.(St.Drag, Row.dataset.row) ?? true)) return;
    Event.preventDefault();
    Clear();
    Row.classList.add(`drop-${Where(Row, Event)}`);
  });
  Host.addEventListener("dragleave", (Event) => { if (!Host.contains(Event.relatedTarget)) Clear(); });
  Host.addEventListener("drop", (Event) => {
    const Row = Event.target.closest?.("[data-row]");
    const Drag = St.Drag;
    St.Drag = null;
    Clear();
    if (!Drag || !Row || Row.dataset.row === Drag) return;
    Event.preventDefault();
    Spec.OnDrop?.(Drag, Row.dataset.row, Where(Row, Event));
  });
  Host.addEventListener("dragend", () => { St.Drag = null; Clear(); Host.querySelectorAll(".dragging").forEach((E) => E.classList.remove("dragging")); });

  document.addEventListener("click", (Event) => { if (St.MenuOpen && Event.target.isConnected && !Host.contains(Event.target)) { St.MenuOpen = false; Render(); } });

  return { State: St, Render, IsExpanded, FocusRow };
}

// Case-insensitive match over any number of strings.
export const Matches = (Query, ...Parts) => !Query.trim() || Parts.join(" ").toLowerCase().includes(Query.trim().toLowerCase());
