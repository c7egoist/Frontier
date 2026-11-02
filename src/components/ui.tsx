import type { ReactNode } from 'react'
import { ArrowUpRight, Play, Pause, Plus, Check, Download, RotateCcw } from 'lucide-react'
import GameArt from './GameArt'
import { useLauncher } from '../state/launcher'
import type { Game, InstallState } from '../data/types'

/* ------------------------------------------------------------------ */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 28 16 3l13 25h-7.2L16 16.2 10.2 28H3Z" fill="currentColor" />
      <rect x="13.4" y="21.5" width="5.2" height="2" fill="var(--bg)" opacity=".85" />
      <path d="M16 3 22.6 15.8 16 12.2 9.4 15.8 16 3Z" fill="currentColor" opacity=".45" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
export function Avatar({
  initials,
  accent,
  size = 32,
  ring = false,
  src,
}: {
  initials: string
  accent: string
  size?: number
  ring?: boolean
  src?: string
}) {
  return (
    <span
      className={`avatar${ring ? ' avatar--ring' : ''}`}
      style={
        {
          width: size,
          height: size,
          fontSize: Math.max(9, size * 0.33),
          '--av': accent,
          backgroundImage: src
            ? `url(${src})`
            : `linear-gradient(145deg, ${accent} 0%, color-mix(in srgb, ${accent} 42%, #0b0908) 78%)`,
        } as React.CSSProperties
      }
    >
      {!src && <span>{initials}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ */
export function Meter({
  value,
  striped = false,
  thin = false,
  color,
  className = '',
}: {
  value: number
  striped?: boolean
  thin?: boolean
  color?: string
  className?: string
}) {
  return (
    <div className={`bar ${thin ? 'bar--thin' : ''} ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`bar__fill ${striped ? 'bar__fill--striped' : ''}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function SectionHead({
  kicker,
  title,
  action,
  actionLabel,
  meta,
}: {
  kicker?: string
  title: string
  action?: () => void
  actionLabel?: string
  meta?: ReactNode
}) {
  return (
    <div className="section__head">
      <div className="section__heading">
        {kicker && <span className="label">{kicker}</span>}
        <h2 className="section__title display">{title}</h2>
      </div>
      <div className="section__aside">
        {meta}
        {action && actionLabel && (
          <button className="section__link" onClick={action}>
            {actionLabel}
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function PriceTag({ price, className = '' }: { price: number | null; className?: string }) {
  if (price === null)
    return (
      <span className={`price price--free mono ${className}`}>
        FREE
      </span>
    )
  return <span className={`price mono ${className}`}>${price.toFixed(2)}</span>
}

/* ------------------------------------------------------------------ */
const stateLabel: Record<InstallState, string> = {
  installed: 'Play',
  update: 'Update',
  available: 'Install',
  downloading: 'Downloading',
  queued: 'Queued',
}

const stateIcon = (state: InstallState) => {
  switch (state) {
    case 'installed':
      return <Play size={12} fill="currentColor" strokeWidth={0} />
    case 'update':
      return <RotateCcw size={12} />
    case 'available':
      return <Download size={12} />
    case 'queued':
      return <Plus size={12} />
    default:
      return null
  }
}

export function PlayPill({
  game,
  size = 'sm',
  full = false,
}: {
  game: Game
  size?: 'sm' | 'md'
  full?: boolean
}) {
  const { states, progress, install, launch, running } = useLauncher()
  const state = states[game.id] ?? game.state
  const isRunning = running?.id === game.id

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (state === 'available') return install(game.id)
    if (state === 'downloading' || state === 'queued') return
    return launch(game.id)
  }

  if (state === 'downloading') {
    return (
      <span className={`play-pill play-pill--progress ${full ? 'play-pill--full' : ''}`}>
        <span className="mono">{Math.round(progress[game.id] ?? 0)}%</span>
        <span className="play-pill__bar" style={{ width: `${progress[game.id] ?? 0}%` }} />
      </span>
    )
  }

  return (
    <button
      className={`play-pill ${size === 'md' ? 'play-pill--md' : ''} ${full ? 'play-pill--full' : ''} ${isRunning ? 'is-running' : ''}`}
      onClick={onClick}
      style={{ '--pill': game.accent } as React.CSSProperties}
      aria-label={`${stateLabel[state]} ${game.title}`}
    >
      {isRunning ? <Pause size={12} /> : stateIcon(state)}
      <span>{isRunning ? 'Running' : stateLabel[state]}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
export function GameCard({ game }: { game: Game }) {
  const { openGame } = useLauncher()
  return (
    <article
      className="cover"
      onClick={() => openGame(game.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openGame(game.id)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${game.title} by ${game.studio}`}
    >
      <div className="cover__frame">
        <GameArt game={game} />
        <div className="cover__hover">
          <span className="cover__open">
            <Play size={13} fill="currentColor" strokeWidth={0} />
            Open
          </span>
        </div>
        {game.state === 'update' && <span className="cover__flag">Update</span>}
      </div>
      <div className="cover__meta">
        <div className="cover__top">
          <h3 className="cover__title">{game.title}</h3>
          {game.state === 'installed' && <Check size={13} className="cover__check" />}
        </div>
        <p className="cover__studio">{game.studio}</p>
        <div className="cover__foot">
          <span className="mono cover__stat">
            {game.state === 'installed' ? `${(game.playtime / 60).toFixed(1)}h played` : `${game.size.toFixed(1)} GB`}
          </span>
          <span className="cover__dot" />
          <span className="mono cover__stat">{game.score} meta</span>
          <PlayPill game={game} />
        </div>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */
export function WideCard({ game, showPrice = false }: { game: Game; showPrice?: boolean }) {
  const { openGame, states } = useLauncher()
  const installed = (states[game.id] ?? game.state) === 'installed'
  return (
    <article className="wide-card" onClick={() => openGame(game.id)} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openGame(game.id)
        }
      }}
    >
      <div className="wide-card__art">
        <GameArt game={game} glyph={false} />
        <div className="wide-card__labels">
          <span className="tag tag--accent">{game.genres[0]}</span>
          {game.state === 'update' && <span className="tag tag--light">Update ready</span>}
        </div>
      </div>
      <div className="wide-card__body">
        <div>
          <h3 className="wide-card__title display">{game.title}</h3>
          <p className="wide-card__studio">
            {game.studio} <span className="t3">· {game.year}</span>
          </p>
        </div>
        <div className="wide-card__foot">
          <span className="mono wide-card__meta">
            {installed ? `${(game.playtime / 60).toFixed(1)} h` : `${game.size.toFixed(1)} GB`}
            <span className="t3"> / </span>
            {game.score} meta
          </span>
          {showPrice ? <PriceTag price={game.price} /> : <PlayPill game={game} />}
        </div>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */
export function StatusDot({ status }: { status: 'in-game' | 'online' | 'away' | 'offline' }) {
  const map = { 'in-game': 'dot--busy', online: 'dot--live', away: 'dot--away', offline: 'dot--off' } as const
  return <span className={`dot ${map[status]}`} />
}

/* ------------------------------------------------------------------ */
export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'light' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

/* ------------------------------------------------------------------ */
export function ScoreRing({ score, size = 46, label = 'META' }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="score-ring__num mono">{score}</span>
      <span className="score-ring__label">{label}</span>
    </div>
  )
}
