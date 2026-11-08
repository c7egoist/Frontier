import * as THREE from 'three';

/* ================================================================== *
 *  PROCEDURAL CANDY TEXTURES
 * ================================================================== */

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** the classic peppermint swirl */
export function makeSwirlTexture(size = 1024, opts = {}) {
  const {
    turns = 4.2,
    bg = '#fff4f7',
    fg = '#ff2e63',
    fg2 = '#ff8fae',
    rings = 0,
  } = opts;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  const steps = 900;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r0 = maxR * t;
    const r1 = maxR * (t + 1 / steps) * 1.02;
    const width = maxR * 0.11 * (0.35 + 0.65 * t);
    const grad = ctx.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    grad.addColorStop(0, fg);
    grad.addColorStop(1, fg2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  if (rings) {
    for (let i = 1; i <= rings; i++) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = size * 0.01;
      ctx.arc(0, 0, (maxR * i) / (rings + 1), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  // sugary specular speckle
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    if (Math.random() < 0.02) {
      const v = 255;
      const k = 0.35;
      img.data[i] = img.data[i] * (1 - k) + v * k;
      img.data[i + 1] = img.data[i + 1] * (1 - k) + v * k;
      img.data[i + 2] = img.data[i + 2] * (1 - k) + v * k;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** diagonal candy-cane stripes */
export function makeStripeTexture(size = 512, opts = {}) {
  const { a = '#fff7fa', b = '#ff3860', bands = 7, angle = Math.PI / 4 } = opts;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);
  ctx.fillStyle = b;
  const span = size * 2.2;
  const bandW = span / bands;
  for (let i = -bands; i < bands; i++) {
    ctx.fillRect(-span / 2, i * bandW, span, bandW * 0.5);
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** round sugar sparkle sprite */
export function makeSparkTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,245,0.85)');
  g.addColorStop(0.55, 'rgba(255,140,220,0.22)');
  g.addColorStop(1, 'rgba(255,140,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // star flare
  ctx.globalCompositeOperation = 'lighter';
  const flare = ctx.createLinearGradient(0, size / 2, size, size / 2);
  flare.addColorStop(0, 'rgba(255,255,255,0)');
  flare.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  flare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = flare;
  ctx.fillRect(0, size / 2 - 1.5, size, 3);
  ctx.fillRect(size / 2 - 1.5, 0, 3, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** seamless diamond-scale normal map, generated from a height field */
export function makeScaleNormalMap(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const cols = 22;
  const rows = 30;
  const height = new Float32Array(size * size);

  const fract = (x) => x - Math.floor(x);
  const smooth = (t) => t * t * (3 - 2 * t);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cols;
      const v = (y / size) * rows;
      const row = Math.floor(v);
      const off = row % 2 ? 0.5 : 0.0;
      const cu = fract(u + off) - 0.5;
      const cv = fract(v) - 0.5;
      // diamond plate: rounded lozenge with a soft valley between plates
      const d = Math.pow(Math.abs(cu * 2), 1.6) + Math.pow(Math.abs(cv * 2), 2.4);
      const h = Math.max(0, 1 - d);
      height[y * size + x] = smooth(Math.min(1, h * 1.25)) * 0.9 + 0.1;
    }
  }
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
      const nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 8;
  return tex;
}

/* ================================================================== *
 *  MATERIAL LIBRARY  — everything is edible-looking
 * ================================================================== */
export function createMaterials(renderer) {
  const scaleNormal = makeScaleNormalMap(512);
  const swirl = makeSwirlTexture(1024, { turns: 4, bg: '#fff0f6', fg: '#ff2e63', fg2: '#ff9ab8', rings: 2 });
  const swirlGold = makeSwirlTexture(1024, { turns: 3.2, bg: '#fff9ea', fg: '#e0a63c', fg2: '#ffd988' });
  const stripe = makeStripeTexture(512, { a: '#fff6fb', b: '#f0437d', bands: 9 });
  const stripeMint = makeStripeTexture(512, { a: '#f4fffb', b: '#3ee0b5', bands: 9 });

  const M = {};

  /* ---- glossy poured-sugar body ---------------------------------- */
  M.body = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d8287a'),
    roughness: 0.16,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    sheen: 0.75,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color('#ff9ad5'),
    normalMap: scaleNormal,
    normalScale: new THREE.Vector2(0.38, 0.38),
    iridescence: 0.35,
    iridescenceIOR: 1.32,
    iridescenceThicknessMinimum: 240,
    iridescenceThicknessMaximum: 620,
    envMapIntensity: 1.35,
    vertexColors: false,
    sheenColor: new THREE.Color('#ffc2e0'),
  });

  /* the torso paints itself per-vertex (cream gullet -> deep raspberry spine) */
  M.bodyPainted = M.body.clone();
  M.bodyPainted.vertexColors = true;

  /* ---- cream / marshmallow underside ----------------------------- */
  M.belly = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffdfe8'),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    sheen: 1,
    sheenColor: new THREE.Color('#ffffff'),
    sheenRoughness: 0.5,
    envMapIntensity: 0.9,
    vertexColors: true,
  });

  /* ---- raspberry jelly fins (translucent) ------------------------ */
  M.jelly = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ff2f80'),
    vertexColors: false,
    roughness: 0.10,
    metalness: 0,
    transmission: 0.62,
    thickness: 0.62,
    ior: 1.42,
    attenuationColor: new THREE.Color('#e8005a'),
    attenuationDistance: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.9,
    iridescenceIOR: 1.3,
    iridescenceThicknessMinimum: 160,
    iridescenceThicknessMaximum: 460,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.35,
  });

  /* ---- sugar glass wing membrane --------------------------------- */
  M.membrane = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    vertexColors: true,
    roughness: 0.06,
    metalness: 0,
    transmission: 0.94,
    thickness: 0.35,
    ior: 1.46,
    attenuationColor: new THREE.Color('#ff2d85'),
    attenuationDistance: 0.75,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    iridescence: 1,
    iridescenceIOR: 1.38,
    iridescenceThicknessMinimum: 220,
    iridescenceThicknessMaximum: 700,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 2.0,
    blending: THREE.NormalBlending,
  });

  /* ---- mint crystal scales --------------------------------------- */
  M.scaleMint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#63f2da'),
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transmission: 0.22,
    thickness: 0.30,
    ior: 1.52,
    iridescence: 1,
    iridescenceIOR: 1.42,
    iridescenceThicknessMinimum: 120,
    iridescenceThicknessMaximum: 420,
    envMapIntensity: 1.9,
    vertexColors: true,
  });

  /* ---- horn candy: deep raspberry with a gold spiral ------------ */
  M.horn = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c0175c'),
    roughness: 0.14,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ff9ad8'),
    envMapIntensity: 1.5,
  });
  M.hornStripe = new THREE.MeshPhysicalMaterial({
    map: stripe,
    color: new THREE.Color('#ffd9a0'),
    roughness: 0.18,
    metalness: 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.5,
  });

  /* ---- spun gold sugar ------------------------------------------ */
  M.gold = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffc96b'),
    roughness: 0.16,
    metalness: 0.82,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.25,
    envMapIntensity: 1.6,
  });

  /* ---- candy cane rods (striped) -------------------------------- */
  M.candyStripe = new THREE.MeshPhysicalMaterial({
    map: stripe,
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0.4,
    envMapIntensity: 1.2,
  });
  M.candyStripeMint = new THREE.MeshPhysicalMaterial({
    map: stripeMint,
    color: 0xffffff,
    roughness: 0.14,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0.4,
    envMapIntensity: 1.2,
  });

  /* ---- lollipop swirl ------------------------------------------- */
  M.lollipop = new THREE.MeshPhysicalMaterial({
    map: swirl,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.5,
  });
  M.lollipopGold = new THREE.MeshPhysicalMaterial({
    map: swirlGold,
    roughness: 0.2,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
  });

  /* ---- glowing candy core --------------------------------------- */
  M.ember = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ff7a2f'),
    emissive: new THREE.Color('#ff5a12'),
    emissiveIntensity: 2.6,
    roughness: 0.25,
    metalness: 0,
    toneMapped: false,
  });

  M.eye = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffd35c'),
    emissive: new THREE.Color('#ff9d21'),
    emissiveIntensity: 2.2,
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.5,
    iridescenceThicknessMinimum: 100,
    iridescenceThicknessMaximum: 500,
    toneMapped: false,
  });

  M.eyePupil = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2a0416'),
    roughness: 0.03,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.5,
  });

  /* ---- pedestal: sugar-glass slab with a candy swirl rim --------- */
  M.pedestal = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#30122c'),
    roughness: 0.1,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transmission: 0.25,
    thickness: 1.4,
    ior: 1.5,
    attenuationColor: new THREE.Color('#7a1a52'),
    attenuationDistance: 1.8,
    envMapIntensity: 1.4,
  });
  M.pedestalTop = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#fff4fa'),
    roughness: 0.10,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffd7ea'),
    envMapIntensity: 1.5,
  });

  /* ---- gilded trim ---------------------------------------------- */
  M.trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d9a441'),
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 1.8,
  });

  M.spark = new THREE.PointsMaterial({
    size: 0.14,
    map: makeSparkTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
    opacity: 0.9,
  });

  M.smoke = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffb0e0'),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  M.misc = { swirl, swirlGold, stripe, scaleNormal };
  return M;
}
