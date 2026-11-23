/*============================================================================================================================================
                                             WORLDSUBJECTCONSTRUCTIONVALIDATION.CPP
============================================================================================================================================*/
// 🧩 Validation suite for Outliner Construct-menu world subjects: registration, deletion, clean world retirement, and re-construction

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.h"

#include <cstdio>
#include <cstdlib>
#include <vector>

namespace
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      TYPE ALIASES
//------------------------------------------------------------------------------------------------------------------------

using Frontier::ConstructSlotCategory;
using Frontier::OutlinerConstructTemplate;
using Frontier::OutlinerPanel;
using Frontier::OutlinerRecordEntry;
using Frontier::OutlinerSlotToken;
using Frontier::OutlinerWorldSubject;
using Frontier::GeometricRaster::RegisterShowcaseGalleryInOutliner;
using Frontier::GeometricRaster::ShowcaseWorldSceneBundle;
using Frontier::GeometricRaster::SynchronizeShowcaseGallerySceneLive;

//------------------------------------------------------------------------------------------------------------------------
//                                                 VALIDATION ASSERTIONS
//------------------------------------------------------------------------------------------------------------------------

bool VerifyAssertion(bool Condition, const char* Description) noexcept
{
    if (!Condition)
    {
        std::fprintf(stderr, "[WorldSubjectConstructionValidation] FAILED: %s\n", Description);
        return false;
    }
    return true;
}

// Construct menu presets mirroring the Editor host ordering: Sun, Atmosphere, Clouds
void ConfigureWorldSubjectTemplates(OutlinerPanel& Outliner)
{
    std::vector<OutlinerConstructTemplate> Templates{};
    Templates.push_back({ "Add Area Light", "Area Quad Light", "Lighting", "LTC Polygonal Quad Light", ConstructSlotCategory::PointLuminaire });
    Templates.push_back({ "Add Scene Camera", "Scene Camera", "Camera", "Perspective Optical Camera", ConstructSlotCategory::OpticsCamera });
    Templates.push_back({ "Add Sun", "Sun", "World", "Solar ephemeris & direct disc", ConstructSlotCategory::LayerGroup,
                          OutlinerWorldSubject::Sun });
    Templates.push_back({ "Add Atmosphere", "Atmosphere", "World", "Rayleigh · Mie · Ozone sky dome", ConstructSlotCategory::LayerGroup,
                          OutlinerWorldSubject::Atmosphere });
    Templates.push_back({ "Add Clouds", "Volumetric Clouds", "World", "Cumulus · 34% cover", ConstructSlotCategory::LayerGroup,
                          OutlinerWorldSubject::Clouds });
    Templates.push_back({ "Add Local Cloud", "Local Cloud", "World", "Bounded 3D cloud box", ConstructSlotCategory::LayerGroup,
                          OutlinerWorldSubject::LocalCloud });
    Outliner.ConfigureConstructTemplates(Templates);
}

bool SynchronizeWorld(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    bool       NeedsPrep = false;
    const bool Changed   = SynchronizeShowcaseGallerySceneLive(Outliner, Bundle, NeedsPrep, false);
    (void)NeedsPrep;
    return Changed;
}

[[nodiscard]] uint32_t CountSubjectRows(const OutlinerPanel& Outliner, OutlinerWorldSubject Subject) noexcept
{
    uint32_t Count = 0u;
    for (const OutlinerRecordEntry& Entry : Outliner.QueryEntries())
    {
        if (Entry.Subject == Subject)
        {
            ++Count;
        }
    }
    return Count;
}

bool ValidateWorldSubjectRegistration(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    // Authored clear-sky scene: physical sky medium and solar source both live before the Outliner is populated
    Bundle.Scene.Atmosphere.Medium.AtmosphereEnabled = true;
    Bundle.Scene.Atmosphere.Solar.SolarEnabled       = true;
    Bundle.Scene.Sun.SolarIrradiance                 = { 5.40f, 5.10f, 4.65f };

    RegisterShowcaseGalleryInOutliner(Outliner, Bundle, true);

    const OutlinerRecordEntry* SunRow  = Outliner.FindEntry(Bundle.SunEmitterToken);
    const OutlinerRecordEntry* AtmoRow = Outliner.FindEntry(Bundle.AtmosphereToken);
    if (!VerifyAssertion(
            SunRow != nullptr && AtmoRow != nullptr,
            "Registration creates Atmosphere and Sun rows with live tokens") ||
        !VerifyAssertion(
            SunRow->Subject == OutlinerWorldSubject::Sun && AtmoRow->Subject == OutlinerWorldSubject::Atmosphere,
            "Registered world rows carry their world subject identity") ||
        !VerifyAssertion(
            SunRow->EnclosingToken == Bundle.WorldFolderToken && AtmoRow->EnclosingToken == Bundle.WorldFolderToken,
            "Registered world rows are filed inside the World collection folder") ||
        !VerifyAssertion(
            Outliner.FindEntry(Bundle.EditorCameraToken) != nullptr && Outliner.FindEntry(Bundle.EditorCameraToken)->Permanent,
            "Editor Camera row is permanent and refuses removal directives"))
    {
        return false;
    }

    (void)SynchronizeWorld(Outliner, Bundle);
    return VerifyAssertion(
        Bundle.Scene.Atmosphere.Solar.SolarEnabled &&
            Bundle.Scene.Atmosphere.Medium.AtmosphereEnabled,
        "Registered sun and atmosphere rows mirror the live world scene");
}

bool ValidateRetirement(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    if (!VerifyAssertion(Outliner.DeleteSlot(Bundle.SunEmitterToken), "Sun row deletes cleanly"))
    {
        return false;
    }

    const bool Retired = SynchronizeWorld(Outliner, Bundle);
    if (!VerifyAssertion(
            Retired &&
                !Bundle.SunEmitterToken.Valid() &&
                !Bundle.Scene.Atmosphere.Solar.SolarEnabled &&
                Bundle.Scene.Sun.SolarIrradiance.R < 1.0e-4f &&
                !Bundle.WorldSubjectPresent[static_cast<std::size_t>(OutlinerWorldSubject::Sun)],
            "Deleting the Sun row retires the solar source, zeroes irradiance, and clears the token") ||
        !VerifyAssertion(
            CountSubjectRows(Outliner, OutlinerWorldSubject::Sun) == 0u,
            "No orphaned Sun row survives retirement") ||
        !VerifyAssertion(
            Bundle.AtmosphereToken.Valid() && Bundle.Scene.Atmosphere.Medium.AtmosphereEnabled,
            "Retiring the Sun leaves the atmosphere untouched"))
    {
        return false;
    }

    if (!VerifyAssertion(Outliner.DeleteSlot(Bundle.AtmosphereToken), "Atmosphere row deletes cleanly"))
    {
        return false;
    }

    return VerifyAssertion(
        SynchronizeWorld(Outliner, Bundle) &&
            !Bundle.AtmosphereToken.Valid() &&
            !Bundle.Scene.Atmosphere.Medium.AtmosphereEnabled,
        "Deleting the Atmosphere row retires the sky dome medium");
}

bool ValidateReconstruction(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    const uint32_t RowsBefore = Outliner.QueryTotalCount();
    const OutlinerSlotToken SunSlot = Outliner.ConstructFromTemplate(2u); // "Add Sun"
    if (!VerifyAssertion(
            SunSlot.Valid() && Outliner.QueryTotalCount() == RowsBefore + 1u,
            "Construct menu adds exactly one Sun row"))
    {
        return false;
    }

    if (!VerifyAssertion(
            SynchronizeWorld(Outliner, Bundle) &&
                Bundle.SunEmitterToken == SunSlot &&
                Bundle.Scene.Atmosphere.Solar.SolarEnabled &&
                Bundle.Scene.Sun.SolarIrradiance.R > 5.0f,
            "Constructed Sun row registers itself and re-activates the solar source"))
    {
        return false;
    }

    const OutlinerRecordEntry* SunRow = Outliner.FindEntry(SunSlot);
    if (!VerifyAssertion(
            SunRow != nullptr &&
                SunRow->Subject == OutlinerWorldSubject::Sun &&
                SunRow->EnclosingToken == Bundle.WorldFolderToken &&
                SunRow->Title == "Sun",
            "Constructed Sun row is filed under the existing World collection folder"))
    {
        return false;
    }

    const uint32_t RowsAfterReconstruction = Outliner.QueryTotalCount();
    const OutlinerSlotToken DuplicateSlot  = Outliner.ConstructFromTemplate(2u); // "Add Sun" again
    if (!VerifyAssertion(DuplicateSlot != SunSlot, "Duplicate Sun construction issues a fresh row token"))
    {
        return false;
    }

    if (!VerifyAssertion(
            SynchronizeWorld(Outliner, Bundle) &&
                Bundle.SunEmitterToken == SunSlot &&
                Outliner.QueryTotalCount() == RowsAfterReconstruction &&
                CountSubjectRows(Outliner, OutlinerWorldSubject::Sun) == 1u,
            "Second Sun construction folds back into the single registered row"))
    {
        return false;
    }

    const OutlinerSlotToken AtmosphereSlot = Outliner.ConstructFromTemplate(3u); // "Add Atmosphere"
    return VerifyAssertion(
        AtmosphereSlot.Valid() &&
            SynchronizeWorld(Outliner, Bundle) &&
            Bundle.AtmosphereToken == AtmosphereSlot &&
            Bundle.Scene.Atmosphere.Medium.AtmosphereEnabled,
        "Constructed Atmosphere row restores the retired sky dome medium");
}

bool ValidateFolderRetirement(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    if (!VerifyAssertion(Outliner.DeleteSlot(Bundle.WorldFolderToken), "World collection folder deletes cleanly"))
    {
        return false;
    }

    const bool Retired = SynchronizeWorld(Outliner, Bundle);
    if (!VerifyAssertion(
            Retired &&
                !Bundle.WorldFolderToken.Valid() &&
                !Bundle.SunEmitterToken.Valid() &&
                !Bundle.AtmosphereToken.Valid() &&
                !Bundle.VolumetricCloudsToken.Valid() &&
                !Bundle.LocalCloudToken.Valid() &&
                !Bundle.Scene.Atmosphere.Clouds.CloudsEnabled &&
                !Bundle.Scene.Atmosphere.LocalCloud.LocalEnabled &&
                !Bundle.Scene.Atmosphere.Solar.SolarEnabled,
            "Deleting the World folder retires every nested world subject cleanly"))
    {
        return false;
    }

    const OutlinerSlotToken CloudsSlot = Outliner.ConstructFromTemplate(4u); // "Add Clouds"
    if (!VerifyAssertion(
            CloudsSlot.Valid() &&
                SynchronizeWorld(Outliner, Bundle) &&
                Bundle.VolumetricCloudsToken == CloudsSlot &&
                Bundle.Scene.Atmosphere.Clouds.CloudsEnabled &&
                Bundle.WorldFolderToken.Valid(),
            "First construction after folder removal activates the cloud deck and rebuilds the World folder"))
    {
        return false;
    }

    const OutlinerSlotToken LocalCloudSlot = Outliner.ConstructFromTemplate(5u); // "Add Local Cloud"
    if (!VerifyAssertion(
            LocalCloudSlot.Valid() &&
                SynchronizeWorld(Outliner, Bundle) &&
                Bundle.LocalCloudToken == LocalCloudSlot &&
                Bundle.Scene.Atmosphere.LocalCloud.LocalEnabled,
            "Constructed Local Cloud row activates the bounded cloud volume"))
    {
        return false;
    }

    const OutlinerSlotToken ReconstructedSun = Outliner.ConstructFromTemplate(2u); // "Add Sun"
    const OutlinerRecordEntry* SunRow      = Outliner.FindEntry(ReconstructedSun);
    const OutlinerRecordEntry* WorldFolder = Outliner.FindEntry(Bundle.WorldFolderToken);
    return VerifyAssertion(
        ReconstructedSun.Valid() &&
            SynchronizeWorld(Outliner, Bundle) &&
            Bundle.SunEmitterToken == ReconstructedSun &&
            SunRow != nullptr && WorldFolder != nullptr &&
            SunRow->EnclosingToken == Bundle.WorldFolderToken &&
            WorldFolder->Category == ConstructSlotCategory::Folder,
        "Every reconstructed world subject nests inside the single rebuilt World collection folder");
}

bool ValidateVisibilityDirective(OutlinerPanel& Outliner, ShowcaseWorldSceneBundle& Bundle)
{
    OutlinerRecordEntry* SunRow = Outliner.AccessEntry(Bundle.SunEmitterToken);
    if (!VerifyAssertion(SunRow != nullptr, "Sun row remains addressable for visibility directives"))
    {
        return false;
    }

    SunRow->VisibilityEnabled = false;
    if (!VerifyAssertion(
            SynchronizeWorld(Outliner, Bundle) &&
                !Bundle.Scene.Atmosphere.Solar.SolarEnabled &&
                Bundle.SunEmitterToken.Valid(),
            "Hiding the Sun row disables the solar source without retiring the row"))
    {
        return false;
    }

    if (OutlinerRecordEntry* RestoredRow = Outliner.AccessEntry(Bundle.SunEmitterToken))
    {
        RestoredRow->VisibilityEnabled = true;
    }
    return VerifyAssertion(
        SynchronizeWorld(Outliner, Bundle) && Bundle.Scene.Atmosphere.Solar.SolarEnabled,
        "Showing the Sun row re-enables the solar source");
}

bool ValidateForeignRowIsolation()
{
    // Host template list deliberately omits the camera preset: clamped construction must not stamp a world subject onto it
    OutlinerPanel                          Probe{};
    std::vector<OutlinerConstructTemplate> Templates{};
    Templates.push_back({ "Add Sun", "Sun", "World", "Solar ephemeris", ConstructSlotCategory::LayerGroup, OutlinerWorldSubject::Sun });
    Probe.ConfigureConstructTemplates(Templates);

    ShowcaseWorldSceneBundle ProbeBundle{};
    ProbeBundle.Scene.Atmosphere.Medium.AtmosphereEnabled = true;
    ProbeBundle.Scene.Atmosphere.Solar.SolarEnabled       = true;

    RegisterShowcaseGalleryInOutliner(Probe, ProbeBundle, true);

    const OutlinerRecordEntry* CameraRow = Probe.FindEntry(ProbeBundle.EditorCameraToken);
    if (!VerifyAssertion(
            CameraRow != nullptr &&
                CameraRow->Subject == OutlinerWorldSubject::None &&
                CameraRow->Permanent &&
                ProbeBundle.SunEmitterToken.Valid() &&
                ProbeBundle.SunEmitterToken != ProbeBundle.EditorCameraToken,
            "Editor Camera row never inherits a world subject when the host template list is incomplete"))
    {
        return false;
    }

    (void)SynchronizeWorld(Probe, ProbeBundle);
    return VerifyAssertion(
        Probe.FindEntry(ProbeBundle.EditorCameraToken) != nullptr &&
            Probe.FindEntry(ProbeBundle.SunEmitterToken) != nullptr &&
            ProbeBundle.Scene.Atmosphere.Solar.SolarEnabled,
        "Live synchronise keeps the Editor Camera row intact while the Sun row stays registered");
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENTRY POINT
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    OutlinerPanel            Outliner{};
    ShowcaseWorldSceneBundle Bundle{};

    ConfigureWorldSubjectTemplates(Outliner);

    if (!ValidateWorldSubjectRegistration(Outliner, Bundle) ||
        !ValidateRetirement(Outliner, Bundle) ||
        !ValidateReconstruction(Outliner, Bundle) ||
        !ValidateFolderRetirement(Outliner, Bundle) ||
        !ValidateVisibilityDirective(Outliner, Bundle) ||
        !ValidateForeignRowIsolation())
    {
        return 1;
    }

    std::printf(
        "[WorldSubjectConstructionValidation] Construct, register, retire, and rebuild validations passed for 5 world subjects.\n");
    return 0;
}
