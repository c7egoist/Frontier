# 18 — ReflectanceIntegrator

Shading is dispatched once per visible material over the compacted pixel list `16` produced, reconstructing every
attribute it needs from partition identity, triangle index and pixel position. Nothing is read from a wide
attribute target, because `16` deliberately did not write one.

This document carries the full material channel inventory and the shading models that consume it. It is also
where the absence of indirect lighting is made concrete rather than merely stated: the ambient term has a named
source, and that source is `28`.

## Position In The Sequence

| Field       | Value                                                                       |
|-------------|------------------------------------------------------------------------------|
| Unit        | `SlateCompute.lib`                                                           |
| Layer       | `Layer4_Compute`                                                             |
| Upstream    | `02` (quadrature, colour projection), `16` (identity, pixel lists), `20` (resident channels), `28` (sky), `38` (the stored basis), `42` (materials), `44` (illuminants), `56` (layer content), `60` (occlusion), `68` (the domain), `70` (analytic channels) |
| Downstream  | `62` and `30` amend `RadianceSurface`; `64` accumulates it; `66` projects it  |
| Unblocks    | A shaded image                                                               |

## 1. Attribute Reconstruction

For each pixel in a material's list: resolve the partition identity, fetch the triangle, reconstruct barycentric
coordinates from the pixel position, and interpolate position, orientation and texture coordinates.

Screen-space derivatives are computed **analytically** from the triangle's gradients, not from neighbouring pixel
differences. A material's pixel list is spatially scattered, so neighbouring lanes are not neighbouring pixels and
finite differencing across them produces texture filtering that is wrong precisely at material boundaries.

### 1.1 The tangent basis

Channels 5, 10 and 13 are declared in tangent space, so a tangent basis must exist before any of them can be read.
`38` §4 derives and **stores** it per vertex, with handedness, or retains the artist's imported one. This
document **interpolates** that stored basis across the triangle and re-orthonormalises it against the
interpolated perpendicular, per pixel.

🔴 The stored basis is derived from the **domain** parameterisation in `68`, which is what makes a perturbation
authored in `22` and one transferred in `24` agree. That derivation is `38`'s; the per-pixel interpolation is
this document's. A basis derived from an arbitrary orthonormalisation of the surface orientation does not agree
with either, and the disagreement appears as lighting that shifts when a surface is re-unwrapped.

⚠️ Conflict 27 named a single owner for what is two mechanisms, and `38` §4 and this section then each claimed
to be it. Storage and interpolation are different: handedness must be stored per vertex because a domain that
mirrors across a seam inverts it, and an imported basis must be retained rather than recomputed. Neither is
expressible per pixel. Conflict 27's ruling is amended and the split is recorded as `00` §10 conflict 39.

Where the domain is degenerate — a chart of zero area, a seam vertex — the basis is marked absent and the
perturbation channels are not sampled, exactly as §3's unread-channel rule already requires. An orthonormalised
substitute would be a fabricated value, which `24` §2 rejects for transfer and which is no better here.

## 2. Material Channels

Twenty distinct channels. Not every model consumes every channel; the model declares which it reads and the rest
are not sampled.

| # | Channel                  | Range      | Meaning                                        |
|---|--------------------------|------------|-------------------------------------------------|
| 1 | Base colour              | [0,1]³     | Diffuse albedo or metal reflectance at normal incidence |
| 2 | Metallic                 | [0,1]      | Interpolates dielectric toward conductor        |
| 3 | Roughness                | [0,1]      | Perceptual; squared to the distribution parameter |
| 4 | Reflectance              | [0,1]      | Dielectric normal-incidence reflectance         |
| 5 | Surface orientation      | unit       | Tangent-space perturbation                      |
| 6 | Ambient occlusion        | [0,1]      | Scalar occlusion — no bent orientation, see §7  |
| 7 | Emission                 | [0,∞)³     | Radiance emitted independent of incidence       |
| 8 | Opacity                  | [0,1]      | Coverage or transparency by model               |
| 9 | Anisotropy               | [-1,1]     | Distribution stretch along the tangent          |
| 10| Anisotropy direction     | unit       | Tangent-space direction of stretch              |
| 11| Clear coat               | [0,1]      | Strength of a second specular layer             |
| 12| Clear coat roughness     | [0,1]      | Roughness of that layer                         |
| 13| Clear coat orientation   | unit       | Independent orientation for the coat            |
| 14| Sheen colour             | [0,1]³     | Retro-reflective fibre response                 |
| 15| Sheen roughness          | [0,1]      | Width of the fibre lobe                         |
| 16| Subsurface colour        | [0,1]³     | Transmitted tint                                |
| 17| Subsurface thickness     | [0,∞)      | Path length driving transmission falloff        |
| 18| Transmission             | [0,1]      | Fraction refracted rather than reflected        |
| 19| Index of refraction      | [1,∞)      | Refractive index for transmission and Fresnel   |
| 20| Displacement             | ℝ          | Geometric offset along the orientation          |

## 3. Shading Models

| Model             | Channels consumed                            |
|-------------------|-----------------------------------------------|
| Standard          | 1–8                                           |
| Anisotropic       | Standard plus 9, 10                           |
| Clear coat        | Standard plus 11, 12, 13                      |
| Cloth             | 1, 3, 5, 6, 8, 14, 15                         |
| Subsurface        | Standard plus 16, 17                          |
| Transmissive      | Standard plus 18, 19                          |
| Emissive only     | 7, 8                                          |
| Unlit             | 1, 8                                          |

## 4. The Direct Term

- Microfacet distribution: GGX, with the perceptual roughness squared before use.
- Geometric attenuation: height-correlated Smith.
- Fresnel: Schlick, from channels 2 and 4.
- Diffuse: EON, which remains energy-correct at high roughness where Lambert does not.
- Multi-scatter compensation: applied from a precomputed directional-albedo lookup, because single-scatter GGX
  loses energy at high roughness and the loss reads as rough metal being too dark.

### 4.1 The directional-albedo lookup

One resident lookup, parameterised by view angle and roughness.

| Component | Contents                                                    |
|-----------|--------------------------------------------------------------|
| `.x`      | Scale term of the split-sum approximation                   |
| `.y`      | Single-scatter directional albedo — drives §4's compensation|
| `.z`      | Charlie directional albedo for the cloth model              |

## 5. The Ambient Term

🔴 There is no global illumination in Slate. The ambient term is not a placeholder for one — it has a defined
source and that source is complete.

| Source                | When                                    |
|-----------------------|------------------------------------------|
| Sky-view radiance from `28` | Atmosphere enabled                 |
| Constant floor        | Atmosphere disabled                      |

Sky-view radiance is convolved against the cosine lobe for the diffuse ambient and sampled at the reflection
direction for the specular ambient. Channel 6 attenuates both, as does `60`'s `OcclusionSurface` — the authored
occlusion and the resolved occlusion multiply rather than one superseding the other, because they describe
different scales: channel 6 is detail the topology does not carry, `60` is contact the topology does carry.

Beyond that there is no indirect light, and a material that appears to need some is lit incorrectly rather than
under-featured.

This is substitution point one of the four declared in `00` §5.1.

### 5.1 The unoccupied class

`16` §5.1 classifies pixels where no surface resolved as their own class, and `18` dispatches over it like any
other. That dispatch samples `SkyViewSurface` along the view direction, or the constant floor when the atmosphere
is disabled — the same two sources this section already declares.

🔴 The unoccupied dispatch reconstructs no attributes and reads no material. It samples one source and writes it.

⚠️ Without this class nothing in the entire schedule writes the background: every other dispatch is per material
over pixels that resolved to a surface, and an unoccupied pixel resolved to none. The image carries a hole exactly
where the sky belongs, and it carries whatever the cycle slot held previously.

## 6. Output

One target: `RadianceSurface`, RGBA16F, at Tier D. Half precision is correct here — perceptual output carries no
numeric guarantee, which is what Tier D means.

🔴 `18` **produces** `RadianceSurface` and writes its whole extent, counting the unoccupied class. `62` and `30`
amend it afterwards, in that order, as declared in `08` §2. Nothing here reads what was in the target before.

## 7. Occlusion

Channel 6 is scalar. The bent orientation the donor documents produce alongside it is **not** produced, because
its only consumer was indirect lighting. This is substitution point two from `00` §5.1: scalar occlusion
attenuates the ambient term, and nothing asks for a bent orientation.

`60`'s resolved occlusion is likewise scalar and likewise attenuates the ambient term only. Neither occlusion
source touches the direct term, where occlusion is already resolved by shadowing.

## 8. Where The Channel Values Come From

A channel value at a pixel is not read from one texture. It is the resolution of the material's declaration in
`42` against the occupant's layer sequence in `56`, at the domain position reconstructed in §1.

| Contributor        | Supplies                                                        |
|--------------------|------------------------------------------------------------------|
| `42`               | Which channels the material declares, and their constant values |
| `56`               | The ordered layer sequence overriding those constants           |
| `20`               | Resident texels for painted layers                              |
| `70`               | Resolution of analytic layers — placed content, tiling          |

🔴 `18` reads the **resolved** channel surface, never the layer sequence directly. Resolution happens in `20`'s
tile promotion, once per tile per level, not once per pixel per rotation. A shading dispatch that walked a layer
sequence would pay the sequence depth at every pixel of every rotation, and the artist's thirtieth layer would
cost as much as their first thirty combined.

## 9. Gates

- **Gate:** Shading dispatches once per visible material over `16`'s compacted list.
- **Gate:** Derivatives are analytic, never finite-differenced across lanes.
- **Gate:** No wide attribute target is read or written.
- **Gate:** The tangent basis derives from the domain parameterisation, and is absent where the domain is degenerate.
- **Gate:** Each model declares its channels; unread channels are not sampled.
- **Gate:** Multi-scatter compensation is applied wherever GGX is.
- **Gate:** The ambient term comes from `28` or the constant floor — nothing else.
- **Gate:** Both occlusion sources attenuate the ambient term only, and multiply.
- **Gate:** No bent orientation is produced or consumed.
- **Gate:** The unoccupied class is dispatched, so `RadianceSurface` is written at every pixel.
- **Gate:** No dispatch walks a layer sequence; channels are read resolved.
- **Gate:** Output is Tier D; no computation downstream claims better.

## 10. Open

🔴 The channel packing layout **does not exist in any source document**. The sources specify types and ranges —
reproduced in §2 — and no bit depths, no texture slot assignment, no packing order. It is not invented here.
Twenty channels do not fit a conventional slot count without packing decisions that change sampling cost, and
guessing them produces a layout that is expensive in a way nobody can attribute later.

| Open question                                                        | Blocks                        |
|------------------------------------------------------------------------|--------------------------------|
| 🔴 Channel bit depths and texture slot assignment                      | Implementation, not design     |
| Whether all eight models ship, or Standard and Cloth first             | Effort only                    |
| Whether displacement is applied geometrically or at reconstruction     | `16` partitioning if geometric |
| Constant-floor value when atmosphere is disabled                        | Nothing structural             |
