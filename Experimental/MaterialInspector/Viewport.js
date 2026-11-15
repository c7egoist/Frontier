// Viewport.js — the workspace viewport, left blank on purpose.
//
// Pattern / Stamp / Map Baking / Texture Painting each get a Project Zero viewport between their outliner (or library)
// and their card.  No renderer is attached: the viewport is the frame a renderer would mount into — a title chip, view
// modes, a zoom readout and an optional floating toolbar slot — so the page layout matches the real workspaces.
//
//   MountViewport(Host, { Title, Meta, Views: [[Label, Id]], View, Chips: [Label], Hint, OnView }) → { Body, SetMeta, SetView }
//   Body is an empty element renderers (or overlays such as the paint tool rail) can mount into.
//
// Workspaces that own a real stage (Pattern / Stamp's SVG canvas, Map Baking's split view) pass `Head` and `Foot` HTML
// instead: the card then becomes header bar · body · footer bar (`vp-card bars`), the decluttered Project Zero take on
// TextureStudio's two-band viewport header and stage footer.  Their controller owns everything inside those bars.

import { Esc } from "./CardKit.js";
import { icon } from "./Icons.js";

export function ViewportHtml(O) {
  if (O.Head != null || O.Foot != null) return `<section class="vp-card bars" aria-label="${Esc(O.Title || "Viewport")}">
    <header class="vp-bar vp-top" data-vp-head>${O.Head || ""}</header>
    <div class="vp-stage"><div class="vp-body" data-vp-body></div></div>
    <footer class="vp-bar vp-bottom" data-vp-foot>${O.Foot || ""}</footer>
  </section>`;
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
    Head: Host.querySelector("[data-vp-head]"),
    Foot: Host.querySelector("[data-vp-foot]"),
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
