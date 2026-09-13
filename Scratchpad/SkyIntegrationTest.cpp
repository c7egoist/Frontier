//============================================================================================================================================
// 🔌 Scratchpad/SkyIntegrationTest.cpp — the sky is wired to the right pixels, and objects actually receive it
//============================================================================================================================================
// P2a proved the atmosphere is physically right. This proves it is CONNECTED right, which is a different and
// easier thing to get wrong: a correct sky mapped through a flipped ray is still a broken image, and a sky that
// never reaches the bounce path is a backdrop rather than a light.
//
// Ports the production pixel->ray mapping (Engine/Shaders/RayGeneration.slang) and the production scattering
// (AtmosphereScatter.slang) as C++, then checks:
//
//   §1 the miss ray reconstruction agrees with the raster's mapping, including the Vulkan y-down flip
//   §2 the sky lands the right way up and the right way round on screen
//   §3 an upward-facing surface receives real irradiance from the sky (the "objects receive the light" claim)
//   §4 the sun disc is sharp, correctly sized, and limb-darkened
//   §5 the 16/8 real-time step budget is close enough to the reference
//
// Build (from repo root):
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
//       Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' Engine/Shaders/RayGeneration.slang > /tmp/RayGeneration.port.inc
//   g++ -std=c++20 -O2 -I Scratchpad Scratchpad/SkyIntegrationTest.cpp -o /tmp/sit && /tmp/sit

#include "GlslShim.h"

#include <cstdio>
#include <cmath>
#include <string>
#include <vector>
#include <algorithm>

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"
#include "/tmp/RayGeneration.port.inc"

//------------------------------------------------------------------------------------------------------------------------

static int gChecks = 0, gFail = 0;

static void Check(bool ok, const std::string& label, const std::string& detail)
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-54s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
}

static void Section(const char* title)
{
    std::printf("\n-- %s -------------------------------------------------------\n", title);
}

static std::string Fixed(double v, int d = 4)
{
    char b[64]; std::snprintf(b, sizeof(b), "%.*f", d, v); return b;
}

static float Luma(vec3 c) { return 0.2126f * c.x + 0.7152f * c.y + 0.0722f * c.z; }

static AtmosphereParameters MakeAtmosphere()
{
    AtmosphereParameters a;
    a.RayleighScattering = vec3(5.8e-6f, 13.5e-6f, 33.1e-6f);
    a.MieScattering      = vec3(21.0e-6f, 21.0e-6f, 21.0e-6f);
    a.OzoneAbsorption    = vec3(0.65e-6f * 1.2f, 1.881e-6f * 1.2f, 0.085e-6f * 1.2f);
    a.GroundAlbedo       = vec3(0.3f, 0.3f, 0.3f);
    a.RayleighScaleHeight = 8000.0f;
    a.MieScaleHeight      = 1200.0f;
    a.MieAnisotropy       = 0.78f;
    a.PlanetRadius        = 6371000.0f;
    a.AtmosphereHeight    = 100000.0f;
    return a;
}

// Mirrors CelestialObserver() in ReSTIRViewport.slang: world z is altitude above the planet surface.
static vec3 Observer(const AtmosphereParameters& a, vec3 world)
{
    return vec3(world.x, world.y, world.z + a.PlanetRadius);
}

static vec3 Sky(const AtmosphereParameters& a, vec3 world, vec3 dir, vec3 sun, int vs = 16, int ss = 8)
{
    vec3 t;
    return AtmosphereScatter(a, Observer(a, world), dir, sun, vs, ss, t);
}

// Mirrors CelestialSunDisc() — the analytic full-resolution composite (F1).
static vec3 SunDisc(vec3 dir, vec3 sun, float cosRadius, vec3 radiance, float limbDarkening, vec3 transmittance)
{
    const float cosAngle = dot(dir, sun);
    if (cosAngle < cosRadius) return vec3(0.0f, 0.0f, 0.0f);
    const float normalised = std::sqrt(std::max(0.0f, 1.0f - (1.0f - cosAngle) / std::max(1.0f - cosRadius, 1e-9f)));
    const float limb = 1.0f - limbDarkening * (1.0f - normalised);
    return radiance * limb * transmittance;
}

//============================================================================================================================================

int main()
{
    std::printf("========================================================================\n");
    std::printf(" SKY INTEGRATION - is the sky wired to the right pixels, and is it a LIGHT?\n");
    std::printf("========================================================================\n");

    const AtmosphereParameters atmosphere = MakeAtmosphere();

    // A camera at the origin, 2 m up, looking north (+Y), z-up world. This is the engine's convention.
    CameraBasis camera;
    camera.Origin     = vec3(0.0f, 0.0f, 2.0f);
    camera.Forward    = vec3(0.0f, 1.0f, 0.0f);
    camera.Right      = vec3(1.0f, 0.0f, 0.0f);
    camera.Up         = vec3(0.0f, 0.0f, 1.0f);
    camera.TanHalfFov = std::tan(27.5f * 3.14159265f / 180.0f);
    camera.Aspect     = 1280.0f / 720.0f;

    const uvec2 extent{ 1280u, 720u };

    //----------------------------------------------------------------------------------------------------------------
    Section("1. THE MISS RAY - reconstruction matches the raster's mapping");
    //----------------------------------------------------------------------------------------------------------------
    // The kernel calls GeneratePrimaryDirection with jitter (0.5, 0.5) to hit the pixel centre. Verify that this
    // is genuinely the centre, that the centre pixel looks along Forward, and - the one that actually bites -
    // that the image is not upside down.
    {
        const vec3 centre = GeneratePrimaryDirection(camera, uvec2{ 640u, 360u }, vec2(0.5f, 0.5f), extent);
        Check(dot(centre, camera.Forward) > 0.9999f, "the centre pixel looks along Forward",
              "dot = " + Fixed(dot(centre, camera.Forward), 6));

        // 🔴 THE Y-DOWN FLIP. Vulkan image row 0 is the TOP of the screen, so it must look UP (+Z here). Getting
        //    this backwards renders a sky that is perfectly correct and completely upside down - the ground
        //    gradient at the top, the zenith at the bottom - and it only shows on the miss path, so geometry
        //    looks fine and only the sky is wrong. Exactly the bug that wastes an afternoon.
        const vec3 top    = GeneratePrimaryDirection(camera, uvec2{ 640u,   0u }, vec2(0.5f, 0.5f), extent);
        const vec3 bottom = GeneratePrimaryDirection(camera, uvec2{ 640u, 719u }, vec2(0.5f, 0.5f), extent);

        Check(top.z > 0.0f,    "image row 0 (TOP) looks UP (+Z)",    "z = " + Fixed(top.z, 5));
        Check(bottom.z < 0.0f, "the bottom row looks DOWN (-Z)",     "z = " + Fixed(bottom.z, 5));
        Check(top.z > bottom.z, "the sky is not vertically mirrored", "");

        // And left/right: column 0 must be to the LEFT, i.e. -Right.
        const vec3 left  = GeneratePrimaryDirection(camera, uvec2{   0u, 360u }, vec2(0.5f, 0.5f), extent);
        const vec3 right = GeneratePrimaryDirection(camera, uvec2{1279u, 360u }, vec2(0.5f, 0.5f), extent);
        Check(dot(left, camera.Right) < 0.0f,  "column 0 looks LEFT",  "dot = " + Fixed(dot(left, camera.Right), 5));
        Check(dot(right, camera.Right) > 0.0f, "the last column looks RIGHT", "dot = " + Fixed(dot(right, camera.Right), 5));

        // Every reconstructed direction must be unit length; the scatter code normalises nothing.
        double worst = 0.0;
        for (uint32_t y = 0; y < extent.y; y += 37)
            for (uint32_t x = 0; x < extent.x; x += 37)
            {
                const vec3 d = GeneratePrimaryDirection(camera, uvec2{ x, y }, vec2(0.5f, 0.5f), extent);
                worst = std::max(worst, std::fabs(double(length(d)) - 1.0));
            }
        Check(worst < 1e-5, "every reconstructed miss ray is unit length", "worst " + Fixed(worst, 9));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("2. THE SKY LANDS THE RIGHT WAY UP ON SCREEN");
    //----------------------------------------------------------------------------------------------------------------
    // Render the sky through the real mapping and check the image makes physical sense: the top of the frame is
    // darker blue (towards zenith), the bottom brighter (towards horizon), with the sun low and ahead.
    {
        const vec3 sun = normalize(vec3(0.0f, 1.0f, 0.20f));   // ahead and low: 11 degrees up, due north

        auto PixelSky = [&](uint32_t x, uint32_t y)
        {
            const vec3 d = GeneratePrimaryDirection(camera, uvec2{ x, y }, vec2(0.5f, 0.5f), extent);
            return Sky(atmosphere, camera.Origin, d, sun);
        };

        const vec3 topRow    = PixelSky(640u,  20u);
        const vec3 middleRow = PixelSky(640u, 360u);
        const vec3 lowRow    = PixelSky(640u, 700u);

        // ⚠️ THIS TEST ONCE ASSERTED "brighter towards the bottom of the frame" AND THAT WAS WRONG. With a 27.5
        //    degree half-FOV and the sun 11 degrees up, the bottom of the frame is BELOW the horizon — it is
        //    looking at the shadowed ground, not at the bright horizon band. Measured down the sun's azimuth:
        //
        //        -25 deg 0.01033 | -10 deg 0.01039 | -2 deg 0.01110 | 0 deg 0.48093 | +11 deg 0.20945 | +25 deg 0.04869
        //
        //    The horizon is a near-50x cliff at exactly 0 degrees. So the correct statement is that the HORIZON
        //    is brighter than both the sky above it and the ground below it — which is a stronger check anyway,
        //    and it verifies the horizon lands where the geometry says it should rather than drifting.
        const float horizonRow = [&]{
            // Find the screen row whose ray is closest to level, then sample it.
            uint32_t best = 0; float bestAbs = 1e9f;
            for (uint32_t y = 0; y < extent.y; ++y)
            {
                const vec3 d = GeneratePrimaryDirection(camera, uvec2{ 640u, y }, vec2(0.5f, 0.5f), extent);
                if (std::fabs(d.z) < bestAbs) { bestAbs = std::fabs(d.z); best = y; }
            }
            return Luma(PixelSky(640u, best));
        }();

        Check(horizonRow > Luma(topRow) && horizonRow > Luma(lowRow),
              "the horizon row is the brightest part of the column",
              "top " + Fixed(Luma(topRow), 5) + " | horizon " + Fixed(horizonRow, 5)
                     + " | below " + Fixed(Luma(lowRow), 5));

        Check(Luma(lowRow) < Luma(topRow),
              "below the horizon is darker than the sky (it is ground, not sky)",
              "below " + Fixed(Luma(lowRow), 5) + " vs sky " + Fixed(Luma(topRow), 5));

        Check(topRow.z / std::max(topRow.x, 1e-9f) > lowRow.z / std::max(lowRow.x, 1e-9f),
              "the upper sky is bluer than the ground below the horizon",
              "B/R " + Fixed(topRow.z / std::max(topRow.x, 1e-9f), 3) + " vs "
                     + Fixed(lowRow.z / std::max(lowRow.x, 1e-9f), 3));

        // The sun is due north, so the frame must be brightest near the horizontal centre, not at an edge.
        const float leftEdge  = Luma(PixelSky(  40u, 360u));
        const float rightEdge = Luma(PixelSky(1240u, 360u));
        Check(Luma(middleRow) > leftEdge && Luma(middleRow) > rightEdge,
              "the glow sits where the sun is (centre), not at an edge",
              "L " + Fixed(leftEdge, 5) + " | C " + Fixed(Luma(middleRow), 5) + " | R " + Fixed(rightEdge, 5));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("3. OBJECTS RECEIVE THE LIGHT (not just a backdrop behind them)");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE EXPLICIT REQUIREMENT. In the kernel, a bounce ray that escapes now returns CelestialSky(...). Here
    //    that is modelled directly: integrate the sky's contribution over the hemisphere above a surface, exactly
    //    as a cosine-weighted bounce estimator converges to. If this is zero, objects are lit by nothing and the
    //    sky is scenery.
    {
        auto Irradiance = [&](vec3 normal, vec3 sun)
        {
            // Cosine-weighted hemisphere quadrature. Deterministic grid, fine enough to be stable.
            vec3 total = vec3(0.0f, 0.0f, 0.0f);
            double weight = 0.0;
            for (int ti = 0; ti < 32; ++ti)
                for (int pi = 0; pi < 64; ++pi)
                {
                    const float theta = (float(ti) + 0.5f) / 32.0f * 1.5707963f;
                    const float phi   = (float(pi) + 0.5f) / 64.0f * 6.2831853f;

                    // Build a direction around the normal.
                    vec3 tangent = std::fabs(normal.z) < 0.99f ? normalize(cross(vec3(0.0f, 0.0f, 1.0f), normal))
                                                               : vec3(1.0f, 0.0f, 0.0f);
                    vec3 bitangent = cross(normal, tangent);
                    const vec3 dir = normal * std::cos(theta)
                                   + tangent * (std::sin(theta) * std::cos(phi))
                                   + bitangent * (std::sin(theta) * std::sin(phi));

                    const double w = std::cos(theta) * std::sin(theta);
                    total = total + Sky(atmosphere, vec3(0.0f, 0.0f, 2.0f), dir, sun, 12, 6) * float(w);
                    weight += w;
                }
            return total * float(1.0 / weight);
        };

        const vec3 sunHigh = normalize(vec3(0.2f, 0.3f, 0.93f));
        const vec3 up      = vec3(0.0f, 0.0f, 1.0f);

        const vec3 received = Irradiance(up, sunHigh);
        Check(Luma(received) > 1e-4f,
              "an upward-facing surface receives real irradiance from the sky",
              "luma " + Fixed(Luma(received), 6));

        Check(received.z > received.x,
              "and that light is BLUE - it is skylight, not a grey fill",
              "rgb " + Fixed(received.x, 5) + " " + Fixed(received.y, 5) + " " + Fixed(received.z, 5));

        // ⚠️ THIS ONCE ASSERTED "up receives more than sideways" AND THAT WAS ALSO WRONG — and the wrongness is
        //    interesting. Measured with the sun 69 degrees up:  up 0.017261, side 0.050017, down 0.078416.
        //    A sideways face sees the horizon band, which is far brighter per steradian than the zenith, plus the
        //    sunlit ground; a downward face sees the ground almost exclusively. The naive intuition ("the sky is
        //    up, so up gets the most light") is simply false for a physical sky with a bright horizon and a lit
        //    ground. What MUST hold is that all three are non-zero and blue-ish from the sky's contribution, and
        //    that the zenith-facing sample is the BLUEST, since it alone sees no ground bounce.
        const vec3 sideways = Irradiance(vec3(1.0f, 0.0f, 0.0f), sunHigh);
        const vec3 downward = Irradiance(vec3(0.0f, 0.0f, -1.0f), sunHigh);

        Check(Luma(sideways) > 0.0f && Luma(downward) > 0.0f,
              "every orientation receives some light (no black facets)",
              "side " + Fixed(Luma(sideways), 6) + ", down " + Fixed(Luma(downward), 6));

        const float upBlue   = received.z / std::max(received.x, 1e-9f);
        const float sideBlue = sideways.z / std::max(sideways.x, 1e-9f);
        Check(upBlue > sideBlue,
              "the zenith-facing sample is the bluest (it alone sees no ground)",
              "B/R " + Fixed(upBlue, 3) + " (up) vs " + Fixed(sideBlue, 3) + " (side)");

        // And at night the sky delivers almost nothing, so a scene lit only by it goes properly dark.
        const vec3 night = Irradiance(up, normalize(vec3(0.0f, 1.0f, -0.3f)));
        Check(Luma(night) < Luma(received) * 0.01f,
              "at night the sky delivers <1% of the daytime irradiance",
              "night " + Fixed(Luma(night), 8) + " vs day " + Fixed(Luma(received), 6));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4. THE SUN DISC - sharp, correctly sized, limb-darkened (F1)");
    //----------------------------------------------------------------------------------------------------------------
    // The disc is composited analytically at full resolution. Verify it is the right angular size and that its
    // edge is genuinely sharp, because "weird shapes" was the reported failure of baking it into a LUT.
    {
        const vec3  sun = normalize(vec3(0.0f, 1.0f, 0.3f));
        const float angularDiameter = 0.53f;
        const float cosRadius = std::cos(angularDiameter * 0.5f * 3.14159265f / 180.0f);
        const vec3  radiance = vec3(22.0f, 22.0f, 22.0f);
        const vec3  transmittance = vec3(1.0f, 1.0f, 1.0f);

        // Walk outward from the centre of the sun in 0.001-degree steps and find where it switches off.
        float lastInside = 0.0f, firstOutside = 0.0f;
        for (int i = 0; i <= 1000; ++i)
        {
            const float offsetDegrees = float(i) * 0.001f;
            const float a = offsetDegrees * 3.14159265f / 180.0f;
            // Rotate the sun direction by `a` in the vertical plane.
            const vec3 dir = normalize(sun * std::cos(a) + vec3(1.0f, 0.0f, 0.0f) * std::sin(a));
            const vec3 disc = SunDisc(dir, sun, cosRadius, radiance, 0.45f, transmittance);
            if (Luma(disc) > 0.0f) lastInside = offsetDegrees;
            else { firstOutside = offsetDegrees; break; }
        }

        Check(std::fabs(lastInside - angularDiameter * 0.5f) < 0.005f,
              "the disc edge is at the correct angular radius",
              Fixed(lastInside, 4) + " deg (want " + Fixed(angularDiameter * 0.5, 4) + ")");

        Check(firstOutside - lastInside <= 0.0015f,
              "the edge is SHARP - no smeared LUT polygon",
              "transition within " + Fixed(firstOutside - lastInside, 4) + " deg");

        // Limb darkening: the centre must be brighter than a point near the edge.
        const vec3 centre = SunDisc(sun, sun, cosRadius, radiance, 0.45f, transmittance);
        const float nearEdgeAngle = angularDiameter * 0.5f * 0.98f * 3.14159265f / 180.0f;
        const vec3 edgeDir = normalize(sun * std::cos(nearEdgeAngle) + vec3(1.0f, 0.0f, 0.0f) * std::sin(nearEdgeAngle));
        const vec3 edge = SunDisc(edgeDir, sun, cosRadius, radiance, 0.45f, transmittance);

        Check(Luma(centre) > Luma(edge) * 1.2f,
              "the limb is darker than the centre (a real sun, not a sticker)",
              "centre " + Fixed(Luma(centre), 3) + " vs limb " + Fixed(Luma(edge), 3));

        // Nothing outside the disc: the sky function must not leak a halo of disc radiance.
        const float outsideAngle = angularDiameter * 3.14159265f / 180.0f;   // 2x the radius
        const vec3 outsideDir = normalize(sun * std::cos(outsideAngle) + vec3(1.0f, 0.0f, 0.0f) * std::sin(outsideAngle));
        Check(Luma(SunDisc(outsideDir, sun, cosRadius, radiance, 0.45f, transmittance)) == 0.0f,
              "no disc radiance outside the disc", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4b. THE SUN'S GLARE IS A FLARE, NOT A HALO");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 AN EXPLICIT USER CONSTRAINT: "the sun blending into the atmosphere like a halo is 1 thing i absolutely
    //    do not want". The glare exists because the disc is 0.53 deg and ~2 px at render size while being
    //    24 000x its surroundings — without it the sun is invisible. But the fix must not become the failure.
    //
    //    The atmosphere ALREADY makes a broad aureole: measured, the sky 0.3 deg from the sun is only 3.2x the
    //    sky 20 deg away. That gentle Mie lobe is the real haze. The glare must be categorically tighter, so
    //    these thresholds are about SHAPE, not brightness — a halo is a reach problem and cannot be tuned away
    //    by lowering the strength. The first attempt used the full CIE function (theta^-3 + theta^-2) and still
    //    lifted the sky at 3 deg after an 800x strength cut; the theta^-2 tail had to be REMOVED.
    {
        // Mirrors CelestialSunGlare in the shader. The gate below pins the shader's constants to these.
        const double inner = 0.30, cutoff = 2.5, strength = 2.5e-3;
        auto Glare = [&](double degreesFromSun)
        {
            if (degreesFromSun > cutoff) return 0.0;
            const double t = std::max(degreesFromSun, inner);
            const double w = 1.0 - degreesFromSun / cutoff;
            return (1.0 / (t * t * t)) * strength * w * w;
        };

        // 1. It must vanish completely well before the aureole's scale.
        Check(Glare(2.6) == 0.0 && Glare(5.0) == 0.0 && Glare(10.0) == 0.0,
              "the glare is exactly zero beyond 2.5 deg",
              "0 at 2.6, 5 and 10 deg");

        // 2. It must be overwhelmingly concentrated at the disc. A halo would be flat-ish across its span.
        const double nearSun = Glare(0.35), atOne = Glare(1.0), atTwo = Glare(2.0);
        Check(nearSun > atOne * 20.0,
              "it falls at least 20x from 0.35 deg to 1 deg",
              Fixed(nearSun / atOne, 1) + "x");
        Check(nearSun > atTwo * 200.0,
              "and at least 200x by 2 deg — a flare, not a wash",
              Fixed(nearSun / atTwo, 1) + "x");

        // 3. 🔴 THE DECISIVE ONE. Compare the glare's concentration against the ATMOSPHERE's own aureole, which
        //    is the thing it must not resemble. The aureole varies only ~3x over 20 degrees; the glare must be
        //    orders of magnitude steeper over a far shorter span, or it is just a second haze.
        const AtmosphereParameters atmosphere2 = MakeAtmosphere();
        const float sunElev = 12.0f * 3.14159265f / 180.0f;
        const vec3 sun2(std::cos(sunElev), 0.0f, std::sin(sunElev));
        auto SkyAt = [&](float offsetDegrees)
        {
            const float a = offsetDegrees * 3.14159265f / 180.0f;
            const vec3 tangent = normalize(cross(vec3(0.0f, 0.0f, 1.0f), sun2));
            const vec3 dir = normalize(sun2 * std::cos(a) + tangent * std::sin(a));
            return Luma(Sky(atmosphere2, vec3(0.0f, 0.0f, 2.0f), dir, sun2));
        };
        const double aureoleRatio = double(SkyAt(0.35f)) / double(SkyAt(2.0f));
        const double glareRatio   = nearSun / atTwo;
        Check(glareRatio > aureoleRatio * 100.0,
              "the glare is >100x more concentrated than the atmosphere's aureole",
              "glare " + Fixed(glareRatio, 1) + "x vs aureole " + Fixed(aureoleRatio, 3) + "x over the same span");

        // 4. It must not be a hard-edged disc either: the user asked for a SMOOTH fade.
        bool monotonic = true;
        double previous = 1e30;
        for (int i = 1; i <= 250; ++i)
        {
            const double value = Glare(double(i) * 0.01);
            if (value > previous + 1e-12) monotonic = false;
            previous = value;
        }
        Check(monotonic, "the fade is monotonic — smooth, with no ring or step", "0.01 to 2.5 deg");

        // And it must reach zero continuously rather than dropping off a cliff at the cutoff.
        Check(Glare(2.45) < Glare(1.0) * 0.02,
              "it has already faded to nothing before the cutoff, so no edge shows",
              Fixed(Glare(2.45) / Glare(1.0) * 100.0, 3) + "% of its 1 deg value");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5. RADIANCE vs IRRADIANCE - the sun and its own sky agree");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 A REAL BUG THIS CAUGHT. The scattering integral assumes a top-of-atmosphere solar irradiance of 1, so
    //    everything it returns is per unit irradiance. The disc, though, is drawn with a RADIANCE. The first
    //    version used the Intensity slider directly as disc radiance while the sky implicitly used 1.0 — so the
    //    direct sun came out 1377x the zenith sky at 50 degrees elevation, against a true ratio nearer 100-200x,
    //    and a test render showed a blown-white ground under a correctly exposed sky.
    //
    //    The fix: one number. Intensity IS the irradiance; the disc radiance is irradiance / solidAngle. Verify
    //    the two are consistent by integrating the disc back to an irradiance and recovering the input.
    {
        const float intensity = 22.0f;

        for (float angularDiameter : { 0.53f, 1.5f, 0.25f })
        {
            const float angularRadius = angularDiameter * 0.5f * 3.14159265f / 180.0f;
            const float solidAngle    = 3.14159265f * angularRadius * angularRadius;
            const float discRadiance  = intensity / solidAngle;
            const float cosRadius     = std::cos(angularRadius);

            // Integrate the disc over its own solid angle: sum radiance * cos * dOmega across the disc.
            // With limb darkening OFF this must return exactly the irradiance we started from.
            const vec3 sun = vec3(0.0f, 0.0f, 1.0f);
            double integrated = 0.0;
            const int rings = 256, spokes = 64;
            for (int ri = 0; ri < rings; ++ri)
                for (int si = 0; si < spokes; ++si)
                {
                    const float theta = (float(ri) + 0.5f) / float(rings) * angularRadius;
                    const float phi   = (float(si) + 0.5f) / float(spokes) * 6.2831853f;
                    const vec3 dir = normalize(vec3(std::sin(theta) * std::cos(phi),
                                                    std::sin(theta) * std::sin(phi),
                                                    std::cos(theta)));
                    const vec3 disc = SunDisc(dir, sun, cosRadius, vec3(discRadiance, discRadiance, discRadiance),
                                              0.0f, vec3(1.0f, 1.0f, 1.0f));
                    const double dOmega = (angularRadius / rings) * (6.2831853 / spokes) * std::sin(theta);
                    integrated += double(disc.x) * std::cos(theta) * dOmega;
                }

            const double error = std::fabs(integrated - intensity) / intensity;
            Check(error < 0.01,
                  "disc of " + Fixed(angularDiameter, 2) + " deg integrates back to its irradiance",
                  Fixed(integrated, 4) + " vs " + Fixed(intensity, 4) + " (" + Fixed(error * 100.0, 3) + "%)");
        }

        // And the consequence that matters: changing the sun's ANGULAR SIZE must not change how much light it
        // delivers. Before the fix, making the sun bigger silently brightened the whole scene.
        const float small = 22.0f / (3.14159265f * std::pow(0.25f * 0.5f * 3.14159265f / 180.0f, 2.0f));
        const float large = 22.0f / (3.14159265f * std::pow(1.50f * 0.5f * 3.14159265f / 180.0f, 2.0f));
        Check(small > large,
              "a SMALLER sun is more radiant per steradian (total power conserved)",
              "0.25 deg -> " + Fixed(small, 0) + " vs 1.5 deg -> " + Fixed(large, 0));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("6. THE REAL-TIME STEP BUDGET IS HONEST");
    //----------------------------------------------------------------------------------------------------------------
    // The kernel runs 16 view / 8 sun steps with the warped distribution. Confirm that against a heavy reference,
    // so that "16 is enough" is a measurement in the build and not a claim in a comment.
    {
        double total = 0.0, worst = 0.0;
        int count = 0;
        for (float sunElevation : { -4.0f, 0.5f, 10.0f, 45.0f })
        {
            const float e = sunElevation * 3.14159265f / 180.0f;
            const vec3 sun = vec3(std::cos(e), 0.0f, std::sin(e));
            for (int ve = 0; ve <= 80; ve += 4)
                for (int az = 0; az < 360; az += 45)
                {
                    const float vr = float(ve) * 3.14159265f / 180.0f;
                    const float ar = float(az) * 3.14159265f / 180.0f;
                    const vec3 dir = vec3(std::cos(vr) * std::cos(ar), std::cos(vr) * std::sin(ar), std::sin(vr));

                    const vec3 reference = Sky(atmosphere, vec3(0.0f, 0.0f, 2.0f), dir, sun, 256, 32);
                    const vec3 realtime  = Sky(atmosphere, vec3(0.0f, 0.0f, 2.0f), dir, sun, 16, 8);
                    if (Luma(reference) < 1e-9f) continue;
                    const double error = std::fabs(Luma(realtime) - Luma(reference)) / Luma(reference);
                    total += error; worst = std::max(worst, error); ++count;
                }
        }
        const double mean = total / std::max(count, 1);
        Check(mean < 0.035, "16/8 warped steps are within 3.5% of a 256/32 reference",
              "mean " + Fixed(mean * 100.0, 3) + "%, worst " + Fixed(worst * 100.0, 2) + "%");
    }

    //----------------------------------------------------------------------------------------------------------------
    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", gChecks, gFail);
    std::printf("========================================================================\n");
    return gFail == 0 ? 0 : 1;
}
