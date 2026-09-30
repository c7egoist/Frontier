#!/usr/bin/env python3
"""Seat the Frontier engine checkout that every mirror in this folder renders through.

Slate holds overlays and proof tooling, not the engine.  The program whose behaviour these proofs claim to show
is `SultanAladin/Frontier-`, so a proof that does not build that tree is not evidence of anything.  This module
clones it at a pinned revision into `_AgentScratch/` (git-ignored, never committed), installs the pinned
third-party archives through the engine's own `Tools/Bootstrap.py`, and hands back the path.

Nothing in this file renders, shades, or models anything.  It only stands up the engine so the engine can.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRATCH = ROOT / "_AgentScratch"
ENGINE = SCRATCH / "Frontier"

# The revision the retained Exhibits/Gallery provenance already names.  Bump deliberately, never silently:
#    every gallery Provenance.json records the revision its sheets were rendered from.
ENGINE_REPOSITORY = "https://github.com/SultanAladin/Frontier-.git"
ENGINE_REVISION = "28ec0657a23ed6bbf680f17cc06b464a53639dae"

# Vulkan headers are a build-time include dependency of the material viewport; the engine's own Makefile searches
#    these three candidates, and a seated ExternalPackages/ satisfies it.
VULKAN_CACHE = Path.home() / ".cache/m7"


def run(command: list[str], cwd: Path, quiet: bool = False) -> subprocess.CompletedProcess:
    """Run a command, echoing failures in full so a broken proof says why."""
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        sys.stderr.write(f"$ {' '.join(command)}\n{result.stdout}\n{result.stderr}\n")
        raise RuntimeError(f"{command[0]} exited with {result.returncode}")
    if not quiet and result.stdout.strip():
        print(result.stdout.rstrip())
    return result


def seat(refresh: bool = False) -> Path:
    """Clone (or reuse) the pinned engine and install its pinned dependencies.  Returns the checkout root."""
    SCRATCH.mkdir(parents=True, exist_ok=True)
    if refresh and ENGINE.exists():
        run(["rm", "-rf", str(ENGINE)], cwd=SCRATCH)
    if not (ENGINE / ".git").exists():
        print(f"[engine] cloning {ENGINE_REPOSITORY} @ {ENGINE_REVISION[:12]}")
        run(["git", "init", "-q", str(ENGINE)], cwd=SCRATCH)
        run(["git", "remote", "add", "origin", ENGINE_REPOSITORY], cwd=ENGINE)
        run(["git", "fetch", "-q", "--depth", "1", "origin", ENGINE_REVISION], cwd=ENGINE)
        run(["git", "checkout", "-q", "FETCH_HEAD"], cwd=ENGINE)
    head = run(["git", "rev-parse", "HEAD"], cwd=ENGINE, quiet=True).stdout.strip()
    if head != ENGINE_REVISION:
        raise RuntimeError(f"engine checkout is {head}, expected the pinned {ENGINE_REVISION}")
    print(f"[engine] seated at {head}")

    # The engine installs its own pinned third-party archives; `--profile proof` is the five the CPU proofs need.
    if not (ENGINE / "ExternalPackages/imgui/imgui.cpp").exists():
        print("[engine] installing pinned dependencies (profile: proof)")
        run([sys.executable, "Tools/Bootstrap.py", "--profile", "proof"], cwd=ENGINE)

    # ThorVG's static library backs the editor's icon presentation; the engine's own proof builder makes it.
    pin = ENGINE / "ExternalPackages/thorvg/.frontier-proof-pin"
    if not pin.exists():
        lock = json.loads((ENGINE / "ExternalPackages/Dependencies.lock.json").read_text())
        revision = next(p["revision"] for p in lock["packages"] if p["name"] == "thorvg")
        pin.write_text(revision)
    if not (ENGINE / ".cache/icon-art/release/libthorvg.a").exists():
        print("[engine] building the pinned ThorVG software rasteriser")
        run([sys.executable, "Exhibits/Workbench/IconArt/BuildProof.py", "--target", str(ENGINE)], cwd=ENGINE, quiet=True)

    VULKAN_CACHE.mkdir(parents=True, exist_ok=True)
    if not (VULKAN_CACHE / "Vulkan-Headers/include/vulkan/vulkan.h").exists():
        headers = ENGINE / "ExternalPackages/vulkan-headers"
        if (headers / "include/vulkan/vulkan.h").exists():
            (VULKAN_CACHE / "Vulkan-Headers").symlink_to(headers)
    return ENGINE


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def provenance(proof: str, scene: str, commands: list[list[str]], results: dict, outputs: list[Path]) -> dict:
    """The gallery's standing provenance shape, with the engine revision these sheets actually came from."""
    return {
        "proof": proof,
        "execution": "CPU render by the engine's own translation units — not a native Vulkan, Slang, or ImGui capture.",
        "renderer": "Frontier engine sources, built and run headless. No renderer is authored in Slate.",
        "source": {"repository": ENGINE_REPOSITORY, "revision": ENGINE_REVISION},
        "scene": scene,
        "commands": [" ".join(str(part) for part in command) for command in commands],
        "results": results,
        "sha256": {path.name: sha256(path) for path in sorted(outputs) if path.exists()},
    }


if __name__ == "__main__":
    seat(refresh="--refresh" in sys.argv)
