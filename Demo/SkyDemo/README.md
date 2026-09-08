# Sky demo

A real-time sun, sky and moon in WebGL2, so the atmosphere work can be judged by looking at it instead of
by reading reconstruction-error tables.

    python3 -m http.server 8080 --bind 0.0.0.0 --directory Demo/SkyDemo

## What it implements

Hillaire 2020's LUT chain, all three surfaces:

| | surface | size | parameterisation |
|---|---|---|---|
| ① | Transmittance | 256×64 | **Bruneton distance-to-boundary** — measured 1.32× worst reconstruction error vs 2.30× for a signed-sqrt cosine map |
| ② | Multiple scattering | 32×32 | full sun-zenith range, negative included, because a sun below the horizon is what lights twilight |
| ③ | **Sky-view** | 192×108 | **quadratic about the horizon, in ANGLE**: `v = 0.5 + 0.5·sign(l)·√(|l|/(π/2))` |

③ is the surface the engine does not have. It is where horizon detail belongs, and its absence is why three
rounds of work kept trying to squeeze that detail out of ①. See `References/Deferred/SkyViewSurface.md`.

## The exposure toggle

The point of the demo. **Incident anchor** takes the top mip of ③ — the mean radiance of the whole sky, which
cannot depend on where the camera points because it does not know where the camera points. Drag to look
around: the brightness does not move.

**Frame metered** meters the direction actually being looked at. Drag to look around: pointing at the sun
darkens everything, pointing at the ground blows it out. That is the behaviour the anchor removes, left in so
the difference can be seen rather than asserted.

## Honest limits

- Aerial perspective is a single blend against ③, not the 32×32×32 volume Hillaire uses. Ground detail at
  long range is approximate.
- No volumetric shadows, no clouds.
- The moon's orbit is the sun's path offset in hour angle by the phase, which makes phase and position agree
  (new moon rides with the sun, full moon opposes it) without being a real ephemeris.
- Stars are procedural, from a hashed direction grid — never a catalogue.
- Verified: all five shaders compile under glslang, and the JS parses. Rendered output has not been
  machine-checked; that is what your eyes are for.
