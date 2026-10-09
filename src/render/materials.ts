import type { TextureAssetInfo } from "../core/export";
import * as THREE from "three";
import type { Pattern } from "../core/model";
let seed = 47;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
export function patternCanvas(
  pattern:
    Pattern | "asphalt" | "concrete" | "cobble" | "tactile" | "curb-concrete",
  dark = false,
): HTMLCanvasElement {
  seed = 471659;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  if (pattern === "curb-concrete") {
    const rng = random,
      data = c.createImageData(512, 512);
    for (let i = 0; i < data.data.length; i += 4) {
      const n = (rng() - 0.5) * 8,
        pore = rng() < 0.012 ? -14 : 0;
      data.data[i] = 180 + n + pore;
      data.data[i + 1] = 176 + n + pore;
      data.data[i + 2] = 168 + n + pore;
      data.data[i + 3] = 255;
    }
    c.putImageData(data, 0, 0);
    return canvas;
  }
  if (pattern === "tactile") {
    c.fillStyle = "#b6a47a";
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = "#776e58";
    c.lineWidth = 4;
    c.strokeRect(2, 2, 508, 508);
    for (let y = 32; y < 512; y += 64)
      for (let x = 32; x < 512; x += 64) {
        const g = c.createRadialGradient(x - 3, y - 4, 1, x, y, 10);
        g.addColorStop(0, "#d1c093");
        g.addColorStop(0.7, "#b7a579");
        g.addColorStop(1, "#968761");
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, 10, 0, Math.PI * 2);
        c.fill();
      }
    return canvas;
  }
  if (pattern === "asphalt") {
    const image = c.createImageData(512, 512);
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = 39 + random() * 12;
      image.data[i] = gray;
      image.data[i + 1] = gray;
      image.data[i + 2] = gray;
      image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
    return canvas;
  }
  const palette: Record<string, number[]> = {
    ashlar: [170, 168, 163],
    linear: [185, 183, 178],
    terrazzo: [175, 174, 170],
    slate: [65, 67, 68],
    permeable: [147, 147, 143],
  };
  const colors = dark ? [93, 105, 112] : (palette[pattern] ?? [173, 171, 167]);
  c.fillStyle = dark ? "#313c45" : pattern === "slate" ? "#292a2b" : "#787773";
  c.fillRect(0, 0, 512, 512);
  const tile = (x: number, y: number, w: number, h: number) => {
    const jitter = (random() - 0.5) * 12,
      gap = pattern === "permeable" ? 3 : 1.05;
    c.fillStyle = `rgb(${colors[0] + jitter},${colors[1] + jitter},${colors[2] + jitter})`;
    c.fillRect(x + gap, y + gap, w - gap * 2, h - gap * 2);
    c.strokeStyle = dark ? "#ffffff07" : "#ffffff12";
    c.lineWidth = 0.8;
    c.strokeRect(
      x + gap + 0.8,
      y + gap + 0.8,
      w - gap * 2 - 1.6,
      h - gap * 2 - 1.6,
    );
  };
  if (pattern === "herringbone") {
    for (let y = -2; y < 18; y++)
      for (let x = -2; x < 18; x++) {
        const mod = (((x + y) % 4) + 4) % 4;
        if (mod === 0) tile(x * 32, y * 32, 64, 32);
        if (mod === 2) tile(x * 32, y * 32, 32, 64);
      }
  } else if (pattern === "basket") {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        for (let k = 0; k < 2; k++)
          (x + y) % 2
            ? tile(x * 64 + k * 32, y * 64, 32, 64)
            : tile(x * 64, y * 64 + k * 32, 64, 32);
  } else if (pattern === "terrazzo") {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) tile(x * 256, y * 256, 256, 256);
    for (let i = 0; i < 22000; i++) {
      const x = random() * 512,
        y = random() * 512,
        r = 0.25 + random() * 1.3;
      c.fillStyle = i % 3 ? "#646c7428" : "#f4f6f950";
      c.fillRect(x, y, r, r * 0.6);
    }
  } else if (pattern === "ashlar") {
    for (let row = 0; row < 8; row++)
      for (let section = -1; section < 2; section++) {
        let cursor = section * 512 + (row % 2 ? 128 : 0);
        for (const width of row % 2 ? [256, 128, 128] : [128, 256, 128]) {
          tile(cursor, row * 64, width, 64);
          cursor += width;
        }
      }
  } else {
    const w =
      pattern === "linear" || pattern === "slabs"
        ? 256
        : pattern === "slate"
          ? 128
          : pattern === "cobble"
            ? 64
            : 128;
    const h =
      pattern === "linear" || pattern === "cobble"
        ? 32
        : pattern === "slabs"
          ? 128
          : 64;
    for (let y = 0; y < 512 / h; y++)
      for (let x = -1; x < 512 / w + 1; x++)
        tile(x * w + (y % 2 ? w / 2 : 0), y * h, w, h);
  }
  // Fine aggregate is restrained; grout, not noisy colour, carries the relief.
  if (pattern !== "terrazzo")
    for (let i = 0; i < 8000; i++) {
      c.fillStyle = random() > 0.5 ? "#ffffff09" : "#00000007";
      c.fillRect(random() * 512, random() * 512, 0.65, 0.65);
    }
  return canvas;
}
function normalCanvas(source: HTMLCanvasElement, strength: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!,
    data = source.getContext("2d")!.getImageData(0, 0, 512, 512).data,
    image = c.createImageData(512, 512);
  const value = (x: number, y: number) =>
    data[(((y + 512) % 512) * 512 + ((x + 512) % 512)) * 4] / 255;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const dx = (value(x - 1, y) - value(x + 1, y)) * strength,
        dy = (value(x, y - 1) - value(x, y + 1)) * strength,
        n = Math.hypot(dx, dy, 1),
        i = (y * 512 + x) * 4;
      image.data[i] = ((dx / n) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / n) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / n) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  c.putImageData(image, 0, 0);
  return canvas;
}
function roughnessCanvas(source: HTMLCanvasElement, asphalt = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  c.drawImage(source, 0, 0, 512, 512);
  const image = c.getImageData(0, 0, 512, 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4,
        v = image.data[i] / 255,
        noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1,
        r = asphalt
          ? 0.88 + noise * 0.025
          : Math.min(0.97, 0.79 + (1 - v) * 0.17 + noise * 0.012);
      image.data[i] =
        image.data[i + 1] =
        image.data[i + 2] =
          Math.round(r * 255);
      image.data[i + 3] = 255;
    }
  c.putImageData(image, 0, 0);
  return canvas;
}
type SurfacePattern =
  Pattern | "asphalt" | "concrete" | "cobble" | "tactile" | "curb-concrete";
export interface SurfaceMaps {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
  normalStrength: number;
}
const surfaceCache = new Map<string, SurfaceMaps>();
/** Relief is independent of tile colour, so colour variation does not become fake displacement. */
function reliefCanvas(source: HTMLCanvasElement, asphalt: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!,
    src = source.getContext("2d")!.getImageData(0, 0, 512, 512).data,
    dst = c.createImageData(512, 512);
  let mean = 0;
  for (let i = 0; i < src.length; i += 4) mean += src[i];
  mean /= 512 * 512;
  const noise = (x: number, y: number) => {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4,
        grain = noise(x, y),
        value = asphalt
          ? 0.5 + (grain - 0.5) * 0.085
          : src[i] < mean * 0.73
            ? 0.44
            : 0.68 + (grain - 0.5) * 0.006;
      dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = value * 255;
      dst.data[i + 3] = 255;
    }
  c.putImageData(dst, 0, 0);
  return canvas;
}
function tactileHeight() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#888";
  c.fillRect(0, 0, 512, 512);
  for (let y = 32; y < 512; y += 64)
    for (let x = 32; x < 512; x += 64) {
      const g = c.createRadialGradient(x, y, 1, x, y, 10);
      g.addColorStop(0, "#c9c9c9");
      g.addColorStop(1, "#888");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, 10, 0, Math.PI * 2);
      c.fill();
    }
  return canvas;
}
export function surfaceMaps(pattern: SurfacePattern): SurfaceMaps {
  const key = pattern;
  if (surfaceCache.has(key)) return surfaceCache.get(key)!;
  const albedo = patternCanvas(pattern === "concrete" ? "slabs" : pattern),
    normal = normalCanvas(
      pattern === "tactile"
        ? tactileHeight()
        : reliefCanvas(albedo, pattern === "asphalt"),
      pattern === "asphalt" ? 0.32 : 1.6,
    ),
    roughness = roughnessCanvas(albedo, pattern === "asphalt"),
    normalStrength = pattern === "asphalt" ? 0.24 : 0.26;
  const maps = { albedo, normal, roughness, normalStrength };
  surfaceCache.set(key, maps);
  return maps;
}
export function wornPaintCanvas(percent: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!,
    data = c.createImageData(512, 512),
    wear = Math.max(0, Math.min(0.35, percent / 100));
  const noise = (x: number, y: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4,
        n = noise(x, y),
        broad = noise(Math.floor(x / 3), Math.floor(y / 3)),
        damaged = broad < wear * 0.65 || n < wear * 0.14;
      data.data[i] = 215 + n * 12;
      data.data[i + 1] = 214 + n * 12;
      data.data[i + 2] = 207 + n * 10;
      data.data[i + 3] = damaged ? 0 : 255;
    }
  c.putImageData(data, 0, 0);
  return canvas;
}
const surfaceKey = (key: string): SurfacePattern | undefined =>
  key === "curb"
    ? "curb-concrete"
    : key.startsWith("paving-")
      ? (key.slice(7) as Pattern)
      : ["asphalt", "concrete", "cobble"].includes(key)
        ? (key as SurfacePattern)
        : undefined;
export function utilityMaps(
  kind: "utility-cover" | "utility-grate",
): SurfaceMaps {
  const cacheKey = kind;
  if (surfaceCache.has(cacheKey)) return surfaceCache.get(cacheKey)!;
  const albedo = document.createElement("canvas"),
    height = document.createElement("canvas");
  albedo.width = albedo.height = height.width = height.height = 512;
  const c = albedo.getContext("2d")!,
    h = height.getContext("2d")!;
  c.fillStyle = "#525855";
  c.fillRect(0, 0, 512, 512);
  h.fillStyle = "#999";
  h.fillRect(0, 0, 512, 512);
  seed = 28571;
  for (let i = 0; i < 24000; i++) {
    const x = random() * 512,
      y = random() * 512;
    c.fillStyle = random() > 0.5 ? "#c3cbc212" : "#161c191e";
    c.fillRect(x, y, 0.8, 0.8);
  }
  if (kind === "utility-cover") {
    for (const radius of [241, 222]) {
      c.strokeStyle = "#323a35";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(256, 256, radius, 0, Math.PI * 2);
      c.stroke();
      h.strokeStyle = "#707070";
      h.lineWidth = 6;
      h.beginPath();
      h.arc(256, 256, radius, 0, Math.PI * 2);
      h.stroke();
    }
    c.save();
    h.save();
    c.beginPath();
    c.arc(256, 256, 210, 0, Math.PI * 2);
    c.clip();
    h.beginPath();
    h.arc(256, 256, 210, 0, Math.PI * 2);
    h.clip();
    for (let y = -20; y < 540; y += 28)
      for (let x = -20; x < 540; x += 28) {
        c.strokeStyle = "#737c7266";
        c.lineWidth = 2;
        h.strokeStyle = "#b2b2b2";
        h.lineWidth = 3;
        for (const a of [c, h]) {
          a.beginPath();
          a.moveTo(x, y - 8);
          a.lineTo(x + 8, y);
          a.lineTo(x, y + 8);
          a.lineTo(x - 8, y);
          a.closePath();
          a.stroke();
        }
      }
    c.restore();
    h.restore();
    c.fillStyle = "#303832";
    c.fillRect(181, 232, 150, 48);
    h.fillStyle = "#777";
    h.fillRect(181, 232, 150, 48);
    c.fillStyle = "#92978e";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "500 18px monospace";
    c.fillText("SERVICE", 256, 256);
    h.font = "500 18px monospace";
    h.textAlign = "center";
    h.textBaseline = "middle";
    h.fillStyle = "#a8a8a8";
    h.fillText("SERVICE", 256, 256);
  } else {
    c.fillStyle = "#171e1b";
    c.fillRect(0, 0, 512, 512);
    h.fillStyle = "#5a5a5a";
    h.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 32) {
      c.fillStyle = "#747c73";
      c.fillRect(x, 12, 10, 488);
      h.fillStyle = "#b3b3b3";
      h.fillRect(x, 12, 10, 488);
    }
    for (const y of [0, 165, 337, 501]) {
      c.fillStyle = "#6c746a";
      c.fillRect(0, y, 512, 11);
      h.fillStyle = "#aaa";
      h.fillRect(0, y, 512, 11);
    }
  }
  const maps = {
    albedo,
    normal: normalCanvas(height, 1.2),
    roughness: roughnessCanvas(albedo),
    normalStrength: 0.3,
  };
  surfaceCache.set(cacheKey, maps);
  return maps;
}
function graphicCanvas(key: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, 256, 256);
  const text = (value: string, size: number, color = "#19222b") => {
    c.fillStyle = color;
    c.font = `600 ${size}px Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(value, 128, 132);
  };
  if (key === "race-curb") {
    c.fillStyle = "#9e3e34";
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = "#c6c0b5";
    c.fillRect(128, 0, 128, 256);
  } else if (key.startsWith("speed-")) {
    c.fillStyle = "#f3f4f3";
    c.beginPath();
    c.arc(128, 128, 124, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#cf383d";
    c.lineWidth = 17;
    c.beginPath();
    c.arc(128, 128, 112, 0, Math.PI * 2);
    c.stroke();
    text(key.slice(6), key.length > 8 ? 82 : 106);
  } else if (key === "yield") {
    c.fillStyle = "#d7474b";
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(256, 0);
    c.lineTo(128, 256);
    c.fill();
    c.fillStyle = "#f4f3ee";
    c.beginPath();
    c.moveTo(27, 18);
    c.lineTo(229, 18);
    c.lineTo(128, 221);
    c.fill();
  } else if (key === "parking") {
    c.fillStyle = "#286caa";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "#edf4fb";
    c.lineWidth = 10;
    c.strokeRect(7, 7, 242, 242);
    text("P", 182, "#f3f7fa");
  } else if (key === "exit") {
    c.fillStyle = "#247161";
    c.fillRect(0, 0, 256, 256);
    text("EXIT ↗", 53, "#fff");
    c.strokeStyle = "#f4f7ef";
    c.lineWidth = 8;
    c.strokeRect(7, 15, 242, 226);
  } else if (key === "accessible") {
    c.strokeStyle = "#fff";
    c.lineWidth = 14;
    c.lineCap = "round";
    c.beginPath();
    c.arc(105, 175, 48, 0.1, Math.PI * 1.85);
    c.stroke();
    c.beginPath();
    c.arc(130, 49, 15, 0, Math.PI * 2);
    c.fillStyle = "#fff";
    c.fill();
    c.beginPath();
    c.moveTo(124, 82);
    c.lineTo(122, 142);
    c.lineTo(172, 142);
    c.lineTo(194, 190);
    c.lineTo(218, 184);
    c.moveTo(124, 104);
    c.lineTo(167, 104);
    c.stroke();
  } else if (key.startsWith("bay-")) text(key.slice(4), 154, "#e1e6e9");
  return canvas;
}
/** Standalone OBJ assets; generated locally, never fetched from a CDN. */
export async function exportTexturePack(keys: string[]) {
  const files: Record<string, Uint8Array> = {},
    textures: Record<string, TextureAssetInfo> = {},
    manifest: Record<string, unknown> = {};
  const png = async (canvas: HTMLCanvasElement, path: string) => {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("Could not encode material texture.")),
        "image/png",
      ),
    );
    files[path] = new Uint8Array(await blob.arrayBuffer());
  };
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const pattern = surfaceKey(key),
        base = `textures/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      let maps: SurfaceMaps | undefined,
        image: HTMLCanvasElement | undefined,
        scale: [number, number] = [0.5, 0.5];
      if (pattern) {
        maps = surfaceMaps(pattern);
        image = maps.albedo;
        if (pattern === "tactile") scale = [1, 1];
        else if (pattern === "curb-concrete") scale = [2, 2];
      } else if (key === "utility-cover" || key === "utility-grate") {
        maps = utilityMaps(key);
        image = maps.albedo;
        scale = [1, 1];
      } else if (/^paint-wear-\d+$/.test(key))
        image = wornPaintCanvas(Number(key.split("-").at(-1)));
      else if (
        key.startsWith("sign-") ||
        key.startsWith("marking-") ||
        key === "race-curb"
      ) {
        image = graphicCanvas(
          key === "race-curb" ? key : key.replace(/^(sign|marking)-/, ""),
        );
        scale = key === "race-curb" ? [1 / 3, 1] : [1, 1];
      }
      if (!image) {
        if (key.startsWith("utility-"))
          manifest[key] = {
            baseColor: key === "utility-iron" ? "#686e66" : "#1a211e",
            baseColorColorSpace: "sRGB",
            metallic: 0.72,
            roughnessFactor: 0.88,
          };
        return;
      }
      const info: TextureAssetInfo = {
        path: `${base}.png`,
        scale,
        alpha: key.startsWith("marking-") || key.startsWith("paint-wear-"),
        wrapS: key === "utility-cover" ? "clamp" : "repeat",
        wrapT: key.startsWith("utility-") ? "clamp" : "repeat",
      };
      await png(image, info.path);
      if (maps) {
        info.normalPath = `${base}-normal.png`;
        info.roughnessPath = `${base}-roughness.png`;
        info.normalStrength = maps.normalStrength;
        await Promise.all([
          png(maps.normal, info.normalPath),
          png(maps.roughness, info.roughnessPath),
        ]);
      }
      textures[key] = info;
      manifest[key] = {
        albedo: info.path,
        normal: info.normalPath,
        roughness: info.roughnessPath,
        normalStrength: info.normalStrength,
        uvRepeat: scale,
        wrapS: info.wrapS,
        wrapT: info.wrapT,
        albedoColorSpace: "sRGB",
        dataColorSpace: "linear",
        normalConvention: "OpenGL +Y",
        metallic: key.startsWith("utility-") ? 0.72 : 0,
        roughnessFactor: maps ? 1 : 0.6,
      };
    }),
  );
  files["materials.json"] = new TextEncoder().encode(
    JSON.stringify(
      { units: "metres", normalConvention: "OpenGL +Y", materials: manifest },
      null,
      2,
    ),
  );
  files["IMPORT.txt"] = new TextEncoder().encode(
    "Keep textures/ beside the OBJ and MTL. Albedo PNGs are sRGB; normal and roughness PNGs are linear data. Normal maps use OpenGL +Y (invert green for DirectX -Y engines). UV-repeat, normal strength and texture bindings are in materials.json. MTL norm/map_Pr are PBR extensions; use the manifest or GLB if your OBJ importer does not support them. No preview environment or decorative props are exported.",
  );
  return { files, textures };
}
export class Materials {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  get(key: string) {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const colors: Record<string, string> = {
      curb: "#b4b0a8",
      "utility-iron": "#686e66",
      "utility-recess": "#1a211e",
      "pave-border": "#565755",
      pole: "#394651",
      "accessible-blue": "#326f9e",
      "wheel-stop": "#bac1c5",
      "lamp-glow": "#fff0ce",
      "signal-red": "#ed5959",
      "signal-green": "#52d391",
      "signal-off": "#24323a",
      rubber: "#202732",
      paint: "#d5d4cb",
      yellow: "#ead593",
      steel: "#bec8c7",
      "steel-dark": "#83908d",
      "drain-dark": "#273b39",
      gutter: "#363632",
      concrete: "#a9afa2",
      girder: "#65787b",
      foundation: "#778379",
      "road-base": "#555653",
    };
    const m = new THREE.MeshStandardMaterial({
      color: colors[key] ?? "#ffffff",
      roughness: key === "steel" ? 0.38 : 0.88,
      metalness: key.startsWith("utility-")
        ? 0.72
        : key === "steel"
          ? 0.72
          : key === "steel-dark"
            ? 0.35
            : 0,
      side: THREE.DoubleSide,
    });
    m.name = key;
    if (key === "signal-red" || key === "signal-green") {
      m.emissive.set(key === "signal-red" ? "#dc3e3e" : "#33b472");
      m.emissiveIntensity = 0.85;
    }
    const pattern = surfaceKey(key);
    if (pattern) {
      const maps = surfaceMaps(pattern),
        texture = (canvas: HTMLCanvasElement, name: string, srgb = false) => {
          const t = new THREE.CanvasTexture(canvas);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(
            pattern === "tactile" ? 1 : pattern === "curb-concrete" ? 2 : 0.5,
            pattern === "tactile" ? 1 : pattern === "curb-concrete" ? 2 : 0.5,
          );
          t.anisotropy = 8;
          t.name = name;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          return t;
        };
      m.map = texture(maps.albedo, `${key}:albedo`, true);
      m.normalMap = texture(maps.normal, `${key}:normal`);
      m.normalScale.set(maps.normalStrength, maps.normalStrength);
      m.roughnessMap = texture(maps.roughness, `${key}:roughness`);
      m.roughness = 1;
      if (pattern === "concrete") m.color.set("#ceccc7");
      if (pattern === "curb-concrete") m.color.set("#ffffff");
    }
    if (key === "utility-cover" || key === "utility-grate") {
      const maps = utilityMaps(key),
        map = (image: HTMLCanvasElement, srgb = false) => {
          const t = new THREE.CanvasTexture(image);
          t.wrapS =
            key === "utility-grate"
              ? THREE.RepeatWrapping
              : THREE.ClampToEdgeWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.anisotropy = 8;
          t.name = `${key}:${srgb ? "albedo" : image === maps.normal ? "normal" : "roughness"}`;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          return t;
        };
      m.map = map(maps.albedo, true);
      m.normalMap = map(maps.normal);
      m.roughnessMap = map(maps.roughness);
      m.normalScale.set(0.3, 0.3);
      m.roughness = 1;
    }
    if (/^paint-wear-\d+$/.test(key)) {
      const t = new THREE.CanvasTexture(
        wornPaintCanvas(Number(key.split("-").at(-1))),
      );
      t.name = key;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.5, 0.5);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      m.map = t;
      m.alphaTest = 0.35;
      m.roughness = 0.94;
    }
    if (
      key.startsWith("sign-") ||
      key.startsWith("marking-") ||
      key === "race-curb"
    ) {
      const texture = new THREE.CanvasTexture(
        graphicCanvas(
          key === "race-curb" ? key : key.replace(/^(sign|marking)-/, ""),
        ),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      if (key === "race-curb") {
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = 1 / 3;
      } else {
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      }
      m.map = texture;
      m.alphaTest = 0.35;
      m.roughness = 0.6;
    }
    if (key === "lamp-glow") {
      m.emissive.set("#ffe2ad");
      m.emissiveIntensity = 1.5;
    }
    if (
      key === "paint" ||
      key.startsWith("paint-wear-") ||
      key === "yellow" ||
      key.startsWith("marking-")
    ) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    }
    this.cache.set(key, m);
    return m;
  }
  /** Export copies are independent of clay/wireframe viewport overrides. */
  exportCopy(key: string): THREE.MeshStandardMaterial {
    const copy = this.get(key).clone(),
      original = this.originals.get(key);
    if (original) {
      copy.map = original.map;
      copy.color.copy(original.color);
      copy.normalMap = original.normalMap;
      copy.roughnessMap = original.roughnessMap;
      copy.roughness = original.roughness;
    }
    copy.wireframe = false;
    return copy;
  }
  wireframe(value: boolean) {
    for (const [key, m] of this.cache)
      m.wireframe =
        value &&
        !["paint", "yellow", "steel", "steel-dark", "drain-dark"].includes(key);
  }
  clay(value: boolean) {
    for (const [key, m] of this.cache) {
      m.map = value ? null : this.getOriginalMap(key);
      m.normalMap = value ? null : (this.originals.get(key)?.normalMap ?? null);
      m.roughnessMap = value
        ? null
        : (this.originals.get(key)?.roughnessMap ?? null);
      m.roughness = value ? 0.94 : (this.originals.get(key)?.roughness ?? 0.88);
      m.color.set(value ? "#b9b9b9" : this.getOriginalColor(key));
      m.needsUpdate = true;
    }
  }
  private originals = new Map<
    string,
    {
      map: THREE.Texture | null;
      color: THREE.Color;
      normalMap: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
      roughness: number;
    }
  >();
  capture() {
    for (const [key, m] of this.cache)
      if (!this.originals.has(key))
        this.originals.set(key, {
          map: m.map,
          color: m.color.clone(),
          normalMap: m.normalMap,
          roughnessMap: m.roughnessMap,
          roughness: m.roughness,
        });
  }
  private getOriginalMap(key: string) {
    return this.originals.get(key)?.map ?? null;
  }
  private getOriginalColor(key: string) {
    return this.originals.get(key)?.color ?? new THREE.Color("#ffffff");
  }
}
