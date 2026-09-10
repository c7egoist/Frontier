"""Minimal dependency-free binary glTF (2.0 .glb) exporter.

Exports bark + leaves with the full Frontier wind payload:

* ``POSITION`` / ``NORMAL`` / ``TEXCOORD_0`` (bark cylindrical UVs)
* ``COLOR_0`` = ``(wind_weight, branch_phase, ao, level01)``
* ``TEXCOORD_1`` = ``(pivot.x, pivot.y)``
* ``TEXCOORD_2`` = ``(pivot.z, flutter)``

Unreal Engine 5 (glTF importer), Blender, Godot and three.js all read
these channels, so the pivot-wind material works everywhere.
"""

from __future__ import annotations

import json
import os
import struct

import numpy as np


def _pad(data: bytes) -> bytes:
    return data + b"\x00" * ((-len(data)) % 4)


def write_glb(path: str, result, write_leaves: bool = True):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    primitives_src = []

    bark = result.bark
    V = np.asarray(bark.verts(), np.float32)
    N = np.asarray(result.bark_normals, np.float32)
    UV = np.asarray(result.bark_uv, np.float32)
    C = np.asarray(result.bark_wind["color"], np.float32)
    P = np.asarray(result.bark_wind["pivot"], np.float32)
    FL = np.asarray(result.bark_wind["flutter"], np.float32)
    T = bark.triangulate().astype(np.uint32, copy=False)
    primitives_src.append(
        dict(name="bark", pos=V, nrm=N, uv=UV, col=C, piv=P, flu=FL, idx=T, mat=0)
    )
    if write_leaves and result.leaves is not None:
        lv = np.asarray(result.leaves.positions, np.float32)
        ln = np.asarray(result.leaves.normals, np.float32)
        luv = np.asarray(result.leaves.uvs, np.float32)
        lc = np.asarray(result.leaves.colors, np.float32)
        lp = np.asarray(result.leaves.pivots, np.float32)
        li = np.asarray(result.leaves.indices, np.uint32)
        primitives_src.append(
            dict(name="leaves", pos=lv, nrm=ln, uv=luv, col=lc, piv=lp,
                 flu=np.ones(len(lv), np.float32), idx=li, mat=1)
        )

    blob = bytearray()
    accessors = []
    buffer_views = []

    def push(arr: np.ndarray, comp: int, typ: str, mn=None, mx=None):
        off = len(blob)
        blob.extend(_pad(arr.tobytes()))
        buffer_views.append({"buffer": 0, "byteOffset": off, "byteLength": len(_pad(arr.tobytes()))})
        accessors.append(
            {
                "bufferView": len(buffer_views) - 1,
                "byteOffset": 0,
                "componentType": comp,
                "count": len(arr),
                "type": typ,
                **({"min": mn, "max": mx} if mn is not None else {}),
            }
        )
        return len(accessors) - 1

    meshes = []
    nodes = []
    for prim in primitives_src:
        pos = prim["pos"]
        a_pos = push(pos, 5126, "VEC3", pos.min(0).tolist(), pos.max(0).tolist())
        a_nrm = push(prim["nrm"], 5126, "VEC3")
        a_uv = push(prim["uv"], 5126, "VEC2")
        a_col = push(prim["col"], 5126, "VEC4")
        t1 = np.stack([prim["piv"][:, 0], prim["piv"][:, 1]], axis=1).astype(np.float32)
        t2 = np.stack([prim["piv"][:, 2], prim["flu"]], axis=1).astype(np.float32)
        a_t1 = push(t1, 5126, "VEC2")
        a_t2 = push(t2, 5126, "VEC2")
        a_idx = push(prim["idx"].ravel(), 5125, "SCALAR")
        meshes.append(
            {
                "name": prim["name"],
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": a_pos,
                            "NORMAL": a_nrm,
                            "TEXCOORD_0": a_uv,
                            "COLOR_0": a_col,
                            "TEXCOORD_1": a_t1,
                            "TEXCOORD_2": a_t2,
                        },
                        "indices": a_idx,
                        "material": prim["mat"],
                    }
                ],
            }
        )
        nodes.append({"mesh": len(meshes) - 1, "name": prim["name"]})

    gltf = {
        "asset": {"version": "2.0", "generator": "Frontier 0.1"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [
            {
                "name": "bark",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.42, 0.32, 0.24, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.95,
                },
            },
            {
                "name": "leaves",
                "doubleSided": True,
                "alphaMode": "MASK",
                "alphaCutoff": 0.5,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.25, 0.48, 0.20, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.9,
                },
            },
        ],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    js = _pad(json.dumps(gltf, separators=(",", ":")).encode())
    blob = _pad(bytes(blob))
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942))
        f.write(blob)
    return path
