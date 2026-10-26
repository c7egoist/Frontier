import { Link } from 'react-router-dom'

import site from '../site.config.js'
import { IconArrow, IconMail, Mark } from './Icons.jsx'

const COLUMNS = [
  {
    heading: 'Game',
    links: [
      { label: 'Overview', to: '/' },
      { label: 'Demo', to: '/demo' },
      { label: 'Download', to: '/download' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy policy', to: '/privacy' },
      { label: `Contact — ${site.email}`, href: `mailto:${site.email}` },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-hair bg-void">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <Mark className="h-6 w-6" />
            <span className="font-display text-[13px] font-semibold tracking-[0.16em] text-ink uppercase">
              {site.wordmark}
            </span>
          </div>
          <p className="mt-4 max-w-sm text-[13px] text-muted">{site.short}</p>
          <a href={`mailto:${site.email}`} className="btn btn-ghost mt-6 h-9">
            <IconMail className="h-4 w-4" />
            {site.email}
            <IconArrow className="h-3.5 w-3.5" />
          </a>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <p className="meta">{column.heading}</p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to} className="text-[13px] text-muted transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  ) : (
                    <a href={link.href} className="text-[13px] text-muted transition-colors hover:text-ink">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="meta">© {new Date().getFullYear()} {site.studio}. All rights reserved.</p>
          <p className="meta">
            {site.build.status} · v{site.build.version} · {site.build.platforms}
          </p>
        </div>
      </div>
    </footer>
  )
}
