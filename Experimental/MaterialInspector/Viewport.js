// Viewport.js — the workspace viewport, left blank on purpose.
//
// Texture Painting (Brush Studio) has a Project Zero viewport between its library and its studio card.  (Pattern, Stamp,
// Map Baking and Material are outliner · card only.)  No renderer is attached: the viewport is the frame a renderer
// would mount into — a title chip, view modes, a zoom readout and an optional floating toolbar slot — so the page layout matches the real workspaces.
//
//   MountViewport(Host, { Title, Meta, Views: [[Label, Id]], View, Chips: [Label], Hint, OnView }) → { Body, SetMeta, SetView }
//   Body is an empty element renderers (or overlays such as the paint tool rail) can mount into.

import { Esc } from "./CardKit.js";
import { icon } from "./Icons.js";

export function ViewportHtml(O) {
  return `<section class="vp-card" aria-label="${Esc(O.Title || "Viewport")}">
    <div class="vp-body" data-vp-body></div>
    <header class="vp-head">
      <span class="vp-title"><b>${Esc(O.Title || "Viewport")}</b><small data-vp-meta>${Esc(O.Meta || "")}</small></span>
      ${O.Views?.length ? `<span class="vp-views" role="radiogroup" aria-label="View mode">${O.Views.map(([L, Id]) => `<button type="button" role="radio" aria-checked="${Id === O.View}" class="${Id === O.View ? "active" : ""}" data-vp-view="${Esc(Id)}">${Esc(L)}</button>`).join("")}</span>` : ""}
    </header>
    <footer class="vp-foot">
      <span class="vp-hint">${icon("cube", 12)}${Esc(O.Hint || "Viewport — no renderer attached")}</span>
      ${O.Chips?.length ? `<span class="vp-chips">${O.Chips.map((C) => `<i>${Esc(C)}</i>`).join("")}</span>` : ""}
      <span class="vp-zoom" title="Zoom">100%</span>
    </footer>
  </section>`;
}

export function MountViewport(Host, O = {}) {
  const St = { View: O.View ?? O.Views?.[0]?.[1] ?? null };
  Host.innerHTML = ViewportHtml({ ...O, View: St.View });
  const Api = {
    Body: Host.querySelector("[data-vp-body]"),
    get View() { return St.View; },
    SetMeta: (Text) => { const El = Host.querySelector("[data-vp-meta]"); if (El) El.textContent = Text; },
    SetView: (Id) => {
      St.View = Id;
      for (const B of Host.querySelectorAll("[data-vp-view]")) { const On = B.dataset.vpView === Id; B.classList.toggle("active", On); B.setAttribute("aria-checked", String(On)); }
      O.OnView?.(Id);
    },
  };
  Host.addEventListener("click", (E) => { const B = E.target.closest("[data-vp-view]"); if (B) Api.SetView(B.dataset.vpView); });
  return Api;
}
