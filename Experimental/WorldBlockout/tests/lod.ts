import {
  projectedPixels, oceanRegime, ringSpacing, buildClipmap, clipmapTriangleCount,
  geomorphAlpha, snapSpacing, stableSimTimestep, resolveBaseSpacing, resolveWaterLod,
  ringsToCover, type LODParams,
} from '../src/core/lod.ts';
import { check, report } from './harness.ts';

const P: LODParams = {
  fovY: 60 * Math.PI / 180, viewportHeight: 1080,
  simRadius: 1500, flatDistance: 25000, horizonDistance: 120000, pixelErrorBudget: 4,
};

console.log('LOD resolver');
check('near water is simulated', oceanRegime(10, P) === 'simulated' && oceanRegime(1400, P) === 'simulated');
check('mid water is displaced mesh', oceanRegime(6000, P) === 'displaced');
check('far water is shading only', oceanRegime(40000, P) === 'flat');
check('horizon is a skirt', oceanRegime(200000, P) === 'horizon');
check('projected pixel size falls with distance',
  projectedPixels(1, 10, P) > projectedPixels(1, 1000, P),
  `1 m at 10 m = ${projectedPixels(1, 10, P).toFixed(0)} px, at 1 km = ${projectedPixels(1, 1000, P).toFixed(2)} px`);

const rings = buildClipmap(4, 12, P);
check('ring spacing doubles per level (bounded cost)',
  rings.every((r, i) => i === 0 || Math.abs(r.spacing - rings[i - 1].spacing * 2) < 1e-9),
  `ring 0 = ${rings[0].spacing} m -> ring 11 = ${rings[11].spacing} m`);
check('rings tile with no gaps', rings.every((r, i) => i === 0 || r.inner === rings[i - 1].outer));

const levels = ringsToCover(P.flatDistance, 4);
const cover = buildClipmap(4, levels, P);
check('clipmap reaches the flat-shading distance', cover[cover.length - 1].outer >= P.flatDistance,
  `${cover.length} rings to ${(cover[cover.length - 1].outer / 1000).toFixed(1)} km`);

const tris = clipmapTriangleCount(cover);
check('triangle count bounded for 25 km of ocean', tris < 250000, `${tris.toLocaleString()} triangles`);

const errs = cover.map(r => r.errorPx);
const errRatio = Math.max(...errs) / Math.max(Math.min(...errs), 1e-6);
check('screen-space error roughly constant across rings', errRatio < 8,
  `min ${Math.min(...errs).toFixed(1)} px, max ${Math.max(...errs).toFixed(1)} px`);

const near = resolveWaterLod(2, P);
const high = resolveWaterLod(20000, P);
check('camera altitude adapts the finest spacing', high.baseSpacing > near.baseSpacing,
  `2 m camera -> ${near.baseSpacing} m quads; 20 km camera -> ${high.baseSpacing} m quads`);
check('map view drops rings it cannot see', high.rings.length < near.rings.length || high.tris <= near.tris,
  `${near.rings.length} rings / ${near.tris} tris vs ${high.rings.length} rings / ${high.tris} tris`);

check('geomorph fades out at ring edge',
  geomorphAlpha(rings[1].inner, rings[1], 40) === 0 && geomorphAlpha(rings[1].outer, rings[1], 40) === 1);
const snap = snapSpacing(4, 1001.7);
check('grid snaps to world multiples (no swimming)', snap.origin % 4 === 0 && Number.isInteger(snap.offsetQuads));
const dtDeep = stableSimTimestep(6, 200);
const dtShallow = stableSimTimestep(6, 0.5);
check('CFL timestep shrinks in shallows', dtShallow > dtDeep,
  `deep ${(dtDeep * 1000).toFixed(1)} ms vs shallow ${(dtShallow * 1000).toFixed(1)} ms at 6 m cells`);
check('ring spacing grows with distance', ringSpacing(4, 8, P) > ringSpacing(4, 2, P),
  `${ringSpacing(4, 2, P)} m vs ${ringSpacing(4, 8, P)} m`);
report();
