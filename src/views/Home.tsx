import { useEffect, useState } from 'react'
import {
  Play,
  ArrowUpRight,
  Plus,
  Check,
  Download,
  Pause,
  Cpu,
  Gauge,
  Trophy,
  Users,
  Zap,
  Flame,
  Clock,
  ChevronRight,
  ChevronLeft,
  Radio,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { games, featuredIds, friends, activityFeed, getGame } from '../data/games'
import GameArt from '../components/GameArt'
import { Avatar, GameCard, Meter, PlayPill, SectionHead, WideCard, PriceTag, StatusDot } from '../components/ui'

const pad = (n: number) => String(n).padStart(2, '0')

function Hero() {
  const { launch, openGame, wishlist, toggleWishlist, states, accent, go } = useLauncher()
  const featured = featuredIds.map((id) => getGame(id)!).filter(Boolean)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const game = featured[index]
  const state = states[game.id] ?? game.state
  const listed = wishlist.includes(game.id)

  useEffect(() => {
    if (paused) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % featured.length), 9000)
    return () => window.clearInterval(t)
  }, [paused, featured.length])

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Featured games"
    >
      <div className="hero__art-layer">
        {featured.map((g, i) => (
          <div key={g.id} className={`hero__art${i === index ? ' is-active' : ''}`}>
            <GameArt game={g} glyph={false} marks={false} />
          </div>
        ))}
        <div className="hero__overlay" />
        <div className="hero__bar" style={{ background: game.accent }} />
      </div>

      <div className="hero__content">
        <div className="hero__kicker">
          <span className="hero__selects">
            <span className="dot" style={{ background: game.accent }} />
            AXIOM SELECTS
          </span>
          <span className="mono t3">FEATURED {pad(index + 1)} / {pad(featured.length)}</span>
        </div>

        <h1 className="hero__title display">{game.title}</h1>
        <p className="hero__tagline">{game.tagline}</p>
        <p className="hero__desc">{game.description}</p>

        <div className="hero__actions">
          <button
            className="btn btn--primary btn--lg"
            onClick={() =>
              state === 'available'
                ? openGame(game.id)
                : state === 'queued' || state === 'downloading'
                  ? go('downloads')
                  : launch(game.id)
            }
          >
            {state === 'available' ? <Plus size={14} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}
            {state === 'installed' || state === 'update' ? 'Continue' : state === 'available' ? 'View in store' : 'View transfers'}
          </button>
          <button className="btn btn--outline btn--lg" onClick={() => openGame(game.id)}>
            Game detail
            <ArrowUpRight size={15} />
          </button>
          <button
            className={`btn btn--ghost btn--lg hero__wish${listed ? ' is-on' : ''}`}
            onClick={() => toggleWishlist(game.id)}
            aria-pressed={listed}
          >
            {listed ? <Check size={15} /> : <Plus size={15} />}
            {listed ? 'Wishlisted' : 'Wishlist'}
          </button>
        </div>

        <div className="hero__meta">
          <span className="hero__meta-item">
            <b className="mono" style={{ color: game.accent }}>{game.score}</b> META
          </span>
          <span className="hero__sep" />
          <span>{game.studio}</span>
          <span className="hero__sep" />
          <span className="mono">{game.genres.join(' / ')}</span>
          <span className="hero__sep" />
          <span className="mono">{game.size.toFixed(1)} GB</span>
          <span className="hero__cert">
            <Check size={11} /> Verified
          </span>
        </div>
      </div>

      <div className="hero__side">
        <div className="hero__spec panel">
          <div className="hero__spec-row">
            <span className="label">Runtime</span>
            <b className="mono">{game.engine.replace('AXIOM / ', '')}</b>
          </div>
          <div className="hero__spec-row">
            <span className="label">Display</span>
            <b className="mono">4K · 120 HDR</b>
          </div>
          <div className="hero__spec-row">
            <span className="label">Session avg.</span>
            <b className="mono">{game.traits[3].value > 60 ? '2h 40m' : '48m'}</b>
          </div>
          <div className="hero__spec-row">
            <span className="label">Access</span>
            <b className="mono" style={{ color: game.accent }}>
              {state === 'installed' ? 'INSTALLED' : state === 'available' ? 'IN STORE' : 'TRANSFER'}
            </b>
          </div>
        </div>

        <div className="hero__nav">
          <button className="icon-btn hero__arrow" onClick={() => setIndex((index - 1 + featured.length) % featured.length)} aria-label="Previous feature">
            <ChevronLeft size={16} />
          </button>
          <div className="hero__ticks">
            {featured.map((g, i) => (
              <button
                key={g.id}
                className={`hero__tick${i === index ? ' is-active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Show ${g.title}`}
              >
                <span className="mono">{pad(i + 1)}</span>
                <span className="hero__tick-line">
                  {i === index && !paused && <i key={index} style={{ background: game.accent }} />}
                </span>
              </button>
            ))}
          </div>
          <button className="icon-btn hero__arrow" onClick={() => setIndex((index + 1) % featured.length)} aria-label="Next feature">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="hero__ticker mono">
        <span className="hero__ticker-live"><Radio size={11} /> LIVE OPS</span>
        <span>VOIDRUNNER SEASON 7 — 2.4M RUNS LOGGED</span>
        <span className="t3">/</span>
        <span>PATCH 2.4.17 DEPLOYED 14:02 UTC</span>
        <span className="t3">/</span>
        <span style={{ color: accent }}>DOUBLE XP WEEKEND ACTIVE</span>
      </div>
    </section>
  )
}

function RuntimePanel() {
  const { setControlOpen, running } = useLauncher()
  return (
    <div className="panel side-panel">
      <div className="panel__head">
        <span className="panel__title"><Cpu size={14} /> Runtime</span>
        <span className="tag tag--accent mono">REFLEX ON</span>
      </div>
      <div className="panel__body runtime-body">
        <div className="runtime-gauge">
          <div className="runtime-gauge__dial">
            <svg viewBox="0 0 100 56" aria-hidden="true">
              <path d="M8 52 A 42 42 0 0 1 92 52" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" strokeLinecap="round" />
              <path d="M8 52 A 42 42 0 0 1 92 52" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray="96 132" />
            </svg>
            <div className="runtime-gauge__val">
              <b className="mono">72</b>
              <span className="label">fps lock</span>
            </div>
          </div>
          <div className="runtime-readouts">
            <div><span>GPU</span><b className="mono">61°C</b></div>
            <div><span>VRAM</span><b className="mono">9.4G</b></div>
            <div><span>LAT</span><b className="mono">6.9ms</b></div>
          </div>
        </div>
        <div className="runtime-meter">
          <div className="runtime-meter__row"><span>Shader cache</span><span className="mono t3">1,204 / 1,204</span></div>
          <Meter value={100} thin />
        </div>
        <div className="runtime-meter">
          <div className="runtime-meter__row"><span>Content volume</span><span className="mono t3">412 GB / 1 TB</span></div>
          <Meter value={41} thin color="#8ab4ff" />
        </div>
        <div className="runtime-foot">
          <span className="dot dot--live" />
          <span className="mono">{running ? 'SESSION ACTIVE' : 'IDLE · READY'}</span>
          <button className="runtime-link" onClick={() => setControlOpen(true)}>
            Tune
          </button>
        </div>
      </div>
    </div>
  )
}

function FriendsPanel() {
  const { go } = useLauncher()
  const live = friends.filter((f) => f.status === 'in-game')
  return (
    <div className="panel side-panel">
      <div className="panel__head">
        <span className="panel__title"><Users size={14} /> Live now</span>
        <span className="mono t3" style={{ fontSize: 11 }}>{live.length} playing</span>
      </div>
      <ul className="friends-live">
        {friends.slice(0, 4).map((f) => (
          <li key={f.id} className="friends-live__row">
            <span className="friends-live__av">
              <Avatar initials={f.initials} accent={f.accent} size={30} />
              <StatusDot status={f.status} />
            </span>
            <span className="friends-live__meta">
              <b>{f.name.split(' ')[0]}</b>
              <span className={f.status === 'in-game' ? 'accent-soft' : ''}>{f.game ?? 'In the launcher'}</span>
            </span>
            {f.status === 'in-game' && <span className="mono t3 friends-live__time">{f.playtime}</span>}
          </li>
        ))}
      </ul>
      <button className="side-panel__foot" onClick={() => go('network')}>
        Network <ArrowUpRight size={13} />
      </button>
    </div>
  )
}

function EventCard() {
  const [secs, setSecs] = useState(3 * 3600 + 14 * 60 + 22)
  useEffect(() => {
    const i = window.setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(i)
  }, [])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return (
    <div className="event">
      <div className="event__bg" aria-hidden="true">
        <GameArt game={getGame('voidrunner')!} glyph={false} marks={false} />
      </div>
      <div className="event__body">
        <span className="eyebrow"><Flame size={12} /> Community marathon</span>
        <h3 className="event__title display">VOLT RUN<br />72 HOURS</h3>
        <p className="event__desc">
          Twelve studios, one ladder. Log a run in any AXIOM title before the clock clears and add
          your hours to the global counter.
        </p>
        <div className="event__grid">
          <div><span className="label">Ends in</span><b className="mono">{pad(h)}:{pad(m)}:{pad(s)}</b></div>
          <div><span className="label">Operators</span><b className="mono">84,291</b></div>
          <div><span className="label">Hours logged</span><b className="mono">1.42M</b></div>
        </div>
        <div className="event__foot">
          <button className="btn btn--light btn--sm">
            Join the run <ArrowUpRight size={13} />
          </button>
          <span className="mono event__reward"><Trophy size={12} /> EXCLUSIVE PROFILE FRAME</span>
        </div>
      </div>
    </div>
  )
}

function TransfersPanel() {
  const { go, states, progress, paused, togglePause } = useLauncher()
  const active = ['gridlock', 'ironfall'].map((id) => getGame(id)!)
  return (
    <div className="panel transfers">
      <div className="panel__head">
        <span className="panel__title"><Download size={14} /> Transfers</span>
        <button className="section__link" onClick={() => go('downloads')}>
          All <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="transfers__list">
        {active.map((g) => {
          const p = progress[g.id] ?? 0
          const isPaused = paused[g.id]
          const state = states[g.id]
          return (
            <div className="transfer" key={g.id}>
              <span className="transfer__art">
                <GameArt game={g} glyph={false} marks={false} />
              </span>
              <div className="transfer__body">
                <div className="transfer__row">
                  <b>{g.title}</b>
                  <span className="mono t3">{state === 'update' ? 'PATCH' : 'INSTALL'}</span>
                </div>
                <Meter value={p} striped={!isPaused} thin color={g.accent} />
                <div className="transfer__meta mono">
                  <span>{p.toFixed(0)}% · {(g.size * (p / 100)).toFixed(1)} / {g.size.toFixed(1)} GB</span>
                  <span>{isPaused ? 'PAUSED' : `${(p / 10).toFixed(1)} MB/s · 4m`}</span>
                </div>
              </div>
              <button className="icon-btn" onClick={() => togglePause(g.id)} aria-label={isPaused ? 'Resume' : 'Pause'}>
                {isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="transfers__foot">
        <span className="label">Disk throughput</span>
        <span className="mono">1.2 GB/s · NVMe-1</span>
        <span className="transfers__spark" aria-hidden="true">
          {Array.from({ length: 26 }).map((_, i) => (
            <i key={i} style={{ height: 4 + ((i * 5) % 15) }} />
          ))}
        </span>
      </div>
    </div>
  )
}

function FeedPanel() {
  const { go } = useLauncher()
  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title"><Radio size={14} /> Signal feed</span>
        <button className="section__link" onClick={() => go('network')}>
          Network <ArrowUpRight size={13} />
        </button>
      </div>
      <ul className="feed">
        {activityFeed.map((a) => (
          <li key={a.id} className="feed__row">
            <span className="feed__mark" style={{ background: a.accent }} />
            <p>
              <b>{a.who}</b> {a.action} <b>{a.detail}</b>
              <span className="feed__game">{a.game}</span>
            </p>
            <span className="mono t3 feed__time">{a.time}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AchievementPanel() {
  const { go } = useLauncher()
  const unlocked = games.flatMap((g) =>
    g.achievements.filter((a) => a.unlocked).map((a) => ({ ...a, game: g })),
  )
  const total = games.flatMap((g) => g.achievements).length
  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title"><Trophy size={14} /> Achievements</span>
        <span className="mono t3" style={{ fontSize: 11 }}>
          {unlocked.length} / {total}
        </span>
      </div>
      <div className="ach">
        {unlocked.slice(0, 3).map((a) => (
          <div className="ach__row" key={a.id}>
            <span className="ach__medal" style={{ '--medal': a.game.accent } as React.CSSProperties}>
              <Trophy size={13} />
            </span>
            <div className="ach__meta">
              <b>{a.name}</b>
              <span>{a.game.title}</span>
            </div>
            <div className="ach__xp mono">
              +{a.xp}
              <span className="label" style={{ marginTop: 2 }}>XP</span>
            </div>
          </div>
        ))}
        <div className="ach__progress">
          <div className="ach__progress-head">
            <span>Completion score</span>
            <span className="mono">31%</span>
          </div>
          <Meter value={31} />
        </div>
      </div>
      <button className="side-panel__foot" onClick={() => go('library')}>
        Library <ArrowUpRight size={13} />
      </button>
    </div>
  )
}

export default function Home() {
  const { go, states, progress, launch } = useLauncher()
  const installed = games.filter((g) => (states[g.id] ?? g.state) === 'installed')
  const continueGames = ['voidrunner', 'ashen-crown', 'crimson-harvest'].map((id) => getGame(id)!)
  const shelf = ['hollow-orchard', 'pale-tide', 'lumen', 'deadfrequency', 'neon-koi', 'shatterpoint', 'rust-rhyme', 'ashen-crown'].map(
    (id) => getGame(id)!,
  )

  return (
    <div className="home">
      <Hero />

      <div className="home__top-split">
        <div className="home__top-left">
          <SectionHead
            kicker="Pick up"
            title="Continue playing"
            action={() => go('library')}
            actionLabel="Library"
            meta={<span className="mono t3 section__meta">{installed.length} installed</span>}
          />
          <div className="continue-row">
            {continueGames.map((g) => (
              <div className="continue-card" key={g.id}>
                <WideCard game={g} />
                <div className="continue-card__progress">
                  <div className="continue-card__row">
                    <span className="mono t3">Last played {g.lastPlayed}</span>
                    <span className="mono">{states[g.id] === 'downloading' ? `${Math.round(progress[g.id] ?? 0)}%` : `${g.progress}%`}</span>
                  </div>
                  <Meter value={states[g.id] === 'downloading' ? progress[g.id] ?? 0 : g.progress} thin color={g.accent} />
                </div>
              </div>
            ))}
          </div>

          <TransfersPanel />
        </div>

        <aside className="home__top-right">
          <RuntimePanel />
          <div className="week-strip">
            <div className="week-strip__stats">
              <div>
                <span className="label">This week</span>
                <b className="mono">12h 41m</b>
                <span className="week-strip__delta mono">+18% vs last</span>
              </div>
              <div>
                <span className="label">Streak</span>
                <b className="mono">6 days</b>
                <span className="week-strip__delta mono">best 14</span>
              </div>
            </div>
            <div className="week-strip__chart" aria-hidden="true">
              {[42, 68, 26, 88, 54, 96, 61].map((h, i) => (
                <span key={i}>
                  <i style={{ height: `${h}%`, background: i === 5 ? 'var(--accent)' : undefined }} />
                  <em className="mono">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</em>
                </span>
              ))}
            </div>
          </div>
          <FriendsPanel />
        </aside>
      </div>

      <SectionHead
        kicker="Curated for your rig"
        title="On the shelf"
        action={() => go('store')}
        actionLabel="Browse store"
        meta={<span className="mono t3 section__meta">Updated 14:02 UTC</span>}
      />
      <div className="shelf">
        {shelf.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      <div className="home__split">
        <div className="home__split-main">
          <EventCard />
          <FeedPanel />
        </div>
        <div className="home__split-side">
          <AchievementPanel />
          <div className="panel quick-actions">
            <div className="panel__head">
              <span className="panel__title"><Zap size={14} /> Quick launch</span>
            </div>
            <div className="quick-actions__grid">
              {installed.slice(0, 4).map((g) => (
                <button className="quick-action" key={g.id} onClick={() => launch(g.id)}>
                  <span className="quick-action__glyph mono" style={{ background: `linear-gradient(140deg, ${g.palette[2]}, ${g.palette[1]})` }}>
                    {g.glyph}
                  </span>
                  <span>{g.title.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            <div className="quick-actions__foot">
              <Clock size={12} />
              <span className="mono">Avg. launch 1.8s</span>
              <Gauge size={12} />
              <span className="mono">Cold boot 4.1s</span>
            </div>
          </div>
        </div>
      </div>

      <SectionHead
        kicker="Store"
        title="Leaving the station this week"
        action={() => go('store')}
        actionLabel="All releases"
      />
      <div className="new-row">
        {['pale-tide', 'lumen', 'deadfrequency'].map((id) => {
          const g = getGame(id)!
          return (
            <div className="new-card" key={g.id}>
              <WideCard game={g} />
              <div className="new-card__foot">
                <PriceTag price={g.price} />
                <span className="mono t3">{g.year} · {g.genres.join(' / ')}</span>
                <PlayPill game={g} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
