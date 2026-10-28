import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FIELD_RES, FIELD_TEX_H, FIELD_TEX_W, FIELD_TILES_X, FIELD_TILES_Y, fieldBounds } from '../src/viewer/interaction';

describe('interaction field bounds', () => {
  it('packs 32 slices into the 2-D atlas', () => {
    expect(FIELD_TILES_X * FIELD_TILES_Y).toBe(FIELD_RES);
    expect(FIELD_TEX_W).toBe(FIELD_RES * FIELD_TILES_X);
    expect(FIELD_TEX_H).toBe(FIELD_RES * FIELD_TILES_Y);
  });

  it('covers the plant, its collider shell and a little soil, never thinner than a metre', () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.3, -0.02, -0.4), new THREE.Vector3(0.5, 2.7, 0.2));
    const b = fieldBounds(box, 0.5);
    const max = b.min.clone().add(b.size);
    // The box and the shell round a collider touching it are inside.
    expect(b.min.x).toBeLessThanOrEqual(box.min.x - 0.8);
    expect(b.min.z).toBeLessThanOrEqual(box.min.z - 0.8);
    expect(max.x).toBeGreaterThanOrEqual(box.max.x + 0.8);
    expect(max.z).toBeGreaterThanOrEqual(box.max.z + 0.8);
    expect(max.y).toBeGreaterThanOrEqual(box.max.y + 0.8);
    // Floor just below the soil so buried rings sit inside the field.
    expect(b.min.y).toBeLessThan(box.min.y);
    expect(b.min.y).toBeGreaterThan(box.min.y - 0.3);
    expect(Math.min(b.size.x, b.size.y, b.size.z)).toBeGreaterThanOrEqual(1);
  });

  it('keeps tiny plants in a box that is not degenerate and stays centred', () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.05, 0, -0.05), new THREE.Vector3(0.05, 0.1, 0.05));
    const b = fieldBounds(box, 0.06);
    expect(b.size.x).toBeGreaterThanOrEqual(1);
    expect(b.size.z).toBeGreaterThanOrEqual(1);
    expect(b.size.y).toBeGreaterThanOrEqual(1);
    const cx = b.min.x + b.size.x / 2;
    const cz = b.min.z + b.size.z / 2;
    expect(Math.abs(cx)).toBeLessThan(1e-9);
    expect(Math.abs(cz)).toBeLessThan(1e-9);
  });

  it('grows with the plant so tall trees are covered with sensible padding', () => {
    const box = new THREE.Box3(new THREE.Vector3(-6, -0.5, -6), new THREE.Vector3(6, 30, 6));
    const b = fieldBounds(box, 0.5);
    expect(b.min.y).toBeLessThan(-0.5);
    expect(b.min.y + b.size.y).toBeGreaterThan(30 + 7);
    expect(b.size.x).toBeGreaterThan(12 + 14);
  });
});
