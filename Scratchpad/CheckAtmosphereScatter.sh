#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckAtmosphereScatter.sh — P2: the dawn band, the vibrant sunset, the blue zenith, and whether a LUT can hold them
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The user asked, reasonably: why a LUT, when the LUT they tried gave no white line at dawn, no vibrant sunrise or
#  sunset, and a dull zenith — and would an analytic sky not be more realistic?
#
#  This gate exists so that question is answered with measurements rather than with an appeal to a paper. It runs the
#  production scattering integral (Engine/Shaders/AtmosphereScatter.slang, compiled as C++) and checks:
#
#    · the earth's shadow exists at all — the thing Hosek-Wilkie explicitly cannot model, and the cause of the band
#    · the dawn band is a real ridge above the horizon, both in the full march AND through the cache
#    · sunset is red-dominant and vividly coloured, not a grey wash
#    · the twilight zenith stays blue, and does so BECAUSE of ozone (run with the Chappuis band off, for contrast)
#    · the sky gets DARKER as the sun sets (Hosek-Wilkie is documented to get brighter — the F3 failure class)
#    · the LUT's error against the full march, with the shipping mapping and with a naive linear one
#
#  It also pins the choices that those measurements justified, so nobody "simplifies" them back later.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Shader="Engine/Shaders/AtmosphereScatter.slang"
Harness="Scratchpad/AtmosphereScatterTest.cpp"
Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0

# ── The physical proof ───────────────────────────────────────────────────────────────────────────────────────────────────────────
echo "[AtmosphereScatter] scattering proof (production shader compiled as C++)"
Port="/tmp/AtmosphereScatter.port.inc"
# Two rewrites: swizzles become member calls, and GLSL's `out vec3 x` becomes C++'s `vec3& x`.
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' "$Shader" > "$Port"

Binary="$(mktemp -u /tmp/AtmosphereScatter.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad "$Harness" -o "$Binary" 2>/tmp/AtmosphereScatter.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/AtmosphereScatter.build | head -30
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then
        echo "  OK    $Label"
    else
        echo "  FAIL  $Label — expected /$Pattern/ in $File"
        Fail=1
    fi
}

# ── 🔴 F1: the sun disc must NEVER be baked into the sky ─────────────────────────────────────────────────────────────────────────
echo
echo "[AtmosphereScatter] F1 — the sun disc is not in the sky function"
# "the sky gives weird shapes" was the reported failure, and the cause is a 0.53-degree disc rasterised into a
# low-resolution, non-linearly mapped table. The scattering file must know nothing about a disc.
if grep -nE 'CosRadius|SunDisc|LimbDarken|AngularRadius' "$Shader"; then
    echo "  FAIL  the scattering file references the sun's disc — composite it at full res instead"
    Fail=1
else
    echo "  OK    no disc, no angular radius, no limb term anywhere in the sky integral"
fi

# ── The physics that the analytic models lack ────────────────────────────────────────────────────────────────────────────────────
echo
echo "[AtmosphereScatter] the terms that make dawn and sunset work"
CheckConstant "ozone is modelled as a SHELL, not an exponential"  'kOzoneCentreAltitude 25000\.0' "$Shader"
CheckConstant "the ozone layer is 30 km thick"                    'kOzoneHalfWidth      15000\.0' "$Shader"
CheckConstant "Mie extinction exceeds Mie scattering (albedo 0.9)" 'kMieExtinctionScale 1\.11' "$Shader"
CheckConstant "transmittance returns zero through the planet"     'if \(groundHit > 0\.0\) return vec3\(0\.0\)' "$Shader"
CheckConstant "the segment integral is analytic, not a rectangle" 'inScatter - inScatter \* segmentTransmittance' "$Shader"

# ── The parameterisation, and the measurements that chose it ─────────────────────────────────────────────────────────────────────
echo
echo "[AtmosphereScatter] LUT parameterisation"
CheckConstant "non-linear latitude mapping (Hillaire 5.3)"   'sqrt\(abs\(latitude\) / 1\.5707963\)' "$Shader"
CheckConstant "log-space storage helper exists"              'vec3 AtmosphereEncodeStorage' "$Shader"
CheckConstant "and its inverse"                              'vec3 AtmosphereDecodeStorage' "$Shader"

# The harness must keep testing the LINEAR mapping as a control. Delete that and the gate stops proving anything —
# it would only show the chosen mapping is adequate, not that it is the reason the dawn band survives.
if grep -q 'LINEAR mapping' "$Harness"; then
    echo "  OK    the naive linear mapping is still measured as a control"
else
    echo "  FAIL  the linear-mapping control was removed; the comparison no longer proves anything"
    Fail=1
fi

# Likewise the ozone-off control.
if grep -q 'MakeAtmosphere(false)' "$Harness"; then
    echo "  OK    the ozone-off control is still measured"
else
    echo "  FAIL  the ozone-off control was removed"
    Fail=1
fi

# ── The shared-source discipline ─────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[AtmosphereScatter] one implementation, compiled twice"
if grep -q '#include "AtmosphereScatter.slang"' "$Viewport"; then
    echo "  OK    ReSTIRViewport.slang includes the same file the proof compiles"
else
    echo "  FAIL  the viewport kernel does not include AtmosphereScatter.slang — the proof would be testing"
    echo "        code that does not ship, which is the failure mode this whole harness style exists to avoid"
    Fail=1
fi

# ── SPIR-V ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[AtmosphereScatter] the production kernel still compiles"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/AtmosphereViewport.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Viewport" >/tmp/AtmosphereScatter.spv.log 2>&1; then
        echo "  OK    ReSTIRViewport.slang lowers to SPIR-V ($(stat -c%s "$Spv") bytes)"
    else
        echo "  FAIL  ReSTIRViewport.slang no longer lowers to SPIR-V"
        sed 's/^/    /' /tmp/AtmosphereScatter.spv.log | head -20
        Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" -eq 0 ]; then
    echo "[AtmosphereScatter] OK"
else
    echo "[AtmosphereScatter] FAILED"
fi
exit "$Fail"
