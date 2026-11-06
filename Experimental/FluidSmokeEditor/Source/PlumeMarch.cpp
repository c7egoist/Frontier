/*==========================================================================================================================================
                                                            PLUMEMARCH.CPP
==========================================================================================================================================*/
// 🧩 1:1 C++ port of PlumeMarch.wgsl and FireIllumination.wgsl — see the header.

#include "PlumeMarch.h"
#include "PlumeTransport.h"

#include <algorithm>
#include <cmath>

namespace FluidSmoke
{

namespace
{

constexpr float InversePi = 1.0f / 3.14159265358979f;

// 📐 Henyey–Greenstein, normalised over the sphere.
float ResolveHenyeyGreenstein(float Cosine, float Anisotropy)
{
    const float Squared = Anisotropy * Anisotropy;
    return (1.0f - Squared) / (12.56637061436f * std::pow(std::max(1.0f + Squared - 2.0f * Anisotropy * Cosine, 1.0e-4f), 1.5f));
}

// 📐 Frontier's smoke phase generalised: a forward lobe (g) mixed 72 % with a backward one (−0.65 g).
float ResolvePhase(float Cosine, float Anisotropy)
{
    return Mix(ResolveHenyeyGreenstein(Cosine, -0.65f * Anisotropy), ResolveHenyeyGreenstein(Cosine, Anisotropy), 0.72f);
}

// 📝 Tiling value-noise volume (the exhibit's 32³ detail texture) — three octaves folded into rgb, a fourth
//    channel for the flame flicker; drifts downwind and upward with the plume.
float HashNoise(int X, int Y, int Z, uint32_t Seed)
{
    uint32_t H = Seed;
    H ^= static_cast<uint32_t>(X) * 0x8da6b343u;
    H ^= static_cast<uint32_t>(Y) * 0xd8163841u;
    H ^= static_cast<uint32_t>(Z) * 0xcb1ab31fu;
    H *= 0x9E3779B1u;
    H ^= H >> 15;
    return static_cast<float>(H & 0xFFFFFFu) / 16777216.0f;
}

float ValueNoise(const Vec3& P, uint32_t Seed)
{
    const int X0 = static_cast<int>(std::floor(P[0])), Y0 = static_cast<int>(std::floor(P[1])), Z0 = static_cast<int>(std::floor(P[2]));
    const float Fx = P[0] - X0, Fy = P[1] - Y0, Fz = P[2] - Z0;
    float R = 0.0f;
    for (int Z = 0; Z < 2; ++Z)
        for (int Y = 0; Y < 2; ++Y)
            for (int X = 0; X < 2; ++X)
            {
                const float W = (X ? Fx : 1 - Fx) * (Y ? Fy : 1 - Fy) * (Z ? Fz : 1 - Fz);
                R += HashNoise(X0 + X, Y0 + Y, Z0 + Z, Seed) * W;
            }
    return R;
}

Vec4 ResolveDetail(const PlumeRecord& P, const Vec3& Position)
{
    const float Time = P.ElapsedSeconds;
    const Vec3 Drift = { -P.Wind[0] * 0.35f * Time, -P.Wind[1] * 0.35f * Time, -0.55f * Time };
    const Vec3 C = ScaleVector(AddVector(Position, Drift), P.DetailScale);
    const float E = static_cast<float>(DetailExtent);
    const Vec3 Tiled = { C[0] - E * std::floor(C[0] / E), C[1] - E * std::floor(C[1] / E), C[2] - E * std::floor(C[2] / E) };
    return { ValueNoise(Tiled, 0x1u), ValueNoise(Tiled, 0x2u), ValueNoise(Tiled, 0x3u), ValueNoise(Tiled, 0x4u) };
}

float ErodeDensity(float Density, float Noise, float Strength)
{
    const float Thin = 1.0f - std::clamp(Density * 0.8f, 0.0f, 1.0f);
    return std::max(0.0f, Density * (1.0f + Strength * (Noise - 0.5f) * 1.6f) - Strength * Thin * (1.0f - Noise) * 0.35f * std::min(Density, 1.0f));
}

// 📝 Isotropic sky term: the zenith and four horizon directions, as the exhibit's sky view average.
Vec3 ResolveSkyAmbient(const MarchEnvironment& Env)
{
    Vec3 Sky = ScaleVector(Env.SkyZenithRadiance, 2.0f);
    for (int Side = 0; Side < 4; ++Side)
        Sky = AddVector(Sky, Env.SkyHorizonRadiance);
    return AddVector(ScaleVector(Sky, Env.SkyScale / 6.0f), Env.NightSkyRadiance);
}

// 📝 The burning tyres and exhaust pops as softened point lights: irradiance over 4π, the phase taken as isotropic.
Vec3 ResolveFireLight(const PlumeSpace& Space, const Vec3& Position)
{
    Vec3 Light = { 0, 0, 0 };
    const PlumeRecord& P = Space.Record;
    const uint32_t Count = std::min(Space.FireLights.Count, 4u);
    for (uint32_t Index = 0; Index < Count; ++Index)
    {
        const Vec3 Offset = SubtractVector(Space.FireLights.Position[Index], Position);
        const float Radius = Space.FireLights.Radius[Index];
        const float D = Dot(Offset, Offset) + Radius * Radius;
        Light = AddVector(Light, ScaleVector(Space.FireLights.Radiance[Index], 1.0f / D));
    }
    return ScaleVector(Light, 0.0795774715f * P.FireLightScale);
}

// 📝 Transmittance toward the sun (x) and the zenith (y) through the plume, resolved once per coarse cell.
Vec3 SampleSelfShadow(const PlumeSpace& Space, const Vec3& Position)
{
    const Vec4 S = SampleLightState(Space, Position);
    return { std::clamp(S.X, 0.0f, 1.0f), std::clamp(S.Y, 0.0f, 1.0f), 1.0f };
}

} // namespace

PlumeMarchResult MarchPlume(const PlumeSpace& Space, const MarchCamera& Camera, const MarchEnvironment& Environment,
                            const SceneDistanceField* Field, int Width, int Height, uint32_t FrameIndex) noexcept
{
    PlumeMarchResult Result;
    Result.Width = Width;
    Result.Height = Height;
    Result.Pixels.assign(static_cast<size_t>(Width) * Height, Vec4{ 0, 0, 0, 1 });
    if (!Space.Resident)
        return Result;

    const PlumeRecord& P = Space.Record;
    const int Low[3] = { Space.Coverage[0], Space.Coverage[1], Space.Coverage[2] };
    const int High[3] = { Space.Coverage[4], Space.Coverage[5], Space.Coverage[6] };
    if (Low[0] > High[0] || Low[1] > High[1] || Low[2] > High[2])
        return Result;

    // ① the ray, clipped to the coverage box (grown by a cell) and to the opaque surface (the course plane)
    const float Edge = P.LatticeA[0];
    const Vec3 Origin = { 2.0f * P.VelocityOrigin.X * Edge, 2.0f * P.VelocityOrigin.Y * Edge, P.LatticeA[2] };
    const Vec3 BoxMinimum = AddVector(Origin, ScaleVector({ static_cast<float>(Low[0] - 1), static_cast<float>(Low[1] - 1),
                                                            static_cast<float>(Low[2] - 1) }, Edge));
    const Vec3 BoxMaximum = AddVector(Origin, ScaleVector({ static_cast<float>(High[0] + 2), static_cast<float>(High[1] + 2),
                                                            static_cast<float>(High[2] + 2) }, Edge));

    const float Anisotropy = P.Anisotropy;
    const Vec3 SkyAmbient = ScaleVector(ResolveSkyAmbient(Environment), P.AmbientScale);
    const float GroundBounce = Environment.SunIlluminance * (std::max(Environment.SunDirection[2], 0.0f) * 0.12f * InversePi * P.AmbientScale);
    const float Strength = P.Scattering;
    const float Flicker = 0.5f + 0.5f * std::sin(P.ElapsedSeconds * 23.0f);
    const int ThermoState = Space.State;   // the march reads the state the transport left

    for (int Py = 0; Py < Height; ++Py)
        for (int Px = 0; Px < Width; ++Px)
        {
            const float NdcX = (2.0f * (static_cast<float>(Px) + 0.5f) / static_cast<float>(Width) - 1.0f) * Camera.TanHalfFov * Camera.Aspect;
            const float NdcY = (1.0f - 2.0f * (static_cast<float>(Py) + 0.5f) / static_cast<float>(Height)) * Camera.TanHalfFov;
            const Vec3 Direction = Normalize(AddVector(AddVector(Camera.Forward, ScaleVector(Camera.Right, NdcX)), ScaleVector(Camera.Up, NdcY)));

            // slab clip of the camera ray against the coverage box
            Vec3 Inverse = { 0, 0, 0 };
            for (int A = 0; A < 3; ++A)
                Inverse[A] = std::abs(Direction[A]) < 1.0e-9f ? 1.0e9f : 1.0f / Direction[A];
            const Vec3 Near = ScaleVector(SubtractVector(BoxMinimum, Camera.Position), 1.0f);   // per-axis below
            const Vec3 Distant = ScaleVector(SubtractVector(BoxMaximum, Camera.Position), 1.0f);
            (void)Near; (void)Distant;
            float Enter = 0.0f, Exit = 1.0e5f;
            bool Hit = true;
            for (int A = 0; A < 3; ++A)
            {
                const float Inv = Inverse[A];
                float T0 = (BoxMinimum[A] - Camera.Position[A]) * Inv;
                float T1 = (BoxMaximum[A] - Camera.Position[A]) * Inv;
                if (T0 > T1) std::swap(T0, T1);
                Enter = std::max(Enter, T0);
                Exit = std::min(Exit, T1);
            }
            // the course plane is the opaque surface
            if (Direction[2] < -1.0e-9f)
                Exit = std::min(Exit, (P.LatticeA[2] - Camera.Position[2]) / Direction[2]);
            if (!Hit || Exit <= Enter)
                continue;

            // ② about one sample per cell, from an interleaved-gradient offset rotated by the golden ratio each frame
            const int Count = static_cast<int>(std::clamp(std::ceil((Exit - Enter) / (0.9f * Edge)), 4.0f,
                                                          std::max(P.MarchSamples, 4.0f)));
            const float Step = (Exit - Enter) / static_cast<float>(Count);
            const float Offset = std::fmod(52.9829189f * std::fmod(0.06711056f * static_cast<float>(Px) + 0.00583715f * static_cast<float>(Py), 1.0f)
                                           + 0.61803398875f * static_cast<float>(FrameIndex % 256u), 1.0f);
            const float RayCosine = Dot(Direction, Normalize(Environment.SunDirection));
            const Vec3 PhaseOctaves = { ResolvePhase(RayCosine, Anisotropy), ResolvePhase(RayCosine, 0.5f * Anisotropy),
                                        ResolvePhase(RayCosine, 0.25f * Anisotropy) };

            Vec3 Radiance = { 0, 0, 0 };
            float Transmittance = 1.0f;
            for (int Index = 0; Index < Count; ++Index)
            {
                if (Transmittance < 0.01f)
                    break;
                const Vec3 Position = AddVector(Camera.Position, ScaleVector(Direction, Enter + (static_cast<float>(Index) + Offset) * Step));
                Vec4 Thermo = SampleThermoState(Space, ThermoState, Position);
                Thermo.X = std::max(Thermo.X, 0.0f); Thermo.Y = std::max(Thermo.Y, 0.0f);
                Thermo.Z = std::max(Thermo.Z, 0.0f); Thermo.W = std::max(Thermo.W, 0.0f);
                if (Thermo.X < 1.0e-3f && Thermo.W < 1.0e-3f && Thermo.Z < 1.0e-3f)
                    continue;

                // ③ sub-cell detail on both particulates; the flame flickers with the noise's fourth channel
                if (P.Detail > 0.0f)
                {
                    const Vec4 Noise = ResolveDetail(P, Position);
                    const float Folded = Noise.X * 0.5f + Noise.Y * 0.3f + Noise.Z * 0.2f;
                    Thermo.X = ErodeDensity(Thermo.X, Folded, P.Detail);
                    Thermo.W = ErodeDensity(Thermo.W, Folded, P.Detail);
                    Thermo.Z *= Mix(1.0f, 0.45f + 1.1f * Mix(Noise.W, Flicker, 0.25f), std::min(P.Detail, 1.0f));
                }

                // ④ optics of the mixture
                const float SmokeExtinction = Thermo.X * P.SmokeExtinction;
                const float SootExtinction = Thermo.W * P.SootExtinction;
                const float Particulate = SmokeExtinction + SootExtinction;
                const float Extinction = Particulate + Thermo.Z * 0.8f;
                if (Extinction < 1.0e-4f)
                    continue;
                const float Absorbed = 1.0f - std::exp(-Extinction * Step);
                const float Albedo = (SmokeExtinction * P.SmokeAlbedo + SootExtinction * P.SootAlbedo) / std::max(Particulate, 1.0e-5f);
                const float Share = Particulate / Extinction;

                // ⑤ sun in three octaves, sky occluded from above, fire light from within
                const Vec3 Shadow = SampleSelfShadow(Space, Position);
                float Visibility = 1.0f;
                if (Field)
                    Visibility = Field->TraverseShadow(AddVector(Position, ScaleVector(Normalize(Environment.SunDirection), 0.05f)),
                                                       Normalize(Environment.SunDirection), 0.05f, 40.0f);
                const float Octaves = PhaseOctaves[0] * Shadow[0] + Strength * Albedo * (0.6f * PhaseOctaves[1] * std::pow(Shadow[0], 0.25f)
                                                                                          + 0.36f * PhaseOctaves[2] * std::pow(Shadow[0], 0.0625f));
                const float Sunlight = Environment.SunIlluminance * (Visibility * Octaves);
                const Vec3 Sky = AddVector(ScaleVector(SkyAmbient, 0.18f + 0.82f * std::pow(Shadow[1], 0.6f)), ScaleVector({ GroundBounce, GroundBounce, GroundBounce }, 1.0f));
                const Vec3 Scattered = ScaleVector(AddVector(AddVector(ScaleVector({ Sunlight, Sunlight, Sunlight }, 1.0f), Sky), ResolveFireLight(Space, Position)),
                                                           Albedo * Share * Absorbed);

                // ⑥ flame: blackbody between tip and core, brighter where the gas is hotter
                const float Heat = Thermo.Y / (Thermo.Y + P.FlameHeatThreshold);
                const float Temperature = Mix(P.FlameTip, P.FlameCore, Heat);
                const Vec3 Emission = ScaleVector(ResolveBlackbodyRadiance(Temperature), P.FlameScale * std::min(Thermo.Z, 1.5f) * Step);

                Radiance = AddVector(Radiance, ScaleVector(AddVector(Scattered, Emission), Transmittance));
                Transmittance *= 1.0f - Absorbed;
            }
            Result.Pixels[static_cast<size_t>(Py) * Width + Px] = Vec4{ Radiance[0], Radiance[1], Radiance[2], Transmittance };
        }
    return Result;
}

FireArrival ResolveFireArrival(const SceneDistanceField& Field, const Vec3& Position, const Vec3& Normal,
                               const Vec3& FirePosition, float FireIntensity, const Vec3& FireColour, float FireReach) noexcept
{
    FireArrival Arrival;
    if (FireIntensity <= 0.0f)
        return Arrival;
    const Vec3 Toward = SubtractVector(FirePosition, Position);
    const float Squared = Dot(Toward, Toward);
    if (Squared >= FireReach * FireReach)
        return Arrival;
    const float Range = std::sqrt(Squared);
    Arrival.Direction = ScaleVector(Toward, 1.0f / std::max(Range, 1.0e-4f));
    if (Dot(Normal, Arrival.Direction) <= 0.0f)
        return Arrival;
    const float Ratio = Squared / (FireReach * FireReach);
    const float Window = (1.0f - Ratio * Ratio) * (1.0f - Ratio * Ratio);
    // 📝 shadowed through the scene distance field; the shadow ray stops short of the light
    const float Bias = 0.02f;
    const float Visibility = Field.TraverseShadow(AddVector(Position, ScaleVector(Normal, Bias)), Arrival.Direction,
                                                  0.5f * Bias, std::max(Range - 0.6f, 0.0f));
    Arrival.Illuminance = ScaleVector(FireColour, FireIntensity * Window * Visibility / std::max(Squared, 0.25f));
    return Arrival;
}

} // namespace FluidSmoke
