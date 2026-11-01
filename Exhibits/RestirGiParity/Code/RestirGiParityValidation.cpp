/*==========================================================================================================================================
                                                      RESTIRGIPARITYVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Runs the C++/Vulkan/Slang illumination port against a reference capture of the original demo and reports parity.

#include "ReferenceCapture.h"

#include "Illumination/BoundingStructure.h"
#include "Illumination/IlluminationConstants.h"
#include "Illumination/IlluminationHost.h"
#include "Illumination/OccupantDistanceSpace.h"
#include "Illumination/RayTracingSpace.h"
#include "Illumination/SceneDistanceSpace.h"
#include "Illumination/SurfaceCardDepot.h"
#include "Illumination/SceneStructure.h"
#include "Illumination/ShaderInterchange.h"

#include <algorithm>
#include <cstdio>
#include <map>
#include <set>
#include <tuple>

#include "stb_image_write.h"
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
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    if (ArgumentCount < 4)
    {
        std::printf("usage: RestirGiParityValidation <SpirvFolder> <CaptureFolder> <OutFolder> [Quality] [Refreshes] [Width] [Height]\n");
        return 2;
    }
    const std::filesystem::path SpirvFolder   = Arguments[1];
    const std::filesystem::path CaptureFolder = Arguments[2];
    const std::filesystem::path OutFolder     = Arguments[3];
    const std::string           Quality       = ArgumentCount > 4 ? Arguments[4] : "low";
    const uint32_t              Refreshes     = ArgumentCount > 5 ? static_cast<uint32_t>(std::atoi(Arguments[5])) : 12u;
    const uint32_t              Width         = ArgumentCount > 6 ? static_cast<uint32_t>(std::atoi(Arguments[6])) : 288u;
    const uint32_t              Height        = ArgumentCount > 7 ? static_cast<uint32_t>(std::atoi(Arguments[7])) : 162u;
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

    // ① assets the demo loads from files (materials, moon atlas, star catalogue) come from the captured uploads
    IlluminationAssets Assets;
    Assets.FacetSpace = CaptureFolder / "Scene.facetspace";
    for (const CapturedWrite& Write : Capture.Writes)
    {
        if (Write.Refresh != -1) continue;
        if (Write.Label == "Materials" && Write.Category == 1) Assets.MaterialProfiles = Write.Bytes;
        if (Write.Label == "Materials" && Write.Category == 0) Assets.MaterialRewrites.push_back({static_cast<uint32_t>(Write.Offset), Write.Bytes});
        if (Write.Label == "Native six-body lunar atlas · 2K sRGB" && Write.Category == 2) Assets.MoonAtlas = Write.Bytes;
        if (Write.Label == "Native star catalogue cells + records" && Write.Category == 2)
        {
            Assets.StarCatalogue     = Write.Bytes;
            Assets.StarCatalogueRows = static_cast<uint32_t>(Write.Bytes.size() / (1024 * 16));
        }
    }
    IlluminationSettings Settings;
    Settings.Quality = Quality;

    // 🔍 every host write is observed and compared with the demo's write of the same refresh and label
    std::map<std::string, std::string> LabelMap = {
        {"Ray tracing entries (TLAS + BLAS)", "RayTracing BVH nodes (TLAS + BLAS)"}, {"Ray tracing BLAS triangles", "RayTracing BLAS triangles"},
        {"Card profiles", "Card records"}, {"Occupant profiles", "Occupant records"}, {"Atmosphere constants", "Atmosphere record"},
        {"Refresh constants", "Frame record"}, {"Distance constants", "Distance record"}, {"Clustered luminaire profiles", "Clustered light records"},
        {"Cascade profiles", "Cascade records"}};
    std::vector<std::tuple<std::string, uint64_t, std::vector<uint8_t>>> Observed;
    bool Observing = true;
    Exchange.WriteObserver = [&](const std::string& Label, VkDeviceSize Offset, const void* Bytes, VkDeviceSize Count) {
        if (!Observing) return;
        const auto Mapped = LabelMap.find(Label);
        Observed.emplace_back(Mapped == LabelMap.end() ? Label : Mapped->second, Offset,
                              std::vector<uint8_t>(static_cast<const uint8_t*>(Bytes), static_cast<const uint8_t*>(Bytes) + Count));
    };
    auto CompareObserved = [&](int32_t Refresh, const std::set<std::string>& Labels) {
        for (const std::string& Label : Labels)
        {
            const auto Reference = Capture.QueryWrites(Refresh, Label);
            std::vector<const std::tuple<std::string, uint64_t, std::vector<uint8_t>>*> Port;
            for (const auto& Entry : Observed) if (std::get<0>(Entry) == Label) Port.push_back(&Entry);
            // 📝 Creation uploads (category 1) of the demo correspond to the port's first write of a fresh region.
            std::vector<const CapturedWrite*> Demo;
            for (const CapturedWrite* Write : Reference) Demo.push_back(Write);
            if (Refresh == -1)
            {
                for (const CapturedWrite& Write : Capture.Writes)
                    if (Write.Refresh == -1 && Write.Label == Label && Write.Category == 1) { Demo.insert(Demo.begin(), &Write); break; }
            }
            // 📝 Fresh regions are zero-filled by the port first (WebGPU zero initialisation): all-zero writes are not inputs.
            auto Meaningful = [](const std::vector<uint8_t>& Bytes) { return std::any_of(Bytes.begin(), Bytes.end(), [](uint8_t B) { return B != 0; }); };
            std::vector<const std::tuple<std::string, uint64_t, std::vector<uint8_t>>*> PortInputs;
            for (const auto* Entry : Port) if (Meaningful(std::get<2>(*Entry))) PortInputs.push_back(Entry);
            std::vector<const CapturedWrite*> DemoInputs;
            for (const CapturedWrite* Write : Demo) if (Meaningful(Write->Bytes)) DemoInputs.push_back(Write);
            bool Same = !DemoInputs.empty() && DemoInputs.size() == PortInputs.size();
            size_t Differing = 0, Bytes = 0;
            for (size_t Index = 0; Same && Index < DemoInputs.size(); ++Index)
            {
                const auto& PortBytes = std::get<2>(*PortInputs[Index]);
                const auto& DemoBytes = DemoInputs[Index]->Bytes;
                Bytes += DemoBytes.size();
                if (PortBytes.size() != DemoBytes.size() || std::get<1>(*PortInputs[Index]) != DemoInputs[Index]->Offset) { Same = false; break; }
                for (size_t Byte = 0; Byte < DemoBytes.size(); ++Byte) if (PortBytes[Byte] != DemoBytes[Byte]) ++Differing;
            }
            Same = Same && Differing == 0;
            char Detail[160];
            std::snprintf(Detail, sizeof(Detail), "%zu demo / %zu port writes, %zu B, %zu differing bytes", DemoInputs.size(), PortInputs.size(), Bytes, Differing);
            ReportCheck(Same, "refresh " + std::to_string(Refresh) + " host write '" + Label + "'", Detail);
        }
    };

    IlluminationHost Host(Exchange, SpirvFolder);
    if (!Host.Construct(Assets, Settings, {Width, Height}, &Diagnostic))
    {
        std::printf("bring-up: %s\n", Diagnostic.c_str());
        return 2;
    }
    std::printf("bring-up: %zu occupants, %zu cards, %u TLAS entries, trace %u × %u\n", Host.Scene.Occupants.size(), Host.Cards->Cards.size(),
                Host.RayTracing->UsedTlasEntries, Host.TraceExtent[0], Host.TraceExtent[1]);
    CompareObserved(-1, {"Facet vertices", "RayTracing BLAS triangles", "Card records", "Distance list", "Brick stamps"});
    {
        // 📝 Bring-up occupant profiles and TLAS: the demo's queue writes after the creation uploads.
        const auto DemoOccupants = Capture.QueryWrites(-1, "Occupant records");
        const auto DemoTlas      = Capture.QueryWrites(-1, "RayTracing BVH nodes (TLAS + BLAS)");
        std::vector<uint8_t> PortOccupants, PortTlas;
        for (const auto& Entry : Observed)
        {
            if (std::get<0>(Entry) == "Occupant records" && std::get<2>(Entry).size() > 16 && std::any_of(std::get<2>(Entry).begin(), std::get<2>(Entry).end(), [](uint8_t B) { return B != 0; }))
                PortOccupants = std::get<2>(Entry);
            if (std::get<0>(Entry) == "RayTracing BVH nodes (TLAS + BLAS)" && std::get<1>(Entry) == 0 && std::get<2>(Entry).size() < 100000) PortTlas = std::get<2>(Entry);
        }
        ReportCheck(!DemoOccupants.empty() && DemoOccupants.back()->Bytes == PortOccupants, "bring-up occupant profiles byte-identical",
                    std::to_string(PortOccupants.size()) + " B");
        ReportCheck(!DemoTlas.empty() && DemoTlas.back()->Bytes == PortTlas, "bring-up TLAS byte-identical", std::to_string(PortTlas.size()) + " B");
    }
    CompareHalfTarget(Capture, Exchange, Host.Volumes->Texture, "BringUp", "Occupant distance space", 60.0);
    CompareHalfTarget(Capture, Exchange, Host.Cards->AlbedoTexture, "BringUp", "Card albedo", 40.0);
    CompareHalfTarget(Capture, Exchange, Host.Cards->NormalTexture, "BringUp", "Card normal", 40.0);
    CompareHalfTarget(Capture, Exchange, Host.Cards->IncandescenceTexture, "BringUp", "Card emission", 40.0);
    CompareHalfTarget(Capture, Exchange, Host.Cards->DepthTexture, "BringUp", "Card depth", 40.0);

    // ② refreshes: scene motion and the camera-/physics-/effect-driven buffers replayed from the capture
    for (uint32_t Refresh = 0; Refresh < Refreshes; ++Refresh)
    {
        Observed.clear();
        const int32_t Index = static_cast<int32_t>(Refresh);
        auto Prepare = [&](uint32_t) {
            for (const CapturedWrite* Write : Capture.QueryWrites(Index, "Occupant records"))
            {
                const uint32_t First = static_cast<uint32_t>(Write->Offset / OccupantStride);
                const uint32_t Count = static_cast<uint32_t>(Write->Bytes.size() / OccupantStride);
                for (uint32_t Local = 0; Local < Count; ++Local)
                {
                    float Scalars[84];
                    std::memcpy(Scalars, Write->Bytes.data() + static_cast<size_t>(Local) * OccupantStride, sizeof(Scalars));
                    OccupantEntry& Occupant = Host.Scene.Occupants[First + Local];
                    for (int Element = 0; Element < 16; ++Element)
                    {
                        Occupant.Current[Element]  = Scalars[Element];
                        Occupant.Previous[Element] = Scalars[32 + Element];
                    }
                }
            }
        };
        auto Supply = [&](uint32_t) {
            Observing = false;
            ReplayWrites(Capture, Exchange, Index, "Occupant records", Host.OccupantRegion);
            ReplayWrites(Capture, Exchange, Index, "Frame record", Host.RefreshRegion);
            ReplayWrites(Capture, Exchange, Index, "Clustered light records", Host.LuminaireRegion);
            ReplayWrites(Capture, Exchange, Index, "Vehicle record", Host.VehicleRegion);
            ReplayWrites(Capture, Exchange, Index, "Effect record", Host.EffectRegion);
            ReplayWrites(Capture, Exchange, Index, "Projected cloud shadows", Host.CloudShadowParams);
            ReplayWrites(Capture, Exchange, Index, "Cloud renderer v2", Host.CloudParams);
            ReplayWrites(Capture, Exchange, Index, "Cascade records", Host.Shadow->CascadeRegion);
            ReplayWrites(Capture, Exchange, Index, "Cascade receiver", Host.Shadow->ReceiverRegion);
            ReplayWrites(Capture, Exchange, Index, "Distance record", Host.Distance->UniformRegion);
            Host.Distance->RefreshBricks.clear();
            for (const CapturedWrite* Write : Capture.QueryWrites(Index, "Invalidated bricks"))
            {
                Host.Distance->RefreshBricks.resize(Write->Bytes.size() / 4);
                std::memcpy(Host.Distance->RefreshBricks.data(), Write->Bytes.data(), Write->Bytes.size());
                Exchange.WriteRegion(Host.Distance->BrickRegion, 0, Write->Bytes.data(), Write->Bytes.size());
            }
            Observing = true;
        };
        if (!Host.AdvanceRefresh(Prepare, Supply, &Diagnostic))
        {
            ReportCheck(false, "refresh " + std::to_string(Refresh), Diagnostic);
            break;
        }
        CompareObserved(Index, Refresh == 0 ? std::set<std::string>{"RayTracing BVH nodes (TLAS + BLAS)", "Card tiles", "Card work", "Atmosphere record",
                                                                    "Cluster triangle indices", "Cluster instance identities", "Geometry cluster bounds"}
                                            : std::set<std::string>{"RayTracing BVH nodes (TLAS + BLAS)", "Card tiles", "Card work"});
        const std::string Tag = "F" + std::to_string(Refresh);
        std::vector<uint8_t> Probe;
        if (!Capture.ReadTarget(Tag, "Sky view", Probe) && !Capture.ReadTarget(Tag, "Surface depth", Probe) && !Capture.ReadTarget(Tag, "Capture", Probe)) continue;
        std::printf("--- refresh %u targets\n", Refresh);
        CompareHalfTarget(Capture, Exchange, Host.Atmosphere->SkyTexture, Tag, "Sky view", 50.0);
        CompareHalfTarget(Capture, Exchange, Host.Atmosphere->TransmittanceTexture, Tag, "Atmosphere transmittance 256×64", 50.0);
        CompareHalfTarget(Capture, Exchange, Host.Atmosphere->MultipleTexture, Tag, "Atmosphere multiple scattering 32×32", 50.0);
        for (uint32_t Level = 0; Level < 4; ++Level)
            CompareHalfTarget(Capture, Exchange, Host.Distance->Textures[Level], Tag, "Scene distance cascade " + std::to_string(Level), 60.0);
        CompareHalfTarget(Capture, Exchange, Host.Shadow->DepthTexture, Tag, "Shadow cascades", 50.0);
        CompareHalfTarget(Capture, Exchange, Host.Cards->DirectTexture, Tag, "Card direct irradiance", 40.0);
        CompareHalfTarget(Capture, Exchange, Host.Cards->FinalTexture, Tag, "Card final radiance", 40.0);
        CompareHalfTarget(Capture, Exchange, Host.Surface->DepthTexture, Tag, "Surface depth", 50.0);
        CompareHalfTarget(Capture, Exchange, Host.Surface->AttributeTexture, Tag, "Surface attributes", 40.0);
        CompareHalfTarget(Capture, Exchange, Host.Surface->MotionTexture, Tag, "Surface motion", 40.0);
        CompareHalfTarget(Capture, Exchange, Host.Surface->DirectTexture, Tag, "Direct radiance", 35.0);
        CompareHalfTarget(Capture, Exchange, Host.Resampling->GuideTextures[0], Tag, "Resampling guide A", 35.0);
        CompareHalfTarget(Capture, Exchange, Host.Resampling->GuideTextures[1], Tag, "Resampling guide B", 35.0);
        CompareHalfTarget(Capture, Exchange, Host.Resampling->IrradianceTexture, Tag, "Resampled irradiance", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Resampling->ReflectionTexture, Tag, "Reflection radiance", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Diffuse->IntegratedTexture, Tag, "Diffuse integrated", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Diffuse->ScreenTexture, Tag, "Diffuse screen", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Glossy->IntegratedTexture, Tag, "Glossy integrated", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Glossy->ScreenTexture, Tag, "Glossy screen", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Display->RecombinedTexture, Tag, "Recombined radiance", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Display->ResolvedTextures[0], Tag, "Resolved radiance A", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.Display->ResolvedTextures[1], Tag, "Resolved radiance B", 25.0);
        CompareHalfTarget(Capture, Exchange, Host.CaptureTexture, Tag, "Capture", 25.0);
        for (uint32_t Slot = 0; Slot < 2; ++Slot)
        {
            std::vector<uint8_t> Reference, Port;
            if (Capture.ReadTarget(Tag, "Reservoirs " + std::to_string(Slot), Reference) && Exchange.ReadRegion(Host.Resampling->Reservoirs[Slot], 0, Reference.size(), Port))
            {
                size_t Identical = 0;
                for (size_t Index = 0; Index + 32 <= Reference.size(); Index += 32) Identical += std::memcmp(Reference.data() + Index, Port.data() + Index, 32) == 0;
                const double Fraction = 100.0 * static_cast<double>(Identical) / static_cast<double>(std::max<size_t>(1, Reference.size() / 32));
                ReportCheck(Fraction > 90.0, Tag + " 'Reservoirs " + std::to_string(Slot) + "'", std::to_string(Fraction) + " % of reservoirs bit-identical");
            }
        }
        // 📝 Demo | port | difference (×8) strip of the presented image, 8-bit sRGB as presented.
        std::vector<uint8_t> Present, Reference;
        Exchange.ReadTexture(Host.CaptureTexture, 0, 0, Present);
        if (Capture.ReadTarget(Tag, "Capture", Reference) && Reference.size() == Present.size())
        {
            std::vector<uint8_t> Strip(static_cast<size_t>(Width) * 3 * Height * 4, 255u);
            for (uint32_t Y = 0; Y < Height; ++Y)
            {
                for (uint32_t X = 0; X < Width; ++X)
                {
                    const size_t Source = (static_cast<size_t>(Y) * Width + X) * 4;
                    for (int Channel = 0; Channel < 3; ++Channel)
                    {
                        Strip[(static_cast<size_t>(Y) * Width * 3 + X) * 4 + Channel]             = Reference[Source + Channel];
                        Strip[(static_cast<size_t>(Y) * Width * 3 + Width + X) * 4 + Channel]     = Present[Source + Channel];
                        const int Difference = std::abs(static_cast<int>(Present[Source + Channel]) - static_cast<int>(Reference[Source + Channel])) * 8;
                        Strip[(static_cast<size_t>(Y) * Width * 3 + 2 * Width + X) * 4 + Channel] = static_cast<uint8_t>(std::min(255, Difference));
                    }
                }
            }
            const std::string StripPath = (OutFolder / ("Parity_" + Tag + ".png")).string();
            stbi_write_png(StripPath.c_str(), static_cast<int>(Width * 3), static_cast<int>(Height), 4, Strip.data(), static_cast<int>(Width * 3 * 4));
        }
        const std::string PresentPath = (OutFolder / ("Port_" + Tag + ".png")).string();
        stbi_write_png(PresentPath.c_str(), static_cast<int>(Width), static_cast<int>(Height), 4, Present.data(), static_cast<int>(Width * 4));
    }

    std::printf("\n=== parity: %d failing checks\n", Failures);
    return Failures == 0 ? 0 : 1;
}
