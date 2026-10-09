# Frontier Landscape Editor (experimental)

A heightmap landscape editor built on the FrontierEditor shell: layer stack on the left, satmap viewport in the
centre, inspector on the right.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # terrain engine regression checks
npm run build
```

## Model

- **Layer stack.** Layers evaluate top to bottom. Three kinds:
  - *Generator* (base shape): Perlin fBm, multifractal, ridge, mountain, cellular rock, dune field, plateau/mesa,
    rolling hills, shield volcano, tilted plane. Blend modes: replace, add, union, cut.
  - *Modifier* (sculpt): stratify (rock beds), terrace, cliffs, rift/canyon, smooth, sharpen, elevation curve.
  - *Erosion*: hydraulic (rain particles), fluvial (stream-power on a priority-flood drainage network),
    thermal (talus), aeolian (wind transport), glacial (U-valleys above the snowline). Each has its own sliders.
- **Masks.** Every layer can carry masks, which multiply together: coastal falloff (distance to shore), mountain
  falloff (smootherstep over an altitude band), slope, protrusion/hollow (curvature), noise, radial, strata.
  Each mask can have invert, strength, and a generator breakup (fBm or cellular) so edges are not clean lines.
- **Physical units.** Heights are metres and cell size comes from the world size, so slopes and drainage are real.
  Erosion works in dimensionless cell units and converts back. Uplift is kept out of the erosion/deposition maps.
- **Satmaps.** Satellite (stylised), rivers & drainage, sedimentation, protrusions, elevation, slope, erosion
  intensity, wetness. They are derived from the diagnostics, with stylise and hillshade controls.
- **Presets.** Canyons, Sandstone cliffs, Coastal cliffs, Himalayan mountain, Icelandic, Alps, Snowy mountains,
  Rugged outcrops, Desert dunes, Rocky desert.

## Notes

- Terrain is evaluated in a Web Worker. Only the newest request is shown.
- Project state autosaves to localStorage. Ctrl+Z undoes edits.
- Exports: `.r16` (16-bit little-endian, min-max normalised, with a JSON sidecar giving the metre range) and satmap `.png`.
- The erosion models are stylised physical approximations, not calibrated against measured terrain.
