#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckLensFlare.sh — three flare elements, three tiers, freely combinable, and NOT ONE OF THEM A HALO
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  Standing user constraint: "the sun blending into the atmosphere like a halo is 1 thing i absolutely do not
#  want". Every off-the-shelf flare library ships a halo element. This one deliberately does not, and this gate
#  is what stops one arriving later — either as a named element, or by accident when some other element spreads.
#
#  The proof measures SHAPE, because a halo is a shape problem that cannot be tuned away with an intensity.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Viewport="Engine/Shaders/ReSTIRViewport.slang"
Structure="Engine/DisplayPresentation/CelestialStructure.h"
Fail=0

echo "[LensFlare] flare proof"
bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc >/dev/null 2>&1 || { echo "  FAIL  extraction failed"; exit 1; }
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
    Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc

Binary="$(mktemp -u /tmp/LensFlare.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Scratchpad -I . Scratchpad/LensFlareTest.cpp -o "$Binary" 2>/tmp/LensFlare.build; then
    echo "  harness failed to build:"; sed 's/^/    /' /tmp/LensFlare.build | head -20; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

# ── 🔴 NO HALO ELEMENT, EVER ─────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] the halo stays banned"
# ⚠️ SEARCH CODE, NOT COMMENTS. A first version of this check grepped for the word "halo" anywhere and duly
#    failed on the three comments that EXPLAIN why there is no halo — the documentation tripping the gate that
#    documents it. Strip comments first, then look for a halo as an actual identifier: a function, a field, an
#    element bit or a setting. That is the only form in which one could actually be reintroduced.
HaloCode="$(sed -E 's;//.*$;;' "$Viewport" "$Structure" | grep -niE '[A-Za-z_]*halo[A-Za-z_]*' || true)"
if [ -n "$HaloCode" ]; then
    echo "  FAIL  a halo identifier exists in code (not just comments):"
    printf '%s\n' "$HaloCode" | sed 's/^/    /'
    Fail=1
else
    echo "  OK    no halo identifier anywhere in the shader or the settings"
fi

CheckConstant "exactly three element bits exist"  'LensFlareElementStarburst = 1u << 2' "$Structure"
if grep -qE 'LensFlareElement[A-Za-z]+ = 1u << 3' "$Structure"; then
    echo "  FAIL  a fourth flare element was added; if it is a halo, it is banned"
    Fail=1
else
    echo "  OK    no fourth element crept in"
fi

# ── The degenerate case that WAS a halo ──────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] the dead-centre ghost collapse stays fixed"
# With the camera looking exactly at the sun, every ghost centre collapses onto the sun and the chain becomes a
# ring around it. Measured at 0.147 before the fix. The guard must stay.
CheckConstant "ghosts bail out when the sun is dead centre" 'if \(offAxis < 1e-4\) return vec3\(0\.0\)' "$Viewport"
CheckConstant "and ramp in rather than popping"             'centreFade' "$Viewport"

# ── Physical behaviour that is easy to "simplify" wrongly ────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] odd apertures still double their spikes"
CheckConstant "odd blade counts double the spike count" 'mod\(blades, 2\.0\) < 0\.5 \? blades : blades \* 2\.0' "$Viewport"

# ── Tiers and combining ──────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] tiers and free combination"
CheckConstant "four tiers exist"                  'LensFlareTierCategory' "$Structure"
CheckConstant "the mask overrides the tier"       'ElementMask' "$Structure"
CheckConstant "the game exposes --flare"          '\-\-flare' "Projects/Project-Zero/Source/GameExecution.cpp"
CheckConstant "and --flare-elements for combining" '\-\-flare-elements' "Projects/Project-Zero/Source/GameExecution.cpp"

# ── Integer properties must use the integer accessor ─────────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] integer settings are written as integers"
# Writing a float bit pattern into an int field turns 6 blades into 1086324736.
CheckConstant "an Integer property kind exists"     'Integer = 2u' "$Structure"
CheckConstant "with its own typed accessor"         'WriteCelestialInteger' "$Structure"
CheckConstant "and the codec dispatches on it"      'CelestialPropertyKind::Integer' "Engine/DisplayPresentation/CelestialSettingsCodec.h"

# ── SPIR-V ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[LensFlare] the production kernel compiles"
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
