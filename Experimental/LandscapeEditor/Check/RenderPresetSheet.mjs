// 📦 Contact-sheet renderer — evaluates every preset headlessly and writes a PNG per preset (hillshade beside satmap).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { EvaluateProject } from "../js/Pipeline.js";
import { ComposeSatmap, ComposeHillshade } from "../js/Satmap.js";
import { Presets, PresetProject } from "../js/Presets.js";

const Folder = path.dirname(fileURLToPath(import.meta.url));
const OutputFolder = process.argv[2] ?? path.join(Folder, "..", "..", "..", "_AgentScratch", "tmp");
const Resolution = Number(process.argv[3] ?? 256);
const Only = process.argv[4] ? new Set(process.argv[4].split(",")) : null;

/// in    Width    [px]  image width
/// in    Height   [px]  image height
/// in    Pixels   [-]   Uint8Array RGB, row-major
/// out   Png      [-]   Buffer containing a PNG file
export function EncodePng(Width, Height, Pixels) {
    const Raw = Buffer.alloc((Width * 3 + 1) * Height);
    for (let Y = 0; Y < Height; Y++) {
        Raw[Y * (Width * 3 + 1)] = 0;
        Buffer.from(Pixels.buffer, Pixels.byteOffset + Y * Width * 3, Width * 3).copy(Raw, Y * (Width * 3 + 1) + 1);
    }
    const Chunks = [];
    const Header = Buffer.alloc(13);
    Header.writeUInt32BE(Width, 0);
    Header.writeUInt32BE(Height, 4);
    Header[8] = 8;
    Header[9] = 2;
    Chunks.push(Chunk("IHDR", Header));
    Chunks.push(Chunk("IDAT", zlib.deflateSync(Raw, { level: 6 })));
    Chunks.push(Chunk("IEND", Buffer.alloc(0)));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...Chunks]);
}

/// in    Type     [-]  four-character chunk name
/// in    Data     [-]  chunk payload
/// out   Chunk    [-]  length, type, data and CRC32 buffer
function Chunk(Type, Data) {
    const Length = Buffer.alloc(4);
    Length.writeUInt32BE(Data.length, 0);
    const Body = Buffer.concat([Buffer.from(Type, "ascii"), Data]);
    const Crc = Buffer.alloc(4);
    Crc.writeUInt32BE(Crc32(Body) >>> 0, 0);
    return Buffer.concat([Length, Body, Crc]);
}

const CrcTable = (() => {
    const Table = new Uint32Array(256);
    for (let N = 0; N < 256; N++) {
        let C = N;
        for (let K = 0; K < 8; K++) {
            C = C & 1 ? 0xedb88320 ^ (C >>> 1) : C >>> 1;
        }
        Table[N] = C >>> 0;
    }
    return Table;
})();

/// in    Bytes    [-]  buffer
/// out   Crc      [-]  CRC-32 of the buffer
function Crc32(Bytes) {
    let C = 0xffffffff;
    for (const Byte of Bytes) {
        C = CrcTable[(C ^ Byte) & 0xff] ^ (C >>> 8);
    }
    return (C ^ 0xffffffff) >>> 0;
}

/// in    Rgba     [-]  Uint8ClampedArray RGBA
/// out   Rgb      [-]  Uint8Array RGB
function ToRgb(Rgba) {
    const Rgb = new Uint8Array((Rgba.length / 4) * 3);
    for (let Index = 0; Index < Rgba.length / 4; Index++) {
        Rgb[Index * 3] = Rgba[Index * 4];
        Rgb[Index * 3 + 1] = Rgba[Index * 4 + 1];
        Rgb[Index * 3 + 2] = Rgba[Index * 4 + 2];
    }
    return Rgb;
}

fs.mkdirSync(OutputFolder, { recursive: true });
for (const Preset of Presets) {
    if (Only && !Only.has(Preset.Id)) {
        continue;
    }
    const Started = performance.now();
    const Project = PresetProject(Preset.Id);
    Project.Resolution = Resolution;
    const Result = EvaluateProject({ ...Project }, new Map(), {});
    const Satmap = ToRgb(ComposeSatmap(Result, "Composite", Project.Palette));
    const Shade = ToRgb(ComposeHillshade(Result));
    const N = Result.N;
    const Width = N * 2 + 4;
    const Pixels = new Uint8Array(Width * N * 3).fill(40);
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            for (let C = 0; C < 3; C++) {
                Pixels[(Y * Width + X) * 3 + C] = Shade[(Y * N + X) * 3 + C];
                Pixels[(Y * Width + N + 4 + X) * 3 + C] = Satmap[(Y * N + X) * 3 + C];
            }
        }
    }
    const File = path.join(OutputFolder, `${Preset.Id}.png`);
    fs.writeFileSync(File, EncodePng(Width, N, Pixels));
    const S = Result.Stats;
    console.log(
        `${Preset.Id.padEnd(16)} ${Math.round(performance.now() - Started).toString().padStart(6)} ms  ` +
            `min ${S.Minimum.toFixed(0).padStart(6)}  max ${S.Maximum.toFixed(0).padStart(6)}  land ${(S.LandFraction * 100).toFixed(0).padStart(3)}%  rivers ${S.RiverLengthKm.toFixed(1)} km`,
    );
}
