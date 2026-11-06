# Plume shaders — copied 1:1 from Experimental/VehicleHmiPrototype/Shader

Do not restyle the math. Host recording order is PlumeSpace.js RecordTransport / RecordMarch:

1. AdvectVelocity
2. ResolveCurl
3. ConfineVorticity
4. ResolveDivergence
5. RelaxPressure × PressureSweeps
6. ProjectVelocity
7. AdvectThermo
8. ResolveSunTransmittance
9. MarchPlume
