#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckCelestialExposure.sh — P4 / F3: the exposure stops moving when the camera does
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The named failure: "exposure keeps changing when camera angle changes, especially when sun hasn't changed."
#
#  P0 fixed the sample-count half of that complaint. This gate covers the exposure half: a Celestial mode whose
#  input is the sun's elevation and nothing else. The proof runs a camera sweep that swings the frame meter 160x
#  and asserts the exposure does not move — and runs ADAPTIVE through the identical sweep as a control, so the
#  result is a measured contrast rather than the observation that a constant is constant.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Header="Engine/DisplayPresentation/ExposureIntegrator.h"
Source="Engine/DisplayPresentation/ExposureIntegrator.cpp"
Solver="Engine/DisplayPresentation/CelestialSolver.h"
Fail=0

echo "[CelestialExposure] exposure proof"
Binary="$(mktemp -u /tmp/CelestialExposure.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I . -I Scratchpad \
        Scratchpad/CelestialExposureTest.cpp "$Source" -o "$Binary" 2>/tmp/CelestialExposure.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/CelestialExposure.build | head -30
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

# ── 🔴 F3, ENFORCED STRUCTURALLY ─────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialExposure] F3 — the Celestial branch cannot see the frame"
CheckConstant "the mode exists"              'Celestial = 2u' "$Header"
CheckConstant "and the game can select it"   '\-\-sky-exposure' "Projects/Project-Zero/Source/GameExecution.cpp"

# The whole guarantee is that the Celestial branch of QueryExposure reads no frame-derived quantity. Extract that
# branch and check it directly — this is the one property that, if it rots, silently reopens the bug.
Branch="$(sed -n '/Mode == ExposureModeCategory::Celestial/,/^    }/p' "$Source")"
if printf '%s' "$Branch" | grep -qE 'AdaptedLuminance|ObservedLuminance|ExposureForLuminance|KeyForLuminance'; then
    echo "  FAIL  the Celestial branch reads a frame-measured luminance — F3 is reopened"
    printf '%s' "$Branch" | sed 's/^/    /'
    Fail=1
else
    echo "  OK    the Celestial branch reads no frame-measured luminance"
fi

# Same rule at the source: the solver that produces the gain must not be able to reach a camera.
Body="$(sed -n '/inline float SolveCelestialEv100/,/^}/p' "$Solver")"
if printf '%s' "$Body" | grep -qE 'Camera|ViewMatrix|Luminance|FrameIndex|Pixel'; then
    echo "  FAIL  SolveCelestialEv100 references the camera"
    Fail=1
else
    echo "  OK    SolveCelestialEv100 takes an elevation and settings only"
fi

# ── The easing, and the reason it does not reopen F3 ─────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialExposure] the ease is on TIME, never on the camera"
CheckConstant "the ease constant is declared"      'CelestialEaseSeconds = 4\.0f' "$Header"
CheckConstant "and applied frame-rate independently" 'exp\(-DeltaSeconds / Config\.CelestialEaseSeconds\)' "$Source"

# The easing block must not start reading the frame meter either.
EaseBlock="$(sed -n '/Celestial easing/,/^    }/p' "$Source")"
if printf '%s' "$EaseBlock" | grep -qE 'AdaptedLuminance|ObservedLuminance'; then
    echo "  FAIL  the celestial easing reads a frame-measured luminance"
    Fail=1
else
    echo "  OK    the easing reads only the target gain and the frame time"
fi

# ── The control must stay in the harness ─────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialExposure] the Adaptive control is still measured"
# Without the Adaptive comparison, section 1 proves only that a constant is constant.
if grep -q 'ExposureModeCategory::Adaptive' Scratchpad/CelestialExposureTest.cpp; then
    echo "  OK    Adaptive is still run through the identical sweep as a control"
else
    echo "  FAIL  the Adaptive control was removed; the F3 comparison no longer proves anything"
    Fail=1
fi

# ── Mutual exclusion ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
echo
echo "[CelestialExposure] the two moving-exposure modes cannot both be on"
CheckConstant "--adaptive and --sky-exposure are exclusive" 'mutually exclusive' "Projects/Project-Zero/Source/GameExecution.cpp"

echo
if [ "$Fail" -eq 0 ]; then echo "[CelestialExposure] OK"; else echo "[CelestialExposure] FAILED"; fi
exit "$Fail"
