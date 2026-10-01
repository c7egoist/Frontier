# 80 — OverlayProjection

Non-occupant geometry the artist needs to see: the ground lattice, guides, wireframe, seam display, surface
annotation, and the manipulator. `08` §3.2 rules that this is **two recordings** and gives the reason; this
document is what those recordings contain.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateCompute.lib` (recording), `SlateUI.lib` (what is enabled)              |
| Layers      | `Layer4_Compute`, `Layer5_Interface`                                          |
| Upstream    | `08` (order, targets), `16` (`DepthSurface`), `46`, `66`, `68`, `76`, `78`    |
| Downstream  | `14` records the interface over both                                          |
| Unblocks    | Non-occupant geometry the artist needs to see                                 |

## 1. The Two Recordings

| Recording | Depth  | Contents                                                            |
|-----------|--------|----------------------------------------------------------------------|
| ⑩         | Tested | Ground lattice, guides, wireframe, seam display, surface annotation |
| ⑪         | Free   | The manipulator from `78`, its axes and screen controls, the pivot  |

🔴 They cannot be merged, and `08` §3.2 states why: depth testing is recording state, not a per-primitive decision.
A ground lattice that ignores depth is drawn over the object standing on it; a manipulator that respects depth
disappears inside the object it manipulates. Both behaviours are correct and they are opposite.

⑩ amends `DepthSurface` as well as `DisplaySurface` — `08` §2 declares it — because depth-tested overlays occlude
each other. ⑪ amends neither.

## 2. Display-Referred

Both recordings run after `66` — `08` §3.1. Overlay colours are display code values, chosen for contrast against
display values, and are never passed through exposure or a tone map.

⚠️ An overlay written scene-referred converges to white with the scene as exposure rises. A wireframe that
disappears when the artist brightens the workspace is a wireframe that fails precisely when it is being used to
see something.

## 3. What Is Recorded

| Overlay            | Reads                             | Depth  |
|--------------------|-----------------------------------|--------|
| Ground lattice     | `46`'s camera                     | Tested |
| Guides             | The document's declared guides    | Tested |
| Wireframe          | `10`'s topology for the selection | Tested |
| Seam display       | `68`'s chart boundaries           | Tested |
| Surface annotation | Positions registered on a surface | Tested |
| Manipulator        | `78`                              | Free   |
| Pivot              | `78`                              | Free   |

Which overlays are present is held in `76` — `14` §4.1's table — not here and not in the document.

## 4. Never An Occupant

🔴 Neither recording writes `VisibilityIndex`, `OccupancySurface` or `MotionSurface`. `16` §6 gates this from the
other side, and the consequences of breaking it are three separate defects: an overlay in the visibility index
would be picked by `74`, outlined by `26`, and shaded by `18`.

Overlay intersection, where it exists at all, is handled by whoever owns the overlay — the manipulator's handles by
`78` §4, guides by the tool that placed them. It is never `74`'s traversal.

## 5. Gates

- **Gate:** Two recordings, at `08` §3 ⑩ and ⑪, with differing depth behaviour; neither is merged.
- **Gate:** Both are display-referred and are never tone-mapped.
- **Gate:** ⑩ amends `DepthSurface`; ⑪ amends no depth.
- **Gate:** Neither writes `VisibilityIndex`, `OccupancySurface` or `MotionSurface`.
- **Gate:** Overlay presence is read from `76`, never held here.
- **Gate:** No overlay is intersected by `74`.

## 6. Open

| Open question                                                    | Blocks                     |
|-------------------------------------------------------------------|-----------------------------|
| Whether the ground lattice fades by distance or by angle          | Nothing structural          |
| Whether wireframe follows the selection or is an explicit mode    | `76` holds it either way    |
| Whether ⑩ and ⑪ share a recording with two depth states           | `08` §7 carries this too    |
