#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckShowcaseTracksShader.sh — the visual proof must actually be produced by the shader
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  🔴 WHY. An earlier showcase hand-wrote C++ "mirrors" of CelestialSunDisc / CelestialMoonDisc / CelestialSky.
#     A mirror renders a lovely picture whether or not the shader is correct, so it proves nothing. The showcase
#     now COMPILES THE SHADER'S OWN TEXT, extracted by ExtractCelestialPort.sh.
#
#     This gate proves that claim by FALSIFICATION rather than by assertion: it edits the shipping shader to
#     disable the sun disc, re-renders, and requires the image to change. If the render is unaffected, the
#     showcase is not really driven by the shader and the visual evidence is worthless.
#
#     ⚠️ This test caught a real defect when it was written. The showcase camera faced a fixed compass bearing,
#     so the sun was 63 degrees out of shot at noon and 275 degrees away at sunset — zeroing the disc changed
#     exactly zero bytes. The camera now follows the sun's azimuth. An image that CANNOT show the thing it
#     claims to prove is not evidence.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0
Backup="$(mktemp -u /tmp/ShowcaseViewport.XXXXXX.slang)"
Port="/tmp/ShowcaseTrack.inc"

Rebuild() {
    bash Scratchpad/ExtractCelestialPort.sh "$Port" >/dev/null 2>&1 || return 1
    g++ -std=c++20 -O2 -I Scratchpad -I . \
        -DFRONTIER_SHOWCASE_PORT="\"$Port\"" \
        Scratchpad/CelestialShowcase.cpp Engine/DisplayPresentation/ExposureIntegrator.cpp \
        -o "$1" 2>/tmp/ShowcaseTrack.build
}

Restore() { [ -f "$Backup" ] && cp "$Backup" "$Viewport"; bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc >/dev/null 2>&1; }
trap Restore EXIT

echo "[ShowcaseTracksShader] the showcase compiles the shader's own celestial block"

# The extractor must find the complete celestial block; a partial lift would silently fall back to nothing.
# ⚠️ The function count is asserted by ExtractCelestialPort.sh itself (it exits non-zero on a mismatch), so this
#    checks that extraction SUCCEEDED rather than hard-coding a number here that goes stale as the reference port grows.
if ExtractOutput="$(bash Scratchpad/ExtractCelestialPort.sh "$Port" 2>&1)"; then

    echo "  OK    celestial block extracted from the shipping shader"
else
    echo "  FAIL  could not extract the celestial block from $Viewport"
    exit 1
fi

# And the showcase must not have grown a private copy of them again.
if grep -nE '^static vec3 (SunDisc|MoonDisc|Sky)\(' Scratchpad/CelestialShowcase.cpp; then
    echo "  FAIL  the showcase has hand-written copies of the shader's functions again"
    Fail=1
else
    echo "  OK    no hand-written mirrors of the shader's sky functions"
fi

cp "$Viewport" "$Backup"

Reference="$(mktemp -u /tmp/ShowcaseRef.XXXXXX)"
if ! Rebuild "$Reference"; then
    echo "  FAIL  the showcase does not build:"
    sed 's/^/    /' /tmp/ShowcaseTrack.build | head -20
    exit 1
fi

# 17.8h puts the sun just above the horizon and the camera follows its azimuth, so the disc is genuinely in shot.
"$Reference" 17.8 /tmp/ShowcaseRef.ppm 240 140 12 >/dev/null 2>&1

echo
echo "[ShowcaseTracksShader] falsification — break the shader, the image must change"

Probe() {
    local Label="$1" Hour="$2" Pattern="$3" Replacement="$4"
    cp "$Backup" "$Viewport"
    python3 - "$Viewport" "$Pattern" "$Replacement" <<'PY'
import sys
path, pattern, replacement = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
if pattern not in text:
    sys.exit(9)
open(path, 'w').write(text.replace(pattern, replacement, 1))
PY
    if [ $? -eq 9 ]; then
        echo "  FAIL  $Label — the anchor text no longer exists in the shader; update this probe"
        Fail=1
        return
    fi

    local Broken; Broken="$(mktemp -u /tmp/ShowcaseBroken.XXXXXX)"
    if ! Rebuild "$Broken"; then
        echo "  FAIL  $Label — the modified shader did not build"
        Fail=1
        return
    fi
    "$Broken" "$Hour" /tmp/ShowcaseBroken.ppm 240 140 12 >/dev/null 2>&1
    "$Reference" "$Hour" /tmp/ShowcaseRef.ppm 240 140 12 >/dev/null 2>&1

    if cmp -s /tmp/ShowcaseRef.ppm /tmp/ShowcaseBroken.ppm; then
        echo "  FAIL  $Label — the render did NOT change, so it is not driven by the shader"
        Fail=1
    else
        local Differing
        Differing="$(cmp -l /tmp/ShowcaseRef.ppm /tmp/ShowcaseBroken.ppm 2>/dev/null | wc -l)"
        echo "  OK    $Label — render changed ($Differing bytes)"
    fi
    rm -f "$Broken"
}

Probe "zeroing the HTML sun disc" 12.0 \
      'return edge * limb * sunColour * sky.SunIrradianceAndScale.w * 12.0 * elevationGain;' \
      'return vec3(0.0);'

Probe "halving the sky radiance" 17.8 \
      'radiance *= sky.SunIrradianceAndScale.xyz;' \
      'radiance *= sky.SunIrradianceAndScale.xyz * 0.5;'

# ⚠️ The third probe was originally a no-op (it appended a label, which changes no behaviour) and duly
#    "failed". That failure was correct and the probe was wrong — a falsification test has to falsify
#    something. It now perturbs the moon disc, which is the remaining celestial function with its own branch.
# ⚠️ 19.5h: the moon is 2 deg off-axis and 11.6 deg up, so it IS in shot — but it renders at ~2.4e5 times
#    saturation, so MULTIPLYING its radiance changes no visible pixel. The probe therefore ZEROES it, which is
#    the perturbation that can actually show. Two earlier versions of this probe were no-ops and reported
#    failure; both times the probe was wrong rather than the showcase, and the honest fix was a probe that
#    perturbs something observable.
# The reference screen-space flare is the term that makes the sun read as a lens; if the showcase stopped tracking
# it, the images would look right while the shipping shader had drifted.
Probe "removing the HTML lens flare" 17.0 \
      'return flare * visible * master * sky.SunIrradianceAndScale.xyz;' \
      'return vec3(0.0);' \

Probe "removing the moon disc" 19.5 \
      'return sky.MoonRadianceAndEarthshine.xyz * shade * transmittance;' \
      'return vec3(0.0);'

Restore
rm -f "$Reference" /tmp/ShowcaseRef.ppm /tmp/ShowcaseBroken.ppm

echo
if [ "$Fail" -eq 0 ]; then echo "[ShowcaseTracksShader] OK"; else echo "[ShowcaseTracksShader] FAILED"; fi
exit "$Fail"
