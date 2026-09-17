// Central material factory. Every material is cached by role + parameters so a
// whole street of buildings shares a handful of GPU materials (and the GLB stays small).
import * as THREE from 'three';
import * as T from './textures.js';

const ROLE_DEFAULTS = {
  wood: { roughness: 0.72, metalness: 0.0, tex: 'wood' },
  bamboo: { roughness: 0.6, metalness: 0.0, tex: 'wood' },
  plaster: { roughness: 0.94, metalness: 0.0, tex: 'plaster' },
  stone: { roughness: 0.9, metalness: 0.0, tex: 'stone' },
  concrete: { roughness: 0.86, metalness: 0.02, tex: 'concrete' },
  brick: { roughness: 0.88, metalness: 0.0, tex: 'stone' },
  roofTile: { roughness: 0.45, metalness: 0.12, tex: 'tile' },
  roofUnder: { roughness: 0.85, metalness: 0.0, tex: 'roofUnder' },
  thatch: { roughness: 0.98, metalness: 0.0, tex: 'thatch' },
  metal: { roughness: 0.42, metalness: 0.85, tex: 'metal' },
  darkMetal: { roughness: 0.5, metalness: 0.7, tex: 'metal' },
  wetMetal: { roughness: 0.28, metalness: 0.9, tex: 'metal' },
  ceramic: { roughness: 0.35, metalness: 0.05, tex: 'tile' },
  plastic: { roughness: 0.55, metalness: 0.0, tex: null },
  paint: { roughness: 0.6, metalness: 0.05, tex: null },
  paper: { roughness: 1.0, metalness: 0.0, tex: 'paper' },
  cloth: { roughness: 1.0, metalness: 0.0, tex: 'cloth' },
  glass: { roughness: 0.12, metalness: 0.1, tex: null, transparent: true, opacity: 0.34 },
  rubber: { roughness: 0.95, metalness: 0.0, tex: null },
  earth: { roughness: 1.0, metalness: 0.0, tex: 'earth' },
  asphalt: { roughness: 0.95, metalness: 0.0, tex: 'asphalt' },
  foliage: { roughness: 0.9, metalness: 0.0, tex: null, emissiveIntensity: 0.15 },
  lamp: { roughness: 0.5, metalness: 0.0, tex: null, emissive: true },
  neon: { roughness: 0.4, metalness: 0.0, tex: 'neon', emissive: true },
  signBoard: { roughness: 0.68, metalness: 0.0, tex: 'sign' },
  poster: { roughness: 0.92, metalness: 0.0, tex: 'poster' },
  menu: { roughness: 0.92, metalness: 0.0, tex: 'menu' },
  vending: { roughness: 0.5, metalness: 0.1, tex: 'vending' },
  banner: { roughness: 1.0, metalness: 0.0, tex: 'banner', side: THREE.DoubleSide },
  noren: { roughness: 1.0, metalness: 0.0, tex: 'noren', side: THREE.DoubleSide },
  lantern: { roughness: 0.85, metalness: 0.0, tex: 'lantern' },
  stripe: { roughness: 0.95, metalness: 0.0, tex: 'stripe', side: THREE.DoubleSide },
};

function signature(role, o) {
  const keys = Object.keys(o).sort();
  let s = role;
  for (const k of keys) s += `|${k}=${o[k]}`;
  return s;
}

export class MaterialLibrary {
  constructor() {
    this.cache = new Map();
    this.texturesEnabled = true;
  }

  setTexturesEnabled(v) {
    this.texturesEnabled = v;
  }

  /**
   * @param {string} role one of ROLE_DEFAULTS
   * @param {object} o { color, map, emissive, emissiveIntensity, opacity, side, roughness, metalness, name }
   */
  get(role, o = {}) {
    const key = signature(role, o);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.paint;
    const params = {
      name: o.name || role,
      roughness: o.roughness ?? def.roughness,
      metalness: o.metalness ?? def.metalness,
      side: o.side ?? def.side ?? THREE.FrontSide,
      transparent: o.transparent ?? def.transparent ?? false,
      opacity: o.opacity ?? def.opacity ?? 1,
      flatShading: o.flatShading ?? false,
    };
    if (o.color !== undefined) params.color = new THREE.Color(o.color);
    const tex = this._texture(def.tex, o, role);
    if (tex) params.map = tex.map;
    if (tex && tex.emissiveMap) params.emissiveMap = tex.emissiveMap;
    if (o.emissive || def.emissive) {
      params.emissive = new THREE.Color(o.emissiveColor || o.color || '#ffffff');
      params.emissiveIntensity = o.emissiveIntensity ?? 1;
      if (def.emissive && !o.emissiveColor && o.color) params.emissive = new THREE.Color(o.color);
    }
    if (o.emissiveIntensity !== undefined && !params.emissive) {
      params.emissive = new THREE.Color(o.emissiveColor || '#000000');
      params.emissiveIntensity = o.emissiveIntensity;
    }
    const mat = new THREE.MeshStandardMaterial(params);
    mat.userData.role = role;
    this.cache.set(key, mat);
    return mat;
  }

  _texture(kind, o, role) {
    if (!this.texturesEnabled || !kind) return null;
    switch (kind) {
      case 'wood':
        return { map: T.woodTexture(o.style || 'cedar') };
      case 'plaster':
        return { map: T.plasterTexture() };
      case 'stone':
        return { map: T.stoneTexture(o.style || 'stone') };
      case 'concrete':
        return { map: T.concreteTexture() };
      case 'tile':
        return { map: role === 'ceramic' ? T.tileTexture() : T.tileTexture() };
      case 'roofUnder':
        return { map: T.roofUnderTexture() };
      case 'thatch':
        return { map: T.thatchTexture() };
      case 'metal':
        return { map: T.metalTexture() };
      case 'paper':
        return { map: T.paperTexture() };
      case 'earth':
        return { map: T.earthTexture() };
      case 'asphalt':
        return { map: T.asphaltTexture() };
      case 'cloth':
        return o.color ? { map: T.clothTexture(o.color) } : null;
      case 'sign':
        return o.map ? { map: o.map } : null;
      case 'poster':
        return o.map ? { map: o.map } : null;
      case 'menu':
        return o.map ? { map: o.map } : null;
      case 'vending':
        return o.map ? { map: o.map } : null;
      case 'banner':
        return o.map ? { map: o.map } : null;
      case 'noren':
        return o.map ? { map: o.map } : null;
      case 'lantern':
        return o.map ? { map: o.map } : null;
      case 'neon':
        return o.map ? { map: o.map } : null;
      case 'lamp':
        return o.map ? { map: o.map } : null;
      case 'stripe':
        return o.map ? { map: o.map } : null;
      default:
        return null;
    }
  }

  /** Convenience: wood with a specific style + colour. */
  wood(color, style) {
    return this.get('wood', { color, style: style || 'cedar' });
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

/** Named material role -> which UI colour knob drives it. Used for the "paint" info. */
export const ROLE_LABELS = {
  wood: 'Timber',
  bamboo: 'Bamboo',
  plaster: 'Plaster / stucco',
  stone: 'Stone',
  concrete: 'Concrete',
  roofTile: 'Roof tile',
  roofUnder: 'Roof underside',
  thatch: 'Thatch',
  metal: 'Metal',
  darkMetal: 'Dark metal',
  ceramic: 'Ceramic trim',
  plastic: 'Plastic',
  paint: 'Paint',
  paper: 'Paper',
  glass: 'Glass',
  cloth: 'Cloth',
  rubber: 'Rubber / cable',
  foliage: 'Foliage',
  lamp: 'Lamp glow',
  neon: 'Neon',
  signBoard: 'Sign board',
  poster: 'Poster',
  menu: 'Menu board',
  vending: 'Vending machine',
  banner: 'Banner',
  noren: 'Noren',
  lantern: 'Lantern',
  earth: 'Ground',
  asphalt: 'Asphalt',
};

export default MaterialLibrary;
