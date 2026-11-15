/*============================================================================================================================================
                                                           GEOMETRYINTERCHANGE.CPP
============================================================================================================================================*/
// 🧩 Implementation of .obj, .gltf/.glb, .stl, .ply & FCT1 .face multi-UDIM PolygonNetwork + FacePartitionRegister import and export

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Interchange/GeometryInterchange.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <limits>
#include <set>
#include <sstream>
#include <span>
#include <cstdlib>
#include <unordered_map>
#include <vector>

namespace Frontier::Interchange
{

namespace
{

[[nodiscard]] std::string LowercaseExtension(const std::filesystem::path& FilePath)
{
    std::string Ext = FilePath.extension().string();
    for (char& Ch : Ext)
    {
        Ch = static_cast<char>(std::tolower(static_cast<unsigned char>(Ch)));
    }
    return Ext;
}

[[nodiscard]] uint32_t ReadUint32LE(const uint8_t* Ptr) noexcept
{
    uint32_t Out = 0u;
    std::memcpy(&Out, Ptr, sizeof(Out));
    return Out;
}

[[nodiscard]] float ReadFloat32LE(const uint8_t* Ptr) noexcept
{
    float Out = 0.0f;
    std::memcpy(&Out, Ptr, sizeof(Out));
    return Out;
}

[[nodiscard]] std::string_view TrimAscii(std::string_view View) noexcept
{
    while (!View.empty() && std::isspace(static_cast<unsigned char>(View.front())))
    {
        View.remove_prefix(1u);
    }
    while (!View.empty() && std::isspace(static_cast<unsigned char>(View.back())))
    {
        View.remove_suffix(1u);
    }
    return View;
}

[[nodiscard]] Mathematics::Scalar3D LayerSwatchTint(uint32_t Index) noexcept
{
    constexpr std::array<Mathematics::Scalar3D, 6u> Swatches {{
        { 0.95f, 0.88f, 0.62f },
        { 0.42f, 0.72f, 0.96f },
        { 0.56f, 0.86f, 0.68f },
        { 0.94f, 0.58f, 0.46f },
        { 0.78f, 0.62f, 0.94f },
        { 0.54f, 0.86f, 0.88f },
    }};
    return Swatches[Index % Swatches.size()];
}

void FinalizeConstructedAssetUDIMs(GeometrySpace::ConstructedSampleAsset& Asset)
{
    std::set<uint32_t> UniqueUDIMs {};
    for (uint32_t FaceIdx = 0u; FaceIdx < Asset.Network.Faces.size(); ++FaceIdx)
    {
        UniqueUDIMs.insert(Asset.Network.DeriveFaceUDIMNumber(FaceIdx));
    }
    if (UniqueUDIMs.empty())
    {
        UniqueUDIMs.insert(1001u);
    }
    Asset.UDIMTiles.assign(UniqueUDIMs.begin(), UniqueUDIMs.end());
    Asset.Layers.SynchronizePartitions(Asset.Network, GeometrySpace::GeometryInstanceToken{ 0u, 1u });
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    BASE64 CODEC
//------------------------------------------------------------------------------------------------------------------------

[[nodiscard]] std::string EncodeRadix64(const uint8_t* Bytes, std::size_t Length)
{
    static constexpr char Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string Out;
    Out.reserve(((Length + 2u) / 3u) * 4u);

    for (std::size_t Idx = 0u; Idx < Length; Idx += 3u)
    {
        const uint32_t B0 = Bytes[Idx];
        const uint32_t B1 = (Idx + 1u < Length) ? Bytes[Idx + 1u] : 0u;
        const uint32_t B2 = (Idx + 2u < Length) ? Bytes[Idx + 2u] : 0u;
        const uint32_t Triple = (B0 << 16u) | (B1 << 8u) | B2;

        Out.push_back(Alphabet[(Triple >> 18u) & 0x3Fu]);
        Out.push_back(Alphabet[(Triple >> 12u) & 0x3Fu]);
        Out.push_back((Idx + 1u < Length) ? Alphabet[(Triple >> 6u) & 0x3Fu] : '=');
        Out.push_back((Idx + 2u < Length) ? Alphabet[Triple & 0x3Fu] : '=');
    }
    return Out;
}

[[nodiscard]] std::vector<uint8_t> DecodeRadix64(std::string_view Encoded)
{
    std::array<int8_t, 256u> DigitLookup {};
    DigitLookup.fill(-1);
    static constexpr std::string_view Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (std::size_t Idx = 0u; Idx < Alphabet.size(); ++Idx)
    {
        DigitLookup[static_cast<uint8_t>(Alphabet[Idx])] = static_cast<int8_t>(Idx);
    }

    std::vector<uint8_t> Out;
    Out.reserve((Encoded.size() * 3u) / 4u);

    uint32_t Accum = 0u;
    int      Bits  = -8;
    for (const char Ch : Encoded)
    {
        const unsigned char UCh = static_cast<unsigned char>(Ch);
        if (std::isspace(UCh))
        {
            continue;
        }
        if (Ch == '=')
        {
            break;
        }
        const int8_t Val = DigitLookup[UCh];
        if (Val < 0)
        {
            continue;
        }
        Accum = (Accum << 6u) | static_cast<uint32_t>(Val);
        Bits += 6;
        if (Bits >= 0)
        {
            Out.push_back(static_cast<uint8_t>((Accum >> Bits) & 0xFFu));
            Bits -= 8;
        }
    }
    return Out;
}

[[nodiscard]] bool ParseObjIndex(std::string_view Token, int& OutIndex) noexcept
{
    if (Token.empty())
    {
        OutIndex = 0;
        return true;
    }
    const auto Parsed = std::from_chars(Token.data(), Token.data() + Token.size(), OutIndex);
    return Parsed.ec == std::errc{} && Parsed.ptr == Token.data() + Token.size();
}

[[nodiscard]] int ResolveObjIndex(int RawOneBased, std::size_t TotalCount) noexcept
{
    if (TotalCount > static_cast<std::size_t>(std::numeric_limits<int>::max()))
    {
        return -1;
    }
    if (RawOneBased > 0)
    {
        return RawOneBased - 1;
    }
    if (RawOneBased < 0)
    {
        return static_cast<int>(TotalCount) + RawOneBased;
    }
    return -1;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                  FORMAT DISPATCH
//------------------------------------------------------------------------------------------------------------------------

ExternalGeometryFormat GeometryInterchange::DetectFormatFromPath(const std::filesystem::path& FilePath) noexcept
{
    const std::string Ext = LowercaseExtension(FilePath);
    if (Ext == ".obj")  return ExternalGeometryFormat::WavefrontObj;
    if (Ext == ".gltf") return ExternalGeometryFormat::Gltf2Json;
    if (Ext == ".glb")  return ExternalGeometryFormat::Gltf2Binary;
    if (Ext == ".stl")  return ExternalGeometryFormat::Stl;
    if (Ext == ".ply")  return ExternalGeometryFormat::Ply;
    if (Ext == ".face") return ExternalGeometryFormat::Fct1Face;
    return ExternalGeometryFormat::Unknown;
}

Mathematics::WorldCoordinateBasis GeometryInterchange::QueryAuthoredBasis(ExternalGeometryFormat Format) noexcept
{
    // FCT1 is authored +X forward, +Y left, +Z up; every other reader follows the OBJ / glTF Y-up convention.
    return (Format == ExternalGeometryFormat::Fct1Face)
        ? Mathematics::WorldCoordinateBasis::RightHandedZUp
        : Mathematics::WorldCoordinateBasis::RightHandedYUp;
}

bool GeometryInterchange::ImportAssetFromBytes(
    std::span<const uint8_t>               SourceBytes,
    const std::filesystem::path&           SourcePath,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    const std::string      Stem = SourcePath.stem().string().empty() ? "ImportedGeometry" : SourcePath.stem().string();
    const std::string_view Text(reinterpret_cast<const char*>(SourceBytes.data()), SourceBytes.size());

    switch (DetectFormatFromPath(SourcePath))
    {
        case ExternalGeometryFormat::WavefrontObj:
            return ImportWavefrontObjText(Text, Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Gltf2Json:
            return ImportGltf2JsonText(Text, SourcePath.parent_path(), Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Gltf2Binary:
            return ImportGlbBytes(SourceBytes, SourcePath.parent_path(), Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Stl:
            return ImportStlBytes(SourceBytes, Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Ply:
            return ImportPlyBytes(SourceBytes, Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Fct1Face:
            return ImportFct1Bytes(SourceBytes, Stem, OutAsset, OutDiagnostic);
        case ExternalGeometryFormat::Unknown:
            break;
    }

    OutDiagnostic = "No reader for " + (SourcePath.extension().empty() ? std::string("extension-less") : SourcePath.extension().string()) + " files.";
    return false;
}

bool GeometryInterchange::ImportAssetFromFile(
    const std::filesystem::path&           SourcePath,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    std::ifstream Stream(SourcePath, std::ios::binary);
    if (!Stream)
    {
        OutDiagnostic = "Unable to open external geometry file: " + SourcePath.string();
        return false;
    }
    const std::vector<uint8_t> Content((std::istreambuf_iterator<char>(Stream)), std::istreambuf_iterator<char>());
    return ImportAssetFromBytes(Content, SourcePath, OutAsset, OutDiagnostic);
}

bool GeometryInterchange::ExportAssetToFile(
    const std::filesystem::path&                TargetPath,
    const GeometrySpace::PolygonNetwork&        Network,
    const GeometrySpace::FacePartitionRegister* OptionalPartitions,
    std::string&                                OutDiagnostic)
{
    if (TargetPath.has_parent_path())
    {
        std::error_code Ec {};
        std::filesystem::create_directories(TargetPath.parent_path(), Ec);
    }

    std::string Payload;
    switch (DetectFormatFromPath(TargetPath))
    {
        case ExternalGeometryFormat::WavefrontObj:
            Payload = ExportWavefrontObjText(Network, OptionalPartitions);
            break;
        case ExternalGeometryFormat::Gltf2Json:
            Payload = ExportGltf2JsonText(Network);
            break;
        default:
            OutDiagnostic = "Unsupported export extension: " + TargetPath.extension().string();
            return false;
    }

    std::ofstream Out(TargetPath, std::ios::binary | std::ios::trunc);
    if (!Out)
    {
        OutDiagnostic = "Unable to write geometry file: " + TargetPath.string();
        return false;
    }
    Out.write(Payload.data(), static_cast<std::streamsize>(Payload.size()));
    return Out.good();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  WAVEFRONT .OBJ
//------------------------------------------------------------------------------------------------------------------------

bool GeometryInterchange::ImportWavefrontObjText(
    std::string_view                       ObjText,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    OutAsset = GeometrySpace::ConstructedSampleAsset{};
    OutAsset.Network.NetworkTitle = std::string(DefaultTitle);

    std::vector<Mathematics::Axis3D> TempPositions {};
    std::vector<Mathematics::UVAxes> TempUVs       {};
    std::unordered_map<std::string, uint16_t> GroupToLayer {};

    uint16_t ActiveLayerOrdinal = 0u;
    uint16_t ActivePartOrdinal  = 0u;
    uint32_t NextColorIdx       = 0u;

    std::size_t LineStart = 0u;
    while (LineStart < ObjText.size())
    {
        std::size_t LineEnd = ObjText.find('\n', LineStart);
        if (LineEnd == std::string_view::npos)
        {
            LineEnd = ObjText.size();
        }
        const std::string_view RawLine = TrimAscii(ObjText.substr(LineStart, LineEnd - LineStart));
        LineStart = LineEnd + 1u;

        if (RawLine.empty() || RawLine.front() == '#')
        {
            continue;
        }

        if (RawLine.starts_with("v "))
        {
            float X = 0.0f;
            float Y = 0.0f;
            float Z = 0.0f;
            if (std::sscanf(std::string(RawLine.substr(2u)).c_str(), "%f %f %f", &X, &Y, &Z) == 3 &&
                std::isfinite(X) && std::isfinite(Y) && std::isfinite(Z) &&
                std::abs(X) <= 20000.0f && std::abs(Y) <= 20000.0f && std::abs(Z) <= 20000.0f)
            {
                const Mathematics::Axis3D Converted = Mathematics::ConvertVectorBetweenBases(
                    { X, Y, Z },
                    Mathematics::WorldCoordinateBasis::RightHandedYUp,
                    Mathematics::QueryActiveWorldBasis());
                TempPositions.push_back(Converted);
                (void)OutAsset.Network.AppendVertex(Converted);
            }
        }
        else if (RawLine.starts_with("vt "))
        {
            float U = 0.0f;
            float V = 0.0f;
            if (std::sscanf(std::string(RawLine.substr(3u)).c_str(), "%f %f", &U, &V) >= 2 &&
                std::isfinite(U) && std::isfinite(V) && std::abs(U) <= 100000.0f && std::abs(V) <= 100000.0f)
            {
                TempUVs.push_back({ U, V });
            }
        }
        else if (RawLine.starts_with("o ") || RawLine.starts_with("g ") || RawLine.starts_with("usemtl "))
        {
            const std::size_t SpacePos = RawLine.find(' ');
            const std::string GroupName(TrimAscii(RawLine.substr(SpacePos + 1u)));
            if (!GroupName.empty())
            {
                if (RawLine.starts_with("o ") && OutAsset.Network.Faces.empty())
                {
                    OutAsset.Network.NetworkTitle = GroupName;
                }
                auto It = GroupToLayer.find(GroupName);
                if (It == GroupToLayer.end())
                {
                    // Reserve up to 4 named priority layers; route additional groups to Remainder (0)
                    if (GroupToLayer.size() < 4u)
                    {
                        const uint16_t NewOrd = OutAsset.Layers.ConstructLayer(
                            GroupName,
                            LayerSwatchTint(NextColorIdx++),
                            20.0f);
                        GroupToLayer.emplace(GroupName, NewOrd);
                        ActiveLayerOrdinal = NewOrd;
                    }
                    else
                    {
                        ActiveLayerOrdinal = 0u;
                    }
                    ++ActivePartOrdinal;
                }
                else
                {
                    ActiveLayerOrdinal = It->second;
                }
            }
        }
        else if (RawLine.starts_with("f "))
        {
            std::vector<uint32_t>            FaceVerts {};
            std::vector<Mathematics::UVAxes> FaceUVs   {};

            std::string_view Rest = TrimAscii(RawLine.substr(2u));
            while (!Rest.empty())
            {
                std::size_t NextWs = 0u;
                while (NextWs < Rest.size() && !std::isspace(static_cast<unsigned char>(Rest[NextWs])))
                {
                    ++NextWs;
                }
                const std::string Token(Rest.substr(0u, NextWs));
                Rest = TrimAscii(Rest.substr(NextWs));

                int VIdx  = 0;
                int VtIdx = 0;
                const std::size_t Slash1 = Token.find('/');
                bool ValidIndices = true;
                if (Slash1 == std::string::npos)
                {
                    ValidIndices = ParseObjIndex(Token, VIdx);
                }
                else
                {
                    ValidIndices = ParseObjIndex(std::string_view(Token).substr(0u, Slash1), VIdx);
                    const std::size_t Slash2 = Token.find('/', Slash1 + 1u);
                    const std::string VtSub  = (Slash2 == std::string::npos)
                        ? Token.substr(Slash1 + 1u)
                        : Token.substr(Slash1 + 1u, Slash2 - Slash1 - 1u);
                    if (!VtSub.empty())
                    {
                        ValidIndices = ValidIndices && ParseObjIndex(VtSub, VtIdx);
                    }
                }
                if (!ValidIndices)
                {
                    FaceVerts.clear();
                    FaceUVs.clear();
                    break;
                }

                const int ResolvedV  = ResolveObjIndex(VIdx, TempPositions.size());
                const int ResolvedVt = ResolveObjIndex(VtIdx, TempUVs.size());
                if (ResolvedV < 0 || static_cast<std::size_t>(ResolvedV) >= TempPositions.size())
                {
                    continue;
                }
                FaceVerts.push_back(static_cast<uint32_t>(ResolvedV));
                if (ResolvedVt >= 0 && static_cast<std::size_t>(ResolvedVt) < TempUVs.size())
                {
                    FaceUVs.push_back(TempUVs[static_cast<std::size_t>(ResolvedVt)]);
                }
                else
                {
                    const auto& Pos = TempPositions[static_cast<std::size_t>(ResolvedV)];
                    FaceUVs.push_back({ Pos.X * 0.5f + 0.5f, Pos.Z * 0.5f + 0.5f });
                }
            }

            if (FaceVerts.size() >= 3u)
            {
                const std::set<uint32_t> UniqueFaceVertices(FaceVerts.begin(), FaceVerts.end());
                if (UniqueFaceVertices.size() != FaceVerts.size())
                {
                    continue;
                }
                GeometrySpace::FaceShadingAssignment Shading {};
                Shading.MatCapSlot = static_cast<uint8_t>((ActiveLayerOrdinal * 2u + 3u) % 16u);
                (void)OutAsset.Network.AppendFace(FaceVerts, FaceUVs, Shading, ActiveLayerOrdinal, ActivePartOrdinal);
            }
        }
    }

    if (OutAsset.Network.Faces.empty() || OutAsset.Network.Vertices.empty())
    {
        OutDiagnostic = "Wavefront .obj stream contains zero valid polygonal faces.";
        return false;
    }

    OutAsset.Network.LinkOppositeEdges(true);
    OutAsset.Network.RecomputeNormals();
    FinalizeConstructedAssetUDIMs(OutAsset);
    return true;
}

std::string GeometryInterchange::ExportWavefrontObjText(
    const GeometrySpace::PolygonNetwork&        Network,
    const GeometrySpace::FacePartitionRegister* OptionalPartitions)
{
    std::ostringstream Out;
    Out.setf(std::ios::fixed);
    Out.precision(6);

    Out << "# Frontier GeometryInterchange Wavefront OBJ\n";
    Out << "o " << (Network.NetworkTitle.empty() ? "FrontierNetwork" : Network.NetworkTitle) << "\n";

    const auto ActiveBasis = Mathematics::QueryActiveWorldBasis();
    for (const auto& Vert : Network.Vertices)
    {
        const Mathematics::Axis3D P = Mathematics::ConvertVectorBetweenBases(
            Vert.Axes,
            ActiveBasis,
            Mathematics::WorldCoordinateBasis::RightHandedYUp);
        Out << "v " << P.X << " " << P.Y << " " << P.Z << "\n";
    }
    for (const auto& Vert : Network.Vertices)
    {
        const Mathematics::Axis3D N = Mathematics::ConvertVectorBetweenBases(
            Vert.Normal,
            ActiveBasis,
            Mathematics::WorldCoordinateBasis::RightHandedYUp);
        Out << "vn " << N.X << " " << N.Y << " " << N.Z << "\n";
    }
    for (const auto& Edge : Network.Edges)
    {
        Out << "vt " << Edge.ParameterUV.U << " " << Edge.ParameterUV.V << "\n";
    }

    uint16_t LastLayer = 0xFFFFu;
    for (uint32_t FaceIdx = 0u; FaceIdx < Network.Faces.size(); ++FaceIdx)
    {
        const auto& Face = Network.Faces[FaceIdx];
        if (Face.PriorityLayerOrdinal != LastLayer)
        {
            LastLayer = Face.PriorityLayerOrdinal;
            std::string GroupTitle = "Remainder";
            if (OptionalPartitions != nullptr && LastLayer != 0u)
            {
                if (const auto* Layer = OptionalPartitions->InspectLayer(LastLayer))
                {
                    GroupTitle = Layer->LayerTitle;
                    std::replace(GroupTitle.begin(), GroupTitle.end(), ' ', '_');
                }
            }
            else if (LastLayer != 0u)
            {
                GroupTitle = "PriorityLayer_" + std::to_string(LastLayer);
            }
            Out << "g " << GroupTitle << "\n";
        }

        Out << "f";
        uint32_t EdgeIdx = Face.BoundaryLoopEdgeIndex;
        for (uint16_t Corner = 0u; Corner < Face.CornerCount && EdgeIdx != GeometrySpace::InvalidNetworkIndex; ++Corner)
        {
            const auto&    Edge = Network.Edges[EdgeIdx];
            const uint32_t V1   = Edge.OriginVertexIndex + 1u;
            const uint32_t Vt1  = EdgeIdx + 1u;
            Out << " " << V1 << "/" << Vt1 << "/" << V1;
            EdgeIdx = Edge.NextEdgeIndex;
        }
        Out << "\n";
    }
    return Out.str();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    GLTF 2.0 (.GLTF)
//------------------------------------------------------------------------------------------------------------------------

namespace
{

[[nodiscard]] std::size_t FindMatchingBracket(std::string_view Text, std::size_t OpenPos, char OpenCh, char CloseCh) noexcept
{
    int  Depth    = 0;
    bool InString = false;
    for (std::size_t Idx = OpenPos; Idx < Text.size(); ++Idx)
    {
        const char Ch = Text[Idx];
        if (Ch == '"' && (Idx == 0u || Text[Idx - 1u] != '\\'))
        {
            InString = !InString;
        }
        if (InString)
        {
            continue;
        }
        if (Ch == OpenCh)
        {
            ++Depth;
        }
        else if (Ch == CloseCh)
        {
            --Depth;
            if (Depth == 0)
            {
                return Idx;
            }
        }
    }
    return std::string_view::npos;
}

[[nodiscard]] std::string QuoteJsonFieldKey(std::string_view FieldName)
{
    std::string Needle {};
    Needle.reserve(FieldName.size() + 2u);
    Needle.push_back('"');
    Needle.append(FieldName.data(), FieldName.size());
    Needle.push_back('"');
    return Needle;
}

[[nodiscard]] int ExtractJsonIntField(std::string_view ObjSlice, std::string_view FieldName, int DefaultVal = -1) noexcept
{
    const std::string Needle = QuoteJsonFieldKey(FieldName);
    const std::size_t Pos    = ObjSlice.find(Needle);
    if (Pos == std::string_view::npos)
    {
        return DefaultVal;
    }
    const std::size_t Colon = ObjSlice.find(':', Pos + Needle.size());
    if (Colon == std::string_view::npos)
    {
        return DefaultVal;
    }
    const std::string_view Tail = TrimAscii(ObjSlice.substr(Colon + 1u));
    int Value = DefaultVal;
    (void)std::from_chars(Tail.data(), Tail.data() + Tail.size(), Value);
    return Value;
}

// Returns the offset just past the ':' of Key when Key is a direct member of the object that opens Root.
[[nodiscard]] std::size_t FindTopLevelJsonValue(std::string_view Root, std::string_view Key) noexcept
{
    int Depth = 0;
    for (std::size_t Idx = 0u; Idx < Root.size(); ++Idx)
    {
        const char Ch = Root[Idx];
        if (Ch == '"')
        {
            std::size_t Close = Idx + 1u;
            while (Close < Root.size() && Root[Close] != '"')
            {
                Close += (Root[Close] == '\\') ? 2u : 1u;
            }
            if (Close >= Root.size())
            {
                return std::string_view::npos;
            }
            if (Depth == 1 && Root.substr(Idx + 1u, Close - Idx - 1u) == Key)
            {
                std::size_t After = Close + 1u;
                while (After < Root.size() && std::isspace(static_cast<unsigned char>(Root[After])))
                {
                    ++After;
                }
                if (After < Root.size() && Root[After] == ':')
                {
                    return After + 1u;
                }
            }
            Idx = Close;
            continue;
        }
        if (Ch == '{' || Ch == '[')
        {
            ++Depth;
        }
        else if (Ch == '}' || Ch == ']')
        {
            --Depth;
        }
    }
    return std::string_view::npos;
}

// Direct members only: "scenes":[{"nodes":[0]}] must not shadow the root "nodes" array.
[[nodiscard]] std::vector<std::string_view> SplitJsonObjectArray(std::string_view Root, std::string_view ArrayKey)
{
    std::vector<std::string_view> Members {};
    const std::size_t ValuePos = FindTopLevelJsonValue(Root, ArrayKey);
    if (ValuePos == std::string_view::npos)
    {
        return Members;
    }
    const std::size_t ArrOpen = Root.find('[', ValuePos);
    if (ArrOpen == std::string_view::npos)
    {
        return Members;
    }
    const std::size_t ArrClose = FindMatchingBracket(Root, ArrOpen, '[', ']');
    if (ArrClose == std::string_view::npos)
    {
        return Members;
    }
    std::size_t Cursor = ArrOpen + 1u;
    while (Cursor < ArrClose)
    {
        const std::size_t ObjOpen = Root.find('{', Cursor);
        if (ObjOpen == std::string_view::npos || ObjOpen >= ArrClose)
        {
            break;
        }
        const std::size_t ObjClose = FindMatchingBracket(Root, ObjOpen, '{', '}');
        if (ObjClose == std::string_view::npos || ObjClose > ArrClose)
        {
            break;
        }
        Members.push_back(Root.substr(ObjOpen, ObjClose - ObjOpen + 1u));
        Cursor = ObjClose + 1u;
    }
    return Members;
}


// 📝 glTF node affine in row-major 3 × 4 form: Out = M[0..2]·P + M[3], M[4..6]·P + M[7], M[8..10]·P + M[11]
struct GltfInstanceAffine
{
    std::array<float, 12u> M {{ 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f }};
};

[[nodiscard]] GltfInstanceAffine ChainGltfAffine(const GltfInstanceAffine& Outer, const GltfInstanceAffine& Inner) noexcept
{
    GltfInstanceAffine Out {};
    for (int Row = 0; Row < 3; ++Row)
    {
        for (int Col = 0; Col < 4; ++Col)
        {
            float Sum = (Col == 3) ? Outer.M[Row * 4 + 3] : 0.0f;
            for (int K = 0; K < 3; ++K)
            {
                Sum += Outer.M[Row * 4 + K] * Inner.M[K * 4 + Col];
            }
            Out.M[Row * 4 + Col] = Sum;
        }
    }
    return Out;
}

[[nodiscard]] Mathematics::Axis3D ApplyGltfAffine(const GltfInstanceAffine& Affine, Mathematics::Axis3D P) noexcept
{
    return {
        Affine.M[0] * P.X + Affine.M[1] * P.Y + Affine.M[2]  * P.Z + Affine.M[3],
        Affine.M[4] * P.X + Affine.M[5] * P.Y + Affine.M[6]  * P.Z + Affine.M[7],
        Affine.M[8] * P.X + Affine.M[9] * P.Y + Affine.M[10] * P.Z + Affine.M[11],
    };
}

[[nodiscard]] int ExtractTopLevelJsonInt(std::string_view Root, std::string_view Key, int DefaultVal) noexcept
{
    const std::size_t ValuePos = FindTopLevelJsonValue(Root, Key);
    if (ValuePos == std::string_view::npos)
    {
        return DefaultVal;
    }
    const std::string_view Tail = TrimAscii(Root.substr(ValuePos));
    int Value = DefaultVal;
    (void)std::from_chars(Tail.data(), Tail.data() + Tail.size(), Value);
    return Value;
}

[[nodiscard]] std::vector<float> ExtractTopLevelJsonNumbers(std::string_view Root, std::string_view Key)
{
    std::vector<float> Numbers {};
    const std::size_t ValuePos = FindTopLevelJsonValue(Root, Key);
    if (ValuePos == std::string_view::npos)
    {
        return Numbers;
    }
    const std::size_t Open = Root.find('[', ValuePos);
    if (Open == std::string_view::npos || TrimAscii(Root.substr(ValuePos, Open - ValuePos)).size() != 0u)
    {
        return Numbers;
    }
    const std::size_t Close = Root.find(']', Open);
    if (Close == std::string_view::npos)
    {
        return Numbers;
    }
    const std::string Body(Root.substr(Open + 1u, Close - Open - 1u));
    const char*       Cursor = Body.c_str();
    while (*Cursor != '\0')
    {
        char*       Parsed = nullptr;
        const float Number = std::strtof(Cursor, &Parsed);
        if (Parsed == Cursor)
        {
            ++Cursor;
            continue;
        }
        Numbers.push_back(Number);
        Cursor = Parsed;
    }
    return Numbers;
}

// glTF node local transform: "matrix" (column-major 4 × 4) wins, otherwise T · R(quaternion) · S.
[[nodiscard]] GltfInstanceAffine ResolveGltfInstanceAffine(std::string_view InstanceSlice)
{
    GltfInstanceAffine Local {};
    const std::vector<float> Matrix = ExtractTopLevelJsonNumbers(InstanceSlice, "matrix");
    if (Matrix.size() == 16u)
    {
        for (int Row = 0; Row < 3; ++Row)
        {
            for (int Col = 0; Col < 4; ++Col)
            {
                Local.M[Row * 4 + Col] = Matrix[static_cast<std::size_t>(Col * 4 + Row)];
            }
        }
        return Local;
    }

    std::vector<float> T = ExtractTopLevelJsonNumbers(InstanceSlice, "translation");
    std::vector<float> Q = ExtractTopLevelJsonNumbers(InstanceSlice, "rotation");
    std::vector<float> S = ExtractTopLevelJsonNumbers(InstanceSlice, "scale");
    if (T.size() != 3u) { T = { 0.0f, 0.0f, 0.0f }; }
    if (Q.size() != 4u) { Q = { 0.0f, 0.0f, 0.0f, 1.0f }; }
    if (S.size() != 3u) { S = { 1.0f, 1.0f, 1.0f }; }

    const float Qx = Q[0], Qy = Q[1], Qz = Q[2], Qw = Q[3];
    const std::array<float, 9u> R {{
        1.0f - 2.0f * (Qy * Qy + Qz * Qz), 2.0f * (Qx * Qy - Qz * Qw),        2.0f * (Qx * Qz + Qy * Qw),
        2.0f * (Qx * Qy + Qz * Qw),        1.0f - 2.0f * (Qx * Qx + Qz * Qz), 2.0f * (Qy * Qz - Qx * Qw),
        2.0f * (Qx * Qz - Qy * Qw),        2.0f * (Qy * Qz + Qx * Qw),        1.0f - 2.0f * (Qx * Qx + Qy * Qy),
    }};
    for (int Row = 0; Row < 3; ++Row)
    {
        for (int Col = 0; Col < 3; ++Col)
        {
            Local.M[Row * 4 + Col] = R[static_cast<std::size_t>(Row * 3 + Col)] * S[static_cast<std::size_t>(Col)];
        }
        Local.M[Row * 4 + 3] = T[static_cast<std::size_t>(Row)];
    }
    return Local;
}

struct GltfShapePlacement
{
    int            MeshIndex = -1; // [idx] - meshes[] entry
    GltfInstanceAffine World     {};   // [-]   - Accumulated scene transform
};

// Walks scenes[scene].nodes (or every root node) depth-first, accumulating parent transforms onto each mesh reference.
[[nodiscard]] std::vector<GltfShapePlacement> CollectGltfShapePlacements(
    std::string_view                     GltfJsonText,
    const std::vector<std::string_view>& Instances,
    std::size_t                          ShapeCount)
{
    std::vector<GltfShapePlacement> Placements {};
    if (Instances.empty())
    {
        for (std::size_t ShapeIdx = 0u; ShapeIdx < ShapeCount; ++ShapeIdx)
        {
            Placements.push_back({ static_cast<int>(ShapeIdx), {} });
        }
        return Placements;
    }

    std::vector<int> RootInstances {};
    const auto       Scenes   = SplitJsonObjectArray(GltfJsonText, "scenes");
    const int        SceneIdx = ExtractTopLevelJsonInt(GltfJsonText, "scene", 0);
    if (SceneIdx >= 0 && static_cast<std::size_t>(SceneIdx) < Scenes.size())
    {
        for (const float Raw : ExtractTopLevelJsonNumbers(Scenes[static_cast<std::size_t>(SceneIdx)], "nodes"))
        {
            RootInstances.push_back(static_cast<int>(Raw));
        }
    }
    if (RootInstances.empty())
    {
        std::vector<bool> Referenced(Instances.size(), false);
        for (const auto InstanceSlice : Instances)
        {
            for (const float Raw : ExtractTopLevelJsonNumbers(InstanceSlice, "children"))
            {
                const int DescendantIdx = static_cast<int>(Raw);
                if (DescendantIdx >= 0 && static_cast<std::size_t>(DescendantIdx) < Instances.size())
                {
                    Referenced[static_cast<std::size_t>(DescendantIdx)] = true;
                }
            }
        }
        for (std::size_t InstanceIdx = 0u; InstanceIdx < Instances.size(); ++InstanceIdx)
        {
            if (!Referenced[InstanceIdx])
            {
                RootInstances.push_back(static_cast<int>(InstanceIdx));
            }
        }
    }

    struct PendingVisit
    {
        int            InstanceIndex = -1;
        GltfInstanceAffine Outer     {};
    };
    std::vector<PendingVisit> Pending {};
    for (auto Root = RootInstances.rbegin(); Root != RootInstances.rend(); ++Root)
    {
        Pending.push_back({ *Root, {} });
    }

    const std::size_t VisitBudget = Instances.size() * 8u + 8u; // Guards malformed cyclic hierarchies
    std::size_t       Visits      = 0u;
    while (!Pending.empty() && Visits++ < VisitBudget)
    {
        const PendingVisit Visit = Pending.back();
        Pending.pop_back();
        if (Visit.InstanceIndex < 0 || static_cast<std::size_t>(Visit.InstanceIndex) >= Instances.size())
        {
            continue;
        }
        const std::string_view InstanceSlice  = Instances[static_cast<std::size_t>(Visit.InstanceIndex)];
        const GltfInstanceAffine   World = ChainGltfAffine(Visit.Outer, ResolveGltfInstanceAffine(InstanceSlice));
        const int              ShapeIndex  = ExtractTopLevelJsonInt(InstanceSlice, "mesh", -1);
        if (ShapeIndex >= 0 && static_cast<std::size_t>(ShapeIndex) < ShapeCount)
        {
            Placements.push_back({ ShapeIndex, World });
        }
        const std::vector<float> Descendants = ExtractTopLevelJsonNumbers(InstanceSlice, "children");
        for (auto Child = Descendants.rbegin(); Child != Descendants.rend(); ++Child)
        {
            Pending.push_back({ static_cast<int>(*Child), World });
        }
    }
    return Placements;
}

// Shared .gltf / .glb document walk. GlbBinChunk supplies buffer 0 when the buffer has no "uri" (GLB-stored).
[[nodiscard]] bool ImportGltf2Document(
    std::string_view                       GltfJsonText,
    const std::filesystem::path&           RootDirectory,
    std::string_view                       DefaultTitle,
    std::span<const uint8_t>               GlbBinChunk,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    OutAsset = GeometrySpace::ConstructedSampleAsset{};
    OutAsset.Network.NetworkTitle = std::string(DefaultTitle);

    const auto Buffers     = SplitJsonObjectArray(GltfJsonText, "buffers");
    const auto BufferViews = SplitJsonObjectArray(GltfJsonText, "bufferViews");
    const auto Accessors   = SplitJsonObjectArray(GltfJsonText, "accessors");
    const auto Shapes      = SplitJsonObjectArray(GltfJsonText, "meshes");
    const auto Instances       = SplitJsonObjectArray(GltfJsonText, "nodes");

    if (Buffers.empty() || BufferViews.empty() || Accessors.empty())
    {
        OutDiagnostic = "glTF 2.0 document missing buffers, bufferViews, or accessors.";
        return false;
    }

    // Load buffer 0 (GLB BIN chunk, embedded base64 data URI, or external .bin file)
    std::vector<uint8_t> BinaryBlob {};
    {
        const std::string_view Buf0 = Buffers.front();
        const std::size_t UriKey    = Buf0.find("\"uri\"");
        if (UriKey != std::string_view::npos)
        {
            const std::size_t Q1 = Buf0.find('"', UriKey + 5u);
            const std::size_t Q2 = (Q1 != std::string_view::npos) ? Buf0.find('"', Q1 + 1u) : std::string_view::npos;
            if (Q1 != std::string_view::npos && Q2 != std::string_view::npos)
            {
                const std::string_view Uri = Buf0.substr(Q1 + 1u, Q2 - Q1 - 1u);
                const std::size_t Radix64Marker = Uri.find("base64,");
                if (Radix64Marker != std::string_view::npos)
                {
                    BinaryBlob = DecodeRadix64(Uri.substr(Radix64Marker + 7u));
                }
                else
                {
                    std::ifstream BinIn(RootDirectory / std::string(Uri), std::ios::binary);
                    if (BinIn)
                    {
                        BinaryBlob.assign(std::istreambuf_iterator<char>(BinIn), std::istreambuf_iterator<char>());
                    }
                }
            }
        }
        else if (!GlbBinChunk.empty())
        {
            BinaryBlob.assign(GlbBinChunk.begin(), GlbBinChunk.end());
        }
    }

    if (BinaryBlob.empty())
    {
        OutDiagnostic = "Unable to decode glTF 2.0 binary buffer payload.";
        return false;
    }

    auto ResolveAccessorBytes = [&](int AccessorIdx, int& OutCount, int& OutCompType, uint64_t AccessorValueByteCount) -> const uint8_t*
    {
        if (AccessorIdx < 0 || static_cast<std::size_t>(AccessorIdx) >= Accessors.size())
        {
            return nullptr;
        }
        const auto Acc       = Accessors[static_cast<std::size_t>(AccessorIdx)];
        const int  ViewIdx   = ExtractJsonIntField(Acc, "bufferView", -1);
        const int  AccOffset = ExtractJsonIntField(Acc, "byteOffset", 0);
        OutCount             = ExtractJsonIntField(Acc, "count", 0);
        OutCompType          = ExtractJsonIntField(Acc, "componentType", 0);
        if (ViewIdx < 0 || static_cast<std::size_t>(ViewIdx) >= BufferViews.size() || OutCount <= 0)
        {
            return nullptr;
        }
        const auto View = BufferViews[static_cast<std::size_t>(ViewIdx)];
        const int ViewOffset = ExtractJsonIntField(View, "byteOffset", 0);
        const int ViewLength = ExtractJsonIntField(View, "byteLength", -1);
        const int ViewBuffer = ExtractJsonIntField(View, "buffer", 0);
        const int ByteStride = ExtractJsonIntField(View, "byteStride", 0);
        if (ViewBuffer != 0 || ViewOffset < 0 || AccOffset < 0 || ViewLength < 0 ||
            (ByteStride != 0 && static_cast<uint64_t>(ByteStride) != AccessorValueByteCount))
        {
            return nullptr;
        }
        const uint64_t BaseOffset = static_cast<uint64_t>(ViewOffset) + static_cast<uint64_t>(AccOffset);
        const uint64_t SpanBytes = static_cast<uint64_t>(OutCount) * AccessorValueByteCount;
        const uint64_t ViewEnd = static_cast<uint64_t>(ViewOffset) + static_cast<uint64_t>(ViewLength);
        const uint64_t SpanEnd = BaseOffset + SpanBytes;
        if (BaseOffset % std::max<uint64_t>(1u, AccessorValueByteCount == 12u || AccessorValueByteCount == 8u ? sizeof(float) : AccessorValueByteCount) != 0u ||
            BaseOffset > BinaryBlob.size() || SpanEnd < BaseOffset || SpanEnd > ViewEnd || ViewEnd > BinaryBlob.size())
        {
            return nullptr;
        }
        return BinaryBlob.data() + static_cast<std::size_t>(BaseOffset);
    };

    // Weld identical scene-space positions so UV-split glTF vertices reconstruct a connected half-edge PolygonNetwork
    struct QuantizedPos
    {
        int32_t X;
        int32_t Y;
        int32_t Z;
        bool operator==(const QuantizedPos&) const noexcept = default;
    };
    struct QuantizedHash
    {
        std::size_t operator()(const QuantizedPos& Key) const noexcept
        {
            return (static_cast<std::size_t>(Key.X) * 73856093u) ^
                   (static_cast<std::size_t>(Key.Y) * 19349663u) ^
                   (static_cast<std::size_t>(Key.Z) * 83492791u);
        }
    };
    std::unordered_map<QuantizedPos, uint32_t, QuantizedHash> WeldedLookup {};

    const uint16_t ImportedLayer = OutAsset.Layers.ConstructLayer("Imported Primary", { 0.94f, 0.86f, 0.62f }, 50.0f);
    const auto     Placements    = CollectGltfShapePlacements(GltfJsonText, Instances, Shapes.size());

    // Legacy single-primitive documents without "meshes" keep importing their first POSITION accessor.
    std::vector<std::pair<std::string_view, GltfInstanceAffine>> PrimitiveInstances {};
    for (const auto& Placement : Placements)
    {
        for (const auto Primitive : SplitJsonObjectArray(Shapes[static_cast<std::size_t>(Placement.MeshIndex)], "primitives"))
        {
            PrimitiveInstances.emplace_back(Primitive, Placement.World);
        }
    }
    if (Shapes.empty())
    {
        PrimitiveInstances.emplace_back(GltfJsonText, GltfInstanceAffine{});
    }

    for (const auto& [Primitive, World] : PrimitiveInstances)
    {
        const int Mode = ExtractJsonIntField(Primitive, "mode", 4);
        if (Mode != 4)
        {
            continue; // Only TRIANGLES primitives carry surface faces
        }
        const int PosAccIdx   = ExtractJsonIntField(Primitive, "POSITION", -1);
        const int UVAccIdx    = ExtractJsonIntField(Primitive, "TEXCOORD_0", -1);
        const int IndAccIdx   = ExtractJsonIntField(Primitive, "indices", -1);
        const int MaterialIdx = ExtractJsonIntField(Primitive, "material", -1);

        int PosCount = 0;
        int PosType  = 0;
        const uint8_t* PosBytes = ResolveAccessorBytes(PosAccIdx, PosCount, PosType, sizeof(float) * 3u);
        if (PosBytes == nullptr || PosCount < 3 || PosType != 5126)
        {
            OutDiagnostic = "glTF 2.0 primitive missing FLOAT POSITION accessor.";
            return false;
        }

        int UVCount = 0;
        int UVType  = 0;
        const uint8_t* UVBytes = ResolveAccessorBytes(UVAccIdx, UVCount, UVType, sizeof(float) * 2u);

        std::vector<uint32_t>            RemappedVerts(static_cast<std::size_t>(PosCount));
        std::vector<Mathematics::UVAxes> RawUVs(static_cast<std::size_t>(PosCount), { 0.0f, 0.0f });

        std::vector<float> PosFloats(static_cast<std::size_t>(PosCount) * 3u);
        std::memcpy(PosFloats.data(), PosBytes, PosFloats.size() * sizeof(float));
        std::vector<float> UVFloats {};
        if (UVBytes != nullptr && UVType == 5126)
        {
            UVFloats.resize(static_cast<std::size_t>(UVCount) * 2u);
            std::memcpy(UVFloats.data(), UVBytes, UVFloats.size() * sizeof(float));
        }

        for (int Idx = 0; Idx < PosCount; ++Idx)
        {
            const Mathematics::Axis3D Local { PosFloats[Idx * 3 + 0], PosFloats[Idx * 3 + 1], PosFloats[Idx * 3 + 2] };
            const Mathematics::Axis3D P = ApplyGltfAffine(World, Local);
            if (!std::isfinite(P.X) || !std::isfinite(P.Y) || !std::isfinite(P.Z) ||
                std::abs(P.X) > 20000.0f || std::abs(P.Y) > 20000.0f || std::abs(P.Z) > 20000.0f)
            {
                OutDiagnostic = "glTF 2.0 POSITION contains non-finite or out-of-range coordinates.";
                return false;
            }
            const QuantizedPos Key {
                static_cast<int32_t>(std::llround(P.X * 100000.0)),
                static_cast<int32_t>(std::llround(P.Y * 100000.0)),
                static_cast<int32_t>(std::llround(P.Z * 100000.0)),
            };
            auto [It, Inserted] = WeldedLookup.emplace(Key, 0u);
            if (Inserted)
            {
                const Mathematics::Axis3D Converted = Mathematics::ConvertVectorBetweenBases(
                    P,
                    Mathematics::WorldCoordinateBasis::RightHandedYUp,
                    Mathematics::QueryActiveWorldBasis());
                It->second = OutAsset.Network.AppendVertex(Converted);
            }
            RemappedVerts[static_cast<std::size_t>(Idx)] = It->second;

            if (!UVFloats.empty() && Idx < UVCount)
            {
                // glTF 2.0 stores V top-down (1.0 - V relative to OpenGL/UDIM bottom-left convention)
                const float U = UVFloats[static_cast<std::size_t>(Idx) * 2u + 0u];
                const float V = UVFloats[static_cast<std::size_t>(Idx) * 2u + 1u];
                if (!std::isfinite(U) || !std::isfinite(V) || std::abs(U) > 100000.0f || std::abs(V) > 100000.0f)
                {
                    OutDiagnostic = "glTF 2.0 TEXCOORD_0 contains non-finite or out-of-range coordinates.";
                    return false;
                }
                RawUVs[static_cast<std::size_t>(Idx)] = { U, 1.0f - V };
            }
            else
            {
                RawUVs[static_cast<std::size_t>(Idx)] = { P.X * 0.5f + 0.5f, P.Z * 0.5f + 0.5f };
            }
        }

        int IndCount = 0;
        int IndType  = 0;
        uint64_t IndexByteSize = 1u;
        if (IndAccIdx >= 0 && static_cast<std::size_t>(IndAccIdx) < Accessors.size())
        {
            const int IndexComponentType = ExtractJsonIntField(Accessors[static_cast<std::size_t>(IndAccIdx)], "componentType", 0);
            IndexByteSize = (IndexComponentType == 5123) ? 2u : ((IndexComponentType == 5125) ? 4u : 1u);
        }
        const uint8_t* IndBytes = ResolveAccessorBytes(IndAccIdx, IndCount, IndType, IndexByteSize);
        if (IndAccIdx >= 0 && IndBytes == nullptr)
        {
            OutDiagnostic = "glTF 2.0 indices accessor exceeds its buffer view or binary buffer.";
            return false;
        }
        if (IndBytes != nullptr && IndType != 5121 && IndType != 5123 && IndType != 5125)
        {
            OutDiagnostic = "glTF 2.0 indices accessor uses an unsupported component type.";
            return false;
        }
        if (IndBytes != nullptr && (IndCount % 3) != 0)
        {
            OutDiagnostic = "glTF 2.0 triangle indices count is not divisible by three.";
            return false;
        }
        const int TriCount = (IndAccIdx >= 0) ? (IndCount / 3) : (PosCount / 3);

        // A mirrored node (negative determinant) flips winding; restore outward-facing loops.
        const float Determinant =
            World.M[0] * (World.M[5] * World.M[10] - World.M[6] * World.M[9]) -
            World.M[1] * (World.M[4] * World.M[10] - World.M[6] * World.M[8]) +
            World.M[2] * (World.M[4] * World.M[9]  - World.M[5] * World.M[8]);
        const bool MirroredInstance = Determinant < 0.0f;

        for (int Tri = 0; Tri < TriCount; ++Tri)
        {
            uint32_t RawI[3]{};
            for (int C = 0; C < 3; ++C)
            {
                const int Index = Tri * 3 + C;
                if (IndBytes == nullptr)
                {
                    RawI[C] = static_cast<uint32_t>(Index);
                }
                else if (IndType == 5123) // UNSIGNED_SHORT
                {
                    uint16_t Raw16 = 0u;
                    std::memcpy(&Raw16, IndBytes + static_cast<std::size_t>(Index) * 2u, sizeof(Raw16));
                    RawI[C] = Raw16;
                }
                else if (IndType == 5125) // UNSIGNED_INT
                {
                    std::memcpy(&RawI[C], IndBytes + static_cast<std::size_t>(Index) * 4u, sizeof(uint32_t));
                }
                else
                {
                    RawI[C] = IndBytes[Index];
                }
            }
            if (RawI[0] >= static_cast<uint32_t>(PosCount) ||
                RawI[1] >= static_cast<uint32_t>(PosCount) ||
                RawI[2] >= static_cast<uint32_t>(PosCount))
            {
                continue;
            }
            if (MirroredInstance)
            {
                std::swap(RawI[1], RawI[2]);
            }
            const std::array<uint32_t, 3u> LoopV {{ RemappedVerts[RawI[0]], RemappedVerts[RawI[1]], RemappedVerts[RawI[2]] }};
            if (LoopV[0] == LoopV[1] || LoopV[1] == LoopV[2] || LoopV[2] == LoopV[0])
            {
                continue;
            }
            const std::array<Mathematics::UVAxes, 3u> LoopUV {{ RawUVs[RawI[0]], RawUVs[RawI[1]], RawUVs[RawI[2]] }};
            const uint16_t PartOrdinal = static_cast<uint16_t>(MaterialIdx >= 0 ? MaterialIdx + 1 : 0);
            (void)OutAsset.Network.AppendFace(LoopV, LoopUV, {}, ImportedLayer, PartOrdinal);
        }
    }

    if (OutAsset.Network.Faces.empty())
    {
        OutDiagnostic = "glTF 2.0 primitive yielded zero non-degenerate triangles.";
        return false;
    }

    OutAsset.Network.LinkOppositeEdges(true);
    OutAsset.Network.RecomputeNormals();
    FinalizeConstructedAssetUDIMs(OutAsset);
    return true;
}

} // namespace

bool GeometryInterchange::ImportGltf2JsonText(
    std::string_view                       GltfJsonText,
    const std::filesystem::path&           RootDirectory,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    return ImportGltf2Document(GltfJsonText, RootDirectory, DefaultTitle, {}, OutAsset, OutDiagnostic);
}

std::string GeometryInterchange::ExportGltf2JsonText(const GeometrySpace::PolygonNetwork& Network)
{
    std::vector<float>    Positions {};
    std::vector<float>    Normals   {};
    std::vector<float>    Texcoords {};
    std::vector<uint32_t> Indices   {};

    Mathematics::Axis3D MinPos {  1.0e9f,  1.0e9f,  1.0e9f };
    Mathematics::Axis3D MaxPos { -1.0e9f, -1.0e9f, -1.0e9f };

    for (const auto& Face : Network.Faces)
    {
        if (Face.CornerCount < 3u || Face.BoundaryLoopEdgeIndex == GeometrySpace::InvalidNetworkIndex)
        {
            continue;
        }
        std::vector<uint32_t> FaceEdges {};
        FaceEdges.reserve(Face.CornerCount);
        uint32_t Cur = Face.BoundaryLoopEdgeIndex;
        bool FaceValid = true;
        for (uint16_t C = 0u; C < Face.CornerCount; ++C)
        {
            if (Cur >= Network.Edges.size())
            {
                FaceValid = false;
                break;
            }
            const auto& Edge = Network.Edges[Cur];
            if (Edge.OriginVertexIndex >= Network.Vertices.size())
            {
                FaceValid = false;
                break;
            }
            FaceEdges.push_back(Cur);
            Cur = Edge.NextEdgeIndex;
        }
        if (!FaceValid || FaceEdges.size() < 3u)
        {
            continue;
        }
        const uint32_t RootOut = static_cast<uint32_t>(Positions.size() / 3u);
        const auto ActiveBasis = Mathematics::QueryActiveWorldBasis();
        for (const uint32_t EIdx : FaceEdges)
        {
            const auto& Edge = Network.Edges[EIdx];
            const auto& Vert = Network.Vertices[Edge.OriginVertexIndex];
            const Mathematics::Axis3D P = Mathematics::ConvertVectorBetweenBases(
                Vert.Axes,
                ActiveBasis,
                Mathematics::WorldCoordinateBasis::RightHandedYUp);
            const Mathematics::Axis3D N = Mathematics::ConvertVectorBetweenBases(
                Vert.Normal,
                ActiveBasis,
                Mathematics::WorldCoordinateBasis::RightHandedYUp);
            Positions.insert(Positions.end(), { P.X, P.Y, P.Z });
            Normals.insert(Normals.end(), { N.X, N.Y, N.Z });
            Texcoords.insert(Texcoords.end(), { Edge.ParameterUV.U, 1.0f - Edge.ParameterUV.V });

            MinPos.X = std::min(MinPos.X, P.X);
            MinPos.Y = std::min(MinPos.Y, P.Y);
            MinPos.Z = std::min(MinPos.Z, P.Z);
            MaxPos.X = std::max(MaxPos.X, P.X);
            MaxPos.Y = std::max(MaxPos.Y, P.Y);
            MaxPos.Z = std::max(MaxPos.Z, P.Z);
        }
        for (std::size_t Tri = 1u; Tri + 1u < FaceEdges.size(); ++Tri)
        {
            Indices.push_back(RootOut);
            Indices.push_back(RootOut + static_cast<uint32_t>(Tri));
            Indices.push_back(RootOut + static_cast<uint32_t>(Tri + 1u));
        }
    }

    if (Positions.empty() || Indices.empty())
    {
        return {};
    }

    const std::size_t PosBytes = Positions.size() * sizeof(float);
    const std::size_t NrmBytes = Normals.size() * sizeof(float);
    const std::size_t TexBytes = Texcoords.size() * sizeof(float);
    const std::size_t IndBytes = Indices.size() * sizeof(uint32_t);
    const std::size_t TotalLen = PosBytes + NrmBytes + TexBytes + IndBytes;

    std::vector<uint8_t> Combined(TotalLen);
    std::size_t Offset = 0u;
    std::memcpy(Combined.data() + Offset, Positions.data(), PosBytes); Offset += PosBytes;
    std::memcpy(Combined.data() + Offset, Normals.data(), NrmBytes);   Offset += NrmBytes;
    std::memcpy(Combined.data() + Offset, Texcoords.data(), TexBytes); Offset += TexBytes;
    std::memcpy(Combined.data() + Offset, Indices.data(), IndBytes);

    const std::string Radix64Uri = "data:application/octet-stream;base64," + EncodeRadix64(Combined.data(), Combined.size());
    const std::size_t VertCount = Positions.size() / 3u;

    std::ostringstream Json;
    Json.setf(std::ios::fixed);
    Json.precision(6);
    Json << "{\n"
         << "  \"asset\": { \"version\": \"2.0\", \"generator\": \"Frontier GeometryInterchange\" },\n"
         << "  \"scene\": 0,\n"
         << "  \"scenes\": [{ \"nodes\": [0] }],\n"
         << "  \"nodes\": [{ \"name\": \"" << Network.NetworkTitle << "\", \"mesh\": 0 }],\n"
         << "  \"meshes\": [{\n"
         << "    \"name\": \"" << Network.NetworkTitle << "\",\n"
         << "    \"primitives\": [{\n"
         << "      \"attributes\": { \"POSITION\": 0, \"NORMAL\": 1, \"TEXCOORD_0\": 2 },\n"
         << "      \"indices\": 3\n"
         << "    }]\n"
         << "  }],\n"
         << "  \"buffers\": [{ \"byteLength\": " << TotalLen << ", \"uri\": \"" << Radix64Uri << "\" }],\n"
         << "  \"bufferViews\": [\n"
         << "    { \"buffer\": 0, \"byteOffset\": 0, \"byteLength\": " << PosBytes << " },\n"
         << "    { \"buffer\": 0, \"byteOffset\": " << PosBytes << ", \"byteLength\": " << NrmBytes << " },\n"
         << "    { \"buffer\": 0, \"byteOffset\": " << (PosBytes + NrmBytes) << ", \"byteLength\": " << TexBytes << " },\n"
         << "    { \"buffer\": 0, \"byteOffset\": " << (PosBytes + NrmBytes + TexBytes) << ", \"byteLength\": " << IndBytes << " }\n"
         << "  ],\n"
         << "  \"accessors\": [\n"
         << "    { \"bufferView\": 0, \"componentType\": 5126, \"count\": " << VertCount << ", \"type\": \"VEC3\", "
         << "\"min\": [" << MinPos.X << ", " << MinPos.Y << ", " << MinPos.Z << "], "
         << "\"max\": [" << MaxPos.X << ", " << MaxPos.Y << ", " << MaxPos.Z << "] },\n"
         << "    { \"bufferView\": 1, \"componentType\": 5126, \"count\": " << VertCount << ", \"type\": \"VEC3\" },\n"
         << "    { \"bufferView\": 2, \"componentType\": 5126, \"count\": " << VertCount << ", \"type\": \"VEC2\" },\n"
         << "    { \"bufferView\": 3, \"componentType\": 5125, \"count\": " << Indices.size() << ", \"type\": \"SCALAR\" }\n"
         << "  ]\n"
         << "}\n";
    return Json.str();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  GLTF 2.0 BINARY (.GLB)
//------------------------------------------------------------------------------------------------------------------------

bool GeometryInterchange::ImportGlbBytes(
    std::span<const uint8_t>               GlbBytes,
    const std::filesystem::path&           RootDirectory,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    constexpr uint32_t GlbMagic     = 0x46546C67u; // "glTF"
    constexpr uint32_t JsonChunkTag = 0x4E4F534Au; // "JSON"
    constexpr uint32_t BinChunkTag  = 0x004E4942u; // "BIN\0"

    if (GlbBytes.size() < 20u || ReadUint32LE(GlbBytes.data()) != GlbMagic || ReadUint32LE(GlbBytes.data() + 4u) != 2u)
    {
        OutDiagnostic = "GLB container missing the glTF version 2 header.";
        return false;
    }
    const std::size_t DeclaredLength = std::min<std::size_t>(ReadUint32LE(GlbBytes.data() + 8u), GlbBytes.size());

    std::string_view         JsonChunk {};
    std::span<const uint8_t> BinChunk  {};
    std::size_t              Cursor = 12u;
    while (Cursor + 8u <= DeclaredLength)
    {
        const std::size_t ChunkLength = ReadUint32LE(GlbBytes.data() + Cursor);
        const uint32_t    ChunkTag    = ReadUint32LE(GlbBytes.data() + Cursor + 4u);
        const std::size_t BodyStart   = Cursor + 8u;
        if (ChunkLength > DeclaredLength - BodyStart)
        {
            OutDiagnostic = "GLB chunk length runs past the end of the container.";
            return false;
        }
        if (ChunkTag == JsonChunkTag && JsonChunk.empty())
        {
            JsonChunk = std::string_view(reinterpret_cast<const char*>(GlbBytes.data() + BodyStart), ChunkLength);
        }
        else if (ChunkTag == BinChunkTag && BinChunk.empty())
        {
            BinChunk = GlbBytes.subspan(BodyStart, ChunkLength);
        }
        Cursor = BodyStart + ((ChunkLength + 3u) & ~std::size_t{ 3u });
    }

    if (JsonChunk.empty())
    {
        OutDiagnostic = "GLB container has no JSON chunk.";
        return false;
    }
    return ImportGltf2Document(JsonChunk, RootDirectory, DefaultTitle, BinChunk, OutAsset, OutDiagnostic);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  STEREOLITHOGRAPHY (.STL)
//------------------------------------------------------------------------------------------------------------------------

namespace
{

[[nodiscard]] bool AppendTriangleSoupFace(
    GeometrySpace::ConstructedSampleAsset& Asset,
    const std::array<Mathematics::Axis3D, 3u>& Corners,
    uint16_t                               LayerOrdinal)
{
    std::array<uint32_t, 3u>            Loop {};
    std::array<Mathematics::UVAxes, 3u> LoopUV {};
    for (std::size_t C = 0u; C < 3u; ++C)
    {
        const Mathematics::Axis3D P = Corners[C];
        if (!std::isfinite(P.X) || !std::isfinite(P.Y) || !std::isfinite(P.Z) ||
            std::abs(P.X) > 20000.0f || std::abs(P.Y) > 20000.0f || std::abs(P.Z) > 20000.0f)
        {
            return false;
        }
        Loop[C] = Asset.Network.AppendVertex(Mathematics::ConvertVectorBetweenBases(
            P,
            Mathematics::WorldCoordinateBasis::RightHandedYUp,
            Mathematics::QueryActiveWorldBasis()));
        LoopUV[C] = { P.X * 0.5f + 0.5f, P.Z * 0.5f + 0.5f };
    }
    (void)Asset.Network.AppendFace(Loop, LoopUV, {}, LayerOrdinal, 0u);
    return true;
}

} // namespace

bool GeometryInterchange::ImportStlBytes(
    std::span<const uint8_t>               StlBytes,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    OutAsset = GeometrySpace::ConstructedSampleAsset{};
    OutAsset.Network.NetworkTitle = std::string(DefaultTitle);
    const uint16_t SoupLayer = OutAsset.Layers.ConstructLayer("Imported Primary", LayerSwatchTint(0u), 50.0f);

    // 📝 Binary STL = 80 B header + uint32 count + 50 B/triangle; the exact length decides even when the header says "solid"
    const bool BinaryLength =
        StlBytes.size() >= 84u &&
        StlBytes.size() == 84u + static_cast<std::size_t>(ReadUint32LE(StlBytes.data() + 80u)) * 50u;

    if (BinaryLength)
    {
        const uint32_t TriangleCount = ReadUint32LE(StlBytes.data() + 80u);
        for (uint32_t Tri = 0u; Tri < TriangleCount; ++Tri)
        {
            const uint8_t* Record = StlBytes.data() + 84u + static_cast<std::size_t>(Tri) * 50u + 12u; // Skip facet normal
            std::array<Mathematics::Axis3D, 3u> Corners {};
            for (std::size_t C = 0u; C < 3u; ++C)
            {
                Corners[C] = { ReadFloat32LE(Record + C * 12u), ReadFloat32LE(Record + C * 12u + 4u), ReadFloat32LE(Record + C * 12u + 8u) };
            }
            if (!AppendTriangleSoupFace(OutAsset, Corners, SoupLayer))
            {
                OutDiagnostic = "Binary STL triangle contains non-finite or out-of-range coordinates.";
                return false;
            }
        }
    }
    else
    {
        const std::string_view Text(reinterpret_cast<const char*>(StlBytes.data()), StlBytes.size());
        if (!TrimAscii(Text).starts_with("solid"))
        {
            OutDiagnostic = "STL stream is neither length-consistent binary nor ASCII 'solid'.";
            return false;
        }
        std::array<Mathematics::Axis3D, 3u> Corners {};
        std::size_t                         CornerCursor = 0u;
        std::size_t                         LineStart    = 0u;
        while (LineStart < Text.size())
        {
            std::size_t LineEnd = Text.find('\n', LineStart);
            if (LineEnd == std::string_view::npos)
            {
                LineEnd = Text.size();
            }
            const std::string_view Line = TrimAscii(Text.substr(LineStart, LineEnd - LineStart));
            LineStart = LineEnd + 1u;
            if (Line.starts_with("vertex"))
            {
                float X = 0.0f, Y = 0.0f, Z = 0.0f;
                if (std::sscanf(std::string(Line.substr(6u)).c_str(), "%f %f %f", &X, &Y, &Z) != 3)
                {
                    OutDiagnostic = "ASCII STL vertex line does not hold three numbers.";
                    return false;
                }
                if (CornerCursor < 3u)
                {
                    Corners[CornerCursor++] = { X, Y, Z };
                }
            }
            else if (Line.starts_with("endloop"))
            {
                if (CornerCursor == 3u && !AppendTriangleSoupFace(OutAsset, Corners, SoupLayer))
                {
                    OutDiagnostic = "ASCII STL triangle contains non-finite or out-of-range coordinates.";
                    return false;
                }
                CornerCursor = 0u;
            }
        }
    }

    if (OutAsset.Network.Faces.empty())
    {
        OutDiagnostic = "STL stream contains zero triangles.";
        return false;
    }
    OutAsset.Network.LinkOppositeEdges(true);
    OutAsset.Network.RecomputeNormals();
    FinalizeConstructedAssetUDIMs(OutAsset);
    return true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  STANFORD POLYGON (.PLY)
//------------------------------------------------------------------------------------------------------------------------

namespace
{

enum class PlyScalarCategory : uint8_t
{
    Unknown = 0u, Int8 = 1u, Uint8 = 2u, Int16 = 3u, Uint16 = 4u, Int32 = 5u, Uint32 = 6u, Float32 = 7u, Float64 = 8u,
};

enum class PlyStreamEncoding : uint8_t
{
    Ascii             = 0u,
    BinaryLittleEndian = 1u,
    BinaryBigEndian    = 2u,
};

struct PlyPropertyLayout
{
    std::string       Title          {};
    PlyScalarCategory Scalar         = PlyScalarCategory::Unknown;
    PlyScalarCategory ListCount      = PlyScalarCategory::Unknown; // Unknown = scalar property, otherwise a list
};

struct PlyBlockLayout
{
    std::string                    Title      {};
    std::size_t                    Count      = 0u;
    std::vector<PlyPropertyLayout> Properties {};
};

[[nodiscard]] PlyScalarCategory ParsePlyScalarCategory(std::string_view Token) noexcept
{
    if (Token == "char"   || Token == "int8")    return PlyScalarCategory::Int8;
    if (Token == "uchar"  || Token == "uint8")   return PlyScalarCategory::Uint8;
    if (Token == "short"  || Token == "int16")   return PlyScalarCategory::Int16;
    if (Token == "ushort" || Token == "uint16")  return PlyScalarCategory::Uint16;
    if (Token == "int"    || Token == "int32")   return PlyScalarCategory::Int32;
    if (Token == "uint"   || Token == "uint32")  return PlyScalarCategory::Uint32;
    if (Token == "float"  || Token == "float32") return PlyScalarCategory::Float32;
    if (Token == "double" || Token == "float64") return PlyScalarCategory::Float64;
    return PlyScalarCategory::Unknown;
}

[[nodiscard]] std::size_t QueryPlyScalarBytes(PlyScalarCategory Scalar) noexcept
{
    switch (Scalar)
    {
        case PlyScalarCategory::Int8:
        case PlyScalarCategory::Uint8:   return 1u;
        case PlyScalarCategory::Int16:
        case PlyScalarCategory::Uint16:  return 2u;
        case PlyScalarCategory::Int32:
        case PlyScalarCategory::Uint32:
        case PlyScalarCategory::Float32: return 4u;
        case PlyScalarCategory::Float64: return 8u;
        case PlyScalarCategory::Unknown: break;
    }
    return 0u;
}

// Sequential PLY body reader: whitespace tokens for ASCII, fixed-width scalars for either binary byte order.
class PlyBodyReader
{
public:
    PlyBodyReader(std::span<const uint8_t> Body, PlyStreamEncoding Encoding) noexcept : Bytes(Body), Encoding(Encoding) {}

    [[nodiscard]] bool ReadScalar(PlyScalarCategory Scalar, double& OutNumber) noexcept
    {
        if (Encoding == PlyStreamEncoding::Ascii)
        {
            while (Cursor < Bytes.size() && std::isspace(Bytes[Cursor]))
            {
                ++Cursor;
            }
            const std::size_t Start = Cursor;
            while (Cursor < Bytes.size() && !std::isspace(Bytes[Cursor]))
            {
                ++Cursor;
            }
            if (Start == Cursor)
            {
                return false;
            }
            const std::string Token(reinterpret_cast<const char*>(Bytes.data() + Start), Cursor - Start);
            char* Parsed = nullptr;
            OutNumber    = std::strtod(Token.c_str(), &Parsed);
            return Parsed != Token.c_str();
        }

        const std::size_t Width = QueryPlyScalarBytes(Scalar);
        if (Width == 0u || Cursor + Width > Bytes.size())
        {
            return false;
        }
        std::array<uint8_t, 8u> Raw {};
        for (std::size_t Idx = 0u; Idx < Width; ++Idx)
        {
            Raw[Idx] = Bytes[Cursor + ((Encoding == PlyStreamEncoding::BinaryBigEndian) ? (Width - 1u - Idx) : Idx)];
        }
        Cursor += Width;
        switch (Scalar)
        {
            case PlyScalarCategory::Int8:    { int8_t   V; std::memcpy(&V, Raw.data(), 1u); OutNumber = V; break; }
            case PlyScalarCategory::Uint8:   { uint8_t  V; std::memcpy(&V, Raw.data(), 1u); OutNumber = V; break; }
            case PlyScalarCategory::Int16:   { int16_t  V; std::memcpy(&V, Raw.data(), 2u); OutNumber = V; break; }
            case PlyScalarCategory::Uint16:  { uint16_t V; std::memcpy(&V, Raw.data(), 2u); OutNumber = V; break; }
            case PlyScalarCategory::Int32:   { int32_t  V; std::memcpy(&V, Raw.data(), 4u); OutNumber = V; break; }
            case PlyScalarCategory::Uint32:  { uint32_t V; std::memcpy(&V, Raw.data(), 4u); OutNumber = V; break; }
            case PlyScalarCategory::Float32: { float    V; std::memcpy(&V, Raw.data(), 4u); OutNumber = V; break; }
            case PlyScalarCategory::Float64: { double   V; std::memcpy(&V, Raw.data(), 8u); OutNumber = V; break; }
            case PlyScalarCategory::Unknown: return false;
        }
        return true;
    }

private:
    std::span<const uint8_t> Bytes;
    PlyStreamEncoding        Encoding = PlyStreamEncoding::Ascii;
    std::size_t              Cursor   = 0u;
};

} // namespace

bool GeometryInterchange::ImportPlyBytes(
    std::span<const uint8_t>               PlyBytes,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    OutAsset = GeometrySpace::ConstructedSampleAsset{};
    OutAsset.Network.NetworkTitle = std::string(DefaultTitle);

    const std::string_view Text(reinterpret_cast<const char*>(PlyBytes.data()), PlyBytes.size());
    const std::size_t      HeaderEnd = Text.find("end_header");
    if (!Text.starts_with("ply") || HeaderEnd == std::string_view::npos)
    {
        OutDiagnostic = "PLY stream missing the 'ply' magic or 'end_header'.";
        return false;
    }
    std::size_t BodyStart = Text.find('\n', HeaderEnd);
    BodyStart = (BodyStart == std::string_view::npos) ? Text.size() : BodyStart + 1u;

    PlyStreamEncoding             Encoding = PlyStreamEncoding::Ascii;
    std::vector<PlyBlockLayout> Layouts  {};
    std::istringstream            Header(std::string(Text.substr(0u, HeaderEnd)));
    std::string                   HeaderLine;
    while (std::getline(Header, HeaderLine))
    {
        std::istringstream Tokens(HeaderLine);
        std::string        Keyword;
        Tokens >> Keyword;
        if (Keyword == "format")
        {
            std::string EncodingTitle;
            Tokens >> EncodingTitle;
            Encoding = (EncodingTitle == "binary_little_endian") ? PlyStreamEncoding::BinaryLittleEndian
                     : (EncodingTitle == "binary_big_endian")    ? PlyStreamEncoding::BinaryBigEndian
                                                                 : PlyStreamEncoding::Ascii;
        }
        else if (Keyword == "element")
        {
            PlyBlockLayout Layout {};
            Tokens >> Layout.Title >> Layout.Count;
            Layouts.push_back(std::move(Layout));
        }
        else if (Keyword == "property" && !Layouts.empty())
        {
            std::string       First;
            PlyPropertyLayout Property {};
            Tokens >> First;
            if (First == "list")
            {
                std::string CountToken, ScalarToken;
                Tokens >> CountToken >> ScalarToken >> Property.Title;
                Property.ListCount = ParsePlyScalarCategory(CountToken);
                Property.Scalar    = ParsePlyScalarCategory(ScalarToken);
            }
            else
            {
                Property.Scalar = ParsePlyScalarCategory(First);
                Tokens >> Property.Title;
            }
            if (Property.Scalar == PlyScalarCategory::Unknown)
            {
                OutDiagnostic = "PLY property '" + Property.Title + "' uses an unknown scalar type.";
                return false;
            }
            Layouts.back().Properties.push_back(std::move(Property));
        }
    }

    const uint16_t   PlyLayer = OutAsset.Layers.ConstructLayer("Imported Primary", LayerSwatchTint(0u), 50.0f);
    PlyBodyReader    Reader(PlyBytes.subspan(BodyStart), Encoding);
    std::vector<Mathematics::Axis3D> AuthoredPositions {};

    for (const PlyBlockLayout& Layout : Layouts)
    {
        const bool VertexElement = (Layout.Title == "vertex");
        const bool FaceElement   = (Layout.Title == "face");
        for (std::size_t Instance = 0u; Instance < Layout.Count; ++Instance)
        {
            std::array<double, 3u> Xyz {};
            std::vector<uint32_t>  Loop {};
            for (const PlyPropertyLayout& Property : Layout.Properties)
            {
                if (Property.ListCount == PlyScalarCategory::Unknown)
                {
                    double Number = 0.0;
                    if (!Reader.ReadScalar(Property.Scalar, Number))
                    {
                        OutDiagnostic = "PLY body ends inside element '" + Layout.Title + "'.";
                        return false;
                    }
                    if (VertexElement && (Property.Title == "x" || Property.Title == "y" || Property.Title == "z"))
                    {
                        Xyz[static_cast<std::size_t>(Property.Title[0] - 'x')] = Number;
                    }
                    continue;
                }
                double CountNumber = 0.0;
                if (!Reader.ReadScalar(Property.ListCount, CountNumber) || CountNumber < 0.0 || CountNumber > 4096.0)
                {
                    OutDiagnostic = "PLY list count is missing or out of range.";
                    return false;
                }
                const bool IndexList = FaceElement && (Property.Title == "vertex_indices" || Property.Title == "vertex_index");
                for (uint32_t Entry = 0u; Entry < static_cast<uint32_t>(CountNumber); ++Entry)
                {
                    double Number = 0.0;
                    if (!Reader.ReadScalar(Property.Scalar, Number))
                    {
                        OutDiagnostic = "PLY body ends inside a list property.";
                        return false;
                    }
                    if (IndexList)
                    {
                        Loop.push_back(static_cast<uint32_t>(Number));
                    }
                }
            }

            if (VertexElement)
            {
                const Mathematics::Axis3D P { static_cast<float>(Xyz[0]), static_cast<float>(Xyz[1]), static_cast<float>(Xyz[2]) };
                if (!std::isfinite(P.X) || !std::isfinite(P.Y) || !std::isfinite(P.Z) ||
                    std::abs(P.X) > 20000.0f || std::abs(P.Y) > 20000.0f || std::abs(P.Z) > 20000.0f)
                {
                    OutDiagnostic = "PLY vertex contains non-finite or out-of-range coordinates.";
                    return false;
                }
                AuthoredPositions.push_back(P);
                (void)OutAsset.Network.AppendVertex(Mathematics::ConvertVectorBetweenBases(
                    P,
                    Mathematics::WorldCoordinateBasis::RightHandedYUp,
                    Mathematics::QueryActiveWorldBasis()));
            }
            else if (FaceElement && Loop.size() >= 3u)
            {
                const bool InRange = std::all_of(Loop.begin(), Loop.end(), [&](uint32_t V) { return V < AuthoredPositions.size(); });
                const std::set<uint32_t> Unique(Loop.begin(), Loop.end());
                if (!InRange || Unique.size() != Loop.size())
                {
                    continue;
                }
                std::vector<Mathematics::UVAxes> LoopUV {};
                for (const uint32_t V : Loop)
                {
                    LoopUV.push_back({ AuthoredPositions[V].X * 0.5f + 0.5f, AuthoredPositions[V].Z * 0.5f + 0.5f });
                }
                (void)OutAsset.Network.AppendFace(Loop, LoopUV, {}, PlyLayer, 0u);
            }
        }
    }

    if (OutAsset.Network.Faces.empty())
    {
        OutDiagnostic = "PLY stream contains zero valid faces.";
        return false;
    }
    OutAsset.Network.LinkOppositeEdges(true);
    OutAsset.Network.RecomputeNormals();
    FinalizeConstructedAssetUDIMs(OutAsset);
    return true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  FRONTIER FCT1 (.FACE)
//------------------------------------------------------------------------------------------------------------------------

std::string_view GeometryInterchange::QueryFct1SlotTitle(uint32_t SlotCode) noexcept
{
    constexpr std::array<std::string_view, 10u> SlotTitles {{
        "BodyCoat", "Glass", "Plastic", "Tyre", "Hub", "Brake", "Trim", "Headlight", "Taillight", "Default",
    }};
    return (SlotCode >= 6u && SlotCode <= 15u) ? SlotTitles[SlotCode - 6u] : std::string_view("Slot");
}

DecodedFct1Stream GeometryInterchange::DecodeFct1Bytes(std::span<const uint8_t> Fct1Bytes) noexcept
{
    constexpr uint32_t Fct1HeaderBytes  = 48u;
    constexpr uint32_t CornerNormalsBit = 1u;

    DecodedFct1Stream Stream {};
    if (Fct1Bytes.size() < Fct1HeaderBytes ||
        Fct1Bytes[0] != 'F' || Fct1Bytes[1] != 'C' || Fct1Bytes[2] != 'T' || Fct1Bytes[3] != '1')
    {
        return Stream;
    }

    Stream.VertexCount        = ReadUint32LE(Fct1Bytes.data() + 4u);
    Stream.FaceCount          = ReadUint32LE(Fct1Bytes.data() + 8u);
    const uint32_t HeaderBits = ReadUint32LE(Fct1Bytes.data() + 12u);

    const std::size_t PosBytes      = static_cast<std::size_t>(Stream.VertexCount) * 12u;
    const std::size_t IdxBytes      = static_cast<std::size_t>(Stream.FaceCount) * 12u;
    const std::size_t SlotBytes     = static_cast<std::size_t>(Stream.FaceCount) * 4u;
    const bool        AuthoredNorms = (HeaderBits & CornerNormalsBit) != 0u;
    const std::size_t NormBytes     = AuthoredNorms ? (static_cast<std::size_t>(Stream.FaceCount) * 36u) : 0u;
    const std::size_t Expected      = static_cast<std::size_t>(Fct1HeaderBytes) + PosBytes + IdxBytes + SlotBytes + NormBytes;
    if (Fct1Bytes.size() != Expected)
    {
        return Stream;
    }

    std::size_t Cursor = Fct1HeaderBytes;
    Stream.Positions.resize(static_cast<std::size_t>(Stream.VertexCount) * 3u);
    std::memcpy(Stream.Positions.data(), Fct1Bytes.data() + Cursor, PosBytes);
    Cursor += PosBytes;

    Stream.Indices.resize(static_cast<std::size_t>(Stream.FaceCount) * 3u);
    std::memcpy(Stream.Indices.data(), Fct1Bytes.data() + Cursor, IdxBytes);
    Cursor += IdxBytes;

    Stream.SlotCodes.resize(Stream.FaceCount);
    std::memcpy(Stream.SlotCodes.data(), Fct1Bytes.data() + Cursor, SlotBytes);
    Cursor += SlotBytes;

    if (AuthoredNorms)
    {
        Stream.CornerNormals.resize(static_cast<std::size_t>(Stream.FaceCount) * 9u);
        std::memcpy(Stream.CornerNormals.data(), Fct1Bytes.data() + Cursor, NormBytes);
    }

    Stream.Valid = true;
    return Stream;
}

bool GeometryInterchange::ImportFct1Bytes(
    std::span<const uint8_t>               Fct1Bytes,
    std::string_view                       DefaultTitle,
    GeometrySpace::ConstructedSampleAsset& OutAsset,
    std::string&                           OutDiagnostic)
{
    OutAsset = GeometrySpace::ConstructedSampleAsset{};
    OutAsset.Network.NetworkTitle = std::string(DefaultTitle);

    const DecodedFct1Stream Stream = DecodeFct1Bytes(Fct1Bytes);
    if (!Stream.Valid)
    {
        OutDiagnostic = "FCT1 stream has a bad magic or its byte length disagrees with the header counts.";
        return false;
    }

    const auto ActiveBasis = Mathematics::QueryActiveWorldBasis();
    for (uint32_t V = 0u; V < Stream.VertexCount; ++V)
    {
        const Mathematics::Axis3D P { Stream.Positions[V * 3u + 0u], Stream.Positions[V * 3u + 1u], Stream.Positions[V * 3u + 2u] };
        if (!std::isfinite(P.X) || !std::isfinite(P.Y) || !std::isfinite(P.Z))
        {
            OutDiagnostic = "FCT1 stream contains non-finite positions.";
            return false;
        }
        (void)OutAsset.Network.AppendVertex(Mathematics::ConvertVectorBetweenBases(
            P,
            QueryAuthoredBasis(ExternalGeometryFormat::Fct1Face),
            ActiveBasis));
    }

    // Slot code -> PartGroupOrdinal (lossless); the first four distinct slots also become named priority layers.
    std::unordered_map<uint32_t, uint16_t> SlotToLayer {};
    uint32_t                               NextColorIdx = 0u;
    for (uint32_t F = 0u; F < Stream.FaceCount; ++F)
    {
        const std::array<uint32_t, 3u> Loop {{ Stream.Indices[F * 3u + 0u], Stream.Indices[F * 3u + 1u], Stream.Indices[F * 3u + 2u] }};
        if (Loop[0] >= Stream.VertexCount || Loop[1] >= Stream.VertexCount || Loop[2] >= Stream.VertexCount ||
            Loop[0] == Loop[1] || Loop[1] == Loop[2] || Loop[2] == Loop[0])
        {
            continue;
        }
        const uint32_t SlotCode = Stream.SlotCodes[F];
        auto           Found    = SlotToLayer.find(SlotCode);
        if (Found == SlotToLayer.end())
        {
            const uint16_t LayerOrdinal = (SlotToLayer.size() < 4u)
                ? OutAsset.Layers.ConstructLayer(std::string(QueryFct1SlotTitle(SlotCode)), LayerSwatchTint(NextColorIdx++), 20.0f)
                : uint16_t{ 0u };
            Found = SlotToLayer.emplace(SlotCode, LayerOrdinal).first;
        }

        std::array<Mathematics::UVAxes, 3u> LoopUV {};
        for (std::size_t C = 0u; C < 3u; ++C)
        {
            LoopUV[C] = { Stream.Positions[Loop[C] * 3u + 0u] * 0.25f + 0.5f, Stream.Positions[Loop[C] * 3u + 1u] * 0.25f + 0.5f };
        }
        GeometrySpace::FaceShadingAssignment Shading {};
        Shading.MatCapSlot = static_cast<uint8_t>((Found->second * 2u + 3u) % 16u);
        (void)OutAsset.Network.AppendFace(Loop, LoopUV, Shading, Found->second, static_cast<uint16_t>(SlotCode));
    }

    if (OutAsset.Network.Faces.empty())
    {
        OutDiagnostic = "FCT1 stream yielded zero non-degenerate triangles.";
        return false;
    }
    OutAsset.Network.LinkOppositeEdges(true);
    OutAsset.Network.RecomputeNormals();
    FinalizeConstructedAssetUDIMs(OutAsset);
    return true;
}

} // namespace Frontier::Interchange
