/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE SKY PANEL
   Five numbers between nought and four decide what colour the air is. Written as sliders they
   mean nothing; drawn, they are the whole sky. So this panel shows the atmosphere doing its job:

     · a slice of the real sky around the sun — horizon to zenith, ninety degrees either side —
       repainted from the same scattering the numbers describe. Drag it: across for turbidity,
       up and down for Rayleigh
     · the extinction spectrum, in the colours it applies to, so it is obvious why the sky is
       blue and why haze is grey
     · the Mie phase function, drawn as the curve it is, with the forward peak you are dialling
     · a visibility figure a pilot would recognise, straight out of Koschmieder
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { el, colorChip } from '../kit.js';
import { tape, stepper, pillToggle } from './controls.js';
import { ic } from '../icons.js';
import { flat } from '../world.js';

const D2R = Math.PI / 180;
const rgb = c => {
  const n = parseInt((c || '#2f6dd0').slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const mixC = (a, b, t) => {
  const A = rgb(a), B = rgb(b), f = Math.max(0, Math.min(1, t));
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
};
const css = ([r, g, b], a = 1) =>
  `rgba(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))},${a})`;

/* Henyey–Greenstein: one number, and it decides whether haze glows around the sun or everywhere */
export const hg = (cosT, g) =>
  (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(1e-4, 1 + g * g - 2 * g * cosT), 1.5));

/* Koschmieder: how far you can see before contrast is gone */
export const extinction = (turbidity, mie) => 0.02 * turbidity + mie * 1.2;   /* per km */
export const visibilityKm = (turbidity, mie) => 3.912 / Math.max(0.002, extinction(turbidity, mie));

/* a wavelength, as a colour you can paint with */
export function spectrum(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
  return [r * f * 255, g * f * 255, b * f * 255];
}

/* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
export function skyPanel(node, ctx) {
  const { compact = false, setProp, register } = ctx;
  const P = node.props;
  const host = el('div', 'mpanel skypanel');
  const syncers = [];
  const on = (elm, ev, fn) => elm.addEventListener(ev, fn);
  const sunNode = () => flat.find(n => n.type === 'sun');
  const sunAlt = () => sunNode()?.props.elevation ?? 14;

  const RAY = () => P.rayleigh ?? 1.35;
  const MIE = () => P.mie ?? 0.22;
  const MIEG = () => P.mieG ?? 0.78;
  const TURB = () => P.turbidity ?? 3.4;
  const OZ = () => P.ozone ?? 1;

  /* one model, used by the hero and by the gradient strip, so they can never disagree */
  function sample(elevDeg, dAzDeg) {
    const alt = sunAlt();
    const e = Math.max(-2, elevDeg);
    const sinE = Math.sin(Math.max(0, e) * D2R);
    const day = Math.max(0, Math.min(1, (alt + 6) / 12));
    const night = 1 - day;
    const zen = P.zenith || '#2f6dd0', hor = P.horizon || '#9fc4e8';

    const rayMix = Math.min(1, Math.pow(1 - sinE, 1.1) * (0.5 + TURB() * 0.06) * (0.45 + RAY() * 0.45));
    let c = mixC(zen, hor, rayMix);

    /* night: the sky keeps its hue but loses almost all of its light */
    const lum = 0.06 + 0.94 * day;
    c = c.map(v => v * lum);

    const oz = OZ() * night;
    c = [c[0] * (1 - oz * 0.35), c[1] * (1 - oz * 0.18), c[2] * (1 + oz * 0.06)];

    /* the sun's halo: the phase function normalised to its own peak, so it can never blow out */
    const gAsym = Math.min(0.95, MIEG());
    const cosT = Math.cos(e * D2R) * Math.cos(Math.abs(dAzDeg) * D2R) * Math.cos(alt * D2R)
      + Math.sin(e * D2R) * Math.sin(alt * D2R);
    const glow = (hg(cosT, gAsym) / hg(1, gAsym)) * (0.25 + MIE() * 1.9) * Math.max(0.04, day);
    c = [c[0] + glow * 235, c[1] + glow * 218, c[2] + glow * 186];

    const haze = Math.pow(1 - sinE, 5) * (0.08 + MIE() * 0.9) * (0.15 + day * 0.85);
    c = [c[0] + haze * 62, c[1] + haze * 66, c[2] + haze * 74];

    const sky = P.intensity ?? 1;
    return c.map(v => v * (0.55 + sky * 0.45));
  }

  /* ── hero · a slice of the sky ─────────────────────────────────────────────────────────── */
  const hero = el('div', 'pcard mp-hero sk-hero');
  const cv = el('canvas', 'mp-sky');
  cv.title = 'Drag: across for turbidity, up and down for Rayleigh';
  const cap = el('div', 'mp-cap',
    `<div class="l"><b class="sk-name">—</b><span class="mp-illum sk-sub">—</span></div>
     <div class="r"><span class="sk-r">—</span></div>`);
  hero.append(cv, cap);
  host.appendChild(hero);

  const sky = cv.getContext('2d');
  let dragging = null;
  function paintHero() {
    const w = cv.clientWidth || 300, h = compact ? 140 : 168;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    cv.style.height = h + 'px';
    const g = sky;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const gy = h - 16;                                   /* the ground line */
    const STEP = 3;
    for (let x = 0; x < w; x += STEP) {
      const dAz = (x / w - 0.5) * 180;
      for (let y = 0; y < gy; y += STEP) {
        const e = (1 - y / gy) * 90;
        g.fillStyle = css(sample(e, dAz));
        g.fillRect(x, y, STEP + 0.5, STEP + 0.5);
      }
    }

    /* the sun, if it is up there */
    const alt = sunAlt();
    if (alt > -3) {
      const sy = (1 - Math.min(90, Math.max(0, alt)) / 90) * gy;
      const sx = w / 2;
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 34);
      glow.addColorStop(0, 'rgba(255,248,226,.95)');
      glow.addColorStop(0.25, 'rgba(255,240,205,.35)');
      glow.addColorStop(1, 'rgba(255,240,205,0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(sx, sy, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,252,240,.95)';
      g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill();
    }

    /* the ground bounce, so the strip has a floor */
    g.fillStyle = css(rgb(P.ground || '#14181d'));
    g.fillRect(0, gy, w, h - gy);
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.beginPath(); g.moveTo(0, gy + .5); g.lineTo(w, gy + .5); g.stroke();

    /* the scales */
    g.font = '8px ui-sans-serif, system-ui';
    [[0, '0°'], [30, '30'], [60, '60'], [90, '90° ZENITH']].forEach(([e, l]) => {
      const y = (1 - e / 90) * gy;
      g.strokeStyle = 'rgba(255,255,255,.10)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(10, y); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.42)';
      g.textAlign = 'left';
      g.fillText(l, 13, y + (e === 90 ? 9 : 3));
    });
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.42)';
    [[-90, '−90°'], [0, 'SUN'], [90, '+90°']].forEach(([d, l]) => {
      const x = (d / 180 + 0.5) * w;
      g.textAlign = d < 0 ? 'left' : d > 0 ? 'right' : 'center';
      g.fillText(l, Math.max(4, Math.min(w - 4, x)), h - 5);
    });

    if (dragging) {
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(dragging.x, 0); g.lineTo(dragging.x, h);
      g.moveTo(0, dragging.y); g.lineTo(w, dragging.y);
      g.stroke();
      g.setLineDash([]);
    }
  }

  const nameEl = cap.querySelector('.sk-name');
  const subEl = cap.querySelector('.sk-sub');
  const rEl = cap.querySelector('.sk-r');
  const airName = () => {
    const t = TURB();
    if (t < 2) return 'Arctic air';
    if (t < 3) return 'Clear air';
    if (t < 5) return 'Clean air';
    if (t < 8) return 'Hazy air';
    if (t < 13) return 'Murky air';
    return 'Smog';
  };
  function paintCap() {
    nameEl.textContent = airName();
    subEl.textContent = `turbidity ${TURB().toFixed(1)} · rayleigh ${RAY().toFixed(2)} · mie ${MIE().toFixed(3)}`;
    rEl.innerHTML = `${visibilityKm(TURB(), MIE()).toFixed(0)} km`;
  }

  const heroFrom = e => {
    const r = cv.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    dragging = { x: x * r.width, y: y * r.height };
    setProp(node, 'turbidity', +(1 + x * 19).toFixed(1));
    setProp(node, 'rayleigh', +(4 * (1 - y)).toFixed(2));
    paintAll();
  };
  on(cv, 'pointerdown', e => { cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing'); heroFrom(e); });
  on(cv, 'pointermove', e => { if (cv.hasPointerCapture?.(e.pointerId)) heroFrom(e); });
  const endDrag = () => { dragging = null; cv.classList.remove('grabbing'); paintHero(); };
  on(cv, 'pointerup', endDrag);
  on(cv, 'pointercancel', endDrag);

  /* ── rail and duo ──────────────────────────────────────────────────────────────────────── */
  const rail = el('div', 'mp-rail');
  const pill = k => {
    const b = el('div', 'mp-pill', `<b class="v">—</b><span class="k">${k}</span>`);
    rail.appendChild(b);
    return b.querySelector('.v');
  };
  const pRay = pill('Rayleigh'), pTurb = pill('Turbidity'), pMie = pill('Mie'), pOz = pill('Ozone');
  host.appendChild(rail);

  const duo = el('div', 'mp-duo');
  const statCard = (icon, label) => {
    const c = el('div', 'pcard mp-stat',
      `<span class="i">${icon}</span><span class="l">${label}</span><b class="n">—</b>`);
    duo.appendChild(c);
    return c;
  };
  const sVis = statCard(ic('eye', { size: 12 }), 'Visibility');
  const sLight = statCard(ic('sky', { size: 12 }), 'Sky light');
  host.appendChild(duo);

  /* ── extinction spectrum ───────────────────────────────────────────────────────────────── */
  const mc = el('div', 'pcard mp-metric sk-spec');
  mc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Extinction</span><span class="s">Per kilometre · 380–720 nm</span></div>
      <button class="mp-x" title="Taller chart">${ic('arrowout', { size: 12 })}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">km</span></div>
    <div class="mp-k mp-target">Visibility <span class="v">—</span></div>`;
  const chartWrap = el('div', 'mp-chartwrap');
  const chart = el('canvas');
  chartWrap.appendChild(chart);
  mc.appendChild(chartWrap);
  const specs = el('div', 'mp-spec sk-specs');
  mc.appendChild(specs);
  const numI = mc.querySelector('.mp-num .i'), numD = mc.querySelector('.mp-num .d');
  const visV = mc.querySelector('.mp-target .v');
  mc.querySelector('.mp-x').onclick = () => { mc.classList.toggle('tall'); paintSpectrum(); };
  host.appendChild(mc);

  /* Rayleigh goes as λ⁻⁴, which is the whole reason for the colour of everything above you */
  const rayAt = nm => RAY() * 0.012 * Math.pow(550 / nm, 4);
  const mieAt = () => MIE() * 1.2 + TURB() * 0.004;
  function paintSpectrum() {
    const w = chartWrap.clientWidth || 280, h = mc.classList.contains('tall') ? 168 : 112;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (chart.width !== w * dpr || chart.height !== h * dpr) { chart.width = w * dpr; chart.height = h * dpr; }
    chart.style.height = h + 'px';
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = 2, R = 32, T = 8, B = 16;
    const top = Math.max(0.12, rayAt(380) + mieAt()) * 1.15;
    const px = nm => L + (nm - 380) / 340 * (w - L - R);
    const py = v => T + (1 - v / top) * (h - T - B);
    g.font = '9px ui-sans-serif, system-ui';

    [0.25, 0.5, 0.75, 1].forEach(f => {
      g.strokeStyle = 'rgba(255,255,255,.06)';
      g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(px(380), py(top * f)); g.lineTo(px(720), py(top * f)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.26)';
      g.textAlign = 'left';
      g.fillText((top * f).toFixed(2), w - R + 5, py(top * f) + 3);
    });

    /* the visible spectrum, painted under the curve it belongs to */
    for (let nm = 380; nm <= 720; nm += 2) {
      const v = rayAt(nm) + mieAt();
      g.fillStyle = css(spectrum(nm), 0.30);
      g.fillRect(px(nm), py(v), 2.4, py(0) - py(v));
    }
    /* mie alone: flat, grey, and the reason haze washes colour out */
    g.strokeStyle = 'rgba(255,255,255,.42)';
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(px(380), py(mieAt())); g.lineTo(px(720), py(mieAt())); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.34)';
    g.textAlign = 'left';
    g.fillText('MIE', px(392), py(mieAt()) - 4);

    /* total */
    g.beginPath();
    for (let nm = 380; nm <= 720; nm += 2) {
      const v = rayAt(nm) + mieAt();
      nm === 380 ? g.moveTo(px(nm), py(v)) : g.lineTo(px(nm), py(v));
    }
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 1.6;
    g.stroke();
    g.lineWidth = 1;

    g.fillStyle = 'rgba(255,255,255,.26)';
    [[400, '400'], [550, '550 nm'], [700, '700']].forEach(([nm, l], i) => {
      g.textAlign = i === 0 ? 'left' : i === 2 ? 'right' : 'center';
      g.fillText(l, px(nm), h - 3);
    });
  }

  /* ── haze ──────────────────────────────────────────────────────────────────────────────── */
  const hc = el('div', 'pcard mp-light sk-haze');
  hc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Haze</span><span class="s">Mie scattering · phase</span></div>
    </div>`;
  const hb = el('div', 'pbody');
  hc.appendChild(hb);
  hc.querySelector('.mp-chead .l').onclick = () => hc.classList.toggle('shut');

  const phaseWrap = el('div', 'mp-meter sk-phase');
  phaseWrap.innerHTML = '<div class="hd"><span class="k">phase function</span></div>';
  const phaseCv = el('canvas');
  phaseWrap.appendChild(phaseCv);
  const gStep = stepper({
    value: MIEG(), min: 0, max: 0.98, dec: 2, step: 0.01,
    onInput: v => { setProp(node, 'mieG', v); paintAll(); },
  });
  phaseWrap.querySelector('.hd').appendChild(gStep);
  hb.appendChild(phaseWrap);
  const phaseFrom = e => {
    const r = phaseCv.getBoundingClientRect();
    const pad = 8, span = Math.max(1, r.width - pad * 2);
    setProp(node, 'mieG', +Math.max(0, Math.min(0.98, (e.clientX - r.left - pad) / span * 0.98)).toFixed(2));
    paintAll();
  };
  on(phaseCv, 'pointerdown', e => { phaseCv.setPointerCapture(e.pointerId); phaseCv.classList.add('drag'); phaseFrom(e); });
  on(phaseCv, 'pointermove', e => { if (phaseCv.hasPointerCapture?.(e.pointerId)) phaseFrom(e); });
  on(phaseCv, 'pointerup', e => { phaseCv.releasePointerCapture?.(e.pointerId); phaseCv.classList.remove('drag'); });

  const mieT = tape({
    label: 'Mie haze', min: 0, max: 1, value: MIE(), dec: 3, step: 0.005,
    marks: [{ t: 0, l: 'VACUUM' }, { t: 0.22, l: 'CLEAR' }, { t: 1, l: 'FOG' }],
    onInput: v => { setProp(node, 'mie', v); paintAll(); },
  });
  const turbT = tape({
    label: 'Turbidity', min: 1, max: 20, value: TURB(), dec: 1, step: 0.1,
    marks: [{ t: 0, l: 'ARCTIC 1' }, { t: 2.4 / 19, l: 'CLEAR 3.4' }, { t: 1, l: 'SMOG 20' }],
    onInput: v => { setProp(node, 'turbidity', v); paintAll(); },
  });
  const rayT = tape({
    label: 'Rayleigh', min: 0, max: 4, value: RAY(), dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'NONE' }, { t: 0.3375, l: 'EARTH 1.35' }, { t: 1, l: '4×' }],
    onInput: v => { setProp(node, 'rayleigh', v); paintAll(); },
  });
  const ozT = tape({
    label: 'Ozone', min: 0, max: 3, value: OZ(), dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'NONE' }, { t: 1 / 3, l: 'EARTH 1.0' }, { t: 1, l: '3×' }],
    onInput: v => { setProp(node, 'ozone', v); paintAll(); },
  });
  hb.append(mieT, turbT, rayT, ozT);
  host.appendChild(hc);

  function paintPhase() {
    const w = phaseWrap.clientWidth || 280, h = 62;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (phaseCv.width !== w * dpr || phaseCv.height !== h * dpr) { phaseCv.width = w * dpr; phaseCv.height = h * dpr; }
    phaseCv.style.height = h + 'px';
    const g = phaseCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 8, span = w - pad * 2, T = 6, B = 13;
    const gg = Math.min(0.95, MIEG());
    const px = th => pad + th / 180 * span;
    const top = Math.log10(hg(1, gg) + 1) * 1.1;
    const py = v => T + (1 - Math.log10(v + 1) / top) * (h - T - B);

    g.font = '8px ui-sans-serif, system-ui';
    g.strokeStyle = 'rgba(255,255,255,.07)';
    [45, 90, 135].forEach(th => { g.beginPath(); g.moveTo(px(th), T); g.lineTo(px(th), py(0)); g.stroke(); });
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.beginPath(); g.moveTo(pad, py(0) + .5); g.lineTo(pad + span, py(0) + .5); g.stroke();

    g.beginPath();
    g.moveTo(px(0), py(0));
    for (let th = 0; th <= 180; th += 2) g.lineTo(px(th), py(hg(Math.cos(th * D2R), gg)));
    g.lineTo(px(180), py(0));
    g.closePath();
    const fill = g.createLinearGradient(pad, 0, pad + span, 0);
    fill.addColorStop(0, 'rgba(255,244,214,.35)');
    fill.addColorStop(1, 'rgba(160,190,230,.10)');
    g.fillStyle = fill;
    g.fill();
    g.beginPath();
    for (let th = 0; th <= 180; th += 2) {
      const y = py(hg(Math.cos(th * D2R), gg));
      th === 0 ? g.moveTo(px(th), y) : g.lineTo(px(th), y);
    }
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 1.4;
    g.stroke();
    g.lineWidth = 1;

    g.fillStyle = 'rgba(255,255,255,.30)';
    [[0, 'FORWARD'], [90, '90°'], [180, 'BACK']].forEach(([th, l], i) => {
      g.textAlign = i === 0 ? 'left' : i === 2 ? 'right' : 'center';
      g.fillText(l, px(th), h - 2);
    });
  }

  /* ── colour ────────────────────────────────────────────────────────────────────────────── */
  const cc = el('div', 'pcard mp-light sk-colour');
  cc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Colour</span><span class="s">Zenith · horizon · bounce</span></div>
    </div>`;
  const cb = el('div', 'pbody');
  cc.appendChild(cb);
  cc.querySelector('.mp-chead .l').onclick = () => cc.classList.toggle('shut');

  const gradWrap = el('div', 'mp-meter sk-grad');
  gradWrap.innerHTML = '<div class="hd"><span class="k">horizon to zenith</span></div>';
  const gradCv = el('canvas');
  gradWrap.appendChild(gradCv);
  cb.appendChild(gradWrap);

  const zHead = el('div', 'mp-subhead', '<span class="k">zenith</span>');
  const zChip = colorChip(P.zenith || '#2f6dd0', v => { setProp(node, 'zenith', v); paintAll(); });
  zHead.appendChild(zChip);
  const hHead = el('div', 'mp-subhead', '<span class="k">horizon</span>');
  const hChip = colorChip(P.horizon || '#9fc4e8', v => { setProp(node, 'horizon', v); paintAll(); });
  hHead.appendChild(hChip);
  const gHead = el('div', 'mp-subhead', '<span class="k">ground bounce</span>');
  const gChip = colorChip(P.ground || '#14181d', v => { setProp(node, 'ground', v); paintAll(); });
  gHead.appendChild(gChip);
  cb.append(zHead, hHead, gHead);

  const skyT = tape({
    label: 'Sky light', min: 0, max: 4, value: P.intensity ?? 1, dec: 2, unit: '×', step: 0.05,
    marks: [{ t: 0, l: 'DARK' }, { t: 0.25, l: 'REAL 1×' }, { t: 1, l: '4×' }],
    onInput: v => { setProp(node, 'intensity', v); paintAll(); },
  });
  cb.appendChild(skyT);
  host.appendChild(cc);

  function paintGrad() {
    const w = gradWrap.clientWidth || 280, h = 46;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (gradCv.width !== w * dpr || gradCv.height !== h * dpr) { gradCv.width = w * dpr; gradCv.height = h * dpr; }
    gradCv.style.height = h + 'px';
    const g = gradCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 8, span = w - pad * 2, y = 6, bh = 20;
    for (let x = 0; x < span; x++) {
      g.fillStyle = css(sample(x / span * 90, 60));
      g.fillRect(pad + x, y, 1.02, bh);
    }
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.strokeRect(pad + .5, y + .5, span - 1, bh - 1);
    g.font = '8px ui-sans-serif, system-ui';
    [[0, '0° HORIZON'], [30, '30'], [60, '60'], [90, '90° ZENITH']].forEach(([e, l], i) => {
      const x = pad + e / 90 * span;
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.moveTo(x, y + bh + 1); g.lineTo(x, y + bh + 5); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.30)';
      g.textAlign = i === 0 ? 'left' : i === 3 ? 'right' : 'center';
      g.fillText(l, x, h - 3);
    });
  }

  /* ── rendering ─────────────────────────────────────────────────────────────────────────── */
  const rc = el('div', 'pcard mp-light sk-render');
  rc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Rendering</span><span class="s">What the sky does to the scene</span></div>
    </div>`;
  const rb = el('div', 'pbody');
  rc.appendChild(rb);
  rc.querySelector('.mp-chead .l').onclick = () => rc.classList.toggle('shut');
  const rTags = el('div', 'mp-tags');
  const aerial = pillToggle('AERIAL PERSPECTIVE', P.aerial !== false, v => { setProp(node, 'aerial', v); paintAll(); });
  const lightsScene = pillToggle('SKY LIGHTS SCENE', P.lightsScene !== false, v => { setProp(node, 'lightsScene', v); paintAll(); });
  rTags.append(aerial, lightsScene);
  rb.appendChild(rTags);
  const rNote = el('div', 'mp-note', '');
  rb.appendChild(rNote);
  host.appendChild(rc);

  /* ── keeping every surface honest ──────────────────────────────────────────────────────── */
  function paintAll() {
    paintHero(); paintCap(); paintSpectrum(); paintPhase(); paintGrad();
    const vis = visibilityKm(TURB(), MIE());
    const beta = extinction(TURB(), MIE());

    pRay.innerHTML = `${RAY().toFixed(2)}`;
    pTurb.innerHTML = `${TURB().toFixed(1)}`;
    pMie.innerHTML = `${MIE().toFixed(3)}`;
    pOz.innerHTML = `${OZ().toFixed(2)}`;

    sVis.classList.toggle('down', vis < 5);
    sVis.querySelector('.i').innerHTML = vis < 5 ? ic('alert', { size: 12 }) : ic('eye', { size: 12 });
    sVis.querySelector('.n').innerHTML = `${vis.toFixed(vis < 10 ? 1 : 0)}<em>km</em>`;
    sLight.querySelector('.n').innerHTML = `${(P.intensity ?? 1).toFixed(2)}<em>×</em>`;

    numI.textContent = Math.floor(vis);
    numD.textContent = `.${Math.round(vis * 10) % 10}`;
    visV.textContent = `${airName().toLowerCase()} · β ${beta.toFixed(3)} per km`;

    specs.innerHTML = [
      ['rayleigh at 550', `${rayAt(550).toFixed(3)}`],
      ['mie, flat', `${mieAt().toFixed(3)}`],
      ['blue vs red', `${(rayAt(450) / rayAt(650)).toFixed(1)}×`],
      ['forward g', `${MIEG().toFixed(2)}`],
    ].map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');

    rNote.textContent = `${P.aerial === false ? 'Distance is not tinted by the air.' : 'Distant geometry picks up the colour of the air between you and it.'} ${P.lightsScene === false ? 'The sky is a backdrop only.' : 'The sky itself lights the scene from every direction.'}`;

    mieT._set(MIE());
    turbT._set(TURB());
    rayT._set(RAY());
    ozT._set(OZ());
    skyT._set(P.intensity ?? 1);
    gStep._set(MIEG());
    aerial._set(P.aerial !== false);
    lightsScene._set(P.lightsScene !== false);
    zChip._set && zChip._set(P.zenith || '#2f6dd0');
    hChip._set && hChip._set(P.horizon || '#9fc4e8');
    gChip._set && gChip._set(P.ground || '#14181d');
  }

  syncers.push(paintAll);
  register && register(() => syncers.forEach(f => f()));

  const ro = new ResizeObserver(() => {
    paintHero(); paintSpectrum(); paintPhase(); paintGrad();
    [mieT, turbT, rayT, ozT, skyT].forEach(t => t._paint && t._paint());
  });
  ro.observe(host);
  host._dispose = () => ro.disconnect();

  requestAnimationFrame(paintAll);
  paintAll();
  return host;
}
