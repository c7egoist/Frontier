# ParticleWorkspace — Frontier Particle Studio (`ParticleEditor` UI + VectorFieldVisualizer Forces & Visualizations)

Retains Frontier's original **Sun Inspector + Fluid Editor** `ParticleEditor` workspace layout and UI style (`index.html`, `ParticleEditor.css`, `ParticleEditor.js`, `StudioControls.js`, `SoftwarePreviewEngine.js`, `ParticleFieldReadback.js`, and `Engine/` `eos` WebGPU + 52-preset system), while replacing the force-field model and viewport overlay with the force-field solver and multi-axis 3D visualizations from `Experimental/VectorFieldVisualizer/`:

- **20 Force Models + Symbolic `VectorFieldLang` Formulas** (`Engine/VectorForceModels.js`, `Engine/VectorFieldLang.js`, unified with `Engine/forcefields.js`): `LinearWind`, `FlowStream`, `Buoyancy`, `RadialBurst`, `Attractor`, `Repulsor`, `AxisAttractor`, `SplineForce`, `SurfaceAdhesion`, `Containment`, `Vortex`, `Torque`, `MagnusForce`, `Drag`, `Lift`, `CurlNoise`, `BrownianNoise`, `LorentzField`, `MagneticDipole`, and `CustomFormula` across `Flow` (`m/s`), `Accelerate` (`m/s²`), and `Damp` (`1/s`) buckets with `Continuous` / `Modulated` / `Impulse` envelopes and `Everywhere` / `Sphere` / `Column` / `Box` reach shapes.
- **Additive Multi-Axis 3D Visualization Layers** (`ParticleForceViz.js`): `XZ` / `XY` / `YZ` / `All 3` orthogonal slice planes, Channel / Turbo / Isoline LUT heatmaps, marching-squares iso-contour isolines, bidirectional 3D RK4 streamlines with traveling pulse packets, 3D vector lattice arrows, reach-volume wireframes + expanding shockwave rings, flow tracers, badge labels, and minimap — all toggleable and addable right inside the existing `Force Field` inspector tabs (`Overview`, `Forces`, `Overlay & Probe`), viewport channel dropdown, and `+` popover menu without changing workspace layout or UI style.

## Running & Validation

```bash
# Serve ParticleWorkspace on port 8096
python3 Experimental/ParticleWorkspace/Serve.py 8096

# Serve original unmodified Experimental/ParticleEditor/ on port 8083
python3 Experimental/ParticleEditor/Serve.py

# Run validation suites
node Experimental/ParticleWorkspace/Engine/CheckForceFields.mjs
node Experimental/ParticleWorkspace/ParticleWorkspaceValidation.mjs
```
