import common from './shaders/common.wgsl?raw';
import sim from './shaders/sim.wgsl?raw';
import derive from './shaders/derive.wgsl?raw';
import ocean from './shaders/ocean.wgsl?raw';
import sky from './shaders/sky.wgsl?raw';
import terrain from './shaders/terrain.wgsl?raw';
import spray from './shaders/spray.wgsl?raw';
import sprayDraw from './shaders/spray_draw.wgsl?raw';

const files: Record<string, string> = { 'common.wgsl': common };

/** Minimal `#include "x.wgsl"` resolver. */
export function resolve(src: string): string {
  return src.replace(/^#include\s+"([^"]+)"\s*$/gm, (_, f: string) => files[f] ?? '');
}

/** Substitute mesh-resolution constants so quality presets can rescale the LOD mesh. */
export function withMesh(src: string, rings: number, radial: number): string {
  return src
    .replace(/let RA : u32 = 256u;/g, `let RA : u32 = ${radial}u;`)
    .replace(/f32\(ri\) \/ 192\.0/g, `f32(ri) / ${rings}.0`);
}

export const SRC = { sim, derive, ocean, sky, terrain, spray, sprayDraw };
