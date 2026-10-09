import * as THREE from "three";
import type { Pattern } from "../core/model";
let seed = 47;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
export function patternCanvas(
  pattern: Pattern | "asphalt" | "concrete" | "cobble",
  dark = false,
): HTMLCanvasElement {
  seed = 471659;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  if (pattern === "asphalt") {
    const image = c.createImageData(512, 512);
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = 39 + random() * 12;
      image.data[i] = gray;
      image.data[i + 1] = gray + 3;
      image.data[i + 2] = gray + 4;
      image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
    return canvas;
  }
  const palette: Record<string, number[]> = {
    ashlar: [176, 182, 188],
    linear: [194, 197, 199],
    terrazzo: [182, 184, 186],
    slate: [77, 88, 99],
    permeable: [145, 152, 151],
  };
  const colors = dark ? [93, 105, 112] : (palette[pattern] ?? [176, 179, 182]);
  c.fillStyle = dark ? "#313c45" : pattern === "slate" ? "#323b43" : "#777e83";
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
    c.fillStyle = "#b83d39";
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = "#eceff1";
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
    textures: Record<
      string,
      { path: string; scale: [number, number]; alpha: boolean }
    > = {};
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      let image: HTMLCanvasElement | undefined,
        scale: [number, number] = [0.5, 0.5];
      if (key.startsWith("paving-"))
        image = patternCanvas(key.slice(7) as Pattern);
      else if (["asphalt", "concrete", "cobble"].includes(key))
        image = patternCanvas(
          key === "concrete" ? "slabs" : (key as "asphalt" | "cobble"),
        );
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
      if (!image) return;
      const blob = await new Promise<Blob>((resolve, reject) =>
        image!.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Could not encode procedural texture.")),
          "image/png",
        ),
      );
      const path = `textures/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      files[path] = new Uint8Array(await blob.arrayBuffer());
      textures[key] = { path, scale, alpha: key.startsWith("marking-") };
    }),
  );
  return { files, textures };
}
export class Materials {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  get(key: string) {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const colors: Record<string, string> = {
      curb: "#b6bec5",
      "pave-border": "#515d68",
      pole: "#394651",
      grass: "#608568",
      foliage: "#427258",
      flowers: "#d5b078",
      wood: "#7a685a",
      soil: "#45453c",
      facade: "#b3b7bd",
      glass: "#48606f",
      roof: "#586672",
      water: "#5995aa",
      "accessible-blue": "#326f9e",
      "wheel-stop": "#bac1c5",
      "lamp-glow": "#fff0ce",
      "signal-red": "#ed5959",
      "signal-green": "#52d391",
      "signal-off": "#24323a",
      rubber: "#202732",
      paint: "#eef2f6",
      yellow: "#ead593",
      steel: "#bec8c7",
      "steel-dark": "#83908d",
      "drain-dark": "#273b39",
      gutter: "#374947",
      concrete: "#a9afa2",
      girder: "#65787b",
      foundation: "#778379",
      "road-base": "#737d76",
    };
    const m = new THREE.MeshStandardMaterial({
      color: colors[key] ?? "#ffffff",
      roughness: key === "steel" ? 0.38 : 0.88,
      metalness: key === "steel" ? 0.72 : key === "steel-dark" ? 0.35 : 0,
      side: THREE.DoubleSide,
    });
    m.name = key;
    if (key === "signal-red" || key === "signal-green") {
      m.emissive.set(key === "signal-red" ? "#dc3e3e" : "#33b472");
      m.emissiveIntensity = 0.85;
    }
    let pattern: Pattern | "asphalt" | "concrete" | "cobble" | undefined;
    if (key.startsWith("paving-")) pattern = key.slice(7) as Pattern;
    else if (["asphalt", "concrete", "cobble"].includes(key))
      pattern = key as typeof pattern;
    if (pattern) {
      const texture = new THREE.CanvasTexture(patternCanvas(pattern));
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(
        pattern === "asphalt" ? 0.14 : 0.5,
        pattern === "asphalt" ? 0.14 : 0.5,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      m.map = texture;
      if (pattern === "concrete") m.color.set("#c3c8ce");
      const normal = new THREE.CanvasTexture(
        normalCanvas(
          texture.image as HTMLCanvasElement,
          pattern === "asphalt" ? 0.12 : 1.7,
        ),
      );
      normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
      normal.repeat.copy(texture.repeat);
      normal.anisotropy = 8;
      m.normalMap = normal;
      m.normalScale.set(0.38, 0.38);
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
    if (key === "glass") {
      m.roughness = 0.3;
      m.metalness = 0.25;
    }
    if (key === "water") {
      m.roughness = 0.22;
      m.metalness = 0.18;
    }
    if (key === "lamp-glow") {
      m.emissive.set("#ffe2ad");
      m.emissiveIntensity = 1.5;
    }
    if (key === "paint" || key === "yellow" || key.startsWith("marking-")) {
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
      m.color.set(value ? "#b7bcb4" : this.getOriginalColor(key));
      m.needsUpdate = true;
    }
  }
  private originals = new Map<
    string,
    { map: THREE.Texture | null; color: THREE.Color }
  >();
  capture() {
    for (const [key, m] of this.cache)
      if (!this.originals.has(key))
        this.originals.set(key, { map: m.map, color: m.color.clone() });
  }
  private getOriginalMap(key: string) {
    return this.originals.get(key)?.map ?? null;
  }
  private getOriginalColor(key: string) {
    return this.originals.get(key)?.color ?? new THREE.Color("#ffffff");
  }
}
