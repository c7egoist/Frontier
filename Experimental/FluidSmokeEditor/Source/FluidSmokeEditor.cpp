/*==========================================================================================================================================
                                                          FLUIDSMOKEEDITOR.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ port of the exhibit's editor shell around the fluid/smoke simulator — see the header.

#include "FluidSmokeEditor.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace FluidSmoke
{

FluidSmokeEditor::FluidSmokeEditor() : Gas(ConstructGasParameters()), Smoke(PlumeGrades[2]), Field(FloorHeight)
{
    // 📝 The outliner's entities, exactly as InspectorPages.js ConstructEntities lists them (host-driven meta
    //    and build functions condensed to their static identity; the gas entity is the Smoke & fire page).
    Entities = {
        { "render",   "Render",       "Render settings",      "Renderer",              "Monitor",     "#9fb4d6", "BVH ReSTIR Path Tracer, resolution, reflections & debug views" },
        { "field",    "Render",       "BVH & distance field", "Acceleration structures","GridLattice", "#9fb4d6", "Two-level BVH (TLAS + BLAS) & toroidal SDF cascades" },
        { "cards",    "Render",       "Surface cache",        "Surface cards",         "LayoutGrid",  "#9fb4d6", "Card radiosity & relighting budget" },
        { "sun",      "Environment",  "Sun & sky",            "Directional light",     "Sun",         "#e8c27a", "Light, direction & atmosphere" },
        { "vehicle",  "Vehicle",      "ControlVehicle",       "Vehicle",               "Car",         "#e1d34a", "Telemetry, burnout, tyres & camera" },
        { "cabin",    "Vehicle",      "Cabin · HMI",          "Interior",              "Monitor",     "#e1d34a", "Tablet & cluster, mirrors, glass, interior cameras" },
        { "marks",    "Vehicle",      "Tyre marks",           "Rubber deposit",        "CircleDot",   "#e1d34a", "Rubber laid by sliding work" },
        { "gas",      "Effects",      "Smoke & fire",         "Gas domain",            "Flame",       "#e8833a", "Eulerian smoke · combustion · tyre sources", true },
        { "fracture", "Destruction",  "Fracture",             "Breakable props",       "Hammer",      "#8fb3a4", "Energy-limited fracture · fragment bodies" },
        { "derez",    "Effects",      "Derez · VFX",          "Particle effect",       "Sparkles",    "#e8833a", "Particle Editor presets · recovery & respawn" },
        { "training", "Level",        "Training arena",       "Drills",                "Flag",        "#a8bbeb", "Ten timed stations · best times" },
        { "cones",    "Level",        "Cones",                "Rigid bodies",          "TrafficCone", "#a8bbeb", "Knockable cones · rez back on reset" },
        { "level",    "Level",        "Proving grounds",      "Level",                 "Map",         "#a8bbeb", "Zones, teleports & scene budget" },
        { "stress",   "Level",        "Stress test",          "Object pool",           "Boxes",       "#a8bbeb", "Pre-built pool · union, cards & draws under load" },
    };
}

void FluidSmokeEditor::Open(FluidEditorMode Mode) noexcept
{
    Open_ = true;
    this->Mode = Mode;
    // 📝 The mode picks the Domain card's test emitter: smoke → tyre sources only, fluid → smoke plume ahead,
    //    plume → fire ahead.
    Emitter_ = Mode == FluidEditorMode::Smoke ? TestEmitter::Off
             : Mode == FluidEditorMode::Fluid ? TestEmitter::SmokePlume : TestEmitter::Fire;
}

void FluidSmokeEditor::Close() noexcept { Open_ = false; }

const char* FluidSmokeEditor::QueryModeName() const noexcept
{
    switch (Mode)
    {
        case FluidEditorMode::Smoke: return "Smoke & fire";
        case FluidEditorMode::Fluid: return "Fluid";
        case FluidEditorMode::Plume: return "Plume";
    }
    return "Smoke & fire";
}

void FluidSmokeEditor::AdvanceFrame(float Seconds, const PlumeTelemetry& Telemetry, const Vec3& Focus,
                                    const Vec3& SunDirection) noexcept
{
    const PlumeSettings Settings = MapPlumeSettings(Gas, SmokeEnabled);
    SourceOptions Opts;
    Opts.EmissionRate = Settings.PlumeEmissionRate;
    Opts.SmokeYield = Settings.PlumeDensity;
    Opts.HeatYield = Settings.PlumeHeat;
    Opts.SootYield = Settings.PlumeSoot;
    Opts.FireLight = Settings.PlumeFireLight;
    Opts.Embers = Settings.PlumeEmbers;

    // 📝 The Domain card's test emitter, 3 m ahead of the car.
    std::vector<EmissionRequest> Emissions(4);
    if (Emitter_ != TestEmitter::Off)
    {
        EmissionRequest E;
        E.Active = true;
        E.Position = { Focus[0] + 3.0f, Focus[1], Focus[2] + 0.4f };
        E.Radius = 0.3f;
        E.Velocity = { 0.0f, 0.0f, 1.2f };
        if (Emitter_ == TestEmitter::SmokePlume)
        {
            E.SmokeRate = 6.0f * Settings.PlumeEmissionRate;
            E.HeatRate = 0.5f * Settings.PlumeHeat;
        }
        else
        {
            E.FlameRate = 8.0f * Settings.PlumeFire;
            E.HeatRate = 300.0f * Settings.PlumeHeat;
            E.SootRate = 4.0f * Settings.PlumeSoot;
        }
        Emissions.push_back(E);
    }
    Smoke.Advance(Seconds, SmokeEnabled, Telemetry, Opts, Settings, Focus, SunDirection, Field, Emissions);
}

std::vector<GasSection> FluidSmokeEditor::QueryGasSections() const noexcept
{
    // 📝 BuildGas: Domain, Source, Simulation, Appearance, Fire, Presets.
    return {
        { "Domain", "Box", "Toroidal lattice following the car", {} },
        { "Source", "Droplets", "Multipliers on the tyre model",
          { GasParameter::Emission, GasParameter::Heat, GasParameter::Soot } },
        { "Simulation", "Wind", {},
          { GasParameter::Buoyancy, GasParameter::Dissipation, GasParameter::Cooling, GasParameter::Vorticity,
            GasParameter::Turbulence, GasParameter::TurbulenceScale, GasParameter::WindSpeed, GasParameter::WindHeading,
            GasParameter::TimeScale, GasParameter::PressureSweeps } },
        { "Appearance", "CloudFog", {},
          { GasParameter::Density, GasParameter::Albedo, GasParameter::Phase, GasParameter::MultiScatter,
            GasParameter::Ambient, GasParameter::Detail, GasParameter::DetailScale } },
        { "Fire", "Flame", "Combustion of the tyre",
          { GasParameter::FlameIntensity, GasParameter::FlameCore, GasParameter::FlameTip, GasParameter::FlameTemperature,
            GasParameter::FlameLoss, GasParameter::FireLight } },
        { "Presets", "Sparkles", {}, {} },
    };
}

SliderDescriptor FluidSmokeEditor::QuerySlider(GasParameter Key) const noexcept
{
    const GasParameterEntry& Entry = GasParameterCatalogue()[static_cast<int>(Key)];
    SliderDescriptor D;
    D.Key = Key;
    D.Label = Entry.Label;
    D.Unit = Entry.Unit;
    D.Minimum = Entry.Minimum;
    D.Maximum = Entry.Maximum;
    D.Step = Entry.Step;
    D.Value = QueryGasParameter(Gas, Key);
    D.Digits = Entry.Step >= 1.0f ? 0 : Entry.Step >= 0.1f ? 1 : Entry.Step >= 0.01f ? 2 : 3;
    return D;
}

std::vector<GasParameter> FluidSmokeEditor::FlattenRows() const noexcept
{
    std::vector<GasParameter> Rows;
    for (const GasSection& Section : QueryGasSections())
        for (GasParameter Key : Section.Sliders)
            Rows.push_back(Key);
    return Rows;
}

int FluidSmokeEditor::QueryRowCount() const noexcept
{
    return static_cast<int>(FlattenRows().size());
}

void FluidSmokeEditor::SelectNextRow() noexcept
{
    const int Count = QueryRowCount();
    if (Count > 0)
        SelectedRow = (SelectedRow + 1) % Count;
}

void FluidSmokeEditor::SelectPrevRow() noexcept
{
    const int Count = QueryRowCount();
    if (Count > 0)
        SelectedRow = (SelectedRow + Count - 1) % Count;
}

void FluidSmokeEditor::AdjustSelectedRow(float Direction) noexcept
{
    const std::vector<GasParameter> Rows = FlattenRows();
    if (Rows.empty())
        return;
    const GasParameter Key = Rows[static_cast<size_t>(SelectedRow) % Rows.size()];
    const GasParameterEntry& Entry = GasParameterCatalogue()[static_cast<int>(Key)];
    AssignGasParameter(Gas, Key, QueryGasParameter(Gas, Key) + Direction * Entry.Step);
}

std::string FluidSmokeEditor::QuerySelectedRowLabel() const noexcept
{
    const std::vector<GasParameter> Rows = FlattenRows();
    if (Rows.empty())
        return {};
    const SliderDescriptor D = QuerySlider(Rows[static_cast<size_t>(SelectedRow) % Rows.size()]);
    char Buffer[160];
    std::snprintf(Buffer, sizeof(Buffer), "%s  %.*f %s", D.Label.c_str(), D.Digits, D.Value, D.Unit.c_str());
    return Buffer;
}

void FluidSmokeEditor::ApplyPreset(const std::string& Name) noexcept
{
    for (const GasPreset& Preset : GasPresets())
        if (Preset.Name == Name)
        {
            FluidSmoke::ApplyGasPreset(Gas, Preset);
            return;
        }
}

void FluidSmokeEditor::ResetDefaults() noexcept { Gas = ConstructGasParameters(); }

void FluidSmokeEditor::ClearSmoke() noexcept { Smoke.Clear(); }

std::vector<std::string> FluidSmokeEditor::QueryStatusLines() const noexcept
{
    const PlumeDescription D = Smoke.QueryDescription();
    const std::array<std::string, 2> Readout = Smoke.QueryReadout();
    return {
        std::string("Frontier · Proving Grounds — ") + QueryModeName() + " editor (1 smoke · 2 fluid · 3 plume · Esc close)",
        "Outliner: " + std::to_string(Entities.size()) + " entities · selected: Smoke & fire (Effects · Flame)",
        "Domain: " + D.Thermo + " cells · " + (Smoke.Resident ? std::string("resident") : std::string("idle"))
            + " · sources " + std::to_string(Smoke.Metrics.Sources) + " · ticks " + std::to_string(Smoke.Metrics.Ticks)
            + " · relocations " + std::to_string(Smoke.Metrics.Relocations),
        Readout[0],
        Readout[1],
        "Row " + std::to_string(SelectedRow + 1) + "/" + std::to_string(QueryRowCount()) + " · " + QuerySelectedRowLabel()
            + "  (Up/Down select · Left/Right adjust)",
    };
}

} // namespace FluidSmoke
