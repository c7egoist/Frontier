#!/usr/bin/env bash
#============================================================================================================================================
# BuildConsole.sh — minimal, dependency-free build of the SolidArc console binary (no CMake, no verifier suite).
#   Produces $OUT/SolidArc.  Usage:  VehiclePhysics/CarModelling/BuildConsole.sh  [output_dir]
#   Then:   $OUT/SolidArc --continue --proofs <dir> Cars/<script>.scr
#============================================================================================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/SolidArc/Editor/AuthoringTools/Modelling/SolidArc"
OUT="${1:-/tmp/sa-build}"
CXX_BIN="${CXX:-g++}"
mkdir -p "$OUT/obj" "$OUT/proofs"

FLAGS=(-std=c++20 -O2 -w -I"$SRC" -I"$SRC/Presentation" "-DSOLIDARC_PROOF_FOLDER=\"$OUT/proofs\"")
CORE=(
    Kernel/CurveSpecification.cpp Kernel/SurfaceSpecification.cpp Kernel/TopologySpecification.cpp
    Kernel/SkinSolver.cpp Kernel/IntersectionSolver.cpp Kernel/FairPatchSolver.cpp Kernel/ProfileSolver.cpp
    Kernel/ConstraintSolver.cpp Kernel/ConstraintGraph.cpp Kernel/MirrorSolver.cpp Kernel/BlendSolver.cpp
    Kernel/TweakSolver.cpp Kernel/FaceEditSolver.cpp
    Presentation/SoftwareRaster.cpp Presentation/ScenePresentation.cpp
    Interaction/CameraProjection.cpp Interaction/SnapResolution.cpp Interaction/InputEvent.cpp
    Interaction/HotkeyChart.cpp Interaction/ToolSession.cpp Interaction/TransformGizmo.cpp
    Document/SceneDocument.cpp Document/FigureRecipe.cpp Document/UndoSequence.cpp
    Console/CommandCodec.cpp Console/ConsoleHost.cpp Console/ConsoleInteraction.cpp Console/ConsoleSelection.cpp
)
OBJECTS=()
NPROC="$(nproc 2>/dev/null || echo 2)"
echo "[BuildConsole] compiling ${#CORE[@]} core units on $NPROC cores…"
for REL in "${CORE[@]}"; do
    OBJ="$OUT/obj/${REL//\//_}.o"
    "$CXX_BIN" "${FLAGS[@]}" -c "$SRC/$REL" -o "$OBJ" &
    OBJECTS+=("$OBJ")
    while [ "$(jobs -r | wc -l)" -ge "$NPROC" ]; do wait -n; done
done
wait
"$CXX_BIN" "${FLAGS[@]}" -c "$SRC/Console/SolidArcConsole.cpp" -o "$OUT/obj/Console.o"
"$CXX_BIN" "${OBJECTS[@]}" "$OUT/obj/Console.o" -o "$OUT/SolidArc"
echo "[BuildConsole] built $OUT/SolidArc"
