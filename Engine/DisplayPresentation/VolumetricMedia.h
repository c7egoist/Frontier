//============================================================================================================================================
// 📦 Engine/DisplayPresentation/VolumetricMedia.h — clouds and fog, marched once over the union of their volumes
//============================================================================================================================================
// Celestial port, step 5. The largest step: Cloud Layer, Local Cloud, Height Fog, Atmospheric Fog and Local
//    Volumetric Fog all live here, and they share one march.
//
// ⚠️ ONE MARCH, NOT ONE PER MEDIUM. The source branch consolidated these at 73737b6 — a single loop over the
//    union of the volumes' bounding intervals, with shared extinction and a shared sun-shadow march, so fog
//    shadows cloud and cloud shadows fog for free and the per-pixel cost is one loop instead of one per volume.
//    Splitting them back apart is not a refactor, it is a regression; `CheckVolumetricMedia.sh` asserts the
//    single-march structure.
//
// ⚠️ ON GOD RAYS. The scene-occlusion path — a SunVisibilityAt callback and a GodRaySamples budget for shafts
//    cut by buildings, terrain or foliage — was built, proved, and then removed at the user's request because
//    nothing in the engine called it and no such geometry exists yet. `git show c4ea076` and `6bb52a7` carry the
//    working implementation if it is ever wanted; the lesson worth keeping is that the query must follow the SUN
//    RAY, not test the occluder directly above the sample, or the beams do not move when the sun does.
//
//    CLOUD AND FOG SHAFTS ARE NOT PART OF THAT REMOVAL AND MUST NOT BE. They come from ShadowMarch below, which
//    accumulates cloud density along the sun ray so the medium shadows itself. That is not a shaft feature bolted
//    on: it is what lights a cloud at all. Measured across 2 km of broken cumulus it gives 4.83x contrast between
//    gap and shadow, against 1.39x under solid overcast. Removing it would leave clouds flat and unlit.
//
// ⚠️ AND THREE OPTIMISATIONS THAT ARE PROHIBITED, each measured and reverted upstream:
//        clear-air striding (73b71d6)  — probe/erosion mismatch stalled the march, dark speckled cloud
//        low-res cloud FBO + temporal reprojection (a152901) — slower on a GTX and lower quality
//        atmosphere LUTs (2fe78ed)     — no speedup, and worse looking; see References/Deferred/AtmosphereLuts.md
//
// Coordinates: the engine is right-handed Z-UP (CLAUDE.md §7). The reference demo is Y-up, so every altitude term
//    transcribed from it reads .z here where the demo reads .y. That is the single most likely transcription
//    error in this file and it is silent — a cloud layer built on the wrong axis still renders, just sideways.

#pragma once

#include "WindField.h"

#include <cmath>
#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                    CLOUD LAYER
//------------------------------------------------------------------------------------------------------------------------

enum class CloudTypeCategory : uint32_t
{
    Stratus = 0u, Stratocumulus = 1u, Cumulus = 2u, Cumulonimbus = 3u, Altostratus = 4u, Cirrus = 5u,
};

struct CloudLayerSettings
{
    bool              Enabled   = false;
    CloudTypeCategory Type      = CloudTypeCategory::Cumulus;
    float             Base      = 1500.0f;   // [m] altitude of the cloud base
    float             Thickness = 900.0f;    // [m] slab depth
    float             Coverage  = 0.45f;     // [0..1]
    float             Density   = 1.0f;      // [x]
    float             Scale     = 1.4f;      // [x] feature size
    float             Anisotropy = 0.45f;    // Henyey-Greenstein g (the march used the box's; now per-medium)
    float             Albedo[3] = { 1.0f, 1.0f, 1.0f };   // the cloud white (likewise)
    float             Anvil     = 0.3f;      // [0..1] cumulonimbus spreading
    bool              FollowWind = true;     // link to the Wind Field entity
    // Scattering, named as the reference panel names it (packed P2.2, read P2.4b): the dual HG lobe, the
    //    multi-scatter/absorption/powder terms, and the erosion-octave strength the density carves with.
    float             ForwardLobe = 0.8f;    // HG g1: the forward lobe
    float             BackLobe  = 0.3f;      // HG g2: the back lobe (negated in the mix, REF dualHG)
    float             LobeMix   = 0.3f;      // [0..1] back-lobe weight
    float             Absorption = 0.05f;    // [0..1] Beer absorption on top of scattering
    float             SkyAmbient = 0.9f;     // [x] sky-ambient gain on the in-scatter
    float             Powder    = 0.6f;      // [0..1] Beer-powder brightening toward the sun
    float             ErosionDetail = 0.6f;  // [0..1] erosion-octave strength

    // ⚠️ THE CEILING. Clouds are a tropospheric phenomenon: they form where there is enough water vapour and
    //    convection, which is the bottom ~12 km of a 60 km atmosphere. Without an explicit ceiling the slab is
    //    just a band at whatever altitude the user typed, so a Base of 200 km put cloud *outside the atmosphere*
    //    — visible from orbit as a shell floating in vacuum, which is what looked wrong from space.
    //
    //    Clamped rather than merely documented, because the failure is silent: the render succeeds and simply
    //    shows something impossible.
    float             CeilingMetres = 14000.0f;   // [m] no cloud above this, ever
};

//------------------------------------------------------------------------------------------------------------------------
//                                              LOCAL VOLUMES (box-bounded)
//------------------------------------------------------------------------------------------------------------------------

// A Local Cloud or Local Volumetric Fog: a finite box somewhere in the world, rather than a global layer.
//
//    These are the entities that need a gizmo and a billboard marker. A global cloud layer has no position to
//    drag; a local volume does, and it has no visible body to click on when its density is low — so the editor
//    needs a proxy. See VolumeMarker below.
enum class LocalCloudType : uint32_t
{
    Stratiform = 0u, Cumuliform = 1u, Wispy = 2u,   // REF lc_type (the vertical profile it bakes with)
};

enum class LocalCloudShape : uint32_t
{
    Box = 0u, Ellipsoid = 1u,                        // REF lc_shape (the mask it fades with)
};

struct LocalVolumeSettings
{
    bool  Enabled  = false;
    float Centre[3]  = { 40.0f, -160.0f, 120.0f };   // [m] world position, Z-up (REF lc pos, axis-permuted)
    float HalfSize[3] = { 90.0f, 70.0f, 35.0f };
    float Density   = 1.2f;
    float Coverage  = 0.6f;
    float Scale     = 30.0f;    // [m] feature size
    LocalCloudType  Type  = LocalCloudType::Cumuliform;   // REF lc_type (cloud path only; the fog ignores it)
    LocalCloudShape Shape = LocalCloudShape::Ellipsoid;   // REF lc_shape (likewise)
    float Soft      = 0.5f;      // [0..1] REF lc_soft: the mask's edge width (likewise)
    float Albedo[3] = { 0.92f, 0.94f, 0.97f };
    float Anisotropy = 0.45f;    // Henyey-Greenstein g
    bool  FollowWind = true;
    float ErosionDetail = 0.55f; // [0..1] own erosion strength (REF lc_detail; scatter stays shared, P2.4)
};

//------------------------------------------------------------------------------------------------------------------------
//                                                   HEIGHT / AERIAL FOG
//------------------------------------------------------------------------------------------------------------------------

struct FogSettings
{
    bool  HeightEnabled = false;
    float HeightDensity = 0.02f;   // [1/m] at the reference altitude
    float FalloffHeight = 400.0f;  // [m] e-folding height
    float HeightColour[3] = { 0.62f, 0.68f, 0.76f };
    float SunScatter    = 0.6f;

    bool  AerialEnabled = false;
    float AerialDensity = 1.0f;    // [x] multiplies the atmospheric extinction
    float AerialStart   = 50.0f;   // [m] distance before it begins
    float AerialMie     = 0.4f;    // [0..1] 0 = spectral Rayleigh tint, 1 = grey Mie
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    THE MEDIA
//------------------------------------------------------------------------------------------------------------------------

struct VolumetricBudget
{
    uint32_t CloudSteps      = 28u;   // FidelityCriteria::CloudMarchStepCount
    uint32_t LocalSteps      = 28u;   // FidelityCriteria::LocalVolumeStepCount
    uint32_t LightTaps       = 4u;    // FidelityCriteria::CloudLightTapCount (the tier's Standard count; the
                                      // posterization the old 6 guarded against was measured pre-jitter, and
                                      // every sheet already renders at tier taps)
    float    CoverageMargin  = 0.03f; // FidelityCriteria::CloudCoverageMargin
};


struct VolumetricSample
{
    float Scatter[3]      = {};                      // in-scattered radiance
    float Transmittance   = 1.0f;                    // what survives the media
    uint32_t StepsTaken   = 0u;                      // for the proof's cost assertions
    // The real saving from the unified march is not fewer steps — the union of two volumes is genuinely longer
    //    than either — it is ONE sun-shadow march per occupied step instead of one per medium per step. That is
    //    the number the proof asserts.
    uint32_t ShadowMarches = 0u;
};

class VolumetricMedia
{
public:
    //--------------------------------------------------------------------------------------------------------------------
    //                                              CLOUD SHAPE
    //--------------------------------------------------------------------------------------------------------------------

    // Vertical profile within the slab, 0 at the base and 1 at the top. This is what makes a stratus a flat sheet
    //    and a cumulonimbus a tall column with an anvil.
    static float HeightProfile(CloudTypeCategory Type, float Normalised, float Anvil) noexcept
    {
        const float H = Clamp(Normalised, 0.0f, 1.0f);
        switch (Type)
        {
            case CloudTypeCategory::Stratus:
                return SmoothStep(0.0f, 0.08f, H) * (1.0f - SmoothStep(0.75f, 1.0f, H));
            case CloudTypeCategory::Stratocumulus:
                return SmoothStep(0.0f, 0.12f, H) * (1.0f - SmoothStep(0.50f, 0.95f, H));
            case CloudTypeCategory::Cumulus:
                return SmoothStep(0.0f, 0.07f, H) * (1.0f - SmoothStep(0.35f, 1.0f, H)) * 1.15f;
            case CloudTypeCategory::Cumulonimbus:
                return SmoothStep(0.0f, 0.05f, H) * (1.0f - SmoothStep(0.85f, 1.0f, H))
                     * Lerp(1.0f, 1.6f, SmoothStep(0.7f, 1.0f, H) * Anvil);
            case CloudTypeCategory::Altostratus:
                return SmoothStep(0.0f, 0.30f, H) * (1.0f - SmoothStep(0.6f, 1.0f, H)) * 0.7f;
            case CloudTypeCategory::Cirrus:
            default:
                return SmoothStep(0.0f, 0.40f, H) * (1.0f - SmoothStep(0.5f, 1.0f, H)) * 0.35f;
        }
    }

    // The local cloud's vertical profile (REF lcDensity's three-way on the box height): stratiform a flat
    //    sheet, cumuliform a tall core, wispy a thin mid band.
    static float LocalHeightProfile(LocalCloudType Type, float Normalised) noexcept
    {
        const float H = Clamp(Normalised, 0.0f, 1.0f);
        switch (Type)
        {
            case LocalCloudType::Stratiform:
                return SmoothStep(0.0f, 0.10f, H) * (1.0f - SmoothStep(0.75f, 1.0f, H));
            case LocalCloudType::Cumuliform:
                return SmoothStep(0.0f, 0.08f, H) * (1.0f - SmoothStep(0.4f, 1.0f, H)) * 1.15f;
            case LocalCloudType::Wispy:
            default:
                return SmoothStep(0.0f, 0.30f, H) * (1.0f - SmoothStep(0.6f, 1.0f, H)) * 0.6f;
        }
    }

    // The local cloud's mask (REF lcMask): a box fades on its thinnest margin, an ellipsoid on its radius,
    //    over the softness width. Local is the box-normalised position (-1..1); corners of a box stay visible
    //    (margin 0.1 fades, it does not clip), which is why the cloud path has no radius early-out.
    static float LocalCloudMask(LocalCloudShape Shape, float Soft, const float Local[3]) noexcept
    {
        float M = 0.0f;
        if (Shape == LocalCloudShape::Box)
        {
            const float Mx = 1.0f - std::fabs(Local[0]);
            const float My = 1.0f - std::fabs(Local[1]);
            const float Mz = 1.0f - std::fabs(Local[2]);
            M = std::fmin(std::fmin(Mx, My), Mz);
        }
        else
        {
            M = 1.0f - std::sqrt(Local[0]*Local[0] + Local[1]*Local[1] + Local[2]*Local[2]);
        }
        return SmoothStep(0.0f, std::fmax(0.05f, Soft), M);
    }

    // The slab's actual extent after the ceiling is applied. Returns false when the layer has been pushed
    //    entirely above the ceiling, which is the case that used to put cloud in orbit.
    static bool SlabExtent(const CloudLayerSettings& Cloud, float& OutBase, float& OutTop) noexcept
    {
        const float Ceiling = Cloud.CeilingMetres;
        OutBase = Clamp(Cloud.Base, 0.0f, Ceiling);
        OutTop  = Clamp(Cloud.Base + Cloud.Thickness, 0.0f, Ceiling);
        return OutTop > OutBase + 1.0f;
    }

    // How far past the slab entry the layer march may run. The reference caps the span (celestial line 1023):
    // a camera above the slab sees max(60 km, thick x 40); below or inside it sees thick x 14. The cap is a
    // cut, not a fade — beyond it the march simply stops — and it belongs to the layer only (marchLocal
    // spans its own box). All three slab-interval twins (here, the shader's, the proof's) call their own
    // spelling of this law.
    static float SlabFarCap(float OriginZ, float Base, float Top) noexcept
    {
        const float Thickness = Top - Base;
        if (OriginZ > Top) return std::fmax(60000.0f, Thickness * 40.0f);
        return Thickness * 14.0f;
    }

    // Cloud density at a world point. Z-up: altitude is p.z.
    // Cloud density at a world point. Z-up: altitude is p.z. Time is wall-clock seconds (the erosion octave
    //    drifts with it); Lod is the march's distance level (past 0.5 the erosion is skipped, see March).
    static float CloudDensity(const CloudLayerSettings& Cloud, const WindSettings& Wind,
                              const float Position[3], float Time, float Lod) noexcept
    {
        float Base = 0.0f, Top = 0.0f;
        if (!SlabExtent(Cloud, Base, Top)) return 0.0f;

        const float Altitude = Position[2];
        if (Altitude < Base || Altitude > Top) return 0.0f;

        const float Hn = Clamp((Altitude - Base) / (Top - Base), 0.0f, 1.0f);
        const float Profile = HeightProfile(Cloud.Type, Hn, Cloud.Anvil);
        if (Profile <= 0.0f) return 0.0f;

        // Advection, the wind integral times the altitude factor (WindField::AdvectDrift — the streak note
        //    lives there): the whole slab rides Tick's wall-clock accumulation, never time-of-day. Trig-only,
        //    so it stays safe inside the march like the SampleStep it replaces — and SampleStep-only, the
        //    swirl still belongs once per pixel (the regression the source branch's last commit fixed).
        //    Unlinked the slab sits still: the reference drifts it on its own wind and clock, but that needs
        //    lanes the record does not have yet (P8's growth), so unlinked is static and the proof pins it.
        float Drift[3] = { 0.0f, 0.0f, 0.0f };
        if (Cloud.FollowWind)
        {
            float Advected[2];
            WindField::AdvectDrift(Wind, Altitude, 0.8f, Advected);
            Drift[0] = Advected[0]; Drift[1] = Advected[1];
        }

        // The shear leans the column downwind (REF clDensity): hn * thick * .35 along the drift direction,
        // full anvil spread on cumulonimbus and above, a fifth of that on the lower types. The lean follows
        // the drift rather than the linkage, so P8's unlinked drift will lean with no further change — and
        // at a zero integral the guarded normalisation is exactly zero, so the rest state stands straight.
        const uint32_t TypeId = static_cast<uint32_t>(Cloud.Type);
        const float LeanFactor = (TypeId >= 3u ? Cloud.Anvil : 0.2f);
        const float DriftLen = std::sqrt(Drift[0]*Drift[0] + Drift[1]*Drift[1]);
        const float LeanGuard = std::fmax(1e-3f, DriftLen + 1e-3f);
        const float LeanReach = Hn * (Top - Base) * 0.35f * LeanFactor;
        const float S0 = Position[0] + Drift[0] + LeanReach * Drift[0] / LeanGuard;
        const float S1 = Position[1] + Drift[1] + LeanReach * Drift[1] / LeanGuard;

        const float Inverse = 1.0f / std::fmax(Cloud.Scale * 900.0f, 1.0f);
        const float S[3] = { S0 * Inverse, S1 * Inverse, Position[2] * Inverse };

        // Four octaves (REF shape): the lost fourth comes back with the erosion that needs it — the moire
        // the old note measured was the sharpened remap under the sin-hash field, both gone now (P2.1 took
        // the hash, this slice takes the sharpening), and the jittered march breaks what aliasing is left
        // into incoherent grain, which is what the reference's own coarse steps do.
        float Shape = Noise(S[0], S[1], S[2]) * 0.5f
                    + Noise(S[0] * 2.02f + 3.1f, S[1] * 2.02f + 1.7f, S[2] * 2.02f + 9.2f) * 0.25f
                    + Noise(S[0] * 4.10f + 7.7f, S[1] * 4.10f + 2.2f, S[2] * 4.10f + 1.1f) * 0.125f
                    + Noise(S[0] * 8.3f + 1.3f, S[1] * 8.3f + 8.8f, S[2] * 8.3f + 4.4f) * 0.0625f;
        Shape /= 0.9375f;

        // Cirrus streaks (REF): only the top type stretches its sample — wide along x, pinched along the
        // other two axes. Axis-permuted: the reference reads (x*.25, y*4, z*6) Y-up with y vertical, and
        // here z is vertical, so the x4 pinch rides S[2] and the x6 rides S[1].
        if (Cloud.Type == CloudTypeCategory::Cirrus)
        {
            const float Streak = Noise(S[0] * 0.25f, S[1] * 6.0f, S[2] * 4.0f);
            Shape = Shape * 0.6f + Streak * 0.5f;
        }

        // Linear, not sharpened (REF base): the veil the old note measured is the missing height-ambient's
        // (P2.4b), not the remap's — sharpening here would double-count the fix and carve the erosion's
        // footing out from under it.
        const float Threshold = 1.0f - Clamp(Cloud.Coverage, 0.0f, 1.0f);
        const float Body = Clamp((Shape - Threshold) / std::fmax(1.0f - Threshold, 1e-3f), 0.0f, 1.0f)
                         * Profile;
        if (Body <= 0.0f || Lod > 0.5f) return Body * Cloud.Density;

        // Eroding detail (REF): two hot octaves of the leaned coordinate, the first drifting on wall time,
        // mixed against their own inverse toward the top and scaled by the panel's detail strength. The mix
        // (det, 1-det, hn*3) eats the tops more than the base — what turns puffs cauliflower.
        const float TimeShift = Time * 0.02f;
        const float Detail = Noise(S[0] * 9.0f + TimeShift, S[1] * 9.0f + TimeShift, S[2] * 9.0f + TimeShift) * 0.6f
                           + Noise(S[0] * 19.0f + 5.0f, S[1] * 19.0f + 5.0f, S[2] * 19.0f + 5.0f) * 0.4f;
        const float Erode = Lerp(Detail, 1.0f - Detail, Clamp(Hn * 3.0f, 0.0f, 1.0f))
                          * Cloud.ErosionDetail * 0.45f;
        return Clamp(Body - Erode * (1.0f - Body), 0.0f, 1.0f) * Cloud.Density;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                            LOCAL VOLUMES
    //--------------------------------------------------------------------------------------------------------------------

    // Slab intersection against an axis-aligned box. Returns false on a miss; Near is clamped to the ray origin.
    static bool IntersectBox(const float Centre[3], const float HalfSize[3],
                             const float Origin[3], const float Direction[3],
                             float& Near, float& Far) noexcept
    {
        float Lowest = -1e30f, Highest = 1e30f;
        for (int Axis = 0; Axis < 3; ++Axis)
        {
            const float D = Direction[Axis];
            const float O = Origin[Axis] - Centre[Axis];
            if (std::fabs(D) < 1e-9f)
            {
                if (std::fabs(O) > HalfSize[Axis]) return false;
                continue;
            }
            const float Inverse = 1.0f / D;
            float T1 = (-HalfSize[Axis] - O) * Inverse;
            float T2 = ( HalfSize[Axis] - O) * Inverse;
            if (T1 > T2) { const float Swap = T1; T1 = T2; T2 = Swap; }
            Lowest  = std::fmax(Lowest, T1);
            Highest = std::fmin(Highest, T2);
        }
        if (Lowest > Highest || Highest < 0.0f) return false;
        Near = std::fmax(Lowest, 0.0f);
        Far  = Highest;
        return true;
    }

    // Local density at a world point. Swirl is the march's per-pixel turbulence (REF gSwirl, already x8);
    // Lod skips the erosion past 0.5. IsFog selects the kept fog body: the reference models fog separately
    // (vfDensity, P8's port), so the fog path below is byte-for-byte the old body — type, shape, softness,
    // profile, swirl and erosion are the cloud path's alone.
    static float LocalDensity(const LocalVolumeSettings& Volume, const WindSettings& Wind,
                              const float Position[3], const float Swirl[3], float Lod, bool IsFog) noexcept
    {
        if (!Volume.Enabled) return 0.0f;
        float Local[3];
        for (int C = 0; C < 3; ++C)
            Local[C] = (Position[C] - Volume.Centre[C]) / std::fmax(Volume.HalfSize[C], 1e-3f);

        // One advection for both bodies: fog and cloud ride the same art-.6 drift, and only one branch runs
        // per call — computing it here keeps the single-call-site contract the gate pins.
        float Advected[2] = { 0.0f, 0.0f };
        if (Volume.FollowWind)
            WindField::AdvectDrift(Wind, Position[2], 0.6f, Advected);

        if (IsFog)
        {
            // Kept, not ported: P8 replaces this whole branch with vfDensity. Until then the fog marches
            // exactly what it always marched (the gate pins the old mask's constants below).
            const float R = std::sqrt(Local[0] * Local[0] + Local[1] * Local[1] + Local[2] * Local[2]);
            if (R >= 1.0f) return 0.0f;
            const float Mask = 1.0f - SmoothStep(0.55f, 1.0f, R);
            if (Mask <= 0.0f) return 0.0f;

            float Drift[3] = { 0.0f, 0.0f, 0.0f };
            if (Volume.FollowWind)
            {
                Drift[0] = Advected[0]; Drift[1] = Advected[1];
            }

            const float Inverse = 1.0f / std::fmax(Volume.Scale, 1.0f);
            const float S[3] = { (Position[0] + Drift[0]) * Inverse,
                                 (Position[1] + Drift[1]) * Inverse,
                                 Position[2] * Inverse };
            float Shape = Noise(S[0], S[1], S[2]) * 0.5f
                        + Noise(S[0] * 2.02f + 3.1f, S[1] * 2.02f + 1.7f, S[2] * 2.02f + 9.2f) * 0.25f;
            Shape /= 0.75f;

            const float Threshold = 1.0f - Clamp(Volume.Coverage, 0.0f, 1.0f);
            const float Raw = Clamp((Shape - Threshold) / std::fmax(1.0f - Threshold, 1e-3f), 0.0f, 1.0f);
            const float Body = SmoothStep(0.0f, 1.0f, Raw);
            return Body * Mask * Volume.Density;
        }

        // The local cloud (REF lcDensity): box height first — hn runs 0 at the floor to 1 at the lid.
        const float Hn = Clamp(Local[2] * 0.5f + 0.5f, 0.0f, 1.0f);
        const float Profile = LocalHeightProfile(Volume.Type, Hn);
        if (Profile <= 0.0f) return 0.0f;
        const float Mask = LocalCloudMask(Volume.Shape, Volume.Soft, Local);
        if (Mask <= 0.0f) return 0.0f;

        // Advection like the layer's at art .6, plus the per-pixel swirl at .6 (REF disp*.6+gSwirl*.6 — the
        // swirl arrives x8 and full-3D, so it stirs the altitude channel the drift leaves alone). Gated on
        // the linkage with the drift: unlinked the reference swaps both for its own time-drift (P8 here, so
        // unlinked the box sits still and a stray swirl cannot move it).
        float Push[3] = { 0.0f, 0.0f, 0.0f };
        if (Volume.FollowWind)
        {
            Push[0] = Advected[0] + Swirl[0] * 0.6f;
            Push[1] = Advected[1] + Swirl[1] * 0.6f;
            Push[2] = Swirl[2] * 0.6f;
        }

        const float Inverse = 1.0f / std::fmax(Volume.Scale, 1.0f);
        const float S[3] = { (Position[0] + Push[0]) * Inverse,
                             (Position[1] + Push[1]) * Inverse,
                             (Position[2] + Push[2]) * Inverse };

        float Shape = Noise(S[0], S[1], S[2]) * 0.5f
                    + Noise(S[0] * 2.02f + 3.1f, S[1] * 2.02f + 1.7f, S[2] * 2.02f + 9.2f) * 0.25f
                    + Noise(S[0] * 4.10f + 7.7f, S[1] * 4.10f + 2.2f, S[2] * 4.10f + 1.1f) * 0.125f
                    + Noise(S[0] * 8.3f + 1.3f, S[1] * 8.3f + 8.8f, S[2] * 8.3f + 4.4f) * 0.0625f;
        Shape /= 0.9375f;

        const float Threshold = 1.0f - Clamp(Volume.Coverage, 0.0f, 1.0f);
        const float Body = Clamp((Shape - Threshold) / std::fmax(1.0f - Threshold, 1e-3f), 0.0f, 1.0f)
                         * Profile * Mask;
        if (Body <= 0.0f || Lod > 0.5f) return Body * Volume.Density;

        // Eroding detail (REF): the same two hot octaves, but the local erosion reads no clock — its drift
        // already rode in on s. That is why this signature takes a swirl and no time.
        const float Detail = Noise(S[0] * 9.0f, S[1] * 9.0f, S[2] * 9.0f) * 0.6f
                           + Noise(S[0] * 19.0f + 5.0f, S[1] * 19.0f + 5.0f, S[2] * 19.0f + 5.0f) * 0.4f;
        const float Erode = Lerp(Detail, 1.0f - Detail, Clamp(Hn * 3.0f, 0.0f, 1.0f))
                          * Volume.ErosionDetail * 0.45f;
        return Clamp(Body - Erode * (1.0f - Body), 0.0f, 1.0f) * Volume.Density;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                                HEIGHT FOG
    //--------------------------------------------------------------------------------------------------------------------

    // Analytic, not marched: the integral of an exponential height profile along a segment has a closed form, so
    //    fog costs two exponentials rather than a loop.
    static float HeightFogOpticalDepth(const FogSettings& Fog, float StartHeight, float EndHeight,
                                       float Distance) noexcept
    {
        if (!Fog.HeightEnabled || Distance <= 0.0f) return 0.0f;
        const float H = std::fmax(Fog.FalloffHeight, 1.0f);
        const float Rise = EndHeight - StartHeight;
        if (std::fabs(Rise) < 1e-3f)
            return Fog.HeightDensity * std::exp(-StartHeight / H) * Distance;
        // ∫ exp(-z/H) ds along a straight line, parameterised by height.
        const float A = std::exp(-StartHeight / H), B = std::exp(-EndHeight / H);
        return Fog.HeightDensity * H * (A - B) * (Distance / Rise);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                            THE UNIFIED MARCH
    //--------------------------------------------------------------------------------------------------------------------

    // ⚠️ THREE marches, one per medium, each at its own pace — and every step comb is anchored to the WORLD,
    //    not to the span. An earlier revision marched the union of all three intervals in one loop (73737b6),
    //    which looked efficient and rendered three defects: the layer's steps depended on whether the box was
    //    in the union (enabling the box resampled the whole sky — a visible seam along its silhouette),
    //    neighbouring rays sampled different step phases (their spans start at different distances, so the
    //    field decorrelated vertically and the clouds smeared into horizontal streaks), and the 200 m box took
    //    ~2 of the union's 143 m steps (a smooth white blob — no texture, no self-shadow).
    //
    //    Each medium now marches its own span at half its feature scale (the layer keeps the tier's 143 m step
    //    — near enough to half its 315 m features that the tier keeps quoting it), capped by its budget; midpoint
    //    samples cover [SpanNear, SpanFar] exactly, so enabling another medium cannot stretch or resample this
    //    medium's interval. The media composite near-to-far, which is exact for disjoint spans (what parked
    //    volumes are — an editor-dragged overlap composites in span order, approximately). Fog still shadows
    //    cloud and cloud still shadows fog, because the SUN-shadow march samples the combined medium — one
    //    shadow march per occupied step, whichever loop it sits in, which is the number the gate asserts.
    static VolumetricSample March(const CloudLayerSettings& Cloud, const LocalVolumeSettings& LocalCloud,
                                  const LocalVolumeSettings& LocalFog, const WindSettings& Wind,
                                  const VolumetricBudget& Budget,
                                  const float Origin[3], const float Direction[3], float MaximumDistance,
                                  const float SunDirection[3], const float SunRadiance[3],
                                  const float AmbientRadiance[3], float Time) noexcept
    {
        VolumetricSample Result{};

        // ── Each medium's own interval ─────────────────────────────────────────────────────────────────────────
        float SlabNear = 1e30f, SlabFar = -1e30f; bool SlabHit = false;
        if (Cloud.Enabled)
        {
            float Base = 0.0f, Top = 0.0f;
            if (SlabExtent(Cloud, Base, Top))
            {
                // The slab is horizontal, so its interval is where the ray crosses the two altitudes.
                float Lo = 0.0f, Hi = 0.0f;
                if (SlabInterval(Origin[2], Direction[2], Base, Top, MaximumDistance, Lo, Hi))
                {
                    SlabNear = std::fmax(Lo, 0.0f); SlabFar = Hi; SlabHit = SlabFar > SlabNear;
                }
            }
        }
        float BoxNear = 1e30f, BoxFar = -1e30f; bool BoxHit = false;
        if (LocalCloud.Enabled
            && IntersectBox(LocalCloud.Centre, LocalCloud.HalfSize, Origin, Direction, BoxNear, BoxFar))
        {
            BoxNear = std::fmax(BoxNear, 0.0f); BoxFar = std::fmin(BoxFar, MaximumDistance);
            BoxHit = BoxFar > BoxNear;
        }
        float FogNear = 1e30f, FogFar = -1e30f; bool FogHit = false;
        if (LocalFog.Enabled
            && IntersectBox(LocalFog.Centre, LocalFog.HalfSize, Origin, Direction, FogNear, FogFar))
        {
            FogNear = std::fmax(FogNear, 0.0f); FogFar = std::fmin(FogFar, MaximumDistance);
            FogHit = FogFar > FogNear;
        }
        if (!SlabHit && !BoxHit && !FogHit) return Result;

        // March near-to-far over slab/box/fog by span start (a miss sorts last and is skipped), so an opaque
        //    nearer medium hides the rest without marching them.
        uint32_t Order[3] = { 0u, 1u, 2u };
        const float Starts[3] = { SlabHit ? SlabNear : 1e30f, BoxHit ? BoxNear : 1e30f,
                                  FogHit ? FogNear : 1e30f };
        for (uint32_t A = 1u; A < 3u; ++A)
            for (uint32_t B = A; B > 0u && Starts[Order[B]] < Starts[Order[B - 1u]]; --B)
            {
                const uint32_t Tmp = Order[B]; Order[B] = Order[B - 1u]; Order[B - 1u] = Tmp;
            }

        const float CosTheta = Direction[0] * SunDirection[0] + Direction[1] * SunDirection[1]
                             + Direction[2] * SunDirection[2];

        // The march's two per-ray constants. lodFar (REF cloudMarch) fades the erosion with slab-entry
        // distance: under 20 km full detail, past 200 km (orbit) none. The swirl (REF gSwirl) is one
        // windTurb x8 sampled 30 m along the ray, only when a linked local cloud can read it — the fog's
        // arm arrives with P8's vf port, which is the only other reader.
        const float LayerLod = SlabHit ? SmoothStep(20000.0f, 200000.0f, SlabNear) : 0.0f;
        float PixelSwirl[3] = { 0.0f, 0.0f, 0.0f };
        if (Wind.Turbulence > 0.0f && LocalCloud.Enabled && LocalCloud.FollowWind)
        {
            const float At[3] = { Origin[0] + Direction[0] * 30.0f,
                                  Origin[1] + Direction[1] * 30.0f,
                                  Origin[2] + Direction[2] * 30.0f };
            float Turb[3];
            WindField::SampleSwirl(Wind, At, Time, Turb);
            PixelSwirl[0] = Turb[0] * 8.0f; PixelSwirl[1] = Turb[1] * 8.0f; PixelSwirl[2] = Turb[2] * 8.0f;
        }

        float Transmittance = 1.0f;
        constexpr float kReferenceSpan = 4000.0f;   // [m] the span the tier's step count is quoted against
        for (uint32_t S = 0u; S < 3u; ++S)
        {
            if (Transmittance < 0.005f) break;      // an opaque nearer medium hides the rest
            const uint32_t M = Order[S];

            // The medium's span, step and phase function. The layer keeps the tier's reference step (4000 m
            //    over the tier's count — 143 m at Standard); the volumes step at half their feature scale. A
            //    longer span takes more steps rather than coarser ones (fixing the count once let added fog
            //    RAISE transmittance — more medium letting more light through, which is impossible), and the
            //    cap keeps a pathological span from running away. Midpoints cover this medium's actual interval
            //    [SpanNear, SpanFar], so no samples are spent in the empty distance before its near boundary.
            float SpanNear = 0.0f, SpanFar = 0.0f, StepSize = 1.0f, PhaseG = 0.45f;
            uint32_t Cap = 1u;
            if (M == 0u)
            {
                if (!SlabHit) continue;
                SpanNear = SlabNear; SpanFar = SlabFar;
                const uint32_t Reference = Budget.CloudSteps == 0u ? 1u : Budget.CloudSteps;
                StepSize = kReferenceSpan / static_cast<float>(Reference);
                Cap = Reference * 4u;               // never more than 4x the tier's budget
                PhaseG = Cloud.Anisotropy;
            }
            else if (M == 1u)
            {
                if (!BoxHit) continue;
                SpanNear = BoxNear; SpanFar = BoxFar;
                StepSize = std::fmax(LocalCloud.Scale * 0.5f, 1.0f);
                Cap = Budget.LocalSteps == 0u ? 1u : Budget.LocalSteps;
                PhaseG = LocalCloud.Anisotropy;
            }
            else
            {
                if (!FogHit) continue;
                SpanNear = FogNear; SpanFar = FogFar;
                StepSize = std::fmax(LocalFog.Scale * 0.5f, 1.0f);
                Cap = Budget.LocalSteps == 0u ? 1u : Budget.LocalSteps;
                PhaseG = LocalFog.Anisotropy;
            }
            // Sample the actual medium span, not the empty distance from the eye to its far face. The old zero
            //    anchor made a near cloud use most of its samples in clear air and made an orbital view pay for
            //    thousands of below-slab samples; both cases then had too few samples where density changed.
            //    A span-relative midpoint grid keeps the cloud edges stable when another volume appears and gives
            //    each medium the resolution promised by its own budget. The cap is only a safety bound for a
            //    grazing ray; it cannot turn a short cloud into a one-step white blob.
            const float Span = SpanFar - SpanNear;
            uint32_t Count = static_cast<uint32_t>(std::ceil(Span / StepSize));
            if (Count < 1u) Count = 1u;
            if (Count > Cap) Count = Cap;
            const float ActualStep = Span / static_cast<float>(Count);
            const float Phase = HenyeyGreenstein(CosTheta, PhaseG);
            // The reference jitters the march start per ray (t=t0+dt*hash13) so adjacent rays sample
            //    different phases instead of contouring into bands. The seed is the ray direction —
            //    bounces have no pixel to hash — plus the clock's third-of-a-second fraction, through the
            //    same hash13; layer only, like the reference (marchLocal never jitters). The uniform shift
            //    absorbs the midpoint: (I+Jitter) is the shifted regular grid in both twins.
            const float Jitter = M == 0u ? MarchJitter(Direction, Time) : 0.5f;

            for (uint32_t I = 0u; I < Count; ++I)
            {
                const float T = SpanNear + (static_cast<float>(I) + Jitter) * ActualStep;
                const float P[3] = { Origin[0] + Direction[0] * T,
                                     Origin[1] + Direction[1] * T,
                                     Origin[2] + Direction[2] * T };
                ++Result.StepsTaken;

                float Density = 0.0f;
                if (M == 0u)      Density = CloudDensity(Cloud, Wind, P, Time, LayerLod);
                else if (M == 1u) Density = LocalDensity(LocalCloud, Wind, P, PixelSwirl, 0.0f, false);
                else              Density = LocalDensity(LocalFog, Wind, P, PixelSwirl, 0.0f, true);
                if (Density <= 1e-5f) continue;

                // Sun visibility, marched once for the combined medium — fog shadows cloud and cloud shadows
                //    fog for free, whichever loop this step sits in.
                const float SunTransmittance = ShadowMarch(Cloud, LocalCloud, LocalFog, Wind, P, SunDirection,
                                                     Budget.LightTaps, Time, PixelSwirl);
                ++Result.ShadowMarches;

                // The reference's extinction scales (panel optical-depth readout: tau = den x depth x .06):
                // cloud .06 with the layer's absorption (marchLocal folds it into the local weight too), fog
                // keeps its own .01 — it is not vf, and P8 re-derives its scale with vfDensity.
                const float Sigma = M == 2u ? 0.01f : (1.0f + Cloud.Absorption) * 0.06f;
                const float Extinction = Density * ActualStep * Sigma;
                const float StepTransmittance = std::exp(-Extinction);
                for (int C = 0; C < 3; ++C)
                {
                    // Each medium its own albedo: the layer owns its white now (it used the box's), the fog
                    //    keeps its fixed grey (the old blend's fog end).
                    float Albedo = 0.88f;
                    if (M == 0u)      Albedo = Cloud.Albedo[C];
                    else if (M == 1u) Albedo = LocalCloud.Albedo[C];
                    const float In = (SunRadiance[C] * SunTransmittance * Phase + AmbientRadiance[C]) * Albedo;
                    Result.Scatter[C] += In * (1.0f - StepTransmittance) * Transmittance;
                }
                Transmittance *= StepTransmittance;
                if (Transmittance < 0.005f) break;  // fully occluded; nothing behind matters
            }
        }

        Result.Transmittance = Transmittance;
        return Result;
    }

    static float HenyeyGreenstein(float CosTheta, float G) noexcept
    {
        constexpr float kPi = 3.14159265358979323846f;
        const float Denominator = 1.0f + G * G - 2.0f * G * CosTheta;
        return (1.0f - G * G) / (4.0f * kPi * std::pow(std::fmax(Denominator, 1e-4f), 1.5f));
    }

    static float Clamp(float V, float Lo, float Hi) noexcept { return V < Lo ? Lo : (V > Hi ? Hi : V); }
    static float Lerp(float A, float B, float T) noexcept { return A + (B - A) * T; }
    static float SmoothStep(float E0, float E1, float V) noexcept
    {
        const float T = Clamp((V - E0) / (E1 - E0), 0.0f, 1.0f);
        return T * T * (3.0f - 2.0f * T);
    }

    // Where a ray crosses a horizontal slab between two altitudes. Both branches cut the exit at the far
    //    cap: without it a grazing ray stretches its bounded steps over hundreds of kilometres of chord and
    //    shades the horizon as mush.
    static bool SlabInterval(float OriginZ, float DirectionZ, float Base, float Top, float Maximum,
                             float& Near, float& Far) noexcept
    {
        if (std::fabs(DirectionZ) < 1e-6f)
        {
            if (OriginZ < Base || OriginZ > Top) return false;
            Near = 0.0f; Far = Maximum;
            Far = std::fmin(Far, Near + SlabFarCap(OriginZ, Base, Top));
            return Far > Near;
        }
        float T1 = (Base - OriginZ) / DirectionZ;
        float T2 = (Top - OriginZ) / DirectionZ;
        if (T1 > T2) { const float Swap = T1; T1 = T2; T2 = Swap; }
        Near = std::fmax(T1, 0.0f);
        Far  = std::fmin(T2, Maximum);
        Far  = std::fmin(Far, Near + SlabFarCap(OriginZ, Base, Top));
        return Far > Near;
    }

    // One box's sun-shadow quadrature (P2.4b): uniShadow's linear taps — d = st*i*.5 off the widest
    //    half-size (x.25 cloud, x.5 fog), weight st*.5, fixed 4. The cloud carries the layer's absorption
    //    in its weight like marchLocal; the fog keeps its own .01 scale (it is not vf — P8 re-derives
    //    this weight with vfDensity). Lod 1: the shadow always skips erosion, like the reference.
    static float ShadowBox(const LocalVolumeSettings& Volume, const WindSettings& Wind,
                           const float Position[3], const float SunDirection[3],
                           const float Swirl[3], float Absorption, bool IsFog) noexcept
    {
        const float Widest = std::fmax(Volume.HalfSize[0], std::fmax(Volume.HalfSize[1], Volume.HalfSize[2]));
        const float St = Widest * (IsFog ? 0.5f : 0.25f);
        const float Weight = St * 0.5f * (IsFog ? 0.01f : (1.0f + Absorption) * 0.06f);
        float Depth = 0.0f;
        for (uint32_t I = 1u; I <= 4u; ++I)
        {
            const float D = St * static_cast<float>(I) * 0.5f;
            const float Q[3] = { Position[0] + SunDirection[0] * D,
                                 Position[1] + SunDirection[1] * D,
                                 Position[2] + SunDirection[2] * D };
            Depth += LocalDensity(Volume, Wind, Q, Swirl, 1.0f, IsFog) * Weight;
            // Past opaque, further taps change transmittance by under 2% — invisible, so stop paying.
            // (P2.4c revisits this: the multi-scatter octaves read optical depth past 4.)
            if (Depth > 4.0f) break;
        }
        return std::exp(-Depth);
    }

    // The sun-shadow march (P2.4b): the layer marches clLight's growing-spaced taps (d = st*i²*.35 off
    //    st = thick*.12, weight d*.8, the tier's count, far taps coarse); each box marches ShadowBox.
    //    No view step leaks in — the shadow paces each medium's own size, so one sun ray shades one way
    //    no matter which loop calls. Per-medium transmittances multiply (depths add under the exponential).
    //    The layer's absorption returns with the multi-scatter loop (P2.4c); clLight's od carries none.
    static float ShadowMarch(const CloudLayerSettings& Cloud, const LocalVolumeSettings& LocalCloud,
                             const LocalVolumeSettings& LocalFog, const WindSettings& Wind,
                             const float Position[3], const float SunDirection[3],
                             uint32_t Taps, float Time, const float Swirl[3]) noexcept
    {
        float Result = 1.0f;
        if (Cloud.Enabled)
        {
            float Base, Top;
            if (SlabExtent(Cloud, Base, Top))
            {
                const float St = (Top - Base) * 0.12f;
                float Depth = 0.0f;
                for (uint32_t I = 1u; I <= 5u; ++I)
                {
                    if (I > Taps) break;
                    const float F = static_cast<float>(I);
                    const float D = St * F * F * 0.35f;
                    const float Q[3] = { Position[0] + SunDirection[0] * D,
                                         Position[1] + SunDirection[1] * D,
                                         Position[2] + SunDirection[2] * D };
                    Depth += CloudDensity(Cloud, Wind, Q, Time, I > 2u ? 1.0f : 0.0f) * D * 0.8f;
                    if (Depth > 4.0f) break;
                }
                Result *= std::exp(-Depth);
            }
        }
        if (LocalCloud.Enabled)
            Result *= ShadowBox(LocalCloud, Wind, Position, SunDirection, Swirl, Cloud.Absorption, false);
        if (LocalFog.Enabled)
            Result *= ShadowBox(LocalFog, Wind, Position, SunDirection, Swirl, Cloud.Absorption, true);
        return Result;
    }

private:
    // Per-ray march-phase jitter in [0,1): hash13 over the spread direction plus the wall-clock fraction.
    //    The 317.19 spread puts adjacent-pixel directions (~0.003 apart) ~0.1 hash cells apart so they
    //    decorrelate; fract(Time*3) re-rolls the dither three times a second like the reference — and a
    //    static frame keeps a static dither while Tick stands still, so stills never shimmer. (Time is
    //    wall-clock seconds — P2.2 decoupled the march from LocalHours; the drift reads Wind.Integral.)
    static float MarchJitter(const float Direction[3], float Time) noexcept
    {
        const float Frame = Time * 3.0f;
        return Hash(Direction[0] * 317.19f, Direction[1] * 317.19f, Frame - std::floor(Frame));
    }

    // The reference hash13 (Hoskins' fract-only form — no sine, so no large-coordinate banding):
    // p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z). Twinned verbatim (same op
    //    order, so bit-identical on the CPU side) in WindField::Hash, SkyRecords.slang CloudHash and the
    //    kernel proof's TwinHash.
    static float Hash(float X, float Y, float Z) noexcept
    {
        float Px = X * 0.1031f, Py = Y * 0.1031f, Pz = Z * 0.1031f;
        Px -= std::floor(Px); Py -= std::floor(Py); Pz -= std::floor(Pz);
        const float D = Px * (Pz + 31.32f) + Py * (Py + 31.32f) + Pz * (Px + 31.32f);
        Px += D; Py += D; Pz += D;
        const float H = (Px + Py) * Pz;
        return H - std::floor(H);
    }

    // Trilinear value noise over hash13 — [0,1] like the reference vnoise. The old [-1,1] roundtrip died
    //    with the sin hash: every caller maps the shape straight into its own remap now.
    static float Noise(float X, float Y, float Z) noexcept
    {
        const float Ix = std::floor(X), Iy = std::floor(Y), Iz = std::floor(Z);
        const float Fx = X - Ix, Fy = Y - Iy, Fz = Z - Iz;
        const float Ux = Fx * Fx * (3.0f - 2.0f * Fx);
        const float Uy = Fy * Fy * (3.0f - 2.0f * Fy);
        const float Uz = Fz * Fz * (3.0f - 2.0f * Fz);
        const float N000 = Hash(Ix, Iy, Iz),         N100 = Hash(Ix + 1, Iy, Iz);
        const float N010 = Hash(Ix, Iy + 1, Iz),     N110 = Hash(Ix + 1, Iy + 1, Iz);
        const float N001 = Hash(Ix, Iy, Iz + 1),     N101 = Hash(Ix + 1, Iy, Iz + 1);
        const float N011 = Hash(Ix, Iy + 1, Iz + 1), N111 = Hash(Ix + 1, Iy + 1, Iz + 1);
        const float X00 = N000 + (N100 - N000) * Ux, X10 = N010 + (N110 - N010) * Ux;
        const float X01 = N001 + (N101 - N001) * Ux, X11 = N011 + (N111 - N011) * Ux;
        const float Y0 = X00 + (X10 - X00) * Uy,     Y1 = X01 + (X11 - X01) * Uy;
        return Y0 + (Y1 - Y0) * Uz;
    }
};

} // namespace Frontier
