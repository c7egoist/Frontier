/* Hero artwork: a stylised road receding to the horizon. Pure SVG — no image assets. */

export default function RoadArt({ className = '' }) {
  const posts = Array.from({ length: 9 }, (_, index) => {
    const t = (index + 1) / 10
    const y = 300 + 375 * Math.pow(t, 1.8)
    const spread = 530 * t
    const height = 5 + 26 * t
    return { left: 600 - spread, right: 600 + spread, y, height }
  })

  return (
    <svg
      viewBox="0 0 1200 675"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label="A stylised road receding toward the horizon at dusk"
    >
      <defs>
        <linearGradient id="ra-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050506" />
          <stop offset="100%" stopColor="#0d0d10" />
        </linearGradient>
        <radialGradient id="ra-glow" cx="50%" cy="44%" r="48%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
          <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ra-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#151518" />
          <stop offset="100%" stopColor="#08080a" />
        </linearGradient>
        <radialGradient id="ra-vig" cx="50%" cy="46%" r="72%">
          <stop offset="52%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      <rect width="1200" height="675" fill="url(#ra-sky)" />
      <rect width="1200" height="675" fill="url(#ra-glow)" />

      {/* horizon */}
      <line x1="0" y1="300" x2="1200" y2="300" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* road surface */}
      <path d="M600 300 L1130 675 L70 675 Z" fill="url(#ra-road)" />

      {/* verge edges */}
      <path d="M600 300 L70 675" stroke="rgba(255,255,255,0.20)" strokeWidth="1.6" fill="none" />
      <path d="M600 300 L1130 675" stroke="rgba(255,255,255,0.20)" strokeWidth="1.6" fill="none" />

      {/* lane markings — animated toward the camera */}
      <line
        x1="600" y1="302" x2="252" y2="675"
        stroke="rgba(255,255,255,0.16)" strokeWidth="3" strokeDasharray="26 40" className="road-dash"
      />
      <line
        x1="600" y1="302" x2="948" y2="675"
        stroke="rgba(255,255,255,0.16)" strokeWidth="3" strokeDasharray="26 40" className="road-dash"
      />
      <line
        x1="600" y1="302" x2="600" y2="675"
        stroke="var(--accent)" strokeOpacity="0.6" strokeWidth="2.5" strokeDasharray="30 46" className="road-dash"
      />

      {/* marker posts */}
      {posts.map((post, index) => (
        <g key={index} stroke="rgba(255,255,255,0.14)" strokeWidth={1 + 1.4 * ((index + 1) / 10)}>
          <line x1={post.left} y1={post.y - post.height} x2={post.left} y2={post.y} />
          <line x1={post.right} y1={post.y - post.height} x2={post.right} y2={post.y} />
        </g>
      ))}

      {/* vanishing-point bloom */}
      <ellipse cx="600" cy="302" rx="46" ry="14" fill="var(--accent)" opacity="0.22" className="breathe" />

      <rect width="1200" height="675" fill="url(#ra-vig)" />
    </svg>
  )
}
