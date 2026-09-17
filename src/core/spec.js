/**
 * Frontier — building/roof spec
 * -----------------------------
 * Phase 1 covers the ROOF. Every switch the brief asked for is a first-class field:
 * form (which Asian roof), pitch, tiles, curvature, wood colour, lights, ridge ends,
 * and a boolean per construction layer.
 */

export const DEFAULT_SPEC = {
  seed: 12345,
  form: 'irimoya',

  footprint: { width: 7.2, depth: 5.4, wallHeight: 3.2 },
  overhang: {
    eave: 1.30,       // 軒の出 — beyond the wall line, on the sloping (eave) sides
    gable: 1.00,      // 破風の出 — beyond the gable wall, on the ridge ends
    rear: 1.30,       // only used by asymmetric forms (nagare-zukuri)
    gableInset: 0,    // push the gable (tsuma) plane inside the wall
  },
  baseHeight: 3.2,    // height of the eave line at mid-span

  pitch: {
    sun: 5,           // Japanese 寸: rise per 10 run (4寸 = 21.8°, 6寸 = 31°)
    mode: 'rear',     // for asymmetric forms which side sets the ridge height
  },

  curvature: {
    rule: 'teri',     // 'teri' (JP 照り) | 'juzhe' (CN 举折) | 'korean' | 'linear'
    purlins: 5,       // number of purlin bays (举折 purlin count − 1)
    smooth: true,     // blend the faceted polyline toward a smooth curve
    ease: 0.55,       // strength of the eave easing
    corner: {         // 冲三翘四 / 反り
      enabled: true,
      chongFactor: 3, // 冲出: horizontal projection, in rafter diameters
      qiaoFactor: 4,  // 起翘: vertical lift at the corner, in rafter diameters
      rafterDiam: 0.10,
      run: 2.4,       // how far along the eave the sweep extends
    },
  },

  tiles: {
    id: 'sangawara_60',
    align: 'center',          // 瓦割り set out from the ridge centre line
    snowStops: false,
    snowStopEvery: 3,
  },

  frame: {
    rafter: { spacing: 0.455, width: 0.045, depth: 0.06, exposed: true },
    battens: { enabled: true, height: 0.030, thickness: 0.015 },
    deck: { enabled: true, thickness: 0.015 },
    underlayment: { enabled: true, thickness: 0.002 },
    purlin: { enabled: true, size: [0.105, 0.105], show: true },
    ridgeBeam: { enabled: true, size: [0.15, 0.18] },
    hipRafter: { enabled: true, size: [0.13, 0.15] },
    eaveBeam: { enabled: true, size: [0.12, 0.12] },
    tieBeam: { enabled: true, size: [0.15, 0.18], spacing: 1.82 },
    post: { enabled: true, size: [0.12, 0.12], toGround: true },
  },

  ridge: {
    style: 'kangawara',       // 'kangawara' (熨瓦+冠瓦) | 'flat'
    layers: 3,
    layerHeight: 0.052,
    thickness: 0.34,
    capRadius: 0.13,
    hipCapRadius: 0.105,
    hipLayers: 2,
    end: 'onigawara',         // 'onigawara' | 'shibi' | 'shachihoko' | 'none'
    endExtension: 0.02,
    ornament: 'none',         // 'none' | 'chigi' (千木) | 'katsuogi' (鰹木)
  },

  eave: {
    hikomaHeight: 0.040,      // 広小舞 (simplified 茅負)
    hikomaThickness: 0.018,
    tileProjection: 0.060,    // 瓦の出 — tile nose past the board
    fasciaDepth: 0.22,        // 破風 bargeboard
    fasciaThickness: 0.03,
    gegyo: false,             // 懸魚 pendant at the gable apex
  },

  lights: {
    eaveLanterns: { enabled: false, spacing: 2.4, radius: 0.11, height: 0.28, drop: 0.35, cornersOnly: false },
  },

  // booleans — each one is a real construction layer
  show: {
    tiles: true, ridge: true, hipRidge: true, verge: true, battens: true,
    underlayment: true, deck: true, rafters: true, hipRafters: true,
    purlins: true, ridgeBeam: true, frame: true, eaveBoard: true,
    bargeboard: true, lanterns: false, volume: true,
  },

  palette: {
    tile: '#4d5259',          // いぶし ibushi grey
    tileGlaze: '#1b2733',     // 釉薬 glazed
    tileEave: '#c9c3b6',
    ridge: '#454a52',
    onigawara: '#3d4148',
    wood: '#a8763f',
    woodDark: '#6b4a2a',
    underlayment: '#2a2f36',
    deck: '#8d6a45',
    metal: '#2f3339',
    glow: '#ffb469',
    volume: '#cbb9a0',
  },
  finish: { glazed: false, weathered: 0.35, roughness: 0.72, metalness: 0.04 },
};

/** Shallow-merge a user spec into the defaults (nested objects merge one level). */
export function mergeSpec(user = {}) {
  const out = structuredClone(DEFAULT_SPEC);
  const merge = (dst, src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
        merge(dst[k], v);
      } else if (v !== undefined) dst[k] = v;
    }
  };
  merge(out, user);
  return out;
}

/** Cultural / building-type presets. Values come from docs/ROOF_RESEARCH.md §6. */
export const PRESETS = {
  minka: {
    label: 'Minka 民家 — hip-and-gable farmhouse',
    spec: {
      form: 'irimoya', footprint: { width: 8.4, depth: 6.0, wallHeight: 3.0 },
      overhang: { eave: 1.5, gable: 1.15 }, baseHeight: 3.0,
      pitch: { sun: 5 },
      curvature: { rule: 'teri', purlins: 5, ease: 0.55, corner: { enabled: true, chongFactor: 2, qiaoFactor: 2.4, rafterDiam: 0.1, run: 2.0 } },
      tiles: { id: 'sangawara_60' },
      ridge: { end: 'onigawara', ornament: 'none', layers: 3 },
      palette: { tile: '#4a4f55', wood: '#a8763f' },
    },
  },
  machiya: {
    label: 'Machiya 町家 — narrow townhouse',
    spec: {
      form: 'kirizuma', footprint: { width: 4.2, depth: 9.0, wallHeight: 3.4 },
      overhang: { eave: 0.95, gable: 0.6 }, baseHeight: 3.4,
      pitch: { sun: 5.5 },
      curvature: { rule: 'teri', purlins: 4, ease: 0.5, corner: { enabled: true, chongFactor: 1.5, qiaoFactor: 2, rafterDiam: 0.09, run: 1.4 } },
      tiles: { id: 'sangawara_300' },
      ridge: { end: 'onigawara', layers: 3, thickness: 0.3 },
      lights: { eaveLanterns: { enabled: true, spacing: 2.2 } },
    },
  },
  temple: {
    label: 'Temple 本堂 — 入母屋 + 本瓦葺',
    spec: {
      form: 'irimoya', footprint: { width: 12.6, depth: 9.0, wallHeight: 4.6 },
      overhang: { eave: 2.1, gable: 1.5 }, baseHeight: 4.6,
      pitch: { sun: 6.5 },
      curvature: { rule: 'teri', purlins: 6, ease: 0.62, corner: { enabled: true, chongFactor: 2.6, qiaoFactor: 3, rafterDiam: 0.11, run: 3.0 } },
      tiles: { id: 'hongawara' },
      frame: { rafter: { spacing: 0.303, width: 0.045, depth: 0.06 }, purlin: { size: [0.12, 0.12] } },
      ridge: { end: 'onigawara', layers: 4, thickness: 0.42, capRadius: 0.16, hipCapRadius: 0.13, ornament: 'none' },
      eave: { hikomaHeight: 0.05, fasciaDepth: 0.26 },
      palette: { tile: '#3f444b', ridge: '#3a3f46' },
    },
  },
  shrine: {
    label: 'Shrine 流造 — 檜皮葺 / 千木',
    spec: {
      form: 'nagare', footprint: { width: 5.4, depth: 4.2, wallHeight: 3.4 },
      overhang: { eave: 1.1, gable: 0.8, rear: 0.7 }, baseHeight: 3.6,
      pitch: { sun: 7, mode: 'front' },
      curvature: { rule: 'teri', purlins: 5, ease: 0.65, corner: { enabled: true, chongFactor: 2, qiaoFactor: 3, rafterDiam: 0.1, run: 1.8 } },
      tiles: { id: 'hiwadabuki' },
      ridge: { end: 'none', ornament: 'chigi', layers: 3, thickness: 0.30 },
      frame: { rafter: { spacing: 0.303 } },
      palette: { tile: '#6b5236', ridge: '#5c4a33', wood: '#b98b52' },
    },
  },
  hanok: {
    label: 'Hanok 팔작지붕 — Korean hip-and-gable',
    spec: {
      form: 'paljak', footprint: { width: 9.6, depth: 6.6, wallHeight: 3.2 },
      overhang: { eave: 1.35, gable: 1.1 }, baseHeight: 3.2,
      pitch: { sun: 6 },
      curvature: { rule: 'korean', purlins: 6, ease: 0.75, corner: { enabled: true, chongFactor: 3, qiaoFactor: 3.4, rafterDiam: 0.1, run: 2.6 } },
      tiles: { id: 'sangawara_53' },
      ridge: { end: 'onigawara', layers: 4, thickness: 0.38, capRadius: 0.15 },
      palette: { tile: '#54605c', ridge: '#4a5551' },
    },
  },
  chinese_hall: {
    label: 'Chinese hall 歇山 — 举折 + 冲三翘四',
    spec: {
      form: 'xieshan', footprint: { width: 13.2, depth: 9.6, wallHeight: 5.0 },
      overhang: { eave: 2.4, gable: 1.6 }, baseHeight: 5.0,
      pitch: { sun: 6 },
      curvature: { rule: 'juzhe', purlins: 6, smooth: true, ease: 0.6, corner: { enabled: true, chongFactor: 3, qiaoFactor: 4, rafterDiam: 0.11, run: 3.4 } },
      tiles: { id: 'hongawara' },
      frame: { rafter: { spacing: 0.303 } },
      ridge: { end: 'shibi', layers: 4, thickness: 0.44, capRadius: 0.17 },
      palette: { tile: '#3b4a3a', ridge: '#334234', wood: '#8f2f2a' },
    },
  },
  imperial: {
    label: 'Imperial 重檐庑殿 — yellow glazed tile',
    spec: {
      form: 'wudian', footprint: { width: 16.0, depth: 11.0, wallHeight: 5.6 },
      overhang: { eave: 2.6, gable: 2.6 }, baseHeight: 5.6,
      pitch: { sun: 5.5 },
      curvature: { rule: 'juzhe', purlins: 7, ease: 0.6, corner: { enabled: true, chongFactor: 3, qiaoFactor: 4, rafterDiam: 0.12, run: 3.8 } },
      tiles: { id: 'hongawara' },
      ridge: { end: 'shibi', layers: 4, thickness: 0.5, capRadius: 0.19 },
      finish: { glazed: true, roughness: 0.35, metalness: 0.06 },
      palette: { tile: '#d8a420', tileGlaze: '#c8971c', ridge: '#c8971c', wood: '#8f2f2a' },
    },
  },
  gassho: {
    label: 'Gasshō-zukuri 合掌造 — steep thatch',
    spec: {
      form: 'kirizuma', footprint: { width: 12.0, depth: 7.2, wallHeight: 3.0 },
      overhang: { eave: 0.6, gable: 0.3 }, baseHeight: 3.4,
      pitch: { sun: 14 },
      curvature: { rule: 'linear', purlins: 3, corner: { enabled: false } },
      tiles: { id: 'thatch' },
      ridge: { end: 'none', layers: 5, thickness: 0.7, layerHeight: 0.09, capRadius: 0.3 },
      frame: { rafter: { spacing: 0.9, width: 0.12, depth: 0.18 }, purlin: { size: [0.16, 0.16] } },
      palette: { tile: '#8a7748', ridge: '#7a6a42', wood: '#7d5c38' },
    },
  },
  modern: {
    label: 'Modern 入母屋 — flat panels, no curve (ancient form / modern detailing)',
    spec: {
      form: 'irimoya', footprint: { width: 9.0, depth: 6.6, wallHeight: 3.6 },
      overhang: { eave: 0.9, gable: 0.7 }, baseHeight: 3.6,
      pitch: { sun: 3.2 },
      curvature: { rule: 'linear', purlins: 3, corner: { enabled: false } },
      tiles: { id: 'seam_metal' },
      ridge: { end: 'none', layers: 2, thickness: 0.22, capRadius: 0.08, style: 'flat' },
      frame: { rafter: { spacing: 0.6 }, battens: { enabled: false } },
      eave: { hikomaHeight: 0.03, fasciaDepth: 0.12 },
      palette: { tile: '#2f3339', ridge: '#26292e', wood: '#3a3f45' },
      finish: { roughness: 0.35, metalness: 0.5, weathered: 0 },
    },
  },
  hougyou: {
    label: 'Hōgyō 宝形 — square pyramidal hall',
    spec: {
      form: 'hougyou', footprint: { width: 6.0, depth: 6.0, wallHeight: 3.2 },
      overhang: { eave: 1.2, gable: 1.2 }, baseHeight: 3.2,
      pitch: { sun: 7 },
      curvature: { rule: 'teri', purlins: 5, ease: 0.7, corner: { enabled: true, chongFactor: 2.5, qiaoFactor: 3, rafterDiam: 0.1, run: 2.2 } },
      tiles: { id: 'sangawara_53' },
      ridge: { end: 'onigawara', layers: 2, thickness: 0.26, capRadius: 0.11 },
    },
  },
};

export function presetSpec(name) {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown preset "${name}"`);
  return mergeSpec(p.spec);
}
