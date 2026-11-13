/*==========================================================================================================================================
                                                         TEXTUREPAINTSESSION.CPP
==========================================================================================================================================*/
// 🎨 Implementation of TexturePaintSession: 22 PBR channel descriptors, default Teapot Paint layers, undo/redo & brush dynamics.

#include "Engine/Workspaces/Texturing/TexturePaintSession.h"

#include <algorithm>
#include <cstdio>

namespace Frontier::Workspaces
{

namespace
{

constexpr std::array<PaintChannelDescriptor, TexturePaintSession::ChannelCount> PaintChannelEntries {{
    { PaintSurfaceChannel::Albedo,         "Albedo",      "Al",  0.0f,   1.0f,  1.0f,  true  },
    { PaintSurfaceChannel::Roughness,      "Roughness",   "Ro",  0.02f,  1.0f,  0.42f, false },
    { PaintSurfaceChannel::Metalness,      "Metalness",   "Me",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::Height,         "Height",      "He", -1.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::NormalStrength, "Normal Str",  "No",  0.0f,   2.0f,  1.0f,  false },
    { PaintSurfaceChannel::Occlusion,      "Occlusion",   "AO",  0.0f,   1.0f,  1.0f,  false },
    { PaintSurfaceChannel::Opacity,        "Opacity",     "Op",  0.0f,   1.0f,  1.0f,  false },
    { PaintSurfaceChannel::Emissive,       "Emissive",    "Em",  0.0f,   1.0f,  0.0f,  true  },
    { PaintSurfaceChannel::GlowPower,      "Glow Power",  "Em",  0.0f,   4.0f,  1.0f,  false },
    { PaintSurfaceChannel::Clearcoat,      "Clearcoat",   "Cc",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::CoatRough,      "Coat Rough",  "Cr",  0.02f,  1.0f,  0.15f, false },
    { PaintSurfaceChannel::Sheen,          "Sheen",       "Sh",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::SheenRough,     "Sheen Rough", "Sr",  0.02f,  1.0f,  0.50f, false },
    { PaintSurfaceChannel::Specular,       "Specular",    "Sp",  0.0f,   1.0f,  0.50f, false },
    { PaintSurfaceChannel::Anisotropy,     "Anisotropy",  "An",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::Iridescence,    "Iridescence", "Ir",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::IridFilm,       "Irid Film",   "If",  100.0f, 900.0f, 380.0f, false },
    { PaintSurfaceChannel::Transmission,   "Transmission","Tr",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::Subsurface,     "Subsurface",  "Ss",  0.0f,   1.0f,  0.0f,  false },
    { PaintSurfaceChannel::SpecColour,     "Spec Colour", "Sc",  0.0f,   1.0f,  1.0f,  true  },
    { PaintSurfaceChannel::SheenColour,    "Sheen Colour","ShC", 0.0f,   1.0f,  1.0f,  true  },
    { PaintSurfaceChannel::SubsurfTint,    "Subsurf Tint","St",  0.0f,   1.0f,  1.0f,  true  },
}};

constexpr std::array<PaintStudyDescriptor, 5u> PaintStudyEntries {{
    { PaintStudyAsset::UtahTeapot, "Utah Teapot", 4u, 32u },
    { PaintStudyAsset::ShaderBall, "Shader Ball", 4u, 18u },
    { PaintStudyAsset::ChamferBox, "Chamfer Box", 1u,  6u },
    { PaintStudyAsset::UvSphere,   "UV Sphere",   1u,  1u },
    { PaintStudyAsset::TorusKnot,  "Torus Knot",  1u,  1u },
}};

constexpr std::array<const char*, 23u> PaintViewChannelLabels {{
    "Lit (Full 19-CH PBR)",
    "Albedo",
    "Roughness",
    "Metalness",
    "Height",
    "Normal Str",
    "Occlusion",
    "Opacity",
    "Emissive",
    "Glow Power",
    "Clearcoat",
    "Coat Rough",
    "Sheen",
    "Sheen Rough",
    "Specular",
    "Anisotropy",
    "Iridescence",
    "Irid Film",
    "Transmission",
    "Subsurface",
    "Spec Colour",
    "Sheen Colour",
    "Subsurf Tint",
}};

constexpr std::array<const char*, 10u> PaintBlendLabels {{
    "Normal",
    "Multiply",
    "Screen",
    "Overlay",
    "Add",
    "Soft Light",
    "Darken",
    "Lighten",
    "Color Dodge",
    "Height Blend",
}};

constexpr std::array<ColorRgba, 8u> BrushQuickSwatches {{
    { 239u, 244u, 207u, 255u }, // Studio Cream
    { 225u,  75u,  75u, 255u }, // Signal Red
    { 235u, 152u,  62u, 255u }, // Amber Rust
    {  72u, 178u, 128u, 255u }, // Oxide Mint
    {  82u, 148u, 232u, 255u }, // Cobalt Blue
    { 174u, 118u, 218u, 255u }, // Violet Ink
    { 244u, 245u, 248u, 255u }, // Pure White
    {  24u,  26u,  30u, 255u }, // Carbon Black
}};

void EnablePrimaryFourChannels(std::array<bool, PaintLayerEntry::ChannelCount>& Channels) noexcept
{
    Channels.fill(false);
    Channels[static_cast<std::size_t>(PaintSurfaceChannel::Albedo)]    = true;
    Channels[static_cast<std::size_t>(PaintSurfaceChannel::Roughness)] = true;
    Channels[static_cast<std::size_t>(PaintSurfaceChannel::Metalness)] = true;
    Channels[static_cast<std::size_t>(PaintSurfaceChannel::Height)]    = true;
}

void InitializeDefaultChannelScalars(std::array<float, PaintLayerEntry::ChannelCount>& Scalars) noexcept
{
    for (std::size_t I = 0u; I < PaintLayerEntry::ChannelCount; ++I)
    {
        Scalars[I] = PaintChannelEntries[I].DefaultScalar;
    }
}

} // namespace

std::size_t PaintLayerEntry::CountActiveChannels() const noexcept
{
    std::size_t Total = 0u;
    for (bool Enabled : ActiveChannels)
    {
        if (Enabled)
        {
            ++Total;
        }
    }
    return Total;
}

std::string PaintLayerEntry::FormatSubtitle() const
{
    const std::size_t ChCount = CountActiveChannels();
    char              Buf[64];
    const char*       CatTag = "PAINT";
    switch (Category)
    {
        case PaintLayerCategory::Fill:     CatTag = "FILL";     break;
        case PaintLayerCategory::Material: CatTag = "MATERIAL"; break;
        case PaintLayerCategory::Stamp:    CatTag = "STAMP";    break;
        case PaintLayerCategory::Text:     CatTag = "TEXT";     break;
        case PaintLayerCategory::WearGen:  CatTag = "WEAR GEN"; break;
        case PaintLayerCategory::Folder:   CatTag = "FOLDER";   break;
        case PaintLayerCategory::Paint:
        default:                           CatTag = "PAINT";    break;
    }
    if (Category == PaintLayerCategory::Folder)
    {
        std::snprintf(Buf, sizeof(Buf), "FOLDER · %d%%", static_cast<int>(Opacity * 100.0f + 0.5f));
    }
    else
    {
        std::snprintf(Buf, sizeof(Buf), "%s · %zu CH", CatTag, ChCount);
    }
    return std::string(Buf);
}

TexturePaintSession::TexturePaintSession() noexcept
{
    ResetDefaults();
}

void TexturePaintSession::ResetDefaults() noexcept
{
    DocumentName     = "Teapot Paint";
    ResolutionPx     = 512u;
    Study            = PaintStudyAsset::UtahTeapot;
    ViewportLayout   = PaintViewportLayout::ThreeDOnly;
    ViewChannelIndex = 0u;
    ActiveTool       = PaintToolCategory::Brush;
    InspectorTab     = BrushInspectorTab::Brush;
    InspectorSubTab  = BrushDetailSubTab::TipAndPbr;
    WireframeOverlay = false;
    LayerFilter      = PaintFilterTab::AllLayers;
    SearchQuery.clear();
    StatusBanner     = "WebGL2 GPU";

    UndoHistory.clear();
    RedoHistory.clear();
    Layers.clear();

    // Base layer at index 0 (rendered below), top layer at index 1 (rendered at top of stack UI)
    PaintLayerEntry CeramicPrimer {};
    CeramicPrimer.Id               = 1u;
    CeramicPrimer.Category         = PaintLayerCategory::Fill;
    CeramicPrimer.Name             = "Base Ceramic Coat";
    CeramicPrimer.PrimerTint         = ColorRgba{ 196u, 198u, 204u, 255u };
    CeramicPrimer.InspectedChannel = PaintSurfaceChannel::Albedo;
    EnablePrimaryFourChannels(CeramicPrimer.ActiveChannels);
    InitializeDefaultChannelScalars(CeramicPrimer.ChannelScalars);
    CeramicPrimer.ChannelScalars[static_cast<std::size_t>(PaintSurfaceChannel::Roughness)] = 0.28f;
    Layers.push_back(std::move(CeramicPrimer));

    PaintLayerEntry TopPaint {};
    TopPaint.Id               = 2u;
    TopPaint.Category         = PaintLayerCategory::Paint;
    TopPaint.Name             = "Hand Painted Layer";
    TopPaint.PrimerTint         = ColorRgba{ 239u, 244u, 207u, 255u };
    TopPaint.InspectedChannel = PaintSurfaceChannel::Albedo;
    EnablePrimaryFourChannels(TopPaint.ActiveChannels);
    InitializeDefaultChannelScalars(TopPaint.ChannelScalars);
    Layers.push_back(std::move(TopPaint));

    SelectedLayerId = 2u;
    NextLayerId     = 3u;
    NextStampId     = 1u;

    Brush = PaintBrushProfile{};
    EnablePrimaryFourChannels(Brush.PaintChannels);
    EnablePrimaryFourChannels(Brush.EraseChannels);
    EnablePrimaryFourChannels(Brush.FillChannels);

    Brush.Curves[0] = { { 0.0f, 1.0f }, { 0.45f, 0.86f }, { 0.80f, 0.35f }, { 1.0f, 0.0f } };
    Brush.Curves[1] = { { 0.0f, 1.0f }, { 0.50f, 1.00f }, { 1.0f, 1.00f } };
    Brush.Curves[2] = { { 0.0f, 1.0f }, { 0.50f, 1.00f }, { 1.0f, 1.00f } };
    Brush.Curves[3] = { { 0.0f, 0.5f }, { 0.50f, 0.50f }, { 1.0f, 0.50f } };
}

void TexturePaintSession::SelectTool(PaintToolCategory Tool) noexcept
{
    ActiveTool = Tool;
    switch (Tool)
    {
        case PaintToolCategory::Brush:      InspectorTab = BrushInspectorTab::Brush; break;
        case PaintToolCategory::Eraser:     InspectorTab = BrushInspectorTab::Erase; break;
        case PaintToolCategory::Fill:       InspectorTab = BrushInspectorTab::Fill;  break;
        case PaintToolCategory::Stamp:      InspectorTab = BrushInspectorTab::Stamp; break;
        case PaintToolCategory::Sample:     InspectorTab = BrushInspectorTab::Pick;  break;
        case PaintToolCategory::Move:       InspectorTab = BrushInspectorTab::Move;  break;
        case PaintToolCategory::Text:       InspectorTab = BrushInspectorTab::Text;  break;
        case PaintToolCategory::Curve3D:
        case PaintToolCategory::Gradient3D:
        default:                            InspectorTab = BrushInspectorTab::Brush; break;
    }
}

void TexturePaintSession::SelectStudy(PaintStudyAsset NextStudy) noexcept
{
    if (static_cast<std::size_t>(NextStudy) < PaintStudyEntries.size())
    {
        Study = NextStudy;
    }
}

void TexturePaintSession::AssignResolution(uint32_t NextResPx) noexcept
{
    if (NextResPx == 512u || NextResPx == 1024u || NextResPx == 2048u || NextResPx == 4096u)
    {
        PushUndoSnapshot();
        ResolutionPx = NextResPx;
    }
}

void TexturePaintSession::PushUndoSnapshot() noexcept
{
    PaintDocumentSnapshot Snap { Layers, SelectedLayerId, NextLayerId, ResolutionPx };
    UndoHistory.push_back(std::move(Snap));
    if (UndoHistory.size() > 32u)
    {
        UndoHistory.erase(UndoHistory.begin());
    }
    RedoHistory.clear();
}

bool TexturePaintSession::ApplyUndo() noexcept
{
    if (UndoHistory.empty())
    {
        return false;
    }
    RedoHistory.push_back(PaintDocumentSnapshot{ Layers, SelectedLayerId, NextLayerId, ResolutionPx });
    PaintDocumentSnapshot Prev = std::move(UndoHistory.back());
    UndoHistory.pop_back();
    Layers          = std::move(Prev.Layers);
    SelectedLayerId = Prev.SelectedLayerId;
    NextLayerId     = Prev.NextLayerId;
    ResolutionPx    = Prev.ResolutionPx;
    return true;
}

bool TexturePaintSession::ApplyRedo() noexcept
{
    if (RedoHistory.empty())
    {
        return false;
    }
    UndoHistory.push_back(PaintDocumentSnapshot{ Layers, SelectedLayerId, NextLayerId, ResolutionPx });
    PaintDocumentSnapshot Next = std::move(RedoHistory.back());
    RedoHistory.pop_back();
    Layers          = std::move(Next.Layers);
    SelectedLayerId = Next.SelectedLayerId;
    NextLayerId     = Next.NextLayerId;
    ResolutionPx    = Next.ResolutionPx;
    return true;
}

void TexturePaintSession::AddLayer(PaintLayerCategory Category) noexcept
{
    if (Layers.size() >= MaxLayerCount)
    {
        return;
    }
    PushUndoSnapshot();

    PaintLayerEntry Created {};
    Created.Id               = NextLayerId++;
    Created.Category         = Category;
    Created.InspectedChannel = PaintSurfaceChannel::Albedo;
    EnablePrimaryFourChannels(Created.ActiveChannels);
    InitializeDefaultChannelScalars(Created.ChannelScalars);

    char NameBuf[64];
    switch (Category)
    {
        case PaintLayerCategory::Fill:
            std::snprintf(NameBuf, sizeof(NameBuf), "Fill Layer %u", Created.Id);
            Created.PrimerTint = Brush.InkColor;
            break;
        case PaintLayerCategory::Material:
            std::snprintf(NameBuf, sizeof(NameBuf), "Material Coat %u", Created.Id);
            Created.PrimerTint = ColorRgba{ 168u, 174u, 184u, 255u };
            break;
        case PaintLayerCategory::Stamp:
            std::snprintf(NameBuf, sizeof(NameBuf), "Stamp Layer %u", Created.Id);
            Created.Stamps.push_back(PaintStampPlacement{ NextStampId++, Brush.ActiveStampName, true, false, 0.50f, 0.50f, 0.30f, 0.0f, 1.0f, 0.5f, Brush.StampTint });
            Created.SelectedStampId = Created.Stamps.back().Id;
            break;
        case PaintLayerCategory::Text:
            std::snprintf(NameBuf, sizeof(NameBuf), "Text: %s", Brush.TextContent.substr(0u, 12u).c_str());
            Created.Stamps.push_back(PaintStampPlacement{ NextStampId++, Brush.TextContent, true, false, 0.50f, 0.50f, 0.34f, 0.0f, 1.0f, 0.65f, Brush.InkColor });
            Created.SelectedStampId = Created.Stamps.back().Id;
            break;
        case PaintLayerCategory::WearGen:
            std::snprintf(NameBuf, sizeof(NameBuf), "Edge Wear Gen %u", Created.Id);
            Created.PrimerTint = ColorRgba{ 212u, 176u, 122u, 255u };
            break;
        case PaintLayerCategory::Folder:
            std::snprintf(NameBuf, sizeof(NameBuf), "Layer Group %u", Created.Id);
            Created.ActiveChannels.fill(false);
            break;
        case PaintLayerCategory::Paint:
        default:
            std::snprintf(NameBuf, sizeof(NameBuf), "Paint Layer %u", Created.Id);
            break;
    }
    Created.Name = NameBuf;

    Layers.push_back(std::move(Created));
    SelectedLayerId = Layers.back().Id;
}

void TexturePaintSession::DuplicateSelectedLayer() noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    if (Idx < 0 || Layers.size() >= MaxLayerCount)
    {
        return;
    }
    PushUndoSnapshot();
    PaintLayerEntry Copy = Layers[static_cast<std::size_t>(Idx)];
    Copy.Id              = NextLayerId++;
    Copy.Name += " Copy";
    for (auto& St : Copy.Stamps)
    {
        St.Id = NextStampId++;
    }
    Copy.SelectedStampId = Copy.Stamps.empty() ? 0u : Copy.Stamps.front().Id;
    Layers.insert(Layers.begin() + Idx + 1, std::move(Copy));
    SelectedLayerId = Layers[static_cast<std::size_t>(Idx + 1)].Id;
}

void TexturePaintSession::DeleteSelectedLayer() noexcept
{
    if (Layers.size() <= 1u)
    {
        return;
    }
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    if (Idx < 0)
    {
        return;
    }
    PushUndoSnapshot();
    const uint32_t RemovedId = Layers[static_cast<std::size_t>(Idx)].Id;
    Layers.erase(Layers.begin() + Idx);
    for (auto& L : Layers)
    {
        if (L.FolderOwnerId == RemovedId)
        {
            L.FolderOwnerId = 0u;
        }
    }
    const int32_t NextIdx = std::clamp(Idx - 1, 0, static_cast<int32_t>(Layers.size()) - 1);
    SelectedLayerId       = Layers[static_cast<std::size_t>(NextIdx)].Id;
}

bool TexturePaintSession::MoveSelectedLayerUp() noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    if (Idx < 0 || static_cast<std::size_t>(Idx) + 1u >= Layers.size())
    {
        return false;
    }
    PushUndoSnapshot();
    std::swap(Layers[static_cast<std::size_t>(Idx)], Layers[static_cast<std::size_t>(Idx) + 1u]);
    return true;
}

bool TexturePaintSession::MoveSelectedLayerDown() noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    if (Idx <= 0)
    {
        return false;
    }
    PushUndoSnapshot();
    std::swap(Layers[static_cast<std::size_t>(Idx)], Layers[static_cast<std::size_t>(Idx) - 1u]);
    return true;
}

void TexturePaintSession::ToggleOrCreateMaskOnSelectedLayer() noexcept
{
    auto* Sel = AccessSelectedLayer();
    if (Sel == nullptr)
    {
        return;
    }
    PushUndoSnapshot();
    if (!Sel->Mask.Attached)
    {
        Sel->Mask.Attached       = true;
        Sel->Mask.EditingMask    = true;
        Sel->Mask.Enabled        = true;
        Sel->Mask.FillBrightness = 255u;
    }
    else
    {
        Sel->Mask.EditingMask = !Sel->Mask.EditingMask;
    }
}

void TexturePaintSession::AddChannelToSelectedLayer(PaintSurfaceChannel Channel) noexcept
{
    auto* Sel = AccessSelectedLayer();
    if (Sel == nullptr || static_cast<std::size_t>(Channel) >= ChannelCount)
    {
        return;
    }
    PushUndoSnapshot();
    Sel->ActiveChannels[static_cast<std::size_t>(Channel)] = true;
    Sel->InspectedChannel = Channel;
}

void TexturePaintSession::RemoveChannelFromSelectedLayer(PaintSurfaceChannel Channel) noexcept
{
    auto* Sel = AccessSelectedLayer();
    if (Sel == nullptr || static_cast<std::size_t>(Channel) >= ChannelCount)
    {
        return;
    }
    PushUndoSnapshot();
    Sel->ActiveChannels[static_cast<std::size_t>(Channel)] = false;
    if (Sel->InspectedChannel == Channel)
    {
        for (std::size_t I = 0u; I < ChannelCount; ++I)
        {
            if (Sel->ActiveChannels[I])
            {
                Sel->InspectedChannel = static_cast<PaintSurfaceChannel>(I);
                break;
            }
        }
    }
}

void TexturePaintSession::AddStampToSelectedLayer(bool TextStampMode) noexcept
{
    auto* Sel = AccessSelectedLayer();
    if (Sel == nullptr || Sel->Category == PaintLayerCategory::Folder)
    {
        return;
    }
    PushUndoSnapshot();
    PaintStampPlacement Placement {};
    Placement.Id         = NextStampId++;
    Placement.Name       = TextStampMode ? Brush.TextContent : Brush.ActiveStampName;
    Placement.TintColor  = TextStampMode ? Brush.InkColor : Brush.StampTint;
    Sel->Stamps.push_back(std::move(Placement));
    Sel->SelectedStampId = Sel->Stamps.back().Id;
}

void TexturePaintSession::RemoveStampFromSelectedLayer(uint32_t StampId) noexcept
{
    auto* Sel = AccessSelectedLayer();
    if (Sel == nullptr)
    {
        return;
    }
    PushUndoSnapshot();
    Sel->Stamps.erase(
        std::remove_if(Sel->Stamps.begin(), Sel->Stamps.end(), [StampId](const PaintStampPlacement& S) { return S.Id == StampId; }),
        Sel->Stamps.end());
    Sel->SelectedStampId = Sel->Stamps.empty() ? 0u : Sel->Stamps.front().Id;
}

PaintLayerEntry* TexturePaintSession::AccessSelectedLayer() noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    return (Idx >= 0) ? &Layers[static_cast<std::size_t>(Idx)] : nullptr;
}

const PaintLayerEntry* TexturePaintSession::InspectSelectedLayer() const noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    return (Idx >= 0) ? &Layers[static_cast<std::size_t>(Idx)] : nullptr;
}

int32_t TexturePaintSession::FindLayerVectorIndex(uint32_t LayerId) const noexcept
{
    for (std::size_t I = 0u; I < Layers.size(); ++I)
    {
        if (Layers[I].Id == LayerId)
        {
            return static_cast<int32_t>(I);
        }
    }
    return -1;
}

std::size_t TexturePaintSession::CountVisibleLayers() const noexcept
{
    std::size_t Total = 0u;
    for (const auto& L : Layers)
    {
        if (L.Visible)
        {
            ++Total;
        }
    }
    return Total;
}

std::size_t TexturePaintSession::CountHiddenLayers() const noexcept
{
    return Layers.size() - CountVisibleLayers();
}

bool TexturePaintSession::QueryMovableUp() const noexcept
{
    const int32_t Idx = FindLayerVectorIndex(SelectedLayerId);
    return Idx >= 0 && static_cast<std::size_t>(Idx) + 1u < Layers.size();
}

bool TexturePaintSession::QueryMovableDown() const noexcept
{
    return FindLayerVectorIndex(SelectedLayerId) > 0;
}

const PaintStudyDescriptor& TexturePaintSession::QueryActiveStudyDescriptor() const noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Study);
    return PaintStudyEntries[Index < PaintStudyEntries.size() ? Index : 0u];
}

const std::array<PaintChannelDescriptor, TexturePaintSession::ChannelCount>& TexturePaintSession::QueryChannelRegistry() noexcept
{
    return PaintChannelEntries;
}

const PaintChannelDescriptor& TexturePaintSession::QueryChannelDescriptor(PaintSurfaceChannel Channel) noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Channel);
    return PaintChannelEntries[Index < ChannelCount ? Index : 0u];
}

const std::array<PaintStudyDescriptor, 5u>& TexturePaintSession::QueryStudyRegistry() noexcept
{
    return PaintStudyEntries;
}

const std::array<const char*, 23u>& TexturePaintSession::QueryViewChannelLabels() noexcept
{
    return PaintViewChannelLabels;
}

const std::array<const char*, 10u>& TexturePaintSession::QueryBlendMethodLabels() noexcept
{
    return PaintBlendLabels;
}

const std::array<ColorRgba, 8u>& TexturePaintSession::QueryBrushQuickSwatches() noexcept
{
    return BrushQuickSwatches;
}

} // namespace Frontier::Workspaces
