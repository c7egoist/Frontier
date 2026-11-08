/*==========================================================================================================================================
                                                   RAYTRACINGREFRESHVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Validates and measures production TLAS refreshes over static, edited and degenerate inputs.

#include "Rendering/GlobalIllumination/RayTracingSpace.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

using namespace Frontier;
using namespace Frontier::GlobalIllumination;
namespace
{
int Failures = 0;
void Check(bool Condition, const char* Label)
{
    std::printf("[%s] %s\n", Condition ? "PASS" : "FAIL", Label);
    if (!Condition) ++Failures;
}
uint32_t Word(const std::vector<uint8_t>& Bytes, size_t Index)
{
    uint32_t Value;
    std::memcpy(&Value, Bytes.data() + 4 * Index, 4);
    return Value;
}
float Scalar(const std::vector<uint8_t>& Bytes, size_t Index)
{
    float Value;
    std::memcpy(&Value, Bytes.data() + 4 * Index, 4);
    return Value;
}
bool InspectTlas(const SceneStructure& Scene, const RayTracingSpace& Ray)
{
    if (Ray.OccupantBlasRoot.size() != Scene.Occupants.size() || Ray.UsedTlasEntries == 0 ||
        static_cast<size_t>(Ray.UsedTlasEntries) * 32 > Ray.AllEntryBytes.size()) return false;
    const auto& Bytes = Ray.AllEntryBytes;
    if (Ray.ActiveInstances == 0) return Ray.UsedTlasEntries == 1 && Word(Bytes, 3) == EmptyTlasSentinel && Word(Bytes, 7) == 0;
    std::vector<uint32_t> Seen(Ray.UsedTlasEntries), Occupants(Scene.Occupants.size()), Pending{0};
    while (!Pending.empty())
    {
        const uint32_t Entry = Pending.back(); Pending.pop_back();
        if (Entry >= Ray.UsedTlasEntries || Seen[Entry]++) return false;
        const size_t Offset = static_cast<size_t>(Entry) * 8;
        const uint32_t Count = Word(Bytes, Offset + 7), Link = Word(Bytes, Offset + 3);
        if (Count & TlasLeafBit)
        {
            const uint32_t Index = Count & ~TlasLeafBit;
            if (Index >= Scene.Occupants.size() || Occupants[Index]++ || Ray.OccupantBlasRoot[Index] < 0 ||
                Link != static_cast<uint32_t>(Ray.OccupantBlasRoot[Index])) return false;
            const WorldBounds Bounds = Scene.QueryWorldBounds(Index);
            for (size_t Axis = 0; Axis < 3; ++Axis)
                if (Scalar(Bytes, Offset + Axis) != static_cast<float>(Bounds.Minimum[Axis]) ||
                    Scalar(Bytes, Offset + 4 + Axis) != static_cast<float>(Bounds.Maximum[Axis])) return false;
        }
        else
        {
            if (Count || Link + 1 >= Ray.UsedTlasEntries) return false;
            for (uint32_t Child : {Link, Link + 1})
            {
                const size_t ChildOffset = static_cast<size_t>(Child) * 8;
                for (size_t Axis = 0; Axis < 3; ++Axis)
                    if (Scalar(Bytes, Offset + Axis) > Scalar(Bytes, ChildOffset + Axis) ||
                        Scalar(Bytes, Offset + 4 + Axis) < Scalar(Bytes, ChildOffset + 4 + Axis)) return false;
                Pending.push_back(Child);
            }
        }
    }
    uint32_t Expected = 0;
    for (uint32_t Index = 0; Index < Scene.Occupants.size(); ++Index)
    {
        const auto& Entry = Scene.Occupants[Index];
        const bool Included = !Entry.Inactive && Ray.OccupantBlasRoot[Index] >= 0 &&
            (static_cast<int32_t>(Index) == Scene.GroundOccupant || (Entry.Participation & OccupantParticipation::Raster) || Entry.Fragment);
        if (Occupants[Index] != static_cast<uint32_t>(Included)) return false;
        Expected += Included;
    }
    return Expected == Ray.ActiveInstances && std::all_of(Seen.begin(), Seen.end(), [](uint32_t Count) { return Count == 1; });
}
void Capture(const char* Label, SceneStructure& Scene, RayTracingSpace& Ray, std::ofstream& Output)
{
    Ray.RefreshTlas(Scene);
    const bool Valid = InspectTlas(Scene, Ray);
    Check(Valid, Label);
    if (!Valid) return;
    if (Output.is_open())
    {
        Output.write(reinterpret_cast<const char*>(&Ray.ActiveInstances), sizeof(Ray.ActiveInstances));
        Output.write(reinterpret_cast<const char*>(&Ray.UsedTlasEntries), sizeof(Ray.UsedTlasEntries));
        Output.write(reinterpret_cast<const char*>(Ray.AllEntryBytes.data()), static_cast<std::streamsize>(Ray.UsedTlasEntries) * 32);
        if (!Output) ++Failures;
    }
}
void Validate(SceneStructure& Scene, RayTracingSpace& Ray, const char* Path)
{
    std::ofstream Output;
    if (Path) { Output.open(Path, std::ios::binary); if (!Output) { ++Failures; return; } }
    const auto Original = Scene.Occupants;
    uint32_t Selected = 0, Alternate = static_cast<uint32_t>(Scene.Occupants.size());
    for (; Selected < Scene.Occupants.size(); ++Selected)
        if (static_cast<int32_t>(Selected) != Scene.GroundOccupant && !Scene.Occupants[Selected].Inactive &&
            Ray.OccupantBlasRoot[Selected] >= 0 && (Scene.Occupants[Selected].Participation & OccupantParticipation::Raster)) break;
    if (Selected == Scene.Occupants.size() || Scene.GroundOccupant < 0) { ++Failures; return; }
    for (uint32_t Index = Selected + 1; Index < Scene.Occupants.size(); ++Index)
        if (!Scene.Occupants[Index].Inactive && Ray.OccupantBlasRoot[Index] >= 0 &&
            Scene.Occupants[Index].FacetSet != Scene.Occupants[Selected].FacetSet) { Alternate = Index; break; }
    if (Alternate == Scene.Occupants.size()) { ++Failures; return; }
    auto Run = [&](const char* Label) { Capture(Label, Scene, Ray, Output); };
    Run("initial"); Run("unchanged"); Run("unchanged again");
    Scene.Occupants[Selected].Current[12] += 7.25; Run("translation"); Run("unchanged translated");
    Scene.Occupants[Selected].Current[0] *= -1.0; Run("reflected transform");
    Scene.Occupants[Selected].Inactive = true; Run("inactive");
    Scene.Occupants[Selected].Inactive = false; Run("active");
    Scene.Occupants[Selected].Participation &= ~OccupantParticipation::Raster;
    Scene.Occupants[Selected].Fragment = false; Run("not drawable");
    Scene.Occupants[Selected].Fragment = true; Run("fragment drawable");
    Scene.Occupants[Selected].LocalMinimum = Vector3{-1, -2, -3};
    Scene.Occupants[Selected].LocalMaximum = Vector3{1, 2, 3}; Run("local bounds");
    Scene.Occupants[Selected].LocalMinimum.reset(); Scene.Occupants[Selected].LocalMaximum.reset();
    Scene.Occupants[Selected].Participation &= ~OccupantParticipation::Distance;
    Scene.Occupants[Selected].CardMinimum = {-2, -3, -4}; Scene.Occupants[Selected].CardMaximum = {2, 3, 4}; Run("card bounds");
    Ray.OccupantBlasRoot[Selected] = Ray.OccupantBlasRoot[Alternate]; Run("BLAS root changed");
    Scene.Occupants[Selected].FacetSet = Scene.Occupants[Alternate].FacetSet; Run("facet reassigned");
    const uint32_t SetIndex = Scene.Occupants[Selected].FacetSet;
    const Vector3 OriginalMinimum = Scene.FacetSets[SetIndex].LocalMinimum;
    Scene.FacetSets[SetIndex].LocalMinimum[0] -= 1; Run("facet bounds edited");
    Scene.FacetSets[SetIndex].LocalMinimum = OriginalMinimum;
    const int32_t Ground = Scene.GroundOccupant;
    Scene.GroundOccupant = -1; Run("ground assignment removed");
    Scene.GroundOccupant = static_cast<int32_t>(Selected); Run("ground assignment changed");
    Scene.GroundOccupant = Ground;
    Scene.Occupants[Ground].Inactive = true; Run("ground removed");
    Scene.Occupants[Ground].Inactive = false; Scene.Occupants[Ground].Current[13] += 4; Run("ground moved");
    for (auto& Entry : Scene.Occupants) Entry.Inactive = true;
    Run("zero active"); Run("zero active unchanged");
    Scene.Occupants[Ground].Inactive = false; Run("ground only");
    Scene.Occupants[Ground].Inactive = true; Scene.Occupants[Selected].Inactive = false; Run("one object");
    Scene.Occupants = Original;
    Ray.OccupantBlasRoot[Selected] = Ray.FacetBlasRoots[Scene.Occupants[Selected].FacetSet];
    Run("restored"); Ray.BuildHostHierarchy(Scene); Run("acceleration rebuilt");
    uint32_t Random = 0x12345678u;
    for (uint32_t Iteration = 0; Iteration < 80; ++Iteration)
    {
        Random = Random * 1664525u + 1013904223u;
        auto& Entry = Scene.Occupants[Random % Scene.Occupants.size()];
        if (Iteration % 3 == 0) Entry.Inactive = !Entry.Inactive;
        else if (Iteration % 3 == 1) Entry.Current[12] += static_cast<double>(static_cast<int32_t>(Random % 17u) - 8) * 0.125;
        else Entry.Participation ^= OccupantParticipation::Raster;
        Run("seeded edit");
        if (Iteration % 8 == 0) Run("seeded unchanged");
    }
    SceneStructure Synthetic;
    FacetSet Set; FacetEntry Facet;
    Facet.Corners = {Vector3{0, 0, 0}, Vector3{1, 0, 0}, Vector3{0, 1, 0}};
    Set.Facets.push_back(Facet); Synthetic.FacetSets.push_back(Set);
    for (uint32_t Index = 0; Index < 128; ++Index)
    {
        OccupantEntry Entry; Entry.Current = ConstructIdentityTransform(); Entry.Participation = OccupantParticipation::Raster;
        Synthetic.Occupants.push_back(Entry);
    }
    Ray.BuildHostHierarchy(Synthetic);
    Capture("coincident zero bounds", Synthetic, Ray, Output);
    Capture("coincident unchanged", Synthetic, Ray, Output);
    Synthetic.GroundOccupant = 0; Capture("coincident ground", Synthetic, Ray, Output);
    Synthetic.GroundOccupant = -1;
    Synthetic.FacetSets[0].LocalMinimum = {-0.5, -0.25, -0.125};
    Synthetic.FacetSets[0].LocalMaximum = {0.5, 0.25, 0.125};
    for (uint32_t Index = 0; Index < Synthetic.Occupants.size(); ++Index)
    {
        Synthetic.Occupants[Index].Current[12] = static_cast<int32_t>((Index * 37u) % 23u) - 11;
        Synthetic.Occupants[Index].Current[13] = static_cast<int32_t>((Index * 11u) % 13u) - 6;
        Synthetic.Occupants[Index].Current[14] = Index % 2 ? -0.0 : 0.0;
    }
    Capture("binned grid", Synthetic, Ray, Output);
    for (uint32_t Iteration = 0; Iteration < 32; ++Iteration)
    {
        Random = Random * 1664525u + 1013904223u;
        auto& Entry = Synthetic.Occupants[Random % Synthetic.Occupants.size()];
        Entry.Current[12] += static_cast<double>(static_cast<int32_t>(Random % 7u) - 3) * 0.0625;
        if (Random & 0x100u) Entry.Inactive = !Entry.Inactive;
        Capture("binned edit", Synthetic, Ray, Output);
    }
}
void Measure(SceneStructure& Scene, RayTracingSpace& Ray)
{
    uint32_t Selected = 0;
    while (Selected < Scene.Occupants.size() && (Scene.Occupants[Selected].Inactive ||
           static_cast<int32_t>(Selected) == Scene.GroundOccupant || !(Scene.Occupants[Selected].Participation & OccupantParticipation::Raster))) ++Selected;
    if (Selected == Scene.Occupants.size()) { ++Failures; return; }
    for (int Moving = 0; Moving < 2; ++Moving)
    {
        std::vector<double> Times;
        for (int Round = 0; Round < 8; ++Round)
        {
            const auto Start = std::chrono::steady_clock::now();
            for (int Iteration = 0; Iteration < 200; ++Iteration)
            {
                if (Moving) Scene.Occupants[Selected].Current[12] += 0.015625;
                Ray.RefreshTlas(Scene);
            }
            if (Round) Times.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Start).count() / 200);
        }
        std::sort(Times.begin(), Times.end());
        std::printf("%s: median %.6f ms/refresh; range %.6f..%.6f\n", Moving ? "moving occupant" : "unchanged scene", Times[3], Times.front(), Times.back());
    }
}
void ValidateDevice(DeviceExchange& Exchange, SceneStructure& Scene, RayTracingSpace& Ray)
{
    Ray.EntryRegion = Exchange.ConstructRegion(Ray.AllEntryBytes.size(), "TLAS validation");
    if (!Ray.EntryRegion) { ++Failures; return; }
    uint32_t Writes = 0;
    Exchange.WriteObserver = [&](const std::string& Label, VkDeviceSize, const void*, VkDeviceSize) { if (Label == "TLAS validation") ++Writes; };
    Ray.RefreshTlas(Scene);
    Check(Writes == 1, "unchanged TLAS notifies the write observer");
    std::vector<uint8_t> Bytes;
    auto Matches = [&]() { return Exchange.ReadRegion(Ray.EntryRegion, 0, static_cast<VkDeviceSize>(Ray.UsedTlasEntries) * 32, Bytes) &&
        std::equal(Bytes.begin(), Bytes.end(), Ray.AllEntryBytes.begin()); };
    Check(Matches(), "unchanged TLAS reaches device");
    Ray.EntryRegion = Exchange.ConstructRegion(Ray.AllEntryBytes.size(), "replacement TLAS");
    if (!Ray.EntryRegion) { ++Failures; return; }
    Ray.RefreshTlas(Scene); Check(Matches(), "replacement region receives TLAS");
    uint32_t Selected = 0;
    while (Selected < Scene.Occupants.size() && (Scene.Occupants[Selected].Inactive ||
           static_cast<int32_t>(Selected) == Scene.GroundOccupant || !(Scene.Occupants[Selected].Participation & OccupantParticipation::Raster))) ++Selected;
    if (Selected == Scene.Occupants.size()) { ++Failures; return; }
    Scene.Occupants[Selected].Current[12] += 3.0; Ray.RefreshTlas(Scene);
    Check(InspectTlas(Scene, Ray) && Matches(), "moved TLAS reaches device");
    Exchange.WriteObserver = {};
}
} // namespace
int main(int Count, char** Arguments)
{
    if (Count < 2) { std::fprintf(stderr, "usage: RayTracingRefreshValidation scene.facetspace [--benchmark | --vulkan | snapshot.bin]\n"); return 2; }
    SceneStructure Scene; std::string Diagnostic;
    if (!Scene.LoadFacetSpace(Arguments[1], &Diagnostic)) { std::fprintf(stderr, "%s\n", Diagnostic.c_str()); return 1; }
    DeviceExchange Exchange;
    const std::string Mode = Count > 2 ? Arguments[2] : "";
    if (Mode == "--vulkan" && !Exchange.Initialize("", &Diagnostic)) { std::fprintf(stderr, "%s\n", Diagnostic.c_str()); return 2; }
    RayTracingSpace Ray(Exchange); Ray.BuildHostHierarchy(Scene); Ray.RefreshTlas(Scene);
    if (Mode == "--benchmark") Measure(Scene, Ray);
    else if (Mode == "--vulkan") ValidateDevice(Exchange, Scene, Ray);
    else Validate(Scene, Ray, Mode.empty() ? nullptr : Mode.c_str());
    std::printf("RayTracingRefreshValidation: %d failures\n", Failures);
    return Failures ? 1 : 0;
}
