# stitch. / Garment Lab

A browser-based dress-design and real-time cloth-draping prototype. The editor is organized as a small material / pattern / garment / solver node graph on the left and an interactive 3D fitting stage on the right.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL in a WebGPU-capable browser (a secure context is required outside localhost). `npm run build` creates the static app in `demo/`, with relative asset paths so it can be served from a subdirectory such as raw.githack. The preferred path uses WebGPU compute shaders for a 64 × 64 Verlet cloth solver and WebGPU rendering. Browsers without WebGPU use the same procedural 3D character and garment in a WebGL2 preview with a CPU cloth solver.

## What is in the prototype

- Procedurally modeled mannequin/body and dress — no external model downloads or asset licensing required.
- Three dress silhouettes: silk slip, soft midi and evening gown.
- Live fabric color, fabric preset, weight, bias-stretch and airflow controls.
- GPU cloth integration, distance constraints, body/floor collision and a per-frame render path when WebGPU is available.
- Orbit, zoom, auto-rotate, wireframe, mannequin visibility, pause/reset, speed and timeline controls.
- Save settings to local storage and export the current look configuration as JSON.
