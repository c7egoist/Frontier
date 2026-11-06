# FluidSmokeEditor — 1:1 C++ port of the exhibit's fluid/smoke editor

This directory is the C++ port of the fluid/smoke editor in `Experimental/VehicleHmiPrototype`
(the distance-field GI exhibit's Smoke & fire editor and its Slate `3c987f3` plume system).
Nothing here is a re-implementation: every module is a 1:1 port of the named exhibit file,
entry point for entry point.

## Port map

| Exhibit (JS / WGSL) | C++ port |
|---|---|
| `Source/SmokeSequence.js` — `GasParameterCatalogue`, `ConstructGasParameters`, `MapPlumeSettings`, `ProjectPlumeTelemetry`, `GasPresets`, class `SmokeSequence` | `Source/GasParameters.h/.cpp`, `Source/SmokeSequence.h/.cpp` |
| `Source/PlumeSpace.js` — grades, defaults, toroidal window, `Schedule`, `EncodeRecord` (256-byte record), fire lights, `RecordTransport` | `Source/PlumeSpace.h/.cpp` |
| `Source/PlumeSourceProjection.js` — `SmokeSpecification`, onset hysteresis, wheel/arch/flame/exhaust/burst sources, lights, bounds | `Source/PlumeSourceProjection.h/.cpp` |
| `Source/SceneDistanceSpace.js` + `DistanceTraversal.wgsl` — the scene distance field the plume samples; moving occupants contribute point velocity | `Source/SceneDistanceField.h/.cpp` |
| `Source/TransformProjection.js` (vector/quaternion helpers) | `Source/PlumeMath.h` |
| `Source/EditorShell.js` + `Source/InspectorPages.js` + `Source/EditorControls.js` — outliner · viewport · inspector shell, the Smoke & fire page (Domain/Source/Simulation/Appearance/Fire/Presets), slider model | `Source/FluidSmokeEditor.h/.cpp` |
| `Shader/PlumeRecords.wgsl` — `PlumeRecord`, `PlumeSource`, `FireLightRecord`, toroidal addressing, Gaussian source weight, blackbody colour | `Source/PlumeRecords.h` |
| `Shader/PlumeAdvection.wgsl` — `AdvectVelocity`, `AdvectThermo`, `ResolveSunTransmittance`, `ResolveSolid` | `Source/PlumeTransport.cpp` |
| `Shader/PlumeVorticity.wgsl` — `ResolveCurl`, `ConfineVorticity` | `Source/PlumeTransport.cpp` |
| `Shader/PlumePressure.wgsl` — `ResolveDivergence`, `RelaxPressure`, `ProjectVelocity` | `Source/PlumeTransport.cpp` |
| `Shader/PlumeMarch.wgsl` — `MarchPlume` (coverage-clipped scattering quadrature) | `Source/PlumeMarch.cpp` |
| `Shader/FireIllumination.wgsl` — `ResolveFireArrival` | `Source/PlumeMarch.cpp` |

The WGSL sources are kept unchanged in `Shaders/` as the porting reference.

## Opening the editor

In `EverestWindow` (GLFW front-end, `FRONTIER_ENABLE_GLFW=ON`):

- **1** — Smoke & fire editor (tyre sources)
- **2** — Fluid editor (smoke test emitter 3 m ahead of the car)
- **3** — Plume editor (fire test emitter 3 m ahead of the car)
- **Esc** — close; **Up/Down** — pick a gas slider; **Left/Right** — step it

While open, the plume lattice runs in the Proving Grounds SDF world: the car is a dynamic
occupant (it obstructs the lattice and drags the smoke with its point velocity), driving with
the handbrake or steering hard at speed produces tyre smoke, and a sustained slide ignites the
tyre (fire + soot + fire light that illuminates the course through `ResolveFireArrival`).
The marched plume is composited over the frame; the editor chrome is drawn as outliner /
inspector columns with the full text in the window title (the repo's font-free convention).

## Validation

`Validation/FluidSmokeValidation.cpp` (CMake target `FluidSmokeValidation`, ctest name
`FluidSmokeValidation`) checks the catalogue, settings mapping, onset hysteresis, the step
record, SDF obstruction and occupant velocity, a simulated burnout through the transport
passes, the march, fire illumination and the editor UI model:

    g++ -std=c++17 -I. Validation/FluidSmokeValidation.cpp Experimental/FluidSmokeEditor/Source/*.cpp -o /tmp/FluidSmokeValidation && /tmp/FluidSmokeValidation

`Validation/FluidSmokeProof.cpp` (CMake target `FluidSmokeProof`, ctest name `FluidSmokeProof`) renders a
scripted burnout + tyre fire through the ported lattice to `VisualProof/FluidSmokeEditorProof.png` —
see the committed proof image.
