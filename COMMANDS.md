# Frontier — the command language

Everything in this file is typed into the **console**: the line between the render view and the
footer. <kbd>⌘K</kbd> (or <kbd>Ctrl K</kbd>) puts the caret in it from anywhere.

There is no syntax to learn. Say it the way you would say it to a person sitting next to you:

```
rotate the anchor cube 40 degrees on z
```

The console completes as you type (<kbd>Tab</kbd> accepts the ghosted text), and the top row of the
stack above it is always **what this will do**, written out in a sentence, before you press
<kbd>Enter</kbd>.

---

## How a line is read

A line is a **verb**, a **target** and some **details**. Only the verb has to come first.

| Part | What counts | Notes |
| --- | --- | --- |
| verb | `find`, `rotate`, `move`, `add`, `set`, `delete from ram`… | the longest matching phrase wins, so `delete from ram` beats `delete` |
| target | a name, a list, a type, or the selection | `chrome sphere` · `cube, torus` · `all lights` · `selection` |
| amount | `40`, `-2.5`, `1.57` | plain numbers, negatives included |
| unit | `degrees` `deg` `°` `radians` `rad` `m` `metres` `units` `%` `x` | optional; each verb has a sensible default |
| axis | `on z` `about the y axis` `along x` `in Z` | optional; rotation defaults to Y, movement to X |
| position | `at x 3 y 2 z -1` · `to x 4 y 1 z 0` · `3 2 -1` | any two of x/y/z is enough, the third is left alone |

Word order barely matters: `rotate 40 deg on z the cube` reads the same as
`rotate cube 40 degrees on z`. Filler words (`the`, `a`, `please`, `object`) are ignored.

### Naming things

Names are matched forgivingly, in this order: exact → starts with → ends with → contains → word
overlap → type name → trailing digits stripped → loose letter sequence.

```
cube          → Anchor Cube
Cube001       → Anchor Cube          (the digits are dropped when nothing matches with them)
chrome        → Chrome Sphere
sphere        → Chrome Sphere        (a type name resolves to the entity of that type)
```

Several targets at once:

```
enable physics on cube, sphere and torus
hide key spot, rim point
```

Whole groups:

```
all lights          every point and spot light
all cameras         every camera
all Environment     every entity in a category (Environment · Water · Terrain · Assets · Curves · Geometry · Lighting · Cameras · Effects)
everything          every entity in the world
```

And the current selection, however you say it:

```
selection · selected · selected objects · this · these · them · it
```

Leaving the target out entirely means the selection too — `isolate` on its own isolates whatever is
selected.

---

## The verbs

### Finding and framing

| Say | Does |
| --- | --- |
| `find chrome sphere` | select it, reveal it in the tree, frame it in the viewport |
| `locate cub` · `select torus` · `where is hero camera` · `go to ocean` | same thing |
| `chrome sphere` | a bare name with no verb also means *find it* |
| `frame selection` · `focus glass slab` | move the camera to it without changing the selection |
| `frame everything` | fit the whole world |
| `view top` | snap to a standard view — `front` `back` `left` `right` `top` `bottom` |

### Moving things

| Say | Does |
| --- | --- |
| `rotate cube 40 degrees on z` | turn it 40° about Z |
| `rotate chrome sphere 1.57 rad on y` | radians are converted for you |
| `rotate torus to 90 deg on x` | `to` sets the angle instead of adding to it |
| `turn cube 15` · `spin torus 90 on y` | `turn`, `spin`, `yaw`, `pitch`, `roll` all work (pitch = X, roll = Z) |
| `move glass slab 2 m on x` | slide it along an axis |
| `translate cube 90 on z` | metres — it will tell you degrees do not move things |
| `move cube to x 4 y 1 z 0` | absolute position; any axis you leave out stays put |
| `nudge sphere -0.5 on y` | `move`, `translate`, `shift`, `nudge`, `push`, `place`, `put` |
| `scale sphere 2x` | uniform scale |
| `scale cube 2x on y` | one axis only |
| `shrink torus 2x` · `grow cube 1.5` | `shrink` inverts the factor |

Locked entities are skipped, and the console says how many it skipped.

### Making and unmaking

| Say | Does |
| --- | --- |
| `add sphere` | drop one in front of the camera |
| `add sphere at x 100, y 400, z 900` | …or exactly where you say |
| `add point light named Fire at x 1 y 2 z 3` | `named` / `called` sets the name |
| `create cube` · `spawn camera` · `new torus` · `drop probe` | same verb, different mood |
| `duplicate anchor cube` | copy alongside the original |
| `rename cube to Anchor Block` | |
| `delete marker post` | remove it from the scene |
| `delete from ram marker post` | remove it **and** dispose its geometry, materials and textures |

`delete from ram` (also `purge`, `wipe`, `free`, `destroy`) reports what it freed —
*"Purged Marker Post — freed 2,880 triangles, 2 geometries, 2 materials"* — and drops the entity
from the run snapshot, so **Stop** cannot bring it back. Ordinary `delete` is the softer one.

Types you can add: `cube` (`box`, `block`), `sphere` (`ball`), `torus` (`donut`, `ring`),
`cylinder` (`tube`, `pillar`), `plane` (`quad`, `panel`), `point light` (`light`, `lamp`),
`spot light` (`spot`), `IES light` (`automotive light`, `headlamp`), `area light` (`softbox`),
`tube light` (`light bar`), `camera` (`cam`), `cinematic camera` (`film camera`),
`player camera` (`follow camera`), `vehicle camera` (`car camera`, `chase camera`),
`terrain` (`landscape`, `height field`), `asset slot` (`imported asset`),
`curve` (`spline`, `Bezier`, `NURBS`, `motion path`), `particles` (`sparks`), `probe`, `audio` (`sound`).

### Visibility, locking, isolation

| Say | Does |
| --- | --- |
| `hide star field` · `show star field` | the eye in the outliner |
| `lock ocean` · `unlock ocean` | |
| `isolate selection` | hide everything that is not in the set |
| `isolate chrome sphere, signal torus` | isolate several at once |
| `exit isolation` · `unisolate` · `show everything` | bring the world back |
| `close popups` | close all billboard-opened settings panels |
| `labels always` · `labels on hover` · `labels icons only` | how the billboards read |

### Properties

Any property of any entity, by the label it carries in the inspector:

```
set roughness of chrome sphere to 0.2
set metallic of anchor cube to 1
set colour of anchor cube to red
set albedo of glass slab to #8fd3ff
set intensity of key spot to 40
set sea level of ocean to -1.2
set fov of hero camera to 28
set cast shadow of platform to off
```

* Numbers are clamped to the property's own range.
* Colours take hex (`#ef5350`) or words (`red`, `amber`, `teal`, `indigo`, `chrome`…).
* Switches take `on/off`, `yes/no`, `true/false`, `enabled/disabled`.
* Aliases are understood: `colour` → color, `metallic` → metalness, `brightness` → intensity.
* The short form works too when it is unambiguous: `set cube colour to red`.

### Physics

| Say | Does |
| --- | --- |
| `enable physics on cube` | make it a body |
| `enable physics on Cube001, sphere001` | several at once |
| `enable physics on selected objects` | the selection |
| `disable physics on all objects` | back to static |

A body falls under gravity, lands on the platform (or the sea if it is off the edge), bounces once
or twice and goes to sleep. It only moves while the world is running — press **Simulate**
(<kbd>Alt S</kbd>) or **Play** — and **Stop** puts every position back exactly as it was. The footer
counts the bodies and how many are still awake; the outliner badges them `PHYS`.

### Time

| Say | Does |
| --- | --- |
| `set time to 17:40` | a clock time |
| `set time to 6pm` | am/pm |
| `set time to golden hour` | `sunrise` `dawn` `morning` `noon` `afternoon` `golden hour` `sunset` `dusk` `blue hour` `evening` `night` `midnight` |
| `start day cycle` · `stop day cycle` | run the sun on its own |

### The transport and the layout

| Say | Does |
| --- | --- |
| `play` | run the world through a scene camera, behind the framing gate |
| `simulate` | run the world, keep the editor camera |
| `pause` · `resume` · `step` · `stop` | the clock |
| `help` | list the examples again |

Layout commands (`outliner panel: hide`, `inspector panel: show`, `layout — viewport only`) appear
in the suggestion stack as canned commands; the panels also toggle from the two buttons at the left
of the viewport header, or <kbd>[</kbd> and <kbd>]</kbd>.

---

## When it does not understand

The console never fails silently. It tells you which part is missing:

```
rotate cube            → How far should it turn?          rotate cube 40 degrees on z
move cube              → How far, and on which axis?      move cube 2 m on x
find flurble           → Nothing here is called "flurble"
set gloss of cube to 1 → Anchor Cube has no "gloss"       try: colour, roughness, metallic…
```

While a word is still growing into a verb (`rota…`) it offers the template instead of complaining.

---

## From the console of your browser

`window.frontier.run('rotate cube 40 deg on z')` executes a line exactly as if it had been typed,
and `window.frontier.lang.parse('…')` returns the plan without running it — handy for automation and
for testing new phrasings.

---

## Not implemented — the obvious next verbs

These are **not** in the build. They are written down because they are the phrases people reach for
next, and because the parser is a table: each one is a verb entry with a `build()` that returns a
plan, so none of them is more than a few lines.

| Phrase | What it would do |
| --- | --- |
| `undo` · `redo` | a command history with inverse plans — every plan already knows its own targets |
| `align cube to sphere on y` · `align all lights to x 0` | match one axis across a set |
| `distribute cubes 2 m apart on x` | space a selection evenly |
| `snap cube to grid` · `snap sphere to ground` | quantise a position, or drop it onto the platform |
| `look through hero camera` · `pilot wide camera` | drive a scene camera without entering Play |
| `parent cube to Objects` · `group selection as Rig` | re-parent and make folders from the console |
| `select all cubes` · `select none` · `invert selection` | selection algebra as commands |
| `copy roughness from chrome sphere to glass slab` | property transfer between entities |
| `randomise rotation of all cubes ±15 deg` | scatter with a range |
| `array cube 5 times 2 m on x` | duplicate along an axis |
| `orbit camera 30 degrees` · `zoom out 2x` | camera moves as verbs |
| `save view as Hero` · `restore view Hero` | named camera bookmarks |
| `set mass of cube to 40` · `throw cube 5 m on x` | physics beyond a falling body |
| `freeze physics` · `drop everything` | bulk physics control |
| `export selection as json` · `import world.json` | round-tripping the scene |
| `screenshot` · `record 5 seconds` | captures from the viewport |
| `rename all lights to Light ##` | patterned bulk rename |
| `find everything without physics` · `list hidden entities` | queries that answer instead of acting |
| `explain roughness` | inline documentation for a property |
| `repeat` · `do that again to the sphere` | re-run the last plan against a new target |

Each entry above is deliberately phrased the way it should be typed, so adding one is a matter of
writing the plan, not designing the sentence.
