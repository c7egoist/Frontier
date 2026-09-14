#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckCelestialMedia.sh — clouds and fog, global and local, as ONE participating medium
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The user's framing was right: global clouds, local clouds, atmospheric fog and local fog are all the same
#  category — a volume with a density, an extinction and a phase function. This gate holds the implementation to
#  that, and to the two properties that decide whether clouds are scenery or lighting.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Media="Engine/Shaders/CelestialMedia.slang"
Viewport="Engine/Shaders/ReSTIRViewport.slang"
Fail=0

echo "[CelestialMedia] media proof"
bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc >/dev/null 2>&1 || { echo "  FAIL  extraction failed"; exit 1; }
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
    Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc

Binary="$(mktemp -u /tmp/CelestialMedia.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad -I . Scratchpad/CelestialMediaTest.cpp -o "$Binary" 2>/tmp/CelestialMedia.build; then
    echo "  harness failed to build:"; sed 's/^/    /' /tmp/CelestialMedia.build | head -20; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

# ── 🔴 ONE SYSTEM, NOT FOUR ──────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] the four media share one density function and one integrator"
CheckConstant "a single density function"   'float MediaDensity\(CelestialRecord sky, vec3 worldPosition\)' "$Media"
CheckConstant "a single integrator"         'vec3 MediaScatter\(' "$Media"
# If a second march appears, the four have started drifting into separate systems.
MarchCount="$(grep -cE '^vec3 Media[A-Za-z]*Scatter\(' "$Media")"
if [ "$MarchCount" -ne 1 ]; then
    echo "  FAIL  $MarchCount scattering integrators; the media must share one"
    Fail=1
else
    echo "  OK    exactly one scattering integrator"
fi

# ── The architectural rule that keeps the bounce path affordable ─────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] the bounce path must never march"
# CelestialSky runs once per bounce SAMPLE. A march there multiplies by the sample count.
BounceBlock="$(sed -n '/A BOUNCE RAY THAT ESCAPES/,/accumulatedRadiance += throughput \* skyRadiance/p' "$Viewport")"
if printf '%s' "$BounceBlock" | grep -q 'MediaScatter'; then
    echo "  FAIL  the bounce path calls MediaScatter; cost would scale with the sample count"
    Fail=1
else
    echo "  OK    the bounce path uses the closed-form approximation"
fi
CheckConstant "and it does apply cloud dimming there" 'MediaAmbientTransmittance\(Celestial\[0\], bounceDir\)' "$Viewport"

# ── Physics that is easy to get subtly wrong ─────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] the details that decide whether clouds read as clouds"
# A positive second HG lobe is a second FORWARD lobe, which silently removes all back-scatter.
CheckConstant "the backward lobe default is negative" 'BackwardLobe = -0\.30f' "Engine/DisplayPresentation/CelestialStructure.h"
CheckConstant "Beer-powder is present"                'float MediaBeerPowder' "$Media"
# 🔴 Powder must MODULATE, never attenuate. The original `beer * mix(1, 2*sugar, powder)` re-applied Beer's law
#    on top of the march's own `1 - exp(-extinction)` and peaked at 0.40, so a fully lit cloud top lost 60% of
#    its light and clouds rendered 30x too dark — the black-rock look.
if grep -A6 'float MediaBeerPowder' "$Media" | grep -qE 'exp\(-depth\)\s*\*|beer\s*\*'; then
    echo "  FAIL  MediaBeerPowder re-applies Beer's law; the march already does that"
    Fail=1
else
    echo "  OK    powder modulates rather than attenuating"
fi
CheckConstant "clouds shadow the ground"              'float MediaSunShadow' "$Media"
CheckConstant "and the shadow is wired to the sun light" 'MediaSunShadow\(Celestial\[0\], hitPos' "$Viewport"
CheckConstant "coverage erodes through a remap"       'MediaRemap\(shape, 1\.0 - coverage' "$Media"
CheckConstant "the height gradient shapes the slab"   'bottomGradient \* topGradient' "$Media"

# The float32 hash trap: constants above 2^24 are rounded before use and the field collapses to a constant.
if grep -qE 'MediaHash' "$Media" && grep -A6 'float MediaHash' "$Media" | grep -qE '[0-9]{9,}\.0'; then
    echo "  FAIL  MediaHash uses a constant too large for a float32 mantissa; the field will collapse"
    Fail=1
else
    echo "  OK    the hash constants fit in a float32 mantissa"
fi

# ── Overcast must be dim, not black ──────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] overcast is dim, not lightless"
CheckConstant "an overcast floor exists"   '#define kMediaOvercastFloor' "$Viewport"
CheckConstant "and a fill factor tempers the slab depth" '#define kMediaAmbientFill' "$Viewport"

# ── Dynamic settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] every medium is controllable"
for Key in clouds.coverage clouds.backwardLobe clouds.absorption fog.density localCloud.enabled localFog.enabled; do
    if grep -q "\"$Key\"" Engine/DisplayPresentation/CelestialStructure.h; then
        echo "  OK    $Key is a registered property"
    else
        echo "  FAIL  $Key is not reachable from TOML or the panel"
        Fail=1
    fi
done

# ── SPIR-V ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialMedia] the production kernel compiles"
Glslang=""
for Candidate in "${GLSLANG:-}" /home/user/deps/glslang/bin/glslangValidator "$(command -v glslangValidator 2>/dev/null)"; do
    [ -n "$Candidate" ] && [ -x "$Candidate" ] && { Glslang="$Candidate"; break; }
done
if [ -z "$Glslang" ]; then
    echo "  SKIP  no glslangValidator on PATH"
else
    Spv="$(mktemp -u /tmp/CelestialMedia.XXXXXX.spv)"
    if "$Glslang" -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o "$Spv" "$Viewport" >/tmp/CelestialMedia.spv.log 2>&1; then
        echo "  OK    lowers to SPIR-V ($(stat -c%s "$Spv") bytes)"
    else
        echo "  FAIL  no longer lowers to SPIR-V"; sed 's/^/    /' /tmp/CelestialMedia.spv.log | head -20; Fail=1
    fi
    rm -f "$Spv"
fi

echo
if [ "$Fail" -eq 0 ]; then echo "[CelestialMedia] OK"; else echo "[CelestialMedia] FAILED"; fi
exit "$Fail"
