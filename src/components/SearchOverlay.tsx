import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Home,
  Store,
  LibraryBig,
  Download,
  Users,
  Settings2,
  Palette,
  Volume2,
  Play,
  Check,
  Command,
} from 'lucide-react'
import { useLauncher, type PageId } from '../state/launcher'
import { games, friends } from '../data/games'
import GameArt from './GameArt'
import { Avatar } from './ui'

type Command = {
  id: string
  label: string
  hint?: string
  icon: typeof Home
  run: () => void
  kind: 'command'
}

export function SearchOverlay() {
  const {
    searchOpen,
    setSearchOpen,
    openGame,
    go,
    setControlOpen,
    states,
    launch,
    setPlaying,
    playing,
  } = useLauncher()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (searchOpen) {
      setQuery('')
      setIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [searchOpen])

  const commands = useMemo<Command[]>(() => {
    const nav: [PageId, string, typeof Home][] = [
      ['home', 'Go to Control Deck', Home],
      ['store', 'Open storefront', Store],
      ['library', 'Open library', LibraryBig],
      ['downloads', 'Open transfers', Download],
      ['network', 'Open network', Users],
    ]
    return [
      ...nav.map(([page, label, icon]) => ({
        id: `nav-${page}`,
        label,
        hint: 'Navigate',
        icon,
        run: () => go(page),
        kind: 'command' as const,
      })),
      {
        id: 'cmd-control',
        label: 'Open control center',
        hint: 'System',
        icon: Settings2,
        run: () => setControlOpen(true),
        kind: 'command',
      },
      {
        id: 'cmd-accent',
        label: 'Switch accent profile',
        hint: 'Appearance',
        icon: Palette,
        run: () => setControlOpen(true),
        kind: 'command',
      },
      {
        id: 'cmd-audio',
        label: playing ? 'Pause ambient radio' : 'Resume ambient radio',
        hint: 'Audio',
        icon: Volume2,
        run: () => setPlaying(!playing),
        kind: 'command',
      },
    ]
  }, [go, playing, setControlOpen, setPlaying])

  const gameResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = games.filter((g) => {
      if (!q) return g.featured
      return (
        g.title.toLowerCase().includes(q) ||
        g.studio.toLowerCase().includes(q) ||
        g.genres.some((x) => x.toLowerCase().includes(q)) ||
        g.tags.some((x) => x.toLowerCase().includes(q))
      )
    })
    return pool.slice(0, q ? 6 : 4)
  }, [query])

  const friendResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return friends.filter((f) => f.name.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q)).slice(0, 3)
  }, [query])

  const commandResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, query])

  type Row =
    | { type: 'game'; id: string; run: () => void }
    | { type: 'friend'; id: string; run: () => void }
    | { type: 'command'; id: string; run: () => void }

  const rows: Row[] = [
    ...gameResults.map<Row>((g) => ({ type: 'game', id: g.id, run: () => openGame(g.id) })),
    ...friendResults.map<Row>((f) => ({ type: 'friend', id: f.id, run: () => go('network') })),
    ...commandResults.map<Row>((c) => ({ type: 'command', id: c.id, run: c.run })),
  ]

  const total = rows.length

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-row="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!searchOpen) return null

  const run = (i: number) => {
    rows[i]?.run()
    setSearchOpen(false)
  }

  let cursor = 0
  const gameStart = cursor
  cursor += gameResults.length
  const friendStart = cursor
  cursor += friendResults.length
  const commandStart = cursor

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Search AXIOM">
        <div className="search-panel__input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, studios, friends or commands…"
            aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => (total ? (i + 1) % total : 0))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => (total ? (i - 1 + total) % total : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(index)
              }
            }}
          />
          <span className="kbd">ESC</span>
        </div>

        <div className="search-panel__body" ref={listRef}>
          {gameResults.length > 0 && (
            <div className="search-group">
              <span className="search-group__label label">{query ? 'Titles' : 'Featured titles'}</span>
              {gameResults.map((g, i) => {
                const rowIndex = gameStart + i
                const active = rowIndex === index
                const state = states[g.id] ?? g.state
                return (
                  <div
                    key={g.id}
                    data-row={rowIndex}
                    role="button"
                    tabIndex={-1}
                    className={`search-row${active ? ' is-active' : ''}`}
                    onMouseEnter={() => setIndex(rowIndex)}
                    onClick={() => run(rowIndex)}
                  >
                    <span className="search-row__art"><GameArt game={g} glyph={false} marks={false} /></span>
                    <span className="search-row__meta">
                      <b>{g.title}</b>
                      <span className="mono t3">{g.studio} · {g.genres.join(' / ')}</span>
                    </span>
                    {state === 'installed' ? (
                      <span className="state-tag state-tag--ok"><Check size={10} /> Installed</span>
                    ) : (
                      <span className="mono t3 search-row__price">{g.price ? `$${g.price.toFixed(2)}` : 'FREE'}</span>
                    )}
                    <button
                      className="search-row__play"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSearchOpen(false)
                        launch(g.id)
                      }}
                      aria-label={`Launch ${g.title}`}
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {friendResults.length > 0 && (
            <div className="search-group">
              <span className="search-group__label label">Friends</span>
              {friendResults.map((f, i) => {
                const rowIndex = friendStart + i
                const active = rowIndex === index
                return (
                  <button
                    key={f.id}
                    data-row={rowIndex}
                    className={`search-row${active ? ' is-active' : ''}`}
                    onMouseEnter={() => setIndex(rowIndex)}
                    onClick={() => run(rowIndex)}
                  >
                    <Avatar initials={f.initials} accent={f.accent} size={30} />
                    <span className="search-row__meta">
                      <b>{f.name}</b>
                      <span className="mono t3">{f.handle} · {f.game ?? f.status}</span>
                    </span>
                    <span className={`dot ${f.status === 'in-game' ? 'dot--busy' : f.status === 'online' ? 'dot--live' : 'dot--off'}`} />
                  </button>
                )
              })}
            </div>
          )}

          {commandResults.length > 0 && (
            <div className="search-group">
              <span className="search-group__label label">Commands</span>
              {commandResults.map((c, i) => {
                const rowIndex = commandStart + i
                const active = rowIndex === index
                const Icon = c.icon
                return (
                  <button
                    key={c.id}
                    data-row={rowIndex}
                    className={`search-row search-row--cmd${active ? ' is-active' : ''}`}
                    onMouseEnter={() => setIndex(rowIndex)}
                    onClick={() => run(rowIndex)}
                  >
                    <span className="search-row__icon"><Icon size={15} /></span>
                    <span className="search-row__meta">
                      <b>{c.label}</b>
                      <span className="mono t3">{c.hint}</span>
                    </span>
                    <CornerDownLeft size={13} className="t3" />
                  </button>
                )
              })}
            </div>
          )}

          {rows.length === 0 && (
            <div className="search-empty">
              <Command size={20} />
              <b>No results for “{query}”</b>
              <span>Try a title, a studio name, or a command like “store”.</span>
            </div>
          )}
        </div>

        <div className="search-panel__foot">
          <span className="mono"><ArrowUp size={11} /><ArrowDown size={11} /> navigate</span>
          <span className="mono"><CornerDownLeft size={11} /> open</span>
          <span className="mono"><span className="kbd">ESC</span> close</span>
          <span className="search-panel__brand mono">AXIOM COMMAND</span>
        </div>
      </div>
    </div>
  )
}
