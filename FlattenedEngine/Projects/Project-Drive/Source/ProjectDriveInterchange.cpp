//============================================================================================================================================
//                                               PROJECTDRIVEINTERCHANGE.CPP
//============================================================================================================================================
// 📦 Project-Drive's optional code image; vehicle semantics cross Frontier.exe only through C-layout records.

#include "../../../Engine/ProjectInterchange/ProjectInterchange.h"

#include <cstdio>
#include <cstring>

namespace
{

void WriteRefusal(FrontierProjectRefusal* Refusal, FrontierProjectRefusalNumber Number, const char* Explanation)
{
    if (Refusal == nullptr)
        return;

    Refusal->Number = static_cast<uint32_t>(Number);
    std::snprintf(Refusal->Explanation, sizeof(Refusal->Explanation), "%s", Explanation);
}

uint32_t FRONTIER_CODE_IMAGE_CALL ConstructProject(
    const FrontierProjectLaunch* ActiveLaunch,
    const FrontierProjectHostInterchange* HostInterchange,
    void** ProjectRecord,
    FrontierProjectRefusal* Refusal)
{
    if (ActiveLaunch == nullptr || ActiveLaunch->StructureSize < sizeof(FrontierProjectLaunch) ||
        HostInterchange == nullptr || HostInterchange->StructureSize < sizeof(FrontierProjectHostInterchange) ||
        ProjectRecord == nullptr)
    {
        WriteRefusal(Refusal, FrontierProjectRefusalStructure, "ProjectDrive received an incomplete Frontier host record");
        return 0u;
    }

    // These declarations let the shared Frontier editor own the UI/render/input implementation while Project-Drive
    // owns the vehicle semantics.  They are deliberately granular: selecting ControlVehicle reveals the inspector,
    // while each XPBD tyre is independently addressable in the project outliner instead of hiding all of the car in
    // a generic "Vehicle Dynamics" placeholder.
    if (HostInterchange->ReceivePanel != nullptr)
    {
        static const FrontierProjectPanel Panels[] =
        {
            { sizeof(FrontierProjectPanel), "DriveOutliner",       "Project-Drive Outliner" },
            { sizeof(FrontierProjectPanel), "ControlVehicle",     "ControlVehicle Inspector" },
            { sizeof(FrontierProjectPanel), "XPBDTyres",          "XPBD Tyres" },
            { sizeof(FrontierProjectPanel), "VehicleDynamics",    "Vehicle Dynamics" },
            { sizeof(FrontierProjectPanel), "DriveRenderModes",   "Surfel GI / ReSTIR" },
        };
        for (const FrontierProjectPanel& Panel : Panels)
            HostInterchange->ReceivePanel(&Panel, HostInterchange->ProjectReception);
    }

    // Stable semantic subjects are emitted at construction so a host can create corresponding outliner rows.  The
    // project never passes ImGui, Vulkan or allocator-owned objects over this ABI; the host maps these C-layout
    // transforms to its own scene/editor records.
    if (HostInterchange->ReceiveSceneMutation != nullptr)
    {
        static const char* const Subjects[] =
        {
            "ControlVehicle", "ControlVehicle.Body", "ControlVehicle.XPBDTyre.FL",
            "ControlVehicle.XPBDTyre.FR", "ControlVehicle.XPBDTyre.RL", "ControlVehicle.XPBDTyre.RR",
            "DriveCourse", "DriveCourse.Ramp", "DriveCourse.Slalom"
        };
        for (const char* Subject : Subjects)
        {
            FrontierProjectSceneMutation Mutation{};
            Mutation.StructureSize = sizeof(FrontierProjectSceneMutation);
            Mutation.MutationNumber = 1u; // project declaration / identity pose
            Mutation.SubjectName = Subject;
            Mutation.Transform[0] = Mutation.Transform[5] = Mutation.Transform[10] = Mutation.Transform[15] = 1.0f;
            HostInterchange->ReceiveSceneMutation(&Mutation, HostInterchange->ProjectReception);
        }
    }

    if (HostInterchange->ReceiveDiagnostic != nullptr)
    {
        FrontierProjectDiagnostic Diagnostic{};
        Diagnostic.StructureSize = sizeof(FrontierProjectDiagnostic);
        Diagnostic.SeverityNumber = 0u;
        Diagnostic.SubjectName = "ControlVehicle";
        Diagnostic.Explanation = "Vehicle inspector declares chassis, Pacejka and XPBD tyre rows; project code stays C-ABI-only.";
        HostInterchange->ReceiveDiagnostic(&Diagnostic, HostInterchange->ProjectReception);
    }

    *ProjectRecord = nullptr;
    return 1u;
}

uint32_t FRONTIER_CODE_IMAGE_CALL AdvanceProject(
    void* ProjectRecord,
    const FrontierProjectCycle* ActiveCycle,
    FrontierProjectRefusal* Refusal)
{
    (void)ProjectRecord;
    if (ActiveCycle == nullptr || ActiveCycle->StructureSize < sizeof(FrontierProjectCycle))
    {
        WriteRefusal(Refusal, FrontierProjectRefusalStructure, "ProjectDrive received an incomplete display-cycle record");
        return 0u;
    }

    return 1u;
}

void FRONTIER_CODE_IMAGE_CALL RetireProject(void* ProjectRecord)
{
    (void)ProjectRecord;
}

} // namespace

extern "C" FRONTIER_CODE_IMAGE_EXPORT uint32_t FRONTIER_CODE_IMAGE_CALL ConstructProjectInterchange(
    uint32_t RequestedInterchangeNumber,
    uint64_t RequestedFingerprint,
    FrontierProjectInterchange* DeliveredInterchange,
    FrontierProjectRefusal* Refusal)
{
    if (DeliveredInterchange == nullptr || RequestedInterchangeNumber != FrontierCodeInterchangeNumber ||
        RequestedFingerprint != FrontierCodeInterchangeFingerprint)
    {
        WriteRefusal(Refusal, FrontierProjectRefusalInterchange, "ProjectDrive cannot deliver the requested code interchange");
        return 0u;
    }

    std::memset(DeliveredInterchange, 0, sizeof(*DeliveredInterchange));
    DeliveredInterchange->StructureSize = sizeof(FrontierProjectInterchange);
    DeliveredInterchange->CodeInterchangeNumber = FrontierCodeInterchangeNumber;
    DeliveredInterchange->InterfaceFingerprint = FrontierCodeInterchangeFingerprint;
    DeliveredInterchange->ConstructProject = &ConstructProject;
    DeliveredInterchange->AdvanceProject = &AdvanceProject;
    DeliveredInterchange->RetireProject = &RetireProject;
    return 1u;
}
