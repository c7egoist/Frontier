# Procedural Sound Library

A library of **procedurally generated sound effects**: no recorded samples. Every sound is
synthesised from physical-style parameters, so each one can be adjusted for the surface,
the object and the condition, and regenerated exactly from its seed.

Covered families:

| Family | Types |
| --- | --- |
| Impacts | bump, knock (×3), tap, heavy thud |
| Friction | scratch, scrape (grit spacing sets the pitch) |
| Doors | opening (hinge creak, latch), closing (whoosh, slam into frame, latch, rebound) |
| Electric | motor: brushless (6-step), brushed (commutator crackle), induction; spin-up / steady / spin-down |
| Vehicles | tyre squeal / skid / burnout; car crash (thud, crumple, tearing, glass shower, debris, body ring) |
| Glass | shatter (annealed / tempered / laminated), crack & break |
| Cargo | drop & bounce, slide, shift (strapped), rattle, ratchet-strap tightening |
| Water | drip (Minnaert bubble pitch), pour, stream, splash, puddle step |

Surfaces: steel, aluminium, cast iron, copper; pine, oak, plywood; annealed and tempered glass;
concrete, brick, granite, marble, ceramic tile; asphalt, gravel; ABS, rubber, cardboard;
plus a **custom surface** with its own base frequency, ring time, brightness, roughness,
hardness and density.

Conditions that apply to every sound: **wetness** (water film: damps rings, darkens contacts,
cuts grit), **wear** (detuning, extra noise), **object size**, and **room** reverb.

The surface values reuse the fracture editor's material table where they overlap
(annealed and tempered glass, pine, concrete, granite, ABS). The UI is the fracture editor's
chrome from `SultanAladin/Frontier-` (`Experimental/FractureEditor/FracturePanel.{html,css}`).

## Use

```bash
npm test                         # 49 checks: determinism, bounds, physics trends, catalogue
npm run render                   # all presets -> out/library/*.wav + manifest.json
node src/render-library.mjs --only doors,glass --sr 48000 --out ./my-sfx
npm run ui                       # browser editor on http://localhost:8080
```

Requires Node 18+. No dependencies.

## Layout

```
src/dsp.js            filters (RBJ biquad), modal resonators, noise, reverb, FFT, WAV encoder
src/materials.js      surface model, modes, wet/wear conditions
src/context.js        seeded render context and the final stage
src/sounds/*.js       impacts/friction, doors, glass, vehicles, cargo, water
src/registry.js       sound types and their controls; renderSound() entry point
src/catalog.js        the preset catalogue used by the batch exporter and the UI
src/render-library.mjs batch WAV exporter with a manifest of every recipe
ui/                   browser editor (Web Audio playback, waveform, spectrogram, controls)
tests/test.mjs        test suite
```

## Notes and limits

- Procedural models, not recordings. They capture the main physical behaviour (ring time vs
  material, stick-slip squeal, Minnaert drip pitch, commutation whine) but a real recording
  will still carry detail these models omit. Listen-test before relying on them in a shipping mix.
- Output is mono, 16-bit WAV. Levels: each sound's peak scales with its intensity control, so
  a soft knock is quieter than a hard one, within the same sound type.
- The generators are fast enough for live editing, but very long crashes (8 s) take a few
  hundred milliseconds to render.
