"""Compact JSON export for the dependency-free WebGL viewer."""

from __future__ import annotations

import json
import os

import numpy as np


def write_viewer_json(path: str, result):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    bark = result.bark
    V = np.asarray(bark.verts(), np.float32)
    N = np.asarray(result.bark_normals, np.float32)
    C = np.asarray(result.bark_wind["color"], np.float32)
    P = np.asarray(result.bark_wind["pivot"], np.float32)
    FL = np.asarray(result.bark_wind["flutter"], np.float32)
    T = bark.triangulate().astype(np.int64, copy=False)
    data = {
        "meta": {
            "preset": result.preset,
            "seed": result.seed,
            "lod": result.lod,
            "valid": bool(result.report.get("valid")),
        },
        "bark": {
            "positions": V.tolist(),
            "normals": N.tolist(),
            "colors": C.tolist(),
            "pivots": P.tolist(),
            "flutter": FL.tolist(),
            "indices": T.ravel().tolist(),
        },
    }
    if result.leaves is not None:
        L = result.leaves
        data["leaves"] = {
            "positions": np.asarray(L.positions, np.float32).tolist(),
            "normals": np.asarray(L.normals, np.float32).tolist(),
            "colors": np.asarray(L.colors, np.float32).tolist(),
            "pivots": np.asarray(L.pivots, np.float32).tolist(),
            "indices": np.asarray(L.indices, np.int64).ravel().tolist(),
        }
    with open(path, "w") as f:
        json.dump(data, f)
    return path
