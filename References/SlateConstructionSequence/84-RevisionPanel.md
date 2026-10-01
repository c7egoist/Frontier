# 84 — RevisionPanel

`10` §2.3 declares `RevisionSequence` scrubbable in both directions and `10` §2.4 declares that every transaction
carries a description supplied at Open. Neither of those properties reaches the artist until something presents
them. This document is that presentation: the sequence made visible, navigable and truthful about what it holds.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateUI.lib`                                                                 |
| Layer       | `Layer5_Interface`                                                            |
| Upstream    | `10` (`RevisionSequence`, the lifecycle), `12` (selection), `48` (sessions), `76` |
| Downstream  | `14` presents it as `RevisionPanel` — `14` §1                                 |
| Unblocks    | Undo the artist can see and scrub                                             |

## 1. The Components

| Component               | What it owns                                                            |
|-------------------------|--------------------------------------------------------------------------|
| `RevisionPanel`         | The presented sequence and the position within it                       |
| `RevisionRowSequence`   | One presented row per transaction, in sequence order                    |
| `ScrubSpecification`    | Moving the position, in both directions — §3                            |
| `RevisionMetrics`       | Sequence length and extent held, for `86`                               |

🔴 This document **presents and stores nothing**. `10` owns the sequence, the transactions, their inverses and
the position. `14` §1 states the rule for every panel and this is the panel where breaking it would be most
tempting: a presented sequence that held its own row list would drift from the sequence the moment a transaction
merged.

## 2. What A Row Presents

| Presented            | From                                                              |
|----------------------|--------------------------------------------------------------------|
| Description          | `10` §2.4's description, supplied at Open                         |
| Position             | The transaction's position in `RevisionSequence`                  |
| Whether it is applied| Whether the current position is at or beyond it                   |
| What it addressed    | The occupant or surface, resolved through `10` §2.1's identity    |

⚠️ A transaction with no description is presented by its operation name, per `10` §2.4. That is a legible
fallback and not an acceptable default — an artist reading "AmendPropertySpecification" thirty times is reading
the mechanism's spelling instead of their own work, and every such row is a missing description at the Open site.

🔴 Merged transactions present as **one** row. `10` §2.4 merges typed characters and repeated nudges into one
transaction, and a panel that presented the constituents would present states the sequence cannot be scrubbed to.

## 3. Scrubbing

The position moves backward by replaying inverses and forward by replaying forward operations, per `10` §2.3.
Moving several positions at once replays each in order; nothing is skipped and no snapshot is restored.

| Movement                        | Behaviour                                                    |
|---------------------------------|---------------------------------------------------------------|
| One backward                    | The current transaction's inverse is replayed                |
| One forward                     | The next transaction's forward operation is replayed         |
| To a position                   | Every intervening transaction is replayed, in order          |
| Drag along the sequence         | One `10` §2.4 lifecycle — Open, Amend, Seal on release       |

🔴 A scrub drag is itself an interactive edit and uses `10` §2.4's lifecycle. It is **not** recorded as a
transaction — scrubbing to position twelve and back is not an edit, and an undo sequence that recorded its own
navigation is one no artist can reason about.

⚠️ Replay is bounded by what each transaction touched. `22` §4's extent-bounded inverse is the case that makes
scrubbing through a hundred strokes affordable at all; a replay that restored whole surfaces would make the
scrub bar an ornament.

### 3.1 Amending after scrubbing back

An artist who scrubs back and then makes a new edit has branched. Slate does not hold branches.

| Behaviour                        | What happens                                                |
|----------------------------------|--------------------------------------------------------------|
| Scrub back, then edit            | Transactions after the position are discarded; the new one is appended |
| Presented before it happens      | The panel presents the rows that will be discarded            |

🔴 The discard is **presented before it happens**, not reported after. Losing thirty transactions is the single
most destructive thing this panel can do and the artist has to see the count before it is done, not read about
it afterwards.

## 4. What Is Not In The Sequence

`14` §4.1 declares that non-document state is not committed as a transaction, and this panel is where that
declaration becomes visible. Nothing in the table below produces a row.

| Not a row                                 | Owner |
|-------------------------------------------|--------|
| Active tool, its parameters, the colour   | `76`  |
| Display mode and overlay presence         | `76`  |
| Panel layout, scroll, expansion           | `14`  |
| An open transaction, before Seal          | `10`  |
| A speculative extent — `22` §4.1          | `82`  |

🔴 Selection is the deliberate exception and it is `12` §11's ruling, not a new one here: `SelectionSequence` is
revised **separately**. Selection changes do not appear in this panel, and undo does not step back through them.

⚠️ An open transaction is absent until Seal, per `10` §2.4. During a stroke the panel presents the state before
the stroke, and the new row appears when the artist lifts the stylus. A row appearing per pointer sample is the
defect `10` §2.4 exists to prevent, presented.

## 5. Across A Session

`48` owns opening, saving and recovery. This panel presents what `48` leaves in the sequence.

| Situation             | Presented                                                             |
|-----------------------|------------------------------------------------------------------------|
| Document opened       | Whatever `48` restored — an empty sequence if it restored none         |
| Document saved        | A marker at the saved position, so unsaved work is visible as rows past it |
| Recovered             | The recovered sequence, with the recovery point marked                 |

🔴 The saved position is marked, and it is the only thing in this panel that is not a transaction. An artist who
cannot see which rows are unsaved cannot tell what a crash would cost them, and `48`'s recovery is only as useful
as the artist's ability to see what it recovered.

## 6. Precision

| Computation                  | Tier | Reason                                                       |
|------------------------------|------|---------------------------------------------------------------|
| Sequence position            | A    | An integer ordinal; scrubbing to an approximate position is not scrubbing |
| Transaction identity         | A    | `10` §2.1's integer pair                                      |
| Occupant resolution for a row| A    | A generational compare; a stale reference presents as absent  |

⚠️ Nothing here is continuous. This is the only document in the series whose precision table has no Tier B row,
and that is the correct shape for a panel over an integer-ordered sequence.

## 7. Gates

- **Gate:** This panel stores nothing; `10` owns the sequence and the position.
- **Gate:** Every row presents `10` §2.4's description, or the operation name where none was supplied.
- **Gate:** Merged transactions present as one row.
- **Gate:** Backward movement replays inverses; nothing is restored from a snapshot.
- **Gate:** A scrub drag uses `10` §2.4's lifecycle and is never itself a transaction.
- **Gate:** Editing after scrubbing back discards the transactions past the position, and the discard is presented first.
- **Gate:** No non-document state of `14` §4.1 produces a row.
- **Gate:** Selection is revised separately per `12` §11 and produces no row.
- **Gate:** An open transaction produces no row until Seal.
- **Gate:** The saved position is marked, so unsaved work is visible.

## 8. Open

| Open question                                                             | Blocks                          |
|----------------------------------------------------------------------------|----------------------------------|
| Whether the sequence is bounded, and by count or by extent held             | `10` §5 carries the same row     |
| Whether a discarded branch is retained for the session                      | Memory; `10` §5's bound          |
| Whether rows group by occupant as well as by position                       | Presentation only                |
| Whether scrubbing presents a preview before committing the movement         | `82` speculative extent          |
