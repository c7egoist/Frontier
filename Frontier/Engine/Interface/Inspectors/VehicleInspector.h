/*==========================================================================================================================================
                                                            VEHICLEINSPECTOR.H
==========================================================================================================================================*/
// 🧩 VehicleConfiguration: the vehicle inspector (SultanAladin/Frontier arena/ca09b37f-frontier, Experimental/VehicleInspector), in
//    C++ and bound to the live specification: the overview (dyno sheet, aids, carcass, induction, summary cards), chassis,
//    engine and induction with the torque curve, driveline, tyres (contact, carcass, slip, temperature, wear, Magic Formula),
//    brakes and aids, aero, fuel and fluids, and the read-only telemetry dock while the car runs. Every number the solver reads
//    has a row, through the specification's figure registry, so the page and the levelspace never disagree.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "Engine/Scene/EngineConfigurations.h"

namespace Frontier
{

#if FRONTIER_EDITOR

class ControlColumn;

class VehicleInspector final : public RecordInspector
{
  public:
    static constexpr int SectionCount = 9;

    explicit VehicleInspector(VehicleConfiguration& InParameters) noexcept : Parameters(InParameters) {}

    [[nodiscard]] const char* QueryEyebrowText() const noexcept override { return "VEHICLE · PROJECT DRIVE ON JOLT"; }
    [[nodiscard]] const char* QuerySectionNote() const noexcept override { return "Specification"; }
    [[nodiscard]] bool        QueryToggleSupported() const noexcept override { return true; }
    [[nodiscard]] bool        QueryToggleEnabled() const noexcept override { return Parameters.Physics; }
    void                      ConfigureToggle(bool Enabled) override { Parameters.Physics = Enabled; Parameters.AdvanceRevision(); }
    [[nodiscard]] uint64_t    QueryRevision() const noexcept override { return Parameters.Revision; }
    [[nodiscard]] bool        QueryOccupiesColumn() const noexcept override { return true; }
    [[nodiscard]] int         QuerySectionCount() const noexcept override { return SectionCount; }
    void                      ConfigureSection(int Section) noexcept override { ActiveSection = Section; }
    [[nodiscard]] std::string QueryDirectoryReadout() const override;
    void                      ConstructInspector() override;

  private:
    bool ConstructOverview(ControlColumn& Page);
    bool ConstructFigures(ControlColumn& Page, const char* const* Sections, int Count);
    bool ConstructRatios(ControlColumn& Page);
    void ConstructTelemetry(ControlColumn& Page);
    void ConstructCurveChart(ControlColumn& Page, const char* Title, const Vehicle::Curve& Torque, float RedlineRpm);

    VehicleConfiguration& Parameters;
    int                   ActiveSection = 0;
    bool                  FormulaOpen   = false;
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
