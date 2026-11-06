# Frontier

## Fluid/smoke editor (C++ port)

`Experimental/FluidSmokeEditor/` is the 1:1 C++ port of the fluid/smoke editor in
`Experimental/VehicleHmiPrototype/` — editor shell and Smoke & fire inspector, the plume
shaders (`PlumeAdvection`/`PlumeVorticity`/`PlumePressure`/`PlumeMarch`/`FireIllumination`)
ported entry-for-entry, and smoke + fire with interaction in the SDF world. Open it in
`EverestWindow` with **1** (smoke), **2** (fluid), **3** (plume). See
`Experimental/FluidSmokeEditor/README.md` for the full port map; headless parity checks:
`FluidSmokeValidation` (ctest).
