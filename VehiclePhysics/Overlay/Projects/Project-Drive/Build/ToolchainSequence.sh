#!/usr/bin/env bash
# Project-Drive Linux driver — builds and runs the headless CPU references (mirrors Project-Dyno/Build/ToolchainSequence.sh).
# The Vulkan product app is built by the top-level CMake `linux-app` preset once GameExecution is wired (see README).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
make run
echo "[Project-Drive] Diagnostics written to $here/Diagnostics"
