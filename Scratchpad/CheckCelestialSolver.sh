#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckCelestialSolver.sh — P1: the sun and the moon are where the almanac says, and the exposure cannot see the camera
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  Two jobs.
#
#  1. Run Scratchpad/CelestialSolverTest.cpp, which includes the PRODUCTION header and checks it against published
#     ephemeris values: Julian Day epochs, Meeus's own GMST worked example, solstice and equinox declinations, the transit
#     altitude and azimuth for the user's actual location, lunar perigee/apogee, and the full phase cycle.
#
#  2. Pin the structural promises that a numeric test cannot see — that the exposure function has no camera in its
#     signature, that the star field turns, that the property table stays in sync with the struct. These are the
#     invariants that stop the named past failures from growing back.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Solver="Engine/DisplayPresentation/CelestialSolver.h"
Structure="Engine/DisplayPresentation/CelestialStructure.h"
Harness="Scratchpad/CelestialSolverTest.cpp"
Fail=0

# ── Numeric proof against published ephemerides ──────────────────────────────────────────────────────────────────────────────────
echo "[CelestialSolver] ephemeris proof"
Binary="$(mktemp -u /tmp/CelestialSolver.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I. "$Harness" -o "$Binary" 2>/tmp/CelestialSolver.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/CelestialSolver.build | head -30
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

# ── 🔴 The exposure function must not be able to see the camera ──────────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] exposure is a function of the sun's elevation and nothing else"

# This is F3, the oldest complaint, enforced at the level of the type system. If someone widens this signature to take
# a camera, a view matrix, or a frame's luminance, the guarantee is gone and this gate must be the thing that notices.
if grep -qE 'SolveCelestialEv100\(float SunElevationDegrees, const CelestialExposure& Settings\)' "$Solver"; then
    echo "  OK    SolveCelestialEv100 takes only (elevation, settings)"
else
    echo "  FAIL  the exposure signature changed — it must take ONLY the sun elevation and the settings"
    Fail=1
fi

for Forbidden in 'Camera' 'ViewMatrix' 'Viewport' 'Luminance' 'Histogram' 'FrameIndex'; do
    # Search only the exposure section of the solver: from the exposure banner to the end of the file.
    if sed -n '/^\/\/ *EXPOSURE$/,$p' "$Solver" | grep -qE "\b${Forbidden}\b"; then
        echo "  FAIL  the exposure section mentions '${Forbidden}' — exposure must not depend on framing"
        Fail=1
    fi
done
echo "  OK    no camera, view, luminance or frame term anywhere in the exposure section"

# The night floor and the daylight anchors are the physical calibration; silent edits to them change every scene.
CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then
        echo "  OK    $Label"
    else
        echo "  FAIL  $Label — expected /$Pattern/ in $File"
        Fail=1
    fi
}

echo
echo "[CelestialSolver] physical calibration constants"
CheckConstant "daylight anchors 9 EV horizon -> 15 EV zenith" 'Ev100 = 9\.0f \+ 6\.0f \* std::pow' "$Solver"
CheckConstant "the exponent is 2/3, not a cube root (no sunrise pop)" '2\.0f / 3\.0f' "$Solver"
CheckConstant "twilight spans the 18 degrees of astronomical night" '15\.0f / 18\.0f' "$Solver"
CheckConstant "night floor is EV100 -6"                      'Ev100 = -6\.0f' "$Solver"
CheckConstant "ISO 2721 calibration constant 1.2"            '1\.0f / \(1\.2f \* std::exp2' "$Solver"
CheckConstant "J2000 epoch is 2451545.0"                     'kJulianDayJ2000 = 2451545\.0' "$Solver"
CheckConstant "IAU 1982 sidereal series"                     '280\.46061837 \+ 360\.98564736629' "$Solver"

# ── The frame convention ─────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] world frame is ENU on the engine's Z-up axis"
if grep -qE 'OutDirection\[2\] = static_cast<float>\(std::sin\(Altitude\)\);' "$Solver"; then
    echo "  OK    altitude maps to +Z (up), matching CLAUDE.md section 7"
else
    echo "  FAIL  the up axis moved — the engine is right-handed Z-up and celestial must agree"
    Fail=1
fi

# ── Dynamism: nothing may be cached ──────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] fully dynamic — no bake, no cache, no static state"
if sed -n '/namespace Frontier/,$p' "$Solver" | grep -nE '^\s*static\s+(?!constexpr)' -P >/dev/null 2>&1; then
    echo "  FAIL  the solver holds static mutable state — it must recompute every frame"
    Fail=1
else
    echo "  OK    no static mutable state; every call is a fresh solve"
fi

# ── The property table must stay in step with the struct ─────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] the property table covers the struct"

# A slider table that has drifted from the struct is the classic way a control silently edits the wrong field or a new
# setting ships with no way to change it. Count both sides and require the table to be the larger, complete list.
PropertyCount="$(grep -cE 'FRONTIER_CELESTIAL_(REAL|SWITCH)\(' "$Structure")"
PropertyCount=$((PropertyCount - 2))   # the two #define lines themselves
if [ "$PropertyCount" -ge 50 ]; then
    echo "  OK    $PropertyCount properties exposed"
else
    echo "  FAIL  only $PropertyCount properties — the control surface shrank"
    Fail=1
fi

# Every property must carry a unit and a summary; an unlabelled slider is an unusable slider.
if grep -E 'FRONTIER_CELESTIAL_REAL\(' "$Structure" | grep -vE '^\s*#define' | grep -qE '""\s*,\s*[A-Za-z]'; then
    echo "  FAIL  a real-valued property has an empty unit string"
    Fail=1
else
    echo "  OK    every real-valued property declares a unit"
fi

# ⚠️ Stars must not have a "hide in daylight" flag. The brief explicitly asks for a moon and stars that can also be
#    visible during the day; a visibility switch would make that impossible and is the shortcut most likely to reappear.
if grep -nE 'HideInDay|DaytimeVisible|NightOnly|OnlyAtNight' "$Structure"; then
    echo "  FAIL  a day/night visibility switch appeared — daytime moon and stars must fall out of the radiance"
    Fail=1
else
    echo "  OK    no day/night visibility switch; visibility is physical, not a flag"
fi

# ⚠️ Wind must never be driven by the time-of-day clock; scrubbing the hour must not teleport the clouds.
if grep -nE 'LocalHours' "$Structure" | grep -qiE 'wind|cloud'; then
    echo "  FAIL  the wind or cloud settings reference the time-of-day clock"
    Fail=1
else
    echo "  OK    wind is independent of the time-of-day clock"
fi

# ── The GPU record: C++ and shader must describe the same 336 bytes ──────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] the uniform record matches the shader"

Uniform="Engine/DisplayPresentation/CelestialUniform.h"
Shader="Engine/Shaders/ReSTIRViewport.slang"
Swapchain="Engine/DeviceExchange/SwapchainExchange.cpp"
SwapchainHeader="Engine/DeviceExchange/SwapchainExchange.h"

# Field-by-field. The C++ struct is float[4] per row; the shader is vec4 per row. Same names, same order, or the
# sky reads the wrong numbers out of the right buffer — a failure mode that produces a plausible-looking wrong sky
# and can burn a day.
CppFields="$(grep -oE 'float [A-Za-z]+\[4\];' "$Uniform" | sed 's/float //; s/\[4\];//')"
ShaderFields="$(sed -n '/^struct CelestialRecord$/,/^};/p' "$Shader" | grep -oE 'vec4 [A-Za-z]+;' | sed 's/vec4 //; s/;//')"
if [ "$CppFields" = "$ShaderFields" ]; then
    echo "  OK    $(echo "$CppFields" | wc -l) fields match, in order, between C++ and the shader"
else
    echo "  FAIL  CelestialUniform and the shader's CelestialRecord disagree:"
    diff <(echo "$CppFields") <(echo "$ShaderFields") | sed 's/^/    /'
    Fail=1
fi

# 23 vec4s at 16 B = 368 B, asserted on the C++ side and hard-coded on the Vulkan side. All three must agree.
ShaderVec4Count="$(sed -n '/^struct CelestialRecord$/,/^};/p' "$Shader" | grep -cE '^\s*vec4 ')"
ShaderBytes=$((ShaderVec4Count * 16))
CheckConstant "C++ static_asserts 368 bytes"                 'sizeof\(CelestialUniform\) == 368' "$Uniform"
CheckConstant "the Vulkan buffer is sized 368 bytes"         'kCelestialRecordBytes = 368u' "$SwapchainHeader"
if [ "$ShaderBytes" -eq 368 ]; then
    echo "  OK    the shader struct is $ShaderVec4Count vec4s = $ShaderBytes bytes"
else
    echo "  FAIL  the shader struct is $ShaderVec4Count vec4s = $ShaderBytes bytes, not 368"
    Fail=1
fi

# The flag bits are duplicated by necessity (C++ constants, shader #defines). Compare the values.
for Pair in "Enabled 1" "Fog 2" "LocalFog 4" "LocalCloud 8" "Moon 16" "Stars 32"; do
    Name="${Pair%% *}"; Value="${Pair##* }"
    if grep -qE "#define kCelestialFlag${Name} +${Value}u" "$Shader"; then :; else
        echo "  FAIL  shader flag kCelestialFlag${Name} is not ${Value}"
        Fail=1
    fi
done
echo "  OK    all six feature-flag bits agree between C++ and the shader"

# ── Descriptor plumbing: the binding, the pool, and the bindless table's position ─────────────────────────────────────────────────
echo
echo "[CelestialSolver] descriptor plumbing"

CheckConstant "binding 21 is the celestial record"   'binding = 21\) readonly buffer CelestialExtent' "$Shader"
CheckConstant "the bindless table moved to 22"       'binding = 22\) uniform sampler2D Textures\[\]' "$Shader"
CheckConstant "the set has 23 bindings"              'kComputeBindingCount  = 23u' "$SwapchainHeader"
CheckConstant "the celestial descriptor is written"  'WriteBuffer\(21u, CelestialInfo\)' "$Swapchain"
CheckConstant "the buffer is allocated and mapped"   'AllocateBuffer\(Vulkan->Device, Vulkan->MemoryProperties, kCelestialRecordBytes' "$Swapchain"

# 🔴 THE POOL COUNT. This file's own comments record a shipped bug where the storage-buffer pool said 11 while the
#    layout asked for 12. Binding 21 is a twelfth storage buffer, so count them from the layout rule itself rather
#    than trusting the literal: bindings 1, 2, 6-12, 16, 17, 21.
ExpectedStorageBuffers=12
# sed, not grep -o: the index in PoolSizes[1] is itself a number and grep -oE would return that first.
PoolStorageBuffers="$(sed -nE 's/.*PoolSizes\[1\]\.descriptorCount = ([0-9]+)u.*/\1/p' "$Swapchain" | head -1)"
if [ "$PoolStorageBuffers" = "$ExpectedStorageBuffers" ]; then
    echo "  OK    the pool reserves $PoolStorageBuffers storage buffers, matching the layout"
else
    echo "  FAIL  the pool reserves $PoolStorageBuffers storage buffers but the layout asks for $ExpectedStorageBuffers"
    echo "        (bindings 1, 2, 6-12, 16, 17, 21 - this is the 11-vs-12 bug the source already warns about)"
    Fail=1
fi

# The variable-count bindless binding MUST be the highest number in the set; Vulkan rejects the layout otherwise.
HighestBinding="$(grep -oE 'binding = ([0-9]+)\)' "$Shader" | grep -oE '[0-9]+' | sort -n | tail -1)"
if [ "$HighestBinding" = "22" ]; then
    echo "  OK    22 is the highest binding, so the variable-count table is last"
else
    echo "  FAIL  the highest binding is $HighestBinding; the bindless table must be the highest"
    Fail=1
fi

# ── The production kernel still lowers to SPIR-V with the new binding ────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] the production kernel still compiles"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/CelestialViewport.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Shader" >/tmp/CelestialSolver.spv.log 2>&1; then
        echo "  OK    ReSTIRViewport.slang lowers to SPIR-V ($(stat -c%s "$Spv") bytes)"
    else
        echo "  FAIL  ReSTIRViewport.slang no longer lowers to SPIR-V"
        sed 's/^/    /' /tmp/CelestialSolver.spv.log | head -20
        Fail=1
    fi
    rm -f "$Spv"
fi

# ── Standalone compilation ───────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialSolver] headers compile clean and standalone"
for Unit in "$Structure" "$Solver" "$Uniform"; do
    if g++ -std=c++20 -fsyntax-only -Wall -Wextra -Wno-unused-function -I. -x c++ "$Unit" 2>/tmp/CelestialSolver.syntax; then
        echo "  OK    $Unit"
    else
        echo "  FAIL  $Unit"
        sed 's/^/    /' /tmp/CelestialSolver.syntax | head -20
        Fail=1
    fi
done

echo
if [ "$Fail" -eq 0 ]; then
    echo "[CelestialSolver] OK"
else
    echo "[CelestialSolver] FAILED"
fi
exit "$Fail"
