export type ArtVariant =
  | 'orbit'
  | 'monolith'
  | 'ribbons'
  | 'bloom'
  | 'grid'
  | 'flow'
  | 'circuit'
  | 'swarm'
  | 'shards'
  | 'signal'
  | 'tiles'

export type InstallState = 'installed' | 'update' | 'available' | 'downloading' | 'queued'

export interface Achievement {
  id: string
  name: string
  desc: string
  rarity: number
  unlocked: boolean
  xp: number
}

export interface Trait {
  label: string
  value: number
}

export interface Game {
  id: string
  title: string
  studio: string
  year: number
  genres: string[]
  tags: string[]
  score: number
  players: string
  size: number
  state: InstallState
  progress: number
  playtime: number
  lastPlayed: string
  price: number | null
  accent: string
  palette: [string, string, string]
  art: ArtVariant
  glyph: string
  tagline: string
  description: string
  features: string[]
  traits: Trait[]
  achievements: Achievement[]
  version: string
  engine: string
  featured?: boolean
}

export interface Friend {
  id: string
  name: string
  handle: string
  status: 'in-game' | 'online' | 'away' | 'offline'
  game?: string
  playtime: string
  accent: string
  rank: number
  initials: string
}

export interface DownloadItem {
  id: string
  title: string
  studio: string
  status: 'active' | 'paused' | 'queued' | 'done'
  progress: number
  size: number
  speed: number
  eta: string
  accent: string
  palette: [string, string, string]
  art: ArtVariant
}

export interface Palette {
  id: string
  name: string
  hex: string
}
