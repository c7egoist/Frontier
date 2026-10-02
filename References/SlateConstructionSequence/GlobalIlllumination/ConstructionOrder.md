# ConstructionOrder — Phases, Budgets, And The One Decision

Eleven documents describe what is built. This one describes the order it is built in, what each phase is measured
against, and what the budget is on **one queue** — because `VulkanExchange` holds one `VkQueue` and every figure
below is a serial figure.

It also carries the decision the whole branch is shaped around, which is not a scheduling decision: the same
renderer serves a game engine and a DCC editor because `102` §5's decay reads a sample count, and nothing else in
the algorithm knows which it is serving.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | None — this is a build order, not a component                                 |
| Layer       | L0 … L4                                                                       |
| Upstream    | `IlluminationGroundwork`, `ScheduleAmendment`, and all eight numbered documents |
| Downstream  | Nothing. This document is read and not linked against                         |
| Unblocks    | A branch that is shippable at the end of every phase rather than only the last |

## 1. 🔴 Every Budget Is A Serial Budget

`CapabilitySet` holds `GraphicsQueueSlot` — one `VkQueue`, commented "one queue; transfers ordered inside it" —
and `00` §5 declares multiple queue families absent. There is nothing to overlap with.

| What a plan might assume            | What this engine does                                       |
|-------------------------------------|--------------------------------------------------------------|
| Structure refit on async compute    | 🔴 Serial at ③·ii, ahead of everything that traverses it     |
| Atlas tiles refreshed in parallel   | 🔴 Serial at ③·i, round-robin, bounded per rotation          |
| Cell refresh overlapped with shading | 🔴 Serial at ③·iii                                          |
| Transfers hidden behind graphics    | Ordered inside the one queue                                 |

⚠️ Every millisecond below is therefore additive. A budget stated as "free, it overlaps" is a budget this engine
cannot reach, and the arrangement that would make it reachable — a second queue family — is an absence `00` §5
declares and this branch does not repeal. One absence per branch.

🔴 `CapabilitySet` also carries `TimestampQueryAvailable` and `TimestampToMilliseconds`, so every figure below is
**measured and not asserted**, through `86`, per recording, on the hardware in front of the artist. A phase whose
budget is stated but not instrumented has no milestone.

## 2. Phases

Seven phases. 🔴 Each ends at a state that ships: the renderer is correct, contributed, and better than the
rotation before it. No phase leaves the tree in a state where the branch must be finished to be usable.

| Phase | Builds                                       | Ends when                                                    |
|-------|----------------------------------------------|---------------------------------------------------------------|
| Ⅰ     | `IlluminationGroundwork` §6, `104`, `Contract/` bounds | The parity suite passes on two new entry points      |
| Ⅱ     | `ScheduleAmendment` §2, §4                    | Nineteen targets claim, `Fix` derives, the image is unchanged |
| Ⅲ     | `90`, `92`                                    | A structure builds and refits; nothing queries it yet         |
| Ⅳ     | `94` direct, `100`'s atlas, `102` on two signals | 🔴 The four-illuminant cap is gone. **This is the ship point** |
| Ⅴ     | `100`'s chain, `96`, `98`, `94` §6             | Indirect light at `ScreenTraced`                              |
| Ⅵ     | `94` at `DriverTraced`, `92` §3.1              | Traced indirect where the driver answers                      |
| Ⅶ     | `HardwareTraced` recording, `94` §6's reconnection | Measured against Ⅵ, and kept only if it wins             |

### 2.1 Why Ⅳ Is The Ship Point

🔴 Phase Ⅳ removes `DirectOcclusionCapacity`'s cap of four with one visibility query per pixel — `94` §3 ⑥ — and
it does so at **every** capability, including hardware that cannot trace at all. That is the single largest visible
improvement in the branch and it arrives before any indirect light exists.

⚠️ Everything after Ⅳ is indirect light, which is subtler, more expensive, and more likely to be wrong. Ordering
the branch so the largest gain lands first is what makes phases Ⅴ through Ⅶ measurable — each is compared against a
shipped Ⅳ rather than against a plan.

### 2.2 Phase Ⅳ Runs Before Phase Ⅲ's Consumer

Phase Ⅲ builds a structure nothing queries, and phase Ⅳ ships without it. That is deliberate and not an ordering
mistake: `92`'s refit cost, its extent, and its invalidation behaviour are all measurable with no consumer, and a
structure whose cost is unknown when the first ray is fired is one whose cost gets attributed to the ray.

🔴 If phase Ⅲ measures a refit cost that does not fit §3's budget, phases Ⅵ and Ⅶ are refused and `ScreenTraced`
serves every capability. `92` §8 and `IlluminationGroundwork` §12 both carry that open row; this is where it is
decided, and deciding it before `94` depends on the answer is the point of the order.

## 3. Budgets — One Queue, 1920 × 1080

Stated per rotation, additive, at a 16.6 ms rotation. 🔴 The column that matters is the last: what is left for
everything the branch did not touch — `16`, `18`, `62`, `30`, `64`, and every panel `14` records.

### 3.1 `ScreenTraced`

| Position | Recording                       | Budget   |
|----------|---------------------------------|-----------|
| ③        | `60`'s projections, unchanged   | measured today |
| ③·i      | `100`'s chain and atlas tiles   | 0.8 ms    |
| ③·iii    | `98`'s cell refresh              | 0.2 ms    |
| ③·iv     | `94` direct                      | 2.5 ms    |
| ③·v      | `94` indirect at half extent, screen-marched | 2.0 ms |
| ③·vi     | `102`, four signals              | 2.0 ms    |
|          | **Branch total**                 | **7.5 ms** |
|          | Left for everything else         | 9.1 ms    |

⚠️ 💾 This is the tightest of the four and it is the capability most likely to be on the weakest hardware — which
is the inversion this budget exists to make visible. `100` §8's open row about whether `ScreenTraced` ships its
indirect term at all is answered here: if ③·v does not fit, it is dropped, `18` reads the sky as it does today, and
the direct term of phase Ⅳ still ships. 🔴 That degradation is a phase decision, not a runtime one.

### 3.2 `DriverTraced` And `ComputeTraced`

| Position | Recording                            | `DriverTraced` | `ComputeTraced` |
|----------|--------------------------------------|-----------------|------------------|
| ③·ii     | `92`'s refit, serial                 | 0.6 ms          | 0.6 ms           |
| ③·iii    | `98`'s cell refresh                   | 0.2 ms          | 0.2 ms           |
| ③·iv     | `94` direct, ray-query visibility     | 2.0 ms          | 3.5 ms           |
| ③·v      | `94` indirect, one bounce, half extent | 3.5 ms         | 6.0 ms           |
| ③·vi     | `102`, four signals                   | 2.0 ms          | 2.0 ms           |
|          | **Branch total**                      | **8.3 ms**      | **12.3 ms**      |
|          | Left for everything else              | 8.3 ms          | 4.3 ms           |

🔴 `ComputeTraced` does not fit and the figure is stated so rather than tuned until it does. `92` §8's open row —
whether `ComputeTraced` is built at all — is answered by this table: **it is not built in phases Ⅰ through Ⅶ.** A
device with no `VK_KHR_ray_query` runs `ScreenTraced`, which fits, rather than a compute traversal that does not.
`90` §2's enumeration keeps the ordinal because the ordering is total and a later measurement may claim it.

⚠️ ③·iv is *cheaper* at `DriverTraced` than at `ScreenTraced`. A ray query terminating on first hit costs less than
`100` §3's four-step march plus an atlas sample, which is why the capability that traces is also the one with room
left for the indirect term.

### 3.3 `HardwareTraced`

Identical to `DriverTraced` in every target and every ordinal — `ScheduleAmendment` §5's second row. The only
difference is `94` §6's reconnection shift, and 🔴 phase Ⅶ keeps it **only if it measures better than Ⅵ on the same
scene**. A ray-tracing recording that costs a pipeline object, a shader-binding arrangement and a second code path
to produce an image nobody can distinguish is a maintenance cost with no image behind it.

## 4. 🔴 The Decision — Editor Or Realtime

It is not a mode, not a setting, and not a branch. `102` §5 reads `64`'s stored sample count per pixel and decays
its own reconstruction extent toward nothing as that count rises to
`RejectionSpecification::CountCeiling` — **64u**, declared in `SampleIntegrator.h` and read from there.

| The artist is             | The count is        | What runs                                          |
|---------------------------|---------------------|-----------------------------------------------------|
| Orbiting, painting, moving | Reset every rotation | Full reconstruction; a usable image immediately     |
| Slowing                    | Rising per pixel     | Iterations dropped progressively; the image sharpens |
| Holding still              | At the ceiling       | No reconstruction; a genuine progressive render      |

🔴 A game camera never holds still, so the decay never engages and the renderer behaves as a realtime renderer. An
artist's camera does, so it always eventually engages and the renderer behaves as a progressive one. **Nothing in
the algorithm distinguishes the two cases.** There is no editor mode to maintain, no realtime mode to keep in sync
with it, and no image that differs between them — which is the same reasoning `94` §1 uses to refuse three
renderers, applied to a second axis.

⚠️ The decay is per pixel and not per image — `102` §5's own note. A newly disoccluded pixel is reconstructed fully
beside a converged neighbour that is not reconstructed at all. An image-wide decay would reintroduce noise across
the whole extent whenever anything anywhere moved, which in a painting application is every stroke.

### 4.1 What This Costs

🔴 `102` §6's last row is the price and it is worth restating here where the decision is made: adopting a vendor
denoiser later means **giving up §5**. A production denoiser accumulates temporally itself and accepts no external
convergence count, so it cannot be told to get out of the way. The trade is a better-looking moving image against a
converging still one, and for this application the still one is the product.

⚠️ It also constrains `92` §7's open row from an unexpected direction. Reducing the direct reservoirs below display
extent above 1440p makes the converged image itself lower-resolution, not merely the moving one — because at the
ceiling there is no reconstruction left to hide it.

## 5. Milestones — What Each Phase Is Compared Against

🔴 Against a **reference**, not against the previous rotation. A branch measured only against itself converges to
whatever it happens to produce, and every defect in `100` §5.1's table looks like a feature from inside.

| Phase | Compared against                                          | Accepted when                                   |
|-------|------------------------------------------------------------|--------------------------------------------------|
| Ⅰ     | The host form of the same entry point                      | `ParityRunner` passes at Tier A                  |
| Ⅱ     | 🔴 The image before the amendment, pixel for pixel          | Identical. Ⅱ adds targets nothing reads yet      |
| Ⅲ     | Nothing visual; §3.2's refit budget                        | The refit fits, or Ⅵ and Ⅶ are refused           |
| Ⅳ     | A held-still `64` accumulation of the same scene            | Converges to it, with more than four illuminants shadowed |
| Ⅴ     | Ⅵ's traced indirect on hardware that can run both           | `100` §5.1's failures are the only differences   |
| Ⅵ     | A long-running accumulation with the tally ceiling raised   | Converges to it; no energy growth — `96` §8      |
| Ⅶ     | Ⅵ, same scene, same rotation count                          | Measurably better, or discarded                  |

⚠️ Phase Ⅱ's milestone is the strictest one in the table and the easiest to skip. Nineteen targets claiming, `Fix`
deriving a new order, and `ReadsPreviousSlot` migrating `64`'s self-read must all land with the image
**bit-identical**. Any difference at Ⅱ is a defect in the schedule amendment that would otherwise be attributed to
resampling three phases later.

🔴 Ⅵ's milestone is where `96` §8's energy-growth row is answered. A store approximating infinite bounces at the
cost of one grows energy if its decay is too slow, and the symptom — a scene that brightens over thirty seconds of
holding still — is invisible in any measurement shorter than that.

## 6. What Is Refused In This Branch

Stated so a later phase does not quietly acquire them.

| Refused                                    | Where the row lives          | Why                                             |
|--------------------------------------------|------------------------------|--------------------------------------------------|
| A second queue family                      | `00` §5                      | §1; one absence per branch                       |
| `ComputeTraced`                            | §3.2                         | Measured; it does not fit and `ScreenTraced` does |
| Reordering and micromap extensions         | `90` §1                      | No consumer                                      |
| Reflective depth injection into `96`       | `100` §5                     | Quality only, before a measurement               |
| More than one indirect bounce              | `96` §4                      | The store approximates the rest                  |
| A vendor denoiser                          | §4.1, `102` §6               | It would cost §4's mechanism                     |
| Bent orientations, irradiance products, volumetric transport, caustic connection | `IlluminationGroundwork` §5 | Still absent, and still substituted |

## 7. Gates

- **Gate:** Every budget is serial; no figure assumes overlap on a second queue.
- **Gate:** Every budget is instrumented through `86` with `TimestampToMilliseconds`, never asserted.
- **Gate:** Each phase ends at a shippable state.
- **Gate:** Phase Ⅱ's image is bit-identical to the image before it.
- **Gate:** Phase Ⅲ's refit is measured before any consumer of it is built.
- **Gate:** A capability whose budget does not fit is refused as a phase decision, never degraded at runtime.
- 🔴 **Gate:** There is no editor mode and no realtime mode. `102` §5's per-pixel decay against
  `RejectionSpecification::CountCeiling` is the whole mechanism.
- **Gate:** The ceiling is read from `SampleIntegrator.h`; this branch declares no second one.
- **Gate:** Every phase is compared against a reference, never against the previous rotation.
- **Gate:** Phase Ⅶ is kept only if it measures better than Ⅵ.

## 8. Open

| Open question                                                                | Blocks                              |
|-------------------------------------------------------------------------------|--------------------------------------|
| Whether ③·v ships at `ScreenTraced`, given §3.1's 9.1 ms remainder             | `100` §8 carries the same row        |
| Whether the rotation target is 16.6 ms or an artist-declared budget            | Every figure in §3 scales with it    |
| Whether phase Ⅳ ships before phase Ⅲ is complete, or waits on §3.2's measurement | Release sequencing only            |
| Whether `ComputeTraced` is ever revisited after §3.2's refusal                 | `92` §8; a later measurement may claim it |
| What scene the references of §5 are built from                                 | Every milestone in the table         |
