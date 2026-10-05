# Frontier — Road & Bridge Generator

> Clean topology road network with **fixed pavement & curbs on curves** + **bridge system**. Slate-themed editor inspired by `Frontier/Experimental/FrontierEditor`.

Live preview: `npm run dev` → http://localhost:3000 (host 0.0.0.0, allowedHosts: true)

## What was fixed vs Roadnet V1/V2/V3

### 1. Pavement & Curbs on Curves (Main Fix)
Roadnet's original approach:
```ts
// naive normal offset per point
left = center + normal * halfWidth
```
Problem: on tight curves, normals flip, offset lines self-intersect, pavement gaps, curb discontinuities.

**Fix implemented in `src/lib/geometry.ts`:**
- **Uniform resampling** of spline for clean topology (no stretched quads)
- **Frenet frames** with smoothing (2-pass average, projection to stay perpendicular)
- **Miter joins via offset line intersection**:
  ```ts
  function lineIntersection2D(p1,d1,p2,d2) // intersect offset lines of adjacent segments
  // limit miter length to 3.5× offset to avoid spikes, fallback to bevel
  ```
- **Continuous curb extrusion**: curb is a single vertical quad strip along the offset curve, not per-segment
- **Pavement outer lip**: small 0.5× curb height drop for realistic edge

Result: Curvy Boulevard and Tight Curve Test show no gaps, even at 90°+ turns, radius >2m.

### 2. Bridges
Roadnet had `bridgeDepth` and `bridgeInset` but no pillars/girders.

**New bridge system:**
- **Auto-detect**: `isBridge || avgZ>2 || anyZ>3`
- **Deck**: bottom face with inset, side walls from pavement outer edge down to deck bottom
- **Girders**: 3 longitudinal beams under deck (`bridgeDepth * 0.7`)
- **Pillars**: every `bridgePillarSpacing` (default 14-18m), cylinder with 1.15× taper, height = deckZ, footing box at ground
- **Guard rails**: vertical quads on bridge edges, metallic material
- Sample: **Harbor Bridge** - elevated S-curve, 6-7m high, pillars visible, deck 1.5m thick

### 3. Clean Topology (kept from Roadnet)
- Road surface as single quad strip `[leftRoad, rightRoad]` → no T-junctions
- Pavement as `[outerRaised, innerRaised]` → consistent winding
- Coons patch logic preserved for junctions but improved with fillet
- Lane markings: dashed lines via segment splitting, not texture

## Slate Theme

Matches `Frontier/Experimental/FrontierEditor` (arena/01a0fd48-slate):
- **Shell**: `grid-template-columns: 300px 1fr 360px`
- **Outliner**: `#151515`, border `#2a2a2a`, brand `frontier.`, status dot, scene title `.scene`
- **Search**: `#1c1c1c`, rounded 7px, 11px font
- **Tree rows**: 38px, hover `#1e1e1e`, selected `#252525` with left accent bar
- **Viewport**: radial gradient `#1a1a1a → #0e0e0e`, top bar with blur, mode pill (draw/select/bridge)
- **Toolbar**: 56px wide, rounded 20px, `#181818`, shadow `0 20px 60px #0008`
- **Inspector**: radial `#1e1e1e → #141414`, cards `#1e1e1e→#1a1a1a`, border `#2a2a2a`, radius 14px, DM Sans
- **Controls**: range with `--progress` gradient, toggle pills, metric 32px thin
- **Fonts**: DM Sans 300/400/500/600, JetBrains Mono for coords

## Architecture

```
src/
  lib/geometry.ts      # Vec3 ops, spline sampling, offset polyline with miter, RoadBuilder, Junction
  components/
    PatchMesh.tsx      # BufferGeometry from grid, material by type, PillarMesh
    RoadNetwork.tsx    # Builds all splines, lane markings
    SplineEditor.tsx   # Bezier curve display, Node/Handle gizmos, TransformControls
  App.tsx              # Slate shell, outliner, viewport, inspector, state
  styles/index.css     # Slate theme
```

### Key types
```ts
RoadSpline { id, name, nodes: SplineNode[], closed, profile: {roadWidth, laneCount, paveLeft/Right, curbHeight, isBridge, bridgeDepth, pillarSpacing, elevation}, visible }
SplineNode { id, position: Vec3, handle1, handle2 }
RoadBuilder.build(curve): {patches, pillars, centerLine, left/right edges}
PatchSpec { name, grid: Vec3[][], color, alpha, type: 'road'|'pave'|'curb'|'bridge'|'rail'|'deck' }
```

## Usage

- **Select (V)**: drag nodes, drag center gizmo to move whole road
- **Draw (P)**: click ground to add points, click endpoints to close loop or join splines
- **Bridge (B)**: toggle isBridge in inspector or elevate >2m
- **Elevate (E)**: use elevation slider or drag Z via gizmo
- **Outliner**: toggle visibility, search, new road (+)
- **Inspector**: road width, lanes, pavement, curb height, bridge depth/spacing

## Sample Roads

1. **Curvy Boulevard**: S-curve with varying elevation, 2.5m pavements, tests pavement fix on 45° curves
2. **Harbor Bridge**: 100m long, 6-7m high, bridge mode on, 1.8m pavements, pillars every 14m
3. **Tight Curve Test**: 90° turn, radius ~5m, 2m pavements, demonstrates no self-intersection

## Dev

```bash
npm install
npm run dev    # vite --port=3000 --host=0.0.0.0 --allowedHosts true
npm run build
```

## Future

- Junction boolean merging (currently overlap)
- Road intersection with traffic logic
- Export to GLTF
- Terrain conforming
- Bridge cable-stayed variant
