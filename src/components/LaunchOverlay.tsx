import { useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { useLauncher } from '../state/launcher'
import GameArt from './GameArt'

const steps = [
  'Handshake with runtime 2.4.17',
  'Allocating graphics pipeline · Vulkan 1.4',
  'Warming shader cache · 1,204 programs',
  'Mounting content volume · NVMe-1',
  'Session ready',
]

export function LaunchOverlay() {
  const { launchState, cancelLaunch } = useLauncher()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && launchState) cancelLaunch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [launchState, cancelLaunch])

  if (!launchState) return null
  const { game, progress, step } = launchState
  const pct = Math.min(100, progress)

  return (
    <div className="launch" style={{ '--launch-accent': game.accent } as React.CSSProperties}>
      <div className="launch__art">
        <GameArt game={game} glyph={false} marks={false} />
      </div>
      <div className="launch__scrim" />
      <div className="launch__grid" aria-hidden="true" />
      <div className="launch__scan" aria-hidden="true" />
      <div className="launch__corners" aria-hidden="true">
        <i /> <i /> <i /> <i />
      </div>

      <div className="launch__top">
        <span className="mono launch__seq">LAUNCH SEQUENCE · {game.version}</span>
        <button className="launch__abort mono" onClick={cancelLaunch}>
          <X size={13} /> ABORT
        </button>
      </div>

      <div className="launch__body">
        <span className="launch__glyph mono">{game.glyph}</span>
        <span className="eyebrow launch__studio">{game.studio}</span>
        <h2 className="launch__title display">{game.title}</h2>
        <span className="launch__tagline">{game.tagline}</span>

        <div className="launch__progress">
          <div className="launch__progress-head">
            <span className="mono">
              {pct >= 100 ? 'SESSION READY' : 'STAGING'}
              <span className="launch__dots">
                {pct < 100 && (
                  <>
                    <i />
                    <i />
                    <i />
                  </>
                )}
              </span>
            </span>
            <span className="mono launch__pct">{Math.round(pct)}%</span>
          </div>
          <div className="launch__bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="launch__log">
          {steps.map((s, i) => {
            const done = i < step || pct >= 100
            const active = i === step && pct < 100
            return (
              <div key={s} className={`launch__log-row${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                <span className="launch__log-icon">
                  {done ? <Check size={10} /> : active ? <Loader2 size={10} className="spin" /> : <i />}
                </span>
                <span className="mono">{s}</span>
                <span className="mono launch__log-state">
                  {done ? 'OK' : active ? 'RUN' : 'WAIT'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="launch__bottom mono">
        <span>REFLEX · 144 FPS TARGET</span>
        <span>HDR · 4K · 120HZ</span>
        <span>PROFILE · OPERATOR</span>
        <span className="launch__bottom-brand">AXIOM RUNTIME</span>
      </div>
    </div>
  )
}
