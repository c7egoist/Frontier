# 38 — TopologyConditioning

Slate paints; it does not model. `00` §5 declares topology editing absent and names this document as what stands
in its place. Imported topology arrives in whatever state its author left it, and painting on it requires
properties the author had no reason to provide.

🔴 Conditioning **derives**; it never mutates. The imported topology is retained exactly as it arrived, and every
property here is a derived companion to it. An importer that repairs its input is an importer whose output the
artist cannot reconcile with the file they gave it.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `02` (Tier A predicates), `10` (`TopologyStructure`), `34` (off the tick)     |
| Downstream  | `40`, `68`, `16`, `18`, `74`                                                  |
| Unblocks    | Imported topology that is fit to paint on                                    |

## 1–6. Discharged

✔️ Done — welding on an integer lattice at a relative tolerance, corner adjacency over welded positions,
orientation by `02` §4's exact predicate over the Newell dominant axis, area-weighted perpendiculars,
domain-derived tangent bases with per-vertex handedness, conservative outward extents, and all five degeneracy
conditions enrolled by interval rather than removed.

✔️ §4's retention rule done — a supplied basis is used as supplied; an absent domain leaves the basis absent
rather than substituted.

🔴 Every derived property is a **companion** in object space. The imported arrays are untouched and an index into
them means the same thing after conditioning as before, because removing a face renumbers everything after it and
every index the artist's file carried would then address the wrong one. Object space is why an occupant that moved
re-derives nothing, which `00` §10.1 ② depends on one layer up.

⚠️ Extents round **outward**. An extent rounded inward excludes geometry from `16`'s culling and from `40`'s
traversal, and the symptom is a surface that disappears at one camera angle.

🚧 Two open edges: conditioning is called directly rather than declared into `34`, and `DeriveWelding` and
`DeriveAdjacency` scan their run lists linearly, which is quadratic in run count. Both are recorded in the source.

## 7. Gates

- **Gate:** Imported topology is never mutated; everything here is a derived companion.
- **Gate:** An index into the imported arrays means the same thing after conditioning as before.
- **Gate:** Welding is by position at a relative tolerance, through `02` §4, never by index or exact equality.
- **Gate:** Degenerate geometry is enrolled and excluded, never removed.
- **Gate:** The tangent basis is derived from `68`'s domain, with handedness stored per vertex.
- **Gate:** An imported basis is used as supplied and not overridden by a derived one.
- **Gate:** Every derived property is in object space.
- **Gate:** Conditioning runs through `34`, and its result is applied on the tick as one transaction.
- **Gate:** Extents are conservative outward.

## 8. Open

| Open question                                                          | Blocks                        |
|-------------------------------------------------------------------------|--------------------------------|
| The welding tolerance relative to extent, and whether the artist sets it | `50` intake presentation      |
| Whether a smoothing declaration in the file overrides the derived one    | `50` format coverage          |
| Whether conditioning results are stored in the document or re-derived    | `48` document size            |
