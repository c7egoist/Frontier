# Project-Drive — CPU scene evidence

This gallery contains durable visual evidence for the Project-Drive scene. The primary proof is a dependency-free C++
CPU mirror of the same course and ControlVehicle geometry the windowed application loads; it needs no GPU, window, or
external package. Its source and runner are in [`Exhibits/Workbench/Drive/`](../../Workbench/Drive/).

| File | What it shows |
|---|---|
| `DriveScene.png` | The current opening camera: checker pad, grey ramp, yellow speed bump, orange cones, and the real ControlVehicle under sun, sky, surfel GI, and flake clearcoat. |
| `DriveBodyFlakes.png` | Three-quarter front close-up proving the clearcoat and sparse metallic flakes on the body. |
| `DriveSceneProvenance.json` | Portable Release and Debug compile/run records plus SHA-256 hashes for the CPU proof sources and its two generated PNGs. |
| `DriveSceneSurfelGi.png` | The Project-Drive headless `SurfelReference` render at 800×450. |
| `DriveScenePreview.png` | The earlier CPU raster preview of the Tractrix course geometry. |
| `BoxCar.png` | The SolidArc render of the BoxCar chassis and four wheels, with the required body-to-tyre clearance. |

## What the current CPU proof verifies

- The scene assembles as 5,640 triangles: course 2,092, ControlVehicle body 2,780, and wheels 768.
- The body, course, and four wheels are present; every rendered pixel is finite; and the scene covers a meaningful part
  of the camera frame.
- Direct sun, sky, world-space surfel indirect light, and the body flake clearcoat are all exercised.

## Regenerate

From `VehiclePhysics/Overlay`:

```python
python3 Exhibits/Workbench/Drive/DriveSceneProof.py
```

The runner compiles the proof with C++20 in Release and Debug using `-Wall -Wextra -Werror`, runs both self-gating
renders, emits the flake close-up, and refreshes `DriveSceneProvenance.json`. A failed gate returns a non-zero exit.
