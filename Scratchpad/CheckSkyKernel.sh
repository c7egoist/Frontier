#!/usr/bin/env bash
#============================================================================================================================================
# 📦 Scratchpad/CheckSkyKernel.sh — the sky reaches the ray-tracing kernel, and says the same thing there
#============================================================================================================================================
# ReSTIRViewport had two branches reading "there is no environment light": a missed primary ray and an escaped
#    bounce ray. The first is the sky BEHIND the geometry; the second is the sky AS A LIGHT, and in an outdoor
#    scene it is the largest emitter present. Both are now wired to Shaders/SkyRecords.slang at binding 21.
#
# Six ways this rots, all guarded:
#    ① the shader drifts from AtmosphereModel, so the GI-on and GI-off skies stop matching,
#    ② the std140 block and its C++ mirror disagree, which is a wrong picture rather than a compile error,
#    ③ a miss branch quietly goes back to contributing nothing,
#    ④ the sequence packs the kernel a different sky than the raster's (PackSkyRecord must mirror ApplyTo),
#    ⑤ the host stops writing the descriptor — the layout, the pool, the write or the per-frame push,
#    ⑥ the kernel's cloud path drifts from the raster's march (drift, shadow taps, step caps, albedos), so the
#       ReSTIR sky shows a different weather than the raster's — guarded by the twin proof and the pins below.
set -u
cd "$(dirname "$0")/.."
Fail=0
Report() { if [ "$1" = "0" ]; then printf '  %-66s PASS\n' "$2"; else printf '  %-66s FAIL\n' "$2"; Fail=1; fi; }

echo "[SkyKernel] the shader computes the same sky as the model"
Binary="$(mktemp -u /tmp/SkyKernelParity.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I . -I Engine -o "$Binary" Scratchpad/SkyKernelParityProof.cpp \
     2>/tmp/SkyKernel.build; then
    echo "  PARITY PROOF FAILED TO BUILD"; sed 's/^/    /' /tmp/SkyKernel.build | head -16; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

echo
echo "[SkyKernel] the sequence packs the raster's sky for the kernel"
# A live CelestialSequence, packed before and after its first tick with a poisoned Light cache: the record must
#    carry the solved sun either way. Links the real sequence, solver and catalogue; -gc-sections drops the
#    editor-facing methods (and their raster externals) that the pack never touches.
Pack="$(mktemp -u /tmp/SkyPackProof.XXXXXX)"
if ! g++ -std=c++20 -O2 -ffunction-sections -fdata-sections -Wall -Wextra -I . -I Engine -o "$Pack" \
     Scratchpad/SkyPackProof.cpp Projects/Project-Zero/Source/CelestialSequence.cpp \
     Engine/DisplayPresentation/CelestialSolver.cpp Engine/GeometricRaster/StarCatalogueIndex.cpp \
     -Wl,--gc-sections 2>/tmp/SkyPack.build; then
    echo "  PACK PROOF FAILED TO BUILD"; sed 's/^/    /' /tmp/SkyPack.build | head -16; exit 1
fi
"$Pack" || Fail=1
rm -f "$Pack"

echo
echo "[SkyKernel] the kernel's cloud path renders the raster's clouds"
# The shader cannot be dispatched here, so its cloud path is re-transcribed to C++ and rendered through the
#    production pack at morning and at morning-plus-two-cloud-hours: both frames must be streak-free (the old
#    flow-times-time drift shredded the slab progressively through the day) and the twin must match the raster
#    march it mirrors. Links the sequence, solver, catalogue and classifier; re-renders the committed pin.
CloudProof="$(mktemp -u /tmp/SkyCloudKernelProof.XXXXXX)"
if ! g++ -std=c++20 -O2 -ffunction-sections -fdata-sections -Wall -Wextra -I . -I Engine -I Scratchpad \
     -o "$CloudProof" Scratchpad/SkyCloudKernelProof.cpp Projects/Project-Zero/Source/CelestialSequence.cpp \
     Engine/DisplayPresentation/CelestialSolver.cpp Engine/GeometricRaster/StarCatalogueIndex.cpp \
     Engine/DisplayPresentation/FidelityClassifier.cpp \
     -Wl,--gc-sections 2>/tmp/SkyCloudKernel.build; then
    echo "  CLOUD PROOF FAILED TO BUILD"; sed 's/^/    /' /tmp/SkyCloudKernel.build | head -16; exit 1
fi
"$CloudProof" || Fail=1
rm -f "$CloudProof"

Kernel=Engine/Shaders/ReSTIRViewport.slang
Sky=Engine/Shaders/SkyRecords.slang
Post=Engine/Shaders/PostRecords.slang
Code="$(sed 's;//.*;;' "$Kernel")"
SkyCode="$(sed 's;//.*;;' "$Sky")"
PostCode="$(sed 's;//.*;;' "$Post")"

echo
echo "[SkyKernel] both miss branches collect the sky"
# ⚠️ Comments are stripped first. Both files explain these branches at length and a bare word match would find
#    the prose rather than the code — the trap CheckShadowTiers records for the PCSS half-angle.
printf '%s' "$Code" | grep -q 'Resolve(pixel, SkyAlong(direction, CameraOrigin) + RainbowAlong(direction, SkySunDirection.xyz, 1.0e6));'
Report $? "a missed primary ray resolves to the sky and the bow"
printf '%s' "$Code" | grep -q 'accumulatedRadiance += throughput \* SkyAlong(bounceDir, hitPos);'
Report $? "an escaped bounce ray adds the sky as a light"
# The old text is the regression: if either branch says this again, the sky has been unwired.
! printf '%s' "$Code" | grep -q 'Resolve(pixel, vec3(0.0));'
Report $? "no miss branch resolves to black any more"

echo
echo "[SkyKernel] one entry point, so the two branches cannot diverge"
Entries=$(printf '%s' "$SkyCode" | grep -c 'vec3 SkyAlong(vec3 Direction, vec3 Origin)')
[ "$Entries" = "1" ]
Report $? "SkyRecords exposes exactly one SkyAlong ($Entries found)"

echo
echo "[SkyKernel] weather crosses the same paths as the atmosphere"
printf '%s' "$SkyCode" | grep -q 'Transmittance \*= CloudTransmittance;'
Report $? "the atmosphere's celestial sources inherit cloud transmittance"
printf '%s' "$SkyCode" | grep -q 'SkyTwilightGlow(Direction) \* CloudTransmittance'
Report $? "twilight and stars stay behind the cloud layer"
printf '%s' "$Code" | grep -q 'CloudAlong(CameraOrigin, -viewDir, primaryT'
Report $? "a primary surface composes the camera-to-hit weather segment"
printf '%s' "$Code" | grep -q 'CloudSunTransmittance(hitPos, shadeDir, CloudPixelSwirl(hitPos, shadeDir))'
Report $? "the selected ReSTIR sun is shadowed by the cloud field"

echo
echo "[SkyKernel] the kernel's drift is the packed integral, never time-of-day"
# The streak note lives in WindField::AdvectDrift: the local flow times time-of-day piled 76 km of offset
#    across the slab by 7am. Both densities route through the one CloudDriftAt twin — integral times altitude
#    factor — and the frozen-shear form it replaced (shear memory, two-cell clamp) must not return on either
#    side. The w-lane clock it read is retired: the Clock row carries the integral and the wall.
DriftDefs=$(printf '%s' "$SkyCode" | grep -c 'vec2 CloudDriftAt(float Altitude')
[ "$DriftDefs" = "1" ]
Report $? "exactly one CloudDriftAt twin ($DriftDefs found)"
DriftCalls=$(printf '%s' "$SkyCode" | grep -c 'CloudDriftAt(Position')
[ "$DriftCalls" = "3" ]
Report $? "all three media route through it ($DriftCalls call sites)"
printf '%s' "$SkyCode" | grep -q 'SkyCloudClock.xy \* Factor \* ArtFactor'
Report $? "the drift is the packed integral times the altitude factor"
printf '%s' "$SkyCode" | grep -q 'max(1e-3, SkyCloudWind.x)'
Report $? "the factor divides by the surface wind, guarded at zero"
! printf '%s' "$SkyCode" | grep -q 'kShearMemory'
Report $? "no shear memory survives in the shader"
! grep -q 'kShearMemory' Engine/DisplayPresentation/WindField.h
Report $? "none survives on the host either"
! printf '%s' "$SkyCode" | grep -q 'SkyCloudAlbedo.w'
Report $? "nothing reads the retired w-lane clock"
WindCalls=$(printf '%s' "$SkyCode" | grep -c 'CloudWindAt(')
[ "$WindCalls" = "2" ]
Report $? "the wind is sampled only inside the drift ($WindCalls sites: def + 1)"

echo
echo "[SkyKernel] the kernel cuts the slab at the far cap, like the march"
# The shader and its twin spell the same law (celestial line 1023) so a capped grazing ray shades identically
# on every path — the parity bound below is what would catch a missed twin.
ShaderCaps=$(grep -c 'float CloudSlabFarCap' Engine/Shaders/SkyRecords.slang)
[ "$ShaderCaps" = "1" ]
Report $? "exactly one shader far-cap helper ($ShaderCaps found)"
TwinCaps=$(grep -c 'float TwinSlabFarCap' Scratchpad/SkyCloudKernelProof.cpp)
[ "$TwinCaps" = "1" ]
Report $? "exactly one twin far-cap helper ($TwinCaps found)"
printf '%s' "$SkyCode" | grep -q 'Thickness \* 14\.0'
Report $? "below and inside, the kernel's cap is thick x 14"
printf '%s' "$SkyCode" | grep -q 'max(60000\.0, Thickness \* 40\.0)'
Report $? "above, the kernel's cap is max(60 km, thick x 40)"
ShaderCalls=$(grep -c 'CloudSlabFarCap(Origin' Engine/Shaders/SkyRecords.slang)
[ "$ShaderCalls" = "2" ]
Report $? "both kernel interval branches cut at it ($ShaderCalls call sites)"
TwinCalls=$(grep -c 'TwinSlabFarCap(Origin' Scratchpad/SkyCloudKernelProof.cpp)
[ "$TwinCalls" = "2" ]
Report $? "both twin interval branches cut at it ($TwinCalls call sites)"

echo
echo "[SkyKernel] the kernel's shadow, steps and whites match the march"
# P2.4b: the kernel marches the reference's light quadratures — clLight's growing-spaced taps for the layer,
#    uniShadow's linear taps for the boxes — and no view step may leak into either body (the CPU march passes
#    none). The midpoint-grid prohibition stays: a full-interval march strides whole clouds at grazing and
#    aliases into noise (the view march keeps its grid — the resolved-local-taps structure, asserted as one).
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q '(Top - Base) \* 0.12'
Report $? "the layer shadow paces the thickness"
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q 'St \* float(I) \* float(I) \* 0.35'
Report $? "the layer taps grow quadratically"
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q ') \* D \* 0.8'
Report $? "the layer taps weigh d x .8"
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q 'Medium == 1u ? 0.25 : 0.5'
Report $? "the boxes pace the half-size (x.25 cloud, x.5 fog)"
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q 'I <= 4u; ++I)'
Report $? "the boxes march a fixed 4 taps"
sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | grep -q 'I <= 5u; ++I)'
Report $? "the layer marches at most 5 taps"
! sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | sed 's;//.*;;' | grep -q 'StepSize'
Report $? "no view step leaks into the shadow"
! sed -n '/float CloudShadowDepth/,/^}/p' "$Sky" | sed 's;//.*;;' | grep -q '(float(I) + 0.5)'
Report $? "no full-interval midpoint grid inside the shadow march"
printf '%s' "$SkyCode" | grep -q 'kCloudExtinctionScale = 0.06;'
Report $? "cloud extinction is the reference's .06"
printf '%s' "$SkyCode" | grep -q 'kFogExtinctionScale = 0.01;'
Report $? "fog keeps its own .01"
printf '%s' "$SkyCode" | grep -q '(1.0 + SkyCloudScatter.w) \* kCloudExtinctionScale'
Report $? "cloud reads the packed absorption with its scale"
grep -q 'St\*float(I)\*float(I)\*0.35f' Scratchpad/SkyCloudKernelProof.cpp
Report $? "the twin's layer taps grow quadratically too"
grep -q 'kTwinCloudExtinction = 0.06f' Scratchpad/SkyCloudKernelProof.cpp
Report $? "the twin reads cloud .06 as well"
printf '%s' "$SkyCode" | grep -q 'max(Budget \* 4u, 4u)'
Report $? "the layer's step cap is the CPU march's 4x budget"
printf '%s' "$SkyCode" | grep -q 'vec3(0.88)'
Report $? "the fog keeps the CPU march's fixed grey"

echo
echo "[SkyKernel] the kernel's light loop is the reference's"
# P2.4c: cloudMarch/marchLocal's light — the .02 weather gain, the dual lobe x4pi, multi-scatter in place
#    of the shadow transmittance, Beer powder, height-in-slab ambient, the Sc/sigT accumulation. (The shadow
#    re-scope above — CloudShadowMedium to CloudShadowDepth — is P2.4c's too: the light loop reads each
#    medium's own od, so the quadrature returns depth and the transmittance is the wrapper's exponential.)
printf '%s' "$SkyCode" | grep -q 'vec3 SunL = SunRadiance \* 0.02;'
Report $? "sunlight enters the weather with the panel's .02 gain"
printf '%s' "$SkyCode" | grep -q 'CloudDualLobe(CosSun, SkyCloudScatter\.x, SkyCloudScatter\.y, SkyCloudScatter\.z)'
Report $? "the clouds read the dual lobe from the global scatter row"
printf '%s' "$SkyCode" | grep -q 'CloudSingleLobe(CosSun, SkyLocalFogParams\.w)'
Report $? "the fog keeps its own g in a single lobe"
printf '%s' "$SkyCode" | grep -q 'CloudMultiScatterLayer(Own, SkyCloudScatter\.w)'
Report $? "the layer's octaves read its own depth with absorption"
printf '%s' "$SkyCode" | grep -q 'CloudMultiScatterLocal(exp(-Own))'
Report $? "the local closed form reads its own depth in T-space"
printf '%s' "$SkyCode" | grep -q 'CloudPowder(CosSun, Extinction, SkyCloudDetail\.y)'
Report $? "powder reads the view slice and the detail row"
printf '%s' "$SkyCode" | grep -q 'mix(OwnRaw, Density \* (LayerTop - LayerBase) \* 0\.3, Lod)'
Report $? "far from the slab the shadow mixes to rho*thick*.3"
printf '%s' "$SkyCode" | grep -q 'float OthersT = exp(-((D0 + D1 + D2) - OwnRaw));'
Report $? "the others' transmittance crosses the media"
printf '%s' "$SkyCode" | grep -q 'float SunT = Medium == 2u ? CombinedT : OthersT;'
Report $? "clouds take OthersT, the fog the combined shadow"
printf '%s' "$SkyCode" | grep -q '(0\.35 + 0\.65 \* Hn)'
Report $? "the ambient lifts by height-in-slab"
printf '%s' "$SkyCode" | grep -q 'Ms += B \* exp(-Od \* A \* (1\.0 + Absorb));'
Report $? "the octaves attenuate inside the exponent"
printf '%s' "$SkyCode" | grep -q 'A \*= 0\.5; B \*= 0\.55;'
Report $? "halving extinction, .55 contribution"
printf '%s' "$SkyCode" | grep -q 'T + 0\.55 \* Root + 0\.3 \* sqrt(Root)'
Report $? "the closed form sums T, root and fourth-root"
printf '%s' "$SkyCode" | grep -q '1\.0 - 0\.5 \* clamp(CosTheta, 0\.0, 1\.0)'
Report $? "powder gates on the sun-ahead cosine"

echo
echo "[SkyKernel] the kernel's densities twin the reference field"
# P2.4a: the shader transcribes clDensity/lcDensity term for term — the twin proof re-renders both frames to
#    bound the transcription, and these pins hold its constants so a retune lands on all three paths or fails
#    here. The local word unpacks beside the densities; the pack that fills it is pinned with the record.
ShaderOct=$(printf '%s' "$SkyCode" | grep -c 'S \* 8.3')
[ "$ShaderOct" = "2" ]
Report $? "both ported densities sum the fourth octave ($ShaderOct sites)"
ShaderGate=$(printf '%s' "$SkyCode" | grep -c 'Lod > 0.5')
[ "$ShaderGate" = "2" ]
Report $? "both ported densities gate erosion at lod 0.5 ($ShaderGate sites)"
printf '%s' "$SkyCode" | grep -q 'Hn \* (Top - Base) \* 0.35 \* LeanFactor'
Report $? "the slab leans 0.35 of its depth downwind"
ShaderErode=$(printf '%s' "$SkyCode" | grep -c 'clamp(Hn \* 3.0, 0.0, 1.0)) \* SkyCloudDetail')
[ "$ShaderErode" = "2" ]
Report $? "both ported densities erode through the detail row ($ShaderErode sites)"
printf '%s' "$SkyCode" | grep -q 'S.x \* 0.25, S.y \* 6.0, S.z \* 4.0'
Report $? "the cirrus streak stretches across the wind"
printf '%s' "$SkyCode" | grep -q 'smoothstep(20000.0, 200000.0, Near)'
Report $? "the march fades detail across 20-200 km"
printf '%s' "$SkyCode" | grep -q 'vec3 CloudPixelSwirl(vec3 Origin, vec3 Direction)'
Report $? "one per-pixel swirl feeds the march and the sun taps"
printf '%s' "$SkyCode" | grep -q 'Dy - Dx) \* Scale \* 8.0'
Report $? "the swirl carries the reference's x8"
printf '%s' "$SkyCode" | grep -q '(LocalPack >> 8u)'
Report $? "the local word unpacks its 8-bit softness"
ShaderRemap=$(printf '%s' "$SkyCode" | grep -c 'smoothstep(0.0, 1.0, Raw)')
[ "$ShaderRemap" = "1" ]
Report $? "the smoothstep remap survives only in the kept fog ($ShaderRemap site)"
TwinSwirl=$(grep -c 'void TwinSwirlAt' Scratchpad/SkyCloudKernelProof.cpp)
[ "$TwinSwirl" = "1" ]
Report $? "the twin stirs its own swirl ($TwinSwirl helper)"
grep -q 'Soft8 << 8u' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "softness bit-packs into the local-cloud word"
grep -q 'R.CloudClock\[3\] = Wind.Turbulence' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "the turbulence reaches the clock row for the swirl"

echo
echo "[SkyKernel] the block is declared where it was reserved"
printf '%s' "$SkyCode" | grep -q 'layout(std140, binding = 21) uniform SkyConstants'
Report $? "the sky uniform sits at binding 21"
# 23-24 are the post seam's: star tables (storage) and the post record (UBO). Both are written at bring-up,
#    so neither is the declared-but-unwritten hole this assert used to forbid.
printf '%s' "$PostCode" | grep -q 'layout(std430, binding = 23) readonly buffer StarTable'
Report $? "the star tables sit at binding 23"
printf '%s' "$PostCode" | grep -q 'layout(std140, binding = 24) uniform PostConstants'
Report $? "the post record sits at binding 24"
printf '%s' "$Code" | grep -q 'binding = 25) uniform sampler2D Textures'
Report $? "the bindless table is still last, as a variable-count binding must be"

echo
echo "[SkyKernel] the coefficients are not copied into the shader"
# A literal Rayleigh triple in the shader is the GI-on and GI-off skies starting to drift.
! printf '%s' "$SkyCode" | grep -qE '5\.8e-6|13\.5e-6|33\.1e-6'
Report $? "the medium arrives in the block rather than being restated"

echo
echo "[SkyKernel] the aureole shoulder is one value on both paths"
# The compression knee/slope/width exist twice (GLSL + C++) with no shared header, so the literals are pinned
#    pairwise: a retune that lands on one path and not the other fails here rather than shipping two suns.
printf '%s' "$SkyCode" | grep -qE 'kAureoleKnee += 1\.0;'
Report $? "the shader's knee is 1.0 linear"
grep -qE 'kAureoleKnee += 1\.0f;' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "the host's knee is the same 1.0"
printf '%s' "$SkyCode" | grep -qE 'kAureoleSlope += 0\.06;'
Report $? "the shader's shoulder slope is 0.06"
grep -qE 'kAureoleSlope += 0\.06f;' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "the host's shoulder slope is the same 0.06"
printf '%s' "$SkyCode" | grep -qE 'kAureoleSigma = 5\.0'
Report $? "the shader's aureole width is 5 deg"
grep -qE 'kAureoleSigma = 5\.0f' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "the host's aureole width is the same 5 deg"

echo
echo "[SkyKernel] the sun's body is one formula on both paths"
# P1: the disc lives once (SunDisc::Evaluate) and the shader transcribes it term for term. The elevation
#    everywhere is the SUN's — the panel evaluates its disc from the sun's own altitude, and a revision that read
#    the view ray drew the wrong extinction everywhere off the sun's centre — and the reddening is the panel's
#    max(sun-path extinction, view-transmittance-squared).
Defs=$(grep -c 'static void Evaluate(const AtmosphereLight& Light, const AtmosphereMedium& Medium,' Engine/DisplayPresentation/AtmosphereModel.h)
[ "$Defs" = "1" ]
Report $? "the disc lives in exactly one place ($Defs definition)"
grep -q 'SunDisc::Evaluate(Celestial_.Light, Celestial_.Medium, SunAng, SunElevationDegrees,' Engine/GeometricRaster/VisibilityRaster.cpp
Report $? "the raster calls it with the sun's elevation, never the view ray's"
! printf '%s' "$SkyCode" | grep -q 'ViewElev'
Report $? "the shader's disc knows no view elevation"
printf '%s' "$SkyCode" | grep -q 'float SunElev = SkySunDirection.w;'
Report $? "the shader gates, softens and reddens by the sun's elevation"
printf '%s' "$SkyCode" | grep -q 'float SkyAirMass(float ElevationDegrees)'
Report $? "the shader carries its own Kasten-Young for the sun path"
printf '%s' "$SkyCode" | grep -qF 'max(SunExt, ViewTransmittance * ViewTransmittance)'
Report $? "the disc reddens by max(sun-path extinction, view-transmittance-squared)"
# Pairwise literals: the disc's constants exist twice (C++ + shader) with no shared header, so a retune that
#    lands on one path and not the other fails here rather than shipping two suns.
printf '%s' "$SkyCode" | grep -qE 'kSunSoft = 0\.25;'
Report $? "the shader's softness is the panel's 0.25"
grep -qE 'kSunSoft = 0\.25f;' Engine/DisplayPresentation/AtmosphereModel.h
Report $? "the host's softness is the same 0.25"
printf '%s' "$SkyCode" | grep -qE 'kSunBoost = 12\.0;'
Report $? "the shader's boost is the panel's 12x"
grep -qE 'kSunBoost = 12\.0f;' Engine/DisplayPresentation/AtmosphereModel.h
Report $? "the host's boost is the same 12x"
# Planet, shell and sunlight: the panel's defaults, in the one place both paths read them.
grep -qE 'PlanetRadius += 6371000\.0f;' Engine/DisplayPresentation/AtmosphereModel.h
Report $? "the planet is the panel's 6371 km"
grep -qE 'AtmosphereHeight = 100000\.0f;' Engine/DisplayPresentation/AtmosphereModel.h
Report $? "the shell is the panel's 100 km"
grep -qE 'Colour\[3\] += \{ 1\.0f, 0\.9521f, 0\.9065f \};' Engine/DisplayPresentation/AtmosphereModel.h
Report $? "sunlight carries the panel's 5800 K tint"

echo
echo "[SkyKernel] the C++ mirror matches the shader's std140 layout"
grep -q 'static_assert(sizeof(SkyConstantRecord) == 368u' Engine/DisplayPresentation/SkyConstantRecord.h
Report $? "the sky and weather record is pinned at 368 bytes"
Offsets=$(grep -c 'static_assert(offsetof(SkyConstantRecord' Engine/DisplayPresentation/SkyConstantRecord.h)
[ "$Offsets" -ge 8 ]
Report $? "every member's offset is asserted ($Offsets of them)"

echo
echo "[SkyKernel] the host writes binding 21 as a uniform buffer"
X=Engine/DeviceExchange/SwapchainExchange.cpp
H=Engine/DeviceExchange/SwapchainExchange.h
PackSite=Projects/Project-Zero/Source/CelestialSequence.cpp
# The layout's descriptorType must equal the shader's declaration: 21 was a COMBINED_IMAGE_SAMPLER hole from
#    Round 9, and a type mismatch is a validation error rather than a wrong picture.
grep -q '(B == 21u || B == 22u || B == 24u) ? VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER' "$X"
Report $? "binding 21 is laid out as a uniform buffer"
grep -q 'B == 14u || B == 15u) ? VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER' "$X"
Report $? "the sampler typing no longer claims binding 22"
# The pool is counted explicitly, so moving 21 across types moves two counts: sampler 5 -> 4, UBO 1 -> 2.
grep -q 'PoolSizes\[2\].descriptorCount = 3u' "$X"
Report $? "the sampler pool no longer budgets binding 22"
grep -q 'PoolSizes\[3\].descriptorCount = 3u' "$X"
Report $? "the UBO pool budgets sky, moons and the retired hole"
# DeviceExchange may not include DisplayPresentation, so the 368 restated there is pinned by hand: if the mirror
#    ever grows, this is the check that says the host allocation did not follow it.
grep -q 'kSkyRecordBytes = 368u' "$X"
Report $? "the host allocation agrees with the mirror's 368 bytes"
# A write's descriptorType must equal the layout's too, which is why 21 has its own helper rather than WriteBuffer.
grep -q 'Write.descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER; Write.pBufferInfo' "$X"
Report $? "the write helper speaks uniform-buffer, not storage-buffer"
grep -q 'WriteUniform(21u, SkyInfo);' "$X"
Report $? "binding 21 is actually written"
# The buffer must exist before BringDescriptorSet, whose WriteDescriptorSet call writes it.
SkyLine=$(grep -n '"BringSkyRecord"' "$X" | head -1 | cut -d: -f1); SkyLine=${SkyLine:-0}
SetLine=$(grep -n '"BringDescriptorSet"' "$X" | head -1 | cut -d: -f1); SetLine=${SetLine:-0}
[ "$SkyLine" -gt 0 ] && [ "$SkyLine" -lt "$SetLine" ]
Report $? "the sky buffer is brought up before the set that writes it"
# Layering is load-bearing, not cosmetic: the exchange receives plain bytes because it must not see the packer.
! grep -q '#include.*DisplayPresentation' "$X"
Report $? "the exchange does not include DisplayPresentation (.cpp)"
! grep -q '#include.*DisplayPresentation' "$H"
Report $? "the exchange does not include DisplayPresentation (.h)"

echo
echo "[SkyKernel] the compiled kernel agrees with the host layout"
# The source greps above pin each side separately; this pins them against each other. The kernel is compiled to
#    real SPIR-V (glslang's WASM build, fetched on demand exactly as CheckShaderCompile does), its binding table
#    is read back out of the binary, and every declared binding must carry the descriptor type the host layout
#    assigns it, 23/24 included: the host writes the star tables and the post record at bring-up, so the
#    table carries them like any other live binding.
SkyCache="${TMPDIR:-/tmp}/frontier-glslang"
SkyVersion="0.0.15"
if ! command -v node >/dev/null 2>&1; then
    echo "  SKIP  node is not installed — SPIR-V cross-check NOT run"
elif [[ ! -f "$SkyCache/package/dist/node-devel/glslang.js" ]] && \
     ! ( mkdir -p "$SkyCache" && cd "$SkyCache" && npm pack "@webgpu/glslang@$SkyVersion" >/dev/null 2>&1 \
         && tar xzf "webgpu-glslang-$SkyVersion.tgz" ); then
    echo "  SKIP  glslang could not be fetched (offline?) — SPIR-V cross-check NOT run"
else
    cat > "$SkyCache/EmitSky.js" <<'JAVASCRIPT'
const FileSystem = require('fs');
const NodePath   = require('path');
const Path       = process.argv[2];
const Cache      = process.argv[3];
const Out        = process.argv[4];
const Roots      = process.argv.slice(5);
function Resolve(File, Seen)
{
    return FileSystem.readFileSync(File, 'utf8').split('\n').map((Line) => {
        const Match = Line.match(/^\s*#\s*include\s+[\"<]([^\">]+)[\">]/);
        if (!Match) return Line;
        for (const Root of Roots)
        {
            const Candidate = NodePath.join(Root, Match[1]);
            if (!FileSystem.existsSync(Candidate)) continue;
            if (Seen.has(Candidate)) return '// (already included) ' + Match[1];
            Seen.add(Candidate);
            return Resolve(Candidate, Seen);
        }
        throw new Error('unresolved #include "' + Match[1] + '" in ' + File);
    }).join('\n');
}
require(Cache + '/package/dist/node-devel/glslang.js')().then((Glslang) => {
    let Source;
    try   { Source = Resolve(Path, new Set()); }
    catch (Error) { process.stderr.write(String(Error)); process.exit(1); }
    Source = Source.replace(/^#version .*$/m, '$&\n#define FRONTIER_SHADER_TOOLCHAIN 1');
    try {
        const Words = Glslang.compileGLSL(Source, 'compute', true);
        const Bytes = Buffer.allocUnsafe(Words.length * 4);
        for (let I = 0; I < Words.length; ++I) Bytes.writeUInt32LE(Words[I] >>> 0, I * 4);
        FileSystem.writeFileSync(Out, Bytes);
    } catch (Error) { process.stderr.write(String(Error)); process.exit(1); }
});
JAVASCRIPT
    Spv="$(mktemp -u /tmp/SkyKernelLayout.XXXXXX.spv)"
    if ! node "$SkyCache/EmitSky.js" "$Kernel" "$SkyCache" "$Spv" Engine Engine/Shaders 2>/tmp/SkyKernelSpv.build; then
        echo "  KERNEL FAILED TO LOWER"; sed 's/^/    /' /tmp/SkyKernelSpv.build | head -8; Fail=1
    else
        Actual="$(python3 - "$Spv" <<'PY'
import struct, sys
data = open(sys.argv[1],'rb').read()
words = struct.unpack('<%dI' % (len(data)//4), data)
assert words[0] == 0x07230203, "bad magic"
i = 5
decor, vartype, varclass, ptrtype, imginfo, elem, block, bufblock = {}, {}, {}, {}, {}, {}, set(), set()
while i < len(words):
    w0 = words[i]; ln = w0 >> 16; op = w0 & 0xFFFF
    ops = words[i+1:i+ln]
    if op == 71 and len(ops) >= 3 and ops[1] == 33: decor.setdefault(ops[0], {})[33] = ops[2]
    elif op == 71 and len(ops) >= 2 and ops[1] == 2: block.add(ops[0])
    elif op == 71 and len(ops) >= 2 and ops[1] == 3: bufblock.add(ops[0])
    elif op == 59 and len(ops) >= 3: vartype[ops[1]] = ops[0]; varclass[ops[1]] = ops[2]
    elif op == 32 and len(ops) >= 3: ptrtype[ops[0]] = (ops[1], ops[2])
    elif op == 25 and len(ops) >= 8: imginfo[ops[0]] = ('image', ops[6])
    elif op == 27 and len(ops) >= 2: imginfo[ops[0]] = ('sampled', None)
    elif op in (28, 29) and len(ops) >= 2: elem[ops[0]] = ops[1]
    i += ln if ln else 1
out = []
for vid, d in decor.items():
    if 33 not in d or vid not in vartype: continue
    t = ptrtype.get(vartype[vid], (None, None))[1]
    while t in elem: t = elem[t]
    cls = varclass[vid]
    if t in imginfo:
        k, s = imginfo[t]
        kind = 'COMBINED_IMAGE_SAMPLER' if k == 'sampled' else ('STORAGE_IMAGE' if s == 2 else 'UNKNOWN-IMAGE')
    elif t in bufblock: kind = 'STORAGE_BUFFER'
    elif cls == 2 and t in block: kind = 'UNIFORM_BUFFER'
    elif cls == 12 and t in block: kind = 'STORAGE_BUFFER'
    else: kind = 'UNKNOWN'
    out.append(f"{d[33]}:{kind}")
print(' '.join(sorted(out, key=lambda s: int(s.split(':')[0]))))
PY
)"
        rm -f "$Spv"
        # The host layout in SwapchainExchange::BringComputePipeline must declare exactly these types. Not derived
        #    from the host source: the point is that two independently written tables agree, so this is written out.
        Expected="0:STORAGE_IMAGE 1:STORAGE_BUFFER 2:STORAGE_BUFFER 3:STORAGE_IMAGE 4:STORAGE_IMAGE 5:STORAGE_IMAGE 6:STORAGE_BUFFER 7:STORAGE_BUFFER 8:STORAGE_BUFFER 9:STORAGE_BUFFER 10:STORAGE_BUFFER 11:STORAGE_BUFFER 12:STORAGE_BUFFER 13:COMBINED_IMAGE_SAMPLER 14:COMBINED_IMAGE_SAMPLER 15:COMBINED_IMAGE_SAMPLER 16:STORAGE_BUFFER 17:STORAGE_BUFFER 18:STORAGE_IMAGE 19:STORAGE_IMAGE 20:STORAGE_IMAGE 21:UNIFORM_BUFFER 22:UNIFORM_BUFFER 23:STORAGE_BUFFER 24:UNIFORM_BUFFER 25:COMBINED_IMAGE_SAMPLER"
        [ "$Actual" = "$Expected" ]
        Report $? "all 25 declared bindings match the host layout"
        if [ "$Actual" != "$Expected" ]; then printf '    shader: %s\n    host:   %s\n' "$Actual" "$Expected"; fi
    fi
fi

echo
echo "[SkyKernel] the sky survives a resize and reaches the frame"
# The record is permanent, not swapchain-sized: torn down in Retire, never in RetireSwapchain.
grep -q 'Vulkan->SkyBuffer) *vkDestroyBuffer' "$X"
Report $? "the sky buffer is destroyed at retire"
! sed -n '/void SwapchainExchange::RetireSwapchain/,/^}/p' "$X" | grep -q 'SkyBuffer'
Report $? "a resize does not unbind the sky"
# One production pack site, so the kernel cannot be handed two skies from two callers.
PackSites=$(grep -rn 'PackSkyConstants(' Engine Projects --include=*.cpp | wc -l)
[ "$PackSites" = "1" ]
Report $? "PackSkyConstants has exactly one production caller ($PackSites found)"
# The structural backstop to the runtime proof above: the pack reads the solved frame, not Light's cache.
sed -n '/SkyConstantRecord CelestialSequence::PackSkyRecord/,/^}/p' "$PackSite" | grep -q 'Effective.Direction\[C\] = Solved.Sun.Direction\[C\]'
Report $? "the pack reads the solved sun direction"
# And the project pushes it every frame: without the call, the buffer stays zeroed and the sky stays off.
grep -q 'Celestial.PackSkyRecord()' Projects/Project-Zero/Source/GameExecution.cpp
Report $? "the project packs the record each frame"
grep -q 'Surface.RefreshSky(' Projects/Project-Zero/Source/GameExecution.cpp
Report $? "the project pushes it at the swapchain"

echo
if [ "$Fail" != "0" ]; then echo "[SkyKernel] FAILED"; exit 1; fi
echo "[SkyKernel] OK"
