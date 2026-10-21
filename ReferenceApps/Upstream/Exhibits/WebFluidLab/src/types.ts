// Shared type declarations used across the simulation, rendering and UI layers.

export type MaterialId = "water" | "milk" | "chocolate" | "mud";

export interface MaterialPreset {
  id: MaterialId;
  label: string;
  /** Rest (undisturbed) density, kg/m^3 — scaled for simulation stability, not literal SI. */
  restDensity: number;
  /** Stiffness constant for the Tait pressure equation (higher = less compressible). */
  stiffness: number;
  /** Dynamic viscosity coefficient (Laplacian / XSPH blend amount). */
  viscosity: number;
  /** Short range cohesion / surface-tension-like attraction. */
  cohesion: number;
  /** How strongly particles adhere to collider & wall surfaces (sticking to objects). */
  adhesion: number;
  /** Friction applied to the tangential velocity component on contact. */
  friction: number;
  /** Fraction of adhered relative velocity needed before a stuck particle can release again. */
  releaseThreshold: number;
  /** Base RGB albedo, 0..1 */
  color: [number, number, number];
  /** How opaque the fluid becomes per unit of accumulated screen-space thickness. */
  absorption: number;
  /** Specular roughness, 0 (mirror) .. 1 (matte) */
  roughness: number;
  /** Index-of-refraction-like refraction strength used for background distortion. */
  refraction: number;
  /** Particle visual radius, meters. */
  particleRadius: number;
  /** How "thick"/slow the fluid looks (affects FLIP/PIC-style damping in GPU solver). */
  damping: number;
}

export type QualityTier = "potato" | "low" | "medium" | "high" | "ultra";

export interface QualitySettings {
  tier: QualityTier;
  renderScale: number;
  maxParticles: number;
  pressureIterations: number;
  blurPasses: number;
  shadow: boolean;
}

export type ViewMode = "surface" | "particles" | "both";

export type ColliderKind = "plane" | "sphere" | "box" | "paddle";

export interface ColliderSpec {
  kind: ColliderKind;
  /** center position, meters */
  position: [number, number, number];
  /** sphere: radius in .x; box: half-extents xyz; plane: normal stored in rotation; paddle: radius.x, half-height.y */
  size: [number, number, number];
  /** Rotation around Y axis in radians (paddle sweep / box yaw). */
  rotationY: number;
  /** If > 0, the collider rotates continuously at this angular speed (rad/s). */
  spinSpeed: number;
  color: [number, number, number];
}

export interface Backend {
  readonly kind: "webgpu" | "webgl2";
}
