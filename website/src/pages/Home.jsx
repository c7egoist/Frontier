import { Link } from 'react-router-dom'

import site from '../site.config.js'
import RoadArt from '../components/RoadArt.jsx'
import TrackArt from '../components/TrackArt.jsx'
import { IconArrow, IconDownload, IconMail, IconPlay } from '../components/Icons.jsx'
import { Pill, Section, ShotSlot } from '../components/ui.jsx'

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="bloom relative overflow-hidden border-b border-hair">
        <div className="grid-bg mask-fade-b absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
          <p className="meta rise">
            {site.build.status} · Build {site.build.version} · {site.build.platforms}
          </p>

          <h1 className="rise mt-5 font-display text-[clamp(3rem,11vw,7rem)] leading-[0.92] font-bold tracking-[-0.035em] text-ink uppercase">
            {site.name}
          </h1>

          <p className="rise mt-5 max-w-xl text-[16px] text-muted" style={{ animationDelay: '60ms' }}>
            {site.tagline}
          </p>

          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '120ms' }}>
            <Link to="/demo" className="btn btn-primary">
              <IconPlay className="h-4 w-4" />
              Watch the demo
            </Link>
            <Link to="/download" className="btn btn-ghost">
              <IconDownload className="h-4 w-4" />
              Download
            </Link>
            <a href={`mailto:${site.email}`} className="btn btn-quiet">
              <IconMail className="h-4 w-4" />
              Contact
            </a>
          </div>
        </div>

        {/* ------------------------------------------------------- hero artwork */}
        <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:pb-20">
          <div className="card relative overflow-hidden rounded-panel">
            <RoadArt className="aspect-[16/9] w-full sm:aspect-[21/9]" />

            {/* HUD strip */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
              <span className="meta-bright">{site.hud[0]?.value}</span>
              <span className="meta">v{site.build.version}</span>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.06] bg-black/55 px-4 py-3 backdrop-blur-md sm:px-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                {site.hud.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <dt className="meta truncate">{item.key}</dt>
                    <dd className="meta-bright mt-1 truncate">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <Section eyebrow="The drive" title="Built around the road, not the menu">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {site.features.map((feature) => (
            <article key={feature.title} className="card card-hover p-5">
              <p className="meta">{feature.meta}</p>
              <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{feature.body}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------------- stages */}
      <Section eyebrow="Stages" title="Three routes in the demo build">
        <div className="grid gap-4 lg:grid-cols-3">
          {site.stages.map((stage) => (
            <article key={stage.name} className="card card-hover overflow-hidden">
              <div className="border-b border-hair bg-void/60">
                <TrackArt variant={stage.art} className="aspect-[21/6] w-full" />
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-[16px] font-semibold text-ink">{stage.name}</h3>
                  <span className="meta-bright shrink-0">{stage.kind}</span>
                </div>
                <p className="mt-2 text-[13px] text-muted">{stage.note}</p>
                <p className="meta mt-4">Length — {stage.length}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------- roadmap */}
      <Section eyebrow="Status" title="Where the build stands">
        <div className="card divide-y divide-hair px-5">
          {site.roadmap.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-[13px] text-ink">{item.label}</span>
              <Pill state={item.state} />
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------- contact */}
      <Section eyebrow="Contact" title="Say hello">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <p className="text-[15px] text-ink">
              Press, business, bug reports or just want to tell us the handling feels wrong — one inbox.
            </p>
            <a href={`mailto:${site.email}`} className="btn btn-primary mt-6">
              <IconMail className="h-4 w-4" />
              {site.email}
              <IconArrow className="h-3.5 w-3.5" />
            </a>
          </div>
          <ShotSlot label="Press kit" hint="Drop key art / logo at public/media/" />
        </div>
      </Section>

      {/* ------------------------------------------------------------ CTA band */}
      <section className="bloom relative overflow-hidden border-y border-hair">
        <div className="relative mx-auto max-w-6xl px-5 py-16 text-center">
          <p className="meta">Try it</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-[30px] leading-tight font-semibold text-ink sm:text-[38px]">
            Watch two minutes, then drive it yourself.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/download" className="btn btn-primary">
              <IconDownload className="h-4 w-4" />
              Get the demo
            </Link>
            <Link to="/demo" className="btn btn-ghost">
              <IconPlay className="h-4 w-4" />
              Watch the reel
            </Link>
          </div>
          <p className="meta mt-6">
            {site.build.platforms} · v{site.build.version} · {site.build.status}
          </p>
        </div>
      </section>
    </>
  )
}
