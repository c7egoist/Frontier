import { useMemo, useState } from 'react'
import {
  Search,
  LayoutGrid,
  List,
  ArrowDownUp,
  HardDrive,
  CheckCircle2,
  DownloadCloud,
  Clock,
  Play,
  ShieldCheck,
  ArrowUpRight,
  Layers,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { games, getGame } from '../data/games'
import type { Game } from '../data/types'
import GameArt from '../components/GameArt'
import { GameCard, Meter, PlayPill } from '../components/ui'

type FilterId = 'all' | 'installed' | 'updates' | 'wishlist'
type SortId = 'recent' | 'az' | 'size' | 'playtime'

const sortLabels: [SortId, string][] = [
  ['recent', 'Recent'],
  ['az', 'A–Z'],
  ['size', 'Size'],
  ['playtime', 'Playtime'],
]

function StorageMap() {
  const { states } = useLauncher()
  const installed = games.filter((g) => (states[g.id] ?? g.state) === 'installed')
  const used = installed.reduce((a, g) => a + g.size, 0)
  const total = 1024
  const reserved = 92
  return (
    <div className="panel storage">
      <div className="storage__head">
        <span className="panel__title"><HardDrive size={14} /> Content volume</span>
        <span className="mono t3">NVMe-1 · 1 TB</span>
      </div>
      <div className="storage__numbers">
        <div>
          <b className="mono">{used.toFixed(0)} GB</b>
          <span className="label">installed</span>
        </div>
        <div>
          <b className="mono">{reserved} GB</b>
          <span className="label">reserved</span>
        </div>
        <div>
          <b className="mono">{total - used} GB</b>
          <span className="label">free</span>
        </div>
        <div>
          <b className="mono" style={{ color: 'var(--accent)' }}>Healthy</b>
          <span className="label">SMART status</span>
        </div>
      </div>
      <div className="storage__bar" role="img" aria-label={`${used.toFixed(0)} gigabytes installed`}>
        {installed.map((g) => (
          <span
            key={g.id}
            className="storage__seg"
            style={{ width: `${(g.size / total) * 100}%`, background: g.accent }}
            title={`${g.title} · ${g.size.toFixed(1)} GB`}
          />
        ))}
        <span className="storage__seg storage__seg--reserved" style={{ width: `${(reserved / total) * 100}%` }} />
        <span className="storage__seg storage__seg--free" />
      </div>
      <div className="storage__legend">
        {installed.slice(0, 5).map((g) => (
          <span key={g.id} className="storage__legend-item">
            <i style={{ background: g.accent }} /> {g.title.split(' ')[0]} <span className="mono t3">{g.size.toFixed(1)}</span>
          </span>
        ))}
        <span className="storage__legend-item">
          <i style={{ background: 'transparent', border: '1px dashed var(--line-3)' }} /> Reserved
        </span>
      </div>
      <div className="storage__foot">
        <span className="mono"><ShieldCheck size={12} /> All builds verified · last scan 4m ago</span>
        <button className="section__link">Defragment <ArrowUpRight size={13} /></button>
      </div>
    </div>
  )
}

function LibraryRow({ game }: { game: Game }) {
  const { openGame, states, progress, launch } = useLauncher()
  const state = states[game.id] ?? game.state
  const installed = state === 'installed'
  return (
    <div className="lib-row" onClick={() => openGame(game.id)} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openGame(game.id)
      }}
    >
      <div className="lib-row__art">
        <GameArt game={game} glyph={false} marks={false} />
      </div>
      <div className="lib-row__title">
        <b>{game.title}</b>
        <span>{game.studio}</span>
      </div>
      <div className="lib-row__tags">
        {game.tags.slice(0, 2).map((t) => (
          <span key={t} className="mini-tag">{t}</span>
        ))}
      </div>
      <div className="lib-row__state">
        {state === 'update' ? (
          <span className="state-tag state-tag--warn"><DownloadCloud size={11} /> Update {Math.round(progress[game.id] ?? 0)}%</span>
        ) : state === 'downloading' ? (
          <span className="state-tag state-tag--warn"><DownloadCloud size={11} /> {Math.round(progress[game.id] ?? 0)}%</span>
        ) : installed ? (
          <span className="state-tag state-tag--ok"><CheckCircle2 size={11} /> Installed</span>
        ) : (
          <span className="state-tag">Not installed</span>
        )}
      </div>
      <div className="lib-row__meta mono">
        <span>{installed ? `${(game.playtime / 60).toFixed(1)} h` : '—'}</span>
        <span className="t3">{game.size.toFixed(1)} GB</span>
      </div>
      <div className="lib-row__action">
        {installed ? (
          <button className="icon-btn lib-row__play" onClick={(e) => { e.stopPropagation(); launch(game.id) }} aria-label={`Launch ${game.title}`}>
            <Play size={13} fill="currentColor" />
          </button>
        ) : (
          <PlayPill game={game} />
        )}
      </div>
    </div>
  )
}

export default function Library() {
  const { states, wishlist, go } = useLauncher()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortId>('recent')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')

  const owned = useMemo(() => {
    let list = games.filter((g) => {
      const s = states[g.id] ?? g.state
      if (filter === 'installed') return s === 'installed'
      if (filter === 'updates') return s === 'update' || s === 'downloading' || s === 'queued'
      if (filter === 'wishlist') return wishlist.includes(g.id)
      return true
    })
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((g) => g.title.toLowerCase().includes(q) || g.studio.toLowerCase().includes(q))
    }
    switch (sort) {
      case 'az':
        return [...list].sort((a, b) => a.title.localeCompare(b.title))
      case 'size':
        return [...list].sort((a, b) => b.size - a.size)
      case 'playtime':
        return [...list].sort((a, b) => b.playtime - a.playtime)
      default:
        return [...list].sort((a, b) => b.playtime - a.playtime)
    }
  }, [filter, query, sort, states, wishlist])

  const installedCount = games.filter((g) => (states[g.id] ?? g.state) === 'installed').length
  const updates = games.filter((g) => (states[g.id] ?? g.state) === 'update').length
  const totalHours = games.reduce((a, g) => a + g.playtime, 0) / 60

  const counts: Record<FilterId, number> = {
    all: games.length,
    installed: installedCount,
    updates,
    wishlist: wishlist.length,
  }

  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <span className="eyebrow"><Layers size={12} /> {games.length} titles · 1 device · cloud synced</span>
          <h1 className="display lib-head__title">Library</h1>
          <p className="lib-head__sub">
            Everything you own, indexed by the runtime. Builds are verified on launch and repaired
            silently between sessions.
          </p>
        </div>
        <div className="lib-head__stats">
          <div className="lib-stat">
            <span className="label">Installed</span>
            <b className="mono">{installedCount}</b>
            <span className="lib-stat__note">of {games.length}</span>
          </div>
          <div className="lib-stat">
            <span className="label">Playtime</span>
            <b className="mono">{totalHours.toFixed(0)}<small>h</small></b>
            <span className="lib-stat__note">all time</span>
          </div>
          <div className="lib-stat">
            <span className="label">Updates</span>
            <b className="mono" style={{ color: updates ? 'var(--warn)' : undefined }}>{updates}</b>
            <span className="lib-stat__note">pending</span>
          </div>
        </div>
      </header>

      <StorageMap />

      <div className="lib-toolbar">
        <div className="segmented">
          {(
            [
              ['all', 'All'],
              ['installed', 'Installed'],
              ['updates', 'Updates'],
              ['wishlist', 'Wishlist'],
            ] as [FilterId, string][]
          ).map(([id, label]) => (
            <button key={id} className={`segmented__btn${filter === id ? ' is-active' : ''}`} onClick={() => setFilter(id)}>
              {label}
              <span className="mono">{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className="lib-toolbar__right">
          <label className="lib-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter library" aria-label="Filter library" />
          </label>
          <div className="lib-sort">
            <ArrowDownUp size={13} className="t3" />
            {sortLabels.map(([id, label]) => (
              <button key={id} className={`sort-btn${sort === id ? ' is-active' : ''}`} onClick={() => setSort(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="layout-toggle">
            <button className={layout === 'grid' ? 'is-active' : ''} onClick={() => setLayout('grid')} aria-label="Grid view">
              <LayoutGrid size={15} />
            </button>
            <button className={layout === 'list' ? 'is-active' : ''} onClick={() => setLayout('list')} aria-label="List view">
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {owned.length === 0 ? (
        <div className="empty">
          <Clock size={22} />
          <b>Nothing here yet</b>
          <span>Wishlist something from the store or install a title to fill this shelf.</span>
          <button className="btn btn--outline btn--sm" onClick={() => go('store')}>Open store</button>
        </div>
      ) : layout === 'grid' ? (
        <div className="lib-grid">
          {owned.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="lib-list panel panel--flat">
          <div className="lib-list__head mono">
            <span />
            <span>Title</span>
            <span>Tags</span>
            <span>State</span>
            <span>Played / Size</span>
            <span />
          </div>
          {owned.map((g) => (
            <LibraryRow key={g.id} game={g} />
          ))}
        </div>
      )}

      <div className="lib-bottom">
        <div className="panel lib-note">
          <div className="panel__head">
            <span className="panel__title"><ShieldCheck size={14} /> Build integrity</span>
            <span className="tag tag--accent mono">PASSING</span>
          </div>
          <div className="lib-note__body">
            <p>
              All {installedCount} installed builds match their signed manifests. AXIOM checks 1,204
              shader programs and 8.2M content hashes on cold start — averaging 1.8 seconds.
            </p>
            <div className="lib-note__rows">
              {[
                ['Shader cache', 'Warm · 1,204 programs'],
                ['Content hashes', '8,204,118 verified'],
                ['Cloud saves', 'Synced 2m ago'],
                ['Integrity scan', 'Next in 22h'],
              ].map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <span className="mono t2">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel lib-note">
          <div className="panel__head">
            <span className="panel__title"><Clock size={14} /> Recent sessions</span>
            <button className="section__link">History <ArrowUpRight size={13} /></button>
          </div>
          <div className="lib-note__body">
            {getGame('voidrunner') && ['voidrunner', 'ironfall', 'ashen-crown', 'hollow-orchard'].map((id) => {
              const g = getGame(id)!
              return (
                <div key={id} className="session-row">
                  <span className="session-row__dot" style={{ background: g.accent }} />
                  <span className="session-row__title">{g.title}</span>
                  <span className="mono t3">{g.lastPlayed}</span>
                  <span className="mono">{g.progress}%</span>
                  <Meter value={g.progress} thin color={g.accent} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
