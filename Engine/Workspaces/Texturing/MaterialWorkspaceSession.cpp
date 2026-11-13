/*============================================================================================================================================
                                                       MATERIALWORKSPACESESSION.CPP
============================================================================================================================================*/
// 🧩 Implementation of MaterialWorkspaceSession: multilayer PBR strata, 29-channel schema & OpenPBR synchronization

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Texturing/MaterialWorkspaceSession.h"

#include <algorithm>
#include <cstdio>

namespace Frontier::Workspaces
{

namespace
{

const std::array<MaterialChannelDescriptor, static_cast<std::size_t>(MaterialChannelSlot::Count)> ChannelDirectory {{
    { MaterialChannelSlot::Colour,               "Colour",              "Diffuse / Base Albedo",     "albedo", { 158u, 162u, 170u, 255u }, true,  0.0f,    1.0f,   0.50f },
    { MaterialChannelSlot::Roughness,            "Roughness",           "Microfacet Gloss",          "rough",  { 158u, 162u, 170u, 255u }, false, 0.02f,   1.0f,   0.24f },
    { MaterialChannelSlot::Metallic,             "Metallic",            "Conductor Mask",            "metal",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.87f },
    { MaterialChannelSlot::Normal,               "Normal",              "Surface Tangent",           "height", { 158u, 162u, 170u, 255u }, false, 0.0f,    2.0f,   1.00f },
    { MaterialChannelSlot::MicroNormal,          "Micro normal",        "Fine Pore / Grain",         "height", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.25f },
    { MaterialChannelSlot::HeightRelief,         "Height / Relief",     "Displacement Relief",       "height", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.30f },
    { MaterialChannelSlot::AmbientOcclusion,     "Ambient Occlusion",   "Cavity Indirect AO",        "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::Opacity,              "Opacity",             "Cutout / Alpha Weight",     "albedo", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::BlendMask,            "Coverage",            "Layer Mask / Blend",        "albedo", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::DielectricIOR,        "IOR",                 "Fresnel Index",             "metal",  { 158u, 162u, 170u, 255u }, false, 1.0f,    2.8f,   1.50f },
    { MaterialChannelSlot::Specular,             "Specular",            "Dielectric Reflection",     "metal",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.50f },
    { MaterialChannelSlot::SpecularColour,       "Specular Colour",     "Edge Specular Tint",        "albedo", { 158u, 162u, 170u, 255u }, true,  0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::Clearcoat,            "Clearcoat",           "Candy / Lacquer Topcoat",   "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.85f },
    { MaterialChannelSlot::CoatRoughness,        "Coat Roughness",      "Clearcoat Polish",          "rough",  { 158u, 162u, 170u, 255u }, false, 0.01f,   1.0f,   0.08f },
    { MaterialChannelSlot::CoatIOR,              "Coat IOR",            "Topcoat Fresnel IOR",       "metal",  { 158u, 162u, 170u, 255u }, false, 1.0f,    2.5f,   1.50f },
    { MaterialChannelSlot::CoatNormal,           "Coat Normal",         "Orange-Peel / Coat Normal", "height", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.04f },
    { MaterialChannelSlot::Sheen,                "Sheen",               "Velvet / Frost Grazing",    "albedo", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.00f },
    { MaterialChannelSlot::SheenRoughness,       "Sheen Roughness",     "Grazing Falloff",           "rough",  { 158u, 162u, 170u, 255u }, false, 0.05f,   1.0f,   0.45f },
    { MaterialChannelSlot::SheenColour,          "Sheen Colour",        "Grazing Tint",              "albedo", { 158u, 162u, 170u, 255u }, true,  0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::Anisotropy,           "Anisotropy",          "Directional Brushing",      "metal",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.00f },
    { MaterialChannelSlot::AnisotropyAngle,      "Anisotropy Angle",    "Grain Direction Angle",     "metal",  { 158u, 162u, 170u, 255u }, false, -180.0f, 180.0f, 0.00f },
    { MaterialChannelSlot::Iridescence,          "Iridescence",         "Thin-Film Interference",    "albedo", { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.00f },
    { MaterialChannelSlot::IridescenceIOR,       "Iridescence IOR",     "Thin-Film Index",           "metal",  { 158u, 162u, 170u, 255u }, false, 1.0f,    3.0f,   1.30f },
    { MaterialChannelSlot::IridescenceThickness, "Iridescence NM",      "Film Thickness (nm)",       "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1200.0f, 420.0f },
    { MaterialChannelSlot::Transmission,         "Transmission",        "Subsurface / Gel Glass",    "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    1.0f,   0.00f },
    { MaterialChannelSlot::ThicknessSss,         "Thickness / SSS",     "Volume Depth",              "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    2.0f,   0.25f },
    { MaterialChannelSlot::AttenuationColour,    "Attenuation Colour",  "Syrup / Interior Tint",     "albedo", { 158u, 162u, 170u, 255u }, true,  0.0f,    1.0f,   1.00f },
    { MaterialChannelSlot::Emissive,             "Emissive",            "Self-Glow Colour",          "albedo", { 158u, 162u, 170u, 255u }, true,  0.0f,    1.0f,   0.00f },
    { MaterialChannelSlot::EmissiveStrength,     "Emissive Strength",   "HDR Glow Intensity",        "rough",  { 158u, 162u, 170u, 255u }, false, 0.0f,    8.0f,   0.00f },
}};

[[nodiscard]] MaterialChannelSlot ChannelFromIndex(std::size_t Idx) noexcept
{
    return static_cast<MaterialChannelSlot>(std::min<std::size_t>(Idx, ChannelDirectory.size() - 1u));
}

} // namespace

MaterialWorkspaceSession::MaterialWorkspaceSession()
{
    LoadRegistryPreset(0u);
}

const MaterialChannelDescriptor& MaterialWorkspaceSession::InspectChannelSpec(MaterialChannelSlot Slot) noexcept
{
    const std::size_t Idx = std::min<std::size_t>(static_cast<std::size_t>(Slot), ChannelDirectory.size() - 1u);
    return ChannelDirectory[Idx];
}

const std::vector<MaterialRegistryPreset>& MaterialWorkspaceSession::InspectPresetRegistry() noexcept
{
    static const std::vector<MaterialRegistryPreset> Presets {
        {
            "racing-green",
            "01 / PAINT COLLECTION",
            "Racing Green",
            "A classic, with another dimension.",
            "MULTILAYER METALLIC",
            { 52u, 95u, 66u, 255u },
            0.24f, 0.87f, 1.50f, 0.40f, 0.30f, 0.85f, 0.65f, 0.64f, 28.0f, 0.22f, false,
        },
        {
            "brushed-brass",
            "02 / FOUNDRY ALLOYS",
            "Brushed Brass",
            "Anisotropic warm copper-zinc machined metal.",
            "ANISOTROPIC CONDUCTOR",
            { 212u, 168u, 90u, 255u },
            0.28f, 0.96f, 1.52f, 0.28f, 0.14f, 0.12f, 0.80f, 0.08f, 18.0f, 0.10f, true,
        },
        {
            "clearcoat-carbon",
            "03 / COMPOSITE LAB",
            "Clearcoated Carbon",
            "Tight 2x2 diagonal twill beneath optical resin.",
            "TWILL LACQUER",
            { 28u, 31u, 36u, 255u },
            0.16f, 0.25f, 1.55f, 0.22f, 0.18f, 0.95f, 0.92f, 0.15f, 44.0f, 0.08f, false,
        },
        {
            "titanium-oxide",
            "04 / WAVE OPTICS",
            "Heat-Blued Titanium",
            "Thin-film Airy oxide shift over brushed alloy.",
            "THIN-FILM IRIDESCENT",
            { 88u, 118u, 178u, 255u },
            0.20f, 0.92f, 1.85f, 0.20f, 0.15f, 0.40f, 0.82f, 0.22f, 32.0f, 0.14f, false,
        },
        {
            "cobalt-pearlescent",
            "01 / PAINT COLLECTION",
            "Cobalt Metallic",
            "Deep metallic automotive coat with silver flake scatter.",
            "MULTILAYER METALLIC",
            { 43u, 87u, 154u, 255u },
            0.21f, 0.88f, 1.52f, 0.34f, 0.26f, 0.92f, 0.74f, 0.72f, 36.0f, 0.24f, false,
        },
        {
            "terracotta-clay",
            "05 / MINERAL & STONE",
            "Fired Terracotta",
            "Oren-Nayar mineral ceramic with subtle wheel rings.",
            "ROUGH CERAMIC",
            { 178u, 96u, 64u, 255u },
            0.76f, 0.02f, 1.48f, 0.76f, 0.55f, 0.05f, 0.20f, 0.0f, 12.0f, 0.0f, false,
        },
        {
            "alcantara-slate",
            "06 / WOVEN TEXTILES",
            "Slate Alcantara",
            "Microfiber grazing sheen with soft scatter lobe.",
            "TEXTILE SHEEN",
            { 68u, 73u, 82u, 255u },
            0.86f, 0.0f, 1.42f, 0.86f, 0.48f, 0.0f, 0.10f, 0.0f, 10.0f, 0.0f, false,
        },
        {
            "obsidian-lacquer",
            "01 / PAINT COLLECTION",
            "Obsidian Lacquer",
            "High-depth piano black resin with crisp softbox catchlights.",
            "CLEARCOAT RESIN",
            { 20u, 22u, 26u, 255u },
            0.12f, 0.10f, 1.56f, 0.14f, 0.22f, 0.98f, 0.94f, 0.08f, 22.0f, 0.06f, false,
        },
    };
    return Presets;
}

const std::array<const char*, 5u>& MaterialWorkspaceSession::InspectPreviewShapeLabels() noexcept
{
    static const std::array<const char*, 5u> Labels {{
        "Shader Ball",
        "Sphere",
        "Draped Cloth",
        "Chamfer Box",
        "Plane",
    }};
    return Labels;
}

const std::array<const char*, 5u>& MaterialWorkspaceSession::InspectBackdropLabels() noexcept
{
    static const std::array<const char*, 5u> Labels {{
        "Studio softbox",
        "Obsidian dark",
        "Warm gallery",
        "Neutral slate",
        "Daylight white",
    }};
    return Labels;
}

const std::array<const char*, 7u>& MaterialWorkspaceSession::InspectSourceModeLabels() noexcept
{
    static const std::array<const char*, 7u> Labels {{
        "Scalar / Constant",
        "Procedural Field",
        "Linear Gradient",
        "Radial Gradient",
        "Conic Gradient",
        "Custom Image Tile",
        "Active Pattern",
    }};
    return Labels;
}

const std::array<const char*, 6u>& MaterialWorkspaceSession::InspectFieldProcedureLabels() noexcept
{
    static const std::array<const char*, 6u> Labels {{
        "Perlin Noise",
        "Camo Smooth",
        "Checkerboard",
        "Voronoi Cells",
        "Concentric Rings",
        "Directional Stripes",
    }};
    return Labels;
}

const std::array<const char*, 6u>& MaterialWorkspaceSession::InspectPatternDirectoryLabels() noexcept
{
    static const std::array<const char*, 6u> Labels {{
        "Kente Weave",
        "Adire Indigo",
        "Ndebele Geometry",
        "Brushed Carbon",
        "Honeycomb Hex",
        "Herringbone Twill",
    }};
    return Labels;
}

void MaterialWorkspaceSession::InitializeDefaultChannelSources(MaterialStrataLayer& Layer)
{
    for (std::size_t Idx = 0u; Idx < Layer.ChannelSources.size(); ++Idx)
    {
        const MaterialChannelSlot Slot = ChannelFromIndex(Idx);
        const auto&               Spec = InspectChannelSpec(Slot);
        auto&                     Src  = Layer.ChannelSources[Idx];
        Src.Mode                       = ChannelSourceMode::ConstantScalar;
        Src.Procedure                  = FieldProcedureVariant::PerlinNoise;
        Src.StopPrimary                = PrimaryAlbedo;
        Src.StopSecondary              = ColorRgba{ 239u, 244u, 207u, 255u };
        Src.ScalarReading              = Spec.DefaultScalar;
        if (Slot == MaterialChannelSlot::Roughness)
        {
            Src.ScalarReading = Roughness;
        }
        else if (Slot == MaterialChannelSlot::Metallic)
        {
            Src.ScalarReading = Metalness;
        }
        else if (Slot == MaterialChannelSlot::DielectricIOR)
        {
            Src.ScalarReading = DielectricIOR;
        }
        else if (Slot == MaterialChannelSlot::Clearcoat)
        {
            Src.ScalarReading = ClearcoatWeight;
        }
        else if (Slot == MaterialChannelSlot::CoatRoughness)
        {
            Src.ScalarReading = ClearcoatRoughness;
        }
        else if (Slot == MaterialChannelSlot::CoatIOR)
        {
            Src.ScalarReading = ClearcoatIOR;
        }
    }
}

void MaterialWorkspaceSession::LoadRegistryPreset(uint32_t PresetIndex)
{
    const auto& Registry = InspectPresetRegistry();
    if (Registry.empty())
    {
        return;
    }
    ActivePresetIndex = PresetIndex % static_cast<uint32_t>(Registry.size());
    const auto& Preset = Registry[ActivePresetIndex];

    CollectionKicker  = Preset.CollectionKicker;
    MaterialTitle     = Preset.DisplayName;
    MaterialSubtitle  = Preset.Subtitle;
    MaterialCategory  = Preset.CategoryTitle;
    PrimaryAlbedo     = Preset.PrimaryAlbedo;
    Roughness         = Preset.Roughness;
    Metalness         = Preset.Metalness;
    DielectricIOR     = Preset.DielectricIOR;
    PaintRoughness    = Preset.PaintRoughness;
    PaintDepth        = Preset.PaintDepth;
    ClearcoatWeight   = Preset.ClearcoatWeight;
    ClearcoatGloss    = Preset.ClearcoatGloss;
    FlakeDensity      = Preset.FlakeDensity;
    FlakeFrequency    = Preset.FlakeFrequency;
    FlakeTilt         = Preset.FlakeTilt;
    MetalScratches    = Preset.MetalScratches;

    StrataLayers.clear();

    // 1. Clearcoat top stratum (4 ch)
    if (ClearcoatWeight > 0.02f)
    {
        MaterialStrataLayer Coat {};
        Coat.Identity = 1u;
        Coat.Name     = "Clearcoat";
        Coat.Model    = MaterialStrataModel::Clearcoat;
        Coat.Enabled  = true;
        Coat.Channels = {
            MaterialChannelSlot::BlendMask,
            MaterialChannelSlot::Roughness,
            MaterialChannelSlot::DielectricIOR,
            MaterialChannelSlot::Normal,
        };
        InitializeDefaultChannelSources(Coat);
        StrataLayers.push_back(std::move(Coat));
    }

    // 2. Metallic flakes stratum (5 ch)
    if (FlakeDensity > 0.02f)
    {
        MaterialStrataLayer Flakes {};
        Flakes.Identity = 2u;
        Flakes.Name     = "Metallic flakes";
        Flakes.Model    = MaterialStrataModel::Flakes;
        Flakes.Enabled  = true;
        Flakes.Channels = {
            MaterialChannelSlot::Colour,
            MaterialChannelSlot::Roughness,
            MaterialChannelSlot::Metallic,
            MaterialChannelSlot::Normal,
            MaterialChannelSlot::BlendMask,
        };
        InitializeDefaultChannelSources(Flakes);
        StrataLayers.push_back(std::move(Flakes));
    }

    // 3. Paint body substrate stratum (28 ch — every PBR channel except BlendMask/CoatWeight)
    MaterialStrataLayer Body {};
    Body.Identity = 3u;
    Body.Name     = "Paint body";
    Body.Model    = MaterialStrataModel::Surface;
    Body.Enabled  = true;
    for (std::size_t Idx = 0u; Idx < static_cast<std::size_t>(MaterialChannelSlot::Count); ++Idx)
    {
        const auto Slot = ChannelFromIndex(Idx);
        if (Slot != MaterialChannelSlot::BlendMask)
        {
            Body.Channels.push_back(Slot);
        }
    }
    InitializeDefaultChannelSources(Body);
    StrataLayers.push_back(std::move(Body));

    SelectedLayerId       = 3u;
    InspectedChannel      = MaterialChannelSlot::Colour;
    NextLayerIdentity     = 10u;
    LayerEditIdentitySync = 0u;
    SyncLayerNameEditBuffer();
    SyncPhysicalSurfaceParameters();
    ++RevisionCounter;
    StatusBannerText = "Loaded " + MaterialTitle;
}

void MaterialWorkspaceSession::ApplyExternalPatternDocument(std::string_view PatternName, std::string_view GroupTitle, float Repeats)
{
    PatternOverlay.Attached    = true;
    PatternOverlay.Name        = PatternName.empty() ? std::string("Tileable Pattern") : std::string(PatternName);
    PatternOverlay.SourceGroup = GroupTitle.empty() ? std::string("Pattern Studio") : std::string(GroupTitle);
    PatternOverlay.Repeats     = std::clamp(Repeats, 0.5f, 16.0f);
    SelectPatternLayer();
    ++RevisionCounter;
    StatusBannerText = "Tiled \"" + PatternOverlay.Name + "\" onto " + MaterialTitle;
}

void MaterialWorkspaceSession::ClearAttachedPattern()
{
    if (!PatternOverlay.Attached)
    {
        return;
    }
    PatternOverlay.Attached = false;
    if (SelectedLayerId == PatternLayerReservedId)
    {
        for (const auto& Layer : StrataLayers)
        {
            if (Layer.Model == MaterialStrataModel::Surface)
            {
                SelectedLayerId = Layer.Identity;
                break;
            }
        }
        if (SelectedLayerId == PatternLayerReservedId && !StrataLayers.empty())
        {
            SelectedLayerId = StrataLayers.back().Identity;
        }
    }
    SyncLayerNameEditBuffer();
    ++RevisionCounter;
    StatusBannerText = "Removed tileable pattern";
}

void MaterialWorkspaceSession::AddDetailStrataLayer()
{
    if (StrataLayers.size() >= 16u)
    {
        StatusBannerText = "Material stack supports up to 16 strata layers";
        return;
    }
    uint32_t DetailCount = 1u;
    for (const auto& Layer : StrataLayers)
    {
        if (Layer.Model == MaterialStrataModel::Detail)
        {
            ++DetailCount;
        }
    }

    MaterialStrataLayer Detail {};
    Detail.Identity = NextLayerIdentity++;
    Detail.Name     = "Detail Strata " + std::to_string(DetailCount);
    Detail.Model    = MaterialStrataModel::Detail;
    Detail.Enabled  = true;
    Detail.LayerWeight = 0.72f;
    Detail.Channels = {
        MaterialChannelSlot::Colour,
        MaterialChannelSlot::Roughness,
        MaterialChannelSlot::BlendMask,
    };
    InitializeDefaultChannelSources(Detail);
    auto& ColourSrc          = Detail.ChannelSources[static_cast<std::size_t>(MaterialChannelSlot::Colour)];
    ColourSrc.Mode           = ChannelSourceMode::ProceduralField;
    ColourSrc.Procedure      = FieldProcedureVariant::PerlinNoise;
    ColourSrc.StopPrimary    = { 31u, 36u, 41u, 255u };
    ColourSrc.StopSecondary  = { 214u, 184u, 124u, 255u };

    StrataLayers.insert(StrataLayers.begin(), std::move(Detail));
    SelectedLayerId  = StrataLayers.front().Identity;
    InspectedChannel = MaterialChannelSlot::Colour;
    SyncLayerNameEditBuffer();
    ++RevisionCounter;
    StatusBannerText = "Added detail strata layer";
}

void MaterialWorkspaceSession::ActivateOrAddClearcoatLayer()
{
    for (auto& Layer : StrataLayers)
    {
        if (Layer.Model == MaterialStrataModel::Clearcoat)
        {
            Layer.Enabled = true;
            if (std::find(Layer.Channels.begin(), Layer.Channels.end(), MaterialChannelSlot::BlendMask) == Layer.Channels.end())
            {
                Layer.Channels.insert(Layer.Channels.begin(), MaterialChannelSlot::BlendMask);
            }
            if (ClearcoatWeight < 0.05f)
            {
                ClearcoatWeight = 0.85f;
            }
            SelectedLayerId = Layer.Identity;
            SyncLayerNameEditBuffer();
            SyncPhysicalSurfaceParameters();
            ++RevisionCounter;
            StatusBannerText = "Activated Clearcoat layer";
            return;
        }
    }

    if (StrataLayers.size() >= 16u)
    {
        return;
    }
    MaterialStrataLayer Coat {};
    Coat.Identity = NextLayerIdentity++;
    Coat.Name     = "Clearcoat";
    Coat.Model    = MaterialStrataModel::Clearcoat;
    Coat.Enabled  = true;
    Coat.Channels = {
        MaterialChannelSlot::BlendMask,
        MaterialChannelSlot::Roughness,
        MaterialChannelSlot::DielectricIOR,
        MaterialChannelSlot::Normal,
    };
    InitializeDefaultChannelSources(Coat);
    if (ClearcoatWeight < 0.05f)
    {
        ClearcoatWeight = 0.85f;
    }
    StrataLayers.insert(StrataLayers.begin(), std::move(Coat));
    SelectedLayerId = StrataLayers.front().Identity;
    SyncLayerNameEditBuffer();
    SyncPhysicalSurfaceParameters();
    ++RevisionCounter;
    StatusBannerText = "Added Clearcoat strata layer";
}

void MaterialWorkspaceSession::RemoveStrataLayer(uint32_t LayerIdentity)
{
    const auto It = std::find_if(StrataLayers.begin(), StrataLayers.end(), [LayerIdentity](const MaterialStrataLayer& Layer)
    {
        return Layer.Identity == LayerIdentity;
    });
    if (It == StrataLayers.end() || !VerifyLayerRemovable(*It))
    {
        return;
    }
    StrataLayers.erase(It);
    if (SelectedLayerId == LayerIdentity)
    {
        SelectedLayerId = StrataLayers.empty() ? 0u : StrataLayers.back().Identity;
        SyncLayerNameEditBuffer();
    }
    SyncPhysicalSurfaceParameters();
    ++RevisionCounter;
    StatusBannerText = "Removed strata layer";
}

void MaterialWorkspaceSession::MoveStrataLayer(uint32_t LayerIdentity, int32_t DeltaDirection)
{
    const auto It = std::find_if(StrataLayers.begin(), StrataLayers.end(), [LayerIdentity](const MaterialStrataLayer& Layer)
    {
        return Layer.Identity == LayerIdentity;
    });
    if (It == StrataLayers.end() || DeltaDirection == 0)
    {
        return;
    }
    const std::ptrdiff_t CurrentIdx = std::distance(StrataLayers.begin(), It);
    const std::ptrdiff_t NextIdx    = CurrentIdx + (DeltaDirection > 0 ? -1 : 1);
    if (NextIdx < 0 || NextIdx >= static_cast<std::ptrdiff_t>(StrataLayers.size()))
    {
        return;
    }
    std::swap(StrataLayers[static_cast<std::size_t>(CurrentIdx)], StrataLayers[static_cast<std::size_t>(NextIdx)]);
    ++RevisionCounter;
}

void MaterialWorkspaceSession::ReorderStrataLayerToIndex(uint32_t LayerIdentity, std::size_t TargetIndex)
{
    const auto It = std::find_if(StrataLayers.begin(), StrataLayers.end(), [LayerIdentity](const MaterialStrataLayer& Layer)
    {
        return Layer.Identity == LayerIdentity;
    });
    if (It == StrataLayers.end() || StrataLayers.empty())
    {
        return;
    }
    const std::size_t ClampedTarget = std::min(TargetIndex, StrataLayers.size() - 1u);
    MaterialStrataLayer Moving = std::move(*It);
    StrataLayers.erase(It);
    StrataLayers.insert(StrataLayers.begin() + static_cast<std::ptrdiff_t>(ClampedTarget), std::move(Moving));
    ++RevisionCounter;
}

void MaterialWorkspaceSession::AddChannelToSelectedLayer(MaterialChannelSlot Channel)
{
    MaterialStrataLayer* Layer = AccessSelectedLayer();
    if (Layer == nullptr)
    {
        return;
    }
    if (std::find(Layer->Channels.begin(), Layer->Channels.end(), Channel) == Layer->Channels.end())
    {
        Layer->Channels.push_back(Channel);
    }
    InspectedChannel = Channel;
    ++RevisionCounter;
}

void MaterialWorkspaceSession::RemoveChannelFromSelectedLayer(MaterialChannelSlot Channel)
{
    MaterialStrataLayer* Layer = AccessSelectedLayer();
    if (Layer == nullptr || Layer->Channels.size() <= 1u)
    {
        return;
    }
    const auto It = std::find(Layer->Channels.begin(), Layer->Channels.end(), Channel);
    if (It != Layer->Channels.end())
    {
        Layer->Channels.erase(It);
        if (InspectedChannel == Channel)
        {
            InspectedChannel = Layer->Channels.front();
        }
        ++RevisionCounter;
    }
}

void MaterialWorkspaceSession::SelectStrataLayer(uint32_t LayerIdentity)
{
    SelectedLayerId = LayerIdentity;
    if (const MaterialStrataLayer* Layer = InspectSelectedLayer())
    {
        if (std::find(Layer->Channels.begin(), Layer->Channels.end(), InspectedChannel) == Layer->Channels.end() &&
            !Layer->Channels.empty())
        {
            InspectedChannel = Layer->Channels.front();
        }
    }
    SyncLayerNameEditBuffer();
}

void MaterialWorkspaceSession::SelectPatternLayer() noexcept
{
    SelectedLayerId       = PatternLayerReservedId;
    LayerEditIdentitySync = PatternLayerReservedId;
}

void MaterialWorkspaceSession::SelectInspectedChannel(MaterialChannelSlot Channel)
{
    if (MaterialStrataLayer* Layer = AccessSelectedLayer())
    {
        if (std::find(Layer->Channels.begin(), Layer->Channels.end(), Channel) == Layer->Channels.end())
        {
            Layer->Channels.push_back(Channel);
        }
        InspectedChannel = Channel;
    }
}

void MaterialWorkspaceSession::ApplyDetailFieldPreset(FieldProcedureVariant Procedure, ColorRgba StopA, ColorRgba StopB)
{
    MaterialStrataLayer* Layer = AccessSelectedLayer();
    if (Layer == nullptr)
    {
        return;
    }
    auto& Src         = Layer->ChannelSources[static_cast<std::size_t>(MaterialChannelSlot::Colour)];
    Src.Mode          = ChannelSourceMode::ProceduralField;
    Src.Procedure     = Procedure;
    Src.StopPrimary   = StopA;
    Src.StopSecondary = StopB;
    InspectedChannel  = MaterialChannelSlot::Colour;
    ++RevisionCounter;
    StatusBannerText = "Applied detail field generator";
}

void MaterialWorkspaceSession::ApplyPrimaryAlbedoColor(ColorRgba Rgba)
{
    PrimaryAlbedo = Rgba;
    if (MaterialStrataLayer* Layer = AccessSelectedLayer())
    {
        Layer->ChannelSources[static_cast<std::size_t>(MaterialChannelSlot::Colour)].StopPrimary = Rgba;
    }
    SyncPhysicalSurfaceParameters();
    ++RevisionCounter;
}

void MaterialWorkspaceSession::ApplyInspectedChannelColor(ColorRgba Rgba)
{
    if (MaterialStrataLayer* Layer = AccessSelectedLayer())
    {
        Layer->ChannelSources[static_cast<std::size_t>(InspectedChannel)].StopPrimary = Rgba;
    }
    if (InspectedChannel == MaterialChannelSlot::Colour)
    {
        PrimaryAlbedo = Rgba;
        SyncPhysicalSurfaceParameters();
    }
    ++RevisionCounter;
}

void MaterialWorkspaceSession::ResetViewControls() noexcept
{
    ZoomScalePercent    = 62u;
    LightAzimuthDegrees = -37.0f;
    ExposureEV          = 1.22f;
    AutoRotateTurntable = false;
    StatusBannerText    = "Reset shader preview stage framing";
}

void MaterialWorkspaceSession::SyncPhysicalSurfaceParameters() noexcept
{
    PhysicalMaterial.Diffuse.BaseColor = {
        static_cast<float>(PrimaryAlbedo.Red) / 255.0f,
        static_cast<float>(PrimaryAlbedo.Green) / 255.0f,
        static_cast<float>(PrimaryAlbedo.Blue) / 255.0f,
    };
    PhysicalMaterial.Specular.Roughness     = Roughness;
    PhysicalMaterial.Specular.Metalness     = Metalness;
    PhysicalMaterial.Specular.DielectricIOR = DielectricIOR;
    PhysicalMaterial.Clearcoat.CoatWeight   = ClearcoatWeight;
    PhysicalMaterial.Clearcoat.CoatRoughness = ClearcoatRoughness;
    PhysicalMaterial.Clearcoat.CoatIOR      = ClearcoatIOR;
    PhysicalMaterial.GlintFlakes.FlakeCoverage = FlakeDensity;
}

std::string MaterialWorkspaceSession::BuildExportTomlSummary() const
{
    char HexBuf[16] {};
    std::snprintf(HexBuf, sizeof(HexBuf), "#%02x%02x%02x", PrimaryAlbedo.Red, PrimaryAlbedo.Green, PrimaryAlbedo.Blue);
    char Buffer[512] {};
    std::snprintf(
        Buffer,
        sizeof(Buffer),
        "[material]\nname = \"%s\"\ncategory = \"%s\"\ncolor = \"%s\"\nroughness = %.2f\nmetalness = %.2f\nior = %.2f\nstrata_layers = %u\n",
        MaterialTitle.c_str(),
        MaterialCategory.c_str(),
        HexBuf,
        Roughness,
        Metalness,
        DielectricIOR,
        static_cast<uint32_t>(StrataLayers.size()));
    return std::string(Buffer);
}

MaterialStrataLayer* MaterialWorkspaceSession::AccessSelectedLayer() noexcept
{
    if (SelectedLayerId == PatternLayerReservedId)
    {
        return nullptr;
    }
    for (auto& Layer : StrataLayers)
    {
        if (Layer.Identity == SelectedLayerId)
        {
            return &Layer;
        }
    }
    return StrataLayers.empty() ? nullptr : &StrataLayers.back();
}

const MaterialStrataLayer* MaterialWorkspaceSession::InspectSelectedLayer() const noexcept
{
    if (SelectedLayerId == PatternLayerReservedId)
    {
        return nullptr;
    }
    for (const auto& Layer : StrataLayers)
    {
        if (Layer.Identity == SelectedLayerId)
        {
            return &Layer;
        }
    }
    return StrataLayers.empty() ? nullptr : &StrataLayers.back();
}

uint32_t MaterialWorkspaceSession::QueryEnabledLayerCount() const noexcept
{
    uint32_t Count = 0u;
    for (const auto& Layer : StrataLayers)
    {
        if (Layer.Enabled)
        {
            ++Count;
        }
    }
    return Count;
}

uint32_t MaterialWorkspaceSession::QueryTotalLayerRowCount() const noexcept
{
    return static_cast<uint32_t>(StrataLayers.size()) + (PatternOverlay.Attached ? 1u : 0u);
}

bool MaterialWorkspaceSession::VerifyLayerRemovable(const MaterialStrataLayer& Layer) const noexcept
{
    if (Layer.Model == MaterialStrataModel::Surface)
    {
        uint32_t SurfaceCount = 0u;
        for (const auto& Entry : StrataLayers)
        {
            if (Entry.Model == MaterialStrataModel::Surface)
            {
                ++SurfaceCount;
            }
        }
        return SurfaceCount > 1u;
    }
    return true;
}

std::vector<MaterialChannelSlot> MaterialWorkspaceSession::QueryAvailableChannelsForSelectedLayer() const
{
    std::vector<MaterialChannelSlot> Available {};
    const MaterialStrataLayer*       Layer = InspectSelectedLayer();
    if (Layer == nullptr)
    {
        return Available;
    }
    for (std::size_t Idx = 0u; Idx < static_cast<std::size_t>(MaterialChannelSlot::Count); ++Idx)
    {
        const MaterialChannelSlot Slot = ChannelFromIndex(Idx);
        if (std::find(Layer->Channels.begin(), Layer->Channels.end(), Slot) == Layer->Channels.end())
        {
            Available.push_back(Slot);
        }
    }
    return Available;
}

void MaterialWorkspaceSession::SyncLayerNameEditBuffer() noexcept
{
    if (const MaterialStrataLayer* Layer = InspectSelectedLayer())
    {
        if (LayerEditIdentitySync != Layer->Identity && !LayerNameEditBuffer.Active)
        {
            LayerNameEditBuffer.Begin(Layer->Name.c_str());
            LayerNameEditBuffer.Active = false;
            LayerEditIdentitySync      = Layer->Identity;
        }
    }
}

} // namespace Frontier::Workspaces
