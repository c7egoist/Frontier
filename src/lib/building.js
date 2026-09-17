// ---------------------------------------------------------------------------
// Procedural East-Asian building generator.
// One entry point: generateBuilding(params, materials) -> { group, info, lights }
// Every feature is a boolean/number on `params` (the "geometry node" inputs).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { Builder } from './builder.js';
import { Rng, hashStringToSeed } from './prng.js';
import * as TT from './textures.js';
import * as P from './props.js';
import { buildRoof, roofRise } from './roofs.js';
import { PALETTES, SHOP_NAMES, randomShopName, POSTER_TEXT, MENU_ITEMS, ROOF_TILE_TYPES, randomCJK } from '../data/names.js';
import { mergeList } from './geom.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ROT = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

export const DEFAULT_PARAMS = {
  // --- identity -------------------------------------------------------
  seed: 'kyoto-01',
  theme: 'machiya',
  type: 'machiya',
  name: '',
  nameSub: '',

  // --- massing --------------------------------------------------------
  floors: 2,
  floorHeight: 3.1,
  width: 7.5,
  depth: 6.5,
  irregularity: 0.28,
  overhangUpper: 0.25,

  // --- surfaces -------------------------------------------------------
  wallStyle: 'plaster',
  woodStyle: 'cedar',
  woodColor: '',
  wallColor: '',
  trimColor: '',
  roofColor: '',
  roofType: 'auto',
  roofTile: 'kawara',
  roofCurve: 0.62,
  roofOverhang: 0.95,
  roofDetail: true,
  shachihoko: false,
  roofThickness: 0.08,

  // --- facade ---------------------------------------------------------
  shopfront: true,
  windows: true,
  windowStyle: 'auto',
  lattice: true,
  shoji: false,
  glassFront: true,
  awning: true,
  noren: true,
  shutters: false,
  balcony: true,
  balconyLaundry: true,
  skirtRoofs: true,
  interior: true,

  // --- modern layer ---------------------------------------------------
  modernMix: 0.45,
  neon: true,
  neonText: '',
  posterCount: 3,
  menuBoard: true,
  banners: true,
  lanterns: true,
  acUnits: true,
  downpipes: true,
  waterTank: false,
  antenna: false,
  solar: false,
  roofRail: false,
  vending: true,
  bicycles: true,
  crates: true,
  plants: true,
  seating: true,
  parasol: true,
  mailbox: false,
  fireBox: true,
  boundaryWall: false,
  torii: false,
  tanzaku: false,

  // --- power / telecom ------------------------------------------------
  pole: true,
  poleSide: 'left',
  powerLines: true,
  phoneLine: true,
  wireToSides: true,
  streetLamp: true,
  transformers: true,

  // --- lighting -------------------------------------------------------
  lightsEnabled: true,
  lightStyle: 'warm', // warm | cool | neon | mixed
  lightDensity: 1.0,
  lightIntensity: 1.0,
  realLights: true,
  bloom: true,

  // --- signs ----------------------------------------------------------
  signs: {
    main: '',
    mainSub: '',
    side: '',
    banner: '',
    lantern: '',
    neon: '',
    aboard: '',
    posterTitle: '',
    posterBody: '',
    menu: '',
  },
  autoSigns: true,

  // --- output ---------------------------------------------------------
  detail: 2,
  ground: true,
  groundStyle: 'street', // street | plot | none
};

/* ------------------------------------------------------------------ */
/* Presets per building type                                          */
/* ------------------------------------------------------------------ */

export const TYPE_PRESETS = {
  machiya: {},
  shop: { floors: 3, width: 8.5, wallStyle: 'timber', shopfront: true, balcony: true, neon: true, awning: true },
  ramen: { floors: 2, width: 6.5, depth: 6, noren: true, lanterns: true, neon: true, wallStyle: 'timber', roofType: 'gable' },
  house: { floors: 2, width: 8, depth: 8, shopfront: false, balcony: true, wallStyle: 'plaster', shutters: false, vending: false, awning: false, noren: false, boundaryWall: true, interior: false },
  apartment: { floors: 5, width: 13, depth: 9, floorHeight: 2.9, wallStyle: 'concrete', balcony: true, balconyLaundry: true, shopfront: true, roofType: 'flat', roofTile: 'slate', vending: true, crates: false, torii: false },
  office: { floors: 7, width: 14, depth: 12, floorHeight: 3.4, wallStyle: 'concrete', windowStyle: 'glass', balcony: false, roofType: 'flat', roofTile: 'slate', waterTank: true, antenna: true, roofRail: true, shopfront: true, noren: false, lanterns: false, parasol: false, seating: false, acUnits: true, modernMix: 0.85 },
  temple: { floors: 1, width: 14, depth: 10, floorHeight: 4.6, wallStyle: 'timber', shopfront: false, roofType: 'irimoya', roofCurve: 0.85, roofOverhang: 1.7, shachihoko: true, windowStyle: 'lattice', balcony: false, noren: false, awning: false, vending: false, neon: false, posters: false, seating: false, parasol: false, torii: true, modernMix: 0.12, boundaryWall: true, detail: 3 },
  shrine: { floors: 1, width: 8, depth: 7, floorHeight: 3.6, wallStyle: 'timber', roofType: 'gable', roofCurve: 0.9, roofOverhang: 1.6, shopfront: false, balcony: false, noren: false, awning: false, vending: false, seating: false, parasol: false, torii: true, shachihoko: true, tanzaku: true, modernMix: 0.08, detail: 3 },
  teahouse: { floors: 1, width: 5.5, depth: 5, floorHeight: 2.8, wallStyle: 'plaster', roofType: 'pyramid', roofCurve: 0.7, windowStyle: 'shoji', shoji: true, balcony: false, shopfront: false, noren: true, awning: false, vending: false, seating: true, neon: false, modernMix: 0.1, detail: 3 },
  pagoda: { floors: 5, width: 8, depth: 8, floorHeight: 2.9, wallStyle: 'timber', roofType: 'tiered', roofCurve: 0.9, roofOverhang: 1.5, windowStyle: 'lattice', shopfront: false, balcony: false, noren: false, awning: false, vending: false, seating: false, neon: false, modernMix: 0.05, detail: 3, plants: false },
  ryokan: { floors: 3, width: 15, depth: 10, floorHeight: 3.0, wallStyle: 'plaster', roofType: 'irimoya', roofCurve: 0.7, shopfront: true, balcony: true, balconyLaundry: false, noren: true, lanterns: true, awning: true, neon: false, modernMix: 0.25, vending: true, detail: 3 },
  factory: { floors: 2, width: 16, depth: 12, floorHeight: 4.2, wallStyle: 'metal', roofType: 'shed', roofTile: 'metal-rib', balcony: false, shopfront: false, awning: false, noren: false, seating: false, parasol: false, plants: false, neon: false, modernMix: 0.6, vending: false, bicycles: false, detail: 2 },
  konbini: { floors: 1, width: 12, depth: 8, floorHeight: 3.4, wallStyle: 'concrete', windowStyle: 'glass', glassFront: true, roofType: 'flat', roofTile: 'slate', balcony: false, awning: false, noren: false, seating: false, neon: true, vending: true, modernMix: 0.9, posters: true, detail: 2 },
  arcade: { floors: 4, width: 7, depth: 7, floorHeight: 3.2, wallStyle: 'concrete', roofType: 'flat', balcony: true, shopfront: true, neon: true, modernMix: 1.0, vending: true, lanterns: true, posters: true, detail: 3, theme: 'neonDistrict' },
  tower: { floors: 9, width: 12, depth: 11, floorHeight: 3.5, wallStyle: 'concrete', windowStyle: 'glass', balcony: false, roofType: 'pyramid', roofCurve: 0.5, roofOverhang: 1.4, shopfront: true, noren: false, lanterns: true, neon: true, waterTank: true, antenna: true, roofRail: true, modernMix: 0.8, detail: 2 },
};

export function paramsFor(type, overrides = {}) {
  const base = { ...DEFAULT_PARAMS, ...(TYPE_PRESETS[type] || {}) };
  return { ...base, ...overrides, type, signs: { ...DEFAULT_PARAMS.signs, ...(base.signs || {}), ...(overrides.signs || {}) } };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function resolveColors(cfg, rng) {
  const pal = PALETTES[cfg.theme] || PALETTES.machiya;
  const jitterColor = cfg.irregularity > 0.05;
  const shift = (hex, amt) => {
    const c = new THREE.Color(hex);
    const hsl = {};
    c.getHSL(hsl);
    hsl.l = Math.max(0.05, Math.min(0.95, hsl.l + amt));
    hsl.h = (hsl.h + (rng.float(-0.02, 0.02) * cfg.irregularity)) % 1;
    c.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + rng.float(-0.06, 0.06) * cfg.irregularity)), hsl.l);
    return `#${c.getHexString()}`;
  };
  const base = {
    ...pal,
    wood: cfg.woodColor || shift(pal.wood, jitterColor ? rng.float(-0.05, 0.05) : 0),
    plaster: cfg.wallColor || shift(pal.plaster, jitterColor ? rng.float(-0.04, 0.04) : 0),
    roof: cfg.roofColor || shift(pal.roof, jitterColor ? rng.float(-0.04, 0.04) : 0),
    trim: cfg.trimColor || pal.trim,
    woodStyle: cfg.woodStyle || pal.woodStyle,
    detail: cfg.detail,
  };
  return base;
}

function faceIsZ(face) {
  return face === '+z' || face === '-z';
}

/** Half-extent of a tier along a face. */
function faceHalf(tier, face) {
  return faceIsZ(face) ? tier.w / 2 : tier.d / 2;
}

function faceOrigin(tier, face) {
  switch (face) {
    case '+z':
      return [tier.x, 0, tier.z + tier.d / 2];
    case '-z':
      return [tier.x, 0, tier.z - tier.d / 2];
    case '+x':
      return [tier.x + tier.w / 2, 0, tier.z];
    default:
      return [tier.x - tier.w / 2, 0, tier.z];
  }
}

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

export class BuildingGenerator {
  constructor(materials) {
    this.materials = materials;
  }

  /**
   * @param {object} params see DEFAULT_PARAMS
   * @returns {{group: THREE.Group, info: object, lights: Array}}
   */
  generate(params = {}) {
    const cfg = { ...DEFAULT_PARAMS, ...(TYPE_PRESETS[params.type] || {}), ...params };
    const rng = new Rng(hashStringToSeed(String(cfg.seed)) ^ hashStringToSeed(cfg.type + cfg.theme));
    const colors = resolveColors(cfg, rng);
    const b = new Builder(this.materials);
    const lights = [];
    const detail = Math.max(0, Math.min(3, cfg.detail ?? 2));
    const modern = Math.max(0, Math.min(1, cfg.modernMix ?? 0.4));

    // ---- content: names / signage text -------------------------------
    const content = resolveContent(cfg, rng);

    // ---- massing -----------------------------------------------------
    const tiers = planTiers(cfg, rng);
    const totalH = tiers[tiers.length - 1].y1;
    const topTier = tiers[tiers.length - 1];
    const isPagoda = cfg.type === 'pagoda';
    const isTemple = cfg.type === 'temple' || cfg.type === 'shrine';

    // ---- ground ------------------------------------------------------
    let ground = null;
    if (cfg.ground !== false && cfg.groundStyle !== 'none') {
      ground = buildGround(b, cfg, colors, tiers, rng);
    }

    // ---- plinth ------------------------------------------------------
    const plinthH = isTemple ? 0.55 : cfg.type === 'house' ? 0.35 : 0.22;
    b.box(
      b.mat('stone', { color: colors.stone }),
      [tiers[0].w + 0.5, plinthH, tiers[0].d + 0.5],
      [tiers[0].x, plinthH / 2, tiers[0].z]
    );
    if (isTemple) {
      P.propSteps(b, colors, [tiers[0].x, 0, tiers[0].z + tiers[0].d / 2 + 0.55], {
        width: Math.min(6, tiers[0].w * 0.5),
        steps: 3,
      });
    }

    // ---- walls / facades ---------------------------------------------
    const facadeState = { windows: [], glowPanels: [] };
    let prevTier = null;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      buildTier(b, cfg, colors, tier, i, rng, facadeState, { isPagoda, isTemple, prevTier, detail, modern, content });
      if (i > 0 && cfg.skirtRoofs && cfg.roofType !== 'flat' && !isPagoda && tiers.length <= 4) {
        buildSkirtRoof(b, cfg, colors, tier, i, rng, { detail });
      }
      prevTier = tier;
    }

    // ---- ground floor shopfront / entrance ---------------------------
    if (cfg.shopfront || isTemple || cfg.type === 'konbini' || cfg.type === 'arcade') {
      buildShopfront(b, cfg, colors, tiers[0], content, rng, facadeState, { isTemple, detail, modern, lights });
    }

    // ---- interior slice (visible through the glass) -------------------
    if (cfg.interior && (cfg.shopfront || cfg.glassFront) && !isTemple && tiers[0].d > 4) {
      b.pushPlacement(tiers[0].x, plinthH, tiers[0].z);
      P.interiorSlice(b, colors, {
        w: tiers[0].w * 0.9,
        d: tiers[0].d * 0.9,
        floorY: 0,
        ceilY: cfg.floorHeight - 0.35,
        style: cfg.type === 'konbini' ? 'konbini' : cfg.type === 'ramen' ? 'ramen' : cfg.type === 'teahouse' ? 'tea' : 'izakaya',
      });
      b.popMatrix();
      lights.push({
        kind: 'point',
        pos: [tiers[0].x, plinthH + cfg.floorHeight * 0.75, tiers[0].z + tiers[0].d * 0.15],
        color: cfg.lightStyle === 'cool' ? '#cfe4ff' : '#ffcf8f',
        intensity: 6 * cfg.lightIntensity,
        distance: 14,
      });
    }

    // ---- roofs -------------------------------------------------------
    const roofInfo = buildRoofStack(b, cfg, colors, tiers, rng, { isPagoda, isTemple, detail, modern, lights });

    // ---- modern rooftop / wall kit ------------------------------------
    buildModernKit(b, cfg, colors, tiers, rng, { detail, modern, roofInfo, lights, isPagoda, isTemple });

    // ---- signage ------------------------------------------------------
    buildSignage(b, cfg, colors, tiers, content, rng, { detail, modern, lights });

    // ---- poles, wires, street furniture --------------------------------
    buildSite(b, cfg, colors, tiers, rng, { detail, modern, lights, totalH });

    // ---- boundary / torii ---------------------------------------------
    buildBoundary(b, cfg, colors, tiers, rng, { detail });

    // ---- build --------------------------------------------------------
    const group = b.build(content.name || 'Building');
    group.userData.isBuilding = true;
    // bounds of the *building + site props* (ignores ground slab / road / distant wires)
    // Roof apex measured from what was actually built (pagoda spires etc. run high).
    let roofTop = totalH;
    if (roofInfo?.ridgeY != null) roofTop = Math.max(roofTop, roofInfo.ridgeY);
    if (roofInfo?.roofInfo?.ridgeY != null) roofTop = Math.max(roofTop, roofInfo.roofInfo.ridgeY);
    let footprintMax = { x: tiers[0].w, z: tiers[0].d };
    for (const t of tiers) footprintMax = { x: Math.max(footprintMax.x, t.w), z: Math.max(footprintMax.z, t.d) };
    const over = (cfg.roofOverhang ?? 1) + 1.2;
    const bounds = {
      min: [tiers[0].x - footprintMax.x / 2 - over, 0, tiers[0].z - footprintMax.z / 2 - 2.2],
      max: [tiers[0].x + footprintMax.x / 2 + over, roofTop + 0.7, tiers[0].z + footprintMax.z / 2 + 3.4],
    };
    if (cfg.pole) {
      const px = tiers[0].x + (cfg.poleSide === 'right' ? 1 : -1) * (tiers[0].w / 2 + 1.15);
      bounds.min[0] = Math.min(bounds.min[0], px - 1.2);
      bounds.max[0] = Math.max(bounds.max[0], px + 1.2);
    }
    if (cfg.boundaryWall) {
      bounds.min[0] -= 1.4;
      bounds.max[0] += 1.4;
      bounds.min[2] -= 1.4;
      bounds.max[2] += 1.4;
    }
    const info = {
      colors,
      content,
      bounds,
      name: content.name,
      nameSub: content.sub,
      type: cfg.type,
      theme: cfg.theme,
      floors: tiers.length,
      height: totalH,
      totalHeight: roofTop,
      width: topTier.w,
      depth: topTier.d,
      footprint: [tiers[0].w, tiers[0].d],
      triangles: b.stats.triangles,
      parts: b.stats.parts,
      meshes: group.children.length,
      ground,
      roof: cfg.roofType,
      roofInfo,
    };
    return { group, info, lights };
  }
}

export default BuildingGenerator;

/* ------------------------------------------------------------------ */
/* Content resolution (names + all sign copy)                          */
/* ------------------------------------------------------------------ */

const NAME_POOL_KEY = {
  ramen: 'food',
  teahouse: 'service',
  shop: 'retail',
  konbini: 'retail',
  arcade: 'retail',
  office: 'service',
  factory: 'service',
  machiya: 'food',
  apartment: 'service',
  ryokan: 'service',
  house: 'service',
  tower: 'service',
  temple: 'service',
  shrine: 'service',
  pagoda: 'service',
};

export function resolveContent(cfg, rng) {
  const poolKey = NAME_POOL_KEY[cfg.type] || 'food';
  const auto = cfg.autoSigns !== false;
  const autoName = auto ? randomShopName(rng, poolKey) : { text: '商店', romaji: 'Shōten', kind: 'Shop' };
  const name = (cfg.name || '').trim() || autoName.text;
  const sub = (cfg.nameSub || '').trim() || (cfg.type === 'house' ? '' : autoName.romaji);
  const s = cfg.signs || {};
  const pickBoard = () => {
    const pool = SHOP_NAMES.board;
    return pool[rng.int(0, pool.length - 1)][0];
  };
  const posterPick = POSTER_TEXT[rng.int(0, POSTER_TEXT.length - 1)];
  const posterBody = (s.posterBody || '').trim() || posterPick[1].join('\n');
  const posterTitle = (s.posterTitle || '').trim() || posterPick[0];
  const menuItems = [];
  const menuN = rng.int(4, 6);
  const used = new Set();
  while (menuItems.length < menuN) {
    const it = MENU_ITEMS[rng.int(0, MENU_ITEMS.length - 1)];
    if (used.has(it[0])) continue;
    used.add(it[0]);
    menuItems.push(it);
  }
  return {
    name,
    sub,
    kind: autoName.kind,
    main: (s.main || '').trim() || name,
    mainSub: (s.mainSub || '').trim() || sub,
    side: (s.side || '').trim() || (auto ? randomCJK(rng, 3) : '営業中'),
    banner: (s.banner || '').trim() || (auto ? pickBoard() : '大売出'),
    lantern: (s.lantern || '').trim() || (auto ? randomCJK(rng, 1) : ''),
    neon: (s.neon || '').trim() || (cfg.neonText || '').trim() || (auto ? '営業中' : ''),
    aboard: (s.aboard || '').trim() || (auto ? posterPick[0] : ''),
    posterTitle,
    posterBody: posterBody.split('\n').filter(Boolean),
    menu: (s.menu || '').trim() || 'お品書き',
    menuItems,
    posterPick,
  };
}

/* ------------------------------------------------------------------ */
/* Massing                                                             */
/* ------------------------------------------------------------------ */

function planTiers(cfg, rng) {
  const floors = Math.max(1, Math.min(12, Math.round(cfg.floors)));
  const tiers = [];
  const irr = cfg.irregularity;
  let w = cfg.width;
  let d = cfg.depth;
  let x = 0;
  let z = 0;
  let y = 0;
  const fh = cfg.floorHeight;
  for (let i = 0; i < floors; i++) {
    const h = fh * (i === 0 ? 1.12 : 1);
    if (i > 0) {
      if (cfg.type === 'pagoda') {
        w *= 0.9;
        d *= 0.9;
      } else {
        // organic per-floor footprint drift (a touch narrower for upper floors)
        const narrow = 1 - 0.035 * rng.float(0, 1) * (1 + irr);
        w *= narrow;
        d *= narrow;
        x += rng.float(-1, 1) * irr * 0.22;
        z += rng.float(-1, 1) * irr * 0.22;
      }
    }
    tiers.push({ index: i, y0: y, y1: y + h, h, w, d, x, z });
    y += h;
  }
  return tiers;
}

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

function wallMaterial(b, cfg, colors, tier, kind = 'body') {
  const style = tier.wallStyle || cfg.wallStyle;
  switch (style) {
    case 'timber':
      return b.mat('wood', { color: colors.wood, style: colors.woodStyle, name: 'timber_wall' });
    case 'stone':
      return b.mat('stone', { color: colors.stone, style: 'stone' });
    case 'concrete':
      return b.mat('concrete', { color: colors.plaster });
    case 'metal':
      return b.mat('metal', { color: colors.metal, metalness: 0.35, roughness: 0.6 });
    case 'tile':
      return b.mat('ceramic', { color: colors.stone });
    case 'brick':
      return b.mat('brick', { color: colors.stone });
    case 'plaster':
    default:
      return b.mat('plaster', { color: colors.plaster, name: kind === 'upper' ? 'plaster_upper' : 'plaster' });
  }
}

function buildTier(b, cfg, colors, tier, index, rng, state, o) {
  const wallMat = wallMaterial(b, cfg, colors, tier);
  const body = new THREE.BoxGeometry(tier.w, tier.h, tier.d);
  body.translate(tier.x, tier.y0 + tier.h / 2, tier.z);
  b.add(wallMat, body, 'wall');

  // corner posts for timber styles
  const timber = tier.wallStyle ? tier.wallStyle === 'timber' : cfg.wallStyle === 'timber';
  if (timber || cfg.theme === 'machiya' || cfg.theme === 'edo' || o.isTemple) {
    const postMat = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.22, tier.h, 0.22);
        g.translate(tier.x + sx * (tier.w / 2 - 0.11), tier.y0 + tier.h / 2, tier.z + sz * (tier.d / 2 - 0.11));
        b.add(postMat, g, 'corner_post');
      }
    }
    // horizontal ties (nuki) at floor lines
    for (const y of [tier.y0 + 0.35, tier.y1 - 0.35]) {
      for (const [dx, dz, lw, ld] of [
        [1, 0, tier.w, 0.14],
        [0, 1, 0.14, tier.d],
      ]) {
        const g = new THREE.BoxGeometry(lw + 0.04, 0.16, ld + 0.04);
        g.translate(tier.x, y, tier.z);
        b.add(postMat, g, 'tie_beam');
      }
    }
  }

  // floor slab bands (modern look)
  if (cfg.wallStyle === 'concrete' || cfg.type === 'apartment' || cfg.type === 'office') {
    const bandMat = b.mat('concrete', { color: colors.plaster });
    const g = new THREE.BoxGeometry(tier.w + 0.22, 0.24, tier.d + 0.22);
    g.translate(tier.x, tier.y1 - 0.12, tier.z);
    b.add(bandMat, g, 'floor_band');
  }

  // facade openings on all four sides
  if (cfg.windows) {
    for (const face of ['+z', '-z', '+x', '-x']) {
      const isFront = face === '+z';
      const isBack = face === '-z';
      if (isFront && index === 0 && cfg.shopfront) continue; // handled by shopfront
      if (isFront && index === 0 && o.isTemple) continue;
      const half = faceHalf(tier, face);
      const wInset = 0.9;
      const usable = half * 2 - wInset * 2;
      if (usable < 1.2) continue;
      const targetBay = cfg.type === 'office' || cfg.type === 'tower' ? 2.1 : 1.9;
      const bays = Math.max(1, Math.round(usable / targetBay));
      const bayW = usable / bays;
      const winW = Math.min(bayW * 0.72, 1.55);
      const winH = Math.min(tier.h * 0.5, index === 0 ? 1.6 : 1.5);
      const y = tier.y0 + tier.h * (index === 0 ? 0.62 : 0.55);
      const [ox, , oz] = faceOrigin(tier, face);
      const rotY = ROT[face];
      const skipDoorBay = isFront && index === 0;
      for (let i = 0; i < bays; i++) {
        const u = -half + wInset + bayW * (i + 0.5);
        if (skipDoorBay && Math.abs(u) < 1.4) continue;
        if (isBack && rng.float() < 0.18) continue;
        b.pushPlacement(ox, 0, oz, rotY);
        addWindow(b, cfg, colors, {
          u,
          y,
          w: winW,
          h: winH,
          tier,
          face,
          isFront,
          rng,
          detail: o.detail,
          index,
          state,
        });
        b.popMatrix();
        // balcony on the street side of upper floors
        if (isFront && index > 0 && cfg.balcony && !o.isPagoda && rng.float() < 0.9) {
          b.pushPlacement(ox, 0, oz, rotY);
          addBalcony(b, cfg, colors, { tier, u, index, rng, detail: o.detail, y: tier.y0, width: bayW * 0.98, state });
          b.popMatrix();
        }
      }
      // AC unit cluster / laundry on side + back faces
      if (index > 0 && cfg.acUnits && (face === '+x' || face === '-x' || isBack) && rng.float() < 0.5 + (1 - modernLine(cfg)) * 0) {
        const u = rng.float(-half + 0.8, half - 0.8);
        b.pushPlacement(ox, 0, oz, rotY);
        P.propACUnit(b, colors, [u, tier.y0 + 0.25, 0.34], 0, { detail: o.detail, width: 0.8 });
        b.popMatrix();
      }
    }
  }

  // vertical hanging sign on the +x side (common on Japanese commercial buildings)
  if (index > 0 && (cfg.neon || cfg.type === 'arcade' || cfg.type === 'shop') && cfg.type !== 'temple') {
    b.pushPlacement(tier.x + tier.w / 2, 0, tier.z + tier.d * 0.18, ROT['+x']);
    const h = Math.min(tier.h * 0.7, 2.1);
    const board = new THREE.BoxGeometry(0.1, h, 0.62);
    board.translate(0, tier.y0 + tier.h * 0.55, 0.5);
    const sideText = (cfg.signs.side || '').trim() || (cfg.autoSigns === false ? '営業中' : o.content?.side) || '営業中';
    b.add(b.mat('signBoard', { color: '#ffffff', map: TT.signTexture({ text: sideText, bg: colors.signBg, fg: colors.signFg, vertical: true, w: 128, h: 512 }) }), board, 'hanging_sign');
    b.popMatrix();
  }

  // rooftop parapet is handled in the roof stack
  return tier;
}

function modernLine(cfg) {
  return cfg.modernMix ?? 0.4;
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

function windowStyleFor(cfg, index, face) {
  if (cfg.windowStyle && cfg.windowStyle !== 'auto') return cfg.windowStyle;
  switch (cfg.type) {
    case 'office':
    case 'tower':
    case 'konbini':
      return 'glass';
    case 'apartment':
      return 'glass';
    case 'factory':
      return 'industrial';
    case 'teahouse':
    case 'house':
      return 'shoji';
    case 'temple':
    case 'shrine':
    case 'pagoda':
      return 'lattice';
    default:
      return index === 0 ? 'glass' : cfg.lattice ? 'lattice' : 'shoji';
  }
}

function addWindow(b, cfg, colors, o) {
  const { u, y, w, h, rng, detail, index, state } = o;
  const style = windowStyleFor(cfg, index, o.face);
  const frameMat = b.mat('wood', { color: colors.trim, style: colors.woodStyle });
  const metalFrame = b.mat('metal', { color: colors.metal });
  const warm = cfg.lightStyle !== 'cool';
  const glowColor = warm ? '#ffd9a0' : '#cfe4ff';
  const glassMat = b.mat('glass', { color: '#20303a', opacity: 0.42, roughness: 0.1, metalness: 0.2 });
  const glowMat = b.mat('lamp', {
    color: glowColor,
    emissive: true,
    emissiveColor: glowColor,
    emissiveIntensity: (cfg.lightsEnabled ? 0.85 : 0.15) * cfg.lightIntensity,
  });

  // recessed opening: dark box slightly inside the wall + trim on top
  const inset = new THREE.BoxGeometry(w, h, 0.12);
  inset.translate(u, y, -0.06);
  b.add(b.mat('concrete', { color: '#2a2724' }), inset, 'window_recess');

  const lit = rng.float() < 0.35 + 0.4 * (cfg.lightsEnabled ? 1 : 0) * (index === 0 ? 1.2 : 0.7);
  const paneMat = lit && cfg.lightsEnabled ? glowMat : glassMat;
  const pane = new THREE.BoxGeometry(w * 0.94, h * 0.94, 0.05);
  pane.translate(u, y, 0.02);
  b.add(paneMat, pane, 'window_pane');
  if (lit) state.glowPanels.push({ u, y, w, h });

  if (style === 'lattice') {
    const slat = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
    const n = Math.max(4, Math.round(w / 0.12));
    const geos = [];
    for (let i = 0; i < n; i++) {
      const x = u - w / 2 + (i / (n - 1)) * w;
      const g = new THREE.BoxGeometry(0.03, h * 1.02, 0.05);
      g.translate(x, y, 0.09);
      geos.push(g);
    }
    for (const yy of [y - h * 0.5, y + h * 0.5, y]) {
      const g = new THREE.BoxGeometry(w * 1.02, 0.04, 0.06);
      g.translate(u, yy, 0.09);
      geos.push(g);
    }
    const m = mergeList(geos);
    if (m) b.add(slat, m, 'window_lattice');
  } else if (style === 'shoji') {
    const paper = b.mat('paper', {
      color: '#fbf3dd',
      emissive: true,
      emissiveColor: '#ffd8a0',
      emissiveIntensity: cfg.lightsEnabled ? 0.5 * cfg.lightIntensity : 0.05,
    });
    const p = new THREE.BoxGeometry(w * 0.92, h * 0.92, 0.04);
    p.translate(u, y, 0.06);
    b.add(paper, p, 'shoji_paper');
    const grid = [];
    const cols = Math.max(2, Math.round(w / 0.22));
    const rows = Math.max(2, Math.round(h / 0.28));
    for (let i = 1; i < cols; i++) {
      const g = new THREE.BoxGeometry(0.022, h * 0.94, 0.05);
      g.translate(u - w / 2 + (i / cols) * w, y, 0.09);
      grid.push(g);
    }
    for (let j = 1; j < rows; j++) {
      const g = new THREE.BoxGeometry(w * 0.94, 0.022, 0.05);
      g.translate(u, y - h / 2 + (j / rows) * h, 0.09);
      grid.push(g);
    }
    const gm = mergeList(grid);
    if (gm) b.add(frameMat, gm, 'shoji_grid');
  } else if (style === 'industrial') {
    const slat = b.mat('darkMetal', { color: colors.metal });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.05, h * 0.96, 0.06);
      g.translate(u - w / 2 + (i / 4) * w, y, 0.08);
      b.add(slat, g, 'window_mullion');
    }
  } else {
    // modern glazing: aluminium frame mullions
    const g1 = new THREE.BoxGeometry(0.05, h * 0.96, 0.07);
    g1.translate(u, y, 0.07);
    b.add(metalFrame, g1, 'window_mullion');
  }

  // Frame + sill + lintel
  const fw = 0.07;
  for (const [dx, dy, ww, hh] of [
    [0, h / 2 + fw / 2, w + fw * 2, fw],
    [0, -h / 2 - fw / 2, w + fw * 2, fw],
    [-w / 2 - fw / 2, 0, fw, h],
    [w / 2 + fw / 2, 0, fw, h],
  ]) {
    const g = new THREE.BoxGeometry(ww, hh, 0.16);
    g.translate(u + dx, y + dy, 0.06);
    b.add(frameMat, g, 'window_frame');
  }
  const sill = new THREE.BoxGeometry(w + 0.34, 0.08, 0.3);
  sill.translate(u, y - h / 2 - 0.06, 0.12);
  b.add(b.mat('stone', { color: colors.stone }), sill, 'window_sill');

  // small skirt roof over the window (hisashi) — classic Japanese detail
  if (cfg.skirtRoofs && detail >= 2 && rng.float() < 0.5 && style !== 'glass' && style !== 'industrial') {
    const roofMat = b.mat('roofTile', { color: colors.roof });
    const g = new THREE.BoxGeometry(w + 0.7, 0.09, 0.5);
    g.rotateX(0.32);
    g.translate(u, y + h / 2 + 0.24, 0.28);
    b.add(roofMat, g, 'window_awning');
    const val = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
    const v = new THREE.BoxGeometry(w + 0.7, 0.12, 0.05);
    v.translate(u, y + h / 2 + 0.12, 0.5);
    b.add(val, v, 'awning_beam');
  }
}

/* ------------------------------------------------------------------ */
/* Balcony / veranda                                                   */
/* ------------------------------------------------------------------ */

function addBalcony(b, cfg, colors, o) {
  const { tier, u, width, rng, detail, state } = o;
  const y = o.y + tier.h * 0.28;
  const depth = Math.min(1.5, tier.d * 0.22);
  const wood = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
  const dark = b.mat('wood', { color: colors.trim, style: colors.woodStyle });
  const concrete = b.mat('concrete', { color: colors.plaster });

  const traditional = cfg.theme === 'machiya' || cfg.theme === 'edo' || cfg.theme === 'temple' || cfg.type === 'ryokan' || cfg.type === 'machiya';
  // slab
  const slab = new THREE.BoxGeometry(width, 0.14, depth);
  slab.translate(u, y, depth / 2 + 0.02);
  b.add(traditional ? wood : concrete, slab, 'balcony_slab');
  // railing
  const railH = 0.95;
  if (traditional) {
    const posts = [];
    const n = Math.max(3, Math.round(width / 0.35));
    for (let i = 0; i <= n; i++) {
      const g = new THREE.BoxGeometry(0.05, railH, 0.05);
      g.translate(u - width / 2 + (i / n) * width, y + railH / 2 + 0.07, depth - 0.06);
      posts.push(g);
    }
    const top = new THREE.BoxGeometry(width + 0.12, 0.09, 0.14);
    top.translate(u, y + railH + 0.1, depth - 0.06);
    posts.push(top);
    const mid = new THREE.BoxGeometry(width + 0.1, 0.06, 0.1);
    mid.translate(u, y + railH * 0.55, depth - 0.06);
    posts.push(mid);
    const m = mergeList(posts);
    if (m) b.add(wood, m, 'balcony_rail');
  } else {
    const metal = b.mat('metal', { color: colors.metal });
    const bars = [];
    const n = Math.max(3, Math.round(width / 0.18));
    for (let i = 1; i < n; i++) {
      const g = new THREE.BoxGeometry(0.03, railH, 0.03);
      g.translate(u - width / 2 + (i / n) * width, y + railH / 2 + 0.07, depth - 0.05);
      bars.push(g);
    }
    const top = new THREE.BoxGeometry(width + 0.1, 0.06, 0.08);
    top.translate(u, y + railH + 0.1, depth - 0.05);
    bars.push(top);
    const m = mergeList(bars);
    if (m) b.add(metal, m, 'balcony_rail');
  }
  // laundry pole + hanging cloth
  if (cfg.balconyLaundry && rng.float() < 0.7) {
    const poleMat = b.mat('metal', { color: colors.metal });
    const pl = new THREE.CylinderGeometry(0.03, 0.03, width * 0.95, 6);
    pl.rotateZ(Math.PI / 2);
    pl.translate(u, y + 1.5, depth * 0.55);
    b.add(poleMat, pl, 'laundry_pole');
    const n = rng.int(1, 3);
    const clothColors = ['#e8e2d4', '#7f9fb8', '#c98b8b', '#8fae8b', '#d8c88f'];
    for (let i = 0; i < n; i++) {
      const cw = rng.float(0.38, 0.7);
      const cx = u + rng.float(-width * 0.35, width * 0.35);
      const g = new THREE.PlaneGeometry(cw, rng.float(0.6, 1.0), 3, 3);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        pos.setZ(v, Math.sin(pos.getX(v) * 6) * 0.03);
      }
      g.computeVertexNormals();
      g.translate(cx, y + 1.5 - 0.5, depth * 0.55 + rng.float(-0.02, 0.02));
      b.add(b.mat('cloth', { color: clothColors[rng.int(0, clothColors.length - 1)] }), g, 'laundry');
    }
  }
  // potted plant on the balcony
  if (cfg.plants && rng.float() < 0.45 && detail >= 1) {
    P.propPottedPlant(b, colors, [u + rng.float(-width * 0.3, width * 0.3), y + 0.07, depth * 0.6], {
      rng,
      potRadius: 0.14,
      height: 0.5,
      kind: rng.bool(0.4) ? 'bamboo' : 'shrub',
    });
  }
  void dark;
}

/* ------------------------------------------------------------------ */
/* Skirt roof between floors                                           */
/* ------------------------------------------------------------------ */

function buildSkirtRoof(b, cfg, colors, tier, index, rng, o) {
  const over = cfg.roofOverhang * 0.55;
  const drop = Math.min(0.9, tier.d * 0.16);
  const tileMat = b.mat('roofTile', { color: colors.roof });
  const underMat = b.mat('roofUnder', { color: colors.roofUnder });
  const wood = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
  const depth = over + 0.35;
  for (const face of ['+z', '+x', '-x']) {
    const [ox, , oz] = faceOrigin(tier, face);
    const rotY = ROT[face];
    const half = faceHalf(tier, face) + over;
    b.pushPlacement(ox, 0, oz, rotY);
    const slope = Math.atan2(drop, depth);
    const len = Math.hypot(depth, drop);
    const panel = new THREE.BoxGeometry(half * 2, cfg.roofThickness * 1.4, len);
    panel.rotateX(-slope);
    panel.translate(0, tier.y0 + 0.05 - drop / 2, depth / 2);
    b.add(tileMat, panel, 'skirt_roof');
    const fascia = new THREE.BoxGeometry(half * 2, 0.14, 0.1);
    fascia.translate(0, tier.y0 + 0.05 - drop - 0.06, depth);
    b.add(wood, fascia, 'skirt_fascia');
    if (o.detail >= 2) {
      const n = Math.max(3, Math.round((half * 2) / 0.5));
      const rafts = [];
      for (let i = 0; i <= n; i++) {
        const x = -half + (i / n) * half * 2;
        const g = new THREE.BoxGeometry(0.08, 0.1, len * 0.92);
        g.rotateX(-slope);
        g.translate(x, tier.y0 + 0.02 - drop / 2 - 0.12, depth / 2);
        rafts.push(g);
      }
      const m = mergeList(rafts);
      if (m) b.add(wood, m, 'skirt_rafters');
    }
    // eave underside
    const under = new THREE.BoxGeometry(half * 2, 0.03, len);
    under.rotateX(-slope);
    under.translate(0, tier.y0 - 0.02 - drop / 2 - 0.02, depth / 2);
    b.add(underMat, under, 'skirt_under');
    b.popMatrix();
  }
}

/* ------------------------------------------------------------------ */
/* Ground floor shopfront                                              */
/* ------------------------------------------------------------------ */

function buildShopfront(b, cfg, colors, tier, content, rng, state, o) {
  const face = '+z';
  const [ox, , oz] = faceOrigin(tier, face);
  const detail = o.detail;
  const wood = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
  const darkWood = b.mat('wood', { color: colors.trim, style: colors.woodStyle });
  const glass = b.mat('glass', { color: '#1d2b33', opacity: 0.4, roughness: 0.08, metalness: 0.2 });
  const metal = b.mat('metal', { color: colors.metal });
  const warm = cfg.lightStyle !== 'cool';
  const glowColor = warm ? '#ffcf8f' : '#cfe4ff';
  const glow = b.mat('lamp', {
    color: glowColor,
    emissive: true,
    emissiveColor: glowColor,
    emissiveIntensity: (cfg.lightsEnabled ? 1.0 : 0.1) * cfg.lightIntensity,
  });
  const half = tier.w / 2;
  const gh = tier.h * 0.82;

  b.pushPlacement(ox, 0, oz, ROT[face]);

  if (o.isTemple) {
    // temple front: big timber doors, columns, studs, steps
    const doorW = Math.min(tier.w * 0.45, 3.4);
    const doorH = Math.min(tier.h * 0.72, 2.9);
    const doorMat = b.mat('wood', { color: colors.accent === colors.wood ? colors.wood : '#5c3226', style: colors.woodStyle });
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(doorW / 2 - 0.04, doorH, 0.12);
      g.translate(s * (doorW / 4), doorH / 2 + 0.55, 0.06);
      b.add(doorMat, g, 'temple_door');
      // studs
      if (detail >= 2) {
        const studs = [];
        const cols = 3;
        const rows = Math.max(3, Math.round(doorH / 0.6));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const g2 = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8);
            g2.rotateX(Math.PI / 2);
            g2.translate(s * (doorW / 4) - doorW / 4 + ((i + 0.5) / cols) * (doorW / 2), 0.75 + (j / rows) * (doorH - 0.35), 0.12);
            studs.push(g2);
          }
        }
        const m = mergeList(studs);
        if (m) b.add(b.mat('metal', { color: colors.accent }), m, 'door_studs');
      }
    }
    const lintel = new THREE.BoxGeometry(doorW + 0.5, 0.3, 0.3);
    lintel.translate(0, doorH + 0.72, 0.12);
    b.add(b.mat('wood', { color: colors.accent }), lintel, 'door_lintel');
    // columns + brackets
    const colH = tier.h * 0.86;
    for (const s of [-1, 1]) {
      P.propPillar(b, colors, [s * (doorW / 2 + 0.55), 0.55, 0.3], { height: colH, radius: 0.2, color: colors.accent });
    }
    const brackets = Math.max(3, Math.round(doorW / 0.8));
    for (let i = 0; i < brackets; i++) {
      const x = -doorW / 2 + (i / (brackets - 1)) * doorW;
      P.propDougong(b, colors, [x, colH + 0.6, 0.34], { scale: 0.9, color: colors.accent });
    }
    if (cfg.lanterns) {
      for (const s of [-1, 1]) {
        P.propChochin(b, colors, [s * (doorW / 2 + 1.4), tier.h * 0.62, 0.5], 0, { radius: 0.2, height: 0.6, color: '#d8362f', text: '' });
      }
    }
    if (cfg.noren) {
      P.propNoren(b, colors, [0, doorH + 0.6, 0.22], { width: doorW * 0.9, height: 0.7, text: content.lantern || '', bg: colors.accent });
    }
    b.popMatrix();
    return;
  }

  // --- generic modern shopfront ---
  const glassH = gh * 0.72;
  const bayCount = Math.max(1, Math.round(tier.w / 2.6));
  const bayW = tier.w / bayCount;
  const doorBay = Math.floor(bayCount / 2);

  for (let i = 0; i < bayCount; i++) {
    const cx = -half + bayW * (i + 0.5);
    const isDoor = i === doorBay;
    const w = bayW * 0.86;
    // frame
    for (const [dx, dy, ww, hh] of [
      [0, glassH / 2 + 0.06, w + 0.14, 0.12],
      [0, 0.06, w + 0.14, 0.12],
      [-w / 2 - 0.07, glassH / 2, 0.14, glassH],
      [w / 2 + 0.07, glassH / 2, 0.14, glassH],
    ]) {
      const g = new THREE.BoxGeometry(ww, hh, 0.2);
      g.translate(cx + dx, dy + 0.55, 0.08);
      b.add(isDoor ? darkWood : metal, g, 'shop_frame');
    }
    const pane = new THREE.BoxGeometry(w, glassH - 0.1, 0.05);
    pane.translate(cx, glassH / 2 + 0.55, 0.02);
    b.add(isDoor ? glow : glass, pane, 'shop_glass');
    if (isDoor) {
      // door leaf + handle + step
      const leaf = new THREE.BoxGeometry(w * 0.94, glassH * 0.96, 0.06);
      leaf.translate(cx, glassH / 2 + 0.55, 0.09);
      b.add(glow, leaf, 'door_glow');
      const handle = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6);
      handle.translate(cx + w * 0.36, glassH * 0.5 + 0.55, 0.15);
      b.add(metal, handle, 'door_handle');
      const step = new THREE.BoxGeometry(w + 0.4, 0.12, 0.6);
      step.translate(cx, 0.06, 0.3);
      b.add(b.mat('stone', { color: colors.stone }), step, 'entry_step');
    }
    if (cfg.shutters && !isDoor) {
      const s = new THREE.BoxGeometry(w, glassH * 0.75, 0.05);
      s.translate(cx, glassH * 0.85 + 0.55, 0.14);
      b.add(b.mat('metal', { color: '#9aa0a6', roughness: 0.7 }), s, 'shutter');
    }
    if (cfg.lattice && !isDoor && detail >= 2) {
      const n = Math.max(4, Math.round(w / 0.13));
      const geos = [];
      for (let k = 0; k < n; k++) {
        const g = new THREE.BoxGeometry(0.03, glassH * 0.98, 0.05);
        g.translate(cx - w / 2 + (k / (n - 1)) * w, glassH / 2 + 0.55, 0.12);
        geos.push(g);
      }
      for (const yy of [glassH * 0.25, glassH * 0.75]) {
        const g = new THREE.BoxGeometry(w, 0.04, 0.06);
        g.translate(cx, yy + 0.55, 0.12);
        geos.push(g);
      }
      const m = mergeList(geos);
      if (m) b.add(wood, m, 'shop_lattice');
    }
  }

  // --- noren / awning / canopy over the entrance ---
  const entryX = -half + bayW * (doorBay + 0.5);
  if (cfg.noren && glassH > 1.4) {
    P.propNoren(b, colors, [tier.w * 0.06, 0.55 + glassH * 0.86, 0.2], {
      width: Math.min(2.4, bayW * 1.1),
      height: 0.7,
      text: content.lantern || content.name.slice(0, 2),
      bg: colors.accent,
    });
  }
  if (cfg.awning) {
    P.propAwning(b, colors, [0, 0.55 + glassH + 0.45, 0.12], {
      width: tier.w * 0.94,
      out: 1.25,
      drop: 0.42,
      a: colors.awningA,
      b: colors.awningB,
    });
  }
  // --- sign band above the shopfront ---
  const bandH = Math.min(0.95, tier.h * 0.24);
  const bandY = 0.55 + glassH + (cfg.awning ? 1.05 : 0.5) + bandH / 2;
  if (bandY < tier.h * 1.15) {
    const board = new THREE.BoxGeometry(tier.w * 0.9, bandH, 0.16);
    board.translate(0, bandY, 0.12);
    b.add(
      b.mat('signBoard', {
        color: '#ffffff',
        map: TT.signTexture({
          text: content.main,
          sub: cfg.type === 'konbini' || cfg.type === 'arcade' ? '' : content.mainSub,
          bg: colors.signBg,
          fg: colors.signFg,
          w: 1024,
          h: 256,
          vertical: false,
        }),
      }),
      board,
      'sign_band'
    );
    // neon accent under the sign band
    if (cfg.neon && cfg.lightsEnabled) {
      const n = b.mat('neon', {
        color: colors.neon[0],
        emissive: true,
        emissiveColor: colors.neon[0],
        emissiveIntensity: 1.4 * cfg.lightIntensity,
      });
      const tube = new THREE.BoxGeometry(tier.w * 0.9, 0.05, 0.06);
      tube.translate(0, bandY - bandH / 2 - 0.1, 0.2);
      b.add(n, tube, 'neon_under');
    }
  }
  // --- lanterns flanking the door ---
  if (cfg.lanterns) {
    const count = Math.max(2, Math.min(6, Math.round(tier.w / 2.4)));
    for (let i = 0; i < count; i++) {
      const x = -half + ((i + 0.5) / count) * tier.w;
      if (Math.abs(x - entryX) < 0.9) continue;
      P.propChochin(b, colors, [x, glassH + 0.2, 0.42], 0, {
        radius: 0.15,
        height: 0.44,
        color: '#d8362f',
        text: content.lantern,
      });
      const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4);
      cord.translate(x, glassH + 0.62, 0.42);
      b.add(b.mat('rubber', { color: '#241f1a' }), cord, 'lantern_cord');
    }
  }
  b.popMatrix();
  state.glowPanels.push({ u: 0, y: glassH / 2, w: tier.w, h: glassH });
}

/* ------------------------------------------------------------------ */
/* Roof stack                                                          */
/* ------------------------------------------------------------------ */

function roofTypeFor(cfg, rng) {
  if (cfg.roofType && cfg.roofType !== 'auto') return cfg.roofType;
  switch (cfg.type) {
    case 'temple':
    case 'ryokan':
      return 'irimoya';
    case 'shrine':
      return 'gable';
    case 'teahouse':
      return 'pyramid';
    case 'house':
      return 'hip';
    case 'pagoda':
      return 'tiered';
    case 'office':
    case 'apartment':
    case 'konbini':
    case 'arcade':
      return 'flat';
    case 'factory':
      return 'shed';
    case 'tower':
      return 'pyramid';
    case 'ramen':
      return 'gable';
    default:
      return rng.weighted([
        { value: 'gable', weight: 3 },
        { value: 'hip', weight: 2 },
        { value: 'irimoya', weight: 2 },
      ]);
  }
}

function buildRoofStack(b, cfg, colors, tiers, rng, o) {
  const top = tiers[tiers.length - 1];
  const detail = o.detail;
  const type = roofTypeFor(cfg, rng);
  const over = cfg.roofOverhang * (o.isTemple ? 1.15 : 1);
  const tileMat = b.mat('roofTile', { color: colors.roof, roughness: cfg.roofTile === 'metal-rib' ? 0.4 : 0.5, metalness: cfg.roofTile === 'metal-rib' ? 0.5 : 0.1 });
  const ridgeMat = b.mat('ceramic', { color: colors.roof, roughness: 0.4 });
  const ornamentMat = b.mat('ceramic', { color: '#3a3a3c', roughness: 0.5 });
  const gold = b.mat('metal', { color: colors.accent === '#c8a24a' ? colors.accent : '#c8a24a', metalness: 0.8, roughness: 0.35 });
  const wood = b.mat('wood', { color: colors.wood, style: colors.woodStyle });
  const fascia = b.mat('wood', { color: colors.trim, style: colors.woodStyle });
  const gable = b.mat('plaster', { color: colors.plaster });
  const roofCfg = {
    type: type === 'tiered' ? 'pyramid' : type,
    w: top.w + over * 2,
    d: top.d + over * 2,
    h: roofRise(type, top.w, top.d, cfg.floorHeight),
    curve: cfg.roofCurve,
    tile: cfg.roofTile,
    tileMaterial: tileMat,
    ridgeMaterial: ridgeMat,
    ornamentMaterial: ornamentMat,
    goldMaterial: gold,
    woodMaterial: wood,
    fasciaMaterial: fascia,
    gableMaterial: gable,
    detail,
    rafters: cfg.roofDetail && detail >= 1,
    hipRidges: cfg.roofDetail && detail >= 1,
    onigawara: cfg.roofDetail,
    thickness: cfg.roofThickness,
    shachihoko: cfg.shachihoko,
    side: '+z',
    drop: type === 'shed' ? Math.min(2.4, Math.min(top.w, top.d) * 0.2) : undefined,
    yTop: type === 'shed' ? 0 : undefined,
  };
  const info = { rooftop: top.y1, type };

  if (type === 'flat') {
    // flat roof + parapet + rooftop kit
    const slab = new THREE.BoxGeometry(top.w + over * 1.2, 0.22, top.d + over * 1.2);
    slab.translate(top.x, top.y1 + 0.11, top.z);
    b.add(b.mat('concrete', { color: colors.plaster }), slab, 'roof_slab');
    const par = 0.5;
    const pmat = b.mat('concrete', { color: colors.plaster });
    for (const [dx, dz, w, d] of [
      [0, top.d / 2 + over * 0.6, top.w + over * 1.2, 0.16],
      [0, -top.d / 2 - over * 0.6, top.w + over * 1.2, 0.16],
      [top.w / 2 + over * 0.6, 0, 0.16, top.d + over * 1.2],
      [-top.w / 2 - over * 0.6, 0, 0.16, top.d + over * 1.2],
    ]) {
      const g = new THREE.BoxGeometry(w, par, d);
      g.translate(top.x + dx, top.y1 + 0.22 + par / 2, top.z + dz);
      b.add(pmat, g, 'parapet');
    }
    // a small tiled cap on the parapet — the "ancient meets modern" tell
    const capMat = b.mat('roofTile', { color: colors.roof });
    for (const [dx, dz, w, d] of [
      [0, top.d / 2 + over * 0.6, top.w + over * 1.4, 0.4],
      [0, -top.d / 2 - over * 0.6, top.w + over * 1.4, 0.4],
      [top.w / 2 + over * 0.6, 0, 0.4, top.d + over * 1.2],
      [-top.w / 2 - over * 0.6, 0, 0.4, top.d + over * 1.2],
    ]) {
      const g = new THREE.BoxGeometry(w, 0.12, d);
      g.translate(top.x + dx, top.y1 + 0.22 + par + 0.06, top.z + dz);
      b.add(capMat, g, 'parapet_cap');
    }
    info.ridgeY = top.y1 + 0.8;
    if (o.modern > 0.5 && cfg.type !== 'konbini') {
      // little pagoda pavilion on the roof for the "ancient-modern" silhouette
      buildRoofStack.pavilion = true;
      const s = Math.min(3.2, top.w * 0.35);
      const pw = s;
      const pd = s * 0.8;
      const ph = 2.0;
      const wallMat = b.mat('plaster', { color: colors.plaster });
      const g = new THREE.BoxGeometry(pw, ph, pd);
      g.translate(top.x, top.y1 + 0.22 + ph / 2, top.z);
      b.add(wallMat, g, 'roof_pavilion');
      for (const face of ['+z', '+x', '-z', '-x']) {
        const [ox, , oz] = faceOrigin({ x: top.x, z: top.z, w: pw, d: pd }, face);
        b.pushPlacement(ox, 0, oz, ROT[face]);
        for (let i = -1; i <= 1; i++) {
          const win = new THREE.BoxGeometry(0.7, 1.0, 0.1);
          win.translate(i * 0.9, top.y1 + 0.22 + 1.15, 0.03);
          b.add(b.mat('glass', { color: '#243038', opacity: 0.5 }), win, 'pavilion_window');
        }
        b.popMatrix();
      }
      buildRoof(b, {
        ...roofCfg,
        x: top.x,
        z: top.z,
        y: top.y1 + 0.22 + ph,
        w: pw + 1.6,
        d: pd + 1.6,
        h: 1.5,
        type: 'pyramid',
        rafters: detail >= 2,
      });
      info.ridgeY = top.y1 + 0.22 + ph + 1.5;
    }
  } else if (type === 'tiered') {
    // Pagoda: every storey of the massing gets its own pyramidal roof, then a sōrin spire.
    let y = 0;
    let topTier = tiers[0];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const over = cfg.roofOverhang * (1.0 + i * 0.05);
      const r = buildRoof(b, {
        ...roofCfg,
        x: t.x,
        z: t.z,
        y: t.y1 - 0.05,
        w: t.w + over * 2,
        d: t.d + over * 2,
        h: Math.max(1.1, t.w * 0.24),
        type: 'pyramid',
        curve: cfg.roofCurve,
        rafters: detail >= 2,
        thickness: cfg.roofThickness,
      });
      info.ridgeY = r.ridgeY;
      y = r.apex.y;
      topTier = t;
      if (detail >= 2) {
        // balustrade around the top of each tier (classic pagoda gallery)
        const railMat = b.mat('wood', { color: colors.accent === colors.wood ? colors.wood : '#5c3226', style: colors.woodStyle });
        const w = t.w + 0.3;
        const d = t.d + 0.3;
        for (const [dx, dz, ww, dd] of [
          [0, d / 2, w, 0.1],
          [0, -d / 2, w, 0.1],
          [w / 2, 0, 0.1, d],
          [-w / 2, 0, 0.1, d],
        ]) {
          const g = new THREE.BoxGeometry(ww, 0.09, dd);
          g.translate(t.x + dx, t.y1 + 0.28, t.z + dz);
          b.add(railMat, g, 'pagoda_rail');
        }
        const n = Math.max(2, Math.round(w / 0.7));
        const bars = [];
        for (let k = 0; k <= n; k++) {
          for (const sz of [-1, 1]) {
            const g = new THREE.BoxGeometry(0.06, 0.34, 0.06);
            g.translate(t.x - w / 2 + (k / n) * w, t.y1 + 0.06, t.z + sz * d / 2);
            bars.push(g);
          }
        }
        const m = mergeList(bars);
        if (m) b.add(railMat, m, 'pagoda_rail_bars');
      }
    }
    // sōrin spire on top
    const spire = b.mat('metal', { color: colors.accent, metalness: 0.7, roughness: 0.4 });
    const sBase = y + 0.1;
    b.cyl(spire, { r: 0.08, h: 3.4, seg: 8 }, [topTier.x, sBase + 1.7, topTier.z]);
    for (let i = 0; i < 9; i++) {
      const rr = 0.36 - i * 0.028;
      const g = new THREE.TorusGeometry(rr, 0.035, 5, 14);
      g.rotateX(Math.PI / 2);
      g.translate(topTier.x, sBase + 0.5 + i * 0.27, topTier.z);
      b.add(spire, g, 'sorin_ring');
    }
    const jewel = new THREE.SphereGeometry(0.19, 10, 8);
    jewel.translate(topTier.x, sBase + 3.5, topTier.z);
    b.add(b.mat('metal', { color: '#e8c96a', metalness: 0.9, roughness: 0.25 }), jewel, 'sorin_jewel');
    info.ridgeY = sBase + 3.7;
  } else {
    const r = buildRoof(b, { ...roofCfg, x: top.x, z: top.z, y: top.y1 });
    info.ridgeY = r.ridgeY;
    info.roofInfo = r;
  }
  return info;
}

/* ------------------------------------------------------------------ */
/* Modern kit + rooftop                                                */
/* ------------------------------------------------------------------ */

function buildModernKit(b, cfg, colors, tiers, rng, o) {
  const top = tiers[tiers.length - 1];
  const detail = o.detail;
  const mix = o.modern;
  if (cfg.type === 'temple' || cfg.type === 'shrine' || cfg.type === 'pagoda') return;
  // "roof deck" reference: flat roofs put kit on the slab, pitched roofs only get
  // a ridge-mounted antenna (everything else would float inside the roof volume).
  const pitched = o.roofInfo?.type && o.roofInfo.type !== 'flat';
  const deckY = pitched ? o.roofInfo.ridgeY ?? top.y1 : top.y1 + 0.35;

  if (cfg.waterTank && mix > 0.3 && !pitched) {
    P.propWaterTank(b, colors, [top.x + top.w * 0.22, top.y1 + 0.35, top.z - top.d * 0.2], { radius: 0.7, height: 1.4 });
  }
  if (cfg.antenna && mix > 0.3) {
    if (pitched) {
      P.propAntenna(b, colors, [top.x + top.w * 0.22, deckY - 0.15, top.z], { height: 2.3, elements: 4, dish: false, rotY: 0.5 });
    } else {
      P.propAntenna(b, colors, [top.x - top.w * 0.28, deckY + 0.05, top.z - top.d * 0.28], { height: 2.6, elements: 5, dish: mix > 0.7 });
    }
  }
  if (cfg.solar && mix > 0.4 && !pitched) {
    const n = Math.max(2, Math.floor(top.w / 1.8));
    for (let i = 0; i < n; i++) {
      P.propSolar(b, colors, [top.x - top.w * 0.35 + i * 1.7, top.y1 + 0.5, top.z + top.d * 0.15], { width: 1.5, height: 1.0 });
    }
  }
  if (cfg.roofRail && mix > 0.4 && !pitched) {
    const metal = b.mat('metal', { color: colors.metal });
    const h = 1.1;
    for (const [dx, dz, w, d] of [
      [0, top.d / 2, top.w, 0.06],
      [0, -top.d / 2, top.w, 0.06],
      [top.w / 2, 0, 0.06, top.d],
      [-top.w / 2, 0, 0.06, top.d],
    ]) {
      const g = new THREE.BoxGeometry(w, 0.06, d);
      g.translate(top.x + dx, top.y1 + h, top.z + dz);
      b.add(metal, g, 'roof_rail_top');
    }
  }
  // AC units on the roof, tucked behind the parapet
  if (cfg.acUnits && mix > 0.35 && detail >= 1 && !pitched) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      P.propACUnit(
        b,
        colors,
        [top.x + rng.float(-top.w * 0.3, top.w * 0.3), top.y1 + 0.3, top.z + rng.float(-top.d * 0.3, top.d * 0.3)],
        rng.float(0, Math.PI * 2),
        { width: 1.1, height: 0.8, depth: 0.45, pipe: false }
      );
    }
  }
  // downpipes along the corners
  if (cfg.downpipes && detail >= 1) {
    for (const sx of [-1, 1]) {
      P.propDownpipe(b, colors, [tiers[0].x + sx * (tiers[0].w / 2 - 0.1), 0, tiers[0].z + tiers[0].d / 2 - 0.15], {
        height: tiers[tiers.length - 1].y1,
      });
    }
  }
  // rooftop neon sign frame
  if (cfg.neon && mix > 0.4 && cfg.lightsEnabled && top.w > 5 && !pitched) {
    const frameMat = b.mat('darkMetal', { color: '#2b2f34' });
    const y = top.y1 + 0.4;
    const post = new THREE.BoxGeometry(0.12, 2.2, 0.12);
    post.translate(top.x - top.w * 0.3, y + 1.5, top.z - top.d / 2 + 0.3);
    b.add(frameMat, post, 'roofsign_post');
    const post2 = post.clone();
    post2.translate(top.w * 0.6, 0, 0);
    b.add(frameMat, post2, 'roofsign_post');
    const backing = new THREE.BoxGeometry(top.w * 0.66, 1.62, 0.1);
    backing.translate(top.x + top.w * 0.02, y + 2.6, top.z - top.d / 2 + 0.26);
    b.add(b.mat('darkMetal', { color: '#22262b' }), backing, 'roof_neon_backing');
    const board = new THREE.BoxGeometry(top.w * 0.62, 1.5, 0.16);
    board.translate(top.x + top.w * 0.02, y + 2.6, top.z - top.d / 2 + 0.32);
    b.add(
      b.mat('neon', {
        color: '#ffffff',
        map: TT.neonTexture({ text: cfg.signs.neon || '営業中', color: colors.neon[0], w: 768, h: 256 }),
        emissive: true,
        emissiveColor: colors.neon[0],
        emissiveIntensity: 1.3,
        transparent: true,
      }),
      board,
      'roof_neon'
    );
    o.lights.push({ kind: 'point', pos: [top.x, y + 2.6, top.z - top.d / 2 + 0.8], color: colors.neon[0], intensity: 8, distance: 12 });
  }
}

/* ------------------------------------------------------------------ */
/* Signage                                                             */
/* ------------------------------------------------------------------ */

function buildSignage(b, cfg, colors, tiers, content, rng, o) {
  const detail = o.detail;
  const base = tiers[0];
  const wood = b.mat('wood', { color: colors.trim, style: colors.woodStyle });
  const metal = b.mat('metal', { color: colors.metal });

  // --- vertical banner (nobori) on a pole by the entrance ---
  if (cfg.banners && cfg.type !== 'temple') {
    const x = base.x + base.w / 2 + 0.7;
    P.propBanner(b, colors, [x, 0, base.z + base.d / 2 + 0.9], {
      height: 3.4,
      text: content.banner,
      bg: colors.awningB,
      accent: colors.accent,
      rotY: -0.2,
    });
  }
  // --- A-board by the entrance ---
  if (cfg.seating || cfg.type === 'ramen' || cfg.type === 'shop' || cfg.type === 'machiya') {
    P.propABoard(b, colors, [base.x - base.w / 2 - 0.5, 0, base.z + base.d / 2 + 1.1], 0.35, {
      title: content.aboard || content.name,
      lines: content.posterBody.slice(0, 4),
      accent: colors.accent,
      bg: '#f4f1e6',
      frameColor: colors.trim,
    });
  }
  // --- menu / notice boards on the wall ---
  if (cfg.menuBoard && cfg.type !== 'temple') {
    for (let i = 0; i < Math.max(1, Math.round(cfg.posterCount / 2)); i++) {
      const x = base.x - base.w / 2 + 1.6 + i * 2.4;
      if (Math.abs(x - base.x) < 1.2) continue;
      const g = new THREE.BoxGeometry(1.1, 1.5, 0.1);
      g.translate(x, base.y0 + cfg.floorHeight * 0.62, base.z + base.d / 2 + 0.1);
      b.add(
        b.mat('menu', { color: '#ffffff', map: TT.menuTexture({ title: content.menu, items: content.menuItems }) }),
        g,
        'menu_board'
      );
      const frame = new THREE.BoxGeometry(1.24, 1.64, 0.06);
      frame.translate(x, base.y0 + cfg.floorHeight * 0.62, base.z + base.d / 2 + 0.06);
      b.add(wood, frame, 'menu_frame');
    }
  }
  // --- posters (walls, poles, under the awning) ---
  const posterCount = Math.max(0, Math.min(8, cfg.posterCount));
  for (let i = 0; i < posterCount; i++) {
    const pick = content.posterPick;
    const tex = TT.posterTexture({
      title: content.posterTitle,
      lines: content.posterBody,
      accent: colors.accent,
      bg: '#f4f1e6',
      style: rng.bool(0.4) ? 'photo' : 'plain',
      seed: rng.int(0, 99),
    });
    const w = rng.float(0.5, 0.85);
    const h = w * 1.35;
    const face = rng.weighted([
      { value: '+z', weight: 4 },
      { value: '+x', weight: 2 },
      { value: '-z', weight: 1 },
    ]);
    const tier = rng.pick(tiers);
    const [ox, , oz] = faceOrigin(tier, face);
    const rotY = ROT[face];
    const half = faceHalf(tier, face);
    const u = rng.float(-half + 0.7, half - 0.7);
    const y = rng.float(tier.y0 + 1.0, tier.y1 - 0.8);
    b.pushPlacement(ox, 0, oz, rotY);
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(u, y, 0.03);
    b.add(b.mat('poster', { color: '#ffffff', map: tex }), g, 'poster');
    if (detail >= 2 && rng.bool(0.5)) {
      const tape = new THREE.PlaneGeometry(w * 0.3, 0.06);
      tape.translate(u, y + h / 2 - 0.03, 0.05);
      b.add(b.mat('paper', { color: '#e8e4d8', opacity: 0.8, transparent: true }), tape, 'poster_tape');
    }
    b.popMatrix();
    void pick;
  }
  // --- hanging neon sign over the entrance (the modern layer) ---
  if (cfg.neon && cfg.lightsEnabled && cfg.type !== 'temple') {
    const nx = base.x + base.w * 0.3;
    const tex = TT.neonTexture({ text: content.neon, color: colors.neon[1] || colors.neon[0], w: 512, h: 128 });
    const backing2 = new THREE.BoxGeometry(1.7, 0.52, 0.06);
    backing2.translate(nx, base.y0 + cfg.floorHeight * 0.98, base.z + base.d / 2 + 0.31);
    b.add(b.mat('darkMetal', { color: '#1e2226' }), backing2, 'neon_backing');
    const g = new THREE.BoxGeometry(1.6, 0.45, 0.08);
    g.translate(nx, base.y0 + cfg.floorHeight * 0.98, base.z + base.d / 2 + 0.37);
    b.add(
      b.mat('neon', {
        color: '#ffffff',
        map: tex,
        emissive: true,
        emissiveColor: colors.neon[1] || colors.neon[0],
        emissiveIntensity: 1.5,
        transparent: true,
      }),
      g,
      'neon_sign'
    );
    o.lights.push({ kind: 'point', pos: [nx, base.y0 + cfg.floorHeight, base.z + base.d / 2 + 0.6], color: colors.neon[1] || colors.neon[0], intensity: 5, distance: 8 });
  }
  // --- lantern string across the front (matsuri / izakaya) ---
  if (cfg.lanterns && cfg.type !== 'temple' && cfg.lightsEnabled && detail >= 1 && base.w > 5) {
    const y = base.y0 + cfg.floorHeight * 1.02;
    P.propLanternString(
      b,
      colors,
      [base.x - base.w / 2 - 0.6, y, base.z + base.d / 2 + 1.0],
      [base.x + base.w / 2 + 0.6, y, base.z + base.d / 2 + 1.0],
      { count: Math.max(3, Math.round(base.w / 1.6)), color: '#d8362f', texts: [content.lantern], radius: 0.13, height: 0.4, sag: 0.3 }
    );
  }
  // --- tanzaku (wish slips) for shrine / festival ---
  if (cfg.tanzaku) {
    P.propTanzaku(
      b,
      colors,
      [base.x - base.w * 0.4, base.y0 + cfg.floorHeight * 0.9, base.z + base.d / 2 + 1.1],
      [base.x + base.w * 0.4, base.y0 + cfg.floorHeight * 0.9, base.z + base.d / 2 + 1.1],
      { count: 12, rng }
    );
  }
  void metal;
}

/* ------------------------------------------------------------------ */
/* Site: ground, poles, wires, street furniture                        */
/* ------------------------------------------------------------------ */

function buildGround(b, cfg, colors, tiers, rng) {
  const base = tiers[0];
  const pad = 3.2;
  const w = base.w + pad * 2;
  const d = base.d + pad * 2;
  const earth = b.mat('earth', { color: '#7d7566' });
  const g = new THREE.BoxGeometry(w, 0.2, d);
  g.translate(base.x, -0.1, base.z + 0.4);
  b.add(earth, g, 'ground');
  if (cfg.groundStyle === 'street') {
    const conc = b.mat('concrete', { color: '#b9b6ae' });
    const side = new THREE.BoxGeometry(base.w + pad * 1.6, 0.16, 2.6);
    side.translate(base.x, 0.04, base.z + base.d / 2 + 1.5);
    b.add(conc, side, 'sidewalk');
    // curb
    const curb = new THREE.BoxGeometry(base.w + pad * 1.6, 0.22, 0.3);
    curb.translate(base.x, 0.08, base.z + base.d / 2 + 2.9);
    b.add(b.mat('stone', { color: '#c4c0b6' }), curb, 'curb');
    // road
    const road = new THREE.BoxGeometry(base.w + pad * 3.4, 0.12, 7);
    road.translate(base.x, 0.0, base.z + base.d / 2 + 6.6);
    b.add(b.mat('asphalt', { color: '#54565a' }), road, 'road');
    // drain grate + gutter line
    if (cfg.detail >= 2) {
      const grate = new THREE.BoxGeometry(0.5, 0.06, 0.9);
      grate.translate(base.x + base.w * 0.4, 0.13, base.z + base.d / 2 + 2.5);
      b.add(b.mat('darkMetal', { color: '#4a4d52' }), grate, 'drain');
    }
  }
  return { w, d };
}

function buildSite(b, cfg, colors, tiers, rng, o) {
  const base = tiers[0];
  const detail = o.detail;
  const mix = o.modern;
  const front = base.z + base.d / 2;
  const side = cfg.poleSide === 'right' ? 1 : -1;

  // ---- utility pole ----
  let poleTop = null;
  if (cfg.pole) {
    const px = base.x + side * (base.w / 2 + 1.15);
    const pz = front + 1.7;
    const h = Math.min(13, Math.max(7.5, o.totalH + 3.5));
    const res = P.utilityPole(b, colors, [px, 0, pz], {
      height: h,
      arms: detail >= 2 ? 3 : 2,
      transformers: cfg.transformers ? (detail >= 2 ? 2 : 1) : 0,
      lamp: cfg.streetLamp,
      posters: detail >= 1,
      rotY: rng.float(-0.08, 0.08),
    });
    poleTop = res.top;
    if (cfg.streetLamp) {
      o.lights.push({
        kind: 'point',
        pos: [px + side * 0.1, h - 2.0, pz + 1.1],
        color: cfg.lightStyle === 'neon' ? '#ffd0e0' : '#ffd79a',
        intensity: 22 * cfg.lightIntensity,
        distance: 22,
        castShadow: false,
      });
    }
  }

  // ---- wires ----
  if (cfg.pole && poleTop) {
    const anchorY = Math.min(tiers[tiers.length - 1].y1 + 0.4, poleTop[1] - 1.2);
    const bx = base.x + side * (base.w / 2 - 0.2);
    if (cfg.powerLines) {
      P.propWires(
        b,
        colors,
        [poleTop[0], poleTop[1] - 0.5, poleTop[2]],
        [bx, anchorY, front + 0.25],
        { count: 4, spread: 0.3, rng, radius: 0.026 }
      );
      // service drop into the building
      P.propWires(b, colors, [bx, anchorY, front + 0.2], [base.x + side * 0.4, base.y0 + cfg.floorHeight * 0.85, front + 0.1], {
        count: 2,
        spread: 0.14,
        rng,
        radius: 0.02,
        sag: 0.6,
      });
    }
    if (cfg.phoneLine) {
      P.propWires(b, colors, [poleTop[0], poleTop[1] - 2.2, poleTop[2]], [bx, anchorY - 1.5, front + 0.22], {
        count: 2,
        spread: 0.1,
        rng,
        radius: 0.014,
        sag: 0.5,
      });
    }
    if (cfg.wireToSides) {
      for (const s of [-1, 1]) {
        P.propWires(
          b,
          colors,
          [poleTop[0], poleTop[1] - 1.0, poleTop[2]],
          [poleTop[0] + s * (base.w + 9), poleTop[1] - 1.9, poleTop[2] + 0.4],
          { count: 3, spread: 0.26, radius: 0.024, sag: 1.6 }
        );
      }
    }
  } else if (cfg.powerLines) {
    // no pole but still wired: drop lines from the eaves
    const y = tiers[tiers.length - 1].y1 + 0.3;
    P.propWires(b, colors, [base.x + base.w / 2 + 6, y + 0.4, front + 1.2], [base.x + base.w / 2, y, front + 0.2], {
      count: 3,
      spread: 0.24,
      rng,
      sag: 0.9,
    });
  }

  // ---- street furniture along the sidewalk ----
  const slotX = [];
  const usable = base.w - 1.2;
  const slot = (i, n) => base.x - usable / 2 + (usable * (i + 0.5)) / n;
  const nSlots = Math.max(2, Math.round(usable / 1.6));
  for (let i = 0; i < nSlots; i++) slotX.push(slot(i, nSlots));
  const doorX = base.x;
  const free = slotX.filter((x) => Math.abs(x - doorX) > 1.5);

  if (cfg.vending && free.length) {
    const x = free[free.length - 1] ?? slotX[slotX.length - 1];
    const res = P.propVending(b, colors, [x, 0, front + 0.42], 0, {
      brand: rng.bool(0.5) ? 'ドリンク' : 'つめたい',
      accent: rng.bool(0.5) ? '#c8202a' : '#2456a8',
    });
    if (res && cfg.lightsEnabled && cfg.realLights) o.lights.push({ ...res.light, intensity: 3 * cfg.lightIntensity });
  }
  if (cfg.crates && free.length) {
    const x = free[0] ?? slotX[0];
    P.propCrates(b, colors, [x, 0, front + 0.7], rng.float(-0.3, 0.3), { rows: rng.int(2, 4), rng });
    P.propBarrel(b, colors, [x - 0.9, 0, front + 0.75], 0, { sake: rng.bool(0.4), radius: 0.28 });
  }
  if (cfg.plants) {
    const plantXs = free.filter((_, idx) => idx % 2 === 0).slice(0, 3);
    for (const x of plantXs) {
      P.propPottedPlant(b, colors, [x, 0, front + 0.45], {
        rng,
        potRadius: rng.float(0.18, 0.26),
        height: rng.float(0.7, 1.2),
        kind: rng.weighted([{ value: 'pine', weight: 2 }, { value: 'shrub', weight: 2 }, { value: 'bamboo', weight: 1 }]),
        leafColor: rng.bool(0.5) ? '#2f5c3a' : '#4a7a3a',
      });
    }
  }
  if (cfg.seating) {
    for (let i = 0; i < 2; i++) {
      const x = base.x + (i === 0 ? -1 : 1) * (base.w / 2 + 1.4);
      P.propTable(b, colors, [x, 0, front + 1.5], { height: 0.72, radius: 0.4 });
      P.propStool(b, colors, [x - 0.6, 0, front + 1.5], { rotY: 0.4 });
      P.propStool(b, colors, [x + 0.6, 0, front + 1.5], { rotY: -0.4 });
      if (cfg.parasol && rng.bool(0.7)) {
        P.propParasol(b, colors, [x, 0, front + 1.5], { height: 2.3, radius: 1.5, a: colors.awningA, b: colors.awningB });
      }
    }
  }
  if (cfg.bicycles && free.length > 1) {
    for (let i = 0; i < 2; i++) {
      const x = free[Math.floor(free.length * 0.4) + i] ?? free[0];
      P.propBicycle(b, colors, [x - 0.4, 0, front + 1.9], Math.PI * 0.5 + rng.float(-0.1, 0.1), { detail, rng });
    }
  }
  if (cfg.mailbox) P.propMailbox(b, colors, [base.x + base.w / 2 + 0.5, 0, front + 1.2], -0.3);
  if (cfg.fireBox) P.propFireBox(b, colors, [base.x - base.w / 2 - 0.25, 0, front + 0.16], 0);
  if (cfg.acUnits && mix > 0.3 && detail >= 1) {
    P.propACUnit(b, colors, [base.x + base.w * 0.3, 0.15, front + 0.42], 0, { width: 0.9, height: 0.62, depth: 0.34 });
  }
  // gas cylinders + crates behind the building for the lived-in look
  if (detail >= 1 && cfg.crates) {
    P.propCylinder(b, colors, [base.x - base.w * 0.3, 0, base.z - base.d / 2 - 0.8], 0, { hose: true, cage: rng.bool(0.4) });
  }
  if (cfg.plants && detail >= 2) {
    P.propBambooGrove(b, colors, [base.x + base.w * 0.35, 0, base.z - base.d / 2 - 1.1], { count: 5, height: 4.2, rng });
  }
}

/* ------------------------------------------------------------------ */
/* Boundary / gate                                                     */
/* ------------------------------------------------------------------ */

function buildBoundary(b, cfg, colors, tiers, rng, o) {
  const base = tiers[0];
  const detail = o.detail;
  if (cfg.torii) {
    P.propTorii(b, colors, [base.x, 0, base.z + base.d / 2 + 4.6], {
      width: Math.max(4.2, base.w * 0.7),
      height: 4.6,
      color: colors.type === 'shrine' ? '#b4342a' : colors.accent,
      text: '神社',
    });
  }
  if (cfg.boundaryWall) {
    const inset = 1.1;
    const hw = base.w / 2 + inset;
    const hd = base.d / 2 + inset;
    const corners = [
      [base.x - hw, 0, base.z + hd],
      [base.x + hw, 0, base.z + hd],
      [base.x + hw, 0, base.z - hd],
      [base.x - hw, 0, base.z - hd],
    ];
    const plaster = cfg.type === 'house' || cfg.type === 'temple';
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const bb2 = corners[(i + 1) % 4];
      if (i === 0) {
        // leave a gate gap in the front wall
        const mid = [(a[0] + bb2[0]) / 2, 0, (a[2] + bb2[2]) / 2];
        const gap = 1.5;
        P.propBoundaryWall(b, colors, [a[0] + gap, 0, a[2]], [mid[0] - gap * 0.4, 0, mid[2]], { height: 1.6, plaster, pillars: detail >= 2 });
        P.propBoundaryWall(b, colors, [mid[0] + gap * 0.6, 0, mid[2]], [bb2[0], 0, bb2[2]], { height: 1.6, plaster, pillars: detail >= 2 });
      } else {
        P.propBoundaryWall(b, colors, [a[0], a[1]], [bb2[0], bb2[1]], { height: 1.6, plaster, pillars: detail >= 2 });
      }
    }
    if (cfg.plants) {
      P.propTree(b, colors, [base.x - hw + 0.9, 0, base.z + hd - 1.2], { height: 4.4, spread: 1.5, kind: 'pine', rng });
    }
  } else if (cfg.type === 'house' && cfg.plants) {
    P.propTree(b, colors, [base.x + base.w / 2 + 1.6, 0, base.z + base.d / 2 - 1.4], { height: 4.2, spread: 1.4, kind: 'pine', rng });
  }
}

export { resolveColors, planTiers, roofTypeFor };
