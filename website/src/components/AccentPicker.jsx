import { useEffect, useState } from 'react'
import { ACCENTS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT, applyAccent } from '../lib/accents.js'

/* Ten swatches from the Frontier theme. Choice is remembered in localStorage. */
export default function AccentPicker({ className = '' }) {
  const [active, setActive] = useState(() => window.localStorage.getItem(ACCENT_STORAGE_KEY) ?? DEFAULT_ACCENT)

  useEffect(() => {
    applyAccent(active)
    window.localStorage.setItem(ACCENT_STORAGE_KEY, active)
  }, [active])

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border border-hair bg-white/[0.03] px-2 py-1.5 ${className}`}
      role="group"
      aria-label="Accent colour"
    >
      {ACCENTS.map((accent) => (
        <button
          key={accent.id}
          type="button"
          onClick={() => setActive(accent.id)}
          title={accent.label}
          aria-label={`Accent: ${accent.label}`}
          aria-pressed={active === accent.id}
          className="h-3 w-3 rounded-full transition-transform hover:scale-125"
          style={{
            background: accent.hex,
            boxShadow: active === accent.id ? `0 0 0 2px #000, 0 0 0 3.5px ${accent.hex}` : 'none',
          }}
        />
      ))}
    </div>
  )
}
