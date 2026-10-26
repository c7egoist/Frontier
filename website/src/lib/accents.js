/*==============================================================================================
                                          ACCENTS
  The ten accent swatches from the Frontier theme (ThemeStructure — AccentCategory).
==============================================================================================*/

export const ACCENT_STORAGE_KEY = 'coastroad.accent'

export const ACCENTS = [
  { id: 'white',   label: 'White',   hex: '#FFFFFF' },
  { id: 'orange',  label: 'Orange',  hex: '#F97316' },
  { id: 'amber',   label: 'Amber',   hex: '#F59E0B' },
  { id: 'lime',    label: 'Lime',    hex: '#84CC16' },
  { id: 'emerald', label: 'Emerald', hex: '#10B981' },
  { id: 'cyan',    label: 'Cyan',    hex: '#06B6D4' },
  { id: 'blue',    label: 'Blue',    hex: '#3B82F6' },
  { id: 'violet',  label: 'Violet',  hex: '#8B5CF6' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#D946EF' },
  { id: 'rose',    label: 'Rose',    hex: '#F43F5E' },
]

export const DEFAULT_ACCENT = 'blue'

export function applyAccent(id) {
  const accent = ACCENTS.find((entry) => entry.id === id) ?? ACCENTS.find((entry) => entry.id === DEFAULT_ACCENT)
  document.documentElement.style.setProperty('--accent', accent.hex)
  return accent.id
}
