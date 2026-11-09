# Experimental Remastered

Unified **Sun Inspector + Fluid Editor** studio interface across Frontier's interactive simulation tools:

- **EditorInterface (`Experimental Remastered/EditorInterface/`)** — Redesigned **Particle Studio** wrapping the unmodified `eos` WebGPU particle, light fibre, molecular physics, lightning, and 3D force-field engine (`ForceFieldVisualization` + `ParticleFieldReadback` + `SoftwarePreviewEngine`).
- **FractureEditor (`Experimental Remastered/FractureEditor/`)** — Redesigned **Fracture Studio** wrapping all 6 `eb353da2` fracture engines (`EngineeringBakedFracture`, `FastRuntimeFracture`, `ConvexPartitioning` Griffith/LEFM/Voronoi/Dendritic, `Piece SDF`, `RigidBodyDynamics`, and `CelestialAtmosphereModel` Sun/Atmosphere/Clouds) under the identical Sun + Fluid studio system.
- **PhotometricEditor (`Experimental Remastered/PhotometricEditor/`)** — Unified **Photometric & Light Studio** combining Project Zero's 7 physical light inspectors (`pointlight`, `spotlight`, `ieslight`, `arealight`, `tubelight`, `ledlight`, `ledstrip`), real LM-63 Type-C `.ies` candela profiles & custom import/export, Environment Lights (`envdome`, `sun`, `moon`, `stars`, `lensflare`, `atmosphere`, `post`), and a Three.js WebGL2 ACES / False-Colour Isolux 3D calibration stage.
- **ForceFieldEditor (`Experimental Remastered/ForceFieldEditor/`)** — Unified **Force Field & Wind Studio** supporting direct scene placement of **Wind Generators** and 16 bounded forcefield classes, strict finite spatial influence envelopes (`Sphere`, `Column`, `Box` + falloff), anti-clutter **RK2 Flow Lines** + **sparse Vector Field** visualization, and a **3D Field Stage** alongside `Map 2D` (no Oblique view).
- **AssetInspector (`Experimental Remastered/AssetInspector/`)** — A standalone **Vehicle Blueprint Editor** with a node graph, editable engine/turbo/Pacejka curves, categorized physics details and live debug channels. Its WebGL viewport loads the same `ControlVehicle` body, tyre and rim FCT1 assets used by Vehicle HMI directly from `Experimental/VehicleProvingGrounds/Archive/`; it runs independently of the Frontier editor.

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

# Asset Inspector (port 8086)
python3 -m http.server 8086 --directory "Experimental Remastered/AssetInspector"
```
