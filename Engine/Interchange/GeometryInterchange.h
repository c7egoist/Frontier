/*============================================================================================================================================
                                                            GEOMETRYINTERCHANGE.H
============================================================================================================================================*/
// 🧩 External .obj, .gltf/.glb, .stl, .ply & FCT1 .face geometry interchange importing/exporting multi-UDIM PolygonNetworks & FacePartitionRegisters

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/GeometrySpace/Network/FacePartitionRegister.h"
#include "Engine/GeometrySpace/Network/PolygonNetwork.h"
#include "Engine/GeometrySpace/Primitives/AnalyticPrimitives.h"

#include <filesystem>
#include <string>
#include <string_view>

namespace Frontier::Interchange
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class ExternalGeometryFormat : uint8_t
{
    Unknown      = 0u, // [-] - Unrecognized file extension
    WavefrontObj = 1u, // [-] - Wavefront .obj polygonal text stream
    Gltf2Json    = 2u, // [-] - Khronos glTF 2.0 .gltf JSON + embedded/external buffer
    Gltf2Binary  = 3u, // [-] - Khronos glTF 2.0 .glb container (JSON chunk + BIN chunk)
    Stl          = 4u, // [-] - Stereolithography .stl triangle soup (binary or ASCII)
    Ply          = 5u, // [-] - Stanford .ply polygon stream (ASCII or binary, either byte order)
    Fct1Face     = 6u, // [-] - Frontier FCT1 .face binary stream with per-face material slot codes
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

// 📝 Raw FCT1 stream: 48 B header, Positions (12 B/vertex), Indices (12 B/face), SlotCodes (4 B/face), optional CornerNormals (36 B/face)
struct DecodedFct1Stream
{
    uint32_t              VertexCount   = 0u;    // [count] - Authored vertex count
    uint32_t              FaceCount     = 0u;    // [count] - Authored triangle count
    std::vector<float>    Positions     {};      // [m]     - XYZ triples, authored axes (+X forward, +Y left, +Z up)
    std::vector<uint32_t> Indices       {};      // [idx]   - Triangle corner indices (3 per face)
    std::vector<uint32_t> SlotCodes     {};      // [-]     - Per-face material slot code (6 BodyCoat .. 14 Taillight, 15 Default)
    std::vector<float>    CornerNormals {};      // [-]     - Authored corner normals (9 per face), empty when absent
    bool                  Valid         = false; // [-]     - True when the byte length matches the header exactly
};

class GeometryInterchange
{
public:
    [[nodiscard]] static ExternalGeometryFormat DetectFormatFromPath(const std::filesystem::path& FilePath) noexcept;

    // Basis each format's coordinates are authored in before conversion into the active world basis.
    [[nodiscard]] static Mathematics::WorldCoordinateBasis QueryAuthoredBasis(ExternalGeometryFormat Format) noexcept;

    [[nodiscard]] static bool ImportAssetFromBytes(
        std::span<const uint8_t>               SourceBytes,
        const std::filesystem::path&           SourcePath,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static bool ImportAssetFromFile(
        const std::filesystem::path&           SourcePath,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static bool ExportAssetToFile(
        const std::filesystem::path&                 TargetPath,
        const GeometrySpace::PolygonNetwork&         Network,
        const GeometrySpace::FacePartitionRegister*  OptionalPartitions,
        std::string&                                 OutDiagnostic);

    [[nodiscard]] static bool ImportWavefrontObjText(
        std::string_view                       ObjText,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static std::string ExportWavefrontObjText(
        const GeometrySpace::PolygonNetwork&        Network,
        const GeometrySpace::FacePartitionRegister* OptionalPartitions = nullptr);

    [[nodiscard]] static bool ImportGltf2JsonText(
        std::string_view                       GltfJsonText,
        const std::filesystem::path&           RootDirectory,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static std::string ExportGltf2JsonText(
        const GeometrySpace::PolygonNetwork& Network);

    [[nodiscard]] static bool ImportGlbBytes(
        std::span<const uint8_t>               GlbBytes,
        const std::filesystem::path&           RootDirectory,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static bool ImportStlBytes(
        std::span<const uint8_t>               StlBytes,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static bool ImportPlyBytes(
        std::span<const uint8_t>               PlyBytes,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    // Validates the FCT1 header and exact byte length; CornerNormals stay empty when the stream carries none.
    [[nodiscard]] static DecodedFct1Stream DecodeFct1Bytes(std::span<const uint8_t> Fct1Bytes) noexcept;

    // FCT1 slot code -> Face.PartGroupOrdinal; the first four distinct slots also get FacePartitionRegister layers.
    [[nodiscard]] static bool ImportFct1Bytes(
        std::span<const uint8_t>               Fct1Bytes,
        std::string_view                       DefaultTitle,
        GeometrySpace::ConstructedSampleAsset& OutAsset,
        std::string&                           OutDiagnostic);

    [[nodiscard]] static std::string_view QueryFct1SlotTitle(uint32_t SlotCode) noexcept;
};

} // namespace Frontier::Interchange
