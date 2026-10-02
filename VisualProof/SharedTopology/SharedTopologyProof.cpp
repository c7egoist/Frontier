//============================================================================================================================================
//                                                   SHAREDTOPOLOGYPROOF.CPP
//============================================================================================================================================
// 📦 Self-checking CPU proof that SceneStructure registers a mesh once and places it many times.

/// Proves the four promises shared topology makes, and fails loudly if any of them stops being true.
///
///   ① SHARING       placing one mesh N times stores the vertex and index spans ONCE, so storage is flat in N
///   ② EQUIVALENCE   the placed scene is geometrically identical to the old copy-per-placement behaviour, which
///                   means the feature is a memory change and not a rendering change
///   ③ MATERIAL      two placements that differ only by material still share, because MaterialIndex lives on the
///                   InstanceRecord and never on the topology
///   ④ FORK          ForkTopology hands one placement a private copy — byte-identical until it is cut, and after
///                   a cut its siblings are untouched. This is the groundwork destruction will stand on.
///
/// out : VisualProof/SharedTopology/SharedTopologyProof.txt  — the table below, written as it is printed
/// err : exit code 1 and a FAIL line the moment a check does not hold
/// use : built and run by BuildSharedTopologyProof.ps1 (MSVC) or the g++ line in the README
/// cost: ~2 s for the 400-placement case; the shader-ball-sized mesh is synthesised, not loaded
/// note: dependency-free — no window, no device, no asset. SceneStructure + MaterialIndex + PatchGeometry only.
/// tag : topology, instancing, memory, destruction-groundwork

#include "GeometricRaster/SceneStructure.h"
#include "GeometricRaster/GeometryStructure.h"

#include <algorithm>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

namespace {

int Failures = 0;
std::string Transcript;

void Line(const char* Format, ...) noexcept
{
    char Buffer[512];
    va_list Arguments;
    va_start(Arguments, Format);
    std::vsnprintf(Buffer, sizeof(Buffer), Format, Arguments);
    va_end(Arguments);
    std::printf("%s\n", Buffer);
    Transcript += Buffer;
    Transcript += '\n';
}

void Check(bool Condition, const char* What) noexcept
{
    Line("  %s  %s", Condition ? "PASS" : "FAIL", What);
    if (!Condition) ++Failures;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE STAND-IN MESH
//------------------------------------------------------------------------------------------------------------------------

// A UV sphere at whatever triangle count the caller asks for. It stands in for the shader ball: the feature cares
//    about the SIZE of the topology and nothing about its shape, and synthesising it keeps the proof asset-free.
void BuildSphere(Frontier::GeometryStructure& Mesh, uint32_t Rings, uint32_t Segments, float Radius) noexcept
{
    constexpr float kPi = 3.14159265358979f;
    std::vector<Frontier::VertexRecord> Vertices;
    std::vector<uint32_t>               Indices;
    for (uint32_t Ring = 0u; Ring <= Rings; ++Ring)
    {
        const float Polar = kPi * static_cast<float>(Ring) / static_cast<float>(Rings);
        for (uint32_t Segment = 0u; Segment <= Segments; ++Segment)
        {
            const float Azimuth = 2.0f * kPi * static_cast<float>(Segment) / static_cast<float>(Segments);
            Frontier::VertexRecord V{};
            V.SpatialLocation = Frontier::Vector3{ Radius * std::sin(Polar) * std::cos(Azimuth),
                                                   Radius * std::sin(Polar) * std::sin(Azimuth),
                                                   Radius * std::cos(Polar) };
            V.NormalDirection = Frontier::Vector3{ V.SpatialLocation.x / Radius, V.SpatialLocation.y / Radius, V.SpatialLocation.z / Radius };
            V.TextureCoordinateU = static_cast<float>(Segment) / static_cast<float>(Segments);
            V.TextureCoordinateV = static_cast<float>(Ring)    / static_cast<float>(Rings);
            Vertices.push_back(V);
        }
    }
    for (uint32_t Ring = 0u; Ring < Rings; ++Ring)
        for (uint32_t Segment = 0u; Segment < Segments; ++Segment)
        {
            const uint32_t A = Ring * (Segments + 1u) + Segment;
            const uint32_t B = A + Segments + 1u;
            Indices.insert(Indices.end(), { A, B, A + 1u, A + 1u, B, B + 1u });
        }
    Mesh.AppendVertices(Vertices.data(), Vertices.size());
    Mesh.AppendIndices(Indices.data(), Indices.size());
}

Frontier::Matrix4x4 Translation(float X, float Y, float Z) noexcept
{
    Frontier::Matrix4x4 M{};
    for (int C = 0; C < 4; ++C) for (int R = 0; R < 4; ++R) M.Columns[C][R] = (C == R) ? 1.0f : 0.0f;
    M.Columns[3][0] = X; M.Columns[3][1] = Y; M.Columns[3][2] = Z;
    return M;
}

// Bytes a SceneStructure is holding for geometry. The two spans shared topology removes from the per-placement
//    cost are Vertices and Indices; Instances and Clusters stay per placement by design.
struct Residency
{
    size_t VertexBytes   = 0u;
    size_t IndexBytes    = 0u;
    size_t InstanceBytes = 0u;
    size_t ClusterBytes  = 0u;
    [[nodiscard]] size_t Total() const noexcept { return VertexBytes + IndexBytes + InstanceBytes + ClusterBytes; }
};

Residency Measure(const Frontier::SceneStructure& Scene) noexcept
{
    Residency R;
    R.VertexBytes   = Scene.QueryVertices().size()  * sizeof(Frontier::VertexRecord);
    R.IndexBytes    = Scene.QueryIndices().size()   * sizeof(uint32_t);
    R.InstanceBytes = Scene.QueryInstances().size() * sizeof(Frontier::InstanceRecord);
    R.ClusterBytes  = Scene.QueryClusters().size()  * sizeof(Frontier::ClusterRecord);
    return R;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                        THE PROOF
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    Line("================================================================================");
    Line(" SHARED TOPOLOGY — one mesh, many placements");
    Line("================================================================================");

    Frontier::GeometryStructure Mesh;
    BuildSphere(Mesh, 48u, 96u, 0.5f);
    const uint32_t MeshTriangles = static_cast<uint32_t>(Mesh.QueryIndices().size() / 3u);
    const uint32_t MeshVertices  = static_cast<uint32_t>(Mesh.QueryVertices().size());
    Line("");
    Line("Stand-in mesh: %u triangles, %u vertices (%.2f MB of VertexRecord per copy)",
         MeshTriangles, MeshVertices, double(MeshVertices * sizeof(Frontier::VertexRecord)) / 1048576.0);

    // ── ① SHARING ───────────────────────────────────────────────────────────────────────────────────────────
    Line("");
    Line("① SHARING — storage must not grow with the placement count");
    Line("");
    Line("   placements   vertices    indices   instances   clusters      vertex+index MB");
    Line("   ----------   --------   --------   ---------   --------      ---------------");

    Residency First{}, Last{};
    const uint32_t Counts[] = { 1u, 4u, 16u, 64u, 400u };
    for (uint32_t Count : Counts)
    {
        Frontier::SceneStructure Scene;
        const uint32_t Topology = Scene.RegisterTopology(Mesh);
        for (uint32_t P = 0u; P < Count; ++P)
            Scene.PlaceTopology(Topology, Translation(float(P) * 2.0f, 0.0f, 0.0f), P % 7u, 0u);
        const Residency R = Measure(Scene);
        Line("   %10u   %8zu   %8zu   %9zu   %8zu      %15.3f",
             Count, Scene.QueryVertices().size(), Scene.QueryIndices().size(),
             Scene.QueryInstances().size(), Scene.QueryClusters().size(),
             double(R.VertexBytes + R.IndexBytes) / 1048576.0);
        if (Count == 1u)   First = R;
        if (Count == 400u) Last  = R;
        Check(Scene.QueryTopologyCount() == 1u, "one topology registered no matter how many placements");
        Check(Scene.QueryTopologyPlacements(Topology) == Count, "the topology counts its placements");
    }

    Check(Last.VertexBytes == First.VertexBytes, "400 placements store exactly as many vertices as 1");
    Check(Last.IndexBytes  == First.IndexBytes,  "400 placements store exactly as many indices as 1");
    const double Saved = double(First.VertexBytes + First.IndexBytes) * 399.0 / 1048576.0;
    Line("");
    Line("   Not allocated by sharing, at 400 placements: %.1f MB", Saved);

    // ── ② EQUIVALENCE ───────────────────────────────────────────────────────────────────────────────────────
    // The old behaviour is reproducible on purpose: give each placement its own SceneStructure, so nothing can
    //    be shared, then compare the world-space triangles the renderer actually consumes. If sharing changed
    //    any rendered geometry this check is where it shows.
    Line("");
    Line("② EQUIVALENCE — the placed scene must be geometrically identical to copy-per-placement");

    constexpr uint32_t kCompared = 8u;
    Frontier::SceneStructure Shared;
    const uint32_t SharedTopology = Shared.RegisterTopology(Mesh);
    std::vector<uint32_t> PlacementFirstInstance;
    for (uint32_t P = 0u; P < kCompared; ++P)
        PlacementFirstInstance.push_back(Shared.PlaceTopology(SharedTopology, Translation(float(P) * 2.0f, 0.0f, 0.0f), P, 0u));
    Shared.Finalise(1u, nullptr);

    // One placement is SEVERAL InstanceRecords when the mesh exceeds the 8 192-triangle span — 2 for this mesh,
    //    9 for the shader ball. The comparison walks placements, so it has to step by the partition count.
    const uint32_t Partitions = Shared.QueryTopologyPartitions(SharedTopology);
    Line("   one placement = %u InstanceRecord(s) (the %u-triangle span)", Partitions, 8192u);

    double WorstVertex = 0.0;
    size_t FlatMismatch = 0u;
    size_t FlatCompared = 0u;
    for (uint32_t P = 0u; P < kCompared; ++P)
    {
        Frontier::SceneStructure Alone;                       // its own structure ⇒ its own copy of the topology
        Alone.RegisterInstance(Mesh, Translation(float(P) * 2.0f, 0.0f, 0.0f), P, 0u);
        Alone.Finalise(1u, nullptr);

        const std::vector<Frontier::TriangleIndex>& A = Alone.QueryFlatTriangles();
        const std::vector<Frontier::TriangleIndex>& B = Shared.QueryFlatTriangles();
        const uint32_t Base = Shared.QueryInstances()[PlacementFirstInstance[P]].FlatTriangleOffset;
        uint32_t Placed = 0u;
        for (uint32_t Q = 0u; Q < Partitions; ++Q) Placed += Shared.QueryInstances()[PlacementFirstInstance[P] + Q].TriangleCount;
        if (A.size() != Placed) { ++FlatMismatch; continue; }
        for (size_t T = 0u; T < A.size(); ++T)
        {
            const Frontier::TriangleIndex& X = A[T];
            const Frontier::TriangleIndex& Y = B[Base + T];
            const float Deltas[9] = {
                X.VertexAlphaX - Y.VertexAlphaX, X.VertexAlphaY - Y.VertexAlphaY, X.VertexAlphaZ - Y.VertexAlphaZ,
                X.VertexBetaX  - Y.VertexBetaX,  X.VertexBetaY  - Y.VertexBetaY,  X.VertexBetaZ  - Y.VertexBetaZ,
                X.VertexGammaX - Y.VertexGammaX, X.VertexGammaY - Y.VertexGammaY, X.VertexGammaZ - Y.VertexGammaZ };
            for (float D : Deltas) WorstVertex = std::max(WorstVertex, double(std::fabs(D)));
            ++FlatCompared;
        }
    }
    Line("   compared %zu world-space triangles across %u placements", FlatCompared, kCompared);
    Line("   worst vertex disagreement: %.3e m", WorstVertex);
    Check(FlatMismatch == 0u, "every placement produced the same triangle count as its own-copy twin");
    Check(WorstVertex == 0.0, "every world-space vertex is bit-identical to copy-per-placement");

    // ── ③ MATERIAL ──────────────────────────────────────────────────────────────────────────────────────────
    Line("");
    Line("③ MATERIAL — differing only by material must not fork the topology");
    {
        Frontier::SceneStructure Scene;
        const uint32_t T = Scene.RegisterTopology(Mesh);
        const uint32_t A = Scene.PlaceTopology(T, Translation(0.0f, 0.0f, 0.0f), 3u, 0u);
        const uint32_t B = Scene.PlaceTopology(T, Translation(2.0f, 0.0f, 0.0f), 9u, 0u);
        const uint32_t N = Scene.QueryTopologyPartitions(T);
        Check(Scene.QueryTopologyCount() == 1u, "two materials, one topology");
        bool SameVertexSpan = true, SameIndexSpans = true;
        for (uint32_t Q = 0u; Q < N; ++Q)
        {
            SameVertexSpan &= Scene.QueryInstances()[A + Q].VertexOffset == Scene.QueryInstances()[B + Q].VertexOffset;
            SameIndexSpans &= Scene.QueryInstances()[A + Q].FirstIndex   == Scene.QueryInstances()[B + Q].FirstIndex;
        }
        Check(SameVertexSpan, "both placements point at the same vertex span");
        Check(SameIndexSpans, "every partition points at the same index span in both placements");
        Check(Scene.QueryInstances()[A].MaterialIndex == 3u && Scene.QueryInstances()[B].MaterialIndex == 9u,
              "the materials stayed different");
    }

    // ── ④ FORK ──────────────────────────────────────────────────────────────────────────────────────────────
    Line("");
    Line("④ FORK — a placement can be given private topology, and cutting it leaves its siblings alone");
    {
        Frontier::SceneStructure Scene;
        const uint32_t T = Scene.RegisterTopology(Mesh);
        const uint32_t KeepA = Scene.PlaceTopology(T, Translation(0.0f, 0.0f, 0.0f), 0u, 0u);
        const uint32_t Break = Scene.PlaceTopology(T, Translation(2.0f, 0.0f, 0.0f), 1u, 0u);
        const uint32_t KeepB = Scene.PlaceTopology(T, Translation(4.0f, 0.0f, 0.0f), 2u, 0u);
        (void)KeepA; (void)KeepB;

        const size_t BeforeVertices = Scene.QueryVertices().size();
        Scene.Finalise(1u, nullptr);
        const std::vector<Frontier::TriangleIndex> BeforeFlat = Scene.QueryFlatTriangles();

        const uint32_t Forked = Scene.ForkTopology(Break);
        Check(Forked != T, "the fork is a new topology");
        Check(Scene.QueryVertices().size() == BeforeVertices + MeshVertices,
              "the fork allocated exactly one private copy of the vertex span");
        Check(Scene.QueryInstances()[Break].VertexOffset != Scene.QueryInstances()[KeepA].VertexOffset,
              "the forked placement no longer shares the vertex span");
        Check(Scene.QueryInstances()[KeepA].VertexOffset == Scene.QueryInstances()[KeepB].VertexOffset,
              "its siblings still share with each other");

        // Byte-identical until cut: the fork is a copy, not a rebuild, so the frame must not change.
        Scene.Finalise(1u, nullptr);
        const std::vector<Frontier::TriangleIndex>& AfterFlat = Scene.QueryFlatTriangles();
        double WorstFork = 0.0;
        bool   SameCount = BeforeFlat.size() == AfterFlat.size();
        if (SameCount)
            for (size_t T2 = 0u; T2 < BeforeFlat.size(); ++T2)
            {
                const Frontier::TriangleIndex& X = BeforeFlat[T2];
                const Frontier::TriangleIndex& Y = AfterFlat[T2];
                const float Deltas[9] = {
                    X.VertexAlphaX - Y.VertexAlphaX, X.VertexAlphaY - Y.VertexAlphaY, X.VertexAlphaZ - Y.VertexAlphaZ,
                    X.VertexBetaX  - Y.VertexBetaX,  X.VertexBetaY  - Y.VertexBetaY,  X.VertexBetaZ  - Y.VertexBetaZ,
                    X.VertexGammaX - Y.VertexGammaX, X.VertexGammaY - Y.VertexGammaY, X.VertexGammaZ - Y.VertexGammaZ };
                for (float D : Deltas) WorstFork = std::max(WorstFork, double(std::fabs(D)));
            }
        Line("   worst vertex disagreement across the fork: %.3e m", WorstFork);
        Check(SameCount, "forking did not change the triangle count");
        Check(WorstFork == 0.0, "forking did not move a single vertex — a fork is a copy, not a rebuild");

        // Now CUT it. This is the destruction case in miniature: collapse the forked placement's vertices to a
        //    point and confirm the damage is confined to that placement. If the fork were shallow this is where
        //    the siblings would collapse with it.
        const uint32_t CutOffset = Scene.QueryInstances()[Break].VertexOffset;
        for (uint32_t V = 0u; V < MeshVertices; ++V)
            Scene.AccessVertices()[CutOffset + V].SpatialLocation = Frontier::Vector3{ 0.0f, 0.0f, 0.0f };
        Scene.Finalise(1u, nullptr);

        const std::vector<Frontier::TriangleIndex>& CutFlat = Scene.QueryFlatTriangles();
        double WorstSibling = 0.0, LargestCut = 0.0;
        const uint32_t Partitions2 = Scene.QueryTopologyPartitions(T);
        for (uint32_t P = 0u; P < Scene.QueryInstances().size(); ++P)
        {
            const Frontier::InstanceRecord& Instance = Scene.QueryInstances()[P];
            const bool IsCut = P >= Break && P < Break + Partitions2;
            for (uint32_t T2 = 0u; T2 < Instance.TriangleCount; ++T2)
            {
                const size_t Slot = Instance.FlatTriangleOffset + T2;
                const Frontier::TriangleIndex& X = BeforeFlat[Slot];
                const Frontier::TriangleIndex& Y = CutFlat[Slot];
                const float Deltas[9] = {
                    X.VertexAlphaX - Y.VertexAlphaX, X.VertexAlphaY - Y.VertexAlphaY, X.VertexAlphaZ - Y.VertexAlphaZ,
                    X.VertexBetaX  - Y.VertexBetaX,  X.VertexBetaY  - Y.VertexBetaY,  X.VertexBetaZ  - Y.VertexBetaZ,
                    X.VertexGammaX - Y.VertexGammaX, X.VertexGammaY - Y.VertexGammaY, X.VertexGammaZ - Y.VertexGammaZ };
                for (float D : Deltas)
                {
                    if (IsCut) LargestCut   = std::max(LargestCut,   double(std::fabs(D)));
                    else       WorstSibling = std::max(WorstSibling, double(std::fabs(D)));
                }
            }
        }
        Line("   after the cut — moved on the forked placement: %.3f m,  moved on its siblings: %.3e m",
             LargestCut, WorstSibling);
        Check(LargestCut > 0.0,     "the cut actually changed the forked placement");
        Check(WorstSibling == 0.0, "the cut moved nothing on any sibling — the fork is deep");
    }

    Line("");
    Line("================================================================================");
    Line(" %s", Failures == 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT");
    Line("================================================================================");

    if (std::FILE* Out = std::fopen("VisualProof/SharedTopology/SharedTopologyProof.txt", "wb"))
    {
        std::fwrite(Transcript.data(), 1u, Transcript.size(), Out);
        std::fclose(Out);
    }
    return Failures == 0 ? 0 : 1;
}
