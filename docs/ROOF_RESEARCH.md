# East Asian Roof Systems — Research & Verification Notes

> **Purpose.** This is the research grounding for the `Frontier` procedural roof generator.
> Every dimension, ratio and construction rule implemented in `src/core/` is listed here with its source.
> Section 7 explains how the generator is *programmatically verified* (no floating parts, no gaps,
> correct tile laps) — this is the answer to "verify the roofs are correct, not floating".

---

## 1. Roof form taxonomy (the "type of Asian roof" option)

### 1.1 Japanese (和風 / wayō)

| Key implemented | Japanese | English | Geometry |
|---|---|---|---|
| `kirizuma` | 切妻 | gable roof | 2 slopes meeting at a ridge; triangular gable (妻/破風) at each ridge end |
| `yosemune` | 寄棟 (四つ屋根) | hipped roof | 4 slopes; trapezoid + triangle; 4 hip ridges (隅棟) rising from the 4 corners |
| `irimoya` | 入母屋 | hip-and-gable | hipped roof below, gable (moya) on top; the defining Japanese temple/high-status form |
| `hougyou` | 方形/宝形 | pyramidal | 4 (or n) slopes converging to a single apex (used for 宝形造 halls) |
| `kabutoyane` | 兜屋根 | hip roof with gablet | hip with a small gablet at the ridge for light/ventilation |
| `shed` | 片流れ | shed / lean-to | single slope (also 下屋/裳階 = skirt roof) |
| `nagare` | 流造 | nagare-zukuri | asymmetric gable: front slope extended far past the rear |
| `juu` | 重ね/重檐 | multi-tiered / double-eave | a second, lower roof ring wrapping the building (also 錣葺, 裳階) |

Sources: [Japanese House – basic elements](https://meguri-japan.com/en/knowledge/20210627_1697/),
[Kibitsu-zukuri (hiyoku irimoya)](https://en.wikipedia.org/wiki/Kibitsu-zukuri),
[Minka (roof shapes incl. hōgyō)](https://en.wikipedia.org/wiki/Minka),
[MARUEI KAWARA – product/dimension data](https://www.eishiro.co.jp/english/products/wakei/index.html),
[japandoraku – Japanese Roof Tiles](https://japandoraku.com/japanese-roof-tiles-%E6%97%A5%E6%9C%AC%E3%81%AE%E5%B1%8B%E6%A0%B9%E7%89%B9%E6%AE%8A%E7%93%A6/).

### 1.2 Chinese (官式)

| Key implemented | Chinese | English | Note |
|---|---|---|---|
| `xuanshan` | 悬山 | overhanging gable | gable roof whose surface overhangs the gable wall (barge boards 博风板) |
| `yingshan` | 硬山 | flush gable | roof flush with the gable wall |
| `wudian` | 庑殿 | hip | 1 main + 4 diagonal ridges; 2nd-highest rank |
| `xieshan` | 歇山 | hip-and-gable | 1 main + 4 垂脊 + 4 戗脊; most common high-rank form (Chinese origin of irimoya/paljak) |
| `cuanjian` | 攒尖 | pyramidal | single apex, square or polygonal |
| `juanpeng` | 卷棚 | round-ridge | no main ridge, front and back slopes meet in a smooth round |
| `zhongyan` | 重檐 | double-eave | the top rank (重檐庑殿 = Hall of Supreme Harmony) |

Rank order (low→high): 悬山 / 硬山 → 卷棚 → 攒尖 → 歇山 → 庑殿 → 重檐庑殿.
Sources: [Architectura Sinica – xieshan 歇山](https://architecturasinica.org/keyword/k000143),
[Buildings 15(14):2582 – concave roof shapes](https://www.mdpi.com/2075-5309/15/14/2582),
[Ancient Chinese architecture – roof hierarchy](https://raider.pressbooks.pub/chineseculture/chapter/1-architecture-in-ancient-china/).

### 1.3 Korean (한옥 hanok) — implemented for East-Asian coverage

| Key implemented | Korean | English | Note |
|---|---|---|---|
| `matbae` | 맞배지붕 | gable | no corner member (no 추녀) |
| `ujingak` | 우진각지붕 | hip | 4 slopes, ridge shorter than the building |
| `paljak` | 팔작지붕 | hip-and-gable | the dominant Joseon authoritative form |
| `moim` | 모임지붕 | pyramidal | converging on a near-square plan |

Extra Korean members modelled: 추녀 (chunyeo — the 45° corner rafter), 사래 (sarae — extension rafter above it,
lengthening the eaves), 활주 (hwalju — the post that stops the eave sagging).
Korean roofs are *more concave* than Japanese ones — modelled by increasing the curve exponent (see §4.4).
Sources: [East Asian hip-and-gable roof](https://en.wikipedia.org/wiki/East_Asian_hip-and-gable_roof),
[Buildings 14(1):277 – hanok roof types Moim/Ujingak/Paljak/Matbae](https://www.mdpi.com/2075-5309/14/1/277),
[Buildings 12(8):1090 – Korean roof curve & eaves space](https://www.mdpi.com/2075-5309/12/8/1090).

---

## 2. Pitch (勾配 / 举架)

### 2.1 Japanese `寸` pitch

Japanese pitch is written as *N寸* = **rise of N units per 10 units horizontal** (`rise/run = N/10`).

| 寸 | 4 | 5 | 6 | 7 | 8 | 10 |
|---|---|---|---|---|---|---|
| deg | 21.8° | 26.6° | 31.0° | 35.0° | 38.7° | 45.0° |
| slope factor (勾配係数, =secθ) | 1.077 | 1.118 | 1.166 | 1.221 | 1.281 | 1.414 |

* **Tile roofs require ≥ 4寸** (some makers state 3寸 as the absolute floor); 4–5.5寸 is the residential
  norm; 神社仏閣 (shrines/temples) run steeper at 6–10寸.
* **隅棟伸係数** (hip-ridge extension factor, used to compute true hip length from the plan run):
  4寸 = 1.470, 5寸 = 1.500, 6寸 = 1.535, 7寸 = 1.578.
* 垂木 (rafter) spacing: **455 mm** standard (303 mm for heavy tile/long eaves); rafters 45×60 mm.
* Tile roof dead load ≈ **56 kg/m²** (matches 20 pcs/m² × 2.8 kg).

Sources: [勾配換算 – standard pitch table](https://hayamihyou.net/slope/),
[屋根勾配とは](https://www.afgc.co.jp/knowledge/cate1/a36),
[垂木間隔 455mm](https://kakunishi.co.jp/blog/3061.html),
[鎬桟瓦 dimension table – 20 pcs/m², 56.0 kg/m²](http://shinogizan.com/size/).

### 2.2 Chinese 举折 jǔzhé (roof curvature by purlin placement)

1. **举屋 (raise)**: ridge height `H` measured from the eave purlin = **1/3 of the building depth** (殿堂)
   or **1/4** (厅堂/ordinary). Rule of thumb: overall roof pitch falls between **1:3 and 1:1.5**.
2. **折屋 (fold)**: project a straight line from eave purlin top to ridge purlin top.
   The top purlin (上平槫) is dropped **H/10** below that line; **each purlin below is dropped by half the
   previous drop** (1/10 → 1/20 → 1/40 …). The resulting polyline is the concave roof profile.
3. Rafters (椽) are then laid between purlins; the tiled surface follows that polyline.

Sources: [Architectura Sinica – jǔzhé 舉折](https://architecturasinica.org/keyword/k000223),
[Buildings 15(14):2582 §3.3](https://www.mdpi.com/2075-5309/15/14/2582).

### 2.3 Corner upturn 冲三翘四 (Chinese) / eave sweep (Japanese, Korean)

* **冲出 "chong san"** — the tip of the upper hip rafter (仔角梁) projects **3 rafter-diameters beyond**
  the principal flying-rafter (正身飞椽) heads, in horizontal projection.
* **起翘 "qiao si"** — the top face of that tip rises **4 rafter-diameters above** the top face of the
  principal flying-rafter heads.
* **撇半椽** — the head of 仔角梁 twists out by half a rafter diameter.
* The *mechanism* is the **生头木 / 枕头木** (triangular pad blocks on the purlins): successive corner
  rafters are progressively raised until they sit level with the hip rafter, which is why the eave line
  sweeps smoothly upward toward the corner rather than kinking.
* The corner region is built from: 老角梁 (lower hip rafter) + 仔角梁 (upper hip rafter) + 翼角椽
  (fanning corner rafters) + 翘飞椽 (flying rafters that twist and lengthen).
* Japanese eave "反り" (sori) is the same construction expressed with 隅木 + 茅負; Korean adds
  추녀 chunyeo / 사래 sarae / 활주 hwalju.

Sources: [怎样看懂古代建筑 – 翼角冲出与翘起](https://zhuanlan.zhihu.com/p/34276746),
[古建筑翼角——为什么起翘？如何起翘？](https://bbs.co188.com/thread-10371251-1-1.html),
[古典园林建筑构造 – "冲三…翘四"](https://max.book118.com/html/2019/0831/7152141061002052.shtm),
[Buildings 15(14):2582 §3.2](https://www.mdpi.com/2075-5309/15/14/2582),
[Buildings 12(8):1090 (Korean chunyeo/sarae/hwalju)](https://www.mdpi.com/2075-5309/12/8/1090).

---

## 3. Roof tiles 瓦 (kawara) — the "type of roof tile" option

### 3.1 Tile types (with real dimensions used by the generator)

| Key | Name | Geometry | Verified dimensions |
|---|---|---|---|
| `sangawara` | 桟瓦 (JIS) | J/S-profile: pan + interlocking roll rib | **300 × 305 mm** total, working **205 × 260 mm**, 2.8 kg/pc, 20 pcs/m², 56 kg/m² ① |
| `sangawara64` | 64判/60判/56判/53判 和瓦 | same family, other sizes | 64判 287×277 / 212×242; 60判 292×289 / 218×252; 56判 295×290 / 225×255; 53判 305×300 / 235×265 ① |
| `hongawara` | 本瓦葺 (平瓦 + 丸瓦) | flat pan tile **plus** separate inverted barrel tile over each joint — the temple/upper-class system | JIS-family 平瓦 ≈ 300 × 240; 丸瓦 ≈ 150–180 dia × 300 ② |
| `shingle` | 柿葺 / こけら葺 | thin wood shingles, staggered, ~90–150 mm exposure | Japanese trad.; used for shrines |
| `hiwadabuki` | 檜皮葺 | cypress bark, thick rounded courses | shrine-only |
| `thatch` | 茅葺 | very thick steep thatch (gasshō-zukuri) | steep, 45–60° |
| `metal` | 金属板/瓦棒 | ribbed metal sheet imitating 桟瓦 (kawara metal tile) | 290 × 295 sheet, effective 265 × 265, 14.29 pcs/m² ③ |
| `roman` | 洋瓦/roman tile | S-profile western tile on a Japanese building | for Taishō/Shōwa modern-mix |

① [鎬桟瓦 瓦割り表](http://shinogizan.com/size/) ② [Kawara anatomy](https://www.ntmeiningjia.com/news/industry-news/japanese-roof-tiles-where-craftsmanship-nature-and-symbolism-converge.html) ③ [Kawara metal tile datasheet](https://www.sangobuildroofing.com/kawara_metal_tile.html)

**Lap arithmetic (verified, and enforced by the validator):**
```
head lap  = totalLength  − workingLength = 300 − 205 = 95 mm   (31.7 % head lap)
side lap  = totalWidth   − workingWidth  = 305 − 260 = 45 mm   (14.8 % side lap)
coverage factor = (300×305)/(205×260) = 1.717  → a roof needs 1.72 m² of tile per 1 m² of surface
```
`noshigawara`(熨瓦) infill courses under the ridge cap and the exact same arithmetic are what make the
roof watertight: every course is lapped 95 mm by the course above it, and every tile is lapped 45 mm by
its neighbour along the eave.

### 3.2 Tile-fitting accessories (all modelled)

| Name | Role | Source |
|---|---|---|
| 瓦桟 *gasan* | tile batten, **15 × 30 mm**; the tile head hooks over it | ④ |
| 広小舞 *hikoma* | board at the eave edge under the tile nose (simplified 茅負); **h = 40 mm** with a 15×30 batten | ④ |
| 瓦の出 | tile nose overhang past 広小舞 = **60 mm** | ④ |
| 軒丸瓦 / 軒平瓦 | decorated eave-end tiles (巴/唐草 patterns) closing the lowest course | ⑤ |
| 面戸瓦 / 螻羽 | small closures that plug the open high end of each 桟瓦 | ⑤ |
| 冠瓦 *kangawara* + 熨瓦 *noshigawara* | ridge cap over stacked infill courses — this mass is also what holds the roof down in typhoons | ⑤ |
| 鬼瓦 *onigawara* | demon-face end tile, **≈ 280 × 275 × 160 mm**, seals the ridge ends | ⑥ |
| 鴟尾 *shibi* / 鯱 *shachihoko* | ornamental ridge-end forms (temples / castles) | ⑤ |
| 袖瓦 / 角瓦 | verge (gable-edge) tiles | ⑦ |
| 隅棟瓦 / 廻り隅瓦 | hip-ridge tiles + the special corner pieces per pitch | ⑧ |
| 谷瓦 | valley tiles where two slopes meet | ⑨ |
| 雪止め瓦 | snow-stopping tiles (snow-country variants) | ⑤ |

④ [新東 CERAM-F 施工マニュアル (瓦桟木 15×30, 広小舞 40 mm, 瓦の出 60 mm)](https://www.shintokawara.co.jp/data/pdf/catalog/construction_manual/201505_CERAM-F%20S-PRO.pdf)
⑤ [japandoraku – Japanese Roof Tiles](https://japandoraku.com/japanese-roof-tiles-%E6%97%A5%E6%9C%AC%E3%81%AE%E5%B1%8B%E6%A0%B9%E7%89%B9%E6%AE%8A%E7%93%A6/)
⑥ [Onigawara – size/placement](https://tokaido.wordpress.com/2008/02/27/japanese-ceramic-roof-tile-end-cap-onigawara-kawara/)
⑦ [瓦 (Kawara) – part names 桟瓦/萬十軒瓦/袖瓦/角瓦/冠瓦/鬼瓦](https://littlejapandictionary.travel.blog/2020/05/10/%E7%93%A6-kawara-roof-tile/)
⑧ [廻り隅瓦 4寸/4.5寸/5寸 per-pitch parts](https://www.shintokawara.co.jp/data/pdf/catalog/construction_manual/201505_CERAM-F%20S-PRO.pdf)
⑨ [谷/陸棟 drawn as double-layer in standard manuals](https://www.kawara.co.jp/wp-content/upfiles/bsroof_manual.pdf)

### 3.3 Tile colours / finishes (drives the "roof colour" option)

| Key | Name | Look |
|---|---|---|
| `ibushi` | いぶし瓦 (燻し瓦) | unglazed, smoke-carbonised → silver/grey with a dry sheen; the classic Japanese look |
| `yuuyaku` | 釉薬瓦 | glazed: often deep blue-black (`bengara`), or red-brown |
| `silver` | 銀色 | bright silver (ibushi premium) |
| `red` | 赤瓦 | red-brown, Kyūshū/Okinawa |
| `green` | 緑釉 | green glaze, temple/Korea/China (琉璃瓦) |
| `blue` | 瑠璃/青 | cobalt glaze — temples & imperial (China) |
| `chinese_yellow` | 黄琉璃 | imperial yellow (China's highest rank) |
| `new/aged` | 新瓦/古瓦 | gloss vs. weathering |

Source: [瓦 (Kawara) – 釉薬瓦/いぶし瓦](https://littlejapandictionary.travel.blog/2020/05/10/%E7%93%A6-kawara-roof-tile/).

---

## 4. Roof structure — the "structure correctly implemented" requirement

### 4.1 The real stack (bottom → top), verified against construction manuals and framing studies

```
柱 hashira (posts)
 └ 軒桁 noki-geta (eave beam, on the wall line, carries the rafter ends)
    └ 小屋梁 koya-bari (tie beam, spans the width)  →  真束 shin-tsuka (crown post)
       └ 棟木 munagi (ridge beam) at the apex
       └ 母屋 moya (purlins at every 挙折 break line) — 60–80 cm apart
          └ 垂木 taruki (common rafters, 45×60 @ 455 mm, ridge → eave, cantilevered past the wall)
             └ 野地板 nojita (roof sheathing / deck, 12–15 mm)
                └ ルーフィング underlayment (waterproof sheet)
                   └ 瓦桟 gasan (tile battens 15×30, one per tile course)
                      └ 瓦 kawara (tiles, 95 mm head lap, 45 mm side lap)
                         └ 棟 mune: 熨瓦 noshigawara stack + 冠瓦 kangawara cap + 鬼瓦 ends
```
Eave edge trim: **茅負 kayao** (horizontal member on top of the rafter noses — the simplified modern
version is **広小舞 hikoma**), **木負 kioi** (the first-tier member when the roof is 二軒 / double-eaved),
**破風 hafu** (bargeboard hiding the gable rafters), **鼻隠し hanakakushi** (fascia hiding the rafter ends),
**桔木 hanegi** (the cantilever beam that lifts deep temple eaves), **出桁 dashigeta** + **斗栱 tokyō**
(bracket sets) for the deep Chinese/Japanese temple eaves.
Sources: [FOLKO – minka roof framing series (sasu-gumi, wagoya-gumi, moya, munagi, taruki)](https://www.folko.com.au/blog/2024/1/8/japanese-minka-xxxiv-roof-framing-1),
[FOLKO – sasu framing](https://www.folko.com.au/blog/2024/1/15/japanese-minka-xxxv-roof-framing-2),
[meguri-japan – taruki / shitaji](https://meguri-japan.com/en/knowledge/20210627_1697/),
[Japanese Metal Roofing Assoc. glossary – 破風 / 広小舞](http://www.kinzoku-yane.or.jp/glossary/word-ha.html),
[茅負/木負 explanation](https://riverstone-roofing.com/basic/20161228_kayaoi/),
[軒桁 definition](https://polaris-hs.jp/zisyo_syosai/nokigeta.html),
[Structural mechanism of timber towers (桔木 hanegi, 野垂木)](https://www.tandfonline.com/doi/pdf/10.3130/jaabe.1.2_25).

### 4.2 Why the eaves project so far
Japanese/Chinese roofs are built without gutters; the deep overhang throws rain clear of the walls and
protects the columns. Overhangs are therefore large (≈ 1/3 of the eave height in Chinese practice:
檐椽出 = 2/3 and 飞椽出 = 1/3 of the 21斗口 overhang below the bracket set).
Sources: [怎样看懂古代建筑](https://zhuanlan.zhihu.com/p/34276746), [japandoraku](https://japandoraku.com/japanese-roof-tiles-%E6%97%A5%E6%9C%AC%E3%81%AE%E5%B1%8B%E6%A0%B9%E7%89%B9%E6%AE%8A%E7%93%A6/).

### 4.3 How the generator builds it (implementation contract)

* **Plan-first.** The roof plan is built the way a carpenter lays it out: draw the **eave outline**
  (footprint inflated by the overhang), draw the **ridge**, and let each **hip (隅棟) run at 45° in plan**
  from the eave corners. Consequences that fall out for free and are checked by the validator:
  - `yosemune` ridge length = eaveWidth − eaveDepth ✔ (the classic hip-roof rule)
  - `irimoya` break line = where the 45° hip reaches the gable (tsuma) plane ✔
* **Surface.** The roof is one parametric surface `S(u,v)` (u along the eave, v = arc length up the slope),
  generated from the polyline of §4.4. Tiles, battens, sheathing and rafters are all sampled from that
  **same** surface, so deck/batten/tile contact is exact by construction — this is the structural reason
  the model cannot produce floating tiles.
* **Rafters** are **parallel and perpendicular to the eave** (Japanese/Korean practice), cut against a
  **隅木 sumigi** hip rafter box along each hip line — not fanned like the Chinese 翼角椽.
* Corrugated cross-sections are real: the 桟瓦 profile (pan + 45 mm roll rib) is a lofted polyline
  cross-section, not a flat box; 丸瓦 is a half-cylinder; 平瓦 carries its raised side edges.

### 4.4 Curvature implementation

| Effect | Rule used | Source |
|---|---|---|
| Main concave profile (照り teri) | purlin drops H/10, H/20, H/40 … (举折) placed between eave and ridge; surface follows the polyline | §2.2 |
| Gable-edge curve (むくり mukuri / 照り) | same profile applied to the bargeboard line | §2.2 |
| Corner upturn (起翘 / 反り) | corner of the eave lifted by **4 × rafter diameter** and pushed out **3 × rafter diameter**, blended into the straight eave over the last `upturnRun` (default 2.5 m) with a smoothstep | §2.3 |
| Korean extra sweep | a larger curve exponent (user-exposed) | §1.3 |

Every one of these is a **parameter**, so `curvature = 0` reproduces a perfectly straight, hard-edged roof
(useful for "modern styling" variants) and the defaults reproduce a traditional one.

---

## 5. Modern-styling layer (ancient form, contemporary detailing)

The brief asks for *ancient buildings with modern styling*, so the generator splits the spec into two
independent channels:

* **`form`** — everything in §1–§4 (traditional).
* **`style`** — the modern overlay: flat matte materials, exposed raw structure or fully clean soffits,
  hidden fixings, crisped (un-curved) profiles, tiles swapped for `metal`/`mono` panels, thinner ridges,
  accent lighting. These do not change the geometry rules, only the parameter values and shading.

---

## 6. Presets derived from the research (see `src/spec.js`)

| Preset | Form | Pitch | Tile | Notes |
|---|---|---|---|---|
| `minka` | irimoya | 5寸 | 桟瓦 60判, ibushi | farmhouse, deep eaves, exposed taruki |
| `machiya` | kirizuma | 5.5寸 | 桟瓦 桟瓦 300 | townhouse, narrow front, 袖瓦 verge |
| `temple_hondo` | irimoya | 6.5寸 | 本瓦葺 平+丸 | 鬼瓦 ends, 茅負+木負 double eave, exposed rafters |
| `shrine_nagare` | nagare | 7寸 | 檜皮葺/こけら葺 | chigi + katsuogi options |
| `joseon_hanok` | paljak | 6寸 | 韓国瓦 (grey-green) | chunyeo/sarae/hwalju, stronger curve |
| `chinese_hall` | xieshan | 举折 H/3 | 琉璃瓦 green/blue | 冲三翘四 corner, 戗脊, bracket band |
| `imperial_zhongyan` | double-eave wudian | 举折 H/3 | 黄琉璃 | two roof rings, highest rank |
| `gassho` | thatch gable | ~14寸 (55°) | 茅葺 | very thick, 破風 exposed |
| `modern_irimoya` | irimoya, curvature 0 | 3寸 | metal seam | the "ancient shell / modern detailing" case |

---

## 7. Verification — how "not floating, correct tiles, correct structure" is enforced

"Correct" is defined by assertions with numeric tolerances, not by eye. `src/core/validate.js`
runs on every generated roof (`node cli/report.mjs`, and the viewer prints the same numbers).
The roof must pass **all** of them; the CLI exits non-zero otherwise. The list below is the
implemented set — the numbers in brackets are the tolerances, and every check is measured on
the built triangles, not on the parameters that were fed in.

**The roof plan**

1. `plan.ridge-level` / `plan.ridge-parallel` — the 棟 is level and parallel to the long axis (1e-6 m).
2. `plan.hips-45deg` — every 隅棟 runs at 45° in plan (0.5°); this is what makes 入母屋/歇山 read correctly.
3. `plan.hips-on-corner` (2 mm) — every hip starts exactly on an eave corner: no hip floating in mid-air.
4. `plan.hips-reach-gable` (2 mm) — each hip terminates on the 破風 plane / ridge end, i.e. the 妻 section is a clean triangle.
5. `plan.hip-ridge-length` (2 mm, where the form defines it) — e.g. 寄棟 ridge = eave width − eave depth.
6. `plan.symmetric` (1e-9) — the surface is symmetric about the ridge.

**The tiles**

7. `lap.head` / `lap.side` — measured on the laid layout, never below the catalogue: 95 mm head,
   45 mm side for JIS 300×305 桟瓦 (each tile family carries its own pair).
8. `tiles.cover-face` — a 27×27 plan sample of every face must find a 平瓦 over it: catches trims
   that leave an eave corner bare, gaps between courses, and courses that stop short of the ridge.
9. `tiles.supported` (max bearing 3 mm, zero unsupported) — two-line support, mesh-to-mesh: at the
   nose the tile must bear on its 瓦桟, and one working length up-slope on the next batten, whose
   head it hooks over. The eave course nose may instead bear on the 広小舞 board; probes that land
   above the topmost 瓦桟 are counted as ridge zone, not failures. Catches both floating tiles and
   tiles buried in the sheathing.
10. `tiles.bed-alignment` (±8 mm) — the 野地板 deck mesh must lie on the ideal offset surface one
    construction stack (瓦桟 + ルーフィング) below the tile bed. Catches a wrong stack and any mesh
    that has wandered off the surface.
11. `tiles.coverage` — laid tile area ÷ roof area must match the tile family's own lap theory
    (L×W)/(workL×workW) within −14 %/+12 %; e.g. 1.717 for 300×305 桟瓦, 1.000 for standing seam.
    A layout with no lap at all reads ≈1.0 and fails.
12. `eave.projection` — the tile nose overhangs the 広小舞 by the catalogued 瓦の出 (60 mm).

**The frame**

13. `frame.rafters-over-purlins` (6 mm; zero short rafters) — every 垂木 that crosses a 母屋 line is
    measured mesh-to-mesh against it (its underside must sit on the purlin top), and every rafter
    that stops below the lowest 母屋 must be a genuine hip stub trimmed by the 隅木, not a member
    hanging in mid-air. This check is what caught the end-face rafters running past the hip diagonal.
14. `frame.eave-beam-contact` (12 mm) — from the underside of every rafter crossing the 軒桁 line
    (all four sides, the beam rings the building) to the beam's top face.
15. `frame.crown-post-contact` (2 mm) — 真束 heads meet the underside of the 棟木.
16. `layers.ordered` — 瓦 → 瓦桟 → ルーフィング → 野地板 → 垂木 offsets are strictly monotonic
    (no interpenetration), including deep beds such as 茅葺, where the tile material itself
    (not the batten grid) sets the deck depth.
17. `structure.below-tiles` — no structural member rises through the tile bed.

**The mesh**

18. Sheathing, battens and rafters are tessellated finer than the tolerances they are tested
    against (deck ≤130 mm, battens ≤180 mm, rafters ≤280 mm along the flow), so chord sag cannot
    masquerade as an error; and adjacent faces share the break-line rows, so the 野地板 and the
    tile beds meet exactly along the 隅棟 diagonal instead of leaving slivers.

`node cli/report.mjs` prints all of this per preset with the worst measured epsilon, writes it to
`out/roof-report.json`, and exits non-zero if anything fails. `node tools/render.mjs` renders the
same roofs offline to PNG (hero, 妻側, eave corner, and a half-section through the whole stack)
for the human eye. That combination — assertions for the numbers, renders for the shape — is how
"the roofs are correct" is demonstrated rather than asserted.

## 8. Source list (all consulted during this research)

1. meguri-japan — *The Japanese House: basic elements* — https://meguri-japan.com/en/knowledge/20210627_1697/
2. Wikipedia — *Kibitsu-zukuri* (hiyoku irimoya) — https://en.wikipedia.org/wiki/Kibitsu-zukuri
3. Wikipedia — *Minka* (roof shapes, hogyo) — https://en.wikipedia.org/wiki/Minka
4. Wikipedia — *East Asian hip-and-gable roof* — https://en.wikipedia.org/wiki/East_Asian_hip-and-gable_roof
5. Wikipedia (zh) — *歇山顶* — https://zh.wikipedia.org/zh-hans/%E6%AD%87%E5%B1%B1%E9%A1%B6
6. Architectura Sinica — *jǔzhé 舉折* — https://architecturasinica.org/keyword/k000223
7. Architectura Sinica — *xiēshān 歇山* — https://architecturasinica.org/keyword/k000143
8. Buildings 15(14):2582 — *Causes of the Concave Shapes of Traditional Chinese Building Roofs* — https://www.mdpi.com/2075-5309/15/14/2582
9. Buildings 14(1):277 — *Predicting the Movement of Columns in Hanok Architecture* — https://www.mdpi.com/2075-5309/14/1/277
10. Buildings 12(8):1090 — *Korea at the Exhibition: Hybrid Roof* — https://www.mdpi.com/2075-5309/12/8/1090
11. 知乎 — *怎样看懂古代建筑* (翼角冲出与翘起, 举架) — https://zhuanlan.zhihu.com/p/34276746
12. 土木在线 — *古建筑翼角——为什么起翘？如何起翘？* (冲三翘四撇半椽, 生头木) — https://bbs.co188.com/thread-10371251-1-1.html
13. 百度文库 — *古典园林建筑构造* ("冲三…翘四") — https://max.book118.com/html/2019/0831/7152141061002052.shtm
14. 鎬桟瓦 (谷池瓦産業) — 瓦割り表 (working sizes, 20 pcs/m², 56 kg/m²) — http://shinogizan.com/size/
15. 新東カワラ — *CERAM-F S-PRO 施工マニュアル* (瓦桟木 15×30, 広小舞 40 mm, 瓦の出 60 mm, 廻り隅瓦) — https://www.shintokawara.co.jp/data/pdf/catalog/construction_manual/201505_CERAM-F%20S-PRO.pdf
16. カワラ工業 — *屋根設計のための標準施工マニュアル* (下地, 谷/陸棟 二重張り) — https://www.kawara.co.jp/wp-content/upfiles/bsroof_manual.pdf
17. 日本金属屋根協会 — 用語集 (破風 / 広小舞, 茅負) — http://www.kinzoku-yane.or.jp/glossary/word-ha.html
18. riverstone-roofing — 茅負/木負 — https://riverstone-roofing.com/basic/20161228_kayaoi/
19. 三河国分尼寺 — 木負と茅負 (photo-documented eave members) — https://tamakotamako.exblog.jp/33350379/
20. polaris-hs — 桁 / 軒桁 definitions — https://polaris-hs.jp/zisyo_syosai/nokigeta.html
21. FOLKO — *Japanese Minka XXXIV–XXXV, Roof Framing 1–2* (sasu-gumi, wagoya-gumi, taruki, munagi) — https://www.folko.com.au/blog/2024/1/8/japanese-minka-xxxiv-roof-framing-1
22. FOLKO — *Roof Framing 8: Odachi Framing* (odachi, torii-gumi) — https://www.folko.com.au/blog/2024/3/15/1b2eleapwqn73dp4t2308sdyroww4b
23. JAABE 1(2) — *Structural Mechanism and Morphology of Timber Towers* (野垂木, 桔木 hanegi, 出桁) — https://www.tandfonline.com/doi/pdf/10.3130/jaabe.1.2_25
24. japandoraku — *Japanese Roof Tiles 日本の屋根特殊瓦* (irimoya, 冠瓦/熨瓦, 鬼瓦, 鴟尾, 桟瓦 JIS) — https://japandoraku.com/japanese-roof-tiles-%E6%97%A5%E6%9C%AC%E3%81%AE%E5%B1%8B%E6%A0%B9%E7%89%B9%E6%AE%8A%E7%93%A6/
25. Kawara anatomy (丸瓦/平瓦/桟瓦/鬼瓦) — https://www.ntmeiningjia.com/news/industry-news/japanese-roof-tiles-where-craftsmanship-nature-and-symbolism-converge.html
26. 瓦 (Kawara) part names — https://littlejapandictionary.travel.blog/2020/05/10/%E7%93%A6-kawara-roof-tile/
27. 勾配換算 — pitch ↔ angle ↔ % table — https://hayamihyou.net/slope/
28. AFGC — 屋根の基礎知識（屋根勾配）incl. 隅棟伸係数 — https://www.afgc.co.jp/knowledge/cate1/a36
29. カクニシ — 垂木間隔 455 mm / 45×60 — https://kakunishi.co.jp/blog/3061.html
30. Maruei Kawara (EISHIRO) — tile dimensions — https://www.eishiro.co.jp/english/products/wakei/index.html
31. Onigawara dimensions & placement — https://tokaido.wordpress.com/2008/02/27/japanese-ceramic-roof-tile-end-cap-onigawara-kawara/
32. Kawara metal tile datasheet (290×295, eff. 265×265, 14.29/m²) — https://www.sangobuildroofing.com/kawara_metal_tile.html
33. Baidu Baike — 悬山 (overhanging gable) — https://baike.baidu.com/en/item/Overhanging%20Gable%20Roof/39970
34. Ancient China architecture – 6 roof styles & ranks — https://raider.pressbooks.pub/chineseculture/chapter/1-architecture-in-ancient-china/

*Diagrams inspected for this research (not redistributed): roof cross-section showing
垂木 → 野地板 → ルーフィング → 屋根材 and the 鼻隠し fascia; 破風板 bargeboard photo;
屋根の構造(小屋組).*
