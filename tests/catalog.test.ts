import { describe, expect, it } from 'vitest';
import {
  SOUNDS,
  SOUND_ALIASES,
  SOUND_CATEGORIES,
  getSound,
  listSounds,
  normalizeId,
  searchSounds,
} from '../src/catalog';
import { LEVEL_TRIMS } from '../src/catalog/levels';

describe('catalog integrity', () => {
  it('ships a substantial, unique catalog', () => {
    expect(SOUNDS.length).toBeGreaterThanOrEqual(60);
    const ids = SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map(normalizeId)).size).toBe(ids.length);
  });

  it('uses only valid categories', () => {
    const valid = new Set(SOUND_CATEGORIES.map((c) => c.id));
    for (const sound of SOUNDS) {
      expect(valid.has(sound.category)).toBe(true);
    }
    // Every category has at least one sound.
    for (const category of SOUND_CATEGORIES) {
      expect(SOUNDS.some((s) => s.category === category.id)).toBe(true);
    }
  });

  it('gives every sound complete, sane metadata', () => {
    for (const sound of SOUNDS) {
      expect(sound.name.length).toBeGreaterThan(1);
      expect(sound.description.length).toBeGreaterThan(10);
      expect(sound.duration).toBeGreaterThan(0.05);
      expect(sound.duration).toBeLessThan(5);
      expect(sound.tags.length).toBeGreaterThan(0);
      expect(sound.tags.length).toBeLessThanOrEqual(6);
      expect(typeof sound.create).toBe('function');
    }
  });

  it('has a measured level trim for every sound', () => {
    for (const sound of SOUNDS) {
      expect(Object.prototype.hasOwnProperty.call(LEVEL_TRIMS, sound.id)).toBe(true);
      expect(Number.isFinite(LEVEL_TRIMS[sound.id])).toBe(true);
      expect(Math.abs(LEVEL_TRIMS[sound.id])).toBeLessThanOrEqual(24);
    }
  });

  it('wires every alias to a real sound without collisions', () => {
    const canonical = new Set(SOUNDS.map((s) => normalizeId(s.id)));
    expect(Object.keys(SOUND_ALIASES).length).toBeGreaterThan(10);
    for (const [alias, target] of Object.entries(SOUND_ALIASES)) {
      expect(canonical.has(normalizeId(target))).toBe(true);
      expect(canonical.has(normalizeId(alias))).toBe(false);
      expect(getSound(alias)?.id).toBe(getSound(target)?.id);
    }
  });

  it('resolves ids forgivingly', () => {
    expect(getSound('powerOn')?.id).toBe('powerOn');
    expect(getSound('Power On')?.id).toBe('powerOn');
    expect(getSound('power_on')?.id).toBe('powerOn');
    expect(getSound('POWER-ON')?.id).toBe('powerOn');
    expect(getSound('boot')?.id).toBe('powerOn');
    expect(getSound('charging')?.id).toBe('charging');
    expect(getSound('nope-not-a-sound')).toBeUndefined();
  });

  it('keeps the hero sounds the brief asked for', () => {
    for (const id of ['powerOn', 'pulse', 'charging', 'unlock', 'complete']) {
      expect(getSound(id), `missing ${id}`).toBeDefined();
    }
  });

  it('lists metadata without leaking synth functions', () => {
    const list = listSounds();
    expect(list.length).toBe(SOUNDS.length);
    expect(list[0]).not.toHaveProperty('create');
    const system = listSounds('system');
    expect(system.length).toBeGreaterThan(5);
    expect(system.every((s) => s.category === 'system')).toBe(true);
  });

  it('searches across names, tags and intent', () => {
    expect(searchSounds('charging').map((s) => s.id)).toContain('charging');
    expect(searchSounds('reactor').map((s) => s.id)).toContain('powerOn');
    expect(searchSounds('mechanical').length).toBeGreaterThan(2);
    expect(searchSounds('notification').map((s) => s.id)).toContain('notify');
    expect(searchSounds('zzzzz')).toEqual([]);
  });

  it('never uses retro waveform families', () => {
    // A crude but useful guard: no square/sawtooth oscillators in the catalog.
    const source = SOUNDS.map((s) => s.create.toString()).join('\n');
    expect(source).not.toMatch(/type:\s*['"](square|sawtooth)['"]/);
  });
});
