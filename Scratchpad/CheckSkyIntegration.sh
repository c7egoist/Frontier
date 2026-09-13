#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckSkyIntegration.sh — P2b: the sky reaches the right pixels, and scene objects actually receive it
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckAtmosphereScatter proves the atmosphere is physically correct. This proves it is CONNECTED correctly, which
#  fails differently: a correct sky through a flipped ray is still a broken image, and a sky the bounce path never
#  queries is a backdrop rather than a light. Ports the production pixel->ray mapping and the production scattering
#  as C++ and measures the wiring.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0

echo "[SkyIntegration] wiring proof"
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
    Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' Engine/Shaders/RayGeneration.slang > /tmp/RayGeneration.port.inc

Binary="$(mktemp -u /tmp/SkyIntegration.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad Scratchpad/SkyIntegrationTest.cpp -o "$Binary" 2>/tmp/SkyIntegration.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/SkyIntegration.build | head -30
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

# ── The two miss sites must actually call the sky ────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] both escape paths reach the sky"
CheckConstant "the primary miss resolves to the sky"  'Resolve\(pixel, CelestialSky\(' "$Viewport"
CheckConstant "an escaping bounce collects the sky"   'accumulatedRadiance \+= throughput \* skyRadiance' "$Viewport"

# 🔴 The bounce path is what makes objects RECEIVE the light rather than stand in front of a backdrop. If the
#    "no environment light" comments come back, the requirement has silently regressed.
if grep -nE 'no environment light' "$Viewport"; then
    echo "  FAIL  a 'no environment light' path returned — objects would stop receiving sky light"
    Fail=1
else
    echo "  OK    no 'no environment light' dead ends remain"
fi

# ── The shared ray mapping ───────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the miss ray uses the shared mapping, not a local copy"
CheckConstant "RayGeneration.slang is included"        '#include "RayGeneration.slang"' "$Viewport"
CheckConstant "and the miss path calls it"             'GeneratePrimaryDirection\(basis, pixel' "$Viewport"

# A hand-rolled ray reconstruction is one sign error from a vertically mirrored sky that only shows on the miss
# path. If someone reintroduces the arithmetic inline, fail.
if grep -nE 'ndc\.y \* FieldOfViewTanHalf' "$Viewport"; then
    echo "  FAIL  the miss path hand-rolls the pixel->ray mapping again; use GeneratePrimaryDirection"
    Fail=1
else
    echo "  OK    no hand-rolled pixel->ray arithmetic on the miss path"
fi

# ── F1 again, at the call site ───────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] F1 — the disc is composited, and only where it belongs"
CheckConstant "the disc is analytic and full-resolution" 'vec3 CelestialSunDisc' "$Viewport"
# The bounce path must pass includeDiscs=false: the sun is an explicit reservoir light (P3), so a bounce that also
# hit the disc would double-count it and, being tiny and enormously bright, arrive as a firefly.
CheckConstant "the bounce path excludes the discs"       'CelestialSky\(Celestial\[0\], hitPos, bounceDir, false\)' "$Viewport"
CheckConstant "the primary path includes them"           'CelestialSky\(Celestial\[0\], CameraOrigin, rayDirection, true\)' "$Viewport"

# ── 🔴 THE HALO CONSTRAINT, PINNED ────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the sun's glare cannot become a halo"
# The user's words: "the sun blending into the atmosphere like a halo is 1 thing i absolutely do not want".
# The proof above checks the SHAPE; these pin the shader to the constants the proof assumes, so the two cannot
# drift apart. The theta^-2 term in particular must never come back — it is what made the first attempt a halo.
CheckConstant "the glare cuts off hard at 2.5 deg"     '#define kGlareCutoff  2\.5' "$Viewport"
CheckConstant "the core radius is 0.30 deg"            '#define kGlareInner   0\.30' "$Viewport"
CheckConstant "strength is the measured 2.5e-3"        '#define kGlareStrength 2\.5e-3' "$Viewport"
CheckConstant "the falloff is pure theta^-3"           'psf = 1\.0 / \(t \* t \* t\)' "$Viewport"

# A theta^-2 term reaches ~30 degrees. Its presence would be the halo, reintroduced.
GlareBody="$(sed -n '/^vec3 CelestialSunGlare/,/^}/p' "$Viewport")"
if printf '%s' "$GlareBody" | grep -qE '5\.0 / \(t \* t\)|/ \(t \* t\)\s*;'; then
    echo "  FAIL  the theta^-2 tail is back in the glare — that reaches ~30 deg and IS the halo"
    Fail=1
else
    echo "  OK    no theta^-2 tail; the glare cannot reach far enough to be a halo"
fi

# The disc must be composited AFTER the glare, or the flare washes over its edge.
if grep -A2 'CelestialSunGlare(sky, rayDirection, transmittance);' "$Viewport" | grep -q 'CelestialSunDisc'; then
    echo "  OK    the disc is drawn on top of its own glare, so its edge stays sharp"
else
    echo "  FAIL  the disc is not composited after the glare; its edge would be washed out"
    Fail=1
fi

# ── The measured step budget ─────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the real-time step budget is the measured one"
CheckConstant "16 view steps"       '#define kSkyViewSteps 16' "$Viewport"
CheckConstant "8 sun steps"         '#define kSkySunSteps  8'  "$Viewport"
CheckConstant "warped step exponent" '#define kStepWarp 1\.5'  "Engine/Shaders/AtmosphereScatter.slang"

# ── SPIR-V, and the sky must actually be REACHABLE ───────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the production kernel compiles with the sky live"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/SkyIntegration.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Viewport" >/tmp/SkyIntegration.spv.log 2>&1; then
        Bytes="$(stat -c%s "$Spv")"
        echo "  OK    lowers to SPIR-V ($Bytes bytes)"
        # Dead code is stripped, so the module GREW when the sky became reachable: 188680 -> ~212k. A sudden drop
        # back towards 188k means the sky was optimised out, i.e. nothing calls it — which would pass every other
        # check in this file while rendering a black sky.
        if [ "$Bytes" -lt 200000 ]; then
            echo "  FAIL  the module shrank below 200 kB — the sky code is being stripped as unreachable"
            Fail=1
        else
            echo "  OK    the sky code is reachable (module is larger than the pre-sky 188 680 B)"
        fi
    else
        echo "  FAIL  no longer lowers to SPIR-V"
        sed 's/^/    /' /tmp/SkyIntegration.spv.log | head -20
        Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" -eq 0 ]; then echo "[SkyIntegration] OK"; else echo "[SkyIntegration] FAILED"; fi
exit "$Fail"
