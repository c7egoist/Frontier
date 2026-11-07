const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.score = $('score'); this.coins = $('coins'); this.hearts = $('hearts'); this.mult = $('mult');
    this.speed = $('speedbar'); this.drift = $('drift'); this.driftbar = $('driftbar'); this.popups = $('popups');
    this.hud = $('hud'); this.title = $('title'); this.over = $('over'); this.dist = $('dist'); this.hint = $('hint');
    this.lastScore = -1; this.lastCoins = -1; this.lastHearts = -1; this.lastMult = -1; this.hintT = 0;
  }
  setScore(v) { v = Math.floor(v); if (v !== this.lastScore) { this.lastScore = v; this.score.textContent = v.toLocaleString(); } }
  setCoins(v) { if (v !== this.lastCoins) { this.lastCoins = v; this.coins.textContent = v; } }
  setDist(m) { this.dist.textContent = Math.floor(m) + ' m'; }
  setHearts(n) {
    if (n === this.lastHearts) return; this.lastHearts = n;
    this.hearts.innerHTML = [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  }
  setMult(m) { if (m !== this.lastMult) { this.lastMult = m; this.mult.textContent = m > 1 ? '×' + m : ''; this.mult.classList.toggle('hot', m > 1); } }
  setSpeed(r, boosting) { this.speed.style.width = (r * 100).toFixed(1) + '%'; this.speed.classList.toggle('boost', boosting); }
  setDrift(ratio, visible, active) {
    this.drift.classList.toggle('show', visible); this.drift.classList.toggle('active', active);
    this.driftbar.style.width = (Math.min(1, ratio) * 100).toFixed(1) + '%';
  }
  showHint(text, dur = 2.2) {
    this.hint.textContent = text; this.hint.classList.add('show'); this.hintT = dur;
  }
  tick(dt) { if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hint.classList.remove('show'); } }
  popup(text, pts, cls = '') {
    const el = document.createElement('div'); el.className = 'pop ' + cls;
    el.innerHTML = `<b>${text}</b>${pts ? `<span>+${pts}</span>` : ''}`;
    this.popups.appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  flash(cls) { document.body.classList.add(cls); setTimeout(() => document.body.classList.remove(cls), 260); }
  showTitle(best) { this.title.classList.remove('hidden'); this.over.classList.add('hidden'); this.hud.classList.add('hidden'); $('best-title').textContent = best ? `BEST ${best.toLocaleString()}` : ''; }
  showRun() { this.title.classList.add('hidden'); this.over.classList.add('hidden'); this.hud.classList.remove('hidden'); }
  showOver(r) {
    this.hud.classList.add('hidden'); this.over.classList.remove('hidden');
    $('o-score').textContent = Math.floor(r.score).toLocaleString(); $('o-coins').textContent = r.coins;
    $('o-dist').textContent = Math.floor(r.dist) + ' m'; $('o-tricks').textContent = r.tricks;
    $('o-best').textContent = r.isBest ? 'NEW BEST' : `BEST ${Math.floor(r.best).toLocaleString()}`;
    $('o-best').classList.toggle('new', r.isBest);
  }
}
