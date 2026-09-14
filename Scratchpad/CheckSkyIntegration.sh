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
# ⚠️ Matches the CALL, not the exact one-liner. The miss path used to be `Resolve(pixel, CelestialSky(...))` on
#    a single line; adding the lens flare split it into a local `background` that the flare is then added to.
#    Pinning the old text would have failed on a correct refactor, which is a gate testing formatting rather
#    than behaviour. What must remain true is that the miss path asks CelestialSky for the background.
CheckConstant "the primary miss resolves to the sky"  'CelestialSky\(skyRecord, CameraOrigin, rayDirection, true\)' "$Viewport"
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
CheckConstant "the primary path includes them"           'CelestialSky\(skyRecord, CameraOrigin, rayDirection, true\)' "$Viewport"

# ── The reference page's screen-space lens (not the rejected angular glare) ─────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the HTML lens stays separate from atmospheric scattering"
CheckConstant "the reference lens function is present"       'vec3 CelestialLensFlare' "$Viewport"
CheckConstant "the reference halo ring is screen-space"       'ringDistance = abs\(haloDistance - haloRadius\)' "$Viewport"
CheckConstant "the reference streak uses screen offset"      'exp\(-abs\(m\.y\) \* 95\.0\)' "$Viewport"
if grep -qE 'CelestialSunGlare|kGlareCutoff|kGlareStrength' "$Viewport"; then
    echo "  FAIL  rejected custom angular glare returned"
    Fail=1
else
    echo "  OK    no custom angular glare is mixed into the sky"
fi

# ── The measured step budget ─────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SkyIntegration] the real-time step budget is the measured one"
CheckConstant "20 reference view steps" '#define kSkyViewSteps 20' "$Viewport"
CheckConstant "8 sun steps"         '#define kSkySunSteps  8'  "$Viewport"
CheckConstant "quadratic reference step mapping" 's0.*s0; s1.*s1'  "Engine/Shaders/AtmosphereScatter.slang"

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
