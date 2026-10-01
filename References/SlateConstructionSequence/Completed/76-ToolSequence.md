# 76 — ToolSequence

Everything an application holds that is not the document, and not a panel's own layout, is held here.
`14` §4.1 declares this and names `76` in its owner column; this document is what that column points at.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateUI.lib` (presentation and intent), `SlateCompute.lib` (read by resolution) |
| Layers      | `Layer5_Interface`, `Layer4_Compute`                                          |
| Upstream    | `04` (input), `36` (colour), `58` (brush declarations), `74` (intersection)   |
| Downstream  | `22` resolves strokes against it; `14` presents it; `82` previews it          |
| Unblocks    | Active tool and every parameter that is not a document                        |

## 1. Beside The Document, Not In It

🔴 Nothing here is a transaction. `14` §4.1 gives the reason: undo must not step back through a colour change. The
artist who picks a colour, paints, and undoes expects the stroke to disappear and the colour to remain.

| Held                                         | Read by             |
|----------------------------------------------|----------------------|
| The active tool and its parameters           | `14`, `76` itself    |
| The active colour                            | `22`, `82`, `14`     |
| The active brush and its resolved parameters | `22`, `82`, `14`     |
| Display mode and overlay presence            | `66`, `80`, `14`     |
| Channel display selection                    | `18`, `14`           |
| Pointer capture                              | `14`, `22`, `78`     |

⚠️ This is the mechanism behind the defect the artist meets in the first minute: picking a colour and finding the
brush unchanged. With no declared owner, `SlateUI` holds the colour, `SlateCompute` cannot read it, and the stroke
resolves against something else. Both units read it here.

🔴 That both units read it is why this is not simply "UI state". `SlateCompute` cannot link `SlateUI` — `00` §2 —
so the storage lives where both can reach it and the interface presents it rather than owning it.

## 2. Persistence

| State                      | Survives           |
|----------------------------|---------------------|
| Active tool and parameters | Application launch  |
| Colour and brush selection | Application launch  |
| Display mode               | Application launch  |
| Pointer capture            | Nothing — per drag  |

🔴 None of it is stored **in** the document. `14` §8 rules the same for panel layout and the reason is identical: session parameters do not travel with the scene file. Exposure is the opposite — an authored camera property stored in the document (`46` §6). Recorded as `00` §10 conflict 33.

## 3. Pointer Arbitration

`14` §4.2 declares the precedence and `32` §2 ② places arbitration in the tick. The state — who holds the pointer —
is held here, because the holder is read by `SlateCompute` (`22`'s stroke, `78`'s drag) and `SlateCompute` cannot
read `SlateUI`.

🔴 Capture persists for the whole drag, and releasing it is an explicit event. Re-arbitrating per sample is the
defect where a stroke stops the moment the cursor crosses a floating panel.

## 4. Tools

A tool declares its parameters through `PropertySpecification` from `10` §2.2 — typed, named, validated — so
`ToolPanel` presents any tool without knowing which. A tool that presents itself through hand-written panel code is
a tool the panel has to be edited to add.

| Declared per tool | Meaning                                                 |
|-------------------|----------------------------------------------------------|
| Parameters        | `PropertySpecification` declarations                     |
| Pointer behaviour | Which precedence level it claims in `14` §4.2            |
| Preview           | What `82` shows before the artist commits — or nothing   |
| Transaction shape | Whether its edit is a drag under `10` §2.4               |

## 5. Gates

- **Gate:** Nothing held here is a transaction or enters `RevisionSequence`.
- **Gate:** Nothing held here is stored in the document.
- **Gate:** Both `SlateCompute` and `SlateUI` read this state; neither owns a private copy.
- **Gate:** Exactly one holder has the pointer, and capture persists for a whole drag.
- **Gate:** Tool parameters are `PropertySpecification` declarations, never hand-written panel code.
- **Gate:** `14` §4.1's table is complete — state not in it and not in the document has no home and is a defect.

## 6. Open

| Open question                                                            | Blocks                     |
|---------------------------------------------------------------------------|-----------------------------|
| Whether a colour sampled from the workspace is display-referred or working | `00` §12; `36` decides     |
| Whether tool state is per document or per application when several are open | `48` sessions             |
| Whether tool presets share `58`'s preset mechanism                        | Presentation only           |
