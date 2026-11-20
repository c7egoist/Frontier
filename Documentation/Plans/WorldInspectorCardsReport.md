# 🌤️ World Inspector: Infographic Environment + Object Cards

> **Short answer.** `Experimental/WorldInspector/` (port **8103**) provides 14 Project Zero inspector cards, shown **without a viewport**, in the same way as the Texture Studio card pages. The cards are:
>
> - **Sky:** Sun, Atmosphere, Volumetric Clouds, Moon, Stars.
> - **Lens and camera:** Lens Flare, Exposure, Camera.
> - **Weather:** Wind, Fog, Weather (precipitation and rainbow).
> - **Scene:** Object, Light, Group.
>
> Each card leads with a graphic computed by World Mirror's own solvers. The controls edit the World Mirror records, and those records go through `CompileLiveGtxScene`, the mapping the renderer uses.

---

## 1. 📊 What each card shows

| Card | Hero | Tiles | Interaction on the graphic |
| :--- | :--- | :--- | :--- |
| Sun | Day elevation curve (`Solar.mjs`, 10-minute steps) over twilight bands, rise / set / noon marks, sky-phase strip | Elevation (air mass), azimuth, irradiance + CCT | Drag the chart or strip → Local Hours |
| Atmosphere | Sky-View LUT fisheye (`BuildSkyViewLut` + `SampleSkyViewInto`, ACES, 1/2.2) · density profile | Zenith CCT, R/G/B sun transmittance, air mass | — |
| Clouds | Dome through `EvalVolumetricCloudsCpu` · layer cross-section using the march's bottom / top ramps | Okta + METAR, layer band, wind drift | — |
| Moon | Preset texture (`PhotometricEditor/Textures/Moons`) lit by the renderer's phase vector · compass | Phase, illumination, apparent size | Click a phase glyph |
| Stars | 30° zenith window, 4×4 max-sampled star evaluator | Sky class, cell fill, celestial rotation | Drag the magnitude scale |
| Lens Flare | Ghost axis, RGB-split ghosts, halo ring, starburst, anamorphic streak, blade polygon | Elements, blades → star points, dispersion | Drag the light source (Preview X / Y) |
| Exposure | Tone curve from the renderer display transform · EV ladder | Gain = render gain × 2^EV, mid-grey output, display latitude | Drag the ladder → EV |
| Camera | FOV wedge + DOF band on a log distance axis | HFOV (renderer VFOV), in-focus range, hyperfocal | f-stop strip |
| Wind | Wind rose + shear / veer profile | Beaufort force, bearing, gusts, cloud drift | Drag the rose → Bearing |
| Fog | Height-fog density with falloff mark | Koschmieder visibility strip + class | — |
| Weather | Rainbow geometry from the live sun elevation | Rate class, type, bow height | — |
| Object | Material ball lit by the compiled sun + sky · isometric transform | Albedo plausibility band, F0, gloss, PBR strip | — |
| Light | Area-light footprint | On-axis floor illuminance (exact rectangle formula), lumens, luminance | — |
| Group | Composition bar | Members, visible count (`Hidden`), tint | Eye toggle per member |

## 2. ✅ Real state, not a mock

- **Source data.** The document is a deep clone of `ShowcaseInitialRows` / `ShowcaseInitialValues`. Field metadata comes from `NativePanels.json`.
- **Side effects.** `Edit()` reproduces the side effects of World Mirror's `Inspectors.jsx`, including the clock re-solving the sun direction. Without that re-solve, the fixed `Direction` in the showcase record would override any clock edit (suite 9 is the negative control for this).
- **Panels the showcase lacks.** Wind, post and the other missing panels get rows. The wind record is seeded with the compile's no-wind drift, so the unedited document compiles **identically** to the showcase (suite 1).
- **Footer labels.** Every card footer states whether its controls reach the **Renderer** (the browser compile) or only the **Record** (World Mirror record / engine bridge). Lens flare, fog, weather, and the tone and lens part of post fall in the second group.
- **Cloud types.** The browser cloud march clamps the cloud type to 4 profiles. The Clouds card says so when Altostratus or Cirrus is picked.

## 3. 🧪 Verification

`JSDOM_DIR=/tmp/smoke node Experimental/WorldInspector/WorldInspectorValidation.mjs` → **ALL 10 WORLD INSPECTOR SUITES PASSED** (111 checks).

**Compile and formulas:**

- Showcase compile parity.
- Sun clock, colour, disc and power.
- Atmosphere, clouds, wind drift, moon, stars, EV and camera.
- Object position, material channels, type presets, light lumens / width / power, group and member visibility, undo.
- Reference formulas.

**Card output:**

- Clean markup at 5 hours, for every object and group.
- Every bind is a catalogue field.
- Negative control.

**jsdom UI drive:**

- Nav, a mid-drag slider (the control is not replaced), the solar-chart drag (75 % → 18:00) and the wind-rose drag (east → 90° with the clouds drifting east).
- Dropdowns, switches, phase glyphs, the f-stop strip and an object hex colour.
- Undo / redo, export, persistence and card reset.

**Lint and visuals:**

- ESLint reports 0 errors.
- `Scripts/RenderGraphicsSheet.mjs` renders every graphic and canvas to PNG headlessly. Because the sandbox has no browser, this sheet was used for the visual checks (`Screenshots/graphics-day.png`, `graphics-night.png`).

## 4. 🔭 Follow-ups

- Real-browser screenshot of the full grid. Chromium in the sandbox fails with a missing `libnspr4`.
- Wire the Record-only panels (flare, fog, weather) into the browser compile once the GTX tracer grows those passes.
