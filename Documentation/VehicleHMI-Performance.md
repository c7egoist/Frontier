# VehicleHMI performance capture and optimization notes

## Collecting a log

Open the VehicleHMI **Proving Grounds** (`ProvingGroundVehicle.levelspace`) and leave **Performance logging** enabled in the editor's Control Centre quick actions. In the standalone runtime, `P` toggles the same capture and `M` toggles motion blur; both shortcuts work only in the Proving Grounds. The logger emits one structured `vehiclehmi_perf_v1` record per approximately one-second window into the normal Frontier Log Stream and its session file (`Saved/Logs/Frontier.log` under the Everest project directory). Performance logging is on by default in the proving/training grounds.

Each record includes:

- `fps`, average and maximum `frame_dt_ms`;
- average CPU wall times for workspace update, vehicle physics step, and the viewport callback;
- average and maximum `submit_wait_ms`, the slowest named submit/fence interval and its label, and the submission count;
- screen and trace extents, scene triangle/cluster/card/TLAS counts, active vehicle count, renderer, and adapter.

`submit_wait_ms` measures CPU wall time from `vkQueueSubmit` until the completion fence. It is a practical GPU-pressure proxy because this rendering path waits for submitted work, but includes driver/CPU submission overhead and is **not** a hardware GPU timestamp. The record explicitly writes `gpu_timestamp_ms=unavailable`; do not treat the proxy as a per-pass GPU timer.

To collect one, let the proving-ground scene run for 15–30 seconds, then share the `vehiclehmi_perf_v1` lines (plus the immediately preceding `Opened level` / renderer setup lines). Include the adapter, resolution, and whether Motion blur was enabled. The output is machine-readable `key=value` text; no frame-by-frame log spam is generated.

For a one-off *stage ranking* run, launch with `FRONTIER_ILLUMINATION_STAGED_SUBMISSIONS=1`. This makes the renderer label and time each recorded GI stage separately (for example, `surface raster`, `ReSTIR resampling`, `reflection trace`, `diffuse variance filter`, `plume march`, and `antialias and present`). It forces a submit/fence wait between stages and changes throughput, so use it to find candidate stages only—not as a normal-playback FPS comparison. For precise hardware GPU timings, capture a normal run with PIX, Nsight Graphics, or RenderDoc GPU profiling.

## First optimization steps

1. **Compare CPU work with submit/fence wait.** If `physics_step_avg_ms` is a substantial portion of the frame budget while `submit_wait_avg_ms` is small, investigate the vehicle/physics path first. If submit/wait dominates, begin with render cost. At 60 FPS the entire frame budget is 16.67 ms; at 30 FPS it is 33.33 ms.
2. **Reduce render extent before reducing scene detail.** Pixel-based passes scale approximately with width × height: 75% of both dimensions processes 56.25% as many pixels; half width and half height processes 25%. This is the most direct way to reduce full-screen GI, resolve, plume composition, and blur work. Confirm the resulting frame time rather than assuming an equal FPS gain.
3. **Separate GI trace cost from screen cost.** Trace scale 2 samples roughly one quarter of the screen pixels; scale 4 samples roughly one sixteenth. If ReSTIR resampling or reflection tracing is the top named stage, test a coarser trace scale, fewer path bounces/candidates, or disabling the separate reflection path, one change at a time. This targets actual ray/dispatch work rather than changing unrelated scene quality settings.
4. **Check full-screen/post effects.** Motion blur is camera-owned, enabled by default only in the proving grounds, and adds four motion-aligned texture samples per pixel when its non-zero motion vector is active. If the antialias/present submit is the main cost, turn it off with the Motion blur quick action and compare otherwise identical windows. Its blur is capped to 24 screen pixels to contain outliers.
5. **Use scene counts to distinguish scaling problems.** High triangle or geometry-cluster counts with a large `surface raster` stage point toward scene geometry/culling; many surface cards with a high `card lighting` stage point toward card relighting; a high `plume transport` / `plume march` stage points toward the volumetric effect. Use the stage-ranking run for attribution, then verify each proposed change in a normal run.

The most useful follow-up is to share the structured logs and note the exact level, renderer mode, resolution, vehicle state, and enabled effects. That makes it possible to distinguish CPU-bound simulation, CPU/driver submission, and GPU-heavy rendering rather than recommending blind quality reductions.
