# Component Viewer

A standalone HTML prototype for Frontier's revised asset workflow. It combines the Project Zero-style docked editor language with the Cluster LOD Studio workflow concepts (geometry preparation, UV review, SDF and icon artifacts) in two connected workspaces:

1. **Asset Prep** — import an arbitrary object, inspect its source, compile geometry, inspect UVs, and bake a thumbnail plus signed distance field.
2. **Component Viewer** — the renamed vehicle/component lab: preview the assembled asset alongside an Unreal Blueprint-inspired class graph and component inspector.

## Run

No install or build step is required:

```sh
python3 -m http.server 8080 --bind 0.0.0.0 -d Experimental/ComponentViewer
```

Open `http://localhost:8080`.

## Interactions

- **Import asset** accepts a local source name (FBX, OBJ, glTF, USD, STL, PLY) and places it into the demo pipeline.
- **Compile geometry** animates all compiler passes and updates the source artifact state.
- **UV workspace** opens a full-screen island layout review.
- **Bake icon & SDF** creates the two derived artifact states.
- **Component Viewer** exposes the component tree, assembly preview, class graph, and properties inspector.
- Shortcuts: `I` import, `G` compile, `U` UV workspace, `B` bake, `Cmd/Ctrl+S` save the component class.

This is intentionally a UI prototype: imported binary geometry is represented by its selected file metadata, while the ControlVehicle remains the illustrated demonstration asset.
