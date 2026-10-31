/*==========================================================================================================================================
                                                         PROJECT EVEREST CODE IMAGE
                                     ------------------------------------------------------------------
                       Project Everest v3 interchange implementation publishing structured diagnostics to Log Stream.
==========================================================================================================================================*/

// 🧩 Project Everest code image: initializes VehicleHMI and dual-tier illumination diagnostics for Log Stream.

#include <ProjectInterchange.h>

#include <chrono>
#include <cstdio>

namespace
{

using SteadyTime = std::chrono::steady_clock::time_point;

FrontierHostInterchange Host = {};
bool                    HostReady = false;
SteadyTime              LastEmit = {};
uint32_t                Emission = 0;

constexpr std::chrono::milliseconds EmitCadence{2400};

void EmitDiagnostic(const char* SubjectName, const char* Explanation)
{
    if (!HostReady || Host.ReceiveDiagnostic == nullptr)
    {
        return;
    }

    FrontierProjectDiagnostic Diagnostic = {};
    Diagnostic.StructureSize             = sizeof(Diagnostic);
    Diagnostic.SubjectName               = SubjectName;
    Diagnostic.Explanation               = Explanation;
    Host.ReceiveDiagnostic(&Diagnostic, Host.ProjectReception);
}

bool FRONTIER_CODE_IMAGE_CALL ConstructProject(
    const FrontierHostInterchange* HostInterchange, void* ProjectReception)
{
    if (HostInterchange == nullptr || HostInterchange->StructureSize < sizeof(*HostInterchange) ||
        HostInterchange->ReceiveDiagnostic == nullptr)
    {
        return false;
    }

    Host      = *HostInterchange;
    HostReady = true;
    Emission  = 0;
    LastEmit  = std::chrono::steady_clock::now() - EmitCadence;
    (void)ProjectReception;

    EmitDiagnostic("Project-Everest", "Project Everest constructed · opening scene ProvingGrounds mounted");
    EmitDiagnostic("Project-Everest/Powertrain",
                   "Everest Concept GT dual-motor inverter armed · 1680 kg · DualMotorAllWheel · 420 kW");
    EmitDiagnostic("Project-Everest/CabinHMI",
                   "Cabin telemetry stream ready · awaiting viewport illumination and instrument cluster attachment");
    EmitDiagnostic("Project-Everest/Weather",
                   "Proving Grounds atmosphere profile bound · solar elevation 26.5 deg · turbidity 2.4");
    return true;
}

void FRONTIER_CODE_IMAGE_CALL AdvanceProject()
{
    const SteadyTime Now = std::chrono::steady_clock::now();
    if (Now - LastEmit < EmitCadence)
    {
        return;
    }
    LastEmit = Now;
    ++Emission;

    char Line[256] = {};
    switch (Emission % 4)
    {
        case 0:
            std::snprintf(Line, sizeof(Line),
                          "Powertrain torque vectoring tick #%u · front/rear split 42/58 · 0 NaN samples", Emission);
            EmitDiagnostic("Project-Everest/Powertrain", Line);
            break;
        case 1:
            std::snprintf(Line, sizeof(Line),
                          "Weather optical depth tick #%u · cloud coverage 0.28 · fog medium stable",
                          Emission);
            EmitDiagnostic("Project-Everest/Weather", Line);
            break;
        case 2:
            std::snprintf(Line, sizeof(Line),
                          "Fracture Voronoi cell precomputation #%u · impulse threshold armed",
                          Emission);
            EmitDiagnostic("Project-Everest/Fracture", Line);
            break;
        default:
            std::snprintf(Line, sizeof(Line),
                          "Cabin HMI heartbeat #%u · docked LogStream and ControlCentre theme synchronized",
                          Emission);
            EmitDiagnostic("Project-Everest/CabinHMI", Line);
            break;
    }
}

void FRONTIER_CODE_IMAGE_CALL RetireProject()
{
    EmitDiagnostic("Project-Everest", "Project Everest retired cleanly by host");
    HostReady = false;
}

} // namespace

extern "C"
{

bool FRONTIER_CODE_IMAGE_CALL ConstructProjectInterchange(
    uint32_t InterchangeNumber, uint64_t InterfaceFingerprint,
    FrontierProjectInterchange* InterchangeDelivery, char* RefusalExplanation,
    size_t RefusalExplanationCapacity)
{
    const auto Refuse = [&](const char* Explanation) -> bool {
        if (RefusalExplanation != nullptr && RefusalExplanationCapacity > 0)
        {
            std::snprintf(RefusalExplanation, RefusalExplanationCapacity, "%s", Explanation);
        }
        return false;
    };

    if (InterchangeDelivery == nullptr ||
        InterchangeDelivery->StructureSize < sizeof(FrontierProjectInterchange))
    {
        return Refuse("Interchange delivery record is missing or undersized.");
    }
    if (InterchangeNumber != FRONTIER_CODE_INTERCHANGE_NUMBER)
    {
        return Refuse("Project Everest does not implement the requested code interchange number.");
    }
    if (InterfaceFingerprint != FRONTIER_INTERFACE_FINGERPRINT)
    {
        return Refuse("Project Everest interface fingerprint does not match the host.");
    }

    InterchangeDelivery->ConstructProject = &ConstructProject;
    InterchangeDelivery->AdvanceProject   = &AdvanceProject;
    InterchangeDelivery->RetireProject    = &RetireProject;
    return true;
}

} // extern "C"
