import { Link } from 'react-router-dom'

import site from '../site.config.js'
import { IconArrow, IconCheck, IconDownload, IconMail } from '../components/Icons.jsx'
import { Section, SpecRow } from '../components/ui.jsx'

const STEPS = [
  { title: 'Download the zip', body: 'Grab the build for your platform. No launcher, no account.' },
  { title: 'Unzip anywhere', body: 'Extract to any folder you like — the build is portable.' },
  { title: 'Run and drive', body: 'Launch the executable. First boot writes a settings file next to it.' },
]

export default function Download() {
  return (
    <>
      <section className="bloom relative overflow-hidden border-b border-hair">
        <div className="grid-bg mask-fade-b absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-12">
          <p className="meta">Download</p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,7vw,4rem)] leading-[0.96] font-bold tracking-[-0.03em] text-ink uppercase">
            Get {site.name}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] text-muted">
            The demo is free and always will be. One stage, two cars, no strings.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- builds */}
      <Section eyebrow="Builds" title="Pick your platform">
        <div className="grid gap-4">
          {site.downloads.map((item, index) => (
            <article
              key={`${item.platform}-${index}`}
              className={`card p-6 ${item.primary ? 'border-hair-strong bg-card-2' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-[18px] font-semibold text-ink">{item.label}</h3>
                    {item.primary && (
                      <span className="meta rounded-full border border-hair-strong px-2 py-0.5 text-ink">Current</span>
                    )}
                  </div>
                  <p className="meta mt-1.5">{item.platform}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`meta rounded-full border px-2.5 py-1 ${
                      item.uploaded ? 'border-hair-strong text-ink' : 'border-hair text-faint'
                    }`}
                  >
                    {item.uploaded ? 'Ready' : item.note ? 'Planned' : 'Not uploaded yet'}
                  </span>
                  {item.uploaded ? (
                    <a href={item.file} download className="btn btn-primary">
                      <IconDownload className="h-4 w-4" />
                      Download · {item.size}
                    </a>
                  ) : (
                    <span className="btn btn-ghost btn-disabled" aria-disabled="true">
                      <IconDownload className="h-4 w-4" />
                      {item.note ? 'Unavailable' : 'Download · — MB'}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-x-10 sm:grid-cols-2">
                <div>
                  <SpecRow label="Version" value={item.version} />
                  <SpecRow label="Size" value={item.size} />
                </div>
                <div>
                  <SpecRow label="Released" value={item.uploaded ? site.privacy.lastUpdated : '—'} />
                  <SpecRow label="SHA-256" value={item.sha256 || '—'} />
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 font-mono text-[11px] text-faint">
          Builds are read from <span className="text-muted">src/site.config.js</span> and served from{' '}
          <span className="text-muted">public/downloads/</span>.
        </p>
      </Section>

      {/* -------------------------------------------------------------- install */}
      <Section eyebrow="Install" title="Three steps">
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="card p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-hair-strong">
                <span className="font-mono text-[11px] text-ink">{index + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- requirements */}
      <Section eyebrow="System requirements" title="What you need">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { heading: 'Minimum', rows: site.requirements.minimum },
            { heading: 'Recommended', rows: site.requirements.recommended },
          ].map((column) => (
            <div key={column.heading} className="card p-6">
              <p className="meta">{column.heading}</p>
              <div className="mt-4">
                {column.rows.map(([key, value]) => (
                  <SpecRow key={key} label={key} value={value} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 flex items-start gap-2 font-mono text-[11px] text-faint">
          <IconCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Fill in the real numbers in <span className="text-muted">src/site.config.js</span> before you publish — the
          table ships with TBD values.
        </p>
      </Section>

      {/* --------------------------------------------------------------- footer CTA */}
      <section className="relative border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14">
          <div>
            <p className="meta">Stuck?</p>
            <h2 className="mt-2 font-display text-[24px] font-semibold text-ink">
              If the build will not start, tell us.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={`mailto:${site.email}`} className="btn btn-primary">
              <IconMail className="h-4 w-4" />
              {site.email}
            </a>
            <Link to="/demo" className="btn btn-ghost">
              Watch the demo first
              <IconArrow className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
