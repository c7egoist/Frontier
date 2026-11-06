/*==========================================================================================================================================
                                                         FLUIDEDITORWORKSPACE.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ Interactive Fluid Editor ("Fluid — Frontier Experimental"), ported chrome-for-chrome and control-for-control
//    from Experimental/Fluid/{index.html, src/FluidPanel.js, src/FluidPanel.css, src/ThemeSpecification.css}.

#include "Frontier/Engine/Editor/FluidEditorWorkspace.h"
#include "Frontier/Engine/Rendering/PngImageCodec.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <initializer_list>
#include <sstream>

namespace Frontier::FluidEditor
{

namespace
{

namespace Typo = Frontier::Typography;

//----------------------------------------------------------------------------------------------------------------------
//                                              STYLESHEET PALETTE & METRICS
//----------------------------------------------------------------------------------------------------------------------

constexpr ImU32 PageFill       = IM_COL32( 11,  11,  11, 255);   // --bg #0b0b0b
constexpr ImU32 PanelFill      = IM_COL32( 18,  18,  18, 255);   // --panel #121212
constexpr ImU32 CardFill       = IM_COL32( 26,  26,  26, 255);   // --card #1a1a1a
constexpr ImU32 HeaderFill     = IM_COL32( 36,  36,  36, 255);   // .app-header #242424
constexpr ImU32 HeaderEdge     = IM_COL32( 56,  56,  56, 255);   // #383838
constexpr ImU32 DocFill        = IM_COL32( 29,  29,  29, 255);   // .document-bar #1d1d1d
constexpr ImU32 CentreFill     = IM_COL32( 25,  25,  25, 255);   // .center-panel #191919
constexpr ImU32 BarFill        = IM_COL32( 39,  39,  39, 255);   // .viewport-bar #272727
constexpr ImU32 CanvasFill      = IM_COL32( 28,  28,  28, 255);   // .viewport #1c1c1c
constexpr ImU32 MoveFill       = IM_COL32( 38,  38,  38, 255);   // .transport #262626
constexpr ImU32 TimeFill       = IM_COL32( 31,  31,  31, 255);   // .timeline #1f1f1f
constexpr ImU32 LineRule       = IM_COL32(255, 255, 255,  18);   // rgba(255,255,255,.07)
constexpr ImU32 GroupEdge      = IM_COL32( 56,  56,  56, 255);   // #383838
constexpr ImU32 StatusEdge     = IM_COL32( 60,  60,  60, 255);   // #3c3c3c

constexpr ImU32 PageInk        = IM_COL32(240, 240, 240, 255);   // --text #f0f0f0
constexpr ImU32 StrongInk      = IM_COL32(198, 198, 198, 255);   // #c6c6c6
constexpr ImU32 HeadInk        = IM_COL32(188, 188, 188, 255);   // #bcbcbc
constexpr ImU32 BodyInk        = IM_COL32(171, 171, 171, 255);   // #ababab
constexpr ImU32 LabelInk       = IM_COL32(159, 159, 159, 255);   // #9f9f9f
constexpr ImU32 QuietInk       = IM_COL32(136, 136, 136, 255);   // --muted #888888
constexpr ImU32 FaintInk       = IM_COL32(111, 111, 111, 255);   // #6f6f6f
constexpr ImU32 BadgeInk       = IM_COL32(122, 122, 122, 255);   // #7a7a7a
constexpr ImU32 LiveInk        = IM_COL32( 52, 199,  89, 255);   // --green #34c759
constexpr ImU32 AmberInk       = IM_COL32(255, 180,  84, 255);   // #ffb454
constexpr ImU32 AzureInk       = IM_COL32( 90, 169, 255, 255);   // #5aa9ff
constexpr ImU32 PaleInk        = IM_COL32(223, 230, 245, 255);   // #dfe6f5

constexpr ImU32 ControlFill    = IM_COL32( 51,  51,  51, 255);   // #333333
constexpr ImU32 ControlHover   = IM_COL32( 64,  64,  64, 255);   // hover
constexpr ImU32 ControlEdge    = IM_COL32( 72,  72,  72, 255);   // #484848
constexpr ImU32 FieldFill      = IM_COL32( 28,  28,  28, 255);   // #1c1c1c
constexpr ImU32 FieldEdge      = IM_COL32( 59,  59,  59, 255);   // #3b3b3b
constexpr ImU32 ChosenFill     = IM_COL32( 49,  49,  49, 255);   // #313131
constexpr ImU32 ChosenEdge     = IM_COL32( 88,  88,  88, 255);   // #585858
constexpr ImU32 RowChosen      = IM_COL32( 50,  50,  50, 255);   // #323232
constexpr ImU32 RowEdge        = IM_COL32( 69,  69,  69, 255);   // #454545
constexpr ImU32 CardEdge       = IM_COL32( 57,  57,  57, 255);   // #393939
constexpr ImU32 CardBack       = IM_COL32( 40,  40,  40, 255);   // #282828
constexpr ImU32 CardLive       = IM_COL32( 48,  48,  48, 255);   // #303030
constexpr ImU32 CardLiveEdge   = IM_COL32(114, 114, 114, 255);   // #727272
constexpr ImU32 SwatchFill     = IM_COL32( 48,  48,  48, 255);   // #303030
constexpr ImU32 SwatchEdge     = IM_COL32( 83,  83,  83, 255);   // #535353
constexpr ImU32 TrackFill      = IM_COL32( 66,  66,  66, 255);   // #424242
constexpr ImU32 TrackRun       = IM_COL32(139, 139, 139, 255);   // #8b8b8b
constexpr ImU32 ThumbFill      = IM_COL32(175, 175, 175, 255);   // #afafaf
constexpr ImU32 SwitchOff      = IM_COL32( 76,  76,  76, 255);   // #4c4c4c
constexpr ImU32 SwitchOn       = IM_COL32(131, 131, 131, 255);   // #838383
constexpr ImU32 KnobOff        = IM_COL32(164, 164, 164, 255);   // #a4a4a4
constexpr ImU32 KnobOn         = IM_COL32(228, 228, 228, 255);   // #e4e4e4
constexpr ImU32 BoundsInk      = IM_COL32(255, 255, 255,  68);   // domain wireframe
constexpr ImU32 LatticeInk     = IM_COL32(255, 255, 255,  24);   // lattice lines
constexpr ImU32 PlayheadInk    = IM_COL32(226, 226, 226, 255);

constexpr float HeaderHeight   = 54.0f;
constexpr float DocBarHeight   = 36.0f;
constexpr float ViewBarHeight  = 41.0f;
constexpr float TransportHeight= 48.0f;
constexpr float TimelineHeight = 88.0f;
constexpr float StatusHeight   = 26.0f;
constexpr float SwitchWide     = 26.0f;
constexpr float SwitchTall     = 14.0f;

struct SampleSceneEntry
{
    const char* Label    = "";
    const char* FileName = "";
};

constexpr SampleSceneEntry BuiltInSamples[] = {
    { "Camp fire",           "Experimental/Fluid/Samples/camp-fire.gasscene.toml"           },
    { "Cold dust fall",      "Experimental/Fluid/Samples/cold-dust-fall.gasscene.toml"      },
    { "Deflector obstacle",  "Experimental/Fluid/Samples/deflector-obstacle.gasscene.toml"  },
    { "Far cheap plume",     "Experimental/Fluid/Samples/far-cheap-plume.gasscene.toml"     },
    { "Fracture dust burst", "Experimental/Fluid/Samples/fracture-dust-burst.gasscene.toml" },
    { "Hero detonation",     "Experimental/Fluid/Samples/hero-detonation.gasscene.toml"     },
    { "Open-bounds megaton", "Experimental/Fluid/Samples/open-bounds-megaton.gasscene.toml" },
    { "Tyre burnout ring",   "Experimental/Fluid/Samples/tyre-burnout-ring.gasscene.toml"   },
};

struct BurstPatternOption
{
    const char* Key   = "single";
    const char* Label = "Single";
};

constexpr BurstPatternOption BurstPatterns[] = {
    { "single",   "Single"   },
    { "salvo",    "Salvo"    },
    { "collide",  "Collide"  },
    { "mushroom", "Mushroom" },
    { "shrapnel", "Shrapnel" },
};

//----------------------------------------------------------------------------------------------------------------------
//                                              INSPECTOR GROUP LISTINGS
//----------------------------------------------------------------------------------------------------------------------

constexpr uint32_t GroupKeyCeiling = 8u;
constexpr uint32_t GroupCeiling    = 8u;

struct PropertyGroupSpec
{
    const char* Title                    = "";
    const char* Badge                    = "";
    const char* Hint                     = "";
    const char* Keys[GroupKeyCeiling]    = {};
    uint32_t    KeyCount                 = 0u;
};

struct GroupSheet
{
    PropertyGroupSpec Groups[GroupCeiling] = {};
    uint32_t          Count                = 0u;
};

void PushGroup(GroupSheet& Sheet, const char* Title, const char* Badge, const char* Hint,
               std::initializer_list<const char*> Keys) noexcept
{
    if (Sheet.Count >= GroupCeiling)
        return;
    PropertyGroupSpec& Group = Sheet.Groups[Sheet.Count++];
    Group.Title              = Title;
    Group.Badge              = Badge;
    Group.Hint               = Hint;
    for (const char* Key : Keys)
    {
        if (Group.KeyCount >= GroupKeyCeiling)
            break;
        Group.Keys[Group.KeyCount++] = Key;
    }
}

GroupSheet BuildInspectorSheet(InspectorTab Tab, SceneRole Role) noexcept
{
    GroupSheet Sheet{};
    if (Tab == InspectorTab::Source)
    {
        if (Role == SceneRole::Collider)
        {
            PushGroup(Sheet, "Collider", "SDF",
                      "Position is normalised within the domain. The collider shapes simulated flow live.",
                      { "obstacleType", "obstacleX", "obstacleY", "obstacleZ", "obstacleRadius",
                        "colliderAutoMove", "colliderSpeed" });
        }
        else
        {
            PushGroup(Sheet, "Source discharge", "SOURCE",
                      "Continuous source at the domain X/Z centre. Height and radius update live.",
                      { "emitterEnabled", "emitterRate", "emitterRadius", "emitterHeight" });
            PushGroup(Sheet, "Fuel & temperature", "INJECTION", "",
                      { "emitterTemperature", "emitterFuel", "emitterSmoke" });
            PushGroup(Sheet, "Velocity", "FLOW", "",
                      { "emitterUpwardVelocity", "emitterSwirl" });
        }
        PushGroup(Sheet, "Burst generator", "IMPULSE", "",
                  { "shrapnelEnabled", "blastStrength", "blastRadius", "blastTemperature", "blastFuel",
                    "blastSmoke", "blastLobes" });
        if (Role != SceneRole::Collider)
        {
            PushGroup(Sheet, "Collider", "SDF", "",
                      { "obstacleType", "obstacleX", "obstacleY", "obstacleZ", "obstacleRadius",
                        "colliderAutoMove", "colliderSpeed" });
        }
        return Sheet;
    }

    if (Tab == InspectorTab::Simulation)
    {
        PushGroup(Sheet, "Domain", "3D", "",
                  { "boundsWidth", "boundsHeight", "dynamicBounds", "dynamicBoundsMax" });
        PushGroup(Sheet, "Voxel lattice", "SOLVER",
                  "Changing voxel resolution rebuilds the lattice. Other properties update live.",
                  { "gridResolution", "pressureIterations", "macCormackAdvection", "enclosedBox", "timeScale" });
        PushGroup(Sheet, "Forces & turbulence", "FLOW", "",
                  { "vorticityConfinement", "buoyancy", "smokeWeight", "turbulenceStrength", "turbulenceScale",
                    "windX", "windZ", "velocityDamping" });
        PushGroup(Sheet, "Combustion", "THERMAL", "",
                  { "burnRate", "burnHeat", "sootGeneration", "combustionExpansion", "coolingRate",
                    "smokeDissipation" });
        return Sheet;
    }

    if (Role == SceneRole::Sun)
    {
        PushGroup(Sheet, "Directional light", "LIGHT", "",
                  { "sunIntensity", "sunAzimuth", "sunElevation", "ambientIntensity" });
    }
    PushGroup(Sheet, "Volume shading", "VOLUME", "",
              { "colorPalette", "fireIntensity", "densityExtinction", "smokeAlbedo", "exposure" });
    if (Role != SceneRole::Sun)
    {
        PushGroup(Sheet, "Directional light", "LIGHT", "",
                  { "sunIntensity", "sunAzimuth", "sunElevation", "ambientIntensity" });
    }
    PushGroup(Sheet, "Scattering & glow", "OPTICS", "",
              { "bloomIntensity", "godRaysIntensity", "shockwaveStrength", "temperatureScale",
                "internalScattering", "shadowDensity", "phaseAnisotropy" });
    PushGroup(Sheet, "Render quality", "GPU", "",
              { "raymarchSteps", "shadowSteps", "renderScale", "autoGpuGovernor", "voxelQuantization" });
    PushGroup(Sheet, "Embers & ash", "PARTICLES", "",
              { "showEmbers", "emberCount", "emberSize", "emberIntensity", "emberLifetime", "emberAshiness" });
    return Sheet;
}

//----------------------------------------------------------------------------------------------------------------------
//                                                  DRAWING PRIMITIVES
//----------------------------------------------------------------------------------------------------------------------

void DrawPlate(ImDrawList* Draw, const PaneRect& Box, ImU32 Fill, ImU32 Edge, float Rounding = 5.0f) noexcept
{
    Draw->AddRectFilled({ Box.MinX, Box.MinY }, { Box.MaxX, Box.MaxY }, Fill, Rounding);
    if (Edge != 0u)
        Draw->AddRect({ Box.MinX, Box.MinY }, { Box.MaxX, Box.MaxY }, Edge, Rounding, 0, 1.0f);
}

void DrawDiamond(ImDrawList* Draw, ImVec2 Centre, float Radius, ImU32 Colour) noexcept
{
    Draw->AddQuadFilled({ Centre.x, Centre.y - Radius }, { Centre.x + Radius, Centre.y },
                        { Centre.x, Centre.y + Radius }, { Centre.x - Radius, Centre.y }, Colour);
}

void DrawChevron(ImDrawList* Draw, ImVec2 Centre, float Reach, ImU32 Colour, bool Down) noexcept
{
    if (Down)
    {
        Draw->AddLine({ Centre.x - Reach, Centre.y - Reach * 0.45f }, { Centre.x, Centre.y + Reach * 0.55f }, Colour, 1.3f);
        Draw->AddLine({ Centre.x, Centre.y + Reach * 0.55f }, { Centre.x + Reach, Centre.y - Reach * 0.45f }, Colour, 1.3f);
    }
    else
    {
        Draw->AddLine({ Centre.x - Reach * 0.45f, Centre.y - Reach }, { Centre.x + Reach * 0.55f, Centre.y }, Colour, 1.3f);
        Draw->AddLine({ Centre.x + Reach * 0.55f, Centre.y }, { Centre.x - Reach * 0.45f, Centre.y + Reach }, Colour, 1.3f);
    }
}

void DrawSwitchPill(ImDrawList* Draw, ImVec2 TopLeft, bool Enabled) noexcept
{
    Draw->AddRectFilled(TopLeft, { TopLeft.x + SwitchWide, TopLeft.y + SwitchTall },
                        Enabled ? SwitchOn : SwitchOff, SwitchTall * 0.5f);
    const float KnobX = Enabled ? (TopLeft.x + SwitchWide - 11.0f) : (TopLeft.x + 3.0f);
    Draw->AddCircleFilled({ KnobX + 4.0f, TopLeft.y + SwitchTall * 0.5f }, 4.2f, Enabled ? KnobOn : KnobOff, 14);
}

bool ClickedInRect(const PaneRect& Box, bool BlockWhenPopupOpen, const std::string& OpenPopupId) noexcept
{
    if (BlockWhenPopupOpen && !OpenPopupId.empty())
        return false;
    const ImGuiIO& Io = ImGui::GetIO();
    return ImGui::IsMouseClicked(ImGuiMouseButton_Left) && Box.Contains(Io.MousePos);
}

bool HoveredRect(const PaneRect& Box, bool BlockWhenPopupOpen, const std::string& OpenPopupId) noexcept
{
    if (BlockWhenPopupOpen && !OpenPopupId.empty())
        return false;
    return Box.Contains(ImGui::GetIO().MousePos);
}

bool DrawInteractiveButton(ImDrawList* Draw, ImFont* Face, const PaneRect& Box, float CssPx,
                           const char* Label, bool Active, const std::string& OpenPopupId) noexcept
{
    const bool Hovered = HoveredRect(Box, true, OpenPopupId);
    const ImU32 Fill   = Active ? ChosenFill : (Hovered ? ControlHover : ControlFill);
    const ImU32 Edge   = Active ? ChosenEdge : ControlEdge;
    DrawPlate(Draw, Box, Fill, Edge, 5.0f);
    Typo::DrawBoxText(Draw, Face, Box.MinX + Box.Width() * 0.5f, Box.MinY, Box.Height(), CssPx,
                      Active ? PageInk : StrongInk, Label, Typo::TextAnchor::Middle);
    return ClickedInRect(Box, true, OpenPopupId);
}

bool DrawSelectBox(ImDrawList* Draw, ImFont* Face, const PaneRect& Box, float CssPx,
                   const char* CurrentLabel, const std::string& OpenPopupId) noexcept
{
    const bool Hovered = HoveredRect(Box, true, OpenPopupId);
    DrawPlate(Draw, Box, Hovered ? ControlHover : FieldFill, FieldEdge, 5.0f);
    Typo::DrawBoxText(Draw, Face, Box.MinX + 9.0f, Box.MinY, Box.Height(), CssPx, StrongInk, CurrentLabel);
    DrawChevron(Draw, { Box.MaxX - 11.0f, Box.MinY + Box.Height() * 0.5f }, 3.5f, QuietInk, true);
    return ClickedInRect(Box, true, OpenPopupId);
}

void FormatReading(float Reading, float Step, char* Out, size_t Room) noexcept
{
    const bool Whole  = Step >= 1.0f && Step == static_cast<float>(static_cast<int>(Step));
    const int  Places = Whole ? 0 : (Step < 0.01f ? 3 : 2);
    std::snprintf(Out, Room, "%.*f", Places, static_cast<double>(Reading));
}

void FormatTimecode(float Seconds, char* Out, size_t Room) noexcept
{
    const float Clamped = std::max(0.0f, Seconds);
    const int Whole     = static_cast<int>(Clamped);
    const int Millis    = std::min(999, static_cast<int>((Clamped - static_cast<float>(Whole)) * 1000.0f + 0.5f));
    std::snprintf(Out, Room, "%02d:%02d.%03d", (Whole / 60) % 100, Whole % 60, Millis);
}

void FormatVoxelCount(int32_t Res, char* Out, size_t Room) noexcept
{
    const long long Total = static_cast<long long>(Res) * Res * Res;
    char Plain[24];
    std::snprintf(Plain, sizeof(Plain), "%lld", Total);
    const int Len = static_cast<int>(std::strlen(Plain));
    char Grouped[32];
    size_t Write = 0u;
    for (int Idx = 0; Idx < Len && Write + 2u < sizeof(Grouped); ++Idx)
    {
        if (Idx > 0 && (Len - Idx) % 3 == 0)
            Grouped[Write++] = ',';
        Grouped[Write++] = Plain[Idx];
    }
    Grouped[Write] = '\0';
    std::snprintf(Out, Room, "%s voxels", Grouped);
}

const char* RoleCaption(SceneRole Role) noexcept
{
    switch (Role)
    {
        case SceneRole::Domain:   return "EULERIAN VOLUME";
        case SceneRole::Source:   return "CONTINUOUS SOURCE";
        case SceneRole::Collider: return "SIGNED DISTANCE COLLIDER";
        default:                  return "DIRECTIONAL LIGHT";
    }
}

const char* CameraPresetLabel(CameraViewPreset View) noexcept
{
    switch (View)
    {
        case CameraViewPreset::Front: return "Front";
        case CameraViewPreset::Side:  return "Side";
        case CameraViewPreset::Top:   return "Top";
        default:                      return "Perspective";
    }
}

const char* PresetFilterKey(PresetCategoryFilter Filter) noexcept
{
    switch (Filter)
    {
        case PresetCategoryFilter::Fire:  return "fire";
        case PresetCategoryFilter::Smoke: return "smoke";
        case PresetCategoryFilter::Blast: return "blast";
        default:                          return "all";
    }
}

void PaintPresetGlyph(ImDrawList* Draw, const ImVec2& Centre, const char* Glyph) noexcept
{
    if (std::strcmp(Glyph, "flame") == 0)
    {
        Draw->AddTriangleFilled({ Centre.x, Centre.y - 8.5f }, { Centre.x + 6.0f, Centre.y + 7.0f },
                                { Centre.x - 6.0f, Centre.y + 7.0f }, AmberInk);
        Draw->AddTriangleFilled({ Centre.x, Centre.y - 1.0f }, { Centre.x + 3.0f, Centre.y + 7.0f },
                                { Centre.x - 3.0f, Centre.y + 7.0f }, SwatchFill);
    }
    else if (std::strcmp(Glyph, "burst") == 0)
    {
        for (int Spoke = 0; Spoke < 8; ++Spoke)
        {
            const float Angle = static_cast<float>(Spoke) * (Typo::PiConstant * 0.25f);
            Draw->AddLine({ Centre.x + std::cos(Angle) * 2.5f, Centre.y + std::sin(Angle) * 2.5f },
                          { Centre.x + std::cos(Angle) * 8.5f, Centre.y + std::sin(Angle) * 8.5f }, AmberInk, 1.2f);
        }
    }
    else if (std::strcmp(Glyph, "rotate") == 0 || std::strcmp(Glyph, "orbit") == 0)
    {
        Draw->AddCircle(Centre, 7.5f, AzureInk, 24, 1.2f);
        Draw->AddCircleFilled({ Centre.x + 7.5f, Centre.y }, 2.2f, AzureInk, 12);
    }
    else if (std::strcmp(Glyph, "box") == 0 || std::strcmp(Glyph, "cylinder") == 0 || std::strcmp(Glyph, "wall") == 0)
    {
        Draw->AddRect({ Centre.x - 6.5f, Centre.y - 6.5f }, { Centre.x + 6.5f, Centre.y + 6.5f }, PaleInk, 2.0f, 0, 1.2f);
    }
    else
    {
        Draw->AddCircleFilled({ Centre.x - 3.5f, Centre.y + 1.5f }, 4.5f, BodyInk, 16);
        Draw->AddCircleFilled({ Centre.x + 3.0f, Centre.y + 0.5f }, 5.2f, BodyInk, 16);
    }
}

} // namespace

//----------------------------------------------------------------------------------------------------------------------
//                                             CONSTRUCTION & STATE SYNC
//----------------------------------------------------------------------------------------------------------------------

FluidEditorWorkspace::FluidEditorWorkspace()
{
    FluidDocumentTab Initial{};
    Initial.Title          = "Pyro plume";
    Initial.PresetIdentity = "ue5_pyro_default";
    Initial.Settings       = ConstructPresetSettings("ue5_pyro_default");
    Initial.SavedBaseline  = Initial.Settings;
    Initial.Camera.Reset();
    InitializeDefaultRows(Initial, Initial.Settings);
    Documents.push_back(std::move(Initial));
}

void FluidEditorWorkspace::BindFonts(ImFont* LightFont, ImFont* RegularFont) noexcept
{
    LightFace   = LightFont;
    RegularFace = RegularFont;
}

void FluidEditorWorkspace::InitializeDefaultRows(FluidDocumentTab& Doc, const GasSettings& Settings)
{
    char ResBadge[16];
    std::snprintf(ResBadge, sizeof(ResBadge), "%d\xc2\xb3", Settings.LatticeResolution);
    Doc.Rows.clear();
    Doc.Rows.push_back({ "Gas domain", SceneRole::Domain, true, ResBadge });
    Doc.Rows.push_back({ Settings.EmitterFuel > 0.05f ? "Fire source" : "Smoke source",
                         SceneRole::Source, Settings.EmitterEnabled, "" });
    Doc.Rows.push_back({ "Collider", SceneRole::Collider, Settings.ObstacleType != 0, "" });
    Doc.Rows.push_back({ "Directional light", SceneRole::Sun, Settings.SunIntensity > 0.01f, "Sun" });
    Doc.SelectedRow = 0u;
}

void FluidEditorWorkspace::SyncRowsToSettings(FluidDocumentTab& Doc)
{
    const GasSettings& S = BoundExternalSettings ? *BoundExternalSettings : Doc.Settings;
    for (OutlinerRow& Row : Doc.Rows)
    {
        if (Row.Role == SceneRole::Domain)
        {
            char ResBadge[16];
            std::snprintf(ResBadge, sizeof(ResBadge), "%d\xc2\xb3", S.LatticeResolution);
            Row.Badge = ResBadge;
        }
        else if (Row.Role == SceneRole::Source)
        {
            Row.Enabled = S.EmitterEnabled;
        }
        else if (Row.Role == SceneRole::Collider)
        {
            Row.Enabled = (S.ObstacleType != 0);
        }
        else if (Row.Role == SceneRole::Sun)
        {
            Row.Enabled = (S.SunIntensity > 0.01f);
        }
    }
}

PyroVolumeSolver& FluidEditorWorkspace::ResolveSolver(PyroVolumeSolver& FallbackSolver) noexcept
{
    return BoundExternalSolver ? *BoundExternalSolver : FallbackSolver;
}

const GasSettings& FluidEditorWorkspace::QueryActiveSettings() const noexcept
{
    if (BoundExternalSettings)
        return *BoundExternalSettings;
    return Documents[ActiveDocIndex].Settings;
}

GasSettings& FluidEditorWorkspace::AccessActiveSettings() noexcept
{
    if (BoundExternalSettings)
        return *BoundExternalSettings;
    return Documents[ActiveDocIndex].Settings;
}

const PyroOrbitCamera& FluidEditorWorkspace::QueryActiveCamera() const noexcept
{
    return Documents[ActiveDocIndex].Camera;
}

PyroOrbitCamera& FluidEditorWorkspace::AccessActiveCamera() noexcept
{
    return Documents[ActiveDocIndex].Camera;
}

bool FluidEditorWorkspace::ConsumeReturnToSceneRequest() noexcept
{
    const bool Requested   = ReturnToSceneRequested;
    ReturnToSceneRequested = false;
    return Requested;
}

void FluidEditorWorkspace::OpenForExternalDomain(const std::string& PlumeName, const std::string& PresetId,
                                                 GasSettings* ExternalSettings, PyroVolumeSolver* ExternalSolver)
{
    BoundExternalSettings = ExternalSettings;
    BoundExternalSolver   = ExternalSolver;
    if (Documents.empty())
        Documents.emplace_back();

    FluidDocumentTab& Doc  = Documents[0];
    ActiveDocIndex         = 0u;
    Doc.Title              = PlumeName;
    Doc.PresetIdentity     = PresetId.empty() ? "ue5_pyro_default" : PresetId;
    if (ExternalSettings)
    {
        Doc.Settings      = *ExternalSettings;
        Doc.SavedBaseline = *ExternalSettings;
    }
    Doc.Camera.Reset();
    Doc.Camera.Distance  = std::clamp(std::max(Doc.Settings.BoundsWidth, Doc.Settings.BoundsHeight) * 1.72f, 1.8f, 9.5f);
    Doc.Camera.Target[1] = -0.60f + Doc.Settings.BoundsHeight * 0.42f;
    InitializeDefaultRows(Doc, AccessActiveSettings());
    Doc.Unsaved            = false;
    PresetsGalleryView     = false;
    OpenPopupId.clear();
    LastActionBanner       = "Editing live scene domain: " + PlumeName;
    BannerTimerSeconds     = 3.5f;
}

void FluidEditorWorkspace::LoadPresetByIdentity(VulkanContext& VkCtx, PyroVolumeSolver& ActiveSolver, const char* PresetId)
{
    if (!PresetId || !*PresetId)
        return;
    const GasPreset* Meta  = FindGasPreset(PresetId);
    GasSettings Next       = ConstructPresetSettings(PresetId);
    FluidDocumentTab& Doc  = Documents[ActiveDocIndex];
    Doc.PresetIdentity     = PresetId;
    Doc.Title              = Meta ? Meta->Name : PresetId;
    Doc.SavedBaseline      = Next;
    Doc.Unsaved            = false;
    AccessActiveSettings() = Next;
    Doc.Camera.Reset();
    Doc.Camera.Distance    = std::clamp(std::max(Next.BoundsWidth, Next.BoundsHeight) * 1.72f, 1.8f, 9.5f);
    Doc.Camera.Target[1]   = -0.60f + Next.BoundsHeight * 0.42f;

    PyroVolumeSolver& Solver = ResolveSolver(ActiveSolver);
    Solver.EnsureLatticeResolution(VkCtx, Next.LatticeResolution);
    Solver.ClearLattice(VkCtx);
    if (Meta && Meta->DetonateOnLoad)
        Solver.TriggerBurstSequence(Next, "single");

    InitializeDefaultRows(Doc, Next);
    LastActionBanner   = std::string("Loaded preset: ") + Doc.Title;
    BannerTimerSeconds = 2.8f;
}

bool FluidEditorWorkspace::LoadSampleSceneFile(VulkanContext& VkCtx, PyroVolumeSolver& ActiveSolver, const std::string& FilePath)
{
    std::ifstream Stream(FilePath);
    if (!Stream)
    {
        LastActionBanner   = "Sample file not found: " + FilePath;
        BannerTimerSeconds = 3.5f;
        return false;
    }
    std::ostringstream Buffer;
    Buffer << Stream.rdbuf();

    GasScene Parsed{};
    const GasSceneReading Outcome = ReadGasScene(Buffer.str(), Parsed);
    if (!Outcome.Accepted)
    {
        LastActionBanner   = "TOML refusal: " + Outcome.Refusal;
        BannerTimerSeconds = 4.0f;
        return false;
    }

    FluidDocumentTab& Doc    = Documents[ActiveDocIndex];
    Doc.Title                = Parsed.Name;
    Doc.SavedBaseline        = Parsed.Settings;
    Doc.Unsaved              = false;
    AccessActiveSettings()   = Parsed.Settings;
    if (Parsed.CameraPresent)
    {
        Doc.Camera.Theta    = static_cast<float>(Parsed.Camera.Theta);
        Doc.Camera.Phi      = static_cast<float>(Parsed.Camera.Phi);
        Doc.Camera.Distance = static_cast<float>(Parsed.Camera.Distance);
        Doc.Camera.Target   = {
            static_cast<float>(Parsed.Camera.Centre[0]),
            static_cast<float>(Parsed.Camera.Centre[1]),
            static_cast<float>(Parsed.Camera.Centre[2]),
        };
    }

    Doc.Rows.clear();
    char ResBadge[16];
    std::snprintf(ResBadge, sizeof(ResBadge), "%d\xc2\xb3", Parsed.Settings.LatticeResolution);
    Doc.Rows.push_back({ Parsed.Names.Domain, SceneRole::Domain, true, ResBadge });
    Doc.Rows.push_back({ Parsed.Names.Emitter, SceneRole::Source, Parsed.Settings.EmitterEnabled, "" });
    Doc.Rows.push_back({ Parsed.Names.Collider, SceneRole::Collider, Parsed.Settings.ObstacleType != 0, "" });
    Doc.Rows.push_back({ Parsed.Names.Sun, SceneRole::Sun, Parsed.Settings.SunIntensity > 0.01f, "Sun" });
    Doc.SelectedRow = 0u;

    PyroVolumeSolver& Solver = ResolveSolver(ActiveSolver);
    Solver.EnsureLatticeResolution(VkCtx, Parsed.Settings.LatticeResolution);
    Solver.ClearLattice(VkCtx);

    LastActionBanner   = "Opened sample: " + Parsed.Name;
    BannerTimerSeconds = 3.0f;
    return true;
}

bool FluidEditorWorkspace::SaveCurrentSceneToml(const std::string& FilePath)
{
    const FluidDocumentTab& Doc = Documents[ActiveDocIndex];
    const GasSettings& S        = QueryActiveSettings();

    GasScene Scene{};
    Scene.Name          = Doc.Title.empty() ? "Untitled scene" : Doc.Title.substr(0, 64);
    Scene.Settings      = S;
    Scene.CameraPresent = true;
    Scene.Camera.Theta    = Doc.Camera.Theta;
    Scene.Camera.Phi      = Doc.Camera.Phi;
    Scene.Camera.Distance = Doc.Camera.Distance;
    Scene.Camera.Centre[0]= Doc.Camera.Target[0];
    Scene.Camera.Centre[1]= Doc.Camera.Target[1];
    Scene.Camera.Centre[2]= Doc.Camera.Target[2];

    for (const OutlinerRow& Row : Doc.Rows)
    {
        if (Row.Role == SceneRole::Domain)   Scene.Names.Domain   = Row.Name;
        if (Row.Role == SceneRole::Source)   Scene.Names.Emitter  = Row.Name;
        if (Row.Role == SceneRole::Collider) Scene.Names.Collider = Row.Name;
        if (Row.Role == SceneRole::Sun)      Scene.Names.Sun      = Row.Name;
    }

    const std::string Content = WriteGasScene(Scene);
    std::ofstream Out(FilePath, std::ios::binary);
    if (!Out)
        return false;
    Out.write(Content.data(), static_cast<std::streamsize>(Content.size()));
    Documents[ActiveDocIndex].Unsaved = false;
    LastActionBanner                  = "Saved TOML: " + FilePath;
    BannerTimerSeconds                = 3.2f;
    return static_cast<bool>(Out);
}

//----------------------------------------------------------------------------------------------------------------------
//                                                LAYOUT RESOLUTION
//----------------------------------------------------------------------------------------------------------------------

WorkspaceLayout FluidEditorWorkspace::ComputeLayout(const ImVec2& Origin, const ImVec2& Size) noexcept
{
    WorkspaceLayout L{};
    L.OriginX = Origin.x;
    L.OriginY = Origin.y;
    L.Width   = std::max(640.0f, Size.x);
    L.Height  = std::max(480.0f, Size.y);

    L.DocTop     = L.OriginY + HeaderHeight;
    L.WorkTop    = L.DocTop + DocBarHeight;
    L.StatusTop  = L.OriginY + L.Height - StatusHeight;
    L.WorkHeight = std::max(160.0f, L.StatusTop - L.WorkTop);

    float LeftW  = 236.0f;
    float RightW = 310.0f;
    if (L.Width >= 1600.0f) { LeftW = 258.0f; RightW = 330.0f; }
    else if (L.Width <= 760.0f) { L.ShowOutliner = false; LeftW = 0.0f; RightW = 236.0f; }
    else if (L.Width <= 960.0f) { LeftW = 178.0f; RightW = 250.0f; }
    else if (L.Width <= 1200.0f){ LeftW = 205.0f; RightW = 278.0f; }

    L.LeftX   = L.OriginX;
    L.LeftW   = L.ShowOutliner ? LeftW : 0.0f;
    L.RightW  = RightW;
    L.RightX  = L.OriginX + L.Width - RightW;
    L.CentreX = L.LeftX + L.LeftW;
    L.CentreW = std::max(240.0f, L.RightX - L.CentreX);

    L.CanvasTop     = L.WorkTop + ViewBarHeight;
    L.TimelineTop  = L.StatusTop - TimelineHeight;
    L.TransportTop = L.TimelineTop - TransportHeight;
    L.CanvasHeight  = std::max(96.0f, L.TransportTop - L.CanvasTop);
    return L;
}

//----------------------------------------------------------------------------------------------------------------------
//                                            KEYBOARD & VIEWPORT INPUT
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::HandleKeyboardShortcuts(VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    GasSettings& S       = AccessActiveSettings();
    PyroOrbitCamera& Cam = AccessActiveCamera();

    if (ImGui::IsKeyPressed(ImGuiKey_Escape))
    {
        if (!OpenPopupId.empty())
            OpenPopupId.clear();
        else if (ShortcutsHelpOpen)
            ShortcutsHelpOpen = false;
        else if (PresetsGalleryView)
            PresetsGalleryView = false;
        else if (EmbeddedInSceneEditor)
            ReturnToSceneRequested = true;
    }
    if (ImGui::IsKeyPressed(ImGuiKey_Space))
        S.Paused = !S.Paused;
    if (ImGui::IsKeyPressed(ImGuiKey_R))
        Solver.ClearLattice(VkCtx);
    if (ImGui::IsKeyPressed(ImGuiKey_S) && S.Paused)
        Solver.AdvanceSimulation(VkCtx, S, 1.0f / 60.0f);
    if (ImGui::IsKeyPressed(ImGuiKey_1))
        ActiveTool = ViewportTool::Orbit;
    if (ImGui::IsKeyPressed(ImGuiKey_2))
        ActiveTool = ViewportTool::Brush;
    if (ImGui::IsKeyPressed(ImGuiKey_3))
        ActiveTool = ViewportTool::Burst;
    if (ImGui::IsKeyPressed(ImGuiKey_F))
    {
        Cam.Reset();
        CameraView = CameraViewPreset::Perspective;
    }
    if (ImGui::IsKeyPressed(ImGuiKey_B))
        S.BoundingBoxShown = !S.BoundingBoxShown;
    if (ImGui::IsKeyPressed(ImGuiKey_T))
    {
        S.AutoTurntable = !S.AutoTurntable;
        Cam.AutoRotate  = S.AutoTurntable;
    }
}

void FluidEditorWorkspace::HandleViewportPointer(VulkanContext& VkCtx, PyroVolumeSolver& Solver, const PaneRect& CanvasRect)
{
    (void)VkCtx;
    if (!OpenPopupId.empty() || PresetsGalleryView)
    {
        Solver.AssignBrush(PrevBrushUvw, { 0.0f, 0.0f, 0.0f }, false);
        return;
    }

    const ImGuiIO& Io     = ImGui::GetIO();
    GasSettings& S        = AccessActiveSettings();
    PyroOrbitCamera& Cam  = AccessActiveCamera();
    Cam.Aspect            = std::max(0.2f, CanvasRect.Width() / std::max(1.0f, CanvasRect.Height()));
    const bool InsideCanvas= CanvasRect.Contains(Io.MousePos);

    if (InsideCanvas && std::fabs(Io.MouseWheel) > 1e-4f)
        Cam.ZoomByWheel(Io.MouseWheel);

    const float NdcX = ((Io.MousePos.x - CanvasRect.MinX) / std::max(1.0f, CanvasRect.Width())) * 2.0f - 1.0f;
    const float NdcY = 1.0f - ((Io.MousePos.y - CanvasRect.MinY) / std::max(1.0f, CanvasRect.Height())) * 2.0f;

    const PyroBoundsBox Bounds = Solver.ComputeBoundsBox(S);
    auto RaycastUvw = [&](std::array<float, 3>& OutUvw) -> bool
    {
        std::array<float, 3> WorldPt{};
        if (!Cam.RaycastBrushPoint(NdcX, NdcY, WorldPt))
            return false;
        OutUvw = {
            std::clamp((WorldPt[0] - Bounds.BoxMin[0]) / std::max(1e-4f, Bounds.BoxMax[0] - Bounds.BoxMin[0]), 0.06f, 0.94f),
            std::clamp((WorldPt[1] - Bounds.BoxMin[1]) / std::max(1e-4f, Bounds.BoxMax[1] - Bounds.BoxMin[1]), 0.05f, 0.92f),
            std::clamp((WorldPt[2] - Bounds.BoxMin[2]) / std::max(1e-4f, Bounds.BoxMax[2] - Bounds.BoxMin[2]), 0.06f, 0.94f),
        };
        return true;
    };

    const bool ShiftHeld  = Io.KeyShift;
    const bool UseBrush   = (ActiveTool == ViewportTool::Brush) || (ActiveTool == ViewportTool::Orbit && ShiftHeld);

    if (InsideCanvas && ImGui::IsMouseClicked(ImGuiMouseButton_Left))
    {
        PrevPointerPos = Io.MousePos;
        if (ActiveTool == ViewportTool::Burst)
        {
            std::array<float, 3> ClickUvw = { 0.5f, 0.24f, 0.5f };
            RaycastUvw(ClickUvw);
            PyroExplosionOptions Opt{};
            Opt.CenterUvw = ClickUvw;
            Solver.TriggerExplosion(S, Opt);
        }
        else if (UseBrush)
        {
            RaycastUvw(PrevBrushUvw);
            Solver.AssignBrush(PrevBrushUvw, { 0.0f, 3.0f, 0.0f }, true);
            DraggingViewport = true;
        }
        else
        {
            DraggingViewport = true;
        }
    }

    if (InsideCanvas && (ImGui::IsMouseClicked(ImGuiMouseButton_Right) || ImGui::IsMouseClicked(ImGuiMouseButton_Middle)))
    {
        PrevPointerPos  = Io.MousePos;
        PanningViewport = true;
    }

    if (DraggingViewport && ImGui::IsMouseDown(ImGuiMouseButton_Left))
    {
        const float Dx = Io.MousePos.x - PrevPointerPos.x;
        const float Dy = Io.MousePos.y - PrevPointerPos.y;
        PrevPointerPos = Io.MousePos;

        if (UseBrush)
        {
            std::array<float, 3> NextUvw = PrevBrushUvw;
            if (RaycastUvw(NextUvw))
            {
                const float InvDt = 1.0f / std::max(Io.DeltaTime, 1.0f / 120.0f);
                const std::array<float, 3> Vel = {
                    std::clamp((NextUvw[0] - PrevBrushUvw[0]) * Bounds.EffectiveWidth * InvDt * 0.45f, -12.0f, 12.0f),
                    std::clamp((NextUvw[1] - PrevBrushUvw[1]) * Bounds.EffectiveHeight * InvDt * 0.45f + 2.2f, -10.0f, 14.0f),
                    std::clamp((NextUvw[2] - PrevBrushUvw[2]) * Bounds.EffectiveWidth * InvDt * 0.45f, -12.0f, 12.0f),
                };
                PrevBrushUvw = NextUvw;
                Solver.AssignBrush(NextUvw, Vel, true);
            }
        }
        else if (ActiveTool == ViewportTool::Orbit)
        {
            Cam.OrbitByPixels(Dx, Dy);
        }
    }
    else
    {
        DraggingViewport = false;
        Solver.AssignBrush(PrevBrushUvw, { 0.0f, 0.0f, 0.0f }, false);
    }

    if (PanningViewport && (ImGui::IsMouseDown(ImGuiMouseButton_Right) || ImGui::IsMouseDown(ImGuiMouseButton_Middle)))
    {
        const float Dx = Io.MousePos.x - PrevPointerPos.x;
        const float Dy = Io.MousePos.y - PrevPointerPos.y;
        PrevPointerPos = Io.MousePos;
        Cam.PanByPixels(Dx, Dy);
    }
    else
    {
        PanningViewport = false;
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                                TOP BARS & OUTLINER
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::DrawHeaderBar(ImDrawList* Draw, const WorkspaceLayout& Page,
                                         VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    (void)VkCtx;
    (void)Solver;
    Draw->AddRectFilled({ Page.OriginX, Page.OriginY }, { Page.OriginX + Page.Width, Page.DocTop }, HeaderFill);
    Draw->AddRectFilled({ Page.OriginX, Page.DocTop - 1.0f }, { Page.OriginX + Page.Width, Page.DocTop }, HeaderEdge);

    float PenX = Page.OriginX + 18.0f;
    if (EmbeddedInSceneEditor)
    {
        const PaneRect BackBox{ PenX, Page.OriginY + 13.0f, PenX + 86.0f, Page.OriginY + 41.0f };
        if (DrawInteractiveButton(Draw, RegularFace, BackBox, 11.0f, "<- Scene", false, OpenPopupId))
            ReturnToSceneRequested = true;
        PenX = BackBox.MaxX + 14.0f;
    }

    DrawDiamond(Draw, { PenX + 7.5f, Page.OriginY + HeaderHeight * 0.5f }, 6.5f, PageInk);
    PenX += 24.0f;
    Typo::DrawBoxText(Draw, RegularFace, PenX, Page.OriginY, HeaderHeight, 12.5f, PageInk, "Fluid");
    PenX += Typo::MeasureTextWidth(RegularFace, 12.5f, "Fluid") + 28.0f;

    // Workspace | Presets nav buttons
    const float WsW = Typo::MeasureTextWidth(LightFace, 11.0f, "Workspace") + 20.0f;
    const PaneRect WsBox{ PenX, Page.OriginY + 14.0f, PenX + WsW, Page.OriginY + 40.0f };
    if (DrawInteractiveButton(Draw, LightFace, WsBox, 11.0f, "Workspace", !PresetsGalleryView, OpenPopupId))
        PresetsGalleryView = false;
    PenX = WsBox.MaxX + 8.0f;

    const float PrW = Typo::MeasureTextWidth(LightFace, 11.0f, "Presets") + 20.0f;
    const PaneRect PrBox{ PenX, Page.OriginY + 14.0f, PenX + PrW, Page.OriginY + 40.0f };
    if (DrawInteractiveButton(Draw, LightFace, PrBox, 11.0f, "Presets", PresetsGalleryView, OpenPopupId))
        PresetsGalleryView = true;
    PenX = PrBox.MaxX + 20.0f;

    // Document tabs (when standalone)
    if (!BoundExternalSettings)
    {
        for (size_t TabIdx = 0; TabIdx < Documents.size(); ++TabIdx)
        {
            std::string TabLabel = Documents[TabIdx].Title;
            if (Documents[TabIdx].Unsaved)
                TabLabel += " *";
            const float TabW = std::min(150.0f, Typo::MeasureTextWidth(LightFace, 10.5f, TabLabel.c_str()) + 24.0f);
            if (PenX + TabW + 220.0f > Page.OriginX + Page.Width)
                break;
            const PaneRect TabBox{ PenX, Page.OriginY + 15.0f, PenX + TabW, Page.OriginY + 39.0f };
            if (DrawInteractiveButton(Draw, LightFace, TabBox, 10.5f, TabLabel.c_str(), TabIdx == ActiveDocIndex, OpenPopupId))
                ActiveDocIndex = TabIdx;
            PenX = TabBox.MaxX + 5.0f;
        }
        if (Documents.size() < 5u && PenX + 240.0f < Page.OriginX + Page.Width)
        {
            const PaneRect AddTabBox{ PenX, Page.OriginY + 15.0f, PenX + 26.0f, Page.OriginY + 39.0f };
            if (DrawInteractiveButton(Draw, LightFace, AddTabBox, 11.0f, "+", false, OpenPopupId))
            {
                FluidDocumentTab Fresh{};
                Fresh.Title = "Untitled " + std::to_string(Documents.size() + 1u);
                InitializeDefaultRows(Fresh, Fresh.Settings);
                Documents.push_back(std::move(Fresh));
                ActiveDocIndex = Documents.size() - 1u;
            }
        }
    }

    float RightX = Page.OriginX + Page.Width - 18.0f;
    const PaneRect HelpBox{ RightX - 28.0f, Page.OriginY + 13.0f, RightX, Page.OriginY + 41.0f };
    if (DrawInteractiveButton(Draw, RegularFace, HelpBox, 11.0f, "?", ShortcutsHelpOpen, OpenPopupId))
        ShortcutsHelpOpen = !ShortcutsHelpOpen;
    RightX = HelpBox.MinX - 10.0f;

    const float GasPillW = Typo::MeasureTrackedWidth(LightFace, 9.0f, "GAS SIMULATION", 0.6f) + 20.0f;
    const PaneRect GasPill{ RightX - GasPillW, Page.OriginY + 15.0f, RightX, Page.OriginY + 39.0f };
    DrawPlate(Draw, GasPill, CardFill, FieldEdge, 12.0f);
    Typo::DrawTrackedText(Draw, LightFace, GasPill.MinX + 10.0f, GasPill.MinY, GasPill.Height(), 9.0f, QuietInk,
                          "GAS SIMULATION", 0.6f);
}

void FluidEditorWorkspace::DrawDocumentBar(ImDrawList* Draw, const WorkspaceLayout& Page,
                                           VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    (void)VkCtx;
    (void)Solver;
    Draw->AddRectFilled({ Page.OriginX, Page.DocTop }, { Page.OriginX + Page.Width, Page.WorkTop }, DocFill);
    Draw->AddRectFilled({ Page.OriginX, Page.WorkTop - 1.0f }, { Page.OriginX + Page.Width, Page.WorkTop }, LineRule);

    const FluidDocumentTab& Doc = Documents[ActiveDocIndex];
    float PenX                  = Page.OriginX + 18.0f;
    Typo::DrawBoxText(Draw, RegularFace, PenX, Page.DocTop, DocBarHeight, 11.0f, StrongInk, Doc.Title.c_str());
    PenX += Typo::MeasureTextWidth(RegularFace, 11.0f, Doc.Title.c_str()) + 4.0f;
    Typo::DrawBoxText(Draw, LightFace, PenX, Page.DocTop, DocBarHeight, 10.5f, FaintInk, ".fluid");
    PenX += Typo::MeasureTextWidth(LightFace, 10.5f, ".fluid") + 10.0f;
    if (Doc.Unsaved)
    {
        Draw->AddCircleFilled({ PenX + 3.0f, Page.DocTop + DocBarHeight * 0.5f }, 3.0f, AmberInk, 12);
        PenX += 14.0f;
    }

    if (BannerTimerSeconds > 0.0f && !LastActionBanner.empty())
    {
        Typo::DrawBoxText(Draw, LightFace, PenX + 12.0f, Page.DocTop, DocBarHeight, 10.0f, LiveInk,
                          LastActionBanner.c_str());
    }

    float RightX = Page.OriginX + Page.Width - 18.0f;
    const PaneRect SaveTomlBox{ RightX - 96.0f, Page.DocTop + 6.0f, RightX, Page.WorkTop - 6.0f };
    if (DrawInteractiveButton(Draw, LightFace, SaveTomlBox, 10.5f, "Save as TOML", false, OpenPopupId))
    {
        SaveCurrentSceneToml("/tmp/frontier-saved.gasscene.toml");
    }
    RightX = SaveTomlBox.MinX - 8.0f;

    const PaneRect SamplesBox{ RightX - 92.0f, Page.DocTop + 6.0f, RightX, Page.WorkTop - 6.0f };
    if (DrawSelectBox(Draw, LightFace, SamplesBox, 10.5f, "Samples", OpenPopupId))
    {
        OpenPopupId       = "samples";
        OpenPopupSpot     = { SamplesBox.MinX, SamplesBox.MaxY + 2.0f };
        OpenPopupWidth    = 196.0f;
        OpenChoiceControl = nullptr;
    }
}

void FluidEditorWorkspace::DrawOutlinerAndPresetRail(ImDrawList* Draw, const WorkspaceLayout& Page,
                                                     VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    if (!Page.ShowOutliner)
        return;

    const float Left = Page.LeftX;
    const float Wide = Page.LeftW;
    Draw->AddRectFilled({ Left, Page.WorkTop }, { Left + Wide, Page.StatusTop }, PanelFill);
    Draw->AddRectFilled({ Left + Wide - 1.0f, Page.WorkTop }, { Left + Wide, Page.StatusTop }, LineRule);

    FluidDocumentTab& Doc = Documents[ActiveDocIndex];
    SyncRowsToSettings(Doc);

    float PenY = Page.WorkTop;
    Typo::DrawTrackedText(Draw, LightFace, Left + 15.0f, PenY, 38.0f, 10.0f, HeadInk, "OUTLINER", 1.4f);
    char CountBuf[16];
    std::snprintf(CountBuf, sizeof(CountBuf), "%zu", Doc.Rows.size());
    Typo::DrawBoxText(Draw, LightFace, Left + Wide - 15.0f, PenY, 38.0f, 10.0f, FaintInk, CountBuf, Typo::TextAnchor::End);
    PenY += 38.0f;

    uint32_t EnabledTotal = 0u;
    for (const OutlinerRow& R : Doc.Rows)
        if (R.Enabled) ++EnabledTotal;

    char Tally[48];
    std::snprintf(Tally, sizeof(Tally), "Enabled %u", EnabledTotal);
    Typo::DrawBoxText(Draw, LightFace, Left + 15.0f, PenY, 20.0f, 9.5f, QuietInk, Tally);
    std::snprintf(Tally, sizeof(Tally), "Disabled %zu", Doc.Rows.size() - EnabledTotal);
    Typo::DrawBoxText(Draw, LightFace, Left + Wide - 15.0f, PenY, 20.0f, 9.5f, FaintInk, Tally, Typo::TextAnchor::End);
    PenY += 24.0f;

    // Scene role filter row: All / Gas / Geometry / Lights
    static constexpr const char* RoleNames[4] = { "All", "Gas", "Geometry", "Lights" };
    float FilterX = Left + 12.0f;
    for (uint32_t Idx = 0u; Idx < 4u; ++Idx)
    {
        const float PillW = Typo::MeasureTextWidth(LightFace, 9.5f, RoleNames[Idx]) + 13.0f;
        const PaneRect Pill{ FilterX, PenY, FilterX + PillW, PenY + 21.0f };
        if (Idx == SceneRoleFilter)
            DrawPlate(Draw, Pill, ChosenFill, ChosenEdge, 4.0f);
        Typo::DrawBoxText(Draw, LightFace, FilterX + PillW * 0.5f, PenY, 21.0f, 9.5f,
                          Idx == SceneRoleFilter ? PageInk : QuietInk, RoleNames[Idx], Typo::TextAnchor::Middle);
        if (ClickedInRect(Pill, true, OpenPopupId))
            SceneRoleFilter = Idx;
        FilterX += PillW + 4.0f;
    }
    PenY += 27.0f;

    // Collection row + "+" add object button
    DrawChevron(Draw, { Left + 18.0f, PenY + 10.0f }, 3.5f, QuietInk, true);
    Typo::DrawBoxText(Draw, LightFace, Left + 28.0f, PenY, 20.0f, 10.5f, BodyInk, "Collection");
    const PaneRect AddObjBox{ Left + Wide - 32.0f, PenY, Left + Wide - 10.0f, PenY + 20.0f };
    if (DrawInteractiveButton(Draw, RegularFace, AddObjBox, 11.0f, "+", false, OpenPopupId))
    {
        OpenPopupId    = "add_object";
        OpenPopupSpot  = { AddObjBox.MinX - 110.0f, AddObjBox.MaxY + 2.0f };
        OpenPopupWidth = 140.0f;
    }
    PenY += 24.0f;

    // Scene rows
    GasSettings& S = AccessActiveSettings();
    for (size_t Idx = 0; Idx < Doc.Rows.size(); ++Idx)
    {
        OutlinerRow& Row = Doc.Rows[Idx];
        if (SceneRoleFilter == 1u && Row.Role != SceneRole::Domain && Row.Role != SceneRole::Source) continue;
        if (SceneRoleFilter == 2u && Row.Role != SceneRole::Collider) continue;
        if (SceneRoleFilter == 3u && Row.Role != SceneRole::Sun) continue;

        const PaneRect RowBox{ Left + 8.0f, PenY, Left + Wide - 8.0f, PenY + 26.0f };
        const bool Selected = (Idx == Doc.SelectedRow);
        if (Selected)
            DrawPlate(Draw, RowBox, RowChosen, RowEdge, 4.0f);
        else if (HoveredRect(RowBox, true, OpenPopupId))
            DrawPlate(Draw, RowBox, CardFill, 0u, 4.0f);

        const float MidY   = PenY + 13.0f;
        const float GlyphX = RowBox.MinX + 10.0f;
        const ImU32 Accent = Row.Role == SceneRole::Source   ? AmberInk
                           : Row.Role == SceneRole::Collider ? PaleInk
                           : Row.Role == SceneRole::Sun      ? AmberInk : AzureInk;
        if (Row.Role == SceneRole::Domain)
            Draw->AddRect({ GlyphX, MidY - 4.5f }, { GlyphX + 9.0f, MidY + 4.5f }, Accent, 1.0f, 0, 1.2f);
        else if (Row.Role == SceneRole::Source)
            Draw->AddTriangleFilled({ GlyphX + 4.5f, MidY - 5.0f }, { GlyphX + 9.0f, MidY + 4.5f }, { GlyphX, MidY + 4.5f }, Accent);
        else if (Row.Role == SceneRole::Collider)
            Draw->AddCircle({ GlyphX + 4.5f, MidY }, 4.5f, Accent, 16, 1.2f);
        else
            Draw->AddCircleFilled({ GlyphX + 4.5f, MidY }, 3.8f, Accent, 16);

        Typo::DrawBoxText(Draw, LightFace, GlyphX + 15.0f, PenY, 26.0f, 11.0f,
                          Row.Enabled ? (Selected ? PageInk : BodyInk) : FaintInk, Row.Name.c_str());

        const PaneRect SwitchBox{ RowBox.MaxX - SwitchWide - 6.0f, MidY - SwitchTall * 0.5f,
                                  RowBox.MaxX - 6.0f, MidY + SwitchTall * 0.5f };
        if (!Row.Badge.empty() && Row.Role == SceneRole::Domain)
        {
            Typo::DrawBoxText(Draw, LightFace, RowBox.MaxX - 8.0f, PenY, 26.0f, 9.5f, QuietInk,
                              Row.Badge.c_str(), Typo::TextAnchor::End);
        }
        else
        {
            DrawSwitchPill(Draw, { SwitchBox.MinX, SwitchBox.MinY }, Row.Enabled);
        }

        if (ClickedInRect(RowBox, true, OpenPopupId))
        {
            if (Row.Role != SceneRole::Domain && SwitchBox.Contains(ImGui::GetIO().MousePos))
            {
                Row.Enabled = !Row.Enabled;
                if (Row.Role == SceneRole::Source)   S.EmitterEnabled = Row.Enabled;
                if (Row.Role == SceneRole::Collider) S.ObstacleType   = Row.Enabled ? std::max(1, S.ObstacleType) : 0;
                if (Row.Role == SceneRole::Sun)      S.SunIntensity   = Row.Enabled ? 2.2f : 0.0f;
                Doc.Unsaved = true;
            }
            else
            {
                Doc.SelectedRow = static_cast<uint32_t>(Idx);
                if (Row.Role == SceneRole::Source || Row.Role == SceneRole::Collider)
                    OpenTab = InspectorTab::Source;
                else if (Row.Role == SceneRole::Sun)
                    OpenTab = InspectorTab::Rendering;
            }
        }
        PenY += 27.0f;
    }

    PenY += 8.0f;
    Draw->AddRectFilled({ Left, PenY }, { Left + Wide, PenY + 1.0f }, LineRule);
    PenY += 2.0f;

    // --- Preset Library Rail ---
    Typo::DrawTrackedText(Draw, LightFace, Left + 15.0f, PenY, 34.0f, 10.0f, HeadInk, "EFFECTS", 1.4f);
    char PresetTotal[16];
    std::snprintf(PresetTotal, sizeof(PresetTotal), "%u", FluidPresetCardCount);
    Typo::DrawBoxText(Draw, LightFace, Left + Wide - 15.0f, PenY, 34.0f, 10.0f, FaintInk, PresetTotal, Typo::TextAnchor::End);
    PenY += 34.0f;

    static constexpr const char* CatLabels[4] = { "All", "Fire", "Smoke", "Blast" };
    float CatX = Left + 12.0f;
    for (uint32_t Idx = 0u; Idx < 4u; ++Idx)
    {
        const float PillW = Typo::MeasureTextWidth(LightFace, 9.5f, CatLabels[Idx]) + 14.0f;
        const PaneRect Pill{ CatX, PenY, CatX + PillW, PenY + 21.0f };
        const bool Active = (static_cast<uint32_t>(PresetFilter) == Idx);
        if (Active)
            DrawPlate(Draw, Pill, ChosenFill, ChosenEdge, 4.0f);
        Typo::DrawBoxText(Draw, LightFace, CatX + PillW * 0.5f, PenY, 21.0f, 9.5f,
                          Active ? PageInk : QuietInk, CatLabels[Idx], Typo::TextAnchor::Middle);
        if (ClickedInRect(Pill, true, OpenPopupId))
        {
            PresetFilter      = static_cast<PresetCategoryFilter>(Idx);
            PresetRailScrollY = 0.0f;
        }
        CatX += PillW + 4.0f;
    }
    PenY += 27.0f;

    const float RailBottom = Page.StatusTop - 24.0f;
    const PaneRect RailClip{ Left, PenY, Left + Wide - 1.0f, RailBottom };
    if (RailClip.Height() > 36.0f)
    {
        const PresetCard* Cards = FluidPresetCards();
        constexpr float CardTall = 46.0f;
        constexpr float CardGap  = 6.0f;

        uint32_t VisibleCount = 0u;
        for (uint32_t Idx = 0u; Idx < FluidPresetCardCount; ++Idx)
        {
            if (PresetFilter == PresetCategoryFilter::All
                || std::strcmp(Cards[Idx].Category, PresetFilterKey(PresetFilter)) == 0)
            {
                ++VisibleCount;
            }
        }
        const float ContentHeight = static_cast<float>(VisibleCount) * (CardTall + CardGap);
        const float MaxScroll     = std::max(0.0f, ContentHeight - RailClip.Height() + 8.0f);
        if (HoveredRect(RailClip, true, OpenPopupId) && std::fabs(ImGui::GetIO().MouseWheel) > 1e-4f)
            PresetRailScrollY = std::clamp(PresetRailScrollY - ImGui::GetIO().MouseWheel * 32.0f, 0.0f, MaxScroll);
        PresetRailScrollY = std::clamp(PresetRailScrollY, 0.0f, MaxScroll);

        Draw->PushClipRect({ RailClip.MinX, RailClip.MinY }, { RailClip.MaxX, RailClip.MaxY }, true);
        float CardY = PenY - PresetRailScrollY;
        for (uint32_t Idx = 0u; Idx < FluidPresetCardCount; ++Idx)
        {
            const PresetCard& Card = Cards[Idx];
            if (PresetFilter != PresetCategoryFilter::All
                && std::strcmp(Card.Category, PresetFilterKey(PresetFilter)) != 0)
            {
                continue;
            }

            const PaneRect CardBox{ Left + 10.0f, CardY, Left + Wide - 10.0f, CardY + CardTall };
            if (CardBox.MaxY >= RailClip.MinY && CardBox.MinY <= RailClip.MaxY)
            {
                const bool Loaded  = (Doc.PresetIdentity == Card.Identity);
                const bool Hovered = HoveredRect(CardBox, true, OpenPopupId) && RailClip.Contains(ImGui::GetIO().MousePos);
                DrawPlate(Draw, CardBox, Loaded ? CardLive : (Hovered ? ControlFill : CardBack),
                          Loaded ? CardLiveEdge : CardEdge, 7.0f);

                const PaneRect Swatch{ CardBox.MinX + 7.0f, CardY + 7.0f, CardBox.MinX + 39.0f, CardY + CardTall - 7.0f };
                DrawPlate(Draw, Swatch, SwatchFill, SwatchEdge, 5.0f);
                PaintPresetGlyph(Draw, { Swatch.MinX + 16.0f, Swatch.MinY + Swatch.Height() * 0.5f }, Card.Glyph);

                Typo::DrawBoxText(Draw, RegularFace, Swatch.MaxX + 9.0f, CardY + 6.0f, 17.0f, 11.0f, PageInk, Card.Name);
                Typo::DrawBoxText(Draw, LightFace, Swatch.MaxX + 9.0f, CardY + 23.0f, 16.0f, 9.5f, QuietInk, Card.Summary);

                if (Hovered && ImGui::IsMouseClicked(ImGuiMouseButton_Left))
                    LoadPresetByIdentity(VkCtx, Solver, Card.Identity);
            }
            CardY += CardTall + CardGap;
        }
        Draw->PopClipRect();
    }

    Draw->AddRectFilled({ Left, RailBottom }, { Left + Wide, RailBottom + 1.0f }, LineRule);
    Typo::DrawBoxText(Draw, LightFace, Left + 14.0f, RailBottom, 24.0f, 9.0f, FaintInk,
                      "Click any preset to retune the active domain");
}

//----------------------------------------------------------------------------------------------------------------------
//                                         CENTRE VIEWPORT, BOUNDS & TRANSPORT
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::DrawProjectedBoundsOverlay(ImDrawList* Draw, const PaneRect& CanvasRect,
                                                      const GasSettings& Settings, const PyroBoundsBox& Bounds,
                                                      const PyroCameraFrame& CamFrame)
{
    if (!Settings.BoundingBoxShown)
        return;

    const float TanHalf = std::tan(CamFrame.FovRadians * 0.5f);
    auto Project = [&](float Wx, float Wy, float Wz, ImVec2& OutScreen) -> bool
    {
        const float Dx = Wx - CamFrame.Position[0];
        const float Dy = Wy - CamFrame.Position[1];
        const float Dz = Wz - CamFrame.Position[2];
        const float Z  = Dx * CamFrame.Forward[0] + Dy * CamFrame.Forward[1] + Dz * CamFrame.Forward[2];
        if (Z <= 0.08f)
            return false;
        const float X  = Dx * CamFrame.Right[0] + Dy * CamFrame.Right[1] + Dz * CamFrame.Right[2];
        const float Y  = Dx * CamFrame.Up[0]    + Dy * CamFrame.Up[1]    + Dz * CamFrame.Up[2];
        const float NdcX = X / (Z * CamFrame.Aspect * TanHalf);
        const float NdcY = Y / (Z * TanHalf);
        OutScreen.x = CanvasRect.MinX + (NdcX * 0.5f + 0.5f) * CanvasRect.Width();
        OutScreen.y = CanvasRect.MinY + (0.5f - NdcY * 0.5f) * CanvasRect.Height();
        return true;
    };

    const float X0 = Bounds.BoxMin[0], Y0 = Bounds.BoxMin[1], Z0 = Bounds.BoxMin[2];
    const float X1 = Bounds.BoxMax[0], Y1 = Bounds.BoxMax[1], Z1 = Bounds.BoxMax[2];
    const float Corners[8][3] = {
        { X0, Y0, Z0 }, { X1, Y0, Z0 }, { X1, Y0, Z1 }, { X0, Y0, Z1 },
        { X0, Y1, Z0 }, { X1, Y1, Z0 }, { X1, Y1, Z1 }, { X0, Y1, Z1 },
    };
    static constexpr int Edges[12][2] = {
        { 0, 1 }, { 1, 2 }, { 2, 3 }, { 3, 0 },
        { 4, 5 }, { 5, 6 }, { 6, 7 }, { 7, 4 },
        { 0, 4 }, { 1, 5 }, { 2, 6 }, { 3, 7 },
    };

    Draw->PushClipRect({ CanvasRect.MinX, CanvasRect.MinY }, { CanvasRect.MaxX, CanvasRect.MaxY }, true);
    for (const auto& Edge : Edges)
    {
        ImVec2 A{}, B{};
        if (Project(Corners[Edge[0]][0], Corners[Edge[0]][1], Corners[Edge[0]][2], A)
            && Project(Corners[Edge[1]][0], Corners[Edge[1]][1], Corners[Edge[1]][2], B))
        {
            Draw->AddLine(A, B, BoundsInk, 1.15f);
        }
    }
    if (Settings.VoxelLatticeLinesShown)
    {
        for (int Step = 1; Step < 4; ++Step)
        {
            const float T  = static_cast<float>(Step) * 0.25f;
            const float Mx = X0 + (X1 - X0) * T;
            const float Mz = Z0 + (Z1 - Z0) * T;
            ImVec2 A{}, B{};
            if (Project(Mx, Y0, Z0, A) && Project(Mx, Y0, Z1, B))
                Draw->AddLine(A, B, LatticeInk, 1.0f);
            if (Project(X0, Y0, Mz, A) && Project(X1, Y0, Mz, B))
                Draw->AddLine(A, B, LatticeInk, 1.0f);
        }
    }
    Draw->PopClipRect();
}

void FluidEditorWorkspace::DrawPresetGalleryOverlay(ImDrawList* Draw, const WorkspaceLayout& Page,
                                                    VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    const PaneRect Canvas{ Page.CentreX, Page.WorkTop, Page.CentreX + Page.CentreW, Page.StatusTop };
    Draw->AddRectFilled({ Canvas.MinX, Canvas.MinY }, { Canvas.MaxX, Canvas.MaxY }, CentreFill);

    Typo::DrawBoxText(Draw, RegularFace, Canvas.MinX + 22.0f, Canvas.MinY + 14.0f, 28.0f, 15.0f, PageInk,
                      "Authoring Preset Library (18 Presets)");
    const PaneRect CloseBtn{ Canvas.MaxX - 126.0f, Canvas.MinY + 14.0f, Canvas.MaxX - 20.0f, Canvas.MinY + 40.0f };
    if (DrawInteractiveButton(Draw, RegularFace, CloseBtn, 11.0f, "Back to Viewport", false, OpenPopupId))
        PresetsGalleryView = false;

    const PresetCard* Cards = FluidPresetCards();
    const int Cols          = Canvas.Width() >= 760.0f ? 3 : 2;
    const float Pad         = 18.0f;
    const float Gap         = 10.0f;
    const float CardW       = (Canvas.Width() - Pad * 2.0f - Gap * static_cast<float>(Cols - 1)) / static_cast<float>(Cols);
    const float CardH       = 62.0f;

    for (uint32_t Idx = 0u; Idx < FluidPresetCardCount; ++Idx)
    {
        const int Col = static_cast<int>(Idx) % Cols;
        const int Row = static_cast<int>(Idx) / Cols;
        const float X = Canvas.MinX + Pad + static_cast<float>(Col) * (CardW + Gap);
        const float Y = Canvas.MinY + 56.0f + static_cast<float>(Row) * (CardH + Gap);
        if (Y + CardH > Canvas.MaxY - 12.0f)
            break;

        const PaneRect Box{ X, Y, X + CardW, Y + CardH };
        const bool Loaded = (Documents[ActiveDocIndex].PresetIdentity == Cards[Idx].Identity);
        DrawPlate(Draw, Box, Loaded ? CardLive : CardBack, Loaded ? CardLiveEdge : CardEdge, 8.0f);

        const PaneRect Swatch{ X + 10.0f, Y + 11.0f, X + 50.0f, Y + CardH - 11.0f };
        DrawPlate(Draw, Swatch, SwatchFill, SwatchEdge, 6.0f);
        PaintPresetGlyph(Draw, { Swatch.MinX + 20.0f, Swatch.MinY + Swatch.Height() * 0.5f }, Cards[Idx].Glyph);

        Typo::DrawBoxText(Draw, RegularFace, Swatch.MaxX + 10.0f, Y + 12.0f, 18.0f, 11.5f, PageInk, Cards[Idx].Name);
        Typo::DrawBoxText(Draw, LightFace, Swatch.MaxX + 10.0f, Y + 32.0f, 18.0f, 10.0f, QuietInk, Cards[Idx].Summary);

        if (ClickedInRect(Box, true, OpenPopupId))
        {
            LoadPresetByIdentity(VkCtx, Solver, Cards[Idx].Identity);
            PresetsGalleryView = false;
        }
    }
}

void FluidEditorWorkspace::DrawCentreViewportAndTransport(ImDrawList* Draw, const WorkspaceLayout& Page,
                                                          VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    if (PresetsGalleryView)
    {
        DrawPresetGalleryOverlay(Draw, Page, VkCtx, Solver);
        return;
    }

    GasSettings& S       = AccessActiveSettings();
    PyroOrbitCamera& Cam = AccessActiveCamera();
    const float Left     = Page.CentreX;
    const float Wide     = Page.CentreW;

    // --- Viewport Bar ---
    Draw->AddRectFilled({ Left, Page.WorkTop }, { Left + Wide, Page.CanvasTop }, BarFill);
    Draw->AddRectFilled({ Left, Page.CanvasTop - 1.0f }, { Left + Wide, Page.CanvasTop }, LineRule);

    float BarX = Left + 12.0f;
    const float BarMidY = Page.WorkTop + (ViewBarHeight - 24.0f) * 0.5f;

    // Camera view preset dropdown
    const PaneRect CamSelect{ BarX, BarMidY, BarX + 96.0f, BarMidY + 24.0f };
    if (DrawSelectBox(Draw, LightFace, CamSelect, 10.5f, CameraPresetLabel(CameraView), OpenPopupId))
    {
        OpenPopupId       = "camera_view";
        OpenPopupSpot     = { CamSelect.MinX, CamSelect.MaxY + 2.0f };
        OpenPopupWidth    = 112.0f;
        OpenChoiceControl = nullptr;
    }
    BarX = CamSelect.MaxX + 8.0f;

    // Viewport interaction tools: Orbit (1) | Brush (2) | Burst (3)
    static constexpr const char* ToolNames[3] = { "Orbit", "Brush", "Burst" };
    for (int ToolIdx = 0; ToolIdx < 3; ++ToolIdx)
    {
        const float Tw = Typo::MeasureTextWidth(LightFace, 10.0f, ToolNames[ToolIdx]) + 16.0f;
        const PaneRect ToolBox{ BarX, BarMidY, BarX + Tw, BarMidY + 24.0f };
        if (DrawInteractiveButton(Draw, LightFace, ToolBox, 10.0f, ToolNames[ToolIdx],
                                  static_cast<int>(ActiveTool) == ToolIdx, OpenPopupId))
        {
            ActiveTool = static_cast<ViewportTool>(ToolIdx);
        }
        BarX = ToolBox.MaxX + 4.0f;
    }

    float RightBarX = Left + Wide - 12.0f;
    // Bake Flipbook button
    const float BakeW = Typo::MeasureTextWidth(LightFace, 10.0f, "Bake flipbook") + 18.0f;
    const PaneRect BakeBox{ RightBarX - BakeW, BarMidY, RightBarX, BarMidY + 24.0f };
    if (DrawInteractiveButton(Draw, LightFace, BakeBox, 10.0f, "Bake flipbook", false, OpenPopupId))
    {
        std::vector<uint8_t> SheetRgba;
        if (Solver.BakeFlipbookSheet(VkCtx, S, Cam, 4, 4, 128, 0.04f, SheetRgba))
        {
            WriteRgbaPngFile("/tmp/frontier-flipbook.png", SheetRgba.data(), 512, 512);
            LastActionBanner   = "Baked 4x4 RGBA flipbook -> /tmp/frontier-flipbook.png";
            BannerTimerSeconds = 4.0f;
        }
    }
    RightBarX = BakeBox.MinX - 6.0f;

    // Atlas PiP toggle
    const PaneRect AtlasBtn{ RightBarX - 48.0f, BarMidY, RightBarX, BarMidY + 24.0f };
    if (DrawInteractiveButton(Draw, LightFace, AtlasBtn, 10.0f, "Atlas", S.TileSheetOverviewShown, OpenPopupId))
        S.TileSheetOverviewShown = !S.TileSheetOverviewShown;
    RightBarX = AtlasBtn.MinX - 6.0f;

    // Overlays toggle
    const PaneRect BoundsBtn{ RightBarX - 58.0f, BarMidY, RightBarX, BarMidY + 24.0f };
    if (DrawInteractiveButton(Draw, LightFace, BoundsBtn, 10.0f, "Bounds", S.BoundingBoxShown, OpenPopupId))
        S.BoundingBoxShown = !S.BoundingBoxShown;
    RightBarX = BoundsBtn.MinX - 6.0f;

    // Debug Channel select (9 channels)
    const ControlChoice* Channels = DebugChannels();
    const uint32_t ChanIdx = (S.RenderChannel >= 0 && static_cast<uint32_t>(S.RenderChannel) < DebugChannelCount)
                           ? static_cast<uint32_t>(S.RenderChannel) : 0u;
    const float ChanW = std::min(146.0f, std::max(90.0f, RightBarX - BarX - 8.0f));
    if (ChanW >= 88.0f)
    {
        const PaneRect ChanBox{ RightBarX - ChanW, BarMidY, RightBarX, BarMidY + 24.0f };
        if (DrawSelectBox(Draw, LightFace, ChanBox, 10.0f, Channels[ChanIdx].Label, OpenPopupId))
        {
            OpenPopupId       = "debug_channel";
            OpenPopupSpot     = { ChanBox.MinX, ChanBox.MaxY + 2.0f };
            OpenPopupWidth    = 190.0f;
            OpenChoiceControl = nullptr;
        }
    }

    // --- Live GPU Viewport Canvas ---
    const PaneRect CanvasRect{ Left, Page.CanvasTop, Left + Wide, Page.TransportTop };
    Draw->AddRectFilled({ CanvasRect.MinX, CanvasRect.MinY }, { CanvasRect.MaxX, CanvasRect.MaxY }, CanvasFill);

    HandleViewportPointer(VkCtx, Solver, CanvasRect);

    const float RenderScale = std::clamp(S.RenderScale, 0.35f, 1.5f);
    const int RenderW       = std::max(64, static_cast<int>(std::lround(CanvasRect.Width() * RenderScale)));
    const int RenderH       = std::max(64, static_cast<int>(std::lround(CanvasRect.Height() * RenderScale)));
    const PyroCameraFrame CamFrame = Cam.ComputeFrame(CanvasRect.Width() / std::max(1.0f, CanvasRect.Height()));
    Solver.RenderStandaloneViewport(VkCtx, S, CamFrame, RenderW, RenderH, false);

    if (Solver.QueryViewportUiToken() != 0u)
    {
        Draw->AddImage(static_cast<ImTextureID>(Solver.QueryViewportUiToken()),
                       { CanvasRect.MinX, CanvasRect.MinY }, { CanvasRect.MaxX, CanvasRect.MaxY },
                       { 0.0f, 0.0f }, { 1.0f, 1.0f });
    }

    DrawProjectedBoundsOverlay(Draw, CanvasRect, S, Solver.ComputeBoundsBox(S), CamFrame);

    // Canvas HUD readings
    char LatticeTag[32];
    std::snprintf(LatticeTag, sizeof(LatticeTag), "%d\xc2\xb3 LATTICE", S.LatticeResolution);
    Typo::DrawTrackedText(Draw, LightFace,
                          CanvasRect.MaxX - 14.0f - Typo::MeasureTrackedWidth(LightFace, 9.5f, LatticeTag, 0.8f),
                          CanvasRect.MinY + 10.0f, 18.0f, 9.5f, QuietInk, LatticeTag, 0.8f);

    char CanvasCap[96];
    if (ChanIdx == 0u)
        std::snprintf(CanvasCap, sizeof(CanvasCap), "Eulerian volume \xc2\xb7 physically shaded");
    else
        std::snprintf(CanvasCap, sizeof(CanvasCap), "Eulerian volume \xc2\xb7 %s", Channels[ChanIdx].Label);
    Typo::DrawBoxText(Draw, LightFace, CanvasRect.MinX + 14.0f, CanvasRect.MaxY - 26.0f, 20.0f, 10.0f, QuietInk, CanvasCap);

    // --- Transport Bar ---
    Draw->AddRectFilled({ Left, Page.TransportTop }, { Left + Wide, Page.TimelineTop }, MoveFill);
    Draw->AddRectFilled({ Left, Page.TransportTop }, { Left + Wide, Page.TransportTop + 1.0f }, LineRule);

    float TrX = Left + 14.0f;
    const float TrMidY = Page.TransportTop + (TransportHeight - 28.0f) * 0.5f;

    const PaneRect ResetBtn{ TrX, TrMidY, TrX + 52.0f, TrMidY + 28.0f };
    if (DrawInteractiveButton(Draw, LightFace, ResetBtn, 10.5f, "Reset", false, OpenPopupId))
        Solver.ClearLattice(VkCtx);
    TrX = ResetBtn.MaxX + 6.0f;

    const PaneRect PlayBtn{ TrX, TrMidY, TrX + 62.0f, TrMidY + 28.0f };
    if (DrawInteractiveButton(Draw, RegularFace, PlayBtn, 10.5f, S.Paused ? "Play" : "Pause", !S.Paused, OpenPopupId))
        S.Paused = !S.Paused;
    TrX = PlayBtn.MaxX + 6.0f;

    const PaneRect StepBtn{ TrX, TrMidY, TrX + 48.0f, TrMidY + 28.0f };
    if (DrawInteractiveButton(Draw, LightFace, StepBtn, 10.5f, "Step", false, OpenPopupId))
    {
        S.Paused = true;
        Solver.AdvanceSimulation(VkCtx, S, 1.0f / 60.0f);
    }
    TrX = StepBtn.MaxX + 10.0f;

    const PaneRect BurstBtn{ TrX, TrMidY, TrX + 56.0f, TrMidY + 28.0f };
    if (DrawInteractiveButton(Draw, RegularFace, BurstBtn, 10.5f, "Burst", false, OpenPopupId))
        Solver.TriggerBurstSequence(S, BurstPatterns[BurstPatternIndex].Key);
    TrX = BurstBtn.MaxX + 4.0f;

    const PaneRect PatternBox{ TrX, TrMidY, TrX + 88.0f, TrMidY + 28.0f };
    if (DrawSelectBox(Draw, LightFace, PatternBox, 10.0f, BurstPatterns[BurstPatternIndex].Label, OpenPopupId))
    {
        OpenPopupId    = "burst_pattern";
        OpenPopupSpot  = { PatternBox.MinX, PatternBox.MinY - 126.0f };
        OpenPopupWidth = 112.0f;
    }
    TrX = PatternBox.MaxX + 14.0f;

    char TimeBuf[32];
    FormatTimecode(Solver.QuerySimulationSeconds(), TimeBuf, sizeof(TimeBuf));
    Typo::DrawBoxText(Draw, RegularFace, TrX, Page.TransportTop, TransportHeight, 12.0f, PageInk, TimeBuf);

    char FrameBuf[32];
    std::snprintf(FrameBuf, sizeof(FrameBuf), "FRAME %04u", Solver.QueryStepCount());
    Typo::DrawBoxText(Draw, LightFace, Left + Wide - 14.0f, Page.TransportTop, TransportHeight, 10.0f, QuietInk,
                      FrameBuf, Typo::TextAnchor::End);

    // --- Timeline Ruler ---
    Draw->AddRectFilled({ Left, Page.TimelineTop }, { Left + Wide, Page.StatusTop }, TimeFill);
    Draw->AddRectFilled({ Left, Page.TimelineTop }, { Left + Wide, Page.TimelineTop + 1.0f }, LineRule);

    const float TrackLeft  = Left + 16.0f;
    const float TrackRight = Left + Wide - 16.0f;
    const float TrackWidth = std::max(40.0f, TrackRight - TrackLeft);
    const float RulerTop   = Page.TimelineTop + 10.0f;

    for (int Sec = 0; Sec <= 10; ++Sec)
    {
        const float TickX = TrackLeft + TrackWidth * (static_cast<float>(Sec) / 10.0f);
        Draw->AddLine({ TickX, RulerTop + 12.0f }, { TickX, RulerTop + 20.0f }, ControlEdge, 1.0f);
        char SecLabel[12];
        std::snprintf(SecLabel, sizeof(SecLabel), "%ds", Sec);
        Typo::DrawBoxText(Draw, LightFace, TickX, RulerTop - 2.0f, 14.0f, 8.5f, FaintInk, SecLabel, Typo::TextAnchor::Middle);
    }

    const PaneRect SourceBar{ TrackLeft, RulerTop + 28.0f, TrackRight, RulerTop + 54.0f };
    DrawPlate(Draw, SourceBar, CardFill, FieldEdge, 4.0f);
    const char* SourceActivity = !S.EmitterEnabled ? "No continuous source"
                            : (S.ShrapnelEnabled ? "Continuous source \xc2\xb7 burst armed" : "Continuous source");
    Typo::DrawBoxText(Draw, LightFace, SourceBar.MinX + 10.0f, SourceBar.MinY, SourceBar.Height(), 9.5f, BodyInk, SourceActivity);

    const float PlayPhase = std::fmod(Solver.QuerySimulationSeconds(), 10.0f) / 10.0f;
    const float HeadX     = TrackLeft + PlayPhase * TrackWidth;
    Draw->AddLine({ HeadX, RulerTop + 10.0f }, { HeadX, Page.StatusTop - 6.0f }, PlayheadInk, 1.4f);
    DrawDiamond(Draw, { HeadX, RulerTop + 10.0f }, 4.0f, PlayheadInk);
}

//----------------------------------------------------------------------------------------------------------------------
//                                           RIGHT INSPECTOR (85 CONTROLS)
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::DrawInspectorPane(ImDrawList* Draw, const WorkspaceLayout& Page,
                                             VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    const float Left = Page.RightX;
    const float Wide = Page.RightW;
    Draw->AddRectFilled({ Left, Page.WorkTop }, { Left + Wide, Page.StatusTop }, PanelFill);
    Draw->AddRectFilled({ Left, Page.WorkTop }, { Left + 1.0f, Page.StatusTop }, LineRule);

    FluidDocumentTab& Doc = Documents[ActiveDocIndex];
    GasSettings& S        = AccessActiveSettings();
    const OutlinerRow& SelectedRow = Doc.Rows[std::min<size_t>(Doc.SelectedRow, Doc.Rows.size() - 1u)];

    float PenY = Page.WorkTop;
    Typo::DrawTrackedText(Draw, LightFace, Left + 15.0f, PenY, 38.0f, 10.0f, HeadInk, "INSPECTOR", 1.4f);
    const PaneRect RevertBtn{ Left + Wide - 68.0f, PenY + 8.0f, Left + Wide - 14.0f, PenY + 30.0f };
    if (DrawInteractiveButton(Draw, LightFace, RevertBtn, 9.5f, "Revert", false, OpenPopupId))
    {
        S           = Doc.SavedBaseline;
        Doc.Unsaved = false;
        Solver.EnsureLatticeResolution(VkCtx, S.LatticeResolution);
    }
    PenY += 38.0f;
    Draw->AddRectFilled({ Left, PenY }, { Left + Wide, PenY + 1.0f }, LineRule);

    // Selected object header
    Typo::DrawBoxText(Draw, RegularFace, Left + 15.0f, PenY + 6.0f, 20.0f, 13.0f, PageInk, SelectedRow.Name.c_str());
    Typo::DrawTrackedText(Draw, LightFace, Left + 15.0f, PenY + 26.0f, 16.0f, 8.5f, QuietInk,
                          RoleCaption(SelectedRow.Role), 0.9f);
    PenY += 48.0f;

    // 3 Tabs: Source | Simulation | Rendering
    static constexpr const char* TabLabels[3] = { "Source", "Simulation", "Rendering" };
    const float TabW = (Wide - 28.0f - 8.0f) / 3.0f;
    for (int TabIdx = 0; TabIdx < 3; ++TabIdx)
    {
        const float Tx = Left + 14.0f + static_cast<float>(TabIdx) * (TabW + 4.0f);
        const PaneRect TabBox{ Tx, PenY, Tx + TabW, PenY + 26.0f };
        if (DrawInteractiveButton(Draw, LightFace, TabBox, 10.0f, TabLabels[TabIdx],
                                  static_cast<int>(OpenTab) == TabIdx, OpenPopupId))
        {
            OpenTab          = static_cast<InspectorTab>(TabIdx);
            InspectorScrollY = 0.0f;
        }
    }
    PenY += 34.0f;
    Draw->AddRectFilled({ Left, PenY }, { Left + Wide, PenY + 1.0f }, LineRule);
    PenY += 2.0f;

    // Scrollable PropertyGroups
    const PaneRect ScrollArea{ Left + 1.0f, PenY, Left + Wide, Page.StatusTop };
    const GroupSheet Sheet = BuildInspectorSheet(OpenTab, SelectedRow.Role);
    const uint32_t TabMaskIndex = static_cast<uint32_t>(OpenTab);

    // Measure total content height first
    float TotalHeight = 16.0f;
    for (uint32_t GIdx = 0u; GIdx < Sheet.Count; ++GIdx)
    {
        const bool IsClosed = (GroupClosedMask[TabMaskIndex] & (1u << GIdx)) != 0u;
        TotalHeight += 34.0f; // summary bar
        if (!IsClosed)
        {
            const PropertyGroupSpec& Group = Sheet.Groups[GIdx];
            if (Group.Hint && *Group.Hint)
                TotalHeight += 30.0f;
            for (uint32_t KIdx = 0u; KIdx < Group.KeyCount; ++KIdx)
            {
                const ControlRow* Ctrl = ReadControl(Group.Keys[KIdx]);
                if (!Ctrl) continue;
                TotalHeight += (Ctrl->Form == ControlForm::Range) ? 46.0f : 32.0f;
            }
            TotalHeight += 8.0f;
        }
        TotalHeight += 8.0f;
    }

    const float MaxScroll = std::max(0.0f, TotalHeight - ScrollArea.Height());
    if (HoveredRect(ScrollArea, true, OpenPopupId) && std::fabs(ImGui::GetIO().MouseWheel) > 1e-4f)
        InspectorScrollY = std::clamp(InspectorScrollY - ImGui::GetIO().MouseWheel * 36.0f, 0.0f, MaxScroll);
    InspectorScrollY = std::clamp(InspectorScrollY, 0.0f, MaxScroll);

    if (!ImGui::IsMouseDown(ImGuiMouseButton_Left))
        ActiveSliderKey.clear();

    Draw->PushClipRect({ ScrollArea.MinX, ScrollArea.MinY }, { ScrollArea.MaxX, ScrollArea.MaxY }, true);
    float GroupY = PenY + 8.0f - InspectorScrollY;

    for (uint32_t GIdx = 0u; GIdx < Sheet.Count; ++GIdx)
    {
        const PropertyGroupSpec& Group = Sheet.Groups[GIdx];
        const bool IsClosed            = (GroupClosedMask[TabMaskIndex] & (1u << GIdx)) != 0u;

        float GroupBodyH = 0.0f;
        if (!IsClosed)
        {
            if (Group.Hint && *Group.Hint)
                GroupBodyH += 30.0f;
            for (uint32_t KIdx = 0u; KIdx < Group.KeyCount; ++KIdx)
            {
                const ControlRow* Ctrl = ReadControl(Group.Keys[KIdx]);
                if (!Ctrl) continue;
                GroupBodyH += (Ctrl->Form == ControlForm::Range) ? 46.0f : 32.0f;
            }
            GroupBodyH += 8.0f;
        }

        const PaneRect CardBox{ Left + 10.0f, GroupY, Left + Wide - 10.0f, GroupY + 34.0f + GroupBodyH };
        DrawPlate(Draw, CardBox, CardFill, GroupEdge, 7.0f);

        const PaneRect HeaderBox{ CardBox.MinX, GroupY, CardBox.MaxX, GroupY + 34.0f };
        DrawChevron(Draw, { HeaderBox.MinX + 13.0f, GroupY + 17.0f }, 3.5f, QuietInk, !IsClosed);
        Typo::DrawBoxText(Draw, RegularFace, HeaderBox.MinX + 24.0f, GroupY, 34.0f, 11.0f, StrongInk, Group.Title);
        Typo::DrawTrackedText(Draw, LightFace,
                              HeaderBox.MaxX - 10.0f - Typo::MeasureTrackedWidth(LightFace, 8.5f, Group.Badge, 0.8f),
                              GroupY, 34.0f, 8.5f, BadgeInk, Group.Badge, 0.8f);

        if (ClickedInRect(HeaderBox, true, OpenPopupId) && ScrollArea.Contains(ImGui::GetIO().MousePos))
            GroupClosedMask[TabMaskIndex] ^= (1u << GIdx);

        if (!IsClosed)
        {
            Draw->AddRectFilled({ CardBox.MinX, GroupY + 34.0f }, { CardBox.MaxX, GroupY + 35.0f }, LineRule);
            float RowY = GroupY + 38.0f;
            const float InnerLeft  = CardBox.MinX + 10.0f;
            const float InnerRight = CardBox.MaxX - 10.0f;
            const float InnerW     = InnerRight - InnerLeft;

            if (Group.Hint && *Group.Hint)
            {
                Typo::WrappedSpan Spans[3];
                const int Lines = Typo::WrapProseLines(LightFace, 9.0f, Group.Hint, InnerW, Spans, 3);
                for (int LineIdx = 0; LineIdx < Lines; ++LineIdx)
                {
                    char Buf[160];
                    const size_t Len = std::min(sizeof(Buf) - 1u, static_cast<size_t>(Spans[LineIdx].To - Spans[LineIdx].From));
                    std::memcpy(Buf, Spans[LineIdx].From, Len);
                    Buf[Len] = '\0';
                    Typo::DrawBoxText(Draw, LightFace, InnerLeft, RowY + static_cast<float>(LineIdx) * 12.5f,
                                      12.5f, 9.0f, FaintInk, Buf);
                }
                RowY += 30.0f;
            }

            for (uint32_t KIdx = 0u; KIdx < Group.KeyCount; ++KIdx)
            {
                const ControlRow* Ctrl = ReadControl(Group.Keys[KIdx]);
                if (!Ctrl)
                    continue;

                float CurrentVal = 0.0f;
                ReadSetting(S, Ctrl->Key, CurrentVal);

                if (Ctrl->Form == ControlForm::Toggle)
                {
                    Typo::DrawBoxText(Draw, LightFace, InnerLeft, RowY, 28.0f, 10.5f, LabelInk, Ctrl->Label);
                    const PaneRect SwBox{ InnerRight - SwitchWide, RowY + 7.0f, InnerRight, RowY + 7.0f + SwitchTall };
                    DrawSwitchPill(Draw, { SwBox.MinX, SwBox.MinY }, CurrentVal >= 0.5f);
                    const PaneRect FullRow{ InnerLeft, RowY, InnerRight, RowY + 28.0f };
                    if (ClickedInRect(FullRow, true, OpenPopupId) && ScrollArea.Contains(ImGui::GetIO().MousePos))
                    {
                        const float NextVal = (CurrentVal >= 0.5f) ? 0.0f : 1.0f;
                        WriteSetting(S, Ctrl->Key, NextVal);
                        if ( std::strcmp(Ctrl->Key, "autoTurntable") == 0)
                            AccessActiveCamera().AutoRotate = S.AutoTurntable;
                        Doc.Unsaved = true;
                    }
                    RowY += 32.0f;
                }
                else if (Ctrl->Form == ControlForm::Choice)
                {
                    Typo::DrawBoxText(Draw, LightFace, InnerLeft, RowY, 28.0f, 10.5f, LabelInk, Ctrl->Label);
                    const char* ChosenText = "";
                    const int CurOrd       = static_cast<int>(std::lround(CurrentVal));
                    for (uint32_t CIdx = 0u; CIdx < Ctrl->ChoiceCount; ++CIdx)
                    {
                        if (Ctrl->Choices[CIdx].Ordinal == CurOrd)
                        {
                            ChosenText = Ctrl->Choices[CIdx].Label;
                            break;
                        }
                    }
                    const float DropW = std::min(144.0f, InnerW * 0.56f);
                    const PaneRect DropBox{ InnerRight - DropW, RowY + 2.0f, InnerRight, RowY + 26.0f };
                    if (DrawSelectBox(Draw, LightFace, DropBox, 10.0f, ChosenText, OpenPopupId)
                        && ScrollArea.Contains(ImGui::GetIO().MousePos))
                    {
                        OpenPopupId       = std::string("choice:") + Ctrl->Key;
                        OpenPopupSpot     = { DropBox.MinX, std::min(Page.StatusTop - 160.0f, DropBox.MaxY + 2.0f) };
                        OpenPopupWidth    = std::max(DropW, 175.0f);
                        OpenChoiceControl = Ctrl;
                    }
                    RowY += 32.0f;
                }
                else // ControlForm::Range
                {
                    Typo::DrawBoxText(Draw, LightFace, InnerLeft, RowY, 22.0f, 10.5f, LabelInk, Ctrl->Label);

                    // Split value + unit pill on right
                    constexpr float PillW = 78.0f;
                    constexpr float UnitW = 22.0f;
                    const PaneRect PillBox{ InnerRight - PillW, RowY + 1.0f, InnerRight, RowY + 21.0f };
                    DrawPlate(Draw, PillBox, FieldFill, FieldEdge, 4.0f);
                    Draw->AddLine({ PillBox.MaxX - UnitW, PillBox.MinY }, { PillBox.MaxX - UnitW, PillBox.MaxY }, FieldEdge, 1.0f);

                    char NumText[24];
                    FormatReading(CurrentVal, Ctrl->Step, NumText, sizeof(NumText));
                    Typo::DrawBoxText(Draw, RegularFace, PillBox.MinX + (PillW - UnitW) * 0.5f, PillBox.MinY, PillBox.Height(),
                                      9.5f, PageInk, NumText, Typo::TextAnchor::Middle);
                    Typo::DrawBoxText(Draw, LightFace, PillBox.MaxX - UnitW * 0.5f, PillBox.MinY, PillBox.Height(),
                                      8.5f, QuietInk, Ctrl->Unit, Typo::TextAnchor::Middle);

                    // Horizontal slider track below label + pill
                    const float TrackY   = RowY + 31.0f;
                    const float Span     = std::max(1e-6f, Ctrl->High - Ctrl->Low);
                    const float Fraction = std::clamp((CurrentVal - Ctrl->Low) / Span, 0.0f, 1.0f);
                    const float FillEnd  = InnerLeft + InnerW * Fraction;

                    Draw->AddRectFilled({ InnerLeft, TrackY - 2.0f }, { InnerRight, TrackY + 2.0f }, TrackFill, 2.0f);
                    if (FillEnd > InnerLeft + 1.0f)
                        Draw->AddRectFilled({ InnerLeft, TrackY - 2.0f }, { FillEnd, TrackY + 2.0f }, TrackRun, 2.0f);
                    Draw->AddCircleFilled({ FillEnd, TrackY }, 5.5f, ThumbFill, 16);

                    const PaneRect HitTrack{ InnerLeft - 4.0f, RowY + 22.0f, InnerRight + 4.0f, RowY + 42.0f };
                    if (ClickedInRect(HitTrack, true, OpenPopupId) && ScrollArea.Contains(ImGui::GetIO().MousePos))
                        ActiveSliderKey = Ctrl->Key;

                    if (ActiveSliderKey == Ctrl->Key && ImGui::IsMouseDown(ImGuiMouseButton_Left))
                    {
                        const float NewFrac = std::clamp((ImGui::GetIO().MousePos.x - InnerLeft) / std::max(1.0f, InnerW), 0.0f, 1.0f);
                        float RawVal        = Ctrl->Low + NewFrac * Span;
                        if (Ctrl->Step > 0.0f)
                            RawVal = std::round(RawVal / Ctrl->Step) * Ctrl->Step;
                        WriteSetting(S, Ctrl->Key, RawVal);
                        Doc.Unsaved = true;
                    }
                    RowY += 46.0f;
                }
            }
        }

        GroupY = CardBox.MaxY + 8.0f;
    }

    Draw->PopClipRect();
}

//----------------------------------------------------------------------------------------------------------------------
//                                             STATUS BAR & POPUP MENUS
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::DrawStatusBar(ImDrawList* Draw, const WorkspaceLayout& Page,
                                         VulkanContext& VkCtx, const PyroVolumeSolver& Solver, float Fps)
{
    Draw->AddRectFilled({ Page.OriginX, Page.StatusTop }, { Page.OriginX + Page.Width, Page.OriginY + Page.Height }, PanelFill);
    Draw->AddRectFilled({ Page.OriginX, Page.StatusTop }, { Page.OriginX + Page.Width, Page.StatusTop + 1.0f }, StatusEdge);

    const GasSettings& S = QueryActiveSettings();
    float PenX           = Page.OriginX + 16.0f;
    Draw->AddCircleFilled({ PenX + 4.0f, Page.StatusTop + StatusHeight * 0.5f }, 3.5f, LiveInk, 12);
    PenX += 14.0f;
    Typo::DrawBoxText(Draw, RegularFace, PenX, Page.StatusTop, StatusHeight, 9.5f, StrongInk, "Ready");
    PenX += 46.0f;

    const std::string GpuTag = VkCtx.QueryDeviceSummary();
    Typo::DrawBoxText(Draw, LightFace, PenX, Page.StatusTop, StatusHeight, 9.5f, QuietInk, GpuTag.c_str());

    float RightX = Page.OriginX + Page.Width - 16.0f;
    const PyroBoundsBox Bounds = Solver.ComputeBoundsBox(S);
    char BoundsStr[48];
    std::snprintf(BoundsStr, sizeof(BoundsStr), "%.1f \xc3\x97 %.1f \xc3\x97 %.1f m",
                  static_cast<double>(Bounds.EffectiveWidth),
                  static_cast<double>(Bounds.EffectiveHeight),
                  static_cast<double>(Bounds.EffectiveWidth));
    Typo::DrawBoxText(Draw, LightFace, RightX, Page.StatusTop, StatusHeight, 9.5f, BodyInk, BoundsStr, Typo::TextAnchor::End);
    RightX -= Typo::MeasureTextWidth(LightFace, 9.5f, BoundsStr) + 18.0f;

    char VoxStr[48];
    FormatVoxelCount(S.LatticeResolution, VoxStr, sizeof(VoxStr));
    Typo::DrawBoxText(Draw, LightFace, RightX, Page.StatusTop, StatusHeight, 9.5f, QuietInk, VoxStr, Typo::TextAnchor::End);
    RightX -= Typo::MeasureTextWidth(LightFace, 9.5f, VoxStr) + 18.0f;

    char FpsStr[32];
    if (Fps > 0.5f)
        std::snprintf(FpsStr, sizeof(FpsStr), "%.0f FPS", static_cast<double>(Fps));
    else
        std::snprintf(FpsStr, sizeof(FpsStr), "\xe2\x80\x94 FPS");
    Typo::DrawBoxText(Draw, RegularFace, RightX, Page.StatusTop, StatusHeight, 9.5f, StrongInk, FpsStr, Typo::TextAnchor::End);
}

void FluidEditorWorkspace::DrawActivePopupMenu(ImDrawList* Draw, VulkanContext& VkCtx, PyroVolumeSolver& Solver)
{
    if (ShortcutsHelpOpen)
    {
        const float W = 380.0f, H = 228.0f;
        const float X = CachedLayout.OriginX + (CachedLayout.Width - W) * 0.5f;
        const float Y = CachedLayout.OriginY + (CachedLayout.Height - H) * 0.5f;
        const PaneRect Modal{ X, Y, X + W, Y + H };
        DrawPlate(Draw, Modal, HeaderFill, ChosenEdge, 10.0f);
        Typo::DrawBoxText(Draw, RegularFace, X + 18.0f, Y + 12.0f, 22.0f, 13.0f, PageInk, "FluidEditor Shortcuts");
        static constexpr const char* HelpLines[] = {
            "Space          Play / Pause simulation",
            "S              Single-step frame while paused",
            "R              Reset & clear 3D voxel lattice",
            "1 / 2 / 3      Orbit / 3D Flamethrower Brush / Burst Detonate",
            "B / T / F      Toggle Bounds / Auto-Turntable / Focus Camera",
            "Right-Drag     Pan camera target   |   Wheel: Zoom",
            "Esc            Close popup or return to Frontier Scene",
        };
        for (int Idx = 0; Idx < 7; ++Idx)
        {
            Typo::DrawBoxText(Draw, LightFace, X + 18.0f, Y + 44.0f + static_cast<float>(Idx) * 23.0f,
                              20.0f, 10.0f, BodyInk, HelpLines[Idx]);
        }
        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !Modal.Contains(ImGui::GetIO().MousePos))
            ShortcutsHelpOpen = false;
    }

    if (OpenPopupId.empty())
        return;

    struct MenuItem { std::string Label; int Ordinal; std::string Path; };
    std::vector<MenuItem> Items;

    if (OpenPopupId == "samples")
    {
        for (const SampleSceneEntry& Entry : BuiltInSamples)
            Items.push_back({ Entry.Label, 0, Entry.FileName });
    }
    else if (OpenPopupId == "camera_view")
    {
        Items.push_back({ "Perspective", 0, "" });
        Items.push_back({ "Front",       1, "" });
        Items.push_back({ "Side",        2, "" });
        Items.push_back({ "Top",         3, "" });
    }
    else if (OpenPopupId == "debug_channel")
    {
        const ControlChoice* Ch = DebugChannels();
        for (uint32_t Idx = 0u; Idx < DebugChannelCount; ++Idx)
            Items.push_back({ Ch[Idx].Label, Ch[Idx].Ordinal, "" });
    }
    else if (OpenPopupId == "burst_pattern")
    {
        for (int Idx = 0; Idx < 5; ++Idx)
            Items.push_back({ BurstPatterns[Idx].Label, Idx, "" });
    }
    else if (OpenPopupId == "add_object")
    {
        Items.push_back({ "Fire source",       1, "" });
        Items.push_back({ "Smoke source",      2, "" });
        Items.push_back({ "Sphere collider",   3, "" });
        Items.push_back({ "Cylinder collider", 4, "" });
        Items.push_back({ "Deflector slab",    5, "" });
    }
    else if (OpenChoiceControl != nullptr)
    {
        for (uint32_t Idx = 0u; Idx < OpenChoiceControl->ChoiceCount; ++Idx)
            Items.push_back({ OpenChoiceControl->Choices[Idx].Label, OpenChoiceControl->Choices[Idx].Ordinal, "" });
    }

    if (Items.empty())
    {
        OpenPopupId.clear();
        return;
    }

    constexpr float RowH = 25.0f;
    const float MenuH    = static_cast<float>(Items.size()) * RowH + 8.0f;
    const float MenuX    = std::clamp(OpenPopupSpot.x, CachedLayout.OriginX + 6.0f, CachedLayout.OriginX + CachedLayout.Width - OpenPopupWidth - 6.0f);
    const float MenuY    = std::clamp(OpenPopupSpot.y, CachedLayout.OriginY + 6.0f, CachedLayout.OriginY + CachedLayout.Height - MenuH - 6.0f);
    const PaneRect MenuBox{ MenuX, MenuY, MenuX + OpenPopupWidth, MenuY + MenuH };

    DrawPlate(Draw, MenuBox, HeaderFill, ChosenEdge, 6.0f);

    GasSettings& S        = AccessActiveSettings();
    FluidDocumentTab& Doc = Documents[ActiveDocIndex];

    int ClickedItem = -1;
    for (size_t Idx = 0; Idx < Items.size(); ++Idx)
    {
        const PaneRect ItemBox{ MenuX + 4.0f, MenuY + 4.0f + static_cast<float>(Idx) * RowH,
                                MenuX + OpenPopupWidth - 4.0f, MenuY + 4.0f + static_cast<float>(Idx + 1u) * RowH };
        if (ItemBox.Contains(ImGui::GetIO().MousePos))
            DrawPlate(Draw, ItemBox, ChosenFill, 0u, 4.0f);
        Typo::DrawBoxText(Draw, LightFace, ItemBox.MinX + 8.0f, ItemBox.MinY, RowH, 10.0f, PageInk, Items[Idx].Label.c_str());
        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && ItemBox.Contains(ImGui::GetIO().MousePos))
            ClickedItem = static_cast<int>(Idx);
    }

    if (ClickedItem >= 0)
    {
        const MenuItem& Chosen = Items[static_cast<size_t>(ClickedItem)];
        if (OpenPopupId == "samples")
        {
            LoadSampleSceneFile(VkCtx, Solver, Chosen.Path);
        }
        else if (OpenPopupId == "camera_view")
        {
            CameraView = static_cast<CameraViewPreset>(Chosen.Ordinal);
            AccessActiveCamera().ApplyPresetView(Chosen.Ordinal);
        }
        else if (OpenPopupId == "debug_channel")
        {
            S.RenderChannel = Chosen.Ordinal;
        }
        else if (OpenPopupId == "burst_pattern")
        {
            BurstPatternIndex = Chosen.Ordinal;
        }
        else if (OpenPopupId == "add_object")
        {
            if (Chosen.Ordinal == 1)      { S.EmitterEnabled = true; S.EmitterFuel = std::max(S.EmitterFuel, 2.5f); Doc.Rows.push_back({ "Fire source", SceneRole::Source, true, "" }); }
            else if (Chosen.Ordinal == 2) { S.EmitterEnabled = true; S.EmitterFuel = 0.0f; Doc.Rows.push_back({ "Smoke source", SceneRole::Source, true, "" }); }
            else if (Chosen.Ordinal == 3) { S.ObstacleType = 1; Doc.Rows.push_back({ "Sphere collider", SceneRole::Collider, true, "" }); }
            else if (Chosen.Ordinal == 4) { S.ObstacleType = 2; Doc.Rows.push_back({ "Cylinder collider", SceneRole::Collider, true, "" }); }
            else if (Chosen.Ordinal == 5) { S.ObstacleType = 4; Doc.Rows.push_back({ "Deflector slab", SceneRole::Collider, true, "" }); }
            Doc.SelectedRow = static_cast<uint32_t>(Doc.Rows.size() - 1u);
            Doc.Unsaved     = true;
        }
        else if (OpenChoiceControl != nullptr)
        {
            WriteSetting(S, OpenChoiceControl->Key, static_cast<float>(Chosen.Ordinal));
            if (std::strcmp(OpenChoiceControl->Key, "gridResolution") == 0)
                Solver.EnsureLatticeResolution(VkCtx, S.LatticeResolution);
            Doc.Unsaved = true;
        }
        OpenPopupId.clear();
        OpenChoiceControl = nullptr;
    }
    else if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !MenuBox.Contains(ImGui::GetIO().MousePos))
    {
        OpenPopupId.clear();
        OpenChoiceControl = nullptr;
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                                MAIN FRAME TICK & DRAW
//----------------------------------------------------------------------------------------------------------------------

void FluidEditorWorkspace::TickAndDraw(VulkanContext& VkCtx, PyroVolumeSolver& FallbackSolver, float DtSeconds,
                                       float MeasuredFps, const ImVec2& Origin, const ImVec2& Size)
{
    PyroVolumeSolver& Solver = ResolveSolver(FallbackSolver);
    GasSettings& S           = AccessActiveSettings();
    PyroOrbitCamera& Cam     = AccessActiveCamera();

    if (BannerTimerSeconds > 0.0f)
        BannerTimerSeconds = std::max(0.0f, BannerTimerSeconds - DtSeconds);

    CachedLayout = ComputeLayout(Origin, Size);
    HandleKeyboardShortcuts(VkCtx, Solver);

    Cam.AutoRotate = S.AutoTurntable;
    Cam.AdvanceTurntable(DtSeconds);

    if (!S.Paused && DtSeconds > 0.0f)
        Solver.AdvanceSimulation(VkCtx, S, DtSeconds);

    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(Origin, { Origin.x + CachedLayout.Width, Origin.y + CachedLayout.Height }, PageFill);

    DrawHeaderBar(Draw, CachedLayout, VkCtx, Solver);
    DrawDocumentBar(Draw, CachedLayout, VkCtx, Solver);
    DrawOutlinerAndPresetRail(Draw, CachedLayout, VkCtx, Solver);
    DrawCentreViewportAndTransport(Draw, CachedLayout, VkCtx, Solver);
    DrawInspectorPane(Draw, CachedLayout, VkCtx, Solver);
    DrawStatusBar(Draw, CachedLayout, VkCtx, Solver, MeasuredFps);
    DrawActivePopupMenu(Draw, VkCtx, Solver);
}

} // namespace Frontier::FluidEditor
