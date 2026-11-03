// Loads .wgsl files as text. Vite serves them with ?raw so the editor has no fetch round trip
// at runtime and shaders stay hot-reloadable in dev.

import common from '../gpu/shaders/common.wgsl?raw';
import sky from '../gpu/shaders/sky.wgsl?raw';
import oceanSim from '../gpu/shaders/ocean_sim.wgsl?raw';
import oceanFft from '../gpu/shaders/ocean_fft.wgsl?raw';
import oceanResolve from '../gpu/shaders/ocean_resolve.wgsl?raw';
import oceanSurface from '../gpu/shaders/ocean_surface.wgsl?raw';
import simShallow from '../gpu/shaders/sim_shallow.wgsl?raw';
import terrain from '../gpu/shaders/terrain.wgsl?raw';
import horizon from '../gpu/shaders/horizon.wgsl?raw';
import cities from '../gpu/shaders/cities.wgsl?raw';
import map from '../gpu/shaders/map.wgsl?raw';
import waterColumn from '../gpu/shaders/water_column.wgsl?raw';
import post from '../gpu/shaders/post.wgsl?raw';
import type { ShaderKey } from '../gpu/pipelines.ts';

export const SHADER_SOURCES: Record<ShaderKey, string> = {
  common, sky, oceanSim, oceanFft, oceanResolve, oceanSurface, simShallow,
  terrain, horizon, cities, map, waterColumn, post,
};
