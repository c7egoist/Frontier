# Exhibits — every recovered editor in one place

This folder is the **single reference** for all editor UIs recovered from the commit history of
`SultanAladin/Frontier-`, `SultanAladin/Frontier`, `SultanAladin/Slate` and `unassignedinbox/Slate`
(search method + full provenance: [`../FOUND.md`](../FOUND.md)). Launcher: [`../index.html`](../index.html).

Serve from the repo root (`python3 -m http.server 8080 --bind 0.0.0.0`), then open the paths below.

## The editor suite you asked for (fracture · fluid-gas · wind · particle)

| Exhibit | Open | Origin | Notes |
|---|---|---|---|
| ★ **ProjectZeroEditor** | `ProjectZeroEditor/index.html` | Frontier- `arena/10e50e56-frontier` (origin: unassignedinbox/Slate `arena/01a0fd48-slate`) | **The one UI with all four editors.** UI-only (checker viewport, no engine connection). Fracture: geometry object → Fracture card → Enable → ↗. Gas→Fluid, Emitter→Particle, World→Wind. Prebuilt, self-contained. |
| **FractureEditor** | `FractureEditor/index.html` | same branch | Standalone expanded fracture page opened by Project-Zero. three.js WebGL render. Prebuilt; source rebuilt here byte-identical after a 1-file repair (see FOUND.md). `Captures/` = proof screenshots. |
| **Fluid** | `Fluid/dist/index.html` | same branch | Gas/smoke fluid editor (WebGL2/WebGPU). Project-Zero iframes this build. Source in `src/`, build = `npm run build`. |
| **ParticleEditor** | `ParticleEditor/index.html` | same branch | Emitter authoring hosted by Project-Zero for gas emitters. No build step. |

⚠️ **Keep `ProjectZeroEditor/`, `FractureEditor/`, `Fluid/`, `ParticleEditor/` as siblings** — they
cross-open `../FractureEditor/index.html`, `../Fluid/dist/index.html`, `../ParticleEditor/index.html`.
(`CliffSequence/` also reads `../Fluid/src/ThemeSpecification.css`.)

## Other editors from those repos

| Exhibit | Open | Origin | Notes |
|---|---|---|---|
| **FrontierEditor** | `FrontierEditor/dist/index.html` | Frontier- `main` / same branch | Older scene-inspector browser editor. Wind/weather + fluid-graphics cards, **no fracture**. Build = Vite+React. |
| **RoadEditor** | `RoadEditor/dist/index.html` | unassignedinbox/Slate `arena/06b26e41-slate` (`road-editor/`) | Spline road authoring, 3D preview, drive-through. Prebuilt dist; `README.md` inside. |
| **SolidArc** | `SolidArc/index.html` | Frontier- `arena/10e50e56-frontier` | Geometry workspace. |
| **FluxParticleStudio** | `FluxParticleStudio/dist/index.html` | unassignedinbox/Slate `arena/06b26e41-slate` (`particle-editor/`) | “Flux” AE-style GPU particle editor. Prebuilt dist. |
| **FluidNodeEditor** | `FluidNodeEditor/FluidNodeEditor.html` | SultanAladin/Frontier `smrt-soft-shadows` | Node-graph fluid prototype (master = shell only). Needs internet: three.js from unpkg. |
| **NodeFlowEditor** | `NodeFlowEditor/NodeFlowEditor.html` | SultanAladin/Frontier `smrt-soft-shadows` | Node-flow editor + terrain viewport (master = shell only). Needs internet: three.js from unpkg. |
| **WebFluidLab** | `WebFluidLab/dist/index.html` | unassignedinbox/Slate `arena/01a102c5-slate` | WebGPU/WebGL2 SPH liquid lab. Build = `npx tsc && npx vite build --base ./`. |

## More browser exhibits from the same Frontier- branch (`arena/10e50e56-frontier`, ex-`Experimental/`)

| Exhibit | Open | Notes |
|---|---|---|
| **CliffSequence** | `CliffSequence/index.html` | Cliff formation. Reads `../Fluid/` theme (siblings matter). |
| **Ocean** | `Ocean/Ocean.html` | Ocean v3 FFT sea, single file. |
| **DeformationIntegrator** | `DeformationIntegrator/index.html` | Deform/transport. Review doc at `../Docs/DeformationTransportReview.html`. |
| **DistanceIntegrator** | `DistanceIntegrator/index.html` | SDF raymarching. Review doc at `../Docs/DistanceTransportReview.html`. |
| **RadianceIntegrator** | `RadianceIntegrator/index.html` | WebGPU radiance transport. Review doc at `../Docs/RadianceIntegratorReview.html`. |
| **RadianceProjection** | `RadianceProjection/index.html` | Raster probe GI. |
| **RadianceSequence** | `RadianceSequence/index.html` | 3D radiance cascades. |
| **SpatialHud** | `SpatialHud/index.html` | Spatial HUD tablet. |

Upstream stubs `Experimental/Liquid` and `Experimental/Water` on that branch contain only a README each
(no app) — not copied. The upstream catalogue is preserved at `Docs/UpstreamExperimentalREADME.md` in this folder.

## Reference-only material in this folder

| Exhibit | What it is |
|---|---|
| **NativeSurfaces/** (16 × `.h`) | The native C++ ports of these editor panels (`Engine/Editor/*Surface.h`, `FluidEditorControls.h`, `WindBindingControls.h` @ Frontier- `arena/10e50e56-frontier`). **Reference only** — they `#include` engine headers and need the full Frontier- Vulkan build to compile/run; the browser equivalents above are the runnable versions. Native proof galleries (`Exhibits/Gallery/*Native/` upstream) were not copied. |
| **Docs/** | Editor docs copied from Frontier-: `BrowserEditorHistory.md`, `ParticleEditor.md`, `FrontierEditorComponents.md`, `BaseGeometryAndFractureEditorNotes.md`, `MainEditorIntegration.md`. |
| **EngineContent/** | DM Sans fonts (`Fonts/SunReference/`) the built Fluid CSS requests at runtime. (A second copy sits at the repo root `../EngineContent/` for `FractureEditor/Build.mjs`.) |

## Rebuild commands (only if you edit sources)

```bash
cd Exhibits/Fluid          && npm install && npm run build
cd Exhibits/FrontierEditor && npm install && npm run build
cd Exhibits/WebFluidLab    && npm install && npx tsc && npx vite build --base ./
cd Exhibits/FractureEditor && npm install && npm run build   # regenerates index.html
# ProjectZeroEditor/index.html is prebuilt; rebuilding needs the full upstream Frontier- tree.
```
