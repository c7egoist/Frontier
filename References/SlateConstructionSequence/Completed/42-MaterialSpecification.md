# 42 — MaterialSpecification

A material declares what a surface's channels are and where each one's value comes from. `18` integrates twenty
channels across eight reflectance models; this document is what tells it which twenty values to read and which of
the eight to run.

It also owns the resolution `00` §10 conflict 15 recorded: `16`'s `VisibilityIndex` holds a **partition identity**,
not an occupant. Turning that identity into an occupant, a material and a domain position is stated here.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `10` (`PropertySpecification`), `36` (colour)                                |
| Downstream  | `16` (partition identity), `18` (every channel), `56`, `58`, `62`, `50`      |
| Unblocks    | Channels that `16` can classify and `18` can read                            |

## 1–7. Discharged

✔️ Done — the twenty channels, the eight reflectance selections with their inventory as a bit mask, the five
sources and five measures, per-material cutout threshold and enrolment, retention of channels an unselected
reflectance does not read, `MaterialIndex` with a declared ceiling, and `PartitionResolutionIndex` issuing
generational identities that stale on rebuild.

✔️ §2's absent-is-not-zero rule and §3's no-inference rule both enforced at `DeclareChannel`, which refuses a
colour without a space and a default outside its own interval.

🔴 `Absent` is not zero. A material with no occlusion channel is fully unoccluded and one with no transmission
channel is opaque; a channel defaulted to zero produces surfaces that are black or invisible, and the artist reads
that as a broken material rather than as a missing declaration.

🔴 There is no inference anywhere in the intake path — not the image's encoding, not its channel count, and not
its file name. Name-based inference is the mechanism by which one artist's naming convention silently becomes a
requirement of the program.

🔴 `PartitionResolutionIndex` is a **projection of the document**, rebuilt when the population changes and never
authored. Two sources of truth about which occupant a partition belongs to would disagree exactly when an occupant
was added, which is the moment the artist is looking at it. This is `00` §10 conflict 15's resolution.

⚠️ A material is shared by identity and the `56` layer sequence beneath a layered channel belongs to the surface,
not to the material. Two occupants sharing a material and each painted differently is the ordinary case.

🚧 Nothing reads it yet — `16`, `18` and `26` are unbuilt, so §4's resolution has no consumer and §5's
per-partition read does not happen.

## 8. Gates

- **Gate:** Every channel declares a source, a measure and a default.
- **Gate:** An absent channel resolves to its declared default, which is not assumed to be zero.
- **Gate:** Colour conversion reads the declared measure and never infers from encoding or file name.
- **Gate:** `PartitionResolutionIndex` is derived from the population and is never authored.
- **Gate:** `18` and `26` resolve partition identity through the same index.
- **Gate:** Model selection is per material, never per texel.
- **Gate:** Channels for an unselected model are retained.
- **Gate:** A material is shared by identity; painted content is not shared with it.

## 9. Open

| Open question                                                        | Blocks                          |
|-----------------------------------------------------------------------|----------------------------------|
| PBR channel bit depths and slot layout                                | `00` §12; `18` implementation    |
| Whether a material may declare channels beyond `18`'s twenty          | `18` §10                         |
| Whether material presets ship, and where they live                    | `50` and `48` only               |
