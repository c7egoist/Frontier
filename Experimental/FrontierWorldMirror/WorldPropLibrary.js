//==========================================================================================================================================
// FILE: WorldPropLibrary.js
// PURPOSE: Procedural Multi-Part 3D Cameras, Studio Lights, and Track/Workshop Props ported from eosclient0001-rgb/Props into
//          Frontier Z-Up meters (+X Right, +Y Forward, +Z Up), with Individual Per-Face Colour & Pattern support (FaceColors).
//==========================================================================================================================================

import { ResolveMaterial } from "./MaterialSpecification.js";

export const FACE_KEYS = ["-X", "+X", "-Y", "+Y", "-Z", "+Z"];
export const FACE_LABELS = {
  "-Y": "Front (−Y)",
  "+Y": "Back (+Y)",
  "-X": "Left (−X)",
  "+X": "Right (+X)",
  "+Z": "Top (+Z)",
  "-Z": "Bottom (−Z)",
};

export function HasActiveFaceColors(FaceColors) {
  if (!FaceColors || typeof FaceColors !== "object") return false;
  if (FaceColors.Enabled === false) return false;
  for (const Key of FACE_KEYS) {
    if (FaceColors[Key] !== undefined && FaceColors[Key] !== null) return true;
  }
  if (FaceColors.Side !== undefined) return true;
  return false;
}

export function NormalizeFaceSpec(FaceColors, FaceIdx, FallbackHex = "#c8c6c2", FallbackRough = 0.45, FallbackMetal = 0.0) {
  const Key = FACE_KEYS[FaceIdx] || "-Y";
  const Raw =
    FaceColors?.[Key] ??
    (FaceIdx <= 3 && FaceColors?.Side !== undefined ? FaceColors.Side : undefined);
  if (!Raw) {
    return {
      Fill: FallbackHex,
      Roughness: FallbackRough,
      Metallic: FallbackMetal,
      Emission: 0,
      Pattern: null,
      Accent: "#ffffff",
    };
  }
  if (typeof Raw === "string") {
    return {
      Fill: Raw,
      Roughness: FallbackRough,
      Metallic: FallbackMetal,
      Emission: 0,
      Pattern: null,
      Accent: "#ffffff",
    };
  }
  return {
    Fill: Raw.Fill || FallbackHex,
    Roughness: Raw.Roughness ?? FallbackRough,
    Metallic: Raw.Metallic ?? FallbackMetal,
    Emission: Raw.Emission ?? 0,
    Pattern: Raw.Pattern || null,
    Accent: Raw.Accent || "#f5f7fa",
  };
}

// Helper material constructor matching Frontier MaterialSpecification
function Mat(Fill, Roughness = 0.42, Metallic = 0.0, Extra = {}) {
  const Type = Extra.Type || (Metallic > 0.65 ? "Metal" : "Standard");
  const Channels = {
    colour: { Source: "Fill", Fill },
    roughness: { Source: "Fill", Fill: Roughness },
    metallic: { Source: "Fill", Fill: Metallic },
  };
  if (Extra.Coat !== undefined) {
    Channels.coat = { Source: "Fill", Fill: Extra.Coat };
    Channels.coatRoughness = { Source: "Fill", Fill: Extra.CoatRoughness ?? 0.08 };
  }
  if (Extra.Emission !== undefined) {
    Channels.emission = { Source: "Fill", Fill: Extra.Emission };
  }
  if (Extra.Transmission !== undefined) {
    Channels.transmission = { Source: "Fill", Fill: Extra.Transmission };
    Channels.ior = { Source: "Fill", Fill: Extra.Ior ?? 1.52 };
  }
  if (Extra.GradientStops) {
    Channels.colour = {
      Source: "Gradient",
      Axis: Extra.GradientAxis || "V",
      Fill,
      Stops: Extra.GradientStops,
    };
  }
  return {
    Material: {
      Name: Extra.Name || "Prop Material",
      Type,
      Channels,
    },
  };
}

const PAL = {
  matteSlate: Mat("#1f242c", 0.56, 0.25),
  anodizedBlack: Mat("#17191e", 0.36, 0.78),
  gunmetal: Mat("#3b424d", 0.30, 0.86),
  chrome: Mat("#dce3ec", 0.10, 0.96),
  galvanized: Mat("#9aa3ad", 0.34, 0.82),
  carbon: Mat("#20242b", 0.28, 0.42, { Type: "Clear coat", Coat: 0.72, CoatRoughness: 0.09 }),
  rubberDark: Mat("#191b1f", 0.86, 0.02),
  tireBlack: Mat("#1c1e22", 0.80, 0.04),
  copper: Mat("#c87538", 0.24, 0.92),
  fiaRed: Mat("#dc2626", 0.32, 0.08, { Type: "Clear coat", Coat: 0.55, CoatRoughness: 0.1 }),
  fiaBlue: Mat("#1d4ed8", 0.32, 0.12, { Type: "Clear coat", Coat: 0.55, CoatRoughness: 0.1 }),
  safetyOrange: Mat("#ff5500", 0.38, 0.02),
  safetyYellow: Mat("#eab308", 0.36, 0.06),
  limeAutocross: Mat("#84cc16", 0.36, 0.02),
  skyBlueArri: Mat("#2563eb", 0.34, 0.45),
  concrete: Mat("#9ca3af", 0.84, 0.0),
  whiteCoat: Mat("#f3f4f6", 0.34, 0.04),
  lensGlass: Mat("#38bdf8", 0.04, 0.15, { Type: "Clear coat", Coat: 1.0, CoatRoughness: 0.02 }),
  warmGlow: Mat("#fff4d6", 0.18, 0.0, { Type: "Unlit", Emission: 4.8 }),
  coolGlow: Mat("#e0f2fe", 0.18, 0.0, { Type: "Unlit", Emission: 5.2 }),
  amberBeacon: Mat("#f59e0b", 0.16, 0.0, { Type: "Unlit", Emission: 4.5 }),
  tallyGreen: Mat("#22c55e", 0.15, 0.0, { Type: "Unlit", Emission: 4.0 }),
  tallyRed: Mat("#ef4444", 0.15, 0.0, { Type: "Unlit", Emission: 4.2 }),
};

// 3x3 rotation matrix helpers matching Shader Euler convention: R = Rz * Ry * Rx
export function EulerDegToMat3(RotDeg = [0, 0, 0]) {
  const Rx = ((Number(RotDeg[0]) || 0) * Math.PI) / 180;
  const Ry = ((Number(RotDeg[1]) || 0) * Math.PI) / 180;
  const Rz = ((Number(RotDeg[2]) || 0) * Math.PI) / 180;
  const Cx = Math.cos(Rx), Sx = Math.sin(Rx);
  const Cy = Math.cos(Ry), Sy = Math.sin(Ry);
  const Cz = Math.cos(Rz), Sz = Math.sin(Rz);
  // Column 0 (+X), Column 1 (+Y), Column 2 (+Z)
  return [
    [Cz * Cy, Sz * Cy, -Sy],
    [Cz * Sy * Sx - Sz * Cx, Sz * Sy * Sx + Cz * Cx, Cy * Sx],
    [Cz * Sy * Cx + Sz * Sx, Sz * Sy * Cx - Cz * Sx, Cy * Cx],
  ];
}

export function MulMat3(A, B) {
  // Column-major 3x3: C_col[j] = A * B_col[j]
  const Out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let Col = 0; Col < 3; ++Col) {
    const Bx = B[Col][0], By = B[Col][1], Bz = B[Col][2];
    Out[Col][0] = A[0][0] * Bx + A[1][0] * By + A[2][0] * Bz;
    Out[Col][1] = A[0][1] * Bx + A[1][1] * By + A[2][1] * Bz;
    Out[Col][2] = A[0][2] * Bx + A[1][2] * By + A[2][2] * Bz;
  }
  return Out;
}

export function Mat3ToEulerRad(M) {
  // Extract Rx, Ry, Rz from R = Rz * Ry * Rx where M[0][2] = -sin(Ry)
  const Sy = Math.max(-1, Math.min(1, -M[0][2]));
  const Ry = Math.asin(Sy);
  const Cy = Math.cos(Ry);
  let Rx = 0, Rz = 0;
  if (Math.abs(Cy) > 1e-4) {
    Rx = Math.atan2(M[1][2], M[2][2]);
    Rz = Math.atan2(M[0][1], M[0][0]);
  } else {
    Rx = Math.atan2(-M[2][1], M[1][1]);
    Rz = 0;
  }
  return [Rx, Ry, Rz];
}

export function TransformVec3ByMat3(M, V) {
  return [
    M[0][0] * V[0] + M[1][0] * V[1] + M[2][0] * V[2],
    M[0][1] * V[0] + M[1][1] * V[1] + M[2][1] * V[2],
    M[0][2] * V[0] + M[1][2] * V[1] + M[2][2] * V[2],
  ];
}

function Part(Shape, Pos, HalfExtents, RotDeg, MaterialRec, FaceColors = null, Extra = {}) {
  return {
    Shape, // 0=box, 1=sphere, 2=cylinder, 3=cone, 4=torus, 5=cylinder-cone
    LocalOffset: Pos,
    HalfExtents,
    LocalRotDeg: RotDeg || [0, 0, 0],
    MaterialRec,
    FaceColors,
    CastShadows: Extra.CastShadows ?? true,
    GiContributor: Extra.GiContributor ?? true,
  };
}

// Helper: build a strut cylinder from P0 to P1 with radius R
function StrutPart(P0, P1, Radius, MaterialRec) {
  const Mid = [(P0[0] + P1[0]) * 0.5, (P0[1] + P1[1]) * 0.5, (P0[2] + P1[2]) * 0.5];
  const Dx = P1[0] - P0[0], Dy = P1[1] - P0[1], Dz = P1[2] - P0[2];
  const Len = Math.max(1e-4, Math.hypot(Dx, Dy, Dz));
  const Uz = [Dx / Len, Dy / Len, Dz / Len];
  const Ref = Math.abs(Uz[2]) < 0.92 ? [0, 0, 1] : [1, 0, 0];
  let Ux = [
    Ref[1] * Uz[2] - Ref[2] * Uz[1],
    Ref[2] * Uz[0] - Ref[0] * Uz[2],
    Ref[0] * Uz[1] - Ref[1] * Uz[0],
  ];
  const Lx = Math.max(1e-5, Math.hypot(...Ux));
  Ux = [Ux[0] / Lx, Ux[1] / Lx, Ux[2] / Lx];
  const Uy = [
    Uz[1] * Ux[2] - Uz[2] * Ux[1],
    Uz[2] * Ux[0] - Uz[0] * Ux[2],
    Uz[0] * Ux[1] - Uz[1] * Ux[0],
  ];
  const Rad = Mat3ToEulerRad([Ux, Uy, Uz]);
  return Part(
    2,
    Mid,
    [Radius, Radius, Len * 0.5],
    Rad.map((R) => (R * 180) / Math.PI),
    MaterialRec,
  );
}

// Common 3-leg broadcast/studio tripod base spanning Z = [-HalfH .. TopZ]
function BuildTripodLegs(BottomZ, TopZ, SpreadRadius, LegMat = PAL.carbon, ClampMat = PAL.fiaRed) {
  const Parts = [];
  for (let I = 0; I < 3; ++I) {
    const Ang = (I * 2 * Math.PI) / 3 + Math.PI / 6;
    const Foot = [Math.cos(Ang) * SpreadRadius, Math.sin(Ang) * SpreadRadius, BottomZ + 0.02];
    const Crown = [Math.cos(Ang) * 0.055, Math.sin(Ang) * 0.055, TopZ];
    Parts.push(StrutPart(Foot, Crown, 0.018, LegMat));
    // Rubber foot pad + anodized mid-lock collar
    Parts.push(Part(2, [Foot[0], Foot[1], BottomZ + 0.015], [0.036, 0.036, 0.014], [0, 0, 0], PAL.rubberDark));
    const Mid = [(Foot[0] + Crown[0]) * 0.52, (Foot[1] + Crown[1]) * 0.52, (Foot[2] + Crown[2]) * 0.52];
    Parts.push(Part(1, Mid, [0.026, 0.026, 0.022], [0, 0, 0], ClampMat));
  }
  // Center column + spreader spider
  Parts.push(Part(2, [0, 0, (BottomZ + TopZ) * 0.55], [0.022, 0.022, (TopZ - BottomZ) * 0.36], [0, 0, 0], PAL.anodizedBlack));
  Parts.push(Part(2, [0, 0, TopZ + 0.025], [0.075, 0.075, 0.028], [0, 0, 0], PAL.gunmetal));
  return Parts;
}

//==========================================================================================================================================
// CATALOG OF CAMERAS, STUDIO LIGHTS, AND PROPS (eosclient0001-rgb/Props + Frontier Engine/Editor Cameras)
//   Note: Local coordinates are centered so Z ∈ [-HalfHeightZ, +HalfHeightZ], placing bottom flush at Z_world - HalfHeightZ!
//==========================================================================================================================================
export const WORLD_PROP_CATALOG = [
  // ===================================================== CAMERAS =====================================================
  {
    PropId: "editor_camera",
    Name: "Editor Camera Rig",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.22,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 35,
    Description: "Placeable Frontier Editor viewport camera rig · optical lens + tally + OLED telemetry face",
    BuildParts: () => [
      // Sleek compact cinema/viewport body with OLED operator face (-X) & green live tally (+Z)
      Part(0, [0, 0.02, -0.02], [0.11, 0.16, 0.10], [0, 0, 0], PAL.matteSlate, {
        "-X": { Fill: "#0f172a", Roughness: 0.14, Metallic: 0.2, Emission: 1.6, Pattern: "oled_telemetry", Accent: "#38bdf8" },
        "+X": { Fill: "#262c36", Roughness: 0.42, Metallic: 0.55 },
        "+Y": { Fill: "#1e293b", Roughness: 0.38, Metallic: 0.45 },
        "-Y": { Fill: "#111318", Roughness: 0.3, Metallic: 0.7 },
        "+Z": { Fill: "#1f242d", Roughness: 0.45, Metallic: 0.35 },
        "-Z": { Fill: "#15181e", Roughness: 0.55, Metallic: 0.5 },
      }),
      // Prime cinema lens barrel pointing along -Y (towards subject/viewer by default) + multi-coated front glass
      Part(2, [0, -0.20, -0.02], [0.078, 0.078, 0.09], [90, 0, 0], PAL.anodizedBlack, {
        Side: { Fill: "#181b22", Roughness: 0.28, Metallic: 0.82, Pattern: "stripes", Accent: "#dc2626" },
        "+Z": { Fill: "#0ea5e9", Roughness: 0.05, Metallic: 0.35, Emission: 0.45 },
        "-Z": { Fill: "#0ea5e9", Roughness: 0.05, Metallic: 0.35, Emission: 0.45 },
      }),
      // Wide matte box hood + top cheeseplate handle + green active viewport tally
      Part(0, [0, -0.30, -0.02], [0.125, 0.032, 0.095], [0, 0, 0], PAL.rubberDark),
      Part(0, [0, 0.02, 0.135], [0.024, 0.12, 0.022], [0, 0, 0], PAL.gunmetal),
      Part(0, [0, -0.25, 0.092], [0.035, 0.012, 0.012], [0, 0, 0], PAL.tallyGreen),
      Part(0, [0, 0.20, -0.01], [0.082, 0.038, 0.085], [0, 0, 0], PAL.gunmetal),
    ],
  },
  {
    PropId: "engine_camera",
    Name: "Engine Camera",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.28,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 28,
    Description: "Frontier runtime game/cinematic Engine Camera · dual top CineMag reels, matte box & red tally",
    BuildParts: () => [
      // Anodized gunmetal body with FIA red accents & operator telemetry panel
      Part(0, [0, 0.03, -0.05], [0.12, 0.18, 0.11], [0, 0, 0], PAL.gunmetal, {
        "-X": { Fill: "#111827", Roughness: 0.16, Metallic: 0.25, Emission: 1.8, Pattern: "oled_telemetry", Accent: "#f97316" },
        "+X": { Fill: "#dc2626", Roughness: 0.28, Metallic: 0.35 },
        "+Y": { Fill: "#1f2937", Roughness: 0.35, Metallic: 0.7 },
        "-Y": { Fill: "#0f172a", Roughness: 0.25, Metallic: 0.8 },
        "+Z": { Fill: "#334155", Roughness: 0.35, Metallic: 0.75 },
        "-Z": { Fill: "#1e293b", Roughness: 0.5, Metallic: 0.6 },
      }),
      // Dual top cinema coaxial magazines (classic iconic game-engine camera silhouette!)
      Part(2, [0, -0.04, 0.155], [0.095, 0.095, 0.038], [0, 90, 0], PAL.anodizedBlack, {
        Side: { Fill: "#1f242c", Roughness: 0.32, Metallic: 0.8 },
        "+Z": { Fill: "#94a3b8", Roughness: 0.22, Metallic: 0.9 },
        "-Z": { Fill: "#94a3b8", Roughness: 0.22, Metallic: 0.9 },
      }),
      Part(2, [0, 0.15, 0.155], [0.095, 0.095, 0.038], [0, 90, 0], PAL.anodizedBlack, {
        Side: { Fill: "#1f242c", Roughness: 0.32, Metallic: 0.8 },
        "+Z": { Fill: "#94a3b8", Roughness: 0.22, Metallic: 0.9 },
        "-Z": { Fill: "#94a3b8", Roughness: 0.22, Metallic: 0.9 },
      }),
      // Telephoto anamorphic lens + matte box + red on-air tally
      Part(2, [0, -0.23, -0.05], [0.082, 0.082, 0.10], [90, 0, 0], PAL.anodizedBlack),
      Part(0, [0, -0.35, -0.05], [0.14, 0.036, 0.105], [0, 0, 0], PAL.carbon),
      Part(0, [0, -0.35, 0.072], [0.042, 0.014, 0.014], [0, 0, 0], PAL.tallyRed),
      // Base dovetail rail
      Part(0, [0, -0.04, -0.19], [0.075, 0.24, 0.025], [0, 0, 0], PAL.chrome),
    ],
  },
  {
    PropId: "cinema_camera",
    Name: "Tripod Broadcast Camera",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.82,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 50,
    Description: "Broadcast cinema camera on 3-leg carbon spreader tripod with fluid head, matte box & V-mount battery",
    BuildParts: () => [
      ...BuildTripodLegs(-0.82, 0.36, 0.44, PAL.carbon, PAL.fiaRed),
      // Fluid head + pan bar
      Part(0, [0, 0, 0.44], [0.085, 0.11, 0.055], [0, 0, 0], PAL.anodizedBlack),
      StrutPart([0.07, 0.06, 0.44], [0.22, 0.34, 0.26], 0.012, PAL.chrome),
      // Camera body + OLED side + V-mount battery + telephoto lens + matte box + top monitor
      Part(0, [0, -0.01, 0.58], [0.095, 0.16, 0.095], [0, 0, 0], PAL.matteSlate, {
        "-X": { Fill: "#0f172a", Roughness: 0.15, Metallic: 0.2, Emission: 1.5, Pattern: "oled_telemetry", Accent: "#22d3ee" },
        "+X": { Fill: "#27272a", Roughness: 0.4, Metallic: 0.6 },
        "+Y": { Fill: "#18181b", Roughness: 0.4, Metallic: 0.5 },
        "-Y": { Fill: "#09090b", Roughness: 0.3, Metallic: 0.8 },
        "+Z": { Fill: "#27272a", Roughness: 0.45, Metallic: 0.5 },
        "-Z": { Fill: "#18181b", Roughness: 0.5, Metallic: 0.6 },
      }),
      Part(0, [0, 0.18, 0.58], [0.075, 0.042, 0.085], [0, 0, 0], PAL.gunmetal),
      Part(2, [0, -0.24, 0.57], [0.068, 0.068, 0.09], [90, 0, 0], PAL.anodizedBlack),
      Part(0, [0, -0.35, 0.57], [0.125, 0.032, 0.092], [0, 0, 0], PAL.rubberDark),
      Part(0, [0, -0.02, 0.75], [0.085, 0.016, 0.052], [-18, 0, 0], PAL.anodizedBlack, {
        "-Y": { Fill: "#0ea5e9", Roughness: 0.1, Metallic: 0.1, Emission: 1.9, Pattern: "oled_telemetry", Accent: "#fde047" },
      }),
    ],
  },
  {
    PropId: "gimbal_camera",
    Name: "3-Axis Ring Gimbal Camera",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.36,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 24,
    Description: "Handheld carbon-fiber 3-axis motorized ring stabilizer with cinema camera & wireless field monitor",
    BuildParts: () => [
      // Kickstand feet
      StrutPart([-0.18, 0.10, -0.35], [-0.06, 0, -0.26], 0.014, PAL.rubberDark),
      StrutPart([0.18, 0.10, -0.35], [0.06, 0, -0.26], 0.014, PAL.rubberDark),
      // Outer carbon ring (torus rotated upright in XZ plane!)
      Part(4, [0, 0, 0.0], [0.30, 0.30, 0.024], [90, 0, 0], PAL.carbon),
      // Foam side grips + brushless copper gimbal motors
      Part(2, [-0.29, 0, 0.0], [0.028, 0.028, 0.09], [0, 0, 0], PAL.fiaRed),
      Part(2, [0.29, 0, 0.0], [0.028, 0.028, 0.09], [0, 0, 0], PAL.fiaRed),
      Part(2, [0, 0, 0.28], [0.036, 0.036, 0.022], [0, 0, 0], PAL.copper),
      // Stabilized cinema payload + wide prime lens + top field monitor
      Part(0, [0, 0.02, -0.02], [0.075, 0.09, 0.068], [0, 0, 0], PAL.anodizedBlack),
      Part(2, [0, -0.11, -0.02], [0.048, 0.048, 0.055], [90, 0, 0], PAL.gunmetal),
      Part(0, [0, -0.17, -0.02], [0.082, 0.022, 0.062], [0, 0, 0], PAL.rubberDark),
      Part(0, [0, -0.03, 0.33], [0.09, 0.014, 0.054], [-15, 0, 0], PAL.anodizedBlack, {
        "-Y": { Fill: "#0284c7", Roughness: 0.12, Emission: 2.0, Pattern: "oled_telemetry", Accent: "#4ade80" },
      }),
    ],
  },
  {
    PropId: "highspeed_phantom_cam",
    Name: "1000 FPS High-Speed Camera",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.28,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 85,
    Description: "Proving-ground 1000 fps high-speed camera on low-boy CNC spider with CineMag SSD & twin IR strobes",
    BuildParts: () => [
      // 3-arm CNC spider base
      Part(2, [0, 0, -0.22], [0.11, 0.11, 0.032], [0, 0, 0], PAL.anodizedBlack),
      Part(0, [-0.14, -0.10, -0.255], [0.09, 0.032, 0.018], [0, 0, 32], PAL.gunmetal),
      Part(0, [0.14, -0.10, -0.255], [0.09, 0.032, 0.018], [0, 0, -32], PAL.gunmetal),
      Part(0, [0, 0.16, -0.255], [0.032, 0.09, 0.018], [0, 0, 0], PAL.gunmetal),
      // Rugged Phantom body + red CineMag flash module + long telephoto lens + twin IR strobe rings
      Part(0, [0, 0.03, -0.02], [0.10, 0.17, 0.105], [0, 0, 0], PAL.matteSlate),
      Part(0, [0, 0.05, 0.11], [0.084, 0.12, 0.03], [0, 0, 0], PAL.fiaRed),
      Part(2, [0, -0.23, -0.02], [0.064, 0.064, 0.105], [90, 0, 0], PAL.anodizedBlack),
      Part(2, [-0.115, -0.18, 0.05], [0.032, 0.032, 0.025], [90, 0, 0], PAL.coolGlow),
      Part(2, [0.115, -0.18, 0.05], [0.032, 0.032, 0.025], [90, 0, 0], PAL.coolGlow),
    ],
  },
  {
    PropId: "eng_camera_case",
    Name: "ENG Shoulder Camera & Case",
    Category: "Cameras",
    Panel: "camera",
    Icon: "camera",
    HalfHeightZ: 0.34,
    NominalScale: [1, 1, 1],
    DefaultFocalMm: 32,
    Description: "Broadcast ENG shoulder camera perched atop a ribbed safety-orange Pelican flight case",
    BuildParts: () => [
      // Safety-orange Pelican case plinth
      Part(0, [0, 0, -0.17], [0.29, 0.21, 0.165], [0, 0, 0], PAL.safetyOrange, {
        "-Y": { Fill: "#ea580c", Roughness: 0.42, Pattern: "stripes", Accent: "#18181b" },
        "+Y": { Fill: "#ea580c", Roughness: 0.42 },
        "-X": { Fill: "#c2410c", Roughness: 0.48 },
        "+X": { Fill: "#c2410c", Roughness: 0.48 },
        "+Z": { Fill: "#f97316", Roughness: 0.38 },
        "-Z": { Fill: "#18181b", Roughness: 0.8 },
      }),
      // ENG camera body + servo B4 zoom lens + shotgun mic
      Part(0, [0, 0.03, 0.12], [0.08, 0.17, 0.105], [0, 0, 8], PAL.matteSlate),
      Part(2, [0.02, -0.21, 0.11], [0.052, 0.052, 0.10], [90, 0, 8], PAL.anodizedBlack),
      Part(2, [0.06, -0.16, 0.25], [0.016, 0.016, 0.12], [90, 0, 8], PAL.rubberDark),
    ],
  },

  // ================================================= STUDIO & STAGE LIGHTS =================================================
  {
    PropId: "led_panel_stand",
    Name: "Bi-Color Studio LED Panel",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 0.90,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.12, 0.58],
      Width: 0.68,
      Height: 0.46,
      Radiance: [8.8, 7.8, 6.2],
      ColorHex: "#fff3d6",
      Lumens: 3200,
    },
    Description: "1x1 Bi-Color LED studio panel on chrome C-stand with 4 barndoors & live LTC area light emission",
    BuildParts: () => [
      ...BuildTripodLegs(-0.90, 0.22, 0.40, PAL.chrome, PAL.anodizedBlack),
      Part(2, [0, 0, 0.38], [0.018, 0.018, 0.20], [0, 0, 0], PAL.chrome),
      // Yoke + 1x1 LED panel housing with glowing bi-color LED front (-Y) and blue DMX rear (+Y)
      Part(0, [0, 0, 0.58], [0.34, 0.042, 0.23], [0, 0, 0], PAL.anodizedBlack, {
        "-Y": { Fill: "#fff4d2", Roughness: 0.12, Metallic: 0.0, Emission: 6.2, Pattern: "led_grid", Accent: "#fef08a" },
        "+Y": { Fill: "#1e293b", Roughness: 0.36, Metallic: 0.65, Pattern: "oled_telemetry", Accent: "#38bdf8" },
        "-X": { Fill: "#18181b", Roughness: 0.35, Metallic: 0.78 },
        "+X": { Fill: "#18181b", Roughness: 0.35, Metallic: 0.78 },
        "+Z": { Fill: "#2563eb", Roughness: 0.32, Metallic: 0.55 },
        "-Z": { Fill: "#18181b", Roughness: 0.4, Metallic: 0.75 },
      }),
      // Top & bottom angled barndoors + rear V-mount battery
      Part(0, [0, -0.11, 0.83], [0.34, 0.08, 0.012], [32, 0, 0], PAL.matteSlate),
      Part(0, [0, -0.11, 0.33], [0.34, 0.08, 0.012], [-32, 0, 0], PAL.matteSlate),
      Part(0, [-0.38, -0.10, 0.58], [0.012, 0.08, 0.22], [0, 0, -28], PAL.matteSlate),
      Part(0, [0.38, -0.10, 0.58], [0.012, 0.08, 0.22], [0, 0, 28], PAL.matteSlate),
      Part(0, [0.10, 0.075, 0.55], [0.06, 0.032, 0.085], [0, 0, 0], PAL.gunmetal),
    ],
  },
  {
    PropId: "softbox_cinema_light",
    Name: "Octagon Softbox Studio Light",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 0.95,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.22, 0.56],
      Width: 0.85,
      Height: 0.85,
      Radiance: [9.4, 8.9, 8.2],
      ColorHex: "#fff9ed",
      Lumens: 3800,
    },
    Description: "Parabolic key-light softbox dome on studio stand with COB lamp head & glowing front silk diffuser",
    BuildParts: () => [
      ...BuildTripodLegs(-0.95, 0.25, 0.44, PAL.anodizedBlack, PAL.safetyYellow),
      Part(2, [0, 0, 0.42], [0.020, 0.020, 0.20], [0, 0, 0], PAL.chrome),
      // Rear COB lamp head + parabolic softbox frustum with glowing front diffuser cap
      Part(2, [0, 0.14, 0.58], [0.095, 0.095, 0.12], [90, 0, 0], PAL.gunmetal),
      Part(5, [0, -0.08, 0.58], [0.42, 0.42, 0.18], [-90, 0, 0], PAL.rubberDark, {
        Side: { Fill: "#18191e", Roughness: 0.82, Metallic: 0.05 },
        "+Z": { Fill: "#fffaf0", Roughness: 0.18, Metallic: 0.0, Emission: 5.8 },
        "-Z": { Fill: "#27272a", Roughness: 0.6, Metallic: 0.4 },
      }),
    ],
  },
  {
    PropId: "floodlight_tower",
    Name: "4-Bank Stadium Floodlight Tower",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 1.25,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.10, 1.02],
      Width: 1.15,
      Height: 0.55,
      Radiance: [11.5, 11.2, 10.6],
      ColorHex: "#f8fafc",
      Lumens: 5200,
    },
    Description: "Mobile safety-yellow paddock generator mast with 4 high-output stadium LED flood pods",
    BuildParts: () => [
      // Wheeled yellow generator base + black outriggers
      Part(0, [0, 0, -1.04], [0.34, 0.44, 0.17], [0, 0, 0], PAL.safetyYellow, {
        "-X": { Fill: "#eab308", Roughness: 0.36, Pattern: "chevrons", Accent: "#18181b" },
        "+X": { Fill: "#eab308", Roughness: 0.36, Pattern: "chevrons", Accent: "#18181b" },
        "-Y": { Fill: "#facc15", Roughness: 0.34 },
        "+Y": { Fill: "#ca8a04", Roughness: 0.42 },
        "+Z": { Fill: "#eab308", Roughness: 0.38 },
        "-Z": { Fill: "#18181b", Roughness: 0.8 },
      }),
      Part(2, [-0.36, 0.22, -1.16], [0.09, 0.09, 0.04], [0, 90, 0], PAL.tireBlack),
      Part(2, [0.36, 0.22, -1.16], [0.09, 0.09, 0.04], [0, 90, 0], PAL.tireBlack),
      // Telescoping galvanized mast + crossarm + amber safety strobe
      Part(2, [0, 0, -0.02], [0.042, 0.042, 0.92], [0, 0, 0], PAL.galvanized),
      Part(0, [0, 0, 0.94], [0.56, 0.04, 0.035], [0, 0, 0], PAL.gunmetal),
      Part(2, [0, 0, 1.20], [0.042, 0.042, 0.05], [0, 0, 0], PAL.amberBeacon),
      // 4 angled floodlight LED heads
      ...[-0.40, -0.14, 0.14, 0.40].map((X) =>
        Part(0, [X, -0.05, 1.05], [0.11, 0.055, 0.085], [16, 0, 0], PAL.anodizedBlack, {
          "-Y": { Fill: "#f0f9ff", Roughness: 0.10, Emission: 7.2, Pattern: "led_grid", Accent: "#bae6fd" },
        }),
      ),
    ],
  },
  {
    PropId: "sky_panel_truss_bar",
    Name: "Twin SkyPanel Truss Light",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 1.02,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.08, 0.78],
      Width: 1.25,
      Height: 0.42,
      Radiance: [8.5, 9.6, 11.2],
      ColorHex: "#e0f2fe",
      Lumens: 4400,
    },
    Description: "Heavy T-bar truss stand carrying twin wide ARRI-style RGBWW SkyPanel cinema soft lights",
    BuildParts: () => [
      Part(0, [0, 0, -0.98], [0.42, 0.42, 0.035], [0, 0, 0], PAL.anodizedBlack),
      Part(2, [0, 0, -0.06], [0.032, 0.032, 0.88], [0, 0, 0], PAL.chrome),
      Part(0, [0, 0, 0.86], [0.68, 0.035, 0.035], [0, 0, 0], PAL.chrome),
      ...[-0.36, 0.36].map((X) =>
        Part(0, [X, -0.04, 0.72], [0.27, 0.06, 0.14], [14, 0, 0], PAL.skyBlueArri, {
          "-Y": { Fill: "#e0f2fe", Roughness: 0.14, Emission: 6.5 },
          "+Y": { Fill: "#1d4ed8", Roughness: 0.32, Metallic: 0.5 },
          "+Z": { Fill: "#2563eb", Roughness: 0.32, Metallic: 0.5 },
          "-Z": { Fill: "#1e3a8a", Roughness: 0.4, Metallic: 0.5 },
        }),
      ),
    ],
  },
  {
    PropId: "pit_worklight_tripod",
    Name: "Twin Paddock LED Worklight",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 0.86,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.06, 0.68],
      Width: 0.62,
      Height: 0.30,
      Radiance: [8.4, 7.6, 5.8],
      ColorHex: "#fef3c7",
      Lumens: 2800,
    },
    Description: "Safety-yellow mechanic tripod with twin IP65 die-cast COB floodlight heads",
    BuildParts: () => [
      ...BuildTripodLegs(-0.86, 0.20, 0.38, PAL.safetyYellow, PAL.anodizedBlack),
      Part(2, [0, 0, 0.38], [0.02, 0.02, 0.24], [0, 0, 0], PAL.safetyYellow),
      Part(0, [0, 0, 0.62], [0.30, 0.025, 0.022], [0, 0, 0], PAL.safetyYellow),
      ...[-0.18, 0.18].map((X) =>
        Part(0, [X, -0.03, 0.72], [0.12, 0.042, 0.09], [10, 0, 0], PAL.safetyYellow, {
          "-Y": { Fill: "#fef08a", Roughness: 0.12, Emission: 6.8, Pattern: "led_grid", Accent: "#ffffff" },
          "+Y": { Fill: "#18181b", Roughness: 0.5, Metallic: 0.6 },
        }),
      ),
    ],
  },
  {
    PropId: "cine_tube_stand",
    Name: "Quad RGB Pixel Tube Stand",
    Category: "Studio Lights",
    Panel: "light",
    Icon: "editor-area-light",
    HalfHeightZ: 0.88,
    NominalScale: [1, 1, 1],
    LightEmitter: {
      Offset: [0, -0.05, 0.25],
      Width: 0.48,
      Height: 0.95,
      Radiance: [6.5, 8.8, 10.5],
      ColorHex: "#67e8f9",
      Lumens: 2600,
    },
    Description: "4-bank vertical RGBWW pixel LED cinema tubes on low-profile C-stand",
    BuildParts: () => [
      ...BuildTripodLegs(-0.88, -0.38, 0.34, PAL.anodizedBlack, PAL.chrome),
      Part(2, [0, 0, -0.05], [0.018, 0.018, 0.36], [0, 0, 0], PAL.chrome),
      Part(0, [0, 0.02, 0.24], [0.22, 0.022, 0.028], [0, 0, 0], PAL.gunmetal),
      ...[
        [-0.15, "#38bdf8"],
        [-0.05, "#f8fafc"],
        [0.05, "#fbbf24"],
        [0.15, "#f43f5e"],
      ].map(([X, Hex]) =>
        Part(2, [X, -0.02, 0.26], [0.022, 0.022, 0.56], [0, 0, 0], Mat(Hex, 0.14, 0.0, { Type: "Unlit", Emission: 5.5 })),
      ),
    ],
  },

  // ============================================ TRACK, CONES & WORKSHOP PROPS ============================================
  {
    PropId: "apex_cone",
    Name: "FIA Apex Marker Cone",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cone",
    HalfHeightZ: 0.45,
    NominalScale: [1, 1, 1],
    Description: "Tall 90cm FIA fluorescent orange apex marker pylon with twin retro-reflective collars & rubber base",
    BuildParts: () => [
      Part(
        3,
        [0, 0, 0],
        [0.24, 0.24, 0.45],
        [0, 0, 0],
        Mat("#ff5500", 0.38, 0.0, {
          GradientAxis: "V",
          GradientStops: [
            { Id: "b0", Position: 0.0, Value: "#1d1f24" },
            { Id: "b1", Position: 0.13, Value: "#1d1f24" },
            { Id: "o1", Position: 0.15, Value: "#ff5500" },
            { Id: "o2", Position: 0.44, Value: "#ff5500" },
            { Id: "w1", Position: 0.46, Value: "#f8fafc" },
            { Id: "w2", Position: 0.58, Value: "#f8fafc" },
            { Id: "o3", Position: 0.60, Value: "#ff5500" },
            { Id: "o4", Position: 0.72, Value: "#ff5500" },
            { Id: "w3", Position: 0.74, Value: "#f8fafc" },
            { Id: "w4", Position: 0.86, Value: "#f8fafc" },
            { Id: "o5", Position: 0.88, Value: "#ff5500" },
          ],
        }),
      ),
    ],
  },
  {
    PropId: "slalom_cone",
    Name: "Autocross Slalom Cone",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cone",
    HalfHeightZ: 0.24,
    NominalScale: [1, 1, 1],
    Description: "45cm high-visibility chartreuse-lime autocross slalom cone with weighted black plinth",
    BuildParts: () => [
      Part(
        3,
        [0, 0, 0],
        [0.18, 0.18, 0.24],
        [0, 0, 0],
        Mat("#84cc16", 0.36, 0.0, {
          GradientAxis: "V",
          GradientStops: [
            { Id: "b0", Position: 0.0, Value: "#18181b" },
            { Id: "b1", Position: 0.16, Value: "#18181b" },
            { Id: "g1", Position: 0.18, Value: "#84cc16" },
            { Id: "g2", Position: 0.62, Value: "#84cc16" },
            { Id: "w1", Position: 0.64, Value: "#f8fafc" },
            { Id: "w2", Position: 0.80, Value: "#f8fafc" },
            { Id: "g3", Position: 0.82, Value: "#84cc16" },
          ],
        }),
      ),
    ],
  },
  {
    PropId: "bollard_cone",
    Name: "FIA Chicane Bollard Post",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cylinder",
    HalfHeightZ: 0.50,
    NominalScale: [1, 1, 1],
    Description: "100cm flexible FIA red/white striped pit-entry delineator bollard with bolted rubber flange",
    BuildParts: () => [
      Part(
        5,
        [0, 0, 0],
        [0.19, 0.19, 0.50],
        [0, 0, 0],
        Mat("#dc2626", 0.34, 0.0, {
          GradientAxis: "V",
          GradientStops: [
            { Id: "b0", Position: 0.0, Value: "#18191e" },
            { Id: "b1", Position: 0.11, Value: "#18191e" },
            { Id: "r1", Position: 0.13, Value: "#dc2626" },
            { Id: "r2", Position: 0.36, Value: "#dc2626" },
            { Id: "w1", Position: 0.38, Value: "#f8fafc" },
            { Id: "w2", Position: 0.56, Value: "#f8fafc" },
            { Id: "r3", Position: 0.58, Value: "#dc2626" },
            { Id: "r4", Position: 0.74, Value: "#dc2626" },
            { Id: "w3", Position: 0.76, Value: "#f8fafc" },
            { Id: "w4", Position: 0.90, Value: "#f8fafc" },
            { Id: "r5", Position: 0.92, Value: "#dc2626" },
          ],
        }),
      ),
    ],
  },
  {
    PropId: "foldable_cone",
    Name: "LED Beacon Safety Cone",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cone",
    HalfHeightZ: 0.36,
    NominalScale: [1, 1, 1],
    Description: "Emergency paddock safety cone topped with a glowing amber LED strobe beacon",
    BuildParts: () => [
      Part(
        3,
        [0, 0, -0.04],
        [0.21, 0.21, 0.32],
        [0, 0, 0],
        Mat("#ff5500", 0.40, 0.0, {
          GradientAxis: "V",
          GradientStops: [
            { Id: "b0", Position: 0.0, Value: "#1f232a" },
            { Id: "b1", Position: 0.15, Value: "#1f232a" },
            { Id: "o1", Position: 0.17, Value: "#ff5500" },
            { Id: "o2", Position: 0.55, Value: "#ff5500" },
            { Id: "w1", Position: 0.57, Value: "#f8fafc" },
            { Id: "w2", Position: 0.78, Value: "#f8fafc" },
            { Id: "o3", Position: 0.80, Value: "#ff5500" },
          ],
        }),
      ),
      Part(2, [0, 0, 0.315], [0.038, 0.038, 0.042], [0, 0, 0], PAL.amberBeacon),
    ],
  },
  {
    PropId: "tire_stack",
    Name: "FIA Tire Barrier Stack",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cylinder",
    HalfHeightZ: 0.44,
    NominalScale: [1, 1, 1],
    Description: "3-high staggered motorsport slick tire stack with sidewall markings & FIA red ratchet strap",
    BuildParts: () => [
      Part(2, [0, 0, -0.29], [0.35, 0.35, 0.145], [0, 0, 0], PAL.tireBlack, {
        Side: { Fill: "#1c1e22", Roughness: 0.82, Pattern: "stripes", Accent: "#272a30" },
        "+Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#ef4444" },
        "-Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#ef4444" },
      }),
      Part(2, [0.025, -0.015, 0.0], [0.35, 0.35, 0.145], [0, 0, 24], PAL.tireBlack, {
        Side: { Fill: "#1c1e22", Roughness: 0.82, Pattern: "stripes", Accent: "#272a30" },
        "+Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#facc15" },
        "-Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#facc15" },
      }),
      Part(2, [-0.015, 0.02, 0.29], [0.35, 0.35, 0.145], [0, 0, -18], PAL.tireBlack, {
        Side: { Fill: "#1c1e22", Roughness: 0.82, Pattern: "stripes", Accent: "#272a30" },
        "+Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#ef4444" },
        "-Z": { Fill: "#181a1f", Roughness: 0.72, Pattern: "tire_sidewall", Accent: "#ef4444" },
      }),
      // Vertical tie-down strap
      Part(0, [0, -0.355, 0.0], [0.032, 0.012, 0.43], [0, 0, 0], PAL.fiaRed),
      Part(0, [0, 0.355, 0.0], [0.032, 0.012, 0.43], [0, 0, 0], PAL.fiaRed),
    ],
  },
  {
    PropId: "jersey_barrier",
    Name: "Chicane Jersey Barrier",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cube",
    HalfHeightZ: 0.44,
    NominalScale: [1, 1, 1],
    Description: "Interlocking F-profile concrete track barrier with FIA red/white chevron faces",
    BuildParts: () => [
      // Wide lower concrete foot
      Part(0, [0, 0, -0.30], [0.92, 0.28, 0.14], [0, 0, 0], PAL.concrete),
      // Upper tapered wall with individual per-face red/white hazard chevrons on Front & Back!
      Part(0, [0, 0, 0.10], [0.92, 0.15, 0.30], [0, 0, 0], PAL.concrete, {
        "-Y": { Fill: "#f8fafc", Roughness: 0.55, Pattern: "chevrons", Accent: "#dc2626" },
        "+Y": { Fill: "#f8fafc", Roughness: 0.55, Pattern: "chevrons", Accent: "#dc2626" },
        "-X": { Fill: "#9ca3af", Roughness: 0.85 },
        "+X": { Fill: "#9ca3af", Roughness: 0.85 },
        "+Z": { Fill: "#d1d5db", Roughness: 0.78 },
        "-Z": { Fill: "#6b7280", Roughness: 0.88 },
      }),
      // Steel interlock pins
      Part(2, [-0.95, 0, 0.05], [0.03, 0.03, 0.12], [0, 0, 0], PAL.galvanized),
      Part(2, [0.95, 0, 0.05], [0.03, 0.03, 0.12], [0, 0, 0], PAL.galvanized),
    ],
  },
  {
    PropId: "tecpro_block",
    Name: "Tecpro Impact Barrier Block",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cube",
    HalfHeightZ: 0.48,
    NominalScale: [1, 1, 1],
    Description: "High-speed FIA red polyethylene energy-absorbing Tecpro crash block with white waist band",
    BuildParts: () => [
      Part(0, [0, 0, -0.30], [0.72, 0.34, 0.18], [0, 0, 0], PAL.fiaRed),
      Part(0, [0, 0, 0.0], [0.69, 0.31, 0.13], [0, 0, 0], PAL.whiteCoat),
      Part(0, [0, 0, 0.30], [0.72, 0.34, 0.18], [0, 0, 0], PAL.fiaRed),
      Part(0, [0, 0, 0.0], [0.735, 0.355, 0.035], [0, 0, 0], PAL.rubberDark),
    ],
  },
  {
    PropId: "rumble_curb",
    Name: "Apex Rumble Kerb Strip",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cube",
    HalfHeightZ: 0.07,
    NominalScale: [1, 1, 1],
    Description: "FIA red & white alternating serrated motorsport cornering kerb strip",
    BuildParts: () => [
      Part(0, [0, 0, 0], [0.98, 0.34, 0.07], [5, 0, 0], PAL.fiaRed, {
        "+Z": { Fill: "#f8fafc", Roughness: 0.62, Pattern: "stripes", Accent: "#dc2626" },
        "-Y": { Fill: "#f8fafc", Roughness: 0.62, Pattern: "stripes", Accent: "#dc2626" },
        "+Y": { Fill: "#9ca3af", Roughness: 0.85 },
        "-X": { Fill: "#dc2626", Roughness: 0.65 },
        "+X": { Fill: "#f8fafc", Roughness: 0.65 },
        "-Z": { Fill: "#4b5563", Roughness: 0.9 },
      }),
    ],
  },
  {
    PropId: "pit_board",
    Name: "Brake Distance 100m Board",
    Category: "Track & Cones",
    Panel: "geometry",
    Icon: "editor-cube",
    HalfHeightZ: 0.56,
    NominalScale: [1, 1, 1],
    Description: "Trackside A-frame 100m brake marker board with high-contrast face graphic & sandbag ballast",
    BuildParts: () => [
      // Galvanized A-frame legs + bottom ballast bar
      StrutPart([-0.38, -0.22, -0.55], [-0.36, -0.02, 0.48], 0.018, PAL.galvanized),
      StrutPart([0.38, -0.22, -0.55], [0.36, -0.02, 0.48], 0.018, PAL.galvanized),
      StrutPart([-0.38, 0.24, -0.55], [-0.36, -0.02, 0.48], 0.018, PAL.galvanized),
      StrutPart([0.38, 0.24, -0.55], [0.36, -0.02, 0.48], 0.018, PAL.galvanized),
      Part(0, [0, 0.16, -0.50], [0.34, 0.09, 0.055], [0, 0, 0], PAL.safetyOrange),
      // 100m Marker Signboard with per-face graphic on Front (-Y) and dark metal back (+Y)
      Part(0, [0, -0.08, 0.12], [0.42, 0.022, 0.32], [-10, 0, 0], PAL.whiteCoat, {
        "-Y": { Fill: "#f8fafc", Roughness: 0.28, Pattern: "brake_100m", Accent: "#dc2626" },
        "+Y": { Fill: "#334155", Roughness: 0.48, Metallic: 0.65 },
        "-X": { Fill: "#dc2626", Roughness: 0.35 },
        "+X": { Fill: "#dc2626", Roughness: 0.35 },
        "+Z": { Fill: "#dc2626", Roughness: 0.35 },
        "-Z": { Fill: "#1e293b", Roughness: 0.5 },
      }),
    ],
  },
  {
    PropId: "sand_barrel",
    Name: "Crash Attenuator Sand Barrel",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cylinder",
    HalfHeightZ: 0.46,
    NominalScale: [1, 1, 1],
    Description: "Pit-entry safety-yellow impact attenuator drum with black/yellow chevron hazard band",
    BuildParts: () => [
      Part(2, [0, 0, -0.03], [0.34, 0.34, 0.43], [0, 0, 0], PAL.safetyYellow, {
        Side: { Fill: "#facc15", Roughness: 0.42, Pattern: "chevrons", Accent: "#18181b" },
        "+Z": { Fill: "#18181b", Roughness: 0.72 },
        "-Z": { Fill: "#ca8a04", Roughness: 0.65 },
      }),
      Part(2, [0, 0, 0.42], [0.355, 0.355, 0.038], [0, 0, 0], PAL.rubberDark),
    ],
  },
  {
    PropId: "toolbox_chest",
    Name: "Paddock Rolling Tool Chest",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cube",
    HalfHeightZ: 0.48,
    NominalScale: [1, 1, 1],
    Description: "FIA red 6-drawer mechanic rolling cabinet with chrome drawer pulls, rubber workmat & casters",
    BuildParts: () => [
      // 4 casters
      Part(2, [-0.36, -0.18, -0.42], [0.055, 0.055, 0.03], [0, 90, 0], PAL.rubberDark),
      Part(2, [0.36, -0.18, -0.42], [0.055, 0.055, 0.03], [0, 90, 0], PAL.rubberDark),
      Part(2, [-0.36, 0.18, -0.42], [0.055, 0.055, 0.03], [0, 90, 0], PAL.rubberDark),
      Part(2, [0.36, 0.18, -0.42], [0.055, 0.055, 0.03], [0, 90, 0], PAL.rubberDark),
      // Red steel cabinet with chrome-pull 6-drawer front (-Y) and dark anti-slip top mat (+Z)
      Part(0, [0, 0, 0.04], [0.44, 0.25, 0.41], [0, 0, 0], PAL.fiaRed, {
        "-Y": { Fill: "#dc2626", Roughness: 0.28, Metallic: 0.32, Pattern: "drawer_front", Accent: "#e2e8f0" },
        "+Y": { Fill: "#b91c1c", Roughness: 0.34, Metallic: 0.35 },
        "-X": { Fill: "#dc2626", Roughness: 0.30, Metallic: 0.32 },
        "+X": { Fill: "#dc2626", Roughness: 0.30, Metallic: 0.32 },
        "+Z": { Fill: "#18181b", Roughness: 0.85, Metallic: 0.05 },
        "-Z": { Fill: "#1f2937", Roughness: 0.6, Metallic: 0.5 },
      }),
      // Chrome side push handle
      Part(2, [0.48, 0, 0.34], [0.014, 0.014, 0.19], [90, 0, 0], PAL.chrome),
    ],
  },
  {
    PropId: "fuel_drum",
    Name: "200L Racing Fuel Drum",
    Category: "Barriers & Paddock",
    Panel: "geometry",
    Icon: "editor-cylinder",
    HalfHeightZ: 0.45,
    NominalScale: [1, 1, 1],
    Description: "200-liter steel motorsport race fuel drum in blue/white/red livery with rolling hoops & bung caps",
    BuildParts: () => [
      Part(
        2,
        [0, 0, 0],
        [0.29, 0.29, 0.44],
        [0, 0, 0],
        Mat("#1d4ed8", 0.28, 0.65, {
          GradientAxis: "V",
          GradientStops: [
            { Id: "b0", Position: 0.0, Value: "#1e3a8a" },
            { Id: "b1", Position: 0.30, Value: "#1d4ed8" },
            { Id: "w1", Position: 0.32, Value: "#f8fafc" },
            { Id: "w2", Position: 0.66, Value: "#f8fafc" },
            { Id: "r1", Position: 0.68, Value: "#dc2626" },
            { Id: "r2", Position: 1.0, Value: "#b91c1c" },
          ],
        }),
      ),
      Part(4, [0, 0, -0.14], [0.298, 0.298, 0.016], [0, 0, 0], PAL.chrome),
      Part(4, [0, 0, 0.14], [0.298, 0.298, 0.016], [0, 0, 0], PAL.chrome),
      Part(2, [0.14, 0.06, 0.45], [0.032, 0.032, 0.015], [0, 0, 0], PAL.chrome),
    ],
  },
];

export function GetWorldPropById(PropId) {
  if (!PropId) return null;
  return WORLD_PROP_CATALOG.find((Item) => Item.PropId === PropId) || null;
}

// Expand a World Prop into world-space analytical primitives sharing OwnerId = Row.Id
export function ExpandPropPrimitives(Row, Rec = {}, PickCode = 1) {
  const Def = GetWorldPropById(Row?.PropId || Rec?.PropId);
  if (!Def) return [];

  const ActorPos = Array.isArray(Rec.Position)
    ? [Number(Rec.Position[0]) || 0, Number(Rec.Position[1]) || 0, Number(Rec.Position[2]) || 0]
    : [0, 0.4, 0];
  const ActorRotDeg = Array.isArray(Rec.Rotation)
    ? [Number(Rec.Rotation[0]) || 0, Number(Rec.Rotation[1]) || 0, Number(Rec.Rotation[2]) || 0]
    : [0, 0, 0];
  const RawScale = Array.isArray(Rec.Scale) ? Rec.Scale : Def.NominalScale || [1, 1, 1];
  const BaseNom = Def.NominalScale || [1, 1, 1];
  const Sx = Math.max(0.08, Math.abs(Number(RawScale[0]) || 1) / Math.max(1e-4, BaseNom[0]));
  const Sy = Math.max(0.08, Math.abs(Number(RawScale[1]) || 1) / Math.max(1e-4, BaseNom[1]));
  const Sz = Math.max(0.08, Math.abs(Number(RawScale[2]) || 1) / Math.max(1e-4, BaseNom[2]));
  const UniformS = (Sx + Sy + Sz) / 3;

  const MActor = EulerDegToMat3(ActorRotDeg);
  const RawParts = Def.BuildParts(Rec);
  const UserFaceOverride = HasActiveFaceColors(Rec.FaceColors) ? Rec.FaceColors : null;
  const UserCustomMat = Rec.Material ? ResolveMaterial(Rec) : null;

  const Out = [];
  for (let I = 0; I < RawParts.length; ++I) {
    const P = RawParts[I];
    const ScaledOffset = [
      P.LocalOffset[0] * Sx,
      P.LocalOffset[1] * Sy,
      P.LocalOffset[2] * Sz,
    ];
    const WorldOff = TransformVec3ByMat3(MActor, ScaledOffset);
    const Center = [
      ActorPos[0] + WorldOff[0],
      ActorPos[1] + WorldOff[1],
      ActorPos[2] + WorldOff[2],
    ];
    const MLocal = EulerDegToMat3(P.LocalRotDeg);
    const MWorld = MulMat3(MActor, MLocal);
    const RotationRad = Mat3ToEulerRad(MWorld);

    const HalfExtents =
      P.Shape === 1 || P.Shape === 4
        ? [
            Math.max(0.008, P.HalfExtents[0] * UniformS),
            Math.max(0.008, P.HalfExtents[1] * UniformS),
            Math.max(0.008, P.HalfExtents[2] * UniformS),
          ]
        : [
            Math.max(0.008, P.HalfExtents[0] * Sx),
            Math.max(0.008, P.HalfExtents[1] * Sy),
            Math.max(0.008, P.HalfExtents[2] * Sz),
          ];

    const ResolvedMat =
      I === 0 && UserCustomMat ? UserCustomMat : ResolveMaterial(P.MaterialRec);
    const Ch = ResolvedMat.Channels;
    const FaceColors = I === 0 && UserFaceOverride ? UserFaceOverride : P.FaceColors;
    const UseFaceAtlas = HasActiveFaceColors(FaceColors);
    const Metallic = Math.max(0, Math.min(1, Number(Ch.metallic?.Fill ?? 0)));
    const Roughness = Math.max(0.02, Math.min(1, Number(Ch.roughness?.Fill ?? 0.38)));
    const Emission = Math.max(0, Number(Ch.emission?.Fill ?? 0));

    Out.push({
      Id: `${Row.Id}__part_${I}`,
      OwnerId: Row.Id,
      PickCode,
      Name: `${Row.Name} (${I + 1})`,
      Shape: P.Shape,
      Center,
      RotationRad,
      HalfExtents,
      CastShadows: (Rec["Cast shadows"] ?? P.CastShadows) ? 1 : 0,
      GiContributor: (Rec.GI ?? P.GiContributor) ? 1 : 0,
      GlassShell: false,
      FaceAtlas: UseFaceAtlas,
      FaceColors: UseFaceAtlas ? FaceColors : null,
      ResolvedMaterial: ResolvedMat,
      MaterialType: ResolvedMat.Type,
      BaseColor: [0.65, 0.65, 0.65],
      Metallic,
      Roughness,
      DiffuseRoughness: Roughness * 0.85,
      Anisotropy: 0,
      CoatWeight: Number(Ch.coat?.Fill ?? 0),
      CoatRoughness: Number(Ch.coatRoughness?.Fill ?? 0.08),
      Opacity: 1,
      Displacement: 0,
      Transmission: 0,
      Ior: 1.5,
      Emission,
      EdgeTintF82: [1, 1, 1],
      Abbe: 0,
      Attenuation: [1, 1, 1],
    });
  }
  return Out;
}

// Compute tight world-space AABB for any compiled primitive array
export function ComputePrimitivesTightBounds(Primitives) {
  let MinX = Infinity, MinY = Infinity, MinZ = Infinity;
  let MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
  for (const P of Primitives) {
    const [Rx, Ry, Rz] = P.RotationRad || [0, 0, 0];
    const Cx = Math.cos(Rx), Sx = Math.sin(Rx);
    const Cy = Math.cos(Ry), Sy = Math.sin(Ry);
    const Cz = Math.cos(Rz), Sz = Math.sin(Rz);
    const M00 = Cz * Cy, M01 = Cz * Sy * Sx - Sz * Cx, M02 = Cz * Sy * Cx + Sz * Sx;
    const M10 = Sz * Cy, M11 = Sz * Sy * Sx + Cz * Cx, M12 = Sz * Sy * Cx - Cz * Sx;
    const M20 = -Sy,     M21 = Cy * Sx,                M22 = Cy * Cx;
    const Hx = P.HalfExtents[0], Hy = P.HalfExtents[1], Hz = P.HalfExtents[2];
    const Ex = Math.abs(M00) * Hx + Math.abs(M01) * Hy + Math.abs(M02) * Hz;
    const Ey = Math.abs(M10) * Hx + Math.abs(M11) * Hy + Math.abs(M12) * Hz;
    const Ez = Math.abs(M20) * Hx + Math.abs(M21) * Hy + Math.abs(M22) * Hz;
    MinX = Math.min(MinX, P.Center[0] - Ex);
    MaxX = Math.max(MaxX, P.Center[0] + Ex);
    MinY = Math.min(MinY, P.Center[1] - Ey);
    MaxY = Math.max(MaxY, P.Center[1] + Ey);
    MinZ = Math.min(MinZ, P.Center[2] - Ez);
    MaxZ = Math.max(MaxZ, P.Center[2] + Ez);
  }
  if (!Number.isFinite(MinX)) {
    return {
      Min: [-0.5, -0.5, -0.5],
      Max: [0.5, 0.5, 0.5],
      Center: [0, 0, 0],
      Size: [1, 1, 1],
      Radius: 0.866,
    };
  }
  const Center = [(MinX + MaxX) * 0.5, (MinY + MaxY) * 0.5, (MinZ + MaxZ) * 0.5];
  const Size = [Math.max(0.02, MaxX - MinX), Math.max(0.02, MaxY - MinY), Math.max(0.02, MaxZ - MinZ)];
  const Radius = Math.max(0.03, 0.5 * Math.hypot(Size[0], Size[1], Size[2]));
  return { Min: [MinX, MinY, MinZ], Max: [MaxX, MaxY, MaxZ], Center, Size, Radius };
}
