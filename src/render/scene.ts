import type { UtilityKind } from "../core/utilities";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { siteOutline, sitePoint } from "../core/sites";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Materials } from "./materials";

import {
  type Network,
  surfacePoint,
  frameAt,
  edgePoint,
  sideHalfWidth,
} from "../core/geometry";
import {
  type Selection,
  type Project,
  getNode,
  roadHalfWidth,
} from "../core/model";
import {
  type V3,
  add,
  sub,
  mul,
  normalizeXZ,
  normalXZ,
  distanceXZ,
} from "../core/math";

export interface GizmoProjection {
  origin: [number, number];
  axes: { x: [number, number]; y: [number, number]; z: [number, number] };
  visible: boolean;
}
export class SceneView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40000);
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  networkGroup = new THREE.Group();
  contextGroup = new THREE.Group();
  selectionGroup = new THREE.Group();
  materials = new Materials();
  grid?: THREE.GridHelper;
  network?: Network;
  selection: Selection = null;
  private project?: Project;
  private raycaster = new THREE.Raycaster();
  private sun = new THREE.DirectionalLight("#ffffff", 2.2);
  private ambient = new THREE.HemisphereLight("#e7e7e7", "#404040", 0.9);
  private width = 1;
  private height = 1;
  private gridVisible = false;
  private contextVisible = true;
  private contextBounds?: { cx: number; cz: number; size: number };
  private down: [number, number] = [0, 0];
  private onSelect: (s: Selection) => void;
  private onGizmo: (p: GizmoProjection | null) => void;
  private renderDirty = true;
  private viewportVisible = true;
  private renderedFrames = 0;
  private scheduledFrames = 0;
  private idleFrames = 0;
  private lastRenderTime = 0;
  private fpsFrames = 0;
  private fpsTime = performance.now();
  public fps = 60;
  constructor(
    private container: HTMLElement,
    onSelect: (s: Selection) => void,
    onGizmo: (p: GizmoProjection | null) => void,
  ) {
    this.onSelect = onSelect;
    this.onGizmo = onGizmo;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      // Thin ground/grid separation must remain stable on kilometre-scale tiles.
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Roads are static between edits: keep detailed shadows without re-drawing
    // every bridge, post and curb into the light map on every orbit frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    room.dispose();
    pmrem.dispose();
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D road network. Drag to orbit; right-drag to pan.",
    );
    this.renderer.domElement.setAttribute("tabindex", "0");
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#101010");
    this.sun.position.set(-65, 120, 50);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.00012;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(
      this.sun,
      this.ambient,
      this.networkGroup,
      this.contextGroup,
      this.selectionGroup,
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", this.requestRender);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 30000;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.minPolarAngle = 0.08;
    this.controls.screenSpacePanning = true;
    this.camera.position.set(125, 125, 155);
    this.controls.target.set(0, 0, -8);
    new ResizeObserver(() => this.resize()).observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      this.down = [e.clientX, e.clientY];
    });
    canvas.addEventListener("pointerup", (e) => {
      if (
        e.button !== 0 ||
        Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4
      )
        return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.onSelect(hit);
    });
    canvas.addEventListener("dblclick", (e) => {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) {
        this.onSelect(hit);
        this.focusSelection();
      }
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      container.dispatchEvent(
        new CustomEvent("render-error", {
          detail:
            "3D graphics context was lost. Reload to restore it; your saved project is safe.",
        }),
      );
    });
    this.resize();
    this.animate();
  }
  private requestRender = () => {
    this.renderDirty = true;
  };
  getRenderStats() {
    return {
      camera: {
        position: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
      },
      renderedFrames: this.renderedFrames,
      scheduledFrames: this.scheduledFrames,
      idleFrames: this.idleFrames,
      pending: this.renderDirty,
      visible: this.viewportVisible,
      active: performance.now() - this.lastRenderTime < 1000,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
  private resize() {
    this.requestRender();
    const r = this.container.getBoundingClientRect();
    this.viewportVisible = r.width >= 1 && r.height >= 1;
    if (!this.viewportVisible) return;
    this.width = r.width;
    this.height = r.height;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }
  private disposeGeometry(group: THREE.Group, disposeMaterials = false) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        if (disposeMaterials) {
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          for (const material of materials) material.dispose();
        }
      }
    });
    group.clear();
  }
  setNetwork(project: Project, network: Network, rebuildContext = false) {
    this.requestRender();
    this.project = project;
    this.network = network;
    this.renderer.shadowMap.needsUpdate = true;
    this.disposeGeometry(this.networkGroup);
    for (const data of network.meshes)
      this.networkGroup.add(
        this.meshFromData(data, this.materials.get(data.material)),
      );
    this.materials.capture();
    const bounds = this.contextBounds;
    if (
      rebuildContext ||
      !bounds ||
      network.bounds.min[0] < bounds.cx - bounds.size / 2 + 10 ||
      network.bounds.max[0] > bounds.cx + bounds.size / 2 - 10 ||
      network.bounds.min[2] < bounds.cz - bounds.size / 2 + 10 ||
      network.bounds.max[2] > bounds.cz + bounds.size / 2 - 10
    )
      this.buildContext(network);
    this.setSelection(this.selection);
  }
  private meshFromData(
    data: Network["meshes"][number],
    material: THREE.Material,
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = data.name;
    mesh.userData = {
      kind: data.ownerKind,
      id: data.owner,
      meshKind: data.kind,
      materialKey: data.material,
    };
    // Zero-thickness top sheets receive shadows. Their closed bases and
    // volumetric infrastructure cast them, avoiding large-sheet shadow acne.
    mesh.castShadow =
      ["curb", "rail", "structure", "sign", "lamp"].includes(data.kind) ||
      (data.kind === "cycle" && data.material === "curb");
    mesh.receiveShadow = true;
    return mesh;
  }
  private buildContext(network: Network) {
    this.disposeGeometry(this.contextGroup, true);
    const b = network.bounds,
      cx = (b.min[0] + b.max[0]) / 2,
      cz = (b.min[2] + b.max[2]) / 2;
    const size = Math.max(
      265,
      b.max[0] - b.min[0] + 60,
      b.max[2] - b.min[2] + 60,
    );
    this.contextBounds = { cx, cz, size };
    this.camera.far = Math.max(4000, size * 8);
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(1800, size * 4);
    this.sun.position.set(cx - size * 0.24, size * 0.45, cz + size * 0.18);
    this.sun.target.position.set(cx, 0, cz);
    this.scene.add(this.sun.target);
    this.sun.shadow.camera.left = -size * 0.6;
    this.sun.shadow.camera.right = size * 0.6;
    this.sun.shadow.camera.top = size * 0.6;
    this.sun.shadow.camera.bottom = -size * 0.6;
    this.sun.shadow.camera.far = Math.max(500, size * 3);
    this.sun.shadow.camera.updateProjectionMatrix();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 2, size * 2),
      new THREE.MeshStandardMaterial({ color: "#202020", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.065, cz);
    ground.receiveShadow = true;
    ground.name = "Context terrain";
    this.contextGroup.add(ground);
    this.grid = new THREE.GridHelper(
      size,
      Math.round(size / 10),
      "#3d3d3d",
      "#303030",
    );
    this.grid.position.set(cx, -0.043, cz);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.21;
    (this.grid.material as THREE.Material).depthWrite = false;
    this.grid.visible = this.gridVisible;
    this.contextGroup.add(this.grid);
    this.contextGroup.visible = this.contextVisible;
  }
  setSelection(selection: Selection) {
    this.requestRender();
    this.selection = selection;
    this.disposeGeometry(this.selectionGroup, true);
    if (!selection || !this.network) {
      this.onGizmo(null);
      return;
    }
    const outline = (points: V3[], closed = false) => {
      const p = points.map((p) => new THREE.Vector3(p[0], p[1] + 0.047, p[2]));
      if (closed) p.push(p[0].clone());
      const geometry = new THREE.BufferGeometry().setFromPoints(p),
        line = new THREE.Line(
          geometry,
          new THREE.LineDashedMaterial({
            color: "#b9b9b9",
            dashSize: 1,
            gapSize: 0.45,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
          }),
        );
      line.computeLineDistances();
      line.renderOrder = 9;
      this.selectionGroup.add(line);
    };
    if (selection.kind === "node") {
      const joint = this.network.junctions.find(
        (j) => j.node.id === selection.id,
      );
      if (joint) outline(joint.outer, true);
    } else if (selection.kind === "site") {
      const site = this.project?.sites?.find((s) => s.id === selection.id);
      if (site) outline(siteOutline(site), true);
    } else {
      const span = this.network.spans.find((s) => s.road.id === selection.id);
      if (span)
        for (const side of [-1, 1])
          outline(
            span.frames.map((f) =>
              add(f.p, [
                f.n[0] * side * (sideHalfWidth(f, side) + f.sw + 0.22),
                0.29,
                f.n[2] * side * (sideHalfWidth(f, side) + f.sw + 0.22),
              ]),
            ),
          );
    }
    this.onGizmo(this.gizmoProjection());
  }
  selectionPosition(): V3 | null {
    if (!this.selection || !this.project || !this.network) return null;
    if (this.selection.kind === "node")
      return getNode(this.project, this.selection.id)?.position ?? null;
    if (this.selection.kind === "site")
      return (
        this.project.sites?.find((s) => s.id === this.selection!.id)
          ?.position ?? null
      );
    const span = this.network.spans.find(
      (s) => s.road.id === this.selection!.id,
    );
    return span
      ? span.alignment.stations[Math.floor(span.alignment.stations.length / 2)]
          .p
      : null;
  }
  private projectPoint(point: V3): [number, number, number] {
    const v = new THREE.Vector3(...point).project(this.camera);
    return [
      (v.x * 0.5 + 0.5) * this.width,
      (-v.y * 0.5 + 0.5) * this.height,
      v.z,
    ];
  }
  private gizmoProjection(): GizmoProjection | null {
    // Selection and framing must not wait for the next (possibly throttled) RAF.
    this.camera.updateMatrixWorld();
    const p = this.selectionPosition();
    if (!p) return null;
    const origin = this.projectPoint(add(p, [0, 0.4, 0])),
      axes = {} as GizmoProjection["axes"];
    for (const [key, delta] of Object.entries({
      x: [8, 0, 0],
      y: [0, 8, 0],
      z: [0, 0, 8],
    }) as [keyof GizmoProjection["axes"], V3][]) {
      const q = this.projectPoint(add(add(p, [0, 0.4, 0]), delta)),
        dx = q[0] - origin[0],
        dy = q[1] - origin[1],
        l = Math.hypot(dx, dy);
      axes[key] = [
        origin[0] + (dx / Math.max(0.001, l)) * 57,
        origin[1] + (dy / Math.max(0.001, l)) * 57,
      ];
    }
    return {
      origin: [origin[0], origin[1]],
      axes,
      visible:
        origin[2] < 1 &&
        origin[0] > -70 &&
        origin[0] < this.width + 70 &&
        origin[1] > -70 &&
        origin[1] < this.height + 70,
    };
  }
  worldOnPlane(clientX: number, clientY: number, height: number): V3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        (-(clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const target = new THREE.Vector3(),
      hit = this.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
        target,
      );
    return hit ? [target.x, target.y, target.z] : null;
  }
  verticalMetersPerPixel() {
    const p = this.selectionPosition() ?? [0, 0, 0],
      a = this.projectPoint(p),
      b = this.projectPoint(add(p, [0, 1, 0]));
    return 1 / Math.max(0.1, Math.abs(b[1] - a[1]));
  }
  private pick(x: number, y: number): Selection {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((x - r.left) / r.width) * 2 - 1,
        (-(y - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = this.raycaster.intersectObjects(
      this.networkGroup.children,
      false,
    );
    if (!hits.length) return null;
    const d = hits[0].object.userData;
    return { kind: d.kind, id: d.id };
  }
  fit(zoomIn = 1) {
    if (!this.network) return;
    const { min, max } = this.network.bounds,
      target = new THREE.Vector3(
        (min[0] + max[0]) / 2,
        0,
        (min[2] + max[2]) / 2,
      );
    const direction = new THREE.Vector3(1, 0.98, 1.25).normalize();
    this.camera.position.copy(
      target.clone().add(direction.clone().multiplyScalar(300)),
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(
        this.camera.matrixWorld,
        0,
      ),
      up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let w = 0,
      h = 0,
      depth = 0;
    for (const x of [min[0], max[0]])
      for (const z of [min[2], max[2]])
        for (const y of [min[1], max[1]]) {
          const v = new THREE.Vector3(x, y, z).sub(target);
          w = Math.max(w, Math.abs(v.dot(right)));
          h = Math.max(h, Math.abs(v.dot(up)));
          depth = Math.max(depth, Math.abs(v.dot(direction)));
        }
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)),
      dist =
        ((Math.max(h / tan, w / (tan * this.camera.aspect)) + depth) * 1.07) /
        zoomIn;
    this.camera.zoom = 1;
    this.camera.position.copy(
      target.clone().add(direction.multiplyScalar(Math.max(35, dist))),
    );
    this.controls.target.copy(target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
  }
  focusSelection(distance = 105) {
    const p = this.selectionPosition();
    if (!p) return;
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.set(...p);
    this.camera.position.copy(
      this.controls.target.clone().add(direction.multiplyScalar(distance)),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
  }
  /** Close-up material framing; changes only the camera, never the project. */
  inspectSelection(): boolean {
    if (!this.selection || !this.project || !this.network) return false;
    let target: V3 | undefined,
      direction: V3 = [1, 0, 0];
    if (this.selection.kind === "site") {
      const site = this.project.sites?.find((s) => s.id === this.selection!.id);
      if (site) {
        target = sitePoint(
          site,
          -site.width * 0.15,
          -site.depth / 2 + 0.1,
          0.2,
        );
        const a = (site.yaw * Math.PI) / 180;
        direction = [Math.sin(a), 0, -Math.cos(a)];
      }
    } else if (this.selection.kind === "node") {
      const joint = this.network.junctions.find(
          (j) => j.node.id === this.selection!.id,
        ),
        arm = joint?.arms[0];
      if (joint?.corners[0]?.length) {
        const c = joint.corners[0];
        target = add(c[Math.floor(c.length / 2)], [0, 0.12, 0]);
        direction = arm?.n ?? [1, 0, 0];
      } else if (arm) {
        target = edgePoint(arm.frame, 1, "curbOut");
        direction = arm.n;
      }
    } else {
      const span = this.network.spans.find(
        (s) => s.road.id === this.selection!.id,
      );
      if (span) {
        const f = span.frames[Math.floor(span.frames.length / 2)];
        target = surfacePoint(f, sideHalfWidth(f, 1) + f.cw, 0.12);
        direction = f.n;
      }
    }
    if (!target) return false;
    const sight = new THREE.Vector3(
      direction[0],
      0.7,
      direction[2],
    ).normalize();
    this.controls.target.set(...target);
    this.camera.position.copy(
      this.controls.target.clone().add(sight.multiplyScalar(12)),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
    return true;
  }
  inspectFootway(kind: "corner-ramp" | "driveway", id?: string): boolean {
    if (!this.network || !this.project || !this.selection) return false;
    const owners =
        this.selection.kind === "node"
          ? this.project.roads
              .filter(
                (r) =>
                  r.start === this.selection!.id ||
                  r.end === this.selection!.id,
              )
              .map((r) => r.id)
          : [this.selection.id],
      pivot = this.selectionPosition() ?? [0, 0, 0];
    const feature = this.network.footways
      .filter(
        (f) =>
          owners.includes(f.owner) &&
          f.kind === kind &&
          (!id || f.id.endsWith(`:${id}`)),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.position[0] - pivot[0], a.position[2] - pivot[2]) -
          Math.hypot(b.position[0] - pivot[0], b.position[2] - pivot[2]),
      )[0];
    if (!feature) return false;
    const span = this.network.spans.find((s) => s.road.id === feature.owner)!,
      frame = span.frames.reduce((a, b) =>
        Math.abs(a.s - feature.station) < Math.abs(b.s - feature.station)
          ? a
          : b,
      ),
      d = frame.n;
    this.controls.target.set(...feature.position);
    if (kind === "driveway") {
      const across = (frame.sw + (feature.apron ?? 0)) / 2 - feature.run / 2;
      this.controls.target.add(
        new THREE.Vector3(
          d[0] * feature.side * across,
          0,
          d[2] * feature.side * across,
        ),
      );
    }
    this.camera.position.copy(
      this.controls.target
        .clone()
        .add(
          new THREE.Vector3(
            -d[0] * feature.side + frame.d[0] * 0.45,
            0.95,
            -d[2] * feature.side + frame.d[2] * 0.45,
          )
            .normalize()
            .multiplyScalar(
              kind === "driveway"
                ? Math.max(
                    12,
                    Math.hypot(feature.width, frame.sw + (feature.apron ?? 0)) *
                      1.7,
                  )
                : 7,
            ),
        ),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
    return true;
  }
  inspectPlanning(kind: "planting" | "mobility"): boolean {
    if (!this.network || !this.selection || !this.project) return false;
    const owners =
        this.selection.kind === "node"
          ? [
              this.selection.id,
              ...this.project.roads
                .filter(
                  (r) =>
                    r.start === this.selection!.id ||
                    r.end === this.selection!.id,
                )
                .map((r) => r.id),
            ]
          : [this.selection.id],
      pivot = this.selectionPosition() ?? [0, 0, 0],
      features =
        kind === "planting" ? this.network.plantings : this.network.mobility,
      feature = features
        .filter((f) => owners.includes(f.owner))
        .sort(
          (a, z) =>
            Math.hypot(a.position[0] - pivot[0], a.position[2] - pivot[2]) -
            Math.hypot(z.position[0] - pivot[0], z.position[2] - pivot[2]),
        )[0];
    if (!feature) return false;
    this.controls.target.set(...feature.position);
    this.camera.position.copy(
      this.controls.target.clone().add(new THREE.Vector3(7, 7, 8)),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
    return true;
  }
  inspectRoadDetail(kind: "bridge" | "splitter" | "street" | "parking") {
    if (!this.network || !this.project || !this.selection) return false;
    const owners = [
        this.selection.id,
        ...(this.selection.kind === "node"
          ? this.project.roads
              .filter(
                (r) =>
                  r.start === this.selection!.id ||
                  r.end === this.selection!.id,
              )
              .map((r) => r.id)
          : []),
      ],
      pivot = this.selectionPosition() ?? [0, 0, 0];
    let target: V3 | undefined,
      cameraOffset: V3 | undefined,
      range = 24;
    if (kind === "bridge") {
      const bridge =
        this.network.bridges.find((b) => b.owner === this.selection!.id) ??
        this.network.bridges.find((b) => owners.includes(b.owner));
      if (bridge) {
        const span =
            this.network.spans.find((s) => s.road.id === bridge.owner) ??
            this.network.spans.find((s) =>
              bridge.connections.includes(s.road.id),
            ),
          frame = span
            ? frameAt(span, (span.frames[0].s + span.frames.at(-1)!.s) / 2)
            : undefined,
          d = frame?.d ?? normalizeXZ(sub(bridge.end, bridge.start)),
          normal = normalXZ(d),
          mid = bridge.start.map((v, i) => (v + bridge.end[i]) / 2) as V3,
          across = Math.max(20, Math.min(30, (bridge.width ?? 10) * 2.2));
        target = add(mid, [0, -bridge.depth + 0.05, 0]);
        // Look up at the deck from the crossroad corridor. An along-deck
        // camera lands inside the approach fill/abutment on a short span.
        cameraOffset = add(mul(normal, across), add(mul(d, 7), [0, -2.8, 0]));
      }
    } else if (kind === "splitter") {
      const joints = [
          ...owners,
          ...this.project.roads
            .filter((r) => owners.includes(r.id))
            .flatMap((r) => [r.start, r.end]),
        ],
        split = this.network.splitters
          .filter((s) => joints.includes(s.owner))
          .sort(
            (a, b) =>
              Math.hypot(
                a.pavingNose[0] - pivot[0],
                a.pavingNose[2] - pivot[2],
              ) -
              Math.hypot(
                b.pavingNose[0] - pivot[0],
                b.pavingNose[2] - pivot[2],
              ),
          )[0];
      if (split) target = split.pavingNose;
    } else if (kind === "parking") {
      const bay = this.network.roadsideParking
        .filter((b) => owners.includes(b.owner))
        .sort(
          (a, b) =>
            distanceXZ(a.position, pivot) - distanceXZ(b.position, pivot),
        )[0];
      if (bay) target = bay.position;
      range = 16;
    } else {
      const feature = this.network.streetDetails
        .filter((f) => owners.includes(f.owner))
        .sort(
          (a, b) =>
            Math.hypot(a.position[0] - pivot[0], a.position[2] - pivot[2]) -
            Math.hypot(b.position[0] - pivot[0], b.position[2] - pivot[2]),
        )[0];
      if (feature) target = feature.position;
    }
    if (!target) return false;
    this.controls.target.set(...target);
    this.camera.position.copy(
      this.controls.target
        .clone()
        .add(
          cameraOffset
            ? new THREE.Vector3(...cameraOffset)
            : new THREE.Vector3(range * 0.55, range * 0.5, range * 0.65),
        ),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
    return true;
  }
  inspectInfrastructure(kind: UtilityKind | "drainage"): boolean {
    if (!this.selection || !this.network || !this.project) return false;
    const owners =
      this.selection.kind === "node"
        ? [
            this.selection.id,
            ...this.project.roads
              .filter(
                (r) =>
                  r.start === this.selection!.id ||
                  r.end === this.selection!.id,
              )
              .map((r) => r.id),
          ]
        : [this.selection.id];
    const pivot = this.selectionPosition() ?? [0, 0, 0];
    const range = (p: V3) =>
      Math.hypot(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
    const feature = this.network.services
      .filter(
        (s) =>
          owners.includes(s.owner) &&
          (kind === "drainage" ? s.kind !== "manhole" : s.kind === kind),
      )
      .sort((a, b) => range(a.position) - range(b.position))[0];
    if (!feature) return false;
    this.controls.target.set(...feature.position);
    this.camera.position.copy(
      this.controls.target
        .clone()
        .add(
          new THREE.Vector3(
            feature.direction
              ? feature.direction[0] - feature.direction[2] * 0.35
              : 1,
            feature.direction?.length ? 0.4 : 1.25,
            feature.direction
              ? feature.direction[2] + feature.direction[0] * 0.35
              : 1,
          )
            .normalize()
            .multiplyScalar(3.6),
        ),
    );
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.onGizmo(this.gizmoProjection());
    return true;
  }
  zoom(factor: number) {
    this.requestRender();
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.4, 4);
    this.camera.updateProjectionMatrix();
    this.onGizmo(this.gizmoProjection());
  }
  setGrid(v: boolean) {
    this.requestRender();
    this.gridVisible = v;
    if (this.grid) this.grid.visible = v;
  }
  setContext(v: boolean) {
    this.requestRender();
    this.renderer.shadowMap.needsUpdate = true;
    this.contextVisible = v;
    this.contextGroup.visible = v;
  }
  setNight(v: boolean) {
    this.requestRender();
    this.sun.intensity = v ? 0.38 : 2.2;
    this.ambient.intensity = v ? 0.55 : 0.9;
    this.scene.background = new THREE.Color(v ? "#0e0e0e" : "#101010");
  }
  setStyle(style: string) {
    this.requestRender();
    this.renderer.shadowMap.needsUpdate = true;
    this.materials.clay(style === "clay");
    this.materials.wireframe(style === "wireframe");
  }
  setDetailLayer(layer: string, visible: boolean) {
    this.requestRender();
    this.renderer.shadowMap.needsUpdate = true;
    for (const child of this.networkGroup.children)
      if (child.userData.meshKind === layer) child.visible = visible;
  }
  setEnabled(v: boolean) {
    this.controls.enabled = v;
  }
  async exportGLB(network?: Network): Promise<ArrayBuffer> {
    const independent = !!network && network !== this.network,
      group = independent ? new THREE.Group() : this.networkGroup.clone(true),
      materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (key: string) => {
      if (!materials.has(key))
        materials.set(key, this.materials.exportCopy(key));
      return materials.get(key)!;
    };
    if (independent)
      for (const data of network!.meshes)
        group.add(this.meshFromData(data, material(data.material)));
    else
      group.traverse((object) => {
        if (object instanceof THREE.Mesh)
          object.material = material(object.userData.materialKey as string);
      });
    group.userData = {
      units: "metres",
      upAxis: "Y",
      geometryDetail: network?.detail ?? this.network?.detail ?? "editing",
      includesPreviewEnvironment: false,
      services: network?.services ?? this.network?.services ?? [],
      footways: network?.footways ?? this.network?.footways ?? [],
      plantings: network?.plantings ?? this.network?.plantings ?? [],
      blocks: network?.blocks ?? this.network?.blocks ?? [],
      mobility: network?.mobility ?? this.network?.mobility ?? [],
      bridges: network?.bridges ?? this.network?.bridges ?? [],
      barriers: network?.barriers ?? this.network?.barriers ?? [],
      splitters: network?.splitters ?? this.network?.splitters ?? [],
      streetDetails:
        network?.streetDetails ?? this.network?.streetDetails ?? [],
      roadsideParking:
        network?.roadsideParking ?? this.network?.roadsideParking ?? [],
      designReview: network?.designReview ?? this.network?.designReview,
      auxiliaryLanes:
        network?.auxiliaryLanes ?? this.network?.auxiliaryLanes ?? [],
      embankments: network?.embankments ?? this.network?.embankments ?? [],
    };
    try {
      return (await new GLTFExporter().parseAsync(group, {
        binary: true,
        onlyVisible: false,
      })) as ArrayBuffer;
    } finally {
      for (const m of materials.values()) m.dispose();
      if (independent)
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
    }
  }
  private animate = () => {
    requestAnimationFrame(this.animate);
    this.scheduledFrames++;
    // OrbitControls emits change during damping. Camera, geometry, material,
    // layer and resize setters also invalidate, but an idle network does not
    // repeatedly draw millions of unchanged triangles or rewrite the gizmo DOM.
    this.controls.update();
    if (this.renderDirty && this.viewportVisible) {
      this.renderDirty = false;
      this.renderer.render(this.scene, this.camera);
      this.onGizmo(this.gizmoProjection());
      this.lastRenderTime = performance.now();
      this.renderedFrames++;
      this.fpsFrames++;
    } else this.idleFrames++;
    const now = performance.now();
    if (now - this.fpsTime > 1000) {
      if (this.fpsFrames)
        this.fps = Math.min(
          60,
          Math.max(
            1,
            Math.round((this.fpsFrames * 1000) / (now - this.fpsTime)),
          ),
        );
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
  };
}
