/*==========================================================================================================================================
                                                            TYREINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 The tyre card: corner, compound, cold pressure, fitted or in the pit lane, and the corner's live reading while the car runs.

#include "Engine/Interface/Inspectors/TyreInspector.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/Controls/ControlColumn.h"
#include "Engine/Interface/Controls/ControlTheme.h"
#include "Engine/Interface/Controls/FooterRow.h"
#include "Engine/Interface/Controls/MetricTiles.h"
#include "Engine/Interface/Controls/PageHeading.h"
#include "Engine/Interface/Controls/SectionRows.h"
#include "Engine/Interface/Controls/SelectRow.h"
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Scene/VehicleReadings.h"

#include <array>
#include <cstdio>
#include <string>

namespace Frontier
{

std::string TyreInspector::QueryDirectoryReadout() const
{
    static constexpr const char* Codes[] = { "FL", "FR", "RL", "RR" };
    return std::string(Codes[Parameters.Corner & 3u]) + " · " + Parameters.Compound;
}

void TyreInspector::ConstructInspector()
{
    using namespace SectionRows;
    const auto    Theme = ControlTheme::ResolveNative();
    const auto    Faces = EditorTypefaces::Resolve();
    ControlColumn Page(Theme, Faces, InspectorRuntime::Instance().ResolveInterfaceScale());
    bool Changed = false;
    static constexpr const char* Corners[] = { "Front left", "Front right", "Rear left", "Rear right" };
    (void)PageHeading::Construct(Page, "TyreHeader", "VEHICLE / TYRE", Corners[Parameters.Corner & 3u], nullptr,
                                 "One tyre enclosed by its vehicle: its compound sets the grip and the temperature window, its pressure the gas law's start.");
    BeginSection(Page, "Fitting", "CircleDot", Parameters.Enclosed ? "fitted" : "pit lane", "Detached tyres keep their record; the corner falls back to the vehicle's tyre.");
    int Corner = static_cast<int>(Parameters.Corner & 3u);
    if (SelectRow::Construct(Page, "TyreCorner", "Corner", Corners, 4, Corner))
    {
        Parameters.Corner = static_cast<uint32_t>(Corner);
        Changed           = true;
    }
    Changed |= Switch(Page, "TyreEnclosed", "Fitted to the vehicle", Parameters.Enclosed);
    std::array<const char*, 5> Compounds{};
    int Compound = 1;
    for (size_t Index = 0; Index < Compounds.size(); ++Index)
    {
        Compounds[Index] = TyreCompounds[Index].Name;
        if (Parameters.Compound == TyreCompounds[Index].Name) Compound = static_cast<int>(Index);
    }
    if (SelectRow::Construct(Page, "TyreCompound", "Compound", Compounds.data(), static_cast<int>(Compounds.size()), Compound))
    {
        Parameters.Compound = TyreCompounds[Compound].Name;
        Changed             = true;
    }
    double Pressure = Parameters.ColdPressure * 0.001;
    if (Measure(Page, "TyrePressure", "Cold pressure", Pressure, 30.0, 400.0, 1.0, "kPa"))
    {
        Parameters.ColdPressure = static_cast<float>(Pressure * 1000.0);
        Changed                 = true;
    }
    const TyreCompound& Chosen = ResolveTyreCompound(Parameters.Compound);
    char Note[160];
    std::snprintf(Note, sizeof(Note), "%s · grip × %.2f · window %.0f – %.0f °C · wear × %.2f", Chosen.Name, Chosen.GripScale, Chosen.WindowLow_C,
                  Chosen.WindowHigh_C, Chosen.WearRate);
    InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Note);
    EndSection(Page);

    VehicleReading Reading;
    if (QueryVehicleReading(InspectorRuntime::Instance().QueryInspectedToken(), Reading) && Reading.Simulating && (Parameters.Corner & 3u) < Reading.Telemetry.WheelCount)
    {
        const Vehicle::WheelTelemetry& W = Reading.Telemetry.Wheels[Parameters.Corner & 3u];
        BeginSection(Page, "Live", "Activity", "simulating", "Read-only, from the physics thread.");
        char Surface[16], Gas[16], Kpa[16], Load[16];
        std::snprintf(Surface, sizeof(Surface), "%.0f", W.Thermal.SurfaceTemperature - 273.15);
        std::snprintf(Gas, sizeof(Gas), "%.0f", W.Thermal.GasTemperature - 273.15);
        std::snprintf(Kpa, sizeof(Kpa), "%.0f", W.Thermal.GaugePressure * 0.001);
        std::snprintf(Load, sizeof(Load), "%.0f", W.VerticalLoad);
        const std::array<MetricTile, 4> Tiles = { { { "Tread", Surface, "°C" }, { "Air inside", Gas, "°C" }, { "Pressure", Kpa, "kPa" }, { "Load", Load, "N" } } };
        MetricTiles::Construct(Page, Tiles.data(), static_cast<int>(Tiles.size()), MetricTiles::NoLead);
        char Line[200];
        std::snprintf(Line, sizeof(Line), "Deflection %.1f mm · slip %.3f / %.1f° · carcass %.0f °C · grip %.2f · wear %.2f mm · %.4f m³",
                      W.TyreDeflection * 1000.0f, W.SlipRatio, W.SlipAngleRad * 57.2958f, W.Thermal.CarcassTemperature - 273.15,
                      W.Thermal.GripFactor * W.WearGripFactor, W.WearDepth_mm, W.EnclosedVolume);
        InspectorControls::ConstructMutedNote(InspectorPalette::Resolve(), EditorTypefaces::Resolve(), Line);
        EndSection(Page);
    }
    FooterRow::Construct(Page, "Levelspace record \xC2\xB7 Tyre", "Saved with the level");
    Page.Finalize();
    if (Changed) Parameters.AdvanceRevision();
}

} // namespace Frontier

#elif FRONTIER_EDITOR

namespace Frontier
{
std::string TyreInspector::QueryDirectoryReadout() const { return {}; }
void        TyreInspector::ConstructInspector() {}
} // namespace Frontier

#endif
