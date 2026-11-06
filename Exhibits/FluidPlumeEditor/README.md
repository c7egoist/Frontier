# Fluid / smoke / plume editor — 1:1 port

Source of truth: `Experimental/VehicleHmiPrototype/` (the exhibit editor).

| Exhibit | C++ |
|---|---|
| `Source/SmokeSequence.js` GasParameterCatalogue, ConstructGasParameters, MapPlumeSettings | `Frontier/Engine/VolumetricDynamics/GasParameters.*` |
| `Source/InspectorPages.js` GasPresets, BuildGas, ResolveHelland | same + `Frontier/Engine/Interface/FluidPlumeEditor.*` |
| `Source/EditorShell.js` outliner Select("gas") | `FluidPlumeEditor::Select` / `SelectByQuery("smoke"\|"fluid"\|"plume")` |
| `Source/PlumeSpace.js` grades, residency, EncodeRecord | `PlumeSpace` |
| `Source/PlumeSourceProjection.js` + `ResolveTestPlume` | `PlumeSourceProjection` |
| `Shader/Plume*.wgsl` | copied to `Frontier/Engine/VolumetricDynamics/Shaders/` and executed as CPU lattices in `PlumeKernels.cpp` |
| SDF obstruction `ResolveSolid` / `SampleSceneDistance` | `SceneDistanceField` (course plane ∪ occupant boxes) |

Click **Smoke & fire**, **Fluid**, or **Plume** in the outliner (or press G in EverestWindow, then click the row). The inspector is Domain / Source / Simulation / Appearance / Fire / Presets from BuildGas.

```sh
cmake -S Frontier -B /tmp/frontier-build -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/frontier-build --config Release
/tmp/frontier-build/PlumeParity
/tmp/frontier-build/FluidPlumeEditorCapture \
    --editor Exhibits/FluidPlumeEditor/EditorGasSelected.ppm \
    --fire   Exhibits/FluidPlumeEditor/TestFirePlume.ppm \
    --smoke  Exhibits/FluidPlumeEditor/TestSmokePlume.ppm
# PNG copies of those captures: EditorGasSelected.png, TestFirePlume.png, TestSmokePlume.png
```

GLFW: `EverestWindow`, then **G** opens the editor. **F** cycles Off / Smoke plume / Fire. Click outliner rows and sliders.

The WGSL files are the GPU programs. This Linux slice runs the same arithmetic on CPU lattices (Low grade) so the editor and SDF interaction can be captured without a WebGPU device.
