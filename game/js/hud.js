// DOM HUD: lap, position, speed, energy, caller panel, minimap, toasts and menus.

import { CFG, TEAMS } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.hud = $('hud');
    this.lapEl = $('lap');
    this.timeEl = $('time');
    this.lastLapEl = $('lastLap');
    this.posEl = $('pos');
    this.standingsEl = $('standings');
    this.speedEl = $('speed');
    this.energyEl = $('energy');
    this.boostEl = $('boostState');
    this.laneEls = [...document.querySelectorAll('#lanes .lane')];
    this.callerMode = $('callerMode');
    this.callerHint = $('callerHint');
    this.zipCanvas = $('zipmap');
    this.zipCtx = this.zipCanvas.getContext('2d');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.center = $('center');
    this.toasts = $('toasts');
    this.trainWarn = $('trainWarn');
    this._miniPts = null;
    this._centerTimer = 0;
    this._lastCmd = -1;
  }

  show(on) {
    this.hud.classList.toggle('hidden', !on);
  }

  // Build a cached outline of the track for the minimap.
  buildMinimap(track) {
    const pts = [];
    const step = 4;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < track.M; i += step) {
      const x = track.P[i * 3], z = track.P[i * 3 + 2];
      pts.push([x, z]);
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      minz = Math.min(minz, z); maxz = Math.max(maxz, z);
    }
    const W = this.mini.width, H = this.mini.height, pad = 14;
    const sc = (W - pad * 2) / Math.max(maxx - minx, maxz - minz);
    this._miniPts = pts.map(([x, z]) => [pad + (x - minx) * sc, H - (pad + (z - minz) * sc)]);
    this._miniZip = track.sectionList().filter(([n]) => n.startsWith('zipper')).map(([n, s0, s1]) => [s0, s1]);
    this._miniTrack = track;
    this._miniMap = { minx, minz, sc, pad, H };
  }

  _toMini(x, z) {
    const m = this._miniMap;
    return [m.pad + (x - m.minx) * m.sc, m.H - (m.pad + (z - m.minz) * m.sc)];
  }

  drawMinimap(race) {
    const ctx = this.miniCtx;
    const W = this.mini.width, H = this.mini.height;
    ctx.clearRect(0, 0, W, H);
    if (!this._miniPts) return;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(51,230,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    this._miniPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    // Zipper highlight
    ctx.strokeStyle = 'rgba(125,255,154,0.95)';
    ctx.lineWidth = 4;
    const track = this._miniTrack;
    for (const [s0, s1] of this._miniZip) {
      ctx.beginPath();
      for (let s = s0; s <= s1; s += 6) {
        const p = track.worldPoint(s, 0, 0, [0, 0, 0]);
        const [x, y] = this._toMini(p[0], p[2]);
        s === s0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Cars
    for (const car of race.cars) {
      const p = track.worldPoint(car.dist, car.x, 0, [0, 0, 0]);
      const [x, y] = this._toMini(p[0], p[2]);
      ctx.fillStyle = '#' + car.color.toString(16).padStart(6, '0');
      const r = car.isPlayer ? 6 : 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (car.isPlayer) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  drawZipMap(race) {
    const c = this.zipCtx;
    const W = this.zipCanvas.width, H = this.zipCanvas.height;
    c.clearRect(0, 0, W, H);
    const rows = race.zipPreview();
    const lanes = CFG.LANES;
    const cw = W / lanes, rh = (H - 4) / 7;
    // Background grid
    for (let r = 0; r < 7; r++) {
      for (let j = 0; j < lanes; j++) {
        c.fillStyle = 'rgba(255,255,255,0.04)';
        c.fillRect(j * cw + 3, r * rh + 2, cw - 6, rh - 4);
      }
    }
    // Rows: nearest at the bottom
    rows.forEach((e, idx) => {
      const r = 6 - idx;
      if (r < 0) return;
      for (let j = 0; j < lanes; j++) {
        const open = j === e.gap;
        c.fillStyle = open ? 'rgba(125,255,154,0.95)' : 'rgba(255,63,164,0.55)';
        if (open) c.shadowColor = 'rgba(125,255,154,0.9)'; else c.shadowColor = 'transparent';
        c.shadowBlur = open ? 10 : 0;
        c.fillRect(j * cw + 4, r * rh + 3, cw - 8, rh - 6);
      }
    });
    c.shadowBlur = 0;
    // Player's lane marker
    if (race.player) {
      const j = Math.round(race.player.x / CFG.LANE_W + (CFG.LANES - 1) / 2);
      c.strokeStyle = 'rgba(51,230,255,0.9)';
      c.lineWidth = 2;
      c.strokeRect(j * cw + 1, H - rh - 1, cw - 2, rh + 1);
    }
  }

  updateCaller(race, mode) {
    const cmd = race.zipper.cmd;
    this.laneEls.forEach((el, j) => {
      el.classList.toggle('cmd', j === cmd);
    });
    if (cmd !== this._lastCmd) {
      const el = this.laneEls[cmd];
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      this._lastCmd = cmd;
    }
    this.callerMode.textContent = mode === 'coop' ? 'YOU' : 'AI';
    this.callerMode.classList.toggle('you', mode === 'coop');
    this.callerHint.textContent = mode === 'coop'
      ? 'Press 1–5 to draw the gap. Your team shoots through it.'
      : 'AI teammate draws toward your team. Press 1–5 to take over.';
  }

  update(race, mode, dt) {
    const p = race.player;
    const place = race.position(p);
    this.lapEl.innerHTML = `${race.displayLap(p)}<span>/${CFG.LAPS}</span>`;
    this.posEl.innerHTML = `${place}<span>/${race.cars.length}</span>`;
    this.timeEl.textContent = formatTime(race.time);
    const last = p.lapTimes[p.lapTimes.length - 1];
    this.lastLapEl.textContent = 'LAST ' + (last !== undefined ? formatTime(last) : '--:--.--');

    this.speedEl.textContent = Math.round(p.v * 3.6);
    this.energyEl.style.width = (p.energy / CFG.ENERGY_MAX * 100).toFixed(1) + '%';
    const boosting = p.boostingVis;
    this.boostEl.textContent = boosting ? 'BOOST ACTIVE' : p.energy > 20 ? 'BOOST READY · SPACE' : 'ENERGY LOW';
    this.boostEl.classList.toggle('on', boosting);

    // Standings list
    const st = race.standings().slice(0, 8);
    this.standingsEl.innerHTML = st.map((c) => {
      const hex = '#' + c.color.toString(16).padStart(6, '0');
      return `<li class="${c.isPlayer ? 'you' : ''}"><span><span class="dot" style="background:${hex}"></span>${c.name}</span><span>${race.displayLap(c)}/${CFG.LAPS}</span></li>`;
    }).join('');

    this.updateCaller(race, mode);
    this.drawZipMap(race);
    this.drawMinimap(race);

    // Train warning
    const warn = race.crossings.some((c) => c.phase === 'warn');
    this.trainWarn.classList.toggle('hidden', !warn);

    // Centre text timer
    if (this._centerTimer > 0) {
      this._centerTimer -= dt;
      if (this._centerTimer <= 0) this.center.textContent = '';
    }
  }

  centre(text, { go = false, duration = 0.8 } = {}) {
    this.center.textContent = text;
    this.center.classList.toggle('go', go);
    this.center.classList.remove('pop');
    void this.center.offsetWidth;
    this.center.classList.add('pop');
    this._centerTimer = duration;
  }

  toast(text, tone = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.textContent = text;
    this.toasts.prepend(el);
    setTimeout(() => el.remove(), 2400);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
  }

  results(race, title) {
    const $r = $('resultTable');
    const order = race.standings();
    const rows = order.map((c, i) => {
      const best = c.lapTimes.length ? Math.min(...c.lapTimes) : null;
      const total = c.finished ? formatTime(c.finishTime) : `+${CFG.LAPS - c.lapsDone} lap${CFG.LAPS - c.lapsDone > 1 ? 's' : ''}`;
      const hex = '#' + c.color.toString(16).padStart(6, '0');
      return `<tr class="${c.isPlayer ? 'you' : ''}"><td>${i + 1}</td><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${hex};margin-right:8px"></span>${c.name}</td><td>${TEAMS[c.team].name}</td><td class="num">${total}</td><td class="num">${best !== null ? formatTime(best) : '—'}</td></tr>`;
    }).join('');
    $r.innerHTML = `<thead><tr><th>#</th><th>DRIVER</th><th>TEAM</th><th class="num">TIME</th><th class="num">BEST LAP</th></tr></thead><tbody>${rows}</tbody>`;
    $('resultTitle').textContent = title;
  }
}

export function formatTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
