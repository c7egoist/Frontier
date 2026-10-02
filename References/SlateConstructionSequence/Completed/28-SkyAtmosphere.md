# 28 — SkyAtmosphere

Sky radiance is produced by precomputed lookups following Hillaire's 2020 formulation. Three resident tables
totalling 298 KiB replace per-pixel ray marching through the atmosphere, and they are rebuilt only when the
parameters that define them change — which, for a fixed planet and a slowly moving sun, is rarely.

`28` also supplies the ambient term `18` depends on. That is not a side effect: with no global illumination in
Slate, sky-view radiance is the engine's only source of environmental light, and it is substitution point one of
the four declared in `00` §5.1.

## Position In The Sequence

| Field       | Value                                                                       |
|-------------|------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                           |
| Layer       | `Layer4_Compute`                                                             |
| Upstream    | `02` (`QuadratureIntegrator`, `SpectralProjection`), `06`, `08`              |
| Downstream  | `18` reads sky-view for the ambient term; `30` reads it for reflection fallback |
| Unblocks    | Sky radiance, and every ambient term in the engine                           |

## 1. The Resident Surfaces

⚠️ `Table` is banned by `00` §8. These are precomputed lookup surfaces, and `Surface` is what they are — sampled
by coordinate, resident on the device, rebuilt on a declared condition.

| Surface                | Format  | Extent    | Bytes | Parameterised by           |
|------------------------|---------|-----------|-------|-----------------------------|
| `TransmittanceSurface` | RGBA16F | 256 × 64  | 128 K | Altitude, sun zenith angle |
| `MultiScatterSurface`  | RGBA16F | 32 × 32   |   8 K | Altitude, sun zenith angle |
| `SkyViewSurface`       | RGBA16F | 192 × 108 | 162 K | View azimuth, view zenith  |

298 KiB resident in total (128 + 8 + 162). Recorded as `00` §10 conflict 42. All three are Tier D — perceptual output, no numeric guarantee, half precision correct
by definition rather than by concession.

## 2. Construction Order

① `TransmittanceSurface` — integrate extinction along the path to the atmosphere boundary. Depends on the medium
   parameters only.
② `MultiScatterSurface` — integrate multiple-scattering contribution, reading ①. Second and higher orders are
   approximated as isotropic, which is the approximation that makes the surface this small.
③ `SkyViewSurface` — march the view ray, reading ① and ②. Depends additionally on the sun direction and the
   camera altitude.

Strictly ordered; each reads only the tables before it.

## 3. Medium

Three components, each with its own density profile and scattering behaviour.

| Component | Density profile        | Scattering                        |
|-----------|------------------------|------------------------------------|
| Rayleigh  | Exponential with scale height | Wavelength-dependent, isotropic phase |
| Mie       | Exponential with scale height | Wavelength-neutral, forward-biased phase |
| Ozone     | Tent, centred at altitude | Absorption only, no scattering  |

Ozone absorbs without scattering. It is what produces the blue of twilight rather than the grey the other two
components alone give, and omitting it is the most common reason an atmosphere implementation looks wrong only at
low sun angles.

Spectral quantities are projected to tristimulus through `SpectralProjection` from `02`, not by sampling three
fixed wavelengths.

## 4. Rebuild Conditions

| Surface                | Rebuilt when                                        | Typical frequency |
|------------------------|-----------------------------------------------------|--------------------|
| `TransmittanceSurface` | Medium parameters change                            | Almost never      |
| `MultiScatterSurface`  | Medium parameters change                            | Almost never      |
| `SkyViewSurface`       | Sun direction or camera altitude changes materially | Occasionally      |

"Materially" is a declared threshold, not a strict inequality. Rebuilding `SkyViewSurface` on any camera movement
at all makes the surface an expensive way to compute what it was meant to precompute.

🔴 `28` is conditional in `08` §3. When nothing changed, it records nothing.

## 5. What `18` Reads

| Consumer                   | Reads                                              |
|----------------------------|-----------------------------------------------------|
| Diffuse ambient (`18` §5)  | `SkyViewSurface` convolved against the cosine lobe |
| Specular ambient (`18` §5) | `SkyViewSurface` at the reflection direction       |
| Reflection fallback (`30`) | `SkyViewSurface` beyond the screen edge            |
| Aerial perspective         | `TransmittanceSurface` along the view ray            |

The cosine convolution is derived from `SkyViewSurface` when it rebuilds, not per pixel.

⚠️ The source research describes an irradiance product "for probes". No probe population exists in Slate. The
product is retained and retargeted to the diffuse ambient above — substitution point three from `00` §5.1.

## 6. Aerial Perspective

Distant surfaces are attenuated and tinted by the medium between them and the camera, read from
`TransmittanceSurface` along the view ray. This applies to scene surfaces in `18`, not only to the sky, and without
it distant geometry reads as unnaturally crisp against a correct sky.

## 7. Gates

- **Gate:** All three tables are resident, at the declared extents, totalling 298 KiB.
- **Gate:** Construction order is ① ② ③ and no surface reads one after it.
- **Gate:** Ozone is present and absorbs without scattering.
- **Gate:** Spectral projection goes through `02`, not fixed wavelength sampling.
- **Gate:** Resident surfaces rebuild only on their declared conditions, against a threshold.
- **Gate:** No identifier here spells `Table`; the three resident surfaces are `Surface`.
- **Gate:** The cosine convolution is derived on rebuild, not per pixel.
- **Gate:** With atmosphere disabled, `18` falls back to the constant floor and `30` to the same.

## 8. Open

| Open question                                                | Blocks                    |
|----------------------------------------------------------------|----------------------------|
| The materiality threshold for `SkyViewSurface` rebuild         | Tuning; measure            |
| Whether aerial perspective needs its own resident product      | `18` cost only             |
| Whether the medium is artist-editable or fixed at Earth values | `10` format, not `28`      |
| Sun angular diameter, and whether a solar disc is drawn        | Nothing structural         |
