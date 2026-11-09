# ControlVehicle Blueprint Editor

A standalone browser editor, separate from the Frontier editor UI. The workspace follows a visual Blueprint workflow: a Vehicle HMI asset/component tree, an orbitable viewport, a draggable physics graph, curve authoring, and a categorized details panel.

## Launch

```bash
python3 "Experimental Remastered/AssetInspector/Serve.py"
# opens at http://localhost:8086/ (redirects to this editor)
```

The server is bound to `0.0.0.0` for preview environments. The editor can also be opened directly at
`Experimental Remastered/AssetInspector/index.html` through another static server.

## The displayed vehicle

The viewport loads the authored **ControlVehicle** body, tyre, and rim FCT1 archives from
`Experimental/VehicleProvingGrounds/Archive/` — the same mesh assets used by Vehicle HMI. It reads their facet streams
and material-family IDs directly; it does not substitute a drawn illustration or a proxy vehicle. Orbit with left-drag,
pan with right-drag, scroll to zoom, or choose a side/top camera. Click a component in the viewport or hierarchy to
select it.

## Editor features

- Component hierarchy and Blueprint-style event/function graph; graph nodes can be rearranged and wires follow them.
- Vehicle mass, centre of mass, aerodynamics, suspension, engine, turbo, transmission, tyre thermal, pressure, wear,
  and MF6.1 Pacejka sliders, initialized from the Vehicle Proving Grounds authored specification.
- Editable engine torque, turbo multiplier, and lateral Pacejka curves (drag knots, double-click to add).
- Thermal, contact-patch, slip, suspension, and surface-normal viewport channels.
- Compile validation, browser-local settings, and Blueprint JSON / curve CSV export.

Run the static verification with:

```bash
node "Experimental Remastered/AssetInspector/AssetInspectorValidation.mjs"
```
