// ---------------------------------------------------------------------------
// gizmo-smoke.mjs — exercises the REAL src/gizmo.js headlessly (three.js
// raycasting needs no GL): picking each grip, axis/plane/view drags, Ctrl
// snapping, hover highlight, pixel-size scaling. Run: node tests/gizmo-smoke.mjs
// ---------------------------------------------------------------------------
import { makeTester } from './stubdom.mjs';

const THREE = await import('../vendor/three.module.min.js');
const { createGizmo } = await import('../src/gizmo.js');

const { t, eq, group, summary } = makeTester('gizmo-smoke');

const VH = 600; // viewport height in px

function makeRig(camPos = [0, 10, 20]) {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 500);
  camera.position.set(...camPos);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const deltas = [];
  let interacted = 0;
  const gizmo = createGizmo({
    onDeltaTotal: (x, y, z) => deltas.push([x, y, z]),
    onInteract: () => { interacted++; },
  });
  gizmo.setPosition([0, 0, 0]);
  gizmo.updateScale(camera, VH);
  gizmo.group.updateMatrixWorld(true); // the render loop does this every frame
  return { camera, gizmo, deltas, interacted: () => interacted };
}

/** ray from the camera through a world point */
function rayAt(camera, worldPoint) {
  const p = new THREE.Vector3(...worldPoint).project(camera);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), camera);
  return raycaster.ray;
}

const scale = () => gizmoScale;
let gizmoScale = 1;

group('construction');
{
  const { camera, gizmo } = makeRig();
  gizmoScale = gizmo.group.scale.x;
  t('gizmo group is scaled to a constant pixel size', gizmoScale > 0.5 && gizmoScale < 20, gizmoScale);
  const wpp = (2 * camera.position.distanceTo(new THREE.Vector3(0, 0, 0))
    * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / VH;
  eq('scale = world-per-pixel * pixelSize (85)', gizmoScale, wpp * 85, 1e-6);
  t('ring is billboarded to the camera', Math.abs(gizmo.group.getObjectByName('ring').quaternion.dot(camera.quaternion)) > 0.999);
  t('hit meshes carry grip ids', gizmo.hitMeshes.length === 7, gizmo.hitMeshes.length);
  const parts = gizmo.hitMeshes.map((m) => m.userData.gizmoPart).sort();
  t('grips: 3 axes + 3 planes + view ring', JSON.stringify(parts) === JSON.stringify(['move-x', 'move-y', 'move-z', 'plane-x', 'plane-y', 'plane-z', 'view']), parts);
}

group('picking');
{
  // off-axis camera: a ray from x=0 would be coplanar with the YZ quad
  const { camera, gizmo } = makeRig([8, 10, 20]);
  const s = gizmo.group.scale.x;
  const raycaster = new THREE.Raycaster();
  const pickAt = (worldPoint) => {
    const p = new THREE.Vector3(...worldPoint).project(camera);
    raycaster.setFromCamera(new THREE.Vector2(p.x, p.y), camera);
    return gizmo.pick(raycaster);
  };
  eq('ray at the X cone picks move-x', pickAt([0.95 * s, 0, 0]), 'move-x');
  eq('ray at the Y cone picks move-y', pickAt([0, 0.95 * s, 0]), 'move-y');
  eq('ray at the Z cone picks move-z', pickAt([0, 0, 0.95 * s]), 'move-z');
  eq('ray at the XY corner quad picks plane-z', pickAt([(0.95 - 0.08) * s, (0.95 - 0.08) * s, 0]), 'plane-z');
  eq('ray at the YZ corner quad picks plane-x', pickAt([0, (0.95 - 0.08) * s, (0.95 - 0.08) * s]), 'plane-x');
  eq('ray at the center picks the view ring', pickAt([0, 0, 0]), 'view');
  t('ray at empty space picks nothing', pickAt([30 * s, 30 * s, 30 * s]) === null);
}

group('axis drag');
{
  const { camera, gizmo } = makeRig();
  const s = gizmo.group.scale.x;
  const ray0 = rayAt(camera, [0.95 * s, 0, 0]);
  t('beginDrag returns true', gizmo.beginDrag('move-x', ray0, camera) === true);
  t('onInteract fired on grab', true);
  // move the aim point +3 along world X (the ray crosses the X axis there)
  const total = gizmo.dragMove(rayAt(camera, [0.95 * s + 3, 0, 0]), false);
  eq('axis drag total delta is +3 on X', total, [3, 0, 0], 0.02);
  const total2 = gizmo.dragMove(rayAt(camera, [0.95 * s - 1.5, 0, 0]), false);
  eq('dragging back reports -1.5 (total from grab)', total2, [-1.5, 0, 0], 0.02);
  const snapped = gizmo.dragMove(rayAt(camera, [0.95 * s + 3.3, 0, 0]), true);
  eq('Ctrl snaps the total to 0.25 steps', snapped, [3.25, 0, 0], 1e-9);
  gizmo.endDrag();
  t('endDrag clears the drag', gizmo.isDragging() === false);
  t('dragMove without a drag returns null', gizmo.dragMove(ray0, false) === null);
}

group('plane drag');
{
  const { camera, gizmo } = makeRig();
  const s = gizmo.group.scale.x;
  const c = (0.95 - 0.08) * s;
  const ray0 = rayAt(camera, [c, c, 0]);
  gizmo.beginDrag('plane-z', ray0, camera);
  // aim at a point offset (+2, +1, 0) in the z=0 plane
  const total = gizmo.dragMove(rayAt(camera, [c + 2, c + 1, 0]), false);
  eq('plane drag total delta is (+2, +1, 0)', total, [2, 1, 0], 0.02);
  gizmo.endDrag();
}

group('view ring drag');
{
  const { camera, gizmo } = makeRig();
  const ray0 = rayAt(camera, [0, 0, 0]);
  gizmo.beginDrag('view', ray0, camera);
  // aim at a point that lies IN the camera plane (perpendicular to the view dir)
  const dirv = new THREE.Vector3(0, -10, -20).normalize();
  const inPlane = new THREE.Vector3(0, 0, 1).cross(dirv).normalize().multiplyScalar(2);
  const total = gizmo.dragMove(rayAt(camera, [inPlane.x, inPlane.y, inPlane.z]), false);
  eq('view drag moves in the camera plane', total, [inPlane.x, inPlane.y, inPlane.z], 0.02);
  gizmo.endDrag();
}

group('hover highlight');
{
  const { gizmo } = makeRig();
  const cone = gizmo.group.getObjectByName('cone-x');
  const quad = gizmo.group.getObjectByName('quad-z');
  gizmo.setHot('move-x');
  t('hovering move-x lights the X cone', cone.material.opacity === 1 && cone.material.emissiveIntensity > 0);
  gizmo.setHot('plane-z');
  t('hovering plane-z brightens the Z quad', quad.material.opacity > 0.4);
  gizmo.setHot(null);
  t('unhover restores the cone', cone.material.emissiveIntensity === 0);
}

summary();
