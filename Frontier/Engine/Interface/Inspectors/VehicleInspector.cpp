/*==========================================================================================================================================
                                                           VEHICLEINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 The vehicle page: overview with the dyno sheet and the quick choices, one tab per system built from the figure registry,
//    the gear ratios, and the read-only telemetry dock from the physics' live reading.

#include "Engine/Interface/Inspectors/VehicleInspector.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/Controls/ControlColumn.h"
#include "Engine/Interface/Controls/ControlTheme.h"
#include "Engine/Interface/Controls/FooterRow.h"
#include "Engine/Interface/Controls/MetricTiles.h"
#include "Engine/Interface/Controls/PageHeading.h"
#include "Engine/Interface/Controls/SectionRows.h"
#include "Engine/Interface/Controls/SelectRow.h"
#include "Engine/Interface/Controls/TabStrip.h"
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Scene/VehicleReadings.h"

#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

namespace Frontier
{

namespace
{

constexpr const char* SectionLabels[VehicleInspector::SectionCount] = { "Overview", "Chassis", "Engine", "Driveline", "Tyres",
                                                                          "Brakes", "Aero", "Fluids", "Telemetry" };
constexpr int UpperTabs = 5;

struct SectionTitle
{
    const char* Section;
    const char* Title;
    const char* Glyph;
    const char* Caption;
};

constexpr SectionTitle SectionTitles[] = {
    { "geometry", "Chassis and identity", "Car", "Mass, centre of mass, inertia and wheel sizes (the struts and wheels sit on the authored sockets)." },
    { "suspension.front", "Front struts", "SlidersHorizontal", "GRIT's strut, rated for the corner's sprung mass at its ride frequency." },
    { "suspension.rear", "Rear struts", "SlidersHorizontal", "GRIT's strut, rated for the corner's sprung mass at its ride frequency." },
    { "bars.front", "Front anti-roll bar", "Activity", "Resists the difference between the two corners' compressions." },
    { "bars.rear", "Rear anti-roll bar", "Activity", "Resists the difference between the two corners' compressions." },
    { "suspension", "Suspension", "SlidersHorizontal", "" },
    { "steering", "Steering", "Compass", "Lock, rate and how much the inner wheel turns tighter (Ackermann)." },
    { "engine", "Engine", "Gauge", "Rev limits, friction, pumping loss and the rotating inertia." },
    { "induction", "Induction", "Wind", "Turbocharged (exhaust spool), supercharged (belt, no lag, parasitic drag) or aspirated." },
    { "turbo", "Turbocharger", "Wind", "Shaft inertia and friction, wastegate, blow-off valve and efficiencies." },
    { "supercharger", "Supercharger", "Wind", "Blower, pulley ratio, boost ceilings, bypass valve and drag." },
    { "charge", "Charge air", "Thermometer", "Compressor outlet after the intercooler; optionally thins the boost when warm." },
    { "gearbox", "Gearbox", "Cpu", "Final drive, efficiency and the automated shift points." },
    { "clutch", "Clutch", "Cpu", "Capacity and the slip where it grips and locks." },
    { "differential", "Differential", "Cpu", "Open, locked, limited slip or torque vectoring." },
    { "tyre", "Tyre", "CircleDot", "Cold pressure, mass, rolling radius, grip and rolling resistance." },
    { "contact", "Contact fan and radial spring", "Target", "GRIT's ray fan finds the patch; the spring carries the load in Spring mode." },
    { "carcass", "Carcass soft body", "GridLattice", "Spring, an XPBD lattice or a Hex8 finite-element carcass carries each corner." },
    { "slip", "Transient slip", "TrendingUp", "The slip solver and the low-speed contact damping." },
    { "thermal", "Tyre temperature and pressure", "Thermometer", "Tread, carcass and air heat capacities, the gas law and the grip window." },
    { "wear", "Tread wear", "Timer", "Depth worn by sliding energy; grip falls with every worn millimetre." },
    { "pacejka", "Magic Formula", "TrendingUp", "Project Drive's MF coefficients and the MF6.1 inflation-pressure terms." },
    { "brakes", "Brakes", "Shield", "Hydraulic discs with fade, or the constant torque path." },
    { "abs", "ABS", "Shield", "Pressure modulation that holds each wheel near its peak slip." },
    { "traction", "Traction control", "Shield", "Throttle trimmed when a driven wheel slips past its target." },
    { "aero", "Aerodynamics", "Wind", "GRIT's package: body, wing, splitter, floor, skirts and fins." },
    { "aero.body", "Body", "Car", "" },
    { "aero.wing", "Rear wing", "Wind", "" },
    { "aero.splitter", "Front splitter", "Wind", "" },
    { "aero.diffuser", "Floor and diffuser", "Wind", "" },
    { "aero.skirt_left", "Left side skirt", "Wind", "" },
    { "aero.skirt_right", "Right side skirt", "Wind", "" },
    { "aero.fins", "Eddy fins", "Wind", "" },
    { "fuel", "Fuel", "Droplets", "Brake-specific consumption; the fuel's mass leaves the chassis as it burns." },
    { "fluids", "Coolant and oil", "Thermometer", "Thermostat, radiator and oil; cold oil thickens the engine's friction." },
};

const SectionTitle* ResolveTitle(const std::string& Section)
{
    for (const SectionTitle& Entry : SectionTitles)
        if (Section == Entry.Section) return &Entry;
    return nullptr;
}

// 📝 Peak torque and peak power off the torque curve (power = torque × ω).
void ResolvePeaks(const Vehicle::Curve& Torque, float Redline, float& PeakTorque, float& TorqueRpm, float& PeakPower, float& PowerRpm)
{
    PeakTorque = TorqueRpm = PeakPower = PowerRpm = 0.0f;
    for (int Step = 0; Step <= 200; ++Step)
    {
        const float Rpm  = Redline * static_cast<float>(Step) / 200.0f;
        const float Nm   = Torque.Sample(Rpm);
        const float Watt = Nm * Rpm * 0.104719755f;
        if (Nm > PeakTorque) { PeakTorque = Nm; TorqueRpm = Rpm; }
        if (Watt > PeakPower) { PeakPower = Watt; PowerRpm = Rpm; }
    }
}

} // namespace

std::string VehicleInspector::QueryDirectoryReadout() const
{
    return Vehicle::TyreCarcassName(Parameters.Specification.Solver.Carcass);
}

void VehicleInspector::ConstructCurveChart(ControlColumn& Page, const char* Title, const Vehicle::Curve& Torque, float RedlineRpm)
{
    const float  Scale  = Page.QueryScale();
    const ImVec2 Origin = Page.Space(170.0f, 4.0f, 10.0f);
    const float  Width  = Page.QueryWidth();
    const float  Height = 170.0f * Scale;
    ImDrawList*  Draw   = ImGui::GetWindowDrawList();
    const ImU32  Card   = IM_COL32(28, 30, 34, 255), Guide = IM_COL32(255, 255, 255, 18);
    const ImU32  TorqueInk = IM_COL32(232, 168, 74, 255), PowerInk = IM_COL32(159, 180, 214, 255), Text = IM_COL32(150, 154, 160, 255);
    Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + Height), Card, 14.0f * Scale);
    const float Left = Origin.x + 34.0f * Scale, Right = Origin.x + Width - 34.0f * Scale;
    const float Top = Origin.y + 26.0f * Scale, Bottom = Origin.y + Height - 22.0f * Scale;
    float PeakTorque, TorqueRpm, PeakPower, PowerRpm;
    ResolvePeaks(Torque, RedlineRpm, PeakTorque, TorqueRpm, PeakPower, PowerRpm);
    const float TorqueTop = std::max(100.0f, std::ceil(PeakTorque / 100.0f) * 100.0f);
    const float PowerTop  = std::max(50.0f, std::ceil(PeakPower * 0.001f / 50.0f) * 50.0f);
    for (int Line = 1; Line <= 3; ++Line)
    {
        const float Y = Bottom - (Bottom - Top) * Line / 4.0f;
        Draw->AddLine(ImVec2(Left, Y), ImVec2(Right, Y), Guide, 1.0f);
    }
    char Label[96];
    std::snprintf(Label, sizeof(Label), "%s  ·  torque N·m (amber)  ·  power kW (steel)", Title);
    Draw->AddText(ImVec2(Origin.x + 14.0f * Scale, Origin.y + 7.0f * Scale), Text, Label);
    ImVec2 PreviousTorque{}, PreviousPower{};
    for (int Step = 0; Step <= 120; ++Step)
    {
        const float Rpm   = std::max(1.0f, RedlineRpm) * static_cast<float>(Step) / 120.0f;
        const float Nm    = Torque.Sample(Rpm);
        const float Kw    = Nm * Rpm * 0.104719755f * 0.001f;
        const float X     = Left + (Right - Left) * Step / 120.0f;
        const ImVec2 TorquePoint(X, Bottom - (Bottom - Top) * std::clamp(Nm / TorqueTop, 0.0f, 1.0f));
        const ImVec2 PowerPoint(X, Bottom - (Bottom - Top) * std::clamp(Kw / PowerTop, 0.0f, 1.0f));
        if (Step > 0)
        {
            Draw->AddLine(PreviousTorque, TorquePoint, TorqueInk, 2.0f * Scale);
            Draw->AddLine(PreviousPower, PowerPoint, PowerInk, 1.5f * Scale);
        }
        PreviousTorque = TorquePoint;
        PreviousPower  = PowerPoint;
    }
    std::snprintf(Label, sizeof(Label), "%.0f", TorqueTop);
    Draw->AddText(ImVec2(Origin.x + 6.0f * Scale, Top - 6.0f * Scale), TorqueInk, Label);
    std::snprintf(Label, sizeof(Label), "%.0f", PowerTop);
    Draw->AddText(ImVec2(Right + 6.0f * Scale, Top - 6.0f * Scale), PowerInk, Label);
    std::snprintf(Label, sizeof(Label), "0 – %.0f rpm", RedlineRpm);
    Draw->AddText(ImVec2(Left, Bottom + 4.0f * Scale), Text, Label);
}

bool VehicleInspector::ConstructOverview(ControlColumn& Page)
{
    using namespace SectionRows;
    Vehicle::VehicleSolverConfiguration& Solver = Parameters.Specification.Solver;
    bool Changed = false;
    float PeakTorque, TorqueRpm, PeakPower, PowerRpm;
    ResolvePeaks(Solver.Engine.TorqueCurve, Solver.Engine.RedlineRPM, PeakTorque, TorqueRpm, PeakPower, PowerRpm);
    char Mass[32], Torque[32], Power[32], Ratio[32];
    std::snprintf(Mass, sizeof(Mass), "%.0f", Parameters.Specification.Geometry.Mass);
    std::snprintf(Torque, sizeof(Torque), "%.0f", PeakTorque);
    std::snprintf(Power, sizeof(Power), "%.0f", PeakPower * 0.001f);
    std::snprintf(Ratio, sizeof(Ratio), "%.0f", PeakPower * 0.001f / std::max(1.0f, Parameters.Specification.Geometry.Mass) * 1000.0f);
    const std::array<MetricTile, 4> Tiles = { { { "Mass", Mass, "kg" }, { "Peak torque", Torque, "N·m" }, { "Peak power", Power, "kW" },
                                                { "Power to weight", Ratio, "W/kg" } } };
    MetricTiles::Construct(Page, Tiles.data(), static_cast<int>(Tiles.size()), MetricTiles::NoLead);
    ConstructCurveChart(Page, "Engine at wide-open throttle (no boost)", Solver.Engine.TorqueCurve, Solver.Engine.RedlineRPM);

    BeginSection(Page, "Quick choices", "SlidersHorizontal", Vehicle::TyreCarcassName(Solver.Carcass),
                 "The carcass that carries each corner, the induction and the aids; every other figure is on its tab.");
    static constexpr const char* Carcasses[] = { "Spring", "XPBD", "3D FEM" };
    int Carcass = static_cast<int>(Solver.Carcass);
    if (SelectRow::Construct(Page, "VehicleCarcass", "Carcass", Carcasses, 3, Carcass))
    {
        Solver.Carcass = static_cast<Vehicle::TyreCarcassCategory>(Carcass);
        Changed        = true;
    }
    static constexpr const char* Inductions[] = { "Naturally aspirated", "Turbocharged", "Supercharged" };
    int Induction = static_cast<int>(Solver.Induction);
    if (SelectRow::Construct(Page, "VehicleInduction", "Induction", Inductions, 3, Induction))
    {
        Solver.Induction = static_cast<Vehicle::InductionType>(Induction);
        Changed          = true;
    }
    Changed |= Switch(Page, "VehicleAbs", "ABS", Solver.Abs.Enabled);
    Changed |= Switch(Page, "VehicleTraction", "Traction control", Solver.TractionControl.Enabled);
    Changed |= Switch(Page, "VehicleThermal", "Tyre temperature and pressure", Solver.TyreThermal.Enabled);
    Changed |= Switch(Page, "VehicleWear", "Tread wear", Solver.TyreWear.Enabled);
    Changed |= Switch(Page, "VehicleFuel", "Fuel", Solver.Fuel.Enabled);
    Changed |= Switch(Page, "VehicleFluids", "Coolant and oil", Solver.Fluids.Enabled);
    Changed |= Switch(Page, "VehicleRace", "Race fuel tune", Solver.RaceTune);
    Changed |= Switch(Page, "VehiclePossessed", "Driven by the keys while simulating", Parameters.Possessed);
    EndSection(Page);
    return Changed;
}

bool VehicleInspector::ConstructFigures(ControlColumn& Page, const char* const* Sections, int Count)
{
    using namespace SectionRows;
    bool Changed = false;
    std::vector<Vehicle::VehicleFigure> Figures = Vehicle::EnumerateVehicleFigures(Parameters.Specification);
    for (int Index = 0; Index < Count; ++Index)
    {
        const std::string    Section = Sections[Index];
        const SectionTitle*  Title   = ResolveTitle(Section);
        const bool           Formula = Section == "pacejka";
        BeginSection(Page, Title != nullptr ? Title->Title : Section.c_str(), Title != nullptr ? Title->Glyph : "SlidersHorizontal", "",
                     Title != nullptr ? Title->Caption : "");
        if (Formula)
        {
            if (InspectorControls::ConstructActionButton(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), "##VehicleFormulaOpen",
                                                         FormulaOpen ? "Hide the coefficients" : "Show the coefficients"))
                FormulaOpen = !FormulaOpen;
        }
        for (Vehicle::VehicleFigure& Figure : Figures)
        {
            if (Figure.Section != Section) continue;
            if (Formula && !FormulaOpen && Figure.Key.rfind("relaxation", 0) != 0 && Figure.Key != "nominal_pressure_pa" &&
                Figure.Category != Vehicle::VehicleFigureCategory::Switch) continue;
            const std::string Id = "Vehicle." + Figure.Section + "." + Figure.Key;
            switch (Figure.Category)
            {
                case Vehicle::VehicleFigureCategory::Switch:
                {
                    bool Value = Figure.Read() > 0.5;
                    if (Switch(Page, Id.c_str(), Figure.Label.c_str(), Value))
                    {
                        Figure.Write(Value ? 1.0 : 0.0);
                        Changed = true;
                    }
                    break;
                }
                case Vehicle::VehicleFigureCategory::Whole:
                {
                    int Value = static_cast<int>(std::lround(Figure.Read()));
                    if (SectionRows::Count(Page, Id.c_str(), Figure.Label.c_str(), Value, static_cast<int>(Figure.Minimum), static_cast<int>(Figure.Maximum),
                                           Figure.Unit.c_str()))
                    {
                        Figure.Write(Value);
                        Changed = true;
                    }
                    break;
                }
                case Vehicle::VehicleFigureCategory::Choice:
                {
                    std::vector<const char*> Options;
                    for (const std::string& Choice : Figure.Choices) Options.push_back(Choice.c_str());
                    int Value = static_cast<int>(std::lround(Figure.Read()));
                    if (SelectRow::Construct(Page, Id.c_str(), Figure.Label.c_str(), Options.data(), static_cast<int>(Options.size()), Value))
                    {
                        Figure.Write(Value);
                        Changed = true;
                    }
                    break;
                }
                case Vehicle::VehicleFigureCategory::Real:
                {
                    double Shown = Figure.Read() * Figure.Display + Figure.Offset;
                    const double Step = (Figure.Maximum - Figure.Minimum) / 400.0;
                    if (Measure(Page, Id.c_str(), Figure.Label.c_str(), Shown, Figure.Minimum, Figure.Maximum, Step, Figure.Unit.c_str()))
                    {
                        Figure.Write((Shown - Figure.Offset) / Figure.Display);
                        Changed = true;
                    }
                    break;
                }
            }
        }
        EndSection(Page);
    }
    return Changed;
}

bool VehicleInspector::ConstructRatios(ControlColumn& Page)
{
    using namespace SectionRows;
    bool               Changed = false;
    std::vector<float> Ratios  = Vehicle::QueryForwardRatios(Parameters.Specification);
    BeginSection(Page, "Gear ratios", "Cpu", "", "Forward gears, first to top (reverse and neutral keep the source's layout).");
    for (size_t Gear = 0; Gear < Ratios.size(); ++Gear)
    {
        char Id[48], Label[32];
        std::snprintf(Id, sizeof(Id), "Vehicle.gearbox.ratio%zu", Gear);
        std::snprintf(Label, sizeof(Label), "Gear %zu", Gear + 1);
        double Value = Ratios[Gear];
        if (Measure(Page, Id, Label, Value, 0.3, 6.0, 0.01, "×"))
        {
            Ratios[Gear] = static_cast<float>(Value);
            Changed      = true;
        }
    }
    if (Changed) Vehicle::AssignForwardRatios(Parameters.Specification, Ratios);
    EndSection(Page);
    return Changed;
}

void VehicleInspector::ConstructTelemetry(ControlColumn& Page)
{
    using namespace SectionRows;
    VehicleReading Reading;
    const bool     Live = QueryVehicleReading(InspectorRuntime::Instance().QueryInspectedToken(), Reading) && Reading.Simulating;
    BeginSection(Page, "Telemetry", "Activity", Live ? "live" : "stopped",
                 "Read-only: the physics thread's latest snapshot. Start Simulate (Alt+S) to drive; nothing here writes the record.");
    if (!Live)
    {
        InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), "No live reading: the vehicle is not simulating.");
        EndSection(Page);
        return;
    }
    const Vehicle::VehicleTelemetry& T = Reading.Telemetry;
    char Speed[32], Gear[16], Rpm[32], Boost[32];
    std::snprintf(Speed, sizeof(Speed), "%.0f", std::fabs(T.ForwardSpeed) * 3.6f);
    std::snprintf(Gear, sizeof(Gear), "%d", T.GearIndex - 2);
    std::snprintf(Rpm, sizeof(Rpm), "%.0f", T.EngineRPM);
    std::snprintf(Boost, sizeof(Boost), "%.2f", T.BoostBar);
    const std::array<MetricTile, 4> Tiles = { { { "Speed", Speed, "km/h" }, { "Gear", T.GearIndex == 2 ? "N" : Gear, "" }, { "Engine", Rpm, "rpm" },
                                                { "Boost", Boost, "bar" } } };
    MetricTiles::Construct(Page, Tiles.data(), static_cast<int>(Tiles.size()), 0);
    char Line[256];
    std::snprintf(Line, sizeof(Line), "Throttle %.0f %% (applied %.0f %%%s) · brake %.0f %% · steer %+.0f %%", Reading.Throttle[0] * 100.0f,
                  T.ThrottleApplied * 100.0f, T.TractionActive ? ", traction control" : "", Reading.Throttle[1] * 100.0f, Reading.Throttle[2] * 100.0f);
    InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
    std::snprintf(Line, sizeof(Line), "Power %.0f kW · charge air %.0f °C · coolant %.0f °C · oil %.0f °C · fuel %.1f L (%.1f g/s)", T.EnginePower_W * 0.001f,
                  T.ChargeTemperature_K - 273.15f, T.CoolantTemperature_K - 273.15f, T.OilTemperature_K - 273.15f, T.FuelLitres, T.FuelFlow_gPerS);
    InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
    std::snprintf(Line, sizeof(Line), "Physics %.0f Hz · %.0f µs a step · real-time ratio %.2f · %.1f s simulated · carcass %s", Reading.StepHz,
                  Reading.StepMicroseconds, Reading.RealtimeRatio, Reading.SimulatedSeconds, Vehicle::TyreCarcassName(T.Carcass));
    InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
    static constexpr const char* Corners[] = { "Front left", "Front right", "Rear left", "Rear right" };
    for (uint32_t Wheel = 0; Wheel < std::min<uint32_t>(4u, T.WheelCount); ++Wheel)
    {
        const Vehicle::WheelTelemetry& W = T.Wheels[Wheel];
        SubHeading(Page, Corners[Wheel]);
        std::snprintf(Line, sizeof(Line), "Load %.0f N · deflection %.1f mm · slip %.3f / %.1f° · Fx %.0f N · Fy %.0f N", W.VerticalLoad,
                      W.TyreDeflection * 1000.0f, W.SlipRatio, W.SlipAngleRad * 57.2958f, W.LongitudinalForce, W.LateralForce);
        InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
        std::snprintf(Line, sizeof(Line), "Tread %.0f °C · carcass %.0f °C · air %.0f °C · %.0f kPa · grip %.2f · wear %.2f mm · disc %.0f °C%s",
                      W.Thermal.SurfaceTemperature - 273.15, W.Thermal.CarcassTemperature - 273.15, W.Thermal.GasTemperature - 273.15,
                      W.Thermal.GaugePressure * 0.001, W.Thermal.GripFactor * W.WearGripFactor, W.WearDepth_mm, W.BrakeTemp_K - 273.15f,
                      W.AbsActive ? " · ABS" : "");
        InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
    }
    EndSection(Page);
}

void VehicleInspector::ConstructInspector()
{
    const auto    Theme = ControlTheme::ResolveNative();
    const auto    Faces = EditorTypefaces::Resolve();
    ControlColumn Page(Theme, Faces, InspectorRuntime::Instance().ResolveInterfaceScale());
    bool Changed = false;
    if (PageHeading::Construct(Page, "VehicleHeader", "VEHICLE / PROJECT DRIVE ON JOLT", Parameters.Specification.Name.c_str(), "Restore defaults",
                               "One drivable vehicle: the ControlVehicle's chassis on Jolt, GRIT's tyres, drivetrain and aids, and a soft carcass under each tread.",
                               "Every figure back to the Control vehicle's (placement and switches stay)"))
    {
        Parameters.Specification = Vehicle::ConstructControlVehicleSpecification();
        Changed                  = true;
    }
    int Upper = ActiveSection < UpperTabs ? ActiveSection : -1;
    if (TabStrip::Construct(Page, "VehicleSectionsUpper", SectionLabels, UpperTabs, Upper) && Upper >= 0) ActiveSection = Upper;
    int Lower = ActiveSection >= UpperTabs ? ActiveSection - UpperTabs : -1;
    if (TabStrip::Construct(Page, "VehicleSectionsLower", SectionLabels + UpperTabs, SectionCount - UpperTabs, Lower) && Lower >= 0)
        ActiveSection = UpperTabs + Lower;
    switch (ActiveSection)
    {
        case 0: Changed |= ConstructOverview(Page); break;
        case 1:
        {
            static constexpr const char* Sections[] = { "geometry", "suspension.front", "suspension.rear", "bars.front", "bars.rear", "suspension", "steering" };
            Changed |= ConstructFigures(Page, Sections, 7);
            break;
        }
        case 2:
        {
            ConstructCurveChart(Page, "Torque curve", Parameters.Specification.Solver.Engine.TorqueCurve, Parameters.Specification.Solver.Engine.RedlineRPM);
            static constexpr const char* Sections[] = { "engine", "induction", "turbo", "supercharger", "charge" };
            Changed |= ConstructFigures(Page, Sections, 5);
            break;
        }
        case 3:
        {
            static constexpr const char* Sections[] = { "gearbox", "clutch", "differential" };
            Changed |= ConstructFigures(Page, Sections, 3);
            Changed |= ConstructRatios(Page);
            break;
        }
        case 4:
        {
            static constexpr const char* Sections[] = { "carcass", "tyre", "contact", "thermal", "wear", "slip", "pacejka" };
            Changed |= ConstructFigures(Page, Sections, 7);
            break;
        }
        case 5:
        {
            static constexpr const char* Sections[] = { "brakes", "abs", "traction" };
            Changed |= ConstructFigures(Page, Sections, 3);
            break;
        }
        case 6:
        {
            static constexpr const char* Sections[] = { "aero", "aero.body", "aero.wing", "aero.splitter", "aero.diffuser", "aero.skirt_left",
                                                        "aero.skirt_right", "aero.fins" };
            Changed |= ConstructFigures(Page, Sections, 8);
            break;
        }
        case 7:
        {
            static constexpr const char* Sections[] = { "fuel", "fluids" };
            Changed |= ConstructFigures(Page, Sections, 2);
            break;
        }
        default: ConstructTelemetry(Page); break;
    }
    FooterRow::Construct(Page, "Levelspace record \xC2\xB7 Vehicle", "Saved with the level");
    Page.Finalize();
    if (Changed) Parameters.AdvanceRevision();
}

} // namespace Frontier

#elif FRONTIER_EDITOR

namespace Frontier
{
std::string VehicleInspector::QueryDirectoryReadout() const { return {}; }
void        VehicleInspector::ConstructInspector() {}
} // namespace Frontier

#endif
