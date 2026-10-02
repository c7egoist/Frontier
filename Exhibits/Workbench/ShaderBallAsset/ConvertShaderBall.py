#!/usr/bin/env python3
"""Convert derkreature's ShaderBall OBJ into the compact binary mesh the showcase loads.

The source is quad-dominant and Y-up in a ~268-unit box; the engine is Z-up in metres. This triangulates,
welds the OBJ's separate position/uv/normal index streams into single vertices, rotates Y-up -> Z-up, and
scales and seats the result so it stands on z = 0 at the height the grid expects.

Full resolution always, for every consumer. Project Zero loads the real topology, and so does the parity
harness -- a proof that three render paths agree about a material is void if they are not looking at the same
triangles, so the CPU side gets the same mesh and renders fewer balls rather than smaller ones.

`--decimate N` remains for ad-hoc inspection and is NOT used to build any shipped asset. Be warned what it does
to this mesh: vertex-cluster snapping collapses the shader ball's thin shell against itself and a 3 000-triangle
target comes out riddled with holes. The silhouette survives; the surface does not. Anything that traces rays
through the result will see through it.

    python3 Exhibits/Workbench/ShaderBallAsset/ConvertShaderBall.py \
        --input  _AgentScratch/tmp/sb/ShaderBall-master/shaderBallNoCrease/shaderBall.obj \
        --output Exhibits/Assets/ShaderBall/ShaderBall.mesh

Format (little-endian, matches ShaderBallGeometry.cpp):

    magic   u32  'SBM1'
    vertices u32
    indices  u32
    height   f32   [m] the seated height, for the caller's sanity check
    then `vertices` records of: px py pz  nx ny nz  u v   (8 x f32, 32 B)
    then `indices` u32
"""

from __future__ import annotations

import argparse
import math
import pathlib
import struct
import sys
from collections import defaultdict

MAGIC = 0x314D4253  # 'SBM1'


def read_obj(path: pathlib.Path):
    """Return (positions, texcoords, normals, faces) with faces as lists of (vi, ti, ni) 0-based or -1."""
    positions: list[tuple[float, float, float]] = []
    texcoords: list[tuple[float, float]] = []
    normals: list[tuple[float, float, float]] = []
    faces: list[list[tuple[int, int, int]]] = []

    def corner(token: str) -> tuple[int, int, int]:
        parts = (token.split("/") + ["", ""])[:3]

        def resolve(text: str, total: int) -> int:
            if not text:
                return -1
            value = int(text)
            return value - 1 if value > 0 else total + value

        return (
            resolve(parts[0], len(positions)),
            resolve(parts[1], len(texcoords)),
            resolve(parts[2], len(normals)),
        )

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line or line[0] == "#":
                continue
            fields = line.split()
            if not fields:
                continue
            tag = fields[0]
            if tag == "v":
                positions.append((float(fields[1]), float(fields[2]), float(fields[3])))
            elif tag == "vt":
                texcoords.append((float(fields[1]), float(fields[2]) if len(fields) > 2 else 0.0))
            elif tag == "vn":
                normals.append((float(fields[1]), float(fields[2]), float(fields[3])))
            elif tag == "f":
                faces.append([corner(t) for t in fields[1:]])
    return positions, texcoords, normals, faces


def triangulate(faces):
    """Fan-triangulate. The source is 33 852 quads + 128 triangles, all convex and planar enough for a fan."""
    out = []
    for face in faces:
        for k in range(1, len(face) - 1):
            out.append((face[0], face[k], face[k + 1]))
    return out


def weld(triangles, positions, texcoords, normals):
    """One vertex per distinct (position, normal, uv) VALUE, not per distinct index triple.

    The source writes a normal per face corner -- 135 792 of them for 34 623 positions -- but the mesh is smooth,
    so at a shared corner those normals are equal to within rounding. Keying on the index triple would keep all
    135 792; keying on the quantised value collapses them back to roughly one per position. Positions are snapped
    at 1e-6 of the source's ~268-unit box (sub-micron once seated), normals at 1e-4, UVs at 1e-6: fine enough that
    a genuine hard edge or UV seam still separates, coarse enough that float noise does not.
    """
    lookup: dict[tuple, int] = {}
    vertices: list[tuple[float, ...]] = []
    indices: list[int] = []
    for triangle in triangles:
        for vi, ti, ni in triangle:
            p = positions[vi]
            t = texcoords[ti] if 0 <= ti < len(texcoords) else (0.0, 0.0)
            n = normals[ni] if 0 <= ni < len(normals) else (0.0, 1.0, 0.0)
            key = (round(p[0], 6), round(p[1], 6), round(p[2], 6),
                   round(n[0], 4), round(n[1], 4), round(n[2], 4),
                   round(t[0], 6), round(t[1], 6))
            slot = lookup.get(key)
            if slot is None:
                slot = len(vertices)
                vertices.append((p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1]))
                lookup[key] = slot
            indices.append(slot)
    return vertices, indices


def seat(vertices, target_height: float):
    """Y-up -> Z-up, uniform scale to `target_height`, centred in xy and resting on z = 0."""
    # (x, y, z)_obj -> (x, -z, y)_world, the same swap ObjCodec applies.
    swapped = [(v[0], -v[2], v[1], v[3], -v[5], v[4], v[6], v[7]) for v in vertices]

    lo = [min(v[i] for v in swapped) for i in range(3)]
    hi = [max(v[i] for v in swapped) for i in range(3)]
    height = hi[2] - lo[2]
    scale = target_height / height if height > 0.0 else 1.0
    cx = 0.5 * (lo[0] + hi[0])
    cy = 0.5 * (lo[1] + hi[1])

    seated = []
    for v in swapped:
        seated.append((
            (v[0] - cx) * scale,
            (v[1] - cy) * scale,
            (v[2] - lo[2]) * scale,
            v[3], v[4], v[5],
            v[6], v[7],
        ))
    span = ((hi[0] - lo[0]) * scale, (hi[1] - lo[1]) * scale, target_height)
    return seated, span


def smooth_normals(vertices, indices):
    """Area-weighted vertex normals, recomputed after a decimation has invalidated the originals."""
    accum = [[0.0, 0.0, 0.0] for _ in vertices]
    for i in range(0, len(indices), 3):
        a, b, c = indices[i], indices[i + 1], indices[i + 2]
        pa, pb, pc = vertices[a][:3], vertices[b][:3], vertices[c][:3]
        ux, uy, uz = pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]
        vx, vy, vz = pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        for slot in (a, b, c):
            accum[slot][0] += nx
            accum[slot][1] += ny
            accum[slot][2] += nz
    out = []
    for v, n in zip(vertices, accum):
        length = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
        if length > 1e-20:
            out.append((v[0], v[1], v[2], n[0] / length, n[1] / length, n[2] / length, v[6], v[7]))
        else:
            out.append(v)
    return out


def decimate(vertices, indices, target_triangles: int):
    """Vertex-cluster snap to a grid chosen to land near `target_triangles`, then averaged smooth normals.

    Ad-hoc inspection only. Measured on this mesh at a 3 000-triangle target: the silhouette holds to within 2 %
    of the bounding box, but the shell is perforated, because clustering merges vertices across the gap between
    the inner and outer surfaces wherever the shell is thinner than a cell. Surface area came out 7.748 m2
    against the source's 7.708 m2 -- close enough to look fine in a table and plainly wrong in a render.
    A quadric edge-collapse with a boundary constraint is what this would need to be usable.
    """
    lo = [min(v[i] for v in vertices) for i in range(3)]
    hi = [max(v[i] for v in vertices) for i in range(3)]
    span = [max(hi[i] - lo[i], 1e-9) for i in range(3)]

    best = None
    for side in range(8, 513):
        cell = [s / side for s in span]
        cluster: dict[tuple[int, int, int], list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        remap: list[tuple[int, int, int]] = []
        for v in vertices:
            key = tuple(min(side - 1, int((v[i] - lo[i]) / cell[i])) for i in range(3))
            bucket = cluster[key]
            for i in range(3):
                bucket[i] += v[i]
            bucket[3] += v[6]
            bucket[4] += v[7]
            bucket[5] += 1.0
            remap.append(key)

        order = {key: slot for slot, key in enumerate(cluster.keys())}
        new_indices: list[int] = []
        for i in range(0, len(indices), 3):
            a, b, c = (order[remap[indices[i + k]]] for k in range(3))
            if a != b and b != c and a != c:
                new_indices.extend((a, b, c))
        count = len(new_indices) // 3
        if best is None or abs(count - target_triangles) < abs(best[0] - target_triangles):
            new_vertices = []
            for key in cluster.keys():
                bucket = cluster[key]
                w = bucket[5]
                new_vertices.append((bucket[0] / w, bucket[1] / w, bucket[2] / w,
                                     0.0, 0.0, 1.0, bucket[3] / w, bucket[4] / w))
            best = (count, new_vertices, new_indices)
        if count >= target_triangles * 1.6:
            break
    count, new_vertices, new_indices = best
    return smooth_normals(new_vertices, new_indices), new_indices


def write_mesh(path: pathlib.Path, vertices, indices, height: float):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(struct.pack("<IIIf", MAGIC, len(vertices), len(indices), height))
        packer = struct.Struct("<8f")
        for v in vertices:
            handle.write(packer.pack(*v))
        handle.write(struct.pack(f"<{len(indices)}I", *indices))
    return path.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--height", type=float, default=1.10, help="[m] seated height (default 1.10)")
    parser.add_argument("--decimate", type=int, default=0,
                        help="target triangles for ad-hoc inspection; 0 = full resolution. NOT watertight on "
                             "this mesh -- see the module docstring. No shipped asset is built with it.")
    arguments = parser.parse_args()

    if not arguments.input.exists():
        print(f"missing input: {arguments.input}", file=sys.stderr)
        return 1

    positions, texcoords, normals, faces = read_obj(arguments.input)
    quads = sum(1 for f in faces if len(f) == 4)
    print(f"read   {len(positions)} v, {len(texcoords)} vt, {len(normals)} vn, "
          f"{len(faces)} faces ({quads} quads)")

    triangles = triangulate(faces)
    vertices, indices = weld(triangles, positions, texcoords, normals)
    print(f"welded {len(vertices)} vertices, {len(indices) // 3} triangles")

    vertices, span = seat(vertices, arguments.height)
    print(f"seated {span[0]:.3f} x {span[1]:.3f} x {span[2]:.3f} m, resting on z = 0")

    if arguments.decimate > 0:
        vertices, indices = decimate(vertices, indices, arguments.decimate)
        print(f"decimated to {len(vertices)} vertices, {len(indices) // 3} triangles")
        print("WARNING: cluster decimation tears this mesh. Do not trace rays through the result.",
              file=sys.stderr)

    size = write_mesh(arguments.output, vertices, indices, arguments.height)
    print(f"wrote  {arguments.output} ({size / 1048576.0:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
