/**
 * Frontier UI Audio — React bindings (optional, zero hard dep)
 * Works if React is present, no-op otherwise.
 * Import from '@frontier/ui-audio/react' or copy this file.
 */

import { frontierAudio } from './FrontierAudio.js';
import type { SoundName, PlayOptions } from './types.js';

// Lightweight React detection — no import to keep library framework-agnostic
declare global {
  interface Window {
    React?: any;
  }
}

type HookCallback<T extends (...args: any[]) => any> = (cb: T, deps: any[]) => T;

function getReact() {
  try {
    // @ts-ignore
    return (typeof window !== 'undefined' && (window as any).React) || null;
  } catch {
    return null;
  }
}

function useCallbackShim<T extends (...args: any[]) => any>(cb: T): T {
  const r = getReact();
  if (r?.useCallback) return r.useCallback(cb, [cb]);
  return cb;
}

function useRefShim<T>(v: T): { current: T } {
  const r = getReact();
  if (r?.useRef) return r.useRef(v);
  return { current: v };
}

export function useUISound(name: SoundName | string, options: PlayOptions = {}) {
  const optsRef = useRefShim(options);
  optsRef.current = options;

  const play = useCallbackShim(((override?: PlayOptions) => {
    frontierAudio.play(name, { ...optsRef.current, ...override });
  }) as any);

  return play as (override?: PlayOptions) => void;
}

export function useFrontierAudio() {
  return frontierAudio;
}

export function useSoundButton(
  clickSound: SoundName | string = 'click',
  hoverSound: SoundName | string = 'hover'
) {
  const playClick = useUISound(clickSound);
  const playHover = useUISound(hoverSound, { volume: 0.4 });

  return {
    onClick: () => playClick(),
    onMouseEnter: () => playHover(),
    onFocus: () => frontierAudio.play('focus', { volume: 0.35 })
  };
}
