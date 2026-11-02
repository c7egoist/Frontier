/*==========================================================================================================================================
                                                       NESTINGARCHIVEEXPORT.CPP
==========================================================================================================================================*/
// 🧩 The import step of refinement I2: builds the cluster nesting of every eligible facet set of a scene once, on every hardware
//    thread with the editor's refinement profile, and stores it beside the .facetspace (<stem>.nestingspace) for the editor to load.

// 📝 Usage: NestingArchiveExport [--verify] <scene.facetspace>. --verify rebuilds and requires the stored archive to equal the rebuild
//    byte for byte (the NestingArchiveValidation CTest). Either way a serial rebuild must equal the threaded one.
#include "Frontier/Engine/Rendering/VirtualizedGeometry/NestingProjection.h"
#include <chrono>
#include <cstdio>
#include <thread>
using namespace Frontier;
using namespace Frontier::GlobalIllumination;
using namespace Frontier::VirtualizedGeometry;

int main(int ArgumentCount, char** Arguments)
{
    bool Verify = false;
    std::filesystem::path FacetSpace;
    for (int Index = 1; Index < ArgumentCount; ++Index)
    {
        const std::string Argument = Arguments[Index];
        if (Argument == "--verify") Verify = true;
        else FacetSpace = Argument;
    }
    if (FacetSpace.empty())
    {
        std::printf("usage: NestingArchiveExport [--verify] <scene.facetspace>\n");
        return 2;
    }
    SceneStructure Scene;
    std::string    Diagnostic;
    if (!Scene.LoadFacetSpace(FacetSpace, &Diagnostic))
    {
        std::printf("NestingArchiveExport: %s\n", Diagnostic.c_str());
        return 2;
    }
    // 📝 The editor deactivates the vehicle (no car yet); its occupants are dynamic and never eligible either way.
    for (int32_t Index : {Scene.VehicleBody, Scene.VehicleWheels[0], Scene.VehicleWheels[1], Scene.VehicleWheels[2], Scene.VehicleWheels[3]})
        if (Index >= 0 && static_cast<size_t>(Index) < Scene.Occupants.size()) Scene.Occupants[Index].Inactive = true;
    Scene.ConstructDrawRuns();

    NestingOptions Threaded = RefinedNestingOptions();
    NestingOptions Serial   = Threaded;
    Serial.Threads = 1;
    auto Time = [](auto&& Build) {
        const auto Start = std::chrono::steady_clock::now();
        auto Result = Build();
        return std::pair{std::move(Result), std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Start).count()};
    };
    const auto [Archive, ThreadedMs] = Time([&] { return ConstructSceneNestingArchive(Scene, Threaded); });
    const auto [SerialArchive, SerialMs] = Time([&] { return ConstructSceneNestingArchive(Scene, Serial); });
    const std::vector<uint8_t> Bytes = EncodeNestingArchive(Archive);
    const bool Deterministic = Bytes == EncodeNestingArchive(SerialArchive);
    for (const NestingArchiveEntry& Entry : Archive.Entries)
        std::printf("facet set %u (%s): %u facets → %zu tiers, %zu clusters, coarsest %u triangles\n", Entry.FacetSet,
                    Scene.FacetSets[Entry.FacetSet].Name.c_str(), Entry.FacetCount, Entry.Nesting.Tiers.size(), Entry.Nesting.Clusters.size(),
                    Entry.Nesting.Tiers.back().TriangleCount());
    std::printf("%zu eligible sets built in %.0f ms on %u hardware threads, %.0f ms serial (%s); archive %zu bytes\n", Archive.Entries.size(),
                ThreadedMs, std::max(1u, std::thread::hardware_concurrency()), SerialMs, Deterministic ? "bit-identical" : "DIFFERENT", Bytes.size());
    if (!Deterministic) return 1;
    const std::filesystem::path Stored = std::filesystem::path(FacetSpace).replace_extension(".nestingspace");
    if (Verify)
    {
        const auto LoadStart = std::chrono::steady_clock::now();
        const std::optional<NestingArchive> Existing = ReadNestingArchive(Stored, &Diagnostic);
        const double LoadMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - LoadStart).count();
        if (!Existing)
        {
            std::printf("[FAIL] %s\n", Diagnostic.c_str());
            return 1;
        }
        const bool Current = EncodeNestingArchive(*Existing) == Bytes;
        std::printf("%s stored archive %s is %s (loaded in %.1f ms)\n", Current ? "[PASS]" : "[FAIL]", Stored.string().c_str(),
                    Current ? "current" : "stale: rerun NestingArchiveExport <scene.facetspace>", LoadMs);
        return Current ? 0 : 1;
    }
    if (!WriteNestingArchive(Stored, Archive, &Diagnostic))
    {
        std::printf("NestingArchiveExport: %s\n", Diagnostic.c_str());
        return 1;
    }
    std::printf("stored %s\n", Stored.string().c_str());
    return 0;
}
