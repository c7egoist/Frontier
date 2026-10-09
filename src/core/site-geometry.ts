import { MeshBuilder } from "./geometry";
import { siteOutline, sitePoint, insidePolygon, type Site } from "./sites";
import {
  add,
  sub,
  mul,
  lerp,
  normalXZ,
  normalizeXZ,
  distanceXZ,
  type V3,
} from "./math";

export interface ParkingBay {
  x: number;
  z: number;
  width: number;
  depth: number;
  side: number;
  angle: number;
  row: number;
  accessible: boolean;
  number: number;
  aisle?: number;
  corners: [number, number][];
  transferCorners?: [number, number][];
}
export interface ParkingPlan {
  bays: ParkingBay[];
  rows: number;
  aisles: { z: number; width: number }[];
  spine: { x: number; z: number; width: number; depth: number };
  rowDepth: number;
  warnings: string[];
}
/** Metric module solver. Footprint changes regenerate rows, stalls and circulation. */
export function parkingPlan(site: Site): ParkingPlan {
  const angle = (site.parkingAngle * Math.PI) / 180,
    sin = Math.sin(angle),
    cos = Math.cos(angle),
    rim = site.perimeterWidth + 0.22,
    coreW = site.width - 2 * rim,
    coreD = site.depth - 2 * rim,
    rowDepth =
      site.bayDepth * sin +
      Math.max(
        site.bayWidth,
        site.accessible ? Math.max(3.6, site.bayWidth + 1) : 0,
      ) *
        cos,
    aisle = site.aisleWidth,
    moduleDepth = rowDepth * 2 + aisle,
    pairs =
      site.parkingLayout === "single"
        ? 0
        : Math.max(0, Math.floor(coreD / moduleDepth)),
    count = site.parkingLayout === "double" ? Math.min(1, pairs) : pairs,
    single = site.parkingLayout === "single" && coreD >= rowDepth + aisle,
    footprint = siteOutline(site, rim),
    bays: ParkingBay[] = [],
    aisles: ParkingPlan["aisles"] = [],
    warnings: string[] = [];
  const ns = site.entrance === "north" || site.entrance === "south",
    entry = site.entryWidth,
    spine = {
      x: ns
        ? 0
        : (site.entrance === "west" ? -1 : 1) *
          (site.width / 2 - rim - entry / 2),
      z: 0,
      width: entry,
      depth: coreD,
    };
  const rowSpecs: { z: number; side: number; row: number }[] = [];
  if (single) {
    const z = -coreD / 2 + rowDepth / 2;
    rowSpecs.push({ z, side: -1, row: 0 });
    aisles.push({ z: z + rowDepth / 2 + aisle / 2, width: aisle });
  } else
    for (let i = 0; i < count; i++) {
      const z = (i - (count - 1) / 2) * moduleDepth;
      aisles.push({ z, width: aisle });
      rowSpecs.push(
        { z: z - aisle / 2 - rowDepth / 2, side: -1, row: i * 2 },
        { z: z + aisle / 2 + rowDepth / 2, side: 1, row: i * 2 + 1 },
      );
    }
  if (!rowSpecs.length)
    warnings.push(
      "Footprint is too shallow for the selected bay and aisle dimensions.",
    );
  let accessibleLeft = site.accessible;
  const priority =
    site.entrance === "south" ? [...rowSpecs].reverse() : rowSpecs;
  for (const spec of priority) {
    const minX = -coreW / 2 + (site.entrance === "west" ? entry : 0),
      maxX = coreW / 2 - (site.entrance === "east" ? entry : 0);
    const segments = ns
        ? [
            [minX, -entry / 2 - 0.15],
            [entry / 2 + 0.15, maxX],
          ]
        : [[minX, maxX]],
      rowCandidates: ParkingBay[] = [];
    for (const [lo, hi] of segments) {
      let cursor = lo + 0.32 + (site.bayDepth * cos) / 2,
        used = 0;
      while (cursor < hi && used < 90) {
        let accessible = accessibleLeft > 0;
        if (
          accessible &&
          hi - cursor <
            Math.max(3.6, site.bayWidth + 1) / sin + 1.25 / sin + 0.32
        )
          accessible = false;
        const width = accessible
            ? Math.max(3.6, site.bayWidth + 1)
            : site.bayWidth,
          pitch = width / sin,
          x = cursor + pitch / 2,
          depth = site.bayDepth,
          side = spec.side,
          forward: [number, number] = [cos * side, sin * side],
          right: [number, number] = [sin, -cos],
          corners: [number, number][] = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([a, b]) => [
            x + (right[0] * a * width) / 2 + (forward[0] * b * depth) / 2,
            spec.z + (right[1] * a * width) / 2 + (forward[1] * b * depth) / 2,
          ]);
        cursor += pitch;
        used++;
        if (site.bays > 0 && rowCandidates.length >= site.bays) break;
        const xMin = Math.min(...corners.map((p) => p[0])),
          xMax = Math.max(...corners.map((p) => p[0]));
        if (xMax > hi - 0.12 || xMin < lo + 0.05) continue;
        if (
          !corners.every(([x, z]) =>
            insidePolygon(sitePoint(site, x, z), footprint),
          )
        )
          continue;
        const transfer = accessible ? 1.25 / sin : 0;
        if (transfer && xMax + transfer > hi - 0.05) continue;
        const transferCorners: [number, number][] | undefined = accessible
          ? [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([a, b]) => [
              x +
                right[0] * (width / 2 + 0.625 + a * 0.625) +
                (forward[0] * b * depth) / 2,
              spec.z +
                right[1] * (width / 2 + 0.625 + a * 0.625) +
                (forward[1] * b * depth) / 2,
            ])
          : undefined;
        if (
          transferCorners &&
          !transferCorners.every(([x, z]) =>
            insidePolygon(sitePoint(site, x, z), footprint),
          )
        )
          continue;
        rowCandidates.push({
          x,
          z: spec.z,
          width,
          depth,
          side,
          angle: site.parkingAngle,
          row: spec.row,
          accessible,
          number: 0,
          corners,
          aisle: accessible ? xMax + transfer / 2 : undefined,
          transferCorners,
        });
        if (accessible) {
          accessibleLeft--;
          cursor += transfer;
        }
      }
    }
    bays.push(...rowCandidates);
  }
  bays
    .sort((a, b) => a.row - b.row || a.x - b.x)
    .forEach((b, i) => (b.number = i + 1));
  if (accessibleLeft > 0)
    warnings.push(
      `${accessibleLeft} requested accessible spaces do not fit the current footprint.`,
    );
  return { bays, rows: rowSpecs.length, aisles, spine, rowDepth, warnings };
}
export const parkingLayout = (site: Site) => parkingPlan(site).bays;

function localPoint(site: Site, p: V3): [number, number] {
  const q = sub(p, site.position),
    a = (-site.yaw * Math.PI) / 180;
  return [
    q[0] * Math.cos(a) - q[2] * Math.sin(a),
    q[0] * Math.sin(a) + q[2] * Math.cos(a),
  ];
}
function openEntry(site: Site, p: V3) {
  const [x, z] = localPoint(site, p),
    h = site.entryWidth / 2;
  return site.entrance === "north"
    ? z < -site.depth / 2 + 0.6 && Math.abs(x) < h
    : site.entrance === "south"
      ? z > site.depth / 2 - 0.6 && Math.abs(x) < h
      : site.entrance === "east"
        ? x > site.width / 2 - 0.6 && Math.abs(z) < h
        : x < -site.width / 2 + 0.6 && Math.abs(z) < h;
}
function paintLine(
  b: MeshBuilder,
  site: Site,
  a: [number, number],
  z: [number, number],
  width = 0.095,
  material = "paint",
) {
  const p = sitePoint(site, ...a, 0.124),
    q = sitePoint(site, ...z, 0.124),
    n = mul(normalXZ(normalizeXZ(sub(q, p))), width / 2);
  b.quad(
    "marking",
    material,
    [sub(p, n), add(p, n), add(q, n), sub(q, n)],
    true,
  );
}
function groundDecal(
  b: MeshBuilder,
  site: Site,
  x: number,
  z: number,
  w: number,
  d: number,
  material: string,
) {
  const m = b.target("marking", material),
    start = m.uvs.length;
  b.quad(
    "marking",
    material,
    [
      sitePoint(site, x - w / 2, z - d / 2, 0.125),
      sitePoint(site, x + w / 2, z - d / 2, 0.125),
      sitePoint(site, x + w / 2, z + d / 2, 0.125),
      sitePoint(site, x - w / 2, z + d / 2, 0.125),
    ],
    true,
  );
  [0, 0, 1, 0, 1, 1, 0, 1].forEach((v, i) => (m.uvs[start + i] = v));
}
/** No environment dressing is generated. Legacy architecture/water is excluded. */
export function buildSiteGeometry(site: Site) {
  if (site.kind === "block" || site.kind === "water") return [];
  const b = new MeshBuilder(site.id, "site"),
    outline = siteOutline(site),
    close = (row: V3[]) => [...row, row[0]];
  b.polygon(
    site.kind === "parking" ? "parking" : "paving",
    site.kind === "parking" ? "asphalt" : `paving-${site.pattern}`,
    outline,
    undefined,
    true,
  );
  const bottom = outline.map((p) => add(p, [0, -0.3, 0]));
  b.strip("structure", "road-base", close(outline), close(bottom));
  b.polygon("structure", "road-base", bottom, undefined, false);
  const inner = siteOutline(
      site,
      site.kind === "parking" ? site.perimeterWidth : 0.18,
      0.121,
    ),
    outer = siteOutline(site, 0.02, 0.121);
  b.strip("paving", `paving-${site.pattern}`, close(outer), close(inner), true);
  const curbRows = [
    siteOutline(site, 0, 0.12),
    siteOutline(site, 0, 0.252),
    siteOutline(site, 0.016, 0.268),
    siteOutline(site, 0.184, 0.268),
    siteOutline(site, 0.2, 0.252),
    siteOutline(site, 0.2, 0.121),
  ];
  for (let i = 0; i < outline.length; i++) {
    const k = (i + 1) % outline.length,
      steps = Math.max(1, Math.ceil(distanceXZ(outline[i], outline[k]) / 1.2));
    for (let part = 0; part < steps; part++) {
      const t = part / steps,
        u = (part + 1) / steps;
      if (
        site.kind === "parking" &&
        openEntry(site, lerp(outline[i], outline[k], (t + u) / 2))
      )
        continue;
      for (let row = 0; row < curbRows.length - 1; row++) {
        const a = curbRows[row],
          z = curbRows[row + 1];
        b.quad(
          "curb",
          "curb",
          [
            lerp(a[i], a[k], t),
            lerp(a[i], a[k], u),
            lerp(z[i], z[k], u),
            lerp(z[i], z[k], t),
          ],
          row === 1 || row === 2 || row === 3,
        );
      }
    }
  }
  if (site.kind === "parking") {
    const plan = parkingPlan(site);
    for (const slot of plan.bays) {
      const [a, z, c, d] = slot.corners;
      paintLine(b, site, a, d);
      paintLine(b, site, z, c);
      paintLine(b, site, d, c);
      if (slot.accessible) {
        groundDecal(b, site, slot.x, slot.z, 1.05, 1.05, "marking-accessible");
        if (slot.transferCorners) {
          const [p, q, r, z] = slot.transferCorners;
          for (let t = 0.08; t < 0.95; t += 0.11) {
            const u = Math.min(0.97, t + 0.06),
              a: [number, number] = [
                p[0] + (z[0] - p[0]) * t,
                p[1] + (z[1] - p[1]) * t,
              ],
              end: [number, number] = [
                q[0] + (r[0] - q[0]) * u,
                q[1] + (r[1] - q[1]) * u,
              ];
            paintLine(b, site, a, end, 0.08);
          }
        }
      }
      if (site.numbering)
        groundDecal(
          b,
          site,
          slot.x,
          slot.z + slot.side * (site.bayDepth / 2 - 0.55),
          0.5,
          0.5,
          `marking-bay-${slot.number}`,
        );
    }
    // Circulation arrows are positioned only in verified driveable aisles.
    for (const aisle of plan.aisles) {
      for (const x of [-site.width * 0.24, site.width * 0.24]) {
        const direction = x < 0 ? 1 : -1,
          z = aisle.z;
        paintLine(
          b,
          site,
          [x - direction * 0.7, z],
          [x + direction * 0.7, z],
          0.11,
        );
        paintLine(
          b,
          site,
          [x + direction * 0.7, z],
          [x + direction * 0.18, z - 0.35],
          0.11,
        );
        paintLine(
          b,
          site,
          [x + direction * 0.7, z],
          [x + direction * 0.18, z + 0.35],
          0.11,
        );
      }
    }
    // Shallow perimeter drainage detail, entirely in the paved edge course.
    for (const side of [-1, 1])
      for (let x = -site.width / 2 + 3; x < site.width / 2 - 2; x += 12) {
        const z = side * (site.depth / 2 - 0.55),
          center = sitePoint(site, x, z, 0.13),
          dir: V3 = [
            -Math.sin((site.yaw * Math.PI) / 180),
            0,
            Math.cos((site.yaw * Math.PI) / 180),
          ];
        if (openEntry(site, sitePoint(site, x, (side * site.depth) / 2)))
          continue;
        b.box("drain", "steel-dark", center, 0.6, 0.014, 0.28, dir);
        for (let g = -0.24; g < 0.26; g += 0.06)
          b.box(
            "drain",
            "drain-dark",
            sitePoint(site, x + g, z, 0.138),
            0.021,
            0.002,
            0.21,
            dir,
          );
      }
  } else if (site.kind === "island") {
    const center = siteOutline(site, 1.2, 0.124);
    b.polygon("paving", "paving-slate", center, undefined, true);
  }
  return b.output();
}
