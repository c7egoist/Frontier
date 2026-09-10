"""Wavefront OBJ (+MTL) export with vertex colors.

Vertex colors are written in the widely-supported ``v x y z r g b``
form (read by Blender, MeshLab, CloudCompare). Two objects are written:
``bark`` (opaque) and ``leaves`` (alpha-tested cards).
"""

from __future__ import annotations

import os

import numpy as np


def write_obj(path: str, result, write_leaves: bool = True):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    base, _ = os.path.splitext(path)
    mtl_path = base + ".mtl"
    with open(mtl_path, "w") as mf:
        mf.write(
            "newmtl bark\nKd 0.42 0.32 0.24\n"
            "newmtl leaves\nKd 0.25 0.48 0.20\n"
        )
    bark = result.bark
    V = bark.verts()
    N = np.asarray(result.bark_normals, float)
    UV = np.asarray(result.bark_uv, float)
    C = np.asarray(result.bark_wind["color"], float)
    with open(path, "w") as f:
        f.write(f"mtllib {os.path.basename(mtl_path)}\n")
        f.write(f"# Frontier {result.preset} seed={result.seed} lod={result.lod}\n")
        f.write("o bark\nusemtl bark\n")
        for i in range(len(V)):
            f.write(
                f"v {V[i,0]:.6f} {V[i,1]:.6f} {V[i,2]:.6f} "
                f"{C[i,0]:.4f} {C[i,1]:.4f} {C[i,2]:.4f}\n"
            )
        for i in range(len(V)):
            f.write(f"vt {UV[i,0]:.6f} {UV[i,1]:.6f}\n")
        for i in range(len(V)):
            f.write(f"vn {N[i,0]:.6f} {N[i,1]:.6f} {N[i,2]:.6f}\n")
        for q in bark.quads:
            a, b, c, d = (x + 1 for x in q)
            f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c} {d}/{d}/{d}\n")
        for t in bark.tris:
            a, b, c = (x + 1 for x in t)
            f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n")
        if write_leaves and result.leaves is not None:
            lv = np.asarray(result.leaves.positions, float)
            ln = np.asarray(result.leaves.normals, float)
            luv = np.asarray(result.leaves.uvs, float)
            lc = np.asarray(result.leaves.colors, float)
            li = np.asarray(result.leaves.indices, np.int64)
            off = len(V)
            f.write("o leaves\nusemtl leaves\n")
            for i in range(len(lv)):
                f.write(
                    f"v {lv[i,0]:.6f} {lv[i,1]:.6f} {lv[i,2]:.6f} "
                    f"{lc[i,0]:.4f} {lc[i,1]:.4f} {lc[i,2]:.4f}\n"
                )
            for i in range(len(lv)):
                f.write(f"vt {luv[i,0]:.6f} {luv[i,1]:.6f}\n")
            for i in range(len(lv)):
                f.write(f"vn {ln[i,0]:.6f} {ln[i,1]:.6f} {ln[i,2]:.6f}\n")
            for t in li:
                a, b, c = (x + 1 + off for x in t)
                f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n")
    return path
