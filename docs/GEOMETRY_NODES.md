# Geometry Nodes Blueprint — How the Generator Works

This mirrors Blender's Geometry Nodes workflow, but implemented procedurally in JS + bmesh.

## Node Graph (Conceptual)

```
[ Seed ] → [ Building Core ]
    ↓
[ Structure Boolean Stack ]
  - Boolean: Floor 1 (always)
  - Boolean: Floor 2,3,4 (add/remove)
  - Float: Width, Depth, FloorHeight
  - Integer: PillarDensity
  - Boolean: Engawa, Genkan, Setback
    ↓
[ Roof System ] — HIGHLIGHT NODE (Red)
  - Enum: RoofType (Irimoya, Kirizuma, Yosemune, Karahafu, Noki-Karahafu, Pagoda)
  - Float: RoofHeight, RoofCurve (Sori 反り), Overhang, RidgeHeight
  - Enum: TileType (Kawara types, Mokume, Copper, Ceramic)
  - Float: TileScale
  - Color: RoofColor
  - Boolean: 3D Tiles, Onigawara 鬼瓦, Ridge Ornament, Kawara Detail
    ↓
[ Materials ]
  - Enum: WoodType (Hinoki, Sugi, Yakisugi, Keyaki, Bengara, Charcoal)
  - Color: WoodColor, Age
  - Enum: WallType (Shikkui, Yakisugi, Shitami, Namako, Modern)
  - Color: WallColor, TexScale
    ↓
[ Lighting ]
  - Enum: LightType (Chochin, Andon, BareBulb, Neon, ModernMix, HiddenLED)
  - Color, Intensity, Flicker
  - Boolean: Chochin, Andon, StreetLight, Interior
  - Integer: ChochinCount
    ↓
[ Infra — Modernity Mix ]
  - Boolean: ElectricPole 電柱, PhoneLines 電線, Aircon 室外機, MeterBox, Gutter
  - Float: Modernity 0=ancient 1=modern — blends details
    ↓
[ Signage — Custom Text ]
  - Boolean: Kanban 看板
  - String: KanbanText (JP) + KanbanTextEn
  - Enum: KanbanStyle (Vertical, Horizontal, MetalNeon, Paper)
  - Boolean: Noren 暖簾 + String: NorenText
  - Boolean: Posters + TextArea: PosterTexts (one per line)
  - Boolean: SmallSigns
    ↓
[ Props — Asian Furniture ]
  - Boolean: Furniture, ChairsTables, Zabuton, Plants, Tansu, Kitchen
  - Float: FurnitureDensity
    ↓
[ OUTPUT ] → Mesh + Lights + Export GLTF
```

## Roof Sori — Critical Formula

Sori 反り is what makes Japanese roofs authentic. Implementation:

```js
// For each roof vertex
let nx = abs(v.x) / (width/2+overhang)
let nz = abs(v.z) / (depth/2+overhang)
let corner = nx * nz
let edge = max(nx,nz)
let lift = (corner*0.8 + edge*0.2) * curve * 0.9
lift = pow(lift,0.9) * height *0.35
if (!insideFootprint) v.y += lift
if (nx>0.85 && nz>0.85) {
  v.y += curve*0.6
  v.x *= 1+curve*0.04
  v.z *= 1+curve*0.04
}
```

- Karahafu: additional S-curve using sin() for cusped gable
- Irimoya: combine Yosemune (lower) + Kirizuma (upper) + triangular hafu board
- Pagoda: loop tiers with scaling 0.75 each level

## Material Textures — Procedural Canvas

No image assets:
- Wood: vertical grain lines + age darkening, yakisugi adds burnt spots
- Wall Shikkui: 8000 random specks, Namako: tile grid + circle, Shitami: horizontal boards
- Kawara: rounded rect tiles with gradient + highlight, offset every row
- Copper: patina speckles + seams
- Kanban: wood grain + Japanese vertical text layout
- Noren: fabric + clearRect slits

## Booleans = Geometry Nodes Switches

Every checkbox is a Switch node in Blender terms:
- If true → Instance geometry, else skip
- Example: HasEngawa → adds box + pillars at front
- HasElectricPole → cylinder + cross arms + tube wires with CatmullRom sag
- HasChochin → sphere + point light + wire

## Blender Addon Translation

bmesh version mirrors same booleans but simplified:
- Pillars via box verts
- Roof via grid verts with sori
- Chochin via uv_sphere + emission material
- Kanban via cube + Text object

To expand to real Geometry Nodes:
1. Create NodeGroup "Frontier_Machiya"
2. Inputs: same as addon props (seed, width, roof_type etc.)
3. Inside: use Mesh Line for pillars, Instance on Points, etc.
4. Roof: use Grid + Set Position with Sori formula via Math nodes
5. Expose booleans as Switch nodes

This web version is the prototype — the Blender addon can be extended to generate actual Geometry Nodes modifier.
