//============================================================================================================================================
//                                                         DISTANCEATLASCHECKS.CPP
//============================================================================================================================================
// 📦 Dependency-free CPU proof: baked local distance volumes match brute-force triangle distance, and moving an instance never re-bakes.

#include "../../Engine/GeometricRaster/DistanceAtlasSpace.h"
#include "../../Engine/GeometricRaster/SceneStructure.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>

using namespace Frontier;

namespace
{
int FailureCount = 0;

void Report(bool Passed, const char* Name, const char* Detail, FILE* Log)
{
    if (!Passed) ++FailureCount;
    std::fprintf(stdout, "  %s  %s  %s\n", Passed ? "PASS" : "FAIL", Name, Detail);
    if (Log) std::fprintf(Log, "  %s  %s  %s\n", Passed ? "PASS" : "FAIL", Name, Detail);
}

struct SceneMesh
{
    std::vector<VertexRecord> Vertices;
    std::vector<uint32_t>     Corners;
};

uint32_t AppendBox(SceneMesh& Mesh, float HalfExtent, uint32_t& Triangles, uint32_t& VertexBase)
{
    const uint32_t FirstIndex = static_cast<uint32_t>(Mesh.Corners.size());
    const uint32_t Base       = static_cast<uint32_t>(Mesh.Vertices.size());
    for (uint32_t Corner = 0u; Corner < 8u; ++Corner)
    {
        VertexRecord Vertex{};
        Vertex.SpatialLocation = { (Corner & 1u) ? HalfExtent : -HalfExtent, (Corner & 2u) ? HalfExtent : -HalfExtent, (Corner & 4u) ? HalfExtent : -HalfExtent };
        Mesh.Vertices.push_back(Vertex);
    }
    const uint32_t Faces[12][3] = { { 0, 2, 1 }, { 1, 2, 3 }, { 4, 5, 6 }, { 5, 7, 6 }, { 0, 1, 4 }, { 1, 5, 4 },
                                    { 2, 6, 3 }, { 3, 6, 7 }, { 0, 4, 2 }, { 2, 4, 6 }, { 1, 3, 5 }, { 3, 7, 5 } };
    for (const auto& Face : Faces) for (uint32_t Corner : Face) Mesh.Corners.push_back(Corner);   // indices are relative to the instance's VertexOffset
    VertexBase = Base;
    Triangles = 12u;
    return FirstIndex;
}

uint32_t AppendSphere(SceneMesh& Mesh, float Radius, uint32_t Rings, uint32_t Segments, uint32_t& Triangles, uint32_t& VertexBase)
{
    const uint32_t FirstIndex = static_cast<uint32_t>(Mesh.Corners.size());
    const uint32_t Base       = static_cast<uint32_t>(Mesh.Vertices.size());
    for (uint32_t Ring = 0u; Ring <= Rings; ++Ring)
        for (uint32_t Segment = 0u; Segment <= Segments; ++Segment)
        {
            const float Polar = 3.14159265f * float(Ring) / float(Rings), Azimuth = 6.2831853f * float(Segment) / float(Segments);
            VertexRecord Vertex{};
            Vertex.SpatialLocation = { Radius * std::sin(Polar) * std::cos(Azimuth), Radius * std::sin(Polar) * std::sin(Azimuth), Radius * std::cos(Polar) };
            Mesh.Vertices.push_back(Vertex);
        }
    Triangles = 0u;
    for (uint32_t Ring = 0u; Ring < Rings; ++Ring)
        for (uint32_t Segment = 0u; Segment < Segments; ++Segment)
        {
            const uint32_t Alpha = Ring * (Segments + 1u) + Segment, Beta = Alpha + Segments + 1u;
            for (uint32_t Corner : { Alpha, Beta, Alpha + 1u, Alpha + 1u, Beta, Beta + 1u }) Mesh.Corners.push_back(Corner);
            Triangles += 2u;
        }
    VertexBase = Base;
    return FirstIndex;
}

uint32_t AppendQuad(SceneMesh& Mesh, float HalfExtent, uint32_t& Triangles, uint32_t& VertexBase)
{
    const uint32_t FirstIndex = static_cast<uint32_t>(Mesh.Corners.size());
    const uint32_t Base       = static_cast<uint32_t>(Mesh.Vertices.size());
    for (uint32_t Corner = 0u; Corner < 4u; ++Corner)
    {
        VertexRecord Vertex{};
        Vertex.SpatialLocation = { (Corner & 1u) ? HalfExtent : -HalfExtent, (Corner & 2u) ? HalfExtent : -HalfExtent, 0.0f };
        Mesh.Vertices.push_back(Vertex);
    }
    for (uint32_t Corner : { 0u, 1u, 2u, 1u, 3u, 2u }) Mesh.Corners.push_back(Corner);
    VertexBase = Base;
    Triangles = 2u;
    return FirstIndex;
}

void PlaceTransform(InstanceRecord& Row, float Yaw, const float Scale[3], const float Position[3])
{
    std::memset(Row.World, 0, sizeof(Row.World));
    const float Cosine = std::cos(Yaw), Sine = std::sin(Yaw);
    // column-major: World[column * 4 + row]
    Row.World[0] = Cosine * Scale[0]; Row.World[1] = Sine * Scale[0];
    Row.World[4] = -Sine * Scale[1];  Row.World[5] = Cosine * Scale[1];
    Row.World[10] = Scale[2];
    Row.World[12] = Position[0]; Row.World[13] = Position[1]; Row.World[14] = Position[2]; Row.World[15] = 1.0f;
    std::memcpy(Row.PreviousWorld, Row.World, sizeof(Row.World));
}

float DistancePointSegment(const float Point[3], const float Start[3], const float End[3])
{
    float Edge[3], Delta[3];
    float EdgeLength = 0.0f, Along = 0.0f;
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis) { Edge[Axis] = End[Axis] - Start[Axis]; Delta[Axis] = Point[Axis] - Start[Axis]; EdgeLength += Edge[Axis] * Edge[Axis]; Along += Edge[Axis] * Delta[Axis]; }
    const float Weight = EdgeLength > 0.0f ? std::clamp(Along / EdgeLength, 0.0f, 1.0f) : 0.0f;
    float Sum = 0.0f;
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis) { const float Offset = Delta[Axis] - Edge[Axis] * Weight; Sum += Offset * Offset; }
    return std::sqrt(Sum);
}

/// 📝 Independent of the baker's Ericson walk: project onto the plane and accept the foot when it lies inside, otherwise take the nearest edge.
float DistancePointTriangle(const float Point[3], const float Alpha[3], const float Beta[3], const float Gamma[3])
{
    float EdgeAlpha[3], EdgeBeta[3], Normal[3], Delta[3];
    for (uint32_t Axis = 0u; Axis < 3u; ++Axis) { EdgeAlpha[Axis] = Beta[Axis] - Alpha[Axis]; EdgeBeta[Axis] = Gamma[Axis] - Alpha[Axis]; Delta[Axis] = Point[Axis] - Alpha[Axis]; }
    Normal[0] = EdgeAlpha[1] * EdgeBeta[2] - EdgeAlpha[2] * EdgeBeta[1];
    Normal[1] = EdgeAlpha[2] * EdgeBeta[0] - EdgeAlpha[0] * EdgeBeta[2];
    Normal[2] = EdgeAlpha[0] * EdgeBeta[1] - EdgeAlpha[1] * EdgeBeta[0];
    const float NormalLength = std::sqrt(Normal[0] * Normal[0] + Normal[1] * Normal[1] + Normal[2] * Normal[2]);
    float       Best         = std::min({ DistancePointSegment(Point, Alpha, Beta), DistancePointSegment(Point, Beta, Gamma), DistancePointSegment(Point, Gamma, Alpha) });
    if (NormalLength > 1.0e-12f)
    {
        const float Height = (Delta[0] * Normal[0] + Delta[1] * Normal[1] + Delta[2] * Normal[2]) / NormalLength;
        float Foot[3];
        for (uint32_t Axis = 0u; Axis < 3u; ++Axis) Foot[Axis] = Point[Axis] - Normal[Axis] / NormalLength * Height;
        float Side[3][3];
        const float* Corners[3] = { Alpha, Beta, Gamma };
        bool Inside = true;
        for (uint32_t Edge = 0u; Edge < 3u; ++Edge)
        {
            const float* Start = Corners[Edge]; const float* End = Corners[(Edge + 1u) % 3u];
            const float Run[3] = { End[0] - Start[0], End[1] - Start[1], End[2] - Start[2] };
            const float Rise[3] = { Foot[0] - Start[0], Foot[1] - Start[1], Foot[2] - Start[2] };
            Side[Edge][0] = Run[1] * Rise[2] - Run[2] * Rise[1]; Side[Edge][1] = Run[2] * Rise[0] - Run[0] * Rise[2]; Side[Edge][2] = Run[0] * Rise[1] - Run[1] * Rise[0];
            Inside &= (Side[Edge][0] * Normal[0] + Side[Edge][1] * Normal[1] + Side[Edge][2] * Normal[2]) >= 0.0f;
        }
        if (Inside) Best = std::min(Best, std::fabs(Height));
    }
    return Best;
}

float BruteForce(const SceneMesh& Mesh, const std::vector<InstanceRecord>& Rows, const float Point[3])
{
    float Best = 1.0e20f;
    for (const InstanceRecord& Row : Rows)
        for (uint32_t Primitive = 0u; Primitive < Row.TriangleCount; ++Primitive)
        {
            float Corners[3][3];
            for (uint32_t Corner = 0u; Corner < 3u; ++Corner)
            {
                const Vector3& Local = Mesh.Vertices[Mesh.Corners[Row.FirstIndex + Primitive * 3u + Corner] + Row.VertexOffset].SpatialLocation;
                for (uint32_t Axis = 0u; Axis < 3u; ++Axis)
                    Corners[Corner][Axis] = Row.World[Axis] * Local.x + Row.World[4u + Axis] * Local.y + Row.World[8u + Axis] * Local.z + Row.World[12u + Axis];
            }
            Best = std::min(Best, DistancePointTriangle(Point, Corners[0], Corners[1], Corners[2]));
        }
    return Best;
}
} // namespace

int main()
{
    FILE* Log = std::fopen("VisualProof/DistanceAtlas/DistanceAtlasChecks.log", "w");
    std::printf("DistanceAtlasChecks\n");
    if (Log) std::fprintf(Log, "DistanceAtlasChecks\n");
    char Detail[256];

    SceneMesh Mesh;
    uint32_t  BoxTriangles = 0u, SphereTriangles = 0u, QuadTriangles = 0u, BoxBase = 0u, SphereBase = 0u, QuadBase = 0u;
    const uint32_t BoxFirst    = AppendBox(Mesh, 0.5f, BoxTriangles, BoxBase);
    const uint32_t SphereFirst = AppendSphere(Mesh, 1.0f, 96u, 192u, SphereTriangles, SphereBase);
    const uint32_t QuadFirst   = AppendQuad(Mesh, 40.0f, QuadTriangles, QuadBase);
    std::vector<InstanceRecord> Rows(4);
    for (auto& Row : Rows) std::memset(&Row, 0, sizeof(Row));
    const float One[3] = { 1.0f, 1.0f, 1.0f };
    const float Origin[3] = { 0.0f, 0.0f, 0.5f };
    const float SphereAt[3] = { 5.0f, 0.0f, 1.5f };
    const float SphereScale[3] = { 1.5f, 1.5f, 1.5f };
    const float BoxAt[3] = { 0.0f, 6.0f, 1.0f };
    const float BoxScale[3] = { 1.4f, 1.4f, 1.4f };
    const float Ground[3] = { 0.0f, 0.0f, 0.0f };
    Rows[0].FirstIndex = BoxFirst;    Rows[0].VertexOffset = BoxBase;    Rows[0].TriangleCount = BoxTriangles;    PlaceTransform(Rows[0], 0.0f, One, Origin);
    Rows[1].FirstIndex = SphereFirst; Rows[1].VertexOffset = SphereBase; Rows[1].TriangleCount = SphereTriangles; PlaceTransform(Rows[1], 0.4f, SphereScale, SphereAt);
    Rows[2].FirstIndex = BoxFirst;    Rows[2].VertexOffset = BoxBase;    Rows[2].TriangleCount = BoxTriangles;    PlaceTransform(Rows[2], 0.5236f, BoxScale, BoxAt);   // shares instance 0's mesh
    Rows[3].FirstIndex = QuadFirst;   Rows[3].VertexOffset = QuadBase;   Rows[3].TriangleCount = QuadTriangles;   PlaceTransform(Rows[3], 0.0f, One, Ground);

    DistanceAtlasSpace Atlas;
    DistanceAtlasSettings Settings{};
    const bool Baked = Atlas.Bake(Mesh.Vertices, Mesh.Corners, Rows, Settings);
    std::snprintf(Detail, sizeof(Detail), "%u volumes for %u instances, %llu voxels, %.3f s, voxel %.3f..%.3f m", Atlas.QueryReport().Volumes, Atlas.QueryReport().Instances,
                  static_cast<unsigned long long>(Atlas.QueryReport().Voxels), Atlas.QueryReport().Seconds, Atlas.QueryReport().FinestVoxel, Atlas.QueryReport().CoarsestVoxel);
    Report(Baked && Atlas.QueryReport().Volumes == 3u, "bake shares the mesh of instances 0 and 2", Detail, Log);

    std::mt19937 Random(7u);
    std::uniform_real_distribution<float> Unit(0.0f, 1.0f);
    const auto Measure = [&](const std::vector<InstanceRecord>& Pose, float& WorstOver, float& WorstUnder, float& MeanError)
    {
        WorstOver = WorstUnder = MeanError = 0.0f;
        const uint32_t SampleCount = 4000u;
        for (uint32_t Index = 0u; Index < SampleCount; ++Index)
        {
            const float Point[3] = { -12.0f + 24.0f * Unit(Random), -12.0f + 24.0f * Unit(Random), 0.05f + 6.0f * Unit(Random) };
            float       Cell     = 0.0f;
            const float Sampled  = Atlas.Sample(Point, Cell);
            const float Truth    = BruteForce(Mesh, Pose, Point);
            const float Error    = Sampled - Truth;
            WorstOver  = std::max(WorstOver, Error);
            WorstUnder = std::max(WorstUnder, -Error);
            MeanError += std::fabs(Error) / float(SampleCount);
        }
    };
    float Over = 0.0f, Under = 0.0f, Mean = 0.0f;
    Measure(Rows, Over, Under, Mean);
    const float CoarsestWorld = Atlas.QueryReport().CoarsestVoxel * 2.0f;
    std::snprintf(Detail, sizeof(Detail), "4000 points: worst over %.4f m, worst under %.4f m, mean |error| %.4f m (voxel %.3f m)", Over, Under, Mean, Atlas.QueryReport().FinestVoxel);
    Report(Over <= CoarsestWorld && Under <= CoarsestWorld, "baked pose matches brute-force triangle distance", Detail, Log);

    // Move instance 2 and the sphere; only the placement may change.
    const float* DataBefore = Atlas.QueryAtlas().data();
    const size_t SizeBefore = Atlas.QueryAtlas().size();
    const uint32_t BakesBefore = Atlas.QueryBakeCount();
    const uint64_t RevisionBefore = Atlas.QueryPlacementRevision();
    std::vector<InstanceRecord> Moved = Rows;
    const float NewBoxAt[3] = { -7.0f, -4.0f, 1.5f };
    const float NewBoxScale[3] = { 0.8f, 0.8f, 0.8f };
    PlaceTransform(Moved[2], -1.1f, NewBoxScale, NewBoxAt);
    const float NewSphereAt[3] = { 3.0f, 8.0f, 2.5f };
    PlaceTransform(Moved[1], 1.0f, SphereScale, NewSphereAt);
    const bool Projected = Atlas.Project(Moved.data(), static_cast<uint32_t>(Moved.size()));
    std::snprintf(Detail, sizeof(Detail), "bakes %u->%u, atlas %zu floats unchanged, revision %llu->%llu, moved %u", BakesBefore, Atlas.QueryBakeCount(), SizeBefore,
                  static_cast<unsigned long long>(RevisionBefore), static_cast<unsigned long long>(Atlas.QueryPlacementRevision()), Atlas.QueryMovedCount());
    Report(Projected && Atlas.QueryBakeCount() == BakesBefore && Atlas.QueryAtlas().data() == DataBefore && Atlas.QueryAtlas().size() == SizeBefore &&
           Atlas.QueryPlacementRevision() == RevisionBefore + 1u && Atlas.QueryMovedCount() == 2u,
           "moving instances re-places without re-baking", Detail, Log);
    Measure(Moved, Over, Under, Mean);
    std::snprintf(Detail, sizeof(Detail), "4000 points after the move: worst over %.4f m, worst under %.4f m, mean |error| %.4f m", Over, Under, Mean);
    Report(Over <= CoarsestWorld && Under <= CoarsestWorld, "moved pose matches brute-force triangle distance", Detail, Log);

    const uint64_t RevisionMoved = Atlas.QueryPlacementRevision();
    (void)Atlas.Project(Moved.data(), static_cast<uint32_t>(Moved.size()));
    Report(Atlas.QueryPlacementRevision() == RevisionMoved, "an unchanged pose does not bump the placement revision", "revision stable", Log);

    // Non-uniform scale: the field may underestimate (it scales by the smallest singular value) but must never overestimate.
    const float StretchScale[3] = { 1.5f, 0.75f, 2.0f };
    std::vector<InstanceRecord> Stretched = Moved;
    PlaceTransform(Stretched[2], -1.1f, StretchScale, NewBoxAt);
    (void)Atlas.Project(Stretched.data(), static_cast<uint32_t>(Stretched.size()));
    Measure(Stretched, Over, Under, Mean);
    std::snprintf(Detail, sizeof(Detail), "stretched box (1.5, 0.75, 2): worst over %.4f m, worst under %.4f m (underestimate is the price of one scalar scale)", Over, Under);
    Report(Over <= CoarsestWorld, "non-uniform scale never overestimates", Detail, Log);

    // Thread-count independence.
    DistanceAtlasSpace Single, Many;
    DistanceAtlasSettings OneThread{}; OneThread.ThreadCount = 1u;
    DistanceAtlasSettings EightThreads{}; EightThreads.ThreadCount = 8u;
    const bool BakedSingle = Single.Bake(Mesh.Vertices, Mesh.Corners, Rows, OneThread);
    const bool BakedMany   = Many.Bake(Mesh.Vertices, Mesh.Corners, Rows, EightThreads);
    std::snprintf(Detail, sizeof(Detail), "1 thread %.3f s, 8 threads %.3f s", Single.QueryReport().Seconds, Many.QueryReport().Seconds);
    float WorstDifference = 0.0f;
    for (size_t Index = 0u; Index < Single.QueryAtlas().size() && Index < Many.QueryAtlas().size(); ++Index)
        WorstDifference = std::max(WorstDifference, std::fabs(Single.QueryAtlas()[Index] - Many.QueryAtlas()[Index]));
    std::snprintf(Detail + std::strlen(Detail), sizeof(Detail) - std::strlen(Detail), ", worst difference %.2e m", WorstDifference);
    Report(BakedSingle && BakedMany && Single.QueryAtlas().size() == Many.QueryAtlas().size() && WorstDifference < 1.0e-5f, "bake agrees across thread counts", Detail, Log);

    std::printf("%s (%d failures)\n", FailureCount ? "FAILED" : "ALL PASSED", FailureCount);
    if (Log) { std::fprintf(Log, "%s (%d failures)\n", FailureCount ? "FAILED" : "ALL PASSED", FailureCount); std::fclose(Log); }
    return FailureCount ? 1 : 0;
}
