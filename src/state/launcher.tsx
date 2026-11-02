import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { games, palettes } from '../data/games'
import type { Game, InstallState } from '../data/types'

export type PageId = 'home' | 'store' | 'library' | 'downloads' | 'network' | 'game'

export interface Route {
  page: PageId
  gameId?: string
}

interface LaunchState {
  game: Game
  step: number
  progress: number
}

interface Toast {
  id: number
  title: string
  detail?: string
  accent?: string
}

interface LauncherValue {
  route: Route
  go: (page: PageId) => void
  openGame: (id: string) => void

  accentId: string
  accent: string
  setAccentId: (id: string) => void

  states: Record<string, InstallState>
  progress: Record<string, number>
  install: (id: string) => void
  launch: (id: string) => void
  stop: () => void
  running: Game | null
  sessionSeconds: number
  launchState: LaunchState | null
  cancelLaunch: () => void

  downloads: Record<string, number>
  paused: Record<string, boolean>
  togglePause: (id: string) => void
  removeDownload: (id: string) => void

  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  controlOpen: boolean
  setControlOpen: (v: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (v: boolean) => void

  toasts: Toast[]
  notify: (title: string, detail?: string, accent?: string) => void
  dismissToast: (id: number) => void

  trackIndex: number
  setTrackIndex: (i: number) => void
  playing: boolean
  setPlaying: (v: boolean) => void
  volume: number
  setVolume: (v: number) => void

  wishlist: string[]
  toggleWishlist: (id: string) => void

  reduceMotion: boolean
  setReduceMotion: (v: boolean) => void
  performanceOverlay: boolean
  setPerformanceOverlay: (v: boolean) => void
  uiScale: number
  setUiScale: (v: number) => void
  instantLaunch: boolean
  setInstantLaunch: (v: boolean) => void
  notifUnread: boolean
  markNotificationsRead: () => void
}

const LauncherContext = createContext<LauncherValue | null>(null)

const initialStates: Record<string, InstallState> = Object.fromEntries(
  games.map((g) => [g.id, g.state]),
)
const initialProgress: Record<string, number> = Object.fromEntries(
  games.map((g) => [g.id, g.progress]),
)

const activeDownloads = ['gridlock', 'ironfall', 'hyperdrift', 'starfall']

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ page: 'home' })
  const [accentId, setAccentId] = useState('ember')
  const [states, setStates] = useState(initialStates)
  const [progress, setProgress] = useState(initialProgress)
  const [running, setRunning] = useState<Game | null>(null)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [launchState, setLaunchState] = useState<LaunchState | null>(null)

  const [downloads, setDownloads] = useState<Record<string, number>>({
    gridlock: 43,
    ironfall: 88,
    hyperdrift: 22,
    starfall: 0,
  })
  const [paused, setPaused] = useState<Record<string, boolean>>({ hyperdrift: true })

  const [searchOpen, setSearchOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(64)
  const [wishlist, setWishlist] = useState<string[]>(['pale-tide', 'lumen'])
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  const [performanceOverlay, setPerformanceOverlay] = useState(false)
  const [uiScale, setUiScale] = useState(1)
  const [instantLaunch, setInstantLaunch] = useState(false)
  const [notifUnread, setNotifUnread] = useState(true)

  const accent = useMemo(
    () => palettes.find((p) => p.id === accentId)?.hex ?? '#ff5a1f',
    [accentId],
  )

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', accent)
    root.style.setProperty(
      '--accent-ink',
      accentId === 'volt' || accentId === 'signal' ? '#0d1405' : accentId === 'ice' ? '#050d1c' : '#120702',
    )
  }, [accent, accentId])

  const notify = useCallback((title: string, detail?: string, accentHex?: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-2), { id, title, detail, accent: accentHex }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const go = useCallback((page: PageId) => {
    setRoute({ page })
    setSearchOpen(false)
  }, [])

  const openGame = useCallback((id: string) => {
    setRoute({ page: 'game', gameId: id })
    setSearchOpen(false)
  }, [])

  /* ---------------------------------------------------------------
     Launch sequence: staged boot animation → running session
     --------------------------------------------------------------- */
  const launch = useCallback(
    (id: string) => {
      const game = games.find((g) => g.id === id)
      if (!game) return
      if (running?.id === id || launchState) return
      setPlaying(false)
      if (instantLaunch) {
        setRunning(game)
        setSessionSeconds(0)
        notify(`${game.title} is live`, 'Launch sequence skipped · profile preset: instant', game.accent)
        return
      }
      setLaunchState({ game, step: 0, progress: 0 })
    },
    [running, launchState, instantLaunch, notify],
  )

  const launchTicking = launchState !== null && launchState.progress < 100

  useEffect(() => {
    if (!launchTicking) return
    const i = window.setInterval(() => {
      setLaunchState((s) => {
        if (!s) return s
        const progress = Math.min(100, s.progress + 2)
        return { ...s, progress, step: Math.min(4, Math.floor(progress / 21)) }
      })
    }, 40)
    return () => window.clearInterval(i)
  }, [launchTicking])

  useEffect(() => {
    if (!launchState || launchState.progress < 100) return
    const game = launchState.game
    const t = window.setTimeout(() => {
      setRunning(game)
      setSessionSeconds(0)
      setLaunchState(null)
      notify(
        `${game.title} is live`,
        'Session opened · AXIOM Reflex enabled · 144 fps target',
        game.accent,
      )
    }, 460)
    return () => window.clearTimeout(t)
  }, [launchState, notify])

  const stop = useCallback(() => {
    if (!running) return
    notify('Session closed', `${running.title} · ${Math.round(sessionSeconds / 60)} min played`, running.accent)
    setRunning(null)
    setSessionSeconds(0)
    setPlaying(true)
  }, [running, sessionSeconds, notify])

  useEffect(() => {
    if (!running) return
    const i = window.setInterval(() => setSessionSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(i)
  }, [running])

  /* ---------------------------------------------------------------
     Installs / updates + download simulation
     --------------------------------------------------------------- */
  const install = useCallback(
    (id: string) => {
      const game = games.find((g) => g.id === id)
      setProgress((p) => ({ ...p, [id]: 0 }))
      setDownloads((d) => ({ ...d, [id]: 0 }))
      setStates((s) => ({ ...s, [id]: 'downloading' }))
      notify('Queued for install', `${game?.title ?? 'Content'} · ${game?.size.toFixed(1)} GB`, game?.accent)
    },
    [notify],
  )

  /* content engine ticks the transfer forward */
  useEffect(() => {
    const i = window.setInterval(() => {
      setDownloads((d) => {
        let changed = false
        const next = { ...d }
        for (const id of [...activeDownloads, ...Object.keys(states)]) {
          const state = states[id]
          if (state !== 'downloading' && state !== 'update') continue
          if (paused[id]) continue
          const p = Math.min(100, (next[id] ?? 0) + 0.6)
          if (p !== next[id]) {
            next[id] = p
            changed = true
          }
        }
        return changed ? next : d
      })
    }, 2000)
    return () => window.clearInterval(i)
  }, [paused, states])

  /* finalise completed transfers */
  useEffect(() => {
    for (const [id, p] of Object.entries(downloads)) {
      if (p < 100) continue
      const state = states[id]
      if (state === 'downloading' || state === 'update') {
        setStates((s) => ({ ...s, [id]: 'installed' }))
        setProgress((pr) => ({ ...pr, [id]: 100 }))
        const game = games.find((g) => g.id === id)
        if (game) notify('Ready to play', `${game.title} · verifying 100%`, game.accent)
      }
    }
  }, [downloads, states, notify])

  const togglePause = useCallback((id: string) => {
    setPaused((p) => ({ ...p, [id]: !p[id] }))
  }, [])

  const removeDownload = useCallback(
    (id: string) => {
      setDownloads((d) => ({ ...d, [id]: 0 }))
      setProgress((p) => ({ ...p, [id]: 0 }))
      const game = games.find((g) => g.id === id)
      if (game) setStates((s) => ({ ...s, [id]: 'available' }))
      notify('Removed from queue', game?.title, '#7d7468')
    },
    [notify],
  )

  const toggleWishlist = useCallback(
    (id: string) => {
      setWishlist((w) => {
        const has = w.includes(id)
        notify(has ? 'Removed from wishlist' : 'Added to wishlist', games.find((g) => g.id === id)?.title)
        return has ? w.filter((x) => x !== id) : [...w, id]
      })
    },
    [notify],
  )

  /* ---------------------------------------------------------------
     Global shortcuts
     --------------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === 'Escape') {
        setSearchOpen(false)
        setPaletteOpen(false)
        setNotificationsOpen(false)
        setControlOpen(false)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setPlaying((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
  }, [reduceMotion])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale))
  }, [uiScale])

  const value: LauncherValue = {
    route,
    go,
    openGame,
    accentId,
    accent,
    setAccentId,
    states,
    progress,
    install,
    launch,
    launchState,
    cancelLaunch: () => setLaunchState(null),
    stop,
    running,
    sessionSeconds,
    downloads,
    paused,
    togglePause,
    removeDownload,
    searchOpen,
    setSearchOpen,
    paletteOpen,
    setPaletteOpen,
    controlOpen,
    setControlOpen,
    notificationsOpen,
    setNotificationsOpen,
    toasts,
    notify,
    dismissToast,
    trackIndex,
    setTrackIndex,
    playing,
    setPlaying,
    volume,
    setVolume,
    wishlist,
    toggleWishlist,
    reduceMotion,
    setReduceMotion,
    performanceOverlay,
    setPerformanceOverlay,
    uiScale,
    setUiScale,
    instantLaunch,
    setInstantLaunch,
    notifUnread,
    markNotificationsRead: () => setNotifUnread(false),
  }

  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>
}

export function useLauncher() {
  const ctx = useContext(LauncherContext)
  if (!ctx) throw new Error('useLauncher must be used inside LauncherProvider')
  return ctx
}
