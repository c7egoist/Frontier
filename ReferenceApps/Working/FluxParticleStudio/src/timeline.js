/* Flux timeline — transport buttons, playhead scrub, duration, burst ticks. */
import {createIcons, Play, Pause} from 'lucide';

export function createTimeline(store, engine, api) {
  const $ = (id) => document.getElementById(id);
  const playBtn = $('t-play'), scrub = $('scrub'), readout = $('time-readout');
  const loopBtn = $('t-loop'), dur = $('dur'), ticks = $('burst-ticks');

  function setPlayIcon() {
    playBtn.innerHTML = `<i data-lucide="${engine.playing ? 'pause' : 'play'}"></i>`;
    try { createIcons({icons: {Play, Pause}}); } catch { /* noop */ }
  }

  function paint() {
    const d = store.comp.duration;
    scrub.value = Math.round((engine.time / d) * 1000);
    readout.textContent = `${engine.time.toFixed(2)} / ${d.toFixed(2)}`;
    if (document.activeElement !== dur) dur.value = d;
  }

  function paintTicks() {
    ticks.innerHTML = '';
    const d = store.comp.duration;
    for (const l of store.layers) {
      if (!l.burst?.on || l.visible === false) continue;
      const i = document.createElement('i');
      i.style.left = `${Math.min(100, Math.max(0, (l.burst.time / d) * 100))}%`;
      i.title = `${l.name} burst @ ${l.burst.time.toFixed(1)}s`;
      ticks.appendChild(i);
    }
  }

  playBtn.onclick = () => engine.toggle();
  $('t-stop').onclick = () => engine.stop();
  loopBtn.onclick = () => {
    engine.setLoop(!engine.loop);
    loopBtn.classList.toggle('on', engine.loop);
  };
  scrub.addEventListener('input', () => {
    engine.seek((+scrub.value / 1000) * store.comp.duration);
  });
  dur.addEventListener('change', () => {
    const v = Math.min(30, Math.max(1, +dur.value || 8));
    store.commit('set duration', () => {
      store.comp.duration = v;
      for (const l of store.layers) l.emitter.life = Math.min(l.emitter.life, v);
    });
    api.refreshPanels();
    paintTicks();
  });

  return {paint, paintTicks, setPlayIcon};
}
