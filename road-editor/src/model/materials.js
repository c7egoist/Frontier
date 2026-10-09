// Material catalogue shared by the 3D renderer and the OBJ/MTL exporter.
// tile: metres per texture repeat (UVs are in metres in the mesh).
// texture: name of a procedural pattern in render/textures.js (null = flat colour).

export const MATERIALS = {
  asphalt: { label: 'Asphalt', color: '#3a3e44', roughness: 0.93, tile: 4, texture: 'asphalt' },
  gutter: { label: 'Gutter channel', color: '#6b6f75', roughness: 0.85, tile: 2, texture: 'concrete' },
  concrete: { label: 'Concrete', color: '#b8bcc1', roughness: 0.8, tile: 2.5, texture: 'concrete' },
  'pave:concrete-slab': { label: 'Concrete slab paving', color: '#c9cbc7', roughness: 0.75, tile: 1.5, texture: 'slab' },
  'pave:brick-herringbone': { label: 'Brick herringbone', color: '#9c5c45', roughness: 0.85, tile: 1.6, texture: 'herringbone' },
  'pave:brick-running': { label: 'Brick running bond', color: '#a96b4f', roughness: 0.85, tile: 1.2, texture: 'brick' },
  'pave:cobble': { label: 'Granite setts', color: '#7f7b74', roughness: 0.9, tile: 1.2, texture: 'cobble' },
  'pave:paver-grid': { label: 'Grid pavers', color: '#8e9a8e', roughness: 0.8, tile: 1, texture: 'paver' },
  'pave:gravel': { label: 'Gravel', color: '#b5a88a', roughness: 1, tile: 3, texture: 'gravel' },
  ditch: { label: 'Ditch', color: '#4e5a42', roughness: 1, tile: 3, texture: 'grass' },
  batter: { label: 'Batter (grass)', color: '#6c7c4e', roughness: 1, tile: 4, texture: 'grass' },
  steel: { label: 'Steel guardrail', color: '#a3acb6', roughness: 0.4, metalness: 0.6, tile: 1, texture: null },
  grate: { label: 'Drain grate', color: '#3b3e43', roughness: 0.6, metalness: 0.5, tile: 1, texture: null },
  'paint-white': { label: 'White marking', color: '#f4f4f0', roughness: 0.7, tile: 1, texture: null, decal: true },
  'paint-yellow': { label: 'Yellow marking', color: '#e9c24d', roughness: 0.7, tile: 1, texture: null, decal: true },
};

export const SURFACE_CHOICES = ['asphalt', 'pave:brick-herringbone', 'pave:brick-running', 'pave:cobble', 'pave:paver-grid', 'pave:concrete-slab', 'pave:gravel'];
export const SIDEWALK_CHOICES = ['pave:concrete-slab', 'pave:brick-running', 'pave:paver-grid', 'pave:cobble', 'pave:gravel', 'concrete'];

export function materialOf(key) {
  return MATERIALS[key] || MATERIALS.asphalt;
}
