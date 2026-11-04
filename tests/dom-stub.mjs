/**
 * Minimal DOM stand-in for headless tests.
 *
 * Node has no DOM, so the Landscape Studio's panel builders are exercised
 * against this instead. It implements just enough of the element/event surface
 * that the real (unmodified) UI code paths run: element tree construction,
 * class lists, attributes, inputs, listeners, and `getElementById` lookups.
 *
 * It is deliberately not a browser emulator — it cannot render and it does not
 * implement layout. Its job is to prove the editor's wiring works: every ref
 * resolves, every listener is attached, and every handler can be invoked.
 */

class ClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }
  add(...names) {
    for (const name of names) if (name) this.values.add(name);
  }
  remove(...names) {
    for (const name of names) this.values.delete(name);
  }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }
  contains(name) {
    return this.values.has(name);
  }
  toString() {
    return [...this.values].join(' ');
  }
}

export class StubElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new ClassList(this);
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this._textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.id = '';
    this.type = '';
    this.title = '';
    this.files = [];
    this._className = '';
    this.ownerDocument = null;
  }

  get className() {
    return this._className;
  }

  /** Real DOM keeps `className` and `classList` in sync; so does the stub. */
  set className(value) {
    this._className = String(value ?? '');
    this.classList.values = new Set(
      this._className.split(/\s+/).filter(Boolean),
    );
  }

  /**
   * three.js `OrbitControls` resolves its event target via `getRootNode()` so it
   * can work against an offscreen canvas. The stub mirrors that contract.
   */
  getRootNode() {
    return this.ownerDocument || this;
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    if (value === '') this.children = [];
  }

  appendChild(child) {
    if (!child) return child;
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument || this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  /** Fires every listener of `type` with a synthetic event. */
  dispatch(type, event = {}) {
    const list = this.listeners.get(type) || [];
    const payload = {
      type,
      target: this,
      currentTarget: this,
      stopPropagation() {},
      preventDefault() {},
      ...event,
    };
    for (const handler of [...list]) handler(payload);
    return payload;
  }

  click() {
    return this.dispatch('click');
  }

  /** No-ops that let pointer-capture code run unchanged outside a browser. */
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
  focus() {}
  blur() {}

  querySelectorAll(selector) {
    const results = [];
    const matches = (node) => {
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const name = selector.slice(1, -1);
        if (name.startsWith('data-')) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          return node.dataset[key] !== undefined;
        }
        return node.attributes[name] !== undefined;
      }
      if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
      return node.tagName === selector.toUpperCase();
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  /** Utility for tests: every descendant, depth first. */
  all() {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

export class StubDocument {
  constructor() {
    this.root = new StubElement('body');
    this.byId = new Map();
  }

  createElement(tagName) {
    return new StubElement(tagName);
  }

  getElementById(id) {
    return this.byId.get(id) || null;
  }

  addEventListener() {}
  removeEventListener() {}
  createTextNode(text) {
    const node = new StubElement('#text');
    node.textContent = text;
    return node;
  }

  /** Creates (or returns) an element and registers it for getElementById. */
  register(id, tagName = 'div') {
    let element = this.byId.get(id);
    if (!element) {
      element = new StubElement(tagName);
      element.id = id;
      element.ownerDocument = this;
      this.byId.set(id, element);
      this.root.appendChild(element);
    }
    return element;
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }
}

/**
 * Installs the stub as `globalThis.document`/`window` for the duration of a
 * test, restoring whatever was there afterwards.
 */
export function installStubDom() {
  const doc = new StubDocument();

  // Animation frames are queued rather than run on a timer: a real frame loop
  // never terminates, and tests must be able to step it deterministically.
  const frameQueue = [];
  let nextFrameId = 1;
  const requestAnimationFrame = (callback) => {
    const id = nextFrameId++;
    frameQueue.push({ id, callback });
    return id;
  };
  const cancelAnimationFrame = (id) => {
    const index = frameQueue.findIndex((entry) => entry.id === id);
    if (index >= 0) frameQueue.splice(index, 1);
  };
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  const windowStub = {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 1,
    localStorage: {
      _data: new Map(),
      getItem(key) {
        return this._data.has(key) ? this._data.get(key) : null;
      },
      setItem(key, value) {
        this._data.set(key, String(value));
      },
      removeItem(key) {
        this._data.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
    location: { hash: '' },
    history: { replaceState() {} },
    requestAnimationFrame,
    cancelAnimationFrame,
    confirm: () => true,
    alert: () => {},
  };

  globalThis.document = doc;
  globalThis.window = windowStub;
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  return {
    document: doc,
    window: windowStub,
    /** Runs `count` animation frames; the last callback reschedules itself. */
    flushFrames(count = 1) {
      for (let i = 0; i < count; i++) {
        const pending = frameQueue.splice(0, frameQueue.length);
        if (!pending.length) return i;
        for (const entry of pending) entry.callback(i * 16.7);
      }
      return count;
    },
    /** Number of frames currently queued. */
    get pendingFrames() {
      return frameQueue.length;
    },
    restore() {
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
      if (previous.window === undefined) delete globalThis.window;
      else globalThis.window = previous.window;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    },
  };
}
