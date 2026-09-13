#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckViewpointStability.sh — P0: the displayed image must not change brightness because the camera moved
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The user's longest-running complaint against this renderer is "the exposure keeps changing when the camera angle changes,
#  even when the sun hasn't moved". The exposure meter was exonerated long ago (Manual mode returns a constant). The actual
#  chain is: camera motion restarted the accumulation -> every temporal path is gated on FrameIndex > 0 -> the moving image
#  was 1 spp -> a nonlinear display (ACES + gamma) turns that variance into a brightness shift, because E[T(X)] != T(E[X]).
#
#  This gate runs the numeric proof and then pins every constant the proof assumes against the shader and the integrator that
#  actually ship, so the two cannot drift apart.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Shader="Engine/Shaders/ReSTIRViewport.slang"
Harness="Scratchpad/ViewpointStabilityTest.cpp"
Integrator="Engine/DisplayPresentation/ReSTIRIntegrator.cpp"
Header="Engine/DisplayPresentation/ReSTIRIntegrator.h"
Fail=0

# ── Numeric proof ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo "[ViewpointStability] numeric proof"
Binary="$(mktemp -u /tmp/ViewpointStability.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra "$Harness" -o "$Binary" 2>/tmp/ViewpointStability.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/ViewpointStability.build | head -20
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

# ── The integrator must not restart accumulation on motion ───────────────────────────────────────────────────────────────────────
echo
echo "[ViewpointStability] the accumulation survives camera motion"

# The default must be OFF. A default of true reinstates the bug silently.
if grep -qE 'bool\s+ResetOnMotion\s+=\s+false;' "$Header"; then
    printf '  %-64s PASS\n' "ResetOnMotion defaults to false"
else
    printf '  %-64s FAIL\n' "ResetOnMotion defaults to false"; Fail=1
fi

# The reset must be guarded by that flag — never unconditional on Moved/Turned.
if grep -qE 'if \(\(Moved \|\| Turned\) && ActiveConfiguration\.ResetOnMotion\)' "$Integrator"; then
    printf '  %-64s PASS\n' "motion only resets when the legacy flag asks for it"
else
    printf '  %-64s FAIL\n' "motion only resets when the legacy flag asks for it"; Fail=1
fi

# A resize genuinely invalidates the buffers (different stride, different shape) and must still restart.
if grep -qE 'if \(Resized\)' "$Integrator"; then
    printf '  %-64s PASS\n' "a viewport resize still restarts the accumulation"
else
    printf '  %-64s FAIL\n' "a viewport resize still restarts the accumulation"; Fail=1
fi

# ── Shader / harness constant agreement ──────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[ViewpointStability] shader / harness agreement"

for Name in kSpatialRadiusMinPx kSpatialRadiusMaxPx kSpatialReferenceDepth kSpatialDepthScaleMin kSpatialDepthScaleMax; do
    ShaderValue=$(grep -oP "${Name}\s*=\s*\K[0-9.]+" "$Shader" | head -1)
    HarnessValue=$(grep -oP "${Name}\s*=\s*\K[0-9.]+" "$Harness" | head -1)
    if [ -z "$ShaderValue" ]; then
        printf '  %-64s FAIL\n' "$Name is missing from the shader"; Fail=1
    elif [ -z "$HarnessValue" ]; then
        printf '  %-64s FAIL\n' "$Name is missing from the harness"; Fail=1
    elif [ "${ShaderValue%f}" != "${HarnessValue%f}" ]; then
        printf '  %-64s FAIL  (%s vs %s)\n' "$Name disagrees" "$ShaderValue" "$HarnessValue"; Fail=1
    else
        printf '  %-64s PASS  %s\n' "$Name agrees" "$ShaderValue"
    fi
done

# The tap radius must actually consume the depth correction, not merely declare it.
if grep -qE 'float depthScale = clamp\(kSpatialReferenceDepth / max\(primaryT' "$Shader"; then
    printf '  %-64s PASS\n' "the tap radius is corrected by view depth"
else
    printf '  %-64s FAIL\n' "the tap radius is corrected by view depth"; Fail=1
fi
if grep -qE 'radius\s+=\s+mix\(kSpatialRadiusMinPx, kSpatialRadiusMaxPx, RandFloat\(tapSeed\)\) \* scale \* depthScale;' "$Shader"; then
    printf '  %-64s PASS\n' "the depth scale reaches the radius expression"
else
    printf '  %-64s FAIL\n' "the depth scale reaches the radius expression"; Fail=1
fi

# ── One distance regularisation ──────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[ViewpointStability] one distance regularisation"

EpsCount=$(grep -c 'kDistanceEpsilon' "$Shader")
if [ "$EpsCount" -ge 4 ]; then
    printf '  %-64s PASS  %s sites\n' "the target and both shading sites share one epsilon" "$EpsCount"
else
    printf '  %-64s FAIL  %s sites (want >= 4)\n' "the target and both shading sites share one epsilon" "$EpsCount"; Fail=1
fi

# The old divergent literals must be gone from the transport denominators.
if grep -qE '\(dist2 \+ 0\.0(0)?1\)|\(bDist2 \+ 0\.01\)' "$Shader"; then
    printf '  %-64s FAIL\n' "a hardcoded distance epsilon is back"; Fail=1
else
    printf '  %-64s PASS\n' "no hardcoded distance epsilon remains"
fi

# ── The real kernel still lowers to SPIR-V ───────────────────────────────────────────────────────────────────────────────────────
echo
echo "[ViewpointStability] the production kernel still compiles"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)" "$(command -v glslc 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    printf '  %-64s SKIP  (no glslangValidator/glslc on PATH)\n' "SPIR-V lowering"
else
    Spv="$(mktemp -u /tmp/ReSTIRViewport.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Shader" >/tmp/ViewpointStability.spv.log 2>&1; then
        printf '  %-64s PASS  %s bytes\n' "ReSTIRViewport.slang lowers to SPIR-V" "$(stat -c%s "$Spv")"
    else
        printf '  %-64s FAIL\n' "ReSTIRViewport.slang lowers to SPIR-V"
        sed 's/^/    /' /tmp/ViewpointStability.spv.log | head -20
        Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" != "0" ]; then echo "[ViewpointStability] FAILED"; exit 1; fi
echo "[ViewpointStability] OK"
