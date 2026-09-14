#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  CheckSkySpheresScene.sh — the default level is the outdoor one, and it is lit by nothing but the sky
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  The Cornell box was the default. It is a sealed room: no sun, no horizon, no directional shadows, no sky-lit
#  ambient — the worst possible scene for judging a sky. The default is now three matte spheres on open ground,
#  the same scene as the images in Renders/.
#
#  🔴 THE CORNELL BOX IS DELIBERATELY NOT DELETED. Twelve harnesses use it as a bit-identity reference. This
#     gate asserts BOTH that the new default is wired AND that the box is still reachable and unmodified.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set -u

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root" || exit 1

Game="Projects/Project-Zero/Source/GameExecution.cpp"
Fail=0

CheckConstant() {
    local Label="$1" Pattern="$2" File="$3"
    if grep -qE "$Pattern" "$File"; then echo "  OK    $Label"
    else echo "  FAIL  $Label — expected /$Pattern/ in $File"; Fail=1; fi
}

echo "[SkySpheres] the default scene"
CheckConstant "the default level is SkySpheres"      'ScenePath  = "Projects/Project-Zero/Content/Scenes/SkySpheres.gltf"' "$Game"
CheckConstant "--scene spheres resolves"             'ScenePath == "spheres"' "$Game"
CheckConstant "and it is exported on first run"      'SkySpheresStructure Spheres' "$Game"

echo
echo "[SkySpheres] the Cornell box is still reachable"
# Changing a default must not cost twelve proofs their reference.
CheckConstant "--scene cornell resolves"             'ScenePath == "cornell"' "$Game"
CheckConstant "the exporter still runs for it"       'IsCornell && !std::filesystem::exists' "$Game"
if [ -f Engine/ContentInterchange/SceneCodec.cpp ] && grep -q 'CornellBox' Engine/ContentInterchange/SceneCodec.cpp; then
    echo "  OK    the Cornell writer is untouched"
else
    echo "  FAIL  the Cornell writer is gone; twelve harnesses reference it"
    Fail=1
fi

echo
echo "[SkySpheres] geometry proof"
Binary="$(mktemp -u /tmp/SkySpheres.XXXXXX)"
VulkanInclude="/home/user/deps/vkh/include"
[ -d "$VulkanInclude" ] || VulkanInclude="/usr/include"
if ! g++ -std=c++20 -O2 -I . -I "$VulkanInclude" \
        -I ExternalPackages/cgltf -I ExternalPackages/ufbx -I ExternalPackages/stb -I ExternalPackages/tinybvh \
        Scratchpad/SkySpheresSceneTest.cpp \
        Engine/ContentInterchange/SkySpheresStructure.cpp Engine/ContentInterchange/SceneCodec.cpp \
        Engine/ContentInterchange/MaterialCodec.cpp Engine/ContentInterchange/MaterialIndex.cpp \
        Engine/ContentInterchange/TextureIndex.cpp Engine/GeometricRaster/SceneStructure.cpp \
        Engine/GeometricRaster/GeometryStructure.cpp Engine/DeviceExchange/OrientationClassifier.cpp \
        -o "$Binary" 2>/tmp/SkySpheres.build; then
    echo "  harness failed to build:"
    sed 's/^/    /' /tmp/SkySpheres.build | tail -20
    exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

echo
if [ "$Fail" -eq 0 ]; then echo "[SkySpheres] OK"; else echo "[SkySpheres] FAILED"; fi
exit "$Fail"
