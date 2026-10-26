# Coast Road — game website

Marketing + demo site for the racing game. Vite + React + Tailwind, no backend, no tracking.
Dark minimal UI built from the **Frontier General UI** theme tokens.

## Theme

The palette, radii, type roles and accent swatches are lifted verbatim from the Frontier
General UI theme (`Engine/Interface/ThemeStructure.cpp` — OLED palette) and the prototype
`DesignTokens.css`:

| Token | Value | Used for |
| --- | --- | --- |
| `--color-void` | `#000000` | page canvas (OLED `mainBg`) |
| `--color-panel` | `#0a0a0a` | sticky nav, panels |
| `--color-card` | `#141415` | cards |
| `--color-card-2` | `#1c1c1e` | nested surfaces, hover |
| `--color-hair` | `rgba(255,255,255,.06)` | every border and divider |
| `--color-ink` / `--color-muted` | `rgba(255,255,255,.95 / .40)` | text |
| `--color-accent` | `var(--accent)` | runtime swappable accent |
| `--radius-panel` / `--radius-tile` | `24px` / `12px` | shells and cards |
| type roles | 24/20/16/14/12/11 px | Title → Caption |

Fonts are the theme's own families, self-hosted: **Inter Variable** (UI), **Archivo Variable**
(display), **JetBrains Mono Variable** (meta labels). The accent picker in the nav exposes the
theme's ten swatches (White → Rose); the choice is remembered in `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

## Change the game name

One line — `name` and `wordmark` in [`src/site.config.js`](src/site.config.js):

```js
name: 'Coast Road',
wordmark: 'COAST ROAD',
```

Everything else (nav, titles, footer, privacy policy, download filenames) reads from that file.
Also update `<title>` / meta description in `index.html` and the favicon in `public/favicon.svg`.

## Where things live

| What | File |
| --- | --- |
| All copy, versions, links, requirements | `src/site.config.js` |
| Contact address (every Contact button) | `src/site.config.js` → `email` |
| Accent swatches | `src/lib/accents.js` |
| Theme tokens + component classes | `src/styles/index.css` |
| Hero road artwork (pure SVG) | `src/components/RoadArt.jsx` |
| Stage route maps (pure SVG) | `src/components/TrackArt.jsx` |
| Pages | `src/pages/` |

Routing is `HashRouter`, so the built `dist/` works on any static host — including a GitHub
Pages project subpath — with no server rewrite rules.

## Drop in your assets

**Demo reel** → `public/media/demo.mp4`
The player on `/demo` picks it up automatically. Until the file exists the page shows an honest
placeholder instead of pretending to have video. Set `demo.youtubeId` in the config if you also
want a "watch on YouTube" link.

**Builds** → `public/downloads/coast-road-demo-win64.zip`
After adding a file:

1. set `uploaded: true` on that entry in `src/site.config.js`,
2. paste the checksum from `sha256sum <file>`,
3. fill in the real size.

Large archives should not be committed — host them on GitHub Releases and put the full release
URL in the `file` field instead (`public/media/*.mp4` and `public/downloads/*.zip` are gitignored).

## Before you publish — checklist

- [ ] `studio` in `src/site.config.js` — replaces `[Studio name]` in the footer and privacy policy.
- [ ] `requirements` — the table ships with `TBD` values.
- [ ] Privacy policy §4 claims the demo collects no telemetry. **Verify that is true for your build** and edit `src/pages/Privacy.jsx` if it is not.
- [ ] Privacy policy — this is a plain-language template, not legal advice. Have it reviewed if you ship commercially or target the EU/UK.
- [ ] Real stage lengths, feature copy and roadmap states in `src/site.config.js`.
- [ ] `index.html` meta/OG tags and a social image.

## Deploy (GitHub Pages)

```bash
npm run build
# publish dist/ — e.g.
npx gh-pages -d dist -b gh-pages
```

`vite.config.js` sets `base: './'`, so it works on a project subpath
(`https://<user>.github.io/<repo>/`) without further changes.
