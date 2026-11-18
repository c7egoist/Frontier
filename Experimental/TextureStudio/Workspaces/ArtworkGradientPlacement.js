/*==========================================================================================================================================
                                                     ARTWORKGRADIENTPLACEMENT.JS
==========================================================================================================================================*/
/* Viewport placement for Pattern / Stamp linear and radial fills: the slot a ramp lives on, its frame on the canvas, the handle overlay
   and the maths that turns a canvas drag into frame-normalised placement (0,0 = frame centre, ±0.5 = frame edges).
   Linear ramps run a → b with their stops along the line; radial ramps are centred on a with b on the rim. Point fields keep their own
   scene-space points (ArtworkStackWorkspace's point overlay). */

import { ARTWORK_SIZE, gradientPlacement, normalizeGradientStops, sampleGradientStops } from "../Engine/Patterns/ArtworkStackEngine.js";

// Field names per colour slot (fill / outline on a layer, ground on the document) — the same table ArtworkModel.js keeps.
export const RAMP_SLOT_KEYS = Object.freeze({
  fill: { mode: "fillMode", stops: "fillStops", a: "color", b: "colorB", angle: "gradientAngle", point: "fillPointGradient", place: "fillPlace", interp: "fillInterp" },
  stroke: { mode: "strokeMode", stops: "strokeStops", a: "strokeColor", b: "strokeColorB", angle: "strokeGradientAngle", point: "strokePointGradient", place: "strokePlace", interp: "strokeInterp" },
  ground: { mode: "fillMode", stops: "fillStops", a: "color", b: "colorB", angle: "gradientAngle", point: "fillPointGradient", place: "fillPlace", interp: "fillInterp" },
});

/**
 * Resolve the ramp a slot edits: its host object (layer shape or document background), field names, label and canvas frame.
 * Gradient layers and the ground fill the whole document; every other layer ramps inside its own transform box.
 */
export function resolveRampSlot(doc, layer, slot = "fill") {
  const size = doc.size || ARTWORK_SIZE;
  const docFrame = { x: size / 2, y: size / 2, w: size, h: size, rot: 0 };
  if (slot === "ground") {
    if (!doc.background?.enabled) return null;
    return { slot, host: doc.background, keys: RAMP_SLOT_KEYS.ground, frame: docFrame, shapeFrame: docFrame, docFrame, space: "shape", label: "Document ground", layer: null };
  }
  if (!layer || layer.kind === "folder" || layer.locked || !layer.shape) return null;
  const t = layer.transform || {};
  const frame = layer.kind === "gradient"
    ? docFrame
    : { x: t.x ?? size / 2, y: t.y ?? size / 2, w: Math.max(1, t.width || 1), h: Math.max(1, t.height || 1), rot: t.rotation || 0 };
  const keys = slot === "stroke" ? RAMP_SLOT_KEYS.stroke : RAMP_SLOT_KEYS.fill;
  // A scene-space placement is framed by the document: one ramp across every instance of the layer.
  const scene = layer.shape[keys.place]?.space === "scene";
  return { slot: slot === "stroke" ? "stroke" : "fill", host: layer.shape, keys, frame: scene ? docFrame : frame, shapeFrame: frame, docFrame, space: scene ? "scene" : "shape", label: slot === "stroke" ? `${layer.name} outline` : layer.name, layer };
}

/**
 * Switch a layer ramp between "shape" (each instance carries the whole ramp) and "scene" (one ramp across the document),
 * keeping its anchors where they are on the canvas.
 */
export function setRampSpace(ramp, space) {
  if (!ramp?.layer || ramp.layer.kind === "gradient" || (space !== "scene" && space !== "shape") || ramp.space === space) return ramp;
  const { a, b } = rampAnchors(ramp);
  ramp.space = space;
  ramp.frame = space === "scene" ? ramp.docFrame : ramp.shapeFrame;
  writeRampAnchors(ramp, a, b);
  return ramp;
}

export const rampMode = (ramp) => ramp?.host?.[ramp.keys.mode] || (ramp?.layer?.kind === "gradient" && ramp.slot === "fill" ? "linear" : "solid");

export function frameToDoc(frame, [u, v]) {
  const lx = u * frame.w, ly = v * frame.h;
  const r = ((frame.rot || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [frame.x + lx * c - ly * s, frame.y + lx * s + ly * c];
}

export function docToFrame(frame, x, y) {
  const dx = x - frame.x, dy = y - frame.y;
  const r = (-(frame.rot || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [(dx * c - dy * s) / frame.w, (dx * s + dy * c) / frame.h];
}

// The ramp's two anchors in document space (placement, or the angle layout when nothing was placed yet).
export function rampAnchors(ramp) {
  const mode = rampMode(ramp);
  const place = gradientPlacement(mode, ramp.host[ramp.keys.place], ramp.host[ramp.keys.angle] ?? 45, ramp.frame.w, ramp.frame.h);
  return { mode, a: frameToDoc(ramp.frame, place.a), b: frameToDoc(ramp.frame, place.b) };
}

export function rampStops(ramp) {
  return normalizeGradientStops(ramp.host[ramp.keys.stops], ramp.host[ramp.keys.a], ramp.host[ramp.keys.b]);
}

// Write stops back (sorted, ends mirrored into the slot's A / B colours the way the inspector card does).
export function writeRampStops(ramp, stops) {
  const norm = normalizeGradientStops(stops, ramp.host[ramp.keys.a], ramp.host[ramp.keys.b]);
  ramp.host[ramp.keys.stops] = norm;
  ramp.host[ramp.keys.a] = norm[0].color;
  ramp.host[ramp.keys.b] = norm[norm.length - 1].color;
  return norm;
}

// Store anchors given in document space; linear ramps also refresh their angle so the inspector's knob follows the drag.
export function writeRampAnchors(ramp, a, b) {
  const pa = docToFrame(ramp.frame, a[0], a[1]);
  const pb = docToFrame(ramp.frame, b[0], b[1]);
  const round = (p) => p.map((v) => Math.round(v * 10000) / 10000);
  ramp.host[ramp.keys.place] = { a: round(pa), b: round(pb), ...(ramp.space === "scene" ? { space: "scene" } : {}) };
  if (rampMode(ramp) === "linear" && Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > 1e-4) {
    ramp.host[ramp.keys.angle] = Math.round((Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI);
  }
}

// Position along a → b (0–1) of a document point, and how far it sits from the line.
export function projectOnRamp(a, b, x, y) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = Math.max(1e-6, vx * vx + vy * vy);
  const t = ((x - a[0]) * vx + (y - a[1]) * vy) / len2;
  const ct = Math.max(0, Math.min(1, t));
  return { t: ct, raw: t, distance: Math.hypot(x - (a[0] + vx * ct), y - (a[1] + vy * ct)) };
}

const END_EPS = 0.004;

/**
 * Handle overlay for the active linear / radial ramp, in document units.
 * data-ramp-end="a|b" drags an anchor, data-ramp-stop="i" slides a stop along the line, data-ramp-line adds a stop.
 */
export function rampOverlayMarkup(ramp, { units = 1, selectedStop = -1 } = {}) {
  const { mode, a, b } = rampAnchors(ramp);
  const stops = rampStops(ramp);
  const interp = ramp.host[ramp.keys.interp] || "linear";
  const along = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const radius = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const f = (v) => v.toFixed(2);
  const hr = units * 9;
  let out = "";
  if (mode === "radial") {
    out += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${f(radius)}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="${units * 3}" pointer-events="none"/>`;
    out += `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${f(radius)}" fill="none" stroke="rgba(239,244,207,0.7)" stroke-width="${units * 1.2}" stroke-dasharray="${units * 5} ${units * 4}" pointer-events="none"/>`;
  }
  out += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="rgba(0,0,0,0.6)" stroke-width="${units * 4}" stroke-linecap="round" pointer-events="none"/>`;
  out += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#eff4cf" stroke-width="${units * 1.6}" stroke-linecap="round" pointer-events="none"/>`;
  // Wide invisible hit band: click the line to add a stop there.
  out += `<line data-ramp-line="1" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="transparent" stroke-width="${units * 14}" style="cursor:copy;"/>`;
  stops.forEach((s, i) => {
    if (s.offset <= END_EPS || s.offset >= 1 - END_EPS) return;
    const [x, y] = along(s.offset);
    const sel = i === selectedStop;
    out += `<g data-ramp-stop="${i}" style="cursor:grab;"><circle cx="${f(x)}" cy="${f(y)}" r="${f(hr * (sel ? 0.95 : 0.78))}" fill="${s.color}" stroke="${sel ? "#eff4cf" : "#141619"}" stroke-width="${units * (sel ? 2.2 : 1.6)}"/></g>`;
  });
  const endHandle = (key, p, t, glyph) => {
    const col = sampleGradientStops(stops, t, interp);
    return `<g data-ramp-end="${key}" style="cursor:move;">
      <rect x="${f(p[0] - hr)}" y="${f(p[1] - hr)}" width="${f(hr * 2)}" height="${f(hr * 2)}" rx="${f(units * 2)}" fill="${col}" stroke="#141619" stroke-width="${units * 1.8}"/>
      <rect x="${f(p[0] - hr - units * 2.4)}" y="${f(p[1] - hr - units * 2.4)}" width="${f(hr * 2 + units * 4.8)}" height="${f(hr * 2 + units * 4.8)}" rx="${f(units * 3)}" fill="none" stroke="#eff4cf" stroke-width="${units * 1.4}"/>
      ${glyph ? `<path d="M${f(p[0] - hr * 0.5)} ${f(p[1])} H${f(p[0] + hr * 0.5)} M${f(p[0])} ${f(p[1] - hr * 0.5)} V${f(p[1] + hr * 0.5)}" stroke="#141619" stroke-width="${units * 1.6}" pointer-events="none"/>` : ""}
    </g>`;
  };
  out += endHandle("b", b, 1, false);
  out += endHandle("a", a, 0, mode === "radial");
  return `<g class="se-ramp-overlay" data-ramp-mode="${mode}">${out}</g>`;
}
