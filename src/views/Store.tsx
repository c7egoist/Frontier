import { useMemo, useState } from 'react'
import {
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  Check,
  Plus,
  ArrowUpRight,
  Tag as TagIcon,
  Sparkles,
  Package,
  ShieldCheck,
  Heart,
} from 'lucide-react'
import { useLauncher } from '../state/launcher'
import { games, getGame } from '../data/games'
import type { Game } from '../data/types'
import GameArt from '../components/GameArt'
import { PriceTag, PlayPill, Meter, Avatar } from '../components/ui'

const discounts: Record<string, number> = {
  'pale-tide': 25,
  'neon-koi': 40,
  'deadfrequency': 15,
  'lumen': 10,
  'ironfall': 0,
}

const genres = ['All', 'Action', 'RPG', 'Strategy', 'Racing', 'Horror', 'Puzzle', 'Adventure']
type SortId = 'top' | 'new' | 'price' | 'az'

function StoreCard({ game }: { game: Game }) {
  const { openGame, wishlist, toggleWishlist, states } = useLauncher()
  const listed = wishlist.includes(game.id)
  const off = discounts[game.id] ?? 0
  const state = states[game.id] ?? game.state

  return (
    <article className="store-card" onClick={() => openGame(game.id)} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openGame(game.id)
        }
      }}
    >
      <div className="store-card__art">
        <GameArt game={game} />
        <div className="store-card__badges">
          {off > 0 && <span className="badge badge--accent mono">-{off}%</span>}
          {game.year >= 2026 && <span className="badge mono">NEW</span>}
          {state === 'installed' && <span className="badge badge--ok mono">OWNED</span>}
        </div>
        <button
          className={`store-card__wish${listed ? ' is-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleWishlist(game.id)
          }}
          aria-label={listed ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {listed ? <Check size={13} /> : <Plus size={13} />}
        </button>
        <div className="store-card__hover">
          <span className="mono">META {game.score}</span>
          <span className="mono">{game.genres[0]}</span>
        </div>
      </div>
      <div className="store-card__body">
        <div className="store-card__row">
          <h3>{game.title}</h3>
          {state === 'installed' ? (
            <span className="price price--owned mono">Library</span>
          ) : (
            <div className="store-card__price">
              {off > 0 && game.price !== null && (
                <span className="price-old mono">${game.price.toFixed(2)}</span>
              )}
              <PriceTag price={game.price === null ? null : off > 0 ? game.price * (1 - off / 100) : game.price} />
            </div>
          )}
        </div>
        <p className="store-card__studio">
          {game.studio} <span className="t3">· {game.year}</span>
        </p>
        <div className="store-card__tags">
          {game.tags.slice(0, 2).map((t) => (
            <span key={t} className="mini-tag">{t}</span>
          ))}
        </div>
        <div className="store-card__foot">
          <span className="mono t3">{game.players} playing</span>
          <PlayPill game={game} />
        </div>
      </div>
    </article>
  )
}

function DealBanner() {
  const { openGame, states, install } = useLauncher()
  const game = getGame('pale-tide')!
  const state = states[game.id] ?? game.state
  return (
    <div className="deal">
      <div className="deal__art">
        <GameArt game={game} glyph={false} />
        <div className="deal__art-type display" aria-hidden="true">TIDE</div>
      </div>
      <div className="deal__body">
        <span className="eyebrow"><Sparkles size={12} /> Deal of the week</span>
        <h2 className="deal__title display">{game.title}</h2>
        <p className="deal__copy">{game.tagline} {game.description.split('. ')[0]}.</p>
        <div className="deal__meta">
          <span className="mono">META {game.score}</span>
          <span className="mono t3">/</span>
          <span className="mono">{game.studio}</span>
        </div>
        <div className="deal__price-row">
          <span className="deal__off mono">-25%</span>
          <span className="deal__was mono">$24.99</span>
          <span className="deal__now mono">$18.74</span>
        </div>
        <div className="deal__actions">
          {state === 'available' ? (
            <button className="btn btn--primary" onClick={() => install(game.id)}>
              <Plus size={14} /> Add to library
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => openGame(game.id)}>
              In library <ArrowUpRight size={14} />
            </button>
          )}
          <button className="btn btn--outline" onClick={() => openGame(game.id)}>Details</button>
          <span className="deal__timer mono">
            <span className="dot dot--busy pulse" /> Ends in 41:12:08
          </span>
        </div>
      </div>
    </div>
  )
}

function MiniDeal({ id, off }: { id: string; off: number }) {
  const { openGame } = useLauncher()
  const game = getGame(id)!
  return (
    <button className="mini-deal" onClick={() => openGame(id)}>
      <span className="mini-deal__art">
        <GameArt game={game} glyph={false} marks={false} />
      </span>
      <span className="mini-deal__body">
        <span className="label">Save {off}%</span>
        <b>{game.title}</b>
        <span className="mini-deal__row">
          <span className="price-old mono">${game.price?.toFixed(2)}</span>
          <span className="mini-deal__now mono">${((game.price ?? 0) * (1 - off / 100)).toFixed(2)}</span>
        </span>
      </span>
      <ArrowUpRight size={15} className="mini-deal__arrow" />
    </button>
  )
}

function BundleCard({
  title,
  ids,
  price,
  off,
  blurb,
}: {
  title: string
  ids: string[]
  price: number
  off: number
  blurb: string
}) {
  const { notify } = useLauncher()
  return (
    <article className="bundle">
      <div className="bundle__stack">
        {ids.map((id) => {
          const g = getGame(id)!
          return (
            <span key={id} className="bundle__tile">
              <GameArt game={g} glyph={false} marks={false} />
            </span>
          )
        })}
      </div>
      <div className="bundle__body">
        <span className="eyebrow"><Package size={12} /> Bundle · {ids.length} titles</span>
        <h3>{title}</h3>
        <p>{blurb}</p>
        <div className="bundle__foot">
          <span className="bundle__prices">
            <span className="price-old mono">${price.toFixed(2)}</span>
            <span className="mono">${(price * (1 - off / 100)).toFixed(2)}</span>
          </span>
          <button
            className="btn btn--outline btn--sm"
            onClick={() => notify('Bundle added to cart', `${title} · -${off}% applied`, '#8fe0ff')}
          >
            Add bundle <Plus size={13} />
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Store() {
  const [genre, setGenre] = useState('All')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortId>('top')
  const { notify, wishlist } = useLauncher()

  const filtered = useMemo(() => {
    let list = games.filter((g) => g.price !== null)
    if (genre !== 'All') list = list.filter((g) => g.genres.some((x) => x.toLowerCase().includes(genre.toLowerCase())))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (g) => g.title.toLowerCase().includes(q) || g.studio.toLowerCase().includes(q) || g.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    switch (sort) {
      case 'new':
        return [...list].sort((a, b) => b.year - a.year || b.score - a.score)
      case 'price':
        return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      case 'az':
        return [...list].sort((a, b) => a.title.localeCompare(b.title))
      default:
        return [...list].sort((a, b) => b.score - a.score)
    }
  }, [genre, query, sort])

  return (
    <div className="store">
      <header className="store-head">
        <div>
          <span className="eyebrow"><TagIcon size={12} /> AXIOM storefront · 412 releases</span>
          <h1 className="display store-head__title">Store</h1>
          <p className="store-head__sub">
            Verified builds only. Every purchase is DRM-light, refundable within 2 hours, and installs
            straight into the runtime.
          </p>
        </div>
        <div className="store-head__stats">
          <div>
            <span className="label">Library value</span>
            <b className="mono">$412.68</b>
          </div>
          <div>
            <span className="label">Wishlisted</span>
            <b className="mono">{wishlist.length}</b>
          </div>
          <div>
            <span className="label">Wallet</span>
            <b className="mono accent">◈ 1,290</b>
          </div>
          <span className="store-head__shield">
            <ShieldCheck size={13} /> VERIFIED
          </span>
        </div>
      </header>

      <div className="deals">
        <DealBanner />
        <div className="deals__side">
          <MiniDeal id="neon-koi" off={40} />
          <MiniDeal id="deadfrequency" off={15} />
          <div className="deals__note panel panel--flat">
            <span className="label">Curator note</span>
            <p>
              “Pale Tide is the quietest game on the service and the one we have argued about the most.
              Play it with headphones.”
            </p>
            <div className="deals__note-foot">
              <Avatar initials="HC" accent="#8fe0ff" size={24} />
              <span className="mono">H. CRIMS · CURATION</span>
            </div>
          </div>
        </div>
      </div>

      <div className="store-toolbar">
        <div className="store-toolbar__search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the store…"
            aria-label="Search store"
          />
          {query && (
            <button className="mono" onClick={() => setQuery('')}>
              CLEAR
            </button>
          )}
        </div>
        <div className="store-toolbar__sort">
          <ArrowDownUp size={14} />
          {(
            [
              ['top', 'Top rated'],
              ['new', 'Newest'],
              ['price', 'Price'],
              ['az', 'A–Z'],
            ] as [SortId, string][]
          ).map(([id, label]) => (
            <button key={id} className={`sort-btn${sort === id ? ' is-active' : ''}`} onClick={() => setSort(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="store-genres">
        <SlidersHorizontal size={14} className="t3" />
        {genres.map((g) => (
          <button key={g} className={`chip${genre === g ? ' is-active' : ''}`} onClick={() => setGenre(g)}>
            {g}
            {g !== 'All' && <span className="chip__count">{games.filter((x) => x.genres.includes(g)).length}</span>}
          </button>
        ))}
        <span className="store-genres__count mono">{filtered.length} results</span>
      </div>

      {filtered.length > 0 ? (
        <div className="store-grid">
          {filtered.map((g) => (
            <StoreCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search size={22} />
          <b>No builds match “{query}”</b>
          <span>Try a different genre filter or clear the search.</span>
          <button className="btn btn--outline btn--sm" onClick={() => { setQuery(''); setGenre('All') }}>
            Reset filters
          </button>
        </div>
      )}

      <section className="store-section">
        <div className="store-section__head">
          <div>
            <span className="label">Curated</span>
            <h2 className="display">Bundles built to be finished</h2>
          </div>
          <span className="mono t3">3 collections · weekly rotation</span>
        </div>
        <div className="bundle-grid">
          <BundleCard
            title="The Quiet Hours"
            ids={['hollow-orchard', 'pale-tide', 'lumen']}
            price={72.97}
            off={30}
            blurb="Three slow, generous worlds for the long evenings. No fail states, no timers."
          />
          <BundleCard
            title="Night Shift"
            ids={['deadfrequency', 'ashen-crown', 'shatterpoint']}
            price={109.97}
            off={22}
            blurb="Pressure, pressure, pressure. Verified co-op builds and a ranked-ready shooter."
          />
          <div className="bundle bundle--wallet">
            <div className="bundle__body">
              <span className="eyebrow"><Heart size={12} /> AXIOM wallet</span>
              <h3>Top up once, launch anything</h3>
              <p>Credits never expire and can be split across titles, DLC and passes.</p>
              <div className="wallet-tiers">
                {[10, 25, 50, 100].map((v) => (
                  <button key={v} className="wallet-tier" onClick={() => notify('Wallet top-up started', `◈ ${v * 100} · awaiting provider`, '#b48bff')}>
                    <span className="mono">◈ {v * 100}</span>
                    <span className="mono t3">${v}</span>
                  </button>
                ))}
              </div>
              <Meter value={62} thin color="#b48bff" />
              <span className="mono t3 bundle__hint">1,290 of 2,000 monthly credits remaining</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
