#!/usr/bin/env python3
"""Frontier command line: generate / batch / presets.

Examples
--------
  python tools/frontier_cli.py generate --preset oak --seed 1 --out out/oak_01
  python tools/frontier_cli.py generate --preset pine --seed 2 --lod 0,1,2 --format glb,obj --out out/pine_02
  python tools/frontier_cli.py batch --preset birch --seeds 1-8 --out out/birch_set
  python tools/frontier_cli.py presets
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from frontier.export_gltf import write_glb
from frontier.export_obj import write_obj
from frontier.generate import generate_tree
from frontier.presets import PRESETS
from frontier.validate import MeshValidationError, assert_valid
from frontier.viewer_export import write_viewer_json


def _parse_seed_list(s: str):
    out = []
    for part in s.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    return out


def cmd_generate(a):
    formats = [f.strip() for f in a.format.split(",")]
    lods = [int(x) for x in str(a.lod).split(",")]
    os.makedirs(a.out, exist_ok=True)
    summary = []
    for lod in lods:
        print(f"[frontier] {a.preset} seed={a.seed} lod={lod} ...", flush=True)
        r = generate_tree(a.preset, seed=a.seed, lod=lod)
        try:
            assert_valid(r.bark, f"{a.preset} seed={a.seed} lod={lod}")
            print("           valid: single watertight manifold, genus 0")
        except MeshValidationError as e:
            print("           VALIDATION FAILED:", e)
            if a.strict:
                raise
        stem = os.path.join(a.out, f"{a.preset}_{a.seed:02d}_lod{lod}")
        for fmt in formats:
            if fmt == "glb":
                write_glb(stem + ".glb", r, write_leaves=not a.no_leaves)
                print("           wrote", stem + ".glb")
            elif fmt == "obj":
                write_obj(stem + ".obj", r, write_leaves=not a.no_leaves)
                print("           wrote", stem + ".obj")
            elif fmt == "viewer":
                write_viewer_json(stem + ".viewer.json", r)
                print("           wrote", stem + ".viewer.json")
            else:
                raise SystemExit(f"unknown format {fmt!r}")
        rep = dict(r.report)
        rep["files"] = [stem + "." + f if f != "viewer" else stem + ".viewer.json" for f in formats]
        summary.append(rep)
    with open(os.path.join(a.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    v = summary[0]
    print(f"[frontier] done: V={v['verts']} F={v['faces']} euler={v['euler']} H={v['height']:.2f}m")


def cmd_batch(a):
    seeds = _parse_seed_list(a.seeds)
    for s in seeds:
        a.seed = s
        sub = os.path.join(a.out, f"seed_{s:02d}")
        a.out, old = sub, a.out
        try:
            cmd_generate(a)
        finally:
            a.out = old


def cmd_presets(_a):
    print("presets:", ", ".join(sorted(PRESETS)))


def main():
    ap = argparse.ArgumentParser(prog="frontier", description="Frontier tree generator")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--preset", default="oak")
    g.add_argument("--seed", type=int, default=1)
    g.add_argument("--lod", default="0")
    g.add_argument("--format", default="glb,obj,viewer")
    g.add_argument("--out", required=True)
    g.add_argument("--no-leaves", action="store_true")
    g.add_argument("--strict", action="store_true")
    g.set_defaults(fn=cmd_generate)
    b = sub.add_parser("batch")
    b.add_argument("--preset", default="oak")
    b.add_argument("--seeds", default="1-4")
    b.add_argument("--lod", default="0")
    b.add_argument("--format", default="glb,viewer")
    b.add_argument("--out", required=True)
    b.add_argument("--no-leaves", action="store_true")
    b.add_argument("--strict", action="store_true")
    b.set_defaults(fn=cmd_batch)
    p = sub.add_parser("presets")
    p.set_defaults(fn=cmd_presets)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
