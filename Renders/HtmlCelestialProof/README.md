# HTML-reference celestial proof strip

These six proof renders are produced by `Scratchpad/CelestialShowcase.cpp` after extracting the shipping celestial functions from `Engine/Shaders/ReSTIRViewport.slang` with `Scratchpad/ExtractCelestialPort.sh`.

| Render | Local time | Solar elevation | Reference path exercised |
|---|---:|---:|---|
| `dawn.png` | 05:00 | -15.76° | deep twilight / dawn glow path |
| `sunrise.png` | 06:12 | +0.39° | white dawn line, soft low-sun disc |
| `noon.png` | 12:00 | +60.09° | blue Rayleigh/Mie zenith and direct sun |
| `sunset.png` | 17:42 | +3.01° | warm low-sun disc and forward Mie light |
| `dusk.png` | 18:36 | -9.09° | sunset-to-dusk transition and twilight colour ramp |
| `night.png` | 00:00 | -67.70° | below-horizon sun gate / dark celestial path |

The checked-in `docs/celestial/index.html` is the unmodified technical and visual reference. The CPU harness is not a replacement renderer: it compiles the same `.slang` source text as C++ for reproducible proof images. Project Zero still ships the GPU path in `ReSTIRViewport.slang`; the ReSTIR sun candidate, cloud/media path, and screen-space reference lens flare remain in that kernel.

The checked-in PNGs were rendered at 320×180, 12 samples per pixel, with the default cinematic reference lens enabled. To regenerate at the recorded settings:

```sh
bash Scratchpad/ExtractCelestialPort.sh /tmp/CelestialPort.inc
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g; s/\bout +(vec[234]|float) +/\1\& /g' \
  Engine/Shaders/AtmosphereScatter.slang > /tmp/AtmosphereScatter.port.inc
sed -E 's/\.(xyz|xy|yz|xz)\b([^(])/.\1()\2/g' \
  Engine/Shaders/RayGeneration.slang > /tmp/RayGeneration.port.inc
g++ -std=c++20 -O2 -I Scratchpad -I . Scratchpad/CelestialShowcase.cpp \
  Engine/DisplayPresentation/ExposureIntegrator.cpp -o /tmp/showcase

for spec in \
  "dawn 5.00" "sunrise 6.20" "noon 12.00" \
  "sunset 17.70" "dusk 18.60" "night 0.00"; do
  set -- $spec
  /tmp/showcase "$2" "/tmp/$1.ppm" 320 180 12 -1
  # Convert each PPM to the checked-in PNG and rebuild contact.png with your image tool of choice.
done
```
