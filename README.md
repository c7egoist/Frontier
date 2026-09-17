# Frontier — Japanese Machiya Procedural Generator 🏯 縁側

> Ancient Japanese buildings with modern styling — procedural, like Blender Geometry Nodes.

A complete procedural generator for **traditional East-Asian / Japanese architecture** — Machiya 町家, Izakaya 居酒屋, Ryokan 旅館, Minka 民家, with **booleans for everything** and **roof-focused** design (反り Sori curve is critical).

Live interactive preview built with Three.js + procedural bmesh for Blender.

## ✨ Features — All Requested Booleans

### Core — Geometry Nodes style
- **Seeded randomization** — every building unique
- **Archetypes**: Machiya, Izakaya, Ryokan, Store, Minka, Temple Shop, Office
- **Use**: house, store, izakaya, office, ryokan
- **Floors**: Boolean stack — add 1F (base), 2F, 3F, 4F attic independently
- **Dimensions**: width, depth, floor height, pillar density

### ⛩ Roof System — MOST IMPORTANT
- **Roof Types**:
  - Irimoya 入母屋 — Hip-and-Gable (most traditional, 2-tier)
  - Kirizuma 切妻 — Gable
  - Yosemune 寄棟 — Hip roof
  - Karahafu 唐破風 — Cusped gable (shrine/store)
  - Noki-Karahafu 軒唐破風 — Curved eaves
  - Pagoda 重層 — Multi-tier
- **Sori 反り Curve**: 0-1 authentic upturn at eaves — corners lift, essential for Asian look
- **Overhang 軒出**, **Ridge Height 棟高**
- **Tile Types 瓦種**:
  - Nihon Kawara 日本瓦 — round grey
  - Ibushi いぶし銀 — smoked silver
  - Sekishu 赤瓦 — red
  - Mokume 木目 — wood shingle
  - Copper 銅板 — green patina
  - Ceramic 瑠璃 — blue glazed
- **Booleans**: 3D tiles mesh, Onigawara 鬼瓦 demon tiles at corners, ridge ornament 鴟尾, kawara ridge detail
- **Tile scale, roof color override**

### 🪵 Materials
- **Wood Types**: Hinoki 檜 light blonde, Sugi 杉 cedar warm, Yakisugi 焼杉 burnt dark, Keyaki 欅 reddish, Bengara 弁柄 red painted, Charcoal 炭 black modern
- **Wood Color**, **Age/Weathering**
- **Wall Types**: Shikkui 漆喰 white plaster, Yakisugi 焼杉板, Shitami-itabari 下見板張, Namako なまこ壁 tile pattern, Modern plaster
- **Wall color, texture scale**

### 🏮 Lighting — Type of Lights
- **Types**: Chochin 提灯 paper lanterns, Andon 行灯 wood frame, Bare bulb 裸電球 Showa, Neon ネオン modern mixed, Modern Mix, Hidden LED
- **Color, Intensity, Flicker 揺らぎ**
- **Booleans**: Chochin, Andon, Street lamp, Interior glow
- **Chochin count** 0-8

### ⚡ Infra — Electricity / Phone Pole
- **Electric Pole 電柱** boolean
- **Phone Lines 電線** — sagging wires to building
- **Aircon Units 室外機** — modern touch
- **Meter Box 電気メーター**, **Gutter 雨樋 copper**
- **Modernity slider 古代⇄現代** — controls mix of ancient vs modern details

### 🪧 Signage — Custom Text Boards
- **Kanban 看板** boolean — main sign
- **Custom text** for kanban (Japanese + English)
- **Kanban Style**: wood vertical 縦看板, wood horizontal 横看板, metal + neon, paper 貼り紙
- **Noren 暖簾** curtain with custom text (e.g. 営業中)
- **Posters & Bills** — multi-line custom texts (e.g. コーヒー ¥450)
- **Small signs, menu**

### 🪑 Props — Asian Style Furniture (Optional Booleans)
- **Interior Furniture** boolean
- **Chairs & Tables 椅子・テーブル**
- **Zabuton & Low Tables 座布団・ちゃぶ台**
- **Plants 植栽・盆栽**
- **Tansu 箪笥 chests**, **Kitchen Props 厨房備品** (bottles, counter for izakaya)
- **Furniture density**

## 🚀 Quick Start — Web Generator

```bash
npm install
npm run dev
# open http://localhost:5173
```

- Left panel = Geometry Nodes — all booleans
- Right panel = Node graph preview + presets
- **R** randomize, **F** focus, **G** grid toggle
- Export GLTF button → use in Blender, Unity, etc.

## 🎨 Presets
- 町家 Classic Machiya — pure traditional
- 居酒屋 Night Izakaya — yakisugi + 5 chochin + kitchen
- 現代町家 Modern Mix — charcoal + copper roof + neon kanban
- 旅館 Ryokan — large + engawa + setback
- 昭和商店 Showa Store — red tiles + posters + meter box
- 門前 Temple Shop — karahafu + blue ceramic + onigawara

## 🧩 Blender Addon

Location: `/blender_addon/__init__.py`

Install:
1. Blender → Edit → Preferences → Add-ons → Install → select `__init__.py` (or zip the folder)
2. Enable "Frontier — Japanese Machiya Generator"
3. View3D → Sidebar (N) → Frontier tab
4. Adjust booleans (seed, width, roof type Sori, wood type, chochin, kanban text etc.) → Generate

The addon uses **bmesh procedural generation** with same logic as web:
- pillars hashira, beams nuki, shoji, engawa, roof with Sori curve, onigawara, chochin with emission, kanban text object, denchu electric pole.

## 🏗 Architecture

```
src/
  main.js — Three.js scene, UI binding, export
  style.css — Geometry Nodes dark UI
  generator/
    utils.js — seeded RNG, canvas textures (wood, shikkui, kawara, kanban, noren)
    roof.js — authentic Sori roof generation (kirizuma, yosemune, irimoya, karahafu, pagoda) + onigawara + 3D tile instancing
    building.js — floor stack, hashira pillars, shoji walls, engawa, kanban/noren, chochin lights, denchu pole with sagging wires, aircon, gutter, posters, zabuton/tansu/kitchen props
```

All geometry is **procedural** — no external models.

## 📜 Roof Importance — 反り Sori

Japanese roofs are defined by Sori — upward curve at eaves. Implemented as:
- Corner lift = normalized distance X * Z → quadratic lift
- Edge lift along eaves
- Extreme corner extra upturn (0.5m) + outward flare
- Different for each roof type — Karahafu uses bezier S-curve for cusped profile

Adjust `Roof Curve` slider for authentic sweep — 0.6-0.8 recommended for ancient look.

## 🔧 Export

- Web: GLTF button exports full building with materials + lights
- Blender addon generates native mesh + materials + separate chochin/kanban objects ready for further Geometry Nodes editing

## 📝 Custom Board Texts

In UI:
- Kanban main: any Japanese (山田商店) + English (YAMADA)
- Noren: 営業中, 居酒屋, etc.
- Posters textarea: one per line — becomes individual paper posters on wall with random colors

All textures are generated via Canvas — no image assets needed.

## License

MIT — use for games, films, archviz.

---
縁側 — Frontier 2026 — Ancient × Modern
