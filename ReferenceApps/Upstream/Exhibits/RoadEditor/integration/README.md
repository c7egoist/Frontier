# Road network → Frontier Terrain Lab

`frontier-road-import.js` is a self-contained loader: copy it into the engine
repo (or import it from here) and build live road meshes from any `.road.json`
the editor exports. Y-up, metres — no conversion needed.

## Minimal wiring (Terrain Lab `src/main.js`)

```js
import {loadRoadNetwork, buildRoadGroup} from './frontier-road-import.js';

// …after the scene exists:
const network = await loadRoadNetwork('/roads/alpine-descent.road.json');
const roads = buildRoadGroup(network, THREE, {
  step: 1.5,   // centreline resample, metres
  lift: 0.03   // decal-style lift above the terrain skin
});
scene.add(roads);
```

## Draping onto generated terrain

If a road uses **Conform → Drape**, pass a height sampler so the ribbon hugs
the ground instead of its design heights:

```js
import {buildRoadGroup} from './frontier-road-import.js';

// Example: raycast sampler against your terrain mesh.
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const sampleTerrain = (x, z) => {
  ray.set(new THREE.Vector3(x, 500, z), down);
  const hit = ray.intersectObject(terrainMesh, false)[0];
  return hit ? hit.point.y : null;
};

scene.add(buildRoadGroup(network, THREE, {terrain: sampleTerrain}));
```

Roads with `conform: 'design'` ignore the sampler and keep their authored Y.

## What the loader builds

- Carriageway + shoulders with camber and per-point width, vertex-coloured by
  surface preset (asphalt / concrete / gravel / dirt).
- Centre + edge paint as lifted strips (no z-fighting, no decals needed).
- Junction-linked endpoints resolve through the shared node, so welded roads
  always meet exactly.

Kerbs and guardrails are editor/OBJ-only. If you need them in-engine, export
the `.obj` from the editor and load it with `OBJLoader` instead — same units,
same up-axis, `o RoadName__part` groups per road.
