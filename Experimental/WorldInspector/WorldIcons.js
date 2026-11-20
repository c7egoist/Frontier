// WorldIcons.js — flat 24-unit stroke icons for the World Inspector cards (same grammar as MaterialInspector/Icons.js:
// 1.6 stroke, round caps, currentColor).  Names the shared set lacks live here; everything else falls through to it.

import { icon as SharedIcon } from "../MaterialInspector/Icons.js";

const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  cloud: '<path d="M7 18.5h10.2a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.4 4.6 4.6 0 0 0 7 18.5Z"/>',
  moon: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1Z"/>',
  star: '<path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7Z"/>',
  atmosphere: '<path d="M3 19.5h18"/><path d="M5 19.5a7 7 0 0 1 14 0"/><path d="M8.2 19.5a3.8 3.8 0 0 1 7.6 0" opacity=".6"/><path d="M2 12.5c3-1 5-1 7 0s4 1 7 0 4-1 6 0" opacity=".45"/>',
  flare: '<circle cx="6.5" cy="7" r="2.6"/><circle cx="13" cy="13" r="1.4"/><circle cx="17.5" cy="17.5" r="2.4" opacity=".6"/><path d="M3 4l18 18" opacity=".35"/>',
  exposure: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 20.5 20.5 3.5"/><path d="M6.5 8h4M8.5 6v4M13.5 16h4"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2.2"/><path d="m16 10.5 5-3v9l-5-3"/><circle cx="9.5" cy="12" r="2.3"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 15h15a3 3 0 1 1-3 3"/><path d="M3 12h7" opacity=".55"/>',
  fog: '<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
  rain: '<path d="M7 14.5h10.2a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 8 6.2a4.1 4.1 0 0 0-1 8.3Z"/><path d="m8 17.5-1 3M12.5 17.5l-1 3M17 17.5l-1 3"/>',
  rainbow: '<path d="M2.5 18a9.5 9.5 0 0 1 19 0"/><path d="M6 18a6 6 0 0 1 12 0" opacity=".7"/><path d="M9.5 18a2.5 2.5 0 0 1 5 0" opacity=".45"/>',
  light: '<rect x="4" y="4" width="16" height="5" rx="1.6"/><path d="M6 12l-2 7M12 12v7M18 12l2 7" opacity=".6"/>',
  object: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9" opacity=".6"/>',
  group: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.8" opacity=".5"/>',
  grid4: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>',
};

export function Icon(Name, Size = 16) {
  if (!P[Name]) return SharedIcon(Name, Size);
  return `<svg width="${Size}" height="${Size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[Name]}</svg>`;
}

export const WORLD_ICONS = Object.keys(P);
