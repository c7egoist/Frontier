import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import site from '../site.config.js'
import AccentPicker from './AccentPicker.jsx'
import { IconClose, IconMail, IconMenu, Mark } from './Icons.jsx'

const LINKS = [
  { to: '/', label: 'Overview' },
  { to: '/demo', label: 'Demo' },
  { to: '/download', label: 'Download' },
  { to: '/privacy', label: 'Privacy' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header className="sticky top-0 z-50 border-b border-hair bg-panel/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <Mark className="h-6 w-6" />
          <span className="font-display text-[13px] font-semibold tracking-[0.16em] text-ink uppercase">
            {site.wordmark}
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive ? 'bg-white/[0.06] text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <AccentPicker className="hidden lg:flex" />
          <a href={`mailto:${site.email}`} className="btn btn-ghost hidden h-8 px-3 text-[12px] sm:inline-flex">
            <IconMail className="h-3.5 w-3.5" />
            Contact
          </a>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="btn btn-quiet h-8 w-8 px-0 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-hair bg-panel md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-[13px] ${isActive ? 'bg-white/[0.06] text-ink' : 'text-muted'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <a href={`mailto:${site.email}`} className="btn btn-quiet mt-2 h-9 justify-start">
              <IconMail className="h-4 w-4" />
              {site.email}
            </a>
            <div className="pt-2">
              <AccentPicker />
            </div>
            <button type="button" onClick={() => setOpen(false)} className="meta mt-1 flex items-center gap-1 px-3 py-1">
              <IconClose className="h-3 w-3" /> Close
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
