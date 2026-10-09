import { MeshBuilder, type MeshKind } from "./geometry";
import { siteOutline, sitePoint, insidePolygon, type Site } from "./sites";
import { add, sub, mul, lerp, normalXZ, distanceXZ, type V3 } from "./math";
import { buildLamp, buildSign } from "./road-details";

export function cylinder(
  b: MeshBuilder,
  kind: MeshKind,
  material: string,
  p: V3,
  r: number,
  height: number,
) {
  const ring = (y: number) =>
    Array.from({ length: 13 }, (_, i) =>
      add(p, [
        Math.cos((i * Math.PI) / 6) * r,
        y,
        Math.sin((i * Math.PI) / 6) * r,
      ]),
    );
  b.strip(kind, material, ring(-height / 2), ring(height / 2));
  b.polygon(kind, material, ring(height / 2).slice(0, -1), undefined, true);
  b.polygon(kind, material, ring(-height / 2).slice(0, -1), undefined, false);
}
function canopy(
  b: MeshBuilder,
  p: V3,
  r: number,
  height: number,
  material = "foliage",
) {
  const points: V3[] = [],
    indices: number[] = [];
  for (let y = 0; y <= 6; y++)
    for (let x = 0; x <= 12; x++) {
      const latitude = (y * Math.PI) / 6,
        longitude = (x * Math.PI) / 6;
      points.push(
        add(p, [
          Math.sin(latitude) * Math.cos(longitude) * r,
          Math.cos(latitude) * height,
          Math.sin(latitude) * Math.sin(longitude) * r,
        ]),
      );
    }
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 12; x++) {
      const a = y * 13 + x;
      indices.push(a, a + 1, a + 14, a, a + 14, a + 13);
    }
  b.append("landscape", material, points, indices);
}
function tree(b: MeshBuilder, p: V3, scale = 1) {
  cylinder(
    b,
    "landscape",
    "wood",
    add(p, [0, 1.35 * scale, 0]),
    0.12 * scale,
    2.7 * scale,
  );
  canopy(b, add(p, [0, 3 * scale, 0]), 1.6 * scale, 2.2 * scale);
}
function planter(b: MeshBuilder, site: Site, x: number, z: number) {
  const d: V3 = [
    -Math.sin((site.yaw * Math.PI) / 180),
    0,
    Math.cos((site.yaw * Math.PI) / 180),
  ];
  b.box("paving", "curb", sitePoint(site, x, z, 0.27), 3.1, 0.45, 3.1, d);
  b.box("landscape", "soil", sitePoint(site, x, z, 0.505), 2.7, 0.025, 2.7, d);
  tree(b, sitePoint(site, x, z, 0.5), 0.86);
}
function bench(b: MeshBuilder, site: Site, x: number, z: number) {
  const d: V3 = [
    -Math.sin((site.yaw * Math.PI) / 180),
    0,
    Math.cos((site.yaw * Math.PI) / 180),
  ];
  b.box("building", "wood", sitePoint(site, x, z, 0.58), 2.6, 0.12, 0.58, d);
  b.box(
    "building",
    "wood",
    sitePoint(site, x, z + 0.27, 0.9),
    2.6,
    0.58,
    0.08,
    d,
  );
  for (const side of [-1, 1])
    b.box(
      "building",
      "pole",
      sitePoint(site, x + side * 0.9, z, 0.34),
      0.08,
      0.5,
      0.5,
      d,
    );
}
function building(
  b: MeshBuilder,
  site: Site,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
) {
  const direction: V3 = [
    -Math.sin((site.yaw * Math.PI) / 180),
    0,
    Math.cos((site.yaw * Math.PI) / 180),
  ];
  b.box(
    "building",
    "facade",
    sitePoint(site, x, z, 0.14 + h / 2),
    w,
    h,
    d,
    direction,
  );
  b.box(
    "building",
    "pave-border",
    sitePoint(site, x, z, 0.17 + h),
    w + 0.45,
    0.25,
    d + 0.45,
    direction,
  );
  b.box(
    "building",
    "roof",
    sitePoint(site, x, z, h + 0.38),
    w - 0.5,
    0.18,
    d - 0.5,
    direction,
  );
  const floors = Math.floor(h / 3.3);
  for (let floor = 0; floor < floors; floor++) {
    const y = 1.8 + floor * 3.3;
    for (const side of [-1, 1]) {
      for (let u = -w / 2 + 1.7; u < w / 2 - 1; u += 3.3)
        b.box(
          "building",
          "glass",
          sitePoint(site, x + u, z + side * (d / 2 + 0.016), y),
          1.8,
          1.65,
          0.05,
          direction,
        );
      for (let u = -d / 2 + 1.7; u < d / 2 - 1; u += 3.3)
        b.box(
          "building",
          "glass",
          sitePoint(site, x + side * (w / 2 + 0.016), z + u, y),
          0.05,
          1.65,
          1.8,
          direction,
        );
    }
  }
  b.box(
    "building",
    "steel-dark",
    sitePoint(site, x + w * 0.18, z - d * 0.2, h + 0.9),
    Math.max(1, w * 0.2),
    0.8,
    Math.max(1, d * 0.16),
    direction,
  );
}
export function parkingLayout(site: Site) {
  const out: {
    x: number;
    z: number;
    width: number;
    side: number;
    accessible: boolean;
    number: number;
    aisle?: number;
  }[] = [];
  const footprint = siteOutline(site, 1.8);
  for (const side of [-1, 1]) {
    let bays = Math.max(
      0,
      Math.min(site.bays, Math.floor((site.width - 6) / 2.65)),
    );
    const total = (count: number) =>
      count * 2.65 +
      (side === -1
        ? Math.min(site.accessible, count) * 0.8 +
          (site.accessible > 0 ? 1.25 : 0)
        : 0);
    while (bays > 0 && total(bays) > site.width - 6) bays--;
    let cursor = -total(bays) / 2;
    for (let i = 0; i < bays; i++) {
      const accessible = side === -1 && i < site.accessible,
        width = accessible ? 3.45 : 2.65,
        x = cursor + width / 2,
        z = side * (site.depth / 2 - 4.8);
      cursor += width;
      const aisle =
        accessible && i === Math.min(site.accessible, bays) - 1
          ? cursor + 0.625
          : undefined;
      if (aisle !== undefined) cursor += 1.25;
      if (
        ((site.entrance === "north" && side === -1) ||
          (site.entrance === "south" && side === 1)) &&
        Math.abs(x) - width / 2 < 4.8
      )
        continue;
      if (
        ![-1, 1].every((a) =>
          [-1, 1].every((c) =>
            insidePolygon(
              sitePoint(site, x + a * (width / 2 - 0.05), z + c * 2.65),
              footprint,
            ),
          ),
        )
      )
        continue;
      out.push({
        x,
        z,
        width,
        side,
        accessible,
        number: out.length + 1,
        aisle,
      });
    }
  }
  return out;
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
  const mesh = b.target("marking", material),
    start = mesh.uvs.length;
  b.quad(
    "marking",
    material,
    [
      sitePoint(site, x - w / 2, z - d / 2, 0.15),
      sitePoint(site, x + w / 2, z - d / 2, 0.15),
      sitePoint(site, x + w / 2, z + d / 2, 0.15),
      sitePoint(site, x - w / 2, z + d / 2, 0.15),
    ],
    true,
  );
  [0, 0, 1, 0, 1, 1, 0, 1].forEach((v, i) => (mesh.uvs[start + i] = v));
}
export function buildSiteGeometry(site: Site) {
  const b = new MeshBuilder(site.id, "site"),
    outline = siteOutline(site),
    d: V3 = [
      -Math.sin((site.yaw * Math.PI) / 180),
      0,
      Math.cos((site.yaw * Math.PI) / 180),
    ];
  if (site.kind === "water") {
    b.polygon(
      "landscape",
      "water",
      siteOutline(site, 0, 0.015),
      undefined,
      true,
    );
    return b.output();
  }
  b.polygon(
    site.kind === "parking" ? "parking" : "paving",
    site.kind === "parking" ? "asphalt" : `paving-${site.pattern}`,
    outline,
    undefined,
    true,
  );
  const bottom = outline.map((p) => add(p, [0, -0.32, 0]));
  b.strip(
    "structure",
    "road-base",
    [...outline, outline[0]],
    [...bottom, bottom[0]],
  );
  b.polygon("structure", "road-base", bottom, undefined, false);
  const border = siteOutline(site, 0.2, 0.126);
  b.strip(
    "paving",
    "pave-border",
    [...outline, outline[0]],
    [...border, border[0]],
    true,
  );
  if (site.kind === "parking") {
    const local = (p: V3) => {
      const q = sub(p, site.position),
        angle = (-site.yaw * Math.PI) / 180;
      return [
        q[0] * Math.cos(angle) - q[2] * Math.sin(angle),
        q[0] * Math.sin(angle) + q[2] * Math.cos(angle),
      ];
    };
    const curbTop = siteOutline(site, 0, 0.25),
      rim = siteOutline(site, 1.7, 0.13);
    b.strip(
      "paving",
      `paving-${site.pattern}`,
      [...border, border[0]],
      [...rim, rim[0]],
      true,
    );
    const innerCurb = siteOutline(site, 0.2, 0.25),
      innerBase = siteOutline(site, 0.2, 0.12);
    for (let i = 0; i < outline.length; i++) {
      const k = (i + 1) % outline.length,
        steps = Math.max(
          1,
          Math.ceil(distanceXZ(outline[i], outline[k]) / 1.5),
        );
      for (let part = 0; part < steps; part++) {
        const t = part / steps,
          u = (part + 1) / steps,
          [x, z] = local(lerp(outline[i], outline[k], (t + u) / 2));
        const open =
          site.entrance === "north"
            ? z < -site.depth / 2 + 0.6 && Math.abs(x) < 4.8
            : site.entrance === "south"
              ? z > site.depth / 2 - 0.6 && Math.abs(x) < 4.8
              : site.entrance === "east"
                ? x > site.width / 2 - 0.6 && Math.abs(z) < 4.8
                : x < -site.width / 2 + 0.6 && Math.abs(z) < 4.8;
        if (open) continue;
        const outer = (v: number) => lerp(outline[i], outline[k], v),
          top = (v: number) => lerp(curbTop[i], curbTop[k], v),
          inTop = (v: number) => lerp(innerCurb[i], innerCurb[k], v),
          inBase = (v: number) => lerp(innerBase[i], innerBase[k], v);
        b.quad("curb", "curb", [outer(t), outer(u), top(u), top(t)]);
        b.quad("curb", "curb", [top(t), top(u), inTop(u), inTop(t)], true);
        b.quad("curb", "curb", [inTop(t), inTop(u), inBase(u), inBase(t)]);
      }
    }
    const layout = parkingLayout(site);
    for (const slot of layout) {
      if (slot.accessible) {
        b.box(
          "parking",
          "accessible-blue",
          sitePoint(site, slot.x, slot.z, 0.128),
          slot.width - 0.15,
          0.008,
          5.05,
          d,
        );
        groundDecal(b, site, slot.x, slot.z, 1.4, 1.4, "marking-accessible");
      }
      for (const side of [-1, 1])
        b.box(
          "marking",
          "paint",
          sitePoint(
            site,
            slot.x + side * (slot.width / 2 - 0.06),
            slot.z,
            0.143,
          ),
          0.095,
          0.015,
          5.2,
          d,
        );
      b.box(
        "marking",
        "paint",
        sitePoint(site, slot.x, slot.z + slot.side * 2.6, 0.143),
        slot.width - 0.1,
        0.015,
        0.095,
        d,
      );
      b.box(
        "parking",
        "wheel-stop",
        sitePoint(site, slot.x, slot.z + slot.side * 2.05, 0.19),
        1.6,
        0.12,
        0.16,
        d,
      );
      if (slot.aisle !== undefined) {
        for (let z = -2.2; z < 2.2; z += 0.6) {
          const p = sitePoint(site, slot.aisle - 0.5, slot.z + z, 0.146),
            q = sitePoint(site, slot.aisle + 0.5, slot.z + z + 0.4, 0.146),
            delta = sub(q, p),
            n = normalXZ(delta);
          b.quad(
            "marking",
            "paint",
            [
              add(p, mul(n, -0.045)),
              add(p, mul(n, 0.045)),
              add(q, mul(n, 0.045)),
              add(q, mul(n, -0.045)),
            ],
            true,
          );
        }
      }
      if (!slot.accessible)
        groundDecal(
          b,
          site,
          slot.x,
          slot.z + slot.side * 1.1,
          0.85,
          0.85,
          `marking-bay-${slot.number}`,
        );
    }
    buildSign(
      b,
      sitePoint(site, -site.width / 2 + 2, -site.depth / 2 + 2, 0.14),
      mul(d, -1),
      "parking",
    );
    if (site.landscape)
      for (const x of [-site.width / 2 + 3, site.width / 2 - 3])
        for (const z of [-site.depth / 2 + 3, site.depth / 2 - 3])
          planter(b, site, x, z);
    for (const side of [-1, 1])
      buildLamp(
        b,
        sitePoint(site, side * (site.width / 2 - 2), 0, 0.13),
        mul(d, side),
        6.5,
      );
  } else if (site.kind === "island") {
    const inner = siteOutline(site, 2, 0.19);
    b.polygon("landscape", "grass", inner, undefined, true);
    b.strip(
      "curb",
      "curb",
      [...inner, inner[0]],
      [
        ...inner.map((p) => add(p, [0, -0.04, 0])),
        add(inner[0], [0, -0.04, 0]),
      ],
    );
    if (site.landscape) {
      const polygon = siteOutline(site, 3);
      const spacing = Math.max(3.8, Math.sqrt((site.width * site.depth) / 75));
      for (let x = -site.width / 2 + 4; x < site.width / 2 - 2; x += spacing)
        for (
          let z = -site.depth / 2 + 4;
          z < site.depth / 2 - 2;
          z += spacing
        ) {
          const p = sitePoint(site, x, z, 0.3);
          if (insidePolygon(p, polygon))
            canopy(
              b,
              p,
              0.5,
              0.34,
              Math.round(x + z) % 3 === 0 ? "flowers" : "foliage",
            );
        }
    }
    cylinder(
      b,
      "building",
      "steel-dark",
      sitePoint(site, -site.width * 0.1, -site.depth * 0.1, 1.45),
      0.25,
      2.6,
    );
  } else if (site.kind === "block") {
    const inner = siteOutline(site, 3.5, 0.13);
    b.polygon("landscape", "grass", inner, undefined, true);
    if (site.buildingHeight > 0 && site.width > 20 && site.depth > 22) {
      if (site.shape === "triangle")
        building(
          b,
          site,
          -site.width * 0.23,
          -site.depth * 0.23,
          site.width * 0.22,
          site.depth * 0.26,
          site.buildingHeight,
        );
      else {
        building(
          b,
          site,
          -site.width * 0.21,
          0,
          site.width * 0.27,
          site.depth * 0.54,
          site.buildingHeight,
        );
        building(
          b,
          site,
          site.width * 0.22,
          site.depth * 0.07,
          site.width * 0.25,
          site.depth * 0.4,
          site.buildingHeight * 0.72,
        );
      }
    }
    if (site.landscape)
      for (const x of [-site.width / 2 + 4.8, site.width / 2 - 4.8])
        for (let z = -site.depth / 2 + 5; z < site.depth / 2 - 3; z += 14) {
          const p = sitePoint(site, x, z, 0.12);
          if (insidePolygon(p, siteOutline(site, 3))) tree(b, p, 0.9);
        }
    for (const x of [-site.width / 2 + 2.2, site.width / 2 - 2.2])
      bench(b, site, x, site.depth / 2 - 3.2);
  } else {
    const middle = siteOutline(site, 2.2, 0.126);
    b.strip(
      "paving",
      "paving-slate",
      [...middle, middle[0]],
      [...siteOutline(site, 2.65, 0.126), siteOutline(site, 2.65, 0.126)[0]],
      true,
    );
    if (site.landscape)
      for (const x of site.shape === "circle"
        ? [-site.width * 0.22, site.width * 0.22]
        : [-site.width / 2 + 4.5, site.width / 2 - 4.5])
        for (const z of site.shape === "circle"
          ? [-site.depth * 0.22, site.depth * 0.22]
          : [-site.depth / 2 + 4.5, site.depth / 2 - 4.5]) {
          planter(b, site, x, z);
          bench(b, site, x, z + 2.3);
        }
    for (const side of [-1, 1])
      buildLamp(
        b,
        sitePoint(site, side * (site.width / 2 - 2), 0, 0.13),
        mul(d, side),
        5.5,
      );
  }
  return b.output();
}
