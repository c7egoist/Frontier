#!/usr/bin/env bash
# 🧩 Compare actual legacy and compact replay readbacks.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TOOLS="${VULKAN_TOOLS:-$ROOT/ExternalPackages/VulkanCompute}"
BUILD="${BUILD:-$ROOT/_ClaudeScratch/build/replay-sample-history-release}"
DESTINATION="${OUTPUT:-$ROOT/_ClaudeScratch/replay-compact-parity}"
DRIVER="${VULKAN_LIBRARY:-$TOOLS/SwiftShader/libvulkan.so.1}"
if [[ -z "${VULKAN_LIBRARY:-}" ]]; then export VK_ICD_FILENAMES="$TOOLS/SwiftShader/vk_swiftshader_icd.json"; fi
export LD_LIBRARY_PATH="$TOOLS/SwiftShader${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
mkdir -p "$DESTINATION/legacy" "$DESTINATION/compact"
env -u FRONTIER_REPLAY_COMPACT "$BUILD/LightComputeValidation" "$DRIVER" "$BUILD" \
    --capture-replay-sample-history "$DESTINATION/legacy"
FRONTIER_REPLAY_COMPACT=1 "$BUILD/LightComputeValidation" "$DRIVER" "$BUILD" \
    --capture-replay-sample-history "$DESTINATION/compact"
for NAME in ReplaySampleFresh ReplaySampleFourFresh ReplaySampleRetraced ReplaySampleAcceptance; do
    cmp "$DESTINATION/legacy/$NAME.ppm" "$DESTINATION/compact/$NAME.ppm"
    sha256sum "$DESTINATION/compact/$NAME.ppm"
done
printf 'PASS four identical PPM captures\n'
