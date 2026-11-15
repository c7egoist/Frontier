# Map Baking card

This is the inspector of TextureStudio's **Baking** workspace, rebuilt as a **single card** in the Project Zero style, alongside the [Material](../MaterialInspector/README.md) and [Pattern / Stamp](../ArtworkInspector/README.md) cards. It contains no three.js and no baker: it edits bake settings, estimates their cost, and hands a request to whatever host bakes.

```
python3 Experimental/BakeInspector/Serve.py        # http://0.0.0.0:8099/
```

## What changed from the TextureStudio inspector

| TextureStudio | This card |
| --- | --- |
| Resolution / Rays per Px / Volume SDF trio, which echoed the sliders. | **Output:** memory of the results, stacked by map group. **Ray budget:** rays traced plus an estimated time on the chosen device; turns amber or red as it grows. **Result:** Unbaked, Baking (stepped meter), Fresh, or **Stale** once a setting that affects output changes. Switching device does not make results stale. |
| An 18-item checklist on one side and always-open "Ray Execution & Surface Settings", "3D Volume SDF" and "Export" cards on the other. It was unclear which slider affected which map. | Maps are grouped (Normals, Surface, Masks & IDs, Volume & Distance). The dot queues a map. **Opening a map shows only the settings that shape it** (for example, AO shows rays per texel and ray distance). It says when a setting also drives other queued maps, and shows that map's own memory and ray cost. |
| Settings scattered across cards. | Rarely changed output settings (resolution, padding, cage, tangent convention) sit in one folded "Output & cage" section. |

## Bake hosting

`Mount(element, { Bake, OnResult, OnSource })`:

- `Bake(request, { Progress(fraction, text, mapIndex), Signal })` resolves to `{ Device, Ms, Maps, Data }`.
  - `request` is `BakeModel.Request(settings)`. It is split the way TextureStudio's `runBake` splits it: `surface` holds `bakeMeshMaps` options and channels; `volume` holds `bakeVolumeSdf` options.
  - Abort through `Signal` when the user presses Cancel.
- `OnSource(slot, File | null)` passes custom low / high meshes (`.obj` / `.stl`) to the host.

This page attaches no host. **Bake** runs a clearly labelled dry run that walks the queue on the estimated timings, so the progress, cancel and staleness behaviour can be tried.

## Data

- **`BakeModel.js`** is pure. Its defaults and ranges are field-for-field those of `BakingWorkspace` (teapot; normal, AO, curvature, height and SDF; 512 px; 12 rays; cage 0.14 / 0.14; SDF 36³ signed).
- **`Engine/BakeCatalog.js`** holds the map catalog (18) and studies (5), copied verbatim from `Engine/BakingEngine.js`.
- **Estimates:**
  - RGBA8 maps, float32 SDF voxels.
  - Rays per texel by map: cage maps 2, hemisphere maps N, bevel 8; curvature, IDs and wireframe are free.
  - UV coverage is assumed to be 72 %.
  - Throughput is assumed to be about 320 M rays/s on GPU and 4.5 M on CPU.
  - These are orders of magnitude for comparing settings, not promises.
- Settings persist in `localStorage["Frontier.BakeInspector.v1"]`. Preset files use `frontier.bake.v1`; request files use `frontier.bake-request.v1`.

## Checks

```
node Experimental/BakeInspector/Scripts/CheckBakeInspector.mjs
JSDOM_DIR=/tmp/smoke node Experimental/BakeInspector/Scripts/SmokeBakeInspector.mjs   # npm i --prefix /tmp/smoke jsdom@25
```
