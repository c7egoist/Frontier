// Inline SVG icons (stroke style, 16px grid). Kept as strings so the UI needs no icon font.
const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  select: P('M4 2l8 6-3.6.8L10 14l-1.8.8-2.2-5.2L4 11z'),
  move: P('M8 1v14M1 8h14M8 1l-2 2M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2'),
  road: P('M3 13c3-1 2-6 5-6s2-5 5-4'),
  junction: '<circle cx="8" cy="8" r="3"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/>',
  area: P('M3 4l9-2 1 9-8 3z'),
  exchange: '<path d="M2 8h12M8 2v12"/><circle cx="8" cy="8" r="3.2"/>',
  undo: P('M5 4L2 7l3 3M2 7h7a4 4 0 010 8H7'),
  redo: P('M11 4l3 3-3 3M14 7H7a4 4 0 000 8h2'),
  trash: P('M3 4h10M6 4V2h4v2M5 4l.6 10h4.8L11 4'),
  file: P('M4 1h6l3 3v11H4zM10 1v3h3'),
  download: P('M8 2v8M4.5 6.5L8 10l3.5-3.5M2 13h12'),
  upload: P('M8 10V2M4.5 5.5L8 2l3.5 3.5M2 13h12'),
  eye: '<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>',
  grid: '<path d="M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  warn: P('M8 2l6.5 12h-13zM8 6.5v3.5M8 12v.5'),
  plus: P('M8 3v10M3 8h10'),
  split: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M8 2.5v11"/>',
  help: '<circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.2a1.9 1.9 0 113 1.6c-.7.4-1.2.8-1.2 1.7M8 11.8v.4"/>',
};

export function icon(name, size = 16) {
  const body = ICONS[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
