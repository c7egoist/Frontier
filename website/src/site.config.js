/*==============================================================================================
                                          SITE CONFIG
  Every string on the site lives here. Renaming the game is a one-line edit: `name` below.
==============================================================================================*/

export const site = {
  /* ---- identity ---------------------------------------------------------- */
  name: 'Coast Road',
  wordmark: 'COAST ROAD',
  tagline: 'A racing game about reading the road ahead.',
  short: 'Open-road racing. One car, one road, no second chances at 200 km/h.',
  studio: '[Studio name]',          // <- replace: appears in the footer and privacy policy
  email: 'c7egoist@gmail.com',      // <- every Contact button routes here (mailto:)

  /* ---- build metadata ---------------------------------------------------- */
  build: {
    version: '0.7.3',
    status: 'Pre-alpha demo',
    platforms: 'Windows 64-bit',
  },

  /* ---- hero HUD strip ---------------------------------------------------- */
  hud: [
    { key: 'Stage', value: '01 — Coast road' },
    { key: 'Surface', value: 'Dry tarmac' },
    { key: 'Light', value: 'Late afternoon' },
    { key: 'Traffic', value: 'None' },
  ],

  /* ---- features ---------------------------------------------------------- */
  features: [
    {
      title: 'Roads that read back',
      body: 'Camber, crest and surface change under load. You feel the car settle before you see the corner.',
      meta: 'Handling',
    },
    {
      title: 'Stages, not laps',
      body: 'Point-to-point routes with weather that moves across the stage while you drive it.',
      meta: 'Structure',
    },
    {
      title: 'A garage worth opening',
      body: 'Setup changes you can feel in two corners — not a spreadsheet of tyre pressures.',
      meta: 'Cars',
    },
    {
      title: 'Ghosts and splits',
      body: 'Chase your own best run, sector by sector, with deltas on screen the whole stage.',
      meta: 'Time trial',
    },
  ],

  /* ---- stages / gallery -------------------------------------------------- */
  stages: [
    { name: 'Harbour Line', kind: 'Coast', length: '— km', art: 'coast', note: 'Sea wall, tight exits, long shadows.' },
    { name: 'The Switchbacks', kind: 'Mountain', length: '— km', art: 'hairpin', note: 'Blind entries and a drop on the right.' },
    { name: 'Ring Road', kind: 'Circuit', length: '— km', art: 'circuit', note: 'Fast sweepers, one heavy braking zone.' },
  ],

  /* ---- roadmap ----------------------------------------------------------- */
  roadmap: [
    { label: 'Core handling model', state: 'done' },
    { label: 'Three stage routes', state: 'wip' },
    { label: 'Demo build (public)', state: 'wip' },
    { label: 'Wheel + force feedback support', state: 'next' },
    { label: 'Full release', state: 'planned' },
  ],

  /* ---- demo -------------------------------------------------------------- */
  demo: {
    // Drop your reel at: public/media/demo.mp4  (the player picks it up automatically)
    video: './media/demo.mp4',
    poster: '',
    duration: '—',
    // Optional: a YouTube video id, e.g. 'dQw4w9WgXcQ'. Leave empty to hide the link.
    youtubeId: '',
    build: {
      label: 'Demo build',
      file: './downloads/coast-road-demo-win64.zip',
      version: '0.7.3',
      size: '— MB',
      platform: 'Windows 64-bit',
      uploaded: false,           // <- flip to true once the zip is in public/downloads/
      sha256: '',                // <- paste `sha256sum` output here
    },
  },

  /* ---- downloads --------------------------------------------------------- */
  downloads: [
    {
      label: 'Coast Road — Demo',
      platform: 'Windows 64-bit',
      file: './downloads/coast-road-demo-win64.zip',
      version: '0.7.3',
      size: '— MB',
      uploaded: false,
      sha256: '',
      primary: true,
    },
    {
      label: 'Coast Road — Demo',
      platform: 'macOS (Apple silicon)',
      file: '',
      version: '—',
      size: '— MB',
      uploaded: false,
      sha256: '',
      primary: false,
      note: 'Planned — not built yet.',
    },
    {
      label: 'Coast Road — Demo',
      platform: 'Linux (x86_64)',
      file: '',
      version: '—',
      size: '— MB',
      uploaded: false,
      sha256: '',
      primary: false,
      note: 'Planned — not built yet.',
    },
  ],

  /* ---- system requirements (fill these in before you publish) ------------ */
  requirements: {
    minimum: [
      ['OS', 'Windows 10 64-bit'],
      ['Processor', 'TBD'],
      ['Memory', 'TBD'],
      ['Graphics', 'TBD'],
      ['Storage', 'TBD'],
    ],
    recommended: [
      ['OS', 'Windows 11 64-bit'],
      ['Processor', 'TBD'],
      ['Memory', 'TBD'],
      ['Graphics', 'TBD'],
      ['Storage', 'TBD'],
    ],
  },

  /* ---- privacy policy ---------------------------------------------------- */
  privacy: {
    lastUpdated: '26 October 2026',
    // Where builds are hosted — shown in the "Downloads" section of the policy.
    host: 'GitHub Pages',
  },
}

export default site
