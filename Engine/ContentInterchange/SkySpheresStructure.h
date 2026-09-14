//============================================================================================================================================
//                                                    SKYSPHERESSTRUCTURE.H
//============================================================================================================================================
// 🧩 The default outdoor level (`--scene spheres`): three spheres on an open ground plane, under the sky.
//
//    🔴 WHY THIS REPLACES THE CORNELL BOX AS THE DEFAULT. The Cornell box is a sealed room. It was the right
//    reference for direct lighting and for bounce energy, and it stays exactly where it is for those proofs —
//    but it is the WORST POSSIBLE scene for a sky: it has no sky in it. A closed box shows nothing of the sun,
//    nothing of the atmosphere, no horizon, no shadows cast by a directional light, and no sky-lit ambient. A
//    person asking "does the sun and atmosphere work" cannot be answered with a picture of a closed room.
//
//    These are the same three spheres and the same ground plane used in Renders/, deliberately: the offline
//    images and the live renderer show the same scene, so a disagreement between them is visible rather than
//    something to be argued about.
//
//    ⚠️ THE CORNELL BOX IS NOT REMOVED. Twelve proof harnesses use it as a bit-identity reference
//    (TraversalIdentity, HitIdentity, ExposureIntegrator, ReSTIRReservoir, SceneCodec and others). Deleting it
//    would invalidate all of them to change a default. `--scene cornell` still builds the identical file.
//
//    Geometry matches Scratchpad/CelestialShowcase.cpp exactly:
//        red    sphere  r = 1.15 m  at (−2.7,  9.5, 1.15)
//        blue   sphere  r = 0.78 m  at ( 0.2,  7.6, 0.78)
//        olive  sphere  r = 1.55 m  at ( 3.0, 11.2, 1.55)
//        ground plane   80 × 80 m centred under them, so the horizon is the SKY's horizon and not an edge
//
//    NO LUMINAIRE. That is the point of the level: every photon comes from the sun and the sky. If the celestial
//    path is broken this scene renders black, which is a far more useful failure than a scene with a fill light
//    quietly covering for it.

#pragma once

#include "MaterialDescriptor.h"
#include "../DeviceExchange/SwapchainExchange.h"
#include <string>
#include <vector>

namespace Frontier {

class SkySpheresStructure
{
public:
    // Fills the world-space soup (RH Z-up, metres). Triangles carry UVs; CornerNormals holds 3 smooth normals
    //    per triangle, so the spheres shade smoothly rather than faceted.
    void Construct() noexcept;

    // Writes SkySpheres.gltf at Path. Error receives the codec message.
    [[nodiscard]] bool Export(const std::string& Path, std::string* Error) const noexcept;

    [[nodiscard]] const std::vector<TriangleIndex>&      QueryTriangles()     const noexcept { return Triangles; }
    [[nodiscard]] const std::vector<Vector3>&            QueryCornerNormals() const noexcept { return CornerNormals; }
    [[nodiscard]] const std::vector<MaterialDescriptor>& QueryMaterials()     const noexcept { return Materials; }

private:
    void AppendSphere(const Vector3& Centre, float Radius, uint32_t Material, uint32_t Rings, uint32_t Segments) noexcept;
    void AppendQuad(const Vector3& A, const Vector3& B, const Vector3& C, const Vector3& D, uint32_t Material, float UvScale) noexcept;
    void AppendTriangle(const Vector3 P[3], const Vector3 N[3], const float Uv[3][2], uint32_t Material) noexcept;

    std::vector<TriangleIndex>      Triangles;
    std::vector<Vector3>            CornerNormals;
    std::vector<MaterialDescriptor> Materials;
};

} // namespace Frontier
