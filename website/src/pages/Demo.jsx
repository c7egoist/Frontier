import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import site from '../site.config.js'
import { IconArrow, IconDownload } from '../components/Icons.jsx'
import { FallbackMedia, Section, ShotSlot, SpecRow } from '../components/ui.jsx'

export default function Demo() {
  const [videoMissing, setVideoMissing] = useState(!site.demo.video)
  const build = site.demo.build

  useEffect(() => {
    setVideoMissing(!site.demo.video)
  }, [])

  return (
    <>
      <section className="bloom relative overflow-hidden border-b border-hair">
        <div className="grid-bg mask-fade-b absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-12">
          <p className="meta">Demo</p>
          <h1 className="mt-3 font-display text-[clamp(2.2rem,7vw,4rem)] leading-[0.96] font-bold tracking-[-0.03em] text-ink uppercase">
            {site.name} — demo
          </h1>
          <p className="mt-4 max-w-xl text-[15px] text-muted">
            Two minutes of raw gameplay, straight from build {build.version}. No cutscenes, no music video.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- video */}
      <Section eyebrow="Gameplay reel" title="Watch the demo">
        <div className="card overflow-hidden rounded-panel">
          {videoMissing ? (
            <FallbackMedia />
          ) : (
            <video
              className="aspect-video w-full bg-black object-contain"
              src={site.demo.video}
              poster={site.demo.poster || undefined}
              controls
              playsInline
              preload="metadata"
              onError={() => setVideoMissing(true)}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair px-5 py-3">
            <div className="flex items-center gap-4">
              <span className="meta">Build {build.version}</span>
              <span className="meta">Runtime {site.demo.duration}</span>
            </div>
            {site.demo.youtubeId && (
              <a
                href={`https://www.youtube.com/watch?v=${site.demo.youtubeId}`}
                target="_blank"
                rel="noreferrer"
                className="meta hover:text-ink"
              >
                Watch on YouTube <IconArrow className="inline h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {videoMissing && (
          <p className="mt-4 font-mono text-[11px] text-faint">
            Expected at: <span className="text-muted">public/media/demo.mp4</span> — the player switches on automatically
            once the file is there.
          </p>
        )}
      </Section>

      {/* ------------------------------------------------------------ demo build */}
      <Section eyebrow="Playable" title="Download the demo build">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[18px] font-semibold text-ink">
                  {site.name} — {build.label}
                </h3>
                <p className="meta mt-1">{build.platform}</p>
              </div>
              <span
                className={`meta shrink-0 rounded-full border px-2.5 py-1 ${
                  build.uploaded ? 'border-hair-strong text-ink' : 'border-hair text-faint'
                }`}
              >
                {build.uploaded ? 'Ready' : 'Not uploaded yet'}
              </span>
            </div>

            <div className="mt-5">
              <SpecRow label="Version" value={build.version} />
              <SpecRow label="Size" value={build.size} />
              <SpecRow label="Platform" value={build.platform} />
              <SpecRow label="SHA-256" value={build.sha256 || '—'} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {build.uploaded ? (
                <a href={build.file} download className="btn btn-primary">
                  <IconDownload className="h-4 w-4" />
                  Download demo
                </a>
              ) : (
                <span className="btn btn-ghost btn-disabled" aria-disabled="true">
                  <IconDownload className="h-4 w-4" />
                  Download demo
                </span>
              )}
              <Link to="/download" className="btn btn-quiet">
                All downloads
                <IconArrow className="h-3.5 w-3.5" />
              </Link>
            </div>

            {!build.uploaded && (
              <p className="mt-4 font-mono text-[11px] text-faint">
                Drop the zip at <span className="text-muted">public/downloads/{build.file.split('/').pop()}</span>, then set{' '}
                <span className="text-muted">uploaded: true</span> and paste the checksum in{' '}
                <span className="text-muted">src/site.config.js</span>.
              </p>
            )}
          </div>

          <div className="card p-6">
            <p className="meta">In the demo</p>
            <ul className="mt-4 space-y-3 text-[13px] text-muted">
              <li>· One full stage, both directions</li>
              <li>· Two cars</li>
              <li>· Time trial with ghost + sector deltas</li>
              <li>· Keyboard, gamepad and wheel input</li>
            </ul>
            <p className="meta mt-6">Runs offline. No account, no launcher.</p>
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------------- screenshots */}
      <Section eyebrow="Captures" title="Straight from the build">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <ShotSlot key={index} label={`Screenshot slot 0${index}`} hint="public/media/" />
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-faint">
          Placeholder frames — swap them for real captures in <span className="text-muted">src/pages/Demo.jsx</span>.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="relative border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14">
          <div>
            <p className="meta">Next</p>
            <h2 className="mt-2 font-display text-[24px] font-semibold text-ink">Ready to drive it?</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/download" className="btn btn-primary">
              <IconDownload className="h-4 w-4" />
              Download
            </Link>
            <a href={`mailto:${site.email}`} className="btn btn-ghost">
              Report a bug
              <IconArrow className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
