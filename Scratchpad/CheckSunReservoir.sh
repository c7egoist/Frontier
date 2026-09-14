#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckSunReservoir.sh — P3 / F2: the sun is a member of the reservoir's light pool, not a backdrop
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The named past failure was "sun isn't being used in ReSTIR". The fix gives the sun light index
#  LightTriangleCount so it flows through every existing path — initial RIS, extra candidates, temporal reuse,
#  spatial reuse, the shadow ray, the final shade — with no parallel code path that could drift out of step.
#
#  This gate proves the estimator stays exact (the directional-light-as-distant-disc trick), and pins the
#  structural properties that make F2 stay fixed.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0

echo "[SunReservoir] estimator proof"
Binary="$(mktemp -u /tmp/SunReservoir.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad -I . Scratchpad/SunReservoirTest.cpp -o "$Binary" 2>/tmp/SunReservoir.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/SunReservoir.build | head -30
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

# ── 🔴 F2: the sun must reach the reservoir, not sit beside it ───────────────────────────────────────────────────────────────────
echo
echo "[SunReservoir] F2 — the sun is in the pool"
CheckConstant "the sun has a light index"                'uint SunLightIndex\(\)' "$Viewport"
CheckConstant "the pool size includes it"                'uint TotalLightCount\(CelestialRecord sky\)' "$Viewport"
CheckConstant "PickLight can return the sun"             'return SunLightIndex\(\);' "$Viewport"
CheckConstant "LightEmission answers for the sun"        'lightIndex >= LightTriangleCount' "$Viewport"
CheckConstant "the sun is sampled across its disc"       'vec3 SampleLightPointFrom' "$Viewport"

# 🔴 THE REGRESSION THAT WOULD SILENTLY UNDO P3. If the direct-lighting block is gated on LightTriangleCount
#    again, an outdoor scene with no emissive triangles skips direct lighting entirely: the sun would be in the
#    pool and still never sampled — F2, reintroduced, while every other check here still passed.
if grep -qE 'if \(LightTriangleCount > 0u\)' "$Viewport"; then
    echo "  FAIL  a direct-lighting block is gated on LightTriangleCount again — a sun-only scene would go dark"
    Fail=1
else
    echo "  OK    the light-pool gates use TotalLightCount, so a sun-only scene is still lit"
fi

# Every reservoir sample site must use the sun-aware sampler; a stray SampleLightPoint( on the reservoir path
# would index the triangle table with the sun's index and read out of bounds.
# ⚠️ These filters must be FIXED-STRING (grep -F), not regex: an unescaped "(" in a -v pattern makes grep error
#    out, and an erroring grep produces empty output — which this check would have read as "no stray calls" and
#    printed OK. A gate that passes because it crashed is worse than no gate, so the pipeline is -F throughout.
StraySamples="$(grep -nF 'SampleLightPoint(' "$Viewport" \
    | grep -vF 'SampleLightPointFrom' \
    | grep -vF 'vec3 SampleLightPoint(' \
    | grep -vF 'return SampleLightPoint(lightIndex' || true)"
if [ -n "$StraySamples" ]; then
    echo "  FAIL  a reservoir path still calls SampleLightPoint directly (would index the sun into the triangle table):"
    echo "$StraySamples" | sed 's/^/    /'
    Fail=1
else
    echo "  OK    every reservoir sample site goes through SampleLightPointFrom"
fi

# ── The directional-light trick ──────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SunReservoir] the distant-disc representation"
CheckConstant "kSunDistance is defined"      '#define kSunDistance 100000\.0' "$Viewport"
CheckConstant "and the proof uses the same"  'kSunDistance = 100000\.0' "Scratchpad/SunReservoirTest.cpp"
CheckConstant "emission is premultiplied by d2" 'kSunDistance \* kSunDistance' "$Viewport"
CheckConstant "direct light is attenuated by the atmosphere" 'SunTransmittance' "$Viewport"

# ── F3 again: the reddening must not be able to see the camera ───────────────────────────────────────────────────────────────────
echo
echo "[SunReservoir] F3 — the sun's colour is a function of elevation only"
Solver="Engine/DisplayPresentation/CelestialSolver.h"
Body="$(sed -n '/inline void SolveSunTransmittance/,/^}/p' "$Solver")"
if printf '%s' "$Body" | grep -qE 'Camera|ViewMatrix|Luminance|FrameIndex|Pixel'; then
    echo "  FAIL  SolveSunTransmittance references the camera — sunset colour would shift when you turn around"
    Fail=1
else
    echo "  OK    no camera term in the direct-light attenuation"
fi
CheckConstant "air mass is Kasten-Young (finite at the horizon)" '0\.50572' "$Solver"

# ── SPIR-V ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[SunReservoir] the production kernel compiles"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/SunReservoir.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Viewport" >/tmp/SunReservoir.spv.log 2>&1; then
        echo "  OK    lowers to SPIR-V ($(stat -c%s "$Spv") bytes)"
    else
        echo "  FAIL  no longer lowers to SPIR-V"
        sed 's/^/    /' /tmp/SunReservoir.spv.log | head -20
        Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" -eq 0 ]; then echo "[SunReservoir] OK"; else echo "[SunReservoir] FAILED"; fi
exit "$Fail"
