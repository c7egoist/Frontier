# Experimental browser prototypes

These are standalone browser studies, separate from the native C++ editor. The restored prototype is kept as source files; the original patch artifact is intentionally not included.

| Prototype | Purpose | Run |
| --- | --- | --- |
| [IlluminationHost](IlluminationHost/README.md) | Pre-native-C++ WebGPU prototype for the vehicle, ReSTIR/global illumination, cabin HMI, smoke, sparks and fracture. | `cd Experimental/IlluminationHost && python3 -m http.server 8080` |
| [Interactive vehicle HMI configurator](interactive-vehicle-hmi-configurator/) | React/Three.js material configurator used as the HMI interaction and visual reference. | `cd Experimental/interactive-vehicle-hmi-configurator && npm install && npm run dev` |

The IlluminationHost Garage is wired to the live prototype vehicle: paint, body-finish and rim-material choices update its GPU materials, while Solid/Ghost/Wireframe switches change the vehicle render. Follow-up physics, tyre, spark and steering work is tracked in [IlluminationHost/PLAN.md](IlluminationHost/PLAN.md).
