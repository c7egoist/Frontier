import * as THREE from 'three';
import { deckTexture, windowTexture, hazardTexture, chevronTexture } from './utils.js';

const hdr = (r, g, b, extra = {}) =>
  new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(r, g, b), toneMapped: true }, extra));

export function createMaterials() {
  const deck = deckTexture();
  deck.repeat.set(1, 1);
  const chev = chevronTexture();
  chev.repeat.set(1, 1);
  const win = windowTexture();
  win.repeat.set(1, 1);
  const haz = hazardTexture();
  haz.repeat.set(1, 1);

  const neonC = hdr(0.22, 1.75, 2.3);
  const neonM = hdr(2.1, 0.28, 1.75);
  const neonL = hdr(1.05, 2.1, 0.22);
  const neonA = hdr(2.3, 1.0, 0.14);
  const neonW = hdr(1.7, 1.9, 2.3);

  const route = new THREE.MeshBasicMaterial({
    map: chev,
    color: new THREE.Color(0.3, 1.35, 1.9),
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });

  return {
    deck: new THREE.MeshStandardMaterial({
      map: deck, color: new THREE.Color(0.85, 0.88, 1.0),
      roughness: 0.52, metalness: 0.42,
      emissive: new THREE.Color(0.03, 0.06, 0.14), emissiveIntensity: 1,
      side: THREE.DoubleSide,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.055, 0.05, 0.1), roughness: 0.42, metalness: 0.72,
      side: THREE.DoubleSide,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.09, 0.09, 0.14), roughness: 0.35, metalness: 0.9,
      side: THREE.DoubleSide,
    }),
    plaza: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.26, 0.33, 0.48), roughness: 0.72, metalness: 0.18,
      emissive: new THREE.Color(0.02, 0.055, 0.10), emissiveIntensity: 1,
      side: THREE.DoubleSide,
    }),
    park: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.13, 0.15, 0.22), roughness: 0.65, metalness: 0.25,
      side: THREE.DoubleSide,
    }),
    tunnel: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.04, 0.04, 0.08), roughness: 0.34, metalness: 0.85,
      emissive: new THREE.Color(0.02, 0.10, 0.16), emissiveIntensity: 1,
      side: THREE.DoubleSide,
    }),
    building: new THREE.MeshStandardMaterial({
      map: win, emissiveMap: win, emissive: new THREE.Color(0.55, 0.62, 0.95), emissiveIntensity: 1.35,
      color: new THREE.Color(0.5, 0.55, 0.75), roughness: 0.9, metalness: 0.1,
    }),
    signs: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
    hazard: new THREE.MeshStandardMaterial({
      map: haz, color: new THREE.Color(0.9, 0.9, 1), roughness: 0.55, metalness: 0.35,
      emissive: new THREE.Color(0.35, 0.2, 0.05), emissiveIntensity: 1,
      side: THREE.DoubleSide,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
    neonC, neonM, neonL, neonA, neonW,
    route,
    coin: hdr(1.0, 2.2, 1.4),
    coinGlow: new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.6, 1.6, 0.9), transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    pad: hdr(0.4, 1.6, 2.2, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    glass: new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.2, 0.9, 1.6), transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  };
}
