import { useState } from 'react'
import {
  Mic,
  MicOff,
  Headphones,
  UserPlus,
  ArrowUpRight,
  MessageSquare,
  Trophy,
  Crown,
  Check,
  X,
  Radio,
  Users,
  Settings2,
  Gamepad2,
  Flame,
  Send,
  Sparkles,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { friends, ranks, activityFeed, getGame, getGameByTitle } from '../data/games'
import { Avatar, Meter, StatusDot } from '../components/ui'
import GameArt from '../components/GameArt'

function PartyPanel() {
  const { notify } = useLauncher()
  const [muted, setMuted] = useState(false)
  const [joined, setJoined] = useState(true)

  return (
    <div className="panel party">
      <div className="panel__head">
        <span className="panel__title"><Users size={14} /> Party · Redroom</span>
        <span className="tag tag--accent mono"><span className="dot dot--live" /> 4 / 6</span>
      </div>
      <div className="party__body">
        <div className="party__slots">
          {friends.slice(0, 3).map((f, i) => (
            <div className="party__slot" key={f.id}>
              <div className="party__avatar">
                <Avatar initials={f.initials} accent={f.accent} size={56} />
                <span className="party__level mono">{48 - i * 3}</span>
                {i === 1 && <span className="party__crown"><Crown size={11} /></span>}
              </div>
              <b>{f.name.split(' ')[0]}</b>
              <span className="party__slot-state mono">
                {i === 1 ? <MicOff size={10} /> : <Mic size={10} />}
                {i === 0 ? 'speaking' : i === 1 ? 'muted' : 'listening'}
              </span>
            </div>
          ))}
          <button className="party__slot party__slot--empty" onClick={() => notify('Invite sent', 'Party link AXM-4471 copied to clipboard')}>
            <span><UserPlus size={17} /></span>
            <b>Invite</b>
            <span className="party__slot-state mono">open slot</span>
          </button>
        </div>

        <div className="party__voice">
          <span className="party__code mono">AXM-4471</span>
          <div className="party__wave" aria-hidden="true">
            {[10, 18, 7, 24, 30, 14, 22, 9, 26, 16, 8, 20, 28, 12, 18, 6, 22, 15].map((h, i) => (
              <i key={i} style={{ height: h, animationDelay: `${i * 0.09}s` }} />
            ))}
          </div>
          <span className="mono party__lat">VOICE · 18 MS</span>
        </div>

        <div className="party__controls">
          <button className={`party__ctrl${muted ? ' is-off' : ''}`} onClick={() => setMuted(!muted)}>
            {muted ? <MicOff size={14} /> : <Mic size={14} />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
          <button className="party__ctrl"><Headphones size={14} /> Deafen</button>
          <button className="party__ctrl"><Settings2 size={14} /> Audio</button>
          <button className="party__ctrl party__ctrl--primary" onClick={() => setJoined(!joined)}>
            {joined ? 'Leave party' : 'Rejoin party'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequestsPanel() {
  const { notify } = useLauncher()
  const [requests, setRequests] = useState([
    { id: 'r1', name: 'Priya N.', handle: '@priya.n', mutual: 4, accent: '#7dffb0', initials: 'PN' },
    { id: 'r2', name: 'Jonas W.', handle: '@jwinter', mutual: 1, accent: '#ffb020', initials: 'JW' },
  ])
  return (
    <div className="panel requests">
      <div className="panel__head">
        <span className="panel__title"><UserPlus size={14} /> Requests</span>
        <span className="mono t3">{requests.length} pending</span>
      </div>
      <ul className="requests__list">
        {requests.map((r) => (
          <li key={r.id}>
            <Avatar initials={r.initials} accent={r.accent} size={32} />
            <div>
              <b>{r.name}</b>
              <span className="mono t3">{r.handle} · {r.mutual} mutual</span>
            </div>
            <button
              className="icon-btn requests__accept"
              onClick={() => {
                setRequests((q) => q.filter((x) => x.id !== r.id))
                notify('Friend added', `${r.name} is now in your network`)
              }}
              aria-label="Accept"
            >
              <Check size={14} />
            </button>
            <button className="icon-btn" onClick={() => setRequests((q) => q.filter((x) => x.id !== r.id))} aria-label="Decline">
              <X size={14} />
            </button>
          </li>
        ))}
        {requests.length === 0 && (
          <li className="requests__empty">
            <Check size={15} /> All caught up
          </li>
        )}
      </ul>
      <div className="requests__search">
        <UserPlus size={14} />
        <input placeholder="Add by handle, e.g. @operator" aria-label="Add friend" />
        <button className="btn btn--outline btn--sm" onClick={() => notify('Friend request sent', 'Handle lookup · pending acceptance')}>
          Send
        </button>
      </div>
    </div>
  )
}

function FriendsList() {
  const { notify } = useLauncher()
  const [filter, setFilter] = useState<'all' | 'in-game' | 'online'>('all')
  const list = friends.filter((f) => {
    if (filter === 'in-game') return f.status === 'in-game'
    if (filter === 'online') return f.status === 'online' || f.status === 'in-game'
    return true
  })

  return (
    <div className="panel friends-panel">
      <div className="panel__head">
        <span className="panel__title"><Gamepad2 size={14} /> Friends</span>
        <div className="segmented segmented--sm">
          {(['all', 'in-game', 'online'] as const).map((f) => (
            <button key={f} className={`segmented__btn${filter === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'in-game' ? 'Playing' : 'Online'}
            </button>
          ))}
        </div>
      </div>
      <div className="friends-panel__head mono">
        <span>Operator</span>
        <span>Activity</span>
        <span>Playtime</span>
        <span />
      </div>
      <ul className="friend-rows">
        {list.map((f) => {
          const game = getGameByTitle(f.game)
          return (
            <li key={f.id} className="friend-row">
              <span className="friend-row__who">
                <span className="friend-row__av">
                  <Avatar initials={f.initials} accent={f.accent} size={34} />
                  <StatusDot status={f.status} />
                </span>
                <span>
                  <b>{f.name}</b>
                  <span className="mono t3">{f.handle}</span>
                </span>
              </span>
              <span className="friend-row__activity">
                {game ? (
                  <>
                    <span className="friend-row__game-art">
                      <GameArt game={game} glyph={false} marks={false} />
                    </span>
                    <span>
                      <b>{game.title}</b>
                      <span className="mono t3">{f.status === 'in-game' ? 'In session' : 'Recently played'}</span>
                    </span>
                  </>
                ) : (
                  <span className="friend-row__idle">
                    <span className={`dot ${f.status === 'online' ? 'dot--live' : f.status === 'away' ? 'dot--away' : 'dot--off'}`} />
                    {f.status === 'online' ? 'In the launcher' : f.status === 'away' ? 'Away' : 'Offline'}
                  </span>
                )}
              </span>
              <span className="mono friend-row__time">{f.playtime}</span>
              <span className="friend-row__actions">
                <button
                  className="icon-btn"
                  aria-label="Message"
                  onClick={() => notify('Message window opened', `${f.name} · encrypted channel`)}
                >
                  <MessageSquare size={14} />
                </button>
                {f.status === 'in-game' ? (
                  <button
                    className="btn btn--outline btn--sm"
                    onClick={() => game && notify(`Join request sent`, `${f.name}'s ${game.title} lobby`)}
                  >
                    Join
                  </button>
                ) : (
                  <button className="btn btn--ghost btn--sm" onClick={() => notify('Invite sent', `${f.name} · party AXM-4471`)}>
                    Invite
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Leaderboard() {
  const max = ranks[0].xp
  return (
    <div className="panel leaderboard">
      <div className="panel__head">
        <span className="panel__title"><Trophy size={14} /> Season 12 ladder</span>
        <span className="tag mono">4D LEFT</span>
      </div>
      <div className="leaderboard__body">
        <div className="leaderboard__podium">
          {[ranks[1], ranks[0], ranks[2]].map((r, i) => (
            <div className={`podium podium--${i + 1}`} key={r.handle}>
              <span className="podium__rank mono">{i === 1 ? '01' : i === 0 ? '02' : '03'}</span>
              <Avatar initials={r.initials} accent={r.accent} size={i === 1 ? 54 : 42} ring={i === 1} />
              <b>{r.name.split(' ')[0]}</b>
              <span className="mono t3">{Math.round(r.xp / 1000)}k XP</span>
            </div>
          ))}
        </div>
        <ul className="ladder">
          {ranks.map((r, i) => (
            <li key={r.handle} className={`ladder__row${r.name === 'You' ? ' is-you' : ''}`}>
              <span className="mono ladder__rank">{String(i + 1).padStart(2, '0')}</span>
              <Avatar initials={r.initials} accent={r.accent} size={26} />
              <span className="ladder__name">
                <b>{r.name}</b>
                <span className="mono t3">{r.handle}</span>
              </span>
              <span className="ladder__bar">
                <Meter value={(r.xp / max) * 100} thin color={r.accent} />
              </span>
              <span className="mono ladder__xp">{r.xp.toLocaleString()}</span>
              <span className={`mono ladder__delta ${r.delta > 0 ? 'up' : 'down'}`}>
                {r.delta > 0 ? '▲' : '▼'} {Math.abs(r.delta)}
              </span>
            </li>
          ))}
        </ul>
        <div className="leaderboard__foot">
          <span className="mono t3">Resets Sunday 23:59 UTC</span>
          <button className="section__link">Full ladder <ArrowUpRight size={13} /></button>
        </div>
      </div>
    </div>
  )
}

function ActivityWall() {
  const { openGame, notify } = useLauncher()
  const voidrunner = getGame('voidrunner')!
  const orchard = getGame('hollow-orchard')!
  const ashen = getGame('ashen-crown')!

  return (
    <section className="net-activity">
      <div className="section__head">
        <div className="section__heading">
          <span className="label">Network</span>
          <h2 className="section__title display">Signals from the network</h2>
        </div>
        <button className="section__link">
          Open feed <ArrowUpRight size={13} />
        </button>
      </div>

      <div className="net-cards">
        <article className="net-card net-card--ach">
          <div className="net-card__art"><GameArt game={voidrunner} glyph={false} marks={false} /></div>
          <div className="net-card__body">
            <span className="eyebrow"><Sparkles size={11} /> Rare unlock</span>
            <h3>PHASE PERFECT</h3>
            <p>Amelia chained twelve phase-dashes without a reset — earned by 11.8% of runners.</p>
            <div className="net-card__foot">
              <Avatar initials="AB" accent="#3ef0d0" size={24} />
              <span className="mono t3">8 MIN AGO · VOIDRUNNER</span>
              <button className="icon-btn" onClick={() => openGame('voidrunner')} aria-label="Open game">
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </article>

        <article className="net-card net-card--session">
          <div className="net-card__body">
            <span className="eyebrow"><Flame size={11} /> Session recap</span>
            <h3 className="display">14 hours in the orchard</h3>
            <p>Nadia finished THE LONG WING and lit every glasshouse in a single sitting.</p>
            <div className="net-card__stats">
              <div><span className="label">Session</span><b className="mono">14h 08m</b></div>
              <div><span className="label">Achievements</span><b className="mono">3</b></div>
              <div><span className="label">XP</span><b className="mono">+640</b></div>
            </div>
            <button className="btn btn--outline btn--sm" onClick={() => openGame(orchard.id)}>
              See the run <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="net-card__aside">
            <GameArt game={orchard} glyph={false} marks={false} />
          </div>
        </article>

        <article className="net-card net-card--invite">
          <div className="net-card__body">
            <span className="eyebrow"><Radio size={11} /> Open party</span>
            <h3>Ash Wednesday</h3>
            <p>Helena is hosting a co-op run through the burnt chapel. Two slots open, voice required.</p>
            <div className="net-card__party">
              {friends.slice(0, 3).map((f) => (
                <Avatar key={f.id} initials={f.initials} accent={f.accent} size={28} />
              ))}
              <span className="net-card__slot">+2</span>
              <span className="mono t3">AXM-1180</span>
            </div>
            <div className="net-card__actions">
              <button className="btn btn--primary btn--sm" onClick={() => notify('Joining party', 'AXM-1180 · handshake complete', '#ff8a3d')}>
                <Send size={12} /> Join party
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => openGame(ashen.id)}>Game detail</button>
            </div>
          </div>
        </article>

        <article className="net-card net-card--feed">
          <div className="net-card__body">
            <span className="eyebrow"><Radio size={11} /> Live feed</span>
            <ul className="net-feed">
              {activityFeed.map((a) => (
                <li key={a.id}>
                  <span className="net-feed__mark" style={{ background: a.accent }} />
                  <p><b>{a.who}</b> {a.action} <b>{a.detail}</b></p>
                  <span className="mono t3">{a.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    </section>
  )
}

export default function Network() {
  return (
    <div className="network">
      <header className="net-head">
        <div>
          <span className="eyebrow"><Radio size={12} /> Social layer · 7 operators online</span>
          <h1 className="display net-head__title">Network</h1>
          <p className="net-head__sub">
            Parties, presence and shared runs. Voice is peer-to-peer, encrypted, and routes through the
            nearest edge.
          </p>
        </div>
        <div className="net-head__stats">
          <div><span className="label">Online</span><b className="mono">7</b></div>
          <div><span className="label">In session</span><b className="mono">4</b></div>
          <div><span className="label">Squad</span><b className="mono">4/6</b></div>
          <button className="btn btn--primary btn--sm"><UserPlus size={13} /> Invite operator</button>
        </div>
      </header>

      <div className="net-top">
        <PartyPanel />
        <RequestsPanel />
      </div>

      <div className="net-grid">
        <FriendsList />
        <Leaderboard />
      </div>

      <ActivityWall />
    </div>
  )
}
