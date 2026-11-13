/*============================================================================================================================================
                                                        FORCEFIELDCATALOG.JS
============================================================================================================================================*/
// Canonical 19-Law C++ ForceModel & VectorField authoring runtime for FrontierWorldMirror (+Z Up, zero rigid-body physics).
// Matches Engine/SimulationSpace/ForceFields/ForceFieldDescriptors.h (Ordinals 0..18), SpaceContainerCodec (.ForceModel / .VectorFieldSpace),
// ForceInspectorView (Model / Formula / Layers / Cache), and the 12-float GPU ForceOverlay vertex format across WebGPU, WebGL2 & CpuGtx.

import { CompileFieldProgram, FORMULA_PRESETS, DEFAULT_FORMULA_CODE } from "./VectorFieldLang.js";

export { FORMULA_PRESETS, DEFAULT_FORMULA_CODE };

const DEG_TO_RAD = Math.PI / 180.0;
const TWO_PI = Math.PI * 2.0;

export const ForceDomains = Object.freeze({
  VectorField: {
    Id: "VectorField",
    Label: "VectorField",
    Subtitle: "Analytical directional, radial, orbital & electromagnetic force laws",
    Color: "#4AA8FF",
  },
  FlowField: {
    Id: "FlowField",
    Label: "FlowField",
    Subtitle: "Advected slipstreams, spline corridors & boundary-layer currents",
    Color: "#3AD69C",
  },
  TurbulenceField: {
    Id: "TurbulenceField",
    Label: "TurbulenceField",
    Subtitle: "Divergence-free 3D curl noise, atmospheric gusts & vorticity",
    Color: "#E6A23C",
  },
});

export const ReachEnvelopes = ["Sphere", "Column", "Box", "Infinite"];
export const AttenuationCurves = ["SmoothStep", "Linear", "InverseSquare", "Constant"];
export const DurationModes = ["Continuous", "Modulated", "Impulse"];
export const MotionTopologies = ["Static", "LinearAB", "CircularOrbit", "Figure8"];
export const ColorRampModes = ["Beaufort", "Turbo", "Viridis", "DomainTint"];

export const DEFAULT_FORCE_OVERLAY = Object.freeze({
  Enabled: true,
  ShowEnvelopes: true,
  ShowVelocityArrows: true,
  ShowStreamlines: true,
  ShowMotionPaths: true,
  ArrowDensity: 3, // 2..5 samples per axis
  VectorScale: 0.24,
  ColorRamp: "Beaufort",
  ProbePosition: [0.0, 0.0, 1.4],
});

// Bespoke 16x16 SVG stroke paths for all 19 canonical C++ ForceModel laws
export const FORCE_MODEL_SVG_PATHS = Object.freeze({
  LinearWind:
    '<path d="M2 6h8.5a2 2 0 1 0-1.9-2.6M2 10h11a1.8 1.8 0 1 1-1.6 2.5M2 13h6.5a1.5 1.5 0 1 1-1.3 2.2"/>',
  Buoyancy:
    '<path d="M8 14V3M4.8 6.2L8 3l3.2 3.2"/><circle cx="8" cy="11.5" r="1.7"/>',
  RadialBurst:
    '<circle cx="8" cy="8" r="2.2"/><circle cx="8" cy="8" r="5.5" stroke-dasharray="2.2 2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>',
  Attractor:
    '<circle cx="8" cy="8" r="1.8"/><path d="M2.5 2.5L5.8 5.8M13.5 2.5l-3.3 3.3M2.5 13.5l3.3-3.3M13.5 13.5l-3.3-3.3"/>',
  Repulsor:
    '<circle cx="8" cy="8" r="1.8"/><path d="M5.5 5.5L2.2 2.2M10.5 5.5l3.3-3.3M5.5 10.5l-3.3 3.3M10.5 10.5l3.3 3.3M2.2 4.5V2.2h2.3M13.8 4.5V2.2h-2.3"/>',
  AxisAttractor:
    '<path d="M3 13L13 3"/><path d="M4.5 5.5l2.5 2.5M11.5 10.5L9 8"/>',
  Containment:
    '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3" stroke-dasharray="1.8 1.8"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2"/>',
  RotationalColumn:
    '<path d="M8 8a1.2 1.2 0 1 1-1.2-1.2 2.4 2.4 0 0 1 2.4 2.4A3.8 3.8 0 0 1 4 8a5.2 5.2 0 0 1 10.2-1"/>',
  Torque:
    '<path d="M12.8 6.2A5.2 5.2 0 1 0 11.5 12"/><path d="M10.2 6.5h3.2V3.3"/><circle cx="8" cy="8" r="1.4"/>',
  Drag:
    '<path d="M5.5 3v10M10.5 3v10M2 8h3.5M14 8h-3.5"/>',
  CurlNoise:
    '<path d="M2.5 7.5a2.8 2.8 0 1 1 5.2 1.4 2.8 2.8 0 1 0 5.6 1"/><path d="M11.8 5.2a2 2 0 0 0-3-.2"/>',
  AtmosphericGust:
    '<path d="M1.8 7h9.4a2.1 2.1 0 1 0-2-2.7M3.5 10.5h9.5a1.7 1.7 0 1 1-1.6 2.3"/><path d="M2 3.8l2.2 1.2L2 6.2"/>',
  VorticityConfinement:
    '<circle cx="5.5" cy="8" r="2.6"/><circle cx="10.8" cy="8" r="2.6"/><path d="M5.5 5.4l1.4-1.2M10.8 10.6l-1.4 1.2"/>',
  BrownianNoise:
    '<path d="M2.5 11.5L5 7l2.2 3.2L10 4.5l2 4 2-2.5"/><circle cx="2.5" cy="11.5" r="1"/><circle cx="14" cy="6" r="1"/>',
  LorentzField:
    '<path d="M2.5 9.5c1.5-4.5 3.5-4.5 4.5 0s3 4.5 4.5 0 1.8-4.5 2.5 0"/><path d="M2 4h12M11.8 2.2L14 4l-2.2 1.8"/>',
  MagneticDipole:
    '<path d="M6.5 4.5C3 4.5 2 8 2 8s1 3.5 4.5 3.5M9.5 4.5C13 4.5 14 8 14 8s-1 3.5-4.5 3.5"/><rect x="6.6" y="4.5" width="2.8" height="7" rx="1"/>',
  FlowStream:
    '<path d="M2 5c3-2 6 2 9 0l2-1M2 9c3-2 6 2 9 0l2-1M2 13c3-2 6 2 9 0l2-1"/><path d="M11.5 3.2L14 4l-.8 2.4"/>',
  SplineForce:
    '<path d="M2 12.5C5 12.5 5 3.5 8 3.5s3 9 6 9"/><path d="M12.2 10.5L14 12.5l-2 1.8"/>',
  BoundaryAdhesion:
    '<path d="M2 12.5h12"/><path d="M4 5c2.5 4.5 5.5 4.5 8 0"/><path d="M8 3.5v6.5M6 8l2 2 2-2"/>',
});

// Canonical 19 ForceModel Laws matching ForceFieldDescriptors.h (Ordinals 0..18)
export const FORCE_MODELS = Object.freeze([
  {
    Ordinal: 0,
    Id: "LinearWind",
    Name: "Linear Wind",
    Domain: "VectorField",
    Color: "#4AA8FF",
    Unit: "m/s",
    Equation: "v(p,t) = S · (1 + σ·z) · d̂(ψ) · f(r)",
    Summary: "Directional prevailing airflow with altitude wind-shear and directional azimuth.",
    Defaults: { Strength: 12.5, Radius: 2.8, CoreRadius: 0.55, SwirlRatio: 0.12, Frequency: 0.22, Reach: "Column" },
  },
  {
    Ordinal: 1,
    Id: "Buoyancy",
    Name: "Buoyancy",
    Domain: "VectorField",
    Color: "#52C896",
    Unit: "m/s²",
    Equation: "a_z(p) = S · ((ρ_f - ρ_b)/ρ_b) · f(r) · ẑ",
    Summary: "Archimedean +Z vertical thermal lift or downdraft column with density lapse.",
    Defaults: { Strength: 11.0, Radius: 2.2, CoreRadius: 0.5, SwirlRatio: 0.15, Frequency: 0.18, Reach: "Column" },
  },
  {
    Ordinal: 2,
    Id: "RadialBurst",
    Name: "Radial Burst",
    Domain: "VectorField",
    Color: "#FF8A5B",
    Unit: "m/s²",
    Equation: "a(p,t) = S · g_imp(t) · f(r) · r̂",
    Summary: "Spherical outward pressure wave or pulsed shockwave envelope.",
    Defaults: { Strength: 18.0, Radius: 2.4, CoreRadius: 0.42, SwirlRatio: 0.0, Frequency: 0.65, Reach: "Sphere", Duration: "Impulse" },
  },
  {
    Ordinal: 3,
    Id: "Attractor",
    Name: "Attractor",
    Domain: "VectorField",
    Color: "#63B3FF",
    Unit: "m/s²",
    Equation: "a(p) = -S · f(r) · r / max(r, r_core)³",
    Summary: "Soft-core centripetal gravity well pulling inward without central singularity.",
    Defaults: { Strength: 15.0, Radius: 2.5, CoreRadius: 0.48, SwirlRatio: 0.22, Frequency: 0.2, Reach: "Sphere", Attenuation: "InverseSquare" },
  },
  {
    Ordinal: 4,
    Id: "Repulsor",
    Name: "Repulsor",
    Domain: "VectorField",
    Color: "#F27979",
    Unit: "m/s²",
    Equation: "a(p) = +S · f(r) · r̂",
    Summary: "Continuous soft-core radial exclusion dome deflecting trajectories outward.",
    Defaults: { Strength: 16.0, Radius: 2.3, CoreRadius: 0.45, SwirlRatio: 0.0, Frequency: 0.2, Reach: "Sphere" },
  },
  {
    Ordinal: 5,
    Id: "AxisAttractor",
    Name: "Axis Attractor",
    Domain: "VectorField",
    Color: "#6EC8F5",
    Unit: "m/s²",
    Equation: "a(p) = -S · f(r_⊥) · r̂_⊥ + ω · (â × r̂_⊥)",
    Summary: "Cylindrical line-sink drawing flow radially onto the local +Z spine with optional swirl.",
    Defaults: { Strength: 13.5, Radius: 2.2, CoreRadius: 0.4, SwirlRatio: 0.55, Frequency: 0.25, Reach: "Column" },
  },
  {
    Ordinal: 6,
    Id: "Containment",
    Name: "Containment",
    Domain: "VectorField",
    Color: "#8C9EFF",
    Unit: "m/s²",
    Equation: "a(p) = -S · max(0, (r - r_inner)/(R - r_inner))² · r̂",
    Summary: "Calm interior dead-zone surrounded by a restoring inward boundary shell.",
    Defaults: { Strength: 16.5, Radius: 2.6, CoreRadius: 1.15, SwirlRatio: 0.18, Frequency: 0.2, Reach: "Sphere" },
  },
  {
    Ordinal: 7,
    Id: "RotationalColumn",
    Name: "Rotational Column",
    Domain: "VectorField",
    Color: "#B888FF",
    Unit: "m/s",
    Equation: "v(p) = S · Rankine(r_⊥, r_core) · (ẑ × r̂_⊥) + u_up·ẑ",
    Summary: "Rankine cyclone / vortex funnel with solid-body inner core and 1/r outer decay.",
    Defaults: { Strength: 17.5, Radius: 2.5, CoreRadius: 0.62, SwirlRatio: 1.15, Frequency: 0.3, Reach: "Column" },
  },
  {
    Ordinal: 8,
    Id: "Torque",
    Name: "Torque",
    Domain: "VectorField",
    Color: "#C58AF9",
    Unit: "rad/s²",
    Equation: "τ(p) = S · f(r) · (â × r̂)",
    Summary: "Pure rotational spin field imparting angular velocity around the local axis.",
    Defaults: { Strength: 14.0, Radius: 2.1, CoreRadius: 0.45, SwirlRatio: 1.35, Frequency: 0.25, Reach: "Sphere" },
  },
  {
    Ordinal: 9,
    Id: "Drag",
    Name: "Drag",
    Domain: "VectorField",
    Color: "#78B8C8",
    Unit: "1/s",
    Equation: "a_drag(p) = -½ · C_d · S · f(r) · v̂",
    Summary: "Viscous damping medium attenuating kinetic velocity inside the volume.",
    Defaults: { Strength: 10.5, Radius: 2.4, CoreRadius: 0.5, SwirlRatio: 0.0, Frequency: 0.15, Reach: "Box" },
  },
  {
    Ordinal: 10,
    Id: "CurlNoise",
    Name: "Curl Noise",
    Domain: "TurbulenceField",
    Color: "#E6A23C",
    Unit: "m/s",
    Equation: "v(p,t) = S · f(r) · (∇ × Ψ_fbm(p/λ, t))   [∇·v ≡ 0]",
    Summary: "Incompressible divergence-free 3D multi-octave curl-noise eddies.",
    Defaults: { Strength: 14.0, Radius: 2.7, CoreRadius: 0.5, TurbulenceScale: 1.35, Octaves: 3, SwirlRatio: 0.75, Frequency: 0.32, Reach: "Sphere" },
  },
  {
    Ordinal: 11,
    Id: "AtmosphericGust",
    Name: "Atmospheric Gust",
    Domain: "TurbulenceField",
    Color: "#F0B45A",
    Unit: "m/s",
    Equation: "v(p,t) = S · (0.6 + 0.4 sin(k·x - ωt)) · d̂ + σ_curl(p,t)",
    Summary: "Traveling sinusoidal gust fronts layered over divergence-free boundary turbulence.",
    Defaults: { Strength: 15.5, Radius: 2.8, CoreRadius: 0.55, TurbulenceScale: 1.6, Octaves: 2, SwirlRatio: 0.35, Frequency: 0.45, Reach: "Box", Duration: "Modulated" },
  },
  {
    Ordinal: 12,
    Id: "VorticityConfinement",
    Name: "Vorticity Confinement",
    Domain: "TurbulenceField",
    Color: "#E8914F",
    Unit: "m/s²",
    Equation: "f_vc = ε · S · (N̂ × ω),   ω = ∇ × u",
    Summary: "Re-injects coherent fine-scale rolling vortex rings into sheared flow wakes.",
    Defaults: { Strength: 15.0, Radius: 2.4, CoreRadius: 0.5, TurbulenceScale: 1.1, Octaves: 3, SwirlRatio: 0.95, Frequency: 0.38, Reach: "Sphere" },
  },
  {
    Ordinal: 13,
    Id: "BrownianNoise",
    Name: "Brownian Noise",
    Domain: "TurbulenceField",
    Color: "#D9A85B",
    Unit: "m/s²",
    Equation: "a(p,t) = S · f(r) · ξ_3D(p/λ + ν·t)",
    Summary: "Stochastic 3D Langevin micro-jitter for dust motes, embers, and thermal shimmer.",
    Defaults: { Strength: 11.5, Radius: 2.3, CoreRadius: 0.4, TurbulenceScale: 0.85, Octaves: 3, SwirlRatio: 0.4, Frequency: 0.55, Reach: "Sphere" },
  },
  {
    Ordinal: 14,
    Id: "LorentzField",
    Name: "Lorentz Field",
    Domain: "VectorField",
    Color: "#A78BFA",
    Unit: "m/s²",
    Equation: "a(p) = (q/m) · (E(p) + u_drift × B(p))",
    Summary: "Coupled electric drift and axial magnetic cyclotron gyration.",
    Defaults: { Strength: 16.0, Radius: 2.5, CoreRadius: 0.55, SwirlRatio: 1.05, Frequency: 0.35, Reach: "Column" },
  },
  {
    Ordinal: 15,
    Id: "MagneticDipole",
    Name: "Magnetic Dipole",
    Domain: "VectorField",
    Color: "#C084FC",
    Unit: "m/s",
    Equation: "B(p) = (3(m·r̂)r̂ - m) / max(r, r_core)³",
    Summary: "Toroidal north-south dipole flux lobes curving smoothly from +Z pole to -Z pole.",
    Defaults: { Strength: 15.5, Radius: 2.6, CoreRadius: 0.58, SwirlRatio: 0.35, Frequency: 0.2, Reach: "Sphere" },
  },
  {
    Ordinal: 16,
    Id: "FlowStream",
    Name: "Flow Stream",
    Domain: "FlowField",
    Color: "#3AD69C",
    Unit: "m/s",
    Equation: "v(p) = S · f(r_⊥) · t̂_corridor + κ_inflow · n̂_⊥",
    Summary: "Directed slipstream jet corridor with lateral entrainment toward the core axis.",
    Defaults: { Strength: 16.5, Radius: 2.6, CoreRadius: 0.65, SwirlRatio: 0.25, Frequency: 0.25, Reach: "Box" },
  },
  {
    Ordinal: 17,
    Id: "SplineForce",
    Name: "Spline Force",
    Domain: "FlowField",
    Color: "#2DD4BF",
    Unit: "m/s",
    Equation: "v(p) = S · T̂(s*) + k_tube · (C(s*) - p)",
    Summary: "Curved S-bend streamline tube guiding flow tangentially with tube centering.",
    Defaults: { Strength: 15.0, Radius: 2.7, CoreRadius: 0.6, SwirlRatio: 0.45, Frequency: 0.28, Reach: "Box" },
  },
  {
    Ordinal: 18,
    Id: "BoundaryAdhesion",
    Name: "Boundary Adhesion",
    Domain: "FlowField",
    Color: "#38BDF8",
    Unit: "m/s",
    Equation: "v(p) = S · exp(-d_surf/δ) · t̂_coanda - k_adhere · n̂_surf",
    Summary: "Coanda surface-hugging boundary layer skimming along the floor/hull plane.",
    Defaults: { Strength: 13.0, Radius: 2.6, CoreRadius: 0.5, SwirlRatio: 0.2, Frequency: 0.22, Reach: "Box" },
  },
]);

const FORCE_MODEL_MAP = new Map(FORCE_MODELS.map((M) => [M.Id, M]));

export function GetForceModelMeta(ModelIdOrOrdinal) {
  if (typeof ModelIdOrOrdinal === "number") {
    return FORCE_MODELS[Math.max(0, Math.min(FORCE_MODELS.length - 1, ModelIdOrOrdinal | 0))];
  }
  if (ModelIdOrOrdinal === "Stream") return FORCE_MODEL_MAP.get("FlowStream");
  if (ModelIdOrOrdinal === "Vortex") return FORCE_MODEL_MAP.get("RotationalColumn");
  if (ModelIdOrOrdinal === "SurfaceAdhesion") return FORCE_MODEL_MAP.get("BoundaryAdhesion");
  return FORCE_MODEL_MAP.get(ModelIdOrOrdinal) || FORCE_MODELS[0];
}

// Curated .ForceModel & .VectorFieldSpace presets exposed in AssetDepot / ContentBrowser & Construct
export const ENGINE_FORCE_PRESETS = Object.freeze([
  {
    Id: "force-preset-coastal-crosswind",
    Name: "Coastal Crosswind",
    Format: ".ForceModel",
    Model: "LinearWind",
    Summary: "Steady 14.5 m/s maritime crosswind with gentle altitude shear.",
    Force: { Model: "LinearWind", Strength: 14.5, Radius: 3.0, CoreRadius: 0.6, YawDeg: 38, SwirlRatio: 0.14, Reach: "Column" },
  },
  {
    Id: "force-preset-thermal-updraft",
    Name: "Thermal Updraft",
    Format: ".ForceModel",
    Model: "Buoyancy",
    Summary: "Rising +Z convective column with warm core buoyancy.",
    Force: { Model: "Buoyancy", Strength: 13.0, Radius: 2.2, CoreRadius: 0.55, SwirlRatio: 0.22, Reach: "Column" },
  },
  {
    Id: "force-preset-cyclone-funnel",
    Name: "Cyclone Funnel",
    Format: ".ForceModel",
    Model: "RotationalColumn",
    Summary: "Rankine vortex column with tight inner eyewall and helical updraft.",
    Force: { Model: "RotationalColumn", Strength: 19.5, Radius: 2.6, CoreRadius: 0.58, SwirlRatio: 1.35, Reach: "Column" },
  },
  {
    Id: "force-preset-magnetic-containment",
    Name: "Magnetic Containment",
    Format: ".ForceModel",
    Model: "Containment",
    Summary: "Calm 1.1m inner chamber bounded by a smooth restoring shell.",
    Force: { Model: "Containment", Strength: 17.5, Radius: 2.7, CoreRadius: 1.1, SwirlRatio: 0.28, Reach: "Sphere" },
  },
  {
    Id: "force-preset-curlnoise-wake",
    Name: "CurlNoise Wake",
    Format: ".VectorFieldSpace",
    Model: "CurlNoise",
    Summary: "3-octave divergence-free turbulent wake field (div v = 0).",
    Force: { Model: "CurlNoise", Strength: 15.0, Radius: 2.8, CoreRadius: 0.5, TurbulenceScale: 1.25, Octaves: 3, Reach: "Sphere" },
  },
  {
    Id: "force-preset-orbital-attractor",
    Name: "Orbital Attractor",
    Format: ".ForceModel",
    Model: "Attractor",
    Summary: "Soft-core inverse-square gravity sink with tangential swirl.",
    Force: { Model: "Attractor", Strength: 16.5, Radius: 2.5, CoreRadius: 0.48, SwirlRatio: 0.45, Attenuation: "InverseSquare", Reach: "Sphere" },
  },
  {
    Id: "force-preset-radial-shockwave",
    Name: "Radial Shockwave",
    Format: ".ForceModel",
    Model: "RadialBurst",
    Summary: "Periodic outward pressure pulse envelope.",
    Force: { Model: "RadialBurst", Strength: 21.0, Radius: 2.5, CoreRadius: 0.4, Duration: "Impulse", Frequency: 0.6, Reach: "Sphere" },
  },
  {
    Id: "force-preset-atmospheric-gust",
    Name: "Atmospheric Gust",
    Format: ".VectorFieldSpace",
    Model: "AtmosphericGust",
    Summary: "Modulated gust fronts with layered curl-noise shear.",
    Force: { Model: "AtmosphericGust", Strength: 16.0, Radius: 2.9, CoreRadius: 0.55, Duration: "Modulated", Frequency: 0.42, Reach: "Box" },
  },
  {
    Id: "force-preset-lorentz-plasma",
    Name: "Lorentz Plasma Field",
    Format: ".VectorFieldSpace",
    Model: "LorentzField",
    Summary: "Helical cyclotron gyration under crossed E and B fields.",
    Force: { Model: "LorentzField", Strength: 17.0, Radius: 2.5, CoreRadius: 0.52, SwirlRatio: 1.15, Reach: "Column" },
  },
  {
    Id: "force-preset-magnetic-dipole",
    Name: "Magnetic Dipole Torus",
    Format: ".ForceModel",
    Model: "MagneticDipole",
    Summary: "Closed dipolar field loops arcing from +Z to -Z pole.",
    Force: { Model: "MagneticDipole", Strength: 16.0, Radius: 2.6, CoreRadius: 0.55, Reach: "Sphere" },
  },
  {
    Id: "force-preset-slipstream-jet",
    Name: "Slipstream Jet",
    Format: ".ForceModel",
    Model: "FlowStream",
    Summary: "High-speed directed jet tunnel with lateral entrainment.",
    Force: { Model: "FlowStream", Strength: 18.0, Radius: 2.7, CoreRadius: 0.62, YawDeg: 0, Reach: "Box" },
  },
  {
    Id: "force-preset-helmholtz-formula",
    Name: "Helmholtz Formula Field",
    Format: ".VectorFieldSpace",
    Model: "FlowStream",
    Summary: "Custom VectorFieldLang symbolic Helmholtz vortex + updraft.",
    Force: {
      Model: "FlowStream",
      Strength: 16.0,
      Radius: 2.6,
      CoreRadius: 0.55,
      Reach: "Sphere",
      FormulaEnabled: true,
      FormulaCode: FORMULA_PRESETS[1]?.Code || DEFAULT_FORMULA_CODE,
    },
  },
]);

const ClampNum = (Val, Min, Max, Fallback) => {
  const N = Number(Val);
  return Number.isFinite(N) ? Math.max(Min, Math.min(Max, N)) : Fallback;
};

export function ResolveForceValues(Raw = {}, FallbackModel = "LinearWind") {
  const Src = Raw?.Force && typeof Raw.Force === "object" ? Raw.Force : Raw;
  const Meta = GetForceModelMeta(Src?.Model || FallbackModel);
  const Def = Meta.Defaults;
  return {
    Model: Meta.Id,
    Domain: Meta.Domain,
    Enabled: Src?.Enabled !== false,
    Strength: ClampNum(Src?.Strength, -80, 80, Def.Strength ?? 14.0),
    Radius: ClampNum(Src?.Radius, 0.35, 250.0, Def.Radius ?? 2.5),
    CoreRadius: ClampNum(Src?.CoreRadius, 0.08, 120.0, Def.CoreRadius ?? 0.5),
    FalloffExponent: ClampNum(Src?.FalloffExponent, 0.2, 6.0, 1.35),
    Attenuation: AttenuationCurves.includes(Src?.Attenuation)
      ? Src.Attenuation
      : Def.Attenuation || "SmoothStep",
    Reach: ReachEnvelopes.includes(Src?.Reach) ? Src.Reach : Def.Reach || "Sphere",
    Duration: DurationModes.includes(Src?.Duration) ? Src.Duration : Def.Duration || "Continuous",
    SwirlRatio: ClampNum(Src?.SwirlRatio, -3.0, 3.0, Def.SwirlRatio ?? 0.25),
    TurbulenceScale: ClampNum(Src?.TurbulenceScale, 0.15, 60.0, Def.TurbulenceScale ?? 1.3),
    Octaves: Math.round(ClampNum(Src?.Octaves, 1, 5, Def.Octaves ?? 3)),
    Frequency: ClampNum(Src?.Frequency, 0.02, 5.0, Def.Frequency ?? 0.28),
    YawDeg: ClampNum(Src?.YawDeg, -360, 360, 25),
    PitchDeg: ClampNum(Src?.PitchDeg, -90, 90, 0),
    MotionTopology: MotionTopologies.includes(Src?.MotionTopology) ? Src.MotionTopology : "Static",
    MotionAmplitude: ClampNum(Src?.MotionAmplitude, 0.0, 20.0, 1.15),
    MotionSpeedHz: ClampNum(Src?.MotionSpeedHz, 0.02, 3.0, 0.22),
    FormulaEnabled: Boolean(Src?.FormulaEnabled),
    FormulaCode:
      typeof Src?.FormulaCode === "string" && Src.FormulaCode.trim()
        ? Src.FormulaCode
        : DEFAULT_FORMULA_CODE,
  };
}

//------------------------------------------------------------------------------------------------------------------------
//                                  ANALYTICAL +Z UP VECTOR FIELD EVALUATOR (NO PHYSICS)
//------------------------------------------------------------------------------------------------------------------------

function Hash3(X, Y, Z) {
  const S = Math.sin(X * 127.1 + Y * 311.7 + Z * 74.7) * 43758.5453123;
  return S - Math.floor(S);
}

function ValueNoise3(X, Y, Z) {
  const Ix = Math.floor(X), Iy = Math.floor(Y), Iz = Math.floor(Z);
  const Fx = X - Ix, Fy = Y - Iy, Fz = Z - Iz;
  const Ux = Fx * Fx * Fx * (Fx * (Fx * 6 - 15) + 10);
  const Uy = Fy * Fy * Fy * (Fy * (Fy * 6 - 15) + 10);
  const Uz = Fz * Fz * Fz * (Fz * (Fz * 6 - 15) + 10);
  const Lerp = (A, B, T) => A + (B - A) * T;
  const N000 = Hash3(Ix, Iy, Iz),       N100 = Hash3(Ix + 1, Iy, Iz);
  const N010 = Hash3(Ix, Iy + 1, Iz),   N110 = Hash3(Ix + 1, Iy + 1, Iz);
  const N001 = Hash3(Ix, Iy, Iz + 1),   N101 = Hash3(Ix + 1, Iy, Iz + 1);
  const N011 = Hash3(Ix, Iy + 1, Iz + 1), N111 = Hash3(Ix + 1, Iy + 1, Iz + 1);
  return (
    Lerp(
      Lerp(Lerp(N000, N100, Ux), Lerp(N010, N110, Ux), Uy),
      Lerp(Lerp(N001, N101, Ux), Lerp(N011, N111, Ux), Uy),
      Uz,
    ) * 2.0 - 1.0
  );
}

function PotentialFbmVec3(X, Y, Z, Octaves = 3) {
  let Ax = 0, Ay = 0, Az = 0, Amp = 1.0, Freq = 1.0, Norm = 0;
  for (let O = 0; O < Octaves; ++O) {
    Ax += Amp * ValueNoise3(X * Freq + 13.7, Y * Freq - 5.3, Z * Freq + 2.1);
    Ay += Amp * ValueNoise3(X * Freq - 9.2, Y * Freq + 17.4, Z * Freq - 6.8);
    Az += Amp * ValueNoise3(X * Freq + 4.9, Y * Freq - 11.1, Z * Freq + 21.3);
    Norm += Amp;
    Amp *= 0.5;
    Freq *= 2.02;
  }
  const Inv = Norm > 1e-6 ? 1.0 / Norm : 1.0;
  return [Ax * Inv, Ay * Inv, Az * Inv];
}

// Divergence-free 3D Curl(Psi) via central finite differences (div(curl Psi) = 0)
export function SampleCurlNoise3D(Px, Py, Pz, ScaleMeters = 1.3, Octaves = 3, TimeSec = 0) {
  const InvS = 1.0 / Math.max(0.15, ScaleMeters);
  const Qx = Px * InvS + TimeSec * 0.24;
  const Qy = Py * InvS - TimeSec * 0.19;
  const Qz = Pz * InvS + TimeSec * 0.15;
  const Eps = 1e-3;
  const Pxp = PotentialFbmVec3(Qx + Eps, Qy, Qz, Octaves);
  const Pxm = PotentialFbmVec3(Qx - Eps, Qy, Qz, Octaves);
  const Pyp = PotentialFbmVec3(Qx, Qy + Eps, Qz, Octaves);
  const Pym = PotentialFbmVec3(Qx, Qy - Eps, Qz, Octaves);
  const Pzp = PotentialFbmVec3(Qx, Qy, Qz + Eps, Octaves);
  const Pzm = PotentialFbmVec3(Qx, Qy, Qz - Eps, Octaves);
  const Inv2E = 0.5 / Eps;
  const dPz_dy = (Pyp[2] - Pym[2]) * Inv2E;
  const dPy_dz = (Pzp[1] - Pzm[1]) * Inv2E;
  const dPx_dz = (Pzp[0] - Pzm[0]) * Inv2E;
  const dPz_dx = (Pxp[2] - Pxm[2]) * Inv2E;
  const dPy_dx = (Pxp[1] - Pxm[1]) * Inv2E;
  const dPx_dy = (Pyp[0] - Pym[0]) * Inv2E;
  return [dPz_dy - dPy_dz, dPx_dz - dPz_dx, dPy_dx - dPx_dy];
}

export function EvaluateReachNormalizedDistance(Dx, Dy, Dz, Radius, Reach) {
  const SafeR = Math.max(0.1, Radius);
  if (Reach === "Infinite") return 0.0;
  if (Reach === "Column") {
    const RadialXY = Math.hypot(Dx, Dy) / SafeR;
    const AxialZ = Math.abs(Dz) / (SafeR * 1.15);
    return Math.max(RadialXY, AxialZ);
  }
  if (Reach === "Box") {
    return Math.max(Math.abs(Dx), Math.abs(Dy), Math.abs(Dz)) / SafeR;
  }
  return Math.hypot(Dx, Dy, Dz) / SafeR;
}

export function EvaluateRadialEnvelope(NormU, Curve = "SmoothStep", Exponent = 1.35) {
  if (NormU >= 1.0) return 0.0;
  if (Curve === "Constant") return 1.0;
  const U = Math.max(0.0, Math.min(1.0, NormU));
  if (Curve === "Linear") return Math.pow(1.0 - U, Exponent);
  if (Curve === "InverseSquare") {
    const Tail = 1.0 - U * U * (3.0 - 2.0 * U);
    return (1.0 / (1.0 + 6.0 * U * U)) * Tail;
  }
  const S = 1.0 - U * U;
  return Math.pow(Math.max(0.0, S * S), Exponent * 0.75);
}

export function EvaluateMotionCenter(BaseCenter, Force, TimeSec = 0) {
  const Cx = BaseCenter[0] || 0;
  const Cy = BaseCenter[1] || 0;
  const Cz = BaseCenter[2] || 0;
  const Mode = Force.MotionTopology || "Static";
  const Amp = Force.MotionAmplitude || 0;
  if (Mode === "Static" || Amp <= 1e-4) return [Cx, Cy, Cz];
  const Phase = TimeSec * TWO_PI * (Force.MotionSpeedHz || 0.22);
  if (Mode === "LinearAB") {
    return [Cx + Math.sin(Phase) * Amp, Cy, Cz];
  }
  if (Mode === "CircularOrbit") {
    return [Cx + Math.cos(Phase) * Amp, Cy + Math.sin(Phase) * Amp, Cz];
  }
  if (Mode === "Figure8") {
    return [Cx + Math.sin(Phase) * Amp, Cy + Math.sin(Phase * 2.0) * Amp * 0.55, Cz];
  }
  return [Cx, Cy, Cz];
}

const FORMULA_CACHE = new Map();
export function GetCompiledForceFormula(Code) {
  const Src = typeof Code === "string" ? Code : DEFAULT_FORMULA_CODE;
  if (FORMULA_CACHE.has(Src)) return FORMULA_CACHE.get(Src);
  const Compiled = CompileFieldProgram(Src);
  if (FORMULA_CACHE.size > 48) FORMULA_CACHE.clear();
  FORMULA_CACHE.set(Src, Compiled);
  return Compiled;
}

export function EvaluateForceSourceAt(ForceConfig, BaseCenter, RotationDeg, Px, Py, Pz, TimeSec = 0) {
  const F = ResolveForceValues(ForceConfig);
  if (!F.Enabled) return [0, 0, 0];

  const Center = EvaluateMotionCenter(BaseCenter || [0, 0, 1.4], F, TimeSec);
  const Dx = Px - Center[0];
  const Dy = Py - Center[1];
  const Dz = Pz - Center[2];

  const NormU = EvaluateReachNormalizedDistance(Dx, Dy, Dz, F.Radius, F.Reach);
  if (NormU >= 1.0 && F.Reach !== "Infinite") return [0, 0, 0];

  let Gate = 1.0;
  if (F.Duration === "Modulated") {
    Gate = 0.62 + 0.38 * Math.sin(TimeSec * TWO_PI * F.Frequency);
  } else if (F.Duration === "Impulse") {
    const Cycle = (TimeSec * F.Frequency) % 1.0;
    const T = Cycle < 0 ? Cycle + 1.0 : Cycle;
    Gate = Math.exp(-T * 4.5) * Math.sin(Math.min(1.0, T * 6.0) * Math.PI * 0.5);
  }

  const Env = EvaluateRadialEnvelope(NormU, F.Attenuation, F.FalloffExponent) * Gate;
  if (Math.abs(Env) <= 1e-6) return [0, 0, 0];

  // Symbolic VectorFieldLang override (+Z Up <-> Y-up adapter for formula presets)
  if (F.FormulaEnabled && F.FormulaCode) {
    const Prog = GetCompiledForceFormula(F.FormulaCode);
    if (Prog && Prog.Ok && typeof Prog.Evaluate === "function") {
      try {
        const Res = Prog.Evaluate(
          { X: Dx, Y: Dz, Z: Dy },
          { X: 0, Y: 0, Z: 0 },
          {
            Strength: F.Strength,
            Radius: F.Radius,
            Swirl: F.SwirlRatio * F.Strength,
            Gate,
            AttenuateFn: (Dist, Rad) =>
              EvaluateRadialEnvelope(Dist / Math.max(0.1, Rad || F.Radius), F.Attenuation, F.FalloffExponent),
          },
          TimeSec,
        );
        if (Res && Number.isFinite(Res.X)) {
          return [Res.X, Res.Z || 0, Res.Y || 0];
        }
      } catch {}
    }
  }

  const RotYaw = (((RotationDeg?.[2] || 0) + F.YawDeg) * DEG_TO_RAD);
  const RotPitch = (((RotationDeg?.[1] || 0) + F.PitchDeg) * DEG_TO_RAD);
  const DirX = Math.cos(RotPitch) * Math.cos(RotYaw);
  const DirY = Math.cos(RotPitch) * Math.sin(RotYaw);
  const DirZ = Math.sin(RotPitch);

  const R3 = Math.hypot(Dx, Dy, Dz);
  const SafeR3 = Math.max(F.CoreRadius, R3, 0.08);
  const Rx = R3 > 1e-5 ? Dx / R3 : 1.0;
  const Ry = R3 > 1e-5 ? Dy / R3 : 0.0;
  const Rz = R3 > 1e-5 ? Dz / R3 : 0.0;

  const Rxy = Math.hypot(Dx, Dy);
  const Tx = Rxy > 1e-5 ? -Dy / Rxy : 0.0;
  const Ty = Rxy > 1e-5 ? Dx / Rxy : 1.0;

  const S = F.Strength * Env;

  switch (F.Model) {
    case "LinearWind": {
      const Shear = 1.0 + 0.14 * Math.max(-1.0, Dz / Math.max(0.5, F.Radius));
      return [DirX * S * Shear, DirY * S * Shear, (DirZ + 0.05 * F.SwirlRatio) * S];
    }
    case "Buoyancy": {
      return [-Dx * 0.12 * S, -Dy * 0.12 * S, S];
    }
    case "RadialBurst":
    case "Repulsor": {
      return [Rx * S, Ry * S, Rz * S];
    }
    case "Attractor": {
      const CoreGain = Math.min(1.8, (F.Radius * 0.55) / SafeR3);
      return [
        (-Rx * CoreGain + Tx * F.SwirlRatio * 0.45) * S,
        (-Ry * CoreGain + Ty * F.SwirlRatio * 0.45) * S,
        -Rz * CoreGain * S,
      ];
    }
    case "AxisAttractor": {
      const RadIn = Rxy > 1e-5 ? -1.0 / Rxy : 0.0;
      return [
        (Dx * RadIn * 0.75 + Tx * F.SwirlRatio) * S,
        (Dy * RadIn * 0.75 + Ty * F.SwirlRatio) * S,
        0.18 * S,
      ];
    }
    case "Containment": {
      if (R3 <= F.CoreRadius) return [Tx * S * 0.12 * F.SwirlRatio, Ty * S * 0.12 * F.SwirlRatio, 0];
      const Wall = Math.min(1.5, (R3 - F.CoreRadius) / Math.max(0.15, F.Radius - F.CoreRadius));
      return [-Rx * S * Wall, -Ry * S * Wall, -Rz * S * Wall];
    }
    case "RotationalColumn": {
      const Rankine =
        Rxy < F.CoreRadius
          ? Rxy / Math.max(0.08, F.CoreRadius)
          : Math.max(0.08, F.CoreRadius) / Math.max(F.CoreRadius, Rxy);
      const Inflow = -0.22 * (Rxy > 1e-5 ? 1.0 : 0.0);
      return [
        (Tx * Rankine * F.SwirlRatio + (Rxy > 1e-5 ? (Dx / Rxy) * Inflow : 0)) * S,
        (Ty * Rankine * F.SwirlRatio + (Rxy > 1e-5 ? (Dy / Rxy) * Inflow : 0)) * S,
        0.28 * Rankine * S,
      ];
    }
    case "Torque": {
      return [Tx * S * F.SwirlRatio, Ty * S * F.SwirlRatio, 0.0];
    }
    case "Drag": {
      return [-DirX * S * 0.55, -DirY * S * 0.55, -Rz * S * 0.35];
    }
    case "CurlNoise": {
      const C = SampleCurlNoise3D(Dx, Dy, Dz, F.TurbulenceScale, F.Octaves, TimeSec);
      return [C[0] * S * 1.4, C[1] * S * 1.4, C[2] * S * 1.4];
    }
    case "AtmosphericGust": {
      const Wave = 0.65 + 0.35 * Math.sin((Dx * DirX + Dy * DirY) * 2.2 - TimeSec * TWO_PI * F.Frequency);
      const C = SampleCurlNoise3D(Dx, Dy, Dz, F.TurbulenceScale, F.Octaves, TimeSec);
      return [
        (DirX * Wave + C[0] * 0.42) * S,
        (DirY * Wave + C[1] * 0.42) * S,
        (DirZ * Wave + C[2] * 0.35) * S,
      ];
    }
    case "VorticityConfinement": {
      const C = SampleCurlNoise3D(Dx, Dy, Dz, F.TurbulenceScale, F.Octaves, TimeSec);
      return [(Tx * 0.65 + C[0]) * S, (Ty * 0.65 + C[1]) * S, C[2] * S];
    }
    case "BrownianNoise": {
      const J = PotentialFbmVec3(Dx / F.TurbulenceScale + TimeSec * 1.7, Dy / F.TurbulenceScale, Dz / F.TurbulenceScale - TimeSec * 1.3, F.Octaves);
      return [J[0] * S, J[1] * S, J[2] * S];
    }
    case "LorentzField": {
      return [
        (DirX * 0.35 + Tx * F.SwirlRatio) * S,
        (DirY * 0.35 + Ty * F.SwirlRatio) * S,
        0.42 * S,
      ];
    }
    case "MagneticDipole": {
      // m = (0, 0, 1) -> B ~ (3 z r_hat - z_hat) / r^3
      const MdotR = Rz;
      const Bx = 3.0 * MdotR * Rx;
      const By = 3.0 * MdotR * Ry;
      const Bz = 3.0 * MdotR * Rz - 1.0;
      const BNorm = Math.hypot(Bx, By, Bz) || 1.0;
      return [(Bx / BNorm) * S, (By / BNorm) * S, (Bz / BNorm) * S];
    }
    case "FlowStream": {
      constProj = Dx * DirX + Dy * DirY + Dz * DirZ;
      const LatX = Dx - constProj * DirX;
      const LatY = Dy - constProj * DirY;
      const LatZ = Dz - constProj * DirZ;
      return [
        (DirX - LatX * 0.32) * S,
        (DirY - LatY * 0.32) * S,
        (DirZ - LatZ * 0.32) * S,
      ];
    }
    case "SplineForce": {
      const CurveY = 0.55 * Math.sin((Dx / Math.max(0.5, F.Radius)) * Math.PI);
      const Slope = 0.55 * (Math.PI / Math.max(0.5, F.Radius)) * Math.cos((Dx / Math.max(0.5, F.Radius)) * Math.PI);
      const NormS = Math.hypot(1.0, Slope);
      return [
        (1.0 / NormS) * S,
        ((Slope / NormS) - (Dy - CurveY) * 0.45) * S,
        -Dz * 0.35 * S,
      ];
    }
    case "BoundaryAdhesion": {
      const HeightAboveFloor = Math.max(0.0, Pz);
      const Skin = Math.exp(-HeightAboveFloor / Math.max(0.25, F.CoreRadius * 1.4));
      return [DirX * S * (0.45 + 0.75 * Skin), DirY * S * (0.45 + 0.75 * Skin), -0.45 * S * Skin];
    }
    default:
      return [DirX * S, DirY * S, DirZ * S];
  }
}
let constProj = 0;

export function EvaluateSceneForceFieldAt(ForceNodes, Px, Py, Pz, TimeSec = 0) {
  let Vx = 0, Vy = 0, Vz = 0;
  for (const Node of ForceNodes) {
    if (!Node || Node.Hidden) continue;
    const V = EvaluateForceSourceAt(Node.Force, Node.Position, Node.Rotation, Px, Py, Pz, TimeSec);
    Vx += V[0];
    Vy += V[1];
    Vz += V[2];
  }
  return [Vx, Vy, Vz];
}

export function ClassifyBeaufortScale(SpeedMs) {
  const S = Math.abs(SpeedMs);
  if (S < 0.5) return { Number: 0, Label: "Calm" };
  if (S < 1.6) return { Number: 1, Label: "Light Air" };
  if (S < 3.4) return { Number: 2, Label: "Light Breeze" };
  if (S < 5.5) return { Number: 3, Label: "Gentle Breeze" };
  if (S < 8.0) return { Number: 4, Label: "Moderate Breeze" };
  if (S < 10.8) return { Number: 5, Label: "Fresh Breeze" };
  if (S < 13.9) return { Number: 6, Label: "Strong Breeze" };
  if (S < 17.2) return { Number: 7, Label: "Near Gale" };
  if (S < 20.8) return { Number: 8, Label: "Gale" };
  if (S < 24.5) return { Number: 9, Label: "Strong Gale" };
  if (S < 28.5) return { Number: 10, Label: "Storm" };
  if (S < 32.7) return { Number: 11, Label: "Violent Storm" };
  return { Number: 12, Label: "Hurricane" };
}

//------------------------------------------------------------------------------------------------------------------------
//                      GPU FORCEOVERLAY 12-FLOAT VERTEX BUILDER (WebGPU + WebGL2 + CpuGtx)
//------------------------------------------------------------------------------------------------------------------------

function HexToRgb01(Hex) {
  const Clean = String(Hex || "#4AA8FF").replace("#", "");
  const Num = parseInt(Clean.length === 3 ? Clean.split("").map((C) => C + C).join("") : Clean, 16) || 0x4aa8ff;
  return [((Num >> 16) & 255) / 255, ((Num >> 8) & 255) / 255, (Num & 255) / 255];
}

function SampleVelocityColorRamp(SpeedMs, RefMaxSpeed, RampMode, DomainRgb) {
  const T = Math.max(0.0, Math.min(1.0, SpeedMs / Math.max(1.0, RefMaxSpeed)));
  if (RampMode === "DomainTint") {
    return [
      DomainRgb[0] * (0.55 + 0.45 * T),
      DomainRgb[1] * (0.55 + 0.45 * T),
      DomainRgb[2] * (0.55 + 0.45 * T),
    ];
  }
  if (RampMode === "Viridis") {
    return [
      0.267 + T * (0.993 - 0.267),
      0.005 + Math.sin(T * Math.PI * 0.72) * 0.88,
      0.329 + (1.0 - T) * 0.35,
    ];
  }
  if (RampMode === "Turbo") {
    return [
      Math.min(1.0, Math.max(0.12, 1.5 * T - 0.15)),
      Math.sin(T * Math.PI) * 0.92 + 0.08,
      Math.min(1.0, Math.max(0.1, 1.25 * (1.0 - T))),
    ];
  }
  // Beaufort: cool cyan -> emerald -> amber -> coral
  if (T < 0.35) {
    const U = T / 0.35;
    return [0.22 + 0.08 * U, 0.68 + 0.22 * U, 0.96 - 0.28 * U];
  }
  if (T < 0.72) {
    const U = (T - 0.35) / 0.37;
    return [0.30 + 0.65 * U, 0.90 - 0.12 * U, 0.68 - 0.46 * U];
  }
  const U = (T - 0.72) / 0.28;
  return [0.95 + 0.05 * U, 0.78 - 0.46 * U, 0.22 - 0.08 * U];
}

function PushTri12(Buf, A, B, C, Normal, Rgba, ShadingWeight = 0.0) {
  const [R, G, Bl, Al] = Rgba;
  const [Nx, Ny, Nz] = Normal;
  Buf.push(
    A[0], A[1], A[2], Nx, Ny, Nz, R, G, Bl, Al, 0, ShadingWeight,
    B[0], B[1], B[2], Nx, Ny, Nz, R, G, Bl, Al, 0, ShadingWeight,
    C[0], C[1], C[2], Nx, Ny, Nz, R, G, Bl, Al, 0, ShadingWeight,
  );
}

function PushTubeSegment(Buf, P0, P1, Radius, Rgba, Sides = 4) {
  const Dx = P1[0] - P0[0], Dy = P1[1] - P0[1], Dz = P1[2] - P0[2];
  const L = Math.hypot(Dx, Dy, Dz);
  if (L < 1e-4) return;
  const Ax = Dx / L, Ay = Dy / L, Az = Dz / L;
  const Hx = Math.abs(Az) < 0.9 ? 0 : 1;
  const Hy = 0;
  const Hz = Math.abs(Az) < 0.9 ? 1 : 0;
  let Ux = Hy * Az - Hz * Ay;
  let Uy = Hz * Ax - Hx * Az;
  let Uz = Hx * Ay - Hy * Ax;
  const UL = Math.hypot(Ux, Uy, Uz) || 1;
  Ux /= UL; Uy /= UL; Uz /= UL;
  const Vx = Ay * Uz - Az * Uy;
  const Vy = Az * Ux - Ax * Uz;
  const Vz = Ax * Uy - Ay * Ux;

  for (let I = 0; I < Sides; ++I) {
    const A0 = (I / Sides) * TWO_PI;
    const A1 = ((I + 1) / Sides) * TWO_PI;
    const C0 = Math.cos(A0), S0 = Math.sin(A0);
    const C1 = Math.cos(A1), S1 = Math.sin(A1);
    const N0x = Ux * C0 + Vx * S0, N0y = Uy * C0 + Vy * S0, N0z = Uz * C0 + Vz * S0;
    const N1x = Ux * C1 + Vx * S1, N1y = Uy * C1 + Vy * S1, N1z = Uz * C1 + Vz * S1;
    const V00 = [P0[0] + N0x * Radius, P0[1] + N0y * Radius, P0[2] + N0z * Radius];
    const V01 = [P0[0] + N1x * Radius, P0[1] + N1y * Radius, P0[2] + N1z * Radius];
    const V10 = [P1[0] + N0x * Radius, P1[1] + N0y * Radius, P1[2] + N0z * Radius];
    const V11 = [P1[0] + N1x * Radius, P1[1] + N1y * Radius, P1[2] + N1z * Radius];
    PushTri12(Buf, V00, V10, V11, [N0x, N0y, N0z], Rgba, 0.18);
    PushTri12(Buf, V00, V11, V01, [N1x, N1y, N1z], Rgba, 0.18);
  }
}

function PushArrow3D(Buf, Origin, Dir, Length, ShaftRadius, Rgba) {
  const TipLen = Math.min(Length * 0.34, ShaftRadius * 5.2);
  const ShaftLen = Math.max(0.02, Length - TipLen);
  const Mid = [
    Origin[0] + Dir[0] * ShaftLen,
    Origin[1] + Dir[1] * ShaftLen,
    Origin[2] + Dir[2] * ShaftLen,
  ];
  const Tip = [
    Origin[0] + Dir[0] * Length,
    Origin[1] + Dir[1] * Length,
    Origin[2] + Dir[2] * Length,
  ];
  PushTubeSegment(Buf, Origin, Mid, ShaftRadius, Rgba, 4);

  // 4-sided arrowhead cone
  const Hx = Math.abs(Dir[2]) < 0.9 ? 0 : 1;
  const Hz = Math.abs(Dir[2]) < 0.9 ? 1 : 0;
  let Ux = -Hz * Dir[1], Uy = Hz * Dir[0] - Hx * Dir[2], Uz = Hx * Dir[1];
  const UL = Math.hypot(Ux, Uy, Uz) || 1;
  Ux /= UL; Uy /= UL; Uz /= UL;
  const Vx = Dir[1] * Uz - Dir[2] * Uy;
  const Vy = Dir[2] * Ux - Dir[0] * Uz;
  const Vz = Dir[0] * Uy - Dir[1] * Ux;
  const ConeR = ShaftRadius * 2.45;

  for (let I = 0; I < 4; ++I) {
    const A0 = (I / 4) * TWO_PI;
    const A1 = ((I + 1) / 4) * TWO_PI;
    const B0 = [
      Mid[0] + (Ux * Math.cos(A0) + Vx * Math.sin(A0)) * ConeR,
      Mid[1] + (Uy * Math.cos(A0) + Vy * Math.sin(A0)) * ConeR,
      Mid[2] + (Uz * Math.cos(A0) + Vz * Math.sin(A0)) * ConeR,
    ];
    const B1 = [
      Mid[0] + (Ux * Math.cos(A1) + Vx * Math.sin(A1)) * ConeR,
      Mid[1] + (Uy * Math.cos(A1) + Vy * Math.sin(A1)) * ConeR,
      Mid[2] + (Uz * Math.cos(A1) + Vz * Math.sin(A1)) * ConeR,
    ];
    PushTri12(Buf, B0, B1, Tip, Dir, Rgba, 0.25);
  }
}

function PushCircleRing(Buf, Center, UAxis, VAxis, Radius, TubeR, Rgba, Segments = 28, Dashed = false) {
  for (let I = 0; I < Segments; ++I) {
    if (Dashed && (I & 1) === 1) continue;
    const A0 = (I / Segments) * TWO_PI;
    const A1 = ((I + 1) / Segments) * TWO_PI;
    const P0 = [
      Center[0] + (UAxis[0] * Math.cos(A0) + VAxis[0] * Math.sin(A0)) * Radius,
      Center[1] + (UAxis[1] * Math.cos(A0) + VAxis[1] * Math.sin(A0)) * Radius,
      Center[2] + (UAxis[2] * Math.cos(A0) + VAxis[2] * Math.sin(A0)) * Radius,
    ];
    const P1 = [
      Center[0] + (UAxis[0] * Math.cos(A1) + VAxis[0] * Math.sin(A1)) * Radius,
      Center[1] + (UAxis[1] * Math.cos(A1) + VAxis[1] * Math.sin(A1)) * Radius,
      Center[2] + (UAxis[2] * Math.cos(A1) + VAxis[2] * Math.sin(A1)) * Radius,
    ];
    PushTubeSegment(Buf, P0, P1, TubeR, Rgba, 3);
  }
}

function PushOctahedronBeacon(Buf, Center, Radius, Rgba) {
  const [Cx, Cy, Cz] = Center;
  const Top = [Cx, Cy, Cz + Radius];
  const Bot = [Cx, Cy, Cz - Radius];
  const Pts = [
    [Cx + Radius, Cy, Cz],
    [Cx, Cy + Radius, Cz],
    [Cx - Radius, Cy, Cz],
    [Cx, Cy - Radius, Cz],
  ];
  for (let I = 0; I < 4; ++I) {
    const P0 = Pts[I];
    const P1 = Pts[(I + 1) % 4];
    PushTri12(Buf, P0, P1, Top, [0, 0, 1], Rgba, 0.35);
    PushTri12(Buf, P1, P0, Bot, [0, 0, -1], Rgba, 0.35);
  }
}

export function BuildForceOverlayGeometry(
  ForceNodes,
  OverlaySettings = DEFAULT_FORCE_OVERLAY,
  SelectedId = null,
  TimeSec = 0,
) {
  const Settings = { ...DEFAULT_FORCE_OVERLAY, ...(OverlaySettings || {}) };
  const OpaqueVerts = [];
  const TranslucentVerts = [];
  const PickBeacons = [];

  if (!Settings.Enabled || !Array.isArray(ForceNodes) || ForceNodes.length === 0) {
    return {
      OpaqueBuffer: new Float32Array(0),
      OpaqueVertexCount: 0,
      TranslucentBuffer: new Float32Array(0),
      TranslucentVertexCount: 0,
      PickBeacons,
    };
  }

  for (const Node of ForceNodes) {
    if (!Node || Node.Hidden) continue;
    const F = ResolveForceValues(Node.Force);
    const Meta = GetForceModelMeta(F.Model);
    const BaseCenter = Node.Position || [0, 0, 1.4];
    const Center = EvaluateMotionCenter(BaseCenter, F, TimeSec);
    const IsSelected = Node.Id === SelectedId;
    const DomainRgb = HexToRgb01(Meta.Color);

    const BeaconR = Math.max(0.085, Math.min(0.22, F.Radius * 0.065));
    PickBeacons.push({
      Id: Node.Id,
      Center,
      Radius: BeaconR * 1.9,
    });

    // 1. Central Force Beacon octahedron (opaque, bright highlight when selected)
    const BeaconColor = IsSelected
      ? [1.0, 0.78, 0.28, 1.0]
      : [DomainRgb[0], DomainRgb[1], DomainRgb[2], 1.0];
    PushOctahedronBeacon(OpaqueVerts, Center, BeaconR, BeaconColor);

    if (!F.Enabled) continue;

    // 2. Motion Path preview curve when dynamic motion is active
    if (Settings.ShowMotionPaths && F.MotionTopology !== "Static" && F.MotionAmplitude > 0.02) {
      const PathColor = [DomainRgb[0], DomainRgb[1], DomainRgb[2], IsSelected ? 0.65 : 0.35];
      const Segs = 28;
      for (let S = 0; S < Segs; ++S) {
        const T0 = (S / Segs) / Math.max(0.05, F.MotionSpeedHz);
        const T1 = ((S + 1) / Segs) / Math.max(0.05, F.MotionSpeedHz);
        const P0 = EvaluateMotionCenter(BaseCenter, F, T0);
        const P1 = EvaluateMotionCenter(BaseCenter, F, T1);
        PushTubeSegment(TranslucentVerts, P0, P1, 0.011, PathColor, 3);
      }
    }

    // 3. Outer Reach Envelope & Inner Core Radius Wireframe
    if (Settings.ShowEnvelopes && F.Reach !== "Infinite") {
      const EnvAlpha = IsSelected ? 0.68 : 0.34;
      const EnvColor = [DomainRgb[0], DomainRgb[1], DomainRgb[2], EnvAlpha];
      const CoreColor = [DomainRgb[0], DomainRgb[1], DomainRgb[2], EnvAlpha * 0.55];
      const WireR = IsSelected ? 0.014 : 0.0095;
      const R = F.Radius;

      if (F.Reach === "Column") {
        const HalfH = R * 1.15;
        PushCircleRing(TranslucentVerts, [Center[0], Center[1], Center[2] - HalfH], [1, 0, 0], [0, 1, 0], R, WireR, EnvColor, 28);
        PushCircleRing(TranslucentVerts, [Center[0], Center[1], Center[2] + HalfH], [1, 0, 0], [0, 1, 0], R, WireR, EnvColor, 28);
        PushCircleRing(TranslucentVerts, Center, [1, 0, 0], [0, 1, 0], Math.min(R * 0.92, F.CoreRadius), WireR * 0.85, CoreColor, 20, true);
        for (let K = 0; K < 4; ++K) {
          const Ang = (K * Math.PI) * 0.5;
          const Vx = Center[0] + Math.cos(Ang) * R;
          const Vy = Center[1] + Math.sin(Ang) * R;
          PushTubeSegment(TranslucentVerts, [Vx, Vy, Center[2] - HalfH], [Vx, Vy, Center[2] + HalfH], WireR, EnvColor, 3);
        }
      } else if (F.Reach === "Box") {
        const Corners = [
          [-R, -R, -R], [R, -R, -R], [R, R, -R], [-R, R, -R],
          [-R, -R, R],  [R, -R, R],  [R, R, R],  [-R, R, R],
        ].map((O) => [Center[0] + O[0], Center[1] + O[1], Center[2] + O[2]]);
        const Edges = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7],
        ];
        for (const [I0, I1] of Edges) {
          PushTubeSegment(TranslucentVerts, Corners[I0], Corners[I1], WireR, EnvColor, 3);
        }
      } else {
        PushCircleRing(TranslucentVerts, Center, [1, 0, 0], [0, 1, 0], R, WireR, EnvColor, 32);
        PushCircleRing(TranslucentVerts, Center, [1, 0, 0], [0, 0, 1], R, WireR, EnvColor, 32);
        PushCircleRing(TranslucentVerts, Center, [0, 1, 0], [0, 0, 1], R, WireR, EnvColor, 32);
        if (F.CoreRadius > 0.12 && F.CoreRadius < R * 0.95) {
          PushCircleRing(TranslucentVerts, Center, [1, 0, 0], [0, 1, 0], F.CoreRadius, WireR * 0.85, CoreColor, 20, true);
        }
      }
    }

    // 4. 3D Lattice Velocity Vector Arrows
    if (Settings.ShowVelocityArrows) {
      const N = Math.max(2, Math.min(5, Settings.ArrowDensity | 0));
      const Span = Math.min(F.Radius * 0.76, 6.0);
      const RefMax = Math.max(4.0, Math.abs(F.Strength));
      for (let Iz = 0; Iz < N; ++Iz) {
        for (let Iy = 0; Iy < N; ++Iy) {
          for (let Ix = 0; Ix < N; ++Ix) {
            const Ux = N === 1 ? 0 : (Ix / (N - 1)) * 2 - 1;
            const Uy = N === 1 ? 0 : (Iy / (N - 1)) * 2 - 1;
            const Uz = N === 1 ? 0 : (Iz / (N - 1)) * 2 - 1;
            if (Math.abs(Ux) < 0.15 && Math.abs(Uy) < 0.15 && Math.abs(Uz) < 0.15) continue;
            const Sx = Center[0] + Ux * Span;
            const Sy = Center[1] + Uy * Span;
            const Sz = Center[2] + Uz * Span;
            const Vec = EvaluateForceSourceAt(F, BaseCenter, Node.Rotation, Sx, Sy, Sz, TimeSec);
            const Spd = Math.hypot(Vec[0], Vec[1], Vec[2]);
            if (Spd < 0.15) continue;
            const Dir = [Vec[0] / Spd, Vec[1] / Spd, Vec[2] / Spd];
            const ArrowLen = Math.min(
              Span * 0.62,
              Math.max(0.14, (Spd / RefMax) * (Settings.VectorScale || 0.24) * 2.1),
            );
            const Rgb = SampleVelocityColorRamp(Spd, RefMax, Settings.ColorRamp, DomainRgb);
            PushArrow3D(OpaqueVerts, [Sx, Sy, Sz], Dir, ArrowLen, 0.0115, [Rgb[0], Rgb[1], Rgb[2], 1.0]);
          }
        }
      }
    }

    // 5. RK4 Advected Streamline Ribbons (when selected or ShowStreamlines enabled)
    if (Settings.ShowStreamlines && (IsSelected || ForceNodes.length <= 4)) {
      const SeedCount = IsSelected ? 8 : 4;
      const SeedR = Math.min(F.Radius * 0.58, 3.5);
      const RefMax = Math.max(4.0, Math.abs(F.Strength));
      const Dt = 0.045;
      for (let S = 0; S < SeedCount; ++S) {
        const Ang = (S / SeedCount) * TWO_PI + 0.35;
        let Px = Center[0] + Math.cos(Ang) * SeedR;
        let Py = Center[1] + Math.sin(Ang) * SeedR;
        let Pz = Center[2] + ((S % 2 === 0 ? -0.28 : 0.28) * SeedR);
        for (let Step = 0; Step < 14; ++Step) {
          const V1 = EvaluateForceSourceAt(F, BaseCenter, Node.Rotation, Px, Py, Pz, TimeSec);
          const Spd = Math.hypot(V1[0], V1[1], V1[2]);
          if (Spd < 0.2) break;
          const Inv = 1.0 / Math.max(2.0, Spd);
          const StepScale = Dt * Math.min(2.8, Spd * 0.22);
          const Mx = Px + V1[0] * Inv * StepScale * 0.5;
          const My = Py + V1[1] * Inv * StepScale * 0.5;
          const Mz = Pz + V1[2] * Inv * StepScale * 0.5;
          const V2 = EvaluateForceSourceAt(F, BaseCenter, Node.Rotation, Mx, My, Mz, TimeSec);
          const Spd2 = Math.hypot(V2[0], V2[1], V2[2]);
          if (Spd2 < 0.2) break;
          const Inv2 = 1.0 / Math.max(2.0, Spd2);
          const Nx = Px + V2[0] * Inv2 * StepScale;
          const Ny = Py + V2[1] * Inv2 * StepScale;
          const Nz = Pz + V2[2] * Inv2 * StepScale;
          if (EvaluateReachNormalizedDistance(Nx - Center[0], Ny - Center[1], Nz - Center[2], F.Radius, F.Reach) > 1.05) {
            break;
          }
          const Rgb = SampleVelocityColorRamp(Spd2, RefMax, Settings.ColorRamp, DomainRgb);
          PushTubeSegment(TranslucentVerts, [Px, Py, Pz], [Nx, Ny, Nz], 0.0075, [Rgb[0], Rgb[1], Rgb[2], 0.72], 3);
          Px = Nx; Py = Ny; Pz = Nz;
        }
      }
    }
  }

  return {
    OpaqueBuffer: new Float32Array(OpaqueVerts),
    OpaqueVertexCount: OpaqueVerts.length / 12,
    TranslucentBuffer: new Float32Array(TranslucentVerts),
    TranslucentVertexCount: TranslucentVerts.length / 12,
    PickBeacons,
  };
}

export function PickForceBeacon(RayOrigin, RayDir, ForceOverlay) {
  if (!ForceOverlay || !Array.isArray(ForceOverlay.PickBeacons)) return null;
  let BestT = Infinity;
  let BestId = null;
  for (const B of ForceOverlay.PickBeacons) {
    const Ox = RayOrigin[0] - B.Center[0];
    const Oy = RayOrigin[1] - B.Center[1];
    const Oz = RayOrigin[2] - B.Center[2];
    const Proj = Ox * RayDir[0] + Oy * RayDir[1] + Oz * RayDir[2];
    const C = Ox * Ox + Oy * Oy + Oz * Oz - B.Radius * B.Radius;
    const Disc = Proj * Proj - C;
    if (Disc < 0) continue;
    const T = -Proj - Math.sqrt(Disc);
    if (T > 0.02 && T < BestT) {
      BestT = T;
      BestId = B.Id;
    }
  }
  return BestId ? { Id: BestId, Distance: BestT } : null;
}

//------------------------------------------------------------------------------------------------------------------------
//                      SPACECONTAINER (.FORCEMODEL / .VECTORFIELDSPACE) TOML CODEC
//------------------------------------------------------------------------------------------------------------------------

export function SerializeForceModelToml(SubjectName, ForceValues, Transform = {}) {
  const F = ResolveForceValues(ForceValues);
  const Meta = GetForceModelMeta(F.Model);
  const Pos = Transform.Position || [0, 0, 1.4];
  const Rot = Transform.Rotation || [0, 0, 0];
  const Esc = (S) => String(S || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const Lines = [
    "# Frontier SpaceContainer (.ForceModel / .VectorFieldSpace)",
    "[SpaceContainer]",
    'MagicSignature = "FRSP1"',
    `ContainerExtension = "${F.FormulaEnabled ? ".VectorFieldSpace" : ".ForceModel"}"`,
    `SubFormat = "${F.FormulaEnabled ? "VectorField" : "ForceModel"}"`,
    "SchemaVersion = 1",
    "",
    "[ForceSource]",
    `Title = "${Esc(SubjectName || Meta.Name)}"`,
    `Model = "${F.Model}"`,
    `ModelOrdinal = ${Meta.Ordinal}`,
    `Domain = "${Meta.Domain}"`,
    `Enabled = ${F.Enabled ? "true" : "false"}`,
    `Strength = ${F.Strength.toFixed(3)}`,
    `RadiusMeters = ${F.Radius.toFixed(3)}`,
    `CoreRadiusMeters = ${F.CoreRadius.toFixed(3)}`,
    `FalloffExponent = ${F.FalloffExponent.toFixed(3)}`,
    `Attenuation = "${F.Attenuation}"`,
    `ReachEnvelope = "${F.Reach}"`,
    `DurationMode = "${F.Duration}"`,
    `SwirlRatio = ${F.SwirlRatio.toFixed(3)}`,
    `TurbulenceScaleMeters = ${F.TurbulenceScale.toFixed(3)}`,
    `OctaveCount = ${F.Octaves}`,
    `FrequencyHertz = ${F.Frequency.toFixed(3)}`,
    `YawDegrees = ${F.YawDeg.toFixed(1)}`,
    `PitchDegrees = ${F.PitchDeg.toFixed(1)}`,
    `CentreMeters = [${Pos[0].toFixed(3)}, ${Pos[1].toFixed(3)}, ${Pos[2].toFixed(3)}]`,
    `EulerDegrees = [${Rot[0].toFixed(1)}, ${Rot[1].toFixed(1)}, ${Rot[2].toFixed(1)}]`,
    `MotionTopology = "${F.MotionTopology}"`,
    `MotionAmplitudeMeters = ${F.MotionAmplitude.toFixed(3)}`,
    `MotionSpeedHertz = ${F.MotionSpeedHz.toFixed(3)}`,
    `FormulaEnabled = ${F.FormulaEnabled ? "true" : "false"}`,
    `FormulaSource = "${Esc(F.FormulaCode).replace(/\n/g, "\\n")}"`,
    "",
  ];
  return Lines.join("\n");
}

export function ParseForceModelToml(TomlText, FallbackName = "Imported Force") {
  const Text = String(TomlText || "");
  const ReadStr = (Key, Def = "") => {
    const M = Text.match(new RegExp(`${Key}\\s*=\\s*"([^"]*)"`, "i"));
    return M ? M[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : Def;
  };
  const ReadNum = (Key, Def) => {
    const M = Text.match(new RegExp(`${Key}\\s*=\\s*([-+]?[0-9]*\\.?[0-9]+)`, "i"));
    return M ? Number(M[1]) : Def;
  };
  const ReadBool = (Key, Def) => {
    const M = Text.match(new RegExp(`${Key}\\s*=\\s*(true|false)`, "i"));
    return M ? M[1].toLowerCase() === "true" : Def;
  };
  const ReadVec3 = (Key, Def) => {
    const M = Text.match(new RegExp(`${Key}\\s*=\\s*\\[([^\\]]+)\\]`, "i"));
    if (!M) return Def;
    const Parts = M[1].split(",").map((S) => Number(S.trim()));
    return Parts.length >= 3 && Parts.every(Number.isFinite) ? Parts.slice(0, 3) : Def;
  };

  const Title = ReadStr("Title", FallbackName);
  const Model = GetForceModelMeta(ReadStr("Model", "LinearWind")).Id;
  const Force = ResolveForceValues({
    Model,
    Enabled: ReadBool("Enabled", true),
    Strength: ReadNum("Strength", undefined),
    Radius: ReadNum("RadiusMeters", undefined),
    CoreRadius: ReadNum("CoreRadiusMeters", undefined),
    FalloffExponent: ReadNum("FalloffExponent", 1.35),
    Attenuation: ReadStr("Attenuation", "SmoothStep"),
    Reach: ReadStr("ReachEnvelope", undefined),
    Duration: ReadStr("DurationMode", "Continuous"),
    SwirlRatio: ReadNum("SwirlRatio", undefined),
    TurbulenceScale: ReadNum("TurbulenceScaleMeters", undefined),
    Octaves: ReadNum("OctaveCount", undefined),
    Frequency: ReadNum("FrequencyHertz", undefined),
    YawDeg: ReadNum("YawDegrees", 25),
    PitchDeg: ReadNum("PitchDegrees", 0),
    MotionTopology: ReadStr("MotionTopology", "Static"),
    MotionAmplitude: ReadNum("MotionAmplitudeMeters", 1.15),
    MotionSpeedHz: ReadNum("MotionSpeedHertz", 0.22),
    FormulaEnabled: ReadBool("FormulaEnabled", false),
    FormulaCode: ReadStr("FormulaSource", DEFAULT_FORMULA_CODE),
  });
  const Position = ReadVec3("CentreMeters", [0, 0, 1.4]);
  const Rotation = ReadVec3("EulerDegrees", [0, 0, 0]);
  return { Name: Title, Force, Position, Rotation };
}
