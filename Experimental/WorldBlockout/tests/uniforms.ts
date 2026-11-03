// Verifies the CPU uniform writers against the WGSL struct layouts parsed from the shaders.
import { readFileSync } from 'node:fs';
import { WgslReflect } from 'wgsl_reflect/wgsl_reflect.module.js';
import { FRAME_FLOATS, F, writeFrame, RING_FLOATS, writeRing, UNIFORM_SPECS, FFT_PARAMS_FLOATS } from '../src/gpu/uniforms.ts';
import { check, report } from './harness.ts';

const read = (f: string) => readFileSync(new URL(`../src/gpu/shaders/${f}`, import.meta.url), 'utf8');

console.log('Uniform layouts');
{
  const src = read('common.wgsl');
  const r = new WgslReflect(src);
  const frame = r.uniforms.find(u => u.name === 'frame')!;
  check('Frame struct size matches host', frame.size === FRAME_FLOATS * 4, `wgsl ${frame.size} B, host ${FRAME_FLOATS * 4} B`);
  const members = frame.members as { name: string; offset: number; size: number }[];
  let allMatch = true;
  const mismatches: string[] = [];
  for (const m of members) {
    const hostOffset = (F as Record<string, number>)[m.name];
    if (hostOffset === undefined || hostOffset * 4 !== m.offset) {
      allMatch = false;
      mismatches.push(`${m.name}: wgsl ${m.offset} B vs host ${(hostOffset ?? -1) * 4} B`);
    }
  }
  check('Frame member offsets match host', allMatch, allMatch ? `${members.length} members` : mismatches.join(', '));
}

for (const [file, structName, specKey] of [
  ['ocean_surface.wgsl', 'RingData', 'RingData'],
  ['ocean_sim.wgsl', 'OceanSim', 'OceanSim'],
  ['ocean_fft.wgsl', 'FFTParams', 'FFTParams'],
  ['ocean_resolve.wgsl', 'ResolveParams', 'ResolveParams'],
  ['sim_shallow.wgsl', 'SimParams', 'SimParams'],
] as const) {
  const r = new WgslReflect(read(file));
  const st = r.structs.find(s => s.name === structName);
  const spec = (UNIFORM_SPECS as Record<string, { floats: number }>)[specKey];
  check(`${structName} (${file}) size matches host`, !!st && st.size === spec.floats * 4,
    st ? `wgsl ${st.size} B, host ${spec.floats * 4} B` : 'struct missing');
}

{
  // Ring struct is 9 floats = 36 B, padded to 48 B by vec2f alignment at the front?
  const r = new WgslReflect(read('ocean_surface.wgsl'));
  const st = r.structs.find(s => s.name === 'RingData')!;
  check('RingData is uniformly aligned to 16 B', st.size % 16 === 0, `${st.size} B`);
}

{
  const buf = new Float32Array(FRAME_FLOATS);
  const vp = new Float32Array(16).fill(2);
  const inv = new Float32Array(16).fill(3);
  writeFrame(buf, {
    viewProj: vp, invViewProj: inv, eye: [10, 20, 30], time: 4.5,
    forward: [0, 0, -1], simRadius: 1500, sunDir: [0.3, 0.5, 0.8], sunIntensity: 3.2,
    sunColor: [1, 0.95, 0.9], exposure: 1.1, fogDensity: 0.00002, cloudCover: 0.4,
    simExtent: 768, simSpacing: 6, simCellMetres: 6, waterLevel: 0,
    screenWidth: 1920, screenHeight: 1080, flatDistance: 25000, horizonDistance: 120000,
    fovY: 1.047, cameraHeight: 500, windDir: [1, 0], windSpeed: 11, choppiness: 1.1,
    cascadeTiles: [512, 64, 8], abyssDepth: 4200, worldSize: 1e7, halfWorld: 5e6,
    spectrumN: 128, gridN: 1024, lodOverlay: false,
  });
  check('writeFrame lays out every field', buf[F.viewProj] === 2 && buf[F.invViewProj] === 3 &&
    buf[F.eye] === 10 && buf[F.eye + 3] === 4.5 && Math.abs(buf[F.screen + 2] - 1 / 1920) < 1e-9 &&
    buf[F.world + 1] === 5e6 && buf[F.cascade + 2] === 8);
}

{
  const padded = new Float32Array(RING_FLOATS);
  writeRing(padded, { origin: [100, 200], spacing: 4, inner: 0, outer: 128, index: 0, regime: 1, quads: 32, amplitude: 0.8 });
  check('writeRing matches struct order', padded[0] === 100 && padded[1] === 200 && padded[2] === 4 &&
    padded[3] === 0 && padded[4] === 128 && padded[5] === 0 && padded[6] === 1 && padded[7] === 32 && Math.abs(padded[8] - 0.8) < 1e-6,
    `${RING_FLOATS * 4} B buffer, amplitude at float 8`);
  check('FFT params are u32 sized', FFT_PARAMS_FLOATS === 4);
}
report();
