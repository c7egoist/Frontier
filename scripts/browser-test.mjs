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
async function test(name, fn) {
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
    await page.locator("#shade-style").selectOption("clay");
    await page.locator('[data-menu="export-menu"]').click();
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
    assert.equal(s.project.name, "Diamond interchange");
    assert.equal(s.project.roads.length, 10);
    assert.equal(s.diagnostics.length, 0);
    const n = await page.evaluate(() => ({
      clearances: window.frontier.getNetwork().clearances,
      maxGrade: window.frontier.getNetwork().maxGrade,
    }));
    assert(n.clearances[0].meters >= 5.7);
    assert(n.maxGrade < 8);
    await page.screenshot({ path: resolve(cache, "interchange.png") });
  });
  await test("undoing a replacement and deleting a selected road never leave stale handles", async () => {
    await undo();
    assert.equal((await state()).project.name, "Three-way junction");
    await page.locator("#redo-button").click();
    const p = (await state()).project;
    assert.equal(p.name, "Diamond interchange");
    await page.evaluate(
      (id) => window.frontier.select({ kind: "road", id }),
      p.roads[0].id,
    );
    await page.keyboard.press("Delete");
    assert.equal((await state()).project.roads.length, 9);
    await undo();
    assert.equal((await state()).project.roads.length, 10);
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
  await test("dark graphite UI retains the linked editor layout", async () => {
    assert.equal(
      await page
        .locator(".app-header")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(19, 22, 25)",
    );
    assert(await page.locator('[data-library="sites"]').isVisible());
    assert.equal(await page.locator(".canvas-host>canvas").count(), 2);
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
      assert.equal(
        await page.locator("#scene-gizmo").getAttribute("hidden"),
        null,
      );
      await page.screenshot({ path: resolve(cache, `${id}.png`) });
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
    assert((await state()).meshes.some((m) => m.material === "signal-red"));
    await page
      .getByRole("checkbox", { name: "Traffic signals", exact: true })
      .uncheck();
    assert(!(await state()).meshes.some((m) => m.material === "signal-red"));
    await undo();
  });
  await test("racing GLB exports sites, signs, rumble textures and original normal maps", async () => {
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
    assert(g.materials.some((m) => m.name === "sign-speed-40"));
    assert(g.nodes.some((n) => n.extras?.kind === "site"));
    assert(g.images.every((i) => i.bufferView !== undefined));
    assert(!g.nodes.some((n) => n.name === "Context terrain"));
    await page.locator("#shade-style").selectOption("shaded");
  });
  await test("mobile layout keeps both views usable without horizontal overflow", async () => {
    await page.evaluate(() => window.frontier.loadTemplate("district"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector("#viewports").clientWidth < 500,
    );
    assert(await page.locator(".plan-pane").isVisible());
    assert(await page.locator(".scene-pane").isVisible());
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.locator("#toggle-inspector").click();
    assert(await page.locator("#inspector").isVisible());
    await page.locator("#inspector-close").click();
    assert.equal(await page.locator("#inspector").isVisible(), false);
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
    assert.deepEqual(offlineErrors, []);
    await offline.screenshot({ path: resolve(cache, "offline.png") });
    await offline.close();
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
