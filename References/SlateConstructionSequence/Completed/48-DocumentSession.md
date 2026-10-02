# 48 — DocumentSession

`10` declares what a document **is**. This document declares what happens to it across time: opening, saving,
recovering after a crash, holding more than one at once, and what a saved file is allowed to depend on that is not
inside it.

The gate this document has to meet is not a format. It is that an artist who loses power mid-stroke does not lose
their afternoon.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                          |
| Layer       | `Layer3_Document`                                                            |
| Upstream    | `04` (`StorageExchange`, `FileInterchange`), `10` (population, revisions), `34` |
| Downstream  | `32` (bring-up), `14`, `50`, `56`, `76`, `84`, `86`                          |
| Unblocks    | Open, save, recover; not losing work                                         |

## 1. The Components

| Component             | What it owns                                                        |
|-----------------------|----------------------------------------------------------------------|
| `DocumentSession`     | One open document and everything true of it only while it is open   |
| `SessionIndex`        | Every open session; which one the interface is presenting           |
| `PersistenceSequence` | Write, verify, replace — §3                                         |
| `RecoverySequence`    | The journal, and replay from it — §4                                |
| `ReferenceIndex`      | What the document depends on outside itself — §5                    |

## 2. What Is In The Document And What Is In The Session

| Held in the document        | Held in the session only            | Held in neither      |
|-----------------------------|--------------------------------------|-----------------------|
| The population, per `10`    | The storage location                 | The display space     |
| `RevisionSequence`          | Whether it has unsaved amendments    | Device residency      |
| The working space — `36`    | `SelectionSequence` — see below      | `20`'s resident tiles |
| Exposure and cameras — `46` | Which camera is presented            | `82`'s previews       |
| Enrollment, per `12`        | Outliner expansion and scroll        | —                     |

🔴 `SelectionSequence` is session state, not document state. `12` §11 revises it separately from the population
for the same reason: a document that reopens with someone else's selection restored has restored a decision the
artist had already finished making, and the first stroke lands on the wrong occupant.

⚠️ The third column exists to be checked against. Anything derived — residency, previews, subdivisions, the
conditioning companions in `38` — is re-derivable from the first column and is therefore never written into the
file. A saved derivation is a saved opportunity for the file to disagree with itself.

## 3. Saving Is Write, Verify, Replace

🔴 The existing file is not touched until a complete replacement has been written and read back.

| Step | Action                                                    | On failure                       |
|------|-----------------------------------------------------------|-----------------------------------|
| ①    | Write the full document to a new location                 | Nothing is lost; report          |
| ②    | Read it back and verify it against what was written       | The new file is discarded        |
| ③    | Replace the old file with the new one, atomically         | The old file survives            |
| ④    | Retire the journal entries the save subsumes — §4         | Replay is merely redundant       |

Writing in place is the mechanism by which a full disk, a lost network share or a power loss converts a good file
into no file at all. The artist's previous save is their fallback, and the save operation must not be the thing
that destroys it.

Saving runs through `34` at `Interactive` priority. It reads a **sealed** state: `10` §2.4's open transactions are
not written, because a half-finished drag is not a state the artist asked to keep.

⚠️ Saving does not block the tick. A document large enough that writing it stalls the display is a document the
artist stops saving, and then the recovery journal is all that stands between them and the loss.

## 4. Recovery

`RecoverySequence` appends to a journal as transactions Seal. It is not a copy of the document; it is
`RevisionSequence`'s tail since the last save, which is bounded by what the transactions touched rather than by
the document's size.

| Situation                                | On next open                                       |
|------------------------------------------|-----------------------------------------------------|
| The application exited cleanly            | The journal is empty; nothing is offered           |
| The journal has entries past the save     | Recovery is offered, and named — §4.1              |
| The journal is unreadable past entry N    | Entries up to N are offered; the rest is reported  |
| The document itself is unreadable         | `50` and `86` report; no partial population opens  |

🔴 Recovery is **offered**, never applied silently. An artist who deliberately abandoned an experiment by closing
without saving must not have it handed back to them as though it were the file. The offer states what it is: the
saved file's timestamp, the journal's, and how many transactions separate them.

⚠️ A partially readable document does not open partially. Half a population presented as a document is a document
the artist will save over the whole one.

### 4.1 The journal is per document, not per application

Two documents open, one crashes the application: both journals exist, and each is offered against its own file.
A single journal covering the session cannot be replayed into one document without replaying it into the other.

## 5. What A Document Depends On Outside Itself

`ReferenceIndex` records every external dependency by identity, and every dependency declares whether it is
**embedded** or **referenced**.

| Content                        | Default    | Why                                                      |
|--------------------------------|------------|-----------------------------------------------------------|
| Painted layers — `56`          | Embedded   | Authored here; nothing else holds it                     |
| Imported imagery — `50`        | Referenced | Often large; often shared across documents               |
| Imported topology — `50`       | Referenced | Slate does not own it — `38`'s non-mutation rule         |
| Vector content — `52`          | Embedded   | Small, and pasted source has no file to refer to         |
| Typeface outlines — `52`       | Referenced | `00` §12 records the licensing question; see below       |

🔴 A missing reference is an **enrolled absence**, never a substitution. The occupant stays in the outliner,
reports what it was looking for, and is presented as missing. A document that quietly substitutes a default
texture for a missing one is a document the artist saves over with the defaults baked in.

⚠️ Typeface embedding is not settled — `00` §12 carries it, and it is a licensing question rather than a technical
one. What this document fixes is that the **choice is declared per document and recorded in the file**, so a
document made under one answer opens correctly under the other.

## 6. More Than One Document Is Open

`SessionIndex` holds every open session. `14` presents one at a time; `76` §6's open row — whether tool state is
per document or per application — is answered here.

🔴 Tool state is **per application**, not per session. The artist who sets a brush size and switches document is
expressing a preference about how they are working, not about that file; a per-document brush means the same
gesture produces a different stroke depending on which tab is in front.

Document state — camera, selection, enrollment, revisions — is per session, because those are statements about
the work and not about the artist.

## 7. Version Migration

`10` §1's rule stands unamended: a document written by an earlier version is migrated on read by a declared
transformation between versions, never by a conditional inside a reader.

| Situation                        | Behaviour                                                     |
|----------------------------------|----------------------------------------------------------------|
| Older version                    | Migrated on read; the migration is reported through `86`      |
| Same version                     | Read directly                                                 |
| Newer version                    | Refused, with the version stated — never read partially       |

A newer document read by an older application is the one case where guessing is unrecoverable: the fields it does
not understand are dropped, and the first save makes the loss permanent.

## 8. Precision

| Computation                    | Tier | Reason                                                    |
|--------------------------------|------|------------------------------------------------------------|
| Identity and generation        | A    | `10` §2.1's integer pair; a collision is a wrong occupant |
| Stored coordinates             | A    | Written at the width they are held, never narrowed        |
| Verification comparison        | A    | Exact, byte for byte — §3 ②                               |

🔴 Nothing is narrowed on the way out. A document that stores 64-bit document-space positions at 32 bits has
performed `02` §3.2's rebasing permanently and without a view to rebase against, and the loss is not detectable by
reading the file back.

## 9. Gates

- **Gate:** Derived state is never written into the document.
- **Gate:** `SelectionSequence` is session state and is not restored on open.
- **Gate:** Saving writes, verifies and then replaces; the existing file is never written in place.
- **Gate:** Saving reads sealed state only; open transactions are not written.
- **Gate:** Saving runs through `34` and does not block the tick.
- **Gate:** A journal is kept per document and replayed only when offered and accepted.
- **Gate:** A partially readable document does not open partially.
- **Gate:** A missing external reference is an enrolled absence, never a substitution.
- **Gate:** Tool state is per application; document state is per session.
- **Gate:** A newer document version is refused, not partially read.
- **Gate:** Stored coordinates are never narrowed on write.

## 10. Open

| Open question                                                             | Blocks                         |
|----------------------------------------------------------------------------|---------------------------------|
| Whether a typeface is embedded on save or referenced                       | `00` §12; licensing            |
| The journal's write interval, and whether it is per transaction            | Tuning only                    |
| Whether conditioning results from `38` are stored or re-derived            | `38` §8 carries the same row   |
| Whether the document is one file or a directory of parts                   | `50` export layout only        |
| Whether a session may be presented in more than one window                 | `14` §4                        |
