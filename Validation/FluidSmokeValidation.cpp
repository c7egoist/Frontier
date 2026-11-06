/*==========================================================================================================================================
                                                          FLUIDSMOKEVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 Headless parity checks for the 1:1 C++ port of the exhibit's fluid/smoke editor
//    (Experimental/FluidSmokeEditor): gas catalogue, plume settings mapping, onset hysteresis, the 256-byte step
//    record, the SDF world's obstruction and occupant velocity, a simulated burnout through the transport passes,
//    the march, fire illumination and the editor's UI model.
//
//    Build & run:  g++ -std=c++17 -I. Validation/FluidSmokeValidation.cpp Experimental/FluidSmokeEditor/Source/*.cpp -o /tmp/FluidSmokeValidation && /tmp/FluidSmokeValidation

#include "Experimental/FluidSmokeEditor/Source/FluidSmokeEditor.h"
#include "Experimental/FluidSmokeEditor/Source/PlumeMarch.h"
#include "Experimental/FluidSmokeEditor/Source/PlumeTransport.h"

#include <cmath>
#include <cstdio>
#include <string>

namespace
{

int Failures = 0;

void Check(bool Condition, const char* What)
{
    if (Condition)
        std::printf("  ok    %s\n", What);
    else
    {
        std::printf("  FAIL  %s\n", What);
        ++Failures;
    }
}

bool Near(float A, float B, float Tol = 1.0e-4f) { return std::fabs(A - B) <= Tol; }

} // namespace

int main()
{
    using namespace FluidSmoke;

    std::printf("GasParameterCatalogue (SmokeSequence.js)\n");
    {
        const auto& C = GasParameterCatalogue();
        Check(GasParameterCount == 33, "catalogue has the exhibit's 33 readings");
        Check(Near(C[static_cast<int>(GasParameter::Emission)].Default, 1.0f)
              && Near(C[static_cast<int>(GasParameter::PressureSweeps)].Default, 16.0f)
              && Near(C[static_cast<int>(GasParameter::FlameCore)].Default, 1800.0f)
              && Near(C[static_cast<int>(GasParameter::FlameTip)].Default, 1150.0f)
              && Near(C[static_cast<int>(GasParameter::WindHeading)].Default, 30.0f)
              && Near(C[static_cast<int>(GasParameter::Buoyancy)].Default, 2.4f), "catalogue defaults match the exhibit");
        Check(std::string(C[static_cast<int>(GasParameter::Vorticity)].Label) == "Vorticity confinement"
              && std::string(C[static_cast<int>(GasParameter::FlameLoss)].Unit) == "1/s", "labels and units carried over");
        const GasParameters Gas = ConstructGasParameters();
        const PlumeSettings S = MapPlumeSettings(Gas, true);
        Check(Near(S.PlumeDensity, 1.2f) && Near(S.PlumeFlameCore, 1800.0f) && Near(S.PlumeWindDirection, 30.0f)
              && S.PlumeEnabled, "MapPlumeSettings maps the defaults 1:1");
        Check(GasPresets().size() == 6, "the six GasPresets look presets are present");
    }

    std::printf("Onset hysteresis (PlumeSourceProjection.js AdvanceSmokeOnset)\n");
    {
        PlumeSourceProjection::OnsetState Onset;
        Check(!PlumeSourceProjection::AdvanceOnset(Onset, 5000.0f, 2.0f, true, 0.02f), "below SourceOnsetSeconds not active");
        Check(PlumeSourceProjection::AdvanceOnset(Onset, 5000.0f, 2.0f, true, 0.04f), "sustained power activates");
        Check(PlumeSourceProjection::AdvanceOnset(Onset, 130.0f, 2.0f, true, 0.04f), "above release ratio stays active");
        Check(!PlumeSourceProjection::AdvanceOnset(Onset, 100.0f, 2.0f, true, 0.09f), "below release ratio releases after grace");
        Check(!PlumeSourceProjection::AdvanceOnset(Onset, 9000.0f, 2.0f, false, 0.01f), "contact loss cuts at once");
    }

    std::printf("Scene distance field (the SDF world)\n");
    {
        SceneDistanceField Field(-0.5f);
        OccupantRecord Vehicle;
        Vehicle.Roles = RoleDynamic;
        Vehicle.Orientation = { 0, 0, 0, 1 };
        Vehicle.Position = { 0, 0, 0.35f };
        Vehicle.HalfExtents = { 1.95f, 0.95f, 0.38f };
        Vehicle.PreviousOrientation = { 0, 0, 0, 1 };
        Vehicle.PreviousPosition = { -1.0f, 0, 0.35f };   // it moved 1 m in the frame
        Field.AssignOccupants({ Vehicle });
        Check(Field.Sample({ 0, 0, 0.35f }).Distance < 0.0f, "inside the vehicle reads solid");
        Check(Field.Sample({ 5, 5, 2 }).Distance > 0.0f, "open air reads positive");
        Check(Field.Sample({ 0, 0, -0.4f }).Distance > 0.0f && Field.Sample({ 0, 0, -0.6f }).Distance < 0.0f,
              "the course plane at -0.5 m");
        Check(Field.ResolveClipIdentity({ 0, 0, 0.35f }) == 0, "the vehicle owns its cells");
        const Vec3 V = Field.ResolveOccupantVelocity(0, { 0, 0, 0.35f }, 1.0f / 60.0f);
        Check(V[0] > 30.0f, "moving occupant point velocity follows the car (clamped to the ceiling)");
    }

    std::printf("Step record (PlumeSpace.js EncodeRecord, 256-byte PlumeRecord)\n");
    {
        Check(sizeof(PlumeRecord) == 256, "PlumeRecord is the 256-byte layout");
        SmokeSequence Smoke(PlumeGrades[0]);
        PlumeTelemetry Telemetry;
        Telemetry.Position = { 0, 0, 0.5f };
        WheelTelemetry Wheel;
        Wheel.ContactFraction = 1.0f;
        Wheel.SlidingPower = 9000.0f;
        Wheel.SlipSpeed = 6.0f;
        Wheel.SurfaceSpeed = 8.0f;
        Wheel.ContactVelocity = { 8, 0, 0 };
        Wheel.HubPosition = { 1.25f, 0.78f, 0.83f };
        Wheel.ContactPoint = { 1.25f, 0.78f, 0.02f };
        Telemetry.Wheels = { Wheel, Wheel, Wheel, Wheel };
        const GasParameters Gas = ConstructGasParameters();
        const PlumeSettings Settings = MapPlumeSettings(Gas, true);
        SceneDistanceField Field(-0.5f);
        OccupantRecord Vehicle;   // the car itself obstructs the lattice
        Vehicle.Roles = RoleDynamic;
        Vehicle.Orientation = { 0, 0, 0, 1 };
        Vehicle.Position = { 0, 0, 0.35f };
        Vehicle.HalfExtents = { 1.95f, 0.95f, 0.38f };
        Field.AssignOccupants({ Vehicle });
        SourceOptions Opts;
        for (int Frame = 0; Frame < 90; ++Frame)
            Smoke.Advance(1.0f / 60.0f, true, Telemetry, Opts, Settings, Telemetry.Position, { 0, 0, 1 }, Field);
        Check(Smoke.Resident, "the lattice goes resident under sustained sliding");
        Check(Smoke.Metrics.Sources > 0, "tyre sources are projected");
        Check(Smoke.StepsTaken > 0, "transport steps ran");
        const PlumeRecord& R = Smoke.Record;
        Check(R.VelocityExtent.X == 32 && R.ThermoExtent.X == 64, "Low grade extents (coarse 32³, fine 64×64×20)");
        Check(Near(R.LatticeA[0], 0.40f) && Near(R.LatticeA[1], 0.80f) && Near(R.LatticeA[2], -0.5f), "lattice edges and floor");
        Check(R.SourceCount == Smoke.Sources.Count && R.SourceCount > 0, "source count in the record");
        Check(R.StepSeconds > 0.0f && R.StepSeconds <= 1.0f / 30.0f + 1.0e-6f, "step duration clamped to 1/30 s");
        Check(R.RetentionXyz[0] > 0.0f && R.RetentionXyz[0] < 1.0f, "smoke retention is a per-step multiplier");
        long long NonZero = 0;
        for (const Vec4& T : Smoke.Thermo[Smoke.State])
            if (T.X > 1.0e-3f || T.Z > 1.0e-3f || T.W > 1.0e-3f)
                ++NonZero;
        Check(NonZero > 0, "the thermo lattice holds smoke/flame after the burnout");
        Check(Smoke.Coverage[0] <= Smoke.Coverage[4], "coverage box is valid");
        long long Solid = 0;
        for (const Vec4& V : Smoke.Velocity[Smoke.State])
            if (V.W > 0.5f)
                ++Solid;
        Check(Solid > 0, "SDF obstruction marks solid velocity cells (the floor)");
    }

    std::printf("March (PlumeMarch.wgsl MarchPlume) and fire illumination (FireIllumination.wgsl)\n");
    {
        SmokeSequence Smoke(PlumeGrades[0]);
        SceneDistanceField Field(-0.5f);
        PlumeTelemetry Telemetry;
        Telemetry.Position = { 0, 0, 0.5f };
        WheelTelemetry Wheel;
        Wheel.ContactFraction = 1.0f;
        Wheel.SlidingPower = 12000.0f;
        Wheel.SlipSpeed = 7.0f;
        Wheel.SurfaceSpeed = 9.0f;
        Wheel.ContactVelocity = { 9, 0, 0 };
        Wheel.HubPosition = { 1.25f, 0.78f, 0.83f };
        Wheel.ContactPoint = { 1.25f, 0.78f, 0.02f };
        Wheel.Thermal.Surface = 500.0f;
        Telemetry.Wheels = { Wheel, Wheel, Wheel, Wheel };
        const GasParameters Gas = ConstructGasParameters();
        const PlumeSettings Settings = MapPlumeSettings(Gas, true);
        SourceOptions Opts;
        for (int Frame = 0; Frame < 120; ++Frame)
            Smoke.Advance(1.0f / 60.0f, true, Telemetry, Opts, Settings, Telemetry.Position, { 0, 0, 1 }, Field);
        MarchCamera Camera;
        Camera.Position = { -6, -6, 3 };
        Camera.Forward = Normalize({ 6, 6, -2 });
        Camera.Right = Normalize(Cross(Camera.Forward, { 0, 0, 1 }));
        Camera.Up = Cross(Camera.Right, Camera.Forward);
        Camera.Aspect = 1.6f;
        MarchEnvironment Env;
        const PlumeMarchResult March = MarchPlume(Smoke, Camera, Env, &Field, 96, 60, 0);
        int Lit = 0, Occluded = 0;
        for (const Vec4& P : March.Pixels)
        {
            if (P.X + P.Y + P.Z > 1.0e-3f)
                ++Lit;
            if (P.W < 0.999f)
                ++Occluded;
        }
        Check(Lit > 0, "the march scatters radiance into the plume pixels");
        Check(Occluded > 0, "the march attenuates transmittance through the smoke");
        const FireArrival Arrival = ResolveFireArrival(Field, { 0, 0, -0.4f }, { 0, 0, 1 }, { 1.25f, 0.78f, 0.8f },
                                                       5.0f, { 1.0f, 0.46f, 0.14f }, 6.0f);
        Check(Arrival.Illuminance[0] > 0.0f, "fire light illuminates the course");
        const FireArrival Shadowed = ResolveFireArrival(Field, { 0, 0, 0.35f }, { 0, 0, 1 }, { 5, 0, 0.35f },
                                                        5.0f, { 1, 0.46f, 0.14f }, 8.0f);
        Check(Shadowed.Illuminance[0] == 0.0f, "the vehicle body shadows the fire light through the SDF");
    }

    std::printf("Editor model (EditorShell.js / InspectorPages.js Smoke & fire page)\n");
    {
        FluidSmokeEditor Editor;
        Check(!Editor.IsOpen(), "closed until a smoke/fluid/plume key opens it");
        Editor.Open(FluidEditorMode::Plume);
        Check(Editor.IsOpen() && Editor.QueryTestEmitter() == TestEmitter::Fire, "key 3 opens the plume editor with the fire test emitter");
        Editor.Open(FluidEditorMode::Fluid);
        Check(Editor.QueryTestEmitter() == TestEmitter::SmokePlume, "key 2 opens the fluid editor with the smoke test emitter");
        Editor.Open(FluidEditorMode::Smoke);
        Check(Editor.QueryTestEmitter() == TestEmitter::Off, "key 1 opens the smoke editor on tyre sources");
        Check(Editor.QueryEntities().size() == 14, "the outliner lists the exhibit's 14 entities");
        Check(Editor.QueryRowCount() == 26, "the Smoke & fire page exposes 26 catalogue sliders");
        const float Before = QueryGasParameter(Editor.QueryGas(), GasParameter::Buoyancy);
        Editor.AdjustSelectedRow(1.0f);   // first row is Emission; move to Buoyancy by selecting
        Editor.SelectNextRow(); Editor.SelectNextRow(); Editor.SelectNextRow();   // Source: Emission, Heat, Soot → Simulation Buoyancy
        Editor.AdjustSelectedRow(1.0f);
        Check(Near(QueryGasParameter(Editor.QueryGas(), GasParameter::Buoyancy), Before + 0.1f), "Left/Right steps a slider by its catalogue step");
        Editor.ApplyPreset("Inferno");
        Check(Near(QueryGasParameter(Editor.QueryGas(), GasParameter::FlameIntensity), 2.4f), "presets apply their overrides");
        Editor.ResetDefaults();
        Check(Near(QueryGasParameter(Editor.QueryGas(), GasParameter::FlameIntensity), 1.0f), "Defaults restores the catalogue");
        Check(!Editor.QueryStatusLines().empty(), "status lines for the title bar");
        Editor.Close();
        Check(!Editor.IsOpen(), "Esc closes the editor");
    }

    if (Failures == 0)
        std::printf("FluidSmokeValidation: all checks passed\n");
    else
        std::printf("FluidSmokeValidation: %d check(s) FAILED\n", Failures);
    return Failures == 0 ? 0 : 1;
}
