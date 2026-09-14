//============================================================================================================================================
// 🌄 Engine/Shaders/AtmosphereScatter.slang — sultanaladin HTML atmosphere() port
//============================================================================================================================================
// One implementation is compiled as GLSL by ReSTIRViewport.slang and as C++ by the proof harness. The production
// march follows docs/celestial/index.html: quadratic view/sun sampling, Rayleigh + achromatic Mie phase functions,
// Mie extinction at 1.1x, Chappuis/ozone optical depth, and planet-shadow occlusion. The sun disc and the HTML
// dawnGlow() complement are composed at full resolution by ReSTIRViewport.slang; this file returns sky radiance only.
//
// Units: metres, 1/m and radians. Radiance is per unit top-of-atmosphere solar irradiance; the caller multiplies by
// the packed sun irradiance that also drives the ReSTIR sun candidate. Clouds and fog remain in CelestialMedia.slang.

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

// The HTML reference uses extinction = 1.1 × Mie scattering. Keep the coefficient named so direct-light and
// sky transmittance cannot silently diverge.
#define kMieExtinctionScale 1.1

//------------------------------------------------------------------------------------------------------------------------
//                                                     GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

// Distance to the near intersection of a ray with a sphere centred at the origin, or -1 for a miss. For a point
// inside the sphere this returns the forward/far intersection; for an outside point it returns the near hit.
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

// The reference rsi() exposes both intersections and uses the FAR one for the light ray. This is important when
// the sun is below the horizon: marching only to the near ground hit would never sample the planet interior and
// would incorrectly illuminate air that should be in the earth's shadow.
float AtmosphereRaySphereFar(vec3 origin, vec3 direction, float radius)
{
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float d = b * b - c;
    if (d < 0.0) return -1.0;
    return -b + sqrt(d);
}

// Densities are kept as a small helper for CPU diagnostics and for callers that want the modelled profiles.
// The production integral below follows the reference page's atmosphere() function: Rayleigh and Mie optical
// depths are accumulated along a quadratic (near-camera dense) march, and the Chappuis/ozone term follows the
// same reference optical-depth ledger. This is intentionally not a second, independently tuned atmosphere.
vec3 AtmosphereDensity(AtmosphereParameters atmosphere, float altitude)
{
    float rayleigh = exp(-max(altitude, 0.0) / atmosphere.RayleighScaleHeight);
    float mie      = exp(-max(altitude, 0.0) / atmosphere.MieScaleHeight);
    float ozone    = exp(-max(altitude, 0.0) / atmosphere.RayleighScaleHeight);
    return vec3(rayleigh, mie, ozone);
}

//------------------------------------------------------------------------------------------------------------------------
//                                      REFERENCE TRANSMITTANCE
//------------------------------------------------------------------------------------------------------------------------

// Reference-page atmosphere() uses a quadratic optical-depth march for the sun ray. Keeping this as a named helper
// makes direct-light tests and the ReSTIR sun candidate use the same Rayleigh/Mie/ozone transmittance as the sky.
vec3 AtmosphereTransmittance(AtmosphereParameters atmosphere, vec3 position, vec3 direction, int steps)
{
    float groundHit = AtmosphereRaySphere(position, direction, atmosphere.PlanetRadius);
    if (groundHit > 0.0) return vec3(0.0);

    float topRadius = atmosphere.PlanetRadius + atmosphere.AtmosphereHeight;
    float distance  = AtmosphereRaySphere(position, direction, topRadius);
    if (distance <= 0.0) return vec3(1.0);

    vec3 betaR = atmosphere.RayleighScattering;
    vec3 betaM = atmosphere.MieScattering;
    vec3 betaO = atmosphere.OzoneAbsorption;
    float odR = 0.0;
    float odM = 0.0;
    int count = max(1, steps);
    for (int i = 0; i < count; ++i)
    {
        float s0 = float(i) / float(count);
        float s1 = float(i + 1) / float(count);
        s0 *= s0; s1 *= s1;
        float segment = distance * (s1 - s0);
        vec3 samplePos = position + direction * (distance * 0.5 * (s0 + s1));
        float altitude = length(samplePos) - atmosphere.PlanetRadius;
        odR += exp(-max(altitude, 0.0) / atmosphere.RayleighScaleHeight) * segment;
        odM += exp(-max(altitude, 0.0) / atmosphere.MieScaleHeight) * segment;
    }
    return exp(-(betaR * odR + betaM * (kMieExtinctionScale * odM) + betaO * odR));
}

//------------------------------------------------------------------------------------------------------------------------
//                                      REFERENCE ATMOSPHERE MARCH
//------------------------------------------------------------------------------------------------------------------------

// This is the sultanaladin celestial page's atmosphere() port. Its important details are deliberately visible here:
// quadratic view and sun sampling, separate Rayleigh and achromatic Mie optical depths, Mie extinction = 1.1 x
// scattering, ozone/Chappuis absorption in the same optical-depth ledger, planet-shadow occlusion, and the reference
// Rayleigh/Henyey-Greenstein phase functions. The sun disc is never baked into this integral.
//
// `maxDistance` is positive for aerial perspective and negative for a sky ray. The returned radiance is per unit
// top-of-atmosphere solar irradiance, exactly like the HTML shader; CelestialSky applies packed sun irradiance.
vec3 AtmosphereScatterTo(
    AtmosphereParameters atmosphere,
    vec3  position,
    vec3  viewDirection,
    vec3  sunDirection,
    int   viewSteps,
    int   sunSteps,
    float maxDistance,
    out   vec3 outTransmittance)
{
    float topRadius = atmosphere.PlanetRadius + atmosphere.AtmosphereHeight;
    float distance  = AtmosphereRaySphere(position, viewDirection, topRadius);
    float groundHit = AtmosphereRaySphere(position, viewDirection, atmosphere.PlanetRadius);
    if (groundHit > 0.0) distance = min(distance, groundHit);
    if (distance <= 0.0)
    {
        outTransmittance = vec3(1.0);
        return vec3(0.0);
    }

    bool stoppedAtGeometry = maxDistance > 0.0 && maxDistance < distance;
    if (stoppedAtGeometry)
    {
        distance = maxDistance;
        groundHit = -1.0;
    }

    int N  = max(1, viewSteps);
    int NL = max(1, sunSteps);
    vec3 betaR = atmosphere.RayleighScattering;
    vec3 betaM = atmosphere.MieScattering;
    vec3 betaO = atmosphere.OzoneAbsorption;
    vec3 sumR = vec3(0.0);
    vec3 sumM = vec3(0.0);
    float odR = 0.0;
    float odM = 0.0;
    float mu = dot(viewDirection, sunDirection);
    float g  = atmosphere.MieAnisotropy;
    float pR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
    float pM = 3.0 / (8.0 * 3.14159265)
             * ((1.0 - g * g) * (1.0 + mu * mu))
             / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

    for (int i = 0; i < N; ++i)
    {
        float s0 = float(i) / float(N);
        float s1 = float(i + 1) / float(N);
        s0 *= s0; s1 *= s1;
        float ta = distance * s0;
        float tb = distance * s1;
        float segment = tb - ta;
        float tm = 0.5 * (ta + tb);
        vec3 samplePos = position + viewDirection * tm;
        float altitude = length(samplePos) - atmosphere.PlanetRadius;
        float hr = exp(-max(altitude, 0.0) / atmosphere.RayleighScaleHeight) * segment;
        float hm = exp(-max(altitude, 0.0) / atmosphere.MieScaleHeight) * segment;
        odR += hr;
        odM += hm;

        // rsi(p, sun, top radius): the sphere helper returns the forward/far intersection for a point inside the
        // shell, which is exactly the HTML shader's tl.y.
        float sunDistance = AtmosphereRaySphereFar(samplePos, sunDirection, topRadius);
        float sunOdR = 0.0;
        float sunOdM = 0.0;
        bool sunVisible = sunDistance > 0.0;
        if (sunVisible)
        {
            for (int j = 0; j < NL; ++j)
            {
                float q0 = float(j) / float(NL);
                float q1 = float(j + 1) / float(NL);
                q0 *= q0; q1 *= q1;
                float sunSegment = sunDistance * (q1 - q0);
                vec3 sunSample = samplePos + sunDirection * (sunDistance * 0.5 * (q0 + q1));
                float sunAltitude = length(sunSample) - atmosphere.PlanetRadius;
                if (sunAltitude < 0.0)
                {
                    sunVisible = false;
                    break;
                }
                sunOdR += exp(-sunAltitude / atmosphere.RayleighScaleHeight) * sunSegment;
                sunOdM += exp(-sunAltitude / atmosphere.MieScaleHeight) * sunSegment;
            }
        }

        if (sunVisible)
        {
            vec3 attenuation = exp(-(betaR * (odR + sunOdR)
                                    + betaM * (kMieExtinctionScale * (odM + sunOdM))
                                    + betaO * (odR + sunOdR)));
            sumR += attenuation * hr;
            sumM += attenuation * hm;
        }
    }

    outTransmittance = exp(-(betaR * odR + betaM * (kMieExtinctionScale * odM) + betaO * odR));
    return sumR * betaR * pR + sumM * betaM * pM;
}

// Sky-only form retained for the ReSTIR miss and bounce paths.
vec3 AtmosphereScatter(
    AtmosphereParameters atmosphere,
    vec3  position,
    vec3  viewDirection,
    vec3  sunDirection,
    int   viewSteps,
    int   sunSteps,
    out   vec3 outTransmittance)
{
    return AtmosphereScatterTo(atmosphere, position, viewDirection, sunDirection,
                               viewSteps, sunSteps, -1.0, outTransmittance);
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
