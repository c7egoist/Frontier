# Frontier — World Editor UI

A state-of-the-art outliner for a real-time world editor, built in the **Slate UI language**
(tokens lifted verbatim from `Slate/References/UIComponents.html`) and extended in two directions:

1. **More of the world.** Not just meshes — sky, sun, moon, stars, clouds, fog, wind, water,
   lights, cameras, particles, reflection probes, audio emitters and the post stack are all first
   class entities in one tree.
2. **A viewport you can point at.** Every entity is drawn in 3D as a **billboard marker**. Click a
   billboard to select it, click it again (or press <kbd>Enter</kbd>) and its **settings popup**
   opens right where the object lives, tethered to the marker and made of exactly the same
   controls as the docked inspector.

![Frontier — day](docs/preview-day.png)

```bash
npm install
npm run dev        # http://localhost:5173
```

---

## The interaction model

| I want to…                              | I do…                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| find something in a busy world           | search / type-filter chips in the outliner, or <kbd>⌘K</kbd> command palette |
| select an object I can see               | click its billboard (or click the geometry itself)                        |
| tune it without losing the view          | click the billboard again → floating settings popup, tethered to the marker |
| compare two entities                     | open several popups at once, pin the ones that should stay put            |
| tune it with room to breathe             | the docked inspector on the right, same sheet, more width                 |
| stop the scene being a wall of pills     | markers declutter by depth; labels are hover / always / off                |
| reorganise the world                     | drag tree rows to re-parent — drop *inside* a folder or *between* rows     |
| light the shot                           | scrub the time-of-day pill in the viewport, or press play and let it run   |

Popups and the dock are **the same property sheet**, generated from the same schema, bound to the
same model — change a slider in one and the other moves on the same frame.

![Frontier — night](docs/preview-night.png)

---

## Entities

| Group           | Entities                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| **Environment** | Sky Atmosphere · Sun · Moon · Star Field · Cloud Layer · Height Fog · Wind Field |
| **Water**       | Ocean (Gerstner surface, sun glint, foam, fog integration)                       |
| **Geometry**    | Cube · Sphere · Torus · Cylinder · Plane                                          |
| **Lighting**    | Point Light · Spot Light                                                          |
| **Cameras**     | Camera proxies with lens, framing gate and frustum gizmo                          |
| **Effects**     | Particles · Reflection Probe · Audio Emitter · Post Stack                         |

Every one of them is *live*: the sun's elevation moves the shadows and repaints the sky, the moon's
phase is analytic, star brightness follows dusk, wind drives both the cloud deck and the swell,
the fog node owns `scene.fog`, and the post stack owns tone mapping, bloom, vignette and grain.
Metals reflect the real sky through a PMREM cube that is regenerated whenever the environment
changes (debounced, never per frame).

![Frontier — framing the moon](docs/preview-sky.png)

---

## Keyboard

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| <kbd>⌘K</kbd> | command palette | | <kbd>F</kbd> | frame selection |
| <kbd>Enter</kbd> | toggle settings popup | | <kbd>Shift F</kbd> | frame the world |
| <kbd>H</kbd> | hide / show | | <kbd>L</kbd> | lock |
| <kbd>I</kbd> | solo (isolate) | | <kbd>⌘D</kbd> | duplicate |
| <kbd>↑ ↓</kbd> | walk the tree | | <kbd>← →</kbd> | collapse / expand |
| <kbd>⌫</kbd> | delete | | <kbd>Esc</kbd> | close popups / clear selection |

Double-click a row (or a popup title) to rename. Right-click anything for its context menu.

---

## Architecture

```
index.html          shell: topbar · outliner dock · stage · inspector dock · status bar
src/
  world.js          entity table + property SCHEMA + the authored scene (single source of truth)
  viewport.js       three.js scene: sky/moon shader, star dome, cloud deck, ocean, gizmos, post
  billboards.js     DOM markers projected from world-space anchors, depth sort + declutter
  outliner.js       tree: search, filters, twirl animation, multi-select, drag-to-reparent
  inspector.js      builds a property sheet for any node straight from its schema
  popup.js          floating, tethered, pinnable settings panels (same sheet, compact)
  kit.js            ControlKit primitives: slider, switch, value pill, axis field, dropdown, colour
  icons.js          one stroke language, 24×24
  bus.js            select / propchange / treechange
  styles.css        design tokens — the only place a colour or radius is written down
```

**Why the UI never hard-codes a control.** `world.js` describes each entity type as groups of
property definitions (`slider`, `switch`, `vec3`, `color`, `select`, `readout`). The inspector, the
popup, the command palette and the outliner filters all read that table, so adding an entity type —
or a property to an existing one — is a few lines of data, no UI work. That is also what makes the
sheet portable: the same table can drive the engine-side `ControlKit` panels one-for-one.

**Why DOM billboards instead of sprites.** Glyphs stay crisp at any distance, labels stay legible,
hit-testing is exact and free, hover/selected states are CSS, and a popup can be tethered to a
marker without a second projection path. The 3D scene keeps the pixels; the UI keeps the widgets.

### Tokens

`src/styles.css` is the Slate token block verbatim — surfaces `#050505 / #121212 / #1a1a1a / #000`,
strokes, `--hi: #6c77ff`, radii `24 / 18 / 999`, `--ease: cubic-bezier(.22,.61,.36,1)`. Sliders use
ControlKit geometry (the fill is a pill that ends under the thumb centre, never a hard-edged
gradient stop) and every numeric readout is type-in editable, clamped to its own range.

### Notes

* No terrain — deliberately. The world is sky, water, light and objects.
* `window.frontier` exposes `{ state, app, setTimeOfDay, vp, popups, outliner, billboards, world }`
  for console poking and automation.
