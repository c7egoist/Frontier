# 34 — WorkSequence

Some things Slate must do take longer than one tick and cannot be made shorter. Unwrapping a chart partition,
conditioning imported topology, decoding a large image, resolving an export at an extent no one has resident —
each is seconds of work, and each must happen while the artist keeps painting.

This document is the one mechanism that runs such work off the tick. Nothing else in the series is permitted to
create a thread.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateMath.lib`                                                               |
| Layer       | `Layer1_Numeric`                                                              |
| Upstream    | `00`, `04` (threads, `TickSequence`)                                          |
| Downstream  | `38`, `50`, `68`, `20`, `24`, `70`, `82` — every long solve in the series     |
| Unblocks    | Long solves off the tick; cancellation and progress                           |

## 1–7. Discharged

✔️ Done, in full — the workers, the three priority queues with one worker reserved for `Interactive`, generational
work identity, cooperative cancellation distinguishing withdrawal from supersession, progress sampled rather than
pushed, conclusions ordered by declaration ordinal within a drain, and failures appended to `86` with their origin.

🔴 A work item reads inputs **immutable for its whole run**, applies its result on the tick through its requester,
never mutates the document, and never waits on another work item. Work with phases declares them as separate
items chained on the tick, where the chaining is visible.

🔴 A result must not depend on how many workers ran it or in what order they finished. A split solve recombines by
declared index and accumulates by `02` §5's ordered recombination — a sum in arrival order is a different number
each run at Tier B, and the difference shows up as a seam.

🚧 Two open edges remain: the worker count comes from the standard library rather than from `04`'s host report,
and no consumer yet declares work — `38`, `50`, `68`, `20`, `24`, `70` and `82` are all unbuilt.

## 8. Gates

- **Gate:** No thread is created anywhere in the repository except by `WorkSequence`.
- **Gate:** A work item's inputs are immutable for its whole run.
- **Gate:** No work item mutates the document, commits a transaction, or records into a device recording.
- **Gate:** Every result is applied by its requester, on the tick.
- **Gate:** No work item waits on another work item.
- **Gate:** At least one worker is reserved for `Interactive` work.
- **Gate:** A split solve recombines by declared index, never by completion order.
- **Gate:** A cancelled item reports cancellation; it never leaves its requester waiting.
- **Gate:** Progress is sampled by the tick, never pushed to it.

## 9. Open

| Open question                                                          | Blocks                       |
|-------------------------------------------------------------------------|-------------------------------|
| Whether worker count is host-derived or declared in settings            | Tuning only                   |
| Whether `Deferred` work runs at all on a machine under memory pressure  | `20` budget policy            |
| Whether a failed item retries, and how often                            | `86` reporting volume         |
