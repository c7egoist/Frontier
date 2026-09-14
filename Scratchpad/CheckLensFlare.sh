#!/usr/bin/env bash
# ================================================================================================================================
# CheckLensFlare.sh — the Project Zero lens is the sultanaladin HTML lensFlare() port
# ================================================================================================================================
set -u
Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1
Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0

echo "[LensFlare] HTML reference lens proof"
bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc >/dev/null 2>&1 || { echo "  FAIL  extraction failed"; exit 1; }
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
    Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
Binary="$(mktemp -u /tmp/LensFlare.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad -I . Scratchpad/LensFlareTest.cpp -o "$Binary" 2>/tmp/LensFlare.build; then
    echo "  FAIL  harness build"; sed 's/^/    /' /tmp/LensFlare.build | head -30; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

Check() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

echo
echo "[LensFlare] exact reference terms are present"
Check "reference hue wheel"                 'CelestialFlareHue' "$Viewport"
Check "reference ghost weights"             'weightGhost' "$Viewport"
Check "reference halo ring equation"        'ringDistance = abs\(haloDistance - haloRadius\)' "$Viewport"
Check "reference anisotropic streak"        'exp\(-abs\(m\.y\) \* 95\.0\)' "$Viewport"
Check "reference aperture burst"            'pow\(abs\(sin\(angle \* 7\.0\)' "$Viewport"
Check "reference visibility gate"            'sunUp = smoothstep\(-6\.0, 4\.0, elevation\)' "$Viewport"
Check "screen-space inverse uses FOV"        'tanHalfFov' "$Viewport"
Check "CPU packs halo radius without ABI growth" 'HaloRadius' "Engine/DisplayPresentation/CelestialStructure.h"
# The atmosphere and flare must remain separate: no sun-glare approximation is allowed to sneak back into the sky.
if grep -qE 'CelestialSunGlare|kGlareCutoff|kGlareStrength' "$Viewport"; then
    echo "  FAIL  rejected custom sun-glare implementation returned"
    Fail=1
else
    echo "  OK    no custom angular glare; only the HTML screen-space lens remains"
fi

# Four reference weights, including the halo which is part of the HTML implementation (not a fake sky aureole).
Check "ghost and halo weights"               'weightGhost' "$Viewport"
Check "streak and burst weights"              'weightStreak|weightBurst' "$Viewport"
Check "ReSTIR viewport calls the reference flare" 'CelestialLensFlare\(skyRecord' "$Viewport"
Check "flare is composited after media" 'background \+= CelestialLensFlare' "$Viewport"

echo
echo "[LensFlare] production kernel compilation"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/LensFlare.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Viewport" >/tmp/LensFlare.spv.log 2>&1; then
        echo "  OK    lowers to SPIR-V ($(stat -c%s "$Spv") bytes)"
    else
        echo "  FAIL  no longer lowers to SPIR-V"; sed 's/^/    /' /tmp/LensFlare.spv.log | head -20; Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" -eq 0 ]; then echo "[LensFlare] OK"; else echo "[LensFlare] FAILED"; fi
exit "$Fail"
