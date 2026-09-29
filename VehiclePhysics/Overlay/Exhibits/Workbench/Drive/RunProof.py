#!/usr/bin/env python3
"""Build and run the Project-Drive CPU-mirror proof, then record provenance.

Mirrors Exhibits/Workbench/AutomotiveShowcase/RunProof.py in spirit: compile the dependency-free native proof in
Release and Debug with the engine's C++20 flags, run it (which renders the PNGs and self-gates via Check()), then
write Exhibits/Gallery/Drive/NativeProof.json with the sha256 of every source input and every rendered output.

    python3 Exhibits/Workbench/Drive/RunProof.py

No GPU, no window, no external packages. Run from the repository root.
"""
import hashlib, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]          # repository root
WORK = ROOT / "Exhibits/Workbench/Drive"
OUT  = ROOT / "Exhibits/Gallery/Drive"
OUT.mkdir(parents=True, exist_ok=True)

SRC = WORK / "NativeDriveProof.cpp"
# The proof pulls these in via relative includes; hash them so the provenance pins the exact rendered inputs.
INPUTS = [
    SRC,
    WORK / "PngWriteCounterpart.h",
    ROOT / "Engine/ContentInterchange/PngWriteCounterpart.h",
    ROOT / "Projects/Project-Drive/Source/DriveCourse.h",
    ROOT / "Projects/Project-Drive/Source/ControlVehicleMesh.inl",
]

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(cmd):
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT, text=True, capture_output=True)
    print(r.stdout, r.stderr)
    assert r.returncode == 0, f"{cmd} -> exit {r.returncode}"
    return {"command": [str(c) for c in cmd], "exit": r.returncode, "output": r.stdout + r.stderr}

reports = []
for mode, opt in [("Release", ["-O2"]), ("Debug", ["-O0", "-g"])]:
    binary = OUT / f".DriveProof-{mode}"
    compile_report = run(["g++", "-std=c++20", "-Wall", "-Wextra", "-Werror", *opt, "-pthread", SRC, "-o", binary])
    render_report  = run([binary, "--out", OUT, "--name", "drive_scene"])
    reports.append({"mode": mode, "compile": compile_report, "render": render_report})
    binary.unlink(missing_ok=True)

# The body close-up (three-quarter front) that reads the flake clearcoat.
closeup = OUT / ".DriveProof-Closeup"
run(["g++", "-std=c++20", "-O2", "-pthread", SRC, "-o", closeup])
run([closeup, "--out", OUT, "--name", "drive_body_flakes",
     "--frames", "20", "--eye", "-3.2", "-3.0", "1.4", "--look", "0.2", "0.0", "0.45", "--fov", "42"])
closeup.unlink(missing_ok=True)

provenance = {
    "proof": "Project-Drive scene CPU mirror (course + ControlVehicle + wheels, sun/sky, surfel GI, flake clearcoat)",
    "gpuExecution": False,
    "windowsExecution": False,
    "modes": reports,
    "sha256": {str(p.relative_to(ROOT)): sha(p) for p in INPUTS if p.exists()},
    "outputs": {str(p.relative_to(ROOT)): sha(p) for p in sorted(OUT.glob("*.png"))},
}
(OUT / "NativeProof.json").write_text(json.dumps(provenance, indent=2) + "\n")
print(f"Wrote {OUT/'NativeProof.json'} and {len(list(OUT.glob('*.png')))} PNG(s).")
sys.exit(0)
