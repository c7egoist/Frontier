//============================================================================================================================================
//                                                          XPBDTYREIMPACTPROOF.CPP                                                           
//============================================================================================================================================
// 📦 Self-checking landing proof for the XPBD soft tyre: the belt must never collapse through its own rim.

#include "../../Frontier/Engine/PhysicalDynamics/Vehicle/XPBDSoftTyre.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <vector>

using namespace Frontier::Vehicle;

namespace
{

// ── what this proof exists for ─────────────────────────────────────────────────────────────────────────────────────────
/// A tyre runs out of sidewall. Past that the carcass is pinched between the road and the rim flange and the
/// rate goes almost vertical. Nothing in the solver modelled that: the radial spoke is tension-only so it
/// carries nothing in compression, the gas is far too soft to stand in for steel, and no constraint named the
/// rim at all. On a landing the belt therefore kept collapsing straight through the wheel — measured at 90 mm
/// INSIDE a 200 mm rim on a 0.6 m drop, folded into a deep V. That fold is the "spiking" seen after a ramp.
///
/// note  The existing XPBDTyreProof only ever settles a static hub at 1/1800 s. Nothing drove the tyre past
///       its sidewall, so nothing could ever have caught this. That gap is what this file closes.
/// tag   xpbd, tyre, landing, bottoming, rim

constexpr float kRimTolerance   = 4.0f;    // [mm] belt may not sit deeper than this inside the flange
constexpr float kFlatTolerance  = 12.0f;   // [mm] spread across the bottomed patch: flat pancake, not a V

int PassCount = 0;
int FailCount = 0;

void Check(const char* name, bool ok, const char* detail)
{
    std::printf("  [%s] %-56s %s\n", ok ? "PASS" : "FAIL", name, detail);
    if (ok) ++PassCount; else ++FailCount;
}

// ── one landing, integrated as a quarter car ───────────────────────────────────────────────────────────────────────────
struct LandingOutcome
{
    float PeakSag       = 0.0f;   // [mm] deepest tread deflection reached
    float InsideRim     = 0.0f;   // [mm] worst incursion past the flange (0 = never breached)
    float PatchSpread   = 0.0f;   // [mm] radius spread across the bottomed patch at peak compression
    float PeakForce     = 0.0f;   // [kN] greatest vertical reaction returned to the car
    int   FlangeSpan    = 0;      // [-]  segments actually resting on the flange at peak compression
    std::vector<float> Profile;   // [mm] mid-ring radius minus rest radius, all segments, at peak compression
};

LandingOutcome RunLanding(bool rimBottoming, float dropHeight, float hubMass)
{
    SoftTyreParameters parameters;
    parameters.RingCount    = 5u;
    parameters.SegmentCount = 64u;
    parameters.RimBottoming = rimBottoming;

    const float step     = 1.0f / 60.0f;          // the shipping rate: VehiclePhysicsThread StepHz
    const float gravity  = 9.81f;
    const float rimLimit = parameters.RimRadius + parameters.RimBottomingClearance;

    XPBDSoftTyre tyre;
    tyre.Build(parameters, {0, 0, parameters.Radius + dropHeight}, Quat{});

    const XPBDSoftTyre::GroundQuery flat =
        [](const Vec3& query, Vec3& surface, Vec3& normal) { surface = {query.x, query.y, 0.0f}; normal = {0, 0, 1}; return true; };

    LandingOutcome outcome;
    float height   = parameters.Radius + dropHeight;
    float velocity = 0.0f;

    for (int frame = 0; frame < static_cast<int>(1.2f * 60.0f); ++frame)
    {
        // ① advance the hub, ② solve the tyre at the new pose, ③ feed its reaction back into the quarter car
        const float previous = height;
        velocity -= gravity * step;
        height   += velocity * step;
        tyre.Step(step, 8u, HubMotion{{0, 0, height}, Quat{}, {0, 0, (height - previous) / step}, 0.0f}, Vec3{0, 0, 0}, flat);
        const float reaction = tyre.Reaction().Force.z;
        velocity += (reaction / (hubMass + parameters.TotalMass)) * step;

        // ④ measure the belt: mid-ring radius about the hub axis, every segment
        const auto& nodes = tyre.Nodes();
        const uint32_t segments = parameters.SegmentCount;
        std::vector<float> radius(segments);
        float smallest = 1.0e9f;
        for (uint32_t s = 0; s < segments; ++s)
        {
            const Vec3 offset = nodes[tyre.Index(2u, s)].Position - Vec3{0, 0, height};
            radius[s] = std::sqrt(offset.x * offset.x + offset.z * offset.z);
            smallest  = std::min(smallest, radius[s]);
        }

        const float sag = (parameters.Radius - smallest) * 1000.0f;
        outcome.InsideRim = std::max(outcome.InsideRim, (rimLimit - smallest) * 1000.0f);
        outcome.PeakForce = std::max(outcome.PeakForce, reaction / 1000.0f);

        // ⑤ at the deepest frame, keep the belt shape and the spread across the bottomed patch
        if (sag > outcome.PeakSag)
        {
            outcome.PeakSag = sag;
            outcome.Profile.assign(segments, 0.0f);
            uint32_t deepest = 0;
            for (uint32_t s = 0; s < segments; ++s)
            {
                outcome.Profile[s] = (radius[s] - parameters.Radius) * 1000.0f;
                if (radius[s] < radius[deepest]) deepest = s;
            }
            float low = 1.0e9f, high = -1.0e9f;
            for (int k = -4; k <= 4; ++k)
            {
                const float r = radius[(deepest + segments + k) % segments];
                low = std::min(low, r); high = std::max(high, r);
            }
            outcome.PatchSpread = (high - low) * 1000.0f;
            outcome.FlangeSpan = 0;
            for (uint32_t s = 0; s < segments; ++s)
                if (radius[s] <= rimLimit + 0.001f) ++outcome.FlangeSpan;
        }
    }

    outcome.InsideRim = std::max(0.0f, outcome.InsideRim);
    return outcome;
}

// ── draw the belt cross-section, before beside after ───────────────────────────────────────────────────────────────────
/// prose  An uncompressed 24-bit BMP, because the proof must stay dependency-free: no zlib, no PNG encoder.
/// out    sheet - BGR canvas, bottom-up rows, written verbatim to disk
void Plot(std::vector<uint8_t>& sheet, int width, int x, int y, uint8_t r, uint8_t g, uint8_t b)
{
    if (x < 0 || y < 0 || x >= width || y >= static_cast<int>(sheet.size()) / (3 * width)) return;
    uint8_t* px = &sheet[static_cast<size_t>(y) * width * 3 + static_cast<size_t>(x) * 3];
    px[0] = b; px[1] = g; px[2] = r;
}

void Line(std::vector<uint8_t>& sheet, int width, int x0, int y0, int x1, int y1, uint8_t r, uint8_t g, uint8_t b)
{
    const int steps = std::max(std::abs(x1 - x0), std::abs(y1 - y0)) + 1;
    for (int i = 0; i <= steps; ++i)
    {
        const float t = static_cast<float>(i) / static_cast<float>(steps);
        for (int ox = -1; ox <= 1; ++ox)
            for (int oy = -1; oy <= 1; ++oy)
                Plot(sheet, width, static_cast<int>(x0 + (x1 - x0) * t) + ox, static_cast<int>(y0 + (y1 - y0) * t) + oy, r, g, b);
    }
}

/// prose  A seven-glyph 5x7 face, just enough to caption the two panels. Rows read top to bottom, and the
///        canvas is bottom-up, so the row index is flipped on the way out.
struct Glyph
{
    char Symbol;
    uint8_t Rows[7];
};

constexpr Glyph kFace[] =
{
    {'A', {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}},
    {'B', {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E}},
    {'E', {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F}},
    {'F', {0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10}},
    {'O', {0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}},
    {'R', {0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11}},
    {'T', {0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04}},
};

void DrawText(std::vector<uint8_t>& sheet, int width, int x, int y, const char* text, int size,
              uint8_t r, uint8_t g, uint8_t b)
{
    for (const char* c = text; *c; ++c, x += 6 * size)
    {
        for (const Glyph& glyph : kFace)
        {
            if (glyph.Symbol != *c) continue;
            for (int row = 0; row < 7; ++row)
                for (int col = 0; col < 5; ++col)
                    if (glyph.Rows[row] & (1 << (4 - col)))
                        for (int sx = 0; sx < size; ++sx)
                            for (int sy = 0; sy < size; ++sy)
                                Plot(sheet, width, x + col * size + sx, y + (6 - row) * size + sy, r, g, b);
        }
    }
}

void DrawPanel(std::vector<uint8_t>& sheet, int width, int originX, const LandingOutcome& outcome,
               const SoftTyreParameters& parameters, bool rimBottoming)
{
    const float scale   = 300.0f;                                     // pixels per metre
    const int   centreX = originX + 300;
    const int   groundY = 70;                                         // bottom-up canvas: ground near the base
    const int   hubY    = groundY + static_cast<int>((parameters.Radius - outcome.PeakSag * 0.001f) * scale);

    for (int x = originX + 20; x < originX + 580; ++x) Plot(sheet, width, x, groundY, 90, 90, 90);

    // the rim: a hard steel circle the belt is not allowed to enter
    const int rimPixels = static_cast<int>(parameters.RimRadius * scale);
    for (int a = 0; a < 720; ++a)
    {
        const float angle = static_cast<float>(a) * 3.14159265f / 360.0f;
        Plot(sheet, width, centreX + static_cast<int>(std::cos(angle) * rimPixels),
                           hubY     + static_cast<int>(std::sin(angle) * rimPixels), 205, 205, 215);
    }

    // the belt, closed over all segments
    const size_t segments = outcome.Profile.size();
    const uint8_t cr = rimBottoming ? 90  : 230;
    const uint8_t cg = rimBottoming ? 210 : 70;
    const uint8_t cb = rimBottoming ? 120 : 70;
    for (size_t s = 0; s < segments; ++s)
    {
        const size_t n = (s + 1) % segments;
        const float a0 = 6.2831853f * static_cast<float>(s) / static_cast<float>(segments);
        const float a1 = 6.2831853f * static_cast<float>(n) / static_cast<float>(segments);
        const float r0 = (parameters.Radius + outcome.Profile[s] * 0.001f) * scale;
        const float r1 = (parameters.Radius + outcome.Profile[n] * 0.001f) * scale;
        Line(sheet, width, centreX + static_cast<int>(std::cos(a0) * r0), hubY + static_cast<int>(std::sin(a0) * r0),
                           centreX + static_cast<int>(std::cos(a1) * r1), hubY + static_cast<int>(std::sin(a1) * r1), cr, cg, cb);
    }
}

void WriteSheet(const char* path, const LandingOutcome& before, const LandingOutcome& after,
                const SoftTyreParameters& parameters)
{
    const int width = 1200, height = 560;
    std::vector<uint8_t> sheet(static_cast<size_t>(width) * height * 3, 24);
    DrawPanel(sheet, width, 0,   before, parameters, false);
    DrawPanel(sheet, width, 600, after,  parameters, true);
    DrawText(sheet, width, 40,  height - 60, "BEFORE", 5, 230, 70,  70);
    DrawText(sheet, width, 640, height - 60, "AFTER",  5, 90,  210, 120);
    for (int y = 0; y < height; ++y) Plot(sheet, width, 600, y, 70, 70, 70);

    const uint32_t pixelBytes = static_cast<uint32_t>(sheet.size());
    const uint32_t fileBytes  = 54u + pixelBytes;
    uint8_t header[54] = {};
    header[0] = 'B'; header[1] = 'M';
    *reinterpret_cast<uint32_t*>(header + 2)  = fileBytes;
    *reinterpret_cast<uint32_t*>(header + 10) = 54u;
    *reinterpret_cast<uint32_t*>(header + 14) = 40u;
    *reinterpret_cast<int32_t*>(header + 18)  = width;
    *reinterpret_cast<int32_t*>(header + 22)  = height;
    *reinterpret_cast<uint16_t*>(header + 26) = 1u;
    *reinterpret_cast<uint16_t*>(header + 28) = 24u;
    *reinterpret_cast<uint32_t*>(header + 34) = pixelBytes;

    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(header), 54);
    out.write(reinterpret_cast<const char*>(sheet.data()), pixelBytes);
}

}   // namespace

// ── main ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
int main()
{
    SoftTyreParameters parameters;
    parameters.RingCount    = 5u;
    parameters.SegmentCount = 64u;
    const float rimLimit = parameters.RimRadius + parameters.RimBottomingClearance;

    std::printf("\n========================================================================\n");
    std::printf(" XPBD soft tyre — landing / rim-bottoming proof\n");
    std::printf(" rest radius %.0f mm | rim %.0f mm | flange limit %.0f mm | 60 Hz, 8 substeps\n",
                static_cast<double>(parameters.Radius * 1000.0f),
                static_cast<double>(parameters.RimRadius * 1000.0f),
                static_cast<double>(rimLimit * 1000.0f));
    std::printf("========================================================================\n\n");

    // ① the constraint must be completely inert on a tyre that is merely standing there
    std::printf("[1] Inert at rest\n");
    {
        XPBDSoftTyre tyre;
        tyre.Build(parameters, {0, 0, parameters.Radius}, Quat{});
        int inside = 0;
        for (const SoftTyreNode& node : tyre.Nodes())
        {
            const Vec3  offset = node.Position - Vec3{0, 0, parameters.Radius};
            const float radius = std::sqrt(offset.x * offset.x + offset.z * offset.z);
            if (radius < rimLimit) ++inside;
        }
        char detail[128];
        std::snprintf(detail, sizeof detail, "%d of %zu nodes inside the flange", inside, tyre.Nodes().size());
        Check("no node sits inside the flange at rest", inside == 0, detail);
    }

    // ② landings of rising severity: the belt may never enter the rim, and must pancake rather than fold
    std::printf("\n[2] Landings — belt must stay outside the rim\n");
    std::printf("     drop    peak sag    inside rim    patch spread    on flange    peak Fz\n");
    LandingOutcome keptBefore, keptAfter;
    for (const float drop : {0.10f, 0.25f, 0.40f, 0.60f, 0.80f})
    {
        const LandingOutcome landing = RunLanding(true, drop, 400.0f);
        std::printf("    %4.0f cm   %7.1f mm   %8.1f mm   %10.1f mm   %7d seg   %6.1f kN\n",
                    static_cast<double>(drop * 100.0f), static_cast<double>(landing.PeakSag),
                    static_cast<double>(landing.InsideRim), static_cast<double>(landing.PatchSpread),
                    landing.FlangeSpan, static_cast<double>(landing.PeakForce));

        char detail[160];
        std::snprintf(detail, sizeof detail, "%.1f mm inside (limit %.1f)", static_cast<double>(landing.InsideRim),
                      static_cast<double>(kRimTolerance));
        char name[96];
        std::snprintf(name, sizeof name, "%.0f cm landing: belt stays out of the rim", static_cast<double>(drop * 100.0f));
        Check(name, landing.InsideRim <= kRimTolerance, detail);

        // 📝 Flatness is only meaningful once the belt actually RESTS on the flange across the whole window the
        //    spread is measured over — nine segments, the deepest and four either side. A tyre that merely
        //    kisses the flange at a few nodes is still a normally curved patch, and demanding a pancake there
        //    would be asserting the wrong physics. The window is fixed, so the test is not self-fulfilling:
        //    a belt folded THROUGH the rim fails it on shape even when it is far deeper than the flange.
        if (landing.FlangeSpan >= 9)
        {
            std::snprintf(detail, sizeof detail, "spread %.1f mm (limit %.1f)", static_cast<double>(landing.PatchSpread),
                          static_cast<double>(kFlatTolerance));
            std::snprintf(name, sizeof name, "%.0f cm landing: bottomed patch is flat, not folded", static_cast<double>(drop * 100.0f));
            Check(name, landing.PatchSpread <= kFlatTolerance, detail);
        }
        if (drop > 0.55f && drop < 0.65f) keptAfter = landing;
    }

    // ③ the same landing with the constraint removed — this is the defect the proof guards against
    std::printf("\n[3] Regression contrast — same 60 cm landing with rim bottoming disabled\n");
    keptBefore = RunLanding(false, 0.60f, 400.0f);
    std::printf("    disabled: peak sag %.1f mm, %.1f mm INSIDE the rim, patch spread %.1f mm\n",
                static_cast<double>(keptBefore.PeakSag), static_cast<double>(keptBefore.InsideRim),
                static_cast<double>(keptBefore.PatchSpread));
    std::printf("    enabled : peak sag %.1f mm, %.1f mm inside the rim, patch spread %.1f mm\n",
                static_cast<double>(keptAfter.PeakSag), static_cast<double>(keptAfter.InsideRim),
                static_cast<double>(keptAfter.PatchSpread));
    Check("the constraint is what prevents the collapse", keptBefore.InsideRim > 20.0f, "disabled run must breach badly");
    Check("enabled run is dramatically shallower", keptAfter.PeakSag < keptBefore.PeakSag - 50.0f, "peak sag cut by >50 mm");

    // ④ the bottoming must also hand the car a genuinely stiffer rate, otherwise nothing stops the descent
    std::printf("\n[4] Bottoming produces a hard stop\n");
    Check("peak reaction rises once the flange is reached", keptAfter.PeakForce > keptBefore.PeakForce, "enabled must report more force");

    WriteSheet("VisualProof/XPBDTyreImpact/XPBDTyreImpactSheet.bmp", keptBefore, keptAfter, parameters);
    std::printf("\n  wrote VisualProof/XPBDTyreImpact/XPBDTyreImpactSheet.bmp  (left: disabled — right: fixed)\n");

    std::printf("\n------------------------------------------------------------------------\n");
    std::printf(" RESULT: %d passed, %d failed\n", PassCount, FailCount);
    std::printf("------------------------------------------------------------------------\n\n");
    return FailCount == 0 ? 0 : 1;
}
