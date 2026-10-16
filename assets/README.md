# Project-Drive ControlVehicle geometry

These three `FCT1` facet streams are the same ControlVehicle body, tyre and rim geometry used by Project-Drive. They were copied from the `Exhibits/IlluminationHost/Archive` directory on the linked Slate branch (`arena/c6cba543-slate`) so the renderer can load the authored triangles directly instead of substituting a proxy car.

The archive codec and Slate exhibit identify their source arrays as `ControlVehicleStructure.inl`, `ControlVehicleTyreMesh.inl`, `ControlWheelStructure.inl`, and `ControlVehicleRimMesh.inl`. This project keeps the vehicle in its authored +X-forward, +Y-left, +Z-up frame, with the same centre-of-mass rebase, axle positions, tyre radius, rim scale, material-family IDs, and mirrored right-side wheel winding.

Source project: [SultanAladin/Slate, arena/c6cba543-slate](https://github.com/SultanAladin/Slate/tree/arena%2Fc6cba543-slate)

The `.facet` files use the small `FCT1` stream format described in `src/scene.js`; they contain triangle geometry, per-facet material families, and (for tyre/rim) corner normals. No SDF or distance-field data is used by this renderer.
