/* Stage maps: abstract route drawings. Pure SVG, tinted by the active accent. */

const PATHS = {
  coast:
    'M40 190 C 140 150 200 172 262 132 S 384 58 472 104 S 612 190 702 140 S 852 58 942 120 S 1012 176 1052 142',
  hairpin:
    'M40 200 C 130 206 190 170 206 130 C 219 92 263 66 323 74 C 385 82 405 142 363 172 C 319 204 259 182 241 142 C 223 100 283 62 343 50 C 425 34 525 58 625 48 C 727 38 827 78 907 118 C 969 150 1016 172 1050 152',
  circuit:
    'M130 196 C 66 150 96 66 196 52 C 316 36 420 60 520 50 C 640 38 762 42 862 72 C 962 102 1022 158 962 198 C 902 238 762 218 640 212 C 520 206 380 222 262 216 C 182 212 162 208 130 196 Z',
}

export default function TrackArt({ variant = 'coast', className = '' }) {
  const d = PATHS[variant] ?? PATHS.coast
  const start = d.slice(2, 10)

  return (
    <svg
      viewBox="0 0 1080 260"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={`${variant} stage route map`}
    >
      {/* faint grid */}
      <g stroke="rgba(255,255,255,0.035)" strokeWidth="1">
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 28} x2="1080" y2={i * 28} />
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`v${i}`} x1={i * 64} y1="0" x2={i * 64} y2="260" />
        ))}
      </g>

      {/* accent glow under the line */}
      <path d={d} fill="none" stroke="var(--accent)" strokeOpacity="0.20" strokeWidth="12" strokeLinecap="round" />
      {/* route */}
      <path d={d} fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="1.8" strokeLinecap="round" />

      {/* start marker */}
      <circle
        cx={Number(start.split(' ')[0]) || 40}
        cy={Number(start.split(' ')[1]) || 190}
        r="5"
        fill="var(--accent)"
      />
    </svg>
  )
}
