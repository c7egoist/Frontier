# Frontier proof gallery

`Exhibits/Gallery/` is the single durable destination for rendered images, telemetry extracts, proof logs, and their provenance. Rebuildable proof sources live under `Exhibits/Workbench/`; throwaway executables and raw rendering intermediates belong in `_AgentScratch/` or feature-local diagnostics and are not authoritative evidence.

## Naming and execution truthfulness

- `*_CPU_Mirror.png` means a CPU-rendered mirror/reference. It is **not** represented as a native Vulkan, Slang, or ImGui capture.
- Each gallery contains `Provenance.json`, which identifies the scene, command, measured results, execution boundary, and SHA-256 values for durable sibling artifacts.
- `*_FrameDifference_x20_CPU_Mirror.png` visualises twenty-times-amplified temporal change for inspection.
- Native GPU/UI captures should use a clearly separate `*_Native_*` name and state the capture environment in provenance.

## Gallery map

```text
Gallery/
├── CodeImages/                 Dynamic code-image ABI lifecycle result and provenance
├── Drive/                      Project-Drive opening/flake CPU scene proof
├── ProjectDriveCpuReference/   Real ControlVehicle telemetry + CPU Surfel-GI reference
├── ProjectZero/                Fresh Project-Zero showcase and M10 material-library CPU mirrors
├── ReflectionReservoir/        Baseline, ReSTIR, and high-sample reflection reference
├── RenderModes/CurrentUi/      Cornell plain-raster / Surfel-GI / ray-traced comparison
└── SurfelGi/Cornell/           Cornell Surfel-GI convergence, coverage, and diagnostic views
```

The files in this hierarchy are intentionally portable PNG, text/CSV, Markdown, and JSON artifacts.
