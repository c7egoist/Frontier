# Deferred — Thermal system: coolant & oil (roadmap)

**Status: DEFERRED.** Not built yet; this is the plan. GRIT ships the spec headers `Components/Coolant.h` and
`Components/EngineOil.h` (physics inline). The braking system already has its **own** thermal model (disc heat
soak + fade, shipped and validated in Phase 7) — this document is about the **engine/driveline** thermal loop, which
is separate and not yet built. Nothing shipped depends on it.

## Why it is deferred
Same reasoning as fuel: the car drives and every dynamics subsystem is validated. Coolant/oil temperature changes
*engine and driveline behaviour over time* (protection, drag, power) but does not alter the solver structure. It is
additive and layers on top of the existing `Drivetrain` engine step.

## Scope when built

### A. Coolant loop (engine core temperature)
Lumped-capacitance thermal node for the engine block + coolant:
- **Heat in** Q̇_in = fuel_power × (1 − thermal_efficiency) × fraction_to_coolant (waste heat; ~⅓ of fuel energy to
  coolant, ~⅓ to exhaust). Until fuel lands, drive it from engine torque × RPM × a loss fraction.
- **Heat out** through the radiator: Q̇_out = ε · ṁ_air · c_p,air · (T_coolant − T_ambient), with air mass flow rising
  with road speed and fan state — mirrors the braking model's convective `h·(1+k√v)·A·ΔT` form.
- **Thermostat**: below open-temp, radiator flow ≈ 0 (fast warm-up); above, flow ramps to full. Hysteresis band.
- **State**: dT/dt = (Q̇_in − Q̇_out) / (m·c_p). Warm-up, steady cruise temp, and overheat under sustained load
  all emerge. **Overheat protection**: torque de-rate above a threshold (limp mode), matching real ECU behaviour.

### B. Oil loop (lubrication temperature → viscosity → drag & protection)
- Oil temperature node fed by engine friction + a fraction of combustion heat, cooled by the (optional) oil cooler
  and block conduction; lags coolant.
- **Viscosity vs temperature** (Vogel/Walther fit per oil grade, e.g. 5W-30 vs 10W-60): cold oil ⇒ high viscosity ⇒
  extra **parasitic drag** (subtract Nm from engine output, like the supercharger's parasitic term) and slower
  response; hot-and-thin oil ⇒ pressure drop ⇒ **protection de-rate**.
- **Cold-start protection**: cap RPM/torque until oil is above a minimum temperature (real "don't rev a cold engine").

### C. Cross-coupling
- Coolant and oil exchange heat with each other and the block (shared lumped node or 3-node network).
- Both feed the engine torque ceiling: `torque_available = base × coolant_derate × oil_derate` (each ≤ 1).
- Ambient temperature and road speed (airflow) are shared inputs with the braking thermal model → one `AmbientTemp`
  and one speed source for the whole vehicle.

## Where it hooks in
- New `Overlay/.../Vehicle/ThermalSystem.{h,cpp}` (coolant + oil nodes, thermostat, viscosity curve, de-rate map).
- `Drivetrain` engine step gains **coolant/oil de-rate multipliers** and an **oil-viscosity parasitic-drag** term.
- Optionally couples to the deferred Fuel system (waste-heat term uses fuel_power directly once fuel exists).
- Validation `ThermalValidation.cpp`: warm-up curve, steady cruise temp, overheat de-rate under sustained load,
  thermostat hysteresis, cold-oil drag + cold-start RPM cap, energy-balance conservation.

## Explicitly out of scope for the first cut
Spatially-resolved (multi-zone) block temperature, boiling/pressure-cap dynamics, coolant phase change, per-cylinder
temperatures, intercooler thermal mass (belongs with forced-induction). Start with the lumped 2–3 node model.
