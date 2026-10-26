/* Small shared building blocks: section headers, state pills, spec rows, media slots. */

export function Section({ eyebrow, title, lead, children, className = '' }) {
  return (
    <section className={`mx-auto max-w-6xl px-5 py-20 ${className}`}>
      {(eyebrow || title || lead) && (
        <div className="mb-10 max-w-2xl">
          {eyebrow && <p className="meta">{eyebrow}</p>}
          {title && (
            <h2 className="mt-3 font-display text-[28px] leading-tight font-semibold text-ink sm:text-[34px]">
              {title}
            </h2>
          )}
          {lead && <p className="mt-3 text-[15px] text-muted">{lead}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

const STATES = {
  done: { label: 'Done', tone: 'text-ink', dot: 'bg-white' },
  wip: { label: 'In progress', tone: 'text-ink', dot: 'bg-[var(--accent)]' },
  next: { label: 'Next', tone: 'text-muted', dot: 'border border-white/30' },
  planned: { label: 'Planned', tone: 'text-faint', dot: 'border border-white/15' },
}

export function Pill({ state = 'planned' }) {
  const value = STATES[state] ?? STATES.planned
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase ${value.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${value.dot} ${state === 'wip' ? 'breathe' : ''}`} />
      {value.label}
    </span>
  )
}

export function SpecRow({ label, value, mono = true }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hair py-2.5 last:border-0">
      <span className="meta shrink-0">{label}</span>
      <span className={`text-right text-[13px] text-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

export function Panel({ children, className = '' }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>
}

/* Placeholder frame for screenshots / renders that have not been captured yet. */
export function ShotSlot({ label, hint, ratio = 'aspect-video', children }) {
  return (
    <div className={`card grid-bg relative flex items-center justify-center overflow-hidden ${ratio}`}>
      <div className="absolute inset-3 rounded-lg border border-dashed border-white/10" />
      {children ?? (
        <div className="relative px-6 text-center">
          <p className="meta">{label}</p>
          {hint && <p className="mt-1 font-mono text-[10px] text-faint">{hint}</p>}
        </div>
      )}
    </div>
  )
}

/* Renders a real video when the file exists, an honest placeholder when it does not. */
export function VideoBlock({ src, poster = '', className = '' }) {
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-black ${className}`}>
      {src ? (
        <video
          className="h-full w-full object-contain"
          src={src}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <FallbackMedia />
      )}
    </div>
  )
}

export function FallbackMedia({ title = 'Demo reel not uploaded yet', hint = 'Drop your file at public/media/demo.mp4' }) {
  return (
    <div className="grid-bg absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-4 rounded-xl border border-dashed border-white/12" />
      <div className="relative px-8 text-center">
        <p className="meta-bright">{title}</p>
        <p className="mt-2 font-mono text-[10px] text-faint">{hint}</p>
      </div>
    </div>
  )
}
