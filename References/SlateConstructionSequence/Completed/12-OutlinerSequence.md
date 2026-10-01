# 12 — OutlinerSequence

An outliner is a depth-first linearisation of a nesting relation over a generationally versioned slot population.
It is not a widget with rows. The rows are the visible consequence; the mechanism is the linearisation, and it is
a first-class engine subsystem that the interface happens to display.

The central design decision, and the one that cannot be deferred: there are **two nesting relations over the same
population, not one**. Organisational containment — how the artist has grouped things — and kinematic containment
— what moves when something moves — are different relations. Deriving either from the other terminates in a
transform-override bolt-on, and that bolt-on is a rewrite rather than a patch.

## Position In The Sequence

| Field       | Value                                                                            |
|-------------|-----------------------------------------------------------------------------------|
| Units       | `SlateDocument.lib` (the relations and linearisation), `SlateUI.lib` (presentation) |
| Layers      | `Layer3_Document`, `Layer5_Interface`                                             |
| Upstream    | `02` (transforms, containment predicate), `10` (population, properties, revisions)  |
| Downstream  | `14` presents rows; `16` culls by the kinematic relation; `26` outlines the selection |
| Unblocks    | Scene navigation, selection, grouping, anything that moves with something else     |

## 1–8. Discharged

✔️ Both relations done — `SceneStructure` holds `EnclosureContains` and `AttachmentFollows` separately, with
gapped interval labelling, escalating relabel where a gap is exhausted, and downward transform compounding from
each attachment root.

✔️ Linearisation done — `RowSequence` walks depth-first without recursion; `RankIndex` answers both scroll
questions by binary-indexed count, collapsed enclosures excluded from the count and not removed from the sequence.

✔️ Subsets done — `EnrollmentIndex` compresses by interval and refuses mutually exclusive enrolment before
writing. `TrigramIndex` narrows by the rarest run and confirms exactly.

✔️ The tick order done — ①–⑦ in `Reconcile`, with narrowing derived at ⑦ against final rows and renames
re-entered in the same tick.

✔️ Invariants done — 3, 4, 5 and 6 checked; 1, 2, 8 and 9 structural. §6's 108-byte budget is a `static_assert`.

✔️ Presentation done — `OutlinerPanel` reads through `RankIndex`, submits only the counted span, anchors the
scroll on an occupant, and writes every gesture back as declared intent.

🔴 `AttachmentFollows` is the transform-composition relation. `EnclosureContains` never composes a transform. A
row indented under another row does not, by that fact alone, move with it.

⚠️ Kinship vocabulary is banned throughout: no `Parent`, `Child`, `Sibling`, `Ancestor`, `Descendant`, `Orphan`.
Say enclosing occupant, enclosed occupant, enclosure depth, attachment root. `MembershipRegion` and
`MembershipIndex` are retired spellings; the mechanism is enrollment.

## 9. Gates

- **Gate:** The two relations are separately stored and separately reconciled.
- **Gate:** `EnclosureContains` composes no transform.
- **Gate:** Enclosure containment is answered by interval comparison, not traversal.
- **Gate:** All ten invariants hold at every tick boundary.
- **Gate:** The presentation half stores no relation state.
- **Gate:** Every mutation arrives as a transaction — document subsets through `RevisionSequence`, selection
  through `SelectionSequence`. There is no unrecorded mutation.
- **Gate:** Retiring an occupant commits its entire cascade as one transaction.
- **Gate:** A rename re-derives `TrigramIndex` within the same tick.
- **Gate:** A relation change that would create a cycle is rejected at commit and reported through `86` as a
  Refusal, naming both occupants, never applied.
- **Gate:** No kinship word appears in any identifier.

## 10. Open

Carried from `02-OutlinerPlan.md` §18 with the recommendation stated. Each is a real decision, not a placeholder.

| Open question                                             | Recommendation                          | Blocks       |
|-----------------------------------------------------------|------------------------------------------|---------------|
| Gap size for interval labelling                          | Sized to expected enclosure width       | Tuning only   |
| Whether attachment may cross enclosure boundaries        | Yes — the reason for two relations      | Nothing       |
| Multi-enrollment in mutually exclusive subsets           | Rejected at commit, not resolved        | `14` feedback |
| Whether row narrowing is a subset or a predicate         | Subset — already interval-shaped        | `14` only     |

🚧 One further open edge: `10` §2.4's merge interval is declared and no outliner intent yet declares itself
mergeable.

## 11. Subsets And Revision

✔️ Routing done — selection through `SelectionSequence`, the other three subsets through `RevisionSequence`, and a
scrub restores both together.

🔴 Every subset mutation is a transaction, without exception; what differs is **where** it is recorded. Selection
survives for the session and not across save and load — `48` §2 rules it session state, because a document
reopening with someone else's selection has restored a decision the artist had already finished making and the
first stroke lands on the wrong occupant. Recorded as `00` §10 conflict 34.

## 12. Retirement Cascade

✔️ Done — one transaction carrying the whole cascade, with enclosed occupants re-enclosed by the retiring
occupant's enclosure rather than retired with it.

🔴 Deleting a group deletes the group, not the work inside it. Deleting the contents is a separate instruction the
artist gives deliberately. The cascade rows binding unbuilt documents stand: `56` retires its layers, `20`
reclaims tiles after the recording slot count, `16` and `42` derive their partitions again, and placed content retires
with its enclosure per `00` §10.1.
