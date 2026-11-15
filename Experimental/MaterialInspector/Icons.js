// Inline stroke icons (24 px grid, 1.6 stroke) — same drawing rules as the Component Viewer / Fracture Editor sets.
const P = {
  material: '<circle cx="12" cy="12" r="8.5"/><path d="M6.2 9.2c2.6-2.2 6.4-2.6 9.6-.4" opacity=".6"/><circle cx="9.5" cy="9" r="1.2" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3.5V8h4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  value: '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
  field: '<path d="M4 15c2-4 4 2 6-2s4 2 6-2 3 1 4 0"/><path d="M4 9c2-4 4 2 6-2s4 2 6-2 3 1 4 0" opacity=".5"/>',
  ramp: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M7 18 17 6" opacity=".55"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  pattern: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><path d="M13 4h7v7M4 13v7h7" opacity=".5"/>',
  surface: '<path d="M3.5 15.5 12 20l8.5-4.5L12 11z"/><path d="M12 11V4" opacity=".4"/>',
  coat: '<path d="M3.5 13.5 12 18l8.5-4.5L12 9z"/><path d="M5 10.5c3-3.5 11-3.5 14 0" opacity=".6"/>',
  flakes: '<path d="m7 7 1 2.5L10.5 10 8 11l-1 2.5L6 11l-2.5-1L6 9.5zM16 11l.8 1.9 1.9.8-1.9.8L16 16.4l-.8-1.9-1.9-.8 1.9-.8zM15 4l.5 1.2 1.2.5-1.2.5L15 7.4l-.5-1.2-1.2-.5 1.2-.5z"/>',
  detail: '<path d="M4 18 18 4"/><path d="M4 12 12 4M10 18l8-8" opacity=".55"/><path d="M15 20h5v-5" opacity=".4"/>',
  sliders: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  more: '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>',
};

export function icon(Name, Size = 16) {
  return `<svg width="${Size}" height="${Size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[Name] || P.material}</svg>`;
}

export const ICONS = Object.keys(P);
