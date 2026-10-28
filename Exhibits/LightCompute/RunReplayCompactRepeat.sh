#!/usr/bin/env bash
# 🧩 Repeat compact replay float and history parity across deterministic seed batches.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TOOLS="${VULKAN_TOOLS:-$ROOT/ExternalPackages/VulkanCompute}"
MODE=release
if [[ "${SANITIZE:-0}" == 1 ]]; then
    MODE=sanitized
    export ASAN_OPTIONS="${ASAN_OPTIONS:-detect_leaks=0}" UBSAN_OPTIONS="${UBSAN_OPTIONS:-halt_on_error=1}"
fi
BUILD="${BUILD:-$ROOT/_ClaudeScratch/build/replay-sample-history-$MODE}"
DRIVER="${VULKAN_LIBRARY:-$TOOLS/SwiftShader/libvulkan.so.1}"
if [[ -z "${VULKAN_LIBRARY:-}" ]]; then export VK_ICD_FILENAMES="$TOOLS/SwiftShader/vk_swiftshader_icd.json"; fi
export LD_LIBRARY_PATH="$TOOLS/SwiftShader${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
RESULTS="${RESULTS:-$ROOT/Exhibits/LightCompute/Results/ReplayCompactRepeat-$MODE.txt}"
{
    echo "Eight deterministic compact replay batches; host $MODE; external driver and shaders not sanitizer-instrumented"
    echo "Base $(git rev-parse HEAD) plus working changes"
    uname -srm
    "${CXX:-c++}" --version | sed -n '1p'
    "$TOOLS/Slang/slangtorch/bin/slangc" -version 2>&1
    sha256sum Frontier/Engine/Rendering/Shaders/{LightInfluence,PathReplayReservoir,PathReplaySampleHistory}.slang \
        Exhibits/LightCompute/Code/{LightComputeValidation.cpp,ReplaySampleHistoryValidation.h}
    "$BUILD/LightComputeValidation" "$DRIVER" "$BUILD" --replay-compact-parity
} 2>&1 | tee "$RESULTS"
