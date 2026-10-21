# Session diagnostics, transforms and cluster inspection

Implemented in `Experimental/VehicleHmiPrototype` on 2026-10-21. Refresh the existing port-8080 preview.

## Diagnostics in the Render outliner group

The optional recorder starts when the editor shell is constructed. Select **Diagnostics** for:

- Session recording/pause, clear, remove/discard and reinstall.
- Recent frame interval / CPU update-and-encode / editor refresh graphs; recent median and p99 frame time.
- A separate editor/recorder CPU graph.
- Selectable raw GPU-pass graph, recent per-pass mean ranking, and per-pass-normalized heatmap. Missing pass samples are absent/gaps, not fabricated zeros.
- Current captured quality, screen/cloud dimensions, cloud controls and settings revision, plus recent event history.
- **Copy all CSV** and **Download CSV**. If iframe/browser clipboard permission blocks copying, a selected text area provides manual Ctrl+C / Cmd+C fallback.

The charts display bounded recent windows, but CSV exports **all retained rows and all columns**, not just the selected chart. Data is in memory; reload loses it. The 60,000-row cap stops recording with a visible status rather than silently overwriting early session data. Export or clear before continuing a full recorder. Removal detaches observers/GPU callback and discards rows; pause preserves rows. No server upload or persistence was added.

### Data format

CSV uses a union of all row keys and standard quoted-cell escaping; vectors/objects are JSON inside quoted cells. Rows have a session ID, clear epoch, session-relative arrival time and settings revision:

- `frame`: rendered-frame ID, **unclamped** interval, FPS, CPU frame work, editor refresh JS duration, refresh flag, draw/instance/cluster counters, camera position and partial recorder self-timings.
- `gpu`: raw timestamp durations of passes actually measured, originating frame/settings revision, and originating sample time separate from asynchronous arrival time.
- `settings`: immutable full host-settings snapshot plus grade, actual screen/trace/cloud extents, device pixel ratio, cluster leaf budget and overlay state. Only changed snapshots are retained, checked each rendered frame and on editor-setting edits.
- `event`: session metadata, recording controls, inspector builds, object-transform commits, cluster edits, visibility changes, browser errors, uncaptured GPU errors/device loss, and browser long tasks where supported.

Late GPU readbacks from a cleared or removed session cannot contaminate the replacement recording. The raw-sample callback is captured before asynchronous mapping, so replacing/removing a recorder does not route an old sample to a new callback.

### Measurement limits

Existing HUD GPU values remain smoothed. Diagnostics uses raw **available** timestamp samples; it does not synchronously stall the device to collect every frame. New separate timestamp pairs cover **Present** (including cloud reconstruction) and **Cluster culling**. `Clouds` alone is not the complete cloud system cost; shadows and presentation are separate. Do not add pass values collected from different frames to claim total GPU frame time.

`ui_js_ms` wraps the editor's frame presentation work, including the gizmo and, when refreshed, readouts/charts/outliner. `ui_inspector_build` records inspector construction. These do **not** measure full layout/paint/compositor work or all event-handler time. Page long tasks cannot be attributed exclusively to UI. Recorder self-timings are partial, not a complete overhead benchmark. Charts refresh with existing 5 Hz editor updates; recorder removal and cluster-overlay disable support comparisons. No zero-cost or desktop-FPS claim.

## Object movement

Select an object from **Objects** (or vehicle/cone/prop/local-weather entry). Supported translation adapters expose actual scene/physics/settings state, not proxy-only transforms:

- World XYZ fields and **Frame selection** in non-native object inspectors.
- Drag coloured world axes, plane pads, or the central free-move handle.
- `G`, then optional `X/Y/Z`; Ctrl snaps, Enter/click confirms, Escape/right-click restores. `F` frames the target; `S` scales local weather volumes.
- Static shapes use world-bounds centres for the handle. This fixes baked-coordinate shapes previously presenting their handle at world origin.
- Static moves upload occupant records, invalidate affected distance bounds/lighting and refresh obstacle bounds on commit. Rigid bodies use the physics placement path.

The vector/modal interaction is adapted to this Z-up WebGPU editor from the hosted Frontier celestial demo's SVG fallback, inspected at `SultanAladin/Frontier-` commit **eaab23ef83075755dcf9246668d2740508826d31**, `docs/celestial/index.html` (transform section around lines 3525–3605). The root hosted page is a launcher; celestial holds the gizmo. No Three.js/WebGL overlay or external CDN dependency was introduced. This is not a complete port of the reference's 3D gizmo: arbitrary rigid-body rotation/scaling is not added. Analytic ground/card-only helper records are not offered as independent movable scene shapes.

## Geometry clusters in the Render outliner group

- Toggle the actual clustered/legacy render path.
- Optional projected **cluster AABB** overlay: green GPU-visible, red GPU-culled, grey pending/legacy. These are bounds, not triangle wireframes or simplified LOD colours.
- Visibility comes from actual indirect GPU command `InstanceCount` fields, copied/mapped asynchronously at most 4 Hz while the overlay is enabled. Rebuild revisions guard against stale results; recorder rows include sample revision/age. The overlay draws up to 2,000 candidate bounds; this display cap does not change rendering or full candidate statistics.
- Choose 64/128/256 maximum triangles per leaf to repartition, or use **Rebuild clusters** to invalidate cached partitions. Default remains 128. Camera movement updates GPU culling normally.

These remain lossless static clusters, **not full Nanite**: no simplification/error hierarchy, streamed pages or Hi-Z visibility. See `GEOMETRY_CLUSTERING.md`.

## Executed validation

- `npm test`: **108 passed**, including CSV escaping, settings immutability/revisions, limits, pause/clear/removal/reinstall, late-readback isolation, asynchronous callback ownership and baked-shape-centre translation.
- Production software-Vulkan cluster proof: **8 candidates / 4 visible / 4 culled**, exact legacy pixel parity, diagnostics readback matches commands. Repartition to 64 triangles produces **16 candidates**, still pixel-exact; **0 GPU errors**.
- Null-backend full-app six-frame integration: recorder capture/pause/resume/remove, cluster rebuild and inspector routing; **0 errors / warnings**.
- Real Chromium software-WebGPU integration: four initially recorded frames, raw Present/Cluster-culling samples, full CSV serialization, real-scene numeric move, axis drag, Escape restoration, leaf-budget control, pause/remove; **0 page errors**. Six total rendered frames, low quality / quarter render scale. The live scene initially reported 32 candidates / 30 GPU-visible. This is functional validation, not a hardware benchmark.
- Existing cloud/fog GPU regression still passes, **0 GPU errors**.

Optional tools: `Tools/DiagnosticsBrowserProof.mjs`, `DiagnosticsHooks.mjs`, `GeometryClusterGpuProof.mjs`, `CloudGpuProof.mjs`. Browser proof exports screenshots and CSV outside the repository by default (`/home/user/diagnostics-proof`).
