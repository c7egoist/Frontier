# Frontier proof gallery

`Exhibits/Gallery/` is the single durable destination for rendered images, telemetry extracts, proof logs, and their provenance. Rebuildable proof sources live under `Exhibits/Workbench/`; throwaway executables and raw rendering intermediates belong in `_AgentScratch/` or feature-local diagnostics and are not authoritative evidence.

## Naming and execution truthfulness

- `*_CPU_Reference.*` is the current canonical name for a CPU-rendered reference. It is **not** represented as a native Vulkan, Slang, or ImGui capture. Older retained galleries may use the synonymous legacy `*_CPU_Mirror.*` suffix.
- Each gallery contains `Provenance.json`, which identifies the scene, command, measured results, execution boundary, and SHA-256 values for durable sibling artifacts.
- `*_FrameDifference_x20_CPU_Mirror.png` visualises twenty-times-amplified temporal change for inspection.
- Native GPU/UI captures should use a clearly separate `*_Native_*` name and state the capture environment in provenance.

## Gallery map

```text
Gallery/
├── CodeImages/                 Dynamic code-image ABI lifecycle result and provenance
├── Drive/                      Project-Drive driven by the real VehicleSolver: driving GIFs, material angles, run graphs
├── Editor/                     The engine's own EditorProof, run headless — eight editor phases
├── ProjectZero/                The 20 x 20 material grid through the visibility raster, ReSTIR DI and a reference path trace
├── ReflectionReservoir/        Baseline, ReSTIR, and high-sample reflection reference
└── RenderModes/CurrentUi/      Material-grid plain-raster / Surfel-GI / ray-traced comparison
```

The files in this hierarchy are intentionally portable PNG, text/CSV, Markdown, and JSON artifacts.
