//============================================================================================================================================
// 📷 Scratchpad/LensFlareTest.cpp — three flare elements, three tiers, and none of them may become a halo
//============================================================================================================================================
// Compiles the SHIPPING shader's flare functions (extracted by ExtractCelestialPort.sh) and measures them.
//
// 🔴 THE STANDING CONSTRAINT THIS FILE DEFENDS. The user's words: "the sun blending into the atmosphere like a
//    halo is 1 thing i absolutely do not want". Every off-the-shelf flare library ships a halo element; this one
//    deliberately does not. But a halo can also arrive by ACCIDENT — a streak that is too thick, a starburst with
//    no gaps between its spikes, or a ghost that happens to sit on top of the sun would each read as one.
//
//    So the tests below are about SHAPE, not brightness, because a halo is a shape problem and cannot be tuned
//    away by lowering an intensity. Each element is checked for the specific property that makes it structurally
//    incapable of reading as a ring of haze around the sun:
//
//      §2 the streak is HORIZONTAL      — anisotropic, so it cannot be radially symmetric
//      §3 the ghosts are ELSEWHERE      — they live across the frame, not around the sun
//      §4 the starburst has GAPS        — spikes with darkness between them; haze has no gaps
//      §5 tiers are presets, and the elements combine freely
//
// Build (from repo root):
//   bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc
//   sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
//       Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
//   g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/LensFlareTest.cpp -o /tmp/lft && /tmp/lft

#include "GlslShim.h"

#include "Engine/DisplayPresentation/CelestialStructure.h"
#include "Engine/DisplayPresentation/CelestialSolver.h"
#include "Engine/DisplayPresentation/CelestialUniform.h"

#include <cstdio>
#include <cstring>
#include <cmath>
#include <string>
#include <vector>
#include <algorithm>

struct CelestialRecord;
static CelestialRecord* gCelestialRecordPtr = nullptr;
#define gCelestialRecord (*gCelestialRecordPtr)

using Frontier::kCelestialFlagEnabled;
using Frontier::kCelestialFlagMoon;
using Frontier::kCelestialFlagStars;
// The extracted port now carries CelestialMedia too, which reads the volume flags.
using Frontier::kCelestialFlagFog;
using Frontier::kCelestialFlagLocalFog;
using Frontier::kCelestialFlagLocalCloud;

#define FRONTIER_CPU_PORT
#include "/tmp/AtmosphereScatter.port.inc"
#include "/tmp/CelestialPort.inc"

//------------------------------------------------------------------------------------------------------------------------

static int gChecks = 0, gFail = 0;

static void Check(bool ok, const std::string& label, const std::string& detail)
{
    ++gChecks;
    if (!ok) ++gFail;
    std::printf("  %-4s %-56s %s\n", ok ? "PASS" : "FAIL", label.c_str(), detail.c_str());
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

// The camera basis used throughout: looking straight at the sun, frame level.
static vec3 gForward, gRight, gUp, gSun;

// A direction offset from the sun by (horizontal, vertical) degrees in the camera's frame.
static vec3 Offset(float horizontalDegrees, float verticalDegrees)
{
    const float h = horizontalDegrees * 3.14159265f / 180.0f;
    const float v = verticalDegrees   * 3.14159265f / 180.0f;
    return normalize(gSun + gRight * std::tan(h) + gUp * std::tan(v));
}

static CelestialRecord BuildRecord(const Frontier::CelestialStructure& settings)
{
    const Frontier::CelestialSolution solution = Frontier::SolveCelestial(settings);
    Frontier::CelestialUniform packed{};
    Frontier::PackCelestialUniform(settings, solution, 0.0, packed);
    CelestialRecord record;
    std::memcpy(&record, &packed, sizeof(record));
    return record;
}

//============================================================================================================================================

int main()
{
    std::printf("========================================================================\n");
    std::printf(" LENS FLARE - three elements, three tiers, and not one of them a halo\n");
    std::printf("========================================================================\n");

    Frontier::CelestialStructure settings{};
    settings.Observation.LocalHours = 17.0f;

    CelestialRecord record = BuildRecord(settings);
    gCelestialRecordPtr = &record;

    gSun     = record.SunDirectionAndCosRadius.xyz();
    gForward = gSun;
    gRight   = normalize(cross(gSun, vec3(0.0f, 0.0f, 1.0f)));
    gUp      = cross(gRight, gSun);

    const vec3 white(1.0f, 1.0f, 1.0f);

    //----------------------------------------------------------------------------------------------------------------
    Section("1. THE ELEMENTS EXIST AND RESPOND TO THEIR SETTINGS");
    //----------------------------------------------------------------------------------------------------------------
    {
        Check((uint32_t(record.FlareStreakAndFlags.w) & 3u) == 3u,
              "the Medium default enables streak + ghosts",
              "mask " + std::to_string(uint32_t(record.FlareStreakAndFlags.w)));

        Check(Luma(CelestialFlareStreak(record, Offset(4.0f, 0.0f), gRight, gUp)) > 0.0f,
              "the streak produces light beside the sun", "");
        Check(Luma(CelestialFlareGhosts(record, Offset(-14.0f, 0.0f), gForward)) >= 0.0f,
              "the ghost function evaluates without blowing up", "");
        Check(Luma(CelestialFlareStarburst(record, Offset(3.0f, 0.0f), gRight, gUp)) >= 0.0f,
              "the starburst function evaluates", "");

        // Disabling must actually disable — a master switch that only dims is a bug people work around forever.
        Frontier::CelestialStructure off = settings;
        off.LensFlare.Enabled = false;
        CelestialRecord offRecord = BuildRecord(off);
        Check(uint32_t(offRecord.FlareStreakAndFlags.w) == 0u,
              "flare.enabled = false clears every element bit", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("2. THE STREAK IS HORIZONTAL - it cannot be radially symmetric");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 A halo is the same in every direction. An anamorphic streak is the opposite: strongly elongated along
    //    one axis. This is the property that makes it structurally safe, so it is measured as an ANISOTROPY
    //    RATIO rather than as a brightness.
    {
        const float along  = Luma(CelestialFlareStreak(record, Offset(3.0f, 0.0f), gRight, gUp));
        const float across = Luma(CelestialFlareStreak(record, Offset(0.0f, 3.0f), gRight, gUp));

        Check(across <= 0.0f || along > across * 50.0f,
              "at 3 deg the streak is >50x brighter sideways than vertically",
              across <= 0.0f ? "vertical is exactly zero" : Fixed(along / across, 1) + "x");

        // It must also stay thin: a streak that is degrees thick is a smear, and a smear is a halo.
        float firstDarkDegrees = -1.0f;
        for (int i = 1; i <= 200; ++i)
        {
            const float v = float(i) * 0.05f;
            if (Luma(CelestialFlareStreak(record, Offset(0.0f, v), gRight, gUp)) < along * 0.05f)
            { firstDarkDegrees = v; break; }
        }
        Check(firstDarkDegrees > 0.0f && firstDarkDegrees < 2.0f,
              "it fades to 5% within 2 deg vertically",
              Fixed(firstDarkDegrees, 2) + " deg");

        // And it must reach: a streak shorter than it is thick would just be a blob on the sun.
        const float tip = Luma(CelestialFlareStreak(record, Offset(13.0f, 0.0f), gRight, gUp));
        Check(tip > 0.0f, "and still reaches 13 deg horizontally", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("3. THE GHOSTS ARE ELSEWHERE - never a ring around the sun");
    //----------------------------------------------------------------------------------------------------------------
    // Ghosts are mirrored through the frame centre, so with the camera pointed AT the sun they land behind the
    // viewer's centre of frame and away from the sun. If any ghost energy piled up near the sun it would read as
    // exactly the halo that is banned.
    {
        // Sweep a ring at several radii around the sun and find the worst ghost contribution.
        float worstNearSun = 0.0f;
        for (float radius : { 0.5f, 1.0f, 2.0f, 4.0f })
            for (int a = 0; a < 24; ++a)
            {
                const float angle = float(a) / 24.0f * 6.2831853f;
                const vec3 dir = Offset(radius * std::cos(angle), radius * std::sin(angle));
                worstNearSun = std::max(worstNearSun, Luma(CelestialFlareGhosts(record, dir, gForward)));
            }

        Check(worstNearSun <= 1e-6f,
              "no ghost energy anywhere within 4 deg of the sun",
              "worst " + Fixed(worstNearSun, 8));

        // ⚠️ With the camera looking exactly at the sun, every ghost collapses onto the frame centre, which is
        //    the sun — so a degenerate implementation could hide its failure in this configuration. Tilt the
        //    camera so the sun is off-axis, which is the case that actually occurs, and check again.
        const vec3 tiltedForward = normalize(gSun - gRight * 0.35f);
        float worstTilted = 0.0f;
        for (float radius : { 0.5f, 1.0f, 2.0f, 4.0f })
            for (int a = 0; a < 24; ++a)
            {
                const float angle = float(a) / 24.0f * 6.2831853f;
                const vec3 dir = Offset(radius * std::cos(angle), radius * std::sin(angle));
                worstTilted = std::max(worstTilted, Luma(CelestialFlareGhosts(record, dir, tiltedForward)));
            }
        Check(worstTilted <= 1e-6f,
              "still nothing near the sun with the sun off-axis",
              "worst " + Fixed(worstTilted, 8));

        // And they must exist SOMEWHERE, or the element is silently dead.
        float found = 0.0f;
        for (int i = -60; i <= 60; ++i)
            found = std::max(found, Luma(CelestialFlareGhosts(record, Offset(float(i) * 0.8f, 0.0f), tiltedForward)));
        Check(found > 0.0f, "but the ghosts do appear across the frame", "peak " + Fixed(found, 5));
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4. THE STARBURST HAS GAPS - spikes, not a glow");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE DEFINING DIFFERENCE between a starburst and a halo: at a fixed radius from the sun, a halo is
    //    uniform all the way round, and a starburst alternates bright and dark. Measure the contrast around a
    //    circle — that number IS the distinction, and no brightness setting can fake it.
    {
        Frontier::CelestialStructure high = settings;
        Frontier::ApplyLensFlareStyle(high.LensFlare, Frontier::LensFlareStyleCategory::Vintage);
        CelestialRecord burst = BuildRecord(high);
        gCelestialRecordPtr = &burst;

        const float radius = 3.0f;
        float brightest = 0.0f, darkest = 1e30f;
        for (int a = 0; a < 360; ++a)
        {
            const float angle = float(a) / 360.0f * 6.2831853f;
            const vec3 dir = Offset(radius * std::cos(angle), radius * std::sin(angle));
            const float value = Luma(CelestialFlareStarburst(burst, dir, gRight, gUp));
            brightest = std::max(brightest, value);
            darkest   = std::min(darkest, value);
        }

        Check(brightest > 0.0f, "the starburst produces spikes at 3 deg", "peak " + Fixed(brightest, 6));
        Check(darkest < brightest * 0.05f,
              "and the gaps between them are <5% of the spikes",
              "darkest " + Fixed(darkest, 8) + " vs peak " + Fixed(brightest, 6));

        // Blade count must actually drive the spike count, or the setting is decorative. An even-bladed iris
        // gives N spikes; count the maxima around the circle and confirm.
        auto CountSpikes = [&](int blades)
        {
            Frontier::CelestialStructure bladed = high;
            bladed.LensFlare.StarburstBlades = blades;
            CelestialRecord r = BuildRecord(bladed);
            gCelestialRecordPtr = &r;

            std::vector<float> ring(720);
            for (int a = 0; a < 720; ++a)
            {
                const float angle = float(a) / 720.0f * 6.2831853f;
                ring[size_t(a)] = Luma(CelestialFlareStarburst(r, Offset(2.0f * std::cos(angle), 2.0f * std::sin(angle)),
                                                               gRight, gUp));
            }
            float peak = 0.0f;
            for (float v : ring) peak = std::max(peak, v);
            int count = 0;
            for (int a = 0; a < 720; ++a)
            {
                const float previous = ring[size_t((a + 719) % 720)];
                const float current  = ring[size_t(a)];
                const float next     = ring[size_t((a + 1) % 720)];
                if (current > peak * 0.5f && current >= previous && current > next) ++count;
            }
            return count;
        };

        const int sixBlades = CountSpikes(6);
        Check(sixBlades == 6, "6 blades give 6 spikes", std::to_string(sixBlades) + " found");

        // ⚠️ An ODD blade count gives TWICE as many spikes. That is real photographic behaviour — a 7-bladed
        //    iris makes a 14-point star — and it falls out of the cos(N*theta/2) term rather than being coded
        //    as a special case. If this ever reads 7, someone has "fixed" the maths into being wrong.
        const int sevenBlades = CountSpikes(7);
        Check(sevenBlades == 14, "7 blades give 14 spikes (odd irises double)",
              std::to_string(sevenBlades) + " found");

        gCelestialRecordPtr = &record;
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5. STYLES ARE WHOLE CAMERAS, AND ELEMENTS STILL COMBINE");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 WHY STYLES REPLACED QUALITY TIERS. The old selector was Off/Low/Medium/High, which claims each step
    //    costs more. It does not: the starburst ("High") is a few trig ops with no loop, while the ghosts
    //    ("Medium") loop over every ghost — the starburst is the CHEAPER of the two. The ladder was ranking how
    //    elaborate things look and calling it performance. A style dropdown says what it actually is.
    {
        auto Apply = [&](Frontier::LensFlareStyleCategory style)
        {
            Frontier::CelestialStructure t = settings;
            Frontier::ApplyLensFlareStyle(t.LensFlare, style);
            return t;
        };
        auto MaskOf = [&](const Frontier::CelestialStructure& t)
        {
            return uint32_t(BuildRecord(t).FlareStreakAndFlags.w);
        };

        // 🔴 THE DEFAULT STYLE AND THE DEFAULT MASK MUST AGREE. A default-constructed struct never calls
        //    ApplyLensFlareStyle, so if the mask defaults to 0 while the style says "Cinematic", the settings
        //    claim a flare and render none. That is exactly what happened: the composite test measured 0.00000.
        Frontier::CelestialStructure fresh{};
        Frontier::CelestialStructure applied{};
        Frontier::ApplyLensFlareStyle(applied.LensFlare, applied.LensFlare.Style);
        Check(fresh.LensFlare.ElementMask == applied.LensFlare.ElementMask,
              "the default mask matches the default style",
              "fresh " + std::to_string(fresh.LensFlare.ElementMask) + " vs applied "
                       + std::to_string(applied.LensFlare.ElementMask));

        Check(MaskOf(Apply(Frontier::LensFlareStyleCategory::Off)) == 0u, "Off draws nothing", "");
        Check(MaskOf(Apply(Frontier::LensFlareStyleCategory::Cinematic)) == 3u,
              "Cinematic is streak + ghosts", "mask 3");
        Check(MaskOf(Apply(Frontier::LensFlareStyleCategory::Vintage)) == 7u,
              "Vintage is all three", "mask 7");
        Check(MaskOf(Apply(Frontier::LensFlareStyleCategory::Clean)) == 4u,
              "Clean is the starburst alone", "mask 4");

        // 🔴 THE POINT OF STYLES OVER TIERS: each is a different CAMERA, not the same camera with more switches
        //    on. Two presets that share an element must still shape it differently, or the dropdown is just a
        //    relabelled quality ladder.
        const Frontier::CelestialStructure vintage = Apply(Frontier::LensFlareStyleCategory::Vintage);
        const Frontier::CelestialStructure clean   = Apply(Frontier::LensFlareStyleCategory::Clean);

        Check(vintage.LensFlare.StarburstBlades != clean.LensFlare.StarburstBlades,
              "Vintage and Clean are different irises",
              std::to_string(vintage.LensFlare.StarburstBlades) + " vs "
                  + std::to_string(clean.LensFlare.StarburstBlades) + " blades");

        // Which means they produce a visibly different number of spikes — 6 against 14.
        Check(vintage.LensFlare.StarburstBlades % 2 == 0 && clean.LensFlare.StarburstBlades % 2 == 1,
              "so one gives N spikes and the other 2N", "6-point vs 14-point");

        Check(clean.LensFlare.StarburstSharpness > vintage.LensFlare.StarburstSharpness * 2.0f,
              "Clean's spikes are far harder than Vintage's soft burst",
              Fixed(vintage.LensFlare.StarburstSharpness, 0) + " vs " + Fixed(clean.LensFlare.StarburstSharpness, 0));

        const Frontier::CelestialStructure cinematic = Apply(Frontier::LensFlareStyleCategory::Cinematic);
        Check(cinematic.LensFlare.StreakTintB > cinematic.LensFlare.StreakTintR * 2.0f
           && vintage.LensFlare.StreakTintR > vintage.LensFlare.StreakTintB,
              "Cinematic streaks cool, Vintage streaks warm", "opposite tints");

        Check(vintage.LensFlare.GhostCount > cinematic.LensFlare.GhostCount,
              "uncoated Vintage glass ghosts more than coated Cinematic",
              std::to_string(vintage.LensFlare.GhostCount) + " vs " + std::to_string(cinematic.LensFlare.GhostCount));

        // ⚠️ A PRESET MUST NOT INHERIT FROM WHICHEVER PRESET CAME BEFORE IT. Apply Vintage (8 ghosts, warm) then
        //    Clean on the SAME struct, and Clean must look exactly like a fresh Clean.
        Frontier::CelestialStructure sequence = settings;
        Frontier::ApplyLensFlareStyle(sequence.LensFlare, Frontier::LensFlareStyleCategory::Vintage);
        Frontier::ApplyLensFlareStyle(sequence.LensFlare, Frontier::LensFlareStyleCategory::Clean);
        Check(sequence.LensFlare.StarburstBlades == clean.LensFlare.StarburstBlades
           && sequence.LensFlare.GhostCount      == clean.LensFlare.GhostCount
           && sequence.LensFlare.StreakTintB     == clean.LensFlare.StreakTintB,
              "switching styles leaves no residue from the previous one", "");

        // Custom is the one that must leave everything alone, or hand-tuning is impossible.
        Frontier::CelestialStructure hand = settings;
        hand.LensFlare.GhostCount = 11;
        hand.LensFlare.StarburstBlades = 9;
        Frontier::ApplyLensFlareStyle(hand.LensFlare, Frontier::LensFlareStyleCategory::Custom);
        Check(hand.LensFlare.GhostCount == 11 && hand.LensFlare.StarburstBlades == 9,
              "Custom preserves hand-tuned values", "11 ghosts, 9 blades kept");

        // 🔴 AND THE COMBINING REQUIREMENT SURVIVES THE CHANGE. ElementMask still overrides, so a preset plus an
        //    extra element is legal without inventing another preset for it.
        Frontier::CelestialStructure combined = Apply(Frontier::LensFlareStyleCategory::Cinematic);
        combined.LensFlare.ElementMask = Frontier::LensFlareElementStreak | Frontier::LensFlareElementStarburst;
        Check(MaskOf(combined) == 5u,
              "streak + starburst without ghosts is still reachable", "mask 5");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("6. THE WHOLE FLARE, AND ITS OCCLUSION");
    //----------------------------------------------------------------------------------------------------------------
    {
        const vec3 visible  = CelestialLensFlare(record, Offset(5.0f, 0.0f), gForward, gRight, gUp, white, 1.0f);
        const vec3 hidden   = CelestialLensFlare(record, Offset(5.0f, 0.0f), gForward, gRight, gUp, white, 0.0f);

        Check(Luma(visible) > 0.0f, "the composite flare produces light", Fixed(Luma(visible), 5));
        Check(Luma(hidden) <= Luma(visible) * 0.01f,
              "and a fully occluded sun kills it",
              Fixed(Luma(hidden), 8));

        // Occlusion must be GRADUAL: the sun has angular size and is hidden progressively, so a hard cut pops.
        const vec3 half = CelestialLensFlare(record, Offset(5.0f, 0.0f), gForward, gRight, gUp, white, 0.5f);
        const double ratio = double(Luma(half)) / std::max(double(Luma(visible)), 1e-12);
        Check(ratio > 0.4 && ratio < 0.6,
              "half-occluded gives roughly half the flare",
              Fixed(ratio, 3) + "x");

        // 🔴 AND THE STANDING RULE, CHECKED ON THE WHOLE COMPOSITE RATHER THAN ELEMENT BY ELEMENT. Sample a ring
        //    close to the sun where a halo would live, in the HIGH tier with everything on, and require the
        //    variation around that ring to be large — a halo is uniform, anything structured is not.
        Frontier::CelestialStructure high = settings;
        Frontier::ApplyLensFlareStyle(high.LensFlare, Frontier::LensFlareStyleCategory::Vintage);
        CelestialRecord all = BuildRecord(high);
        gCelestialRecordPtr = &all;

        float brightest = 0.0f, darkest = 1e30f;
        for (int a = 0; a < 180; ++a)
        {
            const float angle = float(a) / 180.0f * 6.2831853f;
            const vec3 dir = Offset(2.5f * std::cos(angle), 2.5f * std::sin(angle));
            const float value = Luma(CelestialLensFlare(all, dir, gForward, gRight, gUp, white, 1.0f));
            brightest = std::max(brightest, value);
            darkest   = std::min(darkest, value);
        }
        Check(darkest < brightest * 0.2f,
              "at 2.5 deg the flare is structured, not a uniform ring",
              "darkest " + Fixed(darkest, 8) + " vs brightest " + Fixed(brightest, 6));

        gCelestialRecordPtr = &record;
    }

    //----------------------------------------------------------------------------------------------------------------
    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", gChecks, gFail);
    std::printf("========================================================================\n");
    return gFail == 0 ? 0 : 1;
}
