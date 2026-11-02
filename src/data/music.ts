export interface Track {
  id: string
  title: string
  artist: string
  album: string
  length: number
  accent: string
  palette: [string, string, string]
  art: 'orbit' | 'flow' | 'signal' | 'bloom' | 'circles'
  glyph: string
}

export const tracks: Track[] = [
  {
    id: 't1',
    title: 'Ash Line',
    artist: 'Pale Lantern',
    album: 'The Hollow Orchard — OST',
    length: 263,
    accent: '#d7e6a1',
    palette: ['#080f07', '#1e3513', '#dbeaa6'],
    art: 'orbit',
    glyph: 'AL',
  },
  {
    id: 't2',
    title: 'Axiom Drift',
    artist: 'Kestrel Sound Lab',
    album: 'Voidrunner — Original Score',
    length: 214,
    accent: '#3ef0d0',
    palette: ['#031619', '#0a4a4d', '#5ef7d6'],
    art: 'signal',
    glyph: 'AD',
  },
  {
    id: 't3',
    title: 'Low Tide, Long Exposure',
    artist: 'Northwind Collective',
    album: 'Pale Tide — Studies',
    length: 341,
    accent: '#8fe0ff',
    palette: ['#020f19', '#082b42', '#93e2ff'],
    art: 'flow',
    glyph: 'LT',
  },
  {
    id: 't4',
    title: 'Glasshouse, 4AM',
    artist: 'Pale Lantern',
    album: 'The Hollow Orchard — OST',
    length: 188,
    accent: '#b6ff7a',
    palette: ['#03120a', '#0b3a22', '#b6ff7a'],
    art: 'bloom',
    glyph: 'G4',
  },
  {
    id: 't5',
    title: 'Static Union',
    artist: 'Static Union',
    album: 'Gridlock 2077 — OST',
    length: 256,
    accent: '#b48bff',
    palette: ['#08040f', '#24103f', '#c4a0ff'],
    art: 'circles',
    glyph: 'SU',
  },
]

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
