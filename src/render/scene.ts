import { siteOutline, insidePolygon } from "../core/sites";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Materials } from "./materials";
import { closestOnAlignment } from "../core/curves";
import { type Network } from "../core/geometry";
import {
  type Selection,
  type Project,
  getNode,
  roadHalfWidth,
} from "../core/model";
import { type V3, add } from "../core/math";

export interface GizmoProjection {
  origin: [number, number];
  axes: { x: [number, number]; y: [number, number]; z: [number, number] };
  visible: boolean;
}
export class SceneView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);
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
  private sun = new THREE.DirectionalLight("#fff9ef", 2.7);
  private ambient = new THREE.HemisphereLight("#e7edf9", "#697875", 1.95);
  private width = 1;
  private height = 1;
  private gridVisible = true;
  private contextVisible = true;
  private contextBounds?: { cx: number; cz: number; size: number };
  private down: [number, number] = [0, 0];
  private onSelect: (s: Selection) => void;
  private onGizmo: (p: GizmoProjection | null) => void;
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D road network. Drag to orbit; right-drag to pan.",
    );
    this.renderer.domElement.setAttribute("tabindex", "0");
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#282f39");
    this.sun.position.set(-65, 120, 50);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
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
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 1800;
    this.controls.maxPolarAngle = Math.PI * 0.49;
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
  private resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
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
    this.project = project;
    this.network = network;
    this.disposeGeometry(this.networkGroup);
    for (const data of network.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(data.positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(data.uvs, 2),
      );
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.materials.get(data.material));
      mesh.name = data.name;
      mesh.userData = {
        kind: data.ownerKind,
        id: data.owner,
        meshKind: data.kind,
        materialKey: data.material,
      };
      mesh.castShadow = !["marking", "gutter", "drain"].includes(data.kind);
      mesh.receiveShadow = true;
      this.networkGroup.add(mesh);
    }
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
      new THREE.BoxGeometry(size, 1.7, size),
      new THREE.MeshStandardMaterial({ color: "#7d8b7c", roughness: 1 }),
    );
    ground.position.set(cx, -0.91, cz);
    ground.receiveShadow = true;
    ground.name = "Context terrain";
    this.contextGroup.add(ground);
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.3, 0.5, size + 0.3),
      new THREE.MeshStandardMaterial({ color: "#46534b", roughness: 1 }),
    );
    side.position.set(cx, -1.78, cz);
    this.contextGroup.add(side);
    this.grid = new THREE.GridHelper(
      size,
      Math.round(size / 10),
      "#627664",
      "#6a7e6a",
    );
    this.grid.position.set(cx, -0.043, cz);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.21;
    (this.grid.material as THREE.Material).depthWrite = false;
    this.grid.visible = this.gridVisible;
    this.contextGroup.add(this.grid);
    const treePositions: V3[] = [];
    const rand = (x: number, z: number) => {
      const t = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return t - Math.floor(t);
    };
    const extent = Math.min(size * 0.38, 140);
    for (let x = -extent; x < extent; x += 17)
      for (let z = -extent; z < extent; z += 18) {
        if (rand(x, z) > 0.57) continue;
        const p: V3 = [
          cx + x + (rand(x + 2, z) - 0.5) * 9,
          0,
          cz + z + (rand(x, z + 2) - 0.5) * 9,
        ];
        if (
          network.spans.some(
            (s) =>
              closestOnAlignment(s.alignment, p).distance <
              roadHalfWidth(s.road) + s.road.sidewalk + 5.5,
          )
        )
          continue;
        if (
          this.project?.sites?.some((s) => insidePolygon(p, siteOutline(s, -2)))
        )
          continue;
        treePositions.push(p);
      }
    const canopy = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: "#607c62", roughness: 1 }),
      treePositions.length,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.17, 0.24, 1.7, 5),
      new THREE.MeshStandardMaterial({ color: "#6e7561", roughness: 1 }),
      treePositions.length,
    );
    const matrix = new THREE.Matrix4(),
      quaternion = new THREE.Quaternion();
    treePositions.forEach((p, i) => {
      const scale = 1.6 + rand(p[0], p[2]) * 1.2;
      matrix.compose(
        new THREE.Vector3(p[0], scale * 1.1 + 1.25, p[2]),
        quaternion,
        new THREE.Vector3(scale, scale * 1.2, scale),
      );
      canopy.setMatrixAt(i, matrix);
      matrix.compose(
        new THREE.Vector3(p[0], 0.83, p[2]),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      trunks.setMatrixAt(i, matrix);
    });
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    trunks.castShadow = true;
    this.contextGroup.add(canopy, trunks);
    this.contextGroup.visible = this.contextVisible;
  }
  setSelection(selection: Selection) {
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
            color: "#b8f5d7",
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
                f.n[0] * side * (f.hw + f.sw + 0.22),
                0.29,
                f.n[2] * side * (f.hw + f.sw + 0.22),
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
  zoom(factor: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.4, 4);
    this.camera.updateProjectionMatrix();
    this.onGizmo(this.gizmoProjection());
  }
  setGrid(v: boolean) {
    this.gridVisible = v;
    if (this.grid) this.grid.visible = v;
  }
  setContext(v: boolean) {
    this.contextVisible = v;
    this.contextGroup.visible = v;
  }
  setNight(v: boolean) {
    this.sun.intensity = v ? 0.38 : 2.7;
    this.ambient.intensity = v ? 0.55 : 1.95;
    this.scene.background = new THREE.Color(v ? "#111a27" : "#282f39");
  }
  setStyle(style: string) {
    this.materials.clay(style === "clay");
    this.materials.wireframe(style === "wireframe");
  }
  setDetailLayer(layer: string, visible: boolean) {
    for (const child of this.networkGroup.children)
      if (child.userData.meshKind === layer) child.visible = visible;
  }
  setEnabled(v: boolean) {
    this.controls.enabled = v;
  }
  async exportGLB(): Promise<ArrayBuffer> {
    const group = this.networkGroup.clone(true),
      materials = new Map<string, THREE.MeshStandardMaterial>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const key = object.userData.materialKey as string;
        if (!materials.has(key))
          materials.set(key, this.materials.exportCopy(key));
        object.material = materials.get(key)!;
      }
    });
    try {
      return (await new GLTFExporter().parseAsync(group, {
        binary: true,
        onlyVisible: false,
      })) as ArrayBuffer;
    } finally {
      for (const material of materials.values()) material.dispose();
    }
  }
  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.onGizmo(this.gizmoProjection());
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsTime > 1000) {
      this.fps = Math.min(
        60,
        Math.round((this.fpsFrames * 1000) / (now - this.fpsTime)),
      );
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
  };
}
