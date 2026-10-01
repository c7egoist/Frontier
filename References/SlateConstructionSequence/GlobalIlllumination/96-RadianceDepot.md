# 96 — RadianceDepot

A path traced from a primary surface leaves the screen almost immediately. What it meets there is either stored or
invented, and `96` is where it is stored: radiance keyed by the world position and orientation it was measured at,
accumulated across rotations, decayed when stale, and reconstructible from nothing.

`Depot` is the exact suffix — "a store of derived, evictable, reconstructible artefacts **keyed by content**". Every
clause of that definition is load-bearing here, and the key is the content: a quantised position and orientation,
never a slot anybody allocated.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                            |
| Layer       | `Layer4_Compute`                                                              |
| Upstream    | `02` (rebasing), `06` (extents), `08` (ordering), `28` (the sky it falls back to), `94` (what injects), `104` (the sequence) |
| Downstream  | `94` §6 ④ reads it on a traced miss; `100` §5 reads it for the screen-traced indirect |
| Unblocks    | Indirect light that survives leaving the screen                              |

## 1. What Is Keyed, And By What

One entry holds accumulated outgoing radiance at a quantised position, in a quantised orientation cone.

| Component of the key      | Quantised by                                              |
|---------------------------|------------------------------------------------------------|
| World position            | A cell extent that grows with distance from the camera     |
| Surface orientation       | A small fixed set of cones over the sphere                 |

🔴 The cell extent **grows with camera distance** rather than being uniform. A uniform extent fine enough for
contact-scale bounce near the camera is a store that cannot span a scene; one coarse enough to span the scene
leaks light through anything thinner than a cell. Growing it with distance makes the store's resolution track the
resolution the artist can actually see, which is the same reasoning `16` §3 uses to select a raster path by
projected extent.

⚠️ The orientation cone is part of the key and not a stored direction. Two surfaces at one position facing
opposite ways carry different outgoing radiance, and keying position alone makes a wall bleed the colour of its
own far side.

🔴 The key is **content**, so nothing allocates an entry and nothing holds a reference to one. An entry that
cannot be found is recomputed by tracing, not repaired. This is what makes eviction free and what makes device
loss a non-event: the store is rebuilt by ordinary operation within a few rotations.

## 2. Occupancy And Eviction

The store is a fixed extent claimed at bring-up. Insertion resolves the key to a position within it; a collision
displaces the entry with the lower accumulated tally.

| Event                                     | Behaviour                                              |
|-------------------------------------------|---------------------------------------------------------|
| A key resolves to a vacant position        | The entry is written with a tally of one               |
| A key resolves to itself                   | Accumulated; the tally advances, saturating            |
| A key collides with a different key        | The lower tally is displaced — never the older         |
| An entry is untouched for the decay bound  | Its tally decays; at nothing it is vacant              |

🔴 Displacement is by **tally and not by age**. A well-converged entry the artist is looking at is older than a
one-sample entry from a camera angle they passed through, and evicting by age discards exactly the entry that cost
the most to produce.

⚠️ 💾 The occupancy is reported through `86`. A store running at saturation is thrashing — every insertion
displacing a converged entry — and it presents as indirect light that flickers without the artist changing
anything. It is a budget question with a visible symptom, which is `86` §4's own criterion for a reported measure.

## 3. Injection

`94` §6 ⑤ injects the shaded secondary vertex into the store on every traced path. That is the only writer.

🔴 What is injected is the **shaded outgoing radiance** at the secondary vertex, not the incident radiance and not
the albedo. Storing incident radiance would require every reader to know the surface's reflectance to use it, and
the reader is a ray that has already missed — it has no surface.

⚠️ Injection happens while `94`'s indirect recording is already tracing, in the same dispatch. It is not a
separate recording: a second recording would read the paths the first is still writing, which is `08` §3.2's rule
again, and the alternative — retaining every path for a later dispatch — is a wide intermediate extent nobody
declared.

## 4. Reading, And The Fallback Chain

| Reader                            | When                                            | On a miss                    |
|-----------------------------------|--------------------------------------------------|------------------------------|
| `94` §6 ④, a traced ray missed     | The ray left the structure                       | `28`'s `SkyViewSurface`      |
| `94` §6, a path exceeded its depth | The bounce ceiling was reached                   | The store, then the sky      |
| `100` §5, a screen march missed    | The march left the screen or the extremum chain  | The store, then the sky      |

🔴 The chain terminates at `28` and never at a constant zero. `18` §5's ambient sources are the sky-view radiance
or the constant floor, and this store sits **in front of** that pair rather than replacing it. A miss that
resolved to nothing would darken exactly the geometry that faces away from everything, which is where indirect
light is the only light.

⚠️ A single bounce is the declared depth. A path that would bounce again reads the store instead, which is what
makes the store an approximation of infinite bounces at the cost of one — and what makes light energy grow slowly
if the decay is too slow. §7 carries that as an open row.

## 5. Paint Invalidation

🔴 A stroke changes the albedo of a surface whose radiance this store may hold, and the store's entries are keyed
by world position rather than by occupant. A key cannot be resolved to the occupant that produced it.

| Response considered                          | Verdict                                              |
|----------------------------------------------|-------------------------------------------------------|
| Store the source occupant per entry          | Refused — four bytes per entry for one invalidation   |
| Discard the whole store on any stroke         | Refused — continuous painting never accumulates       |
| 🔴 Accelerate the decay of every entry the stroke's extent reaches | **Adopted** — §5.1               |

### 5.1 Extent-bounded decay

The stroke's world extent is known: `22` commits it, and `40` §3 already answers "which occupants does this extent
reach" as a host-side traversal for `74`'s marquee. Entries whose keys fall inside that extent have their tallies
reduced rather than vacated.

🔴 Reduced and not vacated. A vacated entry produces a rotation of black indirect light in the painted region,
which the artist reads as the stroke having darkened the scene. A reduced tally makes the next few injections
dominate the accumulation, so the colour migrates over three or four rotations — which is faster than the artist
can complete the next stroke.

⚠️ This is coarser than `92` §4.1's per-occupant discard and deliberately so. `92`'s reservoirs are screen-space
and can be discarded exactly; this store is world-space and cannot, so the mechanism it gets is the one its key
structure admits rather than a more precise one imported from a document whose key structure is different.

## 6. Precision

| Computation                     | Tier | Reason                                                            |
|---------------------------------|------|--------------------------------------------------------------------|
| Key quantisation                | A    | Two positions must resolve to one key identically on host and device |
| Position rebasing before quantisation | B | `02` §3.2; a key quantised from an unrebased position is a key that disagrees at distance |
| The stored radiance             | D    | It feeds `18`'s ambient term, which is Tier D                     |
| Tally and decay arithmetic      | A    | Integers                                                          |

🔴 Key quantisation is Tier A and lives in `Shared/`, registered with `ParityRunner`. `82` resolves previews on the
host and `94` injects on the device; a key that disagreed between them would have a preview reading a store it
never wrote to, and converging to a different image than the workspace — which is exactly the failure `64` §7's
Tier A offset row exists to prevent, in a different quantity.

## 7. Gates

- **Gate:** The key is content — a quantised position and an orientation cone — and nothing allocates an entry.
- **Gate:** The cell extent grows with camera distance.
- **Gate:** The orientation cone is part of the key.
- **Gate:** Displacement is by tally, never by age.
- **Gate:** The only writer is `94` §6 ⑤, in the same dispatch that traces.
- **Gate:** What is stored is shaded outgoing radiance, never incident radiance and never albedo.
- **Gate:** The fallback chain terminates at `28` or the constant floor, never at nothing.
- **Gate:** A stroke accelerates decay over its world extent; nothing is vacated and nothing is discarded whole.
- **Gate:** Key quantisation is `Shared/`, Tier A, and registered with `ParityRunner`.
- **Gate:** Positions are rebased in 64-bit before quantisation.
- **Gate:** Occupancy is reported through `86`.

## 8. Open

| Open question                                                              | Blocks                              |
|-----------------------------------------------------------------------------|--------------------------------------|
| The store's extent, and how occupancy scales with scene extent               | 💾 Budget; `86` reports saturation   |
| The decay bound, and whether it is per rotation or per second                | 🔴 Energy growth if too slow         |
| How the cell extent grows with distance — linear, or by projected extent     | Quality; `16` §3's precedent suggests projected |
| The orientation cone count                                                   | Leaking against extent               |
| Whether the stroke decay factor is declared or derived from the stroke's opacity | Tuning                          |
