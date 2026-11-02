import { useEffect, useRef, useState } from 'react'
import {
  Home,
  Store as StoreIcon,
  LibraryBig,
  Download,
  Users,
  Search,
  Bell,
  Sliders,
  Command,
  ChevronRight,
  Volume2,
  Volume1,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Square,
  Radio,
  Heart,
  Gauge,
  Wifi,
  X,
  ArrowUpRight,
  ListMusic,
  Zap,
} from 'lucide-react'
import { useLauncher, type PageId } from '../state/launcher'
import { friends, activityFeed, getGame } from '../data/games'
import { tracks, fmtTime } from '../data/music'
import { Logo, Avatar } from './ui'
import { pages } from '../views'
import { SearchOverlay } from './SearchOverlay'
import { LaunchOverlay } from './LaunchOverlay'
import { ControlCenter } from './ControlCenter'

const nav: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'store', label: 'Store', icon: StoreIcon },
  { id: 'library', label: 'Library', icon: LibraryBig },
  { id: 'downloads', label: 'Queue', icon: Download },
  { id: 'network', label: 'Social', icon: Users },
]

const pageTitles: Record<PageId, string> = {
  home: 'Control Deck',
  store: 'Storefront',
  library: 'Library',
  downloads: 'Transfers',
  network: 'Network',
  game: 'Game Detail',
}

/* ------------------------------------------------------------------ */
function Rail() {
  const { route, go, controlOpen, setControlOpen, states, running } = useLauncher()
  const activeCount = Object.values(states).filter((s) => s === 'downloading' || s === 'update').length
  const online = friends.filter((f) => f.status !== 'offline').length
  const active: PageId =
    route.page === 'game'
      ? states[route.gameId ?? ''] === 'installed'
        ? 'library'
        : 'store'
      : route.page

  return (
    <aside className="rail">
      <button className="rail__brand" onClick={() => go('home')} aria-label="AXIOM home">
        <Logo size={24} />
        <span className="rail__brand-word mono">AXM</span>
      </button>

      <nav className="rail__nav" aria-label="Primary">
        {nav.map(({ id, label, icon: Icon }) => {
          const badge = id === 'downloads' ? activeCount : id === 'network' ? online : 0
          return (
            <button
              key={id}
              className={`rail__btn${active === id ? ' is-active' : ''}`}
              onClick={() => go(id)}
              aria-current={active === id ? 'page' : undefined}
            >
              <span className="rail__icon">
                <Icon size={19} strokeWidth={1.7} />
                {badge > 0 && <i className="rail__badge mono">{id === 'network' ? '' : badge}</i>}
              </span>
              <span className="rail__label mono">{label}</span>
              <span className="rail__tip">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="rail__spacer" />

      {running && (
        <div className="rail__live" title={`${running.title} running`}>
          <span className="pulse" style={{ background: running.accent }} />
        </div>
      )}

      <div className="rail__foot">
        <button className="rail__btn rail__btn--icon" onClick={() => setControlOpen(!controlOpen)} aria-label="Settings">
          <span className="rail__icon">
            <Sliders size={18} strokeWidth={1.7} />
          </span>
          <span className="rail__tip">Control Center</span>
        </button>
        <button className="rail__btn rail__btn--icon" onClick={() => setControlOpen(!controlOpen)} aria-label="Account">
          <Avatar initials="YO" accent="#ff5a1f" size={30} ring />
          <span className="rail__tip">Operator</span>
        </button>
        <span className="rail__version mono">v2.4</span>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ */
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifUnread, markNotificationsRead } = useLauncher()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="notif panel" ref={ref}>
      <div className="notif__head">
        <div>
          <span className="label">Signal feed</span>
          <h3>Notifications</h3>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={markNotificationsRead}>
          {notifUnread ? 'Mark all read' : 'All caught up'}
        </button>
      </div>
      <ul className="notif__list">
        {activityFeed.slice(0, 4).map((a) => (
          <li key={a.id} className="notif__item">
            <span className="notif__rail" style={{ background: a.accent }} />
            <div className="notif__body">
              <p>
                <b>{a.who}</b> {a.action} <b>{a.detail}</b>
              </p>
              <span className="mono notif__meta">
                {a.game} · {a.time} ago
              </span>
            </div>
            {notifUnread && <span className="dot dot--live" />}
          </li>
        ))}
        <li className="notif__item">
          <span className="notif__rail" style={{ background: '#ff5a1f' }} />
          <div className="notif__body">
            <p>
              <b>AXIOM 2.4.17</b> installed — shader cache rebuilt
            </p>
            <span className="mono notif__meta">System · 1h ago</span>
          </div>
        </li>
      </ul>
      <div className="notif__foot">
        <button className="btn btn--ghost btn--sm">
          Open activity <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TopBar() {
  const { route, setSearchOpen, notificationsOpen, setNotificationsOpen, setControlOpen, notify, notifUnread } =
    useLauncher()
  const gameTitle = route.gameId ? getGame(route.gameId)?.title : undefined
  const title = route.page === 'game' && gameTitle ? gameTitle : pageTitles[route.page]

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="crumbs">
          <span className="label crumbs__root">AXIOM</span>
          <ChevronRight size={12} className="crumbs__sep" />
          <span className="crumbs__page">{title}</span>
        </div>
        <div className="runtime">
          <span className="dot dot--live" />
          <span className="mono">RUNTIME 2.4.17</span>
          <span className="runtime__sep" />
          <span className="mono t3">VULKAN 1.4</span>
        </div>
      </div>

      <div className="topbar__mid">
        <button className="search-trigger" onClick={() => setSearchOpen(true)}>
          <Search size={15} />
          <span className="search-trigger__text">Search games, friends, commands</span>
          <span className="search-trigger__kbd">
            <Command size={10} /> K
          </span>
        </button>
      </div>

      <div className="topbar__right">
        <button className="perf-pill" onClick={() => setControlOpen(true)} title="Performance profile">
          <Zap size={12} />
          <span className="mono">REFLEX</span>
          <b className="mono">144</b>
        </button>
        <button className="icon-btn topbar__search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Search size={17} />
        </button>
        <button
          className="icon-btn wallet-btn"
          onClick={() => notify('Credits synced', '◈ 1,290.00 available · AXIOM Wallet')}
          aria-label="Wallet"
        >
          <span className="wallet mono">◈ 1,290</span>
        </button>
        <div className="notif-anchor">
          <button
            className={`icon-btn${notificationsOpen ? ' is-active' : ''}`}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell size={17} />
            {notifUnread && <i className="notif-badge" />}
          </button>
          {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
        </div>
        <button className="icon-btn" onClick={() => setControlOpen(true)} aria-label="Control Center">
          <Sliders size={17} />
        </button>
        <span className="topbar__divider" />
        <button className="topbar__profile" onClick={() => setControlOpen(true)}>
          <span className="topbar__profile-meta">
            <span className="topbar__profile-name">Operator</span>
            <span className="mono topbar__profile-rank">LVL 48 · IMMORTAL</span>
          </span>
          <Avatar initials="YO" accent="var(--accent)" size={32} ring />
        </button>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
function PlayerBar() {
  const {
    running,
    stop,
    sessionSeconds,
    playing,
    setPlaying,
    trackIndex,
    setTrackIndex,
    volume,
    setVolume,
  } = useLauncher()
  const track = tracks[trackIndex % tracks.length]
  const [elapsed, setElapsed] = useState(0)
  const [queueOpen, setQueueOpen] = useState(false)

  useEffect(() => {
    setElapsed(0)
  }, [trackIndex])

  useEffect(() => {
    if (!playing || running) return
    const i = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= track.length) {
          setTrackIndex((trackIndex + 1) % tracks.length)
          return 0
        }
        return e + 1
      })
    }, 1000)
    return () => window.clearInterval(i)
  }, [playing, trackIndex, track.length, setTrackIndex, running])

  const VolIcon = volume === 0 ? VolumeX : volume < 45 ? Volume1 : Volume2
  const pct = (elapsed / track.length) * 100

  if (running) {
    const t = `${String(Math.floor(sessionSeconds / 60)).padStart(2, '0')}:${String(sessionSeconds % 60).padStart(2, '0')}`
    return (
      <footer className="playerbar playerbar--session">
        <div className="playerbar__session-left">
          <span className="session-thumb" style={{ background: `linear-gradient(140deg, ${running.palette[2]}, ${running.palette[1]})` }}>
            <span className="mono">{running.glyph}</span>
          </span>
          <div>
            <span className="session-kicker">
              <span className="dot dot--busy pulse" /> In session
            </span>
            <div className="session-title-row">
              <b>{running.title}</b>
              <span className="mono session-time">{t}</span>
            </div>
          </div>
        </div>

        <div className="playerbar__session-mid">
          <div className="session-stat">
            <span className="label">FPS</span>
            <b className="mono">144</b>
          </div>
          <div className="session-stat">
            <span className="label">Frame</span>
            <b className="mono">6.9 ms</b>
          </div>
          <div className="session-stat">
            <span className="label">GPU</span>
            <b className="mono">61°C</b>
          </div>
          <div className="session-stat">
            <span className="label">VRAM</span>
            <b className="mono">9.4 GB</b>
          </div>
          <span className="session-eq" aria-hidden="true">
            {[9, 15, 6, 18, 11, 20, 8, 14].map((h, i) => (
              <i key={i} style={{ height: h, animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        </div>

        <div className="playerbar__session-right">
          <button className="btn btn--outline btn--sm">
            <Gauge size={14} /> Overlay
          </button>
          <button className="btn btn--light btn--sm" onClick={stop}>
            <Square size={11} fill="currentColor" /> End session
          </button>
        </div>
      </footer>
    )
  }

  return (
    <footer className="playerbar">
      <div className="playerbar__now">
        <span
          className="playerbar__thumb"
          style={{
            background: `linear-gradient(145deg, ${track.palette[2]}, ${track.palette[1]} 65%, ${track.palette[0]})`,
          }}
        >
          <span className="mono">{track.glyph}</span>
          {playing && (
            <span className="playerbar__eq" aria-hidden="true">
              {[7, 11, 5, 9].map((h, i) => (
                <i key={i} style={{ height: h, animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          )}
        </span>
        <div className="playerbar__track">
          <div className="playerbar__track-title">
            <b>{track.title}</b>
            <span className="tag tag--ghost mono">Music</span>
          </div>
          <span className="playerbar__track-artist">{track.artist} · {track.album}</span>
        </div>
        <button className="icon-btn playerbar__like" aria-label="Like">
          <Heart size={15} />
        </button>
      </div>

      <div className="playerbar__transport">
        <div className="transport-controls">
          <button className="icon-btn" aria-label="Shuffle"><Shuffle size={14} /></button>
          <button className="icon-btn" onClick={() => setTrackIndex((trackIndex - 1 + tracks.length) % tracks.length)} aria-label="Previous">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button className="transport-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          </button>
          <button className="icon-btn" onClick={() => setTrackIndex((trackIndex + 1) % tracks.length)} aria-label="Next">
            <SkipForward size={16} fill="currentColor" />
          </button>
          <button className="icon-btn" aria-label="Repeat"><Repeat size={14} /></button>
        </div>
        <div className="transport-line">
          <span className="mono transport-time">{fmtTime(elapsed)}</span>
          <div className="transport-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setElapsed(Math.round(((e.clientX - rect.left) / rect.width) * track.length))
          }}>
            <div className="transport-track__fill" style={{ width: `${pct}%` }} />
            <span className="transport-track__knob" style={{ left: `${pct}%` }} />
          </div>
          <span className="mono transport-time t3">{fmtTime(track.length)}</span>
        </div>
      </div>

      <div className="playerbar__right">
        <span className="playerbar__radio mono">
          <Radio size={12} /> AXIOM RADIO
        </span>
        <button className={`icon-btn${queueOpen ? ' is-active' : ''}`} onClick={() => setQueueOpen(!queueOpen)} aria-label="Queue">
          <ListMusic size={16} />
        </button>
        <div className="volume">
          <button className="icon-btn" onClick={() => setVolume(volume === 0 ? 64 : 0)} aria-label="Mute">
            <VolIcon size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ '--vol': `${volume}%` } as React.CSSProperties}
            aria-label="Volume"
          />
        </div>
        <span className="playerbar__output mono">
          <Wifi size={12} /> QUANTUM-7
        </span>
        {queueOpen && (
          <div className="queue panel">
            <div className="queue__head">
              <span className="label">Up next</span>
              <button className="icon-btn" onClick={() => setQueueOpen(false)}><X size={14} /></button>
            </div>
            {tracks.map((t, i) => (
              <button
                key={t.id}
                className={`queue__row${i === trackIndex % tracks.length ? ' is-active' : ''}`}
                onClick={() => {
                  setTrackIndex(i)
                  setPlaying(true)
                }}
              >
                <span className="queue__glyph mono" style={{ background: `linear-gradient(140deg, ${t.palette[2]}, ${t.palette[1]})` }}>{t.glyph}</span>
                <span className="queue__meta">
                  <b>{t.title}</b>
                  <span>{t.artist}</span>
                </span>
                <span className="mono t3">{fmtTime(t.length)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
function Toasts() {
  const { toasts, dismissToast } = useLauncher()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id} style={{ '--toast-accent': t.accent ?? 'var(--accent)' } as React.CSSProperties}>
          <span className="toast__bar" />
          <div className="toast__body">
            <b>{t.title}</b>
            {t.detail && <span>{t.detail}</span>}
          </div>
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
export default function Shell() {
  const { route, notify, performanceOverlay, running } = useLauncher()
  const viewportRef = useRef<HTMLDivElement>(null)
  const Page = pages[route.page]

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [route.page, route.gameId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'F1') {
        e.preventDefault()
        notify('Performance overlay pinned', 'FPS 144 · frame 6.9ms · GPU 61°C · VRAM 9.4GB')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notify])

  return (
    <div className="app">
      <div className="ambient" aria-hidden="true">
        <div className="ambient__grid" />
        <div className="ambient__grain" />
      </div>

      <Rail />

      <div className="stage">
        <TopBar />
        <main className="viewport" ref={viewportRef}>
          <div className="page" key={`${route.page}-${route.gameId ?? ''}`}>
            <Page />
          </div>
          <footer className="page-foot">
            <span className="mono">
              <Logo size={12} /> AXIOM GAME RUNTIME · BUILD 2.4.17 · JOHANNESBURG EDGE
            </span>
            <span className="mono t3">© 2026 AXIOM SYSTEMS — ALL TITLES ARE FICTIONAL</span>
          </footer>
        </main>
      </div>

      <PlayerBar />
      <Toasts />
      <SearchOverlay />
      <LaunchOverlay />
      <ControlCenter />

      {performanceOverlay && (
        <div className="perf-overlay mono">
          <div><span>FPS</span><b>144</b></div>
          <div><span>FRAME</span><b>6.9ms</b></div>
          <div><span>GPU</span><b>61°C</b></div>
          <div><span>VRAM</span><b>9.4/16 GB</b></div>
          {running && <div><span>SESSION</span><b>{running.glyph}</b></div>}
          <div className="perf-overlay__spark">
            {Array.from({ length: 22 }).map((_, i) => (
              <i key={i} style={{ height: 8 + ((i * 7) % 14) }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
