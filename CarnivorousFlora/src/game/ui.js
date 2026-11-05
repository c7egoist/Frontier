/** DOM overlay: start screen, HUD, struggle meter, game over, and the small debug panel. */
export function createUI(handlers) {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div id="vignette-hit"></div>
    <div id="hud" class="hidden">
      <div id="crosshair"></div>
      <div id="toasts"></div>
      <div id="vitals">
        <div class="bar"><span id="hp"></span></div><label>VITALITY</label>
        <div class="bar vis"><span id="vis"></span></div><label id="vislabel">VISIBILITY</label>
      </div>
      <div id="struggle" class="hidden"><div class="title">IT HAS YOU</div><div class="bar big"><span id="sbar"></span></div><div class="hint">MASH <b>SPACE</b> / <b>WASD</b> TO BREAK FREE</div></div>
      <div id="mode-tag"></div>
    </div>
    <div id="death" class="hidden"><h1>DEVOURED</h1><p>The meadow was never empty.</p><button id="respawn">Wake up again (R)</button></div>
    <div id="start">
      <div class="card">
        <div class="eyebrow">FRONTIER · PROTOTYPE</div>
        <h1>Carnivorous Flora</h1>
        <p class="sub">Colossal ambush flowers hide in a meadow of their harmless twins. Ivory orchid-serpents and briar-lilies wait, wind-swaying, perfectly still&mdash;until something walks too close.</p>
        <div class="grid">
          <div><b>WASD</b> move</div><div><b>Mouse</b> look</div>
          <div><b>Shift</b> sprint (loud)</div><div><b>C / Ctrl</b> crouch (quiet)</div>
          <div><b>Space</b> jump</div><div><b>T</b> reveal predators</div>
          <div><b>B</b> send a scout</div><div><b>O</b> observer mode</div>
        </div>
        <div class="buttons"><button id="play">Enter the meadow</button><button id="observe" class="alt">Observer mode &mdash; watch scouts get eaten</button></div>
        <div id="loading">Growing the meadow&hellip;</div>
      </div>
    </div>
    <div id="debug">
      <div id="fps">-- fps</div>
      <label><input type="checkbox" id="chk-reveal"> Reveal predators (T)</label>
      <label><input type="checkbox" id="chk-observer"> Observer mode (O)</label>
      <label><input type="checkbox" id="chk-bloom" checked> Bloom</label>
      <label>Mist <input type="range" id="rng-fog" min="0" max="100" value="50"></label>
      <button id="btn-scout">Send scout (B)</button>
      <button id="btn-wake">Wake nearest plant (N)</button>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const ui = {
    onPlay: null,
    setHealth(v) { $('hp').style.width = Math.max(0, v) + '%'; $('hp').style.background = v < 30 ? '#d6392b' : '#9bd35a'; },
    setNoise(noise) {
      const f = Math.min(1, noise / 32);
      $('vis').style.width = (f * 100) + '%';
      $('vis').style.background = f < 0.3 ? '#8bd0a0' : f < 0.6 ? '#e7c75a' : '#e0553b';
      $('vislabel').textContent = 'VISIBILITY · ' + (f < 0.22 ? 'HIDDEN' : f < 0.5 ? 'QUIET' : f < 0.75 ? 'NOTICEABLE' : 'LOUD');
    },
    toast(msg, cls = '') {
      const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = msg; $('toasts').appendChild(d);
      setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3300);
    },
    setStruggle(v) { const s = $('struggle'); if (v === null) s.classList.add('hidden'); else { s.classList.remove('hidden'); $('sbar').style.width = Math.min(100, v * 100) + '%'; } },
    showDeath(show) { $('death').classList.toggle('hidden', !show); },
    setFps(t) { $('fps').textContent = t; },
    ready() { $('loading').style.display = 'none'; $('play').disabled = false; $('observe').disabled = false; },
    hideStart() { $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); },
    setMode(m) { $('mode-tag').textContent = m === 'observer' ? 'OBSERVER MODE · WASD fly · Q/E down/up · Shift fast · scouts are targeted' : ''; $('chk-observer').checked = m === 'observer'; document.body.classList.toggle('observer', m === 'observer'); },
    hit(v) { $('vignette-hit').style.opacity = String(Math.min(0.9, v)); },
  };
  $('play').disabled = true; $('observe').disabled = true;
  $('play').onclick = () => handlers.play('play');
  $('observe').onclick = () => handlers.play('observer');
  $('respawn').onclick = () => handlers.respawn();
  $('chk-reveal').onchange = (e) => handlers.reveal(e.target.checked);
  $('chk-observer').onchange = (e) => handlers.observer(e.target.checked);
  $('chk-bloom').onchange = (e) => handlers.bloom(e.target.checked);
  $('rng-fog').oninput = (e) => handlers.fog(e.target.value / 100);
  $('btn-scout').onclick = () => handlers.scout();
  $('btn-wake').onclick = () => handlers.wake();
  ui.revealCheckbox = $('chk-reveal');
  return ui;
}
