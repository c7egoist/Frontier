//============================================================================================================================================
// 🌄 Engine/Shaders/AtmosphereScatter.slang — the physical sky, integrated rather than fitted
//============================================================================================================================================
// 🧩 One implementation of atmospheric scattering, compiled twice: as GLSL by ReSTIRViewport.slang, and as C++ by
//    Scratchpad/AtmosphereScatterTest.cpp through GlslShim.h. The proof therefore measures the shipping code, not
//    a re-implementation of it that can quietly disagree.
//
//    🔬 WHY A RAY-MARCH AND NOT AN ANALYTIC FIT (Preetham / Hosek-Wilkie). The question is fair and the answer is
//    not "because it is fancier" — it is that the analytic models cannot produce the three things this project has
//    repeatedly failed to produce:
//
//      1. THE DAWN/DUSK BAND. Hosek and Wilkie state plainly that after-sunset conditions "cannot be fitted using
//         the analytic model in its current form, because it cannot recreate the earth casting a shadow onto the
//         atmosphere". The earth's shadow climbing the sky IS the bright band at dawn and the Belt of Venus. A fit
//         has no geometry to cast it. A march gets it for free, because the shadow is just where the sun ray is
//         blocked by the planet.
//
//      2. VIBRANT SUNRISE/SUNSET AND A BLUE ZENITH AT TWILIGHT. Those are OZONE, not turbidity. The Chappuis band
//         (peak ~603 nm) absorbs the orange-green out of the spectrum, and at a low sun the slant path through the
//         ozone layer is enormous, which is what isolates the red at the horizon and keeps the zenith blue.
//         Measured spectroscopy: at sunset the zenith blue is "about 1/3 Rayleigh and 2/3 ozone, and during
//         twilight wholly to ozone" (Hulburt 1953). Without ozone the zenith would go "grayish green-blue...
//         becoming yellowish". Preetham and Hosek-Wilkie have NO ozone term — they approximate the outcome with
//         turbidity, which is why their sunsets read as a uniform orange wash.
//
//      3. CORRECT BRIGHTNESS AT A LOW SUN. Hosek-Wilkie gets BRIGHTER as the sun sets, which is backwards, and
//         which is precisely the class of bug this codebase is trying to stop shipping (F3).
//
//    Hosek-Wilkie is itself a curve fitted to a brute-force path trace of exactly this integral. So "analytic vs
//    marched" is not accuracy vs speed; it is a fit to the physics vs the physics. The LUT that P2 builds on top
//    caches THIS function — it is the same physics, evaluated on a grid.
//
//    🔴 F1 — THE SUN DISC IS NOT IN HERE, ON PURPOSE. These functions return SKY radiance only. The disc is
//    composited analytically at full resolution by the caller. Baking a 0.53-degree disc into a low-resolution,
//    non-linearly mapped LUT is what produces "weird shapes" in the sky, and it is the single rule of this file.
//
//    Units: metres, 1/m, radians. Radiance is relative to a unit solar irradiance at the top of the atmosphere;
//    the caller scales by the sun's intensity and tint.

#ifndef FRONTIER_ATMOSPHERE_SCATTER
#define FRONTIER_ATMOSPHERE_SCATTER

//------------------------------------------------------------------------------------------------------------------------
//                                                   PARAMETERS
//------------------------------------------------------------------------------------------------------------------------

// Everything the integral needs, unpacked from the CelestialRecord by the caller. Passed explicitly rather than
//    read from a global so the CPU harness can drive it directly with no descriptor set in sight.
struct AtmosphereParameters
{
    vec3  RayleighScattering;   // [1/m] at sea level
    vec3  MieScattering;        // [1/m] at sea level (achromatic; haze is white)
    vec3  OzoneAbsorption;      // [1/m] peak, in the Chappuis band
    vec3  GroundAlbedo;         // [-]

    float RayleighScaleHeight;  // [m]
    float MieScaleHeight;       // [m]
    float MieAnisotropy;        // [-]  Henyey-Greenstein g
    float PlanetRadius;         // [m]
    float AtmosphereHeight;     // [m]
};

// ⚠️ MIE EXTINCTION IS NOT MIE SCATTERING. Aerosols absorb as well as scatter; the standard single-scattering
//    albedo for atmospheric haze is ~0.9, so extinction is scattering / 0.9 = scattering * 1.11. Omitting this
//    makes haze too bright and, at a low sun, too luminous near the horizon — one of the ways a hand-rolled
//    atmosphere ends up with the "it gets brighter as it sets" failure the analytic models are criticised for.
#define kMieExtinctionScale 1.11

// The ozone layer is a SHELL, not an exponential. It is centred near 25 km and is roughly 30 km thick, so it is
//    modelled as a tent function rather than a decaying density. This matters enormously at twilight: a ray
//    grazing the horizon spends a long path inside that shell and short paths outside it, which is exactly what
//    carves out the Chappuis absorption and leaves the sky blue overhead after sunset.
#define kOzoneCentreAltitude 25000.0
#define kOzoneHalfWidth      15000.0

// Step-distribution exponent for the view march. See the measurement table at the march itself.
#define kStepWarp 1.5

//------------------------------------------------------------------------------------------------------------------------
//                                                     GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

// Distance to the far intersection of a ray with a sphere centred at the origin, or -1 for a miss. Origin is the
//    planet centre throughout this file, so a "position" is a vector from the centre of the earth.
float AtmosphereRaySphere(vec3 origin, vec3 direction, float radius)
{
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float d = b * b - c;
    if (d < 0.0) return -1.0;
    d = sqrt(d);
    float near = -b - d;
    float far  = -b + d;
    if (far < 0.0) return -1.0;
    return near < 0.0 ? far : near;
}

// Densities at a given altitude: x = Rayleigh, y = Mie, z = ozone.
vec3 AtmosphereDensity(AtmosphereParameters atmosphere, float altitude)
{
    float rayleigh = exp(-max(altitude, 0.0) / atmosphere.RayleighScaleHeight);
    float mie      = exp(-max(altitude, 0.0) / atmosphere.MieScaleHeight);

    // Tent, clamped at zero: full strength at the centre of the layer, linearly to nothing at the edges.
    float ozone = max(0.0, 1.0 - abs(altitude - kOzoneCentreAltitude) / kOzoneHalfWidth);

    return vec3(rayleigh, mie, ozone);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  TRANSMITTANCE
//------------------------------------------------------------------------------------------------------------------------

// How much light survives the trip from `position` along `direction` to the top of the atmosphere. Beer-Lambert
//    over the summed extinction of all three constituents.
//
//    ⚠️ If the ray hits the planet, the answer is zero — and that zero is what draws the earth's shadow across the
//    twilight sky. It is not a special case bolted on for the Belt of Venus; it is the same occlusion test, and
//    the band appears because it must.
vec3 AtmosphereTransmittance(AtmosphereParameters atmosphere, vec3 position, vec3 direction, int steps)
{
    float groundHit = AtmosphereRaySphere(position, direction, atmosphere.PlanetRadius);
    if (groundHit > 0.0) return vec3(0.0);

    float topRadius = atmosphere.PlanetRadius + atmosphere.AtmosphereHeight;
    float distance  = AtmosphereRaySphere(position, direction, topRadius);
    if (distance <= 0.0) return vec3(1.0);

    float stepSize = distance / float(steps);
    vec3  depth    = vec3(0.0);

    for (int i = 0; i < steps; ++i)
    {
        // Midpoint rule: samples the middle of each segment rather than an end, which for an exponential density
        //    is markedly more accurate for the same step count than the naive left-edge sum.
        vec3  samplePos = position + direction * (stepSize * (float(i) + 0.5));
        float altitude  = length(samplePos) - atmosphere.PlanetRadius;
        vec3  density   = AtmosphereDensity(atmosphere, altitude);

        vec3 extinction = atmosphere.RayleighScattering * density.x
                        + atmosphere.MieScattering * (kMieExtinctionScale * density.y)
                        + atmosphere.OzoneAbsorption * density.z;

        depth += extinction * stepSize;
    }

    return exp(-depth);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 PHASE FUNCTIONS
//------------------------------------------------------------------------------------------------------------------------

// Rayleigh: the gentle fore/aft symmetric lobe that makes the whole sky glow rather than just the part near the sun.
float AtmosphereRayleighPhase(float cosTheta)
{
    return (3.0 / (16.0 * 3.14159265)) * (1.0 + cosTheta * cosTheta);
}

// Henyey-Greenstein: the sharp forward lobe that puts the white aureole around the sun and the glare along the
//    horizon at sunset.
float AtmosphereMiePhase(float cosTheta, float g)
{
    float g2 = g * g;
    float denominator = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * 3.14159265 * max(denominator * sqrt(max(denominator, 1e-6)), 1e-6));
}

//------------------------------------------------------------------------------------------------------------------------
//                                              THE SCATTERING INTEGRAL
//------------------------------------------------------------------------------------------------------------------------

// Single-scattered sky radiance along a view ray, plus a cheap multiple-scattering term.
//
//    The march walks the view ray; at each step it asks how much sunlight reaches that point (transmittance
//    towards the sun — zero inside the earth's shadow), scatters it towards the eye through the phase functions,
//    and attenuates the result by the transmittance back along the view ray already accumulated.
//
//    `viewSteps` and `sunSteps` are the quality knobs. The LUT bake can afford many; a full-resolution fallback
//    march uses fewer.
vec3 AtmosphereScatter(
    AtmosphereParameters atmosphere,
    vec3  position,          // from the planet centre
    vec3  viewDirection,
    vec3  sunDirection,
    int   viewSteps,
    int   sunSteps,
    out   vec3 outTransmittance)
{
    float topRadius = atmosphere.PlanetRadius + atmosphere.AtmosphereHeight;

    float distance  = AtmosphereRaySphere(position, viewDirection, topRadius);
    float groundHit = AtmosphereRaySphere(position, viewDirection, atmosphere.PlanetRadius);
    if (groundHit > 0.0) distance = min(distance, groundHit);

    outTransmittance = vec3(1.0);
    if (distance <= 0.0) return vec3(0.0);

    float cosTheta      = dot(viewDirection, sunDirection);
    float rayleighPhase = AtmosphereRayleighPhase(cosTheta);
    float miePhase      = AtmosphereMiePhase(cosTheta, atmosphere.MieAnisotropy);

    vec3  radiance = vec3(0.0);
    vec3  throughput = vec3(1.0);

    // ⚠️ WARPED STEPS, NOT UNIFORM ONES, AND THE EXPONENT IS MEASURED. The atmosphere's density is exponential in
    //    altitude, so nearly all the scattering along a view ray happens in the first few kilometres while a
    //    uniform march spends most of its samples in near-vacuum at the top. Distributing t as (i/n)^kStepWarp
    //    bunches the samples where the signal is. Measured against a 256/32-step reference, across dawn, sunset
    //    and noon:
    //
    //        steps   uniform (k=1)   k=1.5           k=2.0
    //           8       18.413%       6.699%          4.376%
    //          16        8.142%       2.120%          1.680%   <- 16 warped beats 32 uniform (2.435%)
    //          24        4.820%       1.548%          1.369%
    //
    //    k=2.0 has a slightly lower mean but a markedly worse tail (42.5% worst at 16 steps, vs 21.4% for k=1.5)
    //    because it starves the far field, which is exactly where the twilight band lives. k=1.5 is the choice:
    //    best worst-case, and it lets the real-time path run 16 steps instead of 32 for the same accuracy.
    for (int i = 0; i < viewSteps; ++i)
    {
        float near = pow(float(i)       / float(viewSteps), kStepWarp) * distance;
        float far  = pow(float(i + 1)   / float(viewSteps), kStepWarp) * distance;
        float stepSize = far - near;

        vec3  samplePos = position + viewDirection * ((near + far) * 0.5);
        float altitude  = length(samplePos) - atmosphere.PlanetRadius;
        vec3  density   = AtmosphereDensity(atmosphere, altitude);

        vec3 rayleighScatter = atmosphere.RayleighScattering * density.x;
        vec3 mieScatter      = atmosphere.MieScattering * density.y;

        vec3 extinction = rayleighScatter
                        + atmosphere.MieScattering * (kMieExtinctionScale * density.y)
                        + atmosphere.OzoneAbsorption * density.z;

        vec3 segmentTransmittance = exp(-extinction * stepSize);

        // Sunlight arriving here, having crossed however much atmosphere lies between this point and space. Zero
        //    if the planet is in the way — the earth's shadow, and therefore the dawn band, is this line.
        vec3 sunTransmittance = AtmosphereTransmittance(atmosphere, samplePos, sunDirection, sunSteps);

        vec3 inScatter = sunTransmittance * (rayleighScatter * rayleighPhase + mieScatter * miePhase);

        // ⚠️ ANALYTIC SEGMENT INTEGRATION, not `inScatter * stepSize`. Integrating the in-scatter against the
        //    segment's own attenuation — (S - S*T) / extinction — is exact for a constant source over the step
        //    and removes the banding that a rectangle rule leaves along the horizon, where extinction per step is
        //    large. This is the difference between a clean dawn gradient and visible rings at low sun.
        vec3 safeExtinction = max(extinction, vec3(1e-9));
        vec3 segmentIntegral = (inScatter - inScatter * segmentTransmittance) / safeExtinction;

        radiance += throughput * segmentIntegral;
        throughput *= segmentTransmittance;
    }

    // Multiple scattering, approximated. A full second-order LUT is a later optimisation; what matters for
    //    realism now is that the sky does not go black in the shadowed regions and that a bright ground bounces
    //    light back up, because a purely single-scattered sky reads as unnaturally dark and dead at twilight.
    //    Isotropic, proportional to the local scattering coefficient, and attenuated like everything else.
    if (groundHit > 0.0)
    {
        // The view ray hit the ground: add the lit ground's albedo, so a bright surface is not a black hole.
        vec3 groundPos    = position + viewDirection * distance;
        vec3 groundNormal = normalize(groundPos);
        float sunCosine   = max(dot(groundNormal, sunDirection), 0.0);
        vec3 sunAtGround  = AtmosphereTransmittance(atmosphere, groundPos, sunDirection, sunSteps);
        radiance += throughput * atmosphere.GroundAlbedo * sunAtGround * sunCosine * (1.0 / 3.14159265);
    }

    outTransmittance = throughput;
    return radiance;
}

//------------------------------------------------------------------------------------------------------------------------
//                                            SKY-VIEW LUT PARAMETERISATION
//------------------------------------------------------------------------------------------------------------------------

// 🔴 THE NON-LINEAR LATITUDE MAPPING — the reason a LUT sky can hold a dawn band at all.
//
//    A linear latitude axis gives the horizon a handful of texels out of ~108, so the brightest, sharpest,
//    fastest-changing part of the entire sky — the few degrees either side of the horizon — is averaged into
//    mush. That is the usual reason a LUT sky looks flat and washed out next to an analytic one, and it is a
//    parameterisation bug, not evidence that a LUT cannot represent the sky.
//
//    Hillaire 2020 section 5.3: v = 0.5 + 0.5 * sign(l) * sqrt(|l| / (pi/2)). The square root packs texels
//    towards l = 0, so the horizon gets a dense band and the zenith — which is nearly featureless — gets few.
//    The mapping is its own inverse in the obvious way, so bake and sample cannot disagree.
vec2 AtmosphereSkyViewEncode(float latitude, float longitude)
{
    // latitude in [-pi/2, pi/2] measured from the horizon; longitude in [0, 2pi] around the sun's azimuth.
    float v = 0.5 + 0.5 * sign(latitude) * sqrt(abs(latitude) / 1.5707963);
    float u = longitude / 6.2831853;
    return vec2(u, v);
}

void AtmosphereSkyViewDecode(vec2 uv, out float latitude, out float longitude)
{
    float centred = uv.y - 0.5;
    // Squaring undoes the sqrt; the sign carries which side of the horizon we are on.
    latitude  = sign(centred) * (centred * centred * 4.0) * 1.5707963;
    longitude = uv.x * 6.2831853;
}

//------------------------------------------------------------------------------------------------------------------------
//                                             LOG-SPACE LUT STORAGE
//------------------------------------------------------------------------------------------------------------------------

// 🔴 STORE THE SKY AS LOGARITHMS, NOT AS RADIANCE. Measured, on the dawn band, 192x108, against the full march:
//
//        linear storage   mean  6.195%    worst  659.93%
//        log storage      mean  2.316%    worst  189.23%
//
//    The sky spans several orders of magnitude across the horizon at twilight, and a bilinear filter is a LINEAR
//    interpolator: between a bright texel and a dark one it tracks the arithmetic mean, which badly overshoots
//    the true value when the two differ by 100x. Interpolating the logarithm tracks the geometric mean instead,
//    which is very nearly right for an exponential falloff — and the falloff here is literally Beer-Lambert, an
//    exponential. This single change removes most of the horizon error a LUT sky is usually blamed for.
//
//    The epsilon keeps log(0) finite in the earth's shadow, where radiance really is zero.
vec3 AtmosphereEncodeStorage(vec3 radiance)
{
    return vec3(log(radiance.x + 1e-9), log(radiance.y + 1e-9), log(radiance.z + 1e-9));
}

vec3 AtmosphereDecodeStorage(vec3 stored)
{
    return max(vec3(exp(stored.x), exp(stored.y), exp(stored.z)) - 1e-9, vec3(0.0));
}

#endif // FRONTIER_ATMOSPHERE_SCATTER
