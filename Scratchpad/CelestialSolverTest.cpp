//============================================================================================================================================
// 🔭 Scratchpad/CelestialSolverTest.cpp — does the sun actually go where the almanac says it goes?
//============================================================================================================================================
// This includes the PRODUCTION header, not a copy of it. If Engine/DisplayPresentation/CelestialSolver.h changes,
// this test changes with it or it fails. Everything asserted below is either a published ephemeris value or an
// invariant that must hold for the renderer to behave (frame handedness, exposure independence, continuity).
//
// Build:  g++ -std=c++20 -O2 -I. Scratchpad/CelestialSolverTest.cpp -o /tmp/CelestialSolverTest

#include "Engine/DisplayPresentation/CelestialSolver.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <array>
#include <algorithm>

using namespace Frontier;

namespace {

int FailureCount = 0;
int CheckCount   = 0;

void Check(bool Condition, const std::string& Label, const std::string& Detail)
{
    ++CheckCount;
    if (Condition) { std::printf("  PASS  %-52s %s\n", Label.c_str(), Detail.c_str()); }
    else           { std::printf("  FAIL  %-52s %s\n", Label.c_str(), Detail.c_str()); ++FailureCount; }
}

void CheckNear(double Actual, double Expected, double Tolerance, const std::string& Label, const char* Unit)
{
    char Detail[256];
    std::snprintf(Detail, sizeof(Detail), "got %.4f %s, expected %.4f +/- %.4f",
                  Actual, Unit, Expected, Tolerance);
    Check(std::fabs(Actual - Expected) <= Tolerance, Label, Detail);
}

CelestialStructure MakeSettings(int32_t Year, int32_t Month, int32_t Day,
                                float LocalHours, float UtcOffset,
                                float Latitude, float Longitude)
{
    CelestialStructure Settings{};
    Settings.Observation.Year       = Year;
    Settings.Observation.Month      = Month;
    Settings.Observation.Day        = Day;
    Settings.Observation.LocalHours = LocalHours;
    Settings.Observation.UtcOffset  = UtcOffset;
    Settings.Observation.Latitude   = Latitude;
    Settings.Observation.Longitude  = Longitude;
    return Settings;
}

void Section(const char* Title)
{
    std::printf("\n-- %s ---------------------------------------------------------\n", Title);
}

} // namespace

//============================================================================================================================================

int main()
{
    std::printf("========================================================================\n");
    std::printf(" CELESTIAL SOLVER — sun and moon positions against published ephemerides\n");
    std::printf("========================================================================\n");

    //----------------------------------------------------------------------------------------------------------------
    Section("1. JULIAN DAY against tabulated epochs");
    //----------------------------------------------------------------------------------------------------------------
    // These four are textbook (Meeus ch.7). If JD is wrong, every angle below is wrong in a way that looks subtle.

    CheckNear(JulianDayFromCalendar(2000, 1, 1, 12.0), 2451545.0, 1e-6, "J2000.0 epoch", "JD");
    CheckNear(JulianDayFromCalendar(1999, 1, 1,  0.0), 2451179.5, 1e-6, "1999 Jan 1.0", "JD");
    CheckNear(JulianDayFromCalendar(1987, 1, 27, 0.0), 2446822.5, 1e-6, "1987 Jan 27.0", "JD");
    CheckNear(JulianDayFromCalendar(2026, 9, 13, 0.0), 2461296.5, 1e-6, "2026 Sep 13.0 (today)", "JD");

    //----------------------------------------------------------------------------------------------------------------
    Section("2. SIDEREAL TIME");
    //----------------------------------------------------------------------------------------------------------------
    // Meeus example 12a: 1987 April 10, 0h UT → GMST 197.693195 deg.
    CheckNear(GreenwichMeanSiderealDegrees(JulianDayFromCalendar(1987, 4, 10, 0.0)),
              197.693195, 0.01, "GMST, Meeus example 12a", "deg");

    //----------------------------------------------------------------------------------------------------------------
    Section("3. THE SUN — solstices, equinoxes, and the local sky");
    //----------------------------------------------------------------------------------------------------------------
    // Solar declination is the cleanest check there is: it is +23.44 at the June solstice, -23.44 at December,
    // and ~0 at the equinoxes, regardless of observer. Tolerance 0.2 deg covers the low-precision series and the
    // fact that the solstice instant is not exactly at midnight.

    CheckNear(SolveSunEquatorial(JulianDayFromCalendar(2026, 6, 21, 12.0)).DeclinationDegrees,
              23.44, 0.2, "declination at the June solstice", "deg");
    CheckNear(SolveSunEquatorial(JulianDayFromCalendar(2026, 12, 21, 12.0)).DeclinationDegrees,
              -23.44, 0.2, "declination at the December solstice", "deg");
    CheckNear(SolveSunEquatorial(JulianDayFromCalendar(2026, 3, 20, 12.0)).DeclinationDegrees,
              0.0, 0.5, "declination at the March equinox", "deg");
    CheckNear(SolveSunEquatorial(JulianDayFromCalendar(2026, 9, 23, 12.0)).DeclinationDegrees,
              0.0, 0.5, "declination at the September equinox", "deg");

    // Local solar noon at Benoni (-26.19, +28.32), the user's own location, on the June (winter, southern) solstice.
    // Sun crosses the meridian to the NORTH from the southern hemisphere: azimuth ~0/360, altitude = 90 - |lat| - 23.44.
    // ⚠️ SOLAR NOON IS NOT CLOCK NOON. The obvious test — sample at 12:00 corrected for longitude — failed by
    //    4.6 deg of azimuth, and the failure was the TEST's, not the solver's: the equation of time shifts the
    //    sun's meridian crossing by up to +/-16 minutes across the year, which is up to 4 deg of hour angle. So
    //    find the transit the way an observer would, by looking for the moment the sun is highest, then assert the
    //    two things that are true at ANY transit: altitude = 90 - |latitude - declination|, and azimuth exactly
    //    due north (southern hemisphere, sun north of the zenith).
    auto FindTransit = [](int32_t Month, int32_t Day) {
        CelestialSolution Best{};
        Best.SunElevationDegrees = -1e9f;
        for (int Second = 0; Second < 24 * 3600; Second += 2)
        {
            const CelestialStructure Settings = MakeSettings(
                2026, Month, Day, static_cast<float>(Second) / 3600.0f, 2.0f, -26.19f, 28.32f);
            const CelestialSolution S = SolveCelestial(Settings);
            if (S.SunElevationDegrees > Best.SunElevationDegrees) Best = S;
        }
        return Best;
    };
    {
        const CelestialSolution S = FindTransit(6, 21);
        // June solstice = southern WINTER: declination is +23.44, i.e. the sun is as far from this latitude as
        //    it ever gets, so the transit is at its LOWEST. 90 - |-26.19 - 23.44| = 40.37 deg.
        CheckNear(S.SunElevationDegrees, 90.0 - std::fabs(-26.19 - 23.44), 0.15,
                  "Benoni winter-solstice transit altitude (lowest noon of the year)", "deg");
        const double AzimuthFromNorth = std::fmod(S.SunAzimuthDegrees + 180.0, 360.0) - 180.0;
        CheckNear(AzimuthFromNorth, 0.0, 0.2, "winter-solstice transit is due NORTH", "deg");
    }
    {
        const CelestialSolution S = FindTransit(12, 21);
        // December solstice = southern SUMMER: declination -23.44, nearly overhead at -26.19. 87.25 deg.
        CheckNear(S.SunElevationDegrees, 90.0 - std::fabs(-26.19 - (-23.44)), 0.15,
                  "Benoni summer-solstice transit altitude (highest noon of the year)", "deg");
        const double AzimuthFromNorth = std::fmod(S.SunAzimuthDegrees + 180.0, 360.0) - 180.0;
        CheckNear(AzimuthFromNorth, 0.0, 0.2, "summer-solstice transit is due NORTH", "deg");
    }

    // Midnight must put the sun below the horizon. Obvious, and exactly the sort of sign error that ships.
    {
        const CelestialStructure Midnight = MakeSettings(2026, 9, 13, 0.0f, 2.0f, -26.19f, 28.32f);
        const CelestialSolution  S        = SolveCelestial(Midnight);
        Check(S.SunElevationDegrees < -20.0f, "midnight puts the sun well below the horizon",
              "elevation " + std::to_string(S.SunElevationDegrees) + " deg");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("4. FRAME — ENU handedness and the east/west sanity test");
    //----------------------------------------------------------------------------------------------------------------
    // The single most consequential thing to get right: morning sun in the EAST (+X), afternoon sun in the WEST (-X).
    // A sign flip here renders a world where shadows run the wrong way all day and nothing else complains.
    {
        const float LongitudeHours = 28.32f / 15.0f;
        const CelestialStructure Morning   = MakeSettings(2026, 9, 13,  9.0f + LongitudeHours - 2.0f, 2.0f, -26.19f, 28.32f);
        const CelestialStructure Afternoon = MakeSettings(2026, 9, 13, 15.0f + LongitudeHours - 2.0f, 2.0f, -26.19f, 28.32f);

        const CelestialSolution M = SolveCelestial(Morning);
        const CelestialSolution A = SolveCelestial(Afternoon);

        Check(M.SunDirection[0] > 0.2f, "09:00 sun is in the EAST (+X)",
              "x = " + std::to_string(M.SunDirection[0]));
        Check(A.SunDirection[0] < -0.2f, "15:00 sun is in the WEST (-X)",
              "x = " + std::to_string(A.SunDirection[0]));
        Check(M.SunDirection[2] > 0.0f && A.SunDirection[2] > 0.0f,
              "both daytime samples are above the horizon (+Z)",
              "z = " + std::to_string(M.SunDirection[2]) + " / " + std::to_string(A.SunDirection[2]));
        // Southern hemisphere: the sun's daily path passes to the north, so +Y for both.
        Check(M.SunDirection[1] > 0.0f && A.SunDirection[1] > 0.0f,
              "southern-hemisphere sun tracks NORTH (+Y)",
              "y = " + std::to_string(M.SunDirection[1]) + " / " + std::to_string(A.SunDirection[1]));
    }

    // Every direction the solver produces must be a unit vector; the shader normalises nothing.
    {
        double WorstError = 0.0;
        for (int Hour = 0; Hour < 24; ++Hour)
        {
            const CelestialSolution S = SolveCelestial(
                MakeSettings(2026, 9, 13, static_cast<float>(Hour), 2.0f, -26.19f, 28.32f));
            for (const float* D : { S.SunDirection, S.MoonDirection })
            {
                const double Length = std::sqrt(static_cast<double>(D[0]) * D[0] +
                                                static_cast<double>(D[1]) * D[1] +
                                                static_cast<double>(D[2]) * D[2]);
                WorstError = std::max(WorstError, std::fabs(Length - 1.0));
            }
        }
        CheckNear(WorstError, 0.0, 1e-5, "all 48 direction vectors are unit length", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("5. THE MOON");
    //----------------------------------------------------------------------------------------------------------------
    // The truncated Meeus series is good to a few arcminutes in longitude and a few thousand km in distance.
    // Distance must stay inside the real perigee/apogee envelope, and declination inside +/- 28.6 deg always.
    {
        double MinimumDistance = 1e12, MaximumDistance = 0.0, WorstDeclination = 0.0;
        for (int Day = 0; Day < 60; ++Day)
        {
            const double JulianDay = JulianDayFromCalendar(2026, 9, 13, 0.0) + static_cast<double>(Day);
            const EquatorialPosition M = SolveMoonEquatorial(JulianDay);
            MinimumDistance  = std::min(MinimumDistance, M.DistanceKilometres);
            MaximumDistance  = std::max(MaximumDistance, M.DistanceKilometres);
            WorstDeclination = std::max(WorstDeclination, std::fabs(M.DeclinationDegrees));
        }
        Check(MinimumDistance > 355000.0 && MinimumDistance < 372000.0, "lunar perigee is physical",
              std::to_string(static_cast<int>(MinimumDistance)) + " km (real 356500-370400)");
        Check(MaximumDistance > 398000.0 && MaximumDistance < 410000.0, "lunar apogee is physical",
              std::to_string(static_cast<int>(MaximumDistance)) + " km (real 404000-406700)");
        Check(WorstDeclination < 29.0, "lunar declination stays within +/-28.6 deg",
              "peak " + std::to_string(WorstDeclination) + " deg");
    }

    // Phase must sweep the full new→full→new range over a synodic month and be consistent with the elongation.
    {
        float MinimumIlluminated = 2.0f, MaximumIlluminated = -1.0f;
        double WorstPhaseError = 0.0;
        for (int Hour = 0; Hour < 30 * 24; Hour += 3)
        {
            CelestialStructure Settings = MakeSettings(2026, 9, 13, 0.0f, 2.0f, -26.19f, 28.32f);
            Settings.Observation.LocalHours = static_cast<float>(Hour % 24);
            Settings.Observation.Day        = 13 + (Hour / 24);
            const CelestialSolution S = SolveCelestial(Settings);

            MinimumIlluminated = std::min(MinimumIlluminated, S.MoonIlluminated);
            MaximumIlluminated = std::max(MaximumIlluminated, S.MoonIlluminated);

            // Illuminated fraction and elongation must agree: k = (1 - cos(elongation)) / 2, exactly.
            const double Expected = (1.0 - std::cos(S.SunMoonAngleDegrees * kDegreesToRadians)) * 0.5;
            WorstPhaseError = std::max(WorstPhaseError, std::fabs(Expected - S.MoonIlluminated));
        }
        Check(MinimumIlluminated < 0.05f, "the moon reaches new (nearly unlit)",
              "minimum lit fraction " + std::to_string(MinimumIlluminated));
        Check(MaximumIlluminated > 0.95f, "the moon reaches full",
              "maximum lit fraction " + std::to_string(MaximumIlluminated));
        CheckNear(WorstPhaseError, 0.0, 1e-6, "lit fraction agrees with the elongation it came from", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("6. EXPOSURE — the camera cannot change it (the F3 guarantee)");
    //----------------------------------------------------------------------------------------------------------------
    // 🔴 THE HEADLINE CHECK. SolveCelestialEv100 takes an elevation and settings. There is no camera in the
    //    signature, so a fixed sun gives a fixed gain no matter where the player looks. Assert the numbers.
    {
        CelestialStructure Settings = MakeSettings(2026, 9, 13, 12.0f, 2.0f, -26.19f, 28.32f);
        Settings.Exposure.ExposureBias = 0.0f;

        const CelestialSolution Reference = SolveCelestial(Settings);
        double WorstGainDrift = 0.0;
        for (int Sample = 0; Sample < 64; ++Sample)
        {
            // Nothing about the camera is an input, so the only way to "move the camera" is to re-solve and see
            //    that the answer is bit-identical. Re-solving 64 times stands in for 64 camera orientations.
            const CelestialSolution S = SolveCelestial(Settings);
            WorstGainDrift = std::max(WorstGainDrift,
                std::fabs(static_cast<double>(S.ExposureGain) - Reference.ExposureGain));
        }
        Check(WorstGainDrift == 0.0, "exposure gain is bit-identical across 64 re-solves",
              "drift " + std::to_string(WorstGainDrift));
    }

    // The physical anchors. Full sun ~15 EV, sunset ~9 EV, deep night ~-6 EV.
    {
        CelestialExposure Neutral{};
        Neutral.ExposureBias = 0.0f;
        Neutral.NightBias    = 0.0f;

        CheckNear(SolveCelestialEv100(90.0f, Neutral), 15.0, 0.01, "zenith sun is EV100 15 (sunny 16)", "EV");
        CheckNear(SolveCelestialEv100( 0.0f, Neutral),  9.0, 0.01, "horizon sun is EV100 9 (sunset)", "EV");
        CheckNear(SolveCelestialEv100(-18.0f, Neutral), -6.0, 0.01, "astronomical night is EV100 -6", "EV");
        CheckNear(SolveCelestialEv100(-40.0f, Neutral), -6.0, 0.01, "deeper than -18 deg stays at the night floor", "EV");
    }

    // Continuity: scrubbing the clock must not produce a step. Sample elevation finely across the sunset seam and
    //    assert no jump above 0.05 EV between neighbouring samples. A visible pop at sunset is a reported class of
    //    bug in day/night systems and it comes from exactly this kind of piecewise fit.
    {
        CelestialExposure Neutral{};
        Neutral.ExposureBias = 0.0f;
        Neutral.NightBias    = 0.0f;

        double WorstStep = 0.0;
        double WorstAt   = 0.0;
        float  Previous  = SolveCelestialEv100(-30.0f, Neutral);
        for (int Step = 1; Step <= 12000; ++Step)
        {
            const float Elevation = -30.0f + static_cast<float>(Step) * 0.01f;
            const float Current   = SolveCelestialEv100(Elevation, Neutral);
            const double Delta    = std::fabs(static_cast<double>(Current) - Previous);
            if (Delta > WorstStep) { WorstStep = Delta; WorstAt = Elevation; }
            Previous = Current;
        }
        Check(WorstStep < 0.05, "EV curve is continuous across -30..+90 deg (no sunset pop)",
              "largest step " + std::to_string(WorstStep) + " EV at " + std::to_string(WorstAt) + " deg");
    }

    // Monotonic: brighter sun must never mean a larger gain. If this inverts anywhere, midday goes dark.
    {
        CelestialExposure Neutral{};
        Neutral.ExposureBias = 0.0f;
        Neutral.NightBias    = 0.0f;

        bool Monotonic = true;
        float PreviousGain = ExposureGainFromEv100(SolveCelestialEv100(-30.0f, Neutral));
        for (int Step = 1; Step <= 1200; ++Step)
        {
            const float Elevation = -30.0f + static_cast<float>(Step) * 0.1f;
            const float Gain      = ExposureGainFromEv100(SolveCelestialEv100(Elevation, Neutral));
            if (Gain > PreviousGain + 1e-12f) { Monotonic = false; break; }
            PreviousGain = Gain;
        }
        Check(Monotonic, "exposure gain falls monotonically as the sun rises", "no inversion found");
    }

    // A full 24-hour scrub: gain must vary by a large, physical amount between night and noon, and the elevation
    //    that drives it must be the only reason.
    {
        float MinimumEv = 1e9f, MaximumEv = -1e9f;
        for (int Minute = 0; Minute < 24 * 60; Minute += 5)
        {
            CelestialStructure Settings = MakeSettings(2026, 9, 13, static_cast<float>(Minute) / 60.0f,
                                                       2.0f, -26.19f, 28.32f);
            Settings.Exposure.ExposureBias = 0.0f;
            const CelestialSolution S = SolveCelestial(Settings);
            MinimumEv = std::min(MinimumEv, S.ExposureEv100);
            MaximumEv = std::max(MaximumEv, S.ExposureEv100);
        }
        Check(MaximumEv - MinimumEv > 15.0f, "a full day spans more than 15 stops",
              std::to_string(MinimumEv) + " to " + std::to_string(MaximumEv) + " EV");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("7. STARS — the sky must turn with the clock");
    //----------------------------------------------------------------------------------------------------------------
    // One sidereal day is 23h56m, so 24h of clock advances the star rotation by slightly more than a full turn.
    {
        const CelestialSolution A = SolveCelestial(MakeSettings(2026, 9, 13,  0.0f, 2.0f, -26.19f, 28.32f));
        CelestialStructure Next   = MakeSettings(2026, 9, 14,  0.0f, 2.0f, -26.19f, 28.32f);
        const CelestialSolution B = SolveCelestial(Next);

        // StarRotationRadians is an ANGLE, wrapped to one turn — it is fed to a rotation, so wrapping is correct
        //    and keeps float precision from rotting after a few in-game years. Compare it the way an angle must be
        //    compared: modulo a full turn. Over one solar day the sky over-rotates by 360.9856/360 turns, i.e. it
        //    comes back 0.9856 deg further along, which is the 3m56s by which a sidereal day is short.
        const double Turn      = 2.0 * kCelestialPi;
        double       Advance   = std::fmod(B.StarRotationRadians - A.StarRotationRadians, Turn);
        if (Advance < 0.0) Advance += Turn;
        CheckNear(Advance * kRadiansToDegrees, 0.98564736629, 0.01,
                  "one solar day over-rotates the sky by 0.9856 deg (sidereal)", "deg");

        const CelestialSolution Hour = SolveCelestial(MakeSettings(2026, 9, 13, 1.0f, 2.0f, -26.19f, 28.32f));
        Check(std::fabs(Hour.StarRotationRadians - A.StarRotationRadians) > 0.2f,
              "one hour visibly rotates the star field",
              std::to_string(Hour.StarRotationRadians - A.StarRotationRadians) + " rad");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("8. PROPERTY TABLE — every slider reaches a real field");
    //----------------------------------------------------------------------------------------------------------------
    {
        CelestialStructure Settings{};
        bool AllInRange   = true;
        bool AllOffsetsOk = true;
        bool AllOrdered   = true;

        for (size_t Index = 0; Index < kCelestialPropertyCount; ++Index)
        {
            const CelestialProperty& Property = kCelestialProperties[Index];
            if (Property.Offset + sizeof(float) > sizeof(CelestialStructure)) AllOffsetsOk = false;
            if (!(Property.Minimum < Property.Maximum))                       AllOrdered   = false;

            if (Property.Kind == CelestialPropertyKind::Real)
            {
                const float Default = ReadCelestialReal(Settings, Property);
                if (Default < Property.Minimum || Default > Property.Maximum) 
                {
                    AllInRange = false;
                    std::printf("        out of range: %s = %g not in [%g, %g]\n",
                                Property.Path, Default, Property.Minimum, Property.Maximum);
                }
            }
        }

        Check(kCelestialPropertyCount >= 45, "the table exposes the full control surface",
              std::to_string(kCelestialPropertyCount) + " properties");
        Check(AllOffsetsOk, "every property offset lands inside CelestialStructure", "");
        Check(AllOrdered, "every slider range is non-empty and correctly ordered", "");
        Check(AllInRange, "every default sits inside its own advertised slider range", "");

        // No duplicate paths — two sliders writing different fields under one name is unfixable from the UI.
        bool Unique = true;
        for (size_t A = 0; A < kCelestialPropertyCount && Unique; ++A)
            for (size_t B = A + 1; B < kCelestialPropertyCount; ++B)
                if (std::strcmp(kCelestialProperties[A].Path, kCelestialProperties[B].Path) == 0 ||
                    kCelestialProperties[A].Offset == kCelestialProperties[B].Offset)
                { Unique = false; std::printf("        duplicate: %s\n", kCelestialProperties[A].Path); break; }
        Check(Unique, "no two properties share a path or a field", "");

        // Writes must clamp rather than store garbage: a hand-typed TOML must not be able to NaN the sky.
        size_t CoverageIndex = 0;
        for (size_t I = 0; I < kCelestialPropertyCount; ++I)
            if (std::strcmp(kCelestialProperties[I].Path, "clouds.coverage") == 0) { CoverageIndex = I; break; }
        const CelestialProperty& Coverage = kCelestialProperties[CoverageIndex];
        WriteCelestialReal(Settings, Coverage, 9999.0f);
        CheckNear(ReadCelestialReal(Settings, Coverage), Coverage.Maximum, 1e-6, "an absurd value clamps to the maximum", "");
        WriteCelestialReal(Settings, Coverage, -9999.0f);
        CheckNear(ReadCelestialReal(Settings, Coverage), Coverage.Minimum, 1e-6, "an absurd value clamps to the minimum", "");
    }

    //----------------------------------------------------------------------------------------------------------------
    Section("9. DYNAMISM — nothing is baked");
    //----------------------------------------------------------------------------------------------------------------
    // Every minute of the day must give a genuinely different sun direction. A cached or quantised solve would show
    //    up here as repeated vectors.
    {
        int    Repeats = 0;
        double SmallestSeparationDegrees = 1e9;
        std::vector<std::array<float, 3>> Directions;
        for (int Minute = 0; Minute < 24 * 60; ++Minute)
        {
            const CelestialSolution S = SolveCelestial(
                MakeSettings(2026, 9, 13, static_cast<float>(Minute) / 60.0f, 2.0f, -26.19f, 28.32f));
            Directions.push_back({ S.SunDirection[0], S.SunDirection[1], S.SunDirection[2] });
        }
        for (size_t I = 1; I < Directions.size(); ++I)
        {
            const double Dot =
                static_cast<double>(Directions[I][0]) * Directions[I - 1][0] +
                static_cast<double>(Directions[I][1]) * Directions[I - 1][1] +
                static_cast<double>(Directions[I][2]) * Directions[I - 1][2];
            const double Separation = std::acos(Dot > 1.0 ? 1.0 : Dot) * kRadiansToDegrees;
            if (Separation < 1e-6) ++Repeats;
            SmallestSeparationDegrees = std::min(SmallestSeparationDegrees, Separation);
        }
        Check(Repeats == 0, "no two consecutive minutes share a sun direction",
              std::to_string(Repeats) + " repeats");
        Check(SmallestSeparationDegrees > 0.2, "the sun moves at least 0.2 deg per minute of clock",
              "smallest step " + std::to_string(SmallestSeparationDegrees) + " deg");
    }

    //----------------------------------------------------------------------------------------------------------------
    std::printf("\n========================================================================\n");
    std::printf(" %d checks, %d failures\n", CheckCount, FailureCount);
    std::printf("========================================================================\n");
    return FailureCount == 0 ? 0 : 1;
}
