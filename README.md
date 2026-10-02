# Frontier

## References

- [`QuadTreadAAA.html`](References/QuadTreadAAA.html) — a tyre tread modelled as quads: trace one half of a pitch,
  mirror it, bend it onto the crown, array it around the wheel, bridge the seam. 12 designs, four construction
  steps, a live topology audit, GLB/OBJ export. Nothing is displaced from a height map.
  Open it over HTTP (`python3 -m http.server` from this folder, then `/References/QuadTreadAAA.html`) — it loads
  three.js from a CDN through an import map.
- [`References/quadtread/`](References/quadtread/) — the meshing core as plain ES modules (the HTML embeds a
  byte-identical copy), the twelve designs, and the checks that certify them.
- [`Docs/QuadTreadGrammar.md`](Docs/QuadTreadGrammar.md) — the design grammar, how the conforming quad grid is
  built, and what the audit measures.
