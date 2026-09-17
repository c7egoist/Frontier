import * as THREE from 'three';
import { WoodType, RoofTileType, MainSignStyle } from '../types/generator';

// Cache generated textures to avoid redundant allocations
const textureCache = new Map<string, THREE.CanvasTexture>();

export function getCachedTexture(key: string, generator: () => THREE.CanvasTexture): THREE.CanvasTexture {
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }
  const tex = generator();
  textureCache.set(key, tex);
  return tex;
}

/**
 * Procedural Japanese Roof Tile Texture
 */
export function createRoofTileTexture(tileType: RoofTileType, baseColorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const baseColor = new THREE.Color(baseColorHex);
  const rgb = `rgb(${Math.floor(baseColor.r * 255)}, ${Math.floor(baseColor.g * 255)}, ${Math.floor(baseColor.b * 255)})`;
  const darkRgb = `rgb(${Math.floor(baseColor.r * 160)}, ${Math.floor(baseColor.g * 160)}, ${Math.floor(baseColor.b * 160)})`;
  const lightRgb = `rgb(${Math.min(255, Math.floor(baseColor.r * 320))}, ${Math.min(255, Math.floor(baseColor.g * 320))}, ${Math.min(255, Math.floor(baseColor.b * 320))})`;

  ctx.fillStyle = darkRgb;
  ctx.fillRect(0, 0, 512, 512);

  if (tileType === 'kawara_honga' || tileType === 'glazed_imperial') {
    const tileRows = 8;
    const tileCols = 8;
    const w = 512 / tileCols;
    const h = 512 / tileRows;

    for (let r = 0; r < tileRows; r++) {
      const y = r * h;
      for (let c = 0; c < tileCols; c++) {
        const x = c * w;
        
        // Semi-cylindrical Marugawara ridge gradient
        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, darkRgb);
        grad.addColorStop(0.3, lightRgb);
        grad.addColorStop(0.6, rgb);
        grad.addColorStop(1, 'rgba(0,0,0,0.65)');

        ctx.fillStyle = grad;
        ctx.fillRect(x + 2, y, w - 4, h - 3);

        // Lap joint shadow (stepped overlap between vertical tiles)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(x, y, w, 4);

        // Subtle specular highlight on ridge
        ctx.fillStyle = tileType === 'glazed_imperial' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + w * 0.28, y + 4, 3, h - 6);
      }
    }
  } else if (tileType === 'bamboo_split') {
    // Bamboo half pipes with fibrous grain
    const strips = 12;
    const stripW = 512 / strips;
    for (let i = 0; i < strips; i++) {
      const x = i * stripW;
      const grad = ctx.createLinearGradient(x, 0, x + stripW, 0);
      grad.addColorStop(0, '#2d472c');
      grad.addColorStop(0.3, '#588157');
      grad.addColorStop(0.6, '#3a5a40');
      grad.addColorStop(1, '#1b321a');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, stripW - 2, 512);

      // Bamboo nodes (horizontal rings)
      for (let node = 80; node < 512; node += 130) {
        ctx.fillStyle = 'rgba(25, 40, 20, 0.6)';
        ctx.fillRect(x, node - 2, stripW - 2, 4);
        ctx.fillStyle = 'rgba(180, 210, 150, 0.3)';
        ctx.fillRect(x, node + 2, stripW - 2, 2);
      }
    }
  } else {
    // Copper / metal standing seam
    ctx.fillStyle = rgb;
    ctx.fillRect(0, 0, 512, 512);
    const seams = 8;
    const seamW = 512 / seams;
    for (let i = 0; i < seams; i++) {
      const x = i * seamW;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, 0, 6, 512);
      ctx.fillStyle = lightRgb;
      ctx.fillRect(x + 2, 0, 2, 512);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/**
 * Procedural Wood Grain Texture
 */
export function createWoodTexture(woodType: WoodType): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  let baseColor = '#b08968';
  let grainColor = '#7f5539';
  let accentColor = '#ddb892';

  switch (woodType) {
    case 'hinoki':
      baseColor = '#d4a373';
      grainColor = '#bc6c25';
      accentColor = '#faedcd';
      break;
    case 'keyaki':
      baseColor = '#603813';
      grainColor = '#3d230c';
      accentColor = '#8a5020';
      break;
    case 'yakisugi':
      baseColor = '#1a1a1a';
      grainColor = '#0f0f0f';
      accentColor = '#2b2b2b';
      break;
    case 'vermilion_lacquer':
      baseColor = '#b7094c';
      grainColor = '#800f2f';
      accentColor = '#c9184a';
      break;
    case 'weathered_timber':
      baseColor = '#5c574f';
      grainColor = '#3f3b35';
      accentColor = '#7d776c';
      break;
    case 'cyber_carbon':
      baseColor = '#161a1d';
      grainColor = '#0b090a';
      accentColor = '#2b2d42';
      break;
  }

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  // Wood grain longitudinal stripes & rings
  for (let y = 0; y < 512; y += 3) {
    const sinOffset = Math.sin(y * 0.04) * 8 + Math.cos(y * 0.08) * 4;
    const alpha = 0.08 + Math.random() * 0.15;
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y + sinOffset);
    ctx.lineTo(512, y + sinOffset + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  // Yakisugi charred crackling pattern
  if (woodType === 'yakisugi') {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x + (Math.random() - 0.5) * 8, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 8, 512);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1.0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
}

/**
 * Procedural Japanese Tatami Mat Texture
 */
export function createTatamiTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rush grass base
  ctx.fillStyle = '#b7b77a';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal woven grass reeds
  for (let y = 0; y < 512; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#9b9e65' : '#c5c78a';
    ctx.fillRect(0, y, 512, 2);
  }

  // Black / dark green fabric borders (Heri) along left and right edges
  ctx.fillStyle = '#283618';
  ctx.fillRect(0, 0, 36, 512);
  ctx.fillRect(512 - 36, 0, 36, 512);

  // Gold stitched thread pattern in fabric border
  ctx.fillStyle = '#dda15e';
  for (let y = 10; y < 512; y += 20) {
    ctx.fillRect(16, y, 4, 8);
    ctx.fillRect(512 - 20, y, 4, 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Procedural Japanese Shoji Paper & Lattice Screen
 */
export function createShojiTexture(density = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Translucent Washi paper background
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, 512, 512);

  // Micro fibers in washi paper
  ctx.fillStyle = 'rgba(210, 205, 195, 0.4)';
  for (let i = 0; i < 400; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    ctx.fillRect(rx, ry, Math.random() * 3 + 1, 1);
  }

  // Kumiko wooden grid lines
  const cols = density;
  const rows = density * 2;
  const cellW = 512 / cols;
  const cellH = 512 / rows;

  ctx.fillStyle = '#8c5a32';
  for (let c = 0; c <= cols; c++) {
    ctx.fillRect(c * cellW - 3, 0, 6, 512);
  }
  for (let r = 0; r <= rows; r++) {
    ctx.fillRect(0, r * cellH - 3, 512, 6);
  }

  // Outer frame
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(0, 0, 16, 512);
  ctx.fillRect(512 - 16, 0, 16, 512);
  ctx.fillRect(0, 0, 512, 16);
  ctx.fillRect(0, 512 - 16, 512, 16);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Main Facade Signboard
 */
export function createSignboardTexture(
  text: string, 
  subtext: string, 
  style: MainSignStyle
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (style === 'carved_wood') {
    // Rich dark carved timber with gold leaf lettering
    ctx.fillStyle = '#1c130d';
    ctx.fillRect(0, 0, 1024, 256);

    // Beveled wood grain border
    ctx.strokeStyle = '#cda45e';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 1024 - 32, 256 - 32);

    ctx.strokeStyle = '#5a3d28';
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, 1024 - 52, 256 - 52);

    // Gold leaf Kanji font
    ctx.font = 'bold 84px "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow carving depth
    ctx.fillStyle = '#0a0705';
    ctx.fillText(text || "麺屋・電脳桜", 512 + 3, 110 + 3);

    // Gold fill
    const goldGrad = ctx.createLinearGradient(0, 60, 0, 160);
    goldGrad.addColorStop(0, '#ffe57f');
    goldGrad.addColorStop(0.5, '#ffd166');
    goldGrad.addColorStop(1, '#cda45e');
    ctx.fillStyle = goldGrad;
    ctx.fillText(text || "麺屋・電脳桜", 512, 110);

    // Subtext
    if (subtext) {
      ctx.font = '600 24px "Inter", sans-serif';
      ctx.fillStyle = '#e0c088';
      ctx.letterSpacing = '4px';
      ctx.fillText(subtext.toUpperCase(), 512, 195);
    }
  } else if (style === 'neon_lightbox') {
    // Modern Tokyo acrylic lightbox
    ctx.fillStyle = '#0e131f';
    ctx.fillRect(0, 0, 1024, 256);

    // Glowing border frame
    ctx.strokeStyle = '#f72585';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 1024 - 28, 256 - 28);

    // Text glow
    ctx.font = 'bold 80px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = '#f72585';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text || "居酒屋 桜", 512, 110);

    // Secondary subtext in cyan
    if (subtext) {
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 15;
      ctx.font = 'bold 26px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00f5d4';
      ctx.fillText(subtext.toUpperCase(), 512, 190);
    }
  } else if (style === 'brass_plate') {
    // Elegant etched bronze/brass plate
    const brassGrad = ctx.createLinearGradient(0, 0, 1024, 256);
    brassGrad.addColorStop(0, '#8c6d3d');
    brassGrad.addColorStop(0.5, '#cda45e');
    brassGrad.addColorStop(1, '#664d26');
    ctx.fillStyle = brassGrad;
    ctx.fillRect(0, 0, 1024, 256);

    // Corner brass screws
    ctx.fillStyle = '#3a2b16';
    [ [40, 40], [1024 - 40, 40], [40, 256 - 40], [1024 - 40, 256 - 40] ].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    // Dark stamped text
    ctx.font = '900 82px "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f160b';
    ctx.fillText(text || "稲荷大明神", 512, 110);

    if (subtext) {
      ctx.font = '600 24px "Inter", sans-serif';
      ctx.fillStyle = '#2b1f10';
      ctx.fillText(subtext.toUpperCase(), 512, 190);
    }
  } else {
    // Cyber hologram / matrix sign
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, 1024, 256);

    // Cyan glowing scanlines
    for (let y = 0; y < 256; y += 6) {
      ctx.fillStyle = 'rgba(0, 245, 212, 0.05)';
      ctx.fillRect(0, y, 1024, 2);
    }

    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 1024 - 24, 256 - 24);

    ctx.font = 'bold 80px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text || "創世研究所", 512, 110);

    if (subtext) {
      ctx.font = '600 24px "JetBrains Mono", monospace';
      ctx.fillStyle = '#00f5d4';
      ctx.fillText(subtext.toUpperCase(), 512, 190);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Vertical Neon Blade Sign
 */
export function createNeonBladeTexture(text: string, colorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Dark metallic case
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, 256, 1024);

  // Beveled outer edge
  ctx.strokeStyle = '#232a38';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 256 - 12, 1024 - 12);

  // Neon glowing perimeter tube
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 6;
  ctx.shadowColor = colorHex;
  ctx.shadowBlur = 18;
  ctx.strokeRect(22, 22, 256 - 44, 1024 - 44);

  // Vertical stacked Kanji characters
  const chars = (text || "居酒屋").split('');
  const charSpacing = (1024 - 100) / Math.max(1, chars.length);

  ctx.font = '900 110px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  chars.forEach((char, idx) => {
    const y = 80 + idx * charSpacing + charSpacing * 0.45;
    
    // Intense neon bloom glow
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, 128, y);

    // Inner bright core
    ctx.shadowBlur = 10;
    ctx.fillText(char, 128, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Japanese Paper Lantern (Chōchin)
 */
export function createLanternTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm red or white paper background
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#c1121f');
  grad.addColorStop(0.5, '#e63946');
  grad.addColorStop(1, '#ba181b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal bamboo ribbing rings (Higo)
  ctx.strokeStyle = 'rgba(50, 0, 0, 0.5)';
  ctx.lineWidth = 3;
  for (let y = 10; y < 512; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();

    // Highlight line below rib
    ctx.strokeStyle = 'rgba(255, 200, 200, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(512, y + 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(50, 0, 0, 0.5)';
    ctx.lineWidth = 3;
  }

  // Black lacquered wooden collars top & bottom
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, 512, 40);
  ctx.fillRect(0, 512 - 40, 512, 40);

  // Bold black calligraphy Kanji
  ctx.font = '900 130px "Noto Serif JP", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111111';
  
  // Calligraphy kanji in center
  const displayKanji = text || "ラーメン";
  ctx.fillText(displayKanji, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Japanese Noren Door Curtain
 */
export function createNorenTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep indigo traditional dyed cotton (Aizome)
  ctx.fillStyle = '#1d3557';
  ctx.fillRect(0, 0, 512, 512);

  // Vertical split slit down the middle
  ctx.fillStyle = '#0e1e33';
  ctx.fillRect(254, 80, 4, 432);

  // Fabric woven texture lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < 512; x += 4) {
    ctx.fillRect(x, 0, 1, 512);
  }

  // Hanging loops at top
  ctx.fillStyle = '#14253d';
  for (let lx = 60; lx < 512; lx += 130) {
    ctx.fillRect(lx, 0, 40, 40);
  }

  // White family crest / kanji symbol (Mon)
  ctx.strokeStyle = '#f1faee';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(256, 256, 90, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '900 110px "Noto Serif JP", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1faee';
  ctx.fillText(text || "桜", 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Japanese Drink Vending Machine Texture
 */
export function createVendingMachineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Bright Japanese vending machine red / white body
  ctx.fillStyle = '#c1121f';
  ctx.fillRect(0, 0, 512, 1024);

  // Illuminated glass beverage display case
  ctx.fillStyle = '#121820';
  ctx.fillRect(30, 40, 452, 540);

  // 3 shelves of drink cans
  const canColors = ['#f4a261', '#2a9d8f', '#e76f51', '#457b9d', '#e63946', '#2b2d42'];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 80 + shelf * 160;
    
    // Shelf divider bar
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(30, y + 120, 452, 12);

    // 6 cans per shelf
    for (let c = 0; c < 6; c++) {
      const cx = 55 + c * 70;
      // Drink can
      ctx.fillStyle = canColors[(shelf * 3 + c) % canColors.length];
      ctx.beginPath();
      ctx.roundRect(cx, y, 50, 95, 6);
      ctx.fill();

      // Can top lid
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx + 6, y + 4, 38, 8);

      // Price button under can
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx + 10, y + 105, 30, 12);
      ctx.fillStyle = '#22c55e'; // Green LED price "¥130"
      ctx.fillRect(cx + 15, y + 108, 20, 6);
    }
  }

  // Lower control section: Coin slot, bill acceptor, change return
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(30, 600, 452, 220);

  // Glowing coin return & payment terminal
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(360, 630, 80, 50);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 18px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("IC CARD", 400, 660);

  // Dispenser flap / door
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(50, 840, 412, 140);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 6;
  ctx.strokeRect(50, 840, 412, 140);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 20px "Noto Sans JP", sans-serif';
  ctx.fillText("取出口 - PUSH", 256, 915);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Wall Posters Texture
 */
export function createPosterTexture(type: 'cyber_ad' | 'ukiyo_e' | 'ramen_menu', title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  if (type === 'cyber_ad') {
    // Cyberpunk neon ad
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, 512, 768);

    // Geometric neon graphics
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, 512 - 40, 768 - 40);

    // Glowing circle / cyber motif
    ctx.strokeStyle = '#f72585';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(256, 320, 140, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '900 48px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 15;
    ctx.fillText(title || "NEO TOKYO 2099", 256, 560);

    ctx.font = '600 24px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#00f5d4';
    ctx.fillText("新世代サイバネティクス", 256, 620);
  } else if (type === 'ukiyo_e') {
    // Traditional Japanese woodblock print
    ctx.fillStyle = '#f4ebd0';
    ctx.fillRect(0, 0, 512, 768);

    // Great Wave / Mt Fuji wave motif
    const grad = ctx.createLinearGradient(0, 200, 0, 500);
    grad.addColorStop(0, '#1d3557');
    grad.addColorStop(1, '#457b9d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(256, 400, 160, 0, Math.PI, false);
    ctx.fill();

    // Red sun
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(256, 260, 70, 0, Math.PI * 2);
    ctx.fill();

    // Calligraphy cartouche
    ctx.fillStyle = '#e63946';
    ctx.fillRect(40, 50, 60, 180);
    ctx.font = '900 32px "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText("富", 70, 95);
    ctx.fillText("嶽", 70, 145);
    ctx.fillText("景", 70, 195);

    ctx.font = '900 36px "Noto Serif JP", serif';
    ctx.fillStyle = '#1d3557';
    ctx.fillText(title || "富嶽三十六景", 256, 640);
  } else {
    // Ramen shop vintage poster
    ctx.fillStyle = '#fff1e6';
    ctx.fillRect(0, 0, 512, 768);

    ctx.strokeStyle = '#c1121f';
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, 512 - 40, 768 - 40);

    ctx.font = '900 52px "Noto Serif JP", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c1121f';
    ctx.fillText("極上・豚骨拉麺", 256, 120);

    // Ramen bowl circle
    ctx.fillStyle = '#c1121f';
    ctx.beginPath();
    ctx.arc(256, 360, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdf0d5';
    ctx.beginPath();
    ctx.arc(256, 360, 130, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '900 40px "Noto Serif JP", serif';
    ctx.fillStyle = '#222222';
    ctx.fillText("一杯入魂", 256, 600);
    ctx.font = 'bold 30px "Inter", sans-serif';
    ctx.fillStyle = '#c1121f';
    ctx.fillText("SPECIAL RAMEN", 256, 660);
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
