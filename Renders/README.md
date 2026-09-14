# Celestial renders — P1..P4

Every lighting value in these images is produced by the **shipping shader source**, evaluated on the CPU.
`Scratchpad/ExtractCelestialPort.sh` lifts the real text of `CelestialRecord`, `CelestialAtmosphereOf`,
`CelestialObserver`, `CelestialSunDisc`, `CelestialMoonDisc` and `CelestialSky` out of
`Engine/Shaders/ReSTIRViewport.slang` and compiles it as C++.

`Scratchpad/CheckShowcaseTracksShader.sh` proves that by falsification: it breaks the shader and requires the
render to change (zeroing the sun disc, halving sky radiance, removing the moon disc).

**Not a GPU screenshot.** Same source text, same inputs, same maths — but the Vulkan path is unproven until it
runs on hardware. The BVH and BSDF stack are also stand-ins here (three analytic spheres, Lambertian), because
the engine's traversal needs a GPU. The *lighting* is the engine's; the *geometry and materials* are not.

| file | what it shows |
|---|---|
| `00_day_cycle_contact_sheet.png` | all ten times of day on one sheet |
| `01`..`10` | 05:30 dawn through 22:00 night, in order |
| `11_morning_hero.png` | 07:12, large — blue sky-lit shadows |
| `12_golden_hour_hero.png` | 17:48, large — warm direct light, gold horizon |
| `13_sunrise_hero.png` | 06:18, large |
| `14_sun_shadows_four_elevations.png` | shadows lengthening and warming as the sun sets |
| `15_sky_only_four_elevations.png` | sky alone, no scene |
| `16_exposure_F3_adaptive_vs_celestial.png` | the F3 fix: a 105° pan, Adaptive (top) vs Celestial (bottom) |
| `17_sky_lit_ground.png` | ground lit only by the sky |

Scene: Benoni (−26.19°, +28.32°), 2026-09-13, UTC+2. Sun and moon positions come from the real almanac
ephemeris in `CelestialSolver.h`, not hand-placed angles — at noon the sun is at azimuth 1.33°, i.e. due
**north**, which is correct for the southern hemisphere.

## Clear-sky time-of-day set

`ClearSky/` is the focused weather-clear set for the first atmosphere review. It uses the
same open-ground sphere scene with cloud coverage forced to `0`, so the visual differences are
only from the real ephemeris and the celestial atmosphere:

| file | local time | phase |
|---|---:|---|
| `00_0430_astronomical_night.png` | 04:30 | pre-dawn astronomical night |
| `01_0530_nautical_twilight.png` | 05:30 | nautical twilight |
| `02_0618_sunrise.png` | 06:18 | sunrise / civil twilight boundary |
| `03_0712_morning.png` | 07:12 | clear morning |
| `04_1200_noon.png` | 12:00 | solar noon |
| `05_1700_afternoon.png` | 17:00 | late afternoon |
| `06_1748_golden_hour.png` | 17:48 | golden hour |
| `07_1836_sunset.png` | 18:36 | sunset |
| `08_1930_dusk.png` | 19:30 | post-sunset dusk |

`09_clear_sky_contact_sheet.png` puts the whole progression on one strip. These renders keep
the default cinematic lens character; the lens is not weather and can be disabled for a pure
sky-only comparison in the showcase.

Regenerate the focused set with:

    bash Scratchpad/RenderClearSkySet.sh

Optional environment variables are supported for a faster preview or a larger review render:

    WIDTH=320 HEIGHT=180 SAMPLES=12 bash Scratchpad/RenderClearSkySet.sh

The underlying showcase can also be rendered directly:

    bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc
    g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/CelestialShowcase.cpp \
        Engine/DisplayPresentation/ExposureIntegrator.cpp -o /tmp/showcase
    /tmp/showcase 17.8 /tmp/out.ppm 900 540 96
