import { Link } from 'react-router-dom'

import { IconArrow } from '../components/Icons.jsx'

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start px-5 py-32">
      <p className="meta">404</p>
      <h1 className="mt-3 font-display text-[34px] font-semibold text-ink">Wrong turn.</h1>
      <p className="mt-3 max-w-md text-[14px] text-muted">
        That page is not on the route. Head back to the start line.
      </p>
      <Link to="/" className="btn btn-primary mt-8">
        Back to overview
        <IconArrow className="h-3.5 w-3.5" />
      </Link>
    </section>
  )
}
