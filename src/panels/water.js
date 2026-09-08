/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE WATER PANEL
   Water is not a list of five numbers between nought and one — it is a shape, a colour with a
   depth to it, and a surface that catches the light. So the panel is a section through the sea:

     · a cross-section hero, drawn from the actual wave you have dialled in, over a sloping bed
       that disappears at exactly the depth your clarity allows. Drag it: sideways lengthens the
       wave, up and down raises it
     · a sea-state card that does the arithmetic a sailor would — height, period, phase speed,
       steepness, and how close the wave is to breaking
     · a depth ramp: the water column drawn metre by metre, with the visibility limit marked
     · a glitter preview for reflectivity, roughness, foam and sun glint
   Tapes and steppers throughout. No sliders.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { el, colorChip } from '../kit.js';
import { tape, stepper, pillToggle, specList } from './controls.js';
import { ic } from '../icons.js';

const G = 9.81;

/* ── sea arithmetic ────────────────────────────────────────────────────────────────────────── */
export const wavePeriod = lam => Math.sqrt(2 * Math.PI * lam / G);
export const phaseSpeed = lam => Math.sqrt(G * lam / (2 * Math.PI));

const DOUGLAS = [
  [0.001, 0, 'Glassy'], [0.1, 1, 'Rippled'], [0.5, 2, 'Smooth'], [1.25, 3, 'Slight'],
  [2.5, 4, 'Moderate'], [4, 5, 'Rough'], [6, 6, 'Very rough'], [9, 7, 'High'],
];
export function seaState(H) {
  for (const [lim, n, name] of DOUGLAS) if (H < lim) return { n, name };
  return { n: 8, name: 'Very high' };
}

/* how fast the water swallows the light: clear water loses little, murky water loses it all */
const attenuation = clarity => 0.09 + (1 - Math.max(0, Math.min(1, clarity))) ** 1.6 * 1.5;
export const secchi = clarity => 1.7 / attenuation(clarity);

const rgb = c => {
  const n = parseInt((c || '#1d7b8c').slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const mix = (a, b, t) => {
  const A = rgb(a), B = rgb(b), f = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
};
const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };

/* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
export function waterPanel(node, ctx) {
  const { compact = false, setProp, register } = ctx;
  const P = node.props;
  const host = el('div', 'mpanel wpanel');
  const syncers = [];
  const on = (elm, ev, fn) => elm.addEventListener(ev, fn);
  const A = () => P.amplitude ?? 0.19;
  const LAM = () => P.wavelength ?? 7.5;
  const H = () => A() * 2;

  /* the surface, as a trochoid: choppiness sharpens the crests and flattens the troughs */
  const surfaceY = (x, k, a, q) => {
    const th = k * x;
    return a * (Math.cos(th) + q * 0.35 * Math.cos(2 * th) * Math.sign(Math.cos(th)));
  };

  /* ── hero · a section through the sea ──────────────────────────────────────────────────── */
  const hero = el('div', 'pcard mp-hero w-hero');
  const cv = el('canvas', 'mp-sky');
  cv.title = 'Drag: sideways for wavelength, up and down for height';
  const cap = el('div', 'mp-cap',
    `<div class="l"><b class="w-name">—</b><span class="mp-illum w-sub">—</span></div>
     <div class="r"><span class="w-lvl">—</span></div>`);
  hero.append(cv, cap);
  host.appendChild(hero);

  const sky = cv.getContext('2d');
  function paintHero() {
    const w = cv.clientWidth || 300, h = compact ? 138 : 164;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    cv.style.height = h + 'px';
    const g = sky;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const shallow = P.shallow || '#1d7b8c', deep = P.deep || '#06222e';
    const y0 = Math.round(h * 0.44);                    /* the waterline, with sky above it */
    const colPx = h - y0;
    const mAcross = 26, mDown = 9;
    const mPerPx = mAcross / w, mPerPxV = mDown / colPx;
    const aPx = A() / 1.4 * (y0 - 16);                  /* the wave gets the whole sky band */
    const vExag = (aPx / Math.max(A(), 1e-4)) / (1 / mPerPxV);

    /* air */
    const air = g.createLinearGradient(0, 0, 0, y0);
    air.addColorStop(0, '#0a1119');
    air.addColorStop(1, '#16222c');
    g.fillStyle = air; g.fillRect(0, 0, w, y0);

    /* the water column, attenuating with depth */
    const k = attenuation(P.clarity ?? 0.55);
    for (let y = y0; y < h; y++) {
      const d = (y - y0) * mPerPxV;
      g.fillStyle = mix(shallow, deep, 1 - Math.exp(-k * d * 0.8));
      g.fillRect(0, y, w, 1.02);
    }

    /* a bed that shelves away, so clarity has something to hide */
    const bedAt = t => y0 + colPx * (0.30 + 0.64 * t + 0.03 * Math.sin(t * 9));
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 3) g.lineTo(x, bedAt(x / w));
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = 'rgba(146,132,104,.75)';
    g.fill();
    for (let x = 0; x < w; x += 7) {                    /* a little ripple texture on the sand */
      const b = bedAt(x / w);
      g.fillStyle = 'rgba(0,0,0,.10)';
      g.fillRect(x, b + 2, 3.5, 1.2);
    }
    for (let x = 0; x < w; x += 1) {                    /* and the water in front of it */
      const b = bedAt(x / w);
      const hide = 1 - Math.exp(-k * (b - y0) * mPerPxV * 0.8);
      g.fillStyle = mix(shallow, deep, hide);
      g.globalAlpha = hide;
      g.fillRect(x, b, 1.02, h - b);
      g.globalAlpha = 1;
    }

    /* the surface itself */
    const kk = 2 * Math.PI / Math.max(0.5, LAM()) * mPerPx;
    const q = P.choppiness ?? 0.85;
    const pts = [];
    for (let x = 0; x <= w; x += 2) pts.push([x, y0 - surfaceY(x, kk, aPx, q)]);

    /* re-cut the sky above the wave so the crest reads as water, not paint */
    g.save();
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(w, 0);
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.clip();
    g.fillStyle = air;
    g.fillRect(0, 0, w, y0 + aPx + 4);
    g.restore();

    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = rgba(shallow, 0.95);
    g.lineWidth = 1.6;
    g.stroke();
    g.lineWidth = 1;

    /* glint and foam ride the crests */
    const spec = P.specular ?? 1.6, foam = P.foam ?? 0.28;
    pts.forEach(([x, y], i) => {
      const crest = i > 0 && i < pts.length - 1 && y <= pts[i - 1][1] && y <= pts[i + 1][1];
      if (!crest) return;
      if (spec > 0.05) {
        const gl = g.createRadialGradient(x, y, 0, x, y, 10 + spec * 6);
        gl.addColorStop(0, `rgba(255,247,225,${Math.min(0.5, 0.08 + spec * 0.12) * (P.reflectivity ?? 0.82)})`);
        gl.addColorStop(1, 'rgba(255,247,225,0)');
        g.fillStyle = gl;
        g.beginPath(); g.arc(x, y, 10 + spec * 6, 0, Math.PI * 2); g.fill();
      }
      if (foam > 0.02 && aPx > 3) {
        g.fillStyle = `rgba(255,255,255,${0.15 + foam * 0.6})`;
        for (let f = 0; f < 3 + foam * 6; f++) g.fillRect(x + ((f * 37) % 13) - 6, y + ((f * 17) % 4), 1.3, 1.1);
      }
    });

    /* the datum, and a ruler for the wave to be measured against */
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(0, y0 + .5); g.lineTo(w, y0 + .5); g.stroke();
    g.setLineDash([]);
    g.font = '8px ui-sans-serif, system-ui';
    [0.5, 1, 1.4].forEach(m => {
      const y = y0 - m / 1.4 * (y0 - 16);
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.26)';
      g.textAlign = 'left';
      g.fillText(`${m} m`, 6, y - 2);
    });

    /* the scales, tucked in the corners */
    g.fillStyle = 'rgba(255,255,255,.30)';
    g.textAlign = 'left';
    g.fillText(`${mAcross} m across · vertical ×${vExag.toFixed(0)}`, 8, h - 6);
    g.textAlign = 'right';
    g.fillText(`${mDown} m deep`, w - 8, h - 6);

    if (dragging) {
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(dragging.x, 0); g.lineTo(dragging.x, h);
      g.moveTo(0, dragging.y); g.lineTo(w, dragging.y);
      g.stroke();
      g.setLineDash([]);
    }
  }

  const nameEl = cap.querySelector('.w-name');
  const subEl = cap.querySelector('.w-sub');
  const lvlEl = cap.querySelector('.w-lvl');
  function paintCap() {
    const st = seaState(H());
    nameEl.textContent = `${st.name} · sea ${st.n}`;
    subEl.textContent = `${H().toFixed(2)} m at ${LAM().toFixed(1)} m · ${(P.speed ?? 1).toFixed(2)}×`;
    lvlEl.innerHTML = `level ${(P.level ?? -0.6).toFixed(2)} m · vis ${secchi(P.clarity ?? 0.55).toFixed(1)} m`;
  }

  /* the hero is a wave pad: across for length, up and down for height */
  let dragging = null;
  const waveFrom = e => {
    const r = cv.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    dragging = { x: x * r.width, y: y * r.height };
    setProp(node, 'wavelength', +(0.5 + x * 29.5).toFixed(1));
    setProp(node, 'amplitude', +(1.4 * (1 - y) ** 1.6).toFixed(3));
    paintAll();
  };
  on(cv, 'pointerdown', e => { cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing'); waveFrom(e); });
  on(cv, 'pointermove', e => { if (cv.hasPointerCapture?.(e.pointerId)) waveFrom(e); });
  const endDrag = () => { dragging = null; cv.classList.remove('grabbing'); paintHero(); };
  on(cv, 'pointerup', endDrag);
  on(cv, 'pointercancel', endDrag);

  /* ── the rail ──────────────────────────────────────────────────────────────────────────── */
  const rail = el('div', 'mp-rail');
  const pill = k => {
    const b = el('div', 'mp-pill', `<b class="v">—</b><span class="k">${k}</span>`);
    rail.appendChild(b);
    return b.querySelector('.v');
  };
  const pH = pill('Height'), pLam = pill('Length'), pT = pill('Period'), pLvl = pill('Level');
  host.appendChild(rail);

  /* ── the duo ───────────────────────────────────────────────────────────────────────────── */
  const duo = el('div', 'mp-duo');
  const statCard = (icon, label) => {
    const c = el('div', 'pcard mp-stat',
      `<span class="i">${icon}</span><span class="l">${label}</span><b class="n">—</b>`);
    duo.appendChild(c);
    return c;
  };
  const sSea = statCard(ic('water', { size: 12 }), 'Sea state');
  const sVis = statCard(ic('eye', { size: 12 }), 'You can see');
  host.appendChild(duo);

  /* ── sea state ─────────────────────────────────────────────────────────────────────────── */
  const mc = el('div', 'pcard mp-metric w-state');
  mc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Sea state</span><span class="s">Douglas scale · deep water</span></div>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">m</span></div>
    <div class="mp-k mp-target">Crest to trough <span class="v">—</span></div>`;
  const scaleWrap = el('div', 'mp-meter w-scale');
  const scaleCv = el('canvas');
  scaleWrap.appendChild(scaleCv);
  mc.appendChild(scaleWrap);
  const specs = el('div', 'mp-spec w-specs');
  mc.appendChild(specs);
  const hI = mc.querySelector('.mp-num .i'), hD = mc.querySelector('.mp-num .d');
  const hV = mc.querySelector('.mp-target .v');
  host.appendChild(mc);

  const SEA_MARKS = [[0.1, 'RIPPLE'], [0.5, 'SMOOTH'], [1.25, 'SLIGHT'], [2.5, 'MODERATE'], [2.8, '']];
  function paintScale() {
    const w = scaleWrap.clientWidth || 280, h = 40;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (scaleCv.width !== w * dpr || scaleCv.height !== h * dpr) { scaleCv.width = w * dpr; scaleCv.height = h * dpr; }
    scaleCv.style.height = h + 'px';
    const g = scaleCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 8, span = w - pad * 2, y = 15, max = 2.8;
    const px = v => pad + Math.max(0, Math.min(1, v / max)) * span;

    const grad = g.createLinearGradient(pad, 0, pad + span, 0);
    grad.addColorStop(0, rgba(P.shallow || '#1d7b8c', 0.25));
    grad.addColorStop(1, rgba(P.shallow || '#1d7b8c', 0.85));
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(pad, y - 3, span, 6, 3); g.fill();
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.roundRect(px(H()), y - 3, pad + span - px(H()), 6, 3); g.fill();

    g.font = '8px ui-sans-serif, system-ui';
    SEA_MARKS.forEach(([v, l]) => {
      const x = px(v);
      g.strokeStyle = 'rgba(255,255,255,.16)';
      g.beginPath(); g.moveTo(x, y + 5); g.lineTo(x, y + 9); g.stroke();
      if (!l) return;
      g.fillStyle = 'rgba(255,255,255,.30)';
      g.textAlign = 'center';
      g.fillText(l, x, h - 2);
    });
    const mx = px(H());
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(mx, y, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.beginPath(); g.arc(mx, y, 4, 0, Math.PI * 2); g.stroke();
    g.font = '8.5px ui-sans-serif, system-ui';
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.textAlign = 'left';
    g.fillText('CALM', pad, 8);
    g.textAlign = 'right';
    g.fillText('2.8 m', w - pad, 8);
  }

  /* ── the wave ──────────────────────────────────────────────────────────────────────────── */
  const wc = el('div', 'pcard mp-light w-wave');
  wc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Wave</span><span class="s">Shape · pace</span></div>
    </div>`;
  const wb = el('div', 'pbody');
  wc.appendChild(wb);
  wc.querySelector('.mp-chead .l').onclick = () => wc.classList.toggle('shut');

  const amp = tape({
    label: 'Amplitude', min: 0, max: 1.4, value: A(), dec: 3, unit: 'm', step: 0.005,
    marks: [{ t: 0, l: 'FLAT' }, { t: 0.19 / 1.4, l: 'SWELL' }, { t: 1, l: '1.4 m' }],
    onInput: v => { setProp(node, 'amplitude', v); paintAll(); },
  });
  const lam = tape({
    label: 'Wavelength', min: 0.5, max: 30, value: LAM(), dec: 1, unit: 'm', step: 0.1,
    marks: [{ t: 0, l: 'CHOP' }, { t: 7.5 / 30, l: 'WIND SEA' }, { t: 1, l: 'SWELL 30' }],
    onInput: v => { setProp(node, 'wavelength', v); paintAll(); },
  });
  const chop = tape({
    label: 'Choppiness', min: 0, max: 2, value: P.choppiness ?? 0.85, dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'ROUND' }, { t: 0.425, l: 'TROCHOID' }, { t: 1, l: 'PEAKED' }],
    onInput: v => { setProp(node, 'choppiness', v); paintAll(); },
  });
  const spd = tape({
    label: 'Speed', min: 0, max: 4, value: P.speed ?? 1, dec: 2, unit: '×', step: 0.05,
    marks: [{ t: 0, l: 'STILL' }, { t: 0.25, l: 'REAL 1×' }, { t: 1, l: '4×' }],
    onInput: v => { setProp(node, 'speed', v); paintAll(); },
  });
  const windPill = pillToggle('FOLLOW WIND', P.windLinked !== false, v => { setProp(node, 'windLinked', v); paintAll(); });
  const wRow = el('div', 'mp-tags');
  wRow.appendChild(windPill);
  wb.append(amp, lam, chop, spd, wRow);
  host.appendChild(wc);

  /* ── depth and colour ──────────────────────────────────────────────────────────────────── */
  const dc = el('div', 'pcard mp-light w-depth');
  dc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Depth</span><span class="s">Colour · clarity · datum</span></div>
    </div>`;
  const db = el('div', 'pbody');
  dc.appendChild(db);
  dc.querySelector('.mp-chead .l').onclick = () => dc.classList.toggle('shut');

  const rampWrap = el('div', 'mp-meter w-ramp');
  rampWrap.innerHTML = '<div class="hd"><span class="k">water column</span></div>';
  const rampCv = el('canvas');
  rampWrap.appendChild(rampCv);
  const clarityStep = stepper({
    value: P.clarity ?? 0.55, min: 0, max: 1, dec: 2, step: 0.01,
    onInput: v => { setProp(node, 'clarity', v); paintAll(); },
  });
  rampWrap.querySelector('.hd').appendChild(clarityStep);
  db.appendChild(rampWrap);
  const clarityFrom = e => {
    const r = rampCv.getBoundingClientRect();
    const pad = 8, span = Math.max(1, r.width - pad * 2);
    setProp(node, 'clarity', +Math.max(0, Math.min(1, (e.clientX - r.left - pad) / span)).toFixed(2));
    paintAll();
  };
  on(rampCv, 'pointerdown', e => { rampCv.setPointerCapture(e.pointerId); rampCv.classList.add('drag'); clarityFrom(e); });
  on(rampCv, 'pointermove', e => { if (rampCv.hasPointerCapture?.(e.pointerId)) clarityFrom(e); });
  on(rampCv, 'pointerup', e => { rampCv.releasePointerCapture?.(e.pointerId); rampCv.classList.remove('drag'); });

  const shallowHead = el('div', 'mp-subhead', '<span class="k">shallow</span>');
  const shallowChip = colorChip(P.shallow || '#1d7b8c', v => { setProp(node, 'shallow', v); paintAll(); });
  shallowHead.appendChild(shallowChip);
  const deepHead = el('div', 'mp-subhead', '<span class="k">deep</span>');
  const deepChip = colorChip(P.deep || '#06222e', v => { setProp(node, 'deep', v); paintAll(); });
  deepHead.appendChild(deepChip);
  db.append(shallowHead, deepHead);

  const level = tape({
    label: 'Sea level', min: -8, max: 6, value: P.level ?? -0.6, dec: 2, unit: 'm', step: 0.05,
    marks: [{ t: 0, l: '−8' }, { t: 8 / 14, l: 'DATUM 0' }, { t: 1, l: '+6' }],
    onInput: v => { setProp(node, 'level', v); paintAll(); },
  });
  const extent = tape({
    label: 'Extent', min: 50, max: 4000, value: P.extent ?? 1400, dec: 0, unit: 'm', step: 10,
    marks: [{ t: 0, l: 'POOL' }, { t: 1400 / 3950, l: 'BAY 1.4 km' }, { t: 1, l: 'OCEAN' }],
    onInput: v => { setProp(node, 'extent', v); paintAll(); },
  });
  db.append(level, extent);
  host.appendChild(dc);

  function paintRamp() {
    const w = rampWrap.clientWidth || 280, h = 52;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (rampCv.width !== w * dpr || rampCv.height !== h * dpr) { rampCv.width = w * dpr; rampCv.height = h * dpr; }
    rampCv.style.height = h + 'px';
    const g = rampCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 8, span = w - pad * 2, y = 6, bh = 22, maxD = 20;
    const k = attenuation(P.clarity ?? 0.55);

    for (let x = 0; x < span; x++) {
      const d = x / span * maxD;
      g.fillStyle = mix(P.shallow || '#1d7b8c', P.deep || '#06222e', 1 - Math.exp(-k * d));
      g.fillRect(pad + x, y, 1.02, bh);
    }
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.strokeRect(pad + .5, y + .5, span - 1, bh - 1);

    g.font = '8px ui-sans-serif, system-ui';
    [0, 5, 10, 15, 20].forEach(d => {
      const x = pad + d / maxD * span;
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.moveTo(x, y + bh + 1); g.lineTo(x, y + bh + 5); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.30)';
      g.textAlign = d === 0 ? 'left' : d === maxD ? 'right' : 'center';
      g.fillText(`${d} m`, x, h - 3);
    });

    /* where the bottom disappears */
    const s = Math.min(maxD, secchi(P.clarity ?? 0.55));
    const sx = pad + s / maxD * span;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.setLineDash([2, 2]);
    g.beginPath(); g.moveTo(sx, y - 2); g.lineTo(sx, y + bh + 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(sx, y - 2); g.lineTo(sx + 4, y - 8); g.lineTo(sx - 4, y - 8); g.closePath(); g.fill();
  }

  /* ── surface ───────────────────────────────────────────────────────────────────────────── */
  const sc = el('div', 'pcard mp-light w-surface');
  sc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Surface</span><span class="s">Reflection · foam · glint</span></div>
    </div>`;
  const sb = el('div', 'pbody');
  sc.appendChild(sb);
  sc.querySelector('.mp-chead .l').onclick = () => sc.classList.toggle('shut');

  const glintWrap = el('div', 'mp-map w-glint');
  const glintCv = el('canvas');
  glintWrap.appendChild(glintCv);
  const glintRead = el('div', 'mp-read', '');
  glintWrap.appendChild(glintRead);
  sb.appendChild(glintWrap);

  const refl = tape({
    label: 'Reflectivity', min: 0, max: 1, value: P.reflectivity ?? 0.82, dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'MATTE' }, { t: 0.82, l: 'WATER' }, { t: 1, l: 'MIRROR' }],
    onInput: v => { setProp(node, 'reflectivity', v); paintAll(); },
  });
  const rough = tape({
    label: 'Roughness', min: 0, max: 1, value: P.roughness ?? 0.07, dec: 3, step: 0.005,
    marks: [{ t: 0, l: 'GLASS' }, { t: 0.07, l: 'CALM' }, { t: 1, l: 'SCATTERED' }],
    onInput: v => { setProp(node, 'roughness', v); paintAll(); },
  });
  const foamT = tape({
    label: 'Foam', min: 0, max: 1, value: P.foam ?? 0.28, dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'NONE' }, { t: 0.28, l: 'WHITECAPS' }, { t: 1, l: 'SURF' }],
    onInput: v => { setProp(node, 'foam', v); paintAll(); },
  });
  const glint = tape({
    label: 'Sun glint', min: 0, max: 4, value: P.specular ?? 1.6, dec: 2, unit: '×', step: 0.05,
    marks: [{ t: 0, l: 'OFF' }, { t: 0.4, l: 'REAL 1.6' }, { t: 1, l: '4×' }],
    onInput: v => { setProp(node, 'specular', v); paintAll(); },
  });
  sb.append(refl, rough, foamT, glint);
  host.appendChild(sc);

  function paintGlint() {
    const w = glintWrap.clientWidth || 280, h = 116;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (glintCv.width !== w * dpr || glintCv.height !== h * dpr) { glintCv.width = w * dpr; glintCv.height = h * dpr; }
    glintCv.style.height = h + 'px';
    const g = glintCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const horizon = Math.round(h * 0.34);
    const R = P.reflectivity ?? 0.82, ro = P.roughness ?? 0.07, fo = P.foam ?? 0.28, sp = P.specular ?? 1.6;

    const air = g.createLinearGradient(0, 0, 0, horizon);
    air.addColorStop(0, '#101a24');
    air.addColorStop(1, '#2a3a46');
    g.fillStyle = air; g.fillRect(0, 0, w, horizon);
    const sunX = w * 0.5, sunY = horizon - 16;
    const sunGlow = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, 26);
    sunGlow.addColorStop(0, 'rgba(255,244,214,.85)');
    sunGlow.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = sunGlow;
    g.beginPath(); g.arc(sunX, sunY, 26, 0, Math.PI * 2); g.fill();

    /* the sea, looking away toward the horizon */
    for (let y = horizon; y < h; y++) {
      const t = (y - horizon) / (h - horizon);
      g.fillStyle = mix(P.deep || '#06222e', P.shallow || '#1d7b8c', 0.15 + t * 0.35);
      g.fillRect(0, y, w, 1.02);
    }

    /* the glitter path: rough water spreads it, a mirror keeps it a column */
    const rows = 46;
    for (let i = 0; i < rows; i++) {
      const t = i / rows;
      const y = horizon + t * (h - horizon);
      const spread = (4 + ro * 190 * (0.25 + t)) * (0.4 + sp * 0.4);
      const n = Math.round(3 + t * 12);
      for (let j = 0; j < n; j++) {
        const rnd = ((i * 73 + j * 131) % 1000) / 1000 - 0.5;
        const x = sunX + rnd * spread * 2;
        const a = R * sp * 0.22 * (1 - t * 0.55) * (0.4 + Math.abs(0.5 - Math.abs(rnd)) * 1.2);
        if (a <= 0.01) continue;
        g.fillStyle = `rgba(255,247,226,${Math.min(0.85, a)})`;
        g.fillRect(x, y, 1 + t * 3.5, 1 + t * 1.4);
      }
    }

    /* whitecaps */
    if (fo > 0.02) {
      for (let i = 0; i < 90; i++) {
        const t = ((i * 37) % 100) / 100;
        const y = horizon + t ** 1.6 * (h - horizon);
        const x = ((i * 613) % 1000) / 1000 * w;
        if (((i * 97) % 100) / 100 > fo) continue;
        g.fillStyle = `rgba(255,255,255,${0.1 + fo * 0.45})`;
        g.fillRect(x, y, 2 + t * 5, 1 + t * 1.6);
      }
    }

    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.moveTo(0, horizon + .5); g.lineTo(w, horizon + .5); g.stroke();

    glintRead.innerHTML =
      `<span class="k">albedo</span><b>${(R * 100).toFixed(0)}%</b>` +
      `<span class="k">rough</span><b>${ro.toFixed(3)}</b>` +
      `<span class="k">glint</span><b>${sp.toFixed(2)}×</b>`;
  }

  /* ── keeping every surface honest ──────────────────────────────────────────────────────── */
  function paintAll() {
    paintHero(); paintCap(); paintScale(); paintRamp(); paintGlint();
    const st = seaState(H());
    const T = wavePeriod(LAM()), c = phaseSpeed(LAM());
    const steep = H() / LAM();
    const vis = secchi(P.clarity ?? 0.55);

    pH.innerHTML = `${H().toFixed(2)}<em>m</em>`;
    pLam.innerHTML = `${LAM().toFixed(1)}<em>m</em>`;
    pT.innerHTML = `${T.toFixed(1)}<em>s</em>`;
    pLvl.innerHTML = `${(P.level ?? -0.6).toFixed(2)}<em>m</em>`;

    sSea.classList.toggle('down', steep > 1 / 7);
    sSea.querySelector('.i').innerHTML = steep > 1 / 7 ? ic('alert', { size: 12 }) : ic('water', { size: 12 });
    sSea.querySelector('.l').textContent = st.name;
    sSea.querySelector('.n').innerHTML = `${st.n}`;
    sVis.querySelector('.n').innerHTML = `${vis.toFixed(1)}<em>m</em>`;

    hI.textContent = Math.floor(H());
    hD.textContent = `.${String(Math.round(H() * 100) % 100).padStart(2, '0')}`;
    hV.textContent = `over ${LAM().toFixed(1)} m · ${st.name.toLowerCase()}, sea ${st.n}`;

    specs.innerHTML = [
      ['period', `${T.toFixed(2)} s`],
      ['phase speed', `${c.toFixed(2)} m/s`],
      ['steepness', `1 : ${(1 / Math.max(steep, 1e-4)).toFixed(0)}`],
      ['breaking', steep > 1 / 7 ? 'YES · over 1:7' : `${((steep / (1 / 7)) * 100).toFixed(0)}% of limit`],
    ].map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');

    amp._set(A());
    lam._set(LAM());
    chop._set(P.choppiness ?? 0.85);
    spd._set(P.speed ?? 1);
    level._set(P.level ?? -0.6);
    extent._set(P.extent ?? 1400);
    refl._set(P.reflectivity ?? 0.82);
    rough._set(P.roughness ?? 0.07);
    foamT._set(P.foam ?? 0.28);
    glint._set(P.specular ?? 1.6);
    clarityStep._set(P.clarity ?? 0.55);
    windPill._set(P.windLinked !== false);
    shallowChip._set && shallowChip._set(P.shallow || '#1d7b8c');
    deepChip._set && deepChip._set(P.deep || '#06222e');
  }

  syncers.push(paintAll);
  register && register(() => syncers.forEach(f => f()));

  const ro2 = new ResizeObserver(() => {
    paintHero(); paintScale(); paintRamp(); paintGlint();
    [amp, lam, chop, spd, level, extent, refl, rough, foamT, glint].forEach(t => t._paint && t._paint());
  });
  ro2.observe(host);
  host._dispose = () => ro2.disconnect();

  requestAnimationFrame(paintAll);
  paintAll();
  return host;
}
