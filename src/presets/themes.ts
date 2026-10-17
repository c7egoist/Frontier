/**
 * Frontier Themes — pitch/volume/reverb variants for different UI personalities
 * All still sleek Iron Man style, just different tunings.
 */

export interface Theme {
  name: string;
  description: string;
  pitch: number;
  volume: number;
  reverb: number;
  humanize: boolean;
}

export const THEMES: Record<string, Theme> = {
  stark: {
    name: 'Stark',
    description: 'Default — bright, glassy, cinematic HUD',
    pitch: 1.0,
    volume: 0.85,
    reverb: 0.22,
    humanize: true
  },
  minimal: {
    name: 'Minimal',
    description: 'Ultra-soft, high, almost invisible — for dense data UIs',
    pitch: 1.25,
    volume: 0.55,
    reverb: 0.12,
    humanize: false
  },
  tactical: {
    name: 'Tactical',
    description: 'Lower, weightier, more mass — for heavy controls',
    pitch: 0.85,
    volume: 0.9,
    reverb: 0.18,
    humanize: true
  },
  ghost: {
    name: 'Ghost',
    description: 'Airy, distant, very wet — for background ambience',
    pitch: 1.1,
    volume: 0.45,
    reverb: 0.42,
    humanize: true
  },
  operator: {
    name: 'Operator',
    description: 'Crisp, dry, immediate — for pro tools',
    pitch: 1.05,
    volume: 0.8,
    reverb: 0.08,
    humanize: false
  }
};
