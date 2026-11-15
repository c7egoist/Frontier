// CanvasMock.mjs — a pixel-less 2D canvas for Node / jsdom tests.  Methods are no-ops, image data is real (zeroed or
// whatever was last put), so the Brush Studio's renderer runs end to end without a native canvas.
const PROPS = new Set(["fillStyle", "strokeStyle", "lineWidth", "lineJoin", "lineCap", "lineDashOffset", "miterLimit", "globalAlpha", "globalCompositeOperation", "font", "textAlign", "textBaseline", "direction", "letterSpacing", "filter", "imageSmoothingEnabled", "imageSmoothingQuality", "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY", "then"]);
export function MockContext(Canvas) {
  let Last = null;
  const Gradient = () => ({ addColorStop() {} });
  const Base = {
    canvas: Canvas,
    createImageData: (W, H) => (typeof W === "object" ? { width: W.width, height: W.height, data: new Uint8ClampedArray(W.width * W.height * 4) } : { width: W, height: H, data: new Uint8ClampedArray(Math.max(1, W * H * 4)) }),
    getImageData: (X, Y, W, H) => (Last && Last.width === W && Last.height === H ? { width: W, height: H, data: new Uint8ClampedArray(Last.data) } : { width: W, height: H, data: new Uint8ClampedArray(Math.max(1, W * H * 4)) }),
    putImageData: (Img) => { Last = Img; Canvas.__puts = (Canvas.__puts || 0) + 1; },
    measureText: (T) => ({ width: String(T).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: Gradient, createRadialGradient: Gradient, createConicGradient: Gradient,
    createPattern: () => ({ setTransform() {} }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    drawImage: () => { Canvas.__draws = (Canvas.__draws || 0) + 1; },
  };
  return new Proxy(Base, {
    get: (T, K) => (K in T ? T[K] : typeof K === "string" && !PROPS.has(K) && /^[a-z]/.test(K) ? (T[K] = () => {}) : T[K]),
    set: (T, K, V) => { T[K] = V; return true; },
  });
}

export function MockCanvas(W = 300, H = 150) {
  const C = { width: W, height: H, style: {}, getContext: (Kind) => (Kind === "2d" ? (C.__ctx ||= MockContext(C)) : null), toDataURL: () => "data:image/png;base64,AAAA", getBoundingClientRect: () => ({ left: 0, top: 0, width: C.width, height: C.height, right: C.width, bottom: C.height }) };
  return C;
}
