# 72 — DecalProjection

Placed content is text, imagery or vector outlines positioned on a surface and remaining editable afterwards. The
four rulings that decide its behaviour are in `00` §10.1 and are **not** restated here — this document supplies the
mechanism those rulings govern.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateDocument.lib` (the placement), `SlateCompute.lib` (resolution via `70`) |
| Layers      | `Layer3_Document`, `Layer4_Compute`                                           |
| Upstream    | `00` §10.1, `10` (transactions), `12` (enclosure), `46`, `50`, `52`, `54`, `56` |
| Downstream  | `70` resolves it; `78` manipulates it; `26` outlines it; `12` presents it; `82` previews it |
| Unblocks    | Placed, re-editable text, imagery and vector content                          |

## 1. A Placement

| Field                 | Meaning                                                            |
|-----------------------|---------------------------------------------------------------------|
| Source                | The content — from `52`, `50` or `54`                               |
| Placing transform     | 🔴 Stored **relative to the surface it is attached to**             |
| Placement mode        | Domain or projected — see `00` §10.1 ①                              |
| Extent                | The placement's coverage on the surface, derived from the transform |
| Channel assignment    | Which of `18`'s twenty channels the source writes                   |
| Combine specification | How it composes with what is beneath — `22` §3                      |
| Revision counter      | Advanced only by `00` §10.1 ②'s third row                           |

🔴 The relative transform is what makes `00` §10.1 ②'s zero-cost rows true. Stored in document space, a placement
would need re-resolution every time its occupant moved, and the invalidation table would be a table of things that
always change.

A placement writes to declared channels, not to a surface generally. A logo that carries roughness as well as base
colour is one placement writing two channels, and undo restores both — the same rule `22` §5 states for strokes.

## 2. Placement Modes

`00` §10.1 ① rules three modes and rules that only two persist. The mechanism:

**Screen placement** is a gesture. While the pointer is down the placement is resolved through `46`'s current
camera and is a speculative extent under `22` §4.1 — display-only, never committed, never blocking eviction. On
release the camera at that instant is frozen into a projecting transform and the placement becomes projected. The
gesture never existed as a persistent mode.

**Domain placement** positions the source directly in the surface's parametric domain, in `82`'s domain view. It
crosses no chart seam because it is inside one chart, which makes it the only mode with no seam behaviour to
declare.

**Projected placement** carries a projecting transform, slide-projector style, attached to its occupant through
`AttachmentFollows`. It crosses chart seams freely, because it is defined in space and the domain is where it
lands.

⚠️ Seam crossing is the reason domain and projected placement are both needed rather than one being the general
case. A projected placement crossing a seam is continuous on the surface and discontinuous in the domain; a domain
placement is the reverse. An artist positioning a label on a chart wants the second and an artist projecting a
decal across a shoulder wants the first.

## 3. The Positioning Drag

A placement being positioned is an open transaction under `10` §2.4 — Open on the drag beginning, Amend as the
manipulator moves, Seal on release, Abandon on cancel. Between Open and Seal the placement is a speculative extent
under `22` §4.1: it resolves coarse, refines, is discarded and re-resolved per rotation, and pins no tile.

🔴 A positioning drag records **no** transaction until release. `10` §2.4 gives the reason: a transaction per
pointer sample fills `RevisionSequence` with states the artist never intended to stop at.

## 4. Containment And Ordering

`00` §10.1 ③ and ④ rule this and the mechanism follows from them exactly:

- A placement is enclosed under the occupant it is attached to, in a placement enclosure — so it appears in the
  outliner beneath the object it sits on, and `12` §12's retirement cascade retires it with that occupant.
- Enclosure order and layer order in `56` are the **same stored ordinal**. There is no second ordering.
- Text, imagery and vector placements interleave in that one order and carry a source marker. Reordering a row is
  one transaction against that ordinal.

⚠️ Presenting the three sources as three enclosures would impose the second ordering ruling ③ forbids, and would
hide cross-source order — which is exactly the ordering an artist is asking about when a text placement sits
behind an image.

## 5. Gates

- **Gate:** A placing transform is stored relative to the surface, never in document space.
- **Gate:** Screen placement resolves to a projected placement on release and never persists as a mode.
- **Gate:** A projected placement is attached through `AttachmentFollows`.
- **Gate:** A positioning drag is one open transaction, sealed on release.
- **Gate:** A placement in progress is a speculative extent and pins no tile.
- **Gate:** Enclosure order and layer order are one stored ordinal.
- **Gate:** Sources interleave in that order; no source becomes an enclosure.
- **Gate:** A placement resolves only through `70`; this document resolves nothing.
- **Gate:** A placement retires with the occupant it is enclosed under, in that occupant's cascade transaction.

## 6. Open

| Open question                                                        | Blocks                            |
|-----------------------------------------------------------------------|------------------------------------|
| Whether a placement may attach to more than one occupant              | `12` invariant 2 forbids it today  |
| Whether projected placement declares a backface rule                  | Quality; visible on thin geometry  |
| Whether a placement may be converted to painted texels deliberately   | Would be a one-way transaction     |
