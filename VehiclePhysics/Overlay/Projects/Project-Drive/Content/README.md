# Project-Drive Content

Runtime-generated and user-editable content for the standalone Project-Drive app.

- `Scenes/DriveCourse.gltf` — the drive course + car. Generated on first launch (flat plane + grid/checker + ramp +
  speed bumps + the ControlVehicle body and four procedural wheels). Regenerated automatically when
  `DriveSceneStructure`'s revision counter changes, or delete the file to force a rebuild.
- `Frontier.config.toml` — written by the editor when you change render/appearance/input settings (Save). Absent by
  default; the app uses built-in defaults until you save. No engine-tree edit is needed to create it.
