# 06 — DeviceExchange

`Layer2_Device` is the whole of `SlateVulkan.lib`. It abstracts a device and nothing else: it holds handles,
allocations, descriptors and recording rotation, and it has no opinion about what is drawn. It does not know what
a layer stack is, what a brush impression is, or what an outliner row is — the link partition makes that
structural, because `SlateVulkan` and `SlateDocument` are peers and neither links the other.

The vendor spelling is preserved verbatim at the API surface. `VkDevice`, `VkImage`, `VkPipeline` and
`VkDescriptorSet` are correct inside a call; Slate's own identifiers wrapping them are not permitted to reuse the
banned words those spellings contain.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | `SlateVulkan.lib`                                                             |
| Layer       | `Layer2_Device`                                                               |
| Upstream    | `02` (transforms, extents), `04` (`WindowInterchange` native handle)          |
| Downstream  | `08` orders it; every recording document records through it                   |
| Unblocks    | A device, an allocation, a descriptor, an image on screen                     |

## 1. The Components

✔️ `VulkanExchange`, `VendorClassifier` and `WindowExchange` done — loader and instance, the scored device with one
graphics queue, and the native handle converted to a surface.

✔️ The thirteen below are built. Each keeps its mechanism here because the mechanism is what `08` orders, not
because the component is still owed.

| Component              | Mechanism                                                       |
|------------------------|------------------------------------------------------------------|
| `DiagnosticExtension`  | Holds `VK_EXT_debug_utils`, queried and enabled                   |
| `DisplayScheduler`     | Paces image transitions against a latency target                  |
| `ByteSpace`            | Raw device byte extents, sliced and reclaimed                     |
| `ImageSpace`           | Device image extents with layout tracking                         |
| `SpanSpace`            | Typed spans over a claimed byte extent                            |
| `DescriptorIndex`      | Slot ledger over descriptor sets and their layouts                |
| `ProgramIndex`         | Constructed programs and the layouts they are recorded against    |
| `AttachmentIndex`      | Derived attachment sets over one target's views                   |
| `RenderSchedule`       | The claimed targets and the construct they are recorded into      |
| `CycleScheduler`       | Orders reuse of N cyclic recording slots                          |
| `CommandSequence`      | Ordered recording of device commands                              |
| `HardwareMetrics`      | Measures hardware execution duration and depth                    |
| `ShaderCodec`          | Compiled shader stream layout and specialisation                  |

## 2. Device Bring-Up

✔️ Completed — ① ② ③ ④ in `ConstructInstance` and `ConstructDevice`, with the capability set fixed at creation and
never re-queried; ⑤ in `ByteSpace` and `ImageSpace`; ⑥ in `DisplayScheduler`, which scores the surface format and
establishes the chain. §2.1's settled decisions stand unchanged.

### 2.1 Settled device decisions

| Decision                | Choice                                    | Why                                          |
|-------------------------|-------------------------------------------|-----------------------------------------------|
| Queue families          | One graphics queue                        | Donor spine assumes it; no measured need yet  |
| Descriptor strategy     | Explicit sets per cycle slot           | Bindless not adopted; see `00` §5             |
| Render target discipline| Classic render construct, not dynamic     | Donor spine assumes it                        |
| Presentation            | Paced against a latency target            | `DisplayScheduler` owns the choice            |
| Allocation              | Sub-allocated from large device extents   | One allocation per resource exhausts the count|

## 3, 4, 5. Allocation, Recording Rotation, Descriptors

✔️ Allocation and recording rotation are built. §3.1's budget shapes stand in `ByteSpace` as the two residency
extents, sliced first-fit and released by a coalescing return; `SpanSpace` and `ImageSpace` occupy those slices.
§4.1's extent-change sequence is `DisplayScheduler::Reclaim`, then `TargetSpace::Reclaim`, then
`AttachmentIndex::Derive`. The rotation is `CycleScheduler` over `RecordingSlotCount` with `CommandSequence`
writing one recording per slot.

✔️ Descriptors are built. `DescriptorIndex::Declare` closes at `Fix`, which is what makes §7's no-layout-during-a-
recording gate a refusal at the call rather than a review finding.

✔️ §4.2's report is built. `CycleScheduler::Await`, `CommandSequence::Submit`, `HardwareMetrics::Resolve` and
`DisplayScheduler`'s arrival and surrender each read `VK_ERROR_DEVICE_LOST` and refuse with `RefusalReason::DeviceLost`
before destroying anything, so §7's device-loss gate is discharged.

🚧 What observes the report is `32`, which is unbuilt. The refusal reaches no recovery until then.

🔴 Device loss reports upward and writes nothing — `32` observes the report and instructs `48` to write the
recovery journal, because `06` may name no `10` identifier. Recorded as `00` §10 conflict 36.

## 6. Diagnostics

✔️ Completed — the validation layer and `VK_EXT_debug_utils` are requested at instance creation under a
caller-supplied flag, `DiagnosticExtension` holds what the request produced, and `HardwareMetrics` measures duration
and depth. Per-object naming is discharged at all eight claim sites: `ByteSpace`, `SpanSpace`, `ImageSpace`,
`DescriptorIndex`, `ProgramIndex`, `CommandSequence`, `CycleScheduler` and `DisplayScheduler` each call
`DiagnosticExtension::Declare`, discarding the naming refusal so that an absent capability cannot fail a claim.

✔️ `_DEBUG` is defined nowhere and `/MD` is used in both configurations.

## 7. Gates

- ✔️ **Gate:** `SlateVulkan` does not link, include, or name anything in `SlateDocument`.
- ✔️ **Gate:** No ImGui spelling appears in `Layer2_Device`.
- ✔️ **Gate:** The capability set is fixed at device creation and never re-queried.
- ✔️ **Gate:** No descriptor set layout is constructed during a recording — `DescriptorIndex::Declare` refuses
  once `Fix` has resolved.
- ✔️ **Gate:** Every per-recording resource is sized against the recording slot count.
- ✔️ **Gate:** Every device object Slate creates carries a diagnostic name in Debug — see §6.
- ✔️ 🔴 **Gate:** A display extent change recreates **every** display-relative target in `08` §2, and no persistent
  extent. Intermediate extents during a drag are discarded, never queued. `TargetSpace::Reclaim` releases every
  non-absolute target before re-claiming any, and refuses in full rather than half-applying.
- ✔️ **Gate:** Device loss reports upward before destroying anything; `06` names no document component.
- ✔️ **Gate:** Nothing in `Layer2_Device` spells `FormatCodec`, `RevisionSequence` or any `10` identifier.
- ✔️ **Gate:** Recovery re-scores the capability set rather than reusing it — `ReclaimDevice` clears it and
  retains the instance.
- ✔️ **Gate:** Every claim declares its shape, and reserved and committed claims are refused before partial success.
- ✔️ **Gate:** Discretionary exhaustion is residency policy, not a reported failure — `ClaimStanding` carries the
  distinction into the refusal.
- ✔️ **Gate:** `_DEBUG` is defined in no configuration; `/MD` is used in all of them.

## 8. What This Document Does Not Know

Restated as an inventory because `SlateVulkan` acquiring one of these is the erosion the peer partition exists to
prevent, and each has a plausible-looking reason to arrive here.

| Absent           | Because                                                             |
|------------------|----------------------------------------------------------------------|
| A layer sequence | `56` owns it, in `SlateDocument`. `06` holds the texels' backing only |
| An occupant      | `10` owns the population; `06` holds extents, not what fills them    |
| A brush          | `58` owns it                                                        |
| A selection      | `12` owns it                                                        |
| A material       | `42` owns it; `06` holds the descriptor slots it is written into     |

⚠️ The opening paragraph said `06` "does not know what a layer stack is" while nothing in the series defined a
layer stack at all. It is `56`'s `SurfaceLayerSequence`, and `Stack` is a retired spelling. Recorded as `00` §10
conflict 22.

## 9. Open

| Open question                                                             | Blocks                     |
|----------------------------------------------------------------------------|-----------------------------|
| `DOC/VulkanFolder.md` was not in the read set and `00` says it supersedes    | Folder detail inside §1     |
| Recording slot count N — two or three                                             | Extent sizing, not design   |
| Whether a dedicated transfer queue is needed for `20`'s residency traffic   | `20` throughput only        |
| Whether recovery re-resolves the domain or reloads the document entirely     | Recovery latency only       |
