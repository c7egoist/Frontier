#!/usr/bin/env bash
# Render the weather-clear celestial reference set used to judge Project Zero's atmosphere.
#
# The showcase compiles the shipping celestial shader text as C++, so these are deterministic
# CPU proofs of the same sky path used by the GPU renderer (the geometry is the three-sphere
# stand-in documented in Renders/README.md).
set -euo pipefail

Root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$Root"

Out="${1:-Renders/ClearSky}"
Width="${WIDTH:-640}"
Height="${HEIGHT:-360}"
Samples="${SAMPLES:-24}"
mkdir -p "$Out"

command -v g++ >/dev/null || { echo "RenderClearSkySet: g++ is required" >&2; exit 1; }
if command -v convert >/dev/null; then
    Convert="convert"
elif command -v magick >/dev/null; then
    Convert="magick"
else
    echo "RenderClearSkySet: ImageMagick (convert or magick) is required" >&2
    exit 1
fi

Port="$(mktemp -d /tmp/frontier-clear-sky.XXXXXX)"
trap 'rm -rf "$Port"' EXIT
bash Scratchpad/ExtractCelestialPort.sh "$Port/CelestialPort.inc"
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
    Engine/Shaders/AtmosphereScatter.slang > "$Port/AtmosphereScatter.port.inc"
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' \
    Engine/Shaders/RayGeneration.slang > "$Port/RayGeneration.port.inc"
g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/CelestialShowcase.cpp \
    Engine/DisplayPresentation/ExposureIntegrator.cpp -o "$Port/showcase"

# Local time in Benoni, 2026-09-13 (UTC+2). Coverage 0 is intentional: no cloud layer,
# so changes across the sheet come only from the ephemeris, atmosphere, sun and twilight paths.
# The final -1 keeps the default cinematic lens character; it does not add weather.
declare -a Frames=(
    "00_0430_astronomical_night|4.50"
    "01_0530_nautical_twilight|5.50"
    "02_0618_sunrise|6.30"
    "03_0712_morning|7.20"
    "04_1200_noon|12.00"
    "05_1700_afternoon|17.00"
    "06_1748_golden_hour|17.80"
    "07_1836_sunset|18.60"
    "08_1930_dusk|19.50"
)

for Frame in "${Frames[@]}"; do
    Name="${Frame%%|*}"
    Hours="${Frame##*|}"
    Ppm="$Port/$Name.ppm"
    Png="$Out/$Name.png"
    echo "[clear-sky] $Name (${Hours}h)"
    "$Port/showcase" "$Hours" "$Ppm" "$Width" "$Height" "$Samples" -1 0
    "$Convert" "$Ppm" "$Png"
done

# A single comparison image is convenient in code review and in the file viewer. Keep the
# individual renders beside it so each time remains available at native resolution.
Thumbs=()
for Frame in "${Frames[@]}"; do
    Name="${Frame%%|*}"
    Thumb="$Port/${Name}_thumb.png"
    "$Convert" "$Out/$Name.png" -resize 320x180\! "$Thumb"
    Thumbs+=("$Thumb")
done
"$Convert" +append "${Thumbs[@]}" "$Out/09_clear_sky_contact_sheet.png"
echo "[clear-sky] wrote $Out ($Width×$Height, ${Samples} spp)"
