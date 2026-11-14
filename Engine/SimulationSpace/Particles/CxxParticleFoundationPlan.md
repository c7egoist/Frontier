# Frontier C++20 Modular Particle Foundation Plan & Deferred Effects Roadmap

## 1. Purpose & Parity Target

Bring the exact modular GPU/CPU particle architecture proven in `Experimental/ParticleEditor Final/` into native ISO C++20 + Slang + Vulkan 1.3 under `Frontier::SimulationSpace::Particles`, seamlessly coupled with `Engine/SimulationSpace/ForceFields/` (`ForceFieldDescriptors.h`, `FieldLatticeCascade`, `ForceFieldAccumulator`, `FieldLatticeVulkanExecutor`, `ForceFieldEvaluationShared.slang`) in Right-Hand `+Z Up` world coordinates.

Every built-in effect (67 presets + interactive spiderwebs, cables/chains, hanging vines/ropes, flags/sails, grass/wheat/reeds, compound ferns, and multi-limb canopy trees) as well as custom C++ user effects is composed from four decoupled modules plus optional CPU custom lambdas.

---

## 2. Repository Layout & Build Integration

```text
Engine/
  SimulationSpace/
    Particles/
      ParticleDescriptors.h         # 16B-aligned GPU structs (ParticleState, ParticleTrailNode, ParticleSystemUniforms, BallCollider)
      ParticleModules.h             # Composable modules: Emitter, SimulationLawStack, TrailConstraint, RenderProfile, CustomHooks
      ParticleBuilder.h / .cpp      # Fluent C++ builder + preset catalog factory + custom OnEmit/OnStep lambdas
      ParticlePresetCatalog.h/.cpp  # Parametric parity for all 75 Particle Studio presets (Y-Up -> Right-Hand +Z Up mapping)
      ParticleSimulationHost.h/.cpp # Manages CPU hooks + GPU SSBOs, trail buffers, cell grids, ball collider & stats readback
      ParticleVulkanExecutor.h/.cpp # Vulkan 1.3 compute + graphics pipeline executor (Hardware ICD + SwiftShader fallback)
  Shaders/
    Particles/
      ParticleShared.slang          # Shared structs + PRNG/basis/noise helpers + imports ForceFieldEvaluationShared.slang
      ParticleEmitCompute.slang     # Compute emit pass (volume shapes, lattice, arcs, beams, webs, cloth, foliage)
      ParticleStepCompute.slang     # Compute update pass (ballistic, curl, XPBD chain constraints, trees, collider & tearing)
      ParticleBillboardRender.slang # 18 procedural shapes + leaves/wheat-ears/cattails/dewdrops
      ParticleRibbonRender.slang    # 20-node ribbon strips: silk, cables, chains, solid cloth flags/sails, blades, pinnate ferns, bark
      ParticleMeshAndBeam.slang     # Cubes, shatter debris, dielectric arcs, beams, light fibres, lens distortion
```

CMake target `FrontierParticles` links `FrontierSimulationSpace` (`ForceFields`) and `Vulkan`.

---

## 3. Core 16-Byte Aligned GPU Buffers

- **`ParticleState` (`80 B` = `5 × float4`)**:
  - `PositionAndAge` (`xyz`, `age`)
  - `VelocityAndLife` (`xyz` velocity / spring displacement, `life`)
  - `Color` (`rgba` linear)
  - `Metrics` (`size`, `angle`, `spin`, `seedOrSpecies`)
  - `Extra` (`holdOrBeadAlpha`, `tearUOrFloorTime`, `slotIndex`, `growOrFlags`)
- **`ParticleTrailNode` (`16 B` × 20 nodes per strand)**:
  - Stores persistent 3D chain nodes `(x, y, z, strainOrIntactFlag)` for ribbons, catenary cables, cloth strips, grass/fern spines, and tree branches across compute dispatches.
- **`CollisionSphereState` (`32 B` inside shared global UBO)**:
  - `BallPositionAndRadius` (`float4`), `BallVelocityAndImpact` (`float4`) shared cleanly with both `ParticleStepCompute.slang` and custom C++ hooks.

---

## 4. Composable Building Blocks (`ParticleModules.h`)

1. **`EmitterModule`**: Point, SphereVolume, Disc, BoxVolume, BoxSurfaceLattice, DualElectrode, SpiderwebTopology, ClothGrid, BotanicalRootField, TreeSkeleton, or `CustomCpuEmitter`.
2. **`SimulationLawStack`**:
   - `BallisticLaw` (gravity, buoyancy, drag, flutter, floor bounce/splat)
   - `ForceFieldCouplingLaw` (receiver channels matching `ForceFieldDescriptors.h`, reading `FieldLatticeCascade` + `ForceSourceShaderEntry[]`)
   - `CurlManifoldLaw` (planar wave, spherical shell, stream ribbons, object surface pour + pulse)
   - `ChainConstraintLaw` (20-node elastic spring + length constraints, sphere collider push-out, tear snapping, falling leaf detachment)
   - `BotanicalLaw` (travelling wind stadium waves, fern frond fan geometry, hierarchical trunk -> branch -> canopy leaf coupling)
   - `SpiderwebLaw`, `SwarmBoidsLaw`, `MolecularLaw`, `TransitionWaveLaw`, `LightningArcBeamLaw`.
3. **`TrailModule`**: `None`, `VelocityWake`, `SurfaceStream`, `VerletChain`.
4. **`RenderProfileModule`**: Geometry mode (`BillboardQuad`, `RibbonStrip20`, `Cube36`, `ArcMesh`, `FibreTube`) + procedural fragment cutout (`Streak`..`AuroraCurtain`, `Tubes`, `SolidCloth`, `TaperedBlade`, `PinnateFernFrond`, `BarkCylinder`).

---

## 5. Simple Modular C++ Usage Example

### Declarative Fluent Composition
```cpp
using namespace Frontier::SimulationSpace::Particles;

auto CustomFlag = ParticleBuilder("BannerFlag")
    .Capacity(40)
    .ClothGrid(/*rows=*/32, /*width=*/2.8f, /*height=*/1.6f, /*pinnedLeftMast=*/true)
    .AddChainPhysics(/*stiffness=*/1.4f, /*tearThreshold=*/9.5f)
    .CoupleToForceFields(/*windCoupling=*/1.8f)
    .Shape(RibbonProfile::SolidWovenCloth, BlendMode::PremultipliedAlpha)
    .ColorRamp({ 0.92f, 0.18f, 0.16f, 1.0f }, { 0.96f, 0.78f, 0.25f, 1.0f }, { 0.22f, 0.08f, 0.12f, 1.0f })
    .Build();
```

### Direct Custom C++ Particle Rules (`OnEmit` / `OnStep`)
```cpp
auto CustomSwarm = ParticleBuilder("CustomReactSwarm")
    .Capacity(512)
    .Burst(512)
    .Shape(ParticleShape::SoftGlow, BlendMode::Additive)
    .WithTrailRibbon(20)
    .OnEmit([](uint32_t Slot, ParticleSeedRng& Rng, ParticleState& Out) {
        float A = (static_cast<float>(Slot) / 512.0f) * 6.283185f;
        Out.PositionAndAge = { std::cos(A) * 2.0f, std::sin(A) * 2.0f, 1.2f, 0.0f };
        Out.VelocityAndLife = { 0.0f, 0.0f, 0.0f, 1e6f };
        Out.Metrics = { 0.04f, A, 0.0f, static_cast<float>(Slot) };
    })
    .OnStep([](std::span<ParticleState> Particles, std::span<ParticleTrailNode> Trails,
               const ParticleStepContext& Ctx) {
        for (auto& P : Particles) {
            auto F = Ctx.ForceFields.Sample(P.PositionAndAge.xyz());
            // Apply ForceFields + interactive ball collision directly in C++
            ...
        }
    })
    .Build();
```

---

## 6. Deferred Dynamic Particle-Driven Effects Roadmap

The following dynamic effects from our design catalogue are **deferred** for subsequent iterations on top of this same `ParticleNodes + ChainConstraints + ForceFields + BallCollider` architecture (items `#1 Cables/Vines/Ropes`, `#2 Flags/Sails`, `#5 Grass/Reeds/Wheat`, plus **Interactive Broad Ferns** and **Swaying Canopy Trees** are implemented now in `Experimental/ParticleEditor Final/`):

- **#3 — Hanging Beads, Curtains & Bamboo Chimes**: Independent lintel-pinned bead chains that part smoothly around colliders and swing with pendulum damping + impact clatter cascades.
- **#4 — Dandelion Puff / Seed Heads & Blossom Detachment**: Seeds anchored on spherical stems that sway gently, then detach into curl-driven drifting seed plumes when wind speed or ball impact exceeds bond strength.
- **#6 — Underwater Kelp Forests & Sea Anemone Tentacles**: Buoyant bottom-anchored kelp blades swaying in `FlowStream::Current` / curl eddies, reacting when swimmers/spheres pass through and shedding bioluminescent plankton.
- **#7 — Shatterable Glass / Ice Lattice & Cracked Force Barriers**: Voronoi/grid fracture planes that vibrate under weak pressure and shatter radially from the exact projectile hit point into tumbling 3D shard cubes + mist.
- **#8 — Soft-Body Jelly / Slime Blobs & Stretchy Tendrils**: Volume-preserving spring-linked particle clusters that squash, wobble, stick via `BoundaryAdhesion`, and rebound elastically off thrown projectiles.
- **#9 — Dynamic Lightning Webs / Plasma Cage Arcs**: Multi-node ionized arcs jumping dynamically onto metallic spheres/projectiles passing near electrodes.
- **#10 — Magnetic Ferrofluid Spikes**: Surface fluid particles drawn into dynamic spiky ridges (`ForceModel::MagneticDipole` / `Attractor`) tracking moving magnet spheres in real time.
- **#11 — Flocking Murmurations & Predator Scattering (Boids + Collider)**: Winged bird/butterfly/fish boids executing real-time sphere/predator evasion maneuvers and vortex splits.
- **#12 — Puddle Splash Sheets, Ripple Rings & Mud Droplets**: High-speed ball floor/water impacts spawning radial crown droplets, concentric ground ripple rings, and fine splash mist.
