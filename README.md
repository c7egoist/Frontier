# Neo-East Asian Procedural Building Generator (AAA Game Studio)

An advanced procedural 3D building generation system for Japanese and East Asian architecture retrofitted with modern urban and cyberpunk infrastructure. Designed for next-generation AAA game engines (Unreal Engine 5 Nanite/Lumen, Unity HDRP, Blender).

## Features

### 1. Procedural Building Geometry Engine
- **Architectural Archetypes**:
  - **Izakaya & Ramen Tavern**: Traditional multi-story tavern with fabric noren curtains, glowing signage, outdoor AC compressors, and dense telephone cabling.
  - **Kyoto Machiya Residence**: Historic merchant townhouse with Senbon-koushi lattice screens, Hinoki cypress timber, and interior Zen courtyard.
  - **Neo-Tokyo Studio & Cyber Office**: Shou Sugi Ban charred wood retrofitted with modern frameless glass curtain walls and rooftop HVAC.
  - **Sacred Shrine Sanctuary**: Vermilion-lacquered timber temple with sweeping Chinese Dian eaves and bronze dragon ridge ornaments.
  - **Five-Tier Pagoda Monument**: Multi-tiered stepped pagoda tower with authentic Dou-gong cantilever brackets and Sorin bronze spire.
  - **Zen Tea House Pavilion**: Rustic single-story tea pavilion with split bamboo trough roof tiles and open wrap-around Engawa deck.

### 2. East Asian Roof & 3D Kawara Tile Systems
- **Roof Types**:
  - `irimoya`: Traditional Japanese Hip-and-Gable with decorative bargeboards (Hafu) and pediment.
  - `kirizuma`: Pure Japanese Gable roof with exposed rafters.
  - `yosemune`: Four-sided Hip roof sloping in all directions.
  - `pagoda_stepped`: Tiered eaves with corner wind-bells and top spire.
  - `chinese_dian`: Dramatic upturned curved corners (Feiyan / Flying Eaves).
- **Curvature (Sori)**: Parabolic mathematical curve formula controlling eaves upward sag and flare.
- **Procedural 3D Tiles**:
  - Japanese Hongawara (alternating semi-cylindrical Marugawara ridges and Hiragawara flat pans).
  - Chinese / Japanese Imperial Glazed pantiles.
  - Rustic Split Bamboo tiles.
  - Modern Standing-Seam Oxidized Copper / Titanium-Zinc shingles.
- **Roof Color Palette**: Charcoal Slate Black, Aged Verdigris Turquoise, Imperial Jade Green, Shrine Vermilion Red, Palace Ochre Gold, Cobalt Indigo.
- **Ridge Ornaments**: Onigawara demon ogre end-caps, Shibi curved dragon finials, stepped Mune capping tiles.

### 3. Structural Joinery & Timber Framing
- **Wood Finishes**: Hinoki Blonde Cypress, Keyaki Dark Aged Cedar, Yakisugi Burnt Shou Sugi Ban, Vermilion Shrine Lacquer, Ancient Weathered Timber, Cyber Carbon.
- **Dougong / Tokkyo Bracket Complexes**: Cantilevered timber arms (Hijiki), bearing blocks (Daito/Makito), and exposed rafters (Taruki).
- **Engawa Verandas**: Wrap-around wooden decking and traditional timber railings (Kōran).

### 4. Electricity & Modern Retrofit Infrastructure
- **Concrete Telephone Pole**:
  - Tapered column with yellow/black hazard zebra warning stripes.
  - Steel crossarms with ceramic bell insulators.
  - Step-down distribution transformer drum with cooling fins.
  - Convex round orange street safety mirror and vintage street lamp.
  - Steel climbing rungs.
- **Catenary Sagging Powerlines**:
  - Dynamic hyperbolic/parabolic physics droop calculations.
  - Multiple cable strands connecting pole crossarms to rooftop service mast and electric meter boxes.
- **Modern Facade Retrofits**:
  - Outdoor AC split compressor units with fan grilles and copper pipe runs.
  - Japanese beverage vending machine with illuminated can display and side bottle recycling bin.
  - Electric meter box with transparent dial and vertical conduit pipes.

### 5. Asian Interior & Zen Furniture
- Authentic woven **Tatami** mat layout with dark cloth border binding (Heri).
- Low **Chabudai** round wooden dining table.
- **Zafu / Zabuton** sitting cushions.
- **Shoji** sliding screen room partitions.
- Glowing **Andon** floor paper lamp with warm point light.
- Twisted miniature **Bonsai** pine tree in ceramic pot.
- Ceramic Japanese **Tea Ceremony Set** (Kyusu teapot & Ochawan cups).
- Split fabric **Noren** doorway curtain.

### 6. Customizable Signage & Typography
- **Main Storefront Signboard**: Real-time user text typing (Kanji / English), 4 material styles (Gold Carved Wood, Tokyo Acrylic Lightbox, Etched Brass Plate, Cyber Hologram Matrix).
- **Vertical Blade Neon Sign**: User-typed custom text (characters automatically stacked vertically) with selectable neon glow colors.
- **Hanging Chōchin Paper Lanterns**: User-typed custom Kanji with warm internal 2200K illumination.
- **Street Wall Posters**: Selectable Cyberpunk Ad, Ukiyo-e Great Wave print, or Ramen Shop menu with custom headlines.

### 7. Blender Geometry Nodes Pipeline & Exporters
- **Geometry Nodes DAG Visualizer**: Interactive node graph editor directly inside the studio with real-time node inspection and parameter sliders.
- **Direct 3D Exports**:
  - `.GLB` / `.GLTF`: Complete binary 3D model with embedded PBR textures, normals, and lighting hierarchy (Unreal Engine 5 Nanite ready).
  - `.OBJ` + `.MTL`: Universal wavefront mesh export.
  - `Blender Python Script (.py)`: Standalone script that automatically constructs the procedural building geometry in Blender 3.6+ / 4.x.
  - `JSON Preset`: Export and share building configurations.

## Development & Usage

```bash
# Install dependencies
npm install

# Run live development server
npm run dev

# Build for production
npm run build
```
