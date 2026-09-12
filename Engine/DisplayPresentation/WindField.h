//============================================================================================================================================
// 📦 Engine/DisplayPresentation/WindField.h — one wind, read by every medium
//============================================================================================================================================
// Celestial port, step 4. Deliberately built before clouds, fog and precipitation, because all of them advect by
//    this field's integral: a cloud that drifts one way while the rain beneath it falls another is the kind of
//    error that no single system owns and nobody can localise afterwards.
//
// The model, transcribed from the reference demo:
//    • a base flow with speed and bearing, sheared and veered with altitude (Ekman-like: faster and turning
//      clockwise as you climb, because friction with the ground falls away),
//    • a gust envelope, three sines at incommensurate rates so it never audibly loops,
//    • the wind integral: the gusted surface flow accumulated over wall time by Tick — the ONLY clock the
//      march advects by (P2.2), so scrubbing the time of day never moves a cloud,
//    • curl turbulence — the curl of a low-frequency noise field, which is divergence-free by construction and
//      therefore swirls without compressing the air.
//
// ⚠️ THE PERFORMANCE STRUCTURE IS PART OF THE DESIGN, NOT AN OPTIMISATION TO ADD LATER.
//    The source branch's final commit (6c8b1a8) exists because turbulence was called from inside the advection
//    used at every raymarch step. Six noise evaluations per step, ~250 steps per cloud pixel, is roughly 1500
//    extra noise evaluations per pixel — and the fix was not to make the noise cheaper but to move it: the
//    per-step term became trig-only, and the swirl is evaluated ONCE per pixel and reused.
//
//    So this header exposes the split explicitly rather than leaving it to a caller's discipline:
//        SampleStep()   — trig only. Safe inside a march. No noise, ever.
//        SampleSwirl()  — six noise evaluations. ONCE per pixel, and only when Turbulence > 0.
//        Sample()       — the full field, for CPU-side consumers that call it a handful of times per frame.
//    `CheckWindField.sh` asserts the split structurally, because a comment is not a constraint.
//
// Header-only and dependency-free for the reason AtmosphereModel.h and ColourTransfer.h are: this same field has
//    to run in the CPU raster, in the headless proofs, and be transcribed into GLSL, and none of those can share
//    a binary. One definition is what stops the copies drifting.

#pragma once

#include <cmath>
#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                    THE FIELD
//------------------------------------------------------------------------------------------------------------------------

// Named as the reference demo's Wind entity names them, so the eventual panel is a projection of this struct
//    rather than a translation of it.
struct WindSettings
{
    float Speed     = 4.2f;    // [m/s] at the surface — the panel's Force, shown on the Beaufort rose
    float Bearing   = 214.0f;  // [deg] compass bearing the wind blows FROM (pattern moves bearing+180)
    float Shear     = 0.6f;    // [x/km] fractional speed gain per kilometre of altitude
    float Veer      = 18.0f;   // [deg/km] clockwise turn per kilometre (Ekman spiral)
    float Gust      = 0.25f;   // [0..1] gust depth; 0 is a steady flow
    float GustPhase = 0.0f;    // [rad] Tick-advanced at dt*(.35+gust*.4) (REF windStep), so twins agree
    float Turbulence= 0.2f;    // [0..1] curl-noise swirl
    float Steadiness= 1.0f;    // [0..1] ENG extension (no panel knob) — scales gust and turbulence; 1 = REF
    float Integral[2] = { 0.0f, 0.0f };   // [m] Tick-advanced STATE, not a setting: the wall-clock wind
                               // integral (gusted surface flow, accumulated). The ONLY clock the march
                               // advects by — time-of-day never moves a cloud. Proofs construct it at zero.
};

class WindField
{
public:
    //--------------------------------------------------------------------------------------------------------------------
    //                                          THE CHEAP PART — safe in a march
    //--------------------------------------------------------------------------------------------------------------------

    // The base flow at an altitude. Two trig calls and a multiply; no noise. This is the only wind term a
    //    raymarch step may call.
    static void SampleStep(const WindSettings& Wind, float AltitudeMetres, float OutVelocity[3]) noexcept
    {
        constexpr float kPi = 3.14159265358979323846f;
        const float Kilometres = (AltitudeMetres > 0.0f ? AltitudeMetres : 0.0f) * 0.001f;
        const float Speed   = Wind.Speed * (1.0f + Wind.Shear * Kilometres);
        const float Bearing = (Wind.Bearing + Wind.Veer * Kilometres) * kPi / 180.0f;
        // Bearing is a compass angle: 0 is north (+Y), 90 is east (+X). The vector points upwind (back
        //    toward the bearing); the advected pattern moves downwind, opposite — so 214 reads FROM the
        //    south-west, the reference panel's convention.
        OutVelocity[0] = std::sin(Bearing) * Speed;
        OutVelocity[1] = std::cos(Bearing) * Speed;
        OutVelocity[2] = 0.0f;
    }

    // The wind displacement: the wall-clock integral times the altitude factor, the reference windDisp
    //    transcribed exactly (P2.2). The whole medium rides the integral — gusted surface flow accumulated by
    //    Tick, never time-of-day — and each altitude scales it by its own wind over the surface wind, so
    //    shear/veer lean the field progressively the way the reference does.
    //
    //    ⚠️ NEVER the local flow times time-of-day: that older form drifted every altitude by its own wind over
    //    seconds-since-midnight and piled 76 km of altitude-dependent offset across the slab by 7am (measured),
    //    which shredded the sampling grid into horizontal streaks. The uniform-flow-plus-frozen-shear form that
    //    replaced it cured the shredding but froze the shear at a 120 s memory with a ±2-cell clamp — a second
    //    invention between the field and the reference. This form keeps the anti-shredding property the honest
    //    way: the factor varies slowly (shear 0.6/km leans ~40% across a 900 m slab), so at session timescales
    //    the differential stays near a cell and the sampling stays coherent; over very long sessions the shear
    //    keeps accumulating, exactly as the reference ships it. Scrubbing LocalHours moves nothing: there is no
    //    time-of-day anywhere in this function.
    //
    //    Trig-only (one SampleStep), so it is safe inside a march like SampleStep itself. Transcribed as
    //    CloudDriftAt in Shaders/SkyRecords.slang; the sky-cloud proof renders through the twin.
    static void AdvectDrift(const WindSettings& Wind, float AltitudeMetres, float ArtFactor,
                            float OutDrift[2]) noexcept
    {
        float Step[3];
        SampleStep(Wind, AltitudeMetres, Step);
        const float StepLength = std::sqrt(Step[0] * Step[0] + Step[1] * Step[1]);
        const float Factor = StepLength / std::fmax(1e-3f, Wind.Speed);
        OutDrift[0] = Wind.Integral[0] * Factor * ArtFactor;
        OutDrift[1] = Wind.Integral[1] * Factor * ArtFactor;
    }

    // The gust envelope. Three sines at deliberately incommensurate rates (1, 2.31, 4.7) so the pattern never
    //    repeats on a period a viewer can notice. Scalar, so it costs nothing to fold into a step.
    static float SampleGust(const WindSettings& Wind) noexcept
    {
        const float Depth = Wind.Gust * Clamp(Wind.Steadiness, 0.0f, 1.0f);
        return 1.0f + Depth * (0.55f * std::sin(Wind.GustPhase)
                             + 0.30f * std::sin(Wind.GustPhase * 2.31f + 1.7f)
                             + 0.15f * std::sin(Wind.GustPhase * 4.7f + 0.4f));
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                     THE EXPENSIVE PART — once per pixel
    //--------------------------------------------------------------------------------------------------------------------

    // Curl turbulence: six noise evaluations. ⚠️ ONCE PER PIXEL. Calling this per march step is the exact
    //    regression the source branch's last commit fixed, and it costs ~1500 extra noise evaluations per pixel.
    //
    //    Taking the curl of a noise field rather than sampling the noise directly is what makes the result
    //    divergence-free: air swirls without being created or destroyed. Sampling three noise channels as a
    //    velocity would compress and rarefy the medium, and clouds advected by it would visibly bunch up.
    static void SampleSwirl(const WindSettings& Wind, const float Position[3], float Time,
                            float OutSwirl[3]) noexcept
    {
        OutSwirl[0] = OutSwirl[1] = OutSwirl[2] = 0.0f;
        const float Strength = Wind.Turbulence * Clamp(Wind.Steadiness, 0.0f, 1.0f);
        if (Strength <= 0.0f) return;                    // the early-out that makes the guard cheap

        // Transcribed term-by-term from the reference windTurb (P2.2): the lattice point advects the
        //    HORIZONTAL plane with time (x and the horizontal y — never the altitude z, which the old form
        //    drifted upward), and the output mixes the reference's (n1-n2, n2-n3, n3-n1) with the Y-up/Z-up
        //    axis permutation folded in: (Dz-Dy, Dx-Dz, Dy-Dx). Still a curl, still divergence-free.
        const float Q[3] = { Position[0] * 0.02f + Time * 0.05f,
                             Position[1] * 0.02f + Time * 0.03f,
                             Position[2] * 0.02f };
        constexpr float E = 0.5f;

        // Central differences along each axis: the six evaluations.
        const float Dx = ValueNoise(Q[0] + E, Q[1], Q[2]) - ValueNoise(Q[0] - E, Q[1], Q[2]);
        const float Dy = ValueNoise(Q[0], Q[1] + E, Q[2]) - ValueNoise(Q[0], Q[1] - E, Q[2]);
        const float Dz = ValueNoise(Q[0], Q[1], Q[2] + E) - ValueNoise(Q[0], Q[1], Q[2] - E);

        const float Scale = Strength * Wind.Speed * 0.9f;
        OutSwirl[0] = (Dz - Dy) * Scale;
        OutSwirl[1] = (Dx - Dz) * Scale;
        OutSwirl[2] = (Dy - Dx) * Scale;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                              THE WHOLE FIELD
    //--------------------------------------------------------------------------------------------------------------------

    // Base × gust + swirl. For CPU consumers that call it a handful of times a frame — a particle spawner, a
    //    panel readout, the proofs. A raymarch must NOT call this: it contains SampleSwirl.
    static void Sample(const WindSettings& Wind, const float Position[3], float Time, float OutVelocity[3]) noexcept
    {
        float Base[3];
        SampleStep(Wind, Position[2], Base);
        const float Gust = SampleGust(Wind);
        float Swirl[3];
        SampleSwirl(Wind, Position, Time, Swirl);
        for (int C = 0; C < 3; ++C) OutVelocity[C] = Base[C] * Gust + Swirl[C];
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                                  READOUTS
    //--------------------------------------------------------------------------------------------------------------------

    // Beaufort force from a speed in m/s. The panel's wind rose shows this beside the number, and it is a real
    //    scale with published thresholds rather than a linear remap.
    static uint32_t BeaufortForce(float MetresPerSecond) noexcept
    {
        static constexpr float kThresholds[12] = { 0.3f, 1.6f, 3.4f, 5.5f, 8.0f, 10.8f,
                                                   13.9f, 17.2f, 20.8f, 24.5f, 28.5f, 32.7f };
        for (uint32_t Force = 0; Force < 12u; ++Force)
            if (MetresPerSecond < kThresholds[Force]) return Force;
        return 12u;
    }

    static const char* BeaufortName(uint32_t Force) noexcept
    {
        static const char* kNames[13] = { "Calm", "Light air", "Light breeze", "Gentle breeze",
                                          "Moderate breeze", "Fresh breeze", "Strong breeze", "Near gale",
                                          "Gale", "Strong gale", "Storm", "Violent storm", "Hurricane" };
        return kNames[Force > 12u ? 12u : Force];
    }

private:
    static float Clamp(float V, float Lo, float Hi) noexcept { return V < Lo ? Lo : (V > Hi ? Hi : V); }

    static float Hash(float X, float Y, float Z) noexcept
    {
        // hash13, twinned from VolumetricMedia (same op order): the swirl's lattice hash.
        float Px = X * 0.1031f, Py = Y * 0.1031f, Pz = Z * 0.1031f;
        Px -= std::floor(Px); Py -= std::floor(Py); Pz -= std::floor(Pz);
        const float D = Px * (Pz + 31.32f) + Py * (Py + 31.32f) + Pz * (Px + 31.32f);
        Px += D; Py += D; Pz += D;
        const float H = (Px + Py) * Pz;
        return H - std::floor(H);
    }

    // Trilinear value noise. Matched to the demo's vnoise so the CPU and GPU twins agree; the proof checks the
    //    field itself rather than this helper, but a different noise would drift the two apart. [0,1] like the
    //    reference — the old [-1,1] range doubled every central difference, so the swirl ran 2x hot; this
    //    range fix restores the reference magnitude for free.
    static float ValueNoise(float X, float Y, float Z) noexcept
    {
        const float Ix = std::floor(X), Iy = std::floor(Y), Iz = std::floor(Z);
        const float Fx = X - Ix, Fy = Y - Iy, Fz = Z - Iz;
        const float Ux = Fx * Fx * (3.0f - 2.0f * Fx);
        const float Uy = Fy * Fy * (3.0f - 2.0f * Fy);
        const float Uz = Fz * Fz * (3.0f - 2.0f * Fz);

        const float N000 = Hash(Ix, Iy, Iz),             N100 = Hash(Ix + 1, Iy, Iz);
        const float N010 = Hash(Ix, Iy + 1, Iz),         N110 = Hash(Ix + 1, Iy + 1, Iz);
        const float N001 = Hash(Ix, Iy, Iz + 1),         N101 = Hash(Ix + 1, Iy, Iz + 1);
        const float N011 = Hash(Ix, Iy + 1, Iz + 1),     N111 = Hash(Ix + 1, Iy + 1, Iz + 1);

        const float X00 = N000 + (N100 - N000) * Ux, X10 = N010 + (N110 - N010) * Ux;
        const float X01 = N001 + (N101 - N001) * Ux, X11 = N011 + (N111 - N011) * Ux;
        const float Y0  = X00 + (X10 - X00) * Uy,    Y1  = X01 + (X11 - X01) * Uy;
        return Y0 + (Y1 - Y0) * Uz;
    }
};

} // namespace Frontier
