# 52 — VectorInterchange

Vector outlines and typeface outlines are the same thing at intake: closed and open planar paths with a fill rule.
A typeface glyph is an outline with a name and metrics attached, and treating them as two subsystems produces two
path solvers that disagree on the same curve.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateDocument.lib`                                                           |
| Layer       | `Layer3_Document`                                                             |
| Upstream    | `02` (`CurveSolver`, `PlanarClassifier`, `IncircleClassifier`), `10` (codecs), `36` |
| Downstream  | `70` resolves outlines into the domain; `72` places them; `82` previews them  |
| Unblocks    | Vector outlines and typeface outlines as content                              |

## 1–4. Discharged

✔️ Done — both intake routes producing one specification, flattening by adaptive subdivision and by sagitta for
arcs, stroke conversion to outline at intake, per-path fill rules combined by outermost containment with a
boundary winning outright, refusals recorded with construct and position, and the typeface half holding glyphs by
identity with pair adjustments and text stored as glyphs beside characters.

✔️ §4's parity property done — one flattened polyline is classified by `PlanarClassifier`, which is exact over
whatever `CurveSolver` produced.

🔴 A refusal names the construct **and** the position in the source. "Unsupported" with no position sends the
artist to search a file they did not write.

🔴 Text is resolved to a **glyph sequence** at intake and that sequence is what is stored, the characters beside
it so the text stays editable. Storing only characters means every resolution re-runs substitution, and
substitution depends on the typeface — so replacing a typeface silently changes the shaping of text the artist
already positioned.

⚠️ Stroke conversion happens at intake because a stroke width is a distance in the source's own space and a
placement scales that space. A stroke held as a width thins when the placement shrinks, which is correct for a
drawing program and wrong for content placed onto a surface at a chosen size.

🚧 Open edges: no `VectorCodec` exists, so a specification arrives already decoded; refusals are recorded and
nothing presents them; joins are bevelled and terminals butt, per §5's absent declaration. Flattening tolerance is
still to become resolution-relative when `70` resolves at a promoted reduction level.

## 5. Gates

- **Gate:** A file source and a supplied-text source produce identical specifications.
- **Gate:** A supplied-text source stores its text; nothing depends on a clipboard surviving.
- **Gate:** Strokes are converted to outline at intake; no stroke width is stored.
- **Gate:** Every refusal names the construct and its position in the source, through `86`.
- **Gate:** Text stores a glyph sequence and its characters, never characters alone.
- **Gate:** Interior classification is Tier A and parity-proven.
- **Gate:** Flattening tolerance is relative to the reduction level being resolved.
- **Gate:** No outline is stored as texels at any resolution.

## 6. Open

| Open question                                                       | Blocks                        |
|----------------------------------------------------------------------|--------------------------------|
| Whether right-to-left and vertical text are in the accepted subset   | Shaping only; `72` unaffected |
| Whether gradient interpolation is in working space or source space   | `36` decides                  |
| Whether a typeface is embedded or referenced on save                 | `00` §12 carries this         |
