# Vehicle physics and effects follow-up plan

**Status:** planned only. The patch reconstruction and live material/ghost-view integration are implemented; the work below is not.

## Physics baseline and Jolt

The browser prototype does **not** use Jolt. `Source/VehicleSolver.js` is a custom JavaScript vehicle solver (fixed substeps, suspension, MF6.1 tyre forces and powertrain), while `Source/RigidBodyWorld.js` is a separate custom rigid-body/contact solver for debris and cones. The current checkout is a browser prototype, not the native C++ physics runtime.

For the C++ port, evaluate Jolt as the rigid-body and collision foundation rather than adding an unverified WASM/Jolt dependency to this prototype. Keep the vehicle-specific tyre model as an explicit integration layer: feed per-wheel contact/load information into the tyre model and apply resulting forces/torques to Jolt bodies (or compare against Jolt's vehicle constraint). Do not run a second solver for the same contacts. Validate fixed-step determinism, suspension stability, vehicle-vs-prop impulses, sleeping, and replay parity before retiring the prototype solvers.

## Ordered follow-up

### 1. Remove the current tyre deformation effect

- Remove the soft-carcase visual deformation and its inspector controls/exaggeration because the current result is not good enough.
- Keep the useful pressure, wear, failure and contact telemetry unless separately revised; first separate visual deformation from physical tyre/suspension calculations so the removal does not silently change driving forces.
- Acceptance: intact and shredded tyres render without the unwanted carcass wobble/bulge, the rim and tyre remain aligned, and vehicle stability tests still pass at normal, low and zero pressure.

### 2. Make sparks read as hot, cooling particles

- Give spark particles an emissive contribution so they remain bright in the HDR scene and can leave a short, energy-limited light contribution near their source.
- Use a temperature/lifetime colour ramp: near-white/yellow at ignition, then amber, then orange/red as the particle cools. Avoid the current abrupt yellow-to-orange switch and clamp the final radiance to prevent blown-out pixels.
- Add swept collision against the analytic course and world geometry (walls, barriers, containers and breakable props). On impact, bounce with a small restitution, damp tangential speed, then expire; do not let sparks pass through the ground or tunnel walls.
- Acceptance: repeatable colour progression, visible emission under both day and night lighting, bounded light cost, and no tunnelling through representative world surfaces at the maximum spark speed.

### 3. Use rim marks after a tyre is shredded

- Stop depositing black rubber skid marks for a wheel after its tyre has been shredded.
- Add a separate, subtle rim-contact mark (metallic grey with a short-lived bright scrape component) only when the bare rim is actually touching/sliding on the surface. Keep ordinary tyre rubber marks unchanged for intact tyres.
- Acceptance: a shredded wheel leaves no rubber deposit, produces a rim mark only while the rim contacts the road, and the mark is cleared with the existing track-mark reset.

### 4. Add steering self-centering / auto-correction

- Add a gentle return-to-centre assist when the driver releases steering, using tyre self-aligning torque and the authored caster/trail where available; scale it with speed and damp it to avoid oscillation.
- Preserve driver authority, keep the assist weak at parking speeds, and define behaviour in reverse and during handbrake/burnout manoeuvres.
- Expose one enable/strength control only after the baseline is stable.
- Acceptance: steering returns smoothly toward centre on a straight, does not oscillate, remains responsive in a turn, and does not override sustained driver input.

## Verification gates

1. Run `Tools/VehicleStability.mjs` and add deterministic tests for the changed tyre and steering cases.
2. Add spark colour/lifetime and collision tests against the ground and a vertical obstacle; inspect both day and night captures.
3. Add a shredded-tyre mark test that distinguishes rubber deposition from rim scraping.
4. For the later Jolt C++ migration, compare fixed-step replays and contact/impulse telemetry against the prototype before changing defaults.
