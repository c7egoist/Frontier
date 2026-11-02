/**
 * Time-varying prevailing-wind regimes shared by Terrain Studio and the
 * Rock & Cliff Studio SDF bake.
 *
 * Real wind erosion is rarely the product of one immutable compass vector:
 * seasonal pressure patterns swing around a prevailing direction, weather
 * fronts arrive from discrete sectors, and some deserts accumulate a full
 * wind rose over a year. This module keeps that slow directional regime
 * separate from the fast local effects already modelled elsewhere (gust
 * wander, obstacle wrap, flank speedup and lee shelter). Those local effects
 * act around the effective direction returned here.
 *
 * Modes are stored numerically in Terrain layer params (the inspector's
 * generic select contract) and as readable strings in Rock params/CLI:
 *   0 / "fixed"     one prevailing direction (legacy behaviour)
 *   1 / "oscillate" seasonal swing: prevailing ± range over each cycle
 *   2 / "sectors"   weather fronts stepping through sectors across ±range
 *   3 / "rotate"    full 360° wind rose over each cycle
 */

export const WIND_SHIFT_MODES = Object.freeze([
  Object.freeze({ value: 0, id: 'fixed', label: 'Fixed prevailing wind' }),
  Object.freeze({ value: 1, id: 'oscillate', label: 'Seasonal swing around prevailing wind' }),
  Object.freeze({ value: 2, id: 'sectors', label: 'Weather fronts (step through sectors)' }),
  Object.freeze({ value: 3, id: 'rotate', label: 'Full rotating wind rose (360°)' }),
]);

const MODE_ALIASES = new Map([
  ['0', 'fixed'],
  ['fixed', 'fixed'],
  ['steady', 'fixed'],
  ['prevailing', 'fixed'],
  ['1', 'oscillate'],
  ['oscillate', 'oscillate'],
  ['oscillating', 'oscillate'],
  ['swing', 'oscillate'],
  ['seasonal', 'oscillate'],
  ['seasonal-swing', 'oscillate'],
  ['2', 'sectors'],
  ['sector', 'sectors'],
  ['sectors', 'sectors'],
  ['fronts', 'sectors'],
  ['weather-fronts', 'sectors'],
  ['3', 'rotate'],
  ['rotate', 'rotate'],
  ['rotating', 'rotate'],
  ['wind-rose', 'rotate'],
  ['rose', 'rotate'],
]);

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

/**
 * Direction offset (degrees) added to the prevailing azimuth after
 * `cycles` complete regime cycles. Fractional cycles are expected.
 */
export function windShiftOffsetDeg(params = {}, cycles = 0) {
  const mode = normalizeWindShiftMode(params.windShiftMode ?? params.windDirectionMode ?? params.shiftMode);
  const range = shiftRangeDeg(params);
  const c = finite(cycles, 0);

  if (mode === 'fixed' || range <= 0 && mode !== 'rotate') return 0;
  if (mode === 'oscillate') {
    return range * Math.sin(c * Math.PI * 2);
  }
  if (mode === 'sectors') {
    const count = sectorCount(params);
    const frac = c - Math.floor(c);
    const idx = clamp(Math.floor(frac * count), 0, count - 1);
    return count === 1 ? 0 : -range + (2 * range * idx) / (count - 1);
  }
  if (mode === 'rotate') {
    return 360 * c;
  }
  return 0;
}

/** Effective azimuth (degrees, direction blown TOWARD) after `cycles`. */
export function effectiveWindAzimuthDeg(params = {}, cycles = 0) {
  return normalizeWindAzimuthDeg(prevailingAzimuthDeg(params) + windShiftOffsetDeg(params, cycles));
}

/** Regime cycles elapsed at a Terrain simulation step. */
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
  if (mode === 'oscillate') return `seasonal swing ±${range}° · ${period} steps/cycle`;
  if (mode === 'sectors') return `${sectorCount(params)} weather-front sectors across ±${range}° · ${period} steps/cycle`;
  return `full 360° wind rose · ${period} steps/cycle`;
}
