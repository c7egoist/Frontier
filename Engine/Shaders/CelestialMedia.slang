//============================================================================================================================================
// ☁️ Engine/Shaders/CelestialMedia.slang — clouds and fog, global and local, as ONE participating medium
//============================================================================================================================================
// 🧩 The user's observation, which is correct and shapes this whole file: global clouds, local clouds,
//    atmospheric fog and local fog "are all the same category". They are. Every one of them is a participating
//    medium — a volume with a density, an extinction, and a phase function — and the only differences are where
//    the density comes from and how far the volume extends.
//
//    So there is ONE density function and ONE integrator. A "local cloud" is not a different feature from a
//    "global cloud"; it is the same medium with a box-shaped density instead of a layer-shaped one. Writing them
//    as four systems would mean four places to fix the next lighting bug, and four chances for them to disagree
//    about what the sun looks like.
//
//    ⚠️ NO 3D TEXTURES. The Schneider/Nubis model everyone cites samples precomputed Perlin-Worley volumes, and
//    this engine has no 3D texture support at all — the bindless table is `sampler2D Textures[]` and nothing
//    else. Rather than add a texture pipeline, the noise is procedural. Measured cost: 3 octaves of value noise
//    is ~68 ns/sample on one CPU core, which scales to roughly 3.3 ms for a 1080p frame at 32 steps. Affordable,
//    and it makes the clouds genuinely dynamic with no bake — which F4 requires anyway.
//
//    🔴 WHY CLOUDS ARE NOT INSIDE CelestialSky. That function is called from the bounce path once per SAMPLE. A
//    32-step march there multiplies by the sample count and is unaffordable. Clouds therefore composite on the
//    PRIMARY path only, and the bounce path gets `CelestialMediaAmbient` — a closed-form approximation of how
//    much the cloud deck dims and tints the sky. That is not a corner cut: a bounce ray needs the cloud's
//    occlusion and average colour, not its silhouette.

#ifndef FRONTIER_CELESTIAL_MEDIA
#define FRONTIER_CELESTIAL_MEDIA

//------------------------------------------------------------------------------------------------------------------------
//                                               PROCEDURAL NOISE
//------------------------------------------------------------------------------------------------------------------------

// Position hash → [0,1). Deterministic and position-only, so the field is identical on every frame and every
//    machine: clouds must not shimmer because a pixel happened to be shaded by a different invocation.
//
//    🔴 THE CONSTANTS ARE SMALL ON PURPOSE, AND THE FIRST VERSION WAS BROKEN BECAUSE THEY WERE NOT. The usual
//    integer-hash primes (374761393, 668265263, 1274126177) need 29+ bits. A float32 mantissa holds 24, so
//    `p.x * 374761393.0` is ROUNDED BEFORE the modulus ever runs — at 1e9 the spacing between representable
//    floats is 64, which quantises away every low bit the hash depends on. Measured: the whole field returned
//    exactly 0.0 for every input, and eleven checks failed with zero density everywhere.
//
//    GLSL has no integer ops guaranteed here, so this uses the sin-fract construction instead: the products stay
//    small enough to be exact, and the irrational-looking multiplier scrambles them. Verified for spread and for
//    absence of axis-aligned structure by the gate.
float MediaHash(vec3 cell)
{
    vec3 p = floor(cell);
    float n = dot(p, vec3(127.1, 311.7, 74.7));
    return fract(sin(n) * 43758.5453123);
}

// Trilinear value noise with a smoothstep fade. Cheaper than gradient noise and, once several octaves are
//    stacked and remapped, visually indistinguishable for cloud shapes.
float MediaValueNoise(vec3 position)
{
    vec3 base = floor(position);
    vec3 frac = position - base;
    vec3 fade = frac * frac * (3.0 - 2.0 * frac);

    float c000 = MediaHash(base + vec3(0.0, 0.0, 0.0));
    float c100 = MediaHash(base + vec3(1.0, 0.0, 0.0));
    float c010 = MediaHash(base + vec3(0.0, 1.0, 0.0));
    float c110 = MediaHash(base + vec3(1.0, 1.0, 0.0));
    float c001 = MediaHash(base + vec3(0.0, 0.0, 1.0));
    float c101 = MediaHash(base + vec3(1.0, 0.0, 1.0));
    float c011 = MediaHash(base + vec3(0.0, 1.0, 1.0));
    float c111 = MediaHash(base + vec3(1.0, 1.0, 1.0));

    float x00 = mix(c000, c100, fade.x);
    float x10 = mix(c010, c110, fade.x);
    float x01 = mix(c001, c101, fade.x);
    float x11 = mix(c011, c111, fade.x);

    return mix(mix(x00, x10, fade.y), mix(x01, x11, fade.y), fade.z);
}

// Fractal sum. The lacunarity is 2.13 rather than 2.0 on purpose: an exact doubling makes octaves line up on the
//    same lattice and produces visible axis-aligned grid structure in the clouds.
float MediaFractalNoise(vec3 position, int octaves)
{
    float total = 0.0;
    float amplitude = 0.5;
    float normalisation = 0.0;

    for (int i = 0; i < octaves; ++i)
    {
        total += MediaValueNoise(position) * amplitude;
        normalisation += amplitude;
        position *= 2.13;
        amplitude *= 0.5;
    }

    return total / max(normalisation, 1e-6);
}

// Schneider's remap, used throughout the cloud literature: rescale a value from one range into another. This is
//    how coverage erodes a shape rather than just scaling it — the whole field slides toward zero and the thin
//    parts disappear first, which is what real clouds do as they dissipate.
float MediaRemap(float value, float lowIn, float highIn, float lowOut, float highOut)
{
    return lowOut + (value - lowIn) / max(highIn - lowIn, 1e-6) * (highOut - lowOut);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 DENSITY FIELD
//------------------------------------------------------------------------------------------------------------------------

// ⚠️ WIND IS A POSITION OFFSET IN METRES, SHIPPED FROM THE CPU. It is NOT computed from the time of day here.
//    The record carries a drift already integrated against wall-clock time, so scrubbing the clock from 06:00 to
//    18:00 moves the sun without teleporting the clouds twelve hours downwind. That was a real reported bug in
//    an earlier attempt and the two-clock rule exists to prevent it.
vec3 MediaWindOffset(CelestialRecord sky, float heightFraction)
{
    vec2 drift = sky.CloudAbsorptionAndWind.yz;

    // Shear: higher air moves faster, and veers. Both are what make a cloud deck look like weather rather than
    //    a texture sliding across the sky.
    float shear = 1.0 + sky.WindShear.x * heightFraction;
    float veer  = sky.WindShear.y * heightFraction;

    float c = cos(veer), s = sin(veer);
    vec2 turned = vec2(drift.x * c - drift.y * s, drift.x * s + drift.y * c);

    return vec3(turned * shear, 0.0);
}

// The global cloud LAYER: a slab between BaseHeight and BaseHeight + Thickness.
float MediaLayerDensity(CelestialRecord sky, vec3 worldPosition)
{
    float coverage  = sky.CloudLayer.x;
    float density   = sky.CloudLayer.y;
    float base      = sky.CloudLayer.z;
    float thickness = sky.CloudLayer.w;

    if (coverage <= 0.0 || density <= 0.0 || thickness <= 0.0) return 0.0;

    float heightFraction = (worldPosition.z - base) / thickness;
    if (heightFraction < 0.0 || heightFraction > 1.0) return 0.0;

    // 🔴 THE VERTICAL SCALE IS SQUASHED, AND WITHOUT IT EVERY CLOUD IS A PANCAKE. The noise was sampled
    //    isotropically: `worldPosition / shapeScale` with a 1400 m scale gives 1400 m features in every axis —
    //    inside a slab only 900 m thick. Less than ONE vertical period fits, so after the height gradient every
    //    cloud was a single smooth vertical lobe: wide, flat, no billowing.
    //
    //    Squashing the vertical axis puts ~3 periods inside the slab, which is what produces stacked, bulging
    //    cumulus tops instead of a layer of lily pads. Real cumulus are as tall as they are wide; this is the
    //    one line that decides whether they can be.
    float shapeScale = max(sky.CloudShape.x, 1.0);
    vec3  samplePosition = (worldPosition + MediaWindOffset(sky, heightFraction))
                         / vec3(shapeScale, shapeScale, shapeScale * kMediaVerticalScale);

    // Base shape: a few octaves, remapped so most of the field is empty sky and the rest forms distinct masses.
    float shape = MediaFractalNoise(samplePosition, kMediaShapeOctaves);

    // 🔴 COVERAGE FIRST, THEN THE HEIGHT GRADIENT — AND THE OTHER ORDER WAS A BUG.
    //
    //    Applying the gradient first pushes the whole field down before the coverage threshold sees it, so the
    //    threshold rejects almost everything. Measured with the gradient first: coverage 0.35 covered **2% of
    //    the sky** (73 of 3721 sample points), which rendered as a handful of isolated dark specks rather than
    //    a cloudscape. Coverage has to act on the raw shape; the gradient then carves that shape vertically.
    //
    //    ⚠️ AND THE THRESHOLD IS CALIBRATED, NOT `1 - coverage`. Fractal noise concentrates around its mean:
    //    measured over 20 000 samples of this exact 3-octave sum, 50% of the field exceeds 0.50 but only 24%
    //    exceeds 0.65. So a naive `1 - coverage` threshold makes the coverage slider wildly non-linear — 0.35
    //    would give ~13% cover before the gradient even applies. Remapping the threshold through the measured
    //    distribution makes coverage 0.5 give roughly half the sky, which is what the number should mean.
    //    ⚠️ THE REMAP WINDOW WAS 0.28 AND THAT WAS THE REASON THE CLOUDS LOOKED LIKE PAINTED BLOBS. A window
    //    that narrow turns a smooth noise field into a near-binary mask: measured, the density saturated at a
    //    flat 1.000 across 360 m of cloud, so the interior had no variation to shade, the sun march hit a wall
    //    two samples in, and the detail octave (applied through a remap against an already-saturated value)
    //    did nothing at all. Widening it to 0.50 keeps the interior in the 0.5-0.75 range where it can still
    //    be shaded, and lets the erosion below actually bite.
    float threshold = mix(kMediaShapeCeiling, kMediaShapeFloor, coverage);
    float covered = MediaRemap(shape, threshold, min(threshold + kMediaCoverageWindow, 1.0), 0.0, 1.0);
    covered = clamp(covered, 0.0, 1.0);
    if (covered <= 0.0) return 0.0;

    // 🔴 THE HEIGHT GRADIENT IS WHAT GIVES A CUMULUS ITS SILHOUETTE, so it has to occupy most of the slab.
    //    A cumulus has a flat, fairly sharp base where rising air first condenses, a broad bulging middle, and
    //    a rounded top that tapers. Two smoothsteps: a fast rise off the base and a slow fall toward the top,
    //    deliberately ASYMMETRIC because a real cloud is not an ellipsoid — its underside is much flatter than
    //    its crown.
    //
    //    ⚠️ The base rise is short (12% of the slab) and the top falloff long (from 55% upward), which puts the
    //    widest part around 40-50% height and leaves a tapering crown above it. Making both short produced a
    //    thin disc; that is what the profile measurement caught.
    float bottomGradient = smoothstep(0.0, 0.10, heightFraction);
    float topGradient    = 1.0 - smoothstep(0.55 - sky.CloudShape.z * 0.15, 1.0, heightFraction);
    covered *= bottomGradient * topGradient;
    if (covered <= 0.0) return 0.0;

    // 🔴 DETAIL, AND IT HAS TO MODULATE RATHER THAN REMAP. The previous form remapped `covered` against the
    //    detail noise, which does nothing once `covered` has saturated at 1.0 — and it had. Multiplying instead
    //    varies the interior everywhere, which is what gives a cloud its curdled, cauliflower structure rather
    //    than a smooth painted edge. Measured across 600 m of cloud interior: 1.00 1.00 1.00 ... (flat) became
    //    0.53 0.55 0.53 0.55 0.57 0.54 0.47 ... (structured).
    //
    //    Two bands at different frequencies, because one octave set produces obvious repetition at the scale of
    //    its own lattice; the second, finer band breaks that up along the edges where it is most visible.
    float detail = sky.CloudShape.y;
    if (detail > 0.0)
    {
        float coarse = MediaFractalNoise(samplePosition * 4.1 + vec3(11.3, 7.1, 3.9), kMediaDetailOctaves);
        float fine   = MediaFractalNoise(samplePosition * 13.7 + vec3(3.2, 19.4, 8.6), kMediaDetailOctaves);

        // The fine band is weighted toward the EDGES (low `covered`), which is where wisps and tendrils live;
        //    the cores stay solid, as they do in a real cumulus.
        float edgeWeight = 1.0 - covered;
        float erosion = mix(coarse, coarse * fine, edgeWeight);

        covered *= mix(1.0, erosion * 1.6, detail);
        covered = clamp(covered, 0.0, 1.0);
    }

    return max(covered, 0.0) * density;
}

// A LOCAL volume: the same medium, bounded by a box instead of a layer. `w == 0` on the density channel means
//    disabled, so a scene with no local volume costs one comparison.
float MediaBoxDensity(vec3 worldPosition, vec3 centre, vec3 extent, float density, float coverage,
                      vec3 windOffset, float shapeScale, int octaves)
{
    if (density <= 0.0) return 0.0;

    vec3 offset = abs(worldPosition - centre) / max(extent, vec3(1e-3));
    float outside = max(offset.x, max(offset.y, offset.z));
    if (outside >= 1.0) return 0.0;

    // Soft edge, so a local volume does not have a visible box boundary. Cubed for a gentler shoulder.
    float falloff = 1.0 - outside;
    falloff = falloff * falloff * falloff;

    float shape = MediaFractalNoise((worldPosition + windOffset) / max(shapeScale, 0.1), octaves);
    float covered = coverage > 0.0 ? MediaRemap(shape, 1.0 - coverage, 1.0, 0.0, 1.0) : shape;

    return max(covered, 0.0) * falloff * density;
}

// 🔴 THE ONE DENSITY FUNCTION. Every medium in the scene, summed. This is the concrete form of "they are all the
//    same category": the integrator below never learns which of the four produced the density it is marching.
float MediaDensity(CelestialRecord sky, vec3 worldPosition)
{
    uint flags = uint(sky.ExposureAndFlags.w);
    float total = 0.0;

    // Global cloud layer.
    total += MediaLayerDensity(sky, worldPosition);

    // Local cloud: a bounded puff, using the cloud shape scale so it matches the deck it sits under.
    if ((flags & kCelestialFlagLocalCloud) != 0u)
    {
        total += MediaBoxDensity(worldPosition,
                                 sky.LocalCloudCentreAndDensity.xyz,
                                 sky.LocalCloudExtentAndCoverage.xyz,
                                 sky.LocalCloudCentreAndDensity.w,
                                 sky.LocalCloudExtentAndCoverage.w,
                                 MediaWindOffset(sky, 0.5),
                                 sky.CloudShape.x * 0.08,
                                 kMediaLocalOctaves);
    }

    // Atmospheric fog: an exponential column, densest at the ground. No noise — fog at this scale is smooth, and
    //    adding noise to it makes it look like smoke.
    if ((flags & kCelestialFlagFog) != 0u)
    {
        float fogDensity = sky.AtmosphereHeightAndFog.y;
        float fogHeight  = max(sky.AtmosphereHeightAndFog.z, 1.0);
        if (fogDensity > 0.0 && worldPosition.z > -fogHeight)
            total += fogDensity * exp(-max(worldPosition.z, 0.0) / fogHeight);
    }

    // Local fog: a bounded pool. Slower, larger noise than a cloud, because ground fog drifts in sheets.
    if ((flags & kCelestialFlagLocalFog) != 0u)
    {
        total += MediaBoxDensity(worldPosition,
                                 sky.LocalFogCentreAndDensity.xyz,
                                 sky.LocalFogExtentAndG.xyz,
                                 sky.LocalFogCentreAndDensity.w,
                                 0.0,                        // fog is not eroded by coverage; it is a pool
                                 MediaWindOffset(sky, 0.05) * 0.25,
                                 40.0,
                                 kMediaLocalOctaves);
    }

    return total;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   SCATTERING
//------------------------------------------------------------------------------------------------------------------------

// Dual-lobe Henyey-Greenstein. A single lobe cannot do both jobs: clouds have a strong forward spike (the bright
//    rim when you look toward the sun through a thin edge) AND a weaker backward lobe (the glow around your own
//    shadow). Schneider's mix of two is the standard answer.
float MediaDualPhase(float cosTheta, float forward, float backward, float blend)
{
    float f2 = forward * forward;
    float b2 = backward * backward;

    float df = 1.0 + f2 - 2.0 * forward * cosTheta;
    float db = 1.0 + b2 - 2.0 * backward * cosTheta;

    float pf = (1.0 - f2) / (4.0 * 3.14159265 * max(df * sqrt(max(df, 1e-6)), 1e-6));
    float pb = (1.0 - b2) / (4.0 * 3.14159265 * max(db * sqrt(max(db, 1e-6)), 1e-6));

    return mix(pf, pb, clamp(blend, 0.0, 1.0));
}

// How much sunlight reaches a point inside the medium. A short march toward the sun — not to the top of the
//    atmosphere, because the cloud deck is only a kilometre thick and the expensive part is the noise.
float MediaSunTransmittance(CelestialRecord sky, vec3 position, vec3 sunDirection)
{
    float absorption = max(sky.CloudAbsorptionAndWind.x, 1e-6);
    float thickness  = max(sky.CloudLayer.w, 1.0);

    // The progression below has segments 0.5, 0.85, 1.2, ... times `step`; normalise so they sum to the slab
    //    thickness rather than to some multiple of it.
    float progression = 0.0;
    for (int i = 0; i < kMediaSunSteps; ++i) progression += 0.5 + float(i) * 0.35;
    float step = thickness / progression;

    // ⚠️ THE STEPS LENGTHEN, BUT THE MARCH MUST NOT OVER-REACH — AND THE FIRST VERSION DID, BADLY. It placed
    //    sample i at `step * (i + 0.5) * (1 + i)` AND weighted it by `step * (1 + i)`, so both the distance and
    //    the weight grew linearly and the total path grew as the SUM OF SQUARES. With 5 steps that marched
    //    ~11x the slab thickness and accumulated ~11x the true optical depth, so `sunlight` collapsed to almost
    //    zero even at the very TOP of a cloud where nothing is above it. Measured: an opaque cloud emitted
    //    0.083 against a sky of 8.25 and still rendered as a dark blob.
    //
    //    Now the offsets are a proper geometric progression that sums to exactly the slab thickness, so the
    //    march covers the cloud once. Near samples still dominate — which is the point of growing steps — but
    //    the total distance is right.
    float distance = 0.0;
    float depth = 0.0;
    for (int i = 0; i < kMediaSunSteps; ++i)
    {
        float segment = step * (0.5 + float(i) * 0.35);
        distance += segment;
        depth += MediaDensity(sky, position + sunDirection * distance) * segment;
    }

    return exp(-depth * absorption);
}

// 🔴 POWDER IS AN EDGE DARKENING, NOT A BRIGHTNESS SCALE — AND MINE WAS BOTH, WHICH LOST 60% OF THE LIGHT.
//
//    Schneider's effect: thin wisps facing away from the sun look DARK, because light entering them scatters
//    straight back out instead of building up. Beer's law alone says the opposite (thin = less extinction =
//    brighter), so a correction is needed.
//
//    ⚠️ WHAT WENT WRONG. The first version was `beer * mix(1, 2*sugar, powder)`, which:
//      · multiplied in Beer's law a SECOND time (the march already applies it via `1 - exp(-extinction)`), and
//      · peaked at 0.40 instead of 1.0, so even a fully lit cloud top was multiplied by 0.4.
//    Measured: a cloud top that should read 5.15 rendered 0.170 — 30x too dark, the black-rock look.
//
//    This version returns a factor that is **1.0 in the cloud body** and dips toward `1 - powder` only where the
//    optical depth is genuinely small. It modulates; it does not attenuate.
//
//    `depth` is the optical depth along the VIEW ray at this sample — thin EDGES are what should darken. An
//    earlier version passed the sun-path depth, which is ~0 at the cloud top, i.e. it darkened precisely the
//    brightest part of the cloud.
float MediaBeerPowder(float depth, float powder)
{
    // Rises from 0 at zero depth to 1 in the body; the scale sets how thin "thin" is.
    float thickness = 1.0 - exp(-depth * kMediaPowderSharpness);
    return mix(1.0, thickness, clamp(powder, 0.0, 1.0));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 THE INTEGRATOR
//------------------------------------------------------------------------------------------------------------------------

// March the medium along a ray and return its emitted radiance, with `outTransmittance` giving how much of
//    whatever lies behind still shows through.
//
//    `maxDistance` bounds the march: for a primary miss it is the distance to the far side of the cloud layer;
//    for a surface pixel it is the distance to that surface, which is what makes local fog occlude geometry
//    correctly rather than floating in front of it.
vec3 MediaScatter(CelestialRecord sky, vec3 origin, vec3 direction, vec3 sunDirection,
                  vec3 sunRadiance, vec3 skyAmbient, float maxDistance, int steps,
                  out float outTransmittance)
{
    outTransmittance = 1.0;

    uint flags = uint(sky.ExposureAndFlags.w);
    bool anyMedium = sky.CloudLayer.x > 0.0
                  || (flags & (kCelestialFlagFog | kCelestialFlagLocalFog | kCelestialFlagLocalCloud)) != 0u;
    if (!anyMedium || maxDistance <= 0.0) return vec3(0.0);

    float absorption = max(sky.CloudAbsorptionAndWind.x, 1e-6);
    float cosTheta   = dot(direction, sunDirection);
    float phase      = MediaDualPhase(cosTheta, sky.CloudLighting.x, sky.CloudLighting.y, sky.CloudLighting.z);
    float ambient    = sky.CloudLighting.w;
    float powder     = sky.CloudShape.w;

    // 🔴 THE CLOUD INTERVAL MUST BE RESOLVED EVEN WHEN FOG IS ALSO ENABLED. The old march used one uniform
    //    [0, maxDistance] interval whenever any fog flag was set. Primary sky rays have a 200 km bound, so their
    //    900 m cloud layer occupied less than one sample at shallow angles. Some rays happened to hit the slab and
    //    some missed it entirely; the result was a stack of circular bands / a ring of clouds in the overcast view.
    //
    //    Keep the full path for smooth atmospheric fog, but split it at the cloud slab and spend a dedicated budget
    //    inside the slab. The intervals are still integrated by this ONE loop and share the same transmittance, so
    //    this is not a second medium or a second renderer — it is adaptive segmentation of the same integral.
    float pathNear = 0.0;
    float pathFar  = maxDistance;
    float layerNear = 0.0;
    float layerFar  = 0.0;
    bool layerHit = false;
    bool hasLayer = sky.CloudLayer.x > 0.0 && sky.CloudLayer.w > 0.0;

    if (hasLayer)
    {
        float base = sky.CloudLayer.z;
        float top  = base + sky.CloudLayer.w;

        if (abs(direction.z) < 1e-5)
        {
            // A horizontal ray only sees the layer when the origin is already inside it.
            layerHit = origin.z >= base && origin.z <= top;
            if (layerHit) { layerNear = 0.0; layerFar = maxDistance; }
        }
        else
        {
            float tBase = (base - origin.z) / direction.z;
            float tTop  = (top  - origin.z) / direction.z;
            layerNear = max(0.0, min(tBase, tTop));
            layerFar  = min(maxDistance, max(tBase, tTop));
            layerHit  = layerFar > layerNear;
        }
    }

    // When the layer is the only medium, clip the path to it: a ray that misses the slab must return immediately.
    uint volumeFlags = flags & (kCelestialFlagFog | kCelestialFlagLocalFog | kCelestialFlagLocalCloud);
    bool otherMediumPresent = volumeFlags != 0u;
    bool splitLayer = otherMediumPresent && layerHit
                   && (layerNear > pathNear + 1e-4 || layerFar < pathFar - 1e-4);
    if (!otherMediumPresent)
    {
        if (!layerHit) return vec3(0.0);
        pathNear = layerNear;
        pathFar  = layerFar;
    }

    if (pathFar <= pathNear) return vec3(0.0);

    // With a full-path medium, reserve two thirds of the samples for the cloud slab. The remainder is split
    // between the fog-only intervals before and after it. The 48-step sky budget therefore remains bounded, while
    // the cloud always receives 32 samples instead of an angle-dependent zero-or-one.
    int preSteps = steps;
    int layerSteps = 0;
    int postSteps = 0;
    if (splitLayer)
    {
        layerSteps = min(steps, max(8, (steps * 2) / 3));
        int outsideSteps = steps - layerSteps;
        bool hasPre  = layerNear > pathNear + 1e-4;
        bool hasPost = layerFar  < pathFar  - 1e-4;
        if (hasPre && hasPost)
        {
            preSteps = outsideSteps / 2;
            postSteps = outsideSteps - preSteps;
        }
        else if (hasPre)
        {
            preSteps = outsideSteps;
            postSteps = 0;
        }
        else
        {
            preSteps = 0;
            postSteps = outsideSteps;
        }
        // At very small budgets one side can receive zero samples; the layer still gets every remaining sample,
        // and the normal path is retained for the production 48-step / 12-step budgets.
    }

    vec3  radiance = vec3(0.0);
    float transmittance = 1.0;

    // A fixed midpoint in every ray is another way to manufacture rings: at a shallow angle the same sample
    //    fraction crosses the same height contour across a whole row of pixels. Jitter the stratified sample
    //    within its interval using the ray direction. It is deterministic (so it cannot shimmer from frame to
    //    frame), but it breaks the screen-aligned march pattern; temporal accumulation supplies the missing
    //    sub-sample coverage on the real viewport.
    float sampleJitter = fract(sin(dot(direction, vec3(12.9898, 78.233, 45.164))) * 43758.5453123);

    for (int i = 0; i < steps; ++i)
    {
        float sampleNear = pathNear;
        float sampleStep = (pathFar - pathNear) / float(steps);
        int sampleIndex = i;

        if (splitLayer)
        {
            if (i < preSteps && preSteps > 0)
            {
                sampleNear  = pathNear;
                sampleStep = (layerNear - pathNear) / float(preSteps);
                sampleIndex = i;
            }
            else if (i < preSteps + layerSteps)
            {
                sampleNear  = layerNear;
                sampleStep = (layerFar - layerNear) / float(layerSteps);
                sampleIndex = i - preSteps;
            }
            else if (postSteps > 0)
            {
                sampleNear  = layerFar;
                sampleStep = (pathFar - layerFar) / float(postSteps);
                sampleIndex = i - preSteps - layerSteps;
            }
        }

        vec3 position = origin + direction * (sampleNear + sampleStep * (float(sampleIndex) + sampleJitter));

        float density = MediaDensity(sky, position);
        if (density <= 0.001) continue;   // empty space is the common case; skip the lighting work

        float extinction = density * absorption * sampleStep;

        // Sunlight reaching here, self-shadowed by the medium above.
        float sunlight = MediaSunTransmittance(sky, position, sunDirection);

        // 🔴 THE EXTINCTION IS COUNTED EXACTLY ONCE, AND THE FIRST VERSION COUNTED IT THREE TIMES.
        //
        //    It read `inScatter * BeerPowder(extinction) * density * (1 - segment)`. Both `BeerPowder` and
        //    `(1 - segment)` are functions of the same optical depth, and `density` is a third factor of the
        //    same quantity — so the source term was attenuated roughly cubically. Measured: a fully opaque
        //    cloud emitted 0.0070 against a sky of 8.25, so clouds composited DARKER than the sky behind them
        //    and rendered as black rocks floating in the air.
        //
        //    The correct form is the standard emission-absorption integral: the in-scatter is a RADIANCE, and
        //    `(1 - exp(-extinction))` is the fraction of the step that scatters it toward the eye. Nothing else.
        //
        //    ⚠️ The powder term is a property of the SUNLIGHT reaching this point, not of the segment, so it
        //    takes the optical depth toward the sun rather than along the view ray. That is what makes thin
        //    edges facing away from the sun dark, which is the effect it exists for.
        // 🔴 MULTIPLE SCATTERING, AND WITHOUT IT CLOUDS RENDER AS DARK SMOKE. This is the same failure that
        //    made the ATMOSPHERE too dark (D1/D2), and it is worse here: cloud droplets have a single-scatter
        //    albedo near 1, so light bounces many times before escaping. Hillaire states it directly —
        //    "multiple scattering is a requirement to render clouds that do not look like dark smoke".
        //
        //    Measured before this term: a fully lit point at the top of a cloud produced an in-scatter of 0.23
        //    against a sky of 8.25, so every cloud composited DARKER than the sky and rendered as a black rock.
        //
        //    The fix is the standard octave approximation (Wrenninge/Hillaire): sum a few scattering orders,
        //    each with less extinction and a flatter phase function than the last. Higher orders have been
        //    scattered so many times they arrive from everywhere, which is why the phase tends to isotropic —
        //    and that isotropic bulk is what makes a cloud white rather than a silhouette.
        //
        //    ⚠️ kMediaAlbedoGain IS AN ENERGY NORMALISATION, NOT A BRIGHTNESS DIAL. The octave sum uses phase
        //    functions, which integrate to 1 over the SPHERE, so a single lobe sample averages 1/4pi ~ 0.08.
        //    That is right for one scattering event and wrong for a cloud, which behaves as a diffusely
        //    reflecting body: a white cloud has a bulk albedo near 0.9, so its radiance is E x albedo / pi.
        //    Measured, the bare octave sum reached 0.077 x E where the physical answer is 0.286 x E — which is
        //    why lit cloud tops came out DARKER than the blue sky beside them. The gain closes exactly that
        //    gap and is derived, not tuned.
        // 🔴 THE PROPER AMBIENT TERM: HEMISPHERICAL SKY FROM ABOVE, GROUND BOUNCE FROM BELOW.
        //
        //    This replaces passing the view-ray sky colour straight in as "ambient", which was wrong in an
        //    obvious way once stated: for a cloud seen from below, the sky along the view ray is the sky the
        //    cloud is BLOCKING, not the light reaching it. That is why the undersides stayed black.
        //
        //    A point inside a cloud is lit from two directions that do not depend on the sun at all:
        //      · the sky dome above it, attenuated by however much cloud is overhead;
        //      · the ground below it, which reflects a fraction of everything falling on it.
        //    Neither vanishes deep in the deck — which is the whole point, because the first-order sun term
        //    does vanish (optical depth ~26 through this slab, i.e. exp(-26) ~ 5e-12) and something has to be
        //    left. A real cumulus base is grey, not black.
        float heightInCloud = clamp((position.z - sky.CloudLayer.z) / max(sky.CloudLayer.w, 1.0), 0.0, 1.0);

        // Sky reaches down from the top; ground bounce reaches up from the bottom. Both fall off toward the
        //    middle of the deck, which is genuinely the darkest part of a thick cloud.
        float fromAbove = exp(-(1.0 - heightInCloud) * kMediaAmbientFalloff);
        float fromBelow = exp(-heightInCloud * kMediaAmbientFalloff) * kMediaGroundBounce;

        vec3 inScatter = skyAmbient * ambient * (fromAbove + fromBelow);
        {
            float orderExtinction = 1.0;
            float orderPhase      = 1.0;
            float orderWeight     = 1.0;

            for (int order = 0; order < kMediaScatterOrders; ++order)
            {
                // Each order sees a thinner medium (light that scattered many times took a longer, more
                //    attenuated path but arrives from a wider cone), and a phase closer to uniform.
                //
                //    🔴 THE FLOOR IS THE WHOLE POINT OF THE HIGHER ORDERS, AND WITHOUT IT CLOUD BASES WENT
                //    BLACK. `sunlight` is the transmittance along the straight line to the sun, so deep inside
                //    a cloud it is essentially zero — and raising it to a power keeps it zero. But light that
                //    has scattered three times did not travel in a straight line: it diffused in from the lit
                //    top and the bright sides, which is exactly why the underside of a real cumulus is grey
                //    rather than black. Blending each order toward a depth-independent floor models that
                //    diffusion; without it the octave sum contributes nothing precisely where it matters most.
                float straight = pow(max(sunlight, 1e-4), orderExtinction);
                float diffused = mix(straight, kMediaDiffuseFloor, 1.0 - orderWeight);
                float orderSunlight = max(straight, diffused);
                // ⚠️ This floor handles SUN light that has diffused sideways through the cloud. It is a
                //    different mechanism from the ambient term above, which handles SKY and GROUND light, and
                //    both are needed: the floor alone left bases black because orders 2 and 3 carry only 0.5
                //    and 0.25 of the weight while the first order still collapses to zero.
                float orderLobe     = mix(0.25 / 3.14159265, phase, orderPhase);

                inScatter += sunRadiance * (orderSunlight * orderLobe * orderWeight * kMediaAlbedoGain);

                orderExtinction *= kMediaOrderExtinction;
                orderPhase      *= kMediaOrderPhase;
                orderWeight     *= kMediaOrderWeight;
            }
        }

        // Powder darkens thin wisps. It takes the VIEW-ray optical depth at this sample, because "thin" means
        //    thin as seen from here — and it is applied to the whole in-scatter, which keeps the dark-edge look
        //    without touching the body of the cloud.
        inScatter *= MediaBeerPowder(extinction, powder);

        // Analytic segment integration, as in AtmosphereScatter: exact for a constant source over the step and
        //    free of the banding a rectangle rule leaves in thick media.
        float segment = exp(-extinction);
        radiance += transmittance * inScatter * (1.0 - segment);
        transmittance *= segment;

        if (transmittance < 0.003) break;   // saturated; nothing behind this will show
    }

    outTransmittance = transmittance;
    return radiance;
}

// 🔴 HOW MUCH DIRECT SUNLIGHT A GROUND POINT RECEIVES THROUGH THE CLOUD DECK.
//
//    Without this, clouds are painted on the sky and the ground below them stays in full sun — which is the
//    single most obvious way volumetric clouds fail to be lighting. It is also what the user noticed:
//    "clouds are also blocking light it seems", i.e. they should be and were not.
//
//    ⚠️ A FULL MARCH IS NOT AFFORDABLE HERE. This runs on the shadow-ray path, once per shaded pixel, so it
//    samples the deck a handful of times along the line to the sun instead of marching it. That is enough to
//    get a moving, shaped shadow — the point is that a cloud passing overhead dims the ground beneath it, not
//    that the shadow edge is pixel-exact.
float MediaSunShadow(CelestialRecord sky, vec3 worldPosition, vec3 sunDirection)
{
    float coverage = sky.CloudLayer.x;
    if (coverage <= 0.0 || sunDirection.z <= 0.01) return 1.0;

    float base      = sky.CloudLayer.z;
    float thickness = sky.CloudLayer.w;

    // Where the line to the sun crosses the slab. Below the deck this is a climb; inside it, a short hop.
    float toBase = (base - worldPosition.z) / sunDirection.z;
    float toTop  = (base + thickness - worldPosition.z) / sunDirection.z;
    float near = max(0.0, min(toBase, toTop));
    float far  = max(toBase, toTop);
    if (far <= near) return 1.0;

    float span = far - near;
    float step = span / float(kMediaShadowSteps);

    float depth = 0.0;
    for (int i = 0; i < kMediaShadowSteps; ++i)
    {
        vec3 position = worldPosition + sunDirection * (near + step * (float(i) + 0.5));
        depth += MediaLayerDensity(sky, position) * step;
    }

    // The same absorption the view march uses, so a cloud that LOOKS opaque also SHADES as if it were.
    return exp(-depth * max(sky.CloudAbsorptionAndWind.x, 1e-6));
}

// The cheap form, for the bounce path. A bounce ray needs to know how much the cloud deck DIMS the sky it is
//    sampling, not what shape the clouds are — so this is a closed-form estimate of the deck's average opacity
//    along the ray, with no noise samples and no march at all.
//
//    🔴 THIS IS WHY THE BOUNCE PATH STAYS AFFORDABLE. CelestialSky is called once per bounce SAMPLE; a march
//    there would multiply by the sample count. Using the average coverage instead costs a handful of ALU.
float MediaAmbientTransmittance(CelestialRecord sky, vec3 direction)
{
    float coverage = sky.CloudLayer.x;
    if (coverage <= 0.0) return 1.0;

    // A ray pointing along the horizon crosses far more of the slab than one pointing straight up. The secant of
    //    the zenith angle is the standard slab-crossing factor, clamped so the horizon does not go infinite.
    float upward = max(abs(direction.z), 0.12);
    float pathFactor = min(1.0 / upward, 8.0);

    // 🔴 ANCHORED TO REAL OVERCAST, BECAUSE THE OBVIOUS FORMULA IS CATASTROPHICALLY WRONG.
    //
    //    Multiplying coverage x density x absorption x the full slab thickness gives an optical depth of 15 at
    //    35% cover and 43 at 95% — transmittances of 1e-7 and 3e-19. That is not overcast, that is a lightless
    //    cave, and a scene under it would render black. The error is treating the entire slab as uniformly
    //    dense: real cloud fills a fraction of its own volume, and the gaps between and within clouds carry
    //    most of the light that reaches the ground.
    //
    //    Measured reality: heavy overcast passes roughly 10-25% of clear-sky illuminance, thin cloud 50-70%.
    //    kMediaOvercastFloor is the fraction that survives a completely closed sky — light that has diffused
    //    THROUGH the deck rather than around it, which is why an overcast day is still bright enough to read by.
    float depth = coverage * sky.CloudLayer.y * sky.CloudAbsorptionAndWind.x
                * sky.CloudLayer.w * kMediaAmbientFill * pathFactor;

    return mix(kMediaOvercastFloor, 1.0, exp(-depth));
}

#endif // FRONTIER_CELESTIAL_MEDIA
