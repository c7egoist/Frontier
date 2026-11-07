export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, slide: false, boost: false };
    this.steer = 0;
    this.jump = false;      // one-shot edge, cleared every frame
    this.jumpHeld = false;
    this.slide = false;
    this.boost = false;
    this.onStart = null;
    this.onRetry = null;
    this.onMute = null;
  }

  attach() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.jumpHeld = false; });

    const layer = document.getElementById('touch');
    if (!layer) return;
    const set = (btn, down) => {
      const act = btn.dataset.act;
      if (act === 'left') this.touch.left = down;
      else if (act === 'right') this.touch.right = down;
      else if (act === 'slide') this.touch.slide = down;
      else if (act === 'boost') this.touch.boost = down;
      else if (act === 'jump') {
        if (down) { this.jump = true; this.jumpHeld = true; }
        else this.jumpHeld = false;
      }
      btn.classList.toggle('active', down);
    };
    for (const btn of layer.querySelectorAll('.tbtn')) {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); set(btn, true); });
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); set(btn, false); });
      btn.addEventListener('pointerleave', () => set(btn, false));
      btn.addEventListener('pointercancel', () => set(btn, false));
    }
  }

  onKey(e, down) {
    const code = e.code;
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (down) {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        this.jump = true;
        this.jumpHeld = true;
      }
      if ((code === 'Space' || code === 'Enter') && this.onStart) this.onStart();
      if (code === 'KeyR' && this.onRetry) this.onRetry();
      if (code === 'KeyM' && this.onMute) this.onMute();
    } else {
      this.keys.delete(code);
      if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') this.jumpHeld = false;
    }
  }

  compute() {
    const k = this.keys;
    let s = 0;
    if (k.has('KeyA') || k.has('ArrowLeft') || this.touch.left) s -= 1;
    if (k.has('KeyD') || k.has('ArrowRight') || this.touch.right) s += 1;
    this.steer = s;
    this.slide = k.has('KeyS') || k.has('ArrowDown') || this.touch.slide;
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyE') || this.touch.boost;
    return this;
  }

  endFrame() {
    this.jump = false;
  }
}
