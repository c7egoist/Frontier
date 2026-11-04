import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { parser } from '@shaderfrog/glsl-parser';

import { LandscapeOceanSimulation } from '../src/app/landscape-ocean.js';
import {
  OCEAN_FRAGMENT,
  OCEAN_VERTEX,
  SKY_FRAGMENT,
  SKY_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
} from '../src/app/landscape-shaders.js';

/**
 * Real GLSL parsing, not pattern matching.
 *
 * The browser is the only place the shaders are actually compiled, and this
 * suite must catch breakage before it reaches one. `@shaderfrog/glsl-parser`
 * parses GLSL ES 3.0, so each stage is fed exactly what three.js r170 prepends
 * for a `ShaderMaterial`: the 300 es header, the `varying`/`texture2D` defines
 * and the injected `pc_fragColor` output. Duplicate uniforms and malformed
 * expressions are hard errors; unknown identifiers are warnings.
 */

const VERTEX_PREFIX = `#version 300 es
#define attribute in
#define varying out
#define texture2D texture
`;

const FRAGMENT_PREFIX = `#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
`;

// three.js's own built-ins plus our injected output, so they are not reported.
const KNOWN = new Set([
  'position', 'normal', 'uv', 'color', 'cameraPosition',
  'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix',
  'gl_Position', 'gl_FragCoord', 'gl_PointSize', 'gl_FragColor', 'pc_fragColor',
  'gl_FrontFacing', 'gl_PointCoord', 'gl_FragCoord',
]);

/** Compiles one stage, returning hard errors and unexpected warnings. */
function compile(source, stage) {
  const prefix = stage === 'vertex' ? VERTEX_PREFIX : FRAGMENT_PREFIX;
  const hard = [];
  const soft = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args.map(String).join(' ');
    // Duplicate declarations and syntax problems are fatal to a GLSL compiler.
    if (/duplicate/i.test(message)) hard.push(message);
    else soft.push(message);
  };
  try {
    parser.parse(prefix + source);
  } catch (error) {
    hard.push(String(error.message).split('\n')[0]);
  } finally {
    console.warn = originalWarn;
  }
  const unexpected = soft.filter((message) => {
    const match = message.match(/"([^"]+)"/);
    if (!match) return true;
    return !KNOWN.has(match[1]);
  });
  return { hard, unexpected };
}

function makeOceanSim() {
  const noop = () => {};
  const renderer = {
    domElement: { addEventListener: noop, removeEventListener: noop },
    setPixelRatio: noop,
    setSize: noop,
    setClearColor: noop,
    setRenderTarget: noop,
    getRenderTarget: () => null,
    getPixelRatio: () => 1,
    getContext: () => ({ getExtension: () => ({}) }),
    render: noop,
    clear: noop,
    dispose: noop,
  };
  return new LandscapeOceanSimulation(renderer, new THREE.Scene(), { spanMeters: 30_000, resolution: 64 });
}

test('every landscape shader stage compiles as GLSL ES 3.0', () => {
  const sim = makeOceanSim();
  const stages = [
    ['terrain', 'vertex', TERRAIN_VERTEX],
    ['terrain', 'fragment', TERRAIN_FRAGMENT],
    ['ocean-surface', 'vertex', OCEAN_VERTEX],
    ['ocean-surface', 'fragment', OCEAN_FRAGMENT],
    ['sky', 'vertex', SKY_VERTEX],
    ['sky', 'fragment', SKY_FRAGMENT],
    ['ocean-init', 'vertex', sim.initMaterial.vertexShader],
    ['ocean-init', 'fragment', sim.initMaterial.fragmentShader],
    ['ocean-flux', 'fragment', sim.fluxMaterial.fragmentShader],
    ['ocean-integrate', 'fragment', sim.integrateMaterial.fragmentShader],
  ];
  for (const [name, stage, source] of stages) {
    const { hard, unexpected } = compile(source, stage);
    assert.deepEqual(hard, [], `${name} ${stage} must compile: ${hard.join('; ')}`);
    assert.deepEqual(unexpected, [], `${name} ${stage} references undeclared identifiers: ${unexpected.join('; ')}`);
  }
});

test('no shader stage declares the same uniform twice', () => {
  const sim = makeOceanSim();
  const sources = [
    ['terrain', TERRAIN_VERTEX, TERRAIN_FRAGMENT],
    ['ocean-surface', OCEAN_VERTEX, OCEAN_FRAGMENT],
    ['sky', SKY_VERTEX, SKY_FRAGMENT],
    ['ocean-init', sim.initMaterial.vertexShader, sim.initMaterial.fragmentShader],
    ['ocean-integrate', '', sim.integrateMaterial.fragmentShader],
  ];
  for (const [name, vertex, fragment] of sources) {
    for (const source of [vertex, fragment]) {
      const names = [...source.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map((match) => match[1]);
      const duplicates = names.filter((value, index) => names.indexOf(value) !== index);
      assert.deepEqual([...new Set(duplicates)], [], `${name} declares a uniform twice`);
    }
  }
});

test('uniform blocks shared between stages agree on their types', () => {
  // The ocean vertex and fragment stages both read the simulated state; if the
  // declarations drift apart GLSL links them by name and silently misreads.
  const declared = (source) => {
    const map = new Map();
    for (const match of source.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm)) map.set(match[2], match[1]);
    return map;
  };
  const vertex = declared(OCEAN_VERTEX);
  const fragment = declared(OCEAN_FRAGMENT);
  for (const [name, type] of vertex) {
    if (!fragment.has(name)) continue;
    assert.equal(fragment.get(name), type, `ocean uniform ${name} has conflicting types`);
  }
});
