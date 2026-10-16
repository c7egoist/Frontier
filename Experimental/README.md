# Experimental prototypes

This directory contains browser-facing prototypes and small experiments. These are not the C++ engine's production runtime.

- [`IlluminationHost/`](IlluminationHost/README.md) — reconstructed WebGPU / JavaScript vehicle and global-illumination prototype, before the C++ port. Material changes in its cabin Garage HMI update the live ControlVehicle; the viewport supports solid, ghost and wireframe display modes. The follow-up vehicle physics/effects work is tracked in [`IlluminationHost/Plans/VehiclePolish.md`](IlluminationHost/Plans/VehiclePolish.md).
- [`interactive-vehicle-hmi-configurator/`](interactive-vehicle-hmi-configurator/) — React/Three.js vehicle HMI reference with material drag/drop and scan/hologram effects.

The prototype was flattened from the experimental patch into normal source files. The patch artifact itself is intentionally not kept here.
