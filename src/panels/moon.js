/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE MOON PANEL
   Not a list of sliders with "Moon" written above it. A moon is a thing you look at, so the panel
   shows you one: the real phase, the real tint, the real earthshine, sitting at its real altitude
   over a horizon, redrawn the instant anything changes.

   Everything here is an instrument rather than a field:
     · the sky drags left and right to scrub the phase
     · the compass and the altitude arc drag the moon across the sky — and because the moon rides
       the world clock, dragging it scrubs the time of day with it
     · the phase strip is eight little moons, not a dropdown
     · angular size is drawn against the real moon's half a degree
   The numbers are still there, and still typed in, because a designer needs both.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { el, slider, colorChip } from '../kit.js';
import { ic } from '../icons.js';
import { bus } from '../bus.js';

/* ── lunar arithmetic ──────────────────────────────────────────────────────────────────────── */
export const illumination = p => (1 - Math.cos(2 * Math.PI * p)) / 2;

export function phaseName(p) {
  const q = ((p % 1) + 1) % 1;
  if (q < 0.035 || q >= 0.965) return 'New moon';
  if (q < 0.215) return 'Waxing crescent';
  if (q < 0.285) return 'First quarter';
  if (q < 0.465) return 'Waxing gibbous';
  if (q < 0.535) return 'Full moon';
  if (q < 0.715) return 'Waning gibbous';
  if (q < 0.785) return 'Last quarter';
  return 'Waning crescent';
}
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compassOf = az => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/* the moon's place in the sky is a function of the world clock, so moving it moves the clock */
const HOUR_FROM_AZ = az => 18 + (az - 90) / 15;
function hourFromElevation(elev, current) {
  const e = Math.max(-58, Math.min(58, elev));
  const a = Math.asin(e / 58) * 12 / Math.PI;          /* rising branch */
  const opts = [18 + a, 18 + (12 - a)].map(h => ((h % 24) + 24) % 24);
  const dist = h => { const d = Math.abs(h - current); return Math.min(d, 24 - d); };
  return dist(opts[0]) <= dist(opts[1]) ? opts[0] : opts[1];
}

/* ── the moon itself, drawn ────────────────────────────────────────────────────────────────── */
const hex = (c, a) => {
  const n = parseInt((c || '#d8e2f2').slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
};

/* one deterministic little face, so the moon does not shimmer as it redraws */
const CRATERS = [[-0.28, -0.22, 0.20], [0.16, -0.34, 0.13], [0.34, 0.12, 0.17], [-0.14, 0.34, 0.15],
  [-0.46, 0.10, 0.10], [0.05, 0.05, 0.11], [0.44, -0.30, 0.08], [-0.02, -0.55, 0.07]];

export function drawMoon(ctx, cx, cy, r, { phase = 0.5, tint = '#d8e2f2', earthshine = 0.16, brightness = 1 }) {
  const p = ((phase % 1) + 1) % 1;
  const waxing = p < 0.5;
  const a = Math.cos(2 * Math.PI * p) * r;             /* terminator ellipse, signed */
  const k = illumination(p);

  /* halo */
  if (k > 0.02) {
    const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * (2.6 + brightness));
    halo.addColorStop(0, hex(tint, 0.20 * k * Math.min(brightness, 2)));
    halo.addColorStop(1, hex(tint, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, r * (2.6 + brightness), 0, Math.PI * 2); ctx.fill();
  }

  /* the dark side, lit by earthshine only */
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = hex(tint, 0.06 + earthshine * 0.5);
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  /* the lit crescent / gibbous */
  if (k > 0.005) {
    ctx.save();
    if (!waxing) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(cx, cy, Math.abs(a), r, 0, Math.PI / 2, -Math.PI / 2, a > 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, hex(tint, Math.min(1, 0.72 * brightness)));
    g.addColorStop(1, hex(tint, Math.min(1, 0.98 * brightness)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  /* maria, faint on the dark side and readable on the lit one */
  CRATERS.forEach(([x, y, s], i) => {
    const px = cx + x * r, py = cy + y * r;
    const lit = waxing ? (px - cx) > a * -1 : (cx - px) > a * -1;
    ctx.beginPath();
    ctx.arc(px, py, s * r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(20,26,40,${(lit ? 0.13 : 0.05) + (i % 3) * 0.015})`;
    ctx.fill();
  });
  ctx.restore();

  /* limb */
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = hex(tint, 0.16 + 0.2 * k);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
export function moonPanel(node, ctx) {
  const { compact = false, setProp, register } = ctx;
  const P = node.props;
  const host = el('div', 'mpanel');
  const syncers = [];
  const on = (elm, ev, fn) => elm.addEventListener(ev, fn);

  /* the sky is where the moon lives; the clock is what moves it */
  const setSky = (elev, az) => {
    const now = ((HOUR_FROM_AZ(P.azimuth ?? 292) % 24) + 24) % 24;   /* the clock the moon implies */
    const cur = az != null ? HOUR_FROM_AZ(az) : hourFromElevation(elev, now);
    bus.emit('settod', ((cur % 24) + 24) % 24);
  };

  /* ── card 1 · tonight ─────────────────────────────────────────────────────────────────── */
  const hero = el('div', 'pcard mp-hero');
  const cv = el('canvas', 'mp-sky');
  cv.title = 'Drag left and right to walk the phase';
  const cap = el('div', 'mp-cap',
    `<div class="l"><b class="mp-name">—</b><span class="mp-illum">—</span></div>
     <div class="r"><span class="mp-alt">—</span></div>`);
  hero.append(cv, cap);
  host.appendChild(hero);

  /* ── the rail · four numbers you read without stopping ────────────────────────────────── */
  const rail = el('div', 'mp-rail');
  const pill = k => {
    const b = el('div', 'mp-pill', `<b class="v">—</b><span class="k">${k}</span>`);
    rail.appendChild(b);
    return b.querySelector('.v');
  };
  const pLit = pill('Lit'), pAge = pill('Age'), pAlt = pill('Alt'), pAz = pill('Bearing');
  pAz.parentElement.classList.add('wide');
  host.appendChild(rail);

  /* ── the duo · is it up, and is it worth anything ─────────────────────────────────────── */
  const duo = el('div', 'mp-duo');
  const statCard = (icon, label) => {
    const c = el('div', 'pcard mp-stat',
      `<span class="i">${icon}</span><span class="l">${label}</span><b class="n">—</b>`);
    duo.appendChild(c);
    return c;
  };
  const sUp = statCard(ic('check', { size: 12 }), 'Above horizon');
  const sLx = statCard(ic('moon', { size: 12 }), 'Moonlight');
  host.appendChild(duo);

  /* ── the metric · illumination across the whole cycle ─────────────────────────────────── */
  const mc = el('div', 'pcard mp-metric');
  mc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Illumination</span></div>
      <button class="mp-x" title="Taller chart">${ic('arrowout', { size: 12 })}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">%</span></div>
    <div class="mp-k mp-target">Peak <span class="v">100% at full</span></div>`;
  const chartWrap = el('div', 'mp-chartwrap');
  const chart = el('canvas');
  chartWrap.appendChild(chart);
  mc.appendChild(chartWrap);
  mc.querySelector('.mp-x').onclick = () => { mc.classList.toggle('tall'); paintChart(); };
  host.appendChild(mc);

  const numI = mc.querySelector('.mp-num .i');
  const numD = mc.querySelector('.mp-num .d');

  function paintChart() {
    const w = chartWrap.clientWidth || 280, h = mc.classList.contains('tall') ? 168 : 104;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (chart.width !== w * dpr || chart.height !== h * dpr) { chart.width = w * dpr; chart.height = h * dpr; }
    chart.style.height = h + 'px';
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const R = 34, L = 2, T = 8, B = 16;                /* the axis lives on the right, as in a console */
    const px = t => L + t * (w - L - R);
    const py = v => T + (1 - v) * (h - T - B);
    g.font = '9px ui-sans-serif, system-ui';

    /* the grid, and the numbers hung off the right edge */
    [0.25, 0.5, 0.75, 1].forEach(v => {
      g.strokeStyle = v === 1 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)';
      g.setLineDash(v === 1 ? [4, 4] : [2, 5]);
      g.beginPath(); g.moveTo(px(0), py(v)); g.lineTo(px(1), py(v)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.30)';
      g.textAlign = 'left';
      g.fillText(`${v * 100}%`, w - R + 7, py(v) + 3);
    });

    const cur = ((P.phase ?? 0.68) % 1 + 1) % 1;

    /* the band under the moment you are looking at */
    const bw = Math.max(10, (w - L - R) * 0.055);
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fillRect(px(cur) - bw / 2, T, bw, h - T - B);

    /* apparent brightness sits under the lit curve, faint, like a second trace */
    const bAmp = Math.min(1, (P.brightness ?? 1.1) / 2);
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, v = illumination(t) * bAmp;
      i ? g.lineTo(px(t), py(v)) : g.moveTo(px(t), py(v));
    }
    g.stroke();

    /* the lit curve itself — amber where there is barely a moon to speak of */
    g.lineWidth = 1.6;
    for (let i = 0; i < 120; i++) {
      const t0 = i / 120, t1 = (i + 1) / 120;
      const v0 = illumination(t0), v1 = illumination(t1);
      g.strokeStyle = Math.min(v0, v1) < 0.08 ? 'rgba(245,158,11,.85)' : 'rgba(232,238,255,.75)';
      g.beginPath(); g.moveTo(px(t0), py(v0)); g.lineTo(px(t1), py(v1)); g.stroke();
    }

    /* the quarters, ticked and named along the foot */
    const marks = [[0, 'NEW'], [0.25, '1Q'], [0.5, 'FULL'], [0.75, '3Q'], [1, 'NEW']];
    g.fillStyle = 'rgba(255,255,255,.26)';
    marks.forEach(([t, lbl], i) => {
      g.strokeStyle = 'rgba(255,255,255,.10)';
      g.beginPath(); g.moveTo(px(t), py(0)); g.lineTo(px(t), py(0) + 4); g.stroke();
      g.textAlign = i === 0 ? 'left' : i === marks.length - 1 ? 'right' : 'center';
      g.fillText(lbl, px(t), h - 4);
    });

    /* and where the moon is tonight */
    const v = illumination(cur);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(px(cur), py(v), 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(px(cur), py(v) + 4); g.lineTo(px(cur), py(0)); g.stroke();
  }

  /* ── the atlas · the near side on a grid, with the terminator laid over it ────────────── */
  const MARIA = [
    [-57, 16, 23, 27, 'PROCELLARUM'], [-16, 33, 19, 13, 'IMBRIUM'],
    [18, 28, 12, 10, 'SERENITATIS'], [31, 7, 13, 11, 'TRANQUILLITATIS'],
    [59, 17, 8, 7, 'CRISIUM'], [52, -8, 10, 10, 'FECUNDITATIS'],
    [34, -15, 6, 6, 'NECTARIS'], [-17, -21, 11, 8, 'NUBIUM'],
    [-39, -24, 7, 7, 'HUMORUM'], [4, 13, 5, 4, 'VAPORUM'], [-5, 55, 32, 5, 'FRIGORIS'],
  ];
  const CRATERS_A = [[-11, -43, 'TYCHO'], [-20, 10, 'COPERNICUS'], [-2, -2, ''], [23, -44, ''], [-48, -12, '']];

  const ac = el('div', 'pcard mp-atlas');
  ac.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Atlas</span><span class="s">Near side · selenographic grid</span></div>
      <button class="mp-x" title="Taller atlas">${ic('arrowout', { size: 12 })}</button>
    </div>`;
  const mapWrap = el('div', 'mp-map');
  const map = el('canvas');
  map.title = 'Drag to walk the terminator across the face';
  mapWrap.appendChild(map);
  const readout = el('div', 'mp-read', '');
  mapWrap.appendChild(readout);
  ac.appendChild(mapWrap);

  const layers = { grid: true, labels: true, term: true };
  const tags = el('div', 'mp-tags');
  Object.keys(layers).forEach(k => {
    const t = el('button', 'mp-tag on', k === 'term' ? 'TERMINATOR' : k.toUpperCase());
    t.onclick = () => { layers[k] = !layers[k]; t.classList.toggle('on', layers[k]); paintMap(); };
    tags.appendChild(t);
  });
  ac.appendChild(tags);

  /* the cycle, ticked out day by day, with the moon itself as the handle */
  const tlWrap = el('div', 'mp-tl');
  const tl = el('canvas');
  tlWrap.appendChild(tl);
  const tlLbl = el('div', 'mp-tllbl', '<span>NEW</span><span>FULL</span><span>NEW</span>');
  ac.append(tlWrap, tlLbl);
  ac.querySelector('.mp-x').onclick = () => { ac.classList.toggle('tall'); paintMap(); };
  host.appendChild(ac);

  const subsolar = p => 180 - 360 * (((p % 1) + 1) % 1);   /* longitude the sun stands over */

  function paintMap() {
    const w = mapWrap.clientWidth || 280, h = ac.classList.contains('tall') ? 214 : 148;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (map.width !== w * dpr || map.height !== h * dpr) { map.width = w * dpr; map.height = h * dpr; }
    map.style.height = h + 'px';
    const g = map.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const X = lon => (lon + 90) / 180 * w;
    const Y = lat => (62 - lat) / 124 * h;

    /* regolith */
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#171a20');
    base.addColorStop(0.5, '#1d2027');
    base.addColorStop(1, '#141619');
    g.fillStyle = base; g.fillRect(0, 0, w, h);

    /* the seas, and the highlands they sit in */
    MARIA.forEach(([lon, lat, rx, ry], i) => {
      const x = X(lon), y = Y(lat);
      const gx = g.createRadialGradient(x, y, 0, x, y, Math.max(rx / 180 * w, ry / 124 * h));
      gx.addColorStop(0, `rgba(8,10,16,${0.62 - (i % 3) * 0.06})`);
      gx.addColorStop(1, 'rgba(8,10,16,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, (ry / 124 * h) / (rx / 180 * w));
      g.fillStyle = gx;
      g.beginPath(); g.arc(0, 0, rx / 180 * w, 0, Math.PI * 2); g.fill();
      g.restore();
    });
    CRATERS_A.forEach(([lon, lat, name]) => {
      const x = X(lon), y = Y(lat);
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, name === 'TYCHO' ? 4.5 : 3.2, 0, Math.PI * 2); g.stroke();
      if (name === 'TYCHO') {                        /* the rays, because everyone knows them */
        g.strokeStyle = 'rgba(255,255,255,.07)';
        for (let a = 0; a < 9; a++) {
          const t = a / 9 * Math.PI * 2 + 0.3;
          g.beginPath(); g.moveTo(x + Math.cos(t) * 6, y + Math.sin(t) * 6);
          g.lineTo(x + Math.cos(t) * (26 + (a % 3) * 12), y + Math.sin(t) * (18 + (a % 3) * 9));
          g.stroke();
        }
      }
    });

    /* the graticule */
    if (layers.grid) {
      g.font = '8px ui-sans-serif, system-ui';
      for (let lon = -90; lon <= 90; lon += 15) {
        const major = lon % 45 === 0;
        g.strokeStyle = lon === 0 ? 'rgba(255,255,255,.20)' : `rgba(255,255,255,${major ? 0.11 : 0.05})`;
        g.setLineDash(lon === 0 ? [] : [2, 4]);
        g.beginPath(); g.moveTo(X(lon), 0); g.lineTo(X(lon), h); g.stroke();
        if (major) {
          g.setLineDash([]);
          g.fillStyle = 'rgba(255,255,255,.34)';
          g.textAlign = lon <= -90 ? 'left' : lon >= 90 ? 'right' : 'center';
          g.fillText(lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, X(lon), h - 5);
        }
      }
      for (let lat = -60; lat <= 60; lat += 15) {
        const major = lat % 30 === 0;
        g.strokeStyle = lat === 0 ? 'rgba(255,255,255,.20)' : `rgba(255,255,255,${major ? 0.11 : 0.05})`;
        g.setLineDash(lat === 0 ? [] : [2, 4]);
        g.beginPath(); g.moveTo(0, Y(lat)); g.lineTo(w, Y(lat)); g.stroke();
        if (major && lat !== 0) {
          g.setLineDash([]);
          g.fillStyle = 'rgba(255,255,255,.34)';
          g.textAlign = 'left';
          g.fillText(`${lat > 0 ? '+' : '−'}${Math.abs(lat)}`, 4, Y(lat) - 3);
        }
      }
      g.setLineDash([]);
    }

    /* names, only where there is room for them */
    if (layers.labels && w > 250) {
      g.font = '7.5px ui-sans-serif, system-ui';
      g.textAlign = 'center';
      MARIA.forEach(([lon, lat, rx, , name]) => {
        if (rx < 11) return;                          /* only the seas with room for their names */
        g.fillStyle = 'rgba(226,234,255,.40)';
        g.fillText(name, X(lon), Y(lat) + 2);
      });
      g.fillStyle = 'rgba(226,234,255,.32)';
      g.fillText('TYCHO', X(-11), Y(-43) + 13);
    }

    /* night, poured over the face from wherever the sun is not */
    const ls = subsolar(P.phase ?? 0.68);
    for (let x = 0; x < w; x++) {
      const lon = x / w * 180 - 90;
      const f = Math.cos((lon - ls) * Math.PI / 180);
      const dark = Math.max(0, Math.min(1, 1 - Math.max(0, f) ** 0.55));
      g.fillStyle = `rgba(3,5,11,${(0.9 * dark).toFixed(3)})`;
      g.fillRect(x, 0, 1.02, h);
    }
    if (layers.term) {
      for (const t of [ls - 90, ls + 90]) {          /* both edges of the lit hemisphere */
        if (t < -92 || t > 92) continue;
        g.strokeStyle = 'rgba(160,190,255,.55)';
        g.lineWidth = 1;
        g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(X(t), 0); g.lineTo(X(t), h); g.stroke();
        g.setLineDash([]);
      }
    }

    /* the sub-solar point, and the point the earth stares at */
    if (Math.abs(ls) <= 90) {
      const x = X(ls), y = Y(0);
      g.strokeStyle = 'rgba(255,214,140,.9)';
      g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 9, y);
      g.moveTo(x, y - 9); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 9); g.stroke();
    }
    const ex = X(0), ey = Y(0);
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(ex - 5, ey); g.lineTo(ex + 5, ey); g.moveTo(ex, ey - 5); g.lineTo(ex, ey + 5); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(ex, ey, 1.7, 0, Math.PI * 2); g.fill();

    readout.innerHTML =
      `<span class="k">sub-earth</span><b>0.0°N 0.0°E</b><span class="k">sub-solar</span><b>${ls >= 0 ? '' : '−'}${Math.abs(ls).toFixed(1)}°${ls < 0 ? 'W' : 'E'}</b>`;
    paintTl();
  }

  function paintTl() {
    const w = tlWrap.clientWidth || 280, h = 26;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (tl.width !== w * dpr || tl.height !== h * dpr) { tl.width = w * dpr; tl.height = h * dpr; }
    tl.style.height = h + 'px';
    const g = tl.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 9, span = w - pad * 2;
    const days = Math.max(1, Math.round(P.period ?? 27.3));

    g.fillStyle = 'rgba(255,255,255,.22)';
    g.beginPath(); g.arc(3.5, h / 2, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w - 3.5, h / 2, 2.2, 0, Math.PI * 2); g.fill();

    for (let i = 0; i <= days; i++) {
      const t = i / days, x = pad + t * span;
      const q = Math.abs(((t * 4) % 1)) < 0.02 || Math.abs(((t * 4) % 1)) > 0.98;
      g.strokeStyle = q ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.14)';
      g.lineWidth = 1;
      const len = q ? 9 : 5;
      g.beginPath(); g.moveTo(x, h / 2 - len / 2); g.lineTo(x, h / 2 + len / 2); g.stroke();
    }

    const cur = ((P.phase ?? 0.68) % 1 + 1) % 1;
    const hx = pad + cur * span;
    g.fillStyle = 'rgba(18,18,18,.96)';
    g.strokeStyle = 'rgba(255,255,255,.16)';
    const bw = 30, bh = 20;
    g.beginPath();
    g.roundRect(Math.max(0, Math.min(w - bw, hx - bw / 2)), h / 2 - bh / 2, bw, bh, 10);
    g.fill(); g.stroke();
    drawMoon(g, Math.max(bw / 2, Math.min(w - bw / 2, hx)), h / 2, 6.4,
      { phase: cur, tint: P.tint, earthshine: 0.18, brightness: 1 });
  }

  const scrub = (elm, fn) => {
    const move = e => {
      const r = elm.getBoundingClientRect();
      fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), e);
    };
    on(elm, 'pointerdown', e => { elm.setPointerCapture(e.pointerId); elm.classList.add('grabbing'); move(e); });
    on(elm, 'pointermove', e => { if (elm.hasPointerCapture?.(e.pointerId)) move(e); });
    on(elm, 'pointerup', e => { elm.releasePointerCapture?.(e.pointerId); elm.classList.remove('grabbing'); });
  };
  scrub(tlWrap, t => { setProp(node, 'phase', +t.toFixed(4)); paintAll(); });
  /* dragging the atlas walks the terminator, which is the same thing as walking the phase */
  let mdrag = null;
  on(map, 'pointerdown', e => { map.setPointerCapture(e.pointerId); mdrag = { x: e.clientX, p: P.phase ?? 0.68 }; map.classList.add('grabbing'); });
  on(map, 'pointermove', e => {
    if (!mdrag) return;
    const p = (((mdrag.p - (e.clientX - mdrag.x) / (map.clientWidth || 280) * 0.5) % 1) + 1) % 1;
    setProp(node, 'phase', +p.toFixed(4));
    paintAll();
  });
  const endMap = () => { mdrag = null; map.classList.remove('grabbing'); };
  on(map, 'pointerup', endMap);
  on(map, 'pointercancel', endMap);

  const sky = cv.getContext('2d');
  function paintSky() {
    const w = cv.clientWidth || 300, h = compact ? 116 : 138;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    cv.style.height = h + 'px';
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.clearRect(0, 0, w, h);

    const elev = P.elevation ?? 46;
    const up = Math.max(-1, Math.min(1, elev / 60));
    const horizon = h - 22;

    /* night sky, warmer near the horizon */
    const g = sky.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070f');
    g.addColorStop(0.62, '#0a1020');
    g.addColorStop(1, '#141c2c');
    sky.fillStyle = g; sky.fillRect(0, 0, w, h);

    /* stars — fixed, so redraws do not sparkle */
    for (let i = 0; i < 46; i++) {
      const x = ((i * 977) % 1000) / 1000 * w;
      const y = ((i * 613) % 1000) / 1000 * horizon;
      const s = ((i * 37) % 10) / 10;
      sky.fillStyle = `rgba(210,224,255,${0.10 + s * 0.35})`;
      sky.fillRect(x, y, 1.1, 1.1);
    }

    /* horizon and its haze */
    const hz = sky.createLinearGradient(0, horizon - 26, 0, horizon);
    hz.addColorStop(0, 'rgba(90,120,180,0)');
    hz.addColorStop(1, 'rgba(120,150,205,.16)');
    sky.fillStyle = hz; sky.fillRect(0, horizon - 26, w, 26);
    sky.fillStyle = '#070a11'; sky.fillRect(0, horizon, w, h - horizon);
    sky.strokeStyle = 'rgba(255,255,255,.10)';
    sky.beginPath(); sky.moveTo(0, horizon + .5); sky.lineTo(w, horizon + .5); sky.stroke();

    /* the moon, placed by altitude and by which way it is facing */
    const r = Math.max(13, Math.min(30, 9 + (P.angular ?? 1.6) * 8));
    const cx = w * (0.18 + (((P.azimuth ?? 292) % 360) / 360) * 0.64);
    const cy = horizon - 14 - up * (horizon - 34);
    drawMoon(sky, cx, cy, r, {
      phase: P.phase ?? 0.68, tint: P.tint, earthshine: P.earthshine ?? 0.16,
      brightness: P.brightness ?? 1.1,
    });

    /* a moon under the horizon is a fact worth showing, not hiding */
    if (elev < 0) {
      sky.fillStyle = 'rgba(4,6,11,.72)';
      sky.fillRect(0, horizon, w, h - horizon);
      sky.fillStyle = 'rgba(4,6,11,.55)';
      sky.fillRect(0, 0, w, h);
    }
  }

  const nameEl = cap.querySelector('.mp-name');
  const illumEl = cap.querySelector('.mp-illum');
  const altEl = cap.querySelector('.mp-alt');
  function paintCap() {
    const p = P.phase ?? 0.68;
    nameEl.textContent = phaseName(p);
    illumEl.textContent = `${Math.round(illumination(p) * 100)}% lit`;
    const e = P.elevation ?? 46, az = P.azimuth ?? 292;
    altEl.innerHTML = e < 0
      ? `<span class="down">below the horizon</span> · ${compassOf(az)}`
      : `${e.toFixed(0)}° above · ${compassOf(az)} ${Math.round(az)}°`;
  }

  /* drag across the sky to walk the phase */
  let drag = null;
  on(cv, 'pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, p: P.phase ?? 0.68 };
    cv.classList.add('grabbing');
  });
  on(cv, 'pointermove', e => {
    if (!drag) return;
    const w = cv.clientWidth || 300;
    const p = (((drag.p + (e.clientX - drag.x) / w) % 1) + 1) % 1;
    setProp(node, 'phase', +p.toFixed(4));
    paintAll();
  });
  const endDrag = () => { drag = null; cv.classList.remove('grabbing'); };
  on(cv, 'pointerup', endDrag);
  on(cv, 'pointercancel', endDrag);

  /* ── card 2 · phase ───────────────────────────────────────────────────────────────────── */
  const pc = el('div', 'pcard');
  pc.innerHTML = `<h4>Phase<span class="cw">${ic('chevdown', { size: 12 })}</span></h4>`;
  const pb = el('div', 'pbody');
  pc.appendChild(pb);
  pc.querySelector('h4').onclick = () => pc.classList.toggle('shut');

  const strip = el('div', 'mp-strip');
  const stops = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  const chips = stops.map(v => {
    const b = el('button', 'mp-chip');
    b.title = phaseName(v);
    const c = el('canvas');
    c.width = 68; c.height = 68;
    b.appendChild(c);
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    drawMoon(g, 17, 17, 12, { phase: v, tint: P.tint, earthshine: 0.14, brightness: 1 });
    b.onclick = () => { setProp(node, 'phase', v); paintAll(); };
    strip.appendChild(b);
    return { b, v };
  });
  pb.appendChild(strip);

  const fine = slider({
    min: 0, max: 1, value: P.phase ?? 0.68, dec: 3, thin: compact,
    onInput: v => { setProp(node, 'phase', v); paintAll(); },
  });
  pb.appendChild(row('Fine', fine));
  const period = slider({
    min: 1, max: 60, value: P.period ?? 27.3, dec: 1, unit: 'd', thin: compact,
    onInput: v => { setProp(node, 'period', v); paintAll(); },
  });
  pb.appendChild(row('Cycle', period));
  const nextFull = el('div', 'mp-note', '');
  pb.appendChild(nextFull);
  host.appendChild(pc);

  /* ── card 3 · where it is ─────────────────────────────────────────────────────────────── */
  const sc = el('div', 'pcard');
  sc.innerHTML = `<h4>Sky track<span class="cw">${ic('chevdown', { size: 12 })}</span></h4>`;
  const sb = el('div', 'pbody');
  sc.appendChild(sb);
  sc.querySelector('h4').onclick = () => sc.classList.toggle('shut');

  const dials = el('div', 'mp-dials');
  const compass = el('div', 'mp-dial', `
    <svg viewBox="0 0 100 100">
      <circle class="ring" cx="50" cy="50" r="40"/>
      <circle class="ring2" cx="50" cy="50" r="29"/>
      <g class="ticks"></g>
      <line class="needle" x1="50" y1="50" x2="50" y2="14"/>
      <circle class="hub" cx="50" cy="50" r="3.2"/>
      <circle class="knob" cx="50" cy="14" r="5.4"/>
      <text class="lbl n" x="50" y="9">N</text><text class="lbl" x="93" y="53">E</text>
      <text class="lbl" x="50" y="97">S</text><text class="lbl" x="7" y="53">W</text>
    </svg>
    <div class="cap">azimuth</div>`);
  const alt = el('div', 'mp-dial', `
    <svg viewBox="0 0 100 100">
      <path class="arc" d="M 10 72 A 40 40 0 0 1 90 72"/>
      <line class="ground" x1="6" y1="72" x2="94" y2="72"/>
      <path class="fill" d=""/>
      <line class="ray" x1="50" y1="72" x2="50" y2="32"/>
      <circle class="knob" cx="50" cy="32" r="5.4"/>
      <text class="lbl" x="50" y="86">horizon</text>
    </svg>
    <div class="cap">altitude</div>`);
  dials.append(compass, alt);
  sb.appendChild(dials);

  const ticks = compass.querySelector('.ticks');
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const long = i % 6 === 0;
    const r1 = long ? 33 : 36, r2 = 40;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 50 + Math.sin(a) * r1); l.setAttribute('y1', 50 - Math.cos(a) * r1);
    l.setAttribute('x2', 50 + Math.sin(a) * r2); l.setAttribute('y2', 50 - Math.cos(a) * r2);
    l.setAttribute('class', long ? 'tick long' : 'tick');
    ticks.appendChild(l);
  }

  const needle = compass.querySelector('.needle');
  const cKnob = compass.querySelector('.knob');
  const ray = alt.querySelector('.ray');
  const aKnob = alt.querySelector('.knob');
  const aFill = alt.querySelector('.fill');

  function paintDials() {
    const az = ((P.azimuth ?? 292) % 360 + 360) % 360;
    const a = az * Math.PI / 180;
    const x = 50 + Math.sin(a) * 36, y = 50 - Math.cos(a) * 36;
    needle.setAttribute('x2', x); needle.setAttribute('y2', y);
    cKnob.setAttribute('cx', x); cKnob.setAttribute('cy', y);

    const e = Math.max(-20, Math.min(90, P.elevation ?? 46));
    const t = (e + 20) / 110 * Math.PI;                /* -20°…90° across a half turn */
    const ex = 50 - Math.cos(t) * 40, ey = 72 - Math.sin(t) * 40;
    ray.setAttribute('x2', ex); ray.setAttribute('y2', ey);
    aKnob.setAttribute('cx', ex); aKnob.setAttribute('cy', ey);
    aKnob.classList.toggle('under', e < 0);
    aFill.setAttribute('d', `M 10 72 A 40 40 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`);
  }

  const dragDial = (elm, fn) => {
    const move = e => {
      const r = elm.getBoundingClientRect();
      fn((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100);
    };
    on(elm, 'pointerdown', e => { elm.setPointerCapture(e.pointerId); elm.classList.add('grabbing'); move(e); });
    on(elm, 'pointermove', e => { if (elm.hasPointerCapture?.(e.pointerId)) move(e); });
    on(elm, 'pointerup', e => { elm.releasePointerCapture?.(e.pointerId); elm.classList.remove('grabbing'); });
  };
  dragDial(compass, (x, y) => {
    const az = ((Math.atan2(x - 50, 50 - y) * 180 / Math.PI) + 360) % 360;
    setSky(null, az);
  });
  dragDial(alt, (x, y) => {
    const t = Math.atan2(72 - y, 50 - x);              /* 0 at the left horizon, π/2 at zenith */
    const e = Math.max(-20, Math.min(90, (Math.min(Math.max(t, 0), Math.PI) / Math.PI) * 110 - 20));
    setSky(e, null);
  });

  const track = el('div', 'mp-track', '');
  sb.appendChild(track);
  const hint = el('div', 'mp-note', 'The moon rides the world clock — dragging it scrubs the time of day.');
  sb.appendChild(hint);
  host.appendChild(sc);

  /* ── card 4 · light ───────────────────────────────────────────────────────────────────── */
  const lc = el('div', 'pcard');
  lc.innerHTML = `<h4>Light<span class="cw">${ic('chevdown', { size: 12 })}</span></h4>`;
  const lb = el('div', 'pbody');
  lc.appendChild(lb);
  lc.querySelector('h4').onclick = () => lc.classList.toggle('shut');

  /* angular size, drawn against the half a degree the real one takes up */
  const sizeWrap = el('div', 'mp-size');
  const sizeCv = el('canvas');
  sizeWrap.appendChild(sizeCv);
  const sizeCap = el('div', 'mp-note', '');
  const sizeSlider = slider({
    min: 0.2, max: 6, value: P.angular ?? 1.6, dec: 2, unit: '°', thin: compact,
    onInput: v => { setProp(node, 'angular', v); paintAll(); },
  });
  lb.append(row('Size', sizeSlider), sizeWrap, sizeCap);

  function paintSize() {
    const w = sizeWrap.clientWidth || 280, h = 54;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (sizeCv.width !== w * dpr || sizeCv.height !== h * dpr) { sizeCv.width = w * dpr; sizeCv.height = h * dpr; }
    sizeCv.style.height = h + 'px';
    const g = sizeCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const real = 0.52, mine = Math.max(0.2, P.angular ?? 1.6);
    const scale = 21 / Math.max(real, mine);           /* the bigger of the two fills the strip */
    const cx = w / 2, cy = h / 2;
    /* always drawn full: this row is about how big it is, not what phase it is in */
    drawMoon(g, cx, cy, mine * scale, { phase: 0.5, tint: P.tint, earthshine: 0.2, brightness: 0.7 });
    /* the real moon, dashed, straight over it — the comparison needs no words */
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.arc(cx, cy, real * scale, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.85)';
    g.setLineDash([3, 3]);
    g.beginPath(); g.arc(cx, cy, real * scale, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.34)';
    g.font = '9px ui-sans-serif, system-ui';
    g.fillText('real 0.52°', 8, h - 8);
    g.textAlign = 'right';
    g.fillText(`${mine.toFixed(2)}°`, w - 8, h - 8);
    g.textAlign = 'left';
    sizeCap.textContent = `${(mine / real).toFixed(1)}× the real moon`;
    markTints();
  }

  const TINTS = [['#d8e2f2', 'Cold'], ['#f2ece0', 'Neutral'], ['#f6d9b0', 'Harvest'], ['#c3d0ff', 'Blue hour']];
  const tintRow = el('div', 'mp-tints');
  const tintBtns = TINTS.map(([c, label]) => {
    const b = el('button', 'mp-tint');
    b.style.background = c;
    b.title = label;
    b.onclick = () => { setProp(node, 'tint', c); paintAll(); };
    tintRow.appendChild(b);
    return { b, c };
  });
  const markTints = () => tintBtns.forEach(({ b, c }) =>
    b.classList.toggle('on', (P.tint || '').toLowerCase() === c));
  const chip = colorChip(P.tint, v => { setProp(node, 'tint', v); paintAll(); });
  tintRow.appendChild(chip);
  lb.appendChild(row('Tint', tintRow, true));

  const bright = slider({
    min: 0, max: 4, value: P.brightness ?? 1.1, dec: 2, unit: '×', thin: compact,
    onInput: v => { setProp(node, 'brightness', v); paintAll(); },
  });
  const earth = slider({
    min: 0, max: 1, value: P.earthshine ?? 0.16, dec: 2, thin: compact,
    onInput: v => { setProp(node, 'earthshine', v); paintAll(); },
  });
  const lux = slider({
    min: 0, max: 2, value: P.moonlight ?? 0.35, dec: 2, unit: 'lx', thin: compact,
    onInput: v => { setProp(node, 'moonlight', v); paintAll(); },
  });
  lb.append(row('Brightness', bright), row('Earthshine', earth), row('Moonlight', lux));
  const luxNote = el('div', 'mp-note', '');
  lb.appendChild(luxNote);
  host.appendChild(lc);

  /* ── keeping every surface honest ─────────────────────────────────────────────────────── */
  function paintAll() {
    paintSky(); paintCap(); paintDials(); paintSize(); paintChart(); paintMap();
    const p = ((P.phase ?? 0.68) % 1 + 1) % 1;
    const litPc = illumination(p) * 100;
    const per = P.period ?? 27.3;
    const elev = P.elevation ?? 46, azm = P.azimuth ?? 292;
    numI.textContent = Math.floor(litPc);
    numD.textContent = `.${Math.round(litPc * 10) % 10}`;
    pLit.innerHTML = `${Math.round(litPc)}<em>%</em>`;
    pAge.innerHTML = `${(p * per).toFixed(1)}<em>d</em>`;
    pAlt.innerHTML = `${elev >= 0 ? '+' : '−'}${Math.abs(elev).toFixed(0)}<em>°</em>`;
    pAz.innerHTML = `${compassOf(azm)}<em>${Math.round(azm)}°</em>`;
    pAz.parentElement.title = `Azimuth ${azm.toFixed(1)}°`;
    sUp.classList.toggle('down', elev < 0);
    sUp.querySelector('.i').innerHTML = elev < 0 ? ic('alert', { size: 12 }) : ic('check', { size: 12 });
    sUp.querySelector('.l').textContent = elev < 0 ? 'Below horizon' : 'Above horizon';
    sUp.querySelector('.n').innerHTML = `${elev >= 0 ? '' : '−'}${Math.abs(elev).toFixed(0)}<em>°</em>`;
    sLx.querySelector('.n').innerHTML =
      `${((P.moonlight ?? 0.35) * illumination(p)).toFixed(2)}<em>lx</em>`;
    chips.forEach(({ b, v }) => b.classList.toggle('on', Math.abs(((p - v + 1.5) % 1) - 0.5) < 0.0626));
    const days = ((0.5 - p + 1) % 1) * (P.period ?? 27.3);
    nextFull.textContent = phaseName(p) === 'Full moon'
      ? 'Full tonight'
      : `Full in ${days.toFixed(1)} days · ${((1 - p) % 1 * (P.period ?? 27.3)).toFixed(1)} to new`;
    const e = P.elevation ?? 46;
    const rise = hourFromElevation(0, 21), set = hourFromElevation(0, 9), transit = 0;
    const clock = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round(h % 1 * 60)).padStart(2, '0')}`;
    track.innerHTML =
      `<span class="k">rise</span><b>${clock(rise)}</b>
       <span class="k">transit</span><b>${clock(transit)}</b>
       <span class="k">set</span><b>${clock(set)}</b>`;
    const l = (P.moonlight ?? 0.35) * illumination(p);
    luxNote.textContent = `${l.toFixed(2)} lx on the ground · ${e < 0 ? 'nothing while it is down' : l < 0.05 ? 'starlight' : l < 0.25 ? 'you could walk' : 'you could read'}`;
    /* keep the fine controls in step when the value came from somewhere else */
    fine._set && fine._set(P.phase);
    period._set && period._set(P.period);
    sizeSlider._set && sizeSlider._set(P.angular);
    bright._set && bright._set(P.brightness);
    earth._set && earth._set(P.earthshine);
    lux._set && lux._set(P.moonlight);
    chip._set && chip._set(P.tint);
  }

  function row(label, ctl, wide = false) {
    const r = el('div', `prow${wide ? ' wide' : ''}`);
    r.append(el('span', 'pl', label), ctl);
    return r;
  }

  syncers.push(paintAll);
  register && register(() => syncers.forEach(f => f()));

  /* the hero canvas is width-driven, so it has to know when the dock does */
  const ro = new ResizeObserver(() => { paintSky(); paintSize(); paintChart(); paintMap(); });
  ro.observe(host);
  host._dispose = () => ro.disconnect();

  requestAnimationFrame(paintAll);
  paintAll();
  return host;
}
