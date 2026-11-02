import { useState } from 'react'
import {
  Pause,
  Play,
  X,
  ArrowUp,
  ArrowDown,
  Check,
  Download,
  Gauge,
  TimerReset,
  Wifi,
  HardDrive,
  Settings2,
  GripVertical,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { games, getGame } from '../data/games'
import type { Game } from '../data/types'
import GameArt from '../components/GameArt'
import { Meter, PlayPill } from '../components/ui'

const queueIds = ['gridlock', 'ironfall', 'hyperdrift', 'starfall']

function TransferRow({ game, index }: { game: Game; index: number }) {
  const { states, progress, paused, togglePause, removeDownload } = useLauncher()
  const state = states[game.id] ?? game.state
  const p = progress[game.id] ?? 0
  const isPaused = paused[game.id]
  const queued = state === 'queued' || (p === 0 && !isPaused && state !== 'installed')
  const done = state === 'installed' && p >= 100

  return (
    <div className={`dl-row${isPaused ? ' is-paused' : ''}${done ? ' is-done' : ''}`}>
      <span className="dl-row__grip"><GripVertical size={14} /></span>
      <span className="dl-row__art">
        <GameArt game={game} glyph={false} marks={false} />
        <span className="dl-row__index mono">{String(index + 1).padStart(2, '0')}</span>
      </span>

      <div className="dl-row__main">
        <div className="dl-row__top">
          <div>
            <b>{game.title}</b>
            <span className="dl-row__studio">{game.studio} · {state === 'update' ? `patch ${game.version}` : `build ${game.version}`}</span>
          </div>
          <span className={`state-tag ${done ? 'state-tag--ok' : isPaused ? '' : queued ? '' : 'state-tag--warn'}`}>
            {done ? <><Check size={11} /> Complete</> : isPaused ? 'Paused' : queued ? 'Queued' : <><Download size={11} /> Transferring</>}
          </span>
        </div>

        <Meter value={done ? 100 : p} striped={!isPaused && !queued && !done} color={game.accent} />

        <div className="dl-row__meta mono">
          <span>{p.toFixed(1)}% · {(game.size * (p / 100)).toFixed(1)} / {game.size.toFixed(1)} GB</span>
          <span className="dl-row__sep" />
          <span>{done ? 'Verified' : isPaused ? '—' : queued ? 'Waiting for slot' : `${(8.4 + index * 2.6).toFixed(1)} MB/s`}</span>
          <span className="dl-row__sep" />
          <span>{done ? '—' : queued ? '—' : `${(Math.max(1, Math.round(((100 - p) / 100) * game.size * 3)))}m left`}</span>
          <span className="dl-row__route"><Wifi size={11} /> CDN-JHB</span>
        </div>
      </div>

      <div className="dl-row__actions">
        {done ? (
          <PlayPill game={game} />
        ) : (
          <>
            <button className="icon-btn" onClick={() => togglePause(game.id)} aria-label={isPaused ? 'Resume' : 'Pause'}>
              {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
            </button>
            <button className="icon-btn" onClick={() => removeDownload(game.id)} aria-label="Remove">
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Throughput() {
  const { downloads, states, paused } = useLauncher()
  const active = Object.entries(states).filter(([, s]) => s === 'downloading' || s === 'update')
  const speed = active.filter(([id]) => !paused[id]).reduce((a, [, s], i) => a + (s === 'update' ? 21.4 : 28.6) + i, 0)
  const points = [18, 24, 21, 30, 27, 38, 33, 44, 41, 52, 46, 58, 54, 62, 57, 68, 61, 74, 70, 66, 72, 64, 78, 71, 82, 76]
  const path = points
    .map((v, i) => `${(i / (points.length - 1)) * 100},${100 - v}`)
    .join(' ')

  return (
    <div className="panel throughput">
      <div className="throughput__main">
        <div className="throughput__head">
          <span className="label">Aggregate throughput</span>
          <span className="tag tag--accent mono"><span className="dot dot--live" /> CDN-JHB-04</span>
        </div>
        <div className="throughput__value">
          <b className="mono">{speed.toFixed(1)}</b>
          <span className="mono">MB/s</span>
          <span className="throughput__delta mono">+12.4%</span>
        </div>
        <div className="throughput__chart">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity=".38" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={`0,40 ${path} 100,40`} fill="url(#tp)" stroke="none" />
            <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      <div className="throughput__stats">
        <div>
          <span className="label">In queue</span>
          <b className="mono">{active.length} <small>jobs</small></b>
        </div>
        <div>
          <span className="label">Remaining</span>
          <b className="mono">{(Object.values(downloads).reduce((a, b) => a + b, 0) / 100 * 18).toFixed(1)} <small>GB</small></b>
        </div>
        <div>
          <span className="label">ETA</span>
          <b className="mono">14<small>m</small></b>
        </div>
        <div>
          <span className="label">Disk</span>
          <b className="mono">412<small>GB</small></b>
        </div>
      </div>
    </div>
  )
}

export default function Downloads() {
  const { states, paused, togglePause, notify } = useLauncher()
  const [order, setOrder] = useState(queueIds)
  const [limit, setLimit] = useState(82)
  const [autoPause, setAutoPause] = useState(true)

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
  }

  const allPaused = order.every((id) => paused[id])
  const completed = games.filter((g) => (states[g.id] ?? g.state) === 'installed').slice(0, 4)

  return (
    <div className="downloads">
      <header className="dl-head">
        <div>
          <span className="eyebrow"><Download size={12} /> Content engine · 4 jobs</span>
          <h1 className="display dl-head__title">Transfers</h1>
          <p className="dl-head__sub">
            Multi-source delivery with resumable chunks and manifest verification. Transfers pause
            automatically when a session opens.
          </p>
        </div>
        <div className="dl-head__actions">
          <button
            className="btn btn--outline btn--sm"
            onClick={() => {
              order.forEach((id) => {
                const isPaused = paused[id]
                if (allPaused && isPaused) togglePause(id)
                if (!allPaused && !isPaused) togglePause(id)
              })
              notify(allPaused ? 'Queue resumed' : 'Queue paused', `${order.length} jobs · ${allPaused ? 'downloading' : 'held'}`)
            }}
          >
            {allPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
            {allPaused ? 'Resume all' : 'Pause all'}
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => notify('Bandwidth test complete', '842 Mbps down · 412 Mbps up · JHB edge')}>
            <Gauge size={13} /> Run speed test
          </button>
        </div>
      </header>

      <Throughput />

      <div className="dl-section">
        <div className="dl-section__head">
          <span className="label">Queue</span>
          <span className="mono t3">priority order · hover a job to reorder</span>
        </div>
        <div className="dl-list">
          {order.map((id, i) => {
            const g = getGame(id)
            if (!g) return null
            return (
              <div className="dl-wrap" key={id}>
                <TransferRow game={g} index={i} />
                <div className="dl-order">
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp size={13} />
                  </button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Move down">
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="dl-columns">
        <div className="panel dl-settings">
          <div className="panel__head">
            <span className="panel__title"><Settings2 size={14} /> Bandwidth</span>
            <span className="mono t3">{limit} Mbps cap</span>
          </div>
          <div className="dl-settings__body">
            <div className="dl-setting">
              <div className="dl-setting__row">
                <span>Download limit</span>
                <b className="mono">{limit === 100 ? 'Unlimited' : `${limit} Mbps`}</b>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                style={{ '--vol': `${((limit - 10) / 90) * 100}%` } as React.CSSProperties}
                aria-label="Download limit"
              />
            </div>
            <button className={`toggle-row${autoPause ? ' is-on' : ''}`} onClick={() => setAutoPause(!autoPause)} aria-pressed={autoPause}>
              <span>
                <b>Pause during sessions</b>
                <small>Holds transfers while a game is running</small>
              </span>
              <i className="switch"><span /></i>
            </button>
            <div className="dl-setting dl-setting--row">
              <span>Delivery route</span>
              <span className="mono">AUTO · JHB → FRA</span>
            </div>
            <div className="dl-setting dl-setting--row">
              <span>Chunk size</span>
              <span className="mono">64 MB · 16 parallel</span>
            </div>
            <div className="dl-setting dl-setting--row">
              <span>Verification</span>
              <span className="mono" style={{ color: 'var(--ok)' }}><ShieldCheck size={11} /> SHA-256</span>
            </div>
          </div>
        </div>

        <div className="panel dl-complete">
          <div className="panel__head">
            <span className="panel__title"><Check size={14} /> Recently installed</span>
            <span className="mono t3">rollback available</span>
          </div>
          <div className="dl-complete__list">
            {completed.map((g) => (
              <div className="dl-complete__row" key={g.id}>
                <span className="dl-complete__art"><GameArt game={g} glyph={false} marks={false} /></span>
                <div>
                  <b>{g.title}</b>
                  <span className="mono t3">{g.size.toFixed(1)} GB · build {g.version}</span>
                </div>
                <span className="state-tag state-tag--ok"><Check size={11} /> Verified</span>
                <button className="icon-btn" aria-label="Row details"><ChevronRight size={14} /></button>
              </div>
            ))}
          </div>
          <div className="dl-complete__foot">
            <span className="mono"><HardDrive size={12} /> 412 GB used of 1 TB</span>
            <Meter value={41} thin />
          </div>
        </div>
      </div>

      <div className="dl-tip">
        <TimerReset size={14} />
        <span>
          Scheduled window <b>02:00 – 06:00</b> is active. Off-peak transfers complete up to 3× faster on the
          JHB edge.
        </span>
        <button className="section__link" onClick={() => notify('Schedule editor', 'Off-peak window 02:00–06:00 · JHB edge')}>
          Edit <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
