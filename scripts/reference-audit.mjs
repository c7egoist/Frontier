import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTemplate } from "../src/core/model.ts";
import { buildNetwork, edgePoint } from "../src/core/geometry.ts";
import { referenceLayout, designSources } from "../src/core/design-controls.ts";

const output = "docs/reference-layouts";
await mkdir(output, { recursive: true });
const summary = {};
const escape = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
for (const id of ["diamond", "cloverleaf", "trumpet"]) {
  const p = makeTemplate(id),
    n = buildNetwork(p),
    review = n.designReview;
  assert.deepEqual(n.diagnostics, []);
  assert(review.withinSelectedTargets);
  summary[id] = {
    roads: p.roads.length,
    extentIncludingApproachTails: review.extent,
    structuralLength: review.bridgeLength,
    structuralSpans: n.bridges.map((b) => ({
      planLength: Math.hypot(b.end[0] - b.start[0], b.end[2] - b.start[2]),
      girderCount: b.girderCount,
      girderSpacing: b.girderSpacing,
      supportedLengths: b.spanLengths,
      depth: b.depth,
      abutments: b.abutments.length,
    })),
    maximumAlignmentGrade: n.maxGrade,
    minimumStructuralClearance: review.minimumClearance,
    minimumLoopRadius: review.roads.some((r) => r.role === "loop")
      ? Math.min(
          ...review.roads
            .filter((r) => r.role === "loop")
            .map((r) => r.minimumRadius),
        )
      : null,
    measuredWeaveSpacing: review.weaves.map((w) => ({
      nodeSpacing: w.nodeSpacing,
      noseSpacing: w.noseSpacing,
    })),
    speedChangeLanes: n.auxiliaryLanes.map((a) => ({
      kind: a.kind,
      fullWidthLength: a.fullWidthLength,
      taperLength: a.taperLength,
    })),
  };
  // Draw original dimensioned schematics from the ACTUAL generated road edges
  // and fitted junction boundaries, not a generic thumbnail or copied manual.
  const box =
    id === "diamond"
      ? [-380, -800, 380, 800]
      : id === "cloverleaf"
        ? [-1050, -1050, 1050, 1050]
        : [-900, -1250, 850, 800];
  const width = 1100,
    height = 1100,
    margin = 78,
    scale = Math.min(
      (width - 2 * margin) / (box[2] - box[0]),
      (height - 240) / (box[3] - box[1]),
    ),
    ox = (width - (box[2] - box[0]) * scale) / 2 - box[0] * scale,
    oy = 130 - box[1] * scale,
    xy = (p) => [ox + p[0] * scale, oy + p[2] * scale],
    point = (p) =>
      xy(p)
        .map((v) => v.toFixed(2))
        .join(","),
    text = (p, content, anchor = "middle") => {
      const [x, y] = xy(p);
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="14" fill="#282828" paint-order="stroke" stroke="#fafafa" stroke-width="4">${escape(content)}</text>`;
    },
    dimension = (a, b, label) => {
      const [x, y] = xy(a),
        [z, w] = xy(b);
      return (
        `<path d="M${x},${y}L${z},${w}" fill="none" stroke="#4c4c4c" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>` +
        text([(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2 - 18 / scale], label)
      );
    };
  const shapes = [];
  for (const span of n.spans) {
    const fs = span.frames.filter(
      (_, i) => i === 0 || i === span.frames.length - 1 || i % 3 === 0,
    );
    const poly = [
      ...fs.map((f) => edgePoint(f, -1, "road")),
      ...fs.toReversed().map((f) => edgePoint(f, 1, "road")),
    ];
    shapes.push({
      y: fs.reduce((s, f) => s + f.p[1], 0) / fs.length,
      html: `<polygon points="${poly.map(point).join(" ")}" fill="#4d4d4d" stroke="#ededed" stroke-width=".55"/>`,
    });
  }
  for (const j of n.junctions)
    shapes.push({
      y: j.node.position[1],
      html: `<polygon points="${j.boundary.map(point).join(" ")}" fill="#4d4d4d" stroke="#ededed" stroke-width=".55"/>`,
    });
  shapes.sort((a, b) => a.y - b.y);
  let annotations = "";
  for (const b of n.bridges) {
    const a = xy(b.start),
      z = xy(b.end);
    annotations += `<path d="M${a[0]},${a[1]}L${z[0]},${z[1]}" stroke="#f4f4f4" stroke-width="2.3"/>`;
  }
  if (id === "diamond") {
    annotations += dimension(
      [-130, 0, 105],
      [130, 0, 105],
      "260 m terminal centres",
    );
    annotations += dimension([-55, 0, -24], [-55, 0, 24], "48 m deck");
    annotations += text([-255, 0, -540], "150 m exit run + 90 m taper");
    annotations += text([220, 0, 565], "200 m entry run + 90 m taper");
  } else if (id === "cloverleaf") {
    annotations += dimension([152, 0, 152], [272, 0, 152], "R 120 m nominal");
    annotations += dimension(
      [-152, 0, 65],
      [152, 0, 65],
      "304 m C-D node spacing",
    );
    annotations += text([0, 0, -330], "410.6 m measured gore nose spacing");
    annotations += text(
      [0, 0, -510],
      "Mainline + separate collector-distributors",
    );
    annotations += text(
      [0, 0, 560],
      "Four 96 m overpasses, not elevated approach viaducts",
    );
  } else {
    annotations += dimension([-32, 0, 90], [52, 0, 90], "84 m stem decks");
    annotations += text([180, 0, -75], "One 270° loop / R 120 m");
    annotations += text([470, 0, -535], "Outer semi-direct connector");
  }
  const bar = 200 * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${id} dimensioned metric road schematic"><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M10 0L0 5L10 10" fill="none" stroke="#4c4c4c"/></marker><clipPath id="plan"><rect x="28" y="110" width="1044" height="850"/></clipPath></defs><rect width="1100" height="1100" fill="#fafafa"/><g font-family="Arial, sans-serif"><text x="55" y="49" font-size="26" fill="#202020">${escape(id === "diamond" ? "Conventional diamond" : id === "cloverleaf" ? "Collector-distributor cloverleaf" : "Single-loop trumpet")}</text><text x="55" y="80" font-size="15" fill="#595959">Original schematic from the generated mesh edges · metres · ${n.bridges.length} structural spans</text><g clip-path="url(#plan)">${shapes.map((s) => s.html).join("")}${annotations}</g><path d="M65 996h${bar}" stroke="#303030" stroke-width="3"/><text x="65" y="1022" font-size="14">200 m</text><text x="55" y="1060" font-size="14" fill="#595959">Min modeled clearance ${review.minimumClearance.toFixed(3)} m · max alignment grade ${n.maxGrade.toFixed(2)}% · geometry only, not civil certification.</text></g></svg>`;
  await writeFile(`${output}/${id}.svg`, svg);
}
await writeFile(
  `${output}/measurements.json`,
  JSON.stringify(
    {
      units: "metres",
      selectedBasis: referenceLayout,
      sources: designSources,
      layouts: summary,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
