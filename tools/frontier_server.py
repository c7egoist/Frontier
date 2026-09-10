#!/usr/bin/env python3
"""Frontier studio server: static viewer + parametric generation API.

Serves the viewer UI and generates trees on demand:

  GET  /api/spec?preset=oak     parameter spec + preset defaults
  POST /api/generate            {preset, seed, lod, values} -> tree JSON
  POST /api/export              {preset, seed, lod, values, format} -> .glb/.obj

Run:  python tools/frontier_server.py [--port 8123]
"""

import argparse
import io
import json
import math
import os
import sys
import tempfile
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "examples"))

from frontier.export_gltf import write_glb
from frontier.export_obj import write_obj
from frontier.generate import generate_tree
from frontier.presets import PRESETS, get_preset
from soft_render import render as soft_render_img

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# key, label, group, kind, min, max, step, target(dict), converter
SPECS = [
    # trunk
    ("trunk_len", "Trunk length", "Trunk", "float", 1.5, 7.0, 0.1, "skel", float),
    ("trunk_radius", "Trunk radius", "Trunk", "float", 0.08, 0.42, 0.01, "skel", float),
    ("tip_radius", "Twig radius", "Trunk", "float", 0.006, 0.03, 0.001, "skel", float),
    # branches
    ("max_depth", "Branch levels", "Branches", "int", 2, 6, 1, "skel", int),
    ("branch_angle", "Branch angle°", "Branches", "deg", 12, 120, 1, "skel", "deg2rad"),
    ("branch_angle_spread", "Angle spread°", "Branches", "deg", 0, 30, 1, "skel", "deg2rad"),
    ("len_decay", "Length decay", "Branches", "float", 0.40, 0.80, 0.01, "skel", float),
    ("lat_ratio", "Lateral thickness", "Branches", "float", 0.30, 0.65, 0.01, "skel", float),
    ("laterals", "Laterals / node", "Branches", "int", 0, 2, 1, "skel", int),
    ("laterals2_prob", "Extra lateral %", "Branches", "float", 0.0, 1.0, 0.05, "skel", float),
    ("segs", "Segments / branch", "Branches", "int", 3, 9, 1, "skel", int),
    ("curl", "Wander", "Branches", "float", 0.0, 0.35, 0.01, "skel", float),
    ("gravitrop", "Droop", "Branches", "float", 0.0, 0.08, 0.002, "skel", float),
    ("phototropism", "Upward bend", "Branches", "float", 0.0, 0.15, 0.005, "skel", float),
    ("upright", "Leader straightness", "Branches", "float", 0.0, 0.35, 0.01, "skel", float),
    ("tip_lift", "Tip lift", "Branches", "float", 0.0, 0.30, 0.01, "skel", float),
    ("crown_radius", "Crown width", "Branches", "float", 1.0, 3.5, 0.1, "skel", float),
    ("crown_height", "Crown height", "Branches", "float", 1.2, 4.5, 0.1, "skel", float),
    ("max_nodes", "Twig density", "Branches", "int", 800, 5000, 100, "skel", int),
    # foliage
    ("count", "Leaf cards", "Foliage", "int", 0, 4000, 50, "leaf", int),
    ("size", "Leaf size", "Foliage", "float", 0.05, 0.40, 0.01, "leaf", float),
    ("droop", "Leaf droop", "Foliage", "float", 0.0, 1.0, 0.05, "leaf", float),
    # bark surface
    ("undulation", "Bark wobble", "Bark", "float", 0.0, 0.08, 0.005, "mesh", float),
    ("flute_amp", "Trunk flutes", "Bark", "float", 0.0, 0.12, 0.005, "mesh", float),
    ("collar_parent", "Branch collar", "Bark", "float", 1.0, 1.25, 0.01, "mesh", float),
]
GROUPS = ["Trunk", "Branches", "Foliage", "Bark"]


def spec_for_preset(preset: str):
    skel, _rings, mesh, leaf = get_preset(preset)
    src = {"skel": skel, "mesh": mesh, "leaf": leaf}
    out = []
    for key, label, group, kind, lo, hi, step, target, _conv in SPECS:
        raw = src[target].get(key)
        if raw is None:
            continue
        val = math.degrees(raw) if kind == "deg" else raw
        out.append(
            {"key": key, "label": label, "group": group, "kind": kind,
             "min": lo, "max": hi, "step": step, "value": val, "target": target}
        )
    return {"preset": preset, "groups": GROUPS, "params": out,
            "presets": sorted(PRESETS)}


def split_values(values: dict):
    skel, mesh, leaf = {}, {}, {}
    tgt = {"skel": skel, "mesh": mesh, "leaf": leaf}
    kinds = {s[0]: s for s in SPECS}
    for key, val in (values or {}).items():
        spec = kinds.get(key)
        if spec is None:
            continue
        _k, _l, _g, kind, _lo, _hi, _st, target, conv = spec
        v = float(val)
        if kind == "int":
            v = int(round(v))
        elif conv == "deg2rad":
            v = math.radians(v)
        tgt[target][key] = v
    return skel, mesh, leaf


def build_viewer_payload(result):
    import numpy as np

    bark = result.bark
    V = np.asarray(bark.verts(), np.float32)
    rep = result.report
    data = {
        "meta": {
            "preset": result.preset, "seed": result.seed, "lod": result.lod,
            "valid": bool(rep.get("valid")),
            "verts": int(rep.get("verts", len(V))),
            "faces": int(rep.get("faces", 0)),
            "euler": int(rep.get("euler", 2)),
            "height": float(rep.get("height", 0.0)),
            "components": int(rep.get("components", 1)),
            "boundary_edges": int(rep.get("boundary_edges", 0)),
            "nonmanifold_edges": int(rep.get("nonmanifold_edges", 0)),
            "inconsistent_edges": int(rep.get("inconsistent_edges", 0)),
            "degenerate_faces": int(rep.get("degenerate_faces", 0)),
            "skeleton_nodes": int(rep.get("skeleton_nodes", 0)),
        },
        "bark": {
            "positions": V.tolist(),
            "normals": np.asarray(result.bark_normals, np.float32).tolist(),
            "uvs": np.asarray(result.bark_uv, np.float32).tolist(),
            "colors": np.asarray(result.bark_wind["color"], np.float32).tolist(),
            "pivots": np.asarray(result.bark_wind["pivot"], np.float32).tolist(),
            "flutter": np.asarray(result.bark_wind["flutter"], np.float32).tolist(),
            "indices": bark.triangulate().ravel().tolist(),
        },
    }
    if result.leaves is not None:
        L = result.leaves
        data["leaves"] = {
            "positions": np.asarray(L.positions, np.float32).tolist(),
            "normals": np.asarray(L.normals, np.float32).tolist(),
            "uvs": np.asarray(L.uvs, np.float32).tolist(),
            "colors": np.asarray(L.colors, np.float32).tolist(),
            "pivots": np.asarray(L.pivots, np.float32).tolist(),
            "indices": np.asarray(L.indices, np.int64).ravel().tolist(),
        }
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(ROOT, "viewer"), **kw)

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return json.loads(self.rfile.read(n).decode() or "{}")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/spec":
            q = urllib.parse.parse_qs(parsed.query)
            preset = q.get("preset", ["oak"])[0]
            try:
                return self._json(spec_for_preset(preset))
            except KeyError as e:
                return self._json({"error": str(e)}, 400)
        if parsed.path.startswith("/assets/"):
            # serve repo assets/ through the viewer server
            rel = parsed.path[len("/assets/"):]
            fpath = os.path.normpath(os.path.join(ROOT, "assets", rel))
            if not fpath.startswith(os.path.join(ROOT, "assets")) or not os.path.isfile(fpath):
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(os.path.getsize(fpath)))
            self.end_headers()
            with open(fpath, "rb") as f:
                self.wfile.write(f.read())
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/generate":
            try:
                body = self._read_json()
                skel, mesh, leaf = split_values(body.get("values"))
                r = generate_tree(
                    body.get("preset", "oak"), seed=int(body.get("seed", 1)),
                    lod=int(body.get("lod", 0)),
                    skel_override=skel, mesh_override=mesh, leaf_override=leaf,
                )
                return self._json(build_viewer_payload(r))
            except Exception as e:  # noqa: BLE001 - surfaced to UI
                import traceback

                traceback.print_exc()
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
        if parsed.path == "/api/preview":
            # Server-rendered 2D PNG fallback for browsers without WebGL.
            try:
                import numpy as np
                from PIL import Image

                body = self._read_json()
                skel, mesh, leaf = split_values(body.get("values"))
                r = generate_tree(
                    body.get("preset", "oak"), seed=int(body.get("seed", 1)),
                    lod=min(int(body.get("lod", 2)), 2),
                    skel_override=skel, mesh_override=mesh, leaf_override=leaf,
                )
                V = np.asarray(r.bark.verts(), float)
                F = np.asarray(r.bark.triangulate(), np.int64)
                N = np.asarray(r.bark_normals, float)
                bark_alb = np.array([0.62, 0.47, 0.34])
                if r.leaves is not None:
                    LP = np.asarray(r.leaves.positions, float)
                    LI = np.asarray(r.leaves.indices)
                    LN = np.asarray(r.leaves.normals, float)
                    VV = np.vstack([V, LP])
                    FF = np.vstack([F, LI + len(V)])
                    NN = np.vstack([N, LN])
                    alb = np.zeros((len(FF), 3))
                    alb[: len(F)] = bark_alb
                    alb[len(F):] = np.array([0.22, 0.45, 0.18])
                    ao_full = np.concatenate(
                        [np.asarray(r.bark_wind["ao"], float), np.ones(len(LP))])
                    img = soft_render_img(VV, FF, NN, alb, ao=ao_full,
                                          size=(700, 860), bg=(236, 231, 219))
                else:
                    ao = np.asarray(r.bark_wind["ao"], float)
                    img = soft_render_img(V, F, N, bark_alb, ao=ao,
                                          size=(700, 860), bg=(236, 231, 219))
                buf = io.BytesIO()
                Image.fromarray(img).save(buf, format="PNG")
                data = buf.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:  # noqa: BLE001
                import traceback

                traceback.print_exc()
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
            return
        if parsed.path == "/api/export":
            try:
                body = self._read_json()
                fmt = body.get("format", "glb")
                skel, mesh, leaf = split_values(body.get("values"))
                r = generate_tree(
                    body.get("preset", "oak"), seed=int(body.get("seed", 1)),
                    lod=int(body.get("lod", 0)),
                    skel_override=skel, mesh_override=mesh, leaf_override=leaf,
                )
                with tempfile.TemporaryDirectory() as d:
                    if fmt == "obj":
                        outp = os.path.join(d, "tree.obj")
                        write_obj(outp, r)
                        data = open(outp, "rb").read()
                        ctype, fname = "text/plain", "frontier_tree.obj"
                    else:
                        outp = os.path.join(d, "tree.glb")
                        write_glb(outp, r)
                        data = open(outp, "rb").read()
                        ctype, fname = "model/gltf-binary", "frontier_tree.glb"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Disposition", f"attachment; filename={fname}")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:  # noqa: BLE001
                import traceback

                traceback.print_exc()
                return self._json({"error": f"{type(e).__name__}: {e}"}, 500)
            return
        return self.send_error(404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8123)
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("0.0.0.0", a.port), Handler)
    print(f"[frontier] studio at http://0.0.0.0:{a.port}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
