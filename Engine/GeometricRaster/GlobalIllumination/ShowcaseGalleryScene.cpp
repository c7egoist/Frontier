/*==========================================================================================================================================
                                                   SHOWCASEGALLERYSCENE.CPP
==========================================================================================================================================*/
// 🧩 Canonical Architectural Cornell-Studio Gallery World Scene, EditorCamera, and OutlinerPanel bidirectional registration

#include "Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.h"

#include "Engine/GeometrySpace/Primitives/AnalyticPrimitives.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

namespace Frontier::GeometricRaster
{

namespace
{

void BuildBoxGeometryAsset(ShowcaseGeometryAsset& OutAsset, Mathematics::Scalar3D HalfExtents)
{
    OutAsset = {};
    GeometrySpace::AppendBoxPrimitive(OutAsset.Network, { 0.0f, 0.0f, 0.0f }, HalfExtents, {}, {});
    (void)OutAsset.Pyramid.BuildFromPolygonNetwork(OutAsset.Network, 3u);
}

void BuildSphereGeometryAsset(ShowcaseGeometryAsset& OutAsset, float Radius, uint32_t Sectors, uint32_t Rings)
{
    OutAsset = {};
    GeometrySpace::AppendSpherePrimitive(OutAsset.Network, { 0.0f, 0.0f, 0.0f }, Radius, Sectors, Rings, {}, {});
    OutAsset.Network.LinkOppositeEdges();
    OutAsset.Network.RecomputeNormals();
    (void)OutAsset.Pyramid.BuildFromPolygonNetwork(OutAsset.Network, 3u);
}

[[nodiscard]] bool NearlyEqualFloat(float Left, float Right) noexcept
{
    return std::fabs(Left - Right) <= 1.0e-4f;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                           CANONICAL GALLERY SCENE BUILDER
//------------------------------------------------------------------------------------------------------------------------

void BuildShowcaseGalleryScene(
    ShowcaseWorldSceneBundle& OutBundle,
    uint32_t                  ViewportWidthPx,
    uint32_t                  ViewportHeightPx)
{
    OutBundle = {};

    MaterialSpace::SurfaceMaterial NeutralPlaster {};
    NeutralPlaster.MaterialName             = "GalleryNeutralPlaster";
    NeutralPlaster.Diffuse.BaseColor        = { 0.78f, 0.77f, 0.75f };
    NeutralPlaster.Diffuse.DiffuseRoughness = 0.55f;
    NeutralPlaster.Specular.Roughness       = 0.65f;

    MaterialSpace::SurfaceMaterial CrimsonWall {};
    CrimsonWall.MaterialName                = "GalleryCrimsonWall";
    CrimsonWall.Diffuse.BaseColor           = { 0.86f, 0.08f, 0.07f };
    CrimsonWall.Diffuse.DiffuseRoughness    = 0.50f;
    CrimsonWall.Specular.Roughness          = 0.55f;

    MaterialSpace::SurfaceMaterial EmeraldWall {};
    EmeraldWall.MaterialName                = "GalleryEmeraldWall";
    EmeraldWall.Diffuse.BaseColor           = { 0.09f, 0.80f, 0.17f };
    EmeraldWall.Diffuse.DiffuseRoughness    = 0.50f;
    EmeraldWall.Specular.Roughness          = 0.55f;

    MaterialSpace::SurfaceMaterial MirrorChrome {};
    MirrorChrome.MaterialName               = "PolishedMirrorChrome";
    MirrorChrome.Diffuse.BaseColor          = { 0.94f, 0.95f, 0.97f };
    MirrorChrome.Specular.Metalness         = 1.0f;
    MirrorChrome.Specular.Roughness         = 0.035f;
    MirrorChrome.Specular.EdgeTintF82       = { 0.98f, 0.98f, 0.99f };

    MaterialSpace::SurfaceMaterial BrushedGold {};
    BrushedGold.MaterialName                = "AnisotropicGoldPedestal";
    BrushedGold.Diffuse.BaseColor           = { 0.96f, 0.76f, 0.32f };
    BrushedGold.Specular.Metalness          = 1.0f;
    BrushedGold.Specular.Roughness          = 0.18f;
    BrushedGold.Specular.Anisotropy         = 0.55f;
    BrushedGold.Specular.EdgeTintF82        = { 1.00f, 0.90f, 0.60f };

    MaterialSpace::SurfaceMaterial ClearcoatCobalt {};
    ClearcoatCobalt.MaterialName            = "ClearcoatCobaltArch";
    ClearcoatCobalt.Diffuse.BaseColor       = { 0.10f, 0.25f, 0.78f };
    ClearcoatCobalt.Specular.Roughness      = 0.28f;
    ClearcoatCobalt.Clearcoat.CoatWeight    = 1.0f;
    ClearcoatCobalt.Clearcoat.CoatRoughness = 0.04f;

    MaterialSpace::SurfaceMaterial AbbeCrownGlass {};
    AbbeCrownGlass.MaterialName                      = "AbbeCrownGlassOrb";
    AbbeCrownGlass.Diffuse.BaseWeight                = 0.0f;
    AbbeCrownGlass.Specular.Roughness                = 0.02f;
    AbbeCrownGlass.Specular.DielectricIOR            = 1.52f;
    AbbeCrownGlass.Transmission.TransmissionWeight   = 1.0f;
    AbbeCrownGlass.Transmission.AttenuationColor     = { 0.95f, 0.98f, 1.00f };
    AbbeCrownGlass.Transmission.AbbeDispersionNumber = 26.0f;

    const uint16_t SlotPlaster = OutBundle.Scene.MaterialRegister.RegisterMaterial(NeutralPlaster);
    const uint16_t SlotCrimson = OutBundle.Scene.MaterialRegister.RegisterMaterial(CrimsonWall);
    const uint16_t SlotEmerald = OutBundle.Scene.MaterialRegister.RegisterMaterial(EmeraldWall);
    const uint16_t SlotChrome  = OutBundle.Scene.MaterialRegister.RegisterMaterial(MirrorChrome);
    const uint16_t SlotGold    = OutBundle.Scene.MaterialRegister.RegisterMaterial(BrushedGold);
    const uint16_t SlotCobalt  = OutBundle.Scene.MaterialRegister.RegisterMaterial(ClearcoatCobalt);
    const uint16_t SlotGlass   = OutBundle.Scene.MaterialRegister.RegisterMaterial(AbbeCrownGlass);

    BuildBoxGeometryAsset(OutBundle.GeometryAssets[0u],    { 2.80f, 2.40f, 0.08f });
    BuildBoxGeometryAsset(OutBundle.GeometryAssets[1u],    { 2.80f, 0.08f, 1.45f });
    BuildBoxGeometryAsset(OutBundle.GeometryAssets[2u],    { 0.08f, 2.20f, 1.45f });
    BuildBoxGeometryAsset(OutBundle.GeometryAssets[3u],    { 1.35f, 1.15f, 0.07f });
    BuildBoxGeometryAsset(OutBundle.GeometryAssets[4u],    { 0.46f, 0.46f, 0.24f });
    BuildSphereGeometryAsset(OutBundle.GeometryAssets[5u], 0.52f, 36u, 22u);
    BuildSphereGeometryAsset(OutBundle.GeometryAssets[6u], 0.44f, 32u, 20u);
    BuildSphereGeometryAsset(OutBundle.GeometryAssets[7u], 0.40f, 32u, 20u);

    GeometrySpace::PolygonNetwork UnifiedWorldNetwork {};

    const auto AppendBoxEntry = [&](
        std::size_t           AssetOrdinal,
        const char*           Title,
        const char*           StableId,
        const char*           MaterialTitle,
        const char*           Subtitle,
        const char*           Notes,
        Mathematics::Axis3D   Center,
        Mathematics::Scalar3D HalfExtents,
        uint16_t              Slot,
        bool                  GlassShell)
    {
        const uint32_t InstanceIdx = static_cast<uint32_t>(OutBundle.Scene.ClusterInstances.size());
        OutBundle.Scene.ClusterInstances.push_back(
            { &OutBundle.GeometryAssets[AssetOrdinal].Pyramid, Center, Center, 1.0f, Slot, GlassShell });
        if (!GlassShell)
        {
            GeometrySpace::AppendBoxPrimitive(UnifiedWorldNetwork, Center, HalfExtents, {}, {}, 0u, Slot);
        }

        ShowcaseWorldObjectEntry Record {};
        Record.Title                = Title;
        Record.StableIdentifier     = StableId;
        Record.MaterialTitle        = MaterialTitle;
        Record.Subtitle             = Subtitle;
        Record.AuthorNotes          = Notes;
        Record.CenterWorld          = Center;
        Record.DimensionsMeters     = { HalfExtents.X * 2.0f, HalfExtents.Y * 2.0f, HalfExtents.Z * 2.0f };
        Record.MaterialSlot         = Slot;
        Record.ClusterInstanceIndex = InstanceIdx;
        Record.GlassShell           = GlassShell;
        Record.SphericalPrimitive   = false;
        OutBundle.Objects.push_back(std::move(Record));
    };

    const auto AppendSphereEntry = [&](
        std::size_t         AssetOrdinal,
        const char*         Title,
        const char*         StableId,
        const char*         MaterialTitle,
        const char*         Subtitle,
        const char*         Notes,
        Mathematics::Axis3D Center,
        float               Radius,
        uint32_t            Sectors,
        uint32_t            Rings,
        uint16_t            Slot,
        bool                GlassShell)
    {
        const uint32_t InstanceIdx = static_cast<uint32_t>(OutBundle.Scene.ClusterInstances.size());
        OutBundle.Scene.ClusterInstances.push_back(
            { &OutBundle.GeometryAssets[AssetOrdinal].Pyramid, Center, Center, 1.0f, Slot, GlassShell });
        if (!GlassShell)
        {
            GeometrySpace::AppendSpherePrimitive(UnifiedWorldNetwork, Center, Radius, Sectors, Rings, {}, {}, 0u, Slot);
        }

        const float Diameter = Radius * 2.0f;
        ShowcaseWorldObjectEntry Record {};
        Record.Title                = Title;
        Record.StableIdentifier     = StableId;
        Record.MaterialTitle        = MaterialTitle;
        Record.Subtitle             = Subtitle;
        Record.AuthorNotes          = Notes;
        Record.CenterWorld          = Center;
        Record.DimensionsMeters     = { Diameter, Diameter, Diameter };
        Record.MaterialSlot         = Slot;
        Record.ClusterInstanceIndex = InstanceIdx;
        Record.GlassShell           = GlassShell;
        Record.SphericalPrimitive   = true;
        OutBundle.Objects.push_back(std::move(Record));
    };

    AppendBoxEntry(
        0u,
        "Gallery Floor",
        "gallery-floor",
        "GalleryNeutralPlaster",
        "Box · 5.60 × 4.80 × 0.16 m · Neutral Plaster",
        "Architectural floor slab receiving 3.91 mm contact-clip shadows, LTC softbox illumination, and Crimson/Emerald bounce.",
        { 0.00f, 0.20f, -0.72f },
        { 2.80f, 2.40f, 0.08f },
        SlotPlaster,
        false);

    AppendBoxEntry(
        1u,
        "Gallery Back Wall",
        "gallery-back-wall",
        "GalleryNeutralPlaster",
        "Box · 5.60 × 0.16 × 2.90 m · Neutral Plaster",
        "North neutral plaster backdrop closing the Cornell-Studio chamber.",
        { 0.00f, 2.35f, 0.70f },
        { 2.80f, 0.08f, 1.45f },
        SlotPlaster,
        false);

    AppendBoxEntry(
        2u,
        "Crimson Left Wall",
        "crimson-left-wall",
        "GalleryCrimsonWall",
        "Box · 0.16 × 4.40 × 2.90 m · Crimson Bounce",
        "West sunlit Crimson wall driving warm diffuse color bleed into the gallery.",
        { -2.15f, 0.25f, 0.70f },
        { 0.08f, 2.20f, 1.45f },
        SlotCrimson,
        false);

    AppendBoxEntry(
        2u,
        "Emerald Right Wall",
        "emerald-right-wall",
        "GalleryEmeraldWall",
        "Box · 0.16 × 4.40 × 2.90 m · Emerald Bounce",
        "East Emerald wall reflecting saturated green indirect radiance onto the eastern specimen.",
        { 2.15f, 0.25f, 0.70f },
        { 0.08f, 2.20f, 1.45f },
        SlotEmerald,
        false);

    AppendBoxEntry(
        3u,
        "Clearcoat Roof Baffle",
        "clearcoat-roof-baffle",
        "ClearcoatCobaltArch",
        "Box · 2.70 × 2.30 × 0.14 m · Clearcoat Cobalt",
        "Overhead architectural baffle casting calibrated solar penumbra across the gallery floor.",
        { -0.45f, 0.55f, 1.92f },
        { 1.35f, 1.15f, 0.07f },
        SlotCobalt,
        false);

    AppendBoxEntry(
        4u,
        "Anisotropic Gold Pedestal",
        "gold-pedestal",
        "AnisotropicGoldPedestal",
        "Box · 0.92 × 0.92 × 0.48 m · Brushed Gold",
        "Anisotropic F82 conductor pedestal supporting the central mirror chrome sphere.",
        { -0.15f, 0.55f, -0.40f },
        { 0.46f, 0.46f, 0.24f },
        SlotGold,
        false);

    AppendSphereEntry(
        5u,
        "Mirror Chrome Sphere",
        "chrome-sphere",
        "PolishedMirrorChrome",
        "Sphere · r = 0.52 m · F82 Mirror Chrome",
        "Central hero conductor sphere showcasing Hi-Z screen-space reflections (GTX) and VNDF specular reflections (RTX).",
        { -0.15f, 0.55f, 0.34f },
        0.52f,
        36u,
        22u,
        SlotChrome,
        false);

    AppendSphereEntry(
        6u,
        "Plaster Specimen West",
        "plaster-west",
        "GalleryNeutralPlaster",
        "Sphere · r = 0.44 m · Neutral Plaster",
        "Western Oren-Nayar diffuse sphere capturing Crimson left-wall multi-bounce bleed.",
        { -1.25f, 0.65f, -0.20f },
        0.44f,
        32u,
        20u,
        SlotPlaster,
        false);

    AppendSphereEntry(
        6u,
        "Plaster Specimen East",
        "plaster-east",
        "GalleryNeutralPlaster",
        "Sphere · r = 0.44 m · Neutral Plaster",
        "Eastern Oren-Nayar diffuse sphere capturing Emerald right-wall multi-bounce bleed.",
        { 1.25f, 0.65f, -0.20f },
        0.44f,
        32u,
        20u,
        SlotPlaster,
        false);

    AppendSphereEntry(
        7u,
        "Abbe Crown Glass Orb",
        "abbe-glass-orb",
        "AbbeCrownGlassOrb",
        "Sphere · r = 0.40 m · Abbe 26 Crown Glass",
        "Foreground 2-layer dispersive dielectric orb (IOR 1.52, Abbe 26) refracting the gallery interior.",
        { 0.62f, -0.55f, -0.16f },
        0.40f,
        32u,
        20u,
        SlotGlass,
        true);

    (void)OutBundle.Scene.SceneTree.BuildFromPolygonNetwork(UnifiedWorldNetwork);
    (void)OutBundle.Scene.SceneSdf.BuildFromWideBoundingTree(OutBundle.Scene.SceneTree, 0.09f, 0.45f);

    OutBundle.Scene.Sun.DirectionToSun          = Mathematics::NormalizeAxis({ 0.42f, -0.55f, 0.72f });
    OutBundle.Scene.Sun.SunAngularRadiusRadians = 0.018f;
    OutBundle.Scene.Sun.SolarIrradiance         = { 5.40f, 5.10f, 4.65f };
    OutBundle.Scene.Sun.RtxSamplesPerPixel      = 6u;
    OutBundle.Scene.SkyRadiance                 = { 0.16f, 0.23f, 0.36f };

    PolygonalAreaQuadLight CeilingSoftbox {};
    CeilingSoftbox.CenterWorld      = { 0.55f, 0.35f, 1.82f };
    CeilingSoftbox.RightTangent     = { 1.0f, 0.0f, 0.0f };
    CeilingSoftbox.UpBitangent      = { 0.0f, -1.0f, 0.0f };
    CeilingSoftbox.HalfWidthMeters  = 0.85f;
    CeilingSoftbox.HalfHeightMeters = 0.65f;
    CeilingSoftbox.EmittedRadiance  = { 7.5f, 6.6f, 5.4f };
    OutBundle.Scene.AreaLights.push_back(CeilingSoftbox);

    OutBundle.Scene.LatticeConfig.GridMinimumWorld  = { -2.02f, -1.20f, -0.58f };
    OutBundle.Scene.LatticeConfig.GridMaximumWorld  = {  2.02f,  2.15f,  1.75f };
    OutBundle.Scene.LatticeConfig.CountX            = 7u;
    OutBundle.Scene.LatticeConfig.CountY            = 6u;
    OutBundle.Scene.LatticeConfig.CountZ            = 4u;
    OutBundle.Scene.LatticeConfig.FibonacciRayCount = 64u;
    OutBundle.Scene.LatticeConfig.BouncePasses      = 2u;

    OutBundle.EditorCamera.CameraOrigin       = { 0.00f, -3.55f, 0.42f };
    OutBundle.EditorCamera.TargetPoint        = { 0.00f,  0.55f, 0.15f };
    OutBundle.EditorCamera.WorldUpAxis        = { 0.00f,  0.00f, 1.00f };
    OutBundle.EditorCamera.VerticalFovRadians = 43.0f * Constants::DegToRadFloat;
    OutBundle.EditorCamera.NearClipMeters     = 0.15f;
    OutBundle.EditorCamera.FarClipMeters      = 60.0f;
    OutBundle.EditorCamera.ViewportWidthPx    = std::max(1u, ViewportWidthPx);
    OutBundle.EditorCamera.ViewportHeightPx   = std::max(1u, ViewportHeightPx);
}

//------------------------------------------------------------------------------------------------------------------------
//                                           OUTLINER REGISTRATION & SYNC
//------------------------------------------------------------------------------------------------------------------------

void RegisterShowcaseGalleryInOutliner(
    OutlinerPanel&            TargetOutliner,
    ShowcaseWorldSceneBundle& InOutBundle)
{
    TargetOutliner.ClearAll();

    const std::array<OutlinerConstructTemplate, 4u> Templates = {{
        { "Add Box Geometry",    "Box Specimen",    "Geometry", "Box · OpenPBR Surface",          ConstructSlotCategory::CategoryOne   },
        { "Add Sphere Geometry", "Sphere Specimen", "Geometry", "Sphere · OpenPBR Surface",       ConstructSlotCategory::CategoryOne   },
        { "Add Area Light",      "Area Quad Light", "Lighting", "LTC Polygonal Quad Emitter",     ConstructSlotCategory::CategoryThree },
        { "Add Scene Camera",    "Scene Camera",    "Camera",   "Perspective Optical Camera",     ConstructSlotCategory::CategoryFour  },
    }};
    TargetOutliner.ConfigureConstructTemplates(Templates);

    InOutBundle.ShowcaseFolderToken = TargetOutliner.ConstructFolder("Showcase");
    if (OutlinerRecordEntry* Folder = TargetOutliner.AccessEntry(InOutBundle.ShowcaseFolderToken))
    {
        Folder->FolderTint    = WorkspaceSurfaceColors::ShowcaseSage;
        Folder->Subtitle      = "Cornell-Studio Gallery · 10 specimens";
        Folder->AuthorNotes   = "Canonical C++ <-> HTML mirror geometry collection.";
        Folder->Expanded      = true;
    }

    for (ShowcaseWorldObjectEntry& Obj : InOutBundle.Objects)
    {
        const OutlinerSlotToken Slot = TargetOutliner.ConstructFromTemplate(
            Obj.SphericalPrimitive ? 1u : 0u,
            InOutBundle.ShowcaseFolderToken);
        Obj.SlotToken = Slot;

        if (OutlinerRecordEntry* Entry = TargetOutliner.AccessEntry(Slot))
        {
            Entry->Title             = Obj.Title;
            Entry->CategoryLabel     = "Geometry · " + Obj.MaterialTitle;
            Entry->Subtitle          = Obj.Subtitle;
            Entry->AuthorNotes       = Obj.AuthorNotes;
            Entry->PositionX         = Obj.CenterWorld.X;
            Entry->PositionY         = Obj.CenterWorld.Y;
            Entry->PositionZ         = Obj.CenterWorld.Z;
            Entry->ScaleX            = Obj.DimensionsMeters.X;
            Entry->ScaleY            = Obj.DimensionsMeters.Y;
            Entry->ScaleZ            = Obj.DimensionsMeters.Z;
            Entry->VisibilityEnabled = true;
            Entry->CastShadows       = !Obj.GlassShell;
        }
    }

    InOutBundle.CamerasFolderToken = TargetOutliner.ConstructFolder("Cameras");
    if (OutlinerRecordEntry* Folder = TargetOutliner.AccessEntry(InOutBundle.CamerasFolderToken))
    {
        Folder->FolderTint  = ColorRgba{ 126, 178, 224, 255 };
        Folder->Subtitle    = "Editor & scene cameras";
        Folder->AuthorNotes = "Permanent Editor Camera synchronized 1:1 with HTML GTX viewport.";
        Folder->Expanded    = true;
    }

    InOutBundle.EditorCameraToken = TargetOutliner.ConstructFromTemplate(3u, InOutBundle.CamerasFolderToken);
    if (OutlinerRecordEntry* CamEntry = TargetOutliner.AccessEntry(InOutBundle.EditorCameraToken))
    {
        CamEntry->Title             = "Editor Camera";
        CamEntry->CategoryLabel     = "Scene / Cameras";
        CamEntry->Subtitle          = "Editor · permanent · 43.0 deg FOV";
        CamEntry->AuthorNotes       = "Target (0.00, 0.55, 0.15) m · Near 0.15 m · Far 60.0 m · Exposure 1.35x.";
        CamEntry->PositionX         = InOutBundle.EditorCamera.CameraOrigin.X;
        CamEntry->PositionY         = InOutBundle.EditorCamera.CameraOrigin.Y;
        CamEntry->PositionZ         = InOutBundle.EditorCamera.CameraOrigin.Z;
        CamEntry->RotationX         = -3.8f;
        CamEntry->RotationY         = 0.0f;
        CamEntry->RotationZ         = 0.0f;
        CamEntry->ScaleX            = 1.0f;
        CamEntry->ScaleY            = 1.0f;
        CamEntry->ScaleZ            = 1.0f;
        CamEntry->VisibilityEnabled = true;
        CamEntry->CastShadows       = false;
    }

    InOutBundle.WorldFolderToken = TargetOutliner.ConstructFolder("World");
    if (OutlinerRecordEntry* Folder = TargetOutliner.AccessEntry(InOutBundle.WorldFolderToken))
    {
        Folder->FolderTint  = WorkspaceSurfaceColors::ShowcaseWarmGold;
        Folder->Subtitle    = "Solar emitter & environment";
        Folder->AuthorNotes = "Calibrated directional solar emitter (next phase: full Atmosphere).";
        Folder->Expanded    = true;
    }

    InOutBundle.SunEmitterToken = TargetOutliner.ConstructFromTemplate(2u, InOutBundle.WorldFolderToken);
    if (OutlinerRecordEntry* SunEntry = TargetOutliner.AccessEntry(InOutBundle.SunEmitterToken))
    {
        SunEntry->Category          = ConstructSlotCategory::CategoryTwo;
        SunEntry->Title             = "Sun";
        SunEntry->CategoryLabel     = "World / Solar Emitter";
        SunEntry->Subtitle          = "Directional · 5.40, 5.10, 4.65 W/m2 · 1.03 deg";
        SunEntry->AuthorNotes       = "3.91 mm/tx GTX Contact-Clip + SDF Cone Penumbra solar emitter.";
        SunEntry->PositionX         = InOutBundle.Scene.Sun.DirectionToSun.X;
        SunEntry->PositionY         = InOutBundle.Scene.Sun.DirectionToSun.Y;
        SunEntry->PositionZ         = InOutBundle.Scene.Sun.DirectionToSun.Z;
        SunEntry->VisibilityEnabled = true;
        SunEntry->CastShadows       = true;
    }

    InOutBundle.LightingFolderToken = TargetOutliner.ConstructFolder("Lighting");
    if (OutlinerRecordEntry* Folder = TargetOutliner.AccessEntry(InOutBundle.LightingFolderToken))
    {
        Folder->FolderTint  = ColorRgba{ 226, 152, 128, 255 };
        Folder->Subtitle    = "Analytic LTC area lights";
        Folder->AuthorNotes = "Clipped-horizon polygonal quad lights integrated via LinearCosineLightIntegration.";
        Folder->Expanded    = true;
    }

    InOutBundle.CeilingSoftboxToken = TargetOutliner.ConstructFromTemplate(2u, InOutBundle.LightingFolderToken);
    if (OutlinerRecordEntry* LightEntry = TargetOutliner.AccessEntry(InOutBundle.CeilingSoftboxToken))
    {
        const auto& Softbox = InOutBundle.Scene.AreaLights.front();
        LightEntry->Title             = "Ceiling Softbox";
        LightEntry->CategoryLabel     = "Lighting / LTC Area Quad";
        LightEntry->Subtitle          = "LTC Quad · 1.70 × 1.30 m · 7.5, 6.6, 5.4 nit";
        LightEntry->AuthorNotes       = "Overhead architectural softbox illuminating gallery floor and specular spheres.";
        LightEntry->PositionX         = Softbox.CenterWorld.X;
        LightEntry->PositionY         = Softbox.CenterWorld.Y;
        LightEntry->PositionZ         = Softbox.CenterWorld.Z;
        LightEntry->ScaleX            = Softbox.HalfWidthMeters * 2.0f;
        LightEntry->ScaleY            = Softbox.HalfHeightMeters * 2.0f;
        LightEntry->ScaleZ            = 1.0f;
        LightEntry->VisibilityEnabled = true;
        LightEntry->CastShadows       = false;
    }

    OutlinerFooterReadings Footer {};
    Footer.RealtimeText  = "60 fps";
    Footer.QualityText   = "GTX Tier 1";
    Footer.PrimarySlot   = "Sun 46°";
    Footer.SecondarySlot = "LTC 1";
    char CamBuffer[48]{};
    std::snprintf(
        CamBuffer,
        sizeof(CamBuffer),
        "%.1f, %.1f, %.1f",
        InOutBundle.EditorCamera.CameraOrigin.X,
        InOutBundle.EditorCamera.CameraOrigin.Y,
        InOutBundle.EditorCamera.CameraOrigin.Z);
    Footer.CameraText = CamBuffer;
    TargetOutliner.ConfigureFooterReadings(Footer);

    if (!InOutBundle.Objects.empty() && InOutBundle.Objects[6u].SlotToken.Valid())
    {
        TargetOutliner.SelectSingle(InOutBundle.Objects[6u].SlotToken);
    }
}

bool SynchronizeShowcaseGalleryFromOutliner(
    const OutlinerPanel&      SourceOutliner,
    ShowcaseWorldSceneBundle& InOutBundle)
{
    bool Changed = false;

    for (ShowcaseWorldObjectEntry& Obj : InOutBundle.Objects)
    {
        if (!Obj.SlotToken.Valid() || Obj.ClusterInstanceIndex >= InOutBundle.Scene.ClusterInstances.size())
        {
            continue;
        }
        const OutlinerRecordEntry* Entry = SourceOutliner.FindEntry(Obj.SlotToken);
        auto&                      Inst  = InOutBundle.Scene.ClusterInstances[Obj.ClusterInstanceIndex];

        const bool EffectiveVis = (Entry != nullptr) && SourceOutliner.QueryEffectiveVisibility(Obj.SlotToken);
        const float TargetScale = EffectiveVis ? 1.0f : 0.0f;
        if (!NearlyEqualFloat(Inst.UniformScale, TargetScale))
        {
            Inst.UniformScale = TargetScale;
            Changed           = true;
        }

        if (Entry != nullptr)
        {
            const Mathematics::Axis3D NextPos{ Entry->PositionX, Entry->PositionY, Entry->PositionZ };
            if (!NearlyEqualFloat(Inst.WorldTranslation.X, NextPos.X) ||
                !NearlyEqualFloat(Inst.WorldTranslation.Y, NextPos.Y) ||
                !NearlyEqualFloat(Inst.WorldTranslation.Z, NextPos.Z))
            {
                Inst.PreviousTranslation = Inst.WorldTranslation;
                Inst.WorldTranslation    = NextPos;
                Obj.CenterWorld          = NextPos;
                Changed                  = true;
            }
        }
    }

    if (const OutlinerRecordEntry* CamEntry = SourceOutliner.FindEntry(InOutBundle.EditorCameraToken))
    {
        const Mathematics::Axis3D NextCam{ CamEntry->PositionX, CamEntry->PositionY, CamEntry->PositionZ };
        if (!NearlyEqualFloat(InOutBundle.EditorCamera.CameraOrigin.X, NextCam.X) ||
            !NearlyEqualFloat(InOutBundle.EditorCamera.CameraOrigin.Y, NextCam.Y) ||
            !NearlyEqualFloat(InOutBundle.EditorCamera.CameraOrigin.Z, NextCam.Z))
        {
            InOutBundle.EditorCamera.CameraOrigin = NextCam;
            Changed                               = true;
        }
    }

    if (const OutlinerRecordEntry* SunEntry = SourceOutliner.FindEntry(InOutBundle.SunEmitterToken))
    {
        const bool SunVisible = SourceOutliner.QueryEffectiveVisibility(InOutBundle.SunEmitterToken);
        const Mathematics::LinearRGB TargetIrr = SunVisible
            ? Mathematics::LinearRGB{ 5.40f, 5.10f, 4.65f }
            : Mathematics::LinearRGB{ 0.0f, 0.0f, 0.0f };
        if (!NearlyEqualFloat(InOutBundle.Scene.Sun.SolarIrradiance.R, TargetIrr.R))
        {
            InOutBundle.Scene.Sun.SolarIrradiance = TargetIrr;
            Changed                               = true;
        }
        const Mathematics::Axis3D NextDir = Mathematics::NormalizeAxis(
            { SunEntry->PositionX, SunEntry->PositionY, SunEntry->PositionZ });
        if (!NearlyEqualFloat(InOutBundle.Scene.Sun.DirectionToSun.X, NextDir.X) ||
            !NearlyEqualFloat(InOutBundle.Scene.Sun.DirectionToSun.Y, NextDir.Y) ||
            !NearlyEqualFloat(InOutBundle.Scene.Sun.DirectionToSun.Z, NextDir.Z))
        {
            InOutBundle.Scene.Sun.DirectionToSun = NextDir;
            Changed                              = true;
        }
    }

    if (!InOutBundle.Scene.AreaLights.empty())
    {
        if (const OutlinerRecordEntry* SoftboxEntry = SourceOutliner.FindEntry(InOutBundle.CeilingSoftboxToken))
        {
            auto& Softbox = InOutBundle.Scene.AreaLights.front();
            const bool LightVisible = SourceOutliner.QueryEffectiveVisibility(InOutBundle.CeilingSoftboxToken);
            const Mathematics::LinearRGB TargetEmit = LightVisible
                ? Mathematics::LinearRGB{ 7.5f, 6.6f, 5.4f }
                : Mathematics::LinearRGB{ 0.0f, 0.0f, 0.0f };
            if (!NearlyEqualFloat(Softbox.EmittedRadiance.R, TargetEmit.R))
            {
                Softbox.EmittedRadiance = TargetEmit;
                Changed                 = true;
            }
            const Mathematics::Axis3D NextCenter{ SoftboxEntry->PositionX, SoftboxEntry->PositionY, SoftboxEntry->PositionZ };
            if (!NearlyEqualFloat(Softbox.CenterWorld.X, NextCenter.X) ||
                !NearlyEqualFloat(Softbox.CenterWorld.Y, NextCenter.Y) ||
                !NearlyEqualFloat(Softbox.CenterWorld.Z, NextCenter.Z))
            {
                Softbox.CenterWorld = NextCenter;
                Changed             = true;
            }
        }
    }

    return Changed;
}

} // namespace Frontier::GeometricRaster
