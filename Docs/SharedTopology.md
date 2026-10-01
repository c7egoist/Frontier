# Shared topology

One mesh, registered once, placed as many times as the level wants. Only what actually differs between two
placements is stored per placement.

## Why

`SceneStructure::RegisterInstance` copied the whole mesh on every call. Each call ran a Morton sort over the
triangles, appended a full copy of the vertex span, rebuilt every 128-triangle cluster, and ran
`PatchGeometry::LoadOrBake` once per cluster to bake the coarse LOD. Placing the same object 400 times meant doing
all of that 400 times and keeping 400 copies of geometry that never differed.

The material grid is the case that forced it: 400 placements of the 68 623-triangle shader ball, differing only by
material and position.

## What is shared and what is not

| Per topology, stored once | Per placement, stored each time |
| ------------------------- | ------------------------------- |
| `VertexRecord` span       | `InstanceRecord` (160 B each)   |
| index span, fine + coarse | `ClusterRecord` rows (64 B each)|
| cluster geometry and LOD bake | world transform, material, flags |

`MaterialIndex` already lived on `InstanceRecord`, so two placements differing only by material shared topology
with no work at all. Cluster rows are still duplicated: their only per-placement field is `InstanceIndex`, and
removing it would change the std430 layout the cull shader reads. That is 64 B per cluster per placement — 13.6 MB
for the 400-ball grid, against 1.1 GB for duplicating the topology itself.

## Where the source lives

`VehiclePhysics/Overlay/Engine/GeometricRaster/SceneStructure.{h,cpp}` — the overlay is the durable layer. The
engine checkout under `_AgentScratch/` is gitignored and is replaced whenever it is re-seated, so a change made
only there is lost. `RunDriveMirror.py` lays the overlay over a private copy of the pinned checkout; the proof's
build scripts compile the checkout's copy, so re-seat before building if the overlay has moved ahead.

## API

```cpp
uint32_t RegisterTopology(const GeometryStructure& Mesh) noexcept;
uint32_t PlaceTopology(uint32_t Topology, const Matrix4x4& World, uint32_t MaterialIndex, uint32_t Flags) noexcept;
uint32_t ForkTopology(uint32_t FirstInstance) noexcept;

uint32_t QueryTopologyCount() const noexcept;
uint32_t QueryTopologyPlacements(uint32_t Topology) const noexcept;
uint32_t QueryTopologyPartitions(uint32_t Topology) const noexcept;
```

`RegisterInstance` still exists and still does what it did; it is now
`PlaceTopology(RegisterTopology(Mesh), ...)`. `RegisterTopology` hashes the mesh's indices, positions and UVs, so
callers that register identical meshes repeatedly get the sharing without changing a line.

A placement is **several** `InstanceRecord`s when the mesh exceeds the 8 192-triangle span — 2 for a 9 216-triangle
sphere, 9 for the shader ball. `PlaceTopology` returns the first; step by `QueryTopologyPartitions` to walk them.
This is pre-existing behaviour, not new, but it is the easiest thing to get wrong when reading the instance array.

## Forking — groundwork for destruction

`ForkTopology(FirstInstance)` gives one placement a private copy of the topology it currently shares and repoints
its instances at the copy. Nothing forks implicitly: a caller that mutates shared topology without asking for a
fork is mutating every placement of it, and that has to be a decision rather than an accident. `AccessVertices()`
carries the same warning at the point of use.

The copy is byte-identical, so the frame does not change the instant a fork is made. It changes when the caller
cuts it.

## Proof

`VisualProof/SharedTopology/SharedTopologyProof.cpp` — dependency-free, no window, no device, no asset. It
self-checks and returns non-zero on any failure.

```powershell
.\VisualProof\SharedTopology\BuildSharedTopologyProof.ps1
```

```bash
g++ -std=c++20 -O2 -w \
    -I_AgentScratch/Frontier/Engine -I_AgentScratch/Frontier \
    -I_AgentScratch/Frontier/ExternalPackages/vulkan-headers/include \
    VisualProof/SharedTopology/SharedTopologyProof.cpp \
    _AgentScratch/Frontier/Engine/GeometricRaster/SceneStructure.cpp \
    _AgentScratch/Frontier/Engine/GeometricRaster/GeometryStructure.cpp \
    _AgentScratch/Frontier/Engine/DeviceExchange/OrientationClassifier.cpp \
    _AgentScratch/Frontier/Engine/ContentInterchange/MaterialIndex.cpp \
    -o _AgentScratch/build/topology/SharedTopologyProof
./_AgentScratch/build/topology/SharedTopologyProof
```

Both toolchains list the same five translation units. A source added to one must be added to the other.

### What it measured

Stand-in mesh: 9 216 triangles, 4 753 vertices, 0.29 MB of `VertexRecord` per copy.

| placements | vertices | indices | instances | clusters | vertex+index MB |
| ---------: | -------: | ------: | --------: | -------: | --------------: |
|          1 |    4 753 |  40 254 |         2 |       72 |           0.444 |
|          4 |    4 753 |  40 254 |         8 |      288 |           0.444 |
|         16 |    4 753 |  40 254 |        32 |    1 152 |           0.444 |
|         64 |    4 753 |  40 254 |       128 |    4 608 |           0.444 |
|        400 |    4 753 |  40 254 |       800 |   28 800 |           0.444 |

Storage is flat in the placement count. At 400 placements that is 177.0 MB not allocated, for a mesh an eighth the
size of the shader ball.

- **Equivalence** — 73 728 world-space triangles compared against a copy-per-placement build of the same scene.
  Worst vertex disagreement 0.000e+00 m. The feature is a memory change, not a rendering change.
- **Material** — two placements differing only by material: one topology, same vertex span, same index spans,
  materials still 3 and 9.
- **Fork** — the fork allocates exactly one private vertex span, the forked placement stops sharing, its siblings
  keep sharing with each other, and the geometry does not move (0.000e+00 m) until it is cut. After collapsing the
  forked placement's vertices: moved on the fork 0.500 m, moved on every sibling 0.000e+00 m.

25 checks, all passing. Transcript at `VisualProof/SharedTopology/SharedTopologyProof.txt`.

## Not done yet

Placing 400 full-resolution shader balls still flattens 27 M world-space triangles into `SceneStructure::
FlatTriangles` during `Finalise`, because the raytraced paths consume a single world-space blob. The two-level
TLAS/BLAS path that would let the flat array hold the mesh once already exists in the kernel
(`TlasInstanceCount > 0`, `TraverseInstancesClosest`); the surfel passes currently pin `TlasInstanceCount = 0u`.
Shared topology is the host half of that work and is complete; routing the raytraced paths through the two-level
walk is the other half.
