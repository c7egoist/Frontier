/*==========================================================================================================================================
                                                       PATTERNSTAMPSTACKSESSION.CPP
==========================================================================================================================================*/
// 📊 Pattern Studio and Stamp Studio shared document, layer-stack tree, 22-channel PBR bindings, 8 modifiers, and undo/redo history.

#include "Engine/Workspaces/Texturing/PatternStampStackSession.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace Frontier::Workspaces
{

namespace
{

constexpr PatternStampSurfaceChannelEntry ConstructChannelEntry(PatternStampSurfaceChannelKey Key, float Scalar, ColorRgba Tint) noexcept
{
    PatternStampSurfaceChannelEntry Out {};
    Out.Key           = Key;
    Out.ScalarReading = Scalar;
    Out.Tint          = Tint;
    return Out;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                   STATIC DESCRIPTORS
//------------------------------------------------------------------------------------------------------------------------

const std::vector<PatternStampSurfaceChannelDescriptor>& PatternStampWorkspaceSession::InspectChannelDescriptors() noexcept
{
    static const std::vector<PatternStampSurfaceChannelDescriptor> Descs {
        { PatternStampSurfaceChannelKey::Albedo,       "Albedo",       "Albedo",   "Base Colour",      true,  false, 0.0f,  1.0f, 0.01f, 0.50f, { 239u, 244u, 207u, 255u } },
        { PatternStampSurfaceChannelKey::Roughness,    "Roughness",    "Rough",    "Surface Gloss",    false, false, 0.02f, 1.0f, 0.01f, 0.26f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Metalness,    "Metalness",    "Metal",    "Conductor Mask",   false, false, 0.0f,  1.0f, 0.01f, 0.92f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Height,       "Height",       "Height",   "Relief / Bump",    false, false, -1.0f, 1.0f, 0.02f, 0.45f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::NormalStr,    "Normal Str",   "Normal",   "Bump Intensity",   false, true,  0.0f,  2.0f, 0.05f, 0.85f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Occlusion,    "Occlusion",    "AO",       "Ambient Cavity",   false, true,  0.0f,  1.0f, 0.01f, 1.00f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Opacity,      "Opacity",      "Opacity",  "Cutout / Alpha",   false, true,  0.0f,  1.0f, 0.01f, 1.00f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Emissive,     "Emissive",     "Emissive", "Glow Colour",      true,  true,  0.0f,  1.0f, 0.01f, 0.50f, { 255u, 122u, 59u, 255u } },
        { PatternStampSurfaceChannelKey::GlowPower,    "Glow Power",   "Glow",     "Emission Gain",    false, true,  0.0f,  4.0f, 0.05f, 1.00f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Clearcoat,    "Clearcoat",    "Coat",     "Varnish Coat",     false, true,  0.0f,  1.0f, 0.01f, 0.80f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::CoatRough,    "Coat Rough",   "CoatRgh",  "Varnish Gloss",    false, true,  0.01f, 1.0f, 0.01f, 0.08f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Sheen,        "Sheen",        "Sheen",    "Fabric Velour",    false, true,  0.0f,  1.0f, 0.01f, 0.65f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::SheenRough,   "Sheen Rough",  "SheenRgh", "Microfiber Soft",  false, true,  0.01f, 1.0f, 0.01f, 0.45f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Specular,     "Specular",     "Spec",     "Dielectric F0",    false, true,  0.0f,  1.0f, 0.01f, 1.00f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Anisotropy,   "Anisotropy",   "Aniso",    "Brushed Grain",    false, true,  0.0f,  1.0f, 0.01f, 0.50f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Iridescence,  "Iridescence",  "Irid",     "Thin-Film Pearl",  false, true,  0.0f,  1.0f, 0.01f, 0.70f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::IridFilm,     "Irid Film",    "IridFilm", "Spectrum Shift",   false, true,  0.0f,  1.0f, 0.01f, 0.45f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Transmission, "Transmission", "Trans",    "Glass / Jelly",    false, true,  0.0f,  1.0f, 0.01f, 0.65f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::Subsurface,   "Subsurface",   "Depth",    "Depth / Scatter",  false, true,  0.0f,  1.0f, 0.01f, 0.40f, { 158u, 162u, 170u, 255u } },
        { PatternStampSurfaceChannelKey::SpecColour,   "Spec Colour",  "SpecCol",  "Specular Tint",    true,  true,  0.0f,  1.0f, 0.01f, 0.50f, { 255u, 255u, 255u, 255u } },
        { PatternStampSurfaceChannelKey::SheenColour,  "Sheen Colour", "SheenCol", "Fabric Velour Tint", true, true, 0.0f,  1.0f, 0.01f, 0.50f, { 255u, 255u, 255u, 255u } },
        { PatternStampSurfaceChannelKey::SubsurfTint,  "Subsurf Tint", "SubCol",   "Volume Attenuation", true, true, 0.0f,  1.0f, 0.01f, 0.50f, { 255u, 255u, 255u, 255u } },
    };
    return Descs;
}

const PatternStampSurfaceChannelDescriptor& PatternStampWorkspaceSession::QueryChannelDescriptor(PatternStampSurfaceChannelKey Key) noexcept
{
    const auto& Descs = InspectChannelDescriptors();
    const std::size_t Idx = static_cast<std::size_t>(Key);
    return Idx < Descs.size() ? Descs[Idx] : Descs[0];
}

const std::vector<PatternStampToolDescriptor>& PatternStampWorkspaceSession::InspectToolDescriptors() noexcept
{
    static const std::vector<PatternStampToolDescriptor> Tools {
        { PatternStampToolCategory::Select,        "Select",      "V", true },
        { PatternStampToolCategory::Curve,         "Curve",       "U", true },
        { PatternStampToolCategory::Pen,           "Pen",         "P", false },
        { PatternStampToolCategory::EditPoints,    "Edit Points", "A", false },
        { PatternStampToolCategory::PointGradient, "Point Grad",  "F", true },
        { PatternStampToolCategory::Square,        "Rect",        "R", true },
        { PatternStampToolCategory::Circle,        "Circle",      "O", true },
        { PatternStampToolCategory::Diamond,       "Diamond",     "D", true },
        { PatternStampToolCategory::Triangle,      "Tri",         "T", true },
        { PatternStampToolCategory::Star,          "Star",        "S", false },
        { PatternStampToolCategory::Hexagon,       "Hex",         "G", false },
        { PatternStampToolCategory::Stripe,        "Stripe",      "L", false },
        { PatternStampToolCategory::TextBlock,     "Text",        "X", true },
        { PatternStampToolCategory::HandPan,       "Pan",         "H", true },
    };
    return Tools;
}

const std::vector<const char*>& PatternStampWorkspaceSession::InspectMotifShapeLabels() noexcept
{
    static const std::vector<const char*> Labels {
        "Circle",
        "Ring",
        "Square",
        "Rounded Box",
        "Diamond",
        "Hexagon",
        "Triangle",
        "Star",
        "Cross",
        "Chevron",
        "Stripe / Bar",
        "Arc",
        "Teardrop",
        "Botanical Leaf",
        "5-Petal Flower",
        "Cog / Gear",
        "Line / Stroke",
        "Vector Path",
    };
    return Labels;
}

const std::vector<const char*>& PatternStampWorkspaceSession::InspectModifierLabels() noexcept
{
    static const std::vector<const char*> Labels {
        "Noise Scale",
        "Grid / Hex Array",
        "Radial Array",
        "Mirror Symmetry",
        "Inset / Echo",
        "Scatter & Dropout",
        "Domain Warp",
        "Bevel & Edge Wear",
    };
    return Labels;
}

const std::vector<const char*>& PatternStampWorkspaceSession::InspectFinishLabels() noexcept
{
    static const std::vector<const char*> Labels {
        "Printed Dye",
        "Woven Cotton",
        "Cut-Pile Wool",
        "Glazed Ceramic",
        "Metal Inlay",
        "Embossed Rubber",
    };
    return Labels;
}

const std::vector<const char*>& PatternStampWorkspaceSession::InspectViewChannelLabels() noexcept
{
    static const std::vector<const char*> Labels {
        "Vector SVG",
        "Seamless 2x2",
        "Single PBR Tile",
        "Albedo",
        "Roughness",
        "Metalness",
        "Height",
        "Normal",
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
    };
    return Labels;
}

std::string PatternStampWorkspaceSession::DescribeLayerSubtitle(const PatternStampLayerSpec& Layer) noexcept
{
    if (Layer.Category == PatternStampLayerCategory::Folder)
    {
        return "Folder";
    }
    std::string CategoryTag = "motif";
    if (Layer.Category == PatternStampLayerCategory::Motif)
    {
        const auto& ShapeNames = InspectMotifShapeLabels();
        const std::size_t SIdx = static_cast<std::size_t>(Layer.MotifShape);
        if (SIdx < ShapeNames.size())
        {
            CategoryTag = ShapeNames[SIdx];
            for (char& C : CategoryTag)
            {
                if (C >= 'A' && C <= 'Z')
                {
                    C = static_cast<char>(C + ('a' - 'A'));
                }
            }
        }
    }
    else if (Layer.Category == PatternStampLayerCategory::Typographic)
    {
        CategoryTag = "text";
    }
    else if (Layer.Category == PatternStampLayerCategory::GradientWash)
    {
        CategoryTag = "gradient";
    }

    static constexpr const char* BlendLabels[6] { "Normal", "Multiply", "Screen", "Overlay", "Add", "Darken" };
    if (Layer.BlendMode > 0u && Layer.BlendMode < 6u)
    {
        CategoryTag += " · ";
        CategoryTag += BlendLabels[Layer.BlendMode];
    }

    std::size_t EnabledMods = 0u;
    for (const auto& M : Layer.Modifiers)
    {
        if (M.Enabled)
        {
            ++EnabledMods;
        }
    }
    if (EnabledMods > 0u)
    {
        CategoryTag += " · " + std::to_string(EnabledMods) + (EnabledMods == 1u ? " mod" : " mods");
    }
    return CategoryTag;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SESSION LOGIC
//------------------------------------------------------------------------------------------------------------------------

PatternStampWorkspaceSession::PatternStampWorkspaceSession(PatternStampWorkspaceMode InitialMode) noexcept
{
    ConfigureMode(InitialMode);
}

void PatternStampWorkspaceSession::ConfigureMode(PatternStampWorkspaceMode TargetMode) noexcept
{
    Mode          = TargetMode;
    ResolutionPx  = 1024u;
    ActiveTool    = PatternStampToolCategory::Select;
    ViewChannel   = PatternStampViewChannel::VectorSVG;
    ShowGrid      = true;
    ShowAxes      = true;
    SnapStepPx    = 16;
    ZoomFraction  = 1.0f;
    LayerFilter   = PatternStampLayerFilterMode::AllLayers;
    LayerSearch.clear();
    UndoSnapshots.clear();
    RedoSnapshots.clear();

    BuildPresetDirectory();
    LoadPresetByIndex(0u);
}

void PatternStampWorkspaceSession::BuildPresetDirectory() noexcept
{
    PresetDirectory.clear();
    if (Mode == PatternStampWorkspaceMode::Pattern)
    {
        PresetDirectory.push_back({ "hex-matrix",     "Noise-Scaled Hex Matrix", "8x8 hex lattice · dual FBM scale", { 239u, 244u, 207u, 255u }, { 118u, 178u, 216u, 255u } });
        PresetDirectory.push_back({ "kente-weave",    "Gold Foil Kente Weave",   "Interlocking stripe bars · metallic", { 232u, 194u, 122u, 255u }, { 29u, 33u, 42u, 255u } });
        PresetDirectory.push_back({ "radial-mandala", "Radial Ceramic Mandala",  "12-fold concentric star lattice",    { 118u, 178u, 216u, 255u }, { 239u, 244u, 207u, 255u } });
    }
    else
    {
        PresetDirectory.push_back({ "solid-disc",     "Solid Circle Disc",        "Clean cutout sphere decal",       { 234u, 236u, 239u, 255u }, { 22u, 24u, 28u, 255u } });
        PresetDirectory.push_back({ "botanical-seal", "Botanical Foil Seal",      "Engraved crest with embossed rim", { 232u, 194u, 122u, 255u }, { 24u, 27u, 31u, 255u } });
        PresetDirectory.push_back({ "precision-mark", "Precision Cross Reticle",  "Technical stencil registration",  { 239u, 244u, 207u, 255u }, { 90u, 118u, 146u, 255u } });
    }
}

void PatternStampWorkspaceSession::PopulatePatternHexArrayPreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Noise-Scaled Hex Matrix";
    Out.GroundEnabled        = true;
    Out.GroundTintA          = { 23u, 26u, 31u, 255u };
    Out.GroundTintB          = { 11u, 11u, 11u, 255u };
    Out.ShowGhostTileBorders = true;
    Out.NextIdentitySeed     = 20u;

    // Bottom layer (index 0): Noise-Scaled Dots
    PatternStampLayerSpec Dots {};
    Dots.Identity      = 1u;
    Dots.Name          = "Noise-Scaled Dots";
    Dots.Category          = PatternStampLayerCategory::Motif;
    Dots.Visible       = true;
    Dots.Opacity       = 1.0f;
    Dots.MotifShape    = PatternStampMotifShape::Hexagon;
    Dots.FillEnabled   = true;
    Dots.FillTint      = { 239u, 244u, 207u, 255u };
    Dots.FillTintB     = { 118u, 178u, 216u, 255u };
    Dots.CenterX       = 256.0f;
    Dots.CenterY       = 256.0f;
    Dots.WidthPx       = 42.0f;
    Dots.HeightPx      = 42.0f;
    Dots.FinishPreset  = PatternStampFinishPreset::PrintedDye;
    Dots.Channels      = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 239u, 244u, 207u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.34f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 0.12f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.25f, { 158u, 162u, 170u, 255u }),
    };
    Dots.Mask = { false, false, PatternStampMaskMode::Noise, 4.0f, 0.45f, 0.25f, 211 };

    PatternStampModifierSpec HexArr {};
    HexArr.Category       = PatternStampModifierCategory::GridArray;
    HexArr.GridLayout = 2u; // Hex
    HexArr.Columns    = 8;
    HexArr.Rows       = 8;

    PatternStampModifierSpec ScaleMod {};
    ScaleMod.Category           = PatternStampModifierCategory::NoiseScale;
    ScaleMod.NoiseAlgorithm = 0u;
    ScaleMod.ModulateTarget = 0u; // Scale + Color
    ScaleMod.MinScale       = 0.40f;
    ScaleMod.MaxScale       = 1.60f;
    ScaleMod.Frequency      = 3.5f;
    ScaleMod.TargetTintB    = { 118u, 178u, 216u, 255u };
    Dots.Modifiers = { HexArr, ScaleMod };

    // Top layer (index 1, selected by default matching 01-HTML-pattern.png): Fine Accent Rings
    PatternStampLayerSpec Rings {};
    Rings.Identity      = 2u;
    Rings.Name          = "Fine Accent Rings";
    Rings.Category          = PatternStampLayerCategory::Motif;
    Rings.Visible       = true;
    Rings.Opacity       = 0.72f;
    Rings.MotifShape    = PatternStampMotifShape::Ring;
    Rings.FillEnabled   = true;
    Rings.FillTint      = { 239u, 244u, 207u, 255u };
    Rings.FillTintB     = { 90u, 118u, 146u, 255u };
    Rings.CenterX       = 256.0f;
    Rings.CenterY       = 256.0f;
    Rings.WidthPx       = 16.0f;
    Rings.HeightPx      = 16.0f;
    Rings.FinishPreset  = PatternStampFinishPreset::MetalInlay;
    Rings.Channels      = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 239u, 244u, 207u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.26f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 0.92f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.45f, { 158u, 162u, 170u, 255u }),
    };
    Rings.Mask = { false, false, PatternStampMaskMode::Noise, 4.0f, 0.45f, 0.25f, 211 };

    PatternStampModifierSpec RingGrid {};
    RingGrid.Category       = PatternStampModifierCategory::GridArray;
    RingGrid.GridLayout = 2u;
    RingGrid.Columns    = 8;
    RingGrid.Rows       = 7;

    PatternStampModifierSpec RingNoise {};
    RingNoise.Category           = PatternStampModifierCategory::NoiseScale;
    RingNoise.NoiseAlgorithm = 0u;
    RingNoise.ModulateTarget = 0u;
    RingNoise.MinScale       = 0.40f;
    RingNoise.MaxScale       = 1.60f;
    RingNoise.Frequency      = 3.5f;
    RingNoise.TargetTintB    = { 118u, 178u, 216u, 255u };
    Rings.Modifiers = { RingNoise, RingGrid };

    Out.Layers          = { Dots, Rings };
    Out.SelectedLayerId = Rings.Identity;
}

void PatternStampWorkspaceSession::PopulatePatternKenteWeavePreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Gold Foil Kente Weave";
    Out.GroundEnabled        = true;
    Out.GroundTintA          = { 24u, 26u, 32u, 255u };
    Out.ShowGhostTileBorders = true;
    Out.NextIdentitySeed     = 20u;

    PatternStampLayerSpec WarpBars {};
    WarpBars.Identity   = 1u;
    WarpBars.Name       = "Woven Cotton Stripes";
    WarpBars.MotifShape = PatternStampMotifShape::StripeBar;
    WarpBars.FillTint   = { 239u, 244u, 207u, 255u };
    WarpBars.WidthPx    = 44.0f;
    WarpBars.HeightPx   = 480.0f;
    WarpBars.FinishPreset = PatternStampFinishPreset::WovenCotton;
    WarpBars.Channels   = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 239u, 244u, 207u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.84f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.14f, { 158u, 162u, 170u, 255u }),
    };
    PatternStampModifierSpec Grid {};
    Grid.Category    = PatternStampModifierCategory::GridArray;
    Grid.Columns = 6;
    Grid.Rows    = 1;
    WarpBars.Modifiers = { Grid };

    PatternStampLayerSpec FoilDiamonds {};
    FoilDiamonds.Identity   = 2u;
    FoilDiamonds.Name       = "Metal Inlay Diamonds";
    FoilDiamonds.MotifShape = PatternStampMotifShape::Diamond;
    FoilDiamonds.FillTint   = { 232u, 194u, 122u, 255u };
    FoilDiamonds.WidthPx    = 36.0f;
    FoilDiamonds.HeightPx   = 36.0f;
    FoilDiamonds.FinishPreset = PatternStampFinishPreset::MetalInlay;
    FoilDiamonds.Channels   = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 232u, 194u, 122u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.24f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 1.00f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.35f, { 158u, 162u, 170u, 255u }),
    };
    PatternStampModifierSpec GridD {};
    GridD.Category       = PatternStampModifierCategory::GridArray;
    GridD.GridLayout = 1u;
    GridD.Columns    = 6;
    GridD.Rows       = 6;
    FoilDiamonds.Modifiers = { GridD };

    Out.Layers          = { WarpBars, FoilDiamonds };
    Out.SelectedLayerId = FoilDiamonds.Identity;
}

void PatternStampWorkspaceSession::PopulatePatternRadialMandalaPreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Radial Ceramic Mandala";
    Out.GroundEnabled        = true;
    Out.GroundTintA          = { 19u, 22u, 28u, 255u };
    Out.ShowGhostTileBorders = true;
    Out.NextIdentitySeed     = 20u;

    PatternStampLayerSpec Petals {};
    Petals.Identity   = 1u;
    Petals.Name       = "Cobalt Petals";
    Petals.MotifShape = PatternStampMotifShape::Teardrop;
    Petals.FillTint   = { 118u, 178u, 216u, 255u };
    Petals.WidthPx    = 48.0f;
    Petals.HeightPx   = 96.0f;
    Petals.FinishPreset = PatternStampFinishPreset::GlazedCeramic;
    Petals.Channels   = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 118u, 178u, 216u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.18f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Clearcoat, 0.85f, { 158u, 162u, 170u, 255u }),
    };
    PatternStampModifierSpec Radial {};
    Radial.Category        = PatternStampModifierCategory::RadialArray;
    Radial.RadialCount = 12;
    Radial.RadiusPx    = 140.0f;
    Radial.Rings       = 2;
    Petals.Modifiers = { Radial };

    Out.Layers          = { Petals };
    Out.SelectedLayerId = Petals.Identity;
}

void PatternStampWorkspaceSession::PopulateStampSolidCirclePreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Solid Circle Disc";
    Out.GroundEnabled        = false; // transparent alpha cutout matching 01-HTML-stamp.png
    Out.GroundTintA          = { 23u, 26u, 31u, 255u };
    Out.ShowGhostTileBorders = false;
    Out.NextIdentitySeed     = 20u;

    PatternStampLayerSpec Disc {};
    Disc.Identity     = 1u;
    Disc.Name         = "Solid Disc";
    Disc.Category         = PatternStampLayerCategory::Motif;
    Disc.Visible      = true;
    Disc.Opacity      = 1.0f;
    Disc.MotifShape   = PatternStampMotifShape::Circle;
    Disc.FillEnabled  = true;
    Disc.FillTint     = { 234u, 236u, 239u, 255u };
    Disc.FillTintB    = { 22u, 24u, 28u, 255u };
    Disc.CenterX      = 256.0f;
    Disc.CenterY      = 256.0f;
    Disc.WidthPx      = 300.0f;
    Disc.HeightPx     = 300.0f;
    Disc.FinishPreset = PatternStampFinishPreset::PrintedDye;
    Disc.Channels     = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 234u, 236u, 239u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.62f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 0.00f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.25f, { 158u, 162u, 170u, 255u }),
    };
    Disc.Mask = { false, false, PatternStampMaskMode::Noise, 4.0f, 0.45f, 0.25f, 211 };

    Out.Layers          = { Disc };
    Out.SelectedLayerId = Disc.Identity;
}

void PatternStampWorkspaceSession::PopulateStampBotanicalCrestPreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Botanical Foil Seal";
    Out.GroundEnabled        = false;
    Out.ShowGhostTileBorders = false;
    Out.NextIdentitySeed     = 20u;

    PatternStampLayerSpec Rim {};
    Rim.Identity      = 1u;
    Rim.Name          = "Embossed Ring Rim";
    Rim.MotifShape    = PatternStampMotifShape::Ring;
    Rim.FillTint      = { 232u, 194u, 122u, 255u };
    Rim.WidthPx       = 340.0f;
    Rim.HeightPx      = 340.0f;
    Rim.FinishPreset  = PatternStampFinishPreset::MetalInlay;
    Rim.Channels      = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 232u, 194u, 122u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.24f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 1.00f, { 158u, 162u, 170u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.50f, { 158u, 162u, 170u, 255u }),
    };
    PatternStampModifierSpec Wear {};
    Wear.Category           = PatternStampModifierCategory::BevelEdgeWear;
    Wear.ChipWearAmount = 0.28f;
    Rim.Modifiers = { Wear };

    PatternStampLayerSpec Crest {};
    Crest.Identity     = 2u;
    Crest.Name         = "Leaf Crest";
    Crest.MotifShape   = PatternStampMotifShape::FivePetalRosette;
    Crest.FillTint     = { 239u, 244u, 207u, 255u };
    Crest.WidthPx      = 180.0f;
    Crest.HeightPx     = 180.0f;
    Crest.FinishPreset = PatternStampFinishPreset::MetalInlay;
    Crest.Channels     = Rim.Channels;

    Out.Layers          = { Rim, Crest };
    Out.SelectedLayerId = Crest.Identity;
}

void PatternStampWorkspaceSession::PopulateStampPrecisionReticlePreset(PatternStampDocumentSnapshot& Out) noexcept
{
    Out = {};
    Out.DocumentName         = "Precision Cross Reticle";
    Out.GroundEnabled        = false;
    Out.ShowGhostTileBorders = false;
    Out.NextIdentitySeed     = 20u;

    PatternStampLayerSpec Reticle {};
    Reticle.Identity     = 1u;
    Reticle.Name         = "Crosshair Mark";
    Reticle.MotifShape   = PatternStampMotifShape::Cross;
    Reticle.FillTint     = { 239u, 244u, 207u, 255u };
    Reticle.WidthPx      = 240.0f;
    Reticle.HeightPx     = 240.0f;
    Reticle.FinishPreset = PatternStampFinishPreset::PrintedDye;
    Reticle.Channels     = {
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  { 239u, 244u, 207u, 255u }),
        ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.55f, { 158u, 162u, 170u, 255u }),
    };

    Out.Layers          = { Reticle };
    Out.SelectedLayerId = Reticle.Identity;
}

void PatternStampWorkspaceSession::LoadPresetByIndex(std::size_t Index) noexcept
{
    if (PresetDirectory.empty())
    {
        return;
    }
    ActivePresetIndex = Index % PresetDirectory.size();
    UndoSnapshots.clear();
    RedoSnapshots.clear();

    if (Mode == PatternStampWorkspaceMode::Pattern)
    {
        if (ActivePresetIndex == 0u) PopulatePatternHexArrayPreset(Document);
        else if (ActivePresetIndex == 1u) PopulatePatternKenteWeavePreset(Document);
        else PopulatePatternRadialMandalaPreset(Document);
        StatusNotice = "Non-destructive Modifier Stack";
    }
    else
    {
        if (ActivePresetIndex == 0u) PopulateStampSolidCirclePreset(Document);
        else if (ActivePresetIndex == 1u) PopulateStampBotanicalCrestPreset(Document);
        else PopulateStampPrecisionReticlePreset(Document);
        StatusNotice = "Non-destructive Modifier Stack";
    }
    RecomputeSummaryMetrics();
}

const std::vector<PatternStampPresetDescriptor>& PatternStampWorkspaceSession::QueryPresetDirectory() const noexcept
{
    return PresetDirectory;
}

PatternStampLayerSpec* PatternStampWorkspaceSession::FindLayerById(uint32_t Identity) noexcept
{
    for (auto& L : Document.Layers)
    {
        if (L.Identity == Identity)
        {
            return &L;
        }
    }
    return nullptr;
}

const PatternStampLayerSpec* PatternStampWorkspaceSession::FindLayerById(uint32_t Identity) const noexcept
{
    for (const auto& L : Document.Layers)
    {
        if (L.Identity == Identity)
        {
            return &L;
        }
    }
    return nullptr;
}

PatternStampLayerSpec* PatternStampWorkspaceSession::InspectSelectedLayer() noexcept
{
    if (PatternStampLayerSpec* Found = FindLayerById(Document.SelectedLayerId))
    {
        return Found;
    }
    return Document.Layers.empty() ? nullptr : &Document.Layers.back();
}

const PatternStampLayerSpec* PatternStampWorkspaceSession::InspectSelectedLayer() const noexcept
{
    if (const PatternStampLayerSpec* Found = FindLayerById(Document.SelectedLayerId))
    {
        return Found;
    }
    return Document.Layers.empty() ? nullptr : &Document.Layers.back();
}

bool PatternStampWorkspaceSession::QueryEffectiveVisible(uint32_t Identity) const noexcept
{
    uint32_t CurId = Identity;
    for (int Hop = 0; Hop < 8; ++Hop)
    {
        const PatternStampLayerSpec* Cur = FindLayerById(CurId);
        if (Cur == nullptr || !Cur->Visible)
        {
            return false;
        }
        if (Cur->EnclosingFolderId == 0u)
        {
            return true;
        }
        CurId = Cur->EnclosingFolderId;
    }
    return true;
}

uint32_t PatternStampWorkspaceSession::QueryLayerDepth(uint32_t Identity) const noexcept
{
    uint32_t Depth = 0u;
    uint32_t CurId = Identity;
    for (int Hop = 0; Hop < 4; ++Hop)
    {
        const PatternStampLayerSpec* Cur = FindLayerById(CurId);
        if (Cur == nullptr || Cur->EnclosingFolderId == 0u || FindLayerById(Cur->EnclosingFolderId) == nullptr)
        {
            break;
        }
        ++Depth;
        CurId = Cur->EnclosingFolderId;
    }
    return Depth;
}

bool PatternStampWorkspaceSession::QueryUnderCollapsedFolder(uint32_t Identity) const noexcept
{
    uint32_t CurId = Identity;
    for (int Hop = 0; Hop < 8; ++Hop)
    {
        const PatternStampLayerSpec* Cur = FindLayerById(CurId);
        if (Cur == nullptr || Cur->EnclosingFolderId == 0u)
        {
            return false;
        }
        const PatternStampLayerSpec* Folder = FindLayerById(Cur->EnclosingFolderId);
        if (Folder == nullptr)
        {
            return false;
        }
        if (Folder->CollapsedFolder)
        {
            return true;
        }
        CurId = Folder->Identity;
    }
    return false;
}

std::size_t PatternStampWorkspaceSession::CountVisibleLayers() const noexcept
{
    std::size_t Count = 0u;
    for (const auto& L : Document.Layers)
    {
        if (QueryEffectiveVisible(L.Identity))
        {
            ++Count;
        }
    }
    return Count;
}

std::size_t PatternStampWorkspaceSession::CountEnabledModifiers() const noexcept
{
    std::size_t Count = 0u;
    for (const auto& L : Document.Layers)
    {
        for (const auto& M : L.Modifiers)
        {
            if (M.Enabled)
            {
                ++Count;
            }
        }
    }
    return Count;
}

std::size_t PatternStampWorkspaceSession::CountFolderImmediateMembers(uint32_t FolderIdentity) const noexcept
{
    std::size_t Count = 0u;
    for (const auto& L : Document.Layers)
    {
        if (L.EnclosingFolderId == FolderIdentity)
        {
            ++Count;
        }
    }
    return Count;
}

void PatternStampWorkspaceSession::SelectLayer(uint32_t Identity) noexcept
{
    if (FindLayerById(Identity) != nullptr)
    {
        Document.SelectedLayerId = Identity;
    }
}

void PatternStampWorkspaceSession::AddLayer(PatternStampLayerCategory Category) noexcept
{
    if (Document.Layers.size() >= MaxLayerLimit)
    {
        return;
    }
    PushUndoSnapshot();

    PatternStampLayerSpec Next {};
    Next.Identity   = Document.NextIdentitySeed++;
    Next.Category       = Category;
    Next.Visible    = true;
    Next.Opacity    = 1.0f;
    Next.CenterX    = 256.0f;
    Next.CenterY    = 256.0f;
    Next.WidthPx    = 128.0f;
    Next.HeightPx   = 128.0f;
    Next.FillEnabled = true;
    Next.FillTint   = (Mode == PatternStampWorkspaceMode::Pattern)
        ? ColorRgba{ 239u, 244u, 207u, 255u }
        : ColorRgba{ 232u, 194u, 122u, 255u };
    Next.FillTintB  = { 90u, 118u, 146u, 255u };

    if (Category == PatternStampLayerCategory::Typographic)
    {
        Next.Name       = "Decal Typography";
        Next.TextContent = "FRONTIER";
        Next.FontSizePx = 54.0f;
    }
    else if (Category == PatternStampLayerCategory::GradientWash)
    {
        Next.Name       = "Gradient Wash";
        Next.FillSource = PatternStampFillSourceMode::LinearGradient;
        Next.WidthPx    = 512.0f;
        Next.HeightPx   = 512.0f;
    }
    else if (Category == PatternStampLayerCategory::Folder)
    {
        Next.Name       = "Group Folder";
        Next.FillEnabled = false;
    }
    else
    {
        Next.Name       = "Motif Shape";
        Next.MotifShape = PatternStampMotifShape::Circle;
    }

    if (Category != PatternStampLayerCategory::Folder)
    {
        Next.Channels = {
            ConstructChannelEntry(PatternStampSurfaceChannelKey::Albedo,    1.0f,  Next.FillTint),
            ConstructChannelEntry(PatternStampSurfaceChannelKey::Roughness, 0.34f, { 158u, 162u, 170u, 255u }),
            ConstructChannelEntry(PatternStampSurfaceChannelKey::Metalness, 0.12f, { 158u, 162u, 170u, 255u }),
            ConstructChannelEntry(PatternStampSurfaceChannelKey::Height,    0.25f, { 158u, 162u, 170u, 255u }),
        };
        Next.Mask = { false, false, PatternStampMaskMode::Noise, 4.0f, 0.45f, 0.25f, 211 };
    }

    Document.Layers.push_back(std::move(Next));
    Document.SelectedLayerId = Document.Layers.back().Identity;
    RecomputeSummaryMetrics();
}

bool PatternStampWorkspaceSession::DuplicateSelectedLayer() noexcept
{
    const PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr || Document.Layers.size() >= MaxLayerLimit)
    {
        return false;
    }
    PushUndoSnapshot();

    PatternStampLayerSpec Copy = *Sel;
    Copy.Identity         = Document.NextIdentitySeed++;
    Copy.Name             = Sel->Name + " Copy";
    if (Copy.Category != PatternStampLayerCategory::Folder)
    {
        Copy.CenterX = std::min(512.0f, Copy.CenterX + 18.0f);
        Copy.CenterY = std::min(512.0f, Copy.CenterY + 18.0f);
    }

    const uint32_t OriginalId = Sel->Identity;
    auto It = std::find_if(Document.Layers.begin(), Document.Layers.end(), [OriginalId](const PatternStampLayerSpec& L) { return L.Identity == OriginalId; });
    if (It != Document.Layers.end())
    {
        ++It;
    }
    Document.Layers.insert(It, Copy);
    Document.SelectedLayerId = Copy.Identity;
    RecomputeSummaryMetrics();
    return true;
}

bool PatternStampWorkspaceSession::DeleteSelectedLayer() noexcept
{
    if (Document.Layers.size() <= 1u)
    {
        return false;
    }
    const PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr)
    {
        return false;
    }
    PushUndoSnapshot();

    const uint32_t DelId = Sel->Identity;
    for (auto& L : Document.Layers)
    {
        if (L.EnclosingFolderId == DelId)
        {
            L.EnclosingFolderId = 0u;
        }
    }
    Document.Layers.erase(
        std::remove_if(Document.Layers.begin(), Document.Layers.end(), [DelId](const PatternStampLayerSpec& L) { return L.Identity == DelId; }),
        Document.Layers.end());
    Document.SelectedLayerId = Document.Layers.empty() ? 0u : Document.Layers.back().Identity;
    RecomputeSummaryMetrics();
    return true;
}

bool PatternStampWorkspaceSession::MoveLayerStep(uint32_t Identity, int32_t DeltaUpInStack) noexcept
{
    auto It = std::find_if(Document.Layers.begin(), Document.Layers.end(), [Identity](const PatternStampLayerSpec& L) { return L.Identity == Identity; });
    if (It == Document.Layers.end())
    {
        return false;
    }
    const std::ptrdiff_t Idx  = std::distance(Document.Layers.begin(), It);
    const std::ptrdiff_t Next = Idx + (DeltaUpInStack > 0 ? 1 : -1);
    if (Next < 0 || static_cast<std::size_t>(Next) >= Document.Layers.size())
    {
        return false;
    }
    PushUndoSnapshot();
    std::swap(Document.Layers[static_cast<std::size_t>(Idx)], Document.Layers[static_cast<std::size_t>(Next)]);
    RecomputeSummaryMetrics();
    return true;
}

bool PatternStampWorkspaceSession::ReorderLayerRelative(uint32_t SourceId, uint32_t TargetId, bool DropAboveVisual) noexcept
{
    if (SourceId == TargetId)
    {
        return false;
    }
    auto SrcIt = std::find_if(Document.Layers.begin(), Document.Layers.end(), [SourceId](const PatternStampLayerSpec& L) { return L.Identity == SourceId; });
    if (SrcIt == Document.Layers.end())
    {
        return false;
    }
    auto TgtCheck = std::find_if(Document.Layers.begin(), Document.Layers.end(), [TargetId](const PatternStampLayerSpec& L) { return L.Identity == TargetId; });
    if (TgtCheck == Document.Layers.end())
    {
        return false;
    }
    PushUndoSnapshot();

    PatternStampLayerSpec Moved = *SrcIt;
    Document.Layers.erase(SrcIt);
    auto TgtIt = std::find_if(Document.Layers.begin(), Document.Layers.end(), [TargetId](const PatternStampLayerSpec& L) { return L.Identity == TargetId; });
    if (TgtIt == Document.Layers.end())
    {
        Document.Layers.push_back(std::move(Moved));
    }
    else
    {
        if (DropAboveVisual)
        {
            ++TgtIt;
        }
        Document.Layers.insert(TgtIt, std::move(Moved));
    }
    RecomputeSummaryMetrics();
    return true;
}

void PatternStampWorkspaceSession::ToggleLayerVisible(uint32_t Identity) noexcept
{
    if (PatternStampLayerSpec* L = FindLayerById(Identity))
    {
        PushUndoSnapshot();
        L->Visible = !L->Visible;
        RecomputeSummaryMetrics();
    }
}

void PatternStampWorkspaceSession::ToggleLayerLocked(uint32_t Identity) noexcept
{
    if (PatternStampLayerSpec* L = FindLayerById(Identity))
    {
        L->Locked = !L->Locked;
    }
}

void PatternStampWorkspaceSession::ToggleLayerExpandedDrawer(uint32_t Identity) noexcept
{
    if (PatternStampLayerSpec* L = FindLayerById(Identity))
    {
        L->ExpandedInStack = !L->ExpandedInStack;
    }
}

void PatternStampWorkspaceSession::ToggleFolderCollapsed(uint32_t Identity) noexcept
{
    if (PatternStampLayerSpec* L = FindLayerById(Identity))
    {
        if (L->Category == PatternStampLayerCategory::Folder)
        {
            L->CollapsedFolder = !L->CollapsedFolder;
        }
    }
}

void PatternStampWorkspaceSession::ToggleSelectedLayerMask() noexcept
{
    if (PatternStampLayerSpec* Sel = InspectSelectedLayer())
    {
        if (Sel->Category != PatternStampLayerCategory::Folder)
        {
            PushUndoSnapshot();
            Sel->Mask.Enabled = !Sel->Mask.Enabled;
            RecomputeSummaryMetrics();
        }
    }
}

std::vector<PatternStampSurfaceChannelKey> PatternStampWorkspaceSession::QueryAvailableChannelsForSelectedLayer() const noexcept
{
    std::vector<PatternStampSurfaceChannelKey> Avail;
    const PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr || Sel->Category == PatternStampLayerCategory::Folder)
    {
        return Avail;
    }
    for (const auto& Desc : InspectChannelDescriptors())
    {
        const bool Present = std::any_of(Sel->Channels.begin(), Sel->Channels.end(), [&Desc](const PatternStampSurfaceChannelEntry& B) { return B.Key == Desc.Key; });
        if (!Present)
        {
            Avail.push_back(Desc.Key);
        }
    }
    return Avail;
}

bool PatternStampWorkspaceSession::AddChannelToSelectedLayer(PatternStampSurfaceChannelKey ChannelKey) noexcept
{
    PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr || Sel->Category == PatternStampLayerCategory::Folder)
    {
        return false;
    }
    const bool Exists = std::any_of(Sel->Channels.begin(), Sel->Channels.end(), [ChannelKey](const PatternStampSurfaceChannelEntry& B) { return B.Key == ChannelKey; });
    if (Exists)
    {
        return false;
    }
    PushUndoSnapshot();
    const auto& Desc = QueryChannelDescriptor(ChannelKey);
    Sel->Channels.push_back(ConstructChannelEntry(ChannelKey, Desc.DefaultScalar, Desc.DefaultTint));
    return true;
}

bool PatternStampWorkspaceSession::RemoveChannelFromSelectedLayer(PatternStampSurfaceChannelKey ChannelKey) noexcept
{
    PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr)
    {
        return false;
    }
    const std::size_t Before = Sel->Channels.size();
    PushUndoSnapshot();
    Sel->Channels.erase(
        std::remove_if(Sel->Channels.begin(), Sel->Channels.end(), [ChannelKey](const PatternStampSurfaceChannelEntry& B) { return B.Key == ChannelKey; }),
        Sel->Channels.end());
    return Sel->Channels.size() != Before;
}

PatternStampSurfaceChannelEntry* PatternStampWorkspaceSession::FindChannelEntry(PatternStampLayerSpec& Layer, PatternStampSurfaceChannelKey ChannelKey) noexcept
{
    for (auto& C : Layer.Channels)
    {
        if (C.Key == ChannelKey)
        {
            return &C;
        }
    }
    return nullptr;
}

void PatternStampWorkspaceSession::ApplyFinishPresetToSelectedLayer(PatternStampFinishPreset Preset) noexcept
{
    PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr)
    {
        return;
    }
    PushUndoSnapshot();
    Sel->FinishPreset = Preset;
    struct FinishTriplet { float R; float M; float H; };
    static constexpr std::array<FinishTriplet, 6> Presets {{
        { 0.62f, 0.00f, 0.02f }, // Printed Dye
        { 0.84f, 0.00f, 0.14f }, // Woven Cotton
        { 0.94f, 0.00f, 0.55f }, // Cut-Pile Wool
        { 0.18f, 0.00f, 0.24f }, // Glazed Ceramic
        { 0.24f, 1.00f, 0.10f }, // Metal Inlay
        { 0.78f, 0.00f, 0.36f }, // Embossed Rubber
    }};
    const std::size_t Idx = static_cast<std::size_t>(Preset);
    if (Idx < Presets.size())
    {
        if (auto* R = FindChannelEntry(*Sel, PatternStampSurfaceChannelKey::Roughness)) R->ScalarReading = Presets[Idx].R;
        if (auto* M = FindChannelEntry(*Sel, PatternStampSurfaceChannelKey::Metalness)) M->ScalarReading = Presets[Idx].M;
        if (auto* H = FindChannelEntry(*Sel, PatternStampSurfaceChannelKey::Height))    H->ScalarReading = Presets[Idx].H;
    }
}

bool PatternStampWorkspaceSession::AddModifierToSelectedLayer(PatternStampModifierCategory Category) noexcept
{
    PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr)
    {
        return false;
    }
    PushUndoSnapshot();
    PatternStampModifierSpec Spec {};
    Spec.Category = Category;
    Sel->Modifiers.push_back(Spec);
    RecomputeSummaryMetrics();
    return true;
}

bool PatternStampWorkspaceSession::RemoveModifierFromSelectedLayer(std::size_t ModifierIndex) noexcept
{
    PatternStampLayerSpec* Sel = InspectSelectedLayer();
    if (Sel == nullptr || ModifierIndex >= Sel->Modifiers.size())
    {
        return false;
    }
    PushUndoSnapshot();
    Sel->Modifiers.erase(Sel->Modifiers.begin() + static_cast<std::ptrdiff_t>(ModifierIndex));
    RecomputeSummaryMetrics();
    return true;
}

void PatternStampWorkspaceSession::AssignResolution(uint32_t TargetResolutionPx) noexcept
{
    ResolutionPx = std::clamp(TargetResolutionPx, 64u, 4096u);
    StatusNotice = "Resolution set to " + std::to_string(ResolutionPx) + " x " + std::to_string(ResolutionPx) + "px";
}

void PatternStampWorkspaceSession::PushUndoSnapshot() noexcept
{
    UndoSnapshots.push_back(Document);
    if (UndoSnapshots.size() > MaxUndoDepth)
    {
        UndoSnapshots.erase(UndoSnapshots.begin());
    }
    RedoSnapshots.clear();
}

bool PatternStampWorkspaceSession::ApplyUndo() noexcept
{
    if (UndoSnapshots.empty())
    {
        return false;
    }
    RedoSnapshots.push_back(Document);
    Document = std::move(UndoSnapshots.back());
    UndoSnapshots.pop_back();
    RecomputeSummaryMetrics();
    return true;
}

bool PatternStampWorkspaceSession::ApplyRedo() noexcept
{
    if (RedoSnapshots.empty())
    {
        return false;
    }
    UndoSnapshots.push_back(Document);
    Document = std::move(RedoSnapshots.back());
    RedoSnapshots.pop_back();
    RecomputeSummaryMetrics();
    return true;
}

void PatternStampWorkspaceSession::RecomputeSummaryMetrics() noexcept
{
    int32_t TotalInstances = 0;
    float   MinS           = 1.0f;
    float   MaxS           = 1.0f;
    bool    FoundNoise     = false;
    float   AreaSum        = 0.0f;

    for (const auto& L : Document.Layers)
    {
        if (!QueryEffectiveVisible(L.Identity) || L.Category == PatternStampLayerCategory::Folder)
        {
            continue;
        }
        int32_t LayerCopies = 1;
        for (const auto& M : L.Modifiers)
        {
            if (!M.Enabled)
            {
                continue;
            }
            if (M.Category == PatternStampModifierCategory::GridArray)
            {
                LayerCopies *= std::max(1, M.Columns) * std::max(1, M.Rows);
            }
            else if (M.Category == PatternStampModifierCategory::RadialArray)
            {
                LayerCopies *= std::max(1, M.RadialCount) * std::max(1, M.Rings);
            }
            else if (M.Category == PatternStampModifierCategory::NoiseScale)
            {
                MinS       = FoundNoise ? std::min(MinS, M.MinScale) : M.MinScale;
                MaxS       = FoundNoise ? std::max(MaxS, M.MaxScale) : M.MaxScale;
                FoundNoise = true;
            }
        }
        TotalInstances += LayerCopies;

        const float W = std::max(1.0f, L.WidthPx);
        const float H = std::max(1.0f, L.HeightPx);
        float SingleArea = W * H;
        if (L.MotifShape == PatternStampMotifShape::Circle || L.MotifShape == PatternStampMotifShape::Ring)
        {
            SingleArea *= 0.785398f;
        }
        else if (L.MotifShape == PatternStampMotifShape::Hexagon)
        {
            SingleArea *= 0.6495f;
        }
        AreaSum += SingleArea * static_cast<float>(LayerCopies);
    }

    InstancesEvaluated = std::max(0, TotalInstances);
    MinScaleReading    = MinS;
    MaxScaleReading    = MaxS;
    if (Document.GroundEnabled)
    {
        SurfaceFractionPct = 100;
    }
    else
    {
        const float TileArea = 512.0f * 512.0f;
        SurfaceFractionPct   = std::clamp(static_cast<int32_t>(std::lround((AreaSum / TileArea) * 100.0f)), 0, 100);
    }
}

} // namespace Frontier::Workspaces
