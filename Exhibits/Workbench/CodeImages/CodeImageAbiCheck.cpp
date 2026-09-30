#include "Engine/ProjectInterchange/ProjectInterchange.h"

#include <dlfcn.h>
#include <cstdio>
#include <cstring>
#include <string>

namespace
{

int PanelCount = 0;

void FRONTIER_CODE_IMAGE_CALL ReceivePanel(const FrontierProjectPanel* Panel, void*)
{
    if (Panel != nullptr && Panel->StructureSize >= sizeof(FrontierProjectPanel) &&
        Panel->StableName != nullptr && Panel->DisplayName != nullptr)
    {
        ++PanelCount;
        std::printf("  received panel: %s (%s)\n", Panel->DisplayName, Panel->StableName);
    }
}

bool CheckImage(const char* Path, bool RequiresPanel)
{
    void* Image = dlopen(Path, RTLD_NOW | RTLD_LOCAL);
    if (Image == nullptr)
    {
        std::fprintf(stderr, "[ABI] dlopen failed for %s: %s\n", Path, dlerror());
        return false;
    }

    auto Entry = reinterpret_cast<FrontierConstructProjectInterchange>(dlsym(Image, "ConstructProjectInterchange"));
    if (Entry == nullptr)
    {
        std::fprintf(stderr, "[ABI] export missing from %s\n", Path);
        dlclose(Image);
        return false;
    }

    FrontierProjectInterchange Interchange{};
    FrontierProjectRefusal Refusal{};
    if (Entry(FrontierCodeInterchangeNumber, FrontierCodeInterchangeFingerprint, &Interchange, &Refusal) == 0u ||
        Interchange.StructureSize != sizeof(FrontierProjectInterchange) ||
        Interchange.CodeInterchangeNumber != FrontierCodeInterchangeNumber ||
        Interchange.InterfaceFingerprint != FrontierCodeInterchangeFingerprint ||
        Interchange.ConstructProject == nullptr || Interchange.AdvanceProject == nullptr || Interchange.RetireProject == nullptr)
    {
        std::fprintf(stderr, "[ABI] compatible interchange rejected or malformed for %s: %s\n", Path, Refusal.Explanation);
        dlclose(Image);
        return false;
    }

    FrontierProjectInterchange StaleInterchange{};
    FrontierProjectRefusal StaleRefusal{};
    if (Entry(FrontierCodeInterchangeNumber - 1u, FrontierCodeInterchangeFingerprint, &StaleInterchange, &StaleRefusal) != 0u ||
        StaleRefusal.Number != FrontierProjectRefusalInterchange)
    {
        std::fprintf(stderr, "[ABI] revision-1 request was not refused by %s\n", Path);
        dlclose(Image);
        return false;
    }

    FrontierProjectInputReading Input{};
    Input.StructureSize = sizeof(Input);
    FrontierProjectHostInterchange Host{};
    Host.StructureSize = sizeof(Host);
    Host.InputReading = &Input;
    Host.ReceivePanel = &ReceivePanel;
    FrontierProjectLaunch Launch{};
    Launch.StructureSize = sizeof(Launch);
    Launch.ProjectName = "AbiContractCheck";
    Launch.SpecificationLocation = "AbiContractCheck.frontier";
    Launch.ContentLocation = "Content";
    Launch.OpeningSceneLocation = "Content/Scenes/Opening.gltf";
    void* ProjectRecord = nullptr;
    std::memset(&Refusal, 0, sizeof(Refusal));
    if (Interchange.ConstructProject(&Launch, &Host, &ProjectRecord, &Refusal) == 0u)
    {
        std::fprintf(stderr, "[ABI] ConstructProject rejected %s: %s\n", Path, Refusal.Explanation);
        dlclose(Image);
        return false;
    }

    FrontierProjectCycle Cycle{};
    Cycle.StructureSize = sizeof(Cycle);
    Cycle.ElapsedSeconds = 1.0f;
    Cycle.CycleSeconds = 1.0f / 60.0f;
    Cycle.InputReading = &Input;
    std::memset(&Refusal, 0, sizeof(Refusal));
    if (Interchange.AdvanceProject(ProjectRecord, &Cycle, &Refusal) == 0u)
    {
        std::fprintf(stderr, "[ABI] AdvanceProject rejected %s: %s\n", Path, Refusal.Explanation);
        Interchange.RetireProject(ProjectRecord);
        dlclose(Image);
        return false;
    }
    Interchange.RetireProject(ProjectRecord);

    if (RequiresPanel != (PanelCount != 0))
    {
        std::fprintf(stderr, "[ABI] panel callback expectation failed for %s\n", Path);
        dlclose(Image);
        return false;
    }
    std::printf("[ABI] accepted revision %llu fingerprint 0x%016llx: %s\n",
                static_cast<unsigned long long>(FrontierCodeInterchangeNumber),
                static_cast<unsigned long long>(FrontierCodeInterchangeFingerprint), Path);
    dlclose(Image);
    return true;
}

} // namespace

int main()
{
    bool Passed = CheckImage("./ProjectZero.so", false);
    PanelCount = 0;
    Passed = CheckImage("./ProjectDrive.so", true) && Passed;
    std::printf("[ABI] %s\n", Passed ? "all code-image lifecycle checks passed" : "code-image lifecycle check failed");
    return Passed ? 0 : 1;
}
