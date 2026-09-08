/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE STARS PANEL
   A star field is four numbers and a colour pair, and every one of them is invisible until you
   look at the sky. So the panel is the sky:

     · a live field of the stars you have actually asked for — the right count, the right sizes,
       the right two colour classes, twinkling at the rate you set, with the galactic band lying
       across it. Drag it and the sphere turns
     · a magnitude histogram, because that is how a star field is really described: how many of
       each brightness, and where your limit falls
     · a spectral ramp from the cool class to the warm one, with the population sitting on it
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { el, colorChip } from '../kit.js';
import { tape, stepper, pillToggle } from './controls.js';
import { ic } from '../icons.js';

const STAR_N = 5200;                                    /* the field in viewport.js, exactly */

const rgb = c => {
  const n = parseInt((c || '#bcd4ff').slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const mixC = (a, b, t) => {
  const A = rgb(a), B = rgb(b), f = Math.max(0, Math.min(1, t));
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
};
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

export const starCount = density => Math.round(STAR_N * Math.min(1, Math.max(0.02, density * 1.4)));
/* a field this dense, this bright, reaches about this deep */
export const limitingMag = (density, brightness) =>
  2.6 + Math.log(starCount(density)) / Math.log(2.512) * 0.42 + Math.log2(Math.max(0.05, brightness)) * 0.35;

const SPECTRAL = [['O', 0], ['B', 0.12], ['A', 0.26], ['F', 0.42], ['G', 0.58], ['K', 0.74], ['M', 1]];

/* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
export function starsPanel(node, ctx) {
  const { compact = false, setProp, register } = ctx;
  const P = node.props;
  const host = el('div', 'mpanel starpanel');
  const syncers = [];
  const on = (elm, ev, fn) => elm.addEventListener(ev, fn);
  const DEN = () => P.density ?? 0.55;
  const BRI = () => P.brightness ?? 1.15;
  const SIZE = () => P.size ?? 1.5;
  const TWK = () => P.twinkle ?? 0.45;
  const ROT = () => ((P.rotation ?? 24) % 360 + 360) % 360;
  const DRIFT = () => P.drift ?? 0.6;

  /* one deterministic sky, so the same settings always give the same stars */
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const SKY = Array.from({ length: 900 }, (_, i) => ({
    u: hash(i, 1),
    v: hash(i, 2),
    mag: 1 + Math.pow(hash(i, 3), 0.55) * 5.6,
    temp: hash(i, 4),
    tw: hash(i, 5),
  }));

  /* ── hero · the field ──────────────────────────────────────────────────────────────────── */
  const hero = el('div', 'pcard mp-hero st-hero');
  const cv = el('canvas', 'mp-sky');
  cv.title = 'Drag to turn the sphere';
  const cap = el('div', 'mp-cap',
    `<div class="l"><b class="st-name">—</b><span class="mp-illum st-sub">—</span></div>
     <div class="r"><span class="st-r">—</span></div>`);
  hero.append(cv, cap);
  host.appendChild(hero);

  let t0 = performance.now() / 1000, clock = 0;
  const sky = cv.getContext('2d');
  function paintHero() {
    const w = cv.clientWidth || 300, h = compact ? 140 : 170;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    cv.style.height = h + 'px';
    const g = sky;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    g.fillStyle = '#04060c';
    g.fillRect(0, 0, w, h);

    const rot = (ROT() + clock * DRIFT() * 1.2) % 360;
    const shift = rot / 360;
    const lim = limitingMag(DEN(), BRI());
    const warm = P.warm || '#ffd7ae', cool = P.cool || '#bcd4ff';

    /* the galactic band, laid diagonally across the field */
    if (P.milkyway !== false) {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(-0.34);
      const band = g.createLinearGradient(0, -h * 0.42, 0, h * 0.42);
      band.addColorStop(0, 'rgba(150,170,220,0)');
      band.addColorStop(0.42, 'rgba(150,170,220,.055)');
      band.addColorStop(0.5, 'rgba(190,200,235,.10)');
      band.addColorStop(0.58, 'rgba(150,170,220,.055)');
      band.addColorStop(1, 'rgba(150,170,220,0)');
      g.fillStyle = band;
      g.fillRect(-w, -h * 0.42, w * 2, h * 0.84);
      /* dust lanes */
      for (let i = 0; i < 5; i++) {
        g.fillStyle = `rgba(4,6,12,${0.10 + (i % 3) * 0.05})`;
        g.fillRect(-w, -6 + i * 4 - 2, w * 2, 2 + (i % 2));
      }
      g.restore();
    }

    /* the stars themselves */
    const n = Math.min(SKY.length, Math.round(SKY.length * Math.min(1, Math.max(0.02, DEN() * 1.4))));
    for (let i = 0; i < n; i++) {
      const s = SKY[i];
      if (s.mag > lim) continue;
      const x = ((s.u + shift) % 1) * w;
      const y = s.v * h;
      const bright = Math.pow(2.512, (lim - s.mag)) / Math.pow(2.512, lim - 1);
      const tw = 1 - TWK() * 0.55 * (0.5 + 0.5 * Math.sin(clock * (2 + s.tw * 6) + s.tw * 40));
      const a = Math.max(0.05, Math.min(1, bright * BRI() * tw));
      const r = Math.max(0.35, SIZE() * (0.35 + bright * 0.9));
      const col = mixC(cool, warm, s.temp);
      if (r > 1.1) {
        const gl = g.createRadialGradient(x, y, 0, x, y, r * 3.4);
        gl.addColorStop(0, css(col, a * 0.5));
        gl.addColorStop(1, css(col, 0));
        g.fillStyle = gl;
        g.beginPath(); g.arc(x, y, r * 3.4, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = css(col, a);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    /* the meridian you are turning, ticked in degrees */
    g.font = '8px ui-sans-serif, system-ui';
    g.fillStyle = 'rgba(255,255,255,.20)';
    for (let d = 0; d < 360; d += 30) {
      const x = (((d - rot) / 360 % 1) + 1) % 1 * w;
      g.fillRect(x, h - 8, 1, d % 90 === 0 ? 5 : 3);
      if (d % 90 === 0) {
        g.textAlign = 'center';
        g.fillText(`${d}°`, x, h - 10);
      }
    }
  }

  const nameEl = cap.querySelector('.st-name');
  const subEl = cap.querySelector('.st-sub');
  const rEl = cap.querySelector('.st-r');
  const skyName = () => {
    const lim = limitingMag(DEN(), BRI());
    if (lim < 4) return 'City sky';
    if (lim < 5) return 'Suburban sky';
    if (lim < 5.8) return 'Rural sky';
    if (lim < 6.4) return 'Dark sky';
    return 'Desert sky';
  };
  function paintCap() {
    nameEl.textContent = skyName();
    subEl.textContent = `${starCount(DEN()).toLocaleString()} stars · ${SIZE().toFixed(2)} px · twinkle ${TWK().toFixed(2)}`;
    rEl.innerHTML = `mag ${limitingMag(DEN(), BRI()).toFixed(1)}`;
  }

  /* drag the sphere round */
  let lastX = null;
  on(cv, 'pointerdown', e => { cv.setPointerCapture(e.pointerId); lastX = e.clientX; cv.classList.add('grabbing'); });
  on(cv, 'pointermove', e => {
    if (lastX == null) return;
    const dx = (e.clientX - lastX) / (cv.clientWidth || 300) * 360;
    lastX = e.clientX;
    setProp(node, 'rotation', Math.round((ROT() - dx + 360) % 360));
    paintAll();
  });
  const endDrag = () => { lastX = null; cv.classList.remove('grabbing'); };
  on(cv, 'pointerup', endDrag);
  on(cv, 'pointercancel', endDrag);

  /* ── rail and duo ──────────────────────────────────────────────────────────────────────── */
  const rail = el('div', 'mp-rail');
  const pill = k => {
    const b = el('div', 'mp-pill', `<b class="v">—</b><span class="k">${k}</span>`);
    rail.appendChild(b);
    return b.querySelector('.v');
  };
  const pN = pill('Stars'), pMag = pill('Limit'), pSize = pill('Size'), pRot = pill('Rotation');
  host.appendChild(rail);

  const duo = el('div', 'mp-duo');
  const statCard = (icon, label) => {
    const c = el('div', 'pcard mp-stat',
      `<span class="i">${icon}</span><span class="l">${label}</span><b class="n">—</b>`);
    duo.appendChild(c);
    return c;
  };
  const sVis = statCard(ic('stars', { size: 12 }), 'Naked eye');
  const sDrift = statCard(ic('motion', { size: 12 }), 'Full turn in');
  host.appendChild(duo);

  /* ── magnitudes ────────────────────────────────────────────────────────────────────────── */
  const mc = el('div', 'pcard mp-metric st-mag');
  mc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Magnitudes</span><span class="s">How many, how bright</span></div>
      <button class="mp-x" title="Taller chart">${ic('arrowout', { size: 12 })}</button>
    </div>
    <div class="mp-num"><span class="i">—</span><span class="d"></span><span class="u">stars</span></div>
    <div class="mp-k mp-target">Down to <span class="v">—</span></div>`;
  const chartWrap = el('div', 'mp-chartwrap');
  const chart = el('canvas');
  chartWrap.appendChild(chart);
  mc.appendChild(chartWrap);
  const specs = el('div', 'mp-spec st-specs');
  mc.appendChild(specs);
  const numI = mc.querySelector('.mp-num .i'), numD = mc.querySelector('.mp-num .d');
  const magV = mc.querySelector('.mp-target .v');
  mc.querySelector('.mp-x').onclick = () => { mc.classList.toggle('tall'); paintMag(); };
  host.appendChild(mc);

  function paintMag() {
    const w = chartWrap.clientWidth || 280, h = mc.classList.contains('tall') ? 168 : 112;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (chart.width !== w * dpr || chart.height !== h * dpr) { chart.width = w * dpr; chart.height = h * dpr; }
    chart.style.height = h + 'px';
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = 2, R = 32, T = 8, B = 16;
    const lim = limitingMag(DEN(), BRI());
    const total = starCount(DEN());
    const bins = [];
    for (let m = 0; m <= 7; m++) bins.push(Math.pow(2.512, m * 0.6));
    const sum = bins.reduce((a, b) => a + b, 0);
    const counts = bins.map(b => Math.round(b / sum * total));
    const top = Math.max(...counts) * 1.15;
    const px = m => L + m / 8 * (w - L - R);
    const py = v => T + (1 - v / top) * (h - T - B);
    g.font = '9px ui-sans-serif, system-ui';

    [0.25, 0.5, 0.75, 1].forEach(f => {
      g.strokeStyle = 'rgba(255,255,255,.06)';
      g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(px(0), py(top * f)); g.lineTo(px(8), py(top * f)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.26)';
      g.textAlign = 'left';
      g.fillText(String(Math.round(top * f)), w - R + 5, py(top * f) + 3);
    });

    const bw = (px(1) - px(0)) * 0.72;
    counts.forEach((c, m) => {
      const on = m <= lim;
      const x = px(m + 0.5) - bw / 2;
      g.fillStyle = on ? 'rgba(190,206,255,.75)' : 'rgba(255,255,255,.07)';
      g.fillRect(x, py(c), bw, py(0) - py(c));
      if (on) {
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.textAlign = 'center';
        g.font = '8px ui-sans-serif, system-ui';
        g.fillText(String(c), x + bw / 2, py(c) - 3);
        g.font = '9px ui-sans-serif, system-ui';
      }
    });

    /* the limit, drawn where it falls */
    const lx = px(lim);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(lx, T); g.lineTo(lx, py(0)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.textAlign = lim > 5 ? 'right' : 'left';
    g.font = '8px ui-sans-serif, system-ui';
    g.fillText(`LIMIT ${lim.toFixed(1)}`, lx + (lim > 5 ? -4 : 4), T + 8);
    g.font = '9px ui-sans-serif, system-ui';

    g.fillStyle = 'rgba(255,255,255,.26)';
    g.textAlign = 'center';
    for (let m = 0; m <= 7; m++) g.fillText(String(m), px(m + 0.5), h - 3);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.20)';
    g.font = '8px ui-sans-serif, system-ui';
    g.fillText('MAGNITUDE — BRIGHTER TO FAINTER', px(0), T + 7);
  }

  /* ── the field ─────────────────────────────────────────────────────────────────────────── */
  const fc = el('div', 'pcard mp-light st-field');
  fc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Field</span><span class="s">Density · brightness · size</span></div>
    </div>`;
  const fb = el('div', 'pbody');
  fc.appendChild(fb);
  fc.querySelector('.mp-chead .l').onclick = () => fc.classList.toggle('shut');
  const denT = tape({
    label: 'Density', min: 0, max: 1, value: DEN(), dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'EMPTY' }, { t: 0.55, l: 'RURAL' }, { t: 1, l: 'FULL 5 200' }],
    onInput: v => { setProp(node, 'density', v); paintAll(); },
  });
  const briT = tape({
    label: 'Brightness', min: 0, max: 3, value: BRI(), dec: 2, unit: '×', step: 0.01,
    marks: [{ t: 0, l: 'OFF' }, { t: 1 / 3, l: 'REAL 1×' }, { t: 1, l: '3×' }],
    onInput: v => { setProp(node, 'brightness', v); paintAll(); },
  });
  const sizeT = tape({
    label: 'Point size', min: 0.4, max: 4, value: SIZE(), dec: 2, unit: 'px', step: 0.05,
    marks: [{ t: 0, l: 'PIN' }, { t: 1.1 / 3.6, l: 'SHARP 1.5' }, { t: 1, l: 'BLOOM' }],
    onInput: v => { setProp(node, 'size', v); paintAll(); },
  });
  const twkT = tape({
    label: 'Twinkle', min: 0, max: 1, value: TWK(), dec: 2, step: 0.01,
    marks: [{ t: 0, l: 'STEADY' }, { t: 0.45, l: 'AIR' }, { t: 1, l: 'HEAT HAZE' }],
    onInput: v => { setProp(node, 'twinkle', v); paintAll(); },
  });
  fb.append(denT, briT, sizeT, twkT);
  host.appendChild(fc);

  /* ── colour classes ────────────────────────────────────────────────────────────────────── */
  const cc = el('div', 'pcard mp-light st-class');
  cc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Classes</span><span class="s">Cool blue to warm amber</span></div>
    </div>`;
  const cb = el('div', 'pbody');
  cc.appendChild(cb);
  cc.querySelector('.mp-chead .l').onclick = () => cc.classList.toggle('shut');
  const rampWrap = el('div', 'mp-meter st-ramp');
  rampWrap.innerHTML = '<div class="hd"><span class="k">spectral ramp</span></div>';
  const rampCv = el('canvas');
  rampWrap.appendChild(rampCv);
  cb.appendChild(rampWrap);
  const coolHead = el('div', 'mp-subhead', '<span class="k">cool class</span>');
  const coolChip = colorChip(P.cool || '#bcd4ff', v => { setProp(node, 'cool', v); paintAll(); });
  coolHead.appendChild(coolChip);
  const warmHead = el('div', 'mp-subhead', '<span class="k">warm class</span>');
  const warmChip = colorChip(P.warm || '#ffd7ae', v => { setProp(node, 'warm', v); paintAll(); });
  warmHead.appendChild(warmChip);
  cb.append(coolHead, warmHead);
  host.appendChild(cc);

  function paintRamp() {
    const w = rampWrap.clientWidth || 280, h = 48;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (rampCv.width !== w * dpr || rampCv.height !== h * dpr) { rampCv.width = w * dpr; rampCv.height = h * dpr; }
    rampCv.style.height = h + 'px';
    const g = rampCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 8, span = w - pad * 2, y = 6, bh = 16;
    for (let x = 0; x < span; x++) {
      g.fillStyle = css(mixC(P.cool || '#bcd4ff', P.warm || '#ffd7ae', x / span));
      g.fillRect(pad + x, y, 1.02, bh);
    }
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.strokeRect(pad + .5, y + .5, span - 1, bh - 1);

    /* the population, sprinkled on the ramp it came from */
    const lim = limitingMag(DEN(), BRI());
    const n = Math.min(SKY.length, Math.round(SKY.length * Math.min(1, Math.max(0.02, DEN() * 1.4))));
    for (let i = 0; i < n; i += 2) {
      const s = SKY[i];
      if (s.mag > lim) continue;
      const x = pad + s.temp * span;
      const yy = y + bh + 6 + ((i * 37) % 7);
      g.fillStyle = css(mixC(P.cool || '#bcd4ff', P.warm || '#ffd7ae', s.temp), 0.5);
      g.fillRect(x, yy, 1.4, 1.4);
    }

    g.font = '8px ui-sans-serif, system-ui';
    SPECTRAL.forEach(([l, t], i) => {
      const x = pad + t * span;
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.textAlign = i === 0 ? 'left' : i === SPECTRAL.length - 1 ? 'right' : 'center';
      g.fillText(l, Math.max(pad + 3, Math.min(pad + span - 3, x)), y + bh - 5);
    });
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.textAlign = 'left';
    g.fillText('30 000 K', pad, h - 2);
    g.textAlign = 'right';
    g.fillText('3 000 K', pad + span, h - 2);
  }

  /* ── the sphere ────────────────────────────────────────────────────────────────────────── */
  const sc = el('div', 'pcard mp-light st-sphere');
  sc.innerHTML = `
    <div class="mp-chead">
      <div class="l"><span class="t">Sphere</span><span class="s">Rotation · sidereal drift</span></div>
    </div>`;
  const sb = el('div', 'pbody');
  sc.appendChild(sb);
  sc.querySelector('.mp-chead .l').onclick = () => sc.classList.toggle('shut');
  const rotT = tape({
    label: 'Rotation', min: 0, max: 360, value: ROT(), dec: 0, unit: '°', step: 1,
    marks: [{ t: 0, l: '0°' }, { t: 0.25, l: '90' }, { t: 0.5, l: '180' }, { t: 0.75, l: '270' }, { t: 1, l: '360' }],
    onInput: v => { setProp(node, 'rotation', Math.round(v) % 360); paintAll(); },
  });
  const driftT = tape({
    label: 'Sidereal drift', min: 0, max: 4, value: DRIFT(), dec: 2, unit: '×', step: 0.05,
    marks: [{ t: 0, l: 'FIXED' }, { t: 0.15, l: 'REAL 0.6' }, { t: 1, l: '4×' }],
    onInput: v => { setProp(node, 'drift', v); paintAll(); },
  });
  const mwTags = el('div', 'mp-tags');
  const mwPill = pillToggle('GALACTIC BAND', P.milkyway !== false, v => { setProp(node, 'milkyway', v); paintAll(); });
  mwTags.appendChild(mwPill);
  sb.append(rotT, driftT, mwTags);
  const driftNote = el('div', 'mp-note', '');
  sb.appendChild(driftNote);
  host.appendChild(sc);

  /* ── keeping every surface honest ──────────────────────────────────────────────────────── */
  function paintAll() {
    paintCap(); paintMag(); paintRamp();
    const n = starCount(DEN());
    const lim = limitingMag(DEN(), BRI());
    const turnMin = DRIFT() > 0.01 ? 24 * 60 / (DRIFT() * 120) : Infinity;

    pN.innerHTML = `${n.toLocaleString()}`;
    pMag.innerHTML = `${lim.toFixed(1)}<em>mag</em>`;
    pSize.innerHTML = `${SIZE().toFixed(2)}<em>px</em>`;
    pRot.innerHTML = `${Math.round(ROT())}<em>°</em>`;

    sVis.querySelector('.n').innerHTML = `${Math.min(n, Math.round(n * 0.42)).toLocaleString()}`;
    sDrift.classList.toggle('down', DRIFT() < 0.01);
    sDrift.querySelector('.n').innerHTML = DRIFT() < 0.01
      ? 'never'
      : turnMin > 90 ? `${(turnMin / 60).toFixed(1)}<em>h</em>` : `${turnMin.toFixed(0)}<em>min</em>`;

    numI.textContent = n.toLocaleString();
    numD.textContent = '';
    magV.textContent = `magnitude ${lim.toFixed(1)} · ${skyName().toLowerCase()}`;

    specs.innerHTML = [
      ['brightest', `mag 1.0`],
      ['faintest drawn', `mag ${lim.toFixed(1)}`],
      ['per square degree', `${(n / 41253).toFixed(3)}`],
      ['galactic band', P.milkyway === false ? 'hidden' : 'shown'],
    ].map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');

    driftNote.textContent = DRIFT() < 0.01
      ? 'The sphere is pinned — the sky will not move at all.'
      : `At ${DRIFT().toFixed(2)}× the sky comes back round every ${turnMin > 90 ? `${(turnMin / 60).toFixed(1)} hours` : `${turnMin.toFixed(0)} minutes`}.`;

    denT._set(DEN());
    briT._set(BRI());
    sizeT._set(SIZE());
    twkT._set(TWK());
    rotT._set(ROT());
    driftT._set(DRIFT());
    mwPill._set(P.milkyway !== false);
    coolChip._set && coolChip._set(P.cool || '#bcd4ff');
    warmChip._set && warmChip._set(P.warm || '#ffd7ae');
  }

  /* ── it twinkles, so it has to keep drawing ────────────────────────────────────────────── */
  let raf = 0, alive = true, visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 });
  io.observe(hero);
  const frame = () => {
    if (!alive) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.12, now - t0);
    t0 = now;
    if (visible) { clock += dt; paintHero(); }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  syncers.push(paintAll);
  register && register(() => syncers.forEach(f => f()));

  const ro = new ResizeObserver(() => {
    paintHero(); paintMag(); paintRamp();
    [denT, briT, sizeT, twkT, rotT, driftT].forEach(t => t._paint && t._paint());
  });
  ro.observe(host);
  host._dispose = () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };

  paintAll();
  return host;
}
