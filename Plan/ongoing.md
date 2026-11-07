# Ongoing implementation plan — Vehicle, effects, and native authoring

**Updated:** 2026-11-08
**Branch:** `arena/ff6cc303-frontier`
**Baseline commit:** `6813d15` (`Implement fluid editor and physics workspace fixes`)

## Goal and verification rules

Continue from the committed Fluid Editor / physics workspace work. Implement the user’s remaining vehicle, HMI, plume, collision, modular-systems, and editor requests in native Frontier C++/GPU code. The HTML under `Experimental/` is design/reference material only; it is not evidence that a native solver or visual result is correct. Verify through native builds, focused C++ validations, and the actual application viewport/capture where the environment permits. Preserve Fluid Editor GPU presenters, `.fluidspace`/`.gasscene.toml` persistence, record synchronization, and modal exit behavior while its UI is migrated to dockable panels.

## Audit findings (source-of-truth, not assumptions)

- **Lobby vehicle state:** `QueryLobbySessionPolicy()` deliberately sets `PhysicsSimulated=false` and `EquilibriumPlacement=false`; `Lobby.levelspace` agrees. The visible hero is therefore rendered as a resting vehicle, not advanced by vehicle physics. Proving Ground enables both flags. The existing `PhysicsVehicle::ResolveEquilibriumPose()` performs four-wheel ground probing and accounts for wheel/suspension geometry, tyre radius and static deflection when physics placement is enabled.
- **Lobby vertical placement:** decoded `Lobby.facetspace` shows the studio floor top at about Z=0.009 m; the original hero body is at Z=0.53 m and the four wheel centres at Z=0.50855 m (tyre bottoms approximately Z=0). `Lobby.levelspace`’s vehicle ground anchor is Z=0, so raising the whole vehicle would lift its tyres off the floor. The archived body/COM interpretation is still unconfirmed; do not change the ground anchor blindly. A shared `Vehicle::ResolveRestingHubLocal()` now resolves wheel mounts plus static strut compression and is used by `PhysicsVehicle::ResolveEquilibriumPose()`, the parked/editor vehicle visual, and both editor/runtime camera-subject fallbacks. Static visuals now derive the chassis COM from tyre radius, mean tyre deflection and mean resting hub, then convert COM to the authored body origin; wheel visuals come from the resolved suspension hubs. A C++ regression checks the authored socket/rest-hub identity and body-clearance equation under changed radius, mass split and strut rates. Native builds and focused tests pass, but the Lobby body/COM meaning and actual viewport clearance still need a fresh native runtime inspection/capture. Keep Lobby parked/static unless evidence supports active simulation.
- **Transform gizmo:** the viewport’s shared spatial-gizmo path now accepts a visible, selected `VehicleRecord`’s `VehicleConfiguration::Spatial` when physics is stopped; move/rotate/scale mode keys, drag and cancel all use the existing gizmo and revision path. Vehicle handles remain disabled while physics owns the live transform. Native editor builds pass; actual selectable/visible behavior still needs an in-app check.
- **HMI:** there is no per-level HMI field in the two level records. “HMI” currently names a vehicle-camera rig that frames the centre-console tablet. Lobby already exposes that rig in Game-camera mode; an added direct HMI toolbar action is shown when a vehicle camera subject exists, including the Editor-camera path used by Proving Ground. Do not invent a persisted HMI flag. Confirm both levels’ actual subject/tablet framing in the native runtime.
- **Tyre smoke / plume:** native `PlumeSourceProjector::ProjectVehicle()` already gates contact-patch smoke on wheel contact/load and filtered slip (slip ratio, slip angle, slip velocity or dissipated sliding power). It also emits a short smoothed decay after slip ceases. Add explicit zero-slip/no-contact and slip/skid-positive C++ validations; if a real run still smokes continuously, trace the live telemetry that crosses the gate before changing thresholds.
- **Plume implementation:** `PlumeSourceProjection.cpp` is native C++ source projection; `PlumeSpace.cpp`/`PlumeLayouts.slang` provide the GPU plume transport/raymarch. Validate these paths and their coupling directly in C++/GPU tests, not against the HTML prototype. Existing Fluid Dynamics validation is not an end-to-end flipbook/warm-up export test.
- **Collision:** native Jolt/vehicle physics and geometry collision are independent of fracture. Verify a dynamic, non-fracture cone/object receives a collision impulse and remains usable with fracture disabled. Do not require destruction for ordinary collision response.
- **Native and Experimental editors:** native Fluid and Particle authoring implementations exist; the current Fluid/Particle editors are modal rather than dockable. The native Fracture Editor is currently a schematic/modal preview with parameter controls, not the fetched fracture solver. ForceField and Wind have substantial native inspectors and a 2D/map-oblique field viewport/timeline, but no distinct dockable per-element authoring workspace with a trigger registry and live 2D/3D shape debug. `Experimental/` includes Fluid, ForceField, Particle, and Fracture editor prototypes; these are not standalone native capabilities.
- **Authoring access:** `EverestWorkspace`’s constructible/visible type list omitted native `FluidPlume`, `Fracture`, and `Particles` records even though `WorldSpace` registers them and inspectors exist. These types are now added to the native Construct/Outliner catalogue; record creation, persistence, editor launch and runtime effect still need verification.
- **Vehicle inspectors/workspace:** Vehicle/Tyre inspectors and a vehicle-local curve editor already exist, but they need the Sun inspector’s card/readout language, quicker controls, feature cards (including ABS), reusable curve tooling and a distinct vehicle authoring/test workspace. Inventory current toggles and demos before deciding which controls are genuinely missing.
- **Fracture reference:** fetched `https://github.com/c7egoist/Frontier/tree/arena%2Feb353da2-frontier` without checking out or switching branches (`FETCH_HEAD` = `acb0502`). Its design doc and JS describe two relevant algorithms: a typed-array flat-convex runtime clip/bond pipeline (`FastRuntimeFracture.js`, Boussinesq–Hertz impact stress, CutToken adjacency/bonds, GPU batch) and an engineering bake (`EngineeringBakedFracture.js`, 3D Navier–Cauchy lattice, symmetric stress eigensolver, Rankine/Mohr–Coulomb failure, material-aware fractography and collision proxies). These sources must be inspected function-by-function and ported/tested selectively; the reference tree is not a safe wholesale merge and design-doc performance claims are not validation.
- **Particle/VFX inventory:** native `ParticleLibrary.toml` contains 52 presets, including `derez-cube`, `black-hole`, and lightning effects. Check runtime reachability/rendering and compare with the Experimental list; do not recreate presets already present.

## Prioritized batches

### Batch 1 — Correct the Lobby vehicle and make it editable (partially implemented; native UI verification pending)

1. Use the shared resolved-hub/equilibrium equation across physics spawn, parked visuals and camera fallbacks. C++ regression covers socket/rest-hub alignment and tyre-radius/body-clearance math. Preserve the Z=0 anchor and parked Lobby policy; confirm archived body/COM semantics and wheel clearance in a fresh native viewport capture before claiming visual correctness.
2. Expose a visible, selected `VehicleRecord`’s spatial transform to the existing gizmo, including in the Lobby Game-camera path; freeze handles while physics runs. Native editor build passes; check interaction in-app.
3. Add a direct HMI rig action when a vehicle camera subject exists, so both Game- and Editor-camera levels can reach it. Check real tablet framing in Lobby and Proving Ground; no per-level setting was created.
4. Add `FluidPlume`, `Fracture`, and `Particles` to the native Construct/Outliner catalogue. Build `VehicleDynamicsValidation`, `LobbySessionValidation`, `EverestProjectEditor`, `EverestProjectRuntime`, and standalone `Everest`; focused vehicle/Lobby CTests pass. Native GUI capture/manual checks remain outstanding.

### Batch 2 — Physics, collision, and tyre smoke

1. Exercise Proving Ground’s four-wheel equilibrium placement and live simulation, checking hub/body/ground clearances against the authored suspension mounts and tyre radius.
2. Add C++ plume tests for no slip/no contact (no new tyre smoke), longitudinal wheelspin, lateral skid, and decay after slip; instrument telemetry and correct whichever live input produces the user-visible continuous emission.
3. Validate non-fracture collision response with a movable cone and a rigid body, then regression-test fracture off/on independently.

### Batch 3 — Modular systems and access

1. Trace the actual APIs/data flow for ForceField/Wind, particles, rendered VFX, FluidPlume smoke, and Fluid Editor fluid spaces. Keep systems independently constructible/configurable and permit composition through explicit shared inputs (wind/field sampling, sources, triggers), rather than merging solvers.
2. Add `FluidPlume`, `Fracture`, and `Particles` to the standard native Outliner/Construct catalogue. Verify creation, persistence, inspector/editor launch, and runtime effect for each.
3. Finish native correctness checks for C++ FluidPlume projection/GPU plume and C++ Fluid Editor simulation. Run flipbook export including warm-up and first-frame burst; preserve previous Fluid Editor behavior.

### Batch 4 — Dockable effect-authoring workspaces

1. Convert/host Fluid, Particle, ForceField/Wind, and Fracture editors as dockable tabs/panels in the existing application (not separate apps/windows); preserve existing inspectors as entry points.
2. ForceField/Wind: select/edit each wind, gust, burst and trigger element; add a trigger registry/execution timeline; expose live 2D/3D debug shapes with stable distinct glow colours. Reuse native ForceFieldSpace/visualization and inspector components.
3. Particle/VFX: reuse the 52-preset native library and authorable ParticleSpace files; verify lightning, black-hole and derez runtime results; add only missing capabilities. Keep particle effects usable without a wind field and composable when one is present.
4. Fracture: port the fetched runtime and engineering-bake algorithms into native C++/GPU modules with deterministic and resource-safe data structures. Validate convex clipping closure/volume, token-bond connectivity, impulse response, material paths, debris collision proxies, and runtime performance before calling it a port.

### Batch 5 — Vehicle/Tyre authoring

1. Rework inspectors using the native Sun inspector as the styling baseline: useful quick controls, toggle/cards (e.g. ABS), concise live telemetry/infographic tiles, and clear units/limits.
2. Extract a reusable curve editor and migrate vehicle response curves to it without losing knot insertion/deletion or persistence.
3. Add a vehicle authoring workspace/tab for components, controls, toggles and in-game test flow. Audit the demo derez effect and connect it to the native Particle/VFX pipeline where appropriate.

### Batch 6 — Separate Editor and Vehicle cameras; camera components (new priority)

1. Audit native camera ownership, switching and persistence across `SceneViewportNavigation`, `VehicleCameraSolver`, Everest’s workspace/runtime, render-pipeline records and the existing camera toolbar. Keep an Editor Camera for viewport navigation and a separate Vehicle Camera for the driven/cinematic subject; expose both in one native selector rather than conflating the editor flight rig with the vehicle camera rig.
2. Define an authorable camera component/record (or extend the existing camera record only if the audit proves that is the persisted source of truth) with practical lens/projection settings such as FOV, clipping, aspect/sensor fit and focus. Support switching between Editor Camera and Vehicle Camera without destroying either state.
3. Inspect the existing Sun-owned lens-flare authoring/render path before changing ownership. The requested direction is camera-owned LensFlare and MotionBlur subcomponents, with the sun/light remaining a flare source if that is how the renderer derives it. Add a camera-shake component with seed/amplitude/frequency/envelope controls and deterministic test hooks.
4. Inventory native post-processing capabilities and algorithms first; integrate a suitable motion-blur path (velocity/reprojection or a justified alternative) in the native renderer, not as an HTML-only effect. Keep lens flare, blur and shake independently optional and composable.
5. Inspect Project Zero editor and the user-named `SultanAladin/Frontier`, `Frontier-`, and `Slate` repositories/branches without switching the working branch. Locate the referenced Camera Component, compare actual code/data contracts, and selectively port only compatible algorithms after license/source review.
6. Add dockable in-app camera inspector/components with native styling. Validate editor/game switching, camera settings persistence, flare source/view behaviour, blur under motion, and shake determinism in native C++/GPU tests and runtime captures.

### Batch 7 — Completion gates

- Native editor and non-editor builds; focused CTests including PhysicsSpace, VehicleDynamics, SceneGeometry, FluidDynamics, fracture/collision, camera/post-processing and any authoring access checks.
- Native runtime review/captures for Lobby and Proving Ground HMI, vehicle placement/gizmo, slip-only smoke, movable cones, camera switching/effects, and editor tabs.
- Report plainly what is native vs Experimental, what was already present but inaccessible/incomplete, what was implemented, and what remains unverified. Do not imply a visual or solver result was proven by an HTML mockup.

## Current batch status

- [x] Prior Fluid Editor / physics workspace changes committed as `6813d15`.
- [x] Repository/source inventory started; fracture reference fetched without branch switch.
- [x] Shared resting-hub placement path, vehicle gizmo access, direct HMI toolbar action, and construct catalogue access implemented on the session branch.
- [x] Native editor/runtime/validation builds completed; focused `VehicleDynamicsValidation` and `LobbySessionValidation` CTests passed.
- [ ] Manual native viewport checks/captures for Lobby/Proving Ground placement, gizmo and HMI remain outstanding.
- [ ] Commit/push the validated Batch 1 changes, then research the new Editor Camera/Vehicle Camera component request without switching branches.
