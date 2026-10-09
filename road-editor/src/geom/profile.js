// Cross-section model. Every road is described by six lateral "slots" per side,
// so all arms of a junction share the same loop topology even when their
// widths, curbs or ditches differ. Slot k sits at lateral offset `o` from the
// centreline and `dy` metres above the centreline height.
//
//   centre --band0 (carriageway)-- s0 --band1 (gutter)-- s1 --band2 (kerb face)-- s2
//          --band3 (footway)-- s3 --band4 (ditch)-- s4 --band5 (ditch)-- s5 --> batter

export const CURB_HEIGHT = { none: 0, low: 0.12, high: 0.2 };
export const SLOT_COUNT = 6;
const BAND_KEYS = ['carriage', 'gutter', 'curb', 'walk', 'ditch', 'ditch'];
const EPS = 1e-6;

export const ROAD_DEFAULTS = {
  kind: 'road',
  lanes: 2,
  laneWidth: 3.5,
  shoulder: 0.75,
  oneWay: false,
  crown: 0.02,
  curb: 'low',
  gutter: 0.5,
  gutterDrop: 0.04,
  sidewalk: 2.0,
  surface: { carriageway: 'asphalt', sidewalk: 'pave:concrete-slab', junction: 'asphalt', scale: 1 },
  drainage: { mode: 'curbs', ditchWidth: 1.2, ditchDepth: 0.5, inletSpacing: 25 },
  guardrail: { mode: 'auto', type: 'w-beam', embankHeight: 2.0 },
  bridge: { mode: 'auto', threshold: 2.5, deckThickness: 0.9, pierSpacing: 24, pierWidth: 1.6, parapetHeight: 1.0 },
  markings: { centre: 'dashed', edges: true, laneLines: true, crosswalks: true, stopLines: true },
};

export function profileSlots(road) {
  const lanes = Math.max(1, Math.round(Number(road.lanes ?? 2)));
  const laneWidth = Math.max(2, Number(road.laneWidth ?? 3.5));
  const shoulder = Math.max(0, Number(road.shoulder ?? 0.75));
  const half = (lanes * laneWidth) / 2;
  const carriageHalf = half + shoulder;
  const crown = Math.max(0, Number(road.crown ?? 0.02));
  const edgeDy = -crown * carriageHalf;
  const curbType = CURB_HEIGHT[road.curb] === undefined ? 'none' : road.curb;
  const curbOn = curbType !== 'none';
  const curbH = CURB_HEIGHT[curbType];
  const gutterW = curbOn ? Math.max(0, Number(road.gutter ?? 0.5)) : 0;
  const gutterDrop = curbOn ? Math.max(0, Number(road.gutterDrop ?? 0.04)) : 0;
  const swW = curbOn ? Math.max(0, Number(road.sidewalk ?? 0)) : 0;
  const curbOff = carriageHalf + gutterW;
  const swOff = curbOff + swW;
  const ditchOn = !curbOn && road.drainage?.mode === 'ditches';
  const dW = ditchOn ? Math.max(0.4, Number(road.drainage.ditchWidth ?? 1.2)) : 0;
  const dD = ditchOn ? Math.max(0.1, Number(road.drainage.ditchDepth ?? 0.5)) : 0;
  const top = curbOn ? curbH : edgeDy;
  const slots = [
    { o: carriageHalf, dy: edgeDy },
    { o: curbOff, dy: curbOn ? edgeDy - gutterDrop : edgeDy },
    { o: curbOff, dy: top },
    { o: swOff, dy: top },
    { o: ditchOn ? carriageHalf + dW / 2 : swOff, dy: ditchOn ? edgeDy - dD : top },
    { o: ditchOn ? carriageHalf + dW : swOff, dy: ditchOn ? edgeDy : top },
  ];
  const bands = [{ key: 'carriage', vertical: false, empty: carriageHalf < EPS }];
  for (let k = 1; k < SLOT_COUNT; k++) {
    const a = slots[k - 1];
    const b = slots[k];
    const dO = b.o - a.o;
    const dY = b.dy - a.dy;
    bands.push({
      key: BAND_KEYS[k],
      vertical: Math.abs(dO) < EPS && Math.abs(dY) > EPS,
      empty: Math.abs(dO) < EPS && Math.abs(dY) < EPS,
    });
  }
  return {
    lanes,
    laneWidth,
    shoulder,
    carriageHalf,
    edgeDy,
    curbOn,
    curbH,
    gutterW,
    swW,
    ditchOn,
    dW,
    dD,
    slots,
    bands,
    outer: slots[SLOT_COUNT - 1],
    totalHalf: slots[SLOT_COUNT - 1].o,
  };
}

// Height of the carriageway surface at lateral offset u (used by markings).
export function carriageDy(sl, u) {
  const a = Math.abs(u);
  if (a >= sl.carriageHalf) return sl.edgeDy;
  return (sl.edgeDy * a) / Math.max(EPS, sl.carriageHalf);
}

// Material key of a band for a given road.
export function bandMaterial(road, bandKey) {
  const surf = road.surface ?? ROAD_DEFAULTS.surface;
  switch (bandKey) {
    case 'carriage':
      return surf.carriageway || 'asphalt';
    case 'gutter':
      return 'gutter';
    case 'curb':
      return 'concrete';
    case 'walk':
      return surf.sidewalk || 'pave:concrete-slab';
    case 'ditch':
      return 'ditch';
    default:
      return 'asphalt';
  }
}

// Fill missing road fields with defaults without mutating the input.
export function withRoadDefaults(road) {
  const out = { ...ROAD_DEFAULTS, ...road };
  out.surface = { ...ROAD_DEFAULTS.surface, ...(road.surface ?? {}) };
  out.drainage = { ...ROAD_DEFAULTS.drainage, ...(road.drainage ?? {}) };
  out.guardrail = { ...ROAD_DEFAULTS.guardrail, ...(road.guardrail ?? {}) };
  out.bridge = { ...ROAD_DEFAULTS.bridge, ...(road.bridge ?? {}) };
  out.markings = { ...ROAD_DEFAULTS.markings, ...(road.markings ?? {}) };
  return out;
}
