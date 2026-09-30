#include "Engine/ProjectInterchange/ProjectInterchange.h"

#include <dlfcn.h>
#include <cstdio>
#include <cstring>
#include <string>

namespace
{

int PanelCount = 0;
int SceneMutationCount = 0;
int DiagnosticCount = 0;
bool HostRecordInvalid = false;

void FRONTIER_CODE_IMAGE_CALL ReceivePanel(const FrontierProjectPanel* Panel, void*)
{
    if (Panel == nullptr || Panel->StructureSize < sizeof(FrontierProjectPanel) ||
        Panel->StableName == nullptr || Panel->DisplayName == nullptr)
    {
        HostRecordInvalid = true;
        return;
    }
    ++PanelCount;
    std::printf("  received panel: %s (%s)\n", Panel->DisplayName, Panel->StableName);
}

void FRONTIER_CODE_IMAGE_CALL ReceiveSceneMutation(const FrontierProjectSceneMutation* Mutation, void*)
{
    if (Mutation == nullptr || Mutation->StructureSize < sizeof(FrontierProjectSceneMutation) ||
        Mutation->MutationNumber != 1u || Mutation->SubjectName == nullptr ||
        Mutation->Transform[0] != 1.0f || Mutation->Transform[5] != 1.0f ||
        Mutation->Transform[10] != 1.0f || Mutation->Transform[15] != 1.0f)
    {
        HostRecordInvalid = true;
        return;
    }
    ++SceneMutationCount;
    std::printf("  received scene subject: %s\n", Mutation->SubjectName);
}

void FRONTIER_CODE_IMAGE_CALL ReceiveDiagnostic(const FrontierProjectDiagnostic* Diagnostic, void*)
{
    if (Diagnostic == nullptr || Diagnostic->StructureSize < sizeof(FrontierProjectDiagnostic) ||
        Diagnostic->SubjectName == nullptr || Diagnostic->Explanation == nullptr)
    {
        HostRecordInvalid = true;
        return;
    }
    ++DiagnosticCount;
    std::printf("  received diagnostic: %s\n", Diagnostic->SubjectName);
}

bool CheckImage(const char* Path, int ExpectedPanels, int ExpectedMutations, int ExpectedDiagnostics)
{
    PanelCount = 0;
    SceneMutationCount = 0;
    DiagnosticCount = 0;
    HostRecordInvalid = false;
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
    Host.ReceiveSceneMutation = &ReceiveSceneMutation;
    Host.ReceivePanel = &ReceivePanel;
    Host.ReceiveDiagnostic = &ReceiveDiagnostic;
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

    if (HostRecordInvalid || PanelCount != ExpectedPanels || SceneMutationCount != ExpectedMutations ||
        DiagnosticCount != ExpectedDiagnostics)
    {
        std::fprintf(stderr, "[ABI] host callback expectation failed for %s (panels %d/%d, subjects %d/%d, diagnostics %d/%d)\n",
                     Path, PanelCount, ExpectedPanels, SceneMutationCount, ExpectedMutations,
                     DiagnosticCount, ExpectedDiagnostics);
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
    bool Passed = CheckImage("./ProjectZero.so", 0, 0, 0);
    // Project-Drive declares five granular host-owned panels, the vehicle/course outliner subjects, and its
    // C-layout diagnostic. This verifies the expanded declarations without passing any ImGui/Vulkan objects.
    Passed = CheckImage("./ProjectDrive.so", 5, 9, 1) && Passed;
    std::printf("[ABI] %s\n", Passed ? "all code-image lifecycle checks passed" : "code-image lifecycle check failed");
    return Passed ? 0 : 1;
}
