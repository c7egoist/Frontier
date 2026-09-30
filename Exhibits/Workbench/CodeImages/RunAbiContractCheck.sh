#!/usr/bin/env bash
# Build and exercise both isolated project code images through the revisioned C ABI.
# Output is intentionally durable only in Exhibits/Gallery; binaries stay in _AgentScratch.
set -euo pipefail

RepositoryRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ScratchPath="$RepositoryRoot/_AgentScratch/AbiContract"
GalleryPath="$RepositoryRoot/Exhibits/Gallery/CodeImages"
mkdir -p "$ScratchPath" "$GalleryPath"

cxx=(g++ -std=c++20 -Wall -Wextra -Werror)
"${cxx[@]}" -fPIC -shared \
    "$RepositoryRoot/FlattenedEngine/Projects/Project-Zero/Source/ProjectZeroInterchange.cpp" \
    -o "$ScratchPath/ProjectZero.so"
"${cxx[@]}" -fPIC -shared \
    "$RepositoryRoot/FlattenedEngine/Projects/Project-Drive/Source/ProjectDriveInterchange.cpp" \
    -o "$ScratchPath/ProjectDrive.so"
"${cxx[@]}" -I"$RepositoryRoot/FlattenedEngine" \
    "$RepositoryRoot/Exhibits/Workbench/CodeImages/CodeImageAbiCheck.cpp" -ldl \
    -o "$ScratchPath/CodeImageAbiCheck"
(
    cd "$ScratchPath"
    ./CodeImageAbiCheck
) | tee "$GalleryPath/AbiContract_CPU_Check.txt"

python3 - "$GalleryPath" <<'PY'
from pathlib import Path
import hashlib
import json
import sys

gallery = Path(sys.argv[1])
log = gallery / "AbiContract_CPU_Check.txt"
source = gallery.parents[1] / "Workbench" / "CodeImages" / "CodeImageAbiCheck.cpp"
provenance = {
    "proof": "Frontier project code-image C ABI revision-2 lifecycle check",
    "execution": "Linux C++ ABI check only; no native Frontier/Vulkan/UI execution.",
    "runner": "Exhibits/Workbench/CodeImages/RunAbiContractCheck.sh",
    "contract": {"revision": 2, "fingerprint": "0xdd4363893c94c8f0"},
    "checks": [
        "Loads both independently linked project code images with dlopen.",
        "Accepts the current revision/fingerprint and exact C-layout interchange.",
        "Refuses a revision-1 request before callbacks run.",
        "Calls construct, cycle advance, and retirement callbacks.",
        "Receives Project-Drive Vehicle Dynamics panel through the host C callback.",
    ],
    "sha256": {
        "AbiContract_CPU_Check.txt": hashlib.sha256(log.read_bytes()).hexdigest(),
        "Exhibits/Workbench/CodeImages/CodeImageAbiCheck.cpp": hashlib.sha256(source.read_bytes()).hexdigest(),
    },
}
(gallery / "Provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
PY
