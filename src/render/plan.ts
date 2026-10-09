import {
  siteOutline,
  insidePolygon,
  makeSite,
  type SiteKind,
} from "../core/sites";
import {
  type Project,
  type Selection,
  type Road,
  getNode,
  controlPoints,
  roadHalfWidth,
} from "../core/model";
import { type Network, type MeshData } from "../core/geometry";
import { findSnap } from "../core/editing";
import { cubic, add, sub, type V3 } from "../core/math";
import { closestOnAlignment } from "../core/curves";
import { patternCanvas } from "./materials";
export type ToolMode = "select" | "draw" | "move" | "pan" | "measure" | "place";
export interface EditDrag {
  target: "node" | "road" | "site" | "h1" | "h2";
  id: string;
  value: V3;
  phase: "start" | "move" | "end";
}
export class PlanView {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  project?: Project;
  network?: Network;
  selection: Selection = null;
  mode: ToolMode = "select";
  scale = 2;
  private fitScale = 2;
  center: V3 = [0, 0, 0];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private grid = true;
  private labels = true;
  private drainage = false;
  private snap = true;
  private space = false;
  private patterns = new Map<string, CanvasPattern>();
  private hiddenLayers = new Set<string>();
  draft: V3 | null = null;
  placementKind: SiteKind = "plaza";
  private pointer: V3 | null = null;
  private snapped = false;
  private measure: V3[] = [];
  private interaction: {
    kind: "pan" | "edit";
    last: [number, number];
    start: V3;
    target?: EditDrag["target"];
    id?: string;
    initial?: V3;
    axis?: "x" | "z";
    moved: boolean;
  } | null = null;
  constructor(
    private container: HTMLElement,
    private onSelect: (s: Selection) => void,
    private onDrag: (d: EditDrag) => void,
    private onDraw: (p: V3) => void,
    private onZoom: (percent: number) => void,
    private onPointer: (p: V3 | null) => void,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "Interactive 2D road plan. Select a junction and drag its central handle.",
    );
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(container);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(-e.deltaY * 0.0012), e.offsetX, e.offsetY);
      },
      { passive: false },
    );
    this.canvas.addEventListener("pointerdown", this.pointerDown);
    this.canvas.addEventListener("pointermove", this.pointerMove);
    this.canvas.addEventListener("pointerup", this.pointerUp);
    this.canvas.addEventListener("pointercancel", this.pointerUp);
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.interaction) {
        this.pointer = null;
        this.onPointer(null);
        this.render();
      }
    });
    this.canvas.addEventListener("dblclick", () => {
      if (this.selection?.kind === "node") {
        this.center = [...getNode(this.project!, this.selection.id).position];
        this.scale = Math.max(this.fitScale * 1.8, 4);
        this.render();
        this.reportZoom();
      }
    });
    window.addEventListener("keydown", (e) => {
      if (
        e.code === "Space" &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        this.space = true;
        this.canvas.style.cursor = "grab";
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.space = false;
        this.setCursor();
      }
    });
    this.resize();
  }
  private resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    this.width = r.width;
    this.height = r.height;
    this.dpr = Math.min(2, window.devicePixelRatio);
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.render();
  }
  setProject(p: Project, n: Network) {
    this.project = p;
    this.network = n;
    if (
      this.selection &&
      !(
        this.selection.kind === "node"
          ? p.nodes
          : this.selection.kind === "site"
            ? (p.sites ?? [])
            : p.roads
      ).some((item) => item.id === this.selection!.id)
    )
      this.selection = null;
    this.render();
  }
  setSelection(s: Selection) {
    this.selection = s;
    this.render();
  }
  setMode(mode: ToolMode) {
    this.mode = mode;
    if (mode !== "draw") this.draft = null;
    if (mode !== "measure") this.measure = [];
    this.setCursor();
    this.render();
  }
  private setCursor() {
    this.canvas.style.cursor =
      this.mode === "pan"
        ? "grab"
        : this.mode === "draw" ||
            this.mode === "measure" ||
            this.mode === "place"
          ? "crosshair"
          : "default";
  }
  setSnap(v: boolean) {
    this.snap = v;
  }
  setGrid(v: boolean) {
    this.grid = v;
    this.render();
  }
  setLabels(v: boolean) {
    this.labels = v;
    this.render();
  }
  setDrainage(v: boolean) {
    this.drainage = v;
    this.render();
  }
  setDetailLayer(layer: string, v: boolean) {
    if (v) this.hiddenLayers.delete(layer);
    else this.hiddenLayers.add(layer);
    this.render();
  }
  setDraft(p: V3 | null) {
    this.draft = p;
    this.render();
  }
  screenToWorld(x: number, y: number): V3 {
    return [
      (x - this.width / 2) / this.scale + this.center[0],
      0,
      (y - this.height / 2) / this.scale + this.center[2],
    ];
  }
  worldToScreen(p: V3): [number, number] {
    return [
      (p[0] - this.center[0]) * this.scale + this.width / 2,
      (p[2] - this.center[2]) * this.scale + this.height / 2,
    ];
  }
  fit() {
    if (!this.network) return;
    const { min, max } = this.network.bounds;
    this.center = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
    this.scale = Math.min(
      (this.width - 62) / (max[0] - min[0] + 12),
      (this.height - 104) / (max[2] - min[2] + 12),
    );
    this.scale = Math.max(0.02, this.scale);
    this.fitScale = this.scale;
    this.render();
    this.reportZoom();
  }
  zoom(factor: number, x = this.width / 2, y = this.height / 2) {
    const before = this.screenToWorld(x, y);
    this.scale = Math.min(30, Math.max(0.02, this.scale * factor));
    const after = this.screenToWorld(x, y);
    this.center = add(this.center, sub(before, after));
    this.render();
    this.reportZoom();
  }
  private reportZoom() {
    this.onZoom(Math.round((this.scale / this.fitScale) * 100));
  }
  private eventPoint(e: PointerEvent): V3 {
    const r = this.canvas.getBoundingClientRect();
    return this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }
  private snapPoint(p: V3, e?: PointerEvent) {
    if (!this.project || !this.snap || e?.altKey) {
      this.snapped = false;
      return p;
    }
    const snap = findSnap(this.project, p, Math.max(0.85, 11 / this.scale));
    this.snapped = !!snap;
    if (snap) return snap.position;
    return [Math.round(p[0] * 2) / 2, p[1], Math.round(p[2] * 2) / 2] as V3;
  }
  private origin(): V3 | null {
    if (!this.selection || !this.project) return null;
    if (this.selection.kind === "node")
      return getNode(this.project, this.selection.id)?.position ?? null;
    if (this.selection.kind === "site")
      return (
        this.project.sites?.find((s) => s.id === this.selection!.id)
          ?.position ?? null
      );
    const r = this.project.roads.find((r) => r.id === this.selection!.id);
    return r ? cubic(controlPoints(this.project, r), 0.5) : null;
  }
  private handleHit(p: V3): {
    target: EditDrag["target"];
    id: string;
    initial: V3;
    axis?: "x" | "z";
  } | null {
    if (!this.selection || !this.project) return null;
    const origin = this.origin();
    if (!origin) return null;
    const [x, z] = this.worldToScreen(p),
      [ox, oz] = this.worldToScreen(origin);
    if (Math.hypot(x - ox, z - oz) < 12)
      return {
        target: this.selection.kind,
        id: this.selection.id,
        initial: origin,
      };
    if (Math.abs(z - oz) < 9 && x > ox + 12 && x < ox + 59)
      return {
        target: this.selection.kind,
        id: this.selection.id,
        initial: origin,
        axis: "x",
      };
    if (Math.abs(x - ox) < 9 && z > oz + 12 && z < oz + 57)
      return {
        target: this.selection.kind,
        id: this.selection.id,
        initial: origin,
        axis: "z",
      };
    if (this.selection.kind === "road") {
      const r = this.project.roads.find((r) => r.id === this.selection!.id)!;
      for (const key of ["h1", "h2"] as const) {
        const node = getNode(this.project, key === "h1" ? r.start : r.end),
          v = add(node.position, r[key]),
          q = this.worldToScreen(v);
        if (Math.hypot(x - q[0], z - q[1]) < 9)
          return { target: key, id: r.id, initial: v };
      }
    }
    return null;
  }
  private pick(p: V3): Selection {
    if (!this.project || !this.network) return null;
    const [x, y] = this.worldToScreen(p);
    for (const site of this.project.sites ?? []) {
      const q = this.worldToScreen(site.position);
      if (Math.hypot(q[0] - x, q[1] - y) < 11)
        return { kind: "site", id: site.id };
    }
    let nearest: Selection = null,
      min = 12;
    for (const n of this.project.nodes) {
      const q = this.worldToScreen(n.position),
        d = Math.hypot(q[0] - x, q[1] - y);
      if (d < min) {
        min = d;
        nearest = { kind: "node", id: n.id };
      }
    }
    if (nearest) return nearest;
    let roadDist = Infinity;
    for (const span of [...this.network.spans].reverse()) {
      const near = closestOnAlignment(span.alignment, p),
        d = near.distance;
      if (
        d < roadHalfWidth(span.road) + span.road.sidewalk + 4 / this.scale &&
        (d < roadDist - 0.2 ||
          (Math.abs(d - roadDist) < 0.2 &&
            near.point[1] >
              (nearest?.kind === "road"
                ? (this.network.spans.find((s) => s.road.id === nearest!.id)
                    ?.alignment.points[0][1] ?? -Infinity)
                : -Infinity)))
      ) {
        roadDist = d;
        nearest = { kind: "road", id: span.road.id };
      }
    }
    if (!nearest)
      for (const site of [...(this.project.sites ?? [])].reverse())
        if (insidePolygon(p, siteOutline(site))) {
          nearest = { kind: "site", id: site.id };
          break;
        }
    return nearest;
  }
  private pointerDown = (e: PointerEvent) => {
    if (!this.project) return;
    const p = this.eventPoint(e);
    this.canvas.focus();
    if (e.button === 1 || e.button === 2 || this.mode === "pan" || this.space) {
      this.interaction = {
        kind: "pan",
        last: [e.clientX, e.clientY],
        start: p,
        moved: false,
      };
      this.canvas.style.cursor = "grabbing";
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === "draw" || this.mode === "place") {
      this.onDraw(this.snapPoint(p, e));
      return;
    }
    if (this.mode === "measure") {
      if (this.measure.length === 2) this.measure = [];
      this.measure.push(this.snapPoint(p, e));
      this.render();
      return;
    }
    const handle = this.handleHit(p),
      selection = handle ? this.selection : this.pick(p);
    if (selection) this.onSelect(selection);
    else {
      this.onSelect(null);
      return;
    }
    const target =
      handle ??
      (selection?.kind === "node"
        ? {
            target: "node" as const,
            id: selection.id,
            initial: getNode(this.project, selection.id).position,
          }
        : selection?.kind === "site"
          ? {
              target: "site" as const,
              id: selection.id,
              initial: this.project.sites!.find((s) => s.id === selection.id)!
                .position,
            }
          : this.mode === "move" && selection
            ? {
                target: "road" as const,
                id: selection.id,
                initial: cubic(
                  controlPoints(
                    this.project,
                    this.project.roads.find((r) => r.id === selection.id)!,
                  ),
                  0.5,
                ),
              }
            : null);
    if (target) {
      this.interaction = {
        kind: "edit",
        last: [e.clientX, e.clientY],
        start: p,
        target: target.target,
        id: target.id,
        initial: [...target.initial],
        axis: "axis" in target ? target.axis : undefined,
        moved: false,
      };
      this.canvas.setPointerCapture(e.pointerId);
      this.onDrag({
        target: target.target,
        id: target.id,
        value: target.target === "road" ? [0, 0, 0] : target.initial,
        phase: "start",
      });
    }
    this.render();
  };
  private pointerMove = (e: PointerEvent) => {
    let p = this.eventPoint(e);
    this.onPointer(p);
    if (this.interaction?.kind === "pan") {
      this.center[0] -= (e.clientX - this.interaction.last[0]) / this.scale;
      this.center[2] -= (e.clientY - this.interaction.last[1]) / this.scale;
      this.interaction.last = [e.clientX, e.clientY];
      this.interaction.moved = true;
      this.render();
      return;
    }
    if (this.interaction?.kind === "edit") {
      const drag = this.interaction,
        delta = sub(p, drag.start);
      if (drag.axis === "x") delta[2] = 0;
      if (drag.axis === "z") delta[0] = 0;
      if (e.shiftKey && !drag.axis) {
        if (Math.abs(delta[0]) > Math.abs(delta[2])) delta[2] = 0;
        else delta[0] = 0;
      }
      let value = drag.target === "road" ? delta : add(drag.initial!, delta);
      if (this.snap && !e.altKey)
        value = [
          Math.round(value[0] * 2) / 2,
          value[1],
          Math.round(value[2] * 2) / 2,
        ];
      drag.moved =
        drag.moved || Math.hypot(delta[0], delta[2]) * this.scale > 2;
      if (drag.moved)
        this.onDrag({
          target: drag.target!,
          id: drag.id!,
          value,
          phase: "move",
        });
      return;
    }
    if (this.mode === "draw") p = this.snapPoint(p, e);
    this.pointer = p;
    this.render();
  };
  private pointerUp = (e: PointerEvent) => {
    const drag = this.interaction;
    if (!drag) return;
    if (drag.kind === "edit")
      this.onDrag({
        target: drag.target!,
        id: drag.id!,
        value: drag.initial!,
        phase: "end",
      });
    this.interaction = null;
    this.setCursor();
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    this.render();
  };
  private path(points: V3[], closed = true) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p[0], p[2]) : c.moveTo(p[0], p[2])));
    if (closed) c.closePath();
  }
  private texture(material: string) {
    if (!this.patterns.has(material)) {
      const canvas = patternCanvas(material.slice(7) as "herringbone", true),
        p = this.ctx.createPattern(canvas, "repeat")!;
      p.setTransform(new DOMMatrix().scale(2 / 512));
      this.patterns.set(material, p);
    }
    return this.patterns.get(material)!;
  }
  private drawMesh(mesh: MeshData) {
    const c = this.ctx;
    if (
      this.hiddenLayers.has(mesh.kind) ||
      ![
        "asphalt",
        "paving",
        "curb",
        "marking",
        "drain",
        "gutter",
        "landscape",
        "building",
        "parking",
      ].includes(mesh.kind)
    )
      return;
    const colors: Record<string, string> = {
      asphalt: "#333d47",
      "pave-border": "#53616d",
      grass: "#4c6854",
      foliage: "#497659",
      flowers: "#ac9b72",
      facade: "#68757f",
      glass: "#647e91",
      roof: "#5e6b76",
      water: "#32596c",
      "accessible-blue": "#366b97",
      "wheel-stop": "#bec8ce",
      concrete: "#a3afb9",
      cobble: "#7b8580",
      curb: "#a9b6c2",
      paint: "#cbd2c5",
      yellow: "#b4b990",
      "drain-dark": "#182d2a",
      "steel-dark": "#617d72",
      steel: "#91a399",
      gutter: "#344541",
    };
    c.fillStyle = mesh.material.startsWith("paving-")
      ? this.texture(mesh.material)
      : (colors[mesh.material] ?? "#74817c");
    c.beginPath();
    const p = mesh.positions;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] * 3,
        b = mesh.indices[i + 1] * 3,
        d = mesh.indices[i + 2] * 3;
      if (
        Math.abs(
          (p[b] - p[a]) * (p[d + 2] - p[a + 2]) -
            (p[b + 2] - p[a + 2]) * (p[d] - p[a]),
        ) < 1e-7
      )
        continue;
      const signed =
        (p[b + 2] - p[a + 2]) * (p[d] - p[a]) -
        (p[b] - p[a]) * (p[d + 2] - p[a + 2]);
      if (
        ["landscape", "building", "parking"].includes(mesh.kind) &&
        signed < 1e-8
      )
        continue;
      c.moveTo(p[a], p[a + 2]);
      c.lineTo(p[b], p[b + 2]);
      c.lineTo(p[d], p[d + 2]);
      c.closePath();
    }
    c.fill();
  }
  render() {
    const c = this.ctx,
      d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = "#171d24";
    c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(this.width / 2, this.height / 2);
    c.scale(this.scale, this.scale);
    c.translate(-this.center[0], -this.center[2]);
    if (this.grid) {
      const wanted = 20 / this.scale,
        power = 10 ** Math.floor(Math.log10(wanted)),
        step = [1, 2, 5, 10]
          .map((n) => n * power)
          .reduce((a, b) =>
            Math.abs(a - wanted) < Math.abs(b - wanted) ? a : b,
          ),
        x0 = this.center[0] - this.width / 2 / this.scale,
        x1 = this.center[0] + this.width / 2 / this.scale,
        z0 = this.center[2] - this.height / 2 / this.scale,
        z1 = this.center[2] + this.height / 2 / this.scale;
      c.lineWidth = 0.7 / this.scale;
      c.strokeStyle = "#2d3845";
      c.beginPath();
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        c.moveTo(x, z0);
        c.lineTo(x, z1);
      }
      for (let z = Math.floor(z0 / step) * step; z < z1; z += step) {
        c.moveTo(x0, z);
        c.lineTo(x1, z);
      }
      c.stroke();
      c.lineWidth = 0.5 / this.scale;
      c.strokeStyle = "#384c5f";
      c.setLineDash([2 / this.scale, 4 / this.scale]);
      c.beginPath();
      c.moveTo(x0, 0);
      c.lineTo(x1, 0);
      c.moveTo(0, z0);
      c.lineTo(0, z1);
      c.stroke();
      c.setLineDash([]);
    }
    if (this.network && this.project) {
      const owners = [
        ...this.network.spans.map((s) => ({
          id: s.road.id,
          kind: "road",
          y: cubic(s.alignment.points, 0.5)[1],
        })),
        ...(this.project.sites ?? []).map((s) => ({
          id: s.id,
          kind: "site",
          y: s.position[1] - 0.02,
        })),
        ...this.network.junctions.map((j) => ({
          id: j.node.id,
          kind: "node",
          y: j.node.position[1] + 0.01,
        })),
      ].sort((a, b) => a.y - b.y);
      for (const owner of owners) {
        const meshes = this.network.meshes.filter(
          (m) => m.owner === owner.id && m.ownerKind === owner.kind,
        );
        for (const kind of [
          "landscape",
          "parking",
          "paving",
          "asphalt",
          "curb",
          "gutter",
          "marking",
          "drain",
          "building",
        ])
          for (const mesh of meshes.filter((m) => m.kind === kind))
            this.drawMesh(mesh);
      }
      if (this.drainage) {
        c.strokeStyle = "#72afbd";
        c.fillStyle = "#9ad8e0";
        c.lineWidth = 1.3 / this.scale;
        c.setLineDash([2 / this.scale, 4 / this.scale]);
        for (const s of this.network.spans.filter((s) => s.road.drainage))
          for (const side of [-1, 1]) {
            const points = s.frames.map((f) =>
              add(f.p, [
                f.n[0] * side * (f.hw - 0.3),
                0,
                f.n[2] * side * (f.hw - 0.3),
              ]),
            );
            this.path(points, false);
            c.stroke();
          }
        c.setLineDash([]);
      }
      if (this.selection) {
        c.strokeStyle = "#b3f0d0";
        c.lineWidth = 1.5 / this.scale;
        c.setLineDash([5 / this.scale, 3 / this.scale]);
        if (this.selection.kind === "node") {
          const joint = this.network.junctions.find(
            (j) => j.node.id === this.selection!.id,
          );
          if (joint) {
            this.path(joint.outer);
            c.fillStyle = "#a7e7c90a";
            c.fill();
            c.stroke();
          }
        } else if (this.selection.kind === "site") {
          const site = this.project.sites?.find(
            (s) => s.id === this.selection!.id,
          );
          if (site) {
            this.path(siteOutline(site));
            c.stroke();
          }
        } else {
          const span = this.network.spans.find(
            (s) => s.road.id === this.selection!.id,
          );
          if (span) {
            for (const side of [-1, 1]) {
              this.path(
                span.frames.map((f) =>
                  add(f.p, [
                    f.n[0] * side * (f.hw + f.sw + 0.22),
                    0,
                    f.n[2] * side * (f.hw + f.sw + 0.22),
                  ]),
                ),
                false,
              );
              c.stroke();
            }
          }
        }
        c.setLineDash([]);
      }
    }
    if (this.mode === "place" && this.pointer) {
      const ghost = makeSite(this.placementKind, this.pointer);
      this.path(siteOutline(ghost));
      c.fillStyle = "#a9cef51a";
      c.fill();
      c.strokeStyle = "#b8d7f1";
      c.lineWidth = 1.2 / this.scale;
      c.setLineDash([5 / this.scale, 4 / this.scale]);
      c.stroke();
      c.setLineDash([]);
    }
    if (this.draft && this.pointer) {
      this.path([this.draft, this.pointer], false);
      c.strokeStyle = "#b5e7d0";
      c.lineWidth = 2 / this.scale;
      c.setLineDash([6 / this.scale, 4 / this.scale]);
      c.stroke();
      c.setLineDash([]);
    }
    if (this.measure.length) {
      this.path(
        this.measure.length === 1 && this.pointer
          ? [this.measure[0], this.pointer]
          : this.measure,
        false,
      );
      c.strokeStyle = "#e5d397";
      c.lineWidth = 1.4 / this.scale;
      c.setLineDash([4 / this.scale, 3 / this.scale]);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();
    if (this.project && this.network) {
      if (this.labels) {
        c.font = '10px "DM Sans Variable", sans-serif';
        c.textAlign = "center";
        c.textBaseline = "middle";
        for (const span of this.network.spans) {
          if (span.road.bridge) continue;
          const p = cubic(span.alignment.points, 0.52),
            q = this.worldToScreen(p),
            label = span.road.name.split(" · ")[0];
          if (
            q[0] < 20 ||
            q[0] > this.width - 20 ||
            q[1] < 42 ||
            q[1] > this.height - 40
          )
            continue;
          const before = cubic(span.alignment.points, 0.48),
            after = cubic(span.alignment.points, 0.56);
          let angle = Math.atan2(after[2] - before[2], after[0] - before[0]);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          c.save();
          c.translate(q[0], q[1]);
          c.rotate(angle);
          c.fillStyle = "#202a29dc";
          const w = c.measureText(label).width;
          c.fillRect(-w / 2 - 4, -6, w + 8, 12);
          c.fillStyle = "#bdc8bf";
          c.fillText(label, 0, 0);
          c.restore();
        }
      }
      for (const node of this.project.nodes) {
        const [x, y] = this.worldToScreen(node.position),
          selected =
            this.selection?.kind === "node" && this.selection.id === node.id,
          joint = this.network.junctions.find((j) => j.node.id === node.id);
        if (x < -10 || x > this.width + 10 || y < -10 || y > this.height + 10)
          continue;
        c.beginPath();
        c.arc(x, y, selected ? 7 : joint ? 4.5 : 2.8, 0, Math.PI * 2);
        c.fillStyle = selected ? "#b9ead3" : "#617a70";
        c.fill();
        c.strokeStyle = selected ? "#e4fff2" : "#c2cfc2";
        c.lineWidth = selected ? 2 : 1;
        c.stroke();
        if (joint && this.labels) {
          c.font = '9px "IBM Plex Mono",monospace';
          c.textAlign = "left";
          c.fillStyle = selected ? "#b6e4ce" : "#899f95";
          c.fillText(
            `J${String(this.network.junctions.indexOf(joint) + 1).padStart(2, "0")}`,
            x + 12,
            y - 14,
          );
        }
      }
      if (this.selection?.kind === "road") {
        const road = this.project.roads.find(
          (r) => r.id === this.selection!.id,
        )!;
        for (const [handle, nodeID] of [
          [road.h1, road.start],
          [road.h2, road.end],
        ] as [V3, string][]) {
          const node = getNode(this.project, nodeID),
            a = this.worldToScreen(node.position),
            b = this.worldToScreen(add(node.position, handle));
          c.strokeStyle = "#b0dbc180";
          c.lineWidth = 1;
          c.setLineDash([3, 3]);
          c.beginPath();
          c.moveTo(...a);
          c.lineTo(...b);
          c.stroke();
          c.setLineDash([]);
          c.beginPath();
          c.arc(...b, 4.5, 0, Math.PI * 2);
          c.fillStyle = "#263e36";
          c.fill();
          c.strokeStyle = "#b9ead0";
          c.stroke();
        }
      }
      if (this.selection && this.mode !== "draw" && this.mode !== "measure") {
        const p = this.origin();
        if (p) {
          const [x, y] = this.worldToScreen(p);
          this.drawAxis(x, y, x + 49, y, "#d79789", "X");
          this.drawAxis(x, y, x, y + 47, "#94b9ca", "Z");
          c.beginPath();
          c.arc(x, y, 7, 0, Math.PI * 2);
          c.fillStyle = "#b9ead3";
          c.fill();
          c.strokeStyle = "#e7fff2";
          c.lineWidth = 2;
          c.stroke();
        }
      }
    }
    if (this.mode === "draw" && this.pointer) {
      const [x, y] = this.worldToScreen(this.pointer);
      c.beginPath();
      c.arc(x, y, this.snapped ? 8 : 5, 0, Math.PI * 2);
      c.strokeStyle = "#c2f2db";
      c.lineWidth = 1.5;
      c.stroke();
      if (this.snapped) {
        c.font = '9px "IBM Plex Mono",monospace';
        c.fillStyle = "#c2f2db";
        c.textAlign = "left";
        c.fillText("SNAP", x + 12, y - 10);
      }
      if (this.draft) {
        const length = Math.hypot(
          this.pointer[0] - this.draft[0],
          this.pointer[2] - this.draft[2],
        );
        c.font = '10px "IBM Plex Mono",monospace';
        c.fillStyle = "#dcf1e6";
        c.fillText(`${length.toFixed(1)} m`, x + 14, y + 16);
      }
    }
    if (this.measure.length === 2) {
      const q = this.worldToScreen(this.measure[1]),
        length = Math.hypot(
          this.measure[1][0] - this.measure[0][0],
          this.measure[1][2] - this.measure[0][2],
        );
      c.fillStyle = "#e6d396";
      c.font = '11px "IBM Plex Mono",monospace';
      c.textAlign = "left";
      c.fillText(`${length.toFixed(2)} m`, q[0] + 10, q[1] - 10);
    }
    // Dynamic scale bar is in world meters, not a decorative fixed label.
    const target = 58 / this.scale,
      power = 10 ** Math.floor(Math.log10(target)),
      bar = [1, 2, 5, 10]
        .map((n) => n * power)
        .reduce(
          (best, n) =>
            Math.abs(n - target) < Math.abs(best - target) ? n : best,
          power,
        );
    c.strokeStyle = "#879d94";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(20, this.height - 38);
    c.lineTo(20, this.height - 33);
    c.lineTo(20 + bar * this.scale, this.height - 33);
    c.lineTo(20 + bar * this.scale, this.height - 38);
    c.stroke();
    c.fillStyle = "#82968e";
    c.font = '9px "IBM Plex Mono",monospace';
    c.textAlign = "left";
    c.fillText(`${bar} m`, 20, this.height - 19);
  }
  private drawAxis(
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: string,
    label: string,
  ) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
    c.beginPath();
    if (label === "X") {
      c.moveTo(x2, y2);
      c.lineTo(x2 - 6, y2 - 3);
      c.lineTo(x2 - 6, y2 + 3);
    } else {
      c.moveTo(x2, y2);
      c.lineTo(x2 - 3, y2 - 6);
      c.lineTo(x2 + 3, y2 - 6);
    }
    c.fill();
    c.font = '9px "IBM Plex Mono",monospace';
    c.textAlign = "center";
    c.fillText(
      label,
      x2 + (label === "X" ? 10 : 0),
      y2 + (label === "Z" ? 13 : 3),
    );
  }
}
