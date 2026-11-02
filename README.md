# AXIOM — Game Runtime & Launcher

A complete, dark-theme game launcher interface: storefront, library, transfers, social layer,
per-title detail pages, a cinematic launch sequence and a systems Control Center.

**AXIOM** is the fictional runtime the whole product is built around — the layer between your
hardware and your library. The UI is designed as a piece of technical instrumentation: warm black
surfaces, hairline rules, mono telemetry, and one saturated signal accent.

> Every game, studio, price and player count in this repo is fictional. No raster assets are used —
> all key art is generated procedurally as layered SVG at runtime.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the production build
```

Extras:

```bash
npm run typecheck  # tsc only
npm run smoke      # jsdom smoke test: every page, tab, overlay and launch flow
npm run audit:css  # checks CSS validity and class coverage
```

## Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` / `/` | Command search |
| `↑` `↓` `Enter` | Move through results / open |
| `Esc` | Close overlay, drawer or launch sequence |
| `⌘J` / `Ctrl+J` | Toggle ambient radio |
| `F1` | Pin the performance overlay |

---

## What is in it

### Control Deck (home)
- Rotating featured hero with film-style type, live-ops ticker, spec panel and auto-advance ticks.
- Continue-playing cards with resume progress, a live runtime gauge and friend presence.
- Curated shelf, weekly playtime strip, community marathon event, signal feed, achievements and a
  two-job transfer monitor.

### Storefront
- Deal of the week with real price math, secondary deals and a curator note.
- Live search, genre filters, four sort modes, discount/owned/new badges, wishlist toggles.
- Three collection bundles plus a wallet top-up panel.

### Library
- Content-volume storage map broken down per installed build.
- Filters (all / installed / updates / wishlist), search, sort, and a real grid ⇄ list layout switch.
- Build integrity and recent-session panels, per-title progress.

### Transfers
- Aggregate throughput with a sparkline, four queued jobs driven by a ticking transfer engine
  (progress, pause/resume, reorder, remove).
- Bandwidth cap, session auto-pause, delivery route, verification details, installed history.

### Network
- Party room with voice waveform, slots, mute/deafen and invite.
- Friend requests (accept/decline), status-grouped friend list with join/invite, and a season ladder
  with promotion deltas.
- Activity wall: rare unlock, session recap, open party and live feed.

### Game detail
- Full-bleed hero with score ring, build spec, install state and update progress.
- Tabs for Overview (about, environment studies, telemetry, traits), Achievements (rarity + XP),
  Sessions (weekly chart + log) and Specs (min/recommended, this device, capabilities).
- Achievements, owners in your network, similar builds.

### Launch sequence → session
- Click **Play** anywhere to run a staged boot: runtime handshake, graphics pipeline, shader cache,
  content mount — with per-step status and an abort.
- The player bar switches to session mode with a live timer, FPS/frame-time/GPU/VRAM readouts and
  quick overlay/end-session actions. Music stops for the session and resumes after.

### Control Center
- Accent profile (six themes, applied instantly across the UI), launch animation toggle,
  reduce-motion, performance overlay and interface scale.
- Renderer, quality presets, frame caps, Reflex / frame-gen / HDR and live telemetry.
- Master/music volume, ambient radio, output routing, spatial audio, voice ducking.
- Runtime info, update channel, cloud saves, recording, storage path, build verification.
- Notifications and wallet sit in the top bar; both are wired to real state.

---

## Design language

| Token | Value | Notes |
| --- | --- | --- |
| Background | `#080706` | warm black, never pure `#000` |
| Surface | `#100e0c` → `#1b1713` | layered panels |
| Text | `#f6f2ec` / `#b3a99c` / `#7d7468` | three-step hierarchy |
| Accent | `#ff5a1f` (Ember) | signal orange, themable |
| Display | Space Grotesk | tight tracking, editorial scale |
| UI | Inter | dense, legible |
| Data | JetBrains Mono | tabs, labels, telemetry |

The reference boards informed the composition rather than the palette: a poster-like hero with huge
overlapping type, a dark mobile game card with a single colored action, and a dashboard's information
density. The result keeps **one warm accent**, **hairline structure**, and **fine grain + scanline
texture** throughout.

### Procedural key art

`src/components/GameArt.tsx` renders eleven deterministic art systems (`orbit`, `monolith`,
`ribbons`, `bloom`, `grid`, `flow`, `circuit`, `swarm`, `shards`, `signal`, `tiles`) from a per-title
palette and seeded PRNG. Every card, hero, thumbnail and gallery study is drawn from the same system,
so the launcher ships with zero image files and still looks authored.

---

## Structure

```
src/
  state/launcher.tsx      # installs, launches, sessions, downloads, theme, overlays, toasts
  data/                   # games, friends, music — typed mock content
  components/
    Shell.tsx             # rail, top bar, player bar, toasts
    GameArt.tsx           # procedural SVG art engine
    ui.tsx                # avatar, meter, price, play pill, cover, wide card…
    SearchOverlay.tsx     # ⌘K command palette
    LaunchOverlay.tsx     # staged boot sequence
    ControlCenter.tsx     # settings drawer
  views/                  # Home, Store, Library, Downloads, Network, GameDetail
  styles/                 # tokens + primitives, shell, views, overlays
scripts/
  smoke.mjs               # jsdom end-to-end interaction test
  audit.mjs               # CSS validity + class coverage audit
```

### Adding a title

Append an object to `src/data/games.ts` with a palette, `art` variant and glyph. The store, library,
search, transfers and detail page pick it up automatically; the art engine needs no assets.

---

MIT-style use for the interface code. All titles, studios and brands are fictional.
