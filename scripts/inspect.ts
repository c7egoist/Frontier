// Numeric inspection: patch areas, normals, bounds (diagnose black junction + bridge).
import { demoProject } from '../src/lib/model';
import { buildNetwork } from '../src/lib/network';
import type { PatchSpec } from '../src/lib/roadGeometry';
import type { Vec3 } from '../src/lib/vec';

function triStats(grid: Vec3[][]) {
  const rows = grid.length; const cols = grid[0].length;
  let n = 0; let degen = 0; let area = 0;
  let nx = 0; let ny = 0; let nz = 0;
  let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9; let minZ = 1e9; let maxZ = -1e9;
  const tri = (a: Vec3, b: Vec3, c: Vec3) => {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    // cross u x v
    const cx = uy * vz - uz * vy; const cy = uz * vx - ux * vz; const cz = ux * vy - uy * vx;
    const A = 0.5 * Math.hypot(cx, cy, cz);
    n++; area += A;
    if (A < 1e-10) degen++;
    else { nx += cx; ny += cy; nz += cz; }
  };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const p = grid[i][j];
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    // same triangulation as PatchMesh: (a,d,b),(b,d,c)
    const a = grid[i][j]; const b = grid[i][j + 1];
    const c = grid[i + 1][j + 1]; const d = grid[i + 1][j];
    tri(a, d, b); tri(b, d, c);
  }
  const nl = Math.hypot(nx, ny, nz) || 1;
  return { n, degen, area, normal: [nx / nl, ny / nl, nz / nl] as Vec3, bounds: { minX, maxX, minY, maxY, minZ, maxZ } };
}

const project = demoProject();
const net = buildNetwork(project);

console.log('=== JUNCTIONS ===');
for (const j of net.junctions) {
  console.log(`-- ${j.id} ${j.topology} pos=${j.position.map((v) => v.toFixed(1))} patches=${j.patches.length}`);
  const groups = new Map<string, { n: number; degen: number; area: number; nz: number[] }>();
  for (const p of j.patches) {
    const s = triStats(p.grid);
    const key = p.name.replace(/ \d+[ab]?$/, '');
    const g = groups.get(key) ?? { n: 0, degen: 0, area: 0, nz: [] };
    g.n += s.n; g.degen += s.degen; g.area += s.area; g.nz.push(s.normal[2]);
    groups.set(key, g);
    if (s.degen > 0 || s.area < 1e-6) {
      console.log(`   DEGEN? ${p.name} grid=${p.grid.length}x${p.grid[0].length} tris=${s.n} degen=${s.degen} area=${s.area.toFixed(4)} n=${s.normal.map((v) => v.toFixed(2))}`);
    }
  }
  for (const [k, g] of groups) {
    console.log(`   ${k}: tris=${g.n} degen=${g.degen} area=${g.area.toFixed(1)} meannz=${(g.nz.reduce((a, b) => a + b, 0) / g.nz.length).toFixed(2)}`);
  }
}

console.log('=== SPANS ===');
for (const s of net.spans) {
  const nm = project.splines.find((x) => x.id === s.splineId)?.name ?? '?';
  let degen = 0; let area = 0; let n = 0;
  for (const p of s.patches) {
    const t = triStats(p.grid);
    n += t.n; degen += t.degen; area += t.area;
  }
  console.log(`-- ${nm} kind=${s.kind} patches=${s.patches.length} tris=${n} degen=${degen} area=${area.toFixed(0)}`);
}

// bridge rail/post positions vs deck edge (are posts floating?)
console.log('=== BRIDGE EDGE DETAIL ===');
const bridge = net.spans.find((s) => project.splines.find((x) => x.id === s.splineId)?.name === 'Lake Bridge');
if (bridge) {
  for (const p of bridge.patches.slice(0, 0)) void p;
  const byName = new Map<string, PatchSpec[]>();
  for (const p of bridge.patches) {
    const key = p.name.replace(/ \d+.*$/, '');
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }
  for (const [k, v] of byName) console.log(`   ${k}: x${v.length}`);
}
