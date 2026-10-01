# 32 — HostAssembly

`Layer6_Application` is where the five units become a program. A host owns the lifetime, drives the tick, and
does nothing else — every capability it exposes belongs to a unit beneath it. A host that contains engine logic
has, by that fact, made that logic unavailable to the other host.

Two hosts ship from one tree: `PaintHost`, the painting application, and `ConsoleHost`, headless, which exists so
that parity and measurement can run without a window or a display.

## Position In The Sequence

| Field       | Value                                                                    |
|-------------|---------------------------------------------------------------------------|
| Unit        | `PaintHost.exe`, `ConsoleHost.exe`                                       |
| Layer       | `Layer6_Application`                                                     |
| Upstream    | All five units                                                           |
| Downstream  | None — this is the leaf                                                  |
| Unblocks    | A shipping application                                                   |

## 1. Bring-Up Order

🚧 Partially completed — nothing performs ordered bring-up. `ConsoleHost` constructs units directly, in the order
it verifies them. The seven steps below stand as the order `PaintHost` must follow.

① `SlateMath` — platform translation, then the numeric contract and `InstructionExchange` selection.
② `WindowInterchange` produces a native window.
③ `SlateVulkan` — instance, device, capability set, extents, presentation via `WindowExchange`.
④ `SlateDocument` — an empty population and revision sequence, and `36`'s colour specification.
⑤ `SlateCompute` — visibility partitioning, residency, and the atmosphere surfaces.
⑥ `SlateUI` — panels, and the single ImGui context.
⑦ `RenderSchedule` orders every declared recording and validates the target set.

🔴 Step ⑦ validates and does not repair. Any failure is a refusal at bring-up with the target and recording named,
never a reordering the orderer invented. Teardown is the exact reverse, and `SlateVulkan` waits for the rotation
to drain before releasing extents.

## 2. The Tick

🚧 Unbuilt — there is no tick. The ten steps below stand as declared, and the two orderings under them are the
part that cannot be rediscovered from code.

① Drain input from `InputExchange`, timestamped at arrival.
② `76` arbitrates the pointer — `14` §4.2 — and `SlateUI` converts samples into intent.
③ Intent that mutates nothing in the document is applied directly to its owner in `14` §4.1's table.
④ `74` resolves the pointer to an occupant and a domain position, on the host, against `40`.
⑤ Intent that mutates the document commits as transactions through `RevisionSequence`.
⑥ `12`'s seven-step tick order runs — population, attachment, enclosure, rows, subsets, search.
⑦ `70` re-resolves placed and tiling content whose declared invalidation inputs changed — `00` §10.1 ②.
⑧ `20` drains `RequestQueue` and promotes within budget.
⑨ `08` records the cycle slot in its declared order.
⑩ `DisplayScheduler` paces presentation.

🔴 Steps ⑤ and ⑥ are strictly ordered — `12` invariant 10. Step ④ precedes ⑤ because a transaction addressing a
surface position needs that position resolved first, and it is resolved on the **host** against `40`'s
subdivision: readback is latent by the recording slot count, and a stroke resampled against it is resampled against
where the cursor used to be — `22` §1.

## 3. Two Hosts

🚧 Partially completed — `ConsoleHost` exists and verifies `SlateMath`, the register, work, colour, the document,
properties, topology, materials, vector content, the schedule and parity, returning a refusal count. It has no
device and no flat C export path. `PaintHost` is unbuilt.

`ConsoleHost` is the only target permitted a flat C export path, so that measurement can be driven externally.
That export path is a host affordance and is not a seam between units — see `00` §2.1.

## 4. Build

✔️ Build done — one `Module.toml` per unit, PowerShell orchestration invoking `cl.exe` and `link.exe`, no CMake,
`/MD` everywhere and `_DEBUG` nowhere, order fixed by the link partition with the two peers built in parallel.

### 4.1 The shader toolchain

🚧 Partially completed — stage A is done: `Shared/` compiles as C++ into `SlateMath` through `ToolchainInterchange.slang.h`.
Stages B, C and D are unbuilt — no shader toolchain runs, and registration is checked at run time by
`ParityRunner` rather than at build time.

| Stage | Produces                                                                    |
|-------|------------------------------------------------------------------------------|
| B     | `Shared/` compiled by the shader toolchain, with `ToolchainInterchange.slang.h` supplying the differences |
| C     | Every shader entry point compiled to its stream layout for `ShaderCodec`     |
| D     | `ParityRunner` registration checked — every `Shared/` entry point is registered |

🔴 Stage D is a build-time check, not a runtime one. An unregistered `Shared/` entry point is duplicated source
that has not diverged **yet**, and `02` §7 says so; discovering it at run time means discovering it after it
diverged.

⚠️ Shader compilation failure fails the build. A stale compiled shader stream surviving a failed compile produces
an engine that runs correct code from the previous edit, which is the worst available result for anyone trying to
understand what their change did.

🔴 Nothing here is validated by running it. Ask before building or running any test, probe or executable.
"It compiles" is not a deliverable unless it was asked for.

## 5. Gates

- **Gate:** Neither host contains engine logic; each is lifetime and tick only.
- **Gate:** Bring-up and teardown follow §1 exactly, with the rotation drained before release.
- **Gate:** `08`'s validation at ⑦ refuses rather than reorders.
- **Gate:** Pointer resolution precedes transaction commit, and runs on the host.
- **Gate:** Transaction commit precedes outliner reconciliation within a tick.
- **Gate:** Re-resolution at ⑦ is driven by `00` §10.1 ②'s invalidation inputs, never by the rotation count.
- **Gate:** `ConsoleHost` requires no window and no display.
- **Gate:** The flat C export path exists only in `ConsoleHost`.
- **Gate:** Both `Shared/` compilations run in every build; a shader compilation failure fails the build.
- **Gate:** Every `Shared/` entry point is registered with `ParityRunner`, checked at build time.
- **Gate:** `/MD` everywhere, `_DEBUG` nowhere, no `CMakeLists.txt` in the tree.
- **Gate:** `SlateDocument` and `SlateVulkan` build without depending on each other.

## 6. Open

| Open question                                          | Blocks               |
|----------------------------------------------------------|-----------------------|
| Whether `ConsoleHost` ships or stays internal            | Packaging only        |
| Whether a document may be supplied on the command line   | Nothing structural    |
| Crash reporting and log destination policy               | Nothing structural    |
| Whether `ParityRunner` runs in every build or on demand  | Build duration only   |
