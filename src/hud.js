import { clamp } from './utils.js';
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      over: $('over'),
      score: $('score'),
      best: $('best'),
      best2: $('best2'),
      speed: $('speed'),
      cells: $('cells'),
      dist: $('dist'),
      shields: $('shields'),
      boostfill: $('boostfill'),
      combo: $('combo'),
      callout: $('callout'),
      trick: $('trick'),
      turnhint: $('turnhint'),
      speedlines: $('speedlines'),
      oScore: $('oScore'),
      oDist: $('oDist'),
      oBest: $('oBest'),
      newbest: $('newbest'),
      mute: $('mutebtn'),
      touch: $('touch'),
      startbtn: $('startbtn'),
      retrybtn: $('retrybtn'),
    };
    this.coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.calloutT = 0;
    this.turnState = 0;
    this.lastScore = -1;
  }

  setBest(n) {
    this.el.best.textContent = fmt(n);
    if (this.el.best2) this.el.best2.textContent = fmt(n);
  }

  showScreen(name) {
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.over.classList.toggle('hidden', name !== 'over');
    this.el.hud.classList.toggle('hidden', name !== 'play');
    this.el.touch.classList.toggle('hidden', !(name === 'play' && this.coarse));
  }

  callout(text, hot = false) {
    const c = this.el.callout;
    c.textContent = text;
    c.classList.toggle('hot', !!hot);
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this.calloutT = 1.0;
  }

  trick(text) {
    const t = this.el.trick;
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  setTurn(dir) {
    const h = this.el.turnhint;
    if (!dir) {
      h.classList.add('hidden');
      this.turnState = 0;
      return;
    }
    h.classList.remove('hidden');
    h.classList.toggle('left', dir < 0);
    if (dir !== this.turnState) {
      h.querySelector('.arrow').textContent = dir < 0 ? '◀' : '▶';
      this.turnState = dir;
    }
  }

  update(dt, player, best) {
    const e = this.el;
    const score = fmt(player.score);
    if (score !== this.lastScore) { e.score.textContent = score; this.lastScore = score; }
    e.speed.textContent = Math.round(player.speed * 3.6).toString().padStart(3, '0');
    e.cells.textContent = player.cells;
    e.dist.textContent = Math.floor(player.s) + ' m';
    e.boostfill.style.width = (player.boostMeter * 100).toFixed(1) + '%';

    const pips = e.shields.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < player.shield);

    const mult = player.mult;
    if (mult > 1.01) {
      e.combo.classList.remove('hidden');
      e.combo.textContent = 'x' + mult.toFixed(1);
    } else {
      e.combo.classList.add('hidden');
    }

    const speedN = clamp((player.speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed), 0, 1.3);
    e.speedlines.style.opacity = (Math.max(0, speedN - 0.5) * 0.85 + (player.boosting ? 0.28 : 0)).toFixed(3);

    if (this.calloutT > 0) {
      this.calloutT -= dt;
      if (this.calloutT <= 0) e.callout.classList.remove('show');
    }
    void best;
  }

  gameOver(player, best, isBest) {
    this.el.oScore.textContent = fmt(player.score);
    this.el.oDist.textContent = Math.floor(player.s) + ' m';
    this.el.oBest.textContent = fmt(best);
    this.el.newbest.classList.toggle('hidden', !isBest);
    this.showScreen('over');
  }

  toggleMuteIcon(on) {
    this.el.mute.classList.toggle('off', !on);
    this.el.mute.textContent = on ? '♪' : '♪';
  }
}
