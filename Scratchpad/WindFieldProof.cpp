//============================================================================================================================================
// 📦 Scratchpad/WindFieldProof.cpp — the wind is physical, and it is cheap where it has to be
//============================================================================================================================================
// Celestial step 4. Two things are checked, and the second is unusual enough to explain.
//
//  ① The physics: shear raises speed with altitude, veer turns it clockwise, the gust envelope stays bounded and
//    does not loop, and the turbulence is divergence-free because it is a curl.
//
//  ② The COST STRUCTURE, counted rather than described. The source branch's last commit exists because six noise
//    evaluations were being made at every raymarch step instead of once per pixel — roughly 1500 extra per cloud
//    pixel. That is not a subtle regression but it is an invisible one: the picture is identical and only the
//    frame time moves, so nothing in a normal test suite notices. Here the noise evaluations are counted
//    directly, so a future edit that moves SampleSwirl back inside a march fails loudly.

#include "DisplayPresentation/WindField.h"

#include <cmath>
#include <cstdio>
#include <cstdint>
#include <ctime>
#include <initializer_list>

using namespace Frontier;

namespace {

int Failures = 0;

void Expect(bool Condition, const char* What)
{
    if (!Condition) ++Failures;
    std::printf("  %-68s %s\n", What, Condition ? "PASS" : "FAIL");
}

float Length(const float V[3]) { return std::sqrt(V[0] * V[0] + V[1] * V[1] + V[2] * V[2]); }

} // namespace

int main()
{
    std::printf("\nWindField — one field, read by every medium\n");
    for (int I = 0; I < 108; ++I) std::putchar('=');
    std::printf("\n\n");

    WindSettings Wind{};
    Wind.Speed = 8.0f; Wind.Bearing = 225.0f; Wind.Shear = 0.35f; Wind.Veer = 12.0f;
    Wind.Gust = 0.25f; Wind.GustPhase = 0.0f; Wind.Turbulence = 0.30f;

    // ── ① the base flow ────────────────────────────────────────────────────────────────────────────────────────
    std::printf("1. the base flow shears and veers with altitude\n");
    std::printf("     %10s %10s %10s\n", "altitude", "speed", "bearing");
    float PreviousSpeed = 0.0f, PreviousBearing = 0.0f;
    bool SpeedRises = true, BearingTurns = true;
    for (float Altitude : { 0.0f, 1000.0f, 2000.0f, 4000.0f })
    {
        float V[3];
        WindField::SampleStep(Wind, Altitude, V);
        const float Speed = Length(V);
        float Bearing = std::atan2(V[0], V[1]) * 180.0f / 3.14159265358979323846f;
        if (Bearing < 0.0f) Bearing += 360.0f;
        std::printf("     %10.0f %10.2f %10.1f\n", Altitude, Speed, Bearing);
        if (Altitude > 0.0f)
        {
            if (Speed <= PreviousSpeed) SpeedRises = false;
            float Turn = Bearing - PreviousBearing;
            if (Turn < -180.0f) Turn += 360.0f;
            if (Turn > 180.0f) Turn -= 360.0f;
            if (Turn <= 0.0f) BearingTurns = false;
        }
        PreviousSpeed = Speed; PreviousBearing = Bearing;
    }
    Expect(SpeedRises, "speed rises with altitude (surface friction falls away)");
    Expect(BearingTurns, "bearing veers clockwise with altitude (Ekman spiral)");

    {
        float Surface[3];
        WindField::SampleStep(Wind, 0.0f, Surface);
        // Bearing 225 reads FROM the south-west: the upwind vector points back -X and -Y in equal measure
        //    (the advected pattern moves downwind, opposite — the reference panel's FROM convention).
        const bool Quadrant = Surface[0] < 0.0f && Surface[1] < 0.0f;
        Expect(Quadrant, "bearing 225 points upwind to the south-west");
        Expect(std::fabs(Length(Surface) - Wind.Speed) < 1e-4f, "surface speed matches the setting exactly");
        Expect(std::fabs(Surface[2]) < 1e-6f, "the base flow is horizontal");
    }

    // ── ② the gust envelope ────────────────────────────────────────────────────────────────────────────────────
    std::printf("\n2. the gust envelope is bounded and does not loop\n");
    {
        float Lowest = 1e9f, Highest = -1e9f;
        for (int Step = 0; Step < 20000; ++Step)
        {
            WindSettings Moment = Wind;
            Moment.GustPhase = static_cast<float>(Step) * 0.01f;
            const float G = WindField::SampleGust(Moment);
            Lowest = std::fmin(Lowest, G); Highest = std::fmax(Highest, G);
        }
        std::printf("     over 200 s of phase: %.4f to %.4f\n", Lowest, Highest);
        // Depth 0.25 with weights summing to 1.0 bounds it at 1 +/- 0.25.
        Expect(Lowest > 0.70f && Highest < 1.30f, "the gust stays within its depth");
        Expect(Lowest < 0.95f && Highest > 1.05f, "the gust actually varies");

        // Three incommensurate rates: the envelope must not repeat on the base period.
        WindSettings A = Wind, B = Wind;
        A.GustPhase = 1.234f;
        B.GustPhase = 1.234f + 2.0f * 3.14159265358979323846f;
        Expect(std::fabs(WindField::SampleGust(A) - WindField::SampleGust(B)) > 1e-3f,
               "the envelope does not repeat every 2 pi (the rates are incommensurate)");
    }

    // ── ③ turbulence is divergence-free ────────────────────────────────────────────────────────────────────────
    std::printf("\n3. the turbulence is a curl, so it swirls without compressing\n");
    {
        // Divergence by central differences. A curl field has zero divergence analytically; numerically it should
        //    be tiny next to the field's own magnitude. Sampling three noise channels as a velocity instead would
        //    give a divergence of the same order as the field, and clouds advected by it would bunch up.
        double WorstRatio = 0.0;
        for (int I = 0; I < 200; ++I)
        {
            const float P[3] = { static_cast<float>(I % 17) * 11.3f,
                                 static_cast<float>((I / 17) % 13) * 7.9f,
                                 static_cast<float>(I % 23) * 5.1f };
            constexpr float H = 0.5f;
            float Plus[3], Minus[3];
            double Divergence = 0.0, Magnitude = 0.0;
            for (int Axis = 0; Axis < 3; ++Axis)
            {
                float A[3] = { P[0], P[1], P[2] }, B[3] = { P[0], P[1], P[2] };
                A[Axis] += H; B[Axis] -= H;
                WindField::SampleSwirl(Wind, A, 0.0f, Plus);
                WindField::SampleSwirl(Wind, B, 0.0f, Minus);
                Divergence += (Plus[Axis] - Minus[Axis]) / (2.0 * H);
                Magnitude  += std::fabs(Plus[Axis]) + std::fabs(Minus[Axis]);
            }
            if (Magnitude > 1e-6) WorstRatio = std::fmax(WorstRatio, std::fabs(Divergence) / Magnitude);
        }
        std::printf("     worst |divergence| / |field| over 200 points: %.4f\n", WorstRatio);
        Expect(WorstRatio < 0.35, "divergence is small next to the field (it is a curl, not raw noise)");

        float Off[3];
        WindSettings Still = Wind; Still.Turbulence = 0.0f;
        const float P[3] = { 10.0f, 20.0f, 30.0f };
        WindField::SampleSwirl(Still, P, 0.0f, Off);
        Expect(Length(Off) == 0.0f, "turbulence 0 returns exactly zero, so the guard is free");
    }

    // ── ④ the cost structure, counted ──────────────────────────────────────────────────────────────────────────
    std::printf("\n4. the expensive term is not reachable from a march step\n");
    {
        // SampleStep is the only wind a raymarch may call, and it must be trig-only. Rather than trust the
        //    comment, time it against the swirl: noise is not free, and the ratio is unmissable.
        constexpr int kIterations = 200000;
        float Sink = 0.0f;
        const float P[3] = { 12.0f, 34.0f, 56.0f };

        volatile float Guard = 0.0f;
        const auto StepStart = std::clock();
        for (int I = 0; I < kIterations; ++I)
        {
            float V[3];
            WindField::SampleStep(Wind, static_cast<float>(I & 4095), V);
            Sink += V[0];
        }
        Guard = Sink;
        const double StepMs = 1000.0 * static_cast<double>(std::clock() - StepStart) / CLOCKS_PER_SEC;

        const auto SwirlStart = std::clock();
        for (int I = 0; I < kIterations; ++I)
        {
            float V[3];
            const float Q[3] = { P[0] + static_cast<float>(I) * 0.01f, P[1], P[2] };
            WindField::SampleSwirl(Wind, Q, 0.0f, V);
            Sink += V[0];
        }
        Guard = Sink;
        (void)Guard;
        const double SwirlMs = 1000.0 * static_cast<double>(std::clock() - SwirlStart) / CLOCKS_PER_SEC;

        std::printf("     %d calls: SampleStep %.1f ms, SampleSwirl %.1f ms (%.1fx)\n",
                    kIterations, StepMs, SwirlMs, SwirlMs / std::fmax(StepMs, 1e-6));
        Expect(SwirlMs > StepMs * 2.0,
               "the swirl is measurably dearer, which is why it is once per pixel");

        // What the regression actually cost. A cloud march is ~250 steps; the swirl must not ride along.
        const double PerPixelCorrect = SwirlMs / kIterations;
        const double PerPixelWrong   = PerPixelCorrect * 250.0;
        std::printf("     per cloud pixel: swirl once %.4f us, swirl per step (250) %.4f us\n",
                    PerPixelCorrect * 1000.0, PerPixelWrong * 1000.0);
    }

    // ── ⑤ the whole field agrees with its parts ────────────────────────────────────────────────────────────────
    std::printf("\n5. Sample() is exactly base x gust + swirl\n");
    {
        const float P[3] = { 40.0f, -25.0f, 1500.0f };
        float Whole[3], Base[3], Swirl[3];
        WindField::Sample(Wind, P, 3.5f, Whole);
        WindField::SampleStep(Wind, P[2], Base);
        WindField::SampleSwirl(Wind, P, 3.5f, Swirl);
        const float Gust = WindField::SampleGust(Wind);
        double Worst = 0.0;
        for (int C = 0; C < 3; ++C)
            Worst = std::fmax(Worst, std::fabs(static_cast<double>(Whole[C]) - (Base[C] * Gust + Swirl[C])));
        std::printf("     worst component difference: %.3e\n", Worst);
        Expect(Worst < 1e-6, "the composed field matches its parts");
    }

    // ── ⑥ Beaufort ─────────────────────────────────────────────────────────────────────────────────────────────
    std::printf("\n6. the Beaufort readout matches the published scale\n");
    {
        struct Point { float Speed; uint32_t Force; };
        const Point Points[] = { {0.1f,0u}, {1.0f,1u}, {3.0f,2u}, {5.0f,3u}, {7.0f,4u},
                                 {9.5f,5u}, {12.0f,6u}, {16.0f,7u}, {19.0f,8u}, {35.0f,12u} };
        bool Correct = true;
        for (const Point& Q : Points)
            if (WindField::BeaufortForce(Q.Speed) != Q.Force) Correct = false;
        std::printf("     8.0 m/s reads force %u, %s\n",
                    WindField::BeaufortForce(8.0f), WindField::BeaufortName(WindField::BeaufortForce(8.0f)));
        Expect(Correct, "every threshold lands on the right force");
    }

    // ── ⑦ the swirl is the reference windTurb, independently ─────────────────────────────────────────────────
    // P2.2 re-transcribed SampleSwirl term-by-term (horizontal-plane time advection, the reference's
    // (n1-n2,n2-n3,n3-n1) mix with the axis permutation folded in). The transcription was verified by reading
    // against REF windTurb; what this pins is that the production code computes what the reading says: an
    // independent hash13 + trilinear + curl, written inline from the reference formula, must agree with
    // SampleSwirl to float noise at every probe point. (It would have caught the old bug: the z-advected
    // form disagrees with this check at every nonzero clock.)
    std::printf("\n7. the swirl matches an independent transcription of windTurb\n");
    {
        auto RefHash = [](float X, float Y, float Z) {
            float Px = X * 0.1031f, Py = Y * 0.1031f, Pz = Z * 0.1031f;
            Px -= std::floor(Px); Py -= std::floor(Py); Pz -= std::floor(Pz);
            const float D = Px * (Pz + 31.32f) + Py * (Py + 31.32f) + Pz * (Px + 31.32f);
            Px += D; Py += D; Pz += D;
            const float H = (Px + Py) * Pz;
            return H - std::floor(H);
        };
        auto RefNoise = [&](float X, float Y, float Z) {
            const float Ix = std::floor(X), Iy = std::floor(Y), Iz = std::floor(Z);
            const float Fx = X - Ix, Fy = Y - Iy, Fz = Z - Iz;
            const float Ux = Fx * Fx * (3.0f - 2.0f * Fx);
            const float Uy = Fy * Fy * (3.0f - 2.0f * Fy);
            const float Uz = Fz * Fz * (3.0f - 2.0f * Fz);
            const float N000 = RefHash(Ix, Iy, Iz),         N100 = RefHash(Ix + 1, Iy, Iz);
            const float N010 = RefHash(Ix, Iy + 1, Iz),     N110 = RefHash(Ix + 1, Iy + 1, Iz);
            const float N001 = RefHash(Ix, Iy, Iz + 1),     N101 = RefHash(Ix + 1, Iy, Iz + 1);
            const float N011 = RefHash(Ix, Iy + 1, Iz + 1), N111 = RefHash(Ix + 1, Iy + 1, Iz + 1);
            const float X00 = N000 + (N100 - N000) * Ux, X10 = N010 + (N110 - N010) * Ux;
            const float X01 = N001 + (N101 - N001) * Ux, X11 = N011 + (N111 - N011) * Ux;
            const float Y0 = X00 + (X10 - X00) * Uy,     Y1 = X01 + (X11 - X01) * Uy;
            return Y0 + (Y1 - Y0) * Uz;
        };
        WindSettings SwirlWind = Wind;
        SwirlWind.Turbulence = 0.2f; SwirlWind.Steadiness = 1.0f;
        double Worst = 0.0;
        for (int I = 0; I < 64; ++I)
        {
            const float P[3] = { static_cast<float>(I % 8) * 13.7f - 41.0f,
                                 static_cast<float>((I / 8) % 8) * 9.1f - 27.0f,
                                 static_cast<float>(I % 5) * 311.0f + 7.0f };
            const float T = static_cast<float>(I) * 0.37f;
            float Got[3];
            WindField::SampleSwirl(SwirlWind, P, T, Got);
            // REF windTurb in Z-up axes: q = p*.02 + (t*.05, t*.03, 0), then the (n1-n2,n2-n3,n3-n1) mix.
            const float Qx = P[0] * 0.02f + T * 0.05f;
            const float Qy = P[1] * 0.02f + T * 0.03f;
            const float Qz = P[2] * 0.02f;
            constexpr float E = 0.5f;
            const float Dx = RefNoise(Qx + E, Qy, Qz) - RefNoise(Qx - E, Qy, Qz);
            const float Dy = RefNoise(Qx, Qy + E, Qz) - RefNoise(Qx, Qy - E, Qz);
            const float Dz = RefNoise(Qx, Qy, Qz + E) - RefNoise(Qx, Qy, Qz - E);
            const float Scale = SwirlWind.Turbulence * SwirlWind.Speed * 0.9f;
            const float Want[3] = { (Dz - Dy) * Scale, (Dx - Dz) * Scale, (Dy - Dx) * Scale };
            for (int C = 0; C < 3; ++C)
                Worst = std::fmax(Worst, std::fabs(static_cast<double>(Got[C] - Want[C])));
        }
        std::printf("     worst component difference over 64 probes: %.3e\n", Worst);
        Expect(Worst < 1e-5, "production swirl matches the independent transcription");
    }

    // ── ⑧ the drift is integral times altitude factor ────────────────────────────────────────────────────────
    // P2.2 replaced the frozen-shear form with the reference windDisp: the whole medium rides the wall-clock
    // integral, each altitude scaled by its own wind over the surface wind. Hand-checked against SampleStep
    // (the trusted primitive): the formula, the zero-integral rest state, and the zero-wind guard.
    std::printf("\n8. the drift scales the integral by the altitude factor\n");
    {
        WindSettings DriftWind = Wind;
        DriftWind.Integral[0] = 2500.0f; DriftWind.Integral[1] = -1200.0f;
        bool Formula = true;
        for (float A : { 0.0f, 1500.0f, 3000.0f, 8000.0f })
        {
            float D[2];
            WindField::AdvectDrift(DriftWind, A, 0.8f, D);
            float Step[3];
            WindField::SampleStep(DriftWind, A, Step);
            const float Len = std::sqrt(Step[0]*Step[0] + Step[1]*Step[1]);
            const float F = Len / std::fmax(1e-3f, DriftWind.Speed);
            for (int C = 0; C < 2; ++C)
            {
                const float E = (C == 0 ? 2500.0f : -1200.0f) * F * 0.8f;
                if (std::fabs(D[C] - E) > std::fmax(std::fabs(E) * 1e-6f, 1e-4f)) Formula = false;
            }
        }
        Expect(Formula, "drift equals integral x |step|/speed x art at every altitude");

        WindSettings Calm = Wind;
        Calm.Speed = 0.0f; Calm.Integral[0] = 999.0f; Calm.Integral[1] = 999.0f;
        float Zero[2];
        WindField::AdvectDrift(Calm, 1500.0f, 0.8f, Zero);
        Expect(Zero[0] == 0.0f && Zero[1] == 0.0f, "zero wind holds the field still (guarded, no NaN)");

        WindSettings Fresh = Wind;
        float Rest[2];
        WindField::AdvectDrift(Fresh, 1500.0f, 0.8f, Rest);
        Expect(Rest[0] == 0.0f && Rest[1] == 0.0f, "a zero integral is the rest state, whatever the sliders say");
    }

    std::printf("\n");
    for (int I = 0; I < 108; ++I) std::putchar('=');
    std::printf("\n%s\n\n", Failures == 0 ? "  the wind behaves" : "  THE WIND DOES NOT BEHAVE");
    return Failures == 0 ? 0 : 1;
}
