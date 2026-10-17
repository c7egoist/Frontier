import { frontierAudio, SOUNDS } from '../src/index.js';

const grid = document.getElementById('sound-grid') as HTMLElement;
const initBtn = document.getElementById('init') as HTMLButtonElement;
const vol = document.getElementById('vol') as HTMLInputElement;
const rev = document.getElementById('rev') as HTMLInputElement;
const humanize = document.getElementById('humanize') as HTMLInputElement;

let initialized = false;

async function init() {
  if (initialized) return;
  await frontierAudio.init({
    masterVolume: parseFloat(vol.value),
    reverbAmount: parseFloat(rev.value),
    warmup: true
  });
  initialized = true;
  initBtn.textContent = '● ENGINE READY';
  initBtn.style.background = '#5aff9d';
  initBtn.style.color = '#061018';
  frontierAudio.play('powerOn');
  frontierAudio.bindAutoSounds();
  console.log('[Frontier] Audio ready', frontierAudio.list());
}

initBtn.addEventListener('click', init);

// Also init on first interaction anywhere
document.addEventListener('click', () => { if (!initialized) init(); }, { once: true });
document.addEventListener('keydown', () => { if (!initialized) init(); }, { once: true });

vol.addEventListener('input', () => frontierAudio.setVolume(parseFloat(vol.value)));
rev.addEventListener('input', () => frontierAudio.setReverb(parseFloat(rev.value)));
humanize.addEventListener('change', () => frontierAudio.setHumanize(humanize.checked));

// Build grid
const categories: Record<string, typeof SOUNDS[keyof typeof SOUNDS] & { name: string }[]> = {};
for (const [name, def] of Object.entries(SOUNDS)) {
  if (!categories[def.category]) categories[def.category] = [];
  categories[def.category].push({ ...def, name } as any);
}

const order = ['navigation', 'tactile', 'state', 'feedback', 'motion', 'system'];
const sortedCats = Object.keys(categories).sort((a, b) => order.indexOf(a) - order.indexOf(b));

for (const cat of sortedCats) {
  const block = document.createElement('div');
  block.className = 'category-block';
  block.innerHTML = `<h3>${cat}</h3>`;
  grid.appendChild(block);

  for (const sound of categories[cat]) {
    const card = document.createElement('div');
    card.className = 'sound-card';
    card.innerHTML = `
      <div class="top">
        <div class="name">${sound.name}</div>
        <div class="cat">${sound.category}</div>
      </div>
      <div class="desc">${sound.description}</div>
      <div class="actions">
        <button class="play-btn">▶ PLAY</button>
        <button class="play-btn soft" style="flex:0.6">soft</button>
      </div>
    `;

    const playBtn = card.querySelector('.play-btn:not(.soft)') as HTMLButtonElement;
    const softBtn = card.querySelector('.soft') as HTMLButtonElement;

    const flash = () => {
      card.classList.add('playing');
      setTimeout(() => card.classList.remove('playing'), 220);
    };

    playBtn.addEventListener('click', async () => {
      if (!initialized) await init();
      frontierAudio.play(sound.name);
      flash();
    });

    softBtn.addEventListener('click', async () => {
      if (!initialized) await init();
      frontierAudio.play(sound.name, { volume: 0.35, velocity: 0.6 });
      flash();
    });

    // Hover sound preview (optional)
    card.addEventListener('mouseenter', () => {
      if (!initialized) return;
      // Don't spam hover
      // frontierAudio.play('hoverSoft', { volume: 0.15 })
    });

    grid.appendChild(card);
  }
}

// Keyboard shortcuts — press 1-9 for quick test
window.addEventListener('keydown', async (e) => {
  if (!initialized) return;
  if (e.key === ' ') {
    e.preventDefault();
    frontierAudio.play('click');
  }
});
