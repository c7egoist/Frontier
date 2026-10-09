// ---------------------------------------------------------------------------
// stubdom.mjs — minimal DOM/window/localStorage stubs so the app's UI and
// editor modules can be executed headlessly in node (no browser).
// ---------------------------------------------------------------------------

export class StubEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.style = {};
    this.listeners = new Map();
    this.className = '';
    this._innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.type = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.open = false;
    this.spellcheck = false;
    this.title = '';
    this.textContent = '';
    this.placeholder = '';
    this.files = [];
    this.accept = '';
    this.parentNode = null;
    this.href = '';
    this.download = '';
    this.clicks = 0;
  }
  set innerHTML(v) { this._innerHTML = String(v); this.children.length = 0; }
  get innerHTML() { return this._innerHTML; }
  /** concatenated text of this element and all descendants */
  get text() { return this._innerHTML + this.children.map((c) => c.text).join(''); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  addEventListener(type, fn) { const a = this.listeners.get(type) || []; a.push(fn); this.listeners.set(type, a); }
  removeEventListener(type, fn) {
    const a = this.listeners.get(type) || [];
    this.listeners.set(type, a.filter((f) => f !== fn));
  }
  fire(type, ev = {}) {
    ev.target ||= this;
    ev.preventDefault ||= () => {};
    ev.stopPropagation ||= () => {};
    for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
  }
  click() { this.clicks++; this.fire('click', { target: this }); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }; }
  get clientWidth() { return 1000; }
  get clientHeight() { return 600; }
  /** depth-first walk over this element and all descendants */
  walk(fn) { fn(this); for (const c of [...this.children]) c.walk(fn); return this; }
}

export function makeWindow() {
  const listeners = new Map();
  const win = {
    alerts: [],
    addEventListener(type, fn, opts) {
      const arr = listeners.get(type) || [];
      arr.push({ fn, once: !!(opts && opts.once) });
      listeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(type, arr.filter((l) => l.fn !== fn));
    },
    fire(type, ev = {}) {
      ev.preventDefault ||= () => {};
      ev.stopPropagation ||= () => {};
      for (const l of [...(listeners.get(type) || [])]) {
        l.fn(ev);
        if (l.once) win.removeEventListener(type, l.fn);
      }
    },
    alert(msg) { win.alerts.push(String(msg)); },
    listenerCount(type) { return (listeners.get(type) || []).length; },
  };
  return win;
}

export function makeLocalStorage() {
  const store = new Map();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

export function makeRaf() {
  const q = [];
  return {
    q,
    requestAnimationFrame: (cb) => { q.push(cb); return q.length; },
    flush() {
      let n = 0;
      while (q.length && n++ < 50) { const cb = q.shift(); cb(n * 16); }
      return n;
    },
  };
}

/**
 * Install the browser-ish globals the app modules touch.
 * Returns handles for tests. Call before dynamically importing app modules.
 */
export function installGlobals() {
  const downloads = [];
  const win = makeWindow();
  const storage = makeLocalStorage();
  const raf = makeRaf();
  const body = new StubEl('body');
  const documentStub = {
    body,
    createElement: (tag) => {
      const e = new StubEl(tag);
      if (tag === 'a') {
        const origClick = e.click.bind(e);
        e.click = () => { downloads.push({ href: e.href, download: e.download }); origClick(); };
      }
      return e;
    },
    getElementById: () => new StubEl('div'),
    addEventListener: () => {},
  };
  class FileReaderStub {
    readAsText(file) {
      this.result = file && file._content !== undefined ? file._content : '';
      queueMicrotask(() => { if (this.onload) this.onload({ target: this }); });
    }
  }
  globalThis.window = win;
  globalThis.document = documentStub;
  globalThis.localStorage = storage;
  globalThis.requestAnimationFrame = raf.requestAnimationFrame;
  globalThis.FileReader = FileReaderStub;
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:stub';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  return { win, storage, raf, downloads, document: documentStub, body };
}

/** tiny assertion kit */
export function makeTester(label) {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const t = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  ok    ${name}`); } else {
      fail++;
      failures.push(name);
      console.log(`  FAIL  ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`);
    }
  };
  const eq = (name, a, b, eps = 1e-6) => {
    let ok;
    if (typeof a === 'string' || typeof b === 'string') ok = a === b;
    else if (Array.isArray(a) && Array.isArray(b)) ok = a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
    else ok = Math.abs(Number(a) - Number(b)) <= eps;
    t(name, ok, { got: a, want: b });
  };
  const group = (name) => console.log(`\n[${name}]`);
  const summary = () => {
    console.log(`\n${label}: ${pass} passed, ${fail} failed`);
    if (fail > 0) { console.log('failed:', failures.join(' | ')); process.exitCode = 1; }
    return fail === 0;
  };
  return { t, eq, group, summary, pass: () => pass, fail: () => fail };
}
