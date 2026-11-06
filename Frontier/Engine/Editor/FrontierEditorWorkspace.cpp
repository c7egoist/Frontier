/*==========================================================================================================================================
                                                        FRONTIEREDITORWORKSPACE.CPP
==========================================================================================================================================*/
// 🧩 Native C++ Frontier Editor workspace (Outliner · 3D GPU SDF Viewport · GasCardSurface Inspector · StatusBar)
//    integrated 1:1 with FluidEditorWorkspace, WorldSdfScene, LobbySession, and TyreSmokeIntake.

#include "Frontier/Engine/Editor/FrontierEditorWorkspace.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>

namespace Frontier
{

namespace
{

namespace Typo = Frontier::Typography;
using FluidEditor::PaneRect;

//----------------------------------------------------------------------------------------------------------------------
//                                         FRONTIER EDITOR PALETTE & HELPERS
//----------------------------------------------------------------------------------------------------------------------

constexpr ImU32 ShellBg        = IM_COL32( 11,  11,  11, 255);
constexpr ImU32 PaneFill       = IM_COL32( 15,  15,  15, 255);   // #0f0f0f
constexpr ImU32 CardFill       = IM_COL32( 24,  24,  24, 255);   // #181818
constexpr ImU32 DeepFill       = IM_COL32( 18,  18,  18, 255);   // #121212
constexpr ImU32 TopBarFill     = IM_COL32( 22,  22,  22, 255);   // #161616
constexpr ImU32 ControlFill    = IM_COL32( 36,  36,  36, 255);   // #242424
constexpr ImU32 ControlHover   = IM_COL32( 50,  50,  50, 255);
constexpr ImU32 ChosenFill     = IM_COL32( 48,  48,  48, 255);
constexpr ImU32 AccentFill     = IM_COL32( 58,  44,  26, 255);   // warm amber button fill for Open FluidEditor
constexpr ImU32 AccentHover    = IM_COL32( 78,  58,  32, 255);
constexpr ImU32 AccentEdge     = IM_COL32(214, 146,  62, 255);
constexpr ImU32 RuleLine       = IM_COL32(255, 255, 255,  18);
constexpr ImU32 CardEdge       = IM_COL32(255, 255, 255,  24);
constexpr ImU32 ChosenEdge     = IM_COL32(126, 126, 126, 255);

constexpr ImU32 BrightInk      = IM_COL32(240, 240, 240, 255);
constexpr ImU32 MidInk         = IM_COL32(188, 188, 188, 255);
constexpr ImU32 SoftInk        = IM_COL32(142, 142, 142, 255);
constexpr ImU32 DimInk         = IM_COL32( 96,  96,  96, 255);
constexpr ImU32 GreenInk       = IM_COL32( 52, 199,  89, 255);
constexpr ImU32 AmberInk       = IM_COL32(255, 178,  76, 255);
constexpr ImU32 FlameInk       = IM_COL32(255, 102,  48, 255);
constexpr ImU32 AzureInk       = IM_COL32( 96, 174, 255, 255);
constexpr ImU32 TrackFill      = IM_COL32( 58,  58,  58, 255);
constexpr ImU32 TrackRun       = IM_COL32(148, 148, 148, 255);
constexpr ImU32 ThumbFill      = IM_COL32(204, 204, 204, 255);

constexpr float OutlinerWidth  = 254.0f;
constexpr float InspectorWidth = 318.0f;
constexpr float TopBarHeight   = 40.0f;
constexpr float StatusHeight   = 26.0f;

void PaintBox(ImDrawList* Draw, const PaneRect& Box, ImU32 Fill, ImU32 Edge, float Radius = 5.0f) noexcept
{
    Draw->AddRectFilled({ Box.MinX, Box.MinY }, { Box.MaxX, Box.MaxY }, Fill, Radius);
    if (Edge != 0u)
        Draw->AddRect({ Box.MinX, Box.MinY }, { Box.MaxX, Box.MaxY }, Edge, Radius, 0, 1.0f);
}

void PaintSwitch(ImDrawList* Draw, float X, float Y, bool Enabled) noexcept
{
    Draw->AddRectFilled({ X, Y }, { X + 26.0f, Y + 14.0f },
                        Enabled ? IM_COL32(132, 132, 132, 255) : IM_COL32(68, 68, 68, 255), 7.0f);
    const float Cx = Enabled ? (X + 19.0f) : (X + 7.0f);
    Draw->AddCircleFilled({ Cx, Y + 7.0f }, 4.3f, Enabled ? BrightInk : SoftInk, 14);
}

bool HitClicked(const PaneRect& Box, const std::string& ActivePopup) noexcept
{
    return ActivePopup.empty() && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && Box.Contains(ImGui::GetIO().MousePos);
}

bool HitHovered(const PaneRect& Box, const std::string& ActivePopup) noexcept
{
    return ActivePopup.empty() && Box.Contains(ImGui::GetIO().MousePos);
}

bool PaintButton(ImDrawList* Draw, ImFont* Face, const PaneRect& Box, float CssPx, const char* Label,
                 bool Active, const std::string& ActivePopup, bool AccentStyle = false) noexcept
{
    const bool Hovered = HitHovered(Box, ActivePopup);
    const ImU32 Fill   = AccentStyle ? (Hovered ? AccentHover : AccentFill)
                                     : (Active ? ChosenFill : (Hovered ? ControlHover : ControlFill));
    const ImU32 Edge   = AccentStyle ? AccentEdge : (Active ? ChosenEdge : CardEdge);
    PaintBox(Draw, Box, Fill, Edge, 5.0f);
    Typo::DrawBoxText(Draw, Face, Box.MinX + Box.Width() * 0.5f, Box.MinY, Box.Height(), CssPx,
                      AccentStyle ? AmberInk : (Active ? BrightInk : MidInk), Label, Typo::TextAnchor::Middle);
    return HitClicked(Box, ActivePopup);
}

bool PaintDropdown(ImDrawList* Draw, ImFont* Face, const PaneRect& Box, float CssPx, const char* CurrentText,
                   const std::string& ActivePopup) noexcept
{
    const bool Hovered = HitHovered(Box, ActivePopup);
    PaintBox(Draw, Box, Hovered ? ControlHover : DeepFill, CardEdge, 5.0f);
    Typo::DrawBoxText(Draw, Face, Box.MinX + 9.0f, Box.MinY, Box.Height(), CssPx, BrightInk, CurrentText);
    const float Cx = Box.MaxX - 11.0f;
    const float Cy = Box.MinY + Box.Height() * 0.5f;
    Draw->AddLine({ Cx - 3.5f, Cy - 1.5f }, { Cx, Cy + 2.0f }, SoftInk, 1.3f);
    Draw->AddLine({ Cx, Cy + 2.0f }, { Cx + 3.5f, Cy - 1.5f }, SoftInk, 1.3f);
    return HitClicked(Box, ActivePopup);
}

bool PaintInlineSlider(ImDrawList* Draw, ImFont* Light, ImFont* Regular, float Left, float Right, float& PenY,
                       const char* IdKey, const char* Label, const char* Unit,
                       float& InOutVal, float Low, float High, float Step,
                       const PaneRect& ClipBox, const std::string& ActivePopup, std::string& ActiveDragKey) noexcept
{
    const float Width = Right - Left;
    Typo::DrawBoxText(Draw, Light, Left, PenY, 18.0f, 10.0f, SoftInk, Label);

    char ValBuf[32];
    const int Decimals = (Step >= 1.0f) ? 0 : (Step < 0.02f ? 2 : 1);
    if (Unit && *Unit)
        std::snprintf(ValBuf, sizeof(ValBuf), "%.*f %s", Decimals, static_cast<double>(InOutVal), Unit);
    else
        std::snprintf(ValBuf, sizeof(ValBuf), "%.*f", Decimals, static_cast<double>(InOutVal));
    Typo::DrawBoxText(Draw, Regular, Right, PenY, 18.0f, 10.0f, BrightInk, ValBuf, Typo::TextAnchor::End);

    const float TrackY = PenY + 24.0f;
    const float Span   = std::max(1e-5f, High - Low);
    const float Frac   = std::clamp((InOutVal - Low) / Span, 0.0f, 1.0f);
    const float FillX  = Left + Width * Frac;

    Draw->AddRectFilled({ Left, TrackY - 2.0f }, { Right, TrackY + 2.0f }, TrackFill, 2.0f);
    if (FillX > Left + 1.0f)
        Draw->AddRectFilled({ Left, TrackY - 2.0f }, { FillX, TrackY + 2.0f }, TrackRun, 2.0f);
    Draw->AddCircleFilled({ FillX, TrackY }, 5.0f, ThumbFill, 14);

    bool Changed = false;
    const PaneRect Hit{ Left - 4.0f, PenY + 15.0f, Right + 4.0f, PenY + 34.0f };
    if (HitClicked(Hit, ActivePopup) && ClipBox.Contains(ImGui::GetIO().MousePos))
        ActiveDragKey = IdKey;

    if (ActiveDragKey == IdKey && ImGui::IsMouseDown(ImGuiMouseButton_Left))
    {
        const float NextFrac = std::clamp((ImGui::GetIO().MousePos.x - Left) / std::max(1.0f, Width), 0.0f, 1.0f);
        float Raw            = Low + NextFrac * Span;
        if (Step > 0.0f)
            Raw = std::round(Raw / Step) * Step;
        Raw = std::clamp(Raw, Low, High);
        if (std::fabs(Raw - InOutVal) > 1e-6f)
        {
            InOutVal = Raw;
            Changed  = true;
        }
    }

    PenY += 36.0f;
    return Changed;
}

bool ProjectWorldToScreen(const std::array<float, 3>& WorldPt, const WorldCameraView& Cam,
                          const PaneRect& CanvasRect, ImVec2& OutPt) noexcept
{
    const float Dx = WorldPt[0] - Cam.Eye[0];
    const float Dy = WorldPt[1] - Cam.Eye[1];
    const float Dz = WorldPt[2] - Cam.Eye[2];
    const float Depth = Dx * Cam.Forward[0] + Dy * Cam.Forward[1] + Dz * Cam.Forward[2];
    if (Depth <= 0.15f)
        return false;
    const float TanHalf = std::tan(Cam.FovRadians * 0.5f);
    const float CamX    = Dx * Cam.Right[0] + Dy * Cam.Right[1] + Dz * Cam.Right[2];
    const float CamY    = Dx * Cam.Up[0]    + Dy * Cam.Up[1]    + Dz * Cam.Up[2];
    const float NdcX    = CamX / (Depth * Cam.Aspect * TanHalf);
    const float NdcY    = CamY / (Depth * TanHalf);
    OutPt.x = CanvasRect.MinX + (NdcX * 0.5f + 0.5f) * CanvasRect.Width();
    OutPt.y = CanvasRect.MinY + (0.5f - NdcY * 0.5f) * CanvasRect.Height();
    return true;
}

std::string FindFontFile(const char* FileName)
{
    const char* Prefixes[] = {
        "EngineContent/Fonts/SunReference/",
        "../EngineContent/Fonts/SunReference/",
        "../../EngineContent/Fonts/SunReference/",
    };
    for (const char* Prefix : Prefixes)
    {
        const std::string Candidate = std::string(Prefix) + FileName;
        if (std::filesystem::exists(Candidate))
            return Candidate;
    }
    return {};
}

} // namespace

//----------------------------------------------------------------------------------------------------------------------
//                                              INITIALIZE & SHUTDOWN
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::LoadDefaultFonts()
{
    ImGuiIO& Io = ImGui::GetIO();
    const std::string LightPath   = FindFontFile("DMSans-Light.ttf");
    const std::string RegularPath = FindFontFile("DMSans-Regular.ttf");

    if (!LightPath.empty())
        LightFont = Io.Fonts->AddFontFromFileTTF(LightPath.c_str(), 18.0f);
    if (!RegularPath.empty())
        RegularFont = Io.Fonts->AddFontFromFileTTF(RegularPath.c_str(), 18.0f);

    if (!LightFont)
        LightFont = Io.Fonts->AddFontDefault();
    if (!RegularFont)
        RegularFont = LightFont;

    FluidWorkspace.BindFonts(LightFont, RegularFont);
    FluidWorkspace.SetEmbeddedInFrontierEditor(true);
}

bool FrontierEditorWorkspace::SpawnWorldPlume(VulkanContext& VkCtx, const std::string& Name, const char* PresetId,
                                              const std::array<float, 3>& OriginWorld, bool FollowsVehicle,
                                              std::string& OutDiagnostic)
{
    WorldPlumeInstance Entry{};
    Entry.Id             = "plume_" + std::to_string(Plumes.size());
    Entry.Name           = Name;
    Entry.PresetIdentity = PresetId;
    Entry.OriginWorld    = OriginWorld;
    Entry.FollowsVehicle = FollowsVehicle;
    Entry.Settings       = ConstructPresetSettings(PresetId);
    Entry.Solver         = std::make_unique<PyroVolumeSolver>();

    if (FollowsVehicle)
    {
        // Dedicated rolling 4-wheel tyre smoke & fire lattice around ControlVehicle
        Entry.Settings.LatticeResolution = 48;
        Entry.Settings.BoundsWidth       = 7.6f;
        Entry.Settings.BoundsHeight      = 4.2f;
        Entry.Settings.DynamicBounds     = false;
        Entry.Settings.EmitterEnabled    = false;   // fed purely by TyreSmokeIntake 4-wheel projection!
        Entry.Settings.ObstacleType      = 0;
        Entry.Settings.ColorPalette      = 0;
        Entry.Settings.DensityExtinction = 15.5f;
        Entry.Settings.SmokeAlbedo       = 0.82f;
        Entry.Settings.Buoyancy          = 3.4f;
        Entry.Settings.SmokeDissipation  = 0.22f;
    }
    else
    {
        // Keep default multi-plume world fast & crisp out-of-the-box; user can dial up to 128^3 anytime!
        Entry.Settings.LatticeResolution = std::min(Entry.Settings.LatticeResolution, 48);
        Entry.Settings.ObstacleType      = 0; // world SDF provides actual 3D course + car collision!
    }
    Entry.PresetBaseline = Entry.Settings;

    if (!Entry.Solver->Initialize(VkCtx, Entry.Settings, OutDiagnostic))
        return false;

    Plumes.push_back(std::move(Entry));
    return true;
}

bool FrontierEditorWorkspace::Initialize(VulkanContext& VkCtx, const FacetArchiveData* Body,
                                         const FacetArchiveData* Tyre, const FacetArchiveData* Rim,
                                         std::string& OutDiagnostic)
{
    if (!SdfWorld.Initialize(VkCtx, Body, Tyre, Rim, OutDiagnostic))
        return false;
    GasSettings FallbackSettings{};
    FallbackSettings.LatticeResolution = 48;
    if (!StandaloneFallbackSolver.Initialize(VkCtx, FallbackSettings, OutDiagnostic))
        return false;

    Plumes.clear();
    // 0: Vehicle tyre smoke & fire domain (follows ControlVehicle)
    if (!SpawnWorldPlume(VkCtx, "Tyre smoke & fire", "tyre_burnout", { 0.0f, 0.0f, 0.0f }, true, OutDiagnostic))
        return false;

    // 1: Camp fire plume beside the lane (casts flickering fire light onto road + ControlVehicle!)
    if (!SpawnWorldPlume(VkCtx, "Camp fire plume", "camp_fire", { 5.2f, 2.45f, 0.0f }, false, OutDiagnostic))
        return false;

    // 2: Deflector smoke plume rising upwind of & wrapping around the 3D SDF Deflector Sphere at (6.2, -2.35, 0.82)!
    if (!SpawnWorldPlume(VkCtx, "Deflector smoke", "obstacle_deflection", { 5.38f, -2.35f, 0.0f }, false, OutDiagnostic))
        return false;
    Plumes.back().Settings.BoundsWidth           = 3.6f;
    Plumes.back().Settings.BoundsHeight          = 3.6f;
    Plumes.back().Settings.EmitterFuel           = 0.0f;
    Plumes.back().Settings.EmitterTemperature    = 1.25f;
    Plumes.back().Settings.SmokeWeight           = 0.25f;
    Plumes.back().Settings.EmitterSmoke          = 3.8f;
    Plumes.back().Settings.SmokeAlbedo           = 0.72f;
    Plumes.back().Settings.EmitterUpwardVelocity = 2.8f;
    Plumes.back().Settings.WindX                 = 2.8f;
    Plumes.back().PresetBaseline                 = Plumes.back().Settings;

    // 3: Vortex / Blast pad down the straight between the twin SDF pillars!
    if (!SpawnWorldPlume(VkCtx, "Vortex / Blast pad", "wildfire_tornado", { 11.6f, 0.0f, 0.0f }, false, OutDiagnostic))
        return false;
    Plumes.back().Settings.BoundsWidth  = 4.2f;
    Plumes.back().Settings.BoundsHeight = 5.4f;
    Plumes.back().PresetBaseline        = Plumes.back().Settings;

    SelectedCategory   = SelectedSubjectCategory::Plume;
    SelectedPlumeIndex = 0u;
    Initialized        = true;
    return true;
}

void FrontierEditorWorkspace::Shutdown(VulkanContext& VkCtx) noexcept
{
    for (WorldPlumeInstance& Plume : Plumes)
    {
        if (Plume.Solver)
            Plume.Solver->Shutdown(VkCtx);
    }
    Plumes.clear();
    StandaloneFallbackSolver.Shutdown(VkCtx);
    SdfWorld.Shutdown(VkCtx);
    Initialized = false;
}

void FrontierEditorWorkspace::SelectPlume(size_t PlumeIndex) noexcept
{
    if (PlumeIndex < Plumes.size())
    {
        SelectedCategory   = SelectedSubjectCategory::Plume;
        SelectedPlumeIndex = PlumeIndex;
        InspectorScrollY   = 0.0f;
    }
}

void FrontierEditorWorkspace::OpenFluidEditorForPlume(size_t PlumeIndex)
{
    if (PlumeIndex >= Plumes.size())
        return;
    SelectedCategory          = SelectedSubjectCategory::Plume;
    SelectedPlumeIndex        = PlumeIndex;
    WorldPlumeInstance& Plume = Plumes[PlumeIndex];
    FluidWorkspace.OpenForExternalDomain(Plume.Name, Plume.PresetIdentity, &Plume.Settings, Plume.Solver.get());
    FluidEditorOpen           = true;
}

bool FrontierEditorWorkspace::WantsVehicleDrivingInput() const noexcept
{
    return !FluidEditorOpen && PopupId.empty() && ActiveDragKey.empty();
}

//----------------------------------------------------------------------------------------------------------------------
//                                    WORLD SDF + TYRE SMOKE + PLUME SIMULATION
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::UpdateWorldSimulation(VulkanContext& VkCtx, LobbySession& Game,
                                                    const CameraController& Camera, float DtSeconds,
                                                    int ViewportW, int ViewportH)
{
    const bool ProvingGrounds = (Game.QueryCurrentLevelPath().find("ProvingGrounds") != std::string::npos);
    DeployableUnit* LocalCar  = Game.QueryLocalVehicle();

    // Advance tyre slip, 3-node heat conduction, abrasion, and overheat ignition on ControlVehicle
    if (LocalCar && DtSeconds > 0.0f)
    {
        const auto Pos = LocalCar->QueryPositionMetres();
        const float GroundZ = WorldSdfScene::ResolveCourseHeight(Pos[0], Pos[1], ProvingGrounds);
        TyreIntake.Advance(*LocalCar, DtSeconds, GroundZ);
    }

    VehicleInspect.Advance(DtSeconds);

    // Gather all SessionSpace vehicles into WorldVehicleRig list (velocity, yaw-rate, wheel steer/spin, thermal glow)
    std::vector<WorldVehicleRig> WorldVehicles;
    for (const PlayerProfile& Player : Game.QuerySession().QueryPlayers())
    {
        const DeployableUnit* Unit = Game.QuerySession().FindUnit(Player.Token);
        if (!Unit)
            continue;

        WorldVehicleRig Rig{};
        Rig.Visual.PositionMetres = Unit->QueryPositionMetres();
        Rig.Visual.YawDegrees     = Unit->QueryYawDegrees();
        Rig.Visual.Paint          = (Unit == LocalCar) ? VehiclePaintRgb : std::array<float, 3>{ 0.20f, 0.21f, 0.23f };
        Rig.Visual.Inspection     = (Unit == LocalCar) ? VehicleInspect  : VehicleInspection{};

        if (Unit == LocalCar)
        {
            if (HasPrevCar && DtSeconds > 1e-5f)
            {
                Rig.VelocityMps = {
                    (Rig.Visual.PositionMetres[0] - PrevCarPos[0]) / DtSeconds,
                    (Rig.Visual.PositionMetres[1] - PrevCarPos[1]) / DtSeconds,
                    (Rig.Visual.PositionMetres[2] - PrevCarPos[2]) / DtSeconds,
                };
                float DeltaYaw = Rig.Visual.YawDegrees - PrevCarYaw;
                while (DeltaYaw >  180.0f) DeltaYaw -= 360.0f;
                while (DeltaYaw < -180.0f) DeltaYaw += 360.0f;
                Rig.YawRateRad = (DeltaYaw * 0.0174532925f) / DtSeconds;
            }
            PrevCarPos = Rig.Visual.PositionMetres;
            PrevCarYaw = Rig.Visual.YawDegrees;
            HasPrevCar = true;

            const auto& Wheels = TyreIntake.QueryWheels();
            for (size_t WIdx = 0u; WIdx < 4u; ++WIdx)
            {
                Rig.WheelSteerRad[WIdx]  = Wheels[WIdx].SteerRadians;
                Rig.WheelSpinRad[WIdx]   = Wheels[WIdx].SpinRadians;
                Rig.WheelHeatRatio[WIdx] = std::clamp((Wheels[WIdx].SurfaceKelvin - 353.15f) / 320.0f, 0.0f, 1.0f);
            }
        }
        WorldVehicles.push_back(Rig);
    }

    // Collect dynamic fire lights (from burning tyres + active luminous world fire plumes!)
    std::vector<DynamicFireLight> FireLights;
    for (WorldPlumeInstance& Plume : Plumes)
    {
        if (!Plume.Visible || !Plume.Solver)
            continue;

        // In the Lobby studio, only show the vehicle's tyre plume unless explicitly placed
        if (!ProvingGrounds && !Plume.FollowsVehicle)
            continue;

        if (Plume.FollowsVehicle && LocalCar)
        {
            const auto Pos      = LocalCar->QueryPositionMetres();
            const float GroundZ = WorldSdfScene::ResolveCourseHeight(Pos[0], Pos[1], ProvingGrounds);
            Plume.OriginWorld   = { Pos[0], Pos[1], GroundZ };

            PyroExternalSource WheelSources[8]{};
            const PyroBoundsBox Bounds = Plume.Solver->ComputeBoundsBox(Plume.Settings);
            const int SrcCount = TyreIntake.ProjectIntoDomain(Plume.OriginWorld, Bounds, WheelSources, 8, FireLights);
            Plume.Solver->AssignExternalSources(WheelSources, SrcCount);
            TyreIntake.AdaptTyreDomainAppearance(Plume.Settings);
        }
        else
        {
            Plume.Solver->AssignExternalSources(nullptr, 0);
            if (Plume.Settings.FireIntensity > 0.2f && (Plume.Settings.EmitterFuel > 0.1f || Plume.Settings.ShrapnelEnabled))
            {
                const float Flicker = 0.88f + 0.12f * std::sin(Plume.Solver->QuerySimulationSeconds() * 13.7f + Plume.OriginWorld[0]);
                DynamicFireLight Glow{};
                Glow.PositionWorld  = { Plume.OriginWorld[0], Plume.OriginWorld[1], Plume.OriginWorld[2] + 0.95f };
                Glow.RadiusMetres   = std::clamp(Plume.Settings.BoundsWidth * 2.4f, 3.5f, 12.0f);
                Glow.RadianceLinear = {
                    1.55f * Flicker * Plume.Settings.FireIntensity * 0.35f,
                    0.68f * Flicker * Plume.Settings.FireIntensity * 0.35f,
                    0.18f * Flicker * Plume.Settings.FireIntensity * 0.35f,
                };
                FireLights.push_back(Glow);
            }
        }

        // Upload 3D World SDF + moving ControlVehicle wake into the plume's uWorldSdfTex!
        if (Plume.SdfCollision || Plume.VehicleWake)
        {
            const uint32_t RefreshPeriod = Plume.FollowsVehicle ? 2u : 4u;
            if ((Plume.SdfRefreshTick++ % RefreshPeriod) == 0u)
            {
                std::vector<WorldVehicleRig> EmptyCars;
                const auto& CarsForSdf = Plume.VehicleWake ? WorldVehicles : EmptyCars;
                const PyroBoundsBox Bounds = Plume.Solver->ComputeBoundsBox(Plume.Settings);
                SdfWorld.BuildDomainSdfAtlas(Plume.OriginWorld, Bounds,
                                             Plume.Solver->QueryLatticeResolution(),
                                             Plume.Solver->QueryTilesX(),
                                             Plume.Solver->QueryTilesY(),
                                             ProvingGrounds, SdfObstaclesEnabled && Plume.SdfCollision,
                                             CarsForSdf, Plume.SdfScratch);
                Plume.Solver->UploadWorldSdfAtlas(VkCtx, Plume.SdfScratch.data(), Plume.SdfScratch.size());
            }
        }
        else
        {
            Plume.Solver->DisableWorldSdf();
        }

        if (!Plume.Settings.Paused && DtSeconds > 0.0f)
            Plume.Solver->AdvanceSimulation(VkCtx, Plume.Settings, DtSeconds);
    }

    // Resolve camera and render opaque 3D SDF world + GPU .facet ControlVehicle + depth-composited Pyro domains!
    const InputRoutingPolicy Policy = Game.QuerySession().QueryPolicy()
                                    ? Game.QuerySession().QueryPolicy()->QueryInputRoutingPolicy()
                                    : InputRoutingPolicy{};
    PresentationCamera PresCam      = Camera.Resolve(Policy, LocalCar);
    LatestWorldCam                  = BuildWorldCameraFromPresentation(PresCam,
                                          static_cast<float>(ViewportW) / static_cast<float>(std::max(1, ViewportH)));

    if (SdfWorld.BeginWorldFrame(VkCtx, ViewportW, ViewportH, ProvingGrounds, SdfObstaclesEnabled,
                                 LatestWorldCam, Environment, WorldVehicles, FireLights))
    {
        // Sort visible plumes back-to-front relative to camera Eye for exact Beer-Lambert compositing
        std::vector<size_t> Order;
        for (size_t Idx = 0u; Idx < Plumes.size(); ++Idx)
        {
            if (!Plumes[Idx].Visible || !Plumes[Idx].Solver)
                continue;
            if (!ProvingGrounds && !Plumes[Idx].FollowsVehicle)
                continue;
            Order.push_back(Idx);
        }
        std::sort(Order.begin(), Order.end(), [&](size_t A, size_t B)
        {
            const auto& Oa = Plumes[A].OriginWorld;
            const auto& Ob = Plumes[B].OriginWorld;
            const float Da = (Oa[0] - LatestWorldCam.Eye[0]) * (Oa[0] - LatestWorldCam.Eye[0])
                           + (Oa[1] - LatestWorldCam.Eye[1]) * (Oa[1] - LatestWorldCam.Eye[1])
                           + (Oa[2] - LatestWorldCam.Eye[2]) * (Oa[2] - LatestWorldCam.Eye[2]);
            const float Db = (Ob[0] - LatestWorldCam.Eye[0]) * (Ob[0] - LatestWorldCam.Eye[0])
                           + (Ob[1] - LatestWorldCam.Eye[1]) * (Ob[1] - LatestWorldCam.Eye[1])
                           + (Ob[2] - LatestWorldCam.Eye[2]) * (Ob[2] - LatestWorldCam.Eye[2]);
            return Da > Db;
        });

        for (size_t Idx : Order)
        {
            SdfWorld.CompositeDomainIntoWorld(VkCtx, *Plumes[Idx].Solver, Plumes[Idx].Settings,
                                              Plumes[Idx].OriginWorld, LatestWorldCam);
        }
        SdfWorld.EndWorldFrame(VkCtx);
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                             LEFT OUTLINER PANE
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::DrawFrontierOutliner(ImDrawList* Draw, const PaneRect& Pane,
                                                   LobbySession& Game, Everest::NavigationApp& Navigation,
                                                   VulkanContext& VkCtx)
{
    Draw->AddRectFilled({ Pane.MinX, Pane.MinY }, { Pane.MaxX, Pane.MaxY }, PaneFill);
    Draw->AddRectFilled({ Pane.MaxX - 1.0f, Pane.MinY }, { Pane.MaxX, Pane.MaxY }, RuleLine);

    float PenY = Pane.MinY + 10.0f;
    const float Left  = Pane.MinX + 14.0f;
    const float Right = Pane.MaxX - 14.0f;

    // Brand header: frontier. ENGINE / 01
    Typo::DrawBoxText(Draw, RegularFont, Left, PenY, 22.0f, 15.0f, BrightInk, "frontier.");
    Typo::DrawTrackedText(Draw, LightFont, Right - 66.0f, PenY, 22.0f, 8.5f, SoftInk, "ENGINE / 01", 0.8f);
    PenY += 28.0f;

    // Active Scene / Route switcher (Lobby | Proving Grounds)
    Typo::DrawTrackedText(Draw, LightFont, Left, PenY, 16.0f, 8.5f, DimInk, "WORKSPACE", 1.0f);
    PenY += 18.0f;
    const auto& Destinations = Navigation.QueryDestinations();
    const float RouteBtnW    = (Right - Left - 6.0f) * 0.5f;
    for (size_t Idx = 0u; Idx < std::min<size_t>(2u, Destinations.size()); ++Idx)
    {
        const bool IsCur = Navigation.IsCurrent(Game, Destinations[Idx]);
        const PaneRect RBox{ Left + static_cast<float>(Idx) * (RouteBtnW + 6.0f), PenY,
                             Left + static_cast<float>(Idx) * (RouteBtnW + 6.0f) + RouteBtnW, PenY + 25.0f };
        if (PaintButton(Draw, LightFont, RBox, 9.5f, Destinations[Idx].Label.c_str(), IsCur, PopupId))
        {
            Navigation.Navigate(Game, Idx + 1u);
            HasPrevCar = false;
        }
    }
    PenY += 33.0f;

    // Enabled / Disabled count tiles
    uint32_t EnabledObjects = 3u; // Sun + ControlVehicle + Course
    uint32_t TotalObjects   = 3u + static_cast<uint32_t>(Plumes.size());
    for (const WorldPlumeInstance& P : Plumes)
        if (P.Visible) ++EnabledObjects;

    const float HalfTile = (Right - Left - 6.0f) * 0.5f;
    const PaneRect TileA{ Left, PenY, Left + HalfTile, PenY + 38.0f };
    const PaneRect TileB{ Left + HalfTile + 6.0f, PenY, Right, PenY + 38.0f };
    PaintBox(Draw, TileA, CardFill, CardEdge, 5.0f);
    PaintBox(Draw, TileB, CardFill, CardEdge, 5.0f);
    char NumA[16], NumB[16];
    std::snprintf(NumA, sizeof(NumA), "%u", EnabledObjects);
    std::snprintf(NumB, sizeof(NumB), "%u", TotalObjects - EnabledObjects);
    Typo::DrawBoxText(Draw, LightFont, TileA.MinX + 8.0f, PenY + 3.0f, 14.0f, 8.5f, SoftInk, "Enabled");
    Typo::DrawBoxText(Draw, RegularFont, TileA.MinX + 8.0f, PenY + 17.0f, 18.0f, 12.0f, BrightInk, NumA);
    Typo::DrawBoxText(Draw, LightFont, TileB.MinX + 8.0f, PenY + 3.0f, 14.0f, 8.5f, SoftInk, "Hidden");
    Typo::DrawBoxText(Draw, RegularFont, TileB.MinX + 8.0f, PenY + 17.0f, 18.0f, 12.0f, MidInk, NumB);
    PenY += 46.0f;

    Draw->AddRectFilled({ Pane.MinX, PenY }, { Pane.MaxX, PenY + 1.0f }, RuleLine);
    PenY += 6.0f;

    // Outliner header + "+ Plume" spawn button
    Typo::DrawTrackedText(Draw, LightFont, Left, PenY, 24.0f, 9.5f, MidInk, "OUTLINER", 1.2f);
    const PaneRect AddPlumeBtn{ Right - 68.0f, PenY + 1.0f, Right, PenY + 23.0f };
    if (PaintButton(Draw, RegularFont, AddPlumeBtn, 9.5f, "+ Plume", false, PopupId))
    {
        std::string Diag;
        const float OffsetX = 7.5f + static_cast<float>(Plumes.size()) * 2.2f;
        if (SpawnWorldPlume(VkCtx, "Smoke plume " + std::to_string(Plumes.size()), "ue5_pyro_default",
                            { OffsetX, 1.8f, 0.0f }, false, Diag))
        {
            SelectPlume(Plumes.size() - 1u);
        }
    }
    PenY += 28.0f;

    auto DrawGroupHeader = [&](int GroupIdx, const char* Title)
    {
        const PaneRect Hdr{ Left - 4.0f, PenY, Right + 4.0f, PenY + 22.0f };
        const float Cy = PenY + 11.0f;
        if (!GroupCollapsed[GroupIdx])
        {
            Draw->AddLine({ Left + 2.0f, Cy - 2.0f }, { Left + 5.5f, Cy + 2.0f }, SoftInk, 1.2f);
            Draw->AddLine({ Left + 5.5f, Cy + 2.0f }, { Left + 9.0f, Cy - 2.0f }, SoftInk, 1.2f);
        }
        else
        {
            Draw->AddLine({ Left + 3.5f, Cy - 3.5f }, { Left + 7.5f, Cy }, SoftInk, 1.2f);
            Draw->AddLine({ Left + 7.5f, Cy }, { Left + 3.5f, Cy + 3.5f }, SoftInk, 1.2f);
        }
        Typo::DrawBoxText(Draw, RegularFont, Left + 15.0f, PenY, 22.0f, 10.0f, SoftInk, Title);
        if (HitClicked(Hdr, PopupId))
            GroupCollapsed[GroupIdx] = !GroupCollapsed[GroupIdx];
        PenY += 23.0f;
    };

    auto DrawSubjectRow = [&](const char* Label, const char* Badge, ImU32 DotCol, bool Selected,
                              bool* TogglePtr, bool ShowEditBtn, size_t EditPlumeIdx) -> bool
    {
        const PaneRect RBox{ Left - 4.0f, PenY, Right + 4.0f, PenY + 26.0f };
        if (Selected)
            PaintBox(Draw, RBox, ChosenFill, ChosenEdge, 4.0f);
        else if (HitHovered(RBox, PopupId))
            PaintBox(Draw, RBox, CardFill, 0u, 4.0f);

        Draw->AddCircleFilled({ Left + 8.0f, PenY + 13.0f }, 3.5f, DotCol, 12);
        Typo::DrawBoxText(Draw, LightFont, Left + 18.0f, PenY, 26.0f, 10.5f,
                          (!TogglePtr || *TogglePtr) ? (Selected ? BrightInk : MidInk) : DimInk, Label);

        float RightCursor = Right;
        if (TogglePtr)
        {
            const PaneRect SwBox{ RightCursor - 26.0f, PenY + 6.0f, RightCursor, PenY + 20.0f };
            PaintSwitch(Draw, SwBox.MinX, SwBox.MinY, *TogglePtr);
            if (HitClicked(SwBox, PopupId))
            {
                *TogglePtr = !(*TogglePtr);
                PenY += 27.0f;
                return false;
            }
            RightCursor -= 32.0f;
        }

        if (ShowEditBtn)
        {
            const PaneRect EditBtn{ RightCursor - 34.0f, PenY + 4.0f, RightCursor, PenY + 22.0f };
            if (PaintButton(Draw, RegularFont, EditBtn, 8.5f, "Edit", false, PopupId, true))
            {
                OpenFluidEditorForPlume(EditPlumeIdx);
                PenY += 27.0f;
                return false;
            }
            RightCursor -= 38.0f;
        }
        else if (Badge && *Badge)
        {
            Typo::DrawBoxText(Draw, LightFont, RightCursor, PenY, 26.0f, 9.0f, DimInk, Badge, Typo::TextAnchor::End);
        }

        const bool RowClicked = HitClicked(RBox, PopupId);
        if (RowClicked && ShowEditBtn && ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left))
            OpenFluidEditorForPlume(EditPlumeIdx);

        PenY += 27.0f;
        return RowClicked;
    };

    // Group 0: Environment
    DrawGroupHeader(0, "Environment");
    if (!GroupCollapsed[0])
    {
        if (DrawSubjectRow("Sun & sky", "Light", AmberInk,
                           SelectedCategory == SelectedSubjectCategory::Environment, nullptr, false, 0u))
        {
            SelectedCategory = SelectedSubjectCategory::Environment;
        }
    }

    // Group 1: Vehicle (ControlVehicle + Tyre smoke & fire!)
    DrawGroupHeader(1, "Vehicle");
    if (!GroupCollapsed[1])
    {
        if (DrawSubjectRow("ControlVehicle", "Car", AzureInk,
                           SelectedCategory == SelectedSubjectCategory::Vehicle, nullptr, false, 0u))
        {
            SelectedCategory = SelectedSubjectCategory::Vehicle;
        }
        for (size_t Idx = 0u; Idx < Plumes.size(); ++Idx)
        {
            if (!Plumes[Idx].FollowsVehicle)
                continue;
            const ImU32 Dot = TyreIntake.HasAnyBurningTyre() ? FlameInk : AmberInk;
            if (DrawSubjectRow(Plumes[Idx].Name.c_str(), "", Dot,
                               SelectedCategory == SelectedSubjectCategory::Plume && SelectedPlumeIndex == Idx,
                               &Plumes[Idx].Visible, true, Idx))
            {
                SelectPlume(Idx);
            }
        }
    }

    // Group 2: Effects (World Smoke / Fire / Tornado / Blast Plumes)
    DrawGroupHeader(2, "Effects (Smoke & Pyro)");
    if (!GroupCollapsed[2])
    {
        for (size_t Idx = 0u; Idx < Plumes.size(); ++Idx)
        {
            if (Plumes[Idx].FollowsVehicle)
                continue;
            const ImU32 Dot = (Plumes[Idx].Settings.EmitterFuel > 0.1f) ? AmberInk : AzureInk;
            if (DrawSubjectRow(Plumes[Idx].Name.c_str(), "", Dot,
                               SelectedCategory == SelectedSubjectCategory::Plume && SelectedPlumeIndex == Idx,
                               &Plumes[Idx].Visible, true, Idx))
            {
                SelectPlume(Idx);
            }
        }
    }

    // Group 3: Level (3D SDF Course & Obstacles)
    DrawGroupHeader(3, "Level (3D SDF)");
    if (!GroupCollapsed[3])
    {
        if (DrawSubjectRow("SDF Course & Obstacles", "SDF", GreenInk,
                           SelectedCategory == SelectedSubjectCategory::Level, &SdfObstaclesEnabled, false, 0u))
        {
            SelectedCategory = SelectedSubjectCategory::Level;
        }
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                         CENTRE 3D SDF WORLD VIEWPORT
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::DrawFrontierViewport(ImDrawList* Draw, const PaneRect& Pane,
                                                   LobbySession& Game, Everest::NavigationApp& Navigation,
                                                   CameraController& Camera, VulkanContext& VkCtx)
{
    (void)Navigation;
    (void)VkCtx;
    // Top Viewport Toolbar
    const PaneRect Bar{ Pane.MinX, Pane.MinY, Pane.MaxX, Pane.MinY + TopBarHeight };
    Draw->AddRectFilled({ Bar.MinX, Bar.MinY }, { Bar.MaxX, Bar.MaxY }, TopBarFill);
    Draw->AddRectFilled({ Bar.MinX, Bar.MaxY - 1.0f }, { Bar.MaxX, Bar.MaxY }, RuleLine);

    float BarX = Bar.MinX + 12.0f;
    const float BtnY = Bar.MinY + 7.0f;

    const PaneRect PanelsBtn{ BarX, BtnY, BarX + 68.0f, BtnY + 26.0f };
    if (PaintButton(Draw, LightFont, PanelsBtn, 10.0f, SidePanelsVisible ? "Panels" : "Show UI", SidePanelsVisible, PopupId))
        SidePanelsVisible = !SidePanelsVisible;
    BarX = PanelsBtn.MaxX + 6.0f;

    const PaneRect BurnoutBtn{ BarX, BtnY, BarX + 108.0f, BtnY + 26.0f };
    if (PaintButton(Draw, RegularFont, BurnoutBtn, 10.0f,
                    TyreIntake.BurnoutLineLock ? "Burnout: ON (B)" : "Burnout Lock (B)",
                    TyreIntake.BurnoutLineLock, PopupId))
    {
        TyreIntake.BurnoutLineLock = !TyreIntake.BurnoutLineLock;
    }
    BarX = BurnoutBtn.MaxX + 6.0f;

    const PaneRect BlastBtn{ BarX, BtnY, BarX + 94.0f, BtnY + 26.0f };
    if (PaintButton(Draw, LightFont, BlastBtn, 10.0f, "Detonate Pad", false, PopupId))
    {
        for (WorldPlumeInstance& P : Plumes)
        {
            if (!P.FollowsVehicle && P.Solver)
                P.Solver->TriggerBurstSequence(P.Settings, "shrapnel");
        }
    }
    BarX = BlastBtn.MaxX + 6.0f;

    // Prominent quick-launch button for FluidEditor on the selected plume!
    if (SelectedCategory == SelectedSubjectCategory::Plume && SelectedPlumeIndex < Plumes.size())
    {
        float RightX = Bar.MaxX - 12.0f;
        const std::string OpenText = "Open FluidEditor: " + Plumes[SelectedPlumeIndex].Name + " ->";
        const float OpenW = std::min(270.0f, Typo::MeasureTextWidth(RegularFont, 10.0f, OpenText.c_str()) + 22.0f);
        const PaneRect OpenBtn{ RightX - OpenW, BtnY, RightX, BtnY + 26.0f };
        if (PaintButton(Draw, RegularFont, OpenBtn, 10.0f, OpenText.c_str(), false, PopupId, true))
            OpenFluidEditorForPlume(SelectedPlumeIndex);
    }

    // 3D GPU SDF World Image
    const PaneRect Canvas{ Pane.MinX, Bar.MaxY, Pane.MaxX, Pane.MaxY };
    Draw->AddRectFilled({ Canvas.MinX, Canvas.MinY }, { Canvas.MaxX, Canvas.MaxY }, ShellBg);

    if (SdfWorld.QueryColorUiToken() != 0u)
    {
        Draw->AddImage(static_cast<ImTextureID>(SdfWorld.QueryColorUiToken()),
                       { Canvas.MinX, Canvas.MinY }, { Canvas.MaxX, Canvas.MaxY },
                       { 0.0f, 0.0f }, { 1.0f, 1.0f });
    }

    // Mouse drag in viewport routes to CameraController look axes!
    const ImGuiIO& Io = ImGui::GetIO();
    if (PopupId.empty() && Canvas.Contains(Io.MousePos)
        && (ImGui::IsMouseClicked(ImGuiMouseButton_Right) || ImGui::IsMouseClicked(ImGuiMouseButton_Left)))
    {
        // Check if user clicked on a 3D plume handle first!
        bool PickedHandle = false;
        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left))
        {
            for (size_t Idx = 0u; Idx < Plumes.size(); ++Idx)
            {
                ImVec2 ScreenPt{};
                const std::array<float, 3> HandlePt = {
                    Plumes[Idx].OriginWorld[0], Plumes[Idx].OriginWorld[1], Plumes[Idx].OriginWorld[2] + 0.35f
                };
                if (ProjectWorldToScreen(HandlePt, LatestWorldCam, Canvas, ScreenPt))
                {
                    const float Dx = Io.MousePos.x - ScreenPt.x;
                    const float Dy = Io.MousePos.y - ScreenPt.y;
                    if (Dx * Dx + Dy * Dy <= 144.0f)
                    {
                        SelectPlume(Idx);
                        if (ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left))
                            OpenFluidEditorForPlume(Idx);
                        PickedHandle = true;
                        break;
                    }
                }
            }
        }
        if (!PickedHandle)
        {
            OrbitingSceneView = true;
            PrevSceneMouse    = Io.MousePos;
        }
    }

    if (OrbitingSceneView && (ImGui::IsMouseDown(ImGuiMouseButton_Left) || ImGui::IsMouseDown(ImGuiMouseButton_Right)))
    {
        const float Dx = Io.MousePos.x - PrevSceneMouse.x;
        const float Dy = Io.MousePos.y - PrevSceneMouse.y;
        PrevSceneMouse = Io.MousePos;
        if (std::fabs(Dx) > 0.2f || std::fabs(Dy) > 0.2f)
        {
            InputPacket LookPkt{};
            LookPkt.LookYawDelta   = std::clamp(Dx * 0.0045f, -0.25f, 0.25f);
            LookPkt.LookPitchDelta = std::clamp(-Dy * 0.0045f, -0.25f, 0.25f);
            const InputRoutingPolicy Policy = Game.QuerySession().QueryPolicy()
                                            ? Game.QuerySession().QueryPolicy()->QueryInputRoutingPolicy()
                                            : InputRoutingPolicy{};
            Camera.Step(LookPkt, Policy, Game.QueryLocalVehicle());
        }
    }
    else
    {
        OrbitingSceneView = false;
    }

    // Draw subtle 3D markers & selected domain wireframe in the world viewport
    Draw->PushClipRect({ Canvas.MinX, Canvas.MinY }, { Canvas.MaxX, Canvas.MaxY }, true);
    const bool ProvingGrounds = (Game.QueryCurrentLevelPath().find("ProvingGrounds") != std::string::npos);
    for (size_t Idx = 0u; Idx < Plumes.size(); ++Idx)
    {
        if (!ProvingGrounds && !Plumes[Idx].FollowsVehicle)
            continue;
        const WorldPlumeInstance& P = Plumes[Idx];
        const bool IsSel = (SelectedCategory == SelectedSubjectCategory::Plume && SelectedPlumeIndex == Idx);

        ImVec2 MarkerPt{};
        if (ProjectWorldToScreen({ P.OriginWorld[0], P.OriginWorld[1], P.OriginWorld[2] + 0.35f },
                                 LatestWorldCam, Canvas, MarkerPt))
        {
            Draw->AddCircleFilled(MarkerPt, IsSel ? 5.5f : 4.0f, IsSel ? AmberInk : IM_COL32(220, 220, 220, 180), 14);
            Draw->AddCircle(MarkerPt, IsSel ? 8.5f : 6.5f, IsSel ? AmberInk : IM_COL32(0, 0, 0, 180), 14, 1.3f);
            if (IsSel)
                Typo::DrawBoxText(Draw, RegularFont, MarkerPt.x + 11.0f, MarkerPt.y - 8.0f, 16.0f, 9.5f, AmberInk, P.Name.c_str());
        }

        if (IsSel && ShowSelectedBounds && P.Solver)
        {
            const PyroBoundsBox B = P.Solver->ComputeBoundsBox(P.Settings);
            const float X0 = P.OriginWorld[0] + B.BoxMin[0], X1 = P.OriginWorld[0] + B.BoxMax[0];
            const float Y0 = P.OriginWorld[1] + B.BoxMin[2], Y1 = P.OriginWorld[1] + B.BoxMax[2];
            const float Z0 = P.OriginWorld[2] + B.BoxMin[1] + 0.6f, Z1 = P.OriginWorld[2] + B.BoxMax[1] + 0.6f;
            const std::array<float, 3> Corners[8] = {
                { X0, Y0, Z0 }, { X1, Y0, Z0 }, { X1, Y1, Z0 }, { X0, Y1, Z0 },
                { X0, Y0, Z1 }, { X1, Y0, Z1 }, { X1, Y1, Z1 }, { X0, Y1, Z1 },
            };
            static constexpr int Edges[12][2] = {
                {0,1},{1,2},{2,3},{3,0}, {4,5},{5,6},{6,7},{7,4}, {0,4},{1,5},{2,6},{3,7}
            };
            for (const auto& E : Edges)
            {
                ImVec2 Sa{}, Sb{};
                if (ProjectWorldToScreen(Corners[E[0]], LatestWorldCam, Canvas, Sa)
                    && ProjectWorldToScreen(Corners[E[1]], LatestWorldCam, Canvas, Sb))
                {
                    Draw->AddLine(Sa, Sb, IM_COL32(255, 184, 84, 96), 1.15f);
                }
            }
        }
    }

    // Live driving & tyre HUD pill in bottom-left of viewport
    if (const DeployableUnit* Car = Game.QueryLocalVehicle())
    {
        char Telemetry[160];
        std::snprintf(Telemetry, sizeof(Telemetry),
                      "WASD Drive  |  Space Handbrake  |  B Burnout Lock  |  C Camera (%s)  |  Speed %.1f km/h  |  Peak Tyre %.0f \xc2\xb0""C%s",
                      Camera.IsChaseView() ? "Chase" : "Orbit",
                      static_cast<double>(std::fabs(Car->QueryForwardSpeedMps()) * 3.6f),
                      static_cast<double>(TyreIntake.QueryPeakSurfaceCelsius()),
                      TyreIntake.HasAnyBurningTyre() ? " [IGNITED!]" : "");
        const float PillW = Typo::MeasureTextWidth(LightFont, 9.5f, Telemetry) + 22.0f;
        const PaneRect HudBox{ Canvas.MinX + 12.0f, Canvas.MaxY - 34.0f,
                               std::min(Canvas.MaxX - 12.0f, Canvas.MinX + 12.0f + PillW), Canvas.MaxY - 10.0f };
        PaintBox(Draw, HudBox, IM_COL32(14, 14, 14, 204), CardEdge, 6.0f);
        Typo::DrawBoxText(Draw, LightFont, HudBox.MinX + 11.0f, HudBox.MinY, HudBox.Height(), 9.5f,
                          TyreIntake.HasAnyBurningTyre() ? FlameInk : MidInk, Telemetry);
    }
    Draw->PopClipRect();
}

//----------------------------------------------------------------------------------------------------------------------
//                                   RIGHT INSPECTOR & GASCARDSURFACE
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::DrawGasCardInspector(ImDrawList* Draw, const PaneRect& ScrollBox,
                                                   WorldPlumeInstance& Plume, size_t PlumeIndex,
                                                   VulkanContext& VkCtx)
{
    const float ContentH = Plume.FollowsVehicle ? 980.0f : 900.0f;
    const float MaxScroll= std::max(0.0f, ContentH - ScrollBox.Height());
    if (HitHovered(ScrollBox, PopupId) && std::fabs(ImGui::GetIO().MouseWheel) > 1e-4f)
        InspectorScrollY = std::clamp(InspectorScrollY - ImGui::GetIO().MouseWheel * 36.0f, 0.0f, MaxScroll);
    InspectorScrollY = std::clamp(InspectorScrollY, 0.0f, MaxScroll);

    Draw->PushClipRect({ ScrollBox.MinX, ScrollBox.MinY }, { ScrollBox.MaxX, ScrollBox.MaxY }, true);
    float PenY        = ScrollBox.MinY + 10.0f - InspectorScrollY;
    const float Left  = ScrollBox.MinX + 12.0f;
    const float Right = ScrollBox.MaxX - 12.0f;

    // 1. Prominent "Open FluidEditor" Launch Card
    const PaneRect LaunchCard{ Left, PenY, Right, PenY + 42.0f };
    if (PaintButton(Draw, RegularFont, LaunchCard, 11.0f, "Open FluidEditor (85 Parameters & 18 Presets) ->",
                    false, PopupId, true) && ScrollBox.Contains(ImGui::GetIO().MousePos))
    {
        OpenFluidEditorForPlume(PlumeIndex);
    }
    PenY += 50.0f;

    // 2. State Tiles: Visible | SDF World | Car Wake
    const float TileW = (Right - Left - 8.0f) / 3.0f;
    struct ToggleTileSpec { const char* Title; const char* OnText; const char* OffText; bool* ToggleRef; };
    ToggleTileSpec Tiles[3] = {
        { "Visible",   "Shown",     "Hidden",  &Plume.Visible      },
        { "World SDF", "Obstructs", "Ignored", &Plume.SdfCollision },
        { "Car Wake",  "Coupled",   "Off",     &Plume.VehicleWake  },
    };
    for (int TIdx = 0; TIdx < 3; ++TIdx)
    {
        const PaneRect TBox{ Left + static_cast<float>(TIdx) * (TileW + 4.0f), PenY,
                             Left + static_cast<float>(TIdx) * (TileW + 4.0f) + TileW, PenY + 42.0f };
        PaintBox(Draw, TBox, *Tiles[TIdx].ToggleRef ? ChosenFill : CardFill, *Tiles[TIdx].ToggleRef ? ChosenEdge : CardEdge, 6.0f);
        Typo::DrawBoxText(Draw, LightFont, TBox.MinX + 8.0f, PenY + 4.0f, 15.0f, 8.5f, SoftInk, Tiles[TIdx].Title);
        Typo::DrawBoxText(Draw, RegularFont, TBox.MinX + 8.0f, PenY + 20.0f, 18.0f, 10.0f,
                          *Tiles[TIdx].ToggleRef ? BrightInk : DimInk,
                          *Tiles[TIdx].ToggleRef ? Tiles[TIdx].OnText : Tiles[TIdx].OffText);
        if (HitClicked(TBox, PopupId) && ScrollBox.Contains(ImGui::GetIO().MousePos))
            *Tiles[TIdx].ToggleRef = !(*Tiles[TIdx].ToggleRef);
    }
    PenY += 50.0f;

    // 3. Dedicated Tyre Slip & Thermal Telemetry Card (when Tyre smoke & fire is selected!)
    if (Plume.FollowsVehicle)
    {
        const PaneRect TyreCard{ Left, PenY, Right, PenY + 216.0f };
        PaintBox(Draw, TyreCard, CardFill, CardEdge, 7.0f);
        Typo::DrawBoxText(Draw, RegularFont, Left + 10.0f, PenY + 6.0f, 22.0f, 11.0f, BrightInk, "Tyre Slip & Thermal");
        Typo::DrawTrackedText(Draw, LightFont, Right - 68.0f, PenY + 6.0f, 22.0f, 8.5f, AmberInk, "4 WHEELS", 0.8f);

        float Ty = PenY + 30.0f;
        static constexpr const char* WheelCodes[4] = { "FL", "FR", "RL", "RR" };
        const auto& Wheels = TyreIntake.QueryWheels();
        const float CellW  = (Right - Left - 26.0f) * 0.5f;
        for (size_t WIdx = 0u; WIdx < 4u; ++WIdx)
        {
            const float Cx = Left + 10.0f + static_cast<float>(WIdx % 2u) * (CellW + 6.0f);
            const float Cy = Ty + static_cast<float>(WIdx / 2u) * 38.0f;
            const PaneRect WBox{ Cx, Cy, Cx + CellW, Cy + 34.0f };
            PaintBox(Draw, WBox, DeepFill, Wheels[WIdx].Ignited ? FlameInk : CardEdge, 5.0f);

            const float TempC = Wheels[WIdx].SurfaceKelvin - 273.15f;
            char WText[48];
            std::snprintf(WText, sizeof(WText), "%s  %.0f \xc2\xb0""C", WheelCodes[WIdx], static_cast<double>(TempC));
            Typo::DrawBoxText(Draw, RegularFont, Cx + 7.0f, Cy + 2.0f, 16.0f, 9.5f,
                              Wheels[WIdx].Ignited ? FlameInk : (Wheels[WIdx].SmokingActive ? AmberInk : BrightInk), WText);

            char KwText[32];
            std::snprintf(KwText, sizeof(KwText), "%.1f kW%s",
                          static_cast<double>(Wheels[WIdx].SlidingPowerW * 0.001f),
                          Wheels[WIdx].Ignited ? " FIRE" : (Wheels[WIdx].SmokingActive ? " SMOKE" : ""));
            Typo::DrawBoxText(Draw, LightFont, Cx + 7.0f, Cy + 17.0f, 15.0f, 8.5f, SoftInk, KwText);
        }
        Ty += 82.0f;

        // Ignition policy selector
        Typo::DrawBoxText(Draw, LightFont, Left + 10.0f, Ty, 24.0f, 9.5f, SoftInk, "Ignition");
        const PaneRect IgnBox{ Left + 74.0f, Ty, Right - 10.0f, Ty + 24.0f };
        if (PaintDropdown(Draw, LightFont, IgnBox, 9.5f, TyreIgnitionCaption(TyreIntake.IgnitionPolicy), PopupId)
            && ScrollBox.Contains(ImGui::GetIO().MousePos))
        {
            PopupId    = "ignition_policy";
            PopupSpot  = { IgnBox.MinX, IgnBox.MaxY + 2.0f };
            PopupWidth = IgnBox.Width();
        }
        Ty += 30.0f;

        // Burnout Line-Lock | Force Ignite | Cool Tyres buttons
        const float ThirdW = (Right - Left - 28.0f) / 3.0f;
        const PaneRect LockBtn{ Left + 10.0f, Ty, Left + 10.0f + ThirdW, Ty + 25.0f };
        const PaneRect IgnBtn { LockBtn.MaxX + 4.0f, Ty, LockBtn.MaxX + 4.0f + ThirdW, Ty + 25.0f };
        const PaneRect CoolBtn{ IgnBtn.MaxX + 4.0f, Ty, Right - 10.0f, Ty + 25.0f };
        if (PaintButton(Draw, LightFont, LockBtn, 9.0f, "Line-Lock", TyreIntake.BurnoutLineLock, PopupId))
            TyreIntake.BurnoutLineLock = !TyreIntake.BurnoutLineLock;
        if (PaintButton(Draw, RegularFont, IgnBtn, 9.0f, "Ignite", TyreIntake.HasAnyBurningTyre(), PopupId, true))
            TyreIntake.ForceIgniteDrivenTyres();
        if (PaintButton(Draw, LightFont, CoolBtn, 9.0f, "Cool 20\xc2\xb0""C", false, PopupId))
            TyreIntake.ResetCold();
        Ty += 32.0f;

        float InnerLeft = Left + 10.0f, InnerRight = Right - 10.0f;
        PaintInlineSlider(Draw, LightFont, RegularFont, InnerLeft, InnerRight, Ty,
                          "tyre_gain", "Discharge Yield", "x", TyreIntake.DischargeGain, 0.1f, 3.0f, 0.1f,
                          ScrollBox, PopupId, ActiveDragKey);
        PenY = TyreCard.MaxY + 10.0f;
    }

    // 4. Transform & Domain Bounds Card
    const float TransH = Plume.FollowsVehicle ? 108.0f : 216.0f;
    const PaneRect TransCard{ Left, PenY, Right, PenY + TransH };
    PaintBox(Draw, TransCard, CardFill, CardEdge, 7.0f);
    Typo::DrawBoxText(Draw, RegularFont, Left + 10.0f, PenY + 6.0f, 22.0f, 11.0f, BrightInk, "Transform & Bounds");
    float InnerY = PenY + 32.0f;
    if (!Plume.FollowsVehicle)
    {
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "pos_x", "World X", "m", Plume.OriginWorld[0], -30.0f, 35.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "pos_y", "World Y", "m", Plume.OriginWorld[1], -10.0f, 10.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "pos_z", "World Z", "m", Plume.OriginWorld[2], -0.5f, 6.0f, 0.1f, ScrollBox, PopupId, ActiveDragKey);
    }
    PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                      "b_w", "Domain Width", "m", Plume.Settings.BoundsWidth, 1.2f, 12.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
    PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                      "b_h", "Domain Height", "m", Plume.Settings.BoundsHeight, 1.4f, 12.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
    PenY = TransCard.MaxY + 10.0f;

    // 5. Gas Domain Preset & Solver Card (18 Presets + Resolution + Source + Appearance)
    const PaneRect SimCard{ Left, PenY, Right, PenY + 464.0f };
    PaintBox(Draw, SimCard, CardFill, CardEdge, 7.0f);
    Typo::DrawBoxText(Draw, RegularFont, Left + 10.0f, PenY + 6.0f, 22.0f, 11.0f, BrightInk, "Gas Domain & Preset");
    InnerY = PenY + 32.0f;

    // 18-Preset Dropdown
    const GasPreset* CurMeta = FindGasPreset(Plume.PresetIdentity.c_str());
    const char* PresetTitle  = CurMeta ? CurMeta->Name : Plume.PresetIdentity.c_str();
    const PaneRect PresetDrop{ Left + 10.0f, InnerY, Right - 10.0f, InnerY + 26.0f };
    if (PaintDropdown(Draw, RegularFont, PresetDrop, 10.0f, PresetTitle, PopupId)
        && ScrollBox.Contains(ImGui::GetIO().MousePos))
    {
        PopupId      = "plume_preset";
        PopupSpot    = { PresetDrop.MinX, std::max(ScrollBox.MinY + 8.0f, PresetDrop.MinY - 220.0f) };
        PopupWidth   = PresetDrop.Width();
        PopupScrollY = 0.0f;
    }
    InnerY += 34.0f;

    // Lattice Resolution quick buttons: 32^3 | 48^3 | 64^3 | 96^3
    static constexpr int ResOptions[4] = { 32, 48, 64, 96 };
    const float ResBtnW = (Right - Left - 20.0f - 12.0f) / 4.0f;
    for (int RIdx = 0; RIdx < 4; ++RIdx)
    {
        char RLabel[16];
        std::snprintf(RLabel, sizeof(RLabel), "%d\xc2\xb3", ResOptions[RIdx]);
        const PaneRect RBox{ Left + 10.0f + static_cast<float>(RIdx) * (ResBtnW + 4.0f), InnerY,
                             Left + 10.0f + static_cast<float>(RIdx) * (ResBtnW + 4.0f) + ResBtnW, InnerY + 24.0f };
        if (PaintButton(Draw, LightFont, RBox, 9.5f, RLabel,
                        Plume.Settings.LatticeResolution == ResOptions[RIdx], PopupId)
            && ScrollBox.Contains(ImGui::GetIO().MousePos))
        {
            Plume.Settings.LatticeResolution = ResOptions[RIdx];
            if (Plume.Solver)
                Plume.Solver->EnsureLatticeResolution(VkCtx, ResOptions[RIdx]);
        }
    }
    InnerY += 32.0f;

    // Key live GasSettings sliders
    float IterFloat = static_cast<float>(Plume.Settings.PressureIterations);
    if (PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "g_iter", "Jacobi Pressure Sweeps", "", IterFloat, 8.0f, 80.0f, 2.0f, ScrollBox, PopupId, ActiveDragKey))
    {
        Plume.Settings.PressureIterations = static_cast<int32_t>(std::lround(IterFloat));
    }
    if (!Plume.FollowsVehicle)
    {
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "g_rate", "Discharge Rate", "", Plume.Settings.EmitterRate, 0.0f, 6.0f, 0.1f, ScrollBox, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "g_smoke", "Smoke Density", "", Plume.Settings.EmitterSmoke, 0.0f, 8.0f, 0.1f, ScrollBox, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                          "g_fuel", "Fuel Injection", "", Plume.Settings.EmitterFuel, 0.0f, 8.0f, 0.1f, ScrollBox, PopupId, ActiveDragKey);
    }
    PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                      "g_buoy", "Buoyancy Lift", "", Plume.Settings.Buoyancy, 0.0f, 14.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
    PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                      "g_ext", "Optical Extinction", "", Plume.Settings.DensityExtinction, 0.5f, 12.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);
    PaintInlineSlider(Draw, LightFont, RegularFont, Left + 10.0f, Right - 10.0f, InnerY,
                      "g_fire", "Fire Radiance", "", Plume.Settings.FireIntensity, 0.0f, 12.0f, 0.2f, ScrollBox, PopupId, ActiveDragKey);

    // Detonate Burst | Revert | Open FluidEditor footer row
    const float HalfBtnW = (Right - Left - 26.0f) * 0.5f;
    const PaneRect BurstBtn{ Left + 10.0f, InnerY + 4.0f, Left + 10.0f + HalfBtnW, InnerY + 30.0f };
    const PaneRect RevBtn  { BurstBtn.MaxX + 6.0f, InnerY + 4.0f, Right - 10.0f, InnerY + 30.0f };
    if (PaintButton(Draw, RegularFont, BurstBtn, 9.5f, "Detonate Burst", false, PopupId) && Plume.Solver)
        Plume.Solver->TriggerBurstSequence(Plume.Settings, "shrapnel");
    if (PaintButton(Draw, LightFont, RevBtn, 9.5f, "Revert Preset", false, PopupId))
    {
        Plume.Settings = Plume.PresetBaseline;
        if (Plume.Solver)
            Plume.Solver->EnsureLatticeResolution(VkCtx, Plume.Settings.LatticeResolution);
    }

    Draw->PopClipRect();
}

void FrontierEditorWorkspace::DrawFrontierInspector(ImDrawList* Draw, const PaneRect& Pane,
                                                    LobbySession& Game, VulkanContext& VkCtx)
{
    Draw->AddRectFilled({ Pane.MinX, Pane.MinY }, { Pane.MaxX, Pane.MaxY }, PaneFill);
    Draw->AddRectFilled({ Pane.MinX, Pane.MinY }, { Pane.MinX + 1.0f, Pane.MaxY }, RuleLine);

    if (!ImGui::IsMouseDown(ImGuiMouseButton_Left))
        ActiveDragKey.clear();

    float PenY        = Pane.MinY + 10.0f;
    const float Left  = Pane.MinX + 14.0f;
    const float Right = Pane.MaxX - 14.0f;

    Typo::DrawTrackedText(Draw, LightFont, Left, PenY, 22.0f, 9.5f, MidInk, "INSPECTOR", 1.2f);
    PenY += 26.0f;
    Draw->AddRectFilled({ Pane.MinX, PenY }, { Pane.MaxX, PenY + 1.0f }, RuleLine);
    PenY += 8.0f;

    if (SelectedCategory == SelectedSubjectCategory::Plume && SelectedPlumeIndex < Plumes.size())
    {
        WorldPlumeInstance& Plume = Plumes[SelectedPlumeIndex];
        Typo::DrawBoxText(Draw, RegularFont, Left, PenY, 20.0f, 13.0f, BrightInk, Plume.Name.c_str());
        Typo::DrawTrackedText(Draw, LightFont, Left, PenY + 19.0f, 15.0f, 8.5f, SoftInk,
                              Plume.FollowsVehicle ? "VEHICLE TYRE PLUME DOMAIN" : "WORLD EULERIAN GAS DOMAIN", 0.9f);
        PenY += 40.0f;
        Draw->AddRectFilled({ Pane.MinX, PenY }, { Pane.MaxX, PenY + 1.0f }, RuleLine);

        const PaneRect ScrollBox{ Pane.MinX + 1.0f, PenY + 1.0f, Pane.MaxX, Pane.MaxY };
        DrawGasCardInspector(Draw, ScrollBox, Plume, SelectedPlumeIndex, VkCtx);
        return;
    }

    if (SelectedCategory == SelectedSubjectCategory::Environment)
    {
        Typo::DrawBoxText(Draw, RegularFont, Left, PenY, 20.0f, 13.0f, BrightInk, "Sun & sky");
        Typo::DrawTrackedText(Draw, LightFont, Left, PenY + 19.0f, 15.0f, 8.5f, SoftInk, "DIRECTIONAL LIGHT & SKY", 0.9f);
        PenY += 48.0f;
        const PaneRect Clip{ Pane.MinX, PenY, Pane.MaxX, Pane.MaxY };
        PaintInlineSlider(Draw, LightFont, RegularFont, Left, Right, PenY, "env_el", "Sun Elevation", "deg",
                          Environment.SunElevationDeg, 5.0f, 88.0f, 1.0f, Clip, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left, Right, PenY, "env_az", "Sun Azimuth", "deg",
                          Environment.SunAzimuthDeg, -180.0f, 180.0f, 1.0f, Clip, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left, Right, PenY, "env_in", "Sun Intensity", "",
                          Environment.SunIntensity, 0.0f, 5.0f, 0.1f, Clip, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left, Right, PenY, "env_am", "Sky Ambient", "",
                          Environment.AmbientIntensity, 0.05f, 1.5f, 0.05f, Clip, PopupId, ActiveDragKey);
        PaintInlineSlider(Draw, LightFont, RegularFont, Left, Right, PenY, "env_ex", "Scene Exposure", "",
                          Environment.Exposure, 0.4f, 2.5f, 0.05f, Clip, PopupId, ActiveDragKey);
        return;
    }

    if (SelectedCategory == SelectedSubjectCategory::Vehicle)
    {
        Typo::DrawBoxText(Draw, RegularFont, Left, PenY, 20.0f, 13.0f, BrightInk, "ControlVehicle");
        Typo::DrawTrackedText(Draw, LightFont, Left, PenY + 19.0f, 15.0f, 8.5f, SoftInk, "DEPLOYABLE UNIT (.FACET)", 0.9f);
        PenY += 48.0f;

        Typo::DrawBoxText(Draw, LightFont, Left, PenY, 20.0f, 10.0f, SoftInk, "Inspection View (V)");
        PenY += 22.0f;
        static constexpr const char* ViewNames[4] = { "Solid", "Ghost", "Wire", "X-Ray" };
        const float VBtnW = (Right - Left - 12.0f) / 4.0f;
        for (int VIdx = 0; VIdx < 4; ++VIdx)
        {
            const PaneRect VBox{ Left + static_cast<float>(VIdx) * (VBtnW + 4.0f), PenY,
                                 Left + static_cast<float>(VIdx) * (VBtnW + 4.0f) + VBtnW, PenY + 25.0f };
            if (PaintButton(Draw, LightFont, VBox, 9.5f, ViewNames[VIdx],
                            static_cast<int>(VehicleInspect.View) == VIdx, PopupId))
            {
                VehicleInspect.View = static_cast<InspectionView>(VIdx);
            }
        }
        PenY += 36.0f;

        Typo::DrawBoxText(Draw, LightFont, Left, PenY, 20.0f, 10.0f, SoftInk, "Body Paint Finish");
        PenY += 22.0f;
        struct PaintSwatch { const char* Name; std::array<float, 3> Rgb; };
        static constexpr PaintSwatch Swatches[4] = {
            { "Graphite", { 0.20f, 0.21f, 0.23f } },
            { "Glacier",  { 0.72f, 0.76f, 0.80f } },
            { "Crimson",  { 0.68f, 0.11f, 0.12f } },
            { "Amber",    { 0.78f, 0.46f, 0.10f } },
        };
        for (int SIdx = 0; SIdx < 4; ++SIdx)
        {
            const PaneRect SBox{ Left + static_cast<float>(SIdx) * (VBtnW + 4.0f), PenY,
                                 Left + static_cast<float>(SIdx) * (VBtnW + 4.0f) + VBtnW, PenY + 25.0f };
            if (PaintButton(Draw, LightFont, SBox, 9.0f, Swatches[SIdx].Name, false, PopupId))
                VehiclePaintRgb = Swatches[SIdx].Rgb;
        }
        PenY += 38.0f;

        const PaneRect SelectTyresBtn{ Left, PenY, Right, PenY + 34.0f };
        if (PaintButton(Draw, RegularFont, SelectTyresBtn, 10.0f, "Inspect Tyre Smoke & Thermal ->", false, PopupId, true))
            SelectPlume(0u);
        return;
    }

    // Level (3D SDF Course & Obstacles)
    Typo::DrawBoxText(Draw, RegularFont, Left, PenY, 20.0f, 13.0f, BrightInk, "SDF Course & Obstacles");
    Typo::DrawTrackedText(Draw, LightFont, Left, PenY + 19.0f, 15.0f, 8.5f, SoftInk, "ANALYTIC 3D SIGNED DISTANCE FIELD", 0.9f);
    PenY += 48.0f;

    const PaneRect ObsToggle{ Left, PenY, Right, PenY + 32.0f };
    if (PaintButton(Draw, RegularFont, ObsToggle, 10.0f,
                    SdfObstaclesEnabled ? "3D SDF Obstacles: Enabled" : "3D SDF Obstacles: Disabled",
                    SdfObstaclesEnabled, PopupId))
    {
        SdfObstaclesEnabled = !SdfObstaclesEnabled;
    }
    PenY += 44.0f;

    static constexpr const char* CoursePrimitives[] = {
        "- Ground Pad & Lane Markings (Z = 0.0 m)",
        "- Raised Side Kerbs (|Y| = 6.0..6.3 m, H = 0.12 m)",
        "- Test Ramp (X = 22..28 m, Rise = 1.35 m)",
        "- SDF Deflector Sphere (6.2, -2.35, 0.82 m, R = 0.68 m)",
        "- Twin SDF Pillars (9.5, +/-3.15 m, R = 0.48 m)",
        "- Overhead SDF Portal Arch (X = 15.2 m)",
        "- 3 Slalom Cones + Live ControlVehicle SDF Hull",
    };
    for (const char* Item : CoursePrimitives)
    {
        Typo::DrawBoxText(Draw, LightFont, Left, PenY, 20.0f, 9.5f, SoftInk, Item);
        PenY += 21.0f;
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                         STATUS BAR & POPUP OVERLAY
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::DrawStatusStrip(ImDrawList* Draw, const PaneRect& Bar,
                                              const LobbySession& Game, VulkanContext& VkCtx, float MeasuredFps)
{
    Draw->AddRectFilled({ Bar.MinX, Bar.MinY }, { Bar.MaxX, Bar.MaxY }, PaneFill);
    Draw->AddRectFilled({ Bar.MinX, Bar.MinY }, { Bar.MaxX, Bar.MinY + 1.0f }, RuleLine);

    float PenX = Bar.MinX + 14.0f;
    Draw->AddCircleFilled({ PenX + 4.0f, Bar.MinY + StatusHeight * 0.5f }, 3.5f, GreenInk, 12);
    PenX += 14.0f;
    Typo::DrawBoxText(Draw, RegularFont, PenX, Bar.MinY, StatusHeight, 9.5f, BrightInk, "Frontier Editor");
    PenX += 92.0f;

    const std::string GpuStr = VkCtx.QueryDeviceSummary();
    Typo::DrawBoxText(Draw, LightFont, PenX, Bar.MinY, StatusHeight, 9.5f, SoftInk, GpuStr.c_str());

    char RightInfo[128];
    std::snprintf(RightInfo, sizeof(RightInfo), "%s  |  %zu Pyro Domains  |  %.0f FPS",
                  Game.QueryCurrentLevelPath().c_str(), Plumes.size(),
                  static_cast<double>(MeasuredFps > 0.5f ? MeasuredFps : 60.0f));
    Typo::DrawBoxText(Draw, LightFont, Bar.MaxX - 14.0f, Bar.MinY, StatusHeight, 9.5f, MidInk,
                      RightInfo, Typo::TextAnchor::End);
}

void FrontierEditorWorkspace::DrawPopupOverlay(ImDrawList* Draw, VulkanContext& VkCtx, const PaneRect& FullRect)
{
    if (PopupId.empty())
        return;

    if (PopupId == "ignition_policy")
    {
        static constexpr TyreIgnitionPolicy Policies[3] = {
            TyreIgnitionPolicy::Authored,
            TyreIgnitionPolicy::Diagnostic,
            TyreIgnitionPolicy::Disabled,
        };
        const PaneRect Box{ PopupSpot.x, PopupSpot.y, PopupSpot.x + PopupWidth, PopupSpot.y + 84.0f };
        PaintBox(Draw, Box, TopBarFill, ChosenEdge, 6.0f);
        for (int Idx = 0; Idx < 3; ++Idx)
        {
            const PaneRect Row{ Box.MinX + 4.0f, Box.MinY + 4.0f + static_cast<float>(Idx) * 25.0f,
                                Box.MaxX - 4.0f, Box.MinY + 4.0f + static_cast<float>(Idx + 1) * 25.0f };
            if (Row.Contains(ImGui::GetIO().MousePos))
                PaintBox(Draw, Row, ChosenFill, 0u, 4.0f);
            Typo::DrawBoxText(Draw, LightFont, Row.MinX + 8.0f, Row.MinY, 25.0f, 9.5f, BrightInk,
                              TyreIgnitionCaption(Policies[Idx]));
            if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && Row.Contains(ImGui::GetIO().MousePos))
            {
                TyreIntake.IgnitionPolicy = Policies[Idx];
                PopupId.clear();
                return;
            }
        }
        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !Box.Contains(ImGui::GetIO().MousePos))
            PopupId.clear();
        return;
    }

    if (PopupId == "plume_preset" && SelectedPlumeIndex < Plumes.size())
    {
        const auto* Cards    = FluidEditor::FluidPresetCards();
        const uint32_t Total = FluidEditor::FluidPresetCardCount;
        constexpr float RowH = 24.0f;
        const float VisH     = 248.0f;
        const float MenuX    = std::clamp(PopupSpot.x, FullRect.MinX + 8.0f, FullRect.MaxX - PopupWidth - 8.0f);
        const float MenuY    = std::clamp(PopupSpot.y, FullRect.MinY + 8.0f, FullRect.MaxY - VisH - 8.0f);
        const PaneRect Box{ MenuX, MenuY, MenuX + PopupWidth, MenuY + VisH };
        PaintBox(Draw, Box, TopBarFill, ChosenEdge, 6.0f);

        const float MaxSc = std::max(0.0f, static_cast<float>(Total) * RowH - (VisH - 8.0f));
        if (Box.Contains(ImGui::GetIO().MousePos) && std::fabs(ImGui::GetIO().MouseWheel) > 1e-4f)
            PopupScrollY = std::clamp(PopupScrollY - ImGui::GetIO().MouseWheel * 28.0f, 0.0f, MaxSc);

        Draw->PushClipRect({ Box.MinX + 2.0f, Box.MinY + 4.0f }, { Box.MaxX - 2.0f, Box.MaxY - 4.0f }, true);
        int Picked = -1;
        for (uint32_t Idx = 0u; Idx < Total; ++Idx)
        {
            const float Ry = Box.MinY + 4.0f + static_cast<float>(Idx) * RowH - PopupScrollY;
            const PaneRect Row{ Box.MinX + 4.0f, Ry, Box.MaxX - 4.0f, Ry + RowH };
            if (Row.Contains(ImGui::GetIO().MousePos) && Box.Contains(ImGui::GetIO().MousePos))
                PaintBox(Draw, Row, ChosenFill, 0u, 4.0f);
            Typo::DrawBoxText(Draw, LightFont, Row.MinX + 8.0f, Row.MinY, RowH, 9.5f, BrightInk, Cards[Idx].Name);
            if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && Row.Contains(ImGui::GetIO().MousePos)
                && Box.Contains(ImGui::GetIO().MousePos))
            {
                Picked = static_cast<int>(Idx);
            }
        }
        Draw->PopClipRect();

        if (Picked >= 0)
        {
            WorldPlumeInstance& P = Plumes[SelectedPlumeIndex];
            P.PresetIdentity      = Cards[Picked].Identity;
            const bool KeepFollow = P.FollowsVehicle;
            P.Settings            = ConstructPresetSettings(Cards[Picked].Identity);
            P.Settings.LatticeResolution = std::min(P.Settings.LatticeResolution, 64);
            P.Settings.ObstacleType      = 0;
            if (KeepFollow)
                P.Settings.EmitterEnabled = false;
            P.PresetBaseline      = P.Settings;
            if (P.Solver)
            {
                P.Solver->EnsureLatticeResolution(VkCtx, P.Settings.LatticeResolution);
                P.Solver->ClearLattice(VkCtx);
                const GasPreset* Meta = FindGasPreset(P.PresetIdentity.c_str());
                if (Meta && Meta->DetonateOnLoad)
                    P.Solver->TriggerBurstSequence(P.Settings, "single");
            }
            PopupId.clear();
            return;
        }
        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !Box.Contains(ImGui::GetIO().MousePos))
            PopupId.clear();
    }
}

//----------------------------------------------------------------------------------------------------------------------
//                                                TOP-LEVEL FRAME TICK
//----------------------------------------------------------------------------------------------------------------------

void FrontierEditorWorkspace::TickAndDraw(VulkanContext& VkCtx, LobbySession& Game, Everest::NavigationApp& Navigation,
                                          CameraController& Camera, float DtSeconds, float MeasuredFps,
                                          const ImVec2& WindowOrigin, const ImVec2& WindowSize)
{
    if (!LightFont || !RegularFont)
        LoadDefaultFonts();

    // If FluidEditor is open, delegate full-window chrome & simulation to FluidEditorWorkspace!
    if (FluidEditorOpen)
    {
        FluidWorkspace.TickAndDraw(VkCtx, StandaloneFallbackSolver, DtSeconds, MeasuredFps, WindowOrigin, WindowSize);
        if (FluidWorkspace.ConsumeReturnToSceneRequest())
            FluidEditorOpen = false;
        return;
    }

    // Scene keyboard shortcuts: P toggles side panels, B toggles burnout line-lock, Tab opens FluidEditor for selected plume!
    if (ImGui::IsKeyPressed(ImGuiKey_P) && PopupId.empty())
        SidePanelsVisible = !SidePanelsVisible;
    if (ImGui::IsKeyPressed(ImGuiKey_B) && PopupId.empty())
        TyreIntake.BurnoutLineLock = !TyreIntake.BurnoutLineLock;
    if (ImGui::IsKeyPressed(ImGuiKey_Tab) && SelectedCategory == SelectedSubjectCategory::Plume)
        OpenFluidEditorForPlume(SelectedPlumeIndex);

    const PaneRect FullRect{ WindowOrigin.x, WindowOrigin.y, WindowOrigin.x + WindowSize.x, WindowOrigin.y + WindowSize.y };
    const float WorkBottom = FullRect.MaxY - StatusHeight;
    const bool ShowPanes   = SidePanelsVisible && WindowSize.x >= 780.0f;
    const float LeftW      = ShowPanes ? OutlinerWidth  : 0.0f;
    const float RightW     = ShowPanes ? InspectorWidth : 0.0f;

    const PaneRect OutlinerBox { FullRect.MinX, FullRect.MinY, FullRect.MinX + LeftW, WorkBottom };
    const PaneRect ViewportBox { OutlinerBox.MaxX, FullRect.MinY, FullRect.MaxX - RightW, WorkBottom };
    const PaneRect InspectorBox{ ViewportBox.MaxX, FullRect.MinY, FullRect.MaxX, WorkBottom };
    const PaneRect StatusBox   { FullRect.MinX, WorkBottom, FullRect.MaxX, FullRect.MaxY };

    const int CanvasW = std::max(128, static_cast<int>(ViewportBox.Width()));
    const int CanvasH = std::max(128, static_cast<int>(ViewportBox.Height() - TopBarHeight));
    UpdateWorldSimulation(VkCtx, Game, Camera, DtSeconds, CanvasW, CanvasH);

    ImDrawList* Draw = ImGui::GetWindowDrawList();
    Draw->AddRectFilled(WindowOrigin, { FullRect.MaxX, FullRect.MaxY }, ShellBg);

    if (ShowPanes)
        DrawFrontierOutliner(Draw, OutlinerBox, Game, Navigation, VkCtx);
    DrawFrontierViewport(Draw, ViewportBox, Game, Navigation, Camera, VkCtx);
    if (ShowPanes)
        DrawFrontierInspector(Draw, InspectorBox, Game, VkCtx);
    DrawStatusStrip(Draw, StatusBox, Game, VkCtx, MeasuredFps);
    DrawPopupOverlay(Draw, VkCtx, FullRect);
}

} // namespace Frontier
