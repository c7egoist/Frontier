# Experimental Remastered

Unified **Sun Inspector + Fluid Editor** studio interface across Frontier's interactive simulation tools:

- **EditorInterface (`Experimental Remastered/EditorInterface/`)** — Redesigned **Particle Studio** wrapping the unmodified `eos` WebGPU particle, light fibre, molecular physics, lightning, and 3D force-field engine (`ForceFieldVisualization` + `ParticleFieldReadback` + `SoftwarePreviewEngine`).
- **FractureEditor (`Experimental Remastered/FractureEditor/`)** — Redesigned **Fracture Studio** wrapping all 6 `eb353da2` fracture engines (`EngineeringBakedFracture`, `FastRuntimeFracture`, `ConvexPartitioning` Griffith/LEFM/Voronoi/Dendritic, `Piece SDF`, `RigidBodyDynamics`, and `CelestialAtmosphereModel` Sun/Atmosphere/Clouds) under the identical Sun + Fluid studio system.

## Quick start

```bash
# Particle Studio (port 8082 standalone) or root hub
python3 "Experimental Remastered/EditorInterface/Serve.py"

# Fracture Studio (port 8082)
python3 "Experimental Remastered/FractureEditor/Serve.py"
```
