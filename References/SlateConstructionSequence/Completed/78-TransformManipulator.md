# 78 — TransformManipulator

One manipulator moves, rotates and scales everything that can be moved — occupants, placements, illuminants,
cameras. `14` §4.2 gives it precedence 2 on the pointer and `00` §10.1 ① names it in the manipulation column of
all three placement modes.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateUI.lib` (intent), `SlateCompute.lib` (the drag resolution)             |
| Layers      | `Layer5_Interface`, `Layer4_Compute`                                          |
| Upstream    | `02` (transforms at Tier B), `10` §2.4 (lifecycle), `12` (attachment), `46`, `72`, `74`, `76` |
| Downstream  | `80` records it at ⑪; `12` receives its transaction; `72` is positioned by it |
| Unblocks    | Moving, rotating and scaling anything                                         |

## 1. One Manipulator, Several Targets

| Target            | Transform addressed                                              |
|-------------------|-------------------------------------------------------------------|
| An occupant       | Its own transform, composed downward through `AttachmentFollows`  |
| A placement       | Its placing transform, relative to the surface — `72` §1          |
| Several occupants | Each own transform, about one shared origin                       |
| A camera          | `46`'s projection origin                                          |

🔴 A placement is manipulated in the space it is stored in — relative to its surface — not in document space. The
manipulator is drawn in document space and the drag is projected back through the attachment before it is applied.
Applying it in document space would store an absolute transform and break `00` §10.1 ②'s zero-cost rows.

## 2. The Drag

A manipulation is an open transaction under `10` §2.4, and the correspondence is exact:

| `10` §2.4 | Here                                                       |
|-----------|-------------------------------------------------------------|
| Open      | The handle is grasped; the prior transforms are held        |
| Amend     | The pointer moves; transforms update; nothing is recorded   |
| Abandon   | Cancelled; the prior transforms are restored                |
| Seal      | Released; one transaction enters `RevisionSequence`         |

🔴 The drag resolves against a **plane or axis fixed at Open**, never re-derived per sample from the current
pointer position. Re-deriving it makes the manipulated object chase the cursor with increasing gain, which reads as
the manipulator being slippery rather than as the plane being wrong.

Pointer capture is held for the whole drag through `76` §3. A drag that began on a handle continues to address that
handle after the cursor leaves the workspace.

## 3. Constraint And Reference

| Constraint | Resolves against                                |
|------------|--------------------------------------------------|
| Axis       | One axis of the reference orientation           |
| Plane      | Two axes of it                                  |
| Screen     | The camera plane — translation and scale only   |
| Free       | The camera plane, with no axis displayed        |

| Reference orientation | Meaning                                            |
|-----------------------|-----------------------------------------------------|
| Document              | The document's own axes                             |
| Occupant              | The manipulated occupant's own orientation          |
| Surface               | The intersected surface's orientation — from `74`   |
| Placement             | The placement's own axes on the surface it sits on  |

⚠️ The surface reference is what makes placement manipulation usable. Dragging a decal along document axes moves it
off the surface; dragging along the surface reference slides it across the surface, which is what the gesture
means.

## 4. Where It Is Drawn

`08` §3 ⑪ — the depth-free overlay recording. `08` §3.2 gives the reason and it is not restated: a manipulator that
respects depth disappears inside the object it manipulates.

🔴 The manipulator writes no `VisibilityIndex`. `74` therefore cannot pick it as an occupant and `26` cannot
outline it. Handle intersection is a **separate** screen-space test performed here against the handles' own
geometry, at precedence 2 in `14` §4.2, before `74` is consulted at all.

## 5. Gates

- **Gate:** One manipulator addresses every manipulable target.
- **Gate:** A placement's drag is applied in the space it is stored in.
- **Gate:** The drag plane or axis is fixed at Open.
- **Gate:** A drag is one transaction, sealed on release, abandoned on cancel.
- **Gate:** Nothing is recorded between Open and Seal.
- **Gate:** Capture persists for the whole drag.
- **Gate:** The manipulator is recorded at `08` §3 ⑪ and writes no `VisibilityIndex`.
- **Gate:** Handle intersection is separate from `74` and precedes it.

## 6. Open

| Open question                                                          | Blocks                     |
|-------------------------------------------------------------------------|-----------------------------|
| Whether increment snapping is per tool or global                        | `76` holds it either way    |
| Whether multiple-selection scale is about a shared origin or each own   | Convention; artists differ  |
| Handle extent in display pixels at high display density                 | `14` scaling policy         |
