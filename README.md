# Frontier — procedural East Asian roofs

A procedural generator for Japanese / Chinese / Korean roofs, written for the web stack
(no Blender, no fixed assets): every roof is generated from parameters, and every roof is
**proved** by a geometry validator before you look at it.

The research that the numbers come from is in [`docs/ROOF_RESEARCH.md`](docs/ROOF_RESEARCH.md)
(typology, pitch rules 勾配/举架, the JIS tile catalogue with its laps, the 垂木→瓦桟→野地板
construction stack, and the 起翘/冲出 corner-sweep rules, with 34 sources).

## What is implemented

**16 roof forms** (`src/core/surface.js` → `FORM_TABLE`)

| Japanese | Chinese | Korean |
| --- | --- | --- |
| 切妻 kirizuma, 寄棟 yosemune, 入母屋 irimoya, 宝形 hougyou, 流れ nagare, 庇 hisashi | 悬山 xuanshan, 硬山 yingshan, 庑殿 wudian, 歇山 xieshan, 攒尖 cuanjian, 卷棚 juanpeng | 맞배 matbae, 우진각 ujingak, 팔작 paljak, 모임 moim |

Curvature is real geometry, not a texture: 照り (concave slope), 起翘 (corner lift) and 冲出
(corner push) fade out over the 隅棟 run, and 破風 (gable edges) stay straight through it.

**Tile catalogue** (`src/core/tiles.js`): 桟瓦 JIS 300×305, 64判/60判/53判 和瓦, 本瓦葺
(平瓦 + a 丸瓦 barrel over every seam), こけら葺, 檜皮葺, 茅葺, 金属瓦, 金属板瓦棒葺 — each
with its catalogued head/side lap; 調整瓦 are cut along the hip and verge diagonals, batches
are set out from the centre line (芯), eave rows get a nose lip, courses can carry 雪止め.

**Structure** (`src/core/frame.js`): 垂木 rafters (cut at the 隅棟 diagonal), 隅木 hip
rafters, 母屋 purlins, 棟木 ridge beam, 軒桁 eave beams all the way round, 小屋梁 + 束/真束
posts, 瓦桟 battens, ルーフィング underlayment and 野地板 sheathing as a real slab.

## Quick start

```bash
npm install                 # dev-only: three + vite for the viewer
node cli/report.mjs         # build + validate every preset, writes out/roof-report.json
node cli/report.mjs --only minka --obj
node tools/render.mjs       # offline PNG contact sheets into out/
node tools/serve.mjs        # then open http://localhost:5173/viewer/
```

The viewer (`viewer/`) imports `src/core/*` directly and rebuilds live: preset, roof type,
tile type, colours, overhangs, pitch, 起翘/冲出 and a layer-by-layer explode, so the
construction under the tiles can be inspected.

## Verification

`src/core/validate.js` runs ~19 assertions per roof — plan geometry (ridge level/parallel,
hips at 45°, hips on the eave corners, symmetry, ridge length), lap arithmetic (head and
side lap ≥ catalogue), **tile support mesh-to-mesh** (two-line support on the 瓦桟, the eave
nose carried by the 広小舞, nothing floating), **full coverage** (no bare patch of roof),
the **construction stack** (tile bed exactly 瓦桟+ルーフィング above the 野地板, measured
against the built mesh), coverage factor against the tile family's own theory, and frame
contact (rafts on 母屋, 軒桁 under the rafter ends, 真束 heads on the 棟木, layers ordered,
nothing poking through the tile bed). All ten presets pass every check.

## Status / next

Roofs are complete; the building body is a placeholder volume. Still to come: the rest of
the generator (floors, walls, fixtures, signage with user text, power/telephone poles) and
the roof forms `hisashi`, `kabutoyane`, `juu`, `zhongyan`.
