# Frontier

## Tread Forge

`References/QuadTreadModelling.html` is a standalone browser editor for traced, mirrored tyre tread geometry.

It builds the tread from authored polygon outlines rather than a heightmap or texture displacement:

- seven non-rectilinear vector tread presets, including directional, interlocking, winter, mud, wet, and rally layouts;
- one source half is mirrored across the tread centre and either point-flipped or translated into the second half-pitch;
- the completed motif is mapped onto the crown and shoulder profile and circular-arrayed at `circumference / pitch count`;
- top fills, split outline walls, floor patches, and the modeled base are emitted as quad faces;
- the in-page audit reports zero triangle export faces and the OBJ exporter writes four-index `f` records.

Open the HTML through a local HTTP server so the Three.js module import can load, for example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/References/QuadTreadModelling.html`.
