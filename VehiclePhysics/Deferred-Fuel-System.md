# Deferred — Fuel system (roadmap)

**Status: DEFERRED.** Not built yet; this is the plan for when it lands. GRIT ships the spec headers
`Components/Fuel.h` and `Components/FuelControlSystem.h` (and a `Battery.h` for the electric side); the physics is
inline in those headers. Nothing in the shipped Thread-M code depends on fuel — the engine currently burns an
abstract "throttle → torque" with no mass or energy accounting — so this is purely additive.

## Why it is deferred
The vehicle is **drivable-first**: engine, drivetrain, braking, ABS, supercharger and aero are all in and validated.
Fuel changes *how much torque the engine can make and how the car's mass evolves*, but it does not change the
solver's structure. It slots cleanly on top of the existing `Drivetrain` RK4 engine step later.

## Scope when built
1. **Per-fuel properties (data block).** Each fuel is data, not code:
   - `LowerHeatingValue` [MJ/kg] — energy released per kg burned (petrol ≈ 43, ethanol ≈ 27, methanol ≈ 20, diesel ≈ 43).
   - `Density` [kg/L] — to convert tank volume ↔ mass (petrol ≈ 0.745, ethanol ≈ 0.789, methanol ≈ 0.792).
   - `StoichiometricAFR` [-] — air:fuel mass ratio for complete combustion (petrol ≈ 14.7, ethanol ≈ 9.0, methanol ≈ 6.4).
   - `OctaneOrCetane`, `LatentHeatVaporisation` [kJ/kg] (charge-cooling → effective knock margin / power), `OxygenContent`.
2. **Custom fuels + mixing.** A blend is a mass-weighted combination of base fuels (e.g. E85 = 85 % ethanol / 15 % petrol).
   Mixed properties: LHV and density combine by mass fraction; AFR from the blended stoichiometry; charge-cooling adds.
   This is the "make your own fuel" capability — expose the base-fuel table + a blend recipe.
3. **Fuel-control unit (the metering brain).** Given engine air mass flow (from RPM × displacement × volumetric
   efficiency × boost density) and a **target AFR** (rich for power/cooling, lean for economy), compute injected fuel
   mass flow ṁ_fuel = ṁ_air / AFR_target. Power ceiling from fuel: P_fuel = ṁ_fuel × LHV × combustion_efficiency.
   The engine torque is then `min(mechanical/boost torque, fuel-limited torque)` — so leaning out or running dry
   *reduces* torque physically instead of by a flag.
4. **Tank mass coupling.** Tank mass = remaining volume × density; drains at ṁ_fuel; feeds back into
   `VehicleGeometry.Mass` and (later) CoM shift as the tank empties. Closes the loop with the mass/inertia block.
5. **Nitrous (chemical oxidiser injection).** N₂O decomposes above ~300 °C releasing O₂ → allows burning far more
   fuel in the same air. Model as a bonus oxygen mass flow while armed + throttle-above-threshold + RPM window:
   effective air flow += nitrous O₂ contribution, fuel-control adds matching fuel, torque ceiling jumps. Bottle
   mass drains like the fuel tank; add a heat term for the intake-charge cooling. "Wet" (fuel+N₂O) vs "dry" (N₂O only).

## Where it hooks in
- New `Overlay/.../Vehicle/FuelSystem.{h,cpp}` (fuel table + blend + control unit).
- `Drivetrain` engine step gains a **fuel-limited torque ceiling** term before the existing boost multiplier feeds RK4.
- `VehicleGeometry.Mass` becomes time-varying (tank + nitrous bottle mass).
- Validation suite `FuelValidation.cpp`: LHV/AFR/mixing arithmetic, lean-out torque drop, tank-empty cutoff,
  nitrous torque spike + bottle drain, mass-coupling conservation.

## Explicitly out of scope for the first cut
Detailed combustion chemistry, knock/detonation modelling, injector transient dynamics, evaporative losses,
temperature-dependent density. Add once the metering + energy accounting is proven.
