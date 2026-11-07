// Keyboard + touch. Steering is continuous (no lane snapping), so corners
// and bowls feel like driving rather than switching tracks.
export class Input {
  constructor(canvas) {
    this.keys = {}; this.jumpAt = -1; this.startAt = -1; this.touchSteer = 0;
    this.btn = { jump: false, duck: false, drift: false }; this.isTouch = false; this.onToggleMute = null;

    this.onGesture = null;
    addEventListener('pointerdown', (e) => {
      if (this.onGesture) this.onGesture();
      if (e.pointerType !== 'mouse') { this.isTouch = true; document.body.classList.add('touch'); }
    }, { capture: true });
    addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (this.onGesture) this.onGesture();
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.jumpAt = performance.now();
      if (e.code === 'Enter' || e.code === 'Space') this.startAt = performance.now();
      if (e.code === 'KeyM' && this.onToggleMute) this.onToggleMute();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.touchSteer = 0; });

    // touch: drag anywhere on the canvas to steer; tap = jump
    let drag = null;
    const onDown = (e) => {
      if (e.pointerType === 'mouse') return;
      drag = { id: e.pointerId, x0: e.clientX, t0: performance.now(), moved: false };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      if (Math.abs(dx) > 8) drag.moved = true;
      this.touchSteer = Math.max(-1, Math.min(1, dx / 70));
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && performance.now() - drag.t0 < 250) { this.jumpAt = performance.now(); this.startAt = performance.now(); }
      drag = null; this.touchSteer = 0;
    };
    canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

    for (const name of ['jump', 'duck', 'drift']) {
      const el = document.getElementById('btn-' + name); if (!el) continue;
      const down = (e) => { e.preventDefault(); this.btn[name] = true; if (name === 'jump') this.jumpAt = performance.now(); };
      const up = (e) => { e.preventDefault(); this.btn[name] = false; };
      el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    }
  }
  get steer() {
    let s = 0;
    if (this.keys.ArrowLeft || this.keys.KeyA) s -= 1;
    if (this.keys.ArrowRight || this.keys.KeyD) s += 1;
    return s || this.touchSteer;
  }
  get duck() { return !!(this.keys.ArrowDown || this.keys.KeyS || this.btn.duck); }
  get drift() { return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.keys.KeyK || this.btn.drift); }
  consumeJump() { const ok = this.jumpAt > 0 && performance.now() - this.jumpAt < 160; this.jumpAt = -1; return ok; }
  consumeStart() { const ok = this.startAt > 0 && performance.now() - this.startAt < 300; this.startAt = -1; return ok; }
}
