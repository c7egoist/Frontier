// Transform-gizmo pointer arithmetic — ported from Slate Frontier's
// Frontier/Engine/Editor/GizmoFigures.cpp (reference: References/Gizmo.html).
//
// Translate grips: cones on the axes + corner quads in the planes.
// Drag rules are Blender's: a grab moves along the grip's axis or plane,
// Ctrl snaps to 0.25 world units. All functions are pure (dependency-free).

export type V3 = [number, number, number];

export const GIZMO_TIP = 0.95; // cone seat, fraction of reach
export const GIZMO_CONE_R = 0.06;
export const GIZMO_CONE_H = 0.18;
export const GIZMO_QUAD_HALF = 0.08;
export const GIZMO_QUAD_OPACITY = 0.28;
export const GIZMO_QUAD_HOVER_OPACITY = 0.55;
export const GIZMO_RING_R = 0.16;
export const GIZMO_RING_TUBE = 0.008;
export const GIZMO_SNAP = 0.25;

export const GIZMO_TINT_X = '#e01414';
export const GIZMO_TINT_Y = '#12d40a';
export const GIZMO_TINT_Z = '#1560e0';
// Plane quads: X names the YZ quad, as the reference does.
export const GIZMO_TINT_YZ = '#1fc7c7';
export const GIZMO_TINT_XZ = '#c81ec8';
export const GIZMO_TINT_XY = '#e0cd12';

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/**
 * AlongAxisUnderRay: signed distance along the axis from the origin to the
 * point on the axis line nearest the ray.
 */
export function alongAxisUnderRay(axis: V3, origin: V3, rayOrigin: V3, rayDir: V3): number {
  const w0 = sub(origin, rayOrigin);
  const a = dot(axis, axis);
  const b = dot(axis, rayDir);
  const c = dot(rayDir, rayDir);
  const d = dot(axis, w0);
  const e = dot(rayDir, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-6) return 0;
  return (b * e - c * d) / denom;
}

/** TouchPlaneUnderRay: the ray against the plane through origin w/ normal. */
export function touchPlaneUnderRay(
  normal: V3, origin: V3, rayOrigin: V3, rayDir: V3,
): V3 | null {
  const facing = dot(rayDir, normal);
  if (Math.abs(facing) < 1e-8) return null;
  const along = dot(sub(origin, rayOrigin), normal) / facing;
  if (along < 0) return null;
  return add(rayOrigin, mul(rayDir, along));
}

export function snapStep(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}
