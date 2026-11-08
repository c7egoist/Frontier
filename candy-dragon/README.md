# Sucré — the Candy Dragon

A majestic dragon sculpted entirely from confectionery, built as a real-time 3D
WebGL experience. Everything you see is generated procedurally in code — there
are no imported models, no image textures and no baked animations.

## The confection

| Part of the dragon | What it's made of |
|---|---|
| Hide | poured raspberry sugar, clear-coated, with a mint-opal crystal-scale normal map |
| Scales | ~1,400 instanced opal crystal scales, each one tinted individually |
| Belly | cream-coloured gullet, blended per vertex straight into the sugar hide |
| Crest | translucent raspberry-jelly sails swept back along the spine |
| Horns | ribbed raspberry candy wound with a spun-sugar spiral |
| Wing membranes | pulled sugar-glass, iridescent, transmission-shaded |
| Wing bones | candy-cane rods with a helical mint stripe |
| Claws & trim | spun gold sugar |
| Eyes | molten apricot candy with slit pupils and gold rims |
| Plinth | a pearlescent sugar slab ringed with lollipops, gumdrops and dragées |

## Animation

Everything runs off one clock, so it stays in sync at any frame rate:

- slow, powerful wing beat with wrist follow-through
- head surveys the room and settles; the jaw breathes
- a furnace glow pulses inside the throat
- the crest and fins ripple
- sugar motes drift all around the sculpture
- the whole piece hovers and breathes on its plinth

## Controls

- **drag** to orbit, **scroll** to zoom
- **Majesty** — ceremonial slow camera orbit with a stronger glow
- **Roar** — the jaw opens, the throat ignites, embers spray (keyboard `R`)
- **Orbit** — hands-free turntable (keyboard `Space`)
- **Bloom** — ignite the sugar glitter
- **click the dragon** — burst sparkles wherever you touch it

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run preview
```

## How it's built

- `src/dragon.js` — the sculpture. A spine spline drives a swept-tube torso;
  the head is lofted from an explicit side silhouette so the profile stays
  draconic. Wings are a bat-fan of five candy-cane fingers with scalloped
  membranes between them.
- `src/candy.js` — procedural candy textures (peppermint swirls, candy-cane
  stripes, a diamond-scale normal map) and the edible material library.
- `src/env.js` — a hand-painted "candy studio" reflection environment plus the
  backdrop dome.
- `src/main.js` — renderer, bloom pipeline, camera, embers and interaction.
- `tools/` — a software rasteriser (`preview.mjs`) used to review the sculpture
  without a GPU, plus a headless smoke test and a bundle-check.
