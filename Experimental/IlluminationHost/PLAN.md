# Follow-up plan

This is the requested next-work plan for the IlluminationHost prototype. It records the known baseline and proposes an order that keeps physics and visual effects testable.

## Physics baseline: Jolt

**This prototype does not currently use Jolt.** Vehicle dynamics and tyre forces are implemented in `Source/VehicleSolver.js`; rigid bodies, collision and contact response are implemented in `Source/RigidBodyWorld.js` and related JavaScript modules.

### Proposed migration

1. Establish a repeatable baseline: fixed-step stability, vehicle handling, obstacle contacts, breakable-prop impacts and determinism/regression scenes.
2. Evaluate and integrate Jolt Physics for browser use (WASM), first behind a small adapter rather than replacing every caller at once. Port static world geometry and ordinary rigid props, then compare contact and performance results against the current world.
3. Port the vehicle and wheel-contact model only after the adapter can preserve the vehicle's suspension, tyre-force and steering behavior. Keep the existing solver available during comparison; remove it only when parity and failure cases are covered.
4. Verify reset/restore, collision filtering, timestep behavior, memory ownership and deployment of the WASM assets in both the standalone preview and CI/headless validation.

This is a migration, not a one-line engine switch: the current vehicle model owns its tyre and suspension response, so those semantics need an explicit mapping to Jolt.

## Requested vehicle and effect changes

### 1. Remove tyre visual deformation

- Remove the visual carcass deformation path (`TyreCarcassSolver` / `TyreCarcass.wgsl`) and its per-frame GPU work.
- Preserve tyre pressure, temperature, wear, puncture and failure state unless a behavior is explicitly tied only to the discarded visual deformation.
- Check that shredded tyres, exposed rims, shadows, reflections, Garage preview and collision/contact behavior remain coherent.

### 2. Improve sparks and derez effects

- Make sparks and derez fragments visibly emissive and add a restrained, short-lived local light contribution, rather than relying only on a bright particle colour.
- Move spark collision from the road-only approximation to world geometry; handle impact, bounce/skip, speed loss and termination without tunnelling or particles hanging in the air.
- Drive colour and brightness continuously from particle temperature/lifetime: a near-white/yellow hot core, then yellow, orange and darkening red as it cools. Tune exposure and lifetime against the actual renderer so the trail reads as hot metal without becoming a flat yellow/orange streak.
- Profile particle counts and light contribution, then validate against the headless renderer and a browser scene.

### 3. Use rim marks after tyre shredding

- Keep rubber skid marks while a tyre has tread and is contacting the road.
- Once the tyre is shredded and the rim is the contact surface, switch to metallic rim-scrape marks instead of rubber marks; vary width, opacity and colour with load/slip, and coordinate the transition with sparks.
- Ensure the marks follow the actual contact point and do not appear while the wheel is airborne.

### 4. Add steering correction

The likely term is **self-centering** or **steering return-to-center**. Add a configurable steering-return torque/assist that brings the wheel back toward centre when the driver releases input, with strength shaped by speed and front-tyre aligning response. Keep it distinct from lane-keeping or electronic stability control, and test low-speed parking, high-speed corner exit, reverse and countersteer so it never fights deliberate input.

## Validation gates

- No shader or WebGPU validation errors; headless harness reports zero errors and warnings.
- Compare before/after vehicle handling, tyre pressure/failure, rim contact and obstacle collisions in fixed scenarios.
- Check the Garage's real material changes and all three view modes after rendering changes.
- Record performance at representative particle and debris counts before merging the Jolt and effects work.
