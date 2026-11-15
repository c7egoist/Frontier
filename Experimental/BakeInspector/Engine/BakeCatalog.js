/*==========================================================================================================================================
                                                              BAKECATALOG.JS
==========================================================================================================================================*/
/* BAKE_MAP_CATALOG and BAKE_STUDY_SHAPES copied verbatim from TextureStudio's Engine/BakingEngine.js (lines 11–38).  Only the two
   tables are taken — the baker itself needs three.js, the paint-target geometry and the GPU session, which a host provides. */

export const BAKE_MAP_CATALOG = [
  { id: "volumeSdf", label: "Volume SDF", short: "3D distance grid", group: "Volume & Distance", isVolume: true },
  { id: "normalTangent", label: "Tangent Normal", short: "High-to-Low normal", group: "Normals" },
  { id: "normalWorld", label: "World Normal", short: "Scene XYZ vector", group: "Normals" },
  { id: "normalObject", label: "Object Normal", short: "Local XYZ vector", group: "Normals" },
  { id: "bentNormal", label: "Bent Normal", short: "Average unoccluded ray", group: "Normals" },
  { id: "bevelNormal", label: "Bevel Normal", short: "Rounded edge filter", group: "Normals" },
  { id: "ao", label: "Ambient Occlusion", short: "Hemisphere sky AO", group: "Surface" },
  { id: "secondaryAo", label: "Secondary AO", short: "Tight contact creases", group: "Surface" },
  { id: "curvature", label: "Curvature", short: "Ridge & cavity signed", group: "Surface" },
  { id: "convexity", label: "Convexity", short: "Positive ridges", group: "Surface" },
  { id: "concavity", label: "Concavity", short: "Recessed grooves", group: "Surface" },
  { id: "thickness", label: "Thickness", short: "Interior ray depth", group: "Surface" },
  { id: "height", label: "Height / Displacement", short: "Cage ray offset", group: "Surface" },
  { id: "topDust", label: "Top-Down Dust", short: "Directional mask", group: "Masks & IDs" },
  { id: "uvIslandId", label: "UV Island ID", short: "Chart color map", group: "Masks & IDs" },
  { id: "partId", label: "Part / Material ID", short: "Sub-mesh ID color", group: "Masks & IDs" },
  { id: "position", label: "World Position", short: "Normalized XYZ bbox", group: "Masks & IDs" },
  { id: "wireframe", label: "UV Wireframe", short: "Edge triangle overlay", group: "Masks & IDs" },
];

export const BAKE_STUDY_SHAPES = [
  { id: "teapot", label: "Utah Teapot (High/Low)", name: "Utah Teapot", family: "Standard Study", desc: "Classic curved bevel, spout & handle normals for curvature and AO validation.", topo: "Sub-D Tri", complexity: "6.4k tris", role: "Curvature & AO" },
  { id: "shaderball", label: "Shader Ball (High/Low)", name: "Frontier Shader Ball", family: "Standard Study", desc: "Nested cutaway studio orb on beveled pedestal.", topo: "Cutaway Multi", complexity: "7.2k tris", role: "SSS & Clearcoat" },
  { id: "box", label: "Chamfer Box (High/Low)", name: "Chamfer Box", family: "Hard Surface", desc: "Machined chamfer plates & crisp mitered edges for edge-wear masks.", topo: "Bevel Quad/Tri", complexity: "3.2k tris", role: "Edge Wear" },
  { id: "sphere", label: "UV Sphere (High/Low)", name: "UV Sphere", family: "Standard Study", desc: "Analytic geodesic latitude/longitude validation target.", topo: "Analytic Quad", complexity: "4.1k tris", role: "Tangent Continuity" },
  { id: "torus", label: "Torus Knot Study", name: "Torus Knot Study", family: "Organic", desc: "Continuous braided curvature study with helical ribbing for normal and sheen validation.", topo: "Procedural Loop", complexity: "5.8k tris", role: "Normal & Sheen" },
];
