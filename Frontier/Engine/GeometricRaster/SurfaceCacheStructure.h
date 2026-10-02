//============================================================================================================================================
//                                                   SURFACECACHESTRUCTURE.H
//============================================================================================================================================
// 📦 2D Surface Cache atlas storing parameterised surface irradiance, direct illuminant caching, and multi-bounce radiance.

#pragma once

#if defined(_MSC_VER)
    #pragma warning(disable: 4324)                              // Disable structure padding alignment warning under /WX
#endif

#include "GlobalDistanceFieldSpace.h"
#include <vector>
#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                SURFACE CACHE TEXEL
//------------------------------------------------------------------------------------------------------------------------

struct alignas(16) SurfaceCacheTexel
{
    Vector3                 WorldPosition;                      // [m] surface point in world space
    Vector3                 SurfaceNormal;                      // [-] outward surface unit normal
    Vector3                 AlbedoColour;                       // [-] material base colour reflectancy
    Vector3                 DirectRadiance;                     // [W/m²·sr] direct illuminant contribution
    Vector3                 IrradianceBounce;                   // [W/m²·sr] indirect multi-bounce irradiance
    float                   SurfaceRoughness = 0.35f;           // [-] surface roughness parameter
    bool                    IsAllocated      = false;           // [-] occupancy flag in atlas layout
};

//------------------------------------------------------------------------------------------------------------------------
//                                               SURFACE CACHE STRUCTURE
//------------------------------------------------------------------------------------------------------------------------

class SurfaceCacheStructure
{
public:
    SurfaceCacheStructure() noexcept = default;

    SurfaceCacheStructure(uint32_t InAtlasWidth, uint32_t InAtlasHeight) noexcept;

    // Allocates and populates surface cards for the ShaderBall geometry
    void ParameterizeShaderBall(Vector3 Center, float Radius = 0.55f, Vector3 BaseAlbedo = { 0.85f, 0.40f, 0.20f }) noexcept;

    // Evaluates direct sun illuminant across valid surface cache texels using distance field soft shadows
    void UpdateDirectLighting(Vector3 IlluminantDirection,
                              Vector3 IlluminantRadiance,
                              const GlobalDistanceFieldSpace& DistanceField,
                              float LightAngularSize = 0.175f) noexcept;

    // Propagates indirect irradiance by gathering radiance from other surface cache texels via distance field rays
    void PropagateIndirectIrradiance(const GlobalDistanceFieldSpace& DistanceField,
                                     uint32_t RaysPerTexel = 8u) noexcept;

    // Instant O(1) bilinear lookup of surface radiance at hit coordinates
    [[nodiscard]] Vector3 SampleRadiance(Vector3 WorldPosition,
                                         Vector3 SurfaceNormal,
                                         float TextureCoordinateU,
                                         float TextureCoordinateV) const noexcept;

    // Continuous spherical / UV projection lookup when UVs are unknown
    [[nodiscard]] Vector3 SampleRadianceFromWorld(Vector3 WorldPosition,
                                                  Vector3 SurfaceNormal) const noexcept;

    // Accessors
    [[nodiscard]] uint32_t GetAtlasWidth() const noexcept { return AtlasWidth; }
    [[nodiscard]] uint32_t GetAtlasHeight() const noexcept { return AtlasHeight; }
    [[nodiscard]] size_t GetTexelCount() const noexcept { return TexelAtlas.size(); }
    [[nodiscard]] const SurfaceCacheTexel& GetTexel(uint32_t X, uint32_t Y) const noexcept
    {
        return TexelAtlas[static_cast<size_t>(Y) * AtlasWidth + X];
    }

    [[nodiscard]] SurfaceCacheTexel& GetMutableTexel(uint32_t X, uint32_t Y) noexcept
    {
        return TexelAtlas[static_cast<size_t>(Y) * AtlasWidth + X];
    }

private:
    uint32_t                AtlasWidth       = 256u;            // [-] atlas pixel width
    uint32_t                AtlasHeight      = 256u;            // [-] atlas pixel height
    std::vector<SurfaceCacheTexel> TexelAtlas;                  // [-] contiguous surface cache texel storage
};

} // namespace Frontier
