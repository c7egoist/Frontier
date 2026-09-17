// Minimal DOM/Canvas stub so the generator can run headless in Node for testing.
// Only the canvas 2D calls actually used by src/lib/textures.js are implemented.
class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.globalAlpha = 1;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.shadowBlur = 0;
    this.shadowColor = '#000';
    this.lineJoin = 'miter';
    this._data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  rect() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  fill() {}
  stroke() {}
  clip() {}
  fillRect() {}
  strokeRect() {}
  clearRect() {}
  setLineDash() {}
  fillText() {}
  strokeText() {}
  drawImage() {}
  measureText(t) {
    const size = parseFloat((this.font.match(/(\d+(\.\d+)?)px/) || [0, 10])[1]) || 10;
    return { width: String(t).length * size * 0.58, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createPattern() {
    return null;
  }
  getImageData(x, y, w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData() {}
}

class Canvas {
  constructor(w = 300, h = 150) {
    this.width = w;
    this.height = h;
    this.style = {};
    this.dataset = {};
    this._ctx = new Ctx2D(this);
  }
  getContext() {
    return this._ctx;
  }
  toDataURL() {
    return 'data:image/png;base64,';
  }
  toBlob(cb) {
    cb?.(null);
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  appendChild() {}
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.textContent = '';
    this.value = '';
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  append(...c) {
    this.children.push(...c);
  }
  prepend(c) {
    this.children.unshift(c);
  }
  removeChild() {}
  remove() {}
  setAttribute() {}
  getAttribute() {
    return null;
  }
  addEventListener() {}
  removeEventListener() {}
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, left: 0, top: 0 };
  }
}

const documentStub = {
  createElement(tag) {
    if (String(tag).toLowerCase() === 'canvas') {
      if (_canvasBackend) return _canvasBackend.createCanvas(256, 256);
      return new Canvas(256, 256);
    }
    return new El(tag);
  },
  createElementNS() {
    return new El('div');
  },
  body: new El('body'),
  documentElement: new El('html'),
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  getElementById() {
    return null;
  },
  addEventListener() {},
  removeEventListener() {},
};

let _canvasBackend = null;
export async function loadCanvasBackend() {
  if (_canvasBackend !== null) return _canvasBackend;
  try {
    const mod = await import('@napi-rs/canvas');
    // register a real CJK webfont so signage text renders in Node too
    try {
      const fs = await import('node:fs');
      const path = '/home/user/Frontier/node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff2';
      const path700 = '/home/user/Frontier/node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff2';
      if (fs.existsSync(path)) mod.GlobalFonts.registerFromPath(path, 'Noto Sans JP');
      if (fs.existsSync(path700)) mod.GlobalFonts.registerFromPath(path700, 'Noto Sans JP Bold');
      const serif = '/home/user/Frontier/node_modules/@fontsource/shippori-mincho/files/shippori-mincho-japanese-700-normal.woff2';
      // register under the family names the app's font stacks actually ask for
      if (fs.existsSync(serif)) {
        mod.GlobalFonts.registerFromPath(serif, 'Noto Serif JP');
        mod.GlobalFonts.registerFromPath(serif, 'Yu Mincho');
      }
      mod.GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
    } catch { /* fonts optional */ }
    _canvasBackend = mod;
    // exporters draw into canvases via `new ImageData(...)`, so expose the backend's
    if (mod.ImageData) globalThis.ImageData = mod.ImageData;
    if (mod.Canvas) globalThis.HTMLCanvasElement = mod.Canvas;
  } catch {
    _canvasBackend = false;
  }
  return _canvasBackend;
}

export function installDomStub() {
  globalThis.document = documentStub;
  globalThis.window = globalThis.window || {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    location: { href: 'http://localhost/' },
  };
  globalThis.HTMLCanvasElement = Canvas;
  // GLTFExporter reads image blobs through FileReader
  if (!globalThis.FileReader) {
    globalThis.FileReader = class FileReader {
      constructor() {
        this.result = null;
        this.onloadend = null;
        this.onerror = null;
      }
      readAsArrayBuffer(blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = buf;
            this.onloadend?.();
          })
          .catch((e) => this.onerror?.(e));
      }
      readAsDataURL(blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
            this.onloadend?.();
          })
          .catch((e) => this.onerror?.(e));
      }
    };
  }
  globalThis.ImageData = class ImageData {
    constructor(w, h) {
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
  globalThis.self = globalThis;
  return { Canvas, documentStub, loadCanvasBackend };
}
