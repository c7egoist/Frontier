/*==========================================================================================================================================
                                                      RESTIRGIPARITYVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Runs the C++/Vulkan/Slang illumination port against a reference capture of the original demo and reports parity.

#include "ReferenceCapture.h"

#include "Illumination/BoundingStructure.h"
#include "Illumination/IlluminationConstants.h"
#include "Illumination/OccupantDistanceSpace.h"
#include "Illumination/SceneDistanceSpace.h"
#include "Illumination/SurfaceCardDepot.h"
#include "Illumination/SceneStructure.h"
#include "Illumination/ShaderInterchange.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>

using namespace Frontier;
using namespace Frontier::Illumination;
using namespace Frontier::Parity;

namespace
{

int Failures = 0;

void ReportCheck(bool Passed, const std::string& Name, const std::string& Detail = "")
{
    std::printf("%s %s%s%s\n", Passed ? "[PASS]" : "[FAIL]", Name.c_str(), Detail.empty() ? "" : " — ", Detail.c_str());
    if (!Passed) ++Failures;
}

// 📝 Byte comparison of a host encoding against the demo's captured upload of the same label.
void CompareUpload(const ReferenceCapture& Capture, const std::string& Label, const std::vector<uint8_t>& Port, int32_t Refresh = -1)
{
    const auto Writes = Capture.QueryWrites(Refresh, Label);
    if (Writes.empty())
    {
        ReportCheck(false, "upload '" + Label + "'", "absent from the capture");
        return;
    }
    const std::vector<uint8_t>& Reference = Writes.front()->Bytes;
    size_t Differing = 0;
    const size_t Count = std::min(Reference.size(), Port.size());
    for (size_t Index = 0; Index < Count; ++Index)
    {
        if (Reference[Index] != Port[Index]) ++Differing;
    }
    char Detail[160];
    std::snprintf(Detail, sizeof(Detail), "%zu B port, %zu B demo, %zu differing bytes", Port.size(), Reference.size(), Differing);
    ReportCheck(Differing == 0 && Reference.size() == Port.size(), "upload '" + Label + "' byte-identical", Detail);
}

void CompareHalfTarget(const ReferenceCapture& Capture, DeviceExchange& Exchange, const std::shared_ptr<DeviceTexture>& Texture,
                       const std::string& Tag, const std::string& Label, double PsnrFloor)
{
    std::vector<uint8_t> Reference;
    if (!Capture.ReadTarget(Tag, Label, Reference))
    {
        ReportCheck(false, Tag + " '" + Label + "'", "reference dump missing");
        return;
    }
    std::vector<uint8_t> Port;
    const auto& Specification = Texture->Specification;
    const bool  Volume        = Specification.Dimension == TextureDimension::Volumetric;
    const uint32_t Layers     = Volume ? 1u : Specification.DepthOrLayers;
    for (uint32_t Layer = 0; Layer < Layers; ++Layer)
    {
        std::vector<uint8_t> Slice;
        Exchange.ReadTexture(Texture, Layer, 0, Slice);
        Port.insert(Port.end(), Slice.begin(), Slice.end());
    }
    TexelComparison Comparison;
    switch (Specification.Format)
    {
        case TextureFormat::Rgba16Float:
        case TextureFormat::Rg16Float:
        case TextureFormat::R16Float:     Comparison = CompareHalfTexels(Port, Reference); break;
        case TextureFormat::R32Float:
        case TextureFormat::Rgba32Float:
        case TextureFormat::Depth32Float: Comparison = CompareFloatTexels(Port, Reference); break;
        default:                          Comparison = CompareByteTexels(Port, Reference); break;
    }
    const bool Sized = Port.size() == Reference.size();
    ReportCheck(Sized && Comparison.PeakSignalNoise >= PsnrFloor && Comparison.NonFinite == 0, Tag + " '" + Label + "'",
                (Sized ? "" : "SIZE MISMATCH ") + DescribeComparison(Comparison));
}

// 📝 Replays the demo's writes of one label and refresh into a port region (pure device parity, host inputs identical).
void ReplayWrites(const ReferenceCapture& Capture, DeviceExchange& Exchange, int32_t Refresh, const std::string& Label,
                  const std::shared_ptr<DeviceRegion>& Region)
{
    for (const CapturedWrite* Write : Capture.QueryWrites(Refresh, Label))
    {
        if (Write->Category <= 1) Exchange.WriteRegion(Region, Write->Offset, Write->Bytes.data(), Write->Bytes.size());
    }
}

std::shared_ptr<DeviceRegion> RegionFromCapture(const ReferenceCapture& Capture, DeviceExchange& Exchange, const std::string& Label)
{
    const CapturedWrite* Write = Capture.QueryFirstWrite(Label);
    if (Write == nullptr) return Exchange.ConstructRegion(16, Label);
    return Exchange.ConstructRegionFrom(Write->Bytes.data(), Write->Bytes.size(), Label);
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    if (ArgumentCount < 4)
    {
        std::printf("usage: RestirGiParityValidation <SpirvFolder> <CaptureFolder> <OutFolder> [VoxelScale]\n");
        return 2;
    }
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    const std::filesystem::path SpirvFolder   = Arguments[1];
    const std::filesystem::path CaptureFolder = Arguments[2];
    const std::filesystem::path OutFolder     = Arguments[3];
    const double                VoxelScale    = ArgumentCount > 4 ? std::atof(Arguments[4]) : 2.2;
    std::filesystem::create_directories(OutFolder);

    std::string      Diagnostic;
    ReferenceCapture Capture;
    if (!Capture.Load(CaptureFolder, &Diagnostic))
    {
        std::printf("capture: %s\n", Diagnostic.c_str());
        return 2;
    }
    std::printf("capture: %zu host → device writes\n", Capture.Writes.size());

    DeviceExchange Exchange;
    if (!Exchange.Initialize("", &Diagnostic))
    {
        std::printf("device: %s\n", Diagnostic.c_str());
        return 2;
    }
    std::printf("device: %s\n", Exchange.AdapterDescription().c_str());
    ShaderInterchange Shaders(Exchange, SpirvFolder);

    // ① scene topology and its vertex encoding
    SceneStructure Scene;
    ReportCheck(Scene.LoadFacetSpace(CaptureFolder / "Scene.facetspace", &Diagnostic), "Scene.facetspace decoded", Diagnostic);
    std::printf("scene: %zu facet sets, %zu occupants, distance span %u\n", Scene.FacetSets.size(), Scene.Occupants.size(), Scene.DistanceCount);
    CompareUpload(Capture, "Facet vertices", Scene.EncodeVertexStream());

    // ② occupant distance volumes: bounding structures (host) and the transferred volume space (device)
    OccupantDistanceSpace Volumes(Exchange, Shaders);
    ReportCheck(Volumes.ConstructVolumes(Scene, VoxelScale, &Diagnostic), "occupant distance volumes transferred", Diagnostic);
    std::printf("volume space: %u × %u × %u texels, %zu volumes\n", Volumes.SpaceExtent[0], Volumes.SpaceExtent[1], Volumes.SpaceExtent[2],
                Volumes.Volumes.size());
    for (const OccupantVolume& Volume : Volumes.Volumes)
    {
        const FacetSet&    Set = Scene.FacetSets[Volume.FacetSet];
        std::vector<float> Corners(Set.Facets.size() * 9);
        for (size_t Index = 0; Index < Set.Facets.size(); ++Index)
            for (int Corner = 0; Corner < 3; ++Corner)
                for (int Axis = 0; Axis < 3; ++Axis)
                    Corners[Index * 9 + Corner * 3 + Axis] = static_cast<float>(Set.Facets[Index].Corners[Corner][Axis]);
        const BoundingStructureArchive Structure = ConstructBoundingStructure(Corners);
        CompareUpload(Capture, Set.Name + " nodes", Structure.EntryBytes);
        std::vector<uint8_t> FacetBytes(Structure.FacetCorners.size() * 4);
        std::memcpy(FacetBytes.data(), Structure.FacetCorners.data(), FacetBytes.size());
        CompareUpload(Capture, Set.Name + " facets", FacetBytes);
    }
    CompareHalfTarget(Capture, Exchange, Volumes.Texture, "BringUp", "Occupant distance space", 60.0);

    // ③ surface cards: allocation, card profiles and the occupant profiles that reference volumes and cards
    const QualityGrade Grade = ResolveQualityGrade("low");
    SurfaceCardDepot   Cards(Exchange, Shaders, {Grade.CardExtent, Grade.CardDensity});
    Cards.AllocateCards(Scene);
    std::printf("cards: %zu cards, %llu tiles, density scale %.3f, ground first card %u, strip card %u\n", Cards.Cards.size(),
                static_cast<unsigned long long>(Cards.TileTotal), Cards.DensityScaleUsed, Cards.GroundFirstCard, Cards.GroundStripCard);
    CompareUpload(Capture, "Card records", Cards.EncodeCardProfiles());
    const std::vector<uint8_t> Profiles = Scene.EncodeOccupantProfiles(&Volumes.Volumes, static_cast<uint32_t>(Scene.Occupants.size()));
    CompareUpload(Capture, "Occupant records", Profiles);

    // ④ shared regions; materials come from the capture until MaterialSpecification is ported
    const std::vector<uint8_t> VertexStream = Scene.EncodeVertexStream();
    auto VertexRegion    = Exchange.ConstructRegionFrom(VertexStream.data(), VertexStream.size(), "Facet vertices");
    auto MaterialRegion  = RegionFromCapture(Capture, Exchange, "Materials");
    auto RefreshRegion   = Exchange.ConstructRegion(1072, "Refresh constants");
    auto LuminaireRegion = Exchange.ConstructRegion(12320, "Clustered luminaire profiles");
    auto OccupantRegion  = Exchange.ConstructRegion(static_cast<VkDeviceSize>(Scene.Occupants.size()) * OccupantStride, "Occupant profiles");
    Exchange.WriteRegion(OccupantRegion, 0, Profiles.data(), Profiles.size());
    Shaders.ConfigureConstants(ConstructSpecializationValues({Grade.Steps, Cards.GroundFirstCard, Cards.GroundStripCard,
                                                              static_cast<uint32_t>(Scene.GroundOccupant)}));

    // ⑤ the scene distance field and the card capture
    SceneDistanceSpace Distance(Exchange, Shaders, {4, Grade.ClipResolution, Grade.FinestVoxel, 6.0, 0.2});
    Distance.ConstructResources(Volumes.TextureView, OccupantRegion);
    Scene.ConstructDistanceList();
    Distance.UploadDistanceList(Scene.DistanceList);
    CompareUpload(Capture, "Distance list", std::vector<uint8_t>(reinterpret_cast<const uint8_t*>(Scene.DistanceList.data()),
                                                                 reinterpret_cast<const uint8_t*>(Scene.DistanceList.data()) + Scene.DistanceList.size() * 4));
    Cards.ConstructResources(RefreshRegion, OccupantRegion, MaterialRegion, Distance.MarchLayout, LuminaireRegion);
    Cards.CaptureCards(Scene, VertexRegion);
    CompareHalfTarget(Capture, Exchange, Cards.AlbedoTexture, "BringUp", "Card albedo", 40.0);
    CompareHalfTarget(Capture, Exchange, Cards.NormalTexture, "BringUp", "Card normal", 40.0);
    CompareHalfTarget(Capture, Exchange, Cards.IncandescenceTexture, "BringUp", "Card emission", 40.0);
    CompareHalfTarget(Capture, Exchange, Cards.DepthTexture, "BringUp", "Card depth", 40.0);

    // ⑥ refresh 0 union, device-only: the demo's occupant/list/brick/constant writes replayed into the port's regions
    ReplayWrites(Capture, Exchange, 0, "Occupant records", OccupantRegion);
    ReplayWrites(Capture, Exchange, 0, "Distance list", Distance.ListRegion);
    ReplayWrites(Capture, Exchange, 0, "Invalidated bricks", Distance.BrickRegion);
    ReplayWrites(Capture, Exchange, 0, "Distance record", Distance.UniformRegion);
    {
        const auto Constant = Capture.QueryWrites(0, "Distance record");
        uint32_t BrickCount = 0;
        if (!Constant.empty()) std::memcpy(&BrickCount, Constant.back()->Bytes.data() + 36 * 4, 4);
        CommandSequence Sequence = Exchange.BeginSequence();
        Sequence.BindProgram(Distance.UnionProgram);
        Sequence.BindGroup(0, Distance.UnionGroup);
        Sequence.Dispatch(std::min(BrickCount, 65535u), (BrickCount + 65534u) / 65535u);
        Exchange.Submit(Sequence);
        std::printf("refresh 0 union: %u bricks\n", BrickCount);
        for (uint32_t Level = 0; Level < 4; ++Level)
        {
            CompareHalfTarget(Capture, Exchange, Distance.Textures[Level], "F0", "Scene distance cascade " + std::to_string(Level), 60.0);
        }
    }

    std::printf("\n=== parity: %d failing checks\n", Failures);
    return Failures == 0 ? 0 : 1;
}
