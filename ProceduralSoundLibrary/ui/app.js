// Browser UI. Every control is generated from the registry's parameter specs, so a new
// sound type or parameter appears here without touching this file. Rendering runs in
// this thread (the generators are fast); playback is Web Audio.

import { SOUND_TYPES, TYPE_IDS, defaultParams, renderSound } from "../src/registry.js";
import { buildCatalog } from "../src/catalog.js";
import { measure, spectrum, encodeWav } from "../src/dsp.js";
import { MATERIALS, CUSTOM_DEFAULT, DEFAULT_CONDITION } from "../src/materials.js";

const $ = (id) => document.getElementById(id);
const CATALOG = buildCatalog();
const SR = 44100;

const state = {
  type: "impact",
  params: Object.fromEntries(TYPE_IDS.map((id) => [id, defaultParams(id)])),
  seed: 1,
  cond: { ...DEFAULT_CONDITION },
  custom: { ...CUSTOM_DEFAULT },
  view: "wave",
  loop: false,
  buffer: null,
  renderTimer: 0,
  source: null,
  playStart: 0,
  playLen: 0,
  ac: null,
  presetId: null,
};

// ------------------------------------------------------------ helpers -------

const fmt = (v, step) => {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(v).toFixed(d);
};
const setStatus = (t) => ($("status").textContent = t);
const niceLabel = (id) => (MATERIALS[id]?.label ?? (id === "custom" ? "Custom surface" : id));

function fillOf(input) {
  const min = Number(input.min), max = Number(input.max), v = Number(input.value);
  input.style.setProperty("--fill", `${((v - min) / (max - min || 1)) * 100}%`);
}

// ------------------------------------------------------- type list ----------

function buildTypeList() {
  const host = $("type-list");
  host.innerHTML = "";
  const groups = {};
  for (const id of TYPE_IDS) (groups[SOUND_TYPES[id].group] ??= []).push(id);
  for (const [group, ids] of Object.entries(groups)) {
    const wrap = document.createElement("div");
    wrap.className = "type-group";
    wrap.innerHTML = `<span class="tiny-label">${group.toUpperCase()}</span>`;
    for (const id of ids) {
      const b = document.createElement("button");
      b.className = "type-item";
      b.dataset.type = id;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<i></i><span>${SOUND_TYPES[id].label}</span>`;
      b.addEventListener("click", () => selectType(id));
      wrap.appendChild(b);
    }
    host.appendChild(wrap);
  }
}

function buildPresets() {
  const host = $("preset-list");
  host.innerHTML = "";
  const items = CATALOG.filter((it) => it.type === state.type);
  $("preset-count").textContent = String(items.length);
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "preset-card";
    b.dataset.id = it.id;
    b.classList.toggle("active", it.id === state.presetId);
    b.innerHTML = `<span>${it.label}</span><b>${it.cond.wet ? "WET" : ""}</b>`;
    b.title = it.id;
    b.addEventListener("click", () => applyPreset(it));
    host.appendChild(b);
  }
  if (!items.length) host.innerHTML = `<p class="chip-note">No presets for this type.</p>`;
}

function applyPreset(it) {
  state.presetId = it.id;
  state.params[it.type] = { ...defaultParams(it.type), ...it.params };
  state.cond = { ...DEFAULT_CONDITION, ...it.cond };
  state.seed = it.seed;
  if (it.type !== state.type) selectType(it.type, true);
  else buildInspector();
  buildPresets();
  scheduleRender(0);
  setStatus(`Preset: ${it.label}`);
}

function selectType(id, quiet = false) {
  state.type = id;
  state.presetId = null;
  document.querySelectorAll(".type-item").forEach((b) => {
    const on = b.dataset.type === id;
    b.setAttribute("aria-pressed", String(on));
  });
  const t = SOUND_TYPES[id];
  $("group-label").textContent = t.group.toUpperCase();
  $("sound-name").textContent = t.label;
  $("sound-caption").textContent = t.description;
  $("breadcrumb").textContent = `Library / ${t.group} / ${t.label}`;
  buildInspector();
  buildPresets();
  if (!quiet) scheduleRender(0);
}

// --------------------------------------------------- inspector ---------------

function rangeControl(spec, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "control";
  wrap.innerHTML = `
    <div class="control-head"><span>${spec.label}</span><small>${spec.unit ?? ""}</small></div>
    <div class="control-row">
      <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" aria-label="${spec.label}" />
      <input type="number" class="num" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${fmt(value, spec.step)}" aria-label="${spec.label} value" />
      <span class="unit">${spec.unit ?? ""}</span>
    </div>`;
  const [slider, num] = wrap.querySelectorAll("input");
  fillOf(slider);
  slider.addEventListener("input", () => {
    num.value = fmt(slider.value, spec.step);
    fillOf(slider);
    onChange(Number(slider.value));
  });
  num.addEventListener("change", () => {
    const v = Math.min(spec.max, Math.max(spec.min, Number(num.value) || spec.min));
    slider.value = v;
    num.value = fmt(v, spec.step);
    fillOf(slider);
    onChange(v);
  });
  return wrap;
}

function selectControl(spec, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "control";
  wrap.innerHTML = `<div class="control-head"><span>${spec.label}</span></div>`;
  const sel = document.createElement("select");
  sel.className = "control-select";
  sel.setAttribute("aria-label", spec.label);
  for (const [v, l] of spec.options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    if (v === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function boolControl(spec, value, onChange) {
  const row = document.createElement("label");
  row.className = "switch-row control";
  row.innerHTML = `<span>${spec.label}</span><span class="switch"><input type="checkbox" ${value ? "checked" : ""} /><span></span></span>`;
  row.querySelector("input").addEventListener("change", (e) => onChange(e.target.checked));
  return row;
}

function materialControl(spec, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "control";
  wrap.innerHTML = `<div class="control-head"><span>${spec.label}</span><small class="surface-chip">${niceLabel(value)}</small></div>`;
  const grid = document.createElement("div");
  grid.className = "material-options";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", spec.label);
  const ids = [...spec.choices];
  if (!ids.includes("custom")) ids.push("custom");
  for (const id of ids) {
    const m = MATERIALS[id];
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(id === value));
    b.title = m ? m.label : "Use the custom surface sliders";
    b.innerHTML = `<i></i><span>${m ? m.label : "Custom…"}<small>${m ? m.group : "your values"}</small></span>`;
    b.addEventListener("click", () => {
      grid.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      wrap.querySelector(".surface-chip").textContent = niceLabel(id);
      onChange(id);
    });
    grid.appendChild(b);
  }
  wrap.appendChild(grid);
  return wrap;
}

function card(title, ordinal) {
  const sec = document.createElement("section");
  sec.className = "card";
  sec.innerHTML = `<header><h2>${title}</h2><span>${ordinal}</span></header>`;
  return sec;
}

function buildInspector() {
  const host = $("inspector");
  host.innerHTML = "";
  const t = SOUND_TYPES[state.type];
  const params = state.params[state.type];
  const controls = [];

  // 01 sound parameters
  const c1 = card(t.label, "01");
  const shown = [];
  for (const spec of t.params) {
    const onChange = (v) => {
      params[spec.key] = v;
      refreshVisibility();
      scheduleRender();
    };
    let el;
    if (spec.kind === "range") el = rangeControl(spec, params[spec.key], onChange);
    else if (spec.kind === "select") el = selectControl(spec, params[spec.key], onChange);
    else if (spec.kind === "bool") el = boolControl(spec, params[spec.key], onChange);
    else if (spec.kind === "material") el = materialControl(spec, params[spec.key], onChange);
    if (spec.when) {
      el.dataset.when = JSON.stringify(spec.when);
      shown.push(el);
    }
    controls.push(el);
    c1.appendChild(el);
  }
  host.appendChild(c1);

  function refreshVisibility() {
    for (const el of shown) {
      const when = JSON.parse(el.dataset.when);
      const ok = Object.entries(when).every(([k, vals]) => vals.includes(params[k]));
      el.hidden = !ok;
    }
  }
  refreshVisibility();

  // 02 surface condition (applies to every sound)
  const c2 = card("Surface condition", "02");
  c2.insertAdjacentHTML("beforeend", `<p>Applies to every sound. Wet adds a water film: it damps rings, darkens contacts and cuts the grit. Wear adds detuning and noise. Size scales every object. Room adds a tail.</p>`);
  const condSpecs = [
    { key: "wet", label: "Wetness", min: 0, max: 1, step: 0.01, unit: "" },
    { key: "wear", label: "Wear / age", min: 0, max: 1, step: 0.01, unit: "" },
    { key: "size", label: "Object size scale", min: 0.2, max: 5, step: 0.01, unit: "×" },
    { key: "room", label: "Room reverb", min: 0, max: 1, step: 0.01, unit: "" },
  ];
  for (const s of condSpecs) {
    c2.appendChild(rangeControl(s, state.cond[s.key], (v) => {
      state.cond[s.key] = v;
      scheduleRender();
    }));
  }
  host.appendChild(c2);

  // 03 custom surface: its sliders only matter when "custom" is chosen
  const c3 = card("Custom surface", "03");
  c3.insertAdjacentHTML("beforeend", `<p>Used when a surface is set to Custom. Lower base frequency and short ring = dull wood or rubber; high base and long ring = bell-like metal or glass.</p>`);
  const customSpecs = [
    { key: "base", label: "Base frequency", min: 60, max: 4000, step: 1, unit: "Hz" },
    { key: "t60", label: "Ring time (T60)", min: 0.01, max: 3, step: 0.01, unit: "s" },
    { key: "bright", label: "Brightness", min: 0, max: 1, step: 0.01, unit: "" },
    { key: "grain", label: "Roughness / grain", min: 0, max: 1, step: 0.01, unit: "" },
    { key: "hard", label: "Contact hardness", min: 0, max: 1, step: 0.01, unit: "" },
    { key: "density", label: "Density", min: 100, max: 8000, step: 10, unit: "kg/m³" },
  ];
  const cgrid = document.createElement("div");
  cgrid.className = "custom-grid";
  for (const s of customSpecs) {
    cgrid.appendChild(rangeControl(s, state.custom[s.key], (v) => {
      state.custom[s.key] = v;
      scheduleRender();
    }));
  }
  c3.appendChild(cgrid);
  host.appendChild(c3);

  // 04 output
  const c4 = card("Output", "04");
  c4.insertAdjacentHTML("beforeend", `
    <div class="seed-field"><span>Seed</span><input id="seed" type="number" min="1" step="1" value="${state.seed}" /><button id="seed-roll" type="button">Roll</button></div>
    <div class="out-row">
      <button id="dl-wav" type="button" class="primary">Download WAV</button>
      <button id="dl-json" type="button">Recipe JSON</button>
    </div>
    <p class="chip-note">Batch: <code>npm run render</code> writes all ${CATALOG.length} presets to <code>out/library</code>, with a manifest that records every recipe.</p>`);
  host.appendChild(c4);
  c4.querySelector("#seed").addEventListener("change", (e) => {
    state.seed = Math.max(1, Math.floor(Number(e.target.value) || 1));
    scheduleRender(0);
  });
  c4.querySelector("#seed-roll").addEventListener("click", () => rollSeed());
  c4.querySelector("#dl-wav").addEventListener("click", downloadWav);
  c4.querySelector("#dl-json").addEventListener("click", downloadRecipe);
}

function rollSeed() {
  state.seed = 1 + Math.floor(Math.random() * 99999);
  const f = document.getElementById("seed");
  if (f) f.value = state.seed;
  scheduleRender(0);
}

// ------------------------------------------------------ render -------------

function scheduleRender(delay = 110) {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderNow, delay);
}

function renderNow() {
  const t0 = performance.now();
  const custom = state.custom;
  try {
    const x = renderSound(state.type, state.params[state.type], {
      sr: SR, seed: state.seed, cond: state.cond, custom,
    });
    state.buffer = x;
    const ms = Math.round(performance.now() - t0);
    $("render-ms").textContent = `${ms} MS`;
    updateMetrics(x);
    drawAll();
    setStatus(`${SOUND_TYPES[state.type].label} · seed ${state.seed} · rendered in ${ms} ms`);
  } catch (err) {
    console.error(err);
    setStatus(`Render failed: ${err.message}`);
  }
}

function updateMetrics(x) {
  const m = measure(x, SR);
  $("m-dur").innerHTML = `${m.durationSec.toFixed(2)}<small>s</small>`;
  $("m-peak").innerHTML = `${m.peakDb.toFixed(1)}`;
  $("m-rms").innerHTML = `${m.rmsDb.toFixed(1)}`;
  $("m-cent").innerHTML = `${(m.centroidHz / 1000).toFixed(2)}<small>kHz</small>`;
  $("time").textContent = `0.00 / ${m.durationSec.toFixed(2)} s`;
}

// ------------------------------------------------------ drawing ------------

function sizeCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const r = c.getBoundingClientRect();
  const w = Math.max(10, Math.floor(r.width * dpr));
  const h = Math.max(10, Math.floor(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return { ctx: c.getContext("2d"), w, h, dpr };
}

function drawWave(progress = -1) {
  const c = $("wave");
  const { ctx, w, h } = sizeCanvas(c);
  ctx.clearRect(0, 0, w, h);
  const x = state.buffer;
  if (!x) return;
  const mid = h / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  ctx.fillStyle = "#8da694";
  const step = x.length / w;
  for (let px = 0; px < w; px++) {
    let lo = 0, hi = 0;
    const s0 = Math.floor(px * step), s1 = Math.min(x.length, Math.floor((px + 1) * step) + 1);
    for (let i = s0; i < s1; i++) {
      if (x[i] < lo) lo = x[i];
      if (x[i] > hi) hi = x[i];
    }
    const y0 = mid - hi * mid * 0.92, y1 = mid - lo * mid * 0.92;
    ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
  }
  if (progress >= 0) {
    ctx.fillStyle = "#eee";
    ctx.fillRect(Math.round(progress * w), 0, 1.5, h);
  }
}

function drawSpec() {
  const c = $("spec");
  const { ctx, w, h } = sizeCanvas(c);
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, w, h);
  const x = state.buffer;
  if (!x) return;
  const N = 1024, hop = 256, bins = 256;
  const maxHz = 12000;
  const frames = Math.max(1, Math.floor((x.length - N) / hop) + 1);
  const img = ctx.createImageData(frames, bins);
  for (let f = 0; f < frames; f++) {
    const mag = spectrum(x.subarray(f * hop, f * hop + N));
    for (let b = 0; b < bins; b++) {
      // log-ish frequency axis, low frequencies get more room
      const frac = Math.pow(b / bins, 2.2);
      const k = Math.min(mag.length - 1, Math.floor(frac * (maxHz / (SR / N))));
      const db = 20 * Math.log10(mag[k] + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 90) / 80));
      const row = bins - 1 - b;
      const o = (row * frames + f) * 4;
      img.data[o] = 20 + v * 120;
      img.data[o + 1] = 25 + v * 150;
      img.data[o + 2] = 20 + v * 120;
      img.data[o + 3] = 255;
    }
  }
  const off = document.createElement("canvas");
  off.width = frames;
  off.height = bins;
  off.getContext("2d").putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, w, h);
  // frequency ticks
  ctx.fillStyle = "rgba(200,200,200,0.35)";
  ctx.font = `${10 * (window.devicePixelRatio || 1)}px sans-serif`;
  for (const k of [1, 2, 4, 8, 12]) {
    const frac = Math.pow((k * 1000) / maxHz, 1 / 2.2);
    const y = h - frac * h;
    ctx.fillText(`${k}k`, 6, y - 2);
  }
}

function drawAll() {
  if (state.view === "wave") drawWave();
  else drawSpec();
  $("wave-empty").hidden = !!state.buffer;
}

// ------------------------------------------------------ playback -----------

function audio() {
  if (!state.ac) state.ac = new (window.AudioContext || window.webkitAudioContext)();
  if (state.ac.state === "suspended") state.ac.resume();
  return state.ac;
}

function stop() {
  if (state.source) {
    try { state.source.onended = null; state.source.stop(); } catch (_) { /* already stopped */ }
    state.source = null;
  }
  cancelAnimationFrame(state.raf);
  $("play").textContent = "▶ Play";
  if (state.buffer) drawAll();
}

function play() {
  if (!state.buffer) return;
  stop();
  const ac = audio();
  const buf = ac.createBuffer(1, state.buffer.length, SR);
  buf.copyToChannel(state.buffer, 0);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = state.loop;
  src.connect(ac.destination);
  state.playStart = ac.currentTime;
  state.playLen = buf.duration;
  src.start();
  state.source = src;
  $("play").textContent = "■ Playing";
  src.onended = () => {
    if (state.source === src) {
      state.source = null;
      $("play").textContent = "▶ Play";
      cancelAnimationFrame(state.raf);
      drawAll();
    }
  };
  const tick = () => {
    const t = ac.currentTime - state.playStart;
    const p = Math.min(1, t / state.playLen);
    $("time").textContent = `${Math.min(t, state.playLen).toFixed(2)} / ${state.playLen.toFixed(2)} s`;
    if (state.view === "wave") drawWave(p);
    state.raf = requestAnimationFrame(tick);
  };
  tick();
}

// ------------------------------------------------------ export -------------

function fileBase() {
  const p = state.params[state.type];
  const mat = p.material ?? p.surface ?? p.housing ?? p.box ?? p.pane ?? p.mode ?? "";
  return `${state.type}-${mat}-seed${state.seed}`.replace(/[^a-z0-9_-]+/gi, "-");
}

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function downloadWav() {
  if (!state.buffer) return;
  download(`${fileBase()}.wav`, new Blob([encodeWav(state.buffer, SR)], { type: "audio/wav" }));
  setStatus(`Saved ${fileBase()}.wav`);
}

function downloadRecipe() {
  const recipe = {
    type: state.type,
    params: state.params[state.type],
    seed: state.seed,
    condition: state.cond,
    custom: state.custom,
    sampleRate: SR,
  };
  download(`${fileBase()}.json`, new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }));
  setStatus(`Saved recipe ${fileBase()}.json`);
}

// ------------------------------------------------------ wiring -------------

function bindToolbar() {
  $("play").addEventListener("click", () => (state.source ? stop() : play()));
  $("stop").addEventListener("click", stop);
  $("loop").addEventListener("click", (e) => {
    state.loop = !state.loop;
    e.currentTarget.setAttribute("aria-pressed", String(state.loop));
    if (state.source) state.source.loop = state.loop;
  });
  $("fit").addEventListener("click", () => scheduleRender(0));
  $("random-seed").addEventListener("click", rollSeed);
  $("export").addEventListener("click", downloadWav);
  $("view-wave").addEventListener("click", () => setView("wave"));
  $("view-spec").addEventListener("click", () => setView("spec"));
  window.addEventListener("resize", () => drawAll());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) {
      e.preventDefault();
      $("play").click();
    }
  });
}

function setView(v) {
  state.view = v;
  $("view-wave").setAttribute("aria-pressed", String(v === "wave"));
  $("view-spec").setAttribute("aria-pressed", String(v === "spec"));
  $("wave-box").hidden = v !== "wave";
  $("spec-box").hidden = v !== "spec";
  drawAll();
}

buildTypeList();
bindToolbar();
selectType(state.type, true);
scheduleRender(0);
