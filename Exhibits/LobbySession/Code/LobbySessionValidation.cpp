/*==========================================================================================================================================
                                                       LOBBYSESSIONVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 End-to-end validation of Studio Lobby default startup, 1-to-5 dynamic slot visibility, Lobby-only cinematic camera, rig/route
//    transition cameras, SceneGeometryOccupancy Lobby binding, studio luminaires, and Lobby <-> Proving Grounds level switching.

#include "Engine/Interface/IconPresentation.h"
#include "EverestWorkspace.h"
#include "Frontier/Engine/Geometry/ShapeArchive.h"
#include "Frontier/Engine/Rendering/GlobalIllumination/LuminaireRegister.h"
#include "Frontier/Engine/Rendering/GlobalIllumination/SceneStructure.h"
#include "Frontier/Extensions/Rendering/SceneGeometryOccupancy.h"
#include "UI/Editor/ControlCentrePanel.h"

#include <imgui.h>

#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

namespace
{

struct CheckRecord
{
    bool        Passed = false;
    std::string Claim{};
};

class Ledger
{
public:
    void Check(bool Condition, std::string Claim)
    {
        Records.push_back({Condition, std::move(Claim)});
        if (!Condition)
        {
            ++FailureCount;
            std::cerr << "[FAIL] " << Records.back().Claim << "\n";
        }
    }

    [[nodiscard]] int QueryFailures() const noexcept { return FailureCount; }

    bool WriteMarkdown(const std::filesystem::path& OutputPath) const
    {
        std::filesystem::create_directories(OutputPath.parent_path());
        std::ofstream Stream(OutputPath);
        if (!Stream)
        {
            return false;
        }
        Stream << "# LobbySessionValidation\n\n";
        Stream << "Verification of Studio Lobby startup, dynamic 1-to-5 vehicle roster, Lobby-only cinematic camera, transition camera, and level switching.\n\n";
        Stream << "| Status | Claim |\n|---|---|\n";
        for (const CheckRecord& Entry : Records)
        {
            Stream << "| " << (Entry.Passed ? "🟢" : "🔴") << " | " << Entry.Claim << " |\n";
        }
        Stream << "\nTotal checks: " << Records.size() << ", failures: " << FailureCount << ".\n";
        return true;
    }

private:
    std::vector<CheckRecord> Records{};
    int                      FailureCount = 0;
};

const Frontier::GeometryRecord* FindGeometryByName(const Frontier::WorldSpace& World, std::string_view Name)
{
    for (const Frontier::SceneRecordBase* Candidate : World.FindAllByType("Geometry"))
    {
        if (Candidate->QueryRecordName() == Name)
        {
            return dynamic_cast<const Frontier::GeometryRecord*>(Candidate);
        }
    }
    return nullptr;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    if (ArgumentCount < 4)
    {
        std::cerr << "Usage: LobbySessionValidation <EngineContent> <Projects/Everest> <OutputLedger.md>\n";
        return 1;
    }

    const std::filesystem::path ContentRoot = std::filesystem::absolute(Arguments[1]);
    const std::filesystem::path EverestRoot = std::filesystem::absolute(Arguments[2]);
    const std::filesystem::path LedgerPath  = std::filesystem::absolute(Arguments[3]);

    Ledger Audit{};

    // ① Studio luminaires & Lobby.facetspace occupancy invariants (no GPU required).
    {
        const auto Luminaires = Frontier::GlobalIllumination::QueryLobbyStudioLuminaires();
        Audit.Check(Luminaires.size() == 5u, "QueryLobbyStudioLuminaires provides overhead softbox flood + 4 cyclorama cove washes (5 total)");
        Audit.Check(std::abs(Luminaires[0].Intensity - 950.0) < 1.0e-6 && std::abs(Luminaires[1].Intensity - 430.0) < 1.0e-6,
                    "Studio luminaire intensities match authored VehicleHMI Lobby calibration (950 / 430)");

        Frontier::GlobalIllumination::SceneStructure Scene;
        std::string                                  SceneDiag;
        const std::filesystem::path                  LobbyFacetPath = ContentRoot / "EnvironmentArchives/Lobby/Lobby.facetspace";
        Audit.Check(Scene.LoadFacetSpace(LobbyFacetPath, &SceneDiag), "Lobby.facetspace decodes cleanly via FSP1 SceneStructure");
        Audit.Check(Scene.Occupants.size() == 230u && Scene.Occupants[0].Name == "ControlVehicle" && Scene.Occupants[5].Name == "Hero plates",
                    "Lobby.facetspace contains 230 occupants with ControlVehicle [0] and Hero plates [5]");

        std::ifstream MatStream(ContentRoot / "EnvironmentArchives/Lobby/Materials.bin", std::ios::binary);
        const std::vector<uint8_t> MaterialBytes((std::istreambuf_iterator<char>(MatStream)), std::istreambuf_iterator<char>());
        Scene.ConvertStressReserve(32u);

        Frontier::WorldSpace LobbyWorld;
        Everest::RegisterEverestSimulationTypes(LobbyWorld);
        std::string WorldDiag;
        Audit.Check(LobbyWorld.LoadLevelSpace(EverestRoot / "Content/Levels/Lobby.levelspace", &WorldDiag),
                    "Lobby.levelspace loads cleanly into WorldSpace");
        Audit.Check(LobbyWorld.QueryEnvironmentArchive() == "Lobby", "Lobby.levelspace declares environment_archive = 'Lobby'");

        Frontier::SceneGeometryOccupancy Occupancy;
        Occupancy.Reset(&Scene, MaterialBytes);
        const auto InitialPlacements = Occupancy.ResolvePlacements(LobbyWorld);
        const auto Resolutions       = Occupancy.QueryResolutions();
        bool       AllBound          = (Resolutions->size() == 9u);
        for (const auto& [Token, Resolution] : *Resolutions)
        {
            (void)Token;
            AllBound = AllBound && Resolution.Bound && Resolution.Diagnostic.empty();
        }
        Audit.Check(AllBound, "All 9 Lobby Geometry records (5 studio architecture + 4 guest car stands) bind cleanly with zero diagnostics");

        // Verify that solo Lobby hides the 24 guest car occupants (Occ[6..29]) while keeping Occ[5] ('Hero plates') untouched by Coverable_.
        bool GuestCarsHiddenSolo = true;
        bool HeroPlatesUntouched = true;
        for (const auto& Placement : InitialPlacements)
        {
            if (Placement.Occupant >= 6u && Placement.Occupant <= 29u && Placement.Active)
            {
                GuestCarsHiddenSolo = false;
            }
            if (Placement.Occupant == 5u && !Placement.Active)
            {
                HeroPlatesUntouched = false;
            }
        }
        Audit.Check(GuestCarsHiddenSolo, "Solo Lobby hides all 4 guest stand cars (occupants 6..29) by default");
        Audit.Check(HeroPlatesUntouched, "Hero plates (occupant 5) excluded from Coverable_ sweep so hero vehicle stays intact");
    }

    // ② EverestWorkspace default startup + dynamic 1-to-5 vehicle roster.
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& Io    = ImGui::GetIO();
    Io.IniFilename = nullptr;
    Io.BackendFlags |= ImGuiBackendFlags_RendererHasTextures | ImGuiBackendFlags_RendererHasVtxOffset;
    ImGui::GetPlatformIO().Renderer_TextureMaxWidth  = 4096;
    ImGui::GetPlatformIO().Renderer_TextureMaxHeight = 4096;
    Frontier::IconPresentation::Attach(ContentRoot / "Icons");

    const std::filesystem::path ScratchPrefs = std::filesystem::temp_directory_path() / "LobbySessionValidationPrefs.projectspace";
    std::filesystem::remove(ScratchPrefs);

    {
        Frontier::ActivationOwnership Ownership(
            new Frontier::ControlCentrePanel(ContentRoot / "FontArchives", ScratchPrefs, EverestRoot / "Everest.projectspace"));
        auto* Centre = static_cast<Frontier::ControlCentrePanel*>(Ownership.get());
        Audit.Check(Centre->Initialize() && Centre->Activate(), "ControlCentrePanel initializes with Everest.projectspace");

        Everest::EverestWorkspace Workspace(*Centre, EverestRoot);
        auto&                     World = Workspace.QueryWorldSpace();
        auto&                     Lobby = Workspace.AccessLobbySession();

        Audit.Check(Workspace.QueryLobbyActive(), "EverestWorkspace boots into Studio Lobby by default (startup_level = 'lobby-level')");
        Audit.Check(Lobby.QueryActiveVehicleCount() == 1u, "Solo startup shows 1 hero car on the centre turntable");

        const auto* HeroVehicle = dynamic_cast<const Frontier::VehicleRecord*>(World.FindFirstByType("Vehicle"));
        Audit.Check(HeroVehicle != nullptr && HeroVehicle->QueryConfiguration().Visible && !HeroVehicle->QueryConfiguration().Physics,
                    "Hero ControlVehicle is visible on centre turntable with showcase physics off in Studio Lobby");

        for (uint32_t Slot = 1u; Slot <= 4u; ++Slot)
        {
            const auto* GuestRec = FindGeometryByName(World, Everest::QueryLobbyGuestRecordName(Slot));
            Audit.Check(GuestRec != nullptr && !GuestRec->QueryConfiguration().Visible,
                        std::string(Everest::QueryLobbyGuestRecordName(Slot)) + " is hidden when solo");
        }

        // Dynamically join players 2..5 and verify each car appears on its stand.
        for (uint32_t ExpectedTotal = 2u; ExpectedTotal <= 5u; ++ExpectedTotal)
        {
            const auto Joined = Lobby.JoinGuestDriver(World);
            const auto* GuestRec = FindGeometryByName(World, Everest::QueryLobbyGuestRecordName(ExpectedTotal - 1u));
            Audit.Check(Joined.has_value() && Lobby.QueryActiveVehicleCount() == ExpectedTotal &&
                            GuestRec != nullptr && GuestRec->QueryConfiguration().Visible,
                        "Player " + std::to_string(ExpectedTotal) + " join activates " +
                            std::string(Everest::QueryLobbyGuestRecordName(ExpectedTotal - 1u)));
        }
        Audit.Check(!Lobby.JoinGuestDriver(World).has_value() && Lobby.QueryActiveVehicleCount() == 5u,
                    "6th player join is refused cleanly at MaximumParticipants = 5");

        // Remove middle slot (SlotIndex 2 -> "Lobby Slot 3") and verify lowest-free-slot reclamation.
        Audit.Check(Lobby.LeaveGuestBySlot(World, 2u) && Lobby.QueryActiveVehicleCount() == 4u &&
                        !FindGeometryByName(World, "Lobby Slot 3")->QueryConfiguration().Visible &&
                        FindGeometryByName(World, "Lobby Slot 5")->QueryConfiguration().Visible,
                    "Middle guest departure hides only Lobby Slot 3 while keeping occupied stands visible");
        const auto Rejoined = Lobby.JoinGuestDriver(World);
        Audit.Check(Rejoined.has_value() && Lobby.QuerySession().FindParticipantInSlot(2u) != nullptr &&
                        FindGeometryByName(World, "Lobby Slot 3")->QueryConfiguration().Visible,
                    "Next joining driver reclaims lowest free stand (Lobby Slot 3)");

        Lobby.ResetSolo(World);
        Audit.Check(Lobby.QueryActiveVehicleCount() == 1u && !FindGeometryByName(World, "Lobby Slot 2")->QueryConfiguration().Visible,
                    "ResetSolo returns Studio Lobby to 1 hero car on the centre turntable");

        // ③ VehicleHMI Camera + Lobby-ONLY Cinematic Camera + Rig & Route Transition Cameras.
        auto& Camera = Workspace.AccessVehicleCamera();
        Camera.ConfigureEnvironment(true);
        Audit.Check(Camera.QueryLobbyStudio() && Camera.QueryLastSolution().EntranceDollyActive,
                    "Lobby camera begins on the 7.0 s EaseCinematic studio entrance dolly");

        // Advance past the 7.0 s opening dolly.
        Frontier::VehicleSubjectKinematics Subject{};
        for (int Step = 0; Step < 80; ++Step)
        {
            (void)Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1);
        }
        Audit.Check(!Camera.QueryLastSolution().EntranceDollyActive && Camera.QueryLastSolution().VeilOpacity == 0.0,
                    "7.0 s entrance dolly settles cleanly into studio Orbit with veil lifted");

        // Advance 10.2 s untouched to trigger the Lobby-only 6-shot idle cinematic tour.
        for (int Step = 0; Step < 105; ++Step)
        {
            (void)Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1);
        }
        Audit.Check(Camera.QueryLastSolution().CinematicActive && Camera.QueryLastSolution().CinematicShotIndex == 0u,
                    "Lobby cinematic tour engages automatically after 10 s untouched attract idle (Shot 1/6)");

        // Advance across the Shot 0 -> Cover -> Reveal -> Shot 1 boundary and verify the 0.7 s fade veil peaks and clears.
        double PeakShotVeil = 0.0;
        for (int Step = 0; Step < 85; ++Step)
        {
            const auto Sol = Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1);
            PeakShotVeil   = std::max(PeakShotVeil, Sol.VeilOpacity);
        }
        Audit.Check(PeakShotVeil > 0.92 && Camera.QueryLastSolution().CinematicActive && Camera.QueryLastSolution().CinematicShotIndex == 1u,
                    "Lobby cinematic tour fades through black veil (0.7 s cover/reveal) into Shot 2/6");

        // Visitor input immediately stands down cinematic tour and widens threshold to 60 s.
        Frontier::VehicleCameraInput Touch{};
        Touch.AnyActivity = true;
        (void)Camera.Advance(Subject, Touch, 1.0 / 60.0);
        Audit.Check(!Camera.QueryLastSolution().CinematicActive, "Visitor activity immediately stands down Lobby cinematic tour");

        // Rig transition camera (LobbyBlend): Orbit -> Cockpit -> HMI Tablet.
        Camera.TransitionToMode(Frontier::VehicleCameraMode::Hmi);
        const auto MidBlend = Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.8);
        Audit.Check(MidBlend.TransitionActive && MidBlend.ActiveMode == Frontier::VehicleCameraMode::Hmi,
                    "Rig transition camera eases smoothly toward HMI Tablet framing (2.1 s EaseCinematic)");
        for (int Step = 0; Step < 20; ++Step)
        {
            (void)Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1);
        }
        Audit.Check(!Camera.QueryLastSolution().TransitionActive && std::abs(Camera.QueryLastSolution().NearClipMetres - 0.01) < 1.0e-6,
                    "HMI Tablet transition settles cleanly with 0.01 m near clip plane");

        // Route transition camera + live level switch to Proving Grounds, and proof that Lobby cinematic camera NEVER runs outdoors!
        Workspace.BeginLevelTransition(EverestRoot / "Content/Levels/ProvingGroundVehicle.levelspace", false);
        bool SwitchedAtMidpoint = false;
        double PeakRouteVeil    = 0.0;
        for (int Step = 0; Step < 20; ++Step)
        {
            const auto Sol = Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.08);
            PeakRouteVeil  = std::max(PeakRouteVeil, Sol.VeilOpacity);
            if (Camera.ConsumeRouteSwitchPoint())
            {
                SwitchedAtMidpoint = Workspace.OpenLevel(EverestRoot / "Content/Levels/ProvingGroundVehicle.levelspace", false);
            }
        }
        Audit.Check(SwitchedAtMidpoint && PeakRouteVeil > 0.90 && !Workspace.QueryLobbyActive() &&
                        World.QueryEnvironmentArchive() == "ProvingGround",
                    "Route transition camera fades to black and switches live to ProvingGroundVehicle.levelspace");

        // Advance 120 seconds idle on Proving Grounds in both Chase and Orbit: CinematicActive must NEVER engage!
        bool OutdoorCinematicEverTriggered = false;
        for (int Step = 0; Step < 600; ++Step)
        {
            OutdoorCinematicEverTriggered |= Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1).CinematicActive;
        }
        Camera.ConfigureModeImmediate(Frontier::VehicleCameraMode::Orbit, Subject);
        for (int Step = 0; Step < 700; ++Step)
        {
            OutdoorCinematicEverTriggered |= Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.1).CinematicActive;
        }
        Audit.Check(!OutdoorCinematicEverTriggered,
                    "Lobby cinematic camera is strictly Lobby-only and never engages on Proving Grounds (even after 130 s idle)");

        // Verify all 8 VehicleHMI rigs cycle cleanly outdoors.
        Camera.ConfigureModeImmediate(Frontier::VehicleCameraMode::Chase, Subject);
        for (int RigStep = 0; RigStep < 8; ++RigStep)
        {
            Camera.CycleRig(false);
            (void)Camera.Advance(Subject, Frontier::VehicleCameraInput{}, 0.9);
        }
        Audit.Check(Camera.QueryMode() == Frontier::VehicleCameraMode::Chase,
                    "All 8 VehicleHMI camera rigs (Chase, Orbit, Cockpit, HMI, Passenger, Hood, Tyre FL, Tyre RL) cycle cleanly");

        // Switch back to Studio Lobby.
        Audit.Check(Workspace.OpenLevel(EverestRoot / "Content/Levels/Lobby.levelspace", false) && Workspace.QueryLobbyActive(),
                    "Two-way level switch returns cleanly from Proving Grounds to Studio Lobby");
    }

    ImGui::GetIO().BackendFlags = 0;
    ImGui::DestroyContext();
    std::filesystem::remove(ScratchPrefs);

    if (!Audit.WriteMarkdown(LedgerPath))
    {
        std::cerr << "Failed writing ledger to " << LedgerPath << "\n";
        return 1;
    }

    std::cout << "[LobbySessionValidation] Completed with " << Audit.QueryFailures() << " failures -> " << LedgerPath << "\n";
    return Audit.QueryFailures() == 0 ? 0 : 1;
}
