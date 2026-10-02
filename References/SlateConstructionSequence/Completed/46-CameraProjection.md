# 46 — CameraProjection

Every document above this one asks the same question in a different form: where is the viewer, and how does a
position in the document become a position on the display. `16` culls to a frustum, `74` casts a ray through a
pointer position, `72` freezes a projection into a placement, `80` scales an overlay against distance. This
document is the one answer all four read.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                          |
| Layer       | `Layer3_Document`                                                            |
| Upstream    | `02` §3.2 (spaces, rebasing), `10` (population), `12` (attachment)           |
| Downstream  | `16`, `18`, `74`, `72`, `78`, `80`, `82`, `26`, `28`, `30`, `64`, `14`       |
| Unblocks    | Orbit, pan, dolly, framing; the frustum `16` culls to                        |

## 1. The Components

| Component            | What it owns                                                          |
|----------------------|------------------------------------------------------------------------|
| `CameraProjection`   | One camera — its placement, its projection, its clipping interval      |
| `ViewProjection`     | Document space → view-relative space, per `02` §3.2                    |
| `FrustumSpace`       | The six planes `16` culls against, in view-relative space              |
| `NavigationSequence` | Orbit, pan and dolly as gestures with a lifecycle                      |
| `FramingSolver`      | An extent and a projection in, a placement out — §5                    |

🔴 A camera is an **occupant of the document population**. It enrolls in `12`, appears in the outliner, attaches
through `AttachmentFollows`, and is manipulated by `78` — `78` §2 already names a camera as a manipulable subject
and this is the declaration it names. A camera held outside the population is one the artist cannot select, name,
group, attach or undo.

⚠️ Being an occupant does not make a camera **shaded**. It writes no `VisibilityIndex`, exactly as `44`'s
illuminants do not; its presence in the workspace is an `80` overlay at `08` §3 ⑩.

## 2. What A Camera Declares

| Declared             | Meaning                                                       | Tier |
|----------------------|----------------------------------------------------------------|------|
| Placement            | Position and rotation, in document space at 64-bit             | A    |
| Projection           | §3 — perspective or parallel, and its extent parameter         | B    |
| Clipping interval    | Near and far, as an interval, never as two loose numbers       | B    |
| Sensor proportion    | Width to height; the display's proportion is not assumed       | B    |
| Exposure             | `66` reads it; it is **not** display state — §6                | B    |

🔴 The clipping interval is one declaration, not two numbers. A near value that has crossed above the far value
is a frustum with no interior, and the symptom is an empty workspace with no error anywhere.

## 3. Two Projections

| Projection  | Extent parameter        | Depth distribution               | Used for                 |
|-------------|-------------------------|-----------------------------------|---------------------------|
| Perspective | Angular field           | Reciprocal, reversed              | The workspace            |
| Parallel    | Linear extent           | Uniform                           | Orthographic references  |

🔴 Depth is **reversed** — the near plane maps to one and the far plane to zero — and `16`'s `DepthSurface`
compares accordingly. Reversed depth with a floating-point target distributes precision where perspective takes it
away; the forward arrangement spends its precision near the camera, where a perspective divide has already given
it precision for free, and starves the distance, where surfaces then interpenetrate.

⚠️ This is a **repository-wide** convention, not this document's private choice. `16`'s comparison, `30`'s ray
march, `60`'s occlusion comparison and `80` ⑩'s depth test all read it. One document reversing its own test in
isolation produces geometry that vanishes rather than geometry that sorts wrongly.

## 4. Navigation Is A Gesture, Not A Property Write

Orbit, pan and dolly follow `10` §2.4's lifecycle: Open on the button, Amend per pointer sample, Seal on release.

| Gesture | Amends                                              | About                             |
|---------|-----------------------------------------------------|------------------------------------|
| Orbit   | Rotation, and position to preserve the distance     | The focus position                |
| Pan     | Position, in the camera plane                       | —                                  |
| Dolly   | Position along the view direction                   | —                                  |
| Zoom    | The projection's extent parameter                   | —                                  |

⚠️ Dolly and zoom are different edits and are presented as different edits. Dolly moves the camera and changes
what occludes what; zoom changes the field and does not. An application that binds one control to whichever is
convenient produces an artist who cannot say why their composition changed.

🔴 A navigation gesture Seals **one** transaction. `10` §2.4's rule is not relaxed here: an orbit recorded per
pointer sample would fill `RevisionSequence` with a thousand states, and `84` would present a scrub bar that is
almost entirely camera motion.

The focus position is declared, not inferred from what is in front of the camera. An orbit centre derived from
whatever the ray happens to meet moves when the artist orbits past a gap, and the object they were inspecting
leaves the display.

## 5. Framing

`FramingSolver` takes an extent — a selection's, an occupant's, the whole population's — and produces a placement
that contains it. It changes the placement only; the projection's extent parameter is left as the artist set it,
because framing that also changes the field is framing that changes the composition.

Framing runs on the tick and is cheap: it reads `40`'s existing extents and derives one placement. It never
traverses topology.

## 6. Exposure Is The Camera's, The Display Is Not

`36` §2 states that the display space is not stored in the document and does not travel with it. Exposure is the
opposite: it is a camera property, it is stored, and it does travel.

| Property        | Stored in the document | Reason                                             |
|-----------------|------------------------|-----------------------------------------------------|
| Exposure        | Yes                    | An authored decision about the image               |
| Working space   | Yes — `36` §2          | Every stored colour is a coordinate in it          |
| Display space   | No — `36` §2           | It belongs to the machine, not to the work         |
| Display mode    | No — `76`              | Non-document state, per the peer partition         |

`66` reads exposure from here and the display space from `76`. The division is the whole point: a document opened
on another machine looks the same, and a document opened on another **display** is encoded for that display.

## 7. Currency

| What changed              | Re-derived                                                          |
|---------------------------|----------------------------------------------------------------------|
| The camera moved          | `ViewProjection`, `FrustumSpace`; `02` §3.2's rebasing origin       |
| The projection changed    | `FrustumSpace` only                                                 |
| An occupant moved         | Nothing here                                                        |
| The display resized       | Sensor proportion, and `FrustumSpace` with it                       |

🔴 A camera move re-derives nothing outside this document. `00` §10.1 ②'s invalidation table, `40` §4, `44` §5,
`70` §3 and `20`'s residency all state the same property from their own side, and it is the reason an artist can
orbit a scene at the tick rate. The rebasing origin moving is not an exception — it is a subtraction applied on
the way into `SlateCompute`, not a re-derivation of anything held.

## 8. Precision

| Computation                    | Tier | Reason                                                     |
|--------------------------------|------|-------------------------------------------------------------|
| Placement composition          | A    | `02` §3.1's decomposed form; drift is unrecoverable        |
| Rebasing subtraction           | A    | Performed at 64-bit before narrowing — `02` §3.2           |
| Projection derivation          | B    | Continuous; `16` and `18` agree through `Shared/`          |
| Frustum plane classification   | A    | A missed plane is geometry culled out of a correct image   |

🔴 Frustum planes are conservative **outward**, matching `38` §6 and `40` §6. An inward-rounded plane culls
geometry the camera can see, and the artist meets it as a surface that disappears along one edge of the display.

## 9. Gates

- **Gate:** A camera is an occupant of the document population and enrolls in `12`.
- **Gate:** A camera writes no `VisibilityIndex`; its presentation is an `80` overlay.
- **Gate:** Depth is reversed, repository-wide, and every depth comparison reads that convention.
- **Gate:** The clipping interval is one declaration and is validated as an interval.
- **Gate:** Navigation follows `10` §2.4 and Seals one transaction per gesture.
- **Gate:** Dolly and zoom are separate, separately presented edits.
- **Gate:** The orbit focus is declared, never inferred from what the view meets.
- **Gate:** Framing changes the placement only, never the projection's extent parameter.
- **Gate:** Exposure is stored in the document; the display space is not.
- **Gate:** A camera move re-derives nothing outside this document.
- **Gate:** Frustum planes are conservative outward.

## 10. Open

| Open question                                                            | Blocks                         |
|---------------------------------------------------------------------------|---------------------------------|
| Whether more than one camera may be presented at once                     | `14` §4 carries the same row    |
| Whether physical sensor and aperture parameters are declared              | `66` exposure presentation only |
| Whether navigation gestures are enrolled in `RevisionSequence` at all     | `84` scrub content              |
| Whether the near and far interval is derived from the population's extent | Tuning only                     |
