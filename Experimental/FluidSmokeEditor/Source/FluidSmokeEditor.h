#pragma once
/*==========================================================================================================================================
                                                           FLUIDSMOKEEDITOR.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of the fluid/smoke editor in Experimental/VehicleHmiPrototype — EditorShell.js (outliner ·
//    viewport · inspector · status bar), InspectorPages.js's Smoke & fire ("gas") page and EditorControls.js's
//    slider model. Opened from the C++ front-ends by pressing 1 (smoke), 2 (fluid) or 3 (plume).

#include "GasParameters.h"
#include "PlumeSourceProjection.h"
#include "SceneDistanceField.h"
#include "SmokeSequence.h"

#include <string>
#include <vector>

namespace FluidSmoke
{

// 📝 The three ways the editor opens: 1 smoke (tyre smoke & fire), 2 fluid (the gas lattice, smoke test emitter),
//    3 plume (the fire test emitter 3 m ahead of the car).
enum class FluidEditorMode { Smoke = 0, Fluid = 1, Plume = 2 };

// 📝 The Domain card's "Test emitter · 3 m ahead of the car" segmented control.
enum class TestEmitter { Off = 0, SmokePlume = 1, Fire = 2 };

// 📝 One outliner row (EditorShell.js ConstructEntities / InspectorPages.js).
struct EditorEntity
{
    std::string Id, Group, Name, Type, Glyph, Colour, Description;
    bool IsGas = false;
};

// 📝 One inspector slider (EditorControls.js Slider / GasSlider), generated from the gas catalogue.
struct SliderDescriptor
{
    GasParameter Key;
    std::string Label;
    std::string Unit;
    float Minimum = 0, Maximum = 0, Step = 0, Value = 0;
    int Digits = 2;
};

// 📝 One inspector card of the Smoke & fire page (BuildGas).
struct GasSection
{
    std::string Name, Glyph, Subtitle;
    std::vector<GasParameter> Sliders;
};

class FluidSmokeEditor
{
  public:
    FluidSmokeEditor();

    //--------------------------------------------------------------------------------------------------------------------
    //                                                   OPEN / CLOSE
    //--------------------------------------------------------------------------------------------------------------------

    void Open(FluidEditorMode Mode) noexcept;
    void Close() noexcept;
    [[nodiscard]] bool IsOpen() const noexcept { return Open_; }
    [[nodiscard]] FluidEditorMode QueryMode() const noexcept { return Mode; }
    [[nodiscard]] const char* QueryModeName() const noexcept;

    //--------------------------------------------------------------------------------------------------------------------
    //                                                   SIMULATION
    //--------------------------------------------------------------------------------------------------------------------

    // 📝 One frame of the editor: advances the plume lattice against the SDF world with the current gas
    //    parameters, the vehicle telemetry and the mode's test emitter.
    void AdvanceFrame(float Seconds, const PlumeTelemetry& Telemetry, const Vec3& Focus,
                      const Vec3& SunDirection) noexcept;

    [[nodiscard]] SmokeSequence& AccessSmoke() noexcept { return Smoke; }
    [[nodiscard]] const SmokeSequence& QuerySmoke() const noexcept { return Smoke; }
    [[nodiscard]] SceneDistanceField& AccessField() noexcept { return Field; }
    [[nodiscard]] GasParameters& AccessGas() noexcept { return Gas; }
    [[nodiscard]] const GasParameters& QueryGas() const noexcept { return Gas; }
    [[nodiscard]] bool QuerySmokeEnabled() const noexcept { return SmokeEnabled; }
    void AssignSmokeEnabled(bool Enabled) noexcept { SmokeEnabled = Enabled; }

    //--------------------------------------------------------------------------------------------------------------------
    //                                                   UI MODEL (the ported shell)
    //--------------------------------------------------------------------------------------------------------------------

    [[nodiscard]] const std::vector<EditorEntity>& QueryEntities() const noexcept { return Entities; }
    [[nodiscard]] std::vector<GasSection> QueryGasSections() const noexcept;
    [[nodiscard]] SliderDescriptor QuerySlider(GasParameter Key) const noexcept;

    // 📝 Row navigation (Up/Down) and adjustment (Left/Right steps by the catalogue's Step) across every gas slider.
    [[nodiscard]] int QuerySelectedRow() const noexcept { return SelectedRow; }
    [[nodiscard]] int QueryRowCount() const noexcept;
    void SelectNextRow() noexcept;
    void SelectPrevRow() noexcept;
    void AdjustSelectedRow(float Direction) noexcept;
    [[nodiscard]] std::string QuerySelectedRowLabel() const noexcept;

    void ApplyPreset(const std::string& Name) noexcept;
    void ResetDefaults() noexcept;
    void ClearSmoke() noexcept;
    void AssignTestEmitter(TestEmitter Emitter) noexcept { Emitter_ = Emitter; }
    [[nodiscard]] TestEmitter QueryTestEmitter() const noexcept { return Emitter_; }

    // 📝 The status bar / window-title text: mode, selected entity, readout lines.
    [[nodiscard]] std::vector<std::string> QueryStatusLines() const noexcept;

  private:
    [[nodiscard]] std::vector<GasParameter> FlattenRows() const noexcept;

    bool Open_ = false;
    FluidEditorMode Mode = FluidEditorMode::Smoke;
    TestEmitter Emitter_ = TestEmitter::Off;
    bool SmokeEnabled = true;
    GasParameters Gas{};
    SmokeSequence Smoke;
    SceneDistanceField Field;
    std::vector<EditorEntity> Entities;
    int SelectedRow = 0;
};

} // namespace FluidSmoke
