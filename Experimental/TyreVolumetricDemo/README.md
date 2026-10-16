# Volumetric tyre — WebGPU demo (tetrahedral FEM)

A visual-only soft-body tyre built as a **volumetric tetrahedral mesh**, not XPBD and not a
surface cloth. It is a standalone demo, intended to be reviewed before it is ported into
`Experimental/VehicleHmiPrototype`.

## Run it

```sh
cd Experimental/TyreVolumetricDemo
npm test          # CPU reference + mesh/FEM checks (node:test, no dependencies)
npm run serve     # then open http://localhost:8080 in a WebGPU browser (Chrome/Edge/Safari)
```

Open the page in a WebGPU-capable browser. Sliders: rolling speed, inflation, rubber stiffness,
effective density, sprung mass, obstacle height, **slip angle (steer)**, friction, damping,
simulation speed. The **Road** menu picks a speed bump, a kerb strike, a mixed course, or flat.
Toggle the tetrahedral edges, switch to the deformation colour map, or pause/reset.

The HUD shows FPS, JS encode time, sub-steps per frame, and GPU pass times when the browser
exposes the `timestamp-query` feature (Chrome/Edge on desktop typically do; Safari may not).

## Road and slip

- **Road features** (`roadPreset`, `featureHeight` / WGSL `featureH`): a raised-cosine speed bump,
  or a kerb block with 3 cm ramps. Up to eight features, summed. CPU and GPU use the same function.
- **Slip angle**: the wheel heading (`yaw`) is rotated about the vertical axis relative to the
  direction of travel. The bead target is `rim + Ry(yaw)·Rz(α)·rest`, and the spin vector is
  `α̇·(sin yaw, 0, cos yaw)`. The tread has to slide sideways to follow the rim, so lateral
  forces build up in the contact patch. The rim's lateral position is still prescribed; there is
  no steering-torque model.

## Fixed in this revision

- **Rolling spin sign.** The rim spun the wrong way: at 5 m/s the contact patch moved forward at
  about 12 m/s, so the tread was skidding. It now spins at −v·cos(yaw)/R, and the contact patch
  moves at about 0.4 m/s. A test checks this.
- **Contact stickiness.** The viscous friction rate went from 150/s to 600/s, which makes the
  contact patch stick much more like a real tyre.

## Method

The tyre is a solid tetrahedral volume: 48 × 4 × 4 hex cells (Kuhn-split into 6 tets each),
2,304 tets over 1,200 nodes. The bead ring is tied to the rim by stiff springs, and the tread
contacts a procedural road.

Per tetrahedron, per sub-step (`src/shaders.js → cs_tet`):

1. Deformation gradient `F = Ds · Dm⁻¹` from rest-shape matrix `Dm` (precomputed).
2. Green strain `E = ½(FᵀF − I)`, St. Venant–Kirchhoff stress `S = 2μE + λ·tr(E)·I`.
3. Inflation as a volume term: `P = F·S − p·cof(F)`. This is the gradient of `−p·V`, so
   the tyre behaves as a volume-preserving pressurised body rather than a collection of
   independent springs.
4. Nodal forces: `f_k = −V₀·P·G_{k−1}` for k = 1..3 (`G = Dm⁻ᵀ`), with `f₀ = −Σ`.

Per node (`cs_node`): gather tet forces through a CSR adjacency list (no atomics), add gravity,
velocity damping, bead spring towards the rotating rim, and penalty ground contact with
Coulomb-clamped viscous friction. Then semi-implicit Euler.

Per frame (`cs_rim`): the bead reactions are reduced to a single sum; the sprung rim integrates
suspension + bead reaction in y, and rolls at v with spin ω = v/R.

`cs_normal` computes outward normals from the grid neighbours for shading.

The CPU reference in `src/tyreCore.js` implements the same equations. The tests check it:
the element forces match finite differences of the stored energy, and the GPU uniform layout
matches the WGSL struct.

## Why explicit, and the mass scaling

The solver is explicit, so the step has to stay below the fastest element mode. The critical step
scales with sqrt(density / E). Measured on the CPU reference at E = 6 MPa: density 250 kg/m³ needed
dt ≤ 5×10⁻⁵ s, and density 1000 kg/m³ is stable at 10⁻⁴ s. The demo uses **effective density 1000
kg/m³** and dt = 10⁻⁴ s (167 sub-steps per frame at 60 Hz).

Because the model is a *solid* tyre (no hollow cavity), 1000 kg/m³ gives about 40 kg of tyre, which
is heavier than a real ~10 kg tyre. That is the trade for the sub-step budget. `resolveParams` shrinks
dt automatically when stiffness is raised or density lowered (dt ∝ √(density/E)); it was tested at
10 MPa. Sub-steps are capped per frame, so the sim slows down rather than blowing up if the GPU can't
keep up.

## What this is not (yet)

- **Rim motion is prescribed**: the rim advances at the commanded speed and spins with the
  rolling constraint (and yaw for slip). Drive torque, braking and slip ratio are not modelled.
- **Road contact is a height-field penalty** (vertical normal, clamped Coulomb friction per
  node). There is no tyre-to-triangle contact.
- **No self-contact** between tread and sidewall, and no inner-liner or cord model.
- **Visual, not calibrated**: stiffness, damping and density are tuned for plausible
  behaviour (the rim settles about 8 mm below the ride target under the ~1.8 kN corner weight). They are not measured
  tyre data. Physics feeding the vehicle would need a separate calibration.

## Relation to Unreal Engine

The volumetric-tetrahedron idea matches Unreal's **Chaos Flesh**, which generates tetrahedral
geometry from a surface and simulates it with corotated tetrahedral constraints. Note that
Chaos Flesh's public source (`FXPBDCorotatedTetrahedralConstraints`) uses **XPBD**. This demo
deliberately does not: it uses explicit FEM with an analytic pressure term, which is the
variant asked for.

## Tests

`npm test` runs nine checks in about 15 s on the CPU: mesh topology, inverse, zero rest force,
finite-difference gradient of the element forces, uniform layout, adaptive step, settle under
load, rolling kinematics, stiff/fast stability.

The WebGPU path was not exercised in a browser here (the sandbox has no GPU). The WGSL parses
with the `wgsl_reflect` parser. Compute and render pipelines have not run on a real device yet,
so the first browser run is the test that matters.
