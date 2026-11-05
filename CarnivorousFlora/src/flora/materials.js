import * as THREE from 'three';
import { petalTextures, stemTexture, skinTexture, eyeTexture } from '../gfx/textures.js';
import { patchFlora } from '../gfx/shaderPatches.js';

const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

export function petalMaterial(preset, { trans = 0.7, sheen = '#ffffff', tint = null, bump = 1.2 } = {}) {
  return memo('petal_' + preset, () => {
    const t = petalTextures(preset);
    const m = new THREE.MeshPhysicalMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: bump, roughnessMap: t.rough, roughness: 0.62,
      side: THREE.DoubleSide, sheen: 0.6, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.45,
      envMapIntensity: 0.55,
    });
    return patchFlora(m, { trans, transTint: tint });
  });
}

export function leafMaterial(preset, { trans = 0.55 } = {}) {
  return memo('leaf_' + preset, () => {
    const t = petalTextures(preset);
    const m = new THREE.MeshPhysicalMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: 1.6, roughnessMap: t.rough, roughness: 0.5,
      side: THREE.DoubleSide, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.7,
    });
    return patchFlora(m, { trans, transTint: '#9bd05a' });
  });
}

export function stemMaterial(kind) {
  return memo('stem_' + kind, () => {
    const t = stemTexture(kind);
    const m = new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.62, bumpMap: t.map, bumpScale: 0.8, envMapIntensity: 0.5 });
    return patchFlora(m, { trans: 0.15, transTint: '#bcd36a' });
  });
}

export function thornMaterial() {
  return memo('thorn', () => patchFlora(new THREE.MeshStandardMaterial({ color: '#3b2a24', roughness: 0.45, side: THREE.DoubleSide }), { trans: 0.05 }));
}

export function antherMaterial(kind) {
  return memo('anther_' + kind, () => patchFlora(new THREE.MeshStandardMaterial({
    color: kind === 'lily' ? '#e8a21e' : '#e5b568', roughness: 0.55, emissive: kind === 'lily' ? '#8a4a00' : '#7a4a10', emissiveIntensity: 0.25,
  }), { trans: 0.3, transTint: '#ffcf7a' }));
}

export function columnMaterial() {
  return memo('column', () => patchFlora(new THREE.MeshPhysicalMaterial({
    color: '#f4eee0', roughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color('#fff4e0'),
  }), { trans: 0.5 }));
}

export function filamentMaterial() {
  return memo('filament', () => patchFlora(new THREE.MeshPhysicalMaterial({
    color: '#d4458c', roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffd0e4'), emissive: '#5a0a2c', emissiveIntensity: 0.25,
  }), { trans: 0.6, transTint: '#ff7ab0' }));
}

// ---- predator-only materials ---------------------------------------------
export function skinMaterial(kind) {
  return memo('skinmat_' + kind, () => {
    const s = skinTexture(kind);
    const m = new THREE.MeshPhysicalMaterial({
      map: s.map, bumpMap: s.bump, bumpScale: kind === 'bone' ? 2.0 : 3.0,
      roughness: kind === 'bone' ? 0.42 : 0.5, clearcoat: kind === 'bone' ? 0.5 : 0.2, clearcoatRoughness: 0.35,
      sheen: 0.4, sheenColor: new THREE.Color(kind === 'bone' ? '#fff3dd' : '#ff9ac4'), envMapIntensity: 0.7,
    });
    m.userData.noWind = true;
    return patchFlora(m, { trans: kind === 'bone' ? 0.35 : 0.2, transTint: kind === 'bone' ? '#ffd9a0' : '#ff7aa8', wind: false });
  });
}

export function interiorMaterial(kind) {
  return memo('interior_' + kind, () => {
    const m = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2,
      emissive: kind === 'orchid' ? '#7a2a05' : '#5a0a35', emissiveIntensity: 0.55, side: THREE.BackSide,
      sheen: 0.5, sheenColor: new THREE.Color('#ffb070'),
    });
    return patchFlora(m, { trans: 0.0, wind: false });
  });
}

export function toothMaterial(kind) {
  return memo('tooth_' + kind, () => patchFlora(new THREE.MeshPhysicalMaterial(
    kind === 'fang'
      ? { color: '#f3e4c4', roughness: 0.3, clearcoat: 0.6, emissive: '#b0540a', emissiveIntensity: 0.35, side: THREE.DoubleSide }
      : { color: '#2e211d', roughness: 0.35, clearcoat: 0.4, side: THREE.DoubleSide }
  ), { trans: 0.1, wind: false }));
}

export function eyeMaterial() {
  return memo('eye', () => new THREE.MeshPhysicalMaterial({
    map: eyeTexture(), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6,
    emissive: '#4a5a10', emissiveIntensity: 0.18, emissiveMap: eyeTexture(),
  }));
}

export function lamellaMaterial() {
  return memo('lamella', () => {
    const t = petalTextures('orchidInner');
    const m = new THREE.MeshPhysicalMaterial({
      map: t.map, bumpMap: t.bump, roughness: 0.4, side: THREE.DoubleSide, emissive: '#7a3a08', emissiveIntensity: 0.5,
    });
    return patchFlora(m, { trans: 0.8, transTint: '#ff9a3a', wind: false });
  });
}
