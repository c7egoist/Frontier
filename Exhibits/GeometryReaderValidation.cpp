/*============================================================================================================================================
                                                         GEOMETRYREADERVALIDATION.CPP
============================================================================================================================================*/
// 🧩 G1 gate: GeometryInterchange readers (OBJ usemtl, STL bin/ascii, PLY ascii/bin, GLB nodes, glTF, FCT1 slots) + 6 clay tiles on Vulkan

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/GeometrySpace/Primitives/AnalyticPrimitives.h"
#include "Engine/Interchange/GeometryInterchange.h"
#include "Exhibits/GeometryCompileExhibitStudio.h"

#include <array>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <set>
#include <sstream>
#include <string>
#include <vector>

namespace
{

using namespace Frontier;
using Interchange::GeometryInterchange;

//------------------------------------------------------------------------------------------------------------------------
//                                                  FIXTURE ENCODERS
//------------------------------------------------------------------------------------------------------------------------

constexpr std::string_view CubeObjText =
    "# cube\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\n"
    "usemtl a\nf 1 4 3 2\nf 5 6 7 8\nusemtl b\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n";

void AppendUint32(std::vector<uint8_t>& Bytes, uint32_t Number)
{
    const auto* Raw = reinterpret_cast<const uint8_t*>(&Number);
    Bytes.insert(Bytes.end(), Raw, Raw + 4u);
}

void AppendFloat32(std::vector<uint8_t>& Bytes, float Number)
{
    const auto* Raw = reinterpret_cast<const uint8_t*>(&Number);
    Bytes.insert(Bytes.end(), Raw, Raw + 4u);
}

[[nodiscard]] std::vector<uint8_t> ToBytes(std::string_view Text)
{
    return std::vector<uint8_t>(Text.begin(), Text.end());
}

// Readers assume Y-up for STL / PLY / GLB, so fixtures leave the active basis the same way the OBJ exporter does.
[[nodiscard]] Mathematics::Axis3D ToAuthoredYUp(Mathematics::Axis3D P) noexcept
{
    return Mathematics::ConvertVectorBetweenBases(P, Mathematics::QueryActiveWorldBasis(), Mathematics::WorldCoordinateBasis::RightHandedYUp);
}

[[nodiscard]] std::vector<std::array<uint32_t, 3u>> FanTriangulate(const GeometrySpace::PolygonNetwork& Network)
{
    std::vector<std::array<uint32_t, 3u>> Triangles {};
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        std::vector<uint32_t> Loop {};
        uint32_t Walk = CurrentFace.BoundaryLoopEdgeIndex;
        for (uint16_t Step = 0u; Step < CurrentFace.CornerCount && Walk < Network.Edges.size(); ++Step)
        {
            Loop.push_back(Network.Edges[Walk].OriginVertexIndex);
            Walk = Network.Edges[Walk].NextEdgeIndex;
        }
        for (std::size_t Corner = 1u; Corner + 1u < Loop.size(); ++Corner)
        {
            Triangles.push_back({ Loop[0], Loop[Corner], Loop[Corner + 1u] });
        }
    }
    return Triangles;
}

[[nodiscard]] std::vector<uint8_t> EncodeBinaryStl(const GeometrySpace::PolygonNetwork& Network)
{
    const auto Triangles = FanTriangulate(Network);
    std::vector<uint8_t> Bytes(80u, 0u);
    AppendUint32(Bytes, static_cast<uint32_t>(Triangles.size()));
    for (const auto& Tri : Triangles)
    {
        for (int Pad = 0; Pad < 3; ++Pad) { AppendFloat32(Bytes, 0.0f); }
        for (const uint32_t V : Tri)
        {
            const Mathematics::Axis3D P = ToAuthoredYUp(Network.Vertices[V].Axes);
            AppendFloat32(Bytes, P.X); AppendFloat32(Bytes, P.Y); AppendFloat32(Bytes, P.Z);
        }
        Bytes.push_back(0u); Bytes.push_back(0u);
    }
    return Bytes;
}

// PLY binary little-endian keeps the network's n-gons (quads stay quads).
[[nodiscard]] std::vector<uint8_t> EncodeBinaryPly(const GeometrySpace::PolygonNetwork& Network)
{
    std::ostringstream Header;
    Header << "ply\nformat binary_little_endian 1.0\ncomment Frontier GeometryReaderValidation\n"
           << "element vertex " << Network.Vertices.size() << "\nproperty float x\nproperty float y\nproperty float z\n"
           << "element face " << Network.Faces.size() << "\nproperty list uchar int vertex_indices\nend_header\n";
    std::vector<uint8_t> Bytes = ToBytes(Header.str());
    for (const GeometrySpace::Vertex& Vert : Network.Vertices)
    {
        const Mathematics::Axis3D P = ToAuthoredYUp(Vert.Axes);
        AppendFloat32(Bytes, P.X); AppendFloat32(Bytes, P.Y); AppendFloat32(Bytes, P.Z);
    }
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        Bytes.push_back(static_cast<uint8_t>(CurrentFace.CornerCount));
        uint32_t Walk = CurrentFace.BoundaryLoopEdgeIndex;
        for (uint16_t Step = 0u; Step < CurrentFace.CornerCount; ++Step)
        {
            AppendUint32(Bytes, Network.Edges[Walk].OriginVertexIndex);
            Walk = Network.Edges[Walk].NextEdgeIndex;
        }
    }
    return Bytes;
}

// GLB with one mesh referenced by a parent node (translation) and a child node (quaternion yaw) to exercise node transforms.
[[nodiscard]] std::vector<uint8_t> EncodeGlb(std::span<const float> Positions, std::span<const uint32_t> Indices, std::string_view NodesJson, std::string_view SceneRoots)
{
    std::vector<uint8_t> Bin {};
    for (const float P : Positions) { AppendFloat32(Bin, P); }
    const std::size_t PositionBytes = Bin.size();
    for (const uint32_t I : Indices) { AppendUint32(Bin, I); }
    while (Bin.size() % 4u != 0u) { Bin.push_back(0u); }

    std::ostringstream Json;
    Json << "{\"asset\":{\"version\":\"2.0\"},\"scene\":0,\"scenes\":[{\"nodes\":" << SceneRoots << "}],\"nodes\":" << NodesJson
         << ",\"meshes\":[{\"primitives\":[{\"attributes\":{\"POSITION\":0}" << (Indices.empty() ? "" : ",\"indices\":1") << "}]}]"
         << ",\"accessors\":[{\"bufferView\":0,\"componentType\":5126,\"count\":" << Positions.size() / 3u << ",\"type\":\"VEC3\"}"
         << (Indices.empty() ? std::string() : ",{\"bufferView\":1,\"componentType\":5125,\"count\":" + std::to_string(Indices.size()) + ",\"type\":\"SCALAR\"}")
         << "],\"bufferViews\":[{\"buffer\":0,\"byteLength\":" << PositionBytes << "}"
         << (Indices.empty() ? std::string() : ",{\"buffer\":0,\"byteOffset\":" + std::to_string(PositionBytes) + ",\"byteLength\":" + std::to_string(Indices.size() * 4u) + "}")
         << "],\"buffers\":[{\"byteLength\":" << Bin.size() << "}]}";
    std::string JsonText = Json.str();
    while (JsonText.size() % 4u != 0u) { JsonText.push_back(' '); }

    std::vector<uint8_t> Glb {};
    AppendUint32(Glb, 0x46546C67u);
    AppendUint32(Glb, 2u);
    AppendUint32(Glb, static_cast<uint32_t>(12u + 8u + JsonText.size() + 8u + Bin.size()));
    AppendUint32(Glb, static_cast<uint32_t>(JsonText.size()));
    AppendUint32(Glb, 0x4E4F534Au);
    Glb.insert(Glb.end(), JsonText.begin(), JsonText.end());
    AppendUint32(Glb, static_cast<uint32_t>(Bin.size()));
    AppendUint32(Glb, 0x004E4942u);
    Glb.insert(Glb.end(), Bin.begin(), Bin.end());
    return Glb;
}

[[nodiscard]] std::vector<uint8_t> ReadFileBytes(const std::filesystem::path& FilePath)
{
    std::ifstream Input(FilePath, std::ios::binary);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(Input)), std::istreambuf_iterator<char>());
}

[[nodiscard]] uint32_t CountTriangles(const GeometrySpace::PolygonNetwork& Network) noexcept
{
    uint32_t Triangles = 0u;
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        Triangles += (CurrentFace.CornerCount >= 3u) ? CurrentFace.CornerCount - 2u : 0u;
    }
    return Triangles;
}

[[nodiscard]] std::set<uint16_t> CollectSlots(const GeometrySpace::PolygonNetwork& Network)
{
    std::set<uint16_t> Slots {};
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        Slots.insert(CurrentFace.PartGroupOrdinal);
    }
    return Slots;
}

struct ReaderTile
{
    std::string                           FormatTitle {};
    std::string                           SourceTitle {};
    GeometrySpace::ConstructedSampleAsset Asset       {};
    bool                                  Imported    = false;
    std::string                           Diagnostic  {};
};

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENTRY POINT
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    const std::filesystem::path RepoRoot = Exhibits::ResolveRepositoryRootPath();
    const std::filesystem::path ModelDir = RepoRoot / "EngineContent/EnvironmentArchives/ControlVehicle";
    Exhibits::ExhibitScoreboard Score {};
    Score.SuiteTitle = "GeometryReaderValidation";

    // ① OBJ: quads stay n-gons in PolygonNetwork; usemtl names become PartGroupOrdinal slots
    {
        GeometrySpace::ConstructedSampleAsset Cube {};
        std::string Diag;
        const bool Imported = GeometryInterchange::ImportWavefrontObjText(CubeObjText, "Cube", Cube, Diag);
        uint32_t SlotTwoTris = 0u;
        for (const GeometrySpace::Face& CurrentFace : Cube.Network.Faces)
        {
            SlotTwoTris += (CurrentFace.PartGroupOrdinal == 2u) ? CurrentFace.CornerCount - 2u : 0u;
        }
        Score.Check(Imported && CountTriangles(Cube.Network) == 12u, "OBJ cube: 6 quads = 12 triangles");
        Score.Check(CollectSlots(Cube.Network).size() == 2u && Cube.Layers.InspectLayers().size() >= 2u, "OBJ usemtl a / b -> 2 slots + 2 layers");
        Score.Check(SlotTwoTris == 8u, "OBJ slot b holds 8 triangles");
    }

    // ② STL binary + ASCII, PLY ASCII quad + binary triangle, GLB node +2 X, .fbx has no reader
    {
        const std::array<float, 9u> Tri {{ 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f }};
        std::vector<uint8_t> Stl(80u, 0u);
        AppendUint32(Stl, 1u);
        for (int Pad = 0; Pad < 3; ++Pad) { AppendFloat32(Stl, 0.0f); }
        for (const float P : Tri) { AppendFloat32(Stl, P); }
        Stl.push_back(0u); Stl.push_back(0u);

        GeometrySpace::ConstructedSampleAsset Out {};
        std::string Diag;
        Score.Check(GeometryInterchange::ImportStlBytes(Stl, "StlBin", Out, Diag) && CountTriangles(Out.Network) * 3u == 3u, "STL binary: 1 triangle = 3 indices");
        const auto Ascii = ToBytes("solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n");
        Score.Check(GeometryInterchange::ImportStlBytes(Ascii, "StlAscii", Out, Diag) && Out.Network.Vertices.size() * 3u == 9u, "STL ASCII: 9 position floats");

        const auto PlyAscii = ToBytes("ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 1\n"
                                      "property list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n");
        Score.Check(GeometryInterchange::ImportPlyBytes(PlyAscii, "PlyAscii", Out, Diag) && CountTriangles(Out.Network) * 3u == 6u, "PLY ASCII quad: 6 triangle indices");

        std::vector<uint8_t> PlyBin = ToBytes("ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\n"
                                              "element face 1\nproperty list uchar int vertex_indices\nend_header\n");
        for (const float P : Tri) { AppendFloat32(PlyBin, P); }
        PlyBin.push_back(3u);
        for (uint32_t I = 0u; I < 3u; ++I) { AppendUint32(PlyBin, I); }
        Score.Check(GeometryInterchange::ImportPlyBytes(PlyBin, "PlyBin", Out, Diag) && CountTriangles(Out.Network) * 3u == 3u, "PLY binary triangle: 3 indices");

        const auto Glb = EncodeGlb(Tri, {}, "[{\"mesh\":0,\"translation\":[2,0,0]}]", "[0]");
        const bool GlbOk = GeometryInterchange::ImportGlbBytes(Glb, {}, "Glb", Out, Diag);
        Score.Check(GlbOk && CountTriangles(Out.Network) == 1u && std::fabs(Out.Network.Vertices[0].Axes.X - 2.0f) < 1.0e-6f, "GLB: node translation +2 X -> x0 = 2");

        const bool FbxRefused = !GeometryInterchange::ImportAssetFromBytes(std::vector<uint8_t>(4u, 0u), "car.fbx", Out, Diag);
        Score.Check(FbxRefused && Diag.find("No reader") != std::string::npos, "car.fbx -> \"" + Diag + "\"");
    }

    // ③ FCT1 ControlVehicle streams decode with their authored counts; slot codes travel on PartGroupOrdinal
    std::vector<uint8_t> BodyBytes = ReadFileBytes(ModelDir / "ControlVehicleBody.face");
    {
        const auto Body = GeometryInterchange::DecodeFct1Bytes(BodyBytes);
        const auto Tyre = GeometryInterchange::DecodeFct1Bytes(ReadFileBytes(ModelDir / "ControlVehicleTyre.face"));
        const auto Rim  = GeometryInterchange::DecodeFct1Bytes(ReadFileBytes(ModelDir / "ControlVehicleRim.face"));
        Score.Check(Body.Valid && Body.FaceCount == 2924u && Body.VertexCount == 1492u, "FCT1 body: 2924 tris / 1492 verts");
        Score.Check(Tyre.Valid && Tyre.FaceCount == 3968u, "FCT1 tyre: 3968 tris");
        Score.Check(Rim.Valid && Rim.FaceCount == 1568u, "FCT1 rim: 1568 tris");

        GeometrySpace::ConstructedSampleAsset BodyAsset {};
        std::string Diag;
        const bool  BodyOk = GeometryInterchange::ImportFct1Bytes(BodyBytes, "ControlVehicleBody", BodyAsset, Diag);
        const auto  Slots  = CollectSlots(BodyAsset.Network);
        Score.Check(BodyOk && BodyAsset.Network.Faces.size() == 2924u && Slots.count(6u) == 1u && Slots.count(13u) == 1u,
                    "FCT1 body network keeps 2924 faces; slots include 6 BodyCoat + 13 Headlight");

        std::vector<uint8_t> Truncated(BodyBytes.begin(), BodyBytes.end() - 4);
        Score.Check(!GeometryInterchange::ImportFct1Bytes(Truncated, "Truncated", BodyAsset, Diag), "FCT1 length mismatch rejected");
    }

    // ④ Six format tiles: every tile is a real reader output, rendered by the engine viewport on Vulkan
    std::array<ReaderTile, 6u> Tiles {};
    {
        const auto Crate = GeometrySpace::ConstructSamplePolygonNetwork(GeometrySpace::SampleAssetPreset::TacticalCrate);
        Tiles[0].FormatTitle = "OBJ";
        Tiles[0].SourceTitle = "TacticalCrate (o/g/usemtl -> layers)";
        Tiles[0].Imported    = GeometryInterchange::ImportWavefrontObjText(GeometryInterchange::ExportWavefrontObjText(Crate.Network, &Crate.Layers), "Crate", Tiles[0].Asset, Tiles[0].Diagnostic);

        const auto Integrator = GeometrySpace::ConstructSamplePolygonNetwork(GeometrySpace::SampleAssetPreset::ControlledIntegrator);
        Tiles[1].FormatTitle = "glTF";
        Tiles[1].SourceTitle = "ControlledIntegrator (scenes/nodes/meshes)";
        Tiles[1].Imported    = GeometryInterchange::ImportGltf2JsonText(GeometryInterchange::ExportGltf2JsonText(Integrator.Network), {}, "Integrator", Tiles[1].Asset, Tiles[1].Diagnostic);

        const auto Bust = GeometrySpace::ConstructSamplePolygonNetwork(GeometrySpace::SampleAssetPreset::ArmoredBust);
        std::vector<float>    BustPositions {};
        std::vector<uint32_t> BustIndices   {};
        for (const GeometrySpace::Vertex& Vert : Bust.Network.Vertices)
        {
            const Mathematics::Axis3D P = ToAuthoredYUp(Vert.Axes);
            BustPositions.insert(BustPositions.end(), { P.X, P.Y, P.Z });
        }
        for (const auto& Tri : FanTriangulate(Bust.Network))
        {
            BustIndices.insert(BustIndices.end(), Tri.begin(), Tri.end());
        }
        // Parent lifts by 0.5 m (Y-up), child yaws 90° about +Y: both transforms must land in the network
        const std::string Nodes = "[{\"translation\":[0,0.5,0],\"children\":[1]},{\"mesh\":0,\"rotation\":[0,0.7071068,0,0.7071068]}]";
        Tiles[2].FormatTitle = "GLB";
        Tiles[2].SourceTitle = "ArmoredBust (BIN chunk, parent + child node)";
        Tiles[2].Imported    = GeometryInterchange::ImportGlbBytes(EncodeGlb(BustPositions, BustIndices, Nodes, "[0]"), {}, "Bust", Tiles[2].Asset, Tiles[2].Diagnostic);

        const auto Arch = GeometrySpace::ConstructSamplePolygonNetwork(GeometrySpace::SampleAssetPreset::UDIMArchKit);
        Tiles[3].FormatTitle = "STL";
        Tiles[3].SourceTitle = "UDIMArchKit (binary, unwelded soup)";
        Tiles[3].Imported    = GeometryInterchange::ImportStlBytes(EncodeBinaryStl(Arch.Network), "Arch", Tiles[3].Asset, Tiles[3].Diagnostic);

        const auto Coupe = GeometrySpace::ConstructSamplePolygonNetwork(GeometrySpace::SampleAssetPreset::AeroCoupeGT);
        Tiles[4].FormatTitle = "PLY";
        Tiles[4].SourceTitle = "AeroCoupeGT (binary LE, n-gons kept)";
        Tiles[4].Imported    = GeometryInterchange::ImportPlyBytes(EncodeBinaryPly(Coupe.Network), "Coupe", Tiles[4].Asset, Tiles[4].Diagnostic);

        Tiles[5].FormatTitle = "FCT1";
        Tiles[5].SourceTitle = "ControlVehicleBody.face (slot codes)";
        Tiles[5].Imported    = GeometryInterchange::ImportFct1Bytes(BodyBytes, "ControlVehicleBody", Tiles[5].Asset, Tiles[5].Diagnostic);

        // GLB tile: child yaw 90° about +Y and parent lift must both appear (bounds swap X/Y extents in Z-up, min Z rises 0.5 m)
        std::vector<Mathematics::Axis3D> BustPoints {}, TilePoints {};
        for (const auto& Vert : Bust.Network.Vertices) { BustPoints.push_back(Vert.Axes); }
        for (const auto& Vert : Tiles[2].Asset.Network.Vertices) { TilePoints.push_back(Vert.Axes); }
        const auto BustBounds = SimulationSpace::PhysicsSpace::EvaluateAxisAlignedBounds(BustPoints);
        const auto TileBounds = SimulationSpace::PhysicsSpace::EvaluateAxisAlignedBounds(TilePoints);
        Score.Check(Tiles[2].Imported &&
                    std::fabs(TileBounds.QuerySize().X - BustBounds.QuerySize().Y) < 1.0e-3f &&
                    std::fabs(TileBounds.Minimum.Z - (BustBounds.Minimum.Z + 0.5f)) < 1.0e-3f,
                    "GLB parent lift + child quaternion compose into the network");
        for (const ReaderTile& Tile : Tiles)
        {
            Score.Check(Tile.Imported, Tile.FormatTitle + " tile imported" + (Tile.Diagnostic.empty() ? std::string() : " (" + Tile.Diagnostic + ")"));
        }
    }

    constexpr uint32_t CanvasW = 1800u, CanvasH = 1120u;
    constexpr uint32_t TileW = 560u, TileH = 380u;
    Exhibits::GeometryCompileExhibitStudio Studio {};
    std::string StudioDiag;
    if (!Score.Check(Studio.Initialize(RepoRoot, CanvasW, CanvasH, StudioDiag), "Vulkan UVWorkspaceRasterizer ready " + StudioDiag))
    {
        return 1;
    }

    std::vector<Exhibits::GeometryCompileExhibitStudio::PendingTileBlit> Blits {};
    for (std::size_t Idx = 0u; Idx < Tiles.size(); ++Idx)
    {
        Exhibits::GeometryCompileExhibitStudio::PendingTileBlit Blit {};
        Blit.X      = 30u + static_cast<uint32_t>(Idx % 3u) * (TileW + 30u);
        Blit.Y      = 112u + static_cast<uint32_t>(Idx / 3u) * (TileH + 88u);
        Blit.Width  = TileW;
        Blit.Height = TileH;
        if (Tiles[Idx].Imported)
        {
            const bool Rendered = Studio.RenderNetworkTile(Tiles[Idx].Asset.Network, Tiles[Idx].Asset.Layers.InspectLayers(),
                GeometricRaster::SurfaceDisplayMode::PriorityLayerTint, TileW, TileH, Blit.Rgba);
            Score.Check(Rendered, Tiles[Idx].FormatTitle + " tile rendered on Vulkan");
        }
        Blits.push_back(std::move(Blit));
    }

    ImDrawList* List  = Studio.BeginLabelCanvas();
    const ImU32 Title = IM_COL32(236, 239, 244, 255);
    const ImU32 Muted = IM_COL32(150, 162, 182, 255);
    const ImU32 Accent = IM_COL32(136, 192, 208, 255);
    const ImU32 Panel = IM_COL32(25, 30, 39, 255);
    List->AddText(ImVec2(30.0f, 26.0f), Title, "G1 - GeometryInterchange readers -> PolygonNetwork (6 formats, rendered by the engine viewport on Vulkan)");
    List->AddText(ImVec2(30.0f, 54.0f), Muted, "Layer tint = FacePartitionRegister layer. OBJ/FCT1 groups and slot codes become layers + Face.PartGroupOrdinal.");
    for (std::size_t Idx = 0u; Idx < Tiles.size(); ++Idx)
    {
        const auto& Blit = Blits[Idx];
        const float X = static_cast<float>(Blit.X), Y = static_cast<float>(Blit.Y);
        List->AddRectFilled(ImVec2(X - 6.0f, Y - 30.0f), ImVec2(X + TileW + 6.0f, Y + TileH + 52.0f), Panel, 6.0f);
        List->AddText(ImVec2(X, Y - 24.0f), Accent, Tiles[Idx].FormatTitle.c_str());
        List->AddText(ImVec2(X + 60.0f, Y - 24.0f), Title, Tiles[Idx].SourceTitle.c_str());
        const auto& Net = Tiles[Idx].Asset.Network;
        char Line[160] {};
        std::snprintf(Line, sizeof(Line), "%zu verts  |  %zu faces  |  %u tris  |  %zu slots  |  %zu layers",
            Net.Vertices.size(), Net.Faces.size(), CountTriangles(Net), CollectSlots(Net).size(), Tiles[Idx].Asset.Layers.InspectLayers().size());
        List->AddText(ImVec2(X, Y + TileH + 14.0f), Muted, Line);
    }

    char Footer[160] {};
    std::snprintf(Footer, sizeof(Footer), "Checks: %zu passed, %u failed  (OBJ usemtl, STL bin/ascii, PLY ascii/bin, GLB nodes, .fbx refused, FCT1 counts + slots)",
        Score.Lines.size() - Score.QueryFailedCount(), Score.QueryFailedCount());
    List->AddText(ImVec2(30.0f, 1070.0f), Score.QueryFailedCount() == 0u ? IM_COL32(126, 214, 150, 255) : IM_COL32(240, 104, 104, 255), Footer);

    const std::filesystem::path OutputPng = RepoRoot / "Exhibits/Images/GeometryCompiler/01-ReaderFormatTiles.png";
    Score.Check(Studio.WriteCanvas(OutputPng, Blits, { 16, 18, 23, 255 }), "Wrote 01-ReaderFormatTiles.png");
    Studio.Teardown();

    for (const auto& Line : Score.Lines)
    {
        std::printf("  %s %s\n", Line.Passed ? "PASS" : "FAIL", Line.Label.c_str());
    }
    std::printf("[GeometryReaderValidation] %zu checks, %u failed -> %s\n", Score.Lines.size(), Score.QueryFailedCount(), OutputPng.string().c_str());
    return Score.QueryFailedCount() == 0u ? 0 : 1;
}
