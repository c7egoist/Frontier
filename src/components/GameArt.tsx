import { useId } from 'react'
import type { ArtVariant, Game } from '../data/types'

type ArtGame = Pick<Game, 'id' | 'palette' | 'art' | 'accent' | 'glyph' | 'title'>

interface Props {
  game: ArtGame
  className?: string
  glyph?: boolean
  marks?: boolean
}

/** deterministic PRNG so art is stable between renders */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const range = (r: () => number, min: number, max: number) => min + r() * (max - min)

export default function GameArt({ game, className = '', glyph = true, marks = true }: Props) {
  const raw = useId()
  const uid = raw.replace(/[:]/g, '')
  const r = seeded(game.id)
  const [bg, mid, light] = game.palette

  const g = {
    beam: `beam-${uid}`,
    soft: `soft-${uid}`,
    fade: `fade-${uid}`,
    stroke: `stroke-${uid}`,
    fill: `fill-${uid}`,
    blur: `blur-${uid}`,
  }

  const body = () => {
    switch (game.art as ArtVariant) {
      /* ---------------------------------------------------------- */
      case 'orbit':
        return (
          <g>
            <ellipse cx="252" cy="154" rx="150" ry="120" fill={`url(#${g.soft})`} opacity=".85" />
            <g transform="rotate(-18 200 200)">
              {[44, 74, 106, 140, 176, 212].map((rad, i) => (
                <circle
                  key={rad}
                  cx="200"
                  cy="200"
                  r={rad}
                  fill="none"
                  stroke={i === 2 ? light : '#ffffff'}
                  strokeOpacity={i === 2 ? 0.75 : 0.14 - i * 0.012}
                  strokeWidth={i === 2 ? 1.2 : 1}
                  strokeDasharray={i === 1 ? '2 7' : i === 4 ? '1 5' : undefined}
                />
              ))}
              <circle cx="200" cy="200" r="212" fill="none" stroke={light} strokeOpacity=".28" strokeWidth=".6" strokeDasharray="1 11" />
              {[0, 1, 2, 3, 4].map((i) => {
                const a = range(r, 0, Math.PI * 2)
                const rad = [44, 106, 140, 176, 212][i]
                return (
                  <circle
                    key={i}
                    cx={200 + Math.cos(a) * rad}
                    cy={200 + Math.sin(a) * rad}
                    r={i === 1 ? 3.4 : 1.8}
                    fill={i === 1 ? game.accent : light}
                    opacity={i === 1 ? 1 : 0.7}
                  />
                )
              })}
            </g>
            <path d="M200 200 L330 44 L246 200 Z" fill={`url(#${g.beam})`} opacity=".5" />
            <circle cx="200" cy="200" r="26" fill={bg} stroke={light} strokeOpacity=".5" />
            <circle cx="200" cy="200" r="7" fill={game.accent} />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'monolith':
        return (
          <g>
            <circle cx="200" cy="250" r="150" fill={`url(#${g.soft})`} opacity=".9" />
            <ellipse cx="200" cy="352" rx="230" ry="62" fill={game.accent} opacity=".1" />
            <rect x="0" y="300" width="400" height="100" fill={`url(#${g.fade})`} opacity=".75" />
            <g opacity=".55">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <line key={i} x1="0" x2="400" y1={300 + i * 14} y2={300 + i * 14} stroke={light} strokeOpacity=".13" strokeWidth=".6" />
              ))}
            </g>
            {/* distant pillars */}
            {[
              { x: 62, y: 208, w: 30, h: 112, o: 0.22 },
              { x: 108, y: 246, w: 18, h: 74, o: 0.16 },
              { x: 300, y: 232, w: 22, h: 88, o: 0.18 },
              { x: 336, y: 190, w: 14, h: 130, o: 0.12 },
            ].map((p, i) => (
              <g key={i} opacity={p.o}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={light} fillOpacity=".3" stroke={light} strokeOpacity=".4" strokeWidth=".6" />
                <rect x={p.x} y={p.y} width={p.w} height="2" fill={game.accent} />
              </g>
            ))}
            <path d="M0 214 H200 H400" stroke={light} strokeOpacity=".12" strokeDasharray="1 6" />
            <rect x="152" y="96" width="96" height="224" fill={`url(#${g.fill})`} stroke={light} strokeOpacity=".38" />
            <rect x="152" y="96" width="96" height="6" fill={game.accent} opacity=".9" />
            <rect x="168" y="128" width="64" height="1" fill="#fff" opacity=".38" />
            <rect x="168" y="150" width="40" height="1" fill="#fff" opacity=".24" />
            <rect x="168" y="172" width="52" height="1" fill="#fff" opacity=".18" />
            <path d="M200 52 L244 96 L156 96 Z" fill={`url(#${g.soft})`} opacity=".6" />
            <path d="M200 96 L200 320" stroke={game.accent} strokeOpacity=".28" strokeWidth=".8" />
            {Array.from({ length: 34 }).map((_, i) => {
              const x = range(r, 16, 384)
              const y = range(r, 30, 270)
              return <circle key={i} cx={x} cy={y} r={range(r, 0.5, 1.8)} fill={i % 4 === 0 ? game.accent : light} opacity={range(r, 0.15, 0.75)} />
            })}
            <ellipse cx="200" cy="332" rx="130" ry="12" fill={game.accent} opacity=".18" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'ribbons':
        return (
          <g>
            <ellipse cx="130" cy="290" rx="160" ry="120" fill={`url(#${g.soft})`} opacity=".55" />
            {[
              { d: 'M-30 330 C 90 300, 120 140, 240 130 S 390 200, 440 120', w: 26, o: 0.14 },
              { d: 'M-30 370 C 100 330, 150 180, 260 170 S 380 250, 440 190', w: 12, o: 0.3 },
              { d: 'M-30 290 C 80 250, 130 90, 250 86 S 380 150, 440 76', w: 5, o: 0.55 },
              { d: 'M-30 400 C 90 360, 160 240, 250 230 S 400 300, 450 230', w: 2, o: 0.8 },
              { d: 'M-30 250 C 70 200, 150 40, 250 40 S 400 100, 450 30', w: 1, o: 0.45 },
            ].map((p, i) => (
              <path key={i} d={p.d} fill="none" stroke={`url(#${g.stroke})`} strokeWidth={p.w} strokeOpacity={p.o} strokeLinecap="round" />
            ))}
            <path d="M-30 290 C 80 250, 130 90, 250 86 S 380 150, 440 76" fill="none" stroke={game.accent} strokeWidth="1.2" strokeOpacity=".9" />
            <circle cx="250" cy="86" r="4" fill={game.accent} />
            <circle cx="250" cy="86" r="11" fill="none" stroke={game.accent} strokeOpacity=".4" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'bloom':
        return (
          <g transform="translate(200 208)">
            <circle r="150" fill={`url(#${g.soft})`} opacity=".7" />
            {Array.from({ length: 12 }).map((_, i) => (
              <ellipse
                key={i}
                rx={range(r, 20, 30)}
                ry={range(r, 96, 132)}
                transform={`rotate(${i * 30})`}
                fill={light}
                fillOpacity={i % 3 === 0 ? 0.16 : 0.075}
                stroke={light}
                strokeOpacity=".3"
                strokeWidth=".8"
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="0" y1="0" x2="0" y2="-150" transform={`rotate(${i * 30 + 15})`} stroke={light} strokeOpacity=".1" strokeWidth=".6" />
            ))}
            <circle r="46" fill="none" stroke={light} strokeOpacity=".45" strokeDasharray="1 5" />
            <circle r="18" fill={bg} stroke={game.accent} strokeOpacity=".8" />
            <circle r="5" fill={game.accent} />
            <circle r="86" fill="none" stroke={game.accent} strokeOpacity=".22" strokeDasharray="2 14" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'grid':
        return (
          <g>
            <ellipse cx="200" cy="232" rx="190" ry="80" fill={`url(#${g.soft})`} opacity=".65" />
            <g stroke={light} strokeOpacity=".22" strokeWidth=".7">
              {Array.from({ length: 25 }).map((_, i) => {
                const x = -400 + i * 50
                return <line key={`v${i}`} x1={x} y1="400" x2={200 + (x - 200) * 0.08} y2="232" />
              })}
            </g>
            <g stroke={light} strokeOpacity=".18" strokeWidth=".7">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
                const t = i / 9
                const y = 232 + Math.pow(t, 2.6) * 168
                return <line key={`h${i}`} x1="0" x2="400" y1={y} y2={y} />
              })}
            </g>
            <line x1="0" x2="400" y1="232" y2="232" stroke={game.accent} strokeWidth="1" strokeOpacity=".8" />
            <circle cx="200" cy="232" r="34" fill={bg} fillOpacity=".6" stroke={light} strokeOpacity=".4" />
            <circle cx="200" cy="232" r="5" fill={game.accent} />
            <path d="M200 232 L200 40 M200 232 L20 400 M200 232 L380 400" stroke={light} strokeOpacity=".1" strokeWidth=".7" />
            <g opacity=".9">
              {[0, 1, 2].map((i) => (
                <rect key={i} x={70 + i * 12} y={190 - i * 26} width="3" height="3" fill={game.accent} opacity={0.9 - i * 0.25} />
              ))}
              {[0, 1, 2].map((i) => (
                <rect key={i} x={318 - i * 12} y={190 - i * 26} width="3" height="3" fill={light} opacity={0.7 - i * 0.2} />
              ))}
            </g>
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'flow':
        return (
          <g>
            <circle cx="278" cy="150" r="62" fill={`url(#${g.soft})`} opacity=".9" />
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const y = 140 + i * 46
              return (
                <path
                  key={i}
                  d={`M-20 ${y} C 70 ${y - 62}, 130 ${y + 48}, 210 ${y - 6} S 330 ${y - 62}, 420 ${y - 14} L 420 420 L -20 420 Z`}
                  fill={light}
                  fillOpacity={0.035 + i * 0.022}
                  stroke={light}
                  strokeOpacity={0.1 + i * 0.05}
                  strokeWidth={i === 5 ? 1.2 : 0.7}
                />
              )
            })}
            <path d="M-20 168 C 70 106, 130 216, 210 162 S 330 106, 420 154" fill="none" stroke={game.accent} strokeWidth="1.4" strokeOpacity=".9" />
            <circle cx="210" cy="162" r="3.5" fill={game.accent} />
            {Array.from({ length: 12 }).map((_, i) => (
              <circle key={i} cx={range(r, 30, 370)} cy={range(r, 70, 330)} r={range(r, 0.6, 2.1)} fill={light} opacity={range(r, 0.15, 0.6)} />
            ))}
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'circuit': {
        const traces: string[] = []
        for (let i = 0; i < 9; i++) {
          let x = Math.round(range(r, 40, 360) / 10) * 10
          let y = Math.round(range(r, 40, 360) / 10) * 10
          let d = `M${x} ${y}`
          for (let s = 0; s < 4; s++) {
            const len = Math.round(range(r, 30, 110) / 10) * 10
            if (s % 2 === 0) {
              x += r() > 0.5 ? len : -len
              d += ` H${x}`
            } else {
              y += r() > 0.5 ? len : -len
              d += ` V${y}`
            }
          }
          traces.push(d)
        }
        return (
          <g>
            <circle cx="200" cy="200" r="140" fill={`url(#${g.soft})`} opacity=".45" />
            {traces.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={i % 3 === 0 ? game.accent : light} strokeOpacity={i % 3 === 0 ? 0.75 : 0.28} strokeWidth={i % 3 === 0 ? 1.2 : 0.8} />
            ))}
            {traces.map((d, i) => {
              const m = d.match(/[HV](-?\d+)/g) || []
              const last = m[m.length - 1]
              if (!last) return null
              const v = Number(last.slice(1))
              const horizontal = last[0] === 'H'
              return (
                <circle
                  key={`n${i}`}
                  cx={horizontal ? v : 0}
                  cy={horizontal ? 0 : v}
                  r="2"
                  fill={light}
                  opacity="0"
                />
              )
            })}
            <rect x="176" y="176" width="48" height="48" rx="6" fill={bg} stroke={light} strokeOpacity=".45" />
            <rect x="188" y="188" width="24" height="24" rx="3" fill="none" stroke={game.accent} strokeOpacity=".9" />
            <circle cx="200" cy="200" r="4" fill={game.accent} />
            <circle cx="200" cy="200" r="26" fill="none" stroke={game.accent} strokeOpacity=".25" strokeDasharray="1 6" />
            <path d="M0 200 H140 M260 200 H400" stroke={light} strokeOpacity=".12" strokeWidth=".7" strokeDasharray="4 6" />
          </g>
        )
      }

      /* ---------------------------------------------------------- */
      case 'swarm':
        return (
          <g>
            <ellipse cx="226" cy="182" rx="170" ry="150" fill={`url(#${g.soft})`} opacity=".7" />
            {Array.from({ length: 74 }).map((_, i) => {
              const gx = 200 + (r() + r() + r() - 1.5) * 130
              const gy = 200 + (r() + r() + r() - 1.5) * 120
              const rad = range(r, 0.8, 15)
              const hot = rad > 11
              return (
                <circle
                  key={i}
                  cx={gx}
                  cy={gy}
                  r={rad}
                  fill={hot ? game.accent : light}
                  opacity={hot ? range(r, 0.5, 0.95) : range(r, 0.08, 0.4)}
                />
              )
            })}
            <circle cx="200" cy="200" r="96" fill="none" stroke={game.accent} strokeOpacity=".3" strokeDasharray="1 8" />
            <circle cx="200" cy="200" r="140" fill="none" stroke={light} strokeOpacity=".12" />
            <path d="M60 320 Q 200 250 340 84" fill="none" stroke={light} strokeOpacity=".18" strokeDasharray="2 6" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'shards':
        return (
          <g>
            <circle cx="180" cy="180" r="150" fill={`url(#${g.soft})`} opacity=".6" />
            {Array.from({ length: 16 }).map((_, i) => {
              const cx = range(r, 30, 370)
              const cy = range(r, 30, 370)
              const s = range(r, 16, 72)
              const rot = range(r, 0, 360)
              const points = [
                [0, -s],
                [s * 0.7, s * 0.5],
                [-s * 0.45, s * 0.72],
              ]
                .map(([x, y]) => `${x},${y}`)
                .join(' ')
              return (
                <polygon
                  key={i}
                  points={points}
                  transform={`translate(${cx} ${cy}) rotate(${rot})`}
                  fill={i % 5 === 0 ? game.accent : light}
                  fillOpacity={i % 5 === 0 ? 0.5 : range(r, 0.04, 0.2)}
                  stroke={light}
                  strokeOpacity=".24"
                  strokeWidth=".7"
                />
              )
            })}
            <polygon points="200,84 268,208 200,264 150,196" fill={`url(#${g.fill})`} stroke={game.accent} strokeOpacity=".65" strokeWidth="1.2" />
            <line x1="200" y1="84" x2="200" y2="264" stroke="#fff" strokeOpacity=".2" />
            <line x1="60" y1="330" x2="340" y2="330" stroke={light} strokeOpacity=".16" strokeDasharray="1 6" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'signal':
        return (
          <g>
            <circle cx="200" cy="200" r="130" fill={`url(#${g.soft})`} opacity=".5" />
            <g stroke={light} strokeOpacity=".1" strokeWidth=".7">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <line key={`h${i}`} x1="0" x2="400" y1={40 + i * 46} y2={40 + i * 46} />
              ))}
            </g>
            <g>
              {Array.from({ length: 41 }).map((_, i) => {
                const x = 12 + i * 9.4
                const amp = Math.abs(Math.sin(i * 0.44 + 0.6)) * (i % 5 === 0 ? 108 : 62) * (0.5 + Math.abs(Math.sin(i * 0.13)) * 0.7)
                return <rect key={i} x={x} y={200 - amp / 2} width="3.4" height={amp} rx="1.6" fill={i % 5 === 0 ? game.accent : light} opacity={i % 5 === 0 ? 0.92 : 0.3} />
              })}
            </g>
            <line x1="0" x2="400" y1="200" y2="200" stroke="#fff" strokeOpacity=".25" />
            <line x1="240" x2="240" y1="60" y2="340" stroke={game.accent} strokeOpacity=".4" strokeDasharray="2 5" />
            <circle cx="240" cy="200" r="4" fill={game.accent} />
            <circle cx="240" cy="200" r="16" fill="none" stroke={game.accent} strokeOpacity=".4" />
          </g>
        )

      /* ---------------------------------------------------------- */
      case 'tiles':
      default:
        return (
          <g>
            <circle cx="240" cy="150" r="140" fill={`url(#${g.soft})`} opacity=".5" />
            {Array.from({ length: 8 }).map((_, row) =>
              Array.from({ length: 8 }).map((__, col) => {
                const x = 44 + col * 40 + (row % 2) * 8
                const y = 44 + row * 40
                const hot = (row * 8 + col) % 11 === 3
                const dim = (row + col) % 4 === 0
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={x}
                    y={y}
                    width="28"
                    height="28"
                    rx="5"
                    fill={hot ? game.accent : dim ? 'transparent' : light}
                    fillOpacity={hot ? 0.85 : 0.06}
                    stroke={hot ? game.accent : light}
                    strokeOpacity={dim ? 0.14 : 0.25}
                    strokeWidth=".8"
                  />
                )
              }),
            )}
            <rect x="164" y="164" width="72" height="72" rx="10" fill={bg} fillOpacity=".82" stroke={game.accent} strokeOpacity=".9" />
            <path d="M186 212 L200 186 L214 212 Z" fill={game.accent} />
          </g>
        )
    }
  }

  return (
    <div
      className={`art art--${game.art} ${className}`}
      style={
        {
          '--art-bg': bg,
          '--art-mid': mid,
          '--art-light': light,
          '--art-accent': game.accent,
        } as React.CSSProperties
      }
    >
      <div className="art__wash" />
      <svg className="art__svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={g.soft} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={light} stopOpacity=".55" />
            <stop offset="55%" stopColor={mid} stopOpacity=".35" />
            <stop offset="100%" stopColor={bg} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={g.fill} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={light} stopOpacity=".32" />
            <stop offset="60%" stopColor={mid} stopOpacity=".5" />
            <stop offset="100%" stopColor={bg} stopOpacity=".9" />
          </linearGradient>
          <linearGradient id={g.fade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={light} stopOpacity="0" />
            <stop offset="100%" stopColor={bg} stopOpacity=".85" />
          </linearGradient>
          <linearGradient id={g.stroke} x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor={game.accent} stopOpacity=".1" />
            <stop offset="45%" stopColor={light} stopOpacity=".95" />
            <stop offset="100%" stopColor={game.accent} stopOpacity=".2" />
          </linearGradient>
          <linearGradient id={g.beam} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={light} stopOpacity=".7" />
            <stop offset="100%" stopColor={light} stopOpacity="0" />
          </linearGradient>
        </defs>
        {body()}
      </svg>
      <div className="art__scan" />
      <div className="art__vignette" />
      <div className="art__grain" />
      {glyph && <span className="art__glyph mono">{game.glyph}</span>}
      {marks && (
        <span className="art__marks" aria-hidden="true">
          <i /> <i /> <i /> <i />
        </span>
      )}
      <span className="art__index mono">AXIOM</span>
    </div>
  )
}
