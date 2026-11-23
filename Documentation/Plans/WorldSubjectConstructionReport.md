# World subject construction — Outliner Construct menu additions

> **Status:** 🟢 Implemented (`2026-11-23`) for the five requested world subjects (`Atmosphere`, `Sun`, `Moons`, `Stars`, `Clouds`)
> plus the sibling `Local Cloud` volume row. Native build/CTest and HTML screenshot capture are **not** verified in this
> sandbox (no Vulkan/X11 runtime and no browser binary available); see §5.

---

## 1. What this slice delivers

| Request | Implementation |
| :--- | :--- |
| Add objects to the scene from the Construct menu | Five world-subject presets (`Add Atmosphere`, `Add Sun`, `Add Moons`, `Add Stars`, `Add Clouds`, plus `Add Local Cloud`) are configured on the Outliner Construct sheet and are also accepted as viewport canvas drops |
| “Registered to the world and added” | `OutlinerPanel` rows carry a new `OutlinerWorldSubject` identity; `SynchronizeShowcaseGallerySceneLive` adopts the row into `WorldSceneSpecification` (`Atmosphere.Medium`, `Solar`, `Moons[0]`, `Stars`, `Clouds`, `LocalCloud`) and activates the subsystem |
| One default folder for all of them | Every constructed world subject is filed into the `World` collection folder; the folder is created on demand, so removing it and constructing again rebuilds a single folder |
| Remove cleanly | Deleting the row (or the whole `World` folder) retires the subsystem: solar irradiance → `0`, `SolarEnabled` / `Moons[0].Visible` / `StarfieldEnabled` / `CloudsEnabled` / `LocalEnabled` / `Medium.AtmosphereEnabled` → `false`, the token is released, and the authored-presence latch blocks resurrection on the next re-registration |
| Single instance per sky subsystem | Constructing a subject that is already registered folds the duplicate row back into the authoritative row and reselects it instead of creating a second, orphaned row |
| Right-click row sheet in HTML shape | The row directive sheet now matches `Editor.jsx` `RowMenu` order: title caption, `Rename`, `Hide`/`Show`, `Inspect in workspace`, `Enable fracture` (geometry rows), `Duplicate`, `Remove from scene`. Directives with no ported native owner (`Rename`, fracture) stay visible but greyed via the new `DropdownDirectiveEntry.Disabled` field |

---

## 2. Files changed

| File | Change |
| :--- | :--- |
| `Engine/Components/Panes/OutlinerPanel.h` | New `OutlinerWorldSubject` enumeration; `Subject` on `OutlinerConstructTemplate` and `OutlinerRecordEntry`; `Permanent` row latch (Editor Camera) |
| `Engine/Components/Panes/OutlinerPanel.cpp` | Construct presets propagate `Subject`; right-click sheet rebuilt to the HTML row-directive order with greyed unsupported rows and an explicit `OutlinerRowDirective` routing table |
| `Engine/Components/Controls/DropdownSelector.h` · `.cpp` | `DropdownDirectiveEntry.Disabled`: row renders faint, ignores pointer contact, keeps sheet height |
| `Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.h` | `AtmosphereToken`; `WorldSubjectPresent` authored-presence array (ordinal = `OutlinerWorldSubject`) |
| `Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp` | World-subject routing helpers (`AccessWorldSubjectToken`, `AssignWorldSubjectPresence`, `PopulateWorldSubjectRow`, `EnsureWorldFolderToken`, `AdoptConstructedWorldSubjects`, `RetireDetachedWorldSubjects`); registration gated on authored presence; live sync adopts/rehomes/retires rows; atmosphere row drives `Medium.AtmosphereEnabled` |
| `Engine/Lifecycle/EditorLifecycle.cpp` | Construct presets for the six world subjects; canvas-drop callback routes world subjects to row construction instead of spawning geometry; gizmo/framing ignores world-subject rows |
| `Exhibits/WorldSubjectConstructionValidation.cpp` · `CMakeLists.txt` | New validation exhibit (`WorldSubjectConstructionValidation`) registered next to `WorkspacePanesValidation` |

---

## 3. Behaviour contract

| Case | Result |
| :--- | :--- |
| `Add Sun` with no Sun row | New row appears inside `World`, `Atmosphere.Solar.SolarEnabled = true`, `Sun.SolarIrradiance = {5.40, 5.10, 4.65}` |
| `Add Sun` while the Sun row exists | No second row; the duplicate is folded away and the registered row is selected |
| Delete `Sun` row | Row gone, `SolarEnabled = false`, irradiance `0`, token released, `WorldSubjectPresent[Sun] = false` |
| Delete `World` folder | All nested world subjects retire in one pass; folder token released |
| Construct after folder removal | One `World` folder is rebuilt and receives the new row |
| `Hide` on a world row | Subsystem disabled; row and token survive, `Show` restores it |
| Delete `Showcase` / geometry rows | Unchanged legacy path (geometry rows disable by zero scale) |
| Host template list missing camera/light presets | Clamped template lookup must never stamp a world subject onto foreign rows; camera, LTC light, and constructed geometry rows are forced back to `OutlinerWorldSubject::None` |
| Right-click the Editor Camera | `Rename`, `Hide`/`Show`, and `Remove from scene` are greyed (`Permanent`), matching the HTML “editor camera cannot be deleted” rule |
| Right-click a folder | Same HTML rows; folder removal stays available because the HTML demo never deletes its collections (documented superset) |

---

## 4. HTML reference mapping

| HTML source | Native equivalent |
| :--- | :--- |
| `Experimental/ProjectZeroEditor/Editor.jsx` `InitialRows` (`world` folder: `atmosphere`, `sun`, `moon`, `stars`, `clouds`, `local-cloud`) | `RegisterShowcaseGalleryInOutliner` world rows, now presence-gated and populated by one helper |
| `Editor.jsx` `RowMenu` → `Menu.Type === "Row"` block (`Rename F2`, `Hide`/`Show`, `Inspect in workspace`, fracture toggle, `Duplicate`, `Remove from HTML scene`, editor-camera guards) | `OutlinerPanel::Render` right-click directive sheet |
| `ConstructPanel.jsx` catalogue (`Atmosphere`, `Sun`, `Moons`, `Stars`, `Clouds`) | `EditorLifecycle::Initialize` construct presets with `OutlinerWorldSubject` |

---

## 5. Verification performed

| Check | Command / evidence | Result |
| :--- | :--- | :--- |
| Editor-profile syntax + warnings | `g++ -std=c++20 -fsyntax-only -DFRONTIER_PROFILE_EDITOR=1 -Wall -Wextra …` on `OutlinerPanel.cpp`, `DropdownSelector.cpp`, `ShowcaseGalleryScene.cpp`, `EditorLifecycle.cpp` | 🟢 Clean |
| Dependent translation units | Same flags across all 20 sources including `OutlinerPanel.h` / `DropdownSelector.h` (only pre-existing `FRONTIER_REPO_ROOT_DIR` CMake macros reported) | 🟢 Clean |
| Functional behaviour | `Exhibits/WorldSubjectConstructionValidation.cpp` compiled against the engine sources and executed (imgui + toml++ + Vulkan headers linked from pinned upstream checkouts) | 🟢 `[WorldSubjectConstructionValidation] Construct, register, retire, and rebuild validations passed for 5 world subjects.` |
| Tree shape | Instrumented run of `RegisterShowcaseGalleryInOutliner` → delete `Sun` → `Add Sun` → live sync | 🟢 `World(4)` keeps `Atmosphere(5)`, `Moon(7)`, `Stars(8)`, `Volumetric Clouds(9)`, `Local Cloud(10)`; re-added `Sun(11)` is filed under `World(4)`; `Editor Camera(3)` untouched with `Subject = None`; hiding the `World` folder drops `Atmosphere.Solar.SolarEnabled` to `false` and showing restores it |
| Vulkan/X11 build, CTest, viewport capture | Not run — this sandbox has no Vulkan/GLFW runtime and no browser binary | 🔴 Outstanding |

---

## 6. Remaining gaps (explicit)

1. **Construct modal fidelity.** The HTML `ConstructPanel.jsx` is a modal with a category rail (`All`, `Environment`, `Weather`, `Cameras`, `Geometry`, `Lighting`), search field, entity matrix, and a properties step. The native sheet is still the flat directive list; only the world-subject entries were added.
2. **Row icons.** HTML rows use per-subject SVG icons (`sun`, `moon`, `outliner-stars`, `clouds`, `sky-scattering`). Native rows still render `ConstructSlotCategory::LayerGroup`.
3. **Rename / fracture.** Both appear greyed; no native rename editing or fracture toggle is wired to the sheet.
4. **Row ordering.** Constructed rows append after `Local Cloud` inside `World` instead of the canonical HTML order (`Atmosphere`, `Sun`, `Moons`, `Stars`, `Clouds`, `Local Cloud`).
5. **Visual evidence.** Per `ExperimentalEditorUiPortPlan.md` §1, live HTML screenshots are the reference baseline; they could not be captured here, so no pixel comparison exists yet.
