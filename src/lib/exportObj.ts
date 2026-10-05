// OBJ export — dumps the built network (road space) as world-space OBJ.

import { roadToWorld } from './vec';
import type { BuiltNetwork } from './network';

export function networkToObj(net: BuiltNetwork, name: string): string {
  const lines: string[] = [`# ${name} — RoadWorks Editor`, ''];
  let vi = 1;
  let oi = 0;

  const pushPatches = (tag: string, patches: BuiltNetwork['spans'][number]['patches']) => {
    for (const p of patches) {
      const rows = p.grid.length;
      if (rows === 0) continue;
      const cols = p.grid[0].length;
      if (cols === 0) continue;
      oi += 1;
      const safe = `${tag}_${p.name}`.replace(/[^A-Za-z0-9_]+/g, '_');
      lines.push(`o ${safe}_${oi}`);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const w = roadToWorld(p.grid[i][j]);
          lines.push(`v ${w[0].toFixed(4)} ${w[1].toFixed(4)} ${w[2].toFixed(4)}`);
        }
      }
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = vi + i * cols + j;
          const b = vi + i * cols + (j + 1);
          const c = vi + (i + 1) * cols + (j + 1);
          const d = vi + (i + 1) * cols + j;
          lines.push(`f ${a} ${d} ${b}`);
          lines.push(`f ${b} ${d} ${c}`);
        }
      }
      lines.push('');
      vi += rows * cols;
    }
  };

  net.spans.forEach((s, i) => pushPatches(`span${i}`, s.patches));
  net.junctions.forEach((j, i) => pushPatches(`junction${i}`, j.patches));
  return lines.join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
