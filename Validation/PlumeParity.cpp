/*==========================================================================================================================================
                                                            PLUMEPARITY.CPP
==========================================================================================================================================*/
// 🧩 Differential checks of the C++ port against SmokeSequence.js / PlumeSpace.js numbers.

#include "Frontier/Engine/VolumetricDynamics/GasParameters.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSourceProjection.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSpace.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

static int Failures = 0;

static void ExpectNear(const char* Name, double Got, double Want, double Eps = 1e-5)
{
    if (std::fabs(Got - Want) > Eps)
    {
        std::fprintf(stderr, "FAIL %s: got %.10g want %.10g\n", Name, Got, Want);
        ++Failures;
    }
}

static void ExpectEq(const char* Name, int Got, int Want)
{
    if (Got != Want)
    {
        std::fprintf(stderr, "FAIL %s: got %d want %d\n", Name, Got, Want);
        ++Failures;
    }
}

int main()
{
    using namespace Frontier;
    const auto& Catalogue = QueryGasParameterCatalogue();
    ExpectEq("catalogue size", static_cast<int>(Catalogue.size()), 33);
    ExpectNear("Emission default", Catalogue[0].Default, 1.0);
    ExpectNear("FlameLoss default", Catalogue[static_cast<size_t>(GasParameter::FlameLoss)].Default, 0.96);
    ExpectNear("PressureSweeps max", Catalogue[static_cast<size_t>(GasParameter::PressureSweeps)].Maximum, 40);

    GasParameters Gas;
    ExpectNear("ConstructGasParameters Emission", Gas.Query(GasParameter::Emission), 1.0);
    const PlumeSettings Mapped = MapPlumeSettings(Gas, true);
    ExpectNear("MapPlumeSettings density", Mapped.PlumeDensity, 1.2);
    ExpectNear("MapPlumeSettings flameDecay", Mapped.PlumeFlameDecay, 3.21887582487, 1e-5);
    ExpectNear("MapPlumeSettings flameCore", Mapped.PlumeFlameCore, 1800.0);

    Gas.ApplyPreset("Inferno");
    ExpectNear("Inferno FlameIntensity", Gas.Query(GasParameter::FlameIntensity), 2.4);
    ExpectNear("Inferno Buoyancy", Gas.Query(GasParameter::Buoyancy), 3.4);

    const auto& Grades = QueryPlumeGrades();
    ExpectEq("Low extent x", Grades[0].Extent[0], 64);
    ExpectEq("High sweeps", Grades[2].PressureSweeps, 16);
    ExpectNear("Ultra cell", Grades[3].CellExtent, 0.20);

    const PlumeVec3 Colour = ResolveBlackbodyColour(1500.0f);
    ExpectNear("blackbody R", Colour.X, 1.0);
    if (Colour.Y <= 0.0 || Colour.Y >= 1.0)
    {
        std::fprintf(stderr, "FAIL blackbody G out of range %g\n", Colour.Y);
        ++Failures;
    }

    PlumeSpace Space(0);
    ExpectEq("low thermo x", Space.ThermoExtent[0], 64);
    ExpectEq("low velocity x", Space.VelocityExtent[0], 32);
    PlumeSourceProjection Sources;
    PlumeEmission Emission = ResolveTestPlume({ 0, 0, 0.5f }, { 1, 0, 0 }, false);
    Sources.WriteExtra(Emission);
    ExpectEq("test plume sources", Sources.Count, 1);
    ExpectNear("test plume smoke", Sources.Records[8], 26.0);
    const PlumeSettings Live = MapPlumeSettings(GasParameters{}, true);
    Space.Schedule(1.0f / 30.0f, 1.0f / 60.0f, { 0, 0, 0.5f }, Sources, Live, { 0, 0, 1 });
    ExpectEq("resident after source", Space.Resident ? 1 : 0, 1);
    ExpectEq("step pending", Space.StepPending ? 1 : 0, 1);
    ExpectNear("record edge", Space.Record.Lattice[0], 0.40);
    ExpectNear("record floor", Space.Record.Lattice[2], -0.5);
    ExpectEq("record source count", Space.Record.PriorVelocityOrigin[3], 1);
    ExpectEq("detail texels", static_cast<int>(Space.DetailTexels.size()), 32 * 32 * 32 * 4);

    SceneDistanceField Field;
    Field.GroundHeight = 0.0f;
    OccupantRecord Box{};
    Box.Centre = { 0, 0, 0.5f };
    Box.HalfExtent = { 1, 1, 0.5f };
    Field.Occupants.push_back(Box);
    const auto Air = Field.Sample({ 0, 0, 4 });
    const auto Solid = Field.Sample({ 0, 0, 0.5f });
    if (!(Air[0] > 0.5f))
    {
        std::fprintf(stderr, "FAIL air distance %g\n", Air[0]);
        ++Failures;
    }
    if (!(Solid[0] <= 0.0f))
    {
        std::fprintf(stderr, "FAIL solid distance %g\n", Solid[0]);
        ++Failures;
    }
    Space.RecordTransport(Field);
    ExpectEq("steps taken", Space.StepsTaken, 1);

    if (Failures)
    {
        std::fprintf(stderr, "%d checks failed\n", Failures);
        return 1;
    }
    std::printf("PlumeParity: all checks passed\n");
    return 0;
}
