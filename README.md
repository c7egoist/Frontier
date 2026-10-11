# Frontier — AAA WebGPU Procedural Road & Urban Network Generator

A standalone, high-fidelity **WebGPU** (with automatic WebGL2 fallback) procedural Road & Urban Infrastructure Generator built with the **SultanAladin/Frontier** (`Experimental/ProjectZeroEditor` + `LayerStackPanel`) UI workflow.

## Key Architectural Highlights

### 1. SultanAladin/Frontier UI (`ProjectZeroEditor` + Dual `LayerStack`) — No Node Editor
- **Left Dock — Outliner & Mesh Telemetry**:
  - Live telemetry for **Quad Faces**, **Triangle Faces (Quad %)**, **1-Mesh Merged Junctions**, **AI Traffic Cap (`≤ 25` vehicles)**, **City Block Parcels**, and **FPS**.
  - Hierarchical Outliner for selecting **Merged Intersections (`+`, `Y`, `T`)**, **Road Curve Splines**, **City Block Parcels**, **Bridges/Tunnels/Subways**, and **AI Traffic**.
- **Center Dock — WebGPU 3D Viewport + Synchronized 2D Ortho CAD Split**:
  - Preset Document Tabs: **Grand Metropolis**, **Cloverleaf & Rail Underpass**, **European Cobble & Y-Plazas**, and **Active Roadwork & Tunnel**.
  - Interactive **3D Transform Gizmo** (`X` Red, `Y` Green, `Z` Blue axes + `XZ` planar pad + view-plane ring) anchored directly on any **Merged Intersection** or **Spline Control Point**.
- **Right Dock — Inspector (Right Top) + Dual LayerStack (Right Bottom)**:
  - **Inspector on the Right**: Context-sensitive inspector for the active **Merged Intersection** (XYZ gizmo coordinates, corner fillet radius, Coons patch subdivisions, crosswalks, signal masts), **Road Curve Spline** (lanes, width, bridge/overpass/tunnel profile, paving bond, guardrail/bollard design, parking bays, roadwork zone), or **Scene & AI Traffic Cap (`≤ 25` vehicles)**.
  - **LayerStack on the Right**: Uses the `LayerStackPanel` (`BUBBLE | TIMELINE | CARD`) layout with continuous timeline track, knot indicators, horizontal drag-scrub weight pills, eye visibility toggles, and inline expandable parameter cards for both:
    - **Road & Infrastructure LayerStack (`L1`–`L10`)**
    - **Procedural Texture & PBR LayerStack (`T1`–`T8`)**

---

### 2. True Quad-First Topology & 1-Mesh Merged Intersections (`Y`, `T`, `+`, `Star`)
- **Zero Overlapping Geometry**: Splines that touch (`T`/`Y`) or cross (`+`) at similar elevations are automatically detected, split at exact curve-curve intersections, and trimmed back by angle-aware corner fillet distances (`w / tan(θ/2)`).
- **Single Watertight Coons Quad Patch**: Each intersection merges all connected road arms into a single watertight mesh using circular corner fillets (`filletBetweenEdgesXZ`), pinned offset curves (`offsetCurvePinnedXZ`) for gutters/curbs/sidewalks, and an N-way **Coons bilinear quad patch** (`coonsPatchGrid`) at the center.
- **Interactive 1-Gizmo Intersection Control**: Clicking any intersection badge (`4-Way +`, `3-Way Y`, `3-Way T`) in 3D or 2D Plan attaches the 3D Transform Gizmo to the intersection and moves all connected road arms together in real time.

---

### 3. Complete Urban & Infrastructure Feature Set
- **Curbs, Gutters, Drainage & Paving**:
  - 6 curb profiles (British Standard Granite Batter, Vertical Granite, Mountable Rollover, Sloped Highway, Dish Channel, Flush Shoulder), concrete gutters, recessed cast-iron storm grates, and utility manhole covers.
  - 8 procedural paving designs (Herringbone Brick, Fan Cobblestone, Running Bond Ashlar, Hexagonal Basalt Tiles, Brussels Porphyry Setts, Modular Concrete Slabs, Tactile Blister Paving, Exposed Aggregate).
- **City Blocks (Without Buildings)**:
  - Automatically encloses urban blocks between intersections with perimeter sidewalks, courtyard paving plazas, and cast-iron tree pit grates — **with zero buildings**.
- **Road Markings, Potholes, Speed Bumps & Road Construction / Rebuilding**:
  - Embossed thermoplastic lane markings, stop bars, continental/zebra crosswalks, and retroreflective cat's-eye studs.
  - True 3D recessed quad pothole craters (exposing sub-base gravel & standing water puddles) and parabolic asphalt speed bumps with chevron markings.
  - Active **Road Construction / Rebuilding Zones** with milled asphalt trenches, exposed steel rebar grid, alternating red/white Jersey barriers, traffic cones, solar arrow trailer, and a 3D articulated tandem vibratory road-roller.
- **Interchanges, Highways, Bridges, Underpasses, Tunnels, Subways & Railways**:
  - Elevated highway overpasses & bridges (Box-Girder, Tied Thru-Arch, and A-Frame Cable-Stayed Pylon with stay cables, elastomeric bearings, and hammerhead piers).
  - Surface **Railway Corridor & Underpass** (ballast bed, timber sleepers, UIC60 steel rails, catenary masts, portal retaining walls, and a moving 3-car express passenger train).
  - **Underground Road Tunnels** (horseshoe concrete lining, portal wing-walls, ceiling jet fans, and sodium luminaires) & **Deep Underground Subway Network** (twin bored tubes, third rail, tiled underground station platform, and moving 3-car metro consist; inspectable via **Subsurface X-Ray `U`**).
- **Guardrails, Bollards, Streetlights, Billboards, Parking & Robots**:
  - 6 guardrail/railing designs (`w-beam`, `thrie-beam`, `jersey`, `cable-barrier`, `bridge-parapet`, `ornate-balustrade`) and 6 bollard designs (`heritage-bell`, `stainless-led`, `hydraulic-sec`, `granite-cube`, `flex-post`, `loops-steel`).
  - On-street parallel/angled parking bays, 4 streetlight luminaire designs, 3 billboard designs (Overhead Highway Truss Gantry, LED Monopole, Sidewalk Info Totem), and 6-wheel autonomous sidewalk delivery/inspection robots with LiDAR domes.
- **AI Traffic Simulation (`≤ 25` Vehicles)**:
  - Directed lane-following AI with Bezier intersection turns, car-following braking, headlights/taillights, and 5 multi-part 3D vehicle archetypes (Sedan, Sport Coupé, SUV, City Transit Bus, Logistics Truck), strictly capped at **25 vehicles maximum**.

## Running Locally

Open `RoadGenerator.html` directly, or serve the workspace over HTTP:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```
