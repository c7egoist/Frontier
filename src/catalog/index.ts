import type { SoundCategory, SoundMeta } from '../types';
import type { SoundDef } from '../core/defs';
import { coreSounds } from './core';
import { navigationSounds } from './navigation';
import { feedbackSounds } from './feedback';
import { systemSounds } from './system';
import { cinematicSounds } from './cinematic';
import { dataSounds } from './data';
import { statusSounds } from './status';

/**
 * The complete catalog. Order is deliberate: it is also the order used by
 * documentation, the demo UI and the test snapshot.
 */
export const SOUNDS: readonly SoundDef[] = Object.freeze([
  ...coreSounds,
  ...navigationSounds,
  ...feedbackSounds,
  ...systemSounds,
  ...cinematicSounds,
  ...dataSounds,
  ...statusSounds,
]);

export interface CategoryInfo {
  id: SoundCategory;
  name: string;
  description: string;
}

export const SOUND_CATEGORIES: readonly CategoryInfo[] = Object.freeze([
  {
    id: 'core',
    name: 'Core',
    description: 'Clicks, ticks and hovers — the texture of direct manipulation.',
  },
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'Focus moves, view transitions and menu reveals.',
  },
  {
    id: 'feedback',
    name: 'Feedback',
    description: 'Confirmations, completions, errors, alerts and notifications.',
  },
  {
    id: 'system',
    name: 'System',
    description: 'Power, reactor pulses, charging, locks and scans.',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Whooshes, impacts and risers for scene-level transitions.',
  },
  {
    id: 'data',
    name: 'Data',
    description: 'Transfers, saves, syncs and fine-grained progress.',
  },
  {
    id: 'status',
    name: 'Status',
    description: 'Heartbeat, sonar, shields and ambient HUD states.',
  },
]);

/** Normalises an id for forgiving lookup: `Power-On`, `power_on` → `poweron`. */
export function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Friendly aliases. Keys are normalised too, so aliases work with any casing
 * or separator style. Canonical ids always win over aliases.
 */
export const SOUND_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // system
  power: 'powerOn',
  powerup: 'powerOn',
  startup: 'powerOn',
  boot: 'powerOn',
  reactor: 'pulse',
  charge: 'charging',
  recharge: 'charging',
  charged: 'chargeComplete',
  shutdown: 'powerDown',
  autorized: 'unlock',
  authorized: 'unlock',
  // feedback
  done: 'complete',
  finish: 'complete',
  finished: 'complete',
  completed: 'complete',
  ok: 'confirm',
  accept: 'confirm',
  notification: 'notify',
  notif: 'notify',
  fail: 'error',
  failure: 'error',
  // navigation / core
  button: 'click',
  hoverSound: 'hover',
  switchOn: 'toggleOn',
  switchOff: 'toggleOff',
  // cinematic / status
  swoosh: 'whoosh',
  boom: 'impact',
  build: 'riser',
  ping: 'sonar',
  chat: 'message',
  incomingMessage: 'message',
  // data
  loading: 'progressTick',
  progress: 'progressTick',
  saved: 'save',
  removed: 'delete',
});

const byNormalized = new Map<string, SoundDef>();
for (const sound of SOUNDS) {
  const key = normalizeId(sound.id);
  if (byNormalized.has(key)) {
    throw new Error(`Duplicate sound id: "${sound.id}"`);
  }
  byNormalized.set(key, sound);
}

const aliasMap = new Map<string, string>();
for (const [alias, target] of Object.entries(SOUND_ALIASES)) {
  const key = normalizeId(alias);
  const resolved = byNormalized.get(normalizeId(target));
  if (!resolved) {
    throw new Error(`Alias "${alias}" points at unknown sound "${target}"`);
  }
  if (byNormalized.has(key)) {
    throw new Error(`Alias "${alias}" collides with a canonical sound id`);
  }
  aliasMap.set(key, resolved.id);
}

if (SOUNDS.length === 0) {
  throw new Error('The Frontier Audio catalog is empty.');
}

/** Resolve any id/alias/format variant to a definition, or undefined. */
export function getSound(id: string): SoundDef | undefined {
  const key = normalizeId(id);
  const direct = byNormalized.get(key);
  if (direct) return direct;
  const alias = aliasMap.get(key);
  return alias ? byNormalized.get(normalizeId(alias)) : undefined;
}

/** All catalog metadata (no synth functions) — useful for docs and menus. */
export function listSounds(category?: SoundCategory): SoundMeta[] {
  return SOUNDS.filter((s) => !category || s.category === category).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    duration: s.duration,
    tags: s.tags,
    variants: s.variants,
    minInterval: s.minInterval,
  }));
}

/** Fuzzy-ish search over name, id, description and tags. */
export function searchSounds(query: string): SoundMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return listSounds();
  const terms = q.split(/\s+/);
  return listSounds().filter((sound) => {
    const haystack = [sound.id, sound.name, sound.description, sound.category, ...sound.tags]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export type { SoundDef };
