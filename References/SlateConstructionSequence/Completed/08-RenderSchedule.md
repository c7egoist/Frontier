# 08 — RenderSchedule

`RenderSchedule` declares what is recorded in a cycle slot, in what order, and against which shared device
targets. It is a declaration consumed by an orderer, not a general dependency-solving construct: the recordings
are known at bring-up, the target set is known at bring-up, and the ordering is therefore fixed at bring-up and
merely executed per rotation.

🔴 The term for this is `RenderSchedule`. "Frame graph" is not a synonym to be used in comments or discussion —
`Frame` is a banned word and "graph" implies a solved dependency structure that Slate does not build.

## Position In The Sequence

| Field       | Value                                                                          |
|-------------|---------------------------------------------------------------------------------|
| Unit        | `SlateVulkan.lib`                                                               |
| Layer       | `Layer2_Device`                                                                 |
| Upstream    | `06` — recording rotation, extents, descriptors, presentation                   |
| Downstream  | `16`, `18`, `26`, `28`, `30`, `60`, `62`, `64`, `66`, `80` each contribute recordings; `14` contributes the last |
| Unblocks    | Any ordered sequence of device work reaching the screen                         |

## 1. What A Recording Declares

✔️ Done — `DeclaredRecording` carries identity, reads, produces, amends, command, capability and substitution, and
a requirement with no substitution is refused at contribution rather than at bring-up.

## 2. Shared Targets

🚧 Partially completed — the fifteen targets and their extent relations are declared as closed enumerations and a
total relation table. Nothing claims a format, an extent or memory, and the amendment list is held per recording
rather than per target. The table stays because it is what stops a contributing document inventing a sixteenth.

Extents are given relative to the display extent unless stated absolutely.

| Target                 | Format    | Extent      | Produced by | Amended by       | Consumed by        |
|------------------------|-----------|-------------|-------------|-------------------|---------------------|
| `DepthSurface`         | D32       | display     | `16`        | `80` ⑩            | `16`, `26`, `30`, `60`, `62`, `80` |
| `VisibilityIndex`      | R32G32 UI | display     | `16`        | —                 | `18`, `26`, `42`    |
| `OccupancySurface`     | R8        | display     | `16`        | —                 | `18`, `62`          |
| `MotionSurface`        | R16G16F   | display     | `16`        | —                 | `62`, `64`          |
| `OcclusionSurface`     | R8        | half        | `60`        | —                 | `18`                |
| `DirectOcclusionSurface`| RGBA8    | display     | `60`        | —                 | `18`                |
| `TransmissionIndex`    | R32G32 UI × K | display | `62` ⑤·i    | —                 | `62` ⑤·ii, `26`     |
| `RadianceSurface`      | RGBA16F   | display     | `18`        | `62` ⑤·ii, `30`   | `30`, `62`, `64`    |
| `ReflectionSurface`    | RGBA16F   | half        | `30`        | —                 | `30` resolve        |
| `AccumulationSurface`  | RGBA16F   | display     | `64`        | —                 | `64` next rotation, `66` |
| `DisplaySurface`       | display   | display     | `66`        | `26`, `80`, `14`  | presentation        |
| `OutlineSurface`       | R8        | display     | `26`        | —                 | `26` composite      |
| `TransmittanceSurface` | RGBA16F   | 256 × 64    | `28`        | —                 | `28`, `18`          |
| `MultiScatterSurface`  | RGBA16F   | 32 × 32     | `28`        | —                 | `28`                |
| `SkyViewSurface`       | RGBA16F   | 192 × 108   | `28`        | —                 | `18`, `30`          |

The three atmosphere targets are resident and total **298 KiB** — 128 + 8 + 162. They are not transient and are
not rebuilt per rotation; see `28` §4. The previous figure of 217 KB was arithmetic error, recorded as `00` §10
conflict 42.

🔴 `DirectOcclusionSurface` is RGBA8 and its packed capacity is therefore **four illuminants**, declared in
`Contract/`. It was R32 UI, which pinned the capacity to a number nobody had chosen while `44` §9 and `60` §9
both carried it as open — and R32 UI gives one bit per illuminant at thirty-two, which cannot express the
penumbra `60` §3.2 requires. Eight bits per illuminant is a visibility fraction, which is what `18` reads.

🔴 `TransmissionIndex` holds K packed depth-and-identity pairs per pixel, sorted nearest-first, K declared in
`Contract/`. It exists because `62` §3 ① instructed a reader to "collect the transmissive occupants whose extent
reaches the pixel" and nothing in the target set could answer that: `VisibilityIndex` holds one identity and
`DepthSurface` one depth, both post-resolution. Recorded as `00` §10 conflict 32.

🔴 The **Amended by** column exists because §6's gate — "no shared target is produced by two recordings" — was
false the moment it was written. `30` §5 resolves its traced radiance back into `RadianceSurface`, which `18`
produced. The gate was unenforceable and would have been deleted rather than satisfied.

A target therefore declares **one producing recording and an ordered list of amending recordings**. A producer
writes the target's whole extent and depends on nothing previously in it. An amender reads what is there and
writes a modification of it, and its position in the list is part of the declaration — `26`'s outline before
`80`'s overlays before `14`'s interface is not a preference, it is which of them the artist sees on top.

⚠️ `MotionSurface` is written by `16` because motion is a property of the resolved surface and is free at
resolution time. Deriving it later from depth reprojection is wrong for anything that moved, which is precisely
the population `64` needs it for.

## 3. Ordering

✔️ Ordering done — derived from the declared reads and writes in two phases, scene-referred exhausted before
display-referred, refusing rather than emitting an ordering that drops a recording. §3.1's display-referred line
and §3.2's split recordings are both enforced by the `DisplayReferred` phase.

```
  ┌─ ①  28  SkyAtmosphere ───────── conditional; rebuilds only on change
  │
  ├─ ②  16  VisibilityIndex ─────── DepthSurface, VisibilityIndex, OccupancySurface, MotionSurface
  │                                  and material classification, incl. the unoccupied class
  │
  ├─ ③  60  OcclusionProjection ─── OcclusionSurface, DirectOcclusionSurface
  │
  ├─ ④  18  ReflectanceIntegrator ─ RadianceSurface        ← unoccupied class samples SkyViewSurface
  │
  ├─ ⑤·i 62 TransmissionSequence 1 ─ TransmissionIndex     ← bounded sorted insertion, no depth write
  │
  ├─ ⑤·ii 62 TransmissionSequence 2 ─ amends RadianceSurface ← reads TransmissionIndex, back to front
  │
  ├─ ⑥  30  SpecularProjection ──── ReflectionSurface, then exact-composite into RadianceSurface
  │
  ├─ ⑦  64  SampleIntegrator ────── AccumulationSurface    ← reads MotionSurface to reproject
  │
  ├─ ⑧  66  DisplayProjection ───── DisplaySurface         ← exposure, tone map, OETF
  │                                  ── everything below this line is display-referred ──
  ├─ ⑨  26  IntersectionOutline ─── amends DisplaySurface  ← reads VisibilityIndex + 42
  │
  ├─ ⑩  80  OverlayProjection 1 ─── amends DisplaySurface  ← depth-tested aids, reads DepthSurface
  │
  ├─ ⑪  80  OverlayProjection 2 ─── amends DisplaySurface  ← depth-independent manipulators
  │
  ├─ ⑫  14  InterfacePanel ──────── amends DisplaySurface  ← ImGui
  │
  └─ ⑬      present
```

`28` is first because `18` reads its sky-view radiance for the ambient term. This is the forward reference
declared in `00` §9, and it is not circular: `28` reads nothing produced in the same rotation.

### 3.1 The display-referred line

🔴 The line after ⑧ is the most consequential ordering statement in this document. Above it, values are radiance
and arithmetic on them is physical. Below it, values are display code and arithmetic on them is presentation.

`26` was previously placed at ⑤ — before tone mapping — which meant the selection outline was tone-mapped along
with the scene. A fixed outline colour then changed with exposure, and at high exposure the outline that exists to
be unmistakable becomes the same white as everything around it. Selection presentation, overlays and the interface
are all display-referred, all after ⑧, and none of them is ever passed through a tone map.

### 3.2 Why the overlays are two recordings

⚠️ `62` likewise contributes **two** recordings and they cannot be merged, for the same reason `80`'s cannot: a
recording that both accumulates a per-pixel ordered set and consumes it has read a target it is still writing.
⑤·i writes `TransmissionIndex` and amends nothing; ⑤·ii reads it and amends `RadianceSurface`. Neither writes
`DepthSurface`, per `62` §6.

⚠️ `80` contributes **two** recordings, not one, and they cannot be merged.

| Recording | Depth  | Contents                                                            |
|-----------|--------|----------------------------------------------------------------------|
| ⑩         | Tested | Ground lattice, guides, wireframe, seam display, surface annotation |
| ⑪         | Free   | Transform manipulator, its axes and screen-space controls, pivot     |

A grid that ignores depth is drawn over the object standing on it, and the artist loses every cue about what is
in front of what. A manipulator that respects depth disappears inside the object it manipulates, and the artist
cannot grab an axis on a surface they are standing inside.

Both are correct behaviours and they are opposite. One recording cannot hold both, because depth testing is
recording state and not a per-primitive decision — which is why this is an ordering fact declared here rather
than a detail inside `80`.

🔴 Neither recording writes `VisibilityIndex`, and nothing they draw is ever an occupant — `16` §6 gates this from
the other side. An overlay in the visibility index would be picked by `74`, outlined by `26`, and shaded by `18`.

## 4. Transitions

🚧 Unbuilt — no layout transition is derived. When it is, the orderer derives every one from the declared reads
and writes; a recording that transitions a shared target itself has made a claim the orderer cannot see, and the
next reordering breaks it silently.

## 5. Capability Degradation

🚧 Unbuilt — no substitution is executed. The three declared substitutions stand.

| Capability absent   | Recording affected | Substitution                                   |
|---------------------|--------------------|-------------------------------------------------|
| Compute raster path | `16`               | Hardware raster only for all partitions        |
| Half-precision store| `28`, `30`         | Full precision; extents unchanged, memory doubles|
| Timestamp queries   | `HardwareMetrics`  | Metrics report unavailable, not zero            |

⚠️ Unavailable is not zero. A metric that reports zero when it could not be measured produces a performance
report that is confidently wrong.

## 6. Gates

- **Gate:** Every recording declares reads, writes, command and — where applicable — a substitution.
- 🔴 **Gate:** Every shared target declares exactly **one** producing recording and an **explicit ordered list** of
  amending recordings. A recording that writes a target it is not declared to produce or amend is rejected at
  bring-up.
- **Gate:** No contributing document issues a layout transition directly.
- **Gate:** No document invents a target already listed in §2.
- **Gate:** The order in §3 is derived from declared reads and writes, not hand-written.
- **Gate:** Nothing scene-referred is recorded after ⑧, and nothing display-referred before it.
- **Gate:** `80` contributes two recordings whose depth behaviour differs; neither is merged into the other.
- **Gate:** `Frame`, `Pass`, `Stage` and `Pipeline` appear in no identifier here.

## 7. Open

| Open question                                                       | Blocks                    |
|----------------------------------------------------------------------|----------------------------|
| Whether `ReflectionSurface` stays half extent at high display extents | `30` quality tuning        |
| Whether `OcclusionSurface` stays half extent                          | `60` quality tuning        |
| Whether ⑩ and ⑪ share one recording with two depth states             | Recording count only       |

⚠️ "Whether `26` needs its own surface or can pack into `OccupancySurface`" is **closed** — it needs its own, and
`OccupancySurface` is unavailable to it in any case: `26` now runs at ⑨, display-referred, where a target `16`
produced for material classification is not a place to write presentation.
