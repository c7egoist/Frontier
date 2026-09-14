//============================================================================================================================================
// 🟠 Scratchpad/SkySpheresSceneTest.cpp — the default outdoor level is built correctly and lit by nothing
//============================================================================================================================================
// Checks the geometry the renderer will actually load, and the one property that makes this level worth having:
// it contains NO light of its own, so a broken celestial path renders black instead of being covered for.

#include "Engine/ContentInterchange/SkySpheresStructure.h"

#include <cstdio>
#include <cmath>
#include <string>
#include <vector>
#include <algorithm>

static int gChecks = 0, gFail = 0;

static void Check(bool ok, const std::string& label, const std::string& detail)
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-52s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
}

static std::string Fixed(double v, int d = 2)
{
    char b[64]; std::snprintf(b, sizeof(b), "%.*f", d, v); return b;
}

int main()
{
    Frontier::SkySpheresStructure scene;
    scene.Construct();

    const auto& triangles = scene.QueryTriangles();
    const auto& normals   = scene.QueryCornerNormals();
    const auto& materials = scene.QueryMaterials();

    Check(!triangles.empty(), "the level has geometry", std::to_string(triangles.size()) + " triangles");
    Check(normals.size() == triangles.size() * 3,
          "every triangle carries three smooth normals",
          std::to_string(normals.size()) + " normals");

    // 🔴 THE DEFINING PROPERTY. No emissive surface anywhere: the sun and sky are the only lights.
    int emissive = 0;
    for (const auto& material : materials)
        for (const auto& slab : material.Slabs)
            if (slab.EmissionLuminance > 0.0f) ++emissive;
    Check(emissive == 0,
          "NO luminaire — the sun and sky are the only lights",
          emissive == 0 ? "0 emissive slabs" : std::to_string(emissive) + " found");

    // Bounds. The ground must be large enough that its edge is not the skyline in shot.
    float lo[3] = { 1e30f, 1e30f, 1e30f }, hi[3] = { -1e30f, -1e30f, -1e30f };
    for (const auto& t : triangles)
    {
        const float v[3][3] = {
            { t.VertexAlphaX, t.VertexAlphaY, t.VertexAlphaZ },
            { t.VertexBetaX,  t.VertexBetaY,  t.VertexBetaZ  },
            { t.VertexGammaX, t.VertexGammaY, t.VertexGammaZ } };
        for (int i = 0; i < 3; ++i)
            for (int c = 0; c < 3; ++c) { lo[c] = std::min(lo[c], v[i][c]); hi[c] = std::max(hi[c], v[i][c]); }
    }
    Check(hi[0] - lo[0] >= 60.0f && hi[1] - lo[1] >= 60.0f,
          "the ground is wide enough that the horizon is the SKY's",
          Fixed(hi[0] - lo[0]) + " x " + Fixed(hi[1] - lo[1]) + " m");

    Check(lo[2] >= -0.001f, "nothing sits below the ground plane", "min Z " + Fixed(lo[2], 4));

    // The three spheres must match the published renders, or the offline images stop being evidence about the
    // live scene. Tallest point = the olive sphere's centre 1.55 + radius 1.55 = 3.10.
    Check(std::fabs(hi[2] - 3.10f) < 0.01f,
          "the tallest point matches the render scene (olive sphere)",
          "max Z " + Fixed(hi[2], 3) + " m");

    Check(materials.size() == 4, "ground plus three spheres", std::to_string(materials.size()) + " materials");

    // All matte: a Lambertian surface reports the colour of its illumination honestly, with no specular
    // highlight to hide a broken sky behind.
    bool allMatte = true;
    for (const auto& material : materials)
        if (material.Slabs[0].SpecularWeight > 0.0f) allMatte = false;
    Check(allMatte, "every surface is matte, so it shows its illumination honestly", "");

    std::printf("\n  %d checks, %d failures\n", gChecks, gFail);
    return gFail == 0 ? 0 : 1;
}
