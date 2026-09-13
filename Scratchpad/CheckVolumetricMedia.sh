#!/usr/bin/env bash
#============================================================================================================================================
# 📦 Scratchpad/CheckVolumetricMedia.sh — one march, a cloud ceiling, and markers for bodiless volumes
#============================================================================================================================================
# Celestial step 5. Four classes of regression are guarded here.
#
#  ① THE UNIFIED MARCH. The source branch consolidated the volumes into one loop at 73737b6 — shared extinction,
#    one sun-shadow march, one light loop — so fog shadows cloud for free. Splitting them apart looks almost
#    identical in a still frame and costs double, so the structure is asserted rather than reviewed.
#
#  ② THE CEILING. Clouds are tropospheric. Without a clamp a Base of 200 km renders a cloud shell OUTSIDE the
#    100 km atmosphere, visible from orbit as a band floating in vacuum. The failure is silent: the render succeeds.
#
#  ③ THE PROHIBITED OPTIMISATIONS, each measured and reverted upstream: clear-air striding (73b71d6, speckled
#    cloud), a low-res cloud FBO with temporal reprojection (a152901, slower and worse), and atmosphere LUTs
#    (2fe78ed, no speedup and uglier — References/Deferred/AtmosphereLuts.md).
#
#  ④ THE DRIFT. Advecting each altitude by its own wind over time-of-day shredded the slab into horizontal
#    streaks (measured: 76 km of shear offset across 1.1 km by 7am). The whole medium rides one reference
#    flow plus a frozen shear offset — WindField::AdvectDrift, which both densities must call.
set -u
cd "$(dirname "$0")/.."
Fail=0
Report() { if [ "$1" = "0" ]; then printf '  %-66s PASS\n' "$2"; else printf '  %-66s FAIL\n' "$2"; Fail=1; fi; }

echo "[VolumetricMedia] the media behave"
Binary="$(mktemp -u /tmp/VolumetricMediaProof.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I . -I Engine -o "$Binary" Scratchpad/VolumetricMediaProof.cpp Engine/DisplayPresentation/FidelityClassifier.cpp \
     2>/tmp/VolumetricMedia.build; then
    echo "  PROOF FAILED TO BUILD"; sed 's/^/    /' /tmp/VolumetricMedia.build | head -20; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

Header=Engine/DisplayPresentation/VolumetricMedia.h

echo
echo "[VolumetricMedia] the march is shared, not duplicated"
# One March entry point. A second March is the regression 73737b6 removed (a duplicated entry point); the
#    per-medium loops inside the one entry are the structure — each medium marches its own span at its own
#    pace, and the sun-shadow march stays shared (one per occupied step, whichever loop it sits in).
Marches=$(grep -c 'static VolumetricSample March' "$Header")
[ "$Marches" = "1" ]
Report $? "exactly one March entry point ($Marches found)"
grep -q 'THREE marches, one per medium' "$Header"
Report $? "the per-medium march is documented as the contract"

echo
echo "[VolumetricMedia] the ceiling is enforced in code, not in a comment"
grep -q 'CeilingMetres' "$Header"
Report $? "the cloud layer carries an explicit ceiling"
# SlabExtent must clamp, and CloudDensity must consult it — either alone leaves the hole open.
grep -q 'Clamp(Cloud.Base, 0.0f, Ceiling)' "$Header"
Report $? "SlabExtent clamps the base to the ceiling"
grep -q 'if (!SlabExtent(Cloud, Base, Top)) return 0.0f;' "$Header"
Report $? "CloudDensity refuses to sample outside the slab"

echo
echo "[VolumetricMedia] the step size is bounded, not the step count"
# A fixed step COUNT means the step SIZE grows with the span, so a long interval silently coarsens the
#    sampling. Measured under the old union march: adding fog raised transmittance from 0.2954 to 0.2963 —
#    more medium, more light through, which is impossible; separate marches make that structural failure
#    impossible, and each medium still derives its count from a bounded step.
grep -q 'kReferenceSpan' "$Header"
Report $? "the march derives its count from a bounded step size"

echo
echo "[VolumetricMedia] advection is the wind integral, never local flow times time"
# The streak note lives in WindField::AdvectDrift: the local flow times time-of-day piled 76 km of offset
#    across the slab by 7am and shredded the sampling grid into horizontal streaks. Both densities route
#    through the one helper — integral times altitude factor — and the frozen-shear form it replaced (a
#    reference altitude, a shear memory, a cell clamp) must not return.
DriftDefs=$(grep -c 'static void AdvectDrift' Engine/DisplayPresentation/WindField.h)
[ "$DriftDefs" = "1" ]
Report $? "exactly one AdvectDrift helper ($DriftDefs found)"
DriftCalls=$(grep -c 'AdvectDrift(' "$Header")
[ "$DriftCalls" = "2" ]
Report $? "both densities route through it ($DriftCalls call sites)"
grep -q 'Wind.Integral\[0\] \* Factor \* ArtFactor' Engine/DisplayPresentation/WindField.h
Report $? "the helper scales the packed integral by the altitude factor"
! grep -q 'ReferenceAltitudeMetres' Engine/DisplayPresentation/WindField.h
Report $? "no reference altitude survives on the host"
! sed 's;//.*;;' "$Header" | grep -qE 'Time \* 0\.[86]f'
Report $? "no inline flow-times-time drift in either density"

echo
echo "[VolumetricMedia] the layer march stops at the reference's far cap"
# REF cloudMarch cuts the slab span (celestial line 1023): above the slab max(60 km, thick x 40), below or
#    inside thick x 14. One helper spells the law; both interval branches call it; the boxes are not capped.
CapDefs=$(grep -c 'static float SlabFarCap' "$Header")
[ "$CapDefs" = "1" ]
Report $? "exactly one SlabFarCap helper ($CapDefs found)"
CapCalls=$(grep -c 'SlabFarCap(Origin' "$Header")
[ "$CapCalls" = "2" ]
Report $? "both interval branches cut at it ($CapCalls call sites)"
grep -q 'Thickness \* 14\.0f' "$Header"
Report $? "below and inside, the cap is thick x 14"
grep -q 'fmax(60000\.0f, Thickness \* 40\.0f)' "$Header"
Report $? "above, the cap is max(60 km, thick x 40)"
BoxMaxes=$(grep -c 'fmin(BoxFar, MaximumDistance)\|fmin(FogFar, MaximumDistance)' "$Header")
[ "$BoxMaxes" = "2" ]
Report $? "the boxes still run to the maximum ($BoxMaxes uncapped exits)"

echo
echo "[VolumetricMedia] bodiless volumes have a marker to grab"
Marker=Engine/SpatialInterface/VolumeMarker.h
[ -f "$Marker" ]
Report $? "VolumeMarker.h exists"
grep -q 'kMarkerRadiusPixels' "$Marker"
Report $? "the marker holds a constant screen size, not a world size"
grep -q 'GlyphPath' "$Marker"
Report $? "the marker carries SVG glyphs for its categories"

echo
echo "[VolumetricMedia] the prohibited optimisations have not returned"
# ⚠️ Comments are stripped first. The header necessarily NAMES these prohibitions to explain them, and the first
#    version of this check matched its own documentation and failed forever — the same trap CheckShadowTiers
#    records for the PCSS half-angle. Check the code, not the prose.
MediaCode="$(sed 's;//.*;;' "$Header")"
! printf '%s' "$MediaCode" | grep -qiE 'clear.?air strid|temporal reproject|reprojectionbuffer'
Report $? "no clear-air striding or cloud temporal reprojection in the code"

echo
echo "[VolumetricMedia] cloud shafts come from the medium shadowing itself"
# The scene-occlusion callback was removed - nothing in the engine called it and no such geometry exists yet.
#    What stays is the half that renders: ShadowMarch accumulates cloud density along the sun ray, which is what
#    lights a cloud at all. Deleting THAT would leave clouds flat, so it is guarded here.
# P2.4b: the shadow paces each medium's own size — clLight's quadratic taps for the layer, uniShadow's
#    linear taps for the boxes. No view step may leak in (the old form's lie: one sun ray shading
#    differently per calling loop), so StepSize's absence from both shadow bodies is pinned, not reviewed.
printf '%s' "$MediaCode" | grep -q 'const float St = (Top - Base) \* 0.12f;'
Report $? "the layer shadow paces the thickness (st = thick x .12)"
printf '%s' "$MediaCode" | grep -q 'const float D = St \* F \* F \* 0.35f;'
Report $? "the layer taps grow quadratically (d = st i^2 .35)"
printf '%s' "$MediaCode" | grep -q ') \* D \* 0.8f;'
Report $? "the layer taps weigh d x .8"
printf '%s' "$MediaCode" | grep -q 'const float St = Widest \* (IsFog ? 0.5f : 0.25f);'
Report $? "the boxes pace the half-size (x.25 cloud, x.5 fog)"
printf '%s' "$MediaCode" | grep -q 'I <= 4u; ++I)'
Report $? "the boxes march a fixed 4 taps"
printf '%s' "$MediaCode" | grep -q 'I <= 5u; ++I)'
Report $? "the layer marches at most 5 taps"
printf '%s' "$MediaCode" | grep -q 'I > 2u ? 1.0f : 0.0f'
Report $? "the shadow's first two taps keep erosion, the rest skip it"
printf '%s' "$MediaCode" | grep -q 'Sigma = M == 2u ? 0.01f : (1.0f + Cloud.Absorption) \* 0.06f;'
Report $? "the view reads cloud .06 with absorption, fog .01"
! sed -n '/static float ShadowDepthBox/,/^    }/p' "$Header" | sed 's;//.*;;' | grep -q 'StepSize'
Report $? "no view step leaks into the box shadow"
! sed -n '/static float ShadowDepthSlab/,/^    }/p' "$Header" | sed 's;//.*;;' | grep -q 'StepSize'
Report $? "none leaks into the layer shadow either"
! printf '%s' "$MediaCode" | grep -q 'SunVisibilityAt'
Report $? "the unused scene-occlusion callback is gone"
! printf '%s' "$MediaCode" | grep -qiE 'radial.?blur|screenspace shaft'
Report $? "no screen-space radial blur"

echo
echo "[VolumetricMedia] the march shades the reference's light loop"
# P2.4c: cloudMarch/marchLocal's light on the CPU march — the .02 weather gain, the dual lobe x4pi,
#    multi-scatter in place of the shadow transmittance, Beer powder, height-in-slab ambient, the Sc/sigT
#    accumulation. (The leak re-scope above — ShadowBox/ShadowMarch to ShadowDepthBox/ShadowDepthSlab — is
#    P2.4c's too: the quadrature moved into the depth functions, so the absence is pinned where it lives.)
printf '%s' "$MediaCode" | grep -q 'SunRadiance\[0\] \* 0\.02f'
Report $? "sunlight enters the weather with the panel's .02 gain"
printf '%s' "$MediaCode" | grep -q 'DualLobePhase(CosTheta, PhaseG, Cloud\.BackLobe, Cloud\.LobeMix)'
Report $? "the clouds read the dual lobe from the layer's globals"
printf '%s' "$MediaCode" | grep -q 'SingleLobePhase(CosTheta, PhaseG)'
Report $? "the fog keeps its own g in a single lobe"
printf '%s' "$MediaCode" | grep -q 'MultiScatterLayer(OwnOd, Cloud\.Absorption)'
Report $? "the layer's octaves read its own depth with absorption"
printf '%s' "$MediaCode" | grep -q 'MultiScatterLocal(std::exp(-OwnOd))'
Report $? "the local closed form reads its own depth in T-space"
printf '%s' "$MediaCode" | grep -q 'PowderTerm(CosTheta, Extinction, Cloud\.Powder)'
Report $? "powder reads the view slice and the layer's strength"
printf '%s' "$MediaCode" | grep -q 'Density \* (LayerTop - LayerBase) \* 0\.3f'
Report $? "far from the slab the shadow mixes to rho*thick*.3"
printf '%s' "$MediaCode" | grep -q 'float OthersT = std::exp(-((Depth0 + Depth1 + Depth2) - OwnRaw));'
Report $? "the others' transmittance crosses the media"
printf '%s' "$MediaCode" | grep -q 'float SunT = M == 2u ? CombinedT : OthersT;'
Report $? "clouds take OthersT, the fog the combined shadow"
printf '%s' "$MediaCode" | grep -q '(0\.35f + 0\.65f \* Hn)'
Report $? "the ambient lifts by height-in-slab"
printf '%s' "$MediaCode" | grep -q 'float Ms = 0\.0f, A = 1\.0f, B = 1\.0f;'
Report $? "the octaves start at b = 1 (ms(0) = 1.8525)"
printf '%s' "$MediaCode" | grep -q 'Ms += B \* std::exp(-OpticalDepth \* A \* (1\.0f + Absorption));'
Report $? "attenuating inside the exponent"
printf '%s' "$MediaCode" | grep -q '0\.55f \* Root + 0\.3f \* std::sqrt(Root)'
Report $? "the closed form sums T, root and fourth-root"

echo
echo "[VolumetricMedia] the noise is the reference hash13 and the layer march jitters"
# P2.1: Hoskins' fract-only hash13 replaced the sin hash at all three noise sites (the CPU march, WindField's
#    swirl lattice, the shader's CloudHash); the layer march jitters its start per ray through the same hash
#    (marchLocal never jitters, like the reference). Comments are stripped for the negative check: the headers
#    necessarily name the old form to explain the replacement (the CheckShadowTiers trap again).
NoiseCode="$(sed 's;//.*;;' "$Header" Engine/DisplayPresentation/WindField.h Engine/Shaders/SkyRecords.slang)"
! printf '%s' "$NoiseCode" | grep -q '127.1'
Report $? "no sin-hash constants survive at any noise site"
printf '%s' "$NoiseCode" | grep -q '0.1031'
Report $? "the Hoskins hash13 constant is present"
printf '%s' "$NoiseCode" | grep -q 'MarchJitter'
Report $? "the CPU march jitters the layer start per ray"
printf '%s' "$NoiseCode" | grep -q 'CloudMarchJitter'
Report $? "the shader march twins it"
grep -q 'MarchJitter' Scratchpad/VolumetricMediaProof.cpp
Report $? "the proof pins the jitter's determinism"

echo
echo "[VolumetricMedia] the densities are the reference's four-octave field"
# P2.4a ports celestial clDensity/lcDensity: four shape octaves under /0.9375, the 0.5 lod gate that skips
#    erosion in the distance, the 0.35 downwind lean, the 0.45 erosion carve, one x8 pixel swirl. The old
#    smoothstep remap survives ONLY in the kept fog branch (P8's vf replaces it); the ported paths remap
#    linearly, which is what the absence count below guards.
Octaves=$(printf '%s' "$MediaCode" | grep -c 'S\[0\] \* 8.3f')
[ "$Octaves" = "2" ]
Report $? "both ported densities sum the fourth octave ($Octaves sites)"
Gates=$(printf '%s' "$MediaCode" | grep -c 'Lod > 0.5f')
[ "$Gates" = "2" ]
Report $? "both ported densities gate erosion at lod 0.5 ($Gates sites)"
printf '%s' "$MediaCode" | grep -q 'Hn \* (Top - Base) \* 0.35f \* LeanFactor'
Report $? "the slab leans 0.35 of its depth downwind"
Erodes=$(printf '%s' "$MediaCode" | grep -c 'ErosionDetail \* 0.45f')
[ "$Erodes" = "2" ]
Report $? "both ported densities carve at 0.45 ($Erodes sites)"
printf '%s' "$MediaCode" | grep -q 'PixelSwirl\[0\] = Turb\[0\] \* 8.0f'
Report $? "the march stirs one x8 pixel swirl"
Remaps=$(printf '%s' "$MediaCode" | grep -c 'SmoothStep(0.0f, 1.0f, Raw)')
[ "$Remaps" = "1" ]
Report $? "the smoothstep remap survives only in the kept fog ($Remaps site)"

echo
if [ "$Fail" != "0" ]; then echo "[VolumetricMedia] FAILED"; exit 1; fi
echo "[VolumetricMedia] OK"
