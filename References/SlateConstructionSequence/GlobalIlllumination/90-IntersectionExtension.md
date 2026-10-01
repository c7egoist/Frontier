# 90 — IntersectionExtension

`DiagnosticExtension` already demonstrates the shape this document takes: a vendor-declared optional capability,
queried once, held, and refused by name when absent. This document is the same mechanism for ray traversal —
`VK_KHR_acceleration_structure`, `VK_KHR_ray_query`, and where the vendor offers it, a ray-tracing recording.

🔴 It owns the **negotiation and nothing else**. The structures built from document topology live in `92`, in
`SlateCompute`, because `SlateVulkan` and `SlateDocument` never link each other — `00` §2. A document at
`Layer2_Device` holding a structure derived from `10`'s topology is that seam broken, and it is broken in the
direction that compiles.

## Position In The Sequence

| Field       | Value                                                                       |
|-------------|------------------------------------------------------------------------------|
| Unit        | `SlateVulkan.lib`                                                            |
| Layer       | `Layer2_Device`                                                              |
| Upstream    | `06` (device creation, the capability set), `08` (substitution)              |
| Downstream  | `92` builds against what is negotiated here; `94` and `100` read the capability |
| Unblocks    | A ray that the driver answers, or a declared refusal saying why not          |

## 1. What Is Negotiated

Four extensions, in two groups, and the groups are refused independently.

| Extension                              | Group      | Without it                                            |
|----------------------------------------|------------|--------------------------------------------------------|
| `VK_KHR_acceleration_structure`        | Traversal  | No structure; capability falls to `ScreenTraced`      |
| `VK_KHR_ray_query`                     | Traversal  | Same — the two are negotiated as one or not at all    |
| `VK_KHR_ray_tracing_pipeline`          | Recording  | Capability caps at `DriverTraced`; everything still runs |
| `VK_KHR_deferred_host_operations`      | Traversal  | Required by the first two; absent means absent        |

⚠️ The two groups are separate because their absences have different consequences. Missing traversal degrades the
renderer to `ScreenTraced` — a different algorithm. Missing the recording group degrades `HardwareTraced` to
`DriverTraced` — the same algorithm at a different execution model. Merging them would take a device that can
trace inline and refuse it a capability it has.

🔴 Reordering and micromap extensions are **not negotiated here and not listed above**. Neither has a consumer in
this branch: `94` §6's reconnection is where a reordering extension would pay, and `94` §6 is declared against the
ray-query form. A negotiated capability with no consumer is `02` §8's gate violated at the device edge, and the
substitution table would carry a row nothing reads.

## 2. The Capability, And Where It Lives

`CapabilitySet` in `VulkanExchange.h` already carries `ComputeRasterAvailable`, `HalfPrecisionStore`,
`TimestampQueryAvailable` and `DynamicRecordingAvailable`. The traversal capability joins them as a fifth member
rather than as a new component's state.

```cpp
/// 🧩 How a ray is answered on the created device. Scored once, at creation, and consulted thereafter.
/// note  🔴 A greater ordinal is a greater capability, and the ordering is total: every capability answers
///       everything the one below it answers. `94` specialises exactly three functions against it and
///       nothing else branches on it at all.
/// tag   contract
enum class TraversalCapability : std::uint32_t
{
    ScreenTraced   = 0u,   // [-] - no traversal; `100`'s extremum chain and `60`'s projections answer
    ComputeTraced  = 1u,   // [-] - Slate's own traversal over `92`'s structure, in compute
    DriverTraced   = 2u,   // [-] - VK_KHR_ray_query, inline, in a compute dispatch
    HardwareTraced = 3u    // [-] - the above, plus a ray-tracing recording `90` negotiated
};
```

🔴 It is a member of the **existing** struct and not a new one. That struct's own note is the reason and it needs
no restatement here: fixed at device creation, never re-queried, because a conditional on something that cannot
change is a conditional that never leaves. `VendorClassifier::Classify` scores it alongside every other member,
and `ConstructDevice` fixes it.

⚠️ It is **not** refused when low. `VulkanExchange::ConstructDevice` refuses a device with no dynamic recording,
because `SlateUI` cannot record without it. `ScreenTraced` is a working renderer and a device that scores there is
chosen, not rejected. `VendorClassifier`'s existing note — dynamic recording outranks every other preference —
stands, and traversal is scored beneath it.

## 3. What This Document Holds

| Held                                       | Why here rather than in `92`                              |
|--------------------------------------------|------------------------------------------------------------|
| The enabled extension names                | They are device-creation arguments; `06` owns creation      |
| The vendor function ordinals               | Loaded from the device, which is this unit's handle         |
| The declared structure alignments and scratch alignment | Vendor-reported limits, queried at creation      |
| `TraversalCapability` as scored            | It is a `CapabilitySet` member                              |

🔴 What is **not** held: any `VkAccelerationStructureKHR`, any extent it occupies, any build or refit, and any
knowledge of what a triangle is. All of that is `92`.

⚠️ The vendor function ordinals are loaded once and held because the ray-tracing entry points are extension
functions and are not in the loader's core dispatch. `DiagnosticExtension` already does exactly this for the debug
capability and this document follows it without variation.

## 4. Refusal

```cpp
/// 🧩 The traversal capability the created device was scored at.
/// out   Deliver  [-]  refuses with CapabilityAbsent before ConstructDevice has delivered
/// note  🔴 `Deliver<T>` with a Refusal and never a bare capability. `86` presents the reason to the artist
///       when their device cannot trace, and "ScreenTraced" and "not yet scored" are different answers that
///       a bare enumeration cannot tell apart.
/// cost  ✔️
/// tag   api, nonallocating, nonthrowing
Deliver<TraversalCapability> Negotiated() const;
```

`RefusalReason::CapabilityAbsent` already exists in `DeliveryContract.h` and is the correct reason. No new refusal
reason is added by this branch.

## 5. Substitution

`08` §5's table gains two rows. They are declared here because the contributing document owns its substitution —
`08` §1's rule — and refused at contribution rather than branched at a recording site.

| Capability absent          | Recording affected | Substitution                                                |
|----------------------------|--------------------|--------------------------------------------------------------|
| Traversal group            | `94`, `96`, `98`   | `100`'s extremum march answers occlusion; `96` is the only indirect source; `60` stands |
| Ray-tracing recording only | `94`               | The inline ray-query form; the algorithm is identical         |

🔴 The first row is why `60` is **not deleted** by this branch. `60` §3's projections are the `ScreenTraced`
answer to the direct term and they remain built, contributed and correct. Above `ScreenTraced`, `94` produces
shadowed direct radiance itself and `60`'s recording is substituted away by `08` §5's mechanism — which already
exists and is the reason no new mechanism is needed.

## 6. Ordering

`90` contributes **no recording**. It is negotiation at bring-up, in the same position `DiagnosticExtension`
occupies: before the device is created, consulted after.

## 7. Precision

| Computation                     | Tier | Reason                                                       |
|---------------------------------|------|---------------------------------------------------------------|
| The scored capability           | A    | An enumeration ordinal; `94` selects a shader permutation by it |
| Reported alignments and limits  | A    | Vendor-reported integers, carried verbatim                    |

## 8. Gates

- **Gate:** No `VkAccelerationStructureKHR` is held here, and no extent for one is claimed here.
- **Gate:** The traversal group is negotiated as one; a partial group is absent.
- **Gate:** The capability is a `CapabilitySet` member, scored at creation, never re-queried.
- **Gate:** A low capability is scored, never refused; only `06`'s existing refusals reject a device.
- **Gate:** `Negotiated` returns `Deliver<TraversalCapability>`, never a bare enumeration.
- **Gate:** No extension is negotiated that no document in this branch reads.
- **Gate:** `08` §5 carries both substitution rows, and no recording site branches on the capability directly.
- **Gate:** Vendor spellings are verbatim; Slate's own identifiers here carry no banned word.
- **Gate:** This document contributes no recording.

## 9. Open

| Open question                                                              | Blocks                            |
|-----------------------------------------------------------------------------|------------------------------------|
| Whether driver-emulated traversal is scored `DriverTraced` or `ComputeTraced` | `92` §7's measurement decides     |
| Whether a reordering extension is ever negotiated                            | `94` §6; refused until it has a consumer |
| Whether the scratch alignment is queried or taken from the reported limit    | `92` §3's claim arithmetic        |
