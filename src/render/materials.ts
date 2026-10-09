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
      const gray = 62 + random() * 23;
      image.data[i] = gray;
      image.data[i + 1] = gray + 3;
      image.data[i + 2] = gray + 4;
      image.data[i + 3] = 255;
    }
    c.putImageData(image, 0, 0);
    return canvas;
  }
  const colors = dark ? [103, 111, 108] : [178, 177, 161];
  c.fillStyle = dark ? "#414a47" : "#858879";
  c.fillRect(0, 0, 512, 512);
  const tile = (x: number, y: number, w: number, h: number) => {
    const jitter = (random() - 0.5) * 18;
    c.fillStyle = `rgb(${colors[0] + jitter},${colors[1] + jitter},${colors[2] + jitter})`;
    c.fillRect(x + 1.4, y + 1.4, w - 2.8, h - 2.8);
    c.strokeStyle = dark ? "#ffffff08" : "#ffffff16";
    c.lineWidth = 1;
    c.strokeRect(x + 2, y + 2, w - 4, h - 4);
  };
  if (pattern === "herringbone") {
    const u = 32;
    for (let y = -2; y < 18; y++)
      for (let x = -2; x < 18; x++) {
        const mod = (((x + y) % 4) + 4) % 4;
        if (mod === 0) tile(x * u, y * u, u * 2, u);
        if (mod === 2) tile(x * u, y * u, u, u * 2);
      }
  } else if (pattern === "running" || pattern === "cobble") {
    const h = pattern === "cobble" ? 32 : 48,
      w = pattern === "cobble" ? 50 : 96;
    for (let y = -1; y < 12; y++)
      for (let x = -1; x < 12; x++)
        tile(x * w + (y % 2 ? w / 2 : 0), y * h, w, h);
  } else if (pattern === "basket") {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        for (let k = 0; k < 2; k++) {
          if ((x + y) % 2) tile(x * 64 + k * 32, y * 64, 32, 64);
          else tile(x * 64, y * 64 + k * 32, 64, 32);
        }
  } else {
    const w = 128,
      h = 128;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) tile(x * w, y * h, w, h);
  }
  return canvas;
}
export class Materials {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  get(key: string) {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const colors: Record<string, string> = {
      curb: "#bbbdb0",
      paint: "#eeeede",
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
      if (pattern === "concrete") m.color.set("#c7c9be");
    }
    if (key === "paint" || key === "yellow") {
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
