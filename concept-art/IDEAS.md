# SANDBLAST — Sandstorm Stage Concepts

Five sandstorm mechanics for a strictly-racing, RPO-style obstacle game.
Each storm is a different *verb* — dust is never scenery, it is the level.

| # | Stage | The Verb | Mechanic |
|---|-------|----------|----------|
| 1 | Haboob Heart | **Read the beams** | Visibility is the boss |
| 2 | The Eye | **Beat the shrink** | The storm is a shrinking arena |
| 3 | The Strobe | **Race the flashes** | Darkness punctuated by truth |
| 4 | Sand Bore | **Ride the face** | A tidal wave made of sand |
| 5 | The Pincer | **Thread the seam** | Two fronts, one closing corridor |

---

## 1. HABOOB HEART — `35-haboob-heart.png`
Inside the storm it is a permanent brownout: monochrome orange world,
intra-storm lightning webs crackling through the gloom, static spidering
across bodywork. Your headlight cones are your only sightlines — you race
the beams of the cars around you. Trust the road sound and the beams;
brake abruptly and you are invisible AND rear-ended.

## 2. THE EYE — `36-the-eye.png`
A continent-scale haboob with a calm blue eye at its heart. The ring track
is carved into the inner wall of the storm itself. Every lap the eye
contracts — the dust front eats the outer lanes — so the race gets tighter,
faster and more violent as the safe ribbon narrows. Ultimate endgame mode:
last car on surviving asphalt wins.

## 3. THE STROBE — `37-the-strobe.png`
Night stage inside an electrified storm: pitch black, then a lightning
flash reveals everything for half a second — the crest, the gap, the rival
three feet to your left — then black again. You race between frames,
committing to lines you can only see in flashes.

## 4. SAND BORE — `38-sand-bore.png`
A breaking wave thirty stories tall surfing down a dry canyon — and it is
rideable: the face is smooth, banked, and fast. Surf high on the lip for
speed and risk burial; drop low and lose the push. The ocean mechanic of
ROGUE reborn in the desert — the same wave game, fossilized and resurrected.

## 5. THE PINCER — `39-the-pincer.png`
Storm walls converge from both sides of the valley; the drivable strip
shrinks toward a single golden seam of light. Head-on drafting through the
gap as grit sheets stream across from both walls — the pack funnels into
the tightest, most contact-heavy finish in the game.

---

## Companion rock-desert stages (same world)

| File | Stage | Mechanic |
|------|-------|----------|
| `30-the-slot.png` | The Slot | Wall-riding above a live sand flood — centripetal grip or fall |
| `31-the-boom.png` | The Boom | Dune avalanche in real time — the surface is becoming liquid |
| `32-stone-forest.png` | Stone Forest | Living hoodoo maze — pillars topple, corridors reshuffle |
| `33-the-fins.png` | The Fins | Razor-crest line with thermal cracking — width is the hazard |
| `34-devil-run.png` | Devil Run | Dust-devil eyes are drivable tunnels — draft the rotation |

## Core hero shots

| File | Scene |
|------|-------|
| `09-rogue-gold-swell.png` | ROGUE — carving the 300 m sunset wave face |
| `10-rogue-barrel.png` | ROGUE — inside the barrel |
| `21-godspeed-the-skin.png` | GODSPEED — the armada approaches the sleeping god |

---

## Playable tech

`../rogue-html/index.html` — live HTML/WebGL concept of the ROGUE wave:
14-component GPU Gerstner ocean (~212k verts), a breathing mega-wave
displacement field with curling lip, PBR water shading (Fresnel sky
reflection, GGX sun glitter, sub-surface crest glow, fold foam), PMREM
image-based lighting on the cars, ACES tonemapping + hand-rolled HDR bloom.
ORBIT / CHASE / BARREL cameras, SWELL and quality toggles. Vendored
three.js r147 — one page, no build, no CDN.
