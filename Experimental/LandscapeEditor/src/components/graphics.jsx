// Small SVG instruments: the cross-section before and after a layer, and the response curve of a mask.
import React from 'react';
import { smootherstep, smoothstep, clamp } from '../terrain/grid.js';

// Cross-section through the middle row, before and after a layer. Both lines share one vertical scale.
export function ProfileGraph({ before, after, seaLevel = 0, width = 460, height = 130 }) {
  if (!after || !after.length) return <div className="ls-empty">Run the stack to see the cross-section.</div>;
  const all = [...after, ...(before || [])];
  let lo = Math.min(...all, seaLevel);
  let hi = Math.max(...all);
  if (hi - lo < 1) hi = lo + 1;
  const pad = 8;
  const x = (i, n) => pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  const path = (arr) => Array.from(arr, (v, i) => `${i ? 'L' : 'M'}${x(i, arr.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="ls-profile" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cross-section before and after this layer">
      <rect x="0" y="0" width={width} height={height} rx="8" fill="#ffffff04" />
      {seaLevel >= lo && seaLevel <= hi && (
        <g>
          <line x1={pad} x2={width - pad} y1={y(seaLevel)} y2={y(seaLevel)} stroke="#74bdd4" strokeOpacity=".5" strokeDasharray="3 4" />
          <text x={width - pad - 4} y={y(seaLevel) - 4} fill="#74bdd4" fillOpacity=".75" fontSize="9" textAnchor="end">sea</text>
        </g>
      )}
      {before && before.length === after.length && <path d={path(before)} fill="none" stroke="#8a8a8a" strokeOpacity=".7" strokeWidth="1.2" strokeDasharray="4 3" />}
      <path d={path(after)} fill="none" stroke="var(--card-icon, #d6a078)" strokeWidth="1.8" />
      <text x={pad} y={height - 2} fill="#6f6f6f" fontSize="9">{Math.round(lo).toLocaleString()} m</text>
      <text x={width - pad} y={height - 2} fill="#6f6f6f" fontSize="9" textAnchor="end">{Math.round(hi).toLocaleString()} m</text>
      <text x={pad} y={pad + 8} fill="#6f6f6f" fontSize="9">{before ? 'dashed: before · solid: after' : 'solid: after'}</text>
    </svg>
  );
}

// Response curve for a mask: how strongly it gates the layer across its input range.
const response = {
  coastal: (p) => ({ xs: range(0, p.width * 2.2, 80), f: (x) => Math.pow(smootherstep(0, p.width, x), p.curve), xl: 'distance from shore', yl: 'mask' }),
  altitude: (p) => ({ xs: range(0, Math.max(p.high * 1.3, 1000), 80), f: (x) => Math.pow(smootherstep(p.low, Math.max(p.low + 1, p.high), x), p.curve), xl: 'height (m)', yl: 'mask' }),
  slope: (p) => ({ xs: range(0, 90, 90), f: (x) => smootherstep(p.from - p.soft, p.from + p.soft, x) * (1 - smootherstep(p.to - p.soft, p.to + p.soft, x)), xl: 'slope (°)', yl: 'mask' }),
  curvature: (p) => ({ xs: range(-1, 1, 80), f: (x) => smoothstep(p.threshold - p.width, p.threshold + p.width, (p.sign >= 0 ? 1 : -1) * x), xl: 'normalised curvature', yl: 'mask' }),
  noise: (p) => ({ xs: range(0, 1, 80), f: (x) => smoothstep(p.threshold - p.soft, p.threshold + p.soft, x), xl: 'noise value', yl: 'mask' }),
  radial: (p) => ({ xs: range(0, 1.2, 80), f: (x) => 1 - smootherstep(p.radius - p.soft, p.radius, x), xl: 'radius (of grid)', yl: 'mask' }),
  strata: (p) => ({ xs: range(0, p.period * 2, 160), f: (x) => {
    const q = x / p.period - Math.floor(x / p.period);
    return smoothstep(p.duty - p.soft, p.duty, q) * (1 - smoothstep(1 - p.soft, 1, q));
  }, xl: 'height (m), two bands', yl: 'mask' }),
};

function range(a, b, steps) {
  return Array.from({ length: steps }, (_, i) => a + ((b - a) * i) / (steps - 1));
}

export function MaskCurve({ type, params, width = 460, height = 120 }) {
  const build = response[type];
  if (!build) return null;
  const { xs, f, xl, yl } = build(params);
  const ys = xs.map((x) => clamp(f(x)));
  const pad = 10;
  const xmin = xs[0];
  const xmax = xs[xs.length - 1];
  const px = (x) => pad + ((x - xmin) / (xmax - xmin || 1)) * (width - pad * 2);
  const py = (y) => pad + (1 - y) * (height - pad * 2 - 12);
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(ys[i]).toFixed(1)}`).join(' ');
  return (
    <svg className="ls-mask-curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mask response over ${xl}`}>
      <path d={`${d} L${px(xmax)} ${py(0)} L${px(xmin)} ${py(0)} Z`} fill="var(--card-icon, #d6a078)" fillOpacity=".12" />
      <path d={d} fill="none" stroke="var(--card-icon, #d6a078)" strokeWidth="1.6" />
      <line x1={pad} x2={width - pad} y1={py(0)} y2={py(0)} stroke="#3a3a3a" />
      <text x={pad} y={height - 2} fill="#6f6f6f" fontSize="9">{Math.round(xmin)}</text>
      <text x={width - pad} y={height - 2} fill="#6f6f6f" fontSize="9" textAnchor="end">{Math.round(xmax)} · {xl}</text>
      <text x={width - pad} y={pad + 6} fill="#6f6f6f" fontSize="9" textAnchor="end">{yl} 1</text>
    </svg>
  );
}
