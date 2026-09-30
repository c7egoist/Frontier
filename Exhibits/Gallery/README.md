# Frontier proof gallery

`Exhibits/Gallery/` is the single durable destination for rendered images, telemetry extracts, proof logs, and their provenance. Rebuildable proof sources live under `Exhibits/Workbench/`; throwaway executables and raw rendering intermediates belong in `_AgentScratch/` and are not authoritative evidence.

## Naming and execution truthfulness

- `*_CPU_Reference.*` is the current canonical name for a CPU-rendered reference. It is **not** represented as a native Vulkan, Slang, or ImGui capture.
- Each gallery contains `Provenance.json`, which identifies the scene, command, measured results, execution boundary, and SHA-256 values for durable sibling artifacts.
- `*_FrameDifference_x20_CPU_Reference.png` visualises twenty-times-amplified temporal change for inspection.
- Native GPU/UI captures should use a clearly separate `*_Native_*` name and state the capture environment in provenance.

## Gallery map

```text
Gallery/
├── CodeImages/                 Dynamic code-image ABI lifecycle result and provenance
├── Drive/                      Project-Drive visibility, materials, Surfel/ReSTIR, XPBD, motion GIFs and telemetry graphs
├── ProjectZero/                Project-Zero material-grid visibility / Surfel-GI / ReSTIR / ray-traced CPU references
└── ReflectionReservoir/        Baseline, ReSTIR, and high-sample reflection reference
```

The prior closed-room reference galleries were removed from the canonical proof set. Project-Zero now opens the material
scene by default, and retained Project-Zero evidence is material-grid evidence.
