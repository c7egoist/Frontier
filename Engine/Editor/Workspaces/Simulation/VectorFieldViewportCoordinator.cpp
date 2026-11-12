/*============================================================================================================================================
                                                  VECTORFIELDVIEWPORTCOORDINATOR.CPP
============================================================================================================================================*/
// 🧩 Editor coordinator binding ForceFieldAccumulator, FieldLatticeVulkanExecutor, VectorFieldOverlaySequence & 3-dock UI panes

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Editor/Workspaces/Simulation/VectorFieldViewportCoordinator.h"
#include "Engine/SimulationSpace/ForceFields/FieldFormulaCompiler.h"
#include "Engine/SimulationSpace/ForceFields/ForceMotionPath.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

namespace Frontier::Editor::Simulation
{

namespace
{

[[nodiscard]] SimulationSpace::ForceFields::ForceSourceRecordEntry BuildPresetFromTemplateTitle(std::string_view Title)
{
    using namespace SimulationSpace::ForceFields;
    ForceSourceRecordEntry Desc{};
    Desc.RadiusMeters      = 24.0f;
    Desc.Strength          = 18.0f;
    Desc.FalloffExponent   = 1.4f;
    Desc.CentreMeters      = { 0.0f, 0.0f, 6.0f };
    Desc.Label             = std::string(Title);

    if (Title.find("Radial") != std::string_view::npos || Title.find("Burst") != std::string_view::npos)
    {
        Desc.Model              = ForceModel::RadialBurst;
        Desc.Strength           = 26.0f;
        Desc.RadiusMeters       = 18.0f;
        Desc.DurationMode       = ForceDurationMode::Impulse;
        Desc.ImpulseTriggerTimeSec = 0.0f;
        Desc.ImpulseDurationSec = 1.6f;
    }
    else if (Title.find("Rotational") != std::string_view::npos || Title.find("Vortex") != std::string_view::npos)
    {
        Desc.Model        = ForceModel::RotationalColumn;
        Desc.Strength     = 22.0f;
        Desc.SwirlRatio   = 0.9f;
        Desc.RadiusMeters = 20.0f;
    }
    else if (Title.find("Attractor") != std::string_view::npos)
    {
        Desc.Model            = ForceModel::Attractor;
        Desc.Strength         = 20.0f;
        Desc.CoreRadiusMeters = 3.0f;
    }
    else if (Title.find("Curl") != std::string_view::npos || Title.find("Turbulence") != std::string_view::npos)
    {
        Desc.Model                 = ForceModel::CurlNoise;
        Desc.Domain                = ForceDomainCategory::TurbulenceField;
        Desc.Strength              = 16.0f;
        Desc.TurbulenceScaleMeters = 12.0f;
        Desc.OctaveCount           = 3u;
    }
    else if (Title.find("Formula") != std::string_view::npos)
    {
        Desc.Model             = ForceModel::FlowStream;
        Desc.Strength          = 18.0f;
        Desc.FormulaEnabled    = true;
        Desc.FormulaSourceText = QueryBuiltInFormulaPresets()[0].FormulaSource;
    }
    else
    {
        Desc.Model = ForceModel::LinearWind;
    }
    return Desc;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                INITIALIZATION & BINDING
//------------------------------------------------------------------------------------------------------------------------

bool VectorFieldViewportCoordinator::InitializeAndAttach(
    OutlinerPanel&               Outliner,
    ViewportPanel&               Viewport,
    InspectorPanel&              Inspector,
    const std::filesystem::path& ShaderBinaryDirectory,
    const std::filesystem::path& SwiftShaderIcdDir,
    std::string&                 OutDiagnostic) noexcept
{
    BoundOutliner  = &Outliner;
    BoundViewport  = &Viewport;
    BoundInspector = &Inspector;
    AuthoredSources.clear();
    NextForceToken = 1u;

    Cameras[0]            = OverlayCameraState{};
    Cameras[0].Projection = ViewportProjectionPreset::Perspective;
    Cameras[1]            = OverlayCameraState{};
    Cameras[1].Projection = ViewportProjectionPreset::Top;
    Cameras[1].OrthoHalfHeightM = 36.0f;

    const auto ComputeSpv = ShaderBinaryDirectory / "FieldLatticeCompute.spv";
    if (!VulkanExecutor.Initialize(ComputeSpv, SwiftShaderIcdDir, OutDiagnostic))
    {
        return false;
    }
    if (!OverlaySequence.Initialize(VulkanExecutor, ShaderBinaryDirectory, OutDiagnostic))
    {
        return false;
    }

    const std::vector<OutlinerConstructTemplate> ForceTemplates = {
        { "Add Linear Wind",      "Linear Wind",       "Force Field", "Steady directional flow",  ConstructSlotCategory::ForceField },
        { "Add Radial Burst",     "Radial Burst",      "Force Field", "Expanding impulse wave",   ConstructSlotCategory::ForceField },
        { "Add Vortex Column",    "Rotational Column", "Force Field", "Helical swirl column",     ConstructSlotCategory::ForceField },
        { "Add Point Attractor",  "Point Attractor",   "Force Field", "Inward pull sink",         ConstructSlotCategory::ForceField },
        { "Add Curl Turbulence",  "Curl Noise",        "Force Field", "Divergence-free curl eddy",ConstructSlotCategory::ForceField },
        { "Add Custom Formula",   "Custom Formula",    "Force Field", "VectorFieldLang override", ConstructSlotCategory::ForceField },
        { "Add Cube Mesh",        "Cube",              "Static Mesh", "Position 0, 0, 0 m",       ConstructSlotCategory::CategoryOne },
        { "Add Point Light",      "Point Light",       "Light",       "Position 0, 0, 0 m",       ConstructSlotCategory::CategoryThree },
    };
    Outliner.ConfigureConstructTemplates(ForceTemplates);

    Viewport.AttachOutliner(&Outliner);
    Inspector.AttachOutliner(&Outliner);

    Viewport.ConfigureForceOverlayToolsVisible(true);
    Viewport.ConfigureSimulationTimeSeconds(SimulationTimeSec);
    Viewport.ConfigureRasterCallback([this](const ViewportPaneSurfaceSpecification& Spec)
                                     { return HandleViewportRaster(Spec); });
    Viewport.ConfigureInteractionCallback([this](uint32_t PaneIdx, Rectangle2D Bounds, const PaneInputReading& Input)
                                          { HandleViewportInteraction(PaneIdx, Bounds, Input); });
    Inspector.ConfigureExtensionSectionCallback(
        [this](PixelSpace& Surface, Rectangle2D ScrollVp, float LeftX, float TopY, float InnerW, OutlinerRecordEntry& Entry, const PaneInputReading& Input)
        { return RenderForceInspectorExtension(Surface, ScrollVp, LeftX, TopY, InnerW, Entry, Input); });

    return true;
}

void VectorFieldViewportCoordinator::StepSimulation(double ΔtSeconds) noexcept
{
    if (BoundViewport != nullptr && BoundViewport->ConsumeRewindRequested())
    {
        SimulationTimeSec = 0.0;
    }

    const bool Advance = (BoundViewport == nullptr) ||
                         (BoundViewport->QueryExecutionMode() == ViewportExecutionMode::Simulate) ||
                         (BoundViewport->QueryExecutionMode() == ViewportExecutionMode::Play && !BoundViewport->QueryPlayPaused());
    if (Advance && ΔtSeconds > 0.0)
    {
        SimulationTimeSec += ΔtSeconds;
    }

    SynchronizeOutlinerAndAccumulator();
    Accumulator.StepAnimation(SimulationTimeSec, Advance);

    if (BoundViewport != nullptr)
    {
        BoundViewport->ConfigureSimulationTimeSeconds(SimulationTimeSec);
    }
}

OutlinerSlotToken VectorFieldViewportCoordinator::AddForceSourceEntry(
    SimulationSpace::ForceFields::ForceSourceRecordEntry Descriptor,
    OutlinerSlotToken                                    EnclosingFolder)
{
    if (BoundOutliner == nullptr)
    {
        return {};
    }

    Descriptor.UniqueToken = NextForceToken++;
    Descriptor.Domain      = SimulationSpace::ForceFields::QueryDomainForModel(Descriptor.Model);

    const OutlinerSlotToken Token = BoundOutliner->ConstructFromTemplate(0u, EnclosingFolder);
    if (OutlinerRecordEntry* Created = BoundOutliner->AccessEntry(Token))
    {
        Created->Category      = ConstructSlotCategory::ForceField;
        Created->Title         = Descriptor.Label;
        Created->CategoryLabel = SimulationSpace::ForceFields::QueryForceModelDisplayName(Descriptor.Model);
        char SubBuf[96]{};
        std::snprintf(SubBuf, sizeof(SubBuf), "r %.0f m  |  %.1f m/s", Descriptor.RadiusMeters, Descriptor.Strength);
        Created->Subtitle  = SubBuf;
        Created->PositionX = Descriptor.CentreMeters.X;
        Created->PositionY = Descriptor.CentreMeters.Y;
        Created->PositionZ = Descriptor.CentreMeters.Z;
        Created->RotationX = Descriptor.EulerDegrees.X;
        Created->RotationY = Descriptor.EulerDegrees.Y;
        Created->RotationZ = Descriptor.EulerDegrees.Z;
    }

    Descriptor.OutlinerTokenId = Token.Identifier;
    AuthoredSources.push_back(std::move(Descriptor));
    Accumulator.AssignSources(AuthoredSources);
    return Token;
}

//------------------------------------------------------------------------------------------------------------------------
//                                           OUTLINER <-> ACCUMULATOR SYNC
//------------------------------------------------------------------------------------------------------------------------

void VectorFieldViewportCoordinator::SynchronizeOutlinerAndAccumulator()
{
    if (BoundOutliner == nullptr)
    {
        return;
    }

    // Keep local AuthoredSources synchronized with current Accumulator edits
    if (Accumulator.QuerySources().size() == AuthoredSources.size())
    {
        const auto Live = Accumulator.QuerySources();
        AuthoredSources.assign(Live.begin(), Live.end());
    }

    bool Dirty = false;
    for (const auto& Entry : BoundOutliner->QueryEntries())
    {
        if (Entry.Category != ConstructSlotCategory::ForceField)
        {
            continue;
        }
        auto It = std::find_if(
            AuthoredSources.begin(),
            AuthoredSources.end(),
            [&](const auto& Src) { return Src.OutlinerTokenId == Entry.Token.Identifier; });

        if (It == AuthoredSources.end())
        {
            auto Desc            = BuildPresetFromTemplateTitle(Entry.Title);
            Desc.UniqueToken     = NextForceToken++;
            Desc.OutlinerTokenId = Entry.Token.Identifier;
            Desc.CentreMeters    = { Entry.PositionX, Entry.PositionY, Entry.PositionZ };
            Desc.EvaluatedCentreMeters = Desc.CentreMeters;
            Desc.EulerDegrees    = { Entry.RotationX, Entry.RotationY, Entry.RotationZ };
            Desc.Enabled         = BoundOutliner->QueryEffectiveVisibility(Entry.Token);
            AuthoredSources.push_back(std::move(Desc));
            Dirty = true;
        }
        else
        {
            It->Enabled = BoundOutliner->QueryEffectiveVisibility(Entry.Token);
            if (!It->DynamicMotion && It->Motion.Topology == SimulationSpace::ForceFields::MotionPathTopology::Static)
            {
                It->CentreMeters          = { Entry.PositionX, Entry.PositionY, Entry.PositionZ };
                It->EvaluatedCentreMeters = It->CentreMeters;
                It->EulerDegrees          = { Entry.RotationX, Entry.RotationY, Entry.RotationZ };
            }
            else if (OutlinerRecordEntry* Mut = BoundOutliner->AccessEntry(Entry.Token))
            {
                Mut->PositionX = It->EvaluatedCentreMeters.X;
                Mut->PositionY = It->EvaluatedCentreMeters.Y;
                Mut->PositionZ = It->EvaluatedCentreMeters.Z;
            }
        }
    }

    // Erase deleted outliner entries
    const std::size_t BeforeSz = AuthoredSources.size();
    AuthoredSources.erase(
        std::remove_if(
            AuthoredSources.begin(),
            AuthoredSources.end(),
            [&](const auto& Src)
            { return BoundOutliner->FindEntry(OutlinerSlotToken{ Src.OutlinerTokenId }) == nullptr; }),
        AuthoredSources.end());
    if (AuthoredSources.size() != BeforeSz || Dirty)
    {
        Accumulator.AssignSources(AuthoredSources);
    }
    else
    {
        // Push lightweight flag/transform updates cleanly
        auto LiveMut = Accumulator.AccessSources();
        for (std::size_t I = 0u; I < std::min(LiveMut.size(), AuthoredSources.size()); ++I)
        {
            LiveMut[I].Enabled               = AuthoredSources[I].Enabled;
            LiveMut[I].CentreMeters          = AuthoredSources[I].CentreMeters;
            LiveMut[I].EvaluatedCentreMeters = AuthoredSources[I].EvaluatedCentreMeters;
            LiveMut[I].EulerDegrees          = AuthoredSources[I].EulerDegrees;
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                        VIEWPORT RASTER & PICKING HANDLERS
//------------------------------------------------------------------------------------------------------------------------

ViewportRasterSurface VectorFieldViewportCoordinator::HandleViewportRaster(const ViewportPaneSurfaceSpecification& Spec)
{
    SynchronizeOutlinerAndAccumulator();

    std::vector<SimulationSpace::ForceFields::ForceSourceShaderEntry> PackedSources;
    std::vector<SimulationSpace::ForceFields::SpatialVector3>         PackedWaypoints;
    LatticeCascade.PackGpuSourceBuffers(Accumulator, Spec.TimeSeconds, PackedSources, PackedWaypoints);

    const auto LiveSources = Accumulator.QuerySources();
    std::vector<uint32_t> SourceTokens;
    std::vector<uint32_t> WaypointOffsets;
    std::vector<uint32_t> WaypointCounts;
    std::vector<uint8_t>  PathIsOrbit;
    SourceTokens.reserve(PackedSources.size());
    WaypointOffsets.reserve(PackedSources.size());
    WaypointCounts.reserve(PackedSources.size());
    PathIsOrbit.reserve(PackedSources.size());

    for (std::size_t I = 0u; I < PackedSources.size(); ++I)
    {
        const uint32_t OutlinerId = (I < LiveSources.size()) ? LiveSources[I].OutlinerTokenId : static_cast<uint32_t>(I + 1u);
        const bool     IsOrbit    = (I < LiveSources.size()) &&
                                    (LiveSources[I].Motion.Topology == SimulationSpace::ForceFields::MotionPathTopology::HelicalOrbit);
        SourceTokens.push_back(OutlinerId);
        WaypointOffsets.push_back(PackedSources[I].WaypointStartIdx);
        WaypointCounts.push_back(PackedSources[I].WaypointCount);
        PathIsOrbit.push_back(IsOrbit ? 1u : 0u);
    }

    const uint32_t PaneIdx = (Spec.PaneIndex < 2u) ? Spec.PaneIndex : 0u;
    Cameras[PaneIdx].Projection = Spec.Projection;

    const OutlinerSlotToken PrimarySel = (BoundOutliner != nullptr) ? BoundOutliner->QueryPrimarySelection() : OutlinerSlotToken{};

    // Update live anemometer telemetry
    const auto ProbePos = Spec.ForceOverlay.AnemometerWorldMeters;
    const auto Diag     = Accumulator.QueryAnemometerDiagnostics(ProbePos, Spec.TimeSeconds);
    const float Speed   = SimulationSpace::ForceFields::VectorLength(Diag.TotalForce.AdvectionVelocity);
    AnemometerHistoryMs[AnemometerCursor % AnemometerHistoryMs.size()] = Speed;
    ++AnemometerCursor;

    if (BoundViewport != nullptr)
    {
        char ProbeBuf[160]{};
        std::snprintf(
            ProbeBuf,
            sizeof(ProbeBuf),
            "Probe (%.1f, %.1f, %.1f) m  |  %.2f m/s (Bft %u)  |  |curl| %.2f /s  |  div %.2f /s  |  q %.1f Pa",
            ProbePos.X,
            ProbePos.Y,
            ProbePos.Z,
            Speed,
            Diag.BeaufortScale,
            Diag.CurlMagnitude,
            Diag.Divergence,
            Diag.DynamicPressurePa);
        BoundViewport->ConfigureProbeReadoutText(ProbeBuf);
    }

    OverlayFrameRequest Req{};
    Req.PaneIndex             = PaneIdx;
    Req.WidthPx               = Spec.WidthPx;
    Req.HeightPx              = Spec.HeightPx;
    Req.Camera                = Cameras[PaneIdx];
    Req.OverlaySettings       = Spec.ForceOverlay;
    Req.TimeSeconds           = Spec.TimeSeconds;
    Req.SelectedForceToken    = PrimarySel.Identifier;
    Req.SelectedWaypointIndex = SelectedWaypointIdx;
    Req.LitShadingEnabled     = true;
    Req.SliceHalfSpanMeters   = 36.0f;
    Req.PackedSources         = PackedSources;
    Req.SourceTokens          = SourceTokens;
    Req.PackedWaypoints       = PackedWaypoints;
    Req.SourceWaypointOffsets = WaypointOffsets;
    Req.SourceWaypointCounts  = WaypointCounts;
    Req.SourcePathIsOrbit     = PathIsOrbit;

    std::string Diagnostic;
    const OverlayRenderOutput Out = OverlaySequence.RenderPane(Req, Diagnostic);

    ViewportRasterSurface Surface{};
    Surface.SoftwareTextureData = Out.ImTextureDataPtr;
    Surface.ActiveForceCount    = static_cast<uint32_t>(PackedSources.size());
    return Surface;
}

void VectorFieldViewportCoordinator::HandleViewportInteraction(
    uint32_t                PaneIndex,
    Rectangle2D             PaneBounds,
    const PaneInputReading& Input)
{
    if (PaneBounds.Width <= 2.0f || PaneBounds.Height <= 2.0f)
    {
        return;
    }

    const uint32_t SafePane = (PaneIndex < 2u) ? PaneIndex : 0u;
    const float    NormU    = std::clamp((Input.PrimaryPointer.X - PaneBounds.X) / PaneBounds.Width, 0.0f, 1.0f);
    const float    NormV    = std::clamp((Input.PrimaryPointer.Y - PaneBounds.Y) / PaneBounds.Height, 0.0f, 1.0f);

    if (Input.PrimaryPointer.Pressed)
    {
        const OverlayPickResult Pick = OverlaySequence.QueryPickAtNormalizedUv(SafePane, NormU, NormV);
        if (Pick.Category == OverlayPickCategory::ForceCircle && Pick.PrimaryId != 0u && BoundOutliner != nullptr)
        {
            BoundOutliner->SelectSingle(OutlinerSlotToken{ Pick.PrimaryId });
            SelectedWaypointIdx = -1;
        }
        else if (Pick.Category == OverlayPickCategory::MotionWaypoint && Pick.PrimaryId != 0u && BoundOutliner != nullptr)
        {
            BoundOutliner->SelectSingle(OutlinerSlotToken{ Pick.PrimaryId });
            SelectedWaypointIdx = static_cast<int32_t>(Pick.SecondaryId);
        }
        else
        {
            OrbitDragging  = true;
            DragPaneIndex  = SafePane;
            LastDragCursor = { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
        }
    }

    if (OrbitDragging && Input.PrimaryPointer.Down && DragPaneIndex == SafePane)
    {
        const float Dx = Input.PrimaryPointer.X - LastDragCursor.X;
        const float Dy = Input.PrimaryPointer.Y - LastDragCursor.Y;
        LastDragCursor = { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };

        if (Input.ShiftHeld && BoundViewport != nullptr)
        {
            auto& Probe = BoundViewport->AccessForceOverlaySettings().AnemometerWorldMeters;
            Probe.X    += Dx * 0.08f;
            Probe.Y    -= Dy * 0.08f;
        }
        else
        {
            Cameras[SafePane].YawRadians   -= Dx * 0.008f;
            Cameras[SafePane].PitchRadians  = std::clamp(Cameras[SafePane].PitchRadians + Dy * 0.007f, 0.08f, 1.48f);
        }
    }
    if (!Input.PrimaryPointer.Down)
    {
        OrbitDragging = false;
    }

    if (std::abs(Input.WheelDeltaY) > 0.01f)
    {
        const float ZoomFactor = (Input.WheelDeltaY > 0.0f) ? 0.90f : 1.11f;
        Cameras[SafePane].DistanceMeters    = std::clamp(Cameras[SafePane].DistanceMeters * ZoomFactor, 12.0f, 180.0f);
        Cameras[SafePane].OrthoHalfHeightM  = std::clamp(Cameras[SafePane].OrthoHalfHeightM * ZoomFactor, 8.0f, 120.0f);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                           INSPECTOR FORCE EXTENSION UI
//------------------------------------------------------------------------------------------------------------------------

float VectorFieldViewportCoordinator::RenderForceInspectorExtension(
    PixelSpace&             Surface,
    Rectangle2D             ScrollViewport,
    float                   LeftX,
    float                   TopY,
    float                   InnerWidth,
    OutlinerRecordEntry&    Entry,
    const PaneInputReading& Input)
{
    if (Entry.Category != ConstructSlotCategory::ForceField)
    {
        return 0.0f;
    }

    auto LiveSources = Accumulator.AccessSources();
    SimulationSpace::ForceFields::ForceSourceRecordEntry* ActiveSource = nullptr;
    for (auto& Src : LiveSources)
    {
        if (Src.OutlinerTokenId == Entry.Token.Identifier)
        {
            ActiveSource = &Src;
            break;
        }
    }
    if (ActiveSource == nullptr)
    {
        return 0.0f;
    }

    const Point2D Cursor{ Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool    Interactive = ScrollViewport.Contains(Cursor);
    float         CurY        = TopY + 6.0f;

    auto DrawScalarScrubber = [&](float CardX, float CardW, float RowY, const char* Label, float& Val, float MinV, float MaxV, const char* Unit)
    {
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { CardX + 12.0f, RowY + 3.0f }, 10.0f, WorkspaceSurfaceColors::SecondaryInk, Label);
        char Buf[40]{};
        std::snprintf(Buf, sizeof(Buf), "%.1f %s", Val, Unit);
        const float W = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 10.0f, Buf);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { CardX + CardW - 12.0f - W, RowY + 3.0f }, 10.0f, ColorRgba{ 146, 224, 250, 255 }, Buf);

        const Rectangle2D Track{ CardX + 12.0f, RowY + 19.0f, CardW - 24.0f, 9.0f };
        const float       T = std::clamp((Val - MinV) / std::max(0.001f, MaxV - MinV), 0.0f, 1.0f);
        Surface.FillRectangle(Track, ColorRgba{ 36, 38, 42, 255 }, 4.5f);
        Surface.FillRectangle({ Track.X, Track.Y, std::max(6.0f, Track.Width * T), Track.Height }, ColorRgba{ 62, 168, 212, 255 }, 4.5f);
        if (Interactive && Track.Contains(Cursor) && Input.PrimaryPointer.Down)
        {
            const float NextT = std::clamp((Cursor.X - Track.X) / Track.Width, 0.0f, 1.0f);
            Val               = MinV + NextT * (MaxV - MinV);
        }
    };

    // Card 1: ForceModel & Envelope (208px)
    {
        const Rectangle2D Card{ LeftX, CurY, InnerWidth, 208.0f };
        Surface.FillRectangle(Card, ColorRgba{ 30, 31, 34, 255 }, 10.0f);
        Surface.StrokeRectangle(Card, ColorRgba{ 54, 58, 64, 255 }, 10.0f, 1.0f);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { Card.X + 12.0f, Card.Y + 11.0f }, 10.5f, ColorRgba{ 104, 220, 255, 255 }, "FORCE MODEL & ENVELOPE");

        const Rectangle2D ModelBtn{ Card.X + 12.0f, Card.Y + 32.0f, InnerWidth - 24.0f, 26.0f };
        Surface.FillRectangle(ModelBtn, ColorRgba{ 40, 42, 48, 255 }, 7.0f);
        Surface.StrokeRectangle(ModelBtn, ColorRgba{ 72, 120, 146, 255 }, 7.0f, 1.0f);
        const char* ModelName = SimulationSpace::ForceFields::QueryForceModelDisplayName(ActiveSource->Model);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Medium, { ModelBtn.X + 10.0f, ModelBtn.Y + 6.5f }, 10.5f, WorkspaceSurfaceColors::PrimaryInk, ModelName);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { ModelBtn.Right() - 48.0f, ModelBtn.Y + 7.5f }, 9.0f, WorkspaceSurfaceColors::FaintInk, "Next >");
        if (Interactive && ModelBtn.Contains(Cursor) && Input.PrimaryPointer.Pressed)
        {
            const uint32_t NextM = (static_cast<uint32_t>(ActiveSource->Model) + 1u) %
                                   static_cast<uint32_t>(SimulationSpace::ForceFields::ForceModel::Count);
            ActiveSource->Model  = static_cast<SimulationSpace::ForceFields::ForceModel>(NextM);
            ActiveSource->Domain = SimulationSpace::ForceFields::QueryDomainForModel(ActiveSource->Model);
            Entry.CategoryLabel  = SimulationSpace::ForceFields::QueryForceModelDisplayName(ActiveSource->Model);
        }

        DrawScalarScrubber(Card.X, InnerWidth, Card.Y + 66.0f,  "Strength", ActiveSource->Strength,        -40.0f, 60.0f, "m/s");
        DrawScalarScrubber(Card.X, InnerWidth, Card.Y + 100.0f, "Radius",   ActiveSource->RadiusMeters,     2.0f,  60.0f, "m");
        DrawScalarScrubber(Card.X, InnerWidth, Card.Y + 134.0f, "Falloff",  ActiveSource->FalloffExponent,  0.1f,  4.0f,  "exp");
        DrawScalarScrubber(Card.X, InnerWidth, Card.Y + 168.0f, "Swirl",    ActiveSource->SwirlRatio,      -2.0f,  2.0f,  "x");
        CurY += Card.Height + 10.0f;
    }

    // Card 2: Curve & Motion Path (146px)
    {
        const Rectangle2D Card{ LeftX, CurY, InnerWidth, 146.0f };
        Surface.FillRectangle(Card, ColorRgba{ 30, 31, 34, 255 }, 10.0f);
        Surface.StrokeRectangle(Card, ColorRgba{ 54, 58, 64, 255 }, 10.0f, 1.0f);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { Card.X + 12.0f, Card.Y + 11.0f }, 10.5f, ColorRgba{ 246, 198, 108, 255 }, "CURVE & MOTION PATH");

        constexpr std::array<std::pair<const char*, SimulationSpace::ForceFields::MotionPathTopology>, 4> Modes = {{
            { "Still",  SimulationSpace::ForceFields::MotionPathTopology::Static        },
            { "Line",   SimulationSpace::ForceFields::MotionPathTopology::LinearSpan    },
            { "Spline", SimulationSpace::ForceFields::MotionPathTopology::CatmullSpline },
            { "Orbit",  SimulationSpace::ForceFields::MotionPathTopology::HelicalOrbit  },
        }};
        const float PillW = (InnerWidth - 24.0f - 12.0f) * 0.25f;
        float       Px    = Card.X + 12.0f;
        for (const auto& M : Modes)
        {
            const bool        Sel = (ActiveSource->Motion.Topology == M.second);
            const Rectangle2D Pill{ Px, Card.Y + 34.0f, PillW, 24.0f };
            Surface.FillRectangle(Pill, Sel ? ColorRgba{ 76, 58, 30, 255 } : ColorRgba{ 40, 42, 46, 255 }, 6.0f);
            Surface.StrokeRectangle(Pill, Sel ? WorkspaceSurfaceColors::SelectionAmber : ColorRgba{ 62, 64, 68, 255 }, 6.0f, 1.0f);
            Surface.TextCentered(Pill, 9.5f, Sel ? ColorRgba{ 255, 224, 152, 255 } : WorkspaceSurfaceColors::SecondaryInk, M.first);
            if (Interactive && Pill.Contains(Cursor) && Input.PrimaryPointer.Pressed)
            {
                SimulationSpace::ForceFields::AssignPresetMotionPath(*ActiveSource, M.second);
            }
            Px += PillW + 4.0f;
        }

        DrawScalarScrubber(Card.X, InnerWidth, Card.Y + 68.0f, "Travel Speed", ActiveSource->Motion.SpeedMetresPerSecond, 0.5f, 25.0f, "m/s");

        char WpLine[96]{};
        std::snprintf(
            WpLine,
            sizeof(WpLine),
            "Waypoints: %u pts  |  Phase %.2f",
            ActiveSource->Motion.WaypointCount,
            ActiveSource->Motion.NormalizedProgress);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { Card.X + 12.0f, Card.Y + 114.0f }, InnerWidth - 24.0f, 9.5f, WorkspaceSurfaceColors::FaintInk, WpLine);
        CurY += Card.Height + 10.0f;
    }

    // Card 3: Formula (VectorFieldLang) (116px)
    {
        const Rectangle2D Card{ LeftX, CurY, InnerWidth, 116.0f };
        Surface.FillRectangle(Card, ColorRgba{ 30, 31, 34, 255 }, 10.0f);
        Surface.StrokeRectangle(Card, ColorRgba{ 54, 58, 64, 255 }, 10.0f, 1.0f);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { Card.X + 12.0f, Card.Y + 11.0f }, 10.5f, ColorRgba{ 168, 198, 255, 255 }, "FORMULA (VECTORFIELDLANG)");

        const Rectangle2D PresetBtn{ Card.X + 12.0f, Card.Y + 34.0f, InnerWidth - 24.0f, 24.0f };
        Surface.FillRectangle(PresetBtn, ColorRgba{ 40, 42, 48, 255 }, 6.0f);
        Surface.StrokeRectangle(PresetBtn, ColorRgba{ 76, 84, 108, 255 }, 6.0f, 1.0f);
        WorkspaceAppearance::ConstructTruncatedText(
            Surface,
            FontWeightClass::Regular,
            { PresetBtn.X + 8.0f, PresetBtn.Y + 6.0f },
            PresetBtn.Width - 16.0f,
            9.5f,
            ColorRgba{ 212, 224, 248, 255 },
            ActiveSource->FormulaSourceText.empty() ? "Click to cycle preset formula..." : ActiveSource->FormulaSourceText);

        if (Interactive && PresetBtn.Contains(Cursor) && Input.PrimaryPointer.Pressed)
        {
            static uint32_t PresetIdx = 0u;
            const auto Presets        = SimulationSpace::ForceFields::QueryBuiltInFormulaPresets();
            if (!Presets.empty())
            {
                const auto& Choice             = Presets[PresetIdx++ % Presets.size()];
                ActiveSource->FormulaSourceText = Choice.FormulaSource;
                ActiveSource->FormulaEnabled    = true;
            }
        }

        const char* StatusMsg = ActiveSource->FormulaEnabled
                                    ? "Bytecode compiled -> .slang SPIR-V"
                                    : "Analytical GPU/CPU ForceModel law active";
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { Card.X + 12.0f, Card.Y + 72.0f }, 9.5f, ColorRgba{ 132, 212, 168, 255 }, StatusMsg);
        CurY += Card.Height + 10.0f;
    }

    // Card 4: Anemometer & Wind Probe (118px)
    {
        const Rectangle2D Card{ LeftX, CurY, InnerWidth, 118.0f };
        Surface.FillRectangle(Card, ColorRgba{ 28, 32, 36, 255 }, 10.0f);
        Surface.StrokeRectangle(Card, ColorRgba{ 58, 76, 86, 255 }, 10.0f, 1.0f);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { Card.X + 12.0f, Card.Y + 11.0f }, 10.5f, ColorRgba{ 104, 220, 255, 255 }, "ANEMOMETER & WIND PROBE");

        const auto ProbePos = (BoundViewport != nullptr)
                                  ? BoundViewport->QueryForceOverlaySettings().AnemometerWorldMeters
                                  : SimulationSpace::ForceFields::SpatialVector3{ 0.0f, 0.0f, 8.0f };
        const auto Diag  = Accumulator.QueryAnemometerDiagnostics(ProbePos, SimulationTimeSec);
        const float Spd  = SimulationSpace::ForceFields::VectorLength(Diag.TotalForce.AdvectionVelocity);
        char Row1[96]{};
        std::snprintf(Row1, sizeof(Row1), "Speed: %.2f m/s   Bft %u   q: %.1f Pa", Spd, Diag.BeaufortScale, Diag.DynamicPressurePa);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { Card.X + 12.0f, Card.Y + 34.0f }, 10.0f, WorkspaceSurfaceColors::PrimaryInk, Row1);

        const Rectangle2D Chart{ Card.X + 12.0f, Card.Y + 56.0f, InnerWidth - 24.0f, 48.0f };
        Surface.FillRectangle(Chart, ColorRgba{ 20, 24, 28, 255 }, 6.0f);
        float Peak = 1.0f;
        for (float V : AnemometerHistoryMs)
        {
            Peak = std::max(Peak, V);
        }
        const float StepX = Chart.Width / static_cast<float>(AnemometerHistoryMs.size() - 1u);
        for (std::size_t I = 0u; I + 1u < AnemometerHistoryMs.size(); ++I)
        {
            const std::size_t A = (AnemometerCursor + I) % AnemometerHistoryMs.size();
            const std::size_t B = (AnemometerCursor + I + 1u) % AnemometerHistoryMs.size();
            const float Y0 = Chart.Bottom() - 6.0f - (AnemometerHistoryMs[A] / Peak) * (Chart.Height - 12.0f);
            const float Y1 = Chart.Bottom() - 6.0f - (AnemometerHistoryMs[B] / Peak) * (Chart.Height - 12.0f);
            Surface.StrokeLine(
                { Chart.X + static_cast<float>(I) * StepX, Y0 },
                { Chart.X + static_cast<float>(I + 1u) * StepX, Y1 },
                ColorRgba{ 104, 220, 255, 255 },
                1.6f);
        }
        CurY += Card.Height + 12.0f;
    }

    return CurY - TopY;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    ACCESSORS
//------------------------------------------------------------------------------------------------------------------------

SimulationSpace::ForceFields::ForceFieldAccumulator& VectorFieldViewportCoordinator::AccessAccumulator() noexcept { return Accumulator; }
const SimulationSpace::ForceFields::ForceFieldAccumulator& VectorFieldViewportCoordinator::QueryAccumulator() const noexcept { return Accumulator; }
SimulationSpace::ForceFields::FieldLatticeCascade& VectorFieldViewportCoordinator::AccessLatticeCascade() noexcept { return LatticeCascade; }
SimulationSpace::ForceFields::FieldLatticeVulkanExecutor& VectorFieldViewportCoordinator::AccessVulkanExecutor() noexcept { return VulkanExecutor; }
VectorFieldOverlaySequence& VectorFieldViewportCoordinator::AccessOverlaySequence() noexcept { return OverlaySequence; }
OverlayCameraState& VectorFieldViewportCoordinator::AccessCamera(uint32_t PaneIndex) noexcept { return Cameras[PaneIndex < 2u ? PaneIndex : 0u]; }
int32_t VectorFieldViewportCoordinator::QuerySelectedWaypointIndex() const noexcept { return SelectedWaypointIdx; }
void VectorFieldViewportCoordinator::ConfigureSelectedWaypointIndex(int32_t WaypointIdx) noexcept { SelectedWaypointIdx = WaypointIdx; }
uint32_t VectorFieldViewportCoordinator::QueryMappedForceToken(OutlinerSlotToken OutlinerToken) const noexcept
{
    for (const auto& Src : AuthoredSources)
    {
        if (Src.OutlinerTokenId == OutlinerToken.Identifier)
        {
            return Src.UniqueToken;
        }
    }
    return 0u;
}
double VectorFieldViewportCoordinator::QuerySimulationTimeSeconds() const noexcept { return SimulationTimeSec; }

} // namespace Frontier::Editor::Simulation
