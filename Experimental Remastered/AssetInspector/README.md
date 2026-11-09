# Vehicle Lab

A standalone vehicle inspection studio using the same dark, rounded-panel, outliner-plus-inspector design language as the Particle and Photometric studios. The centerpiece is a real-time 3D render of the Vehicle HMI's authored **ControlVehicle**; the right inspector exposes its engineering parameters, and a compact response dock below the Stage edits the engine, turbo and tyre curves.

## Launch

```bash
python3 "Experimental Remastered/AssetInspector/Serve.py"
# http://localhost:8086/ redirects into Vehicle Lab
```

The preview server binds to `0.0.0.0`. Vehicle Lab is a separate standalone app; the Experimental Remastered hub link is only a launcher.

## ControlVehicle asset

The WebGL viewport loads the actual ControlVehicle body, tyre and rim FCT1 streams from `Experimental/VehicleProvingGrounds/Archive/`—the same authored mesh assets used by Vehicle HMI. The inspector decodes their facet/material-family data and renders the assembled car; there is no drawn vehicle illustration or substitute mesh. Orbit with left-drag, pan with right-drag, scroll to zoom, or use the Side and Top camera presets. Select a component from the Outliner or directly in the viewport.

## Inspector features

- Chassis, powertrain, suspension, tyres, thermal and MF6.1 Pacejka values in editable pill sliders.
- Draggable engine-torque, turbo-multiplier and lateral Pacejka response curves.
- Thermal, contact patch, slip-angle, suspension-travel and surface-normal Stage overlays.
- Local autosave and JSON setup / CSV curve export.

Run verification:

```bash
node "Experimental Remastered/AssetInspector/AssetInspectorValidation.mjs"
```
