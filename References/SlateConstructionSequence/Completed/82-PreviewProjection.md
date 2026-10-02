# 82 — PreviewProjection

A preview shows the artist what an action will produce before they commit to it. Four consumers need one and `22`
§4.1 already declared the mechanism they share — the speculative extent. This document is where they are gathered
so the four do not each invent their own.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Units       | `SlateCompute.lib` (resolution), `SlateUI.lib` (presentation)                |
| Layers      | `Layer4_Compute`, `Layer5_Interface`                                          |
| Upstream    | `22` §4.1 (the speculative extent), `58`, `70`, `72`, `76`, `78`             |
| Downstream  | `14` presents every one of them                                               |
| Unblocks    | Thumbnails, speculative extents, the domain view                              |

## 1. Everything Here Is Speculative

🔴 `22` §4.1 declares the properties and they are not restated differently: display-only, discarded and re-resolved
each rotation, never entering `RevisionSequence`, and — the property that separates a preview from an uncommitted
stroke — **never blocking eviction**.

⚠️ Without that last property a brush preview pins every tile the cursor passes over, and hovering across a surface
exhausts residency without the artist painting anything.

## 2. The Consumers

| Preview           | Shows                                                   | Resolved through |
|-------------------|----------------------------------------------------------|-------------------|
| Brush preview     | The impression about to be applied, under the cursor     | `58` and `22`     |
| Content preview   | The current surface content over an extent, at a moment  | `20`'s tiles      |
| Placement preview | A placement under the manipulator, before release        | `70`              |
| Parameter preview | The result at the value currently being dragged          | Whatever owns it  |

**Brush preview** resolves the brush's impression at the cursor's domain position, in the brush's active colour
from `76`, and composes it display-only over what is there. It is the answer to "what am I about to paint" and it
must show the resolved brush — radius, coverage falloff, the combine specification and the colour — not an outline
of the radius. A radius outline answers a different and less useful question.

**Content preview** shows the surface's current content over a declared extent. 🔴 It is a **read**, and produces
no transaction and no document mutation of any sort. Its value is comparison — the artist wants to see what
something looked like a moment ago, or what a hidden layer contains, without changing anything to find out.

**Placement preview** is `72` §3's positioning drag seen. It resolves through `70` and may resolve coarse and
refine, exactly as `70` §5 permits.

**Parameter preview** shows the result at a dragged value while the transaction under `10` §2.4 is open. Every
Amend is a re-resolution and none of them is recorded.

## 3. Thumbnails — And Where There Are None

| Content        | Thumbnail |
|----------------|-----------|
| Imagery        | Yes       |
| Tiling         | Yes       |
| Brush          | Yes       |
| Material       | Yes       |
| Text           | 🔴 No     |
| Vector content | 🔴 No     |

Text and vector content are presented by their **source** — the text itself, the vector source's name — and not by
a rendered miniature. Both are analytic, so a thumbnail is a resolution at a size chosen for a row, and at row
height a glyph outline and a vector outline both reduce to an indistinct mark. A row of decal placements each
showing an indistinct mark is worse than a row showing the text.

## 4. The Domain View

A two-dimensional view of a surface's parametric domain, presented by `DomainPanel` in `14` §1. It shows the chart
partition from `68`, the seams, the resident cells from `20`, and the placements positioned in the domain.

🔴 It is the workspace for **domain placement** — `00` §10.1 ①'s second mode — and for painting directly in the
domain. Both address the same domain a three-dimensional stroke addresses, through the same path in `22`, so a
stroke made in the domain view and one made on the surface are indistinguishable afterwards.

## 5. Host Resolution

Previews resolve on the **host** where the source is analytic, through `70` §4's host path. `00` §11 gates the
agreement at Tier B, and the reason is stated there: where host and device disagree, the artist blames the preview,
because the preview is the thing that looks provisional.

## 6. Gates

- **Gate:** Every preview is a speculative extent under `22` §4.1.
- **Gate:** No preview blocks eviction.
- **Gate:** No preview enters `RevisionSequence` or mutates the document.
- **Gate:** Brush preview shows the resolved impression, not a radius outline.
- **Gate:** Text and vector content have no thumbnails; both are presented by their source.
- **Gate:** Domain-view painting and placement go through the same paths as their three-dimensional forms.
- **Gate:** Host and device resolution agree at Tier B, proven by `ParityRunner`.

## 7. Open

| Open question                                                     | Blocks                     |
|--------------------------------------------------------------------|-----------------------------|
| Thumbnail extent, and whether it is stored or re-resolved          | `48` document size          |
| Whether content preview is a panel or an overlay on the workspace  | `14` presentation only      |
| Whether the domain view supports several surfaces at once          | `14` presentation only      |
