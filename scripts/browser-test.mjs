import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium as playwright } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { unzipSync } from "fflate";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const cache = resolve(".cache/browser");
await mkdir(cache, { recursive: true });
// The npm-distributed headless browser makes this reproducible in minimal
// Linux sandboxes without downloading from an additional browser CDN.
const env = { ...process.env, FONTCONFIG_PATH: "/tmp/fonts" };
if (process.platform === "linux") {
  const libs = resolve(".cache/chromium-libs");
  await mkdir(libs, { recursive: true });
  try {
    await access(resolve(libs, "lib/libnspr4.so"));
  } catch {
    const tar = resolve(".cache/chromium-libs.tar");
    await writeFile(
      tar,
      brotliDecompressSync(
        await readFile("node_modules/@sparticuz/chromium/bin/al2023.tar.br"),
      ),
    );
    execFileSync("tar", ["-xf", tar, "-C", libs]);
  }
  env.LD_LIBRARY_PATH = [resolve(libs, "lib"), env.LD_LIBRARY_PATH ?? ""].join(
    ":",
  );
}
const browser = await playwright.launch({
  executablePath:
    process.env.CHROMIUM_PATH ?? (await chromium.executablePath()),
  args: chromium.args,
  env,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
let offlinePage;
async function test(name, fn) {
  if (process.env.TEST_FOCUS && !name.includes(process.env.TEST_FOCUS)) return;
  const start = performance.now();
  await fn();
  results.push({ name, ms: Math.round(performance.now() - start) });
  console.log(`✓ ${name}`);
}
const state = () =>
  page.evaluate(() => ({
    project: window.frontier.getProject(),
    selection: window.frontier.getSelection(),
    diagnostics: window.frontier.getNetwork().diagnostics,
    meshes: window.frontier.getNetwork().meshes.map((m) => ({
      owner: m.owner,
      kind: m.kind,
      material: m.material,
    })),
    triangles: window.frontier.getNetwork().triangles,
  }));
async function ready() {
  await page.waitForFunction(() => !!window.frontier);
  await page.evaluate(() => document.fonts.ready);
}
async function undo() {
  await page.locator("#undo-button").click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
try {
  await page.goto(base);
  await ready();
  await test("initial linked views, valid demo and one shared pivot", async () => {
    const s = await state();
    assert.equal(s.project.roads.length, 10);
    assert.equal(s.diagnostics.length, 0);
    assert.equal(s.selection.id, "j01");
    assert.equal(await page.locator(".canvas-host>canvas").count(), 2);
    assert.equal(
      await page.locator("#scene-gizmo").getAttribute("hidden"),
      null,
    );
    await page.screenshot({ path: resolve(cache, "desktop.png") });
  });
  const referenceState = () =>
    page.evaluate(() => ({
      project: window.frontier.getProject(),
      selection: window.frontier.getSelection(),
      design: window.frontier.getNetwork().designReview,
      bridges: window.frontier.getNetwork().bridges,
      auxiliary: window.frontier.getNetwork().auxiliaryLanes,
      fill: window.frontier.getNetwork().embankments,
      diagnostics: window.frontier.getNetwork().diagnostics,
    }));
  async function importReferenceFixture(
    settings = {},
    height = 0,
    length = 400,
  ) {
    const p = {
      version: 1,
      name: "Reference geometry fixture",
      nodes: [
        {
          id: "ref-a",
          name: "In",
          position: [-length / 2, height, 0],
          radius: 3,
          crossings: false,
        },
        {
          id: "ref-z",
          name: "Out",
          position: [length / 2, height, 0],
          radius: 3,
          crossings: false,
        },
      ],
      roads: [
        {
          id: "ref-road",
          name: "Metric freeway section",
          start: "ref-a",
          end: "ref-z",
          h1: [length / 3, 0, 0],
          h2: [-length / 3, 0, 0],
          oneWay: true,
          lanes: 2,
          laneWidth: 3.65,
          shoulderWidth: 2,
          sidewalk: 0,
          curbStyle: "flush",
          markingStyle: "motorway",
          roadClass: "mainline",
          drainage: false,
          manholes: false,
          signs: false,
          bridgeDepth: 1.6,
          structure: "steel",
          ...settings,
        },
      ],
    };
    await page.locator("#project-file").setInputFiles({
      name: "reference.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.waitForFunction(
      () =>
        window.frontier.getProject().name === "Reference geometry fixture" &&
        !document.querySelector("#project-file").value,
    );
    await page.evaluate(() =>
      window.frontier.select({ kind: "road", id: "ref-road" }),
    );
  }
  const referenceRange = async (prop, value) => {
    await page.locator(`[data-prop="${prop}"]`).evaluate((e, v) => {
      e.value = String(v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  await test("continuity: tapered bridge bearings match every fixed girder and expose honest spacing ranges", async () => {
    await importReferenceFixture(
      {
        bridge: true,
        auxiliaryLane: "entry",
        auxiliaryLength: 200,
        auxiliaryTaper: 90,
      },
      8,
      400,
    );
    await page.locator('[data-inspector-tab="geometry"]').click();
    const s = await referenceState(),
      b = s.bridges[0];
    assert.equal(b.girderCount, 6);
    assert(b.girderSpacingRange[1] - b.girderSpacingRange[0] > 0.5);
    assert.equal(b.bearings.length, b.supports.length * 6);
    assert(
      b.bearings.every(
        (p) => p.girderCount === 6 && Math.abs(p.top - p.bottom - 0.07) < 1e-7,
      ),
    );
    assert(
      (
        await page.locator('[data-design-metric="Girder layout"]').textContent()
      ).includes("1.86–2.59"),
    );
    assert.equal(
      Number(
        await page
          .locator('[data-design-metric="Bearing assemblies"]')
          .textContent(),
      ),
      b.bearings.length,
    );
    assert.deepEqual(s.design.structureIssues, []);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "continuous-tapered-bridge-seats.png"),
    });
    const before = s.project;
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="glb"]').click();
    let d = await promise,
      buffer = await readFile(await d.path());
    const gltf = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      ),
      extras = gltf.nodes.find((n) => n.extras?.bridges)?.extras;
    assert.equal(
      extras.bridges[0].bearings.length,
      extras.bridges[0].supports.length * 6,
    );
    assert(extras.bridges[0].bearings.every((b) => b.physicalGeometry));
    assert(extras.bridges[0].widthRange[1] > extras.bridges[0].widthRange[0]);
    await page.locator('[data-menu="export-menu"]').click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("GLB exported"),
    );
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="obj"]').click();
    d = await promise;
    const files = unzipSync(await readFile(await d.path())),
      m = JSON.parse(new TextDecoder().decode(files["mesh.json"]));
    assert.deepEqual(m.bridges[0].bearings, extras.bridges[0].bearings);
    assert(m.auxiliaryLanes[0].meshedFullWidthLength === 200);
    assert.deepEqual((await referenceState()).project, before);
  });
  await test("continuity: edited structural bounds cannot hide a wall or earth mass across the lower road", async () => {
    await importReferenceFixture(
      { bridge: true, embankment: true, bridgeFrom: 0.35, bridgeTo: 0.75 },
      7.2,
      600,
    );
    const p = (await referenceState()).project;
    p.name = "Continuity underpass";
    p.nodes.push(
      {
        id: "continuity-lower-a",
        name: "Lower in",
        position: [0, 0, -100],
        radius: 3,
        crossings: false,
      },
      {
        id: "continuity-lower-z",
        name: "Lower out",
        position: [0, 0, 100],
        radius: 3,
        crossings: false,
      },
    );
    p.roads.push({
      id: "continuity-lower",
      name: "Lower road",
      start: "continuity-lower-a",
      end: "continuity-lower-z",
      h1: [0, 0, 66.6666666667],
      h2: [0, 0, -66.6666666667],
      lanes: 2,
      laneWidth: 3.5,
      sidewalk: 4.2,
      drainage: false,
      manholes: false,
    });
    await page.locator("#project-file").setInputFiles({
      name: "continuity.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.waitForFunction(
      () =>
        window.frontier.getProject().name === "Continuity underpass" &&
        !document.querySelector("#project-file").value,
    );
    await page.evaluate(() =>
      window.frontier.select({ kind: "road", id: "ref-road" }),
    );
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await referenceState();
    await referenceRange("bridgeFrom", 50);
    let s = await referenceState();
    assert.equal(s.bridges[0].excludedAbutments.length, 1);
    assert.equal(s.bridges[0].abutments.length, 1);
    assert(s.design.structureIssues.some((i) => i.kind === "abutment"));
    assert(!s.design.withinSelectedTargets);
    assert(s.diagnostics.some((d) => d.level === "error"));
    assert(!s.fill.some((e) => e.owner === "ref-road"));
    const downloads = [],
      handler = (d) => downloads.push(d);
    page.on("download", handler);
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator('#export-menu [data-action="glb"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        .textContent.includes("Fix invalid geometry"),
    );
    assert.equal(downloads.length, 0);
    page.off("download", handler);
    await page.locator('[data-inspector-tab="geometry"]').click();
    assert.equal(
      await page
        .locator('[data-design-metric="Support condition"]')
        .textContent(),
      "Review structural bounds",
    );
    assert.equal(
      await page.locator("[data-design-status]").textContent(),
      "Review geometry",
    );
    await undo();
    s = await referenceState();
    assert.deepEqual(s.project, before.project);
    assert.deepEqual(s.diagnostics, []);
    assert.equal(s.bridges[0].abutments.length, 2);
    assert.equal(s.fill.length, 2);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "lower-road-safe-bridge-bounds.png"),
    });
  });
  await test("continuity: meshed versus configured auxiliary lengths and extra junction lanes are measured, not implied", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("diamond"));
    const s = await referenceState(),
      a = s.auxiliary.find((a) => a.kind === "exit"),
      road = s.project.roads.find((r) => r.id === a.owner);
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      a.owner,
    );
    await page.locator('[data-inspector-tab="geometry"]').click();
    assert(a.meshedFullWidthLength < a.fullWidthLength);
    assert(
      Math.abs(
        a.meshedFullWidthLength +
          a.meshedTaperLength -
          (a.endStation - a.startStation),
      ) < 1e-7,
    );
    assert.equal(
      await page
        .locator('[data-design-metric="Meshed full-width run"]')
        .textContent(),
      "9.2 m",
    );
    assert.equal(
      await page.locator('[data-design-metric="Meshed taper"]').textContent(),
      "90.0 m",
    );
    assert.equal(
      await page
        .locator('[data-design-metric="Junction continuation"]')
        .textContent(),
      "140.8 m",
    );
    await page.evaluate(
      (id) => window.frontier.select({ kind: "node", id }),
      road.end,
    );
    assert.equal(
      await page.locator('[data-junction-lanes="incoming"]').textContent(),
      "3",
    );
    assert.equal(
      await page.locator('[data-junction-lanes="outgoing"]').textContent(),
      "3",
    );
    assert.deepEqual((await referenceState()).project, s.project);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "motorway-lane-continuity.png"),
    });
  });
  await test("reference: diamond schematic dimensions, short bridge decks, supported approaches and measured girder layout", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("diamond"));
    const s = await referenceState(),
      terminals = s.project.nodes.filter((n) =>
        n.name.includes("ramp terminals"),
      );
    assert.equal(
      Math.hypot(
        terminals[0].position[0] - terminals[1].position[0],
        terminals[0].position[2] - terminals[1].position[2],
      ),
      260,
    );
    assert.equal(s.bridges.length, 2);
    assert.equal(s.design.bridgeLength, 96);
    assert(s.design.minimumClearance >= 5.2);
    assert(s.design.withinSelectedTargets);
    assert(
      s.bridges.every((b) => b.girderCount === 5 && b.abutments.length === 2),
    );
    assert(s.fill.length > 4);
    assert.equal(s.auxiliary.length, 4);
    assert(s.auxiliary.every((a) => a.taperLength === 90 && !a.fitted));
    assert.deepEqual(s.diagnostics, []);
    await page
      .locator('[data-design-metric="Actual structural length"]')
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page
        .locator('[data-design-metric="Actual structural length"]')
        .textContent(),
      "48.0 m",
    );
    assert.equal(
      await page.locator('[data-design-metric="Girder layout"]').textContent(),
      "5 girders · 2.33 m c/c",
    );
    assert(
      await page
        .locator('a[href*="Diamond_Interchange_Alignment_Controls.pdf"]')
        .isVisible(),
    );
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "reference-diamond-dimensions.png"),
    });
    assert(
      await page.evaluate(() => window.frontier.inspectRoadDetail("bridge")),
    );
    const camera = await page.evaluate(
        () => window.frontier.getPreviewStats().camera,
      ),
      deck = s.bridges.find((b) => b.owner === s.selection.id),
      mid = deck.start.map((v, i) => (v + deck.end[i]) / 2);
    assert(
      camera.position[1] < camera.target[1],
      "underside inspection must not be clamped above the girder",
    );
    assert(
      Math.abs(camera.position[2] - mid[2]) <= 8,
      "short-span inspection stays out of its approach fills",
    );
    assert(Math.abs(camera.position[0] - mid[0]) >= 20);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "reference-bridge-members.png"),
    });
  });
  await test("reference: cloverleaf uses measured collector weave spacing and the T is one true trumpet loop", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("cloverleaf"));
    let s = await referenceState();
    assert.equal(s.project.roads.length, 88);
    assert.equal(
      s.project.roads.filter((r) => r.roadClass === "loop").length,
      12,
    );
    assert(
      s.design.roads
        .filter((r) => r.role === "loop")
        .every((r) => r.minimumRadius > 112),
    );
    assert.equal(s.design.weaves.length, 4);
    assert(
      s.design.weaves.every(
        (w) =>
          w.nodeSpacing === 304 && w.noseSpacing > 410 && w.noseSpacing < 412,
      ),
    );
    assert.equal(s.auxiliary.length, 8);
    assert.equal(s.design.bridgeLength, 384);
    assert.deepEqual(s.diagnostics, []);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "reference-cloverleaf-cd.png"),
    });
    await page.evaluate(() => window.frontier.loadTemplate("trumpet"));
    s = await referenceState();
    assert.equal(
      s.project.roads.filter((r) => r.roadClass === "loop").length,
      3,
    );
    assert.equal(
      s.project.roads.filter((r) => r.name.includes("semi-direct ·")).length,
      3,
    );
    assert.equal(s.design.bridgeLength, 168);
    assert(
      s.bridges.every(
        (b) => Math.hypot(b.end[0] - b.start[0], b.end[2] - b.start[2]) === 84,
      ),
    );
    assert(s.design.withinSelectedTargets);
    assert.deepEqual(s.diagnostics, []);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "reference-single-loop-trumpet.png"),
    });
  });
  await test("reference: speed-change lane controls produce one-sided geometry, preserve through lanes and remain undoable", async () => {
    await importReferenceFixture({
      auxiliaryLane: "exit",
      auxiliaryLength: 150,
      auxiliaryTaper: 90,
    });
    await page.locator('[data-inspector-tab="geometry"]').click();
    const before = await referenceState();
    await referenceRange("auxiliaryLength", 180);
    await referenceRange("auxiliaryTaper", 100);
    let s = await referenceState();
    assert.equal(s.auxiliary[0].fullWidthLength, 180);
    assert.equal(s.auxiliary[0].taperLength, 100);
    assert.equal(s.project.roads[0].lanes, 2);
    assert.equal(s.project.roads[0].laneWidth, 3.65);
    assert.equal(s.project.roads[0].shoulderWidth, 2);
    const edges = () =>
      page.evaluate(() => {
        const m = window.frontier
          .getNetwork()
          .meshes.find((m) => m.kind === "asphalt");
        const zs = m.positions.filter((_, i) => i % 3 === 2);
        return [Math.min(...zs), Math.max(...zs)];
      });
    let bounds = await edges();
    assert(
      Math.abs(bounds[0] + 5.65) < 1e-7 && Math.abs(bounds[1] - 9.3) < 1e-7,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-prop="trafficSide"]').selectOption("left");
    bounds = await edges();
    assert(
      Math.abs(bounds[0] + 9.3) < 1e-7 && Math.abs(bounds[1] - 5.65) < 1e-7,
    );
    await undo();
    await undo();
    await undo();
    assert.deepEqual((await referenceState()).project, before.project);
    await page.locator('[data-inspector-tab="geometry"]').click();
    await page.locator('[data-prop="auxiliaryLane"]').selectOption("none");
    assert.equal((await referenceState()).auxiliary.length, 0);
    await undo();
    assert.equal((await referenceState()).auxiliary.length, 1);
  });
  await test("reference: structural bounds and fill controls regenerate actual deck length and survive preset application", async () => {
    await importReferenceFixture(
      { bridge: true, embankment: true, bridgeFrom: 0.2, bridgeTo: 0.8 },
      7.2,
      240,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await referenceState();
    assert(Math.abs(before.design.bridgeLength - 144) < 1e-7);
    await referenceRange("bridgeFrom", 40);
    let s = await referenceState();
    assert.equal(s.project.roads[0].bridgeFrom, 0.4);
    assert(Math.abs(s.design.bridgeLength - 96) < 1e-7);
    assert.equal(s.bridges[0].abutments.length, 2);
    await page.locator('[data-library="roads"]').click();
    await page.locator('[data-asset="motorway-carriageway"]').click();
    s = await referenceState();
    assert.equal(s.project.roads[0].bridgeFrom, 0.4);
    assert.equal(s.project.roads[0].bridgeTo, 0.8);
    assert(s.project.roads[0].embankment);
    await undo();
    await undo();
    assert.deepEqual((await referenceState()).project, before.project);
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-prop="embankment"]').uncheck();
    assert.deepEqual((await referenceState()).fill, []);
    await undo();
    assert.equal((await referenceState()).fill.length, 2);
  });
  await test("reference: GLB and OBJ retain metric design sources, speed-change lanes, bounded structures, bearings and approach fill", async () => {
    await importReferenceFixture(
      {
        bridge: true,
        embankment: true,
        bridgeFrom: 0.45,
        bridgeTo: 0.55,
        auxiliaryLane: "exit",
        auxiliaryLength: 150,
        auxiliaryTaper: 90,
      },
      7.2,
      600,
    );
    const before = await referenceState();
    await page.locator("#shade-style").selectOption("clay");
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="glb"]').click();
    let d = await promise,
      buffer = await readFile(await d.path());
    const g = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      ),
      extras = g.nodes.find((n) => n.extras?.designReview)?.extras;
    assert(extras);
    assert(extras.designReview.sources.some((s) => s.id === "bridge-handbook"));
    assert(Math.abs(extras.designReview.bridgeLength - 60) < 1e-6);
    assert.equal(extras.auxiliaryLanes.length, 1);
    assert.equal(extras.embankments.length, 2);
    assert.equal(extras.bridges[0].abutments.length, 2);
    assert(extras.bridges[0].girderCount >= 4);
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(
      !g.nodes.some((n) =>
        ["building", "landscape"].includes(n.extras?.meshKind),
      ),
    );
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="obj"]').click();
    d = await promise;
    const files = unzipSync(await readFile(await d.path())),
      m = JSON.parse(new TextDecoder().decode(files["mesh.json"])),
      materials = JSON.parse(
        new TextDecoder().decode(files["materials.json"]),
      ).materials;
    assert.equal(m.auxiliaryLanes.length, 1);
    assert.equal(m.embankments.length, 2);
    assert.equal(m.bridges[0].abutments.length, 2);
    assert(
      files[materials.soil.albedo] &&
        files[materials.soil.normal] &&
        files[materials.soil.roughness],
    );
    assert.deepEqual((await referenceState()).project, before.project);
    await page.locator("#shade-style").selectOption("shaded");
  });
  const roadsideState = () =>
    page.evaluate(() => ({
      project: window.frontier.getProject(),
      selection: window.frontier.getSelection(),
      bays: window.frontier.getNetwork().roadsideParking,
      spaces: window.frontier.getNetwork().parkingSpaces,
      diagnostics: window.frontier.getNetwork().diagnostics,
      meshes: window.frontier.getNetwork().meshes.map((m) => ({
        owner: m.owner,
        kind: m.kind,
        material: m.material,
      })),
    }));
  async function importParkingFixture() {
    const p = {
      version: 1,
      name: "Roadside parking export fixture",
      nodes: [
        {
          id: "parking-a",
          name: "Entry",
          position: [-60, 0, 0],
          radius: 3,
          crossings: false,
        },
        {
          id: "parking-z",
          name: "Exit",
          position: [60, 0, 0],
          radius: 3,
          crossings: false,
        },
      ],
      roads: [
        {
          id: "parking-road",
          name: "Protected cycle parking street",
          start: "parking-a",
          end: "parking-z",
          h1: [40, 0, 0],
          h2: [-40, 0, 0],
          lanes: 2,
          laneWidth: 3.1,
          parking: "parallel",
          cycleMode: "protected",
          cycleWidth: 1.9,
          cycleSeparator: 0.6,
          sidewalk: 4.5,
          drainage: false,
          manholes: false,
          signs: false,
          treePits: false,
          driveways: [
            { id: "parking-access", at: 0.5, side: 1, width: 7, apron: 3.5 },
          ],
        },
      ],
    };
    await page.locator("#project-file").setInputFiles({
      name: "roadside-parking.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.waitForFunction(
      () =>
        window.frontier.getProject().name ===
          "Roadside parking export fixture" &&
        !document.querySelector("#project-file").value,
    );
    await page.evaluate(() =>
      window.frontier.select({ kind: "road", id: "parking-road" }),
    );
  }
  await test("roadside parking: European quarter has visible real bays on all twelve roads, clear entries and no scenery", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("europe"));
    await page.locator('button[data-layout="split"]').click();
    await page.locator("#shade-style").selectOption("shaded");
    const s = await roadsideState();
    assert.equal(s.bays.length, 180);
    assert.equal(new Set(s.bays.map((b) => b.owner)).size, 12);
    assert(s.project.roads.every((r) => r.parking === "parallel"));
    assert.equal(
      s.meshes.filter((m) => m.material === "marking-parking-bay").length,
      12,
    );
    assert.deepEqual(s.diagnostics, []);
    assert(!s.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
    for (const span of await page.evaluate(() =>
      window.frontier.getNetwork().spans.map((s) => ({
        owner: s.road.id,
        first: s.frames[0].s,
        last: s.frames.at(-1).s,
        ramps: s.footway.ramps,
      })),
    )) {
      for (const bay of s.bays.filter((b) => b.owner === span.owner)) {
        assert(bay.startStation - 0.05 >= span.first + 10 - 1e-6);
        assert(bay.endStation + 0.05 <= span.last - 10 + 1e-6);
        for (const ramp of span.ramps.filter((r) => r.side === bay.side))
          assert(
            bay.endStation + 0.35 <= ramp.s - ramp.width / 2 - ramp.flare ||
              bay.startStation - 0.35 >= ramp.s + ramp.width / 2 + ramp.flare,
          );
      }
    }
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "european-roadside-parking.png"),
    });
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      s.project.roads[0].id,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-inspector-action="inspect-parking"]').click();
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "european-parking-closeup.png"),
    });
  });
  await test("roadside parking: live toggle, count, layer inspection and undo preserve the liked bus/cycle profile", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("europe"));
    const p = (await roadsideState()).project,
      id = p.roads[0].id;
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      id,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await roadsideState(),
      count = before.bays.filter((b) => b.owner === id).length;
    assert(count > 10);
    assert.equal(
      Number(await page.locator("[data-roadside-parking]").textContent()),
      count,
    );
    await page.locator('[data-menu="layers-menu"]').click();
    await page.locator('[data-layer="marking"]').uncheck();
    await page.locator('[data-menu="layers-menu"]').click();
    await page.locator('[data-inspector-action="inspect-parking"]').click();
    assert(await page.locator('[data-layer="marking"]').isChecked());
    assert.deepEqual((await roadsideState()).project, before.project);
    await page.locator('[data-prop="parking"]').selectOption("none");
    const disabled = await roadsideState(),
      road = disabled.project.roads.find((r) => r.id === id);
    assert(!disabled.bays.some((b) => b.owner === id));
    assert.equal(
      Number(await page.locator("[data-roadside-parking]").textContent()),
      0,
    );
    for (const key of [
      "lanes",
      "laneWidth",
      "busLanes",
      "cycleMode",
      "cycleWidth",
      "cycleSeparator",
      "sidewalk",
    ])
      assert.equal(road[key], before.project.roads[0][key]);
    assert(
      !(await page.evaluate(() =>
        window.frontier.inspectRoadDetail("parking"),
      )),
    );
    await undo();
    assert.deepEqual((await roadsideState()).project, before.project);
    assert.deepEqual((await roadsideState()).bays, before.bays);
    assert.equal(
      Number(await page.locator("[data-roadside-parking]").textContent()),
      count,
    );
  });
  await test("roadside parking: painted cycle bays retain a hatched door buffer and bus-only avenues do not gain car slots", async () => {
    await importParkingFixture();
    await page.locator('[data-library="roads"]').click();
    await page.locator('[data-asset="cycle-painted"]').click();
    let s = await roadsideState(),
      road = s.project.roads[0];
    assert.equal(road.parking, "parallel");
    assert.equal(road.cycleMode, "painted");
    assert(s.bays.length > 20);
    assert(s.meshes.some((m) => m.material === "cycle-green"));
    const cycle = await page.evaluate(
      () =>
        window.frontier
          .getNetwork()
          .meshes.find((m) => m.material === "cycle-green").positions,
    );
    for (let i = 2; i < cycle.length; i += 3)
      assert(Math.abs(cycle[i]) >= 6 - 1e-7);
    await page.locator('[data-inspector-tab="geometry"]').click();
    assert.equal(
      await page.locator('[data-prop="cycleSeparator"]').inputValue(),
      "0.6",
    );
    assert(
      await page.getByText("Hatched door buffer", { exact: true }).isVisible(),
    );
    await page.evaluate(() => window.frontier.inspectRoadDetail("parking"));
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "painted-cycle-parking.png"),
    });
    await page.locator('[data-asset="bus-way"]').click();
    s = await roadsideState();
    assert.equal(s.project.roads[0].parking, "none");
    assert.deepEqual(s.bays, []);
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-prop="parking"]').selectOption("parallel");
    s = await roadsideState();
    assert.deepEqual(s.bays, []);
    assert(!s.meshes.some((m) => m.material === "marking-parking-bay"));
    assert.equal(s.spaces, 0);
  });
  await test("roadside parking: production GLB, OBJ and editable JSON retain bay geometry, footprints and white stencil textures", async () => {
    await importParkingFixture();
    const before = await roadsideState();
    assert(before.bays.length > 20);
    await page.locator("#shade-style").selectOption("clay");
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    let download = await promise,
      buffer = await readFile(await download.path());
    const g = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      ),
      extras = g.nodes.find((n) => n.extras?.roadsideParking)?.extras,
      mat = g.materials.find((m) => m.name === "marking-parking-bay");
    assert(extras?.roadsideParking.length === before.bays.length);
    assert.equal(extras.geometryDetail, "production");
    assert(
      extras.roadsideParking.every(
        (b) => b.boundary.length === 4 && b.width >= 1.9 && b.length >= 5,
      ),
    );
    assert.deepEqual(
      extras.roadsideParking.map((b) => b.id),
      before.bays.map((b) => b.id),
    );
    assert(mat?.pbrMetallicRoughness.baseColorTexture);
    assert.equal(mat.alphaMode, "MASK");
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(
      g.nodes.some(
        (n) =>
          n.extras?.meshKind === "marking" &&
          n.extras?.materialKey === "marking-parking-bay",
      ),
    );
    assert.deepEqual((await roadsideState()).project, before.project);
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="obj"]').click();
    download = await promise;
    const files = unzipSync(await readFile(await download.path())),
      manifest = JSON.parse(new TextDecoder().decode(files["mesh.json"])),
      materials = JSON.parse(
        new TextDecoder().decode(files["materials.json"]),
      ).materials,
      parkingMat = materials["marking-parking-bay"];
    assert.equal(manifest.roadsideParking.length, before.bays.length);
    assert.equal(parkingMat.wrapS, "clamp");
    assert.equal(parkingMat.wrapT, "clamp");
    assert(files[parkingMat.albedo]);
    assert(manifest.objects.some((o) => o.material === "marking-parking-bay"));
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download");
    await page.locator('#export-menu [data-action="json"]').click();
    download = await promise;
    const json = JSON.parse((await readFile(await download.path())).toString());
    assert.deepEqual(json, before.project);
    assert.equal(json.roads[0].parking, "parallel");
    assert.equal(json.roads[0].cycleMode, "protected");
    assert.equal(json.roads[0].driveways.length, 1);
    assert.deepEqual((await roadsideState()).project, before.project);
    await page.locator("#shade-style").selectOption("shaded");
  });
  async function importBridgeFixture() {
    const p = {
      version: 1,
      name: "Connected bridge export fixture",
      nodes: [
        {
          id: "bridge-fixture-a",
          name: "Original shared endpoint · In",
          position: [-300, 0, 0],
          radius: 3,
          crossings: false,
        },
        {
          id: "bridge-fixture-b",
          name: "Original shared endpoint · Out",
          position: [300, 0, 0],
          radius: 3,
          crossings: false,
        },
      ],
      roads: [
        {
          id: "bridge-fixture-road",
          name: "Highway insertion host",
          start: "bridge-fixture-a",
          end: "bridge-fixture-b",
          h1: [200, 0, 0],
          h2: [-200, 0, 0],
          lanes: 2,
          laneWidth: 3.5,
          shoulderWidth: 1,
          oneWay: true,
          sidewalk: 0.8,
          markingStyle: "motorway",
          drainage: false,
          manholes: false,
          signs: false,
          streetLights: false,
        },
      ],
    };
    await page.locator("#project-file").setInputFiles({
      name: "connected-bridge.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.waitForFunction(
      () =>
        window.frontier.getProject().name === "Connected bridge export fixture",
    );
    await page.waitForFunction(
      () => !document.querySelector("#project-file").value,
    );
    await page.evaluate(() =>
      window.frontier.select({ kind: "road", id: "bridge-fixture-road" }),
    );
  }
  await test("connected infrastructure: highway bridge template, linked ramps and live structure controls", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("bridge"));
    const before = await page.evaluate(() => ({
      grade: window.frontier.getNetwork().maxGrade,
      bridges: window.frontier.getNetwork().bridges,
      clearances: window.frontier.getNetwork().clearances,
      roads: window.frontier.getProject().roads,
      selection: window.frontier.getSelection(),
    }));
    assert(before.grade < 4.05);
    assert(before.clearances.every((c) => c.meters >= 5.2));
    assert.equal(
      before.roads.filter(
        (r) =>
          r.name.includes("connected ascent") ||
          r.name.includes("connected descent"),
      ).length,
      4,
    );
    assert(
      before.bridges.every(
        (b) => b.kind === "span" && b.abutments.length === 2,
      ),
    );
    await page.locator('[data-inspector-tab="details"]').click();
    assert.equal(
      await page.locator('[data-prop="railStyle"] option').count(),
      7,
    );
    const depth = page.locator('[data-prop="bridgeDepth"]');
    await depth.focus();
    await depth.evaluate((e) => {
      e.value = "1.9";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const after = await page.evaluate(() => ({
      bridges: window.frontier.getNetwork().bridges,
      clearances: window.frontier.getNetwork().clearances,
      selection: window.frontier.getSelection(),
      diagnostics: window.frontier.getNetwork().diagnostics,
    }));
    assert.equal(
      after.bridges.find((b) => b.owner === after.selection.id).depth,
      1.9,
    );
    assert(
      Math.min(...after.clearances.map((c) => c.meters)) <
        Math.min(...before.clearances.map((c) => c.meters)) - 0.25,
    );
    assert.deepEqual(after.diagnostics, []);
    assert(
      parseFloat(await page.locator("[data-bridge-clearance]").textContent()) <
        6.35,
    );
    const spacing = page.locator('[data-prop="pierSpacing"]');
    await spacing.focus();
    await spacing.evaluate((e) => {
      e.value = "26";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(
      await page.evaluate(
        () =>
          window.frontier
            .getNetwork()
            .bridges.find((b) => b.owner === window.frontier.getSelection().id)
            .pierSpacing,
      ),
      26,
    );
    await page.locator('[data-inspector-action="inspect-bridge"]').click();
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "highway-bridge-structure.png"),
    });
  });
  await test("connected infrastructure: city has no buildings or trees, real pockets and shared-cycle streets", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("city"));
    const result = await page.evaluate(() => ({
      roads: window.frontier.getProject().roads,
      sites: window.frontier.getProject().sites,
      diagnostics: window.frontier.getNetwork().diagnostics,
      features: window.frontier.getNetwork().streetDetails,
      blocks: window.frontier.getNetwork().blocks,
      plantings: window.frontier.getNetwork().plantings,
      kinds: window.frontier.getNetwork().meshes.map((m) => m.kind),
    }));
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.blocks.length, 16);
    assert.equal(result.sites.filter((s) => s.kind === "parking").length, 4);
    assert(
      !result.kinds.includes("building") && !result.kinds.includes("landscape"),
    );
    assert(result.plantings.every((p) => p.containsTree === false));
    for (const kind of [
      "curb-extension",
      "crossing-refuge",
      "shared-cycle-street",
      "crosswalk",
    ])
      assert(result.features.some((f) => f.kind === kind));
    await page.locator('[data-library="networks"]').click();
    for (const id of ["city", "bridge", "dumbbell"])
      assert(
        await page.locator(`[data-asset="${id}"] .asset-preview svg`).count(),
      );
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "connected-city-network.png"),
    });
    const local = result.roads.find(
      (r) => r.curbExtensions && r.parking === "parallel" && !r.bridge,
    );
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      local.id,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    await page
      .getByRole("checkbox", {
        name: "Parking-pocket curb extensions",
        exact: true,
      })
      .uncheck();
    assert(
      !(await page.evaluate(
        (id) =>
          window.frontier
            .getNetwork()
            .streetDetails.some(
              (f) => f.owner === id && f.kind === "curb-extension",
            ),
        local.id,
      )),
    );
    await undo();
    assert(
      await page.evaluate(
        (id) =>
          window.frontier
            .getNetwork()
            .streetDetails.some(
              (f) => f.owner === id && f.kind === "curb-extension",
            ),
        local.id,
      ),
    );
    assert(
      await page.evaluate(() => window.frontier.inspectRoadDetail("street")),
    );
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "city-curb-extension.png"),
    });
  });
  await test("connected infrastructure: seven guardrail designs have distinct real thumbnails and editable geometry", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("tee"));
    await page.locator('[data-library="structures"]').click();
    const signatures = new Set();
    for (const style of [
      "wbeam",
      "thrie",
      "boxbeam",
      "cable",
      "railing",
      "concrete",
      "parapet",
    ]) {
      const id = style === "wbeam" ? "rail" : `rail-${style}`,
        card = page.locator(`[data-asset="${id}"]`);
      assert(
        (await card.locator("img").getAttribute("src")).startsWith(
          "data:image/png",
        ),
      );
      await card.click();
      await page.locator('[data-prop="railStyle"]').selectOption(style);
      const data = await page.evaluate(() => ({
        styles: window.frontier.getProject().roads.map((r) => r.railStyle),
        rails: window.frontier
          .getNetwork()
          .meshes.filter((m) => m.kind === "rail")
          .map((m) => [m.material, m.indices.length, m.positions.length]),
        table: window.frontier.getNetwork().barriers,
      }));
      assert(data.styles.every((s) => s === style));
      assert(data.table.some((b) => b.ownerKind === "node"));
      const signature = JSON.stringify(data.rails);
      assert(!signatures.has(signature));
      signatures.add(signature);
    }
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "guardrail-designs.png"),
    });
  });
  await test("connected infrastructure: rounded splitter inspect keeps gore before the physical curb nose", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("merge"));
    const before = await state();
    await page.locator('[data-inspector-action="inspect-splitter"]').click();
    const splitters = await page.evaluate(
      () => window.frontier.getNetwork().splitters,
    );
    assert.equal(splitters.length, 1);
    assert(splitters[0].curbRadius >= 5.9);
    assert(splitters[0].length <= 18);
    assert.deepEqual((await state()).project, before.project);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "rounded-curb-splitter.png"),
    });
  });
  await test("connected infrastructure: bridge insertion preserves shared endpoints and undo/redo", async () => {
    await importBridgeFixture();
    const before = await state();
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-inspector-action="insert-bridge"]').click();
    const after = await state();
    assert.equal(after.project.roads.length, 3);
    assert.equal(after.project.nodes.length, 4);
    for (const node of before.project.nodes)
      assert.deepEqual(
        after.project.nodes.find((n) => n.id === node.id),
        node,
      );
    assert(after.project.roads.every((r) => r.oneWay));
    assert.equal(after.project.roads.filter((r) => r.bridge).length, 1);
    assert(
      after.project.roads.filter((r) => !r.bridge).every((r) => r.embankment),
    );
    assert.equal(after.selection.kind, "road");
    assert.equal(
      await page.evaluate(() => window.frontier.getNetwork().bridges.length),
      1,
    );
    assert(
      (await page.evaluate(() => window.frontier.getNetwork().maxGrade)) <=
        4.05,
    );
    await undo();
    assert.equal((await state()).project.roads.length, 1);
    await page.locator("#redo-button").click();
    assert.equal((await state()).project.roads.length, 3);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "inserted-connected-bridge.png"),
    });
  });
  await test("connected infrastructure: short bridge insertion refuses without moving neighbouring roads", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("tee"));
    const before = await state(),
      road = before.project.roads[0];
    const inserted = await page.evaluate(
      (id) => window.frontier.insertBridge(id),
      road.id,
    );
    assert.equal(inserted, false);
    assert.deepEqual((await state()).project, before.project);
  });
  await test("connected infrastructure: GLB and OBJ carry actual bridge/barrier geometry and new metadata", async () => {
    await importBridgeFixture();
    assert(
      await page.evaluate(() =>
        window.frontier.insertBridge("bridge-fixture-road"),
      ),
    );
    const before = await state();
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="glb"]').click();
    let download = await promise,
      buffer = await readFile(await download.path());
    assert.equal(buffer.toString("ascii", 0, 4), "glTF");
    const gltf = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      ),
      extras = gltf.nodes.find((n) => n.extras?.bridges)?.extras;
    assert.equal(extras.bridges.length, 1);
    assert(extras.bridges.every((b) => b.physicalGeometry));
    assert(extras.barriers.every((b) => b.style === "boxbeam"));
    assert(Array.isArray(extras.streetDetails));
    assert(Array.isArray(extras.splitters));
    assert(gltf.nodes.some((n) => n.name?.endsWith("structure girder")));
    assert(gltf.images.every((i) => i.bufferView !== undefined));
    assert.equal(extras.includesPreviewEnvironment, false);
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('#export-menu [data-action="obj"]').click();
    download = await promise;
    const files = unzipSync(await readFile(await download.path())),
      manifest = JSON.parse(
        Buffer.from(
          files[Object.keys(files).find((k) => k === "mesh.json")],
        ).toString(),
      );
    assert.equal(manifest.bridges.length, 1);
    assert(manifest.barriers.every((b) => b.style === "boxbeam"));
    assert.deepEqual((await state()).project, before.project);
    assert.equal((await state()).triangles, before.triangles);
  });
  async function settlePreview() {
    await page.waitForFunction(
      () => {
        const s = window.frontier.getPreviewStats();
        if (!s) return false;
        const now = performance.now(),
          last = window.__previewSettled;
        if (!last || last.frames !== s.renderedFrames || s.pending) {
          window.__previewSettled = { frames: s.renderedFrames, since: now };
          return false;
        }
        return now - last.since > 700;
      },
      null,
      { polling: 100, timeout: 120000 },
    );
  }
  async function importPolishFixture(project) {
    await page.locator("#project-file").setInputFiles({
      name: "polish.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.waitForFunction(
      (name) => window.frontier.getProject().name === name,
      project.name,
    );
    await page.waitForFunction(
      () => !document.querySelector("#project-file").value,
    );
  }
  await test("polish: idle city preview stops drawing unchanged geometry and resumes for visual controls", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("city"));
    await settlePreview();
    const before = await page.evaluate(() => window.frontier.getPreviewStats());
    await page.waitForTimeout(900);
    const idle = await page.evaluate(() => window.frontier.getPreviewStats());
    assert.equal(idle.renderedFrames, before.renderedFrames);
    assert(idle.idleFrames > before.idleFrames + 5);
    assert(idle.scheduledFrames > before.scheduledFrames + 5);
    await page.locator("#shade-style").selectOption("wireframe");
    await page.waitForFunction(
      (frames) => window.frontier.getPreviewStats().renderedFrames > frames,
      before.renderedFrames,
    );
    await page.locator("#shade-style").selectOption("shaded");
    await settlePreview();
    await page.screenshot({
      path: resolve(cache, "on-demand-city.png"),
      timeout: 120000,
    });
  });
  await test("polish: hidden 3D pane defers GPU work but still receives graph edits", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("district"));
    await settlePreview();
    await page.locator('button[data-layout="plan"]').click();
    await page.waitForFunction(
      () => window.frontier.getPreviewStats().visible === false,
    );
    const before = await page.evaluate(() => window.frontier.getPreviewStats());
    assert(
      await page.evaluate(() => window.frontier.moveJoint("j01", [1, 0, 1])),
    );
    await page.waitForTimeout(600);
    const hidden = await page.evaluate(() => window.frontier.getPreviewStats());
    assert.equal(hidden.renderedFrames, before.renderedFrames);
    assert(hidden.pending);
    assert.deepEqual(
      await page.evaluate(
        () =>
          window.frontier.getProject().nodes.find((n) => n.id === "j01")
            .position,
      ),
      [1, 0, 1],
    );
    await page.locator('button[data-layout="split"]').click();
    await page.waitForFunction(
      (frames) =>
        window.frontier.getPreviewStats().visible &&
        window.frontier.getPreviewStats().renderedFrames > frames,
      before.renderedFrames,
    );
    await settlePreview();
  });
  await test("polish: mixed bridge joins taper matching members and export their actual depths", async () => {
    const node = (id, x, y, z) => ({
        id,
        name: id,
        position: [x, y, z],
        radius: 3,
        crossings: false,
      }),
      road = (id, start, end, h1, h2, settings) => ({
        id,
        name: id,
        start,
        end,
        h1,
        h2,
        lanes: 2,
        laneWidth: 3.5,
        sidewalk: 0.8,
        drainage: false,
        manholes: false,
        signs: false,
        ...settings,
      });
    await importPolishFixture({
      version: 1,
      name: "Mixed bridge polish",
      nodes: [
        node("mixed-a", -120, 8, 0),
        node("mixed-mid", 0, 8, 0),
        node("mixed-b", 120, 8, 0),
        node("lower-a", -2, 0, -100),
        node("lower-b", -2, 0, 100),
      ],
      roads: [
        road("shallow", "mixed-a", "mixed-mid", [40, 0, 0], [-40, 0, 0], {
          bridge: true,
          structure: "concrete",
          bridgeDepth: 1.05,
        }),
        road("deep", "mixed-mid", "mixed-b", [40, 0, 0], [-40, 0, 0], {
          bridge: true,
          structure: "steel",
          bridgeDepth: 1.8,
        }),
        road(
          "lower",
          "lower-a",
          "lower-b",
          [0, 0, 200 / 3],
          [0, 0, -200 / 3],
          {},
        ),
      ],
    });
    const data = await page.evaluate(() => ({
        bridges: window.frontier.getNetwork().bridges,
        clearances: window.frontier.getNetwork().clearances,
        diagnostics: window.frontier.getNetwork().diagnostics,
      })),
      joint = data.bridges.find((b) => b.owner === "mixed-mid");
    assert.deepEqual(data.diagnostics, []);
    assert.equal(joint.members.length, 2);
    assert.equal(
      joint.members.find((m) => m.road === "shallow").mouthDepth,
      1.05,
    );
    assert(joint.members.every((m) => m.jointDepth === 1.8));
    assert(data.clearances[0].meters < 6.4);
    await page.evaluate(() =>
      window.frontier.select({ kind: "node", id: "mixed-mid" }),
    );
    assert(
      await page.evaluate(() => window.frontier.inspectRoadDetail("bridge")),
    );
    const promise = page.waitForEvent("download", { timeout: 120000 });
    await page.evaluate(() => window.frontier.exportProject("glb", "editing"));
    const download = await promise,
      buffer = await readFile(await download.path()),
      gltf = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      ),
      extras = gltf.nodes.find((n) => n.extras?.bridges)?.extras,
      exported = extras.bridges.find((b) => b.owner === "mixed-mid");
    assert.deepEqual(exported.members, joint.members);
    for (const key of ["girder", "concrete"])
      assert(
        gltf.nodes.some(
          (n) => n.extras?.id === "mixed-mid" && n.extras?.materialKey === key,
        ),
      );
    await page.screenshot({
      path: resolve(cache, "mixed-bridge-join.png"),
      timeout: 120000,
    });
  });
  await test("polish: support footprints preserve a parking court below the bridge", async () => {
    await importPolishFixture({
      version: 1,
      name: "Parking under bridge",
      nodes: [
        { id: "deck-a", position: [-160, 8, 0], radius: 3, crossings: false },
        { id: "deck-b", position: [160, 8, 0], radius: 3, crossings: false },
      ],
      roads: [
        {
          id: "deck",
          name: "Deck",
          start: "deck-a",
          end: "deck-b",
          h1: [320 / 3, 0, 0],
          h2: [-320 / 3, 0, 0],
          bridge: true,
          structure: "steel",
          bridgeDepth: 1.25,
          pierSpacing: 32,
          sidewalk: 0.8,
          drainage: false,
          manholes: false,
        },
      ],
      sites: [
        {
          id: "under-parking",
          kind: "parking",
          name: "Parking retained",
          position: [0, 0, 0],
          width: 44,
          depth: 36,
          yaw: 0,
        },
      ],
    });
    const data = await page.evaluate(() => ({
      bridge: window.frontier
        .getNetwork()
        .bridges.find((b) => b.owner === "deck"),
      diagnostics: window.frontier.getNetwork().diagnostics,
      parking: window.frontier
        .getNetwork()
        .meshes.some(
          (m) => m.owner === "under-parking" && m.kind === "parking",
        ),
    }));
    assert.deepEqual(data.diagnostics, []);
    assert(data.parking);
    assert(data.bridge.excludedSupports.some((p) => Math.abs(p[0]) < 0.01));
    assert(data.bridge.supports.every((s) => Math.abs(s.position[0]) > 23));
  });
  await test("polish: signal heads face incoming one-way traffic and mirror for keep-left roads", async () => {
    const node = (id, x, z) => ({
        id,
        name: id,
        position: [x, 0, z],
        radius: 6,
        crossings: true,
        signals: id === "signal-mid",
      }),
      road = (id, start, end, h1, h2) => ({
        id,
        name: id,
        start,
        end,
        h1,
        h2,
        oneWay: true,
        trafficSide: "left",
        drainage: false,
        manholes: false,
      });
    await importPolishFixture({
      version: 1,
      name: "Incoming signal polish",
      nodes: [
        node("signal-mid", 0, 0),
        node("west", -100, 0),
        node("east", 100, 0),
        node("south", 0, 100),
      ],
      roads: [
        road(
          "incoming",
          "west",
          "signal-mid",
          [100 / 3, 0, 0],
          [-100 / 3, 0, 0],
        ),
        road(
          "out-east",
          "signal-mid",
          "east",
          [100 / 3, 0, 0],
          [-100 / 3, 0, 0],
        ),
        road(
          "out-south",
          "signal-mid",
          "south",
          [0, 0, 100 / 3],
          [0, 0, -100 / 3],
        ),
      ],
    });
    const signals = () =>
      page.evaluate(() => ({
        triangles: window.frontier
          .getNetwork()
          .meshes.filter(
            (m) => m.owner === "signal-mid" && m.material.startsWith("signal-"),
          )
          .reduce((s, m) => s + m.indices.length / 3, 0),
        poles: window.frontier
          .getNetwork()
          .meshes.find((m) => m.owner === "signal-mid" && m.material === "pole")
          .positions,
      }));
    const left = await signals();
    assert.equal(left.triangles, 48);
    await page.evaluate(() =>
      window.frontier.select({ kind: "node", id: "signal-mid" }),
    );
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-prop="trafficSide"]').selectOption("right");
    const right = await signals();
    assert.equal(right.triangles, 48);
    assert.notDeepEqual(right.poles, left.poles);
  });

  await page.evaluate(() => window.frontier.loadTemplate("district"));
  await page.locator('[data-library="roads"]').click();
  await test("2D shared pivot drag updates all approaches; undo/redo restore it", async () => {
    const p = await page.evaluate(() => window.frontier.worldToPlan([0, 0, 0])),
      r = await page.locator("#plan-host").boundingBox();
    await page.mouse.move(r.x + p[0], r.y + p[1]);
    await page.mouse.down();
    await page.mouse.move(r.x + p[0] + 18, r.y + p[1] + 9, { steps: 4 });
    await page.mouse.up();
    let s = await state(),
      node = s.project.nodes.find((n) => n.id === "j01");
    assert(node.position[0] > 5);
    assert(node.position[2] > 2);
    assert.equal(
      s.project.roads.filter((r) => r.start === "j01" || r.end === "j01")
        .length,
      4,
    );
    assert.equal(s.diagnostics.filter((d) => d.level === "error").length, 0);
    const moved = [...node.position];
    await undo();
    s = await state();
    assert.deepEqual(
      s.project.nodes.find((n) => n.id === "j01").position,
      [0, 0, 0],
    );
    await page.locator("#redo-button").click();
    assert.deepEqual(
      (await state()).project.nodes.find((n) => n.id === "j01").position,
      moved,
    );
    await undo();
  });
  await test("3D Y-axis gizmo moves elevation, not plan coordinates", async () => {
    const g = await page
        .locator("#scene-gizmo .axis-y .axis-hit")
        .evaluate((e) => ({
          x1: Number(e.getAttribute("x1")),
          x2: Number(e.getAttribute("x2")),
          y1: Number(e.getAttribute("y1")),
          y2: Number(e.getAttribute("y2")),
        })),
      r = await page.locator("#scene-host").boundingBox();
    const x = r.x + g.x1 * 0.3 + g.x2 * 0.7,
      y = r.y + g.y1 * 0.3 + g.y2 * 0.7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 18, { steps: 4 });
    await page.mouse.up();
    const node = (await state()).project.nodes.find((n) => n.id === "j01");
    assert(node.position[1] >= 1);
    assert.equal(node.position[0], 0);
    assert.equal(node.position[2], 0);
    await undo();
  });
  await test("numeric transform edits are live and undoable", async () => {
    await page.locator('[data-position="0"]').fill("7.5");
    await page.locator('[data-position="0"]').press("Tab");
    assert.equal(
      (await state()).project.nodes.find((n) => n.id === "j01").position[0],
      7.5,
    );
    await undo();
  });
  await test("corner radius slider actually regenerates clean junction geometry", async () => {
    const range = page.locator('input[data-prop="radius"]'),
      r = await range.boundingBox();
    await range.click({ position: { x: r.width * 0.55, y: r.height / 2 } });
    const s = await state();
    assert(s.project.nodes.find((n) => n.id === "j01").radius > 8);
    assert.equal(s.diagnostics.filter((d) => d.level === "error").length, 0);
    await undo();
  });
  await test("keyboard slider edits retain focus and record undo correctly", async () => {
    const range = page.locator('input[data-prop="radius"]');
    await range.focus();
    await range.press("ArrowRight");
    await range.press("ArrowRight");
    assert.equal(
      (await state()).project.nodes.find((n) => n.id === "j01").radius,
      7,
    );
    await undo();
    await undo();
  });
  await test("surface and paving controls apply to every connected approach", async () => {
    await page.locator('[data-inspector-tab="surface"]').click();
    await page.locator('[data-pattern="slabs"]').click();
    await page.locator('[data-surface="concrete"]').click();
    const s = await state(),
      arms = s.project.roads.filter(
        (r) => r.start === "j01" || r.end === "j01",
      );
    assert(
      arms.every((r) => r.pattern === "slabs" && r.surface === "concrete"),
    );
    assert(s.meshes.some((m) => m.material === "paving-slabs"));
    await undo();
    await undo();
  });
  await test("road presets change actual lane widths and sidewalk geometry", async () => {
    await page.locator('[data-asset="arterial"]').click();
    const arms = (await state()).project.roads.filter(
      (r) => r.start === "j01" || r.end === "j01",
    );
    assert(arms.every((r) => r.lanes === 4 && r.laneWidth === 3.25));
    assert.equal(
      (await state()).diagnostics.filter((d) => d.level === "error").length,
      0,
    );
    await undo();
  });
  await test("guardrails are live geometry and drainage can be disabled", async () => {
    await page.locator('[data-inspector-tab="details"]').click();
    await page
      .getByRole("checkbox", { name: "W-beam guardrails", exact: true })
      .check();
    assert(
      (await state()).meshes.some(
        (m) => m.owner === "r01" && m.kind === "rail",
      ),
    );
    await page
      .getByRole("checkbox", { name: "Curb drainage", exact: true })
      .uncheck();
    assert(
      !(await state()).meshes.some(
        (m) => m.owner === "r01" && m.kind === "drain",
      ),
    );
    await undo();
    await undo();
  });
  await test("GLB export contains valid geometry and embedded textures even in clay view", async () => {
    const liveBefore = await state();
    await page.locator("#shade-style").selectOption("clay");
    await page.locator('[data-menu="export-menu"]').click();
    assert.equal(
      await page.locator("#export-detail").inputValue(),
      "production",
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-action="glb"]').click();
    const download = await downloadPromise,
      buffer = await readFile(await download.path());
    assert.equal(buffer.toString("ascii", 0, 4), "glTF");
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    const length = buffer.readUInt32LE(12),
      gltf = JSON.parse(buffer.subarray(20, 20 + length).toString());
    assert(gltf.meshes.length > 20);
    const exportedTriangles = gltf.meshes
      .flatMap((m) => m.primitives)
      .reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);
    assert(exportedTriangles > liveBefore.triangles * 1.5);
    assert(gltf.nodes.some((n) => n.extras?.geometryDetail === "production"));
    assert.deepEqual((await state()).project, liveBefore.project);
    assert.equal((await state()).triangles, liveBefore.triangles);
    assert(gltf.images.length >= 3);
    assert(gltf.images.every((i) => i.bufferView !== undefined));
    assert(!gltf.nodes.some((n) => n.name === "Context terrain"));
    await page.locator("#shade-style").selectOption("shaded");
  });
  await test("OBJ archive includes finite, triangulated mesh and MTL materials", async () => {
    await page.locator('[data-menu="export-menu"]').click();
    const promise = page.waitForEvent("download");
    await page.locator('[data-action="obj"]').click();
    const d = await promise,
      files = unzipSync(await readFile(await d.path())),
      names = Object.keys(files);
    assert(names.some((n) => n.endsWith(".obj")));
    assert(names.some((n) => n.endsWith(".mtl")));
    const obj = new TextDecoder().decode(
      files[names.find((n) => n.endsWith(".obj"))],
    );
    assert(obj.includes("vn "));
    assert(!obj.includes("NaN"));
    assert(names.some((n) => n.startsWith("textures/") && n.endsWith(".png")));
    const mtl = new TextDecoder().decode(
      files[names.find((n) => n.endsWith(".mtl"))],
    );
    assert(mtl.includes("map_Kd -s .") || mtl.includes("map_Kd -s 0.5"));
    assert(
      names.includes("materials.json") &&
        names.includes("IMPORT.txt") &&
        names.includes("mesh.json"),
    );
    const meshManifest = JSON.parse(
      new TextDecoder().decode(files["mesh.json"]),
    );
    assert.equal(meshManifest.geometryDetail, "production");
    assert.equal(meshManifest.units, "metres");
    assert.equal(meshManifest.upAxis, "Y");
    assert(
      meshManifest.objects.some(
        (o) => o.owner.name === "Northbank avenue · West",
      ),
    );
    assert(!meshManifest.includesPreviewEnvironment);
    const manifest = JSON.parse(
      new TextDecoder().decode(files["materials.json"]),
    );
    assert.equal(manifest.normalConvention, "OpenGL +Y");
    const asphalt = manifest.materials.asphalt;
    assert(asphalt.normal && asphalt.roughness);
    assert(names.includes(asphalt.normal) && names.includes(asphalt.roughness));
    assert.deepEqual(asphalt.uvRepeat, [0.5, 0.5]);
    assert.equal(asphalt.dataColorSpace, "linear");
    assert(mtl.includes("norm -s") && mtl.includes("map_Pr -s"));
    assert(
      new TextDecoder().decode(files["IMPORT.txt"]).includes("invert green"),
    );
    for (const path of names.filter((n) => n.endsWith(".png")))
      assert.equal(
        Buffer.from(files[path]).toString("hex", 0, 8),
        "89504e470d0a1a0a",
      );
  });
  await test("JSON download and local save preserve the editable graph", async () => {
    await page.keyboard.press("Control+s");
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("frontier.road-studio.v1")),
    );
    assert.equal(saved.roads.length, 10);
    await page.locator('[data-menu="export-menu"]').click();
    const promise = page.waitForEvent("download");
    await page.locator('#export-menu [data-action="json"]').click();
    const d = await promise;
    assert.deepEqual(JSON.parse(await readFile(await d.path(), "utf8")), saved);
  });
  await test("scene search, full-view modes and resize separator work", async () => {
    await page.locator("#scene-search").fill("viaduct");
    assert.equal(await page.locator("[data-select]").count(), 1);
    await page.locator("#scene-search").fill("");
    await page.locator('button[data-layout="plan"]').click();
    assert.equal(await page.locator(".scene-pane").isVisible(), false);
    await page.locator('button[data-layout="scene"]').click();
    assert.equal(await page.locator(".plan-pane").isVisible(), false);
    await page.locator('button[data-layout="split"]').click();
    const r = await page.locator(".plan-pane").boundingBox();
    await page.locator("#viewport-divider").focus();
    await page.keyboard.press("ArrowRight");
    const after = await page.locator(".plan-pane").boundingBox();
    assert(after.width > r.width);
  });
  await test("invalid mesh export is blocked while editable JSON remains available", async () => {
    const road = (await state()).project.roads[0];
    const loop = {
      version: 1,
      name: "Self-crossing fixture",
      nodes: [
        {
          id: "a",
          name: "A",
          position: [-20, 0, 0],
          radius: 6,
          crossings: true,
        },
        {
          id: "b",
          name: "B",
          position: [20, 0, 0],
          radius: 6,
          crossings: true,
        },
      ],
      roads: [
        {
          ...road,
          id: "loop",
          start: "a",
          end: "b",
          h1: [120, 0, 80],
          h2: [-120, 0, 80],
        },
      ],
    };
    await page.locator("#project-file").setInputFiles({
      name: "loop.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(loop)),
    });
    await page.waitForFunction(
      () => document.querySelector("#project-file").value === "",
    );
    assert.equal((await state()).project.name, "Self-crossing fixture");
    assert((await state()).diagnostics.some((d) => d.level === "error"));
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator('[data-action="glb"]').click();
    assert(
      (await page.locator("#toast").textContent()).includes(
        "Fix invalid geometry",
      ),
    );
    await page.locator('[data-menu="export-menu"]').click();
    const promise = page.waitForEvent("download");
    await page.locator('#export-menu [data-action="json"]').click();
    const download = await promise;
    assert.equal(
      JSON.parse(await readFile(await download.path(), "utf8")).roads[0].id,
      "loop",
    );
  });
  await test("drawing across a road produces a new shared intersection", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("tee"));
    await page.locator('button[data-layout="plan"]').click();
    await page.locator('.main-toolbar [data-tool="draw"]').click();
    for (let i = 0; i < 3; i++) await page.locator("#zoom-out").click();
    const points = await page.evaluate(() =>
        [
          [32, 0, -42],
          [32, 0, 42],
        ].map((p) => window.frontier.worldToPlan(p)),
      ),
      r = await page.locator("#plan-host").boundingBox();
    for (const p of points) await page.mouse.click(r.x + p[0], r.y + p[1]);
    await page.keyboard.press("Escape");
    const s = await state();
    assert.equal(s.project.roads.length, 6);
    assert.equal(s.diagnostics.filter((d) => d.level === "error").length, 0);
    assert(
      s.project.nodes.some(
        (n) =>
          s.project.roads.filter((r) => r.start === n.id || r.end === n.id)
            .length === 4,
      ),
    );
  });
  await test("network template modal loads a fully connected, grade-separated interchange", async () => {
    await page.locator('button[data-layout="split"]').click();
    await page.locator("#templates-button").click();
    await page.locator('[data-template="diamond"]').click();
    const s = await state();
    assert.equal(s.project.name, "Divided diamond interchange");
    assert.equal(s.project.roads.length, 21);
    assert.equal(s.diagnostics.length, 0);
    const n = await page.evaluate(() => ({
      clearances: window.frontier.getNetwork().clearances,
      maxGrade: window.frontier.getNetwork().maxGrade,
    }));
    assert(n.clearances[0].meters >= 5.2);
    assert(n.maxGrade <= 4.05);
    await page.screenshot({
      timeout: 120000,
      path: resolve(cache, "interchange.png"),
    });
  });
  await test("undoing a replacement and deleting a selected road never leave stale handles", async () => {
    await undo();
    assert.equal((await state()).project.name, "Three-way junction");
    await page.locator("#redo-button").click();
    const p = (await state()).project;
    assert.equal(p.name, "Divided diamond interchange");
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      p.roads[0].id,
    );
    await page.keyboard.press("Delete");
    assert.equal((await state()).project.roads.length, 20);
    await undo();
    assert.equal((await state()).project.roads.length, 21);
  });
  await test("project import validates invalid files and restores a saved graph", async () => {
    const before = (await state()).project;
    await page.locator("#project-file").setInputFiles({
      name: "invalid.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ version: 999, nodes: [], roads: [] }),
      ),
    });
    await page.waitForFunction(
      () => document.querySelector("#project-file").value === "",
    );
    assert.deepEqual((await state()).project, before);
    const saved = await page.evaluate(() =>
      localStorage.getItem("frontier.road-studio.v1"),
    );
    await page.locator("#project-file").setInputFiles({
      name: "saved.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(saved),
    });
    await page.waitForFunction(
      () => document.querySelector("#project-file").value === "",
    );
    assert.deepEqual((await state()).project, JSON.parse(saved));
    assert.equal(
      (await state()).diagnostics.filter((d) => d.level === "error").length,
      0,
    );
  });
  await test("Slate FrontierEditor palette, panel dimensions and typography are preserved", async () => {
    assert.equal(
      await page
        .locator(".app-header")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(23, 23, 23)",
    );
    assert.equal(
      await page
        .locator(".outliner")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(22, 22, 22)",
    );
    assert.equal((await page.locator(".outliner").boundingBox()).width, 284);
    assert.equal(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).fontFamily),
      '"DM Sans Variable", "DM Sans", sans-serif',
    );
    assert.equal(
      await page
        .locator(".brand>.version")
        .evaluate((e) => getComputedStyle(e).fontSize),
      "8px",
    );
    assert.equal(await page.locator('[data-asset="block"]').count(), 0);
    assert(await page.locator('[data-library="sites"]').isVisible());
    assert.equal(
      await page
        .locator('[data-layer="building"],[data-layer="landscape"]')
        .count(),
      0,
    );
    assert.equal(await page.locator(".canvas-host>canvas").count(), 2);
  });
  await test("production preview increases tessellation without mutating the graph", async () => {
    const before = await state();
    await page.locator("#geometry-detail").selectOption("production");
    const dense = await state();
    assert(dense.triangles > before.triangles * 1.5);
    assert.deepEqual(dense.project, before.project);
    assert.equal(
      await page.evaluate(() => window.frontier.getNetwork().detail),
      "production",
    );
    await page.locator("#geometry-detail").selectOption("editing");
    assert.equal((await state()).triangles, before.triangles);
    assert.deepEqual((await state()).project, before.project);
  });
  await test("close-up surface inspection changes the camera, never the selected road or site", async () => {
    const before = await state(),
      origin = {
        x: await page
          .locator("#scene-gizmo .axis-y .axis-hit")
          .getAttribute("x1"),
        hidden: await page.locator("#scene-gizmo").getAttribute("hidden"),
      };
    await page.locator("#surface-inspect").click();
    assert.deepEqual((await state()).project, before.project);
    assert.deepEqual((await state()).selection, before.selection);
    const after = {
      x: await page
        .locator("#scene-gizmo .axis-y .axis-hit")
        .getAttribute("x1"),
      hidden: await page.locator("#scene-gizmo").getAttribute("hidden"),
    };
    assert.notDeepEqual(after, origin);
    await page.screenshot({ path: resolve(cache, "surface-inspection.png") });
    await page.locator("#scene-focus").click();
  });
  for (const id of [
    "merge",
    "urban",
    "signal",
    "cloverleaf",
    "trumpet",
    "race",
    "waterfront",
  ])
    await test(`${id} template renders real editable geometry without errors`, async () => {
      await page.evaluate((id) => window.frontier.loadTemplate(id), id);
      const s = await state();
      assert.equal(s.diagnostics.length, 0);
      assert(s.triangles > 10000);
      assert(
        !s.meshes.some((m) =>
          ["building", "landscape", "sign", "lamp"].includes(m.kind),
        ),
      );
      assert(
        !s.project.sites?.some((s) => s.kind === "block" || s.kind === "water"),
      );
      assert.equal(
        await page.locator("#scene-gizmo").getAttribute("hidden"),
        null,
      );
      await page.screenshot({
        timeout: 120000,
        path: resolve(cache, `${id}.png`),
      });
    });
  await test("merge setback moves the paving mouth, not the shared joint position", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("merge"));
    const before = await page.evaluate(() => ({
      p: window.frontier.getProject().nodes[0].position,
      trim: window.frontier
        .getNetwork()
        .spans.find((s) => s.road.name === "Through avenue").frames[0].s,
    }));
    await page.locator('input[data-prop="setback"]').focus();
    await page.locator('input[data-prop="setback"]').press("ArrowRight");
    const after = await page.evaluate(() => ({
      p: window.frontier.getProject().nodes[0].position,
      trim: window.frontier
        .getNetwork()
        .spans.find((s) => s.road.name === "Through avenue").frames[0].s,
    }));
    assert.deepEqual(after.p, before.p);
    assert(Math.abs(after.trim - before.trim - 1) < 1e-6);
    await undo();
  });
  let placedId;
  await test("parking asset is placed in plan as a separate, selectable site", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("district"));
    const before = await state();
    await page.locator('[data-library="sites"]').click();
    await page
      .locator('[data-asset-action="site"][data-asset="parking"]')
      .click();
    const q = await page.evaluate(() =>
      window.frontier.worldToPlan([-62, 0, 80]),
    );
    const box = await page.locator("#plan-host").boundingBox();
    await page.mouse.click(box.x + q[0], box.y + q[1]);
    const s = await state();
    assert.equal(s.project.sites.length, before.project.sites.length + 1);
    assert.deepEqual(s.project.roads, before.project.roads);
    assert.deepEqual(s.project.nodes, before.project.nodes);
    placedId = s.selection.id;
    assert.equal(s.selection.kind, "site");
    assert(s.meshes.some((m) => m.owner === placedId && m.kind === "parking"));
    assert(await page.locator('input[data-prop="width"]').isVisible());
    assert.equal(
      await page.locator("#scene-gizmo").getAttribute("hidden"),
      null,
    );
  });
  await test("site footprint and numeric transform controls rebuild and undo independently", async () => {
    const old = (await state()).project.sites.find((s) => s.id === placedId);
    await page.locator('input[data-prop="width"]').focus();
    await page.locator('input[data-prop="width"]').press("ArrowRight");
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId).width,
      old.width + 1,
    );
    await undo();
    await page.locator('[data-position="0"]').fill(String(old.position[0] + 4));
    await page.locator('[data-position="0"]').press("Tab");
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId).position[0],
      old.position[0] + 4,
    );
    await undo();
  });
  await test("procedural parking dimensions, bay angle and aisle controls change generated layout", async () => {
    const prior = await state();
    await page.locator('input[data-prop="depth"]').focus();
    await page.locator('input[data-prop="depth"]').press("End");
    const deep = await state();
    assert(
      deep.project.sites.find((s) => s.id === placedId).depth >
        prior.project.sites.find((s) => s.id === placedId).depth,
    );
    assert(deep.triangles > prior.triangles);
    const count = await page.evaluate(() => {
      const id = window.frontier.getSelection().id;
      return Number(
        document
          .querySelector('[data-site-stat="capacity"]')
          .textContent.split(" ")[0],
      );
    });
    assert(count > 0);
    assert.equal(
      await page
        .locator('input[data-prop="depth"]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(await page.locator('[data-site-stat="rows"]').count(), 1);
    await undo();
    await page.locator('[data-prop="parkingAngle"]').selectOption("60");
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId).parkingAngle,
      60,
    );
    await undo();
    await page.locator('[data-prop="parkingLayout"]').selectOption("single");
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId)
        .parkingLayout,
      "single",
    );
    await undo();
    assert(
      !(await state()).meshes.some(
        (m) =>
          m.owner === placedId &&
          ["building", "lamp", "sign", "landscape"].includes(m.kind),
      ),
    );
  });
  await test("parking paint wear is a live procedural material, not a decorative prop", async () => {
    await page.locator('[data-inspector-tab="details"]').click();
    await page.locator('[data-prop="paintWear"]').focus();
    await page.locator('[data-prop="paintWear"]').press("End");
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId).paintWear,
      0.35,
    );
    assert(
      (await state()).meshes.some(
        (m) => m.owner === placedId && m.material === "paint-wear-35",
      ),
    );
    await undo();
    await page.locator('[data-inspector-tab="geometry"]').click();
  });
  await test("3D Y-axis gizmo moves the site, not the connected road graph", async () => {
    const before = await state(),
      origin = before.project.sites.find((s) => s.id === placedId).position;
    const g = await page
        .locator("#scene-gizmo .axis-y .axis-hit")
        .evaluate((e) => ({
          x1: Number(e.getAttribute("x1")),
          x2: Number(e.getAttribute("x2")),
          y1: Number(e.getAttribute("y1")),
          y2: Number(e.getAttribute("y2")),
        })),
      r = await page.locator("#scene-host").boundingBox();
    const x = r.x + g.x1 * 0.3 + g.x2 * 0.7,
      y = r.y + g.y1 * 0.3 + g.y2 * 0.7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 18, { steps: 4 });
    await page.mouse.up();
    const s = await state(),
      position = s.project.sites.find((s) => s.id === placedId).position;
    assert(position[1] > origin[1]);
    assert.equal(position[0], origin[0]);
    assert.equal(position[2], origin[2]);
    assert.deepEqual(s.project.nodes, before.project.nodes);
    await undo();
  });
  await test("2D site pivot drag preserves the road graph and can be undone", async () => {
    const before = await state(),
      origin = before.project.sites.find((s) => s.id === placedId).position;
    const q = await page.evaluate(
      (p) => window.frontier.worldToPlan(p),
      origin,
    );
    const box = await page.locator("#plan-host").boundingBox();
    await page.mouse.move(box.x + q[0], box.y + q[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + q[0] + 14, box.y + q[1] - 8, { steps: 4 });
    await page.mouse.up();
    const s = await state(),
      after = s.project.sites.find((s) => s.id === placedId).position;
    assert.notDeepEqual(after, origin);
    assert.deepEqual(s.project.roads, before.project.roads);
    await undo();
  });
  await test("modern site paving has nine choices and is included in real geometry", async () => {
    await page.locator('[data-inspector-tab="surface"]').click();
    assert.equal(await page.locator("[data-pattern]").count(), 9);
    await page.locator('[data-pattern="terrazzo"]').click();
    assert.equal(
      (await state()).project.sites.find((s) => s.id === placedId).pattern,
      "terrazzo",
    );
    assert(
      (await state()).meshes.some(
        (m) => m.owner === placedId && m.material === "paving-terrazzo",
      ),
    );
    await undo();
  });
  await test("deleting and undoing a site never removes or disconnects roads", async () => {
    const before = await state();
    await page.keyboard.press("Delete");
    const s = await state();
    assert(!s.project.sites.some((s) => s.id === placedId));
    assert.deepEqual(s.project.roads, before.project.roads);
    assert.deepEqual(s.project.nodes, before.project.nodes);
    await undo();
    assert((await state()).project.sites.some((s) => s.id === placedId));
  });
  await test("road signs, lights and pedestrian rails are actual editable mesh groups", async () => {
    await page.evaluate(() => {
      window.frontier.loadTemplate("district");
      window.frontier.select({ kind: "road", id: "r02" });
    });
    await page.locator('[data-inspector-tab="details"]').click();
    await page
      .getByRole("checkbox", { name: "Road signs", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Street lighting", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "W-beam guardrails", exact: true })
      .check();
    await page.locator('[data-prop="railStyle"]').selectOption("railing");
    const s = await state();
    assert(
      s.meshes.some(
        (m) => m.owner === "r02" && m.material.startsWith("sign-speed-"),
      ),
    );
    assert(s.meshes.some((m) => m.owner === "r02" && m.kind === "lamp"));
    assert(
      s.meshes.some(
        (m) => m.owner === "r02" && m.kind === "rail" && m.material === "pole",
      ),
    );
  });
  await test("signals are visible geometry and the junction toggle removes them", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("signal"));
    assert(!(await state()).meshes.some((m) => m.material === "signal-red"));
    await page
      .getByRole("checkbox", { name: "Traffic signals", exact: true })
      .check();
    assert((await state()).meshes.some((m) => m.material === "signal-red"));
    await page
      .getByRole("checkbox", { name: "Traffic signals", exact: true })
      .uncheck();
    assert(!(await state()).meshes.some((m) => m.material === "signal-red"));
    await undo();
  });
  await test("racing GLB exports road-only surfaces, rumble textures and PBR channels", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("race"));
    await page.locator("#shade-style").selectOption("clay");
    await page.locator('[data-menu="export-menu"]').click();
    const promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    const d = await promise,
      b = await readFile(await d.path());
    assert.equal(b.toString("ascii", 0, 4), "glTF");
    assert.equal(b.readUInt32LE(8), b.length);
    const g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    assert(
      g.materials.some(
        (m) =>
          m.name === "race-curb" && m.pbrMetallicRoughness.baseColorTexture,
      ),
    );
    assert(
      g.materials.some((m) => m.name === "paving-ashlar" && m.normalTexture),
    );
    assert(
      !g.nodes.some((n) =>
        ["building", "landscape", "sign", "lamp"].includes(n.extras?.meshKind),
      ),
    );
    assert(
      g.materials.some(
        (m) =>
          m.name === "asphalt" &&
          m.normalTexture &&
          m.pbrMetallicRoughness.metallicRoughnessTexture,
      ),
    );
    assert(g.nodes.some((n) => n.extras?.kind === "site"));
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(!g.nodes.some((n) => n.name === "Context terrain"));
    await page.locator("#shade-style").selectOption("shaded");
  });
  await test("procedural surface channels and paint masks are deterministic linear data", async () => {
    const stats = await page.evaluate(async () => {
      const { surfaceMaps, wornPaintCanvas } =
        await import("/src/render/materials.ts");
      const a = surfaceMaps("ashlar"),
        b = surfaceMaps("asphalt");
      const read = (c) =>
        c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const n = read(a.normal),
        r = read(b.roughness),
        fresh = read(wornPaintCanvas(0)),
        worn = read(wornPaintCanvas(25));
      let blue = 0,
        green = 0,
        rough = 0,
        freshHoles = 0,
        wornHoles = 0;
      for (let i = 0; i < n.length; i += 4) {
        blue += n[i + 2];
        green += n[i + 1];
        rough += r[i + 1];
        if (fresh[i + 3] === 0) freshHoles++;
        if (worn[i + 3] === 0) wornHoles++;
      }
      return {
        blue: blue / (n.length / 4),
        green: green / (n.length / 4),
        rough: rough / (n.length / 4),
        freshHoles,
        wornHoles,
        cached: a === surfaceMaps("ashlar"),
      };
    });
    assert(stats.cached);
    assert(stats.blue > 240);
    assert(stats.green > 125 && stats.green < 130);
    assert(stats.rough > 210 && stats.rough < 240);
    assert.equal(stats.freshHoles, 0);
    assert(stats.wornHoles > 1000);
  });
  await test("editing GLB export is independently selectable and leaves the live model untouched", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("tee"));
    const before = await state();
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("editing");
    const promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    const d = await promise,
      b = await readFile(await d.path()),
      g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    const triangles = g.meshes
      .flatMap((m) => m.primitives)
      .reduce((sum, p) => sum + g.accessors[p.indices].count / 3, 0);
    assert.equal(triangles, before.triangles);
    assert(g.nodes.some((n) => n.extras?.geometryDetail === "editing"));
    assert.deepEqual((await state()).project, before.project);
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    await page.keyboard.press("Escape");
  });
  let utilityRoadId;
  const utilityServices = () =>
    page.evaluate(() => {
      const n = window.frontier.getNetwork(),
        id = window.frontier.getSelection()?.id;
      return {
        selected: n.services.filter((s) => s.owner === id),
        all: n.services,
        manholes: n.manholes,
        inlets: n.inlets,
      };
    });
  await test("infrastructure: library is a vertically scrolling grid with visible thumbnails and labels", async () => {
    await page.evaluate(() => {
      window.frontier.loadTemplate("tee");
      window.frontier.select({
        kind: "road",
        id: window.frontier.getProject().roads[0].id,
      });
    });
    utilityRoadId = (await state()).selection.id;
    await page.locator('[data-library="roads"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".asset-thumbnail")].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    );
    const grid = await page.locator("#asset-cards").evaluate((e) => {
      const s = getComputedStyle(e);
      return {
        display: s.display,
        columns: s.gridTemplateColumns.split(" ").length,
        overflow: s.overflowY,
        height: e.clientHeight,
        scroll: e.scrollHeight,
        width: e.clientWidth,
        scrollWidth: e.scrollWidth,
      };
    });
    assert.equal(grid.display, "grid");
    assert(grid.columns >= 2);
    assert.equal(grid.overflow, "auto");
    assert(grid.scroll > grid.height);
    assert(grid.scrollWidth <= grid.width);
    const cards = await page.locator(".asset-card").evaluateAll((cards) =>
      cards.map((e) => {
        const card = e.getBoundingClientRect(),
          preview = e.querySelector(".asset-preview").getBoundingClientRect(),
          label = e.querySelector("strong").getBoundingClientRect(),
          image = e.querySelector("img");
        return {
          height: card.height,
          preview: preview.height,
          labelInside: label.bottom < card.bottom && label.top > preview.top,
          loaded: image.complete && image.naturalWidth > 0,
          source: image.src,
        };
      }),
    );
    assert(
      cards.every(
        (c) => c.height > 130 && c.preview >= 80 && c.labelInside && c.loaded,
      ),
    );
    assert.equal(new Set(cards.map((c) => c.source)).size, cards.length);
    await page.locator('[data-asset="promenade"]').scrollIntoViewIfNeeded();
    assert(await page.locator("#asset-cards").evaluate((e) => e.scrollTop > 0));
    await page.locator("#library-search").fill("Waterfront");
    assert.equal(await page.locator(".asset-card").count(), 1);
    assert(await page.locator(".asset-card strong").isVisible());
    await page.locator("#library-search").fill("");
    await page.locator('[data-library="structures"]').click();
    await page.locator('[data-asset="manhole"]').scrollIntoViewIfNeeded();
    assert(await page.locator('[data-asset="manhole"] strong').isVisible());
    assert(await page.locator('[data-asset="channel"] img').isVisible());
    await page.screenshot({ path: resolve(cache, "library.png") });
  });
  await test("infrastructure: library resizing, keyboard access and collapse do not mutate the project", async () => {
    const before = await state(),
      dock = page.locator(".asset-library"),
      divider = page.locator("#library-divider"),
      height = (await dock.boundingBox()).height;
    await divider.focus();
    await divider.press("ArrowUp");
    assert((await dock.boundingBox()).height > height);
    await divider.press("ArrowDown");
    assert.equal((await dock.boundingBox()).height, height);
    const r = await divider.boundingBox(),
      bounds = await dock.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + 3);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2, r.y - 28, { steps: 3 });
    await page.mouse.up();
    assert((await dock.boundingBox()).height > height + 20);
    const current = await divider.boundingBox();
    await page.mouse.move(current.x + current.width / 2, current.y + 3);
    await page.mouse.down();
    await page.mouse.move(current.x + current.width / 2, bounds.y);
    await page.mouse.up();
    assert.equal((await dock.boundingBox()).height, height);
    await page.locator("#library-collapse").click();
    assert.equal(
      await page.locator("#library-collapse").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(await page.locator("#asset-cards").isVisible(), false);
    await page.locator("#library-collapse").click();
    assert.equal(
      await page.locator("#library-collapse").getAttribute("aria-expanded"),
      "true",
    );
    assert.equal((await dock.boundingBox()).height, height);
    assert.deepEqual((await state()).project, before.project);
  });
  await test("infrastructure: manhole asset applies actual covers and editable metric dimensions", async () => {
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await state(),
      count = (await utilityServices()).selected.filter(
        (s) => s.kind === "manhole",
      ).length;
    assert(count > 0);
    await page.locator('[data-prop="manholes"]').uncheck();
    assert(
      !(await state()).meshes.some(
        (m) => m.owner === utilityRoadId && m.kind === "utility",
      ),
    );
    assert.equal(
      (await utilityServices()).selected.filter((s) => s.kind === "manhole")
        .length,
      0,
    );
    await page.locator('[data-asset="manhole"]').click();
    assert.equal(
      (await state()).project.roads.find((r) => r.id === utilityRoadId)
        .manholes,
      true,
    );
    assert(
      (await state()).meshes.some(
        (m) => m.owner === utilityRoadId && m.material === "utility-cover",
      ),
    );
    await page.locator('[data-prop="manholeDiameter"]').focus();
    await page.locator('[data-prop="manholeDiameter"]').press("End");
    assert(
      (await utilityServices()).selected
        .filter((s) => s.kind === "manhole")
        .every((s) => s.diameter === 1),
    );
    assert(
      (
        await page.locator('[data-output="manholeDiameter"]').textContent()
      ).includes("1.00"),
    );
    await undo();
    await page.locator('[data-prop="manholeSpacing"]').focus();
    await page.locator('[data-prop="manholeSpacing"]').press("End");
    const fewer = (await utilityServices()).selected.filter(
      (s) => s.kind === "manhole",
    ).length;
    assert(fewer < count);
    assert.equal(
      Number(await page.locator('[data-service-stat="manhole"]').textContent()),
      fewer,
    );
    assert(
      await page
        .locator('[data-prop="manholeSpacing"]')
        .evaluate((e) => e === document.activeElement),
    );
    await undo();
    await page.locator('[data-prop="manholeOffset"]').focus();
    await page.locator('[data-prop="manholeOffset"]').press("ArrowRight");
    assert.equal(
      (await state()).project.roads.find((r) => r.id === utilityRoadId)
        .manholeOffset,
      -1.3,
    );
    await undo();
    await undo();
    await undo();
    assert.deepEqual((await state()).project, before.project);
  });
  await test("infrastructure: cover inspection reveals a hidden layer without changing selection or topology", async () => {
    const before = await state();
    await page.locator('[data-menu="layers-menu"]').click();
    await page.locator('[data-layer="utility"]').uncheck();
    await page.keyboard.press("Escape");
    await page.locator('[data-inspector-action="inspect-manhole"]').click();
    assert(await page.locator('[data-layer="utility"]').isChecked());
    assert.deepEqual((await state()).selection, before.selection);
    assert.deepEqual((await state()).project, before.project);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({ path: resolve(cache, "manhole.png") });
  });
  await test("infrastructure: curb inlets and linear channels are discoverable, editable and inspectable", async () => {
    await page.locator('[data-prop="drainage"]').uncheck();
    assert(
      !(await utilityServices()).selected.some((s) => s.kind !== "manhole"),
    );
    await page.locator('[data-asset="drain"]').click();
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "curb-inlet"),
    );
    await page.locator('[data-asset="channel"]').click();
    let features = await utilityServices();
    assert.equal(
      features.selected.filter((s) => s.kind === "channel-drain").length,
      2,
    );
    assert(!features.selected.some((s) => s.kind === "curb-inlet"));
    assert(
      (await state()).meshes.some(
        (m) => m.owner === utilityRoadId && m.material === "utility-grate",
      ),
    );
    await page.locator('[data-prop="drainageType"]').selectOption("both");
    features = await utilityServices();
    assert(
      features.selected.some((s) => s.kind === "curb-inlet") &&
        features.selected.some((s) => s.kind === "channel-drain"),
    );
    assert.equal(
      features.inlets,
      features.all.filter((s) => s.kind === "curb-inlet").length,
    );
    const inlets = features.selected.filter(
      (s) => s.kind === "curb-inlet",
    ).length;
    await page.locator('[data-prop="inletSpacing"]').focus();
    await page.locator('[data-prop="inletSpacing"]').press("End");
    const lower = (await utilityServices()).selected.filter(
      (s) => s.kind === "curb-inlet",
    ).length;
    assert(lower < inlets);
    assert.equal(
      Number(
        await page.locator('[data-service-stat="curb-inlet"]').textContent(),
      ),
      lower,
    );
    await undo();
    const before = await state();
    await page.locator('[data-inspector-action="inspect-drain"]').click();
    assert.deepEqual((await state()).project, before.project);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({ path: resolve(cache, "drainage.png") });
  });
  await test("infrastructure: GLB and OBJ export covers, channel grates, PBR maps and service metadata", async () => {
    const before = await state();
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    let download = await promise,
      buffer = await readFile(await download.path()),
      g = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      );
    assert(g.nodes.some((n) => n.extras?.meshKind === "utility"));
    const extras = g.nodes.find((n) => n.extras?.services)?.extras;
    assert(extras.services.some((s) => s.kind === "manhole"));
    assert(extras.services.some((s) => s.kind === "channel-drain"));
    for (const name of ["utility-cover", "utility-grate"]) {
      const m = g.materials.find((m) => m.name === name);
      assert(
        m.normalTexture && m.pbrMetallicRoughness.metallicRoughnessTexture,
      );
      assert.equal(m.pbrMetallicRoughness.metallicFactor, 0.72);
      const sampler =
        g.samplers[
          g.textures[m.pbrMetallicRoughness.baseColorTexture.index].sampler
        ];
      assert.equal(sampler.wrapS, name === "utility-cover" ? 33071 : 10497);
      assert.equal(sampler.wrapT, 33071);
    }
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert.deepEqual((await state()).project, before.project);
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="obj"]').click();
    download = await promise;
    const files = unzipSync(await readFile(await download.path())),
      decode = (name) => new TextDecoder().decode(files[name]),
      manifest = JSON.parse(decode("materials.json")),
      meshes = JSON.parse(decode("mesh.json")),
      mtl = decode(Object.keys(files).find((n) => n.endsWith(".mtl")));
    for (const key of ["utility-cover", "utility-grate"]) {
      const m = manifest.materials[key];
      assert.equal(m.metallic, 0.72);
      assert(files[m.albedo] && files[m.normal] && files[m.roughness]);
      assert.deepEqual(m.uvRepeat, [1, 1]);
      assert.equal(m.wrapS, key === "utility-cover" ? "clamp" : "repeat");
      assert.equal(m.wrapT, "clamp");
    }
    assert.equal(manifest.materials["utility-iron"].metallic, 0.72);
    assert(mtl.includes("Pm 0.72") && mtl.includes("-clamp on"));
    assert(meshes.objects.some((m) => m.kind === "utility"));
    assert(meshes.services.some((s) => s.kind === "channel-drain"));
    assert.deepEqual((await state()).project, before.project);
  });
  await test("infrastructure: parking covers and perimeter drainage are real independent controls", async () => {
    await page.evaluate(() => window.frontier.placeSite("parking"));
    const p = await page.evaluate(() =>
        window.frontier.worldToPlan([34, 0, 32]),
      ),
      r = await page.locator("#plan-host").boundingBox();
    await page.mouse.click(r.x + p[0], r.y + p[1]);
    const selected = (await state()).selection;
    assert.equal(selected.kind, "site");
    await page.locator('[data-inspector-tab="details"]').click();
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "manhole"),
    );
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "curb-inlet"),
    );
    await page.locator('[data-prop="manholes"]').uncheck();
    assert(
      !(await utilityServices()).selected.some((s) => s.kind === "manhole"),
    );
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "curb-inlet"),
    );
    await page.locator('[data-asset="manhole"]').click();
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "manhole"),
    );
    await page.locator('[data-prop="drainage"]').uncheck();
    assert(
      !(await utilityServices()).selected.some((s) => s.kind === "curb-inlet"),
    );
    await page.locator('[data-asset="drain"]').click();
    assert(
      (await utilityServices()).selected.some((s) => s.kind === "curb-inlet"),
    );
    await page.locator('[data-prop="manholeDiameter"]').focus();
    await page.locator('[data-prop="manholeDiameter"]').press("End");
    assert(
      (await utilityServices()).selected
        .filter((s) => s.kind === "manhole")
        .every((s) => s.diameter === 1),
    );
    assert(
      (await state()).meshes
        .filter((m) => m.owner === selected.id)
        .every(
          (m) => !["building", "landscape", "lamp", "sign"].includes(m.kind),
        ),
    );
    await page.locator('[data-inspector-action="inspect-manhole"]').click();
    await page.screenshot({ path: resolve(cache, "parking-manhole.png") });
  });
  await test("infrastructure: utility surface maps are cached, deterministic and export-compatible", async () => {
    const result = await page.evaluate(async () => {
      const { utilityMaps, Materials } =
        await import("/src/render/materials.ts");
      const cover = utilityMaps("utility-cover"),
        grate = utilityMaps("utility-grate"),
        material = new Materials().get("utility-cover"),
        read = (c) =>
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let b = 0,
        g = 0,
        r = 0;
      const n = read(cover.normal),
        rough = read(cover.roughness);
      for (let i = 0; i < n.length; i += 4) {
        b += n[i + 2];
        g += n[i + 1];
        r += rough[i + 1];
      }
      return {
        cached: cover === utilityMaps("utility-cover"),
        size: cover.albedo.width,
        normalBlue: b / (n.length / 4),
        normalGreen: g / (n.length / 4),
        roughness: r / (n.length / 4),
        metallic: material.metalness,
        wrap: [material.map.wrapS, material.map.wrapT],
        distinct: cover.albedo.toDataURL() !== grate.albedo.toDataURL(),
      };
    });
    assert(result.cached && result.distinct);
    assert.equal(result.size, 512);
    assert(result.normalBlue > 230);
    assert(result.normalGreen > 126 && result.normalGreen < 130);
    assert(result.roughness > 150);
    assert.equal(result.metallic, 0.72);
    assert.deepEqual(result.wrap, [1001, 1001]);
  });

  let footwayRoadId;
  const footwayState = () =>
    page.evaluate(() => {
      const p = window.frontier.getProject(),
        n = window.frontier.getNetwork(),
        s = window.frontier.getSelection();
      return {
        road: p.roads.find((r) => r.id === s?.id),
        footways: n.footways,
        services: n.services,
        inlets: n.inlets,
        meshes: n.meshes.map((m) => ({
          owner: m.owner,
          kind: m.kind,
          material: m.material,
        })),
        diagnostics: n.diagnostics,
      };
    });
  async function footwaySlider(prop, value) {
    await page.locator(`[data-prop="${prop}"]`).evaluate((el, value) => {
      el.value = String(value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
  await test("footways: full-length sidewalk width, curb upstand and crossfall controls are live and undoable", async () => {
    await page.evaluate(() => {
      window.frontier.loadTemplate("tee");
      window.frontier.setGeometryDetail("editing");
      window.frontier.select({
        kind: "road",
        id: window.frontier.getProject().roads[0].id,
      });
    });
    footwayRoadId = (await state()).selection.id;
    await page.locator('button[data-layout="split"]').click();
    await page.locator("#shade-style").selectOption("shaded");
    await page.locator('[data-inspector-tab="surface"]').click();
    assert.equal(
      await page.locator('[data-prop="sidewalk"]').getAttribute("max"),
      "12",
    );
    const before = (await state()).project;
    await page.locator('[data-prop="sidewalk"]').focus();
    await page.locator('[data-prop="sidewalk"]').press("End");
    assert.equal((await footwayState()).road.sidewalk, 12);
    assert.equal(
      await page
        .locator('[data-prop="sidewalk"]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await undo();
    assert.deepEqual((await state()).project, before);
    await page.locator('[data-prop="curbHeight"]').focus();
    await page.locator('[data-prop="curbHeight"]').press("End");
    assert.equal((await footwayState()).road.curbHeight, 0.3);
    assert.equal(
      await page.evaluate(
        () =>
          window.frontier
            .getNetwork()
            .spans.find((s) => s.road.id === window.frontier.getSelection().id)
            .frames[0].curbHeight,
      ),
      0.3,
    );
    await undo();
    await page.locator('[data-prop="sidewalkCrossfall"]').focus();
    await page.locator('[data-prop="sidewalkCrossfall"]').press("End");
    assert.equal((await footwayState()).road.sidewalkCrossfall, 3);
    await undo();
    assert.deepEqual((await state()).project, before);
    assert(
      !(await footwayState()).diagnostics.some((d) => d.level === "error"),
    );
  });
  await test("footways: corner ramps, clear landings and tactile warnings regenerate and inspect without changing the pivot", async () => {
    await page.evaluate(() =>
      window.frontier.select({
        kind: "node",
        id: window.frontier.getNetwork().junctions[0].node.id,
      }),
    );
    await page.locator('[data-inspector-tab="details"]').click();
    assert.equal(
      (await footwayState()).footways.filter((f) => f.kind === "corner-ramp")
        .length,
      6,
    );
    await page.locator('[data-prop="cornerRamps"]').uncheck();
    assert.equal((await footwayState()).footways.length, 0);
    await page.locator('[data-prop="cornerRamps"]').check();
    await page.locator('[data-prop="tactile"]').uncheck();
    assert(
      !(await footwayState()).meshes.some(
        (m) => m.material === "paving-tactile",
      ),
    );
    await page.locator('[data-prop="tactile"]').check();
    await footwaySlider("rampWidth", 3.4);
    await footwaySlider("rampRun", 6);
    const f = (await footwayState()).footways;
    assert(
      f.every(
        (f) =>
          f.width === 3.4 && Math.abs(f.landing - 0.75) < 1e-7 && f.slope < 8.4,
      ),
    );
    assert.equal(
      Number(
        await page.locator('[data-footway-stat="corner-ramp"]').textContent(),
      ),
      6,
    );
    const before = await state();
    await page.locator('[data-inspector-action="inspect-ramp"]').click();
    assert.deepEqual((await state()).selection, before.selection);
    assert.deepEqual((await state()).project, before.project);
    await page.screenshot({ path: resolve(cache, "corner-ramp.png") });
  });
  await test("footways: new infrastructure kits have real distinct thumbnails and readable grid labels", async () => {
    await page.evaluate(() => {
      window.frontier.loadTemplate("tee");
      window.frontier.select({
        kind: "road",
        id: window.frontier.getProject().roads[0].id,
      });
    });
    footwayRoadId = (await state()).selection.id;
    await page.locator('[data-library="structures"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".asset-thumbnail")].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    );
    const sources = [];
    for (const id of ["sidewalk", "corner", "driveway", "kerb", "hollow"]) {
      const card = page.locator(`[data-asset="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      assert(await card.locator("strong").isVisible());
      assert(await card.locator("img").isVisible());
      sources.push(await card.locator("img").getAttribute("src"));
    }
    assert.equal(new Set(sources).size, 5);
    await page.locator('[data-asset="sidewalk"]').click();
    assert((await footwayState()).road.sidewalk >= 4.2);
    assert(await page.locator('[data-prop="curbHeight"]').isVisible());
    await page.screenshot({ path: resolve(cache, "footway-library.png") });
  });
  await test("footways: a driveway kit adds a dropped curb and apron with complete undo and redo", async () => {
    const before = (await state()).project;
    await page.locator('[data-asset="driveway"]').click();
    const added = await footwayState(),
      entry = added.road.driveways[0];
    assert.equal(added.road.driveways.length, 1);
    assert(
      added.footways.some(
        (f) =>
          f.kind === "driveway" &&
          f.owner === footwayRoadId &&
          f.width === 6 &&
          f.apron === 4,
      ),
    );
    assert(
      added.meshes.some(
        (m) =>
          m.owner === footwayRoadId &&
          m.material === "concrete" &&
          m.kind === "paving",
      ),
    );
    assert.equal((await state()).project.nodes.length, before.nodes.length);
    assert.equal((await state()).project.roads.length, before.roads.length);
    assert(
      await page.evaluate(() => window.frontier.inspectFootway("driveway")),
    );
    await page.screenshot({ path: resolve(cache, "driveway.png") });
    await undo();
    assert.deepEqual((await state()).project, before);
    await page.locator("#redo-button").click();
    assert.deepEqual((await footwayState()).road.driveways[0], entry);
  });
  await test("footways: driveway position, side, opening, apron and multiple-entry selection edit only the chosen entry", async () => {
    const before = (await state()).project;
    await page.locator('[data-prop="drivewaySide"]').selectOption("-1");
    await footwaySlider("drivewayAt", 40);
    await footwaySlider("drivewayWidth", 7.6);
    await footwaySlider("drivewayApron", 5.8);
    let s = await footwayState(),
      entry = s.road.driveways[0];
    assert.equal(entry.at, 0.4);
    assert.equal(entry.side, -1);
    assert.equal(entry.width, 7.6);
    assert.equal(entry.apron, 5.8);
    assert(
      s.footways.some(
        (f) =>
          f.kind === "driveway" &&
          f.side === -1 &&
          f.width === 7.6 &&
          f.apron === 5.8,
      ),
    );
    assert.deepEqual((await state()).project.nodes, before.nodes);
    await page.locator('[data-inspector-action="add-driveway"]').click();
    s = await footwayState();
    assert.equal(s.road.driveways.length, 2);
    assert.equal(
      s.footways.filter(
        (f) => f.kind === "driveway" && f.owner === footwayRoadId,
      ).length,
      2,
    );
    assert.deepEqual(s.road.driveways[0], entry);
    await page.locator('[data-prop="activeDriveway"]').selectOption("0");
    assert.equal(
      await page.locator('[data-prop="drivewaySide"]').inputValue(),
      "-1",
    );
    assert.equal(
      await page.locator('[data-prop="drivewayWidth"]').inputValue(),
      "7.6",
    );
    await page.locator('[data-inspector-action="delete-driveway"]').click();
    assert.equal((await footwayState()).road.driveways.length, 1);
    await undo();
    assert.equal((await footwayState()).road.driveways.length, 2);
    assert(
      await page.evaluate(() => window.frontier.inspectFootway("driveway")),
    );
    await page.screenshot({ path: resolve(cache, "driveway-edited.png") });
  });
  await test("footways: side-entry curb drains expose chambers, remove duplicate gully grates and have visible editable spacing", async () => {
    await page.locator('[data-asset="kerb"]').click();
    let s = await footwayState(),
      services = s.services.filter((f) => f.owner === footwayRoadId);
    assert.equal(s.road.curbDrainType, "side-entry");
    assert(services.some((f) => f.style === "side-entry"));
    assert(
      !services.some(
        (f) => f.kind === "curb-inlet" && f.style !== "side-entry",
      ),
    );
    assert(
      s.meshes.some(
        (m) =>
          m.owner === footwayRoadId &&
          m.kind === "drain" &&
          m.material === "concrete",
      ),
    );
    assert.equal(
      await page.locator('[data-prop="curbDrainType"]').inputValue(),
      "side-entry",
    );
    const count = services.filter((f) => f.style === "side-entry").length;
    await footwaySlider("inletSpacing", 6);
    s = await footwayState();
    assert(
      s.services.filter(
        (f) => f.owner === footwayRoadId && f.style === "side-entry",
      ).length > count,
    );
    await undo();
    const before = await state();
    assert(
      await page.evaluate(() =>
        window.frontier.inspectInfrastructure("drainage"),
      ),
    );
    assert.deepEqual((await state()).project, before.project);
    assert.deepEqual((await state()).selection, before.selection);
    await page.screenshot({ path: resolve(cache, "side-entry-drain.png") });
  });
  await test("footways: hollow curbs have arched ports, top access grates and stable production counts", async () => {
    await page.locator('[data-asset="hollow"]').click();
    const before = await state();
    let s = await footwayState(),
      features = s.services.filter(
        (f) => f.owner === footwayRoadId && f.style === "hollow",
      );
    assert.equal(features.length, 2);
    assert(features.every((f) => f.ports > 20 && f.accessGrates > 0));
    assert.equal(
      Number(
        await page.locator('[data-service-stat="curb-inlet"]').textContent(),
      ),
      features.reduce((n, f) => n + f.ports, 0),
    );
    await page.evaluate(() => window.frontier.setGeometryDetail("production"));
    s = await footwayState();
    assert.deepEqual(
      s.services.filter(
        (f) => f.owner === footwayRoadId && f.style === "hollow",
      ),
      features,
    );
    assert.deepEqual((await state()).project, before.project);
    assert(
      await page.evaluate(() =>
        window.frontier.inspectInfrastructure("drainage"),
      ),
    );
    await page.screenshot({ path: resolve(cache, "hollow-curb.png") });
    await page.locator('[data-prop="drainage"]').uncheck();
    assert(
      !(await footwayState()).services.some(
        (f) => f.owner === footwayRoadId && f.kind !== "manhole",
      ),
    );
    await undo();
    await page.evaluate(() => window.frontier.setGeometryDetail("editing"));
  });
  await test("footways: GLB and OBJ retain ramp geometry, apron dimensions, drain ports and curb/tactile PBR maps", async () => {
    const before = await state();
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    let download = await promise,
      buffer = await readFile(await download.path()),
      g = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      );
    const extras = g.nodes.find((n) => n.extras?.footways)?.extras;
    assert(extras);
    assert(extras.footways.some((f) => f.kind === "corner-ramp"));
    assert(
      extras.footways.some((f) => f.kind === "driveway" && f.apron === 5.8),
    );
    assert(extras.services.some((f) => f.style === "hollow" && f.ports > 0));
    for (const name of ["paving-tactile", "curb"]) {
      const m = g.materials.find((m) => m.name === name);
      assert(
        m?.normalTexture && m.pbrMetallicRoughness.metallicRoughnessTexture,
      );
    }
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(
      !g.nodes.some((n) =>
        ["building", "landscape"].includes(n.extras?.meshKind),
      ),
    );
    assert.deepEqual((await state()).project, before.project);
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="obj"]').click();
    download = await promise;
    const files = unzipSync(await readFile(await download.path())),
      decode = (n) => new TextDecoder().decode(files[n]),
      mesh = JSON.parse(decode("mesh.json")),
      materials = JSON.parse(decode("materials.json")).materials;
    assert(mesh.footways.some((f) => f.kind === "driveway" && f.width === 7.6));
    assert(
      mesh.services.some((f) => f.style === "hollow" && f.accessGrates > 0),
    );
    for (const name of ["paving-tactile", "curb"]) {
      const m = materials[name];
      assert(files[m.albedo] && files[m.normal] && files[m.roughness]);
      assert.equal(m.normalConvention, "OpenGL +Y");
    }
    assert.deepEqual(materials["paving-tactile"].uvRepeat, [1, 1]);
    assert.deepEqual(materials.curb.uvRepeat, [2, 2]);
    assert.deepEqual((await state()).project, before.project);
  });

  // Modern mobility and open-space cases are sequential, with their own setup.
  // TEST_FOCUS=mobility: runs this complete group without legacy case state.
  let mobilityRoadId;
  const mobilityState = () =>
    page.evaluate(() => ({
      project: window.frontier.getProject(),
      selection: window.frontier.getSelection(),
      mobility: window.frontier.getNetwork().mobility,
      plantings: window.frontier.getNetwork().plantings,
      blocks: window.frontier.getNetwork().blocks,
      spaces: window.frontier.getNetwork().parkingSpaces,
    }));
  const setRange = async (prop, value) => {
    await page.locator(`[data-prop="${prop}"]`).evaluate((e, v) => {
      e.value = String(v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  await test("mobility: European quarter is connected and contains real bus/cycle/pit/block/parking geometry without trees or buildings", async () => {
    await page.evaluate(() => window.frontier.setGeometryDetail("editing"));
    await page.evaluate(() => window.frontier.loadTemplate("europe"));
    await page.locator('button[data-layout="split"]').click();
    await page.locator("#shade-style").selectOption("shaded");
    const s = await mobilityState(),
      n = await state();
    mobilityRoadId = s.project.roads[0].id;
    assert.equal(s.blocks.length, 4);
    assert(s.mobility.length > 30);
    assert(s.plantings.length > 40);
    assert(s.spaces > 100);
    assert.deepEqual(n.diagnostics, []);
    assert(s.plantings.every((p) => p.containsTree === false));
    assert(s.blocks.every((p) => p.hasBuildings === false));
    assert(!n.meshes.some((m) => ["landscape", "building"].includes(m.kind)));
    await page.locator('[data-library="roads"]').click();
    for (const id of [
      "euro-boulevard",
      "bus-way",
      "cycle-street",
      "cycle-painted",
    ]) {
      const card = page.locator(`[data-asset="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      assert(await card.locator("img").isVisible());
      assert(
        (await card.locator("img").getAttribute("src")).startsWith(
          "data:image/png",
        ),
      );
    }
    await page.screenshot({ path: resolve(cache, "european-quarter.png") });
  });
  await test("mobility: bus and protected-cycle controls edit the selected profile, preserve lane count and support undo", async () => {
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      mobilityRoadId,
    );
    await page.locator('[data-inspector-tab="geometry"]').click();
    const before = await mobilityState();
    assert.equal(
      await page.locator('[data-prop="cycleMode"]').inputValue(),
      "protected",
    );
    assert.equal(
      await page.locator('[data-prop="busLanes"]').inputValue(),
      "outer",
    );
    await setRange("cycleWidth", 2.5);
    let s = await mobilityState();
    assert.equal(s.project.roads.find((r) => r.id === mobilityRoadId).lanes, 4);
    assert.equal(
      s.project.roads.find((r) => r.id === mobilityRoadId).cycleWidth,
      2.5,
    );
    assert(
      s.mobility
        .filter((m) => m.owner === mobilityRoadId && m.kind === "cycle-track")
        .every((m) => m.width === 2.5),
    );
    await undo();
    assert.deepEqual((await mobilityState()).project, before.project);
    await page.locator('[data-prop="busLanes"]').selectOption("none");
    assert(
      !(await mobilityState()).mobility.some(
        (m) => m.owner === mobilityRoadId && m.kind === "bus-lane",
      ),
    );
    await undo();
    await page.locator('[data-prop="cycleMode"]').selectOption("painted");
    assert(
      !(await state()).meshes.some(
        (m) =>
          m.owner === mobilityRoadId &&
          m.kind === "cycle" &&
          m.material === "curb",
      ),
    );
    await undo();
    assert(
      await page.evaluate(() => window.frontier.inspectPlanning("mobility")),
    );
    await page.screenshot({ path: resolve(cache, "protected-cycle-bus.png") });
  });
  await test("mobility: planting edits retain 2 m clear walking space, reveal real slotted grates and keep history", async () => {
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await mobilityState();
    assert(await page.locator('[data-prop="treePits"]').isChecked());
    await setRange("pitWidth", 2.2);
    let s = await mobilityState();
    assert(
      s.plantings
        .filter((p) => p.owner === mobilityRoadId)
        .every((p) => p.clearWalkWidth >= 2 && p.width === 2.2),
    );
    await undo();
    await page.locator('[data-prop="pitGrate"]').check();
    s = await mobilityState();
    assert(s.plantings.some((p) => p.owner === mobilityRoadId && p.grate));
    assert(
      (await state()).meshes.some(
        (m) => m.owner === mobilityRoadId && m.material === "tree-grate",
      ),
    );
    assert(
      await page.evaluate(() => window.frontier.inspectPlanning("planting")),
    );
    await page.screenshot({ path: resolve(cache, "planting-grate.png") });
    await undo();
    assert.deepEqual((await mobilityState()).project, before.project);
  });
  await test("mobility: small independent tree-growing pieces place, resize and export without adding a tree", async () => {
    const before = await state();
    await page.evaluate(() => window.frontier.placeSite("tree-pit"));
    const pos = await page.evaluate(() =>
        window.frontier.worldToPlan([0, 0, 135]),
      ),
      rect = await page.locator("#plan-host").boundingBox();
    await page.mouse.click(rect.x + pos[0], rect.y + pos[1]);
    let s = await mobilityState();
    assert.equal(s.project.sites.length, before.project.sites.length + 1);
    const pit = s.project.sites.find((p) => p.id === s.selection.id);
    assert.equal(pit.kind, "tree-pit");
    assert.equal(pit.width, 1.8);
    assert.equal(pit.depth, 3);
    await page.locator('[data-inspector-tab="geometry"]').click();
    await setRange("width", 2.4);
    s = await mobilityState();
    assert.equal(s.project.sites.find((p) => p.id === pit.id).width, 2.4);
    assert(
      s.plantings.some(
        (p) =>
          p.owner === pit.id && p.width === 2.4 && p.containsTree === false,
      ),
    );
    await undo();
    await page.locator('[data-prop="pitGrate"]').check();
    assert(
      await page.evaluate(() => window.frontier.inspectPlanning("planting")),
    );
    await page.screenshot({ path: resolve(cache, "standalone-tree-pit.png") });
    await undo();
    await undo();
    assert.deepEqual((await state()).project, before.project);
  });
  await test("mobility: block frontage and actual vehicle gateways remain editable, with an explicit open/paved courtyard choice", async () => {
    const id = await page.evaluate(
      () =>
        window.frontier.getProject().sites.find((s) => s.kind === "urban-block")
          .id,
    );
    await page.evaluate(
      (id) => window.frontier.select({ kind: "site", id }),
      id,
    );
    await page.locator('[data-inspector-tab="geometry"]').click();
    const before = await mobilityState();
    await setRange("blockBand", 4);
    assert.equal(
      (await mobilityState()).blocks.find((b) => b.owner === id).bandWidth,
      4,
    );
    await undo();
    await page.locator('[data-prop="blockInterior"]').selectOption("paved");
    assert.equal(
      (await mobilityState()).blocks.find((b) => b.owner === id).interior,
      "paved",
    );
    await undo();
    await page.locator('[data-inspector-tab="details"]').click();
    await setRange("blockEntryWidth", 8.5);
    assert.equal(
      (await mobilityState()).blocks.find((b) => b.owner === id).entry.width,
      8.5,
    );
    await undo();
    assert.deepEqual((await mobilityState()).project, before.project);
    assert(await page.evaluate(() => window.frontier.inspectSelection()));
    await page.screenshot({ path: resolve(cache, "open-block-courtyard.png") });
  });
  await test("mobility: parking islands, EV reservations and permeable bay finishes regenerate capacity and geometry", async () => {
    const id = await page.evaluate(
      () =>
        window.frontier.getProject().sites.find((s) => s.kind === "parking").id,
    );
    await page.evaluate(
      (id) => window.frontier.select({ kind: "site", id }),
      id,
    );
    await page.locator('[data-inspector-tab="details"]').click();
    const before = await mobilityState(),
      count = before.plantings.filter((p) => p.owner === id).length;
    await setRange("islandEvery", 9);
    let s = await mobilityState();
    assert(s.plantings.filter((p) => p.owner === id).length < count);
    assert(s.spaces > before.spaces);
    await undo();
    await setRange("evBays", 6);
    assert.equal(
      (await mobilityState()).project.sites.find((p) => p.id === id).evBays,
      6,
    );
    assert(
      (await state()).meshes.some(
        (m) => m.owner === id && m.material === "marking-ev",
      ),
    );
    await undo();
    await page.locator('[data-inspector-tab="surface"]').click();
    assert.equal(
      await page.locator('[data-prop="bayFinish"]').inputValue(),
      "permeable",
    );
    await page.locator('[data-prop="bayFinish"]').selectOption("concrete");
    assert(
      (await state()).meshes.some(
        (m) =>
          m.owner === id && m.kind === "parking" && m.material === "concrete",
      ),
    );
    await undo();
    await page.locator('[data-menu="layers-menu"]').click();
    for (const layer of ["bus", "cycle", "planting"]) {
      await page.locator(`[data-layer="${layer}"]`).uncheck();
      await page.locator(`[data-layer="${layer}"]`).check();
    }
    await page.keyboard.press("Escape");
    assert(await page.evaluate(() => window.frontier.inspectSelection()));
    await page.screenshot({ path: resolve(cache, "modern-parking-court.png") });
    assert.deepEqual((await mobilityState()).project, before.project);
  });
  await test("mobility: the reported radius-2, elevated junction remains clean when its sidewalks widen to 12 m", async () => {
    await page.evaluate(() => {
      window.frontier.loadTemplate("district");
      window.frontier.select({ kind: "node", id: "j01" });
      window.frontier.moveJoint("j01", [0, 3, 0]);
    });
    await page.locator('[data-inspector-tab="geometry"]').click();
    await setRange("radius", 2);
    await setRange("sidewalk", 12);
    await setRange("laneWidth", 3.3);
    const fit = await page.evaluate(() => {
      const j = window.frontier
        .getNetwork()
        .junctions.find((j) => j.node.id === "j01");
      return {
        valid: j.valid,
        radius: j.radius,
        requested: j.requestedRadius,
        actualFloor: Math.max(
          ...j.arms.map((a) => a.frame.sw + a.frame.cw + 0.75),
        ),
        points: j.outer,
        errors: window.frontier
          .getNetwork()
          .diagnostics.filter((d) => d.level === "error"),
      };
    });
    assert(fit.valid);
    assert.equal(fit.requested, 2);
    assert(Math.abs(fit.radius - fit.actualFloor) < 1e-8);
    assert(fit.radius > 12);
    assert(fit.points.every((p) => p.every(Number.isFinite)));
    assert.deepEqual(fit.errors, []);
    assert.equal(
      Number(await page.locator("[data-radius-fit]").textContent()),
      Number(fit.radius.toFixed(2)),
    );
    assert(await page.evaluate(() => window.frontier.inspectSelection()));
    await page.screenshot({ path: resolve(cache, "wide-clean-corner.png") });
  });
  await test("mobility: GLB/OBJ embed mobility and empty-space metadata plus bus/cycle/soil/grate PBR channels", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("europe"));
    const p = await page.evaluate(() => {
      const p = window.frontier.getProject();
      p.name = "Mobility export fixture";
      p.roads = p.roads.slice(0, 1);
      const block = {
          ...p.sites.find((s) => s.kind === "urban-block"),
          id: "export-block",
          width: 32,
          depth: 32,
          position: [-55, 0, 30],
        },
        parking = {
          ...p.sites.find((s) => s.kind === "parking"),
          id: "export-parking",
          width: 38,
          depth: 26,
          position: [20, 0, 35],
        },
        pit = {
          ...block,
          id: "export-pit",
          kind: "tree-pit",
          width: 1.8,
          depth: 3,
          shape: "rectangle",
          pitGrate: true,
          position: [55, 0, 35],
        };
      p.sites = [block, parking, pit];
      return p;
    });
    await page.locator("#project-file").setInputFiles({
      name: "mobility-export.road.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await page.waitForFunction(
      () => window.frontier.getProject().name === "Mobility export fixture",
    );
    await page.waitForFunction(
      () => !document.querySelector("#project-file").value,
    );
    const before = await mobilityState();
    await page.locator('[data-menu="export-menu"]').click();
    await page.locator("#export-detail").selectOption("production");
    let promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="glb"]').click();
    let download = await promise,
      buffer = await readFile(await download.path()),
      g = JSON.parse(
        buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
      );
    const extras = g.nodes.find((n) => n.extras?.mobility)?.extras;
    assert(extras?.mobility.some((m) => m.kind === "bus-lane"));
    assert(extras.mobility.some((m) => m.kind === "cycle-track"));
    assert(extras.plantings.every((p) => p.containsTree === false));
    assert(extras.blocks.some((b) => b.hasBuildings === false));
    for (const key of ["bus-red", "cycle-red", "soil", "tree-grate"]) {
      const m = g.materials.find((m) => m.name === key);
      assert(
        m?.normalTexture && m.pbrMetallicRoughness.metallicRoughnessTexture,
        key,
      );
    }
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(
      !g.nodes.some((n) =>
        ["building", "landscape"].includes(n.extras?.meshKind),
      ),
    );
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('[data-action="obj"]').click();
    download = await promise;
    const files = unzipSync(await readFile(await download.path())),
      decode = (n) => new TextDecoder().decode(files[n]),
      mesh = JSON.parse(decode("mesh.json")),
      mats = JSON.parse(decode("materials.json")).materials;
    assert(mesh.mobility.some((m) => m.kind === "bus-lane"));
    assert(mesh.blocks.length === 1);
    assert(mesh.plantings.every((p) => p.containsTree === false));
    for (const key of ["bus-red", "cycle-red", "soil", "tree-grate"]) {
      const m = mats[key];
      assert(files[m.albedo] && files[m.normal] && files[m.roughness]);
    }
    assert.equal(mats["tree-grate"].metallic, 0.72);
    assert.deepEqual((await mobilityState()).project, before.project);
    await page.locator('[data-menu="export-menu"]').click();
    promise = page.waitForEvent("download");
    await page.locator('#export-menu [data-action="json"]').click();
    download = await promise;
    const saved = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.equal(saved.roads[0].cycleMode, "protected");
    assert.equal(saved.sites.find((s) => s.kind === "tree-pit").pitGrate, true);
  });

  await test("mobile layout keeps both views usable without horizontal overflow", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("district"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector("#viewports").clientWidth < 500,
    );
    assert(await page.locator(".plan-pane").isVisible());
    assert(await page.locator(".scene-pane").isVisible());
    const planRect = await page.locator(".plan-pane").boundingBox(),
      sceneRect = await page.locator(".scene-pane").boundingBox();
    assert(
      planRect.width >= 385 && sceneRect.width >= 385,
      "both mobile views must span the full width, not an implicit four-pixel track",
    );
    assert(
      sceneRect.y >= planRect.y + planRect.height - 0.5,
      "mobile 3D view belongs below the plan",
    );
    assert(
      planRect.height > 140 && sceneRect.height > 140,
      "both linked views retain usable canvas space",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.locator("#toggle-inspector").click();
    assert(await page.locator("#inspector").isVisible());
    await page.locator("#inspector-close").click();
    assert.equal(await page.locator("#inspector").isVisible(), false);
    await page.locator('[data-library="structures"]').click();
    const mobileGrid = await page.locator("#asset-cards").evaluate((e) => ({
      columns: getComputedStyle(e).gridTemplateColumns.split(" ").length,
      height: e.clientHeight,
      scroll: e.scrollHeight,
    }));
    assert(mobileGrid.columns >= 2);
    assert(mobileGrid.scroll > mobileGrid.height);
    await page.locator('[data-asset="manhole"]').scrollIntoViewIfNeeded();
    assert(await page.locator('[data-asset="manhole"] img').isVisible());
    assert(await page.locator('[data-asset="manhole"] strong').isVisible());
    await page.screenshot({ path: resolve(cache, "mobile.png") });
    await page.setViewportSize({ width: 1512, height: 982 });
  });
  await test("self-contained HTML runs offline without CDN or network requests", async () => {
    const offline = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      }),
      requests = [],
      offlineErrors = [];
    offline.on("request", (r) => {
      if (r.url().startsWith("http")) requests.push(r.url());
    });
    offline.on("pageerror", (e) => offlineErrors.push(e.message));
    await offline.route(/^https?:/, (route) => route.abort());
    await offline.goto(`file://${resolve("RoadDesigner.html")}`);
    await offline.waitForFunction(() => !!window.frontier);
    await offline.evaluate(() => document.fonts.ready);
    assert.equal(
      await offline.evaluate(() => window.frontier.getProject().roads.length),
      10,
    );
    assert.equal(offlineErrors.length, 0, offlineErrors.join("\n"));
    assert.deepEqual(requests, []);
    assert((await offline.locator(".asset-thumbnail").count()) > 0);
    await offline.locator('[data-library="structures"]').click();
    await offline.locator('[data-asset="manhole"]').scrollIntoViewIfNeeded();
    assert(await offline.locator('[data-asset="manhole"] img').isVisible());
    await offline.locator('[data-inspector-tab="details"]').click();
    assert(await offline.locator('[data-prop="manholes"]').isChecked());
    assert(
      await offline.evaluate(() =>
        window.frontier.inspectInfrastructure("manhole"),
      ),
    );
    assert(
      await offline.evaluate(
        () => window.frontier.getProject().roads[0].sidewalk === 4.2,
      ),
    );
    assert(
      await offline.evaluate(() =>
        window.frontier
          .getNetwork()
          .footways.some((f) => f.kind === "corner-ramp"),
      ),
    );
    for (const id of ["corner", "driveway", "kerb", "hollow"]) {
      await offline.locator(`[data-asset="${id}"]`).scrollIntoViewIfNeeded();
      assert(await offline.locator(`[data-asset="${id}"] img`).isVisible());
    }
    await offline.evaluate(() =>
      window.frontier.select({
        kind: "road",
        id: window.frontier.getProject().roads[0].id,
      }),
    );
    await offline.locator('[data-asset="hollow"]').click();
    assert(
      await offline.evaluate(() =>
        window.frontier
          .getNetwork()
          .services.some((s) => s.style === "hollow" && s.ports > 0),
      ),
    );
    assert(
      await offline.evaluate(() => window.frontier.inspectFootway("driveway")),
    );
    await offline.evaluate(() => window.frontier.loadTemplate("race"));
    assert.equal(
      await offline.evaluate(() => window.frontier.getProject().roads.length),
      13,
    );
    assert(
      await offline.evaluate(() =>
        window.frontier
          .getNetwork()
          .meshes.some((m) => m.material === "race-curb"),
      ),
    );
    assert.deepEqual(requests, []);
    await offline.evaluate(() => window.frontier.loadTemplate("europe"));
    const mobility = await offline.evaluate(() => ({
      mobility: window.frontier.getNetwork().mobility,
      plantings: window.frontier.getNetwork().plantings,
      blocks: window.frontier.getNetwork().blocks,
      meshes: window.frontier
        .getNetwork()
        .meshes.map((m) => ({ kind: m.kind, material: m.material })),
    }));
    assert(
      mobility.mobility.length > 30 &&
        mobility.plantings.length > 40 &&
        mobility.blocks.length === 4,
    );
    assert(mobility.plantings.every((p) => p.containsTree === false));
    assert(
      !mobility.meshes.some((m) => ["building", "landscape"].includes(m.kind)),
    );
    assert(
      await offline.evaluate(() => window.frontier.inspectPlanning("mobility")),
    );
    assert.deepEqual(offlineErrors, []);
    await offline.screenshot({ path: resolve(cache, "offline.png") });
    // Keep this context for the last connected-infrastructure offline check.
    // Closing a context mid-suite breaks npm Chromium single-process mode.
    offlinePage = offline;
  });
  await test("roadside parking: standalone European bays run offline with functional live controls and inspection", async () => {
    const offline =
        offlinePage ??
        (await browser.newPage({ viewport: { width: 1512, height: 982 } })),
      requests = [],
      offlineErrors = [];
    offlinePage = offline;
    offline.on("pageerror", (e) => offlineErrors.push(e.message));
    await offline.route(/^https?:\/\//, (r) => {
      requests.push(r.request().url());
      return r.abort();
    });
    await offline.goto(`file://${resolve("RoadDesigner.html")}`);
    await offline.waitForFunction(() => !!window.frontier);
    await offline.evaluate(() => window.frontier.loadTemplate("europe"));
    const before = await offline.evaluate(() => ({
      project: window.frontier.getProject(),
      bays: window.frontier.getNetwork().roadsideParking,
    }));
    assert.equal(before.bays.length, 180);
    const id = before.project.roads[0].id;
    await offline.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      id,
    );
    await offline.locator('[data-inspector-tab="details"]').click();
    assert(
      await offline.evaluate(() =>
        window.frontier.inspectRoadDetail("parking"),
      ),
    );
    await offline.locator('[data-prop="parking"]').selectOption("none");
    assert(
      !(await offline.evaluate(
        (id) =>
          window.frontier
            .getNetwork()
            .roadsideParking.some((b) => b.owner === id),
        id,
      )),
    );
    await offline.evaluate(() => window.frontier.undo());
    assert.equal(
      await offline.evaluate(
        () => window.frontier.getNetwork().roadsideParking.length,
      ),
      180,
    );
    assert.deepEqual(
      await offline.evaluate(() => window.frontier.getProject()),
      before.project,
    );
    assert.deepEqual(requests, []);
    assert.deepEqual(offlineErrors, []);
    await offline.screenshot({
      timeout: 120000,
      path: resolve(cache, "offline-roadside-parking.png"),
    });
    // The shared single-process Chromium context stays alive until the final check.
  });
  await test("continuity: standalone seat metadata, landing protection and undo run fully offline", async () => {
    const offline =
        offlinePage ??
        (await browser.newPage({ viewport: { width: 1512, height: 982 } })),
      requests = [],
      offlineErrors = [];
    offlinePage = offline;
    offline.on("pageerror", (e) => offlineErrors.push(e.message));
    await offline.route(/^https?:\/\//, (r) => {
      requests.push(r.request().url());
      return r.abort();
    });
    await offline.goto(`file://${resolve("RoadDesigner.html")}`);
    await offline.waitForFunction(() => !!window.frontier);
    await offline.evaluate(() => window.frontier.loadTemplate("diamond"));
    let data = await offline.evaluate(() => ({
      project: window.frontier.getProject(),
      design: window.frontier.getNetwork().designReview,
      bridges: window.frontier.getNetwork().bridges,
    }));
    assert(data.bridges.every((b) => b.bearings.length > 0));
    assert(
      data.design.junctionLanes.some(
        (j) => j.incoming === 3 && j.outgoing === 3,
      ),
    );
    await offline.locator('[data-inspector-tab="details"]').click();
    await offline.locator('[data-prop="bridgeFrom"]').evaluate((e) => {
      e.value = "50";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    let issues = await offline.evaluate(
      () => window.frontier.getNetwork().designReview.structureIssues,
    );
    assert(issues.some((i) => i.kind === "abutment"));
    await offline.locator("#undo-button").click();
    issues = await offline.evaluate(
      () => window.frontier.getNetwork().designReview.structureIssues,
    );
    assert.deepEqual(issues, []);
    assert.deepEqual(requests, []);
    assert.deepEqual(offlineErrors, []);
  });
  await test("reference: standalone reference geometry and editable dimensions work with all external requests blocked", async () => {
    const offline =
        offlinePage ??
        (await browser.newPage({ viewport: { width: 1512, height: 982 } })),
      requests = [],
      offlineErrors = [];
    offlinePage = offline;
    offline.on("pageerror", (e) => offlineErrors.push(e.message));
    await offline.route(/^https?:\/\//, (r) => {
      requests.push(r.request().url());
      return r.abort();
    });
    await offline.goto(`file://${resolve("RoadDesigner.html")}`);
    await offline.waitForFunction(() => !!window.frontier);
    for (const id of ["diamond", "cloverleaf", "trumpet"]) {
      await offline.evaluate((id) => window.frontier.loadTemplate(id), id);
      const data = await offline.evaluate(() => ({
        design: window.frontier.getNetwork().designReview,
        diagnostics: window.frontier.getNetwork().diagnostics,
      }));
      assert(data.design.withinSelectedTargets);
      assert(data.design.minimumClearance >= 5.2);
      assert.deepEqual(data.diagnostics, []);
    }
    await offline.evaluate(() => window.frontier.loadTemplate("diamond"));
    await offline.locator('[data-inspector-tab="details"]').click();
    assert(await offline.locator('[data-prop="bridgeFrom"]').isVisible());
    assert(
      await offline.evaluate(() => window.frontier.inspectRoadDetail("bridge")),
    );
    assert.deepEqual(requests, []);
    assert.deepEqual(offlineErrors, []);
  });
  await test("connected infrastructure: standalone highway bridges, city and splitters run with the network blocked", async () => {
    const offline =
        offlinePage ??
        (await browser.newPage({
          viewport: { width: 1512, height: 982 },
        })),
      requests = [],
      offlineErrors = [];
    offline.on("pageerror", (e) => offlineErrors.push(e.message));
    await offline.route(/^https?:\/\//, (r) => {
      requests.push(r.request().url());
      return r.abort();
    });
    try {
      await offline.goto(`file://${resolve("RoadDesigner.html")}`);
      await offline.waitForFunction(() => !!window.frontier);
      for (const id of ["bridge", "city", "dumbbell", "merge"]) {
        await offline.evaluate((id) => window.frontier.loadTemplate(id), id);
        assert.equal(
          await offline.evaluate(
            () => window.frontier.getNetwork().diagnostics.length,
          ),
          0,
        );
        const data = await offline.evaluate(() => ({
          bridges: window.frontier.getNetwork().bridges,
          details: window.frontier.getNetwork().streetDetails,
          splitters: window.frontier.getNetwork().splitters,
        }));
        if (id === "bridge") assert.equal(data.bridges.length, 2);
        if (id === "city")
          assert(data.details.some((f) => f.kind === "curb-extension"));
        if (id === "merge") assert.equal(data.splitters.length, 1);
      }
      assert.deepEqual(requests, []);
      assert.deepEqual(offlineErrors, []);
    } finally {
      await offline.close();
    }
  });

  assert.deepEqual(errors, []);
  await writeFile(
    resolve(cache, "results.json"),
    JSON.stringify({ passed: results.length, errors, results }, null, 2),
  );
  console.log(
    `\n${results.length} browser checks passed. No runtime errors. Screenshots: .cache/browser/`,
  );
} finally {
  await browser.close();
}
