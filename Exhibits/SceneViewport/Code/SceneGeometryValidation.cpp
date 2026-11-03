/*==========================================================================================================================================
                                                        SCENEGEOMETRYVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 The scene geometry against the scene archive (no device): Project Everest's Geometry records bind every static
//    occupant of the proving ground once, reproduce the archive's placements exactly, and move, hide and re-lay them as edited.

#include "EverestSceneGeometry.h"

#include "Frontier/Engine/Rendering/GlobalIllumination/SceneStructure.h"
#include "Frontier/Engine/Scene/GeometryLayout.h"
#include "Frontier/Engine/Scene/SceneWorld.h"

#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{

using Frontier::GlobalIllumination::OccupantPlacement;
using Frontier::GlobalIllumination::SceneStructure;

int Failures = 0;
int Checks   = 0;

void Report(bool Passed, const std::string& Line)
{
    ++Checks;
    Failures += Passed ? 0 : 1;
    std::printf("%s  %s\n", Passed ? "PASS" : "FAIL", Line.c_str());
}

Frontier::GeometryRecord* FindGeometry(Frontier::SceneWorld& World, const std::string& Name)
{
    for (const Frontier::SceneRecordBase* Entry : World.FindAllByType("Geometry"))
        if (Entry->QueryRecordName() == Name) return dynamic_cast<Frontier::GeometryRecord*>(World.FindRecord(Entry->QueryToken()));
    throw std::runtime_error("no Geometry record named " + Name);
}

double Translation(const Frontier::PlacementMatrix& Matrix, int Axis)
{
    return Matrix[static_cast<size_t>(12 + Axis)];
}

std::map<uint32_t, OccupantPlacement> Index(const std::vector<OccupantPlacement>& Placements)
{
    std::map<uint32_t, OccupantPlacement> Indexed;
    for (const OccupantPlacement& Placement : Placements) Indexed[Placement.Occupant] = Placement;
    return Indexed;
}

std::vector<uint32_t> Matches(const SceneStructure& Scene, const std::string& Stem)
{
    std::vector<uint32_t> Found;
    for (uint32_t Occupant = 0; Occupant < Scene.Occupants.size(); ++Occupant)
        if (Everest::MatchOccupantStem(Scene.Occupants[Occupant].Name, Stem)) Found.push_back(Occupant);
    return Found;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    try
    {
        if (ArgumentCount < 3) throw std::runtime_error("usage: SceneGeometryValidation <Projects/Everest> <EnvironmentArchives/ProvingGround> [scratch]");
        const std::filesystem::path Project = Arguments[1];
        const std::filesystem::path Archive = Arguments[2];
        const std::filesystem::path Scratch = ArgumentCount > 3 ? std::filesystem::path(Arguments[3]) : std::filesystem::temp_directory_path();
        std::filesystem::create_directories(Scratch);

        // ① the level and the scene archive, as the editor loads them
        Frontier::SceneWorld World;
        std::string          Diagnostic;
        if (!World.LoadLevelSpace(Project / "Content" / "Levels" / "Default.levelspace", &Diagnostic)) throw std::runtime_error(Diagnostic);
        SceneStructure Scene;
        if (!Scene.LoadFacetSpace(Archive / "ProvingGround.facetspace", &Diagnostic)) throw std::runtime_error(Diagnostic);
        std::vector<uint8_t> Materials;
        if (std::ifstream Stream(Archive / "Materials.bin", std::ios::binary); Stream)
            Materials.assign(std::istreambuf_iterator<char>(Stream), std::istreambuf_iterator<char>());
        const size_t Records = World.FindAllByType("Geometry").size();
        Report(Records == 37, "the level holds " + std::to_string(Records) + " Geometry records (37)");

        // ② binding: every record binds, and the static occupants are bound once each
        Everest::SceneGeometryOccupancy Occupancy;
        Occupancy.Reset(&Scene, Materials);
        const std::vector<OccupantPlacement> Initial = Occupancy.ResolvePlacements(World);
        const auto                           Resolutions = Occupancy.QueryResolutions();
        size_t Bound = 0;
        for (const auto& [Token, Resolution] : *Resolutions)
        {
            Bound += Resolution.Bound ? 1 : 0;
            if (!Resolution.Bound) std::printf("      not bound: %s\n", Resolution.Diagnostic.c_str());
        }
        Report(Bound == Records, std::to_string(Bound) + " of " + std::to_string(Records) + " records bind to the archive");
        std::set<uint32_t> Covered;
        size_t             Duplicates = 0;
        for (const OccupantPlacement& Placement : Initial) Duplicates += Covered.insert(Placement.Occupant).second ? 0 : 1;
        size_t Outside = 0, Unexplained = 0;
        for (uint32_t Occupant = 0; Occupant < Scene.Occupants.size(); ++Occupant)
        {
            if (Covered.count(Occupant)) continue;
            const std::string& Name = Scene.Occupants[Occupant].Name;
            const bool Vehicle  = static_cast<int32_t>(Occupant) == Scene.VehicleBody || Occupant < 5;
            const bool Fragment = Name.find(" fragment ") != std::string::npos;
            const bool Stress   = Name.rfind("Stress ", 0) == 0;
            const bool Ground   = Name.rfind("Ground ", 0) == 0;
            ++Outside;
            if (!Vehicle && !Fragment && !Stress && !Ground)
            {
                ++Unexplained;
                std::printf("      unbound: %s\n", Name.c_str());
            }
        }
        Report(Duplicates == 0 && Covered.size() == 504 && Unexplained == 0,
               std::to_string(Covered.size()) + " occupants bound once each (504); the other " + std::to_string(Outside) +
                   " are the vehicle, fragment pools, stress pool and ground tiles");

        // ③ the default level shows the archive exactly
        size_t Exact = 0, Active = 0;
        for (const OccupantPlacement& Placement : Initial)
        {
            Exact += Placement.Current == Scene.Occupants[Placement.Occupant].Current ? 1 : 0;
            Active += Placement.Active ? 1 : 0;
        }
        Report(Exact == Initial.size() && Active == Initial.size(),
               std::to_string(Exact) + " of " + std::to_string(Initial.size()) + " placements are the archive's transforms bit for bit, all active");
        Report(Occupancy.ResolvePlacements(World).empty(), "an unchanged level resolves no placements again");

        // ④ a smaller array hides the copies past its count
        auto& North = FindGeometry(World, "Boundary north")->AccessConfiguration();
        North.Modifiers.front().Count = 20;
        North.AdvanceRevision();
        {
            const auto Placed = Index(Occupancy.ResolvePlacements(World));
            const auto Copies = Matches(Scene, "Boundary North");
            size_t     Hidden = 0, Kept = 0;
            for (size_t Copy = 0; Copy < Copies.size(); ++Copy)
            {
                const OccupantPlacement& Placement = Placed.at(Copies[Copy]);
                if (Copy < 20) Kept += Placement.Active && Placement.Current == Scene.Occupants[Copies[Copy]].Current ? 1 : 0;
                else Hidden += Placement.Active ? 0 : 1;
            }
            Report(Kept == 20 && Hidden == 34, "Boundary north at count 20: 20 copies in place, " + std::to_string(Hidden) + " of 34 hidden");
        }

        // ⑤ a wider step re-lays every copy along the object's X
        North.Modifiers.front().Count             = 54;
        North.Modifiers.front().ConstantMetres[0] = 5.0f;
        North.AdvanceRevision();
        {
            const auto Placed = Index(Occupancy.ResolvePlacements(World));
            const auto Copies = Matches(Scene, "Boundary North");
            double     Worst  = 0.0;
            for (size_t Copy = 0; Copy < Copies.size(); ++Copy)
            {
                const auto& Placement = Placed.at(Copies[Copy]).Current;
                Worst = std::max({Worst, std::fabs(Translation(Placement, 0) - (-58.0 + 5.0 * static_cast<double>(Copy))),
                                  std::fabs(Translation(Placement, 1) - 58.5), std::fabs(Translation(Placement, 2))});
            }
            char Line[160];
            std::snprintf(Line, sizeof(Line), "Boundary north at a 5 m step: copy n at x = -58 + 5n (worst error %.2e m)", Worst);
            Report(Worst < 1.0e-4, Line);
        }

        // ⑥ moving an object moves all its parts rigidly
        auto& Kerbs = FindGeometry(World, "Kerbs")->AccessConfiguration();
        Kerbs.Spatial.PositionMetres[1] += 2.0f;
        Kerbs.AdvanceRevision();
        {
            const auto Placed = Occupancy.ResolvePlacements(World);
            double     Worst  = 0.0;
            for (const OccupantPlacement& Placement : Placed)
            {
                const auto& Before = Scene.Occupants[Placement.Occupant].Current;
                for (int Element = 0; Element < 12; ++Element) Worst = std::max(Worst, std::fabs(Placement.Current[static_cast<size_t>(Element)] - Before[static_cast<size_t>(Element)]));
                Worst = std::max({Worst, std::fabs(Translation(Placement.Current, 0) - Before[12]), std::fabs(Translation(Placement.Current, 1) - Before[13] - 2.0),
                                  std::fabs(Translation(Placement.Current, 2) - Before[14])});
            }
            char Line[160];
            std::snprintf(Line, sizeof(Line), "Kerbs moved 2 m in Y: %zu occupants (both strips) moved exactly (worst %.2e)", Placed.size(), Worst);
            Report(Placed.size() == 36 && Worst < 1.0e-5, Line);
        }

        // ⑦ a radial array turns about the ring's centre
        auto& Ring = FindGeometry(World, "Skidpad ring")->AccessConfiguration();
        Ring.Spatial.OrientationDegrees[2] = 10.0f;
        Ring.AdvanceRevision();
        {
            const auto     Placed = Occupancy.ResolvePlacements(World);
            double         Worst  = 0.0;
            const double   θ      = 10.0 * 3.14159265358979323846 / 180.0;
            for (const OccupantPlacement& Placement : Placed)
            {
                const auto&  Before = Scene.Occupants[Placement.Occupant].Current;
                const double X = Before[12] + 30.0, Y = Before[13] - 30.0;
                Worst = std::max({Worst, std::fabs(Translation(Placement.Current, 0) - (-30.0 + X * std::cos(θ) - Y * std::sin(θ))),
                                  std::fabs(Translation(Placement.Current, 1) - (30.0 + X * std::sin(θ) + Y * std::cos(θ)))});
            }
            char Line[160];
            std::snprintf(Line, sizeof(Line), "Skidpad ring turned 10\xC2\xB0: %zu cones turn about (-30, 30) (worst %.2e m)", Placed.size(), Worst);
            Report(Placed.size() == 24 && Worst < 1.0e-4, Line);
        }

        // ⑧ hiding an object deactivates every part of every copy
        auto& Lamps = FindGeometry(World, "Street lamps")->AccessConfiguration();
        Lamps.Visible = false;
        Lamps.AdvanceRevision();
        {
            const auto Placed   = Occupancy.ResolvePlacements(World);
            size_t     Inactive = 0;
            for (const OccupantPlacement& Placement : Placed) Inactive += Placement.Active ? 0 : 1;
            Report(Placed.size() == 40 && Inactive == 40, "Street lamps hidden: " + std::to_string(Inactive) + " of 40 poles and heads inactive");
        }

        // ⑨ an Array on a single object makes copies the archive does not hold: only the first is shown
        auto& Tower = FindGeometry(World, "Control tower")->AccessConfiguration();
        Tower.Modifiers.push_back(Frontier::ArrayModifierConfiguration{});
        Tower.AdvanceRevision();
        (void)Occupancy.ResolvePlacements(World);
        {
            const auto Resolved = Occupancy.QueryResolutions();
            const auto Entry    = Resolved->find(FindGeometry(World, "Control tower")->QueryToken().Value);
            Report(Entry != Resolved->end() && Entry->second.Copies == 2 && Entry->second.Shown == 1 && Entry->second.Parts == 3,
                   "Control tower with an Array of 2: 2 copies made, 1 shown (the archive holds one tower of 3 parts)");
        }

        // ⑩ the record survives the level file
        const std::filesystem::path Saved = Scratch / "SceneGeometryValidation.levelspace";
        if (!World.SaveLevelSpace(Saved, &Diagnostic)) throw std::runtime_error(Diagnostic);
        Frontier::SceneWorld Reloaded;
        if (!Reloaded.LoadLevelSpace(Saved, &Diagnostic)) throw std::runtime_error(Diagnostic);
        size_t Same = 0;
        for (const Frontier::SceneRecordBase* Entry : World.FindAllByType("Geometry"))
        {
            const auto& Before = dynamic_cast<const Frontier::GeometryRecord*>(Entry)->QueryConfiguration();
            const auto& After  = FindGeometry(Reloaded, Entry->QueryRecordName())->QueryConfiguration();
            bool Equal = Before.OccupantStems == After.OccupantStems && Before.OccupantFirst == After.OccupantFirst && Before.OccupantCount == After.OccupantCount &&
                         Before.BaseCopies == After.BaseCopies && Before.Visible == After.Visible && Before.Modifiers.size() == After.Modifiers.size() &&
                         Before.GroupName == After.GroupName && Before.Fracture.Enabled == After.Fracture.Enabled;
            for (int Axis = 0; Axis < 3; ++Axis)
                Equal = Equal && std::fabs(Before.Spatial.PositionMetres[Axis] - After.Spatial.PositionMetres[Axis]) < 1.0e-4f &&
                        std::fabs(Before.ArchiveOriginMetres[Axis] - After.ArchiveOriginMetres[Axis]) < 1.0e-4f;
            for (size_t Modifier = 0; Equal && Modifier < Before.Modifiers.size(); ++Modifier)
                Equal = Before.Modifiers[Modifier].Count == After.Modifiers[Modifier].Count &&
                        std::fabs(Before.Modifiers[Modifier].ConstantMetres[0] - After.Modifiers[Modifier].ConstantMetres[0]) < 1.0e-4f &&
                        Before.Modifiers[Modifier].RadialPivot == After.Modifiers[Modifier].RadialPivot;
            Same += Equal ? 1 : 0;
        }
        Report(Same == Records, std::to_string(Same) + " of " + std::to_string(Records) + " records read back from the saved level as written");

        // ⑪ the placement algebra
        {
            const Frontier::PlacementMatrix Matrix = Frontier::ConstructPlacement({3.0, -2.0, 1.5}, {12.0, -34.0, 145.0}, {1.5, 0.5, 2.0});
            std::array<double, 3> Position{}, Rotation{}, Scale{};
            Frontier::DecomposePlacement(Matrix, Position, Rotation, Scale);
            const Frontier::PlacementMatrix Rebuilt  = Frontier::ConstructPlacement(Position, Rotation, Scale);
            const Frontier::PlacementMatrix Identity = Frontier::MultiplyPlacement(Frontier::InvertPlacement(Matrix), Matrix);
            Report(Frontier::ConfirmProximity(Matrix, Rebuilt, 1.0e-9, 1.0e-9) &&
                       Frontier::ConfirmProximity(Identity, Frontier::ConstructIdentityPlacement(), 1.0e-9, 1.0e-9),
                   "placements decompose into position, XYZ Euler and scale and invert exactly");
        }
        std::printf("SceneGeometryValidation: %d of %d checks passed\n", Checks - Failures, Checks);
        return Failures == 0 ? 0 : 1;
    }
    catch (const std::exception& Failure)
    {
        std::fprintf(stderr, "SceneGeometryValidation FAILED: %s\n", Failure.what());
        return 1;
    }
}
