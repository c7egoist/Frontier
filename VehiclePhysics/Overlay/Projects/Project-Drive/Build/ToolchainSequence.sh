#!/usr/bin/env bash
# Frontier/Projects/Project-Drive/Build/ToolchainSequence.sh
#   Linux driver for Project-Drive — its OWN standalone windowed app (a sibling of Project-Zero, NOT a mode of it).
#   Builds the `Project-Drive` CMake target (defined by Projects/Project-Drive/Build/ProjectDrive.cmake, which the
#   root CMakeLists.txt includes with one line) and runs it from the repository root so it finds Engine/Shaders and
#   generates Projects/Project-Drive/Content/Scenes/DriveCourse.gltf on first launch.
#
#   Usage (from anywhere):
#     Projects/Project-Drive/Build/ToolchainSequence.sh                 # configure + build (Release) + run
#     BUILD_DIR=build-drive CONFIG=Debug Projects/Project-Drive/Build/ToolchainSequence.sh
#     RUN=0 Projects/Project-Drive/Build/ToolchainSequence.sh           # build only, do not launch
#
#   Windows builds use Projects/Project-Drive/Build/ToolchainSequence.ps1 (direct MSVC toolchain), not CMake.
set -euo pipefail

RepositoryRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$RepositoryRoot"

BUILD_DIR="${BUILD_DIR:-build}"
CONFIG="${CONFIG:-Release}"
RUN="${RUN:-1}"

echo "[Project-Drive] Configuring ($CONFIG) in $BUILD_DIR ..."
cmake -S . -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE="$CONFIG"

echo "[Project-Drive] Building the Project-Drive target ..."
cmake --build "$BUILD_DIR" --target Project-Drive -j"$(nproc)"

Exe="$BUILD_DIR/Project-Drive"
[ -x "$Exe" ] || Exe="$(find "$BUILD_DIR" -name Project-Drive -type f -perm -u+x | head -n1)"
echo "[Project-Drive] Built: $Exe"

if [ "$RUN" = "1" ]; then
    echo "[Project-Drive] Launching from repository root (so it finds Engine/Shaders + generates its scene) ..."
    "$Exe"
fi
