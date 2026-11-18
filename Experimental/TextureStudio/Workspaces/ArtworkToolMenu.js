/*==========================================================================================================================================
                                                        ARTWORKTOOLMENU.JS
==========================================================================================================================================*/
/* Right-click menus for the Pattern / Stamp vector tools, in the TextureStudio theme (same frame as the Brush Studio menu):
     Shapes   — every shape tool shares one menu: shape grid, fill source + colours + interpolation, outline, how it is placed.
     Gradient — which colour slot the tool edits, Linear / Radial / Point, interpolation, the stops (or point colours), placement reset.
     Path     — Curve and Pen: smoothing, outline width, colour, fill closed paths.
     Text     — native fallback only; when CardDock is present the Brush Studio Text menu (the one Texture Paint uses) opens instead.
   The menu edits the workspace state passed in (state.shapeStyle / pathStyle / textStyle) and, through host callbacks, the document. */

const SHAPE_TOOL_IDS = ["square", "circle", "diamond", "triangle", "star", "hexagon", "stripe"];
export const SHAPE_TOOLS = new Set(SHAPE_TOOL_IDS);

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const HEX = /^#[0-9a-f]{6}$/i;

// Small preview outline per motif (24 × 24 box, centred).
function motifPreview(id) {
  const P = {
    circle: '<circle cx="12" cy="12" r="8"/>',
    ring: '<path d="M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M8 12a4 4 0 1 1 8 0a4 4 0 1 1-8 0Z" fill-rule="evenodd"/>',
    square: '<rect x="4" y="4" width="16" height="16"/>',
    roundedRect: '<rect x="4" y="4" width="16" height="16" rx="4"/>',
    diamond: '<path d="M12 3 21 12 12 21 3 12Z"/>',
    hexagon: '<path d="M12 3.5 19.4 7.75v8.5L12 20.5 4.6 16.25v-8.5Z"/>',
    triangle: '<path d="M12 4 20 19H4Z"/>',
    star: '<path d="m12 3.5 2.5 5.5 6 .6-4.5 4 1.3 5.9L12 16.6 6.7 19.5 8 13.6 3.5 9.6l6-.6Z"/>',
    cross: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5Z"/>',
    chevron: '<path d="M4 15 12 6l8 9v4l-8-7-8 7Z"/>',
    stripe: '<rect x="3" y="9" width="18" height="6"/>',
    arc: '<path d="M4 15a8 8 0 0 1 16 0h-4a4 4 0 0 0-8 0Z"/>',
    teardrop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z"/>',
    leaf: '<path d="M12 3c6 4 6 13 0 18-6-5-6-14 0-18Z"/>',
    flower: '<circle cx="12" cy="7" r="3.2"/><circle cx="16.8" cy="10.5" r="3.2"/><circle cx="15" cy="16" r="3.2"/><circle cx="9" cy="16" r="3.2"/><circle cx="7.2" cy="10.5" r="3.2"/>',
    gear: '<path d="M12 3l1.6 2.6 3-.6.6 3 2.6 1.6-1.4 2.4 1.4 2.4-2.6 1.6-.6 3-3-.6L12 21l-1.6-2.6-3 .6-.6-3L4.2 14.4 5.6 12 4.2 9.6l2.6-1.6.6-3 3 .6Z"/>',
    line: '<path d="M4 18 20 6" fill="none" stroke-width="2.2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="0" stroke-linejoin="round">${P[id] || P.circle}</svg>`;
}

const seg = (act, options, current, extra = "") =>
  `<div class="atm-seg" role="radiogroup">${options.map(([label, value, disabled]) => `<button type="button" role="radio" class="${String(value) === String(current) ? "active" : ""}" aria-checked="${String(value) === String(current)}" data-act="${act}" data-value="${esc(value)}" ${disabled ? "disabled" : ""} ${extra}>${esc(label)}</button>`).join("")}</div>`;
const colour = (bind, value, label) =>
  `<label class="atm-colour" title="${esc(label)}"><span style="background:${esc(value)}"></span><input type="color" data-bind="${bind}" value="${esc(value)}" aria-label="${esc(label)}"><em>${esc(String(value).toUpperCase())}</em></label>`;
const range = (bind, label, value, min, max, step = 1, unit = "") =>
  `<label class="atm-range"><span>${esc(label)}</span><input type="range" data-bind="${bind}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${esc(Math.round(value * 100) / 100)}${unit}</output></label>`;
const toggle = (bind, on, label, hint = "") =>
  `<div class="atm-switch-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span><label class="switch"><input type="checkbox" data-bind="${bind}" ${on ? "checked" : ""} aria-label="${esc(label)}"><span></span></label></div>`;
const select = (bind, options, current, label) =>
  `<label class="atm-select"><span>${esc(label)}</span><select data-bind="${bind}" aria-label="${esc(label)}">${options.map((o) => `<option value="${esc(o.id)}" ${o.id === current ? "selected" : ""} title="${esc(o.hint || "")}">${esc(o.label)}</option>`).join("")}</select></label>`;
const section = (title, body) => `<section class="atm-section"><h4>${esc(title)}</h4>${body}</section>`;

/**
 * @param {object} ctx host hooks: state, isPattern, motifTypes, interpolations, pointInterpolations, fonts, selectTool(id),
 *   selectedLayer(), commit(fn, label), rampTarget(), rampMode(r), rampStops(r), writeRampStops(r, stops), editGradientSlot(slot),
 *   applyShapeStyle(layer), applyTextStyle(layer), refresh()
 */
export function createArtworkToolMenus(ctx) {
  const menu = document.createElement("div");
  menu.className = "atm-menu";
  menu.setAttribute("role", "dialog");
  menu.hidden = true;
  // Built node by node (not innerHTML) so the frame exists even where markup is not parsed (the validation DOM).
  const part = (tag, cls, text = "") => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; };
  const bar = part("div", "atm-bar");
  const titleEl = part("span", "atm-title");
  const toolEl = part("span", "atm-tool");
  const closeBtn = part("button", "icon-btn atm-close", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close menu");
  closeBtn.title = "Close (Esc)";
  bar.append(titleEl, toolEl, closeBtn);
  const body = part("div", "atm-body");
  menu.append(bar, body);
  document.body.append(menu);
  let current = null;

  const st = ctx.state;
  const defaultColour = () => (ctx.isPattern ? "#eff4cf" : "#e8c27a");

  // ---------------------------------------------------------------- views
  function shapesView() {
    const s = st.shapeStyle;
    const active = s.motif || (SHAPE_TOOLS.has(st.vectorTool) ? st.vectorTool : "square");
    const tiles = ctx.motifTypes.filter((m) => m.id !== "svg-path").map((m) =>
      `<button type="button" class="atm-tile ${m.id === active ? "active" : ""}" data-act="shape" data-value="${m.id}" title="${esc(m.label)}">${motifPreview(m.id)}<span>${esc(m.label.replace(/ \/.*$/, ""))}</span></button>`).join("");
    const fill = s.fillMode || "solid";
    const sel = ctx.selectedLayer();
    const canApply = sel && sel.kind === "motif" && !sel.locked && sel.shape?.motifType !== "svg-path";
    return section("Shape", `<div class="atm-grid">${tiles}</div>`)
      + section("Fill", seg("fill-mode", [["Solid", "solid"], ["Linear", "linear"], ["Radial", "radial"], ["Point", "point"]], fill)
        + `<div class="atm-row">${colour("shape.color", s.color || defaultColour(), fill === "solid" ? "Fill colour" : "Start colour")}${fill === "solid" ? "" : colour("shape.colorB", s.colorB || "#5a7692", "End colour")}</div>`
        + (fill === "solid" ? "" : select("shape.interp", fill === "point" ? ctx.pointInterpolations : ctx.interpolations, s.interp || (fill === "point" ? "gaussian" : "linear"), "Interpolation")))
      + section("Outline", range("shape.strokeWidth", "Width", s.strokeWidth || 0, 0, 18, 0.5, " px") + colour("shape.strokeColor", s.strokeColor || "#16181c", "Outline colour"))
      + section("Placing", seg("place", [["Drag a box", "drag"], ["Click to stamp", "click"]], s.place || "drag")
        + range("shape.size", s.place === "click" ? "Stamp size" : "Click size", s.size || 96, 24, 320, 1, " px")
        + toggle("shape.keep", !!s.keep, "Stay on the tool", "Place several without going back to Select"))
      + `<div class="atm-actions"><button type="button" class="atm-btn" data-act="shape-apply" ${canApply ? "" : "disabled"}>Apply to selected shape</button></div>`;
  }

  function gradientView() {
    const slot = st.activePointGradSlot || "fill";
    const ramp = ctx.rampTarget();
    const rm = ramp ? ctx.rampMode(ramp) : "solid";
    const mode = rm === "solid" ? st.gradientToolMode : rm;
    const groundOn = !!ctx.document().background?.enabled;
    let stopsHtml = "";
    if (rm === "point") {
      const pts = ctx.pointTarget()?.getGrad().points || [];
      stopsHtml = `<div class="atm-row atm-wrap">${pts.map((p, i) => colour(`point.${i}`, p.color, `Point ${i + 1}`)).join("")}</div><p class="atm-note">Click the canvas to add points (up to 12) · drag them to move · Del removes the selected one.</p>`;
    } else if (rm === "linear" || rm === "radial") {
      const stops = ctx.rampStops(ramp);
      stopsHtml = `<div class="atm-ramp" style="background:linear-gradient(90deg, ${stops.map((x) => `${x.color} ${(x.offset * 100).toFixed(1)}%`).join(", ")})"></div>`
        + `<div class="atm-row atm-wrap">${stops.map((x, i) => colour(`stop.${i}`, x.color, `Stop ${i + 1}`)).join("")}</div>`
        + `<p class="atm-note">${rm === "radial" ? "Drag the centre to move the ramp, the rim handle to size it." : "Drag on the canvas to lay the line; drag its ends to move them."} Click the line to add a stop, drag stops along it, double-click one to remove it.</p>`;
    } else {
      stopsHtml = `<p class="atm-note">${ramp ? `${esc(ramp.label)} is a solid colour —` : "Nothing selected —"} drag on the canvas to turn it into a ${esc(mode)} ${mode === "point" ? "field" : "gradient"}.</p>`;
    }
    const interpList = mode === "point" ? ctx.pointInterpolations : ctx.interpolations;
    const interpNow = rm === "point" ? (ctx.pointTarget()?.getGrad().interp || "gaussian") : rm === "linear" || rm === "radial" ? (ramp.host[ramp.keys.interp] || "linear") : (st.gradientInterp || (mode === "point" ? "gaussian" : "linear"));
    return section("Target", seg("grad-slot", [["Fill", "fill"], ["Outline", "stroke"], ["Ground", "ground", !groundOn]], slot)
        + `<p class="atm-note">${ramp ? `Editing <b>${esc(ramp.label)}</b>` : "Select a layer, or drag to add a gradient layer."}</p>`)
      + section("Source", seg("grad-mode", [["Linear", "linear"], ["Radial", "radial"], ["Point field", "point"]], mode)
        + select("grad.interp", interpList, interpNow, "Interpolation")
        + ((rm === "linear" || rm === "radial") && ramp.layer && ramp.layer.kind !== "gradient"
          ? `<div class="atm-switch-row"><span>Spans<small>Each shape carries the ramp, or one ramp crosses the canvas</small></span></div>` + seg("grad-space", [["Each shape", "shape"], ["Whole canvas", "scene"]], ramp.space || "shape")
          : ""))
      + section(rm === "point" ? "Points" : "Stops", stopsHtml)
      + `<div class="atm-actions">${rm === "linear" || rm === "radial" ? `<button type="button" class="atm-btn" data-act="grad-reset" ${ramp.host[ramp.keys.place] ? "" : "disabled"}>Reset placement</button>` : ""}</div>`;
  }

  function pathView() {
    const p = st.pathStyle;
    return section("Curve", range("path.tension", "Smoothing", p.tension ?? 0.5, 0, 1, 0.01))
      + section("Look", range("path.strokeWidth", "Outline width", p.strokeWidth ?? 6, 0, 24, 0.5, " px")
        + colour("path.strokeColor", p.strokeColor || defaultColour(), "Outline colour")
        + toggle("path.fillClosed", p.fillClosed !== false, "Fill closed paths", "Closing on the first point makes a filled shape"))
      + `<p class="atm-note">Click to add points · click the first point or press Enter to finish · Backspace removes the last point.</p>`;
  }

  function textView() {
    const t = st.textStyle || {};
    return section("Text", `<label class="atm-text"><input type="text" data-bind="text.value" maxlength="40" value="${esc(t.value || "Label")}" aria-label="Text"></label>`)
      + section("Type", select("text.fontFamily", ctx.fonts.map((f) => ({ id: f, label: f })), t.fontFamily || ctx.fonts[0], "Font")
        + seg("text-weight", [["Light", 300], ["Regular", 400], ["Semi", 600], ["Bold", 800]], t.fontWeight || 600)
        + range("text.fontSize", "Size", t.fontSize || 54, 8, 220, 1, " px"))
      + section("Look", colour("text.color", t.color || defaultColour(), "Text colour"));
  }

  const VIEWS = { shapes: ["Shapes", shapesView], gradient: ["Gradient", gradientView], path: ["Path", pathView], text: ["Text", textView] };

  function render() {
    if (!current) return;
    const [title, view] = VIEWS[current];
    titleEl.textContent = title;
    toolEl.textContent = current === "shapes" ? (st.shapeStyle.motif || st.vectorTool) : st.vectorTool;
    const scroll = body.scrollTop;
    body.innerHTML = view();
    body.scrollTop = scroll;
  }

  // ---------------------------------------------------------------- edits
  function changeGradient(fn) {
    ctx.commit(() => fn());
    render();
  }

  function onBind(bind, raw, el, live) {
    const [head, key] = bind.split(".");
    if (head === "shape") {
      const s = st.shapeStyle;
      if (key === "keep") s.keep = el.checked;
      else if (key === "color" || key === "colorB" || key === "strokeColor") { if (HEX.test(raw)) s[key] = raw.toLowerCase(); }
      else if (key === "interp") s.interp = raw;
      else s[key] = +raw;
    } else if (head === "path") {
      const p = st.pathStyle;
      if (key === "fillClosed") p.fillClosed = el.checked;
      else if (key === "strokeColor") { if (HEX.test(raw)) p.strokeColor = raw.toLowerCase(); }
      else p[key] = +raw;
    } else if (head === "text") {
      st.textStyle = { ...(st.textStyle || {}) };
      if (key === "value") st.textStyle.value = String(raw).slice(0, 40);
      else if (key === "fontFamily") st.textStyle.fontFamily = raw;
      else if (key === "color") { if (HEX.test(raw)) st.textStyle.color = raw.toLowerCase(); }
      else st.textStyle[key] = +raw;
      const sel = ctx.selectedLayer();
      if (sel?.kind === "text" && !sel.locked) ctx.commit(() => ctx.applyTextStyle(sel), { live });
    } else if (head === "grad") {
      st.gradientInterp = raw;
      const ramp = ctx.rampTarget();
      const rm = ramp ? ctx.rampMode(ramp) : "solid";
      if (rm === "point") changeGradient(() => { const t = ctx.pointTarget(); const g = t.getGrad(); if (raw === "gaussian") delete g.interp; else g.interp = raw; t.setGrad(g); });
      else if (rm === "linear" || rm === "radial") changeGradient(() => { ramp.host[ramp.keys.interp] = raw; });
      return;
    } else if (head === "stop" || head === "point") {
      if (!HEX.test(raw)) return;
      const ramp = ctx.rampTarget();
      if (head === "stop" && ramp) {
        ctx.commit(() => { const stops = ctx.rampStops(ramp); if (stops[+key]) stops[+key] = { ...stops[+key], color: raw.toLowerCase() }; ctx.writeRampStops(ramp, stops); }, { live });
      } else if (head === "point") {
        ctx.commit(() => { const t = ctx.pointTarget(); const g = t.getGrad(); if (g.points[+key]) g.points[+key].color = raw.toLowerCase(); t.setGrad(g); }, { live });
      }
      if (!live) render();
      return;
    }
    if (!live) render();
    else {
      const out = el.parentElement?.querySelector("output");
      if (out) out.textContent = `${Math.round(+raw * 100) / 100}${out.textContent.replace(/^[-\d.]+/, "")}`;
      const chip = el.closest(".atm-colour");
      if (chip) { chip.querySelector("span").style.background = raw; chip.querySelector("em").textContent = String(raw).toUpperCase(); }
    }
  }

  function onAct(act, value) {
    if (act === "shape") {
      const tool = SHAPE_TOOLS.has(value) ? value : "square";
      ctx.selectTool(tool);
      st.shapeStyle.motif = SHAPE_TOOLS.has(value) ? "" : value;
    } else if (act === "fill-mode") {
      st.shapeStyle.fillMode = value;
      if (value === "point" && st.shapeStyle.interp && !ctx.pointInterpolations.some((e) => e.id === st.shapeStyle.interp)) st.shapeStyle.interp = "gaussian";
      if (value !== "point" && st.shapeStyle.interp === "gaussian") st.shapeStyle.interp = "linear";
    } else if (act === "place") st.shapeStyle.place = value;
    else if (act === "shape-apply") {
      const sel = ctx.selectedLayer();
      if (sel?.kind === "motif") ctx.commit(() => { const motif = st.shapeStyle.motif || (SHAPE_TOOLS.has(st.vectorTool) ? st.vectorTool : sel.shape.motifType); sel.shape.motifType = motif; ctx.applyShapeStyle(sel); }, { toast: "Shape style applied" });
    } else if (act === "grad-slot") {
      ctx.editGradientSlot(value);
    } else if (act === "grad-mode") {
      st.gradientToolMode = value;
      const ramp = ctx.rampTarget();
      const rm = ramp ? ctx.rampMode(ramp) : "solid";
      if (ramp && rm !== "solid" && rm !== value) {
        ctx.commit(() => {
          ramp.host[ramp.keys.mode] = value;
          if (value === "point") ctx.ensurePoint(ramp);
          else if (!Array.isArray(ramp.host[ramp.keys.stops]) || ramp.host[ramp.keys.stops].length < 2) ctx.writeRampStops(ramp, ctx.rampStops(ramp));
          if (value === "radial" || value === "linear") delete ramp.host[ramp.keys.place];
        }, { toast: `${value === "point" ? "Point field" : value === "radial" ? "Radial" : "Linear"} gradient` });
      }
    } else if (act === "grad-space") {
      const ramp = ctx.rampTarget();
      if (ramp) ctx.commit(() => { ctx.setRampSpace(ramp, value); }, { toast: value === "scene" ? "Ramp spans the canvas" : "Ramp on each shape" });
    } else if (act === "grad-reset") {
      const ramp = ctx.rampTarget();
      if (ramp) ctx.commit(() => { delete ramp.host[ramp.keys.place]; }, { toast: "Placement reset" });
    } else if (act === "text-weight") {
      st.textStyle = { ...(st.textStyle || {}), fontWeight: +value };
      const sel = ctx.selectedLayer();
      if (sel?.kind === "text" && !sel.locked) ctx.commit(() => ctx.applyTextStyle(sel));
    }
    render();
  }

  body.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-act]");
    if (!el || el.disabled) return;
    onAct(el.dataset.act, el.dataset.value);
  });
  body.addEventListener("input", (e) => { const el = e.target; if (el.dataset.bind) onBind(el.dataset.bind, el.value, el, el.type !== "select-one" && el.type !== "checkbox"); });
  body.addEventListener("change", (e) => { const el = e.target; if (el.dataset.bind) onBind(el.dataset.bind, el.value, el, false); });

  function close() { menu.hidden = true; current = null; }
  closeBtn.addEventListener("click", close);
  const onDown = (e) => { if (!menu.hidden && !menu.contains?.(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape" && !menu.hidden) close(); };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);

  function open(view, x, y) {
    if (!VIEWS[view]) return false;
    current = view;
    menu.setAttribute("data-view", view);
    menu.hidden = false;
    render();
    const w = menu.offsetWidth || 380, h = menu.offsetHeight || 520;
    menu.style.left = `${Math.round(Math.max(12, Math.min(innerWidth - w - 12, x)))}px`;
    menu.style.top = `${Math.round(Math.max(12, Math.min(innerHeight - h - 12, y)))}px`;
    return true;
  }

  return {
    open,
    close,
    refresh: () => { if (!menu.hidden) render(); },
    get view() { return menu.hidden ? null : current; },
    element: menu,
    dispose() { close(); document.removeEventListener?.("pointerdown", onDown, true); document.removeEventListener?.("keydown", onKey); menu.remove?.(); },
  };
}

// Which menu a vector tool opens.
export function toolMenuView(toolId) {
  if (SHAPE_TOOLS.has(toolId)) return "shapes";
  if (toolId === "gradient") return "gradient";
  if (toolId === "curve" || toolId === "pen") return "path";
  if (toolId === "text") return "text";
  return null;
}
