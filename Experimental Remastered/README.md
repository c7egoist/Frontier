# Experimental Remastered

Unified **Sun Inspector + Fluid Editor** studio interface across Frontier's interactive simulation tools. For shared component/layout patterns, see the [Experimental Remastered UI Component Guidelines](./UI_COMPONENT_GUIDELINES.md); `CLAUDE.md` points contributors there and uses Vehicle Lab as the Outliner / Stage / Inspector reference.

- **EditorInterface (`Experimental Remastered/EditorInterface/`)** — Redesigned **Particle Studio** wrapping the unmodified `eos` WebGPU particle, light fibre, molecular physics, lightning, and 3D force-field engine (`ForceFieldVisualization` + `ParticleFieldReadback` + `SoftwarePreviewEngine`).
- **FractureEditor (`Experimental Remastered/FractureEditor/`)** — Redesigned **Fracture Studio** wrapping all 6 `eb353da2` fracture engines (`EngineeringBakedFracture`, `FastRuntimeFracture`, `ConvexPartitioning` Griffith/LEFM/Voronoi/Dendritic, `Piece SDF`, `RigidBodyDynamics`, and `CelestialAtmosphereModel` Sun/Atmosphere/Clouds) under the identical Sun + Fluid studio system.
- **PhotometricEditor (`Experimental Remastered/PhotometricEditor/`)** — Unified **Photometric & Light Studio** combining Project Zero's 7 physical light inspectors (`pointlight`, `spotlight`, `ieslight`, `arealight`, `tubelight`, `ledlight`, `ledstrip`), real LM-63 Type-C `.ies` candela profiles & custom import/export, Environment Lights (`envdome`, `sun`, `moon`, `stars`, `lensflare`, `atmosphere`, `post`), and a Three.js WebGL2 ACES / False-Colour Isolux 3D calibration stage.
- **ForceFieldEditor (`Experimental Remastered/ForceFieldEditor/`)** — Unified **Force Field & Wind Studio** supporting direct scene placement of **Wind Generators** and 16 bounded forcefield classes, strict finite spatial influence envelopes (`Sphere`, `Column`, `Box` + falloff), anti-clutter **RK2 Flow Lines** + **sparse Vector Field** visualization, and a **3D Field Stage** alongside `Map 2D` (no Oblique view).
- **Vehicle Lab (`Experimental Remastered/AssetInspector/`)** — A standalone vehicle studio with a prominent WebGL viewport showing the actual Vehicle HMI `ControlVehicle` body, tyre and rim FCT1 assets; a component Outliner, categorized Inspector, engine/turbo/Pacejka curves with selectable interpolation, ten exterior debug channels, addable vehicle components, and a throttle/brake drive-simulation preview.

## Quick start

```bash
# Particle Studio (port 8083)
python3 "Experimental Remastered/EditorInterface/Serve.py"

# Fracture Studio (port 8082)
python3 "Experimental Remastered/FractureEditor/Serve.py"

# Photometric & Light Studio (port 8084)
python3 "Experimental Remastered/PhotometricEditor/Serve.py"

# Force Field & Wind Studio (port 8085)
python3 "Experimental Remastered/ForceFieldEditor/Serve.py"

# Vehicle Lab (port 8086)
python3 "Experimental Remastered/AssetInspector/Serve.py"
```
