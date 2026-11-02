/**
 * Time-varying prevailing-wind regimes shared by Terrain Studio and the
 * Rock & Cliff Studio SDF bake.
 *
 * Real erosive wind does not sweep left/right like a windscreen wiper. A
 * weather pattern normally dwells in one compass sector for a while, then
 * veers or jumps to another sector: east for a spell, north-east next, then
 * perhaps south or north, while one prevailing sector still receives the
 * largest share over geologic time. This module therefore schedules
 * direction as a sequence of sector dwell episodes, not as a sine wave.
 *
 * The quota of episodes assigned to each sector is balanced inside every
 * weather-pattern cycle. That matters for finite simulations and offline
 * bakes: a purely random sequence could spend most of a short run on one
 * side by chance, whereas the quota schedule realizes the intended wind
 * rose closely while still changing sector in a non-monotonic order.
 *
 * Modes are stored numerically in Terrain layer params (the inspector's
 * generic select contract) and as readable strings in Rock params/CLI:
 *   0 / "fixed"    one prevailing direction (legacy behaviour)
 *   1 / "variable" prevailing-weighted wind rose: changing sector dwells
 *                  over the full compass, with the prevailing sector most
 *                  frequent and left/right sector pairs balanced
 *   2 / "sectors"  weather fronts dwelling in sectors across ±range, in a
 *                  changing (non-sweeping) order
 *   3 / "rotate"   full wind rose: all eight sectors receive equal dwell
 *                  quotas, again as changing episodes rather than a clock
 *
 * Legacy "oscillate" / "swing" values migrate to "variable". The old
 * sinusoidal wiper is intentionally no longer exposed.
 */

export const WIND_SHIFT_MODES = Object.freeze([
  Object.freeze({ value: 0, id: 'fixed', label: 'Fixed prevailing wind' }),
  Object.freeze({ value: 1, id: 'variable', label: 'Variable wind rose (prevailing + changing sectors)' }),
  Object.freeze({ value: 2, id: 'sectors', label: 'Weather fronts (changing sectors)' }),
  Object.freeze({ value: 3, id: 'rotate', label: 'Full wind rose (all sectors, changing dwells)' }),
]);

const MODE_ALIASES = new Map([
  ['0', 'fixed'],
  ['fixed', 'fixed'],
  ['steady', 'fixed'],
  ['prevailing', 'fixed'],
  ['1', 'variable'],
  ['variable', 'variable'],
  ['variable-wind-rose', 'variable'],
  ['prevailing-variable', 'variable'],
  ['weather', 'variable'],
  ['oscillate', 'variable'],
  ['oscillating', 'variable'],
  ['swing', 'variable'],
  ['seasonal', 'variable'],
  ['seasonal-swing', 'variable'],
  ['2', 'sectors'],
  ['sector', 'sectors'],
  ['sectors', 'sectors'],
  ['fronts', 'sectors'],
  ['weather-fronts', 'sectors'],
  ['3', 'rotate'],
  ['rotate', 'rotate'],
  ['rotating', 'rotate'],
  ['wind-rose', 'rotate'],
  ['full-wind-rose', 'rotate'],
  ['rose', 'rotate'],
]);

const ROSE_OFFSETS_DEG = Object.freeze([-180, -135, -90, -45, 0, 45, 90, 135]);

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function normalizeWindShiftMode(value, fallback = 'fixed') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const byNumber = WIND_SHIFT_MODES.find((mode) => mode.value === Math.round(value));
    if (byNumber) return byNumber.id;
  }
  const key = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (MODE_ALIASES.has(key)) return MODE_ALIASES.get(key);
  const safeFallback = MODE_ALIASES.get(String(fallback ?? '').trim().toLowerCase().replace(/_/g, '-'));
  return safeFallback || 'fixed';
}

export function windShiftModeValue(value, fallback = 'fixed') {
  const id = normalizeWindShiftMode(value, fallback);
  return WIND_SHIFT_MODES.find((mode) => mode.id === id)?.value ?? 0;
}

export function windShiftModeLabel(value, fallback = 'fixed') {
  const id = normalizeWindShiftMode(value, fallback);
  return WIND_SHIFT_MODES.find((mode) => mode.id === id)?.label ?? 'Fixed prevailing wind';
}

/** Wrap an azimuth to the same -180..180 range used by the studio sliders. */
export function normalizeWindAzimuthDeg(value) {
  let deg = finite(value, 0) % 360;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return deg === 0 ? 0 : deg;
}

function prevailingAzimuthDeg(params = {}) {
  return finite(
    params.windAzimuth ?? params.windAzimuthDeg ?? params.azimuthDeg ?? params.azimuth,
    35
  );
}

function shiftRangeDeg(params = {}) {
  return clamp(
    finite(params.windShiftRange ?? params.windShiftRangeDeg ?? params.shiftRangeDeg, 55),
    0,
    180
  );
}

function sectorCount(params = {}) {
  return clamp(Math.round(finite(params.windShiftSectors ?? params.shiftSectors, 5)), 2, 9);
}

function regimeSeed(params = {}) {
  return Math.round(finite(
    params.windSeed ?? params.windShiftSeed ?? params.seed ?? params.seedSalt,
    0
  )) | 0;
}

function episodesPerCycle(params = {}, fallback = 24) {
  return clamp(Math.round(finite(
    params.windShiftEpisodes ?? params.windEpisodesPerCycle ?? params.episodesPerCycle,
    fallback
  )), 4, 64);
}

function hash32(a = 0, b = 0, c = 0, d = 0) {
  let h = 2166136261 >>> 0;
  for (const value of [a, b, c, d]) {
    h ^= (Number(value) | 0) >>> 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
  }
  return h >>> 0;
}

function unitHash(a = 0, b = 0, c = 0, d = 0) {
  return hash32(a, b, c, d) / 4294967296;
}

/**
 * Prevailing-weighted wind-rose probabilities for the eight 45° sectors.
 * `windShiftRange` is the spread control: small values concentrate time
 * near the prevailing sector; 180° approaches a broad, nearly uniform rose
 * while retaining a modest prevailing peak. Left/right pairs always have
 * identical weights, so the intended distribution cannot favour one side.
 */
export function windRoseWeightsDeg(params = {}) {
  const range = shiftRangeDeg(params);
  if (range <= 0) {
    return ROSE_OFFSETS_DEG.map((offsetDeg) => ({ offsetDeg, weight: offsetDeg === 0 ? 1 : 0 }));
  }
  const spread = range / 180;
  // A narrow spread stays tightly prevailing/adjacent; the usual 55–60°
  // settings yield roughly one-third prevailing, one-fifth in each adjacent
  // sector, and a few percent in side/rear/opposite sectors; 180° is broad.
  const kappa = 0.14 + 4.70 * Math.exp(-range / 50);
  const raw = ROSE_OFFSETS_DEG.map((offsetDeg) => {
    const rad = offsetDeg * Math.PI / 180;
    return Math.exp(kappa * (Math.cos(rad) - 1));
  });
  const rawSum = raw.reduce((sum, value) => sum + value, 0) || 1;
  const uniformMix = 0.012 + 0.28 * Math.pow(spread, 1.35);
  return ROSE_OFFSETS_DEG.map((offsetDeg, index) => ({
    offsetDeg,
    weight: (1 - uniformMix) * (raw[index] / rawSum) + uniformMix / ROSE_OFFSETS_DEG.length,
  }));
}

function allocateVariableCounts(weights, episodes, seed, cycleIndex) {
  // Indices in ROSE_OFFSETS_DEG. Pair groups are allocated two episodes at
  // a time (one to each side), preserving exact left/right balance.
  const groups = [
    { indices: [4] },    // prevailing
    { indices: [3, 5] }, // ±45°
    { indices: [2, 6] }, // ±90°
    { indices: [1, 7] }, // ±135°
    { indices: [0] },    // opposite
  ];
  const counts = new Array(weights.length).fill(0);
  const allocated = groups.map((group) => {
    const target = group.indices.reduce((sum, index) => sum + weights[index].weight, 0) * episodes;
    const unit = group.indices.length;
    const total = unit === 2 ? Math.floor(target / 2) * 2 : Math.floor(target);
    for (const index of group.indices) counts[index] = total / unit;
    return total;
  });
  let remaining = episodes - allocated.reduce((sum, value) => sum + value, 0);

  while (remaining > 0) {
    let bestGroup = -1;
    let bestScore = -Infinity;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const unit = group.indices.length;
      if (unit > remaining) continue;
      const target = group.indices.reduce((sum, index) => sum + weights[index].weight, 0) * episodes;
      const deficitPerUnit = (target - allocated[groupIndex]) / unit;
      const score = deficitPerUnit + unitHash(seed, cycleIndex, groupIndex, 0x71a3) * 1e-6;
      if (score > bestScore) {
        bestScore = score;
        bestGroup = groupIndex;
      }
    }
    if (bestGroup < 0) break;
    const group = groups[bestGroup];
    for (const index of group.indices) counts[index]++;
    allocated[bestGroup] += group.indices.length;
    remaining -= group.indices.length;
  }
  return counts;
}

function allocateEqualCounts(count, episodes) {
  const base = Math.floor(episodes / count);
  const counts = new Array(count).fill(base);
  for (let i = 0; i < episodes - base * count; i++) counts[i]++;
  return counts;
}

function sequenceFromCounts(offsets, counts, seed, cycleIndex, jitterDeg) {
  const selected = new Array(counts.length).fill(0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const sequence = [];
  let previousOffset = null;

  for (let position = 0; position < total; position++) {
    let candidates = offsets
      .map((offset, index) => ({ offset, index }))
      .filter(({ index }) => selected[index] < counts[index]);
    const nonRepeating = candidates.filter(({ offset }) => offset !== previousOffset);
    if (nonRepeating.length) candidates = nonRepeating;

    // Fair-deficit ordering: at every prefix of the weather pattern, pick
    // the sector furthest behind its ideal cumulative share. Frequent
    // sectors therefore recur evenly, while one-episode rear/opposite
    // sectors land near the middle instead of all being postponed to the
    // end. This makes even a partial Terrain bake or short Rock bake have
    // approximately the intended sector mix. A small deterministic hash
    // only breaks ties / changes side order by cycle.
    candidates.sort((a, b) => {
      const idealA = counts[a.index] * (position + 1) / total;
      const idealB = counts[b.index] * (position + 1) / total;
      const scoreA = idealA - selected[a.index] + unitHash(seed, cycleIndex, position, a.offset) * 0.08;
      const scoreB = idealB - selected[b.index] + unitHash(seed, cycleIndex, position, b.offset) * 0.08;
      return scoreB - scoreA;
    });
    const chosen = candidates[0];
    selected[chosen.index]++;

    const globalEpisode = cycleIndex * total + position;
    const jitter = jitterDeg > 0
      ? (unitHash(seed ^ 0x5f3759df, globalEpisode, chosen.offset, 0x27d4) * 2 - 1) * jitterDeg
      : 0;
    sequence.push(chosen.offset + jitter);
    previousOffset = chosen.offset;
  }
  return sequence;
}

/**
 * Direction offsets (degrees relative to prevailing) for one complete
 * weather-pattern cycle. The returned sequence is a dwell schedule: step
 * through its entries in order, holding each one for an equal slice of the
 * cycle. This is the core replacement for the former sinusoidal swing.
 */
export function windDirectionScheduleDeg(params = {}, cycleIndex = 0) {
  const mode = normalizeWindShiftMode(params.windShiftMode ?? params.windDirectionMode ?? params.shiftMode);
  const range = shiftRangeDeg(params);
  const seed = regimeSeed(params);
  const cycle = Math.round(finite(cycleIndex, 0));

  if (mode === 'fixed' || (mode !== 'rotate' && range <= 0)) return [0];

  if (mode === 'variable') {
    const episodes = episodesPerCycle(params, 32);
    const weights = windRoseWeightsDeg(params);
    const counts = allocateVariableCounts(weights, episodes, seed, cycle);
    const jitter = clamp(3 + range * 0.08, 3, 12);
    return sequenceFromCounts(ROSE_OFFSETS_DEG, counts, seed, cycle, jitter);
  }

  if (mode === 'sectors') {
    const count = sectorCount(params);
    const offsets = Array.from({ length: count }, (_, index) =>
      count === 1 ? 0 : -range + (2 * range * index) / (count - 1));
    // Fronts arrive in a seeded, non-monotonic order. Sorting by a stable
    // per-cycle hash gives every sector exactly one dwell per cycle without
    // sweeping from one extreme to the other like a scanner.
    return offsets
      .map((offset, index) => ({ offset, key: unitHash(seed, cycle, index, 0x51f7) }))
      .sort((a, b) => a.key - b.key)
      .map(({ offset }) => offset);
  }

  // Full wind rose: equal quotas in all eight sectors, interleaved as
  // changing dwell episodes rather than a continuous rotating vector.
  const episodes = episodesPerCycle(params, 16);
  const counts = allocateEqualCounts(ROSE_OFFSETS_DEG.length, episodes);
  return sequenceFromCounts(ROSE_OFFSETS_DEG, counts, seed, cycle, 5);
}

/**
 * Direction offset (degrees) added to the prevailing azimuth after
 * `cycles` complete weather-pattern cycles. Fractional cycles select the
 * dwell episode active at that point in the pattern.
 */
export function windShiftOffsetDeg(params = {}, cycles = 0) {
  const mode = normalizeWindShiftMode(params.windShiftMode ?? params.windDirectionMode ?? params.shiftMode);
  const range = shiftRangeDeg(params);
  if (mode === 'fixed' || (mode !== 'rotate' && range <= 0)) return 0;

  const c = finite(cycles, 0);
  const cycleIndex = Math.floor(c);
  const fraction = c - cycleIndex;
  const schedule = windDirectionScheduleDeg(params, cycleIndex);
  const episode = clamp(Math.floor(fraction * schedule.length), 0, schedule.length - 1);
  return schedule[episode] || 0;
}

/** Effective azimuth (degrees, direction blown TOWARD) after `cycles`. */
export function effectiveWindAzimuthDeg(params = {}, cycles = 0) {
  return normalizeWindAzimuthDeg(prevailingAzimuthDeg(params) + windShiftOffsetDeg(params, cycles));
}

/**
 * Episode-centre azimuths across a bake/simulation span, bounded for HUD
 * and CLI reporting. Unlike evenly spaced time samples, these are actual
 * scheduled dwell directions, so the report shows the changing sectors the
 * erosion really used.
 */
export function sampleWindDirectionSequenceDeg(params = {}, totalCycles = 1, maxSamples = 17) {
  const mode = normalizeWindShiftMode(params.windShiftMode ?? params.windDirectionMode ?? params.shiftMode);
  const prevailing = prevailingAzimuthDeg(params);
  if (mode === 'fixed') return Array.from({ length: 5 }, () => normalizeWindAzimuthDeg(prevailing));

  const cycles = Math.max(0.001, finite(totalCycles, 1));
  const cap = clamp(Math.round(finite(maxSamples, 17)), 2, 32);
  const all = [];
  const wholeCycles = Math.ceil(cycles);
  for (let cycleIndex = 0; cycleIndex < wholeCycles; cycleIndex++) {
    const schedule = windDirectionScheduleDeg(params, cycleIndex);
    for (let episode = 0; episode < schedule.length; episode++) {
      const centre = cycleIndex + (episode + 0.5) / schedule.length;
      if (centre <= cycles + 1e-9) {
        all.push(normalizeWindAzimuthDeg(prevailing + schedule[episode]));
      }
    }
  }
  if (!all.length) return [normalizeWindAzimuthDeg(prevailing)];
  if (all.length <= cap) return all;
  return Array.from({ length: cap }, (_, index) =>
    all[Math.round((index * (all.length - 1)) / (cap - 1))]);
}

/** Weather-pattern cycles elapsed at a Terrain simulation step. */
export function windCyclesAtStep(params = {}, step = 0) {
  const period = Math.max(
    1,
    finite(params.windShiftPeriod ?? params.windShiftPeriodSteps ?? params.shiftPeriodSteps, 240)
  );
  return Math.max(0, finite(step, 0)) / period;
}

export function effectiveWindAzimuthAtStep(params = {}, step = 0) {
  return effectiveWindAzimuthDeg(params, windCyclesAtStep(params, step));
}

/** Compact, UI-friendly description of the configured regime. */
export function describeWindRegime(params = {}) {
  const mode = normalizeWindShiftMode(params.windShiftMode ?? params.windDirectionMode ?? params.shiftMode);
  const range = Math.round(shiftRangeDeg(params));
  const period = Math.round(Math.max(
    1,
    finite(params.windShiftPeriod ?? params.windShiftPeriodSteps ?? params.shiftPeriodSteps, 240)
  ));
  if (mode === 'fixed') return 'fixed prevailing direction';
  if (mode === 'variable') return `variable wind rose · prevailing-weighted changing sectors · spread ${range}° · ${period} steps/weather pattern`;
  if (mode === 'sectors') return `${sectorCount(params)} weather-front sectors across ±${range}° · changing dwells · ${period} steps/weather pattern`;
  return `full wind rose · all-sector changing dwells · ${period} steps/weather pattern`;
}
