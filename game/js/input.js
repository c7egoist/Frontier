// Keyboard and gamepad input.
//
// Driver: arrows / WASD steer and throttle, Down / S brake, Space boost, Shift drift.
// Caller: number keys 1-5 (top row or numpad) draw the bollard gap toward that lane.
// Gamepad: left stick steers, RT throttle, LT brake, A boost, B drift, LB / RB nudge the caller lane,
// Start pauses.

const KEYS_DOWN = new Set();
const pressed = new Set();
const handlers = { onCallerLane: null, onPause: null, onRestart: null, onMute: null, onConfirm: null, onBack: null, onNav: null };

export function bindInput(h) {
  Object.assign(handlers, h);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (isGameKey(e.code)) e.preventDefault();
      return;
    }
    KEYS_DOWN.add(e.code);
    pressed.add(e.code);
    if (isGameKey(e.code)) e.preventDefault();
    const lane = laneFromKey(e.code);
    if (lane !== null && handlers.onCallerLane) handlers.onCallerLane(lane, 'key');
    if (e.code === 'KeyP' || e.code === 'Escape') handlers.onPause && handlers.onPause();
    if (e.code === 'KeyR') handlers.onRestart && handlers.onRestart();
    if (e.code === 'KeyM') handlers.onMute && handlers.onMute();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') handlers.onConfirm && handlers.onConfirm();
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') handlers.onNav && handlers.onNav(e.code);
  });
  window.addEventListener('keyup', (e) => {
    KEYS_DOWN.delete(e.code);
  });
  window.addEventListener('blur', () => KEYS_DOWN.clear());
}

function isGameKey(code) {
  return /^Arrow|^Key[WASDPRM]$|^Space$|^Shift|^Digit[1-5]$|^Numpad[1-5]$/.test(code);
}

function laneFromKey(code) {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
  return m ? Number(m[1]) - 1 : null;
}

// Read the current driver controls. Returns a fresh object each call.
export function readDriver() {
  const pad = readPad();
  const down = (...codes) => codes.some((c) => KEYS_DOWN.has(c));
  let steer = 0;
  if (down('ArrowLeft', 'KeyA')) steer -= 1;
  if (down('ArrowRight', 'KeyD')) steer += 1;
  let throttle = down('ArrowUp', 'KeyW') ? 1 : 0;
  let brake = down('ArrowDown', 'KeyS') ? 1 : 0;
  let boost = down('Space');
  let drift = down('ShiftLeft', 'ShiftRight');
  if (pad) {
    if (Math.abs(pad.lx) > 0.12) steer = pad.lx;
    throttle = Math.max(throttle, pad.rt);
    brake = Math.max(brake, pad.lt);
    boost = boost || pad.a;
    drift = drift || pad.b;
  }
  return { steer: clamp(steer, -1, 1), throttle, brake, boost, drift };
}

const padPrev = { lb: false, rb: false };
let padCallerDir = 0;

// Gamepad: returns null if none connected. Also raises caller events from LB / RB.
export function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const lb = !!p.buttons[4]?.pressed, rb = !!p.buttons[5]?.pressed;
    if (lb && !padPrev.lb && handlers.onCallerNudge) handlers.onCallerNudge(-1);
    if (rb && !padPrev.rb && handlers.onCallerNudge) handlers.onCallerNudge(1);
    padPrev.lb = lb; padPrev.rb = rb;
    const startNow = !!p.buttons[9]?.pressed;
    if (startNow && !padPrev.start && handlers.onPause) handlers.onPause();
    padPrev.start = startNow;
    const confirm = !!p.buttons[0]?.pressed;
    if (confirm && !padPrev.a && handlers.onConfirm) handlers.onConfirm();
    padPrev.a = confirm;
  }
  return null;
}

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    return {
      lx: dz(p.axes[0] || 0),
      rt: p.buttons[7]?.value || 0,
      lt: p.buttons[6]?.value || 0,
      a: !!p.buttons[0]?.pressed,
      b: !!p.buttons[1]?.pressed,
    };
  }
  return null;
}

// Edge-triggered "pressed this frame" set, cleared by consumePressed.
export function consumePressed(code) {
  if (pressed.has(code)) { pressed.delete(code); return true; }
  return false;
}

export function clearPressed() {
  pressed.clear();
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
