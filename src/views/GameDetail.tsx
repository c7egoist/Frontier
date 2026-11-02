import { useState } from 'react'
import {
  Play,
  Check,
  ChevronRight,
  ArrowUpRight,
  Download,
  Heart,
  Share2,
  MoreHorizontal,
  Trophy,
  Users,
  Clock,
  HardDrive,
  Cpu,
  ShieldCheck,
  Star,
  BarChart3,
  MonitorPlay,
  Gamepad2,
  Volume2,
  Languages,
  CircleDot,
  Wrench,
  Sparkles,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { games, friends, getGame } from '../data/games'
import type { ArtVariant, Game } from '../data/types'
import GameArt from '../components/GameArt'
import { Avatar, Meter, PlayPill, PriceTag, ScoreRing, Tag } from '../components/ui'

type Tab = 'overview' | 'achievements' | 'sessions' | 'specs'

const tabs: [Tab, string][] = [
  ['overview', 'Overview'],
  ['achievements', 'Achievements'],
  ['sessions', 'Sessions'],
  ['specs', 'Specs'],
]

const galleryVariants: ArtVariant[] = ['grid', 'flow', 'shards', 'signal']

function HeroPanel({ game }: { game: Game }) {
  const { states, progress, launch, stop, running, install, wishlist, toggleWishlist, notify, go } = useLauncher()
  const state = states[game.id] ?? game.state
  const listed = wishlist.includes(game.id)
  const isRunning = running?.id === game.id

  return (
    <div className="game-hero">
      <div className="game-hero__art">
        <GameArt game={game} glyph={false} marks={false} />
        <div className="game-hero__scrim" />
      </div>

      <div className="game-hero__content">
        <div className="game-hero__studio">
          <span className="dot" style={{ background: game.accent }} />
          {game.studio} <span className="t3">· {game.year}</span>
        </div>
        <h1 className="game-hero__title display">{game.title}</h1>
        <p className="game-hero__tagline">{game.tagline}</p>
        <div className="game-hero__tags">
          {game.genres.map((g) => (
            <Tag key={g} tone="light">{g}</Tag>
          ))}
          {game.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <Tag tone="accent"><ShieldCheck size={10} /> Verified build</Tag>
        </div>

        <div className="game-hero__actions">
          {isRunning ? (
            <button className="btn btn--primary btn--lg" onClick={stop}>
              End session <span className="mono game-hero__live">LIVE</span>
            </button>
          ) : state === 'available' ? (
            <>
              <button className="btn btn--primary btn--lg" onClick={() => install(game.id)}>
                <Download size={15} /> Install · {game.size.toFixed(1)} GB
              </button>
              <span className="game-hero__price"><PriceTag price={game.price} /></span>
            </>
          ) : state === 'downloading' || state === 'queued' ? (
            <button className="btn btn--primary btn--lg" onClick={() => go('downloads')}>
              <Download size={15} /> {state === 'queued' ? 'Queued' : `${Math.round(progress[game.id] ?? 0)}% downloading`}
            </button>
          ) : (
            <button className="btn btn--primary btn--lg" onClick={() => launch(game.id)}>
              <Play size={14} fill="currentColor" strokeWidth={0} />
              {state === 'update' ? 'Launch anyway' : 'Play now'}
            </button>
          )}
          <button className={`btn btn--outline btn--lg${listed ? ' is-on' : ''}`} onClick={() => toggleWishlist(game.id)}>
            {listed ? <Check size={15} /> : <Heart size={15} />}
            {listed ? 'Wishlisted' : 'Wishlist'}
          </button>
          <button className="icon-btn" onClick={() => notify('Share link copied', `axiom.gg/${game.id}`)} aria-label="Share">
            <Share2 size={16} />
          </button>
          <button className="icon-btn" aria-label="More options">
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      <div className="game-hero__spec panel">
        <div className="game-hero__spec-top">
          <ScoreRing score={game.score} size={54} />
          <div>
            <span className="label">Critic meta</span>
            <b className="mono game-hero__players">{game.players} <span>playing now</span></b>
          </div>
        </div>
        <div className="game-hero__spec-grid">
          <div><span className="label">Build</span><b className="mono">{game.version}</b></div>
          <div><span className="label">Engine</span><b className="mono">{game.engine.replace('AXIOM / ', '')}</b></div>
          <div><span className="label">Install</span><b className="mono">{game.size.toFixed(1)} GB</b></div>
          <div><span className="label">Played</span><b className="mono">{(game.playtime / 60).toFixed(1)} h</b></div>
        </div>
        {state === 'update' && (
          <div className="game-hero__update">
            <div className="game-hero__update-row">
              <Wrench size={12} /> Patch {game.version} ready
              <span className="mono">{Math.round(progress[game.id] ?? 0)}%</span>
            </div>
            <Meter value={progress[game.id] ?? 0} striped thin />
          </div>
        )}
        <div className="game-hero__spec-foot">
          <PlayPill game={game} size="md" full />
        </div>
      </div>
    </div>
  )
}

function Overview({ game }: { game: Game }) {
  const { notify } = useLauncher()
  const totalAch = game.achievements.length
  const done = game.achievements.filter((a) => a.unlocked).length
  const owners = friends.filter((f) => f.status !== 'offline').slice(0, 4)

  return (
    <div className="game-layout">
      <div className="game-main">
        <section className="block">
          <div className="block__head">
            <span className="label">01 — About</span>
            <h2 className="display">What you are getting into</h2>
          </div>
          <p className="game-desc">{game.description}</p>
          <p className="game-desc t2">
            Built for the AXIOM runtime with a frame-time budget of 6.9 ms at 1440p. Save state is
            continuous: close the session anywhere and resume from the exact frame, on any device signed
            into your operator profile.
          </p>
          <ul className="feature-list">
            {game.features.map((f, i) => (
              <li key={f}>
                <span className="mono feature-list__idx">{String(i + 1).padStart(2, '0')}</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="block">
          <div className="block__head">
            <span className="label">02 — Environment studies</span>
            <h2 className="display">Inside the build</h2>
          </div>
          <div className="gallery">
            {galleryVariants.map((v, i) => (
              <button
                key={v}
                className={`gallery__tile gallery__tile--${i + 1}`}
                onClick={() => notify('Capture viewer', `${game.title} · study ${String(i + 1).padStart(2, '0')} · 4K`)}
              >
                <GameArt game={{ ...game, art: v, id: `${game.id}-${v}` }} glyph={false} marks={false} />
                <span className="gallery__cap mono">
                  STUDY {String(i + 1).padStart(2, '0')}
                  <ArrowUpRight size={11} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block__head">
            <span className="label">03 — Systems</span>
            <h2 className="display">Session telemetry</h2>
          </div>
          <div className="telemetry">
            {[
              ['Median session', '48 min', 54],
              ['Completion rate', `${game.progress}%`, game.progress],
              ['Frame stability', '99.2%', 99],
              ['Crash-free', '99.98%', 99],
            ].map(([label, value, pct]) => (
              <div className="telemetry__row" key={label as string}>
                <div className="telemetry__meta">
                  <span>{label}</span>
                  <b className="mono">{value}</b>
                </div>
                <Meter value={pct as number} thin color={game.accent} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="game-side">
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title"><BarChart3 size={14} /> Player profile fit</span>
          </div>
          <div className="traits">
            {game.traits.map((t) => (
              <div className="trait" key={t.label}>
                <div className="trait__row">
                  <span>{t.label}</span>
                  <span className="mono t3">{t.value}</span>
                </div>
                <div className="trait__bar">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <i
                      key={i}
                      className={i < Math.round((t.value / 100) * 22) ? 'on' : ''}
                      style={i < Math.round((t.value / 100) * 22) ? { background: game.accent } : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title"><Trophy size={14} /> Achievements</span>
            <span className="mono t3">{done}/{totalAch}</span>
          </div>
          <div className="side-ach">
            <div className="side-ach__ring">
              <Meter value={(done / totalAch) * 100} thin color={game.accent} />
              <span className="mono">{(done / totalAch) * 100 | 0}% complete</span>
            </div>
            {game.achievements.slice(0, 3).map((a) => (
              <div className={`side-ach__row${a.unlocked ? ' is-on' : ''}`} key={a.id}>
                <span className="side-ach__badge">{a.unlocked ? <Check size={11} /> : <CircleDot size={11} />}</span>
                <span className="side-ach__meta">
                  <b>{a.name}</b>
                  <span>{a.rarity}% rarity · +{a.xp} XP</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title"><Users size={14} /> In your network</span>
          </div>
          <div className="owners">
            {owners.map((f) => (
              <span className="owners__av" key={f.id} title={f.name}>
                <Avatar initials={f.initials} accent={f.accent} size={30} />
              </span>
            ))}
            <span className="mono t3 owners__note">4 of 7 own this</span>
          </div>
          <div className="owners__tags">
            <span className="mono t3"><Clock size={11} /> Avg. first session 52m</span>
            <span className="mono t3"><Sparkles size={11} /> 2 friends playing</span>
          </div>
        </div>
      </aside>
    </div>
  )
}

function AchievementsTab({ game }: { game: Game }) {
  const total = game.achievements.length
  const done = game.achievements.filter((a) => a.unlocked).length
  return (
    <div className="ach-tab">
      <div className="ach-tab__head">
        <div>
          <span className="label">Progress</span>
          <h2 className="display">{done} of {total} unlocked</h2>
          <p>Rarity is measured across all AXIOM operators who own this title.</p>
        </div>
        <div className="ach-tab__summary">
          <div><span className="label">Completion</span><b className="mono">{Math.round((done / total) * 100)}%</b></div>
          <div><span className="label">XP earned</span><b className="mono">{game.achievements.filter((a) => a.unlocked).reduce((a, b) => a + b.xp, 0)}</b></div>
          <div><span className="label">Rarest</span><b className="mono">{Math.min(...game.achievements.map((a) => a.rarity)).toFixed(1)}%</b></div>
        </div>
      </div>
      <div className="ach-tab__grid">
        {game.achievements.map((a) => (
          <article className={`ach-card${a.unlocked ? ' is-on' : ''}`} key={a.id}>
            <div className="ach-card__top">
              <span className="ach-card__medal" style={{ color: a.unlocked ? game.accent : undefined }}>
                {a.unlocked ? <Trophy size={18} /> : <CircleDot size={18} />}
              </span>
              <span className="mono t3">{a.unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
            </div>
            <h3>{a.name}</h3>
            <p>{a.desc}</p>
            <div className="ach-card__foot">
              <div className="ach-card__rarity">
                <div className="ach-card__rarity-row">
                  <span className="mono">{a.rarity}% of operators</span>
                  <span className="mono t3">+{a.xp} XP</span>
                </div>
                <Meter value={Math.max(3, a.rarity)} thin color={game.accent} />
              </div>
            </div>
          </article>
        ))}
        <article className="ach-card ach-card--meta">
          <div className="ach-card__top">
            <span className="ach-card__medal"><Star size={18} /></span>
            <span className="mono t3">PERFECT RUN</span>
          </div>
          <h3>Completionist</h3>
          <p>Unlock every achievement in {game.title} to earn the platinum profile frame.</p>
          <div className="ach-card__foot">
            <Meter value={(done / total) * 100} thin color={game.accent} />
            <span className="mono t3">{done} / {total}</span>
          </div>
        </article>
      </div>
    </div>
  )
}

function SessionsTab({ game }: { game: Game }) {
  const sessions = [
    { date: '31 Oct 2026', length: '2h 14m', note: 'Main line · floor 38', frames: '144 avg' },
    { date: '29 Oct 2026', length: '48m', note: 'Daily contract', frames: '138 avg' },
    { date: '26 Oct 2026', length: '3h 02m', note: 'Co-op with Amelia', frames: '144 avg' },
    { date: '22 Oct 2026', length: '1h 12m', note: 'Exploration', frames: '141 avg' },
    { date: '19 Oct 2026', length: '56m', note: 'Boss attempt ×4', frames: '139 avg' },
  ]
  const week = [40, 82, 20, 65, 96, 28, 74]
  return (
    <div className="sessions-tab">
      <div className="sessions-tab__head">
        <div>
          <span className="label">Last 30 days</span>
          <h2 className="display">{(game.playtime / 60).toFixed(0)} hours logged</h2>
          <p>Session data is stored locally and never leaves the device unless you opt in.</p>
        </div>
        <div className="sessions-tab__chart">
          {week.map((v, i) => (
            <div key={i} className="sessions-bar">
              <i style={{ height: `${v}%`, background: i === 4 ? game.accent : 'rgba(255,255,255,.16)' }} />
              <span className="mono">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="sessions-table">
          <div className="sessions-table__head mono">
            <span>Date</span><span>Length</span><span>Notes</span><span>Frame average</span>
          </div>
          {sessions.map((s) => (
            <div className="sessions-table__row" key={s.date}>
              <span className="mono">{s.date}</span>
              <span className="mono">{s.length}</span>
              <span>{s.note}</span>
              <span className="mono t3">{s.frames}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SpecsTab({ game }: { game: Game }) {
  const specs = [
    ['OS', 'Windows 11 24H2 / Linux 7.2', 'Windows 11 24H2 / Linux 7.2'],
    ['CPU', '6 cores / 12 threads', '8 cores / 16 threads'],
    ['GPU', '8 GB VRAM · Vulkan 1.4', '12 GB VRAM · Vulkan 1.4'],
    ['Memory', '16 GB', '32 GB'],
    ['Storage', `${Math.ceil(game.size)} GB SSD`, `${Math.ceil(game.size) + 12} GB NVMe`],
    ['Display', '1080p · 60 fps', '1440p · 144 fps / HDR'],
  ]
  return (
    <div className="specs-tab">
      <div className="specs-tab__head">
        <div>
          <span className="label">Hardware</span>
          <h2 className="display">Tuned for your rig</h2>
          <p>AXIOM profiles each title against your hardware on install and sets a frame budget automatically.</p>
        </div>
        <div className="rig panel">
          <span className="label">This device</span>
          <b className="mono">AXIOM STATION · 4070 Ti</b>
          <div className="rig__rows">
            <span>Ryzen 7 7800X3D</span>
            <span>32 GB DDR5</span>
            <span>NVMe-1 · 1 TB</span>
          </div>
          <span className="tag tag--accent mono">MEETS RECOMMENDED</span>
        </div>
      </div>

      <div className="panel specs-table">
        <div className="specs-table__head">
          <span>Requirement</span>
          <span>Minimum</span>
          <span>Recommended</span>
        </div>
        {specs.map(([k, min, rec]) => (
          <div className="specs-table__row" key={k}>
            <span className="specs-table__key">{k}</span>
            <span className="mono">{min}</span>
            <span className="mono">{rec}</span>
          </div>
        ))}
      </div>

      <div className="specs-cards">
        <div className="panel spec-card">
          <span className="label"><Gamepad2 size={12} /> Input</span>
          <b>Controller, KB/M, wheel</b>
          <p>Full haptics on DualSense and Xbox Elite. Remappable per-scene bindings.</p>
        </div>
        <div className="panel spec-card">
          <span className="label"><Volume2 size={12} /> Audio</span>
          <b>3D spatial · 7.1.4</b>
          <p>Dolby Atmos and Windows Spatial supported. Headphone profile tuned per title.</p>
        </div>
        <div className="panel spec-card">
          <span className="label"><Languages size={12} /> Languages</span>
          <b>14 interface · 8 voice</b>
          <p>Full audio localisation for EN, FR, DE, ES, PT-BR, JA, KO and ZH.</p>
        </div>
        <div className="panel spec-card">
          <span className="label"><MonitorPlay size={12} /> Display</span>
          <b>Ultrawide · HDR10</b>
          <p>21:9 and 32:9 supported without pillarboxing. Frame-gen available on Reflex tier.</p>
        </div>
        <div className="panel spec-card">
          <span className="label"><Cpu size={12} /> Runtime</span>
          <b>{game.engine}</b>
          <p>AXIOM runtime 2.4.17 required. Shader pre-compilation on install.</p>
        </div>
        <div className="panel spec-card">
          <span className="label"><HardDrive size={12} /> Storage</span>
          <b>{game.size.toFixed(1)} GB</b>
          <p>Partial install available for campaign; 4.2 GB base, streamed environments.</p>
        </div>
      </div>
    </div>
  )
}

export default function GameDetail() {
  const { route, go, states, openGame } = useLauncher()
  const [tab, setTab] = useState<Tab>('overview')
  const game = route.gameId ? getGame(route.gameId) : undefined

  if (!game) {
    return (
      <div className="empty" style={{ marginTop: 80 }}>
        <CircleDot size={22} />
        <b>Title not found</b>
        <span>This build is no longer indexed by the runtime.</span>
        <button className="btn btn--outline btn--sm" onClick={() => go('store')}>Back to store</button>
      </div>
    )
  }

  const state = states[game.id] ?? game.state
  const more = games.filter((g) => g.id !== game.id && g.genres.some((x) => game.genres.includes(x))).slice(0, 4)

  return (
    <div className="game">
      <div className="game__crumb">
        <button className="back-link" onClick={() => go(state === 'installed' ? 'library' : 'store')}>
          <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
          {state === 'installed' ? 'Library' : 'Store'}
        </button>
        <span className="t3">/</span>
        <span className="mono t3">{game.genres.join(' · ')}</span>
      </div>

      <HeroPanel game={game} />

      <div className="game-tabs">
        <div className="segmented">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={`segmented__btn${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
              {id === 'achievements' && <span className="mono">{game.achievements.filter((a) => a.unlocked).length}</span>}
              {id === 'sessions' && <span className="mono">{(game.playtime / 60).toFixed(0)}h</span>}
            </button>
          ))}
        </div>
        <span className="mono t3 game-tabs__note">
          <Check size={12} /> Cloud save synced · 2m ago
        </span>
      </div>

      {tab === 'overview' && <Overview game={game} />}
      {tab === 'achievements' && <AchievementsTab game={game} />}
      {tab === 'sessions' && <SessionsTab game={game} />}
      {tab === 'specs' && <SpecsTab game={game} />}

      <section className="more-like">
        <div className="section__head">
          <div className="section__heading">
            <span className="label">Similar builds</span>
            <h2 className="section__title display">If you run this, run these</h2>
          </div>
        </div>
        <div className="more-like__grid">
          {more.map((g) => (
            <button key={g.id} className="more-like__card" onClick={() => openGame(g.id)}>
              <span className="more-like__art">
                <GameArt game={g} glyph={false} marks={false} />
              </span>
              <span className="more-like__body">
                <b>{g.title}</b>
                <span className="mono t3">{g.genres.join(' / ')} · {g.score} meta</span>
              </span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
