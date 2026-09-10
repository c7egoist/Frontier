"""Simple quad-leaf cards merged into ONE leaf mesh.

The bark mesh stays a clean manifold; leaves are a second single mesh
(standard AAA practice: opaque bark draw call + alpha-tested leaf cards).
Each card carries the same wind packing as bark (weight ~ 1 at tips,
random phase per card) so the whole crown flutters coherently.
"""

from __future__ import annotations

import numpy as np

from dataclasses import dataclass

from frontier.math3d import normalize
from frontier.skeleton import Skeleton


@dataclass
class LeafMeshData:
    positions: object = None  # (N,3) float32
    normals: object = None
    uvs: object = None
    colors: object = None  # wind packing RGBA
    indices: object = None  # (M,3)
    pivots: object = None


def build_leaf_mesh(skel: Skeleton, params: dict, seed: int = 1) -> LeafMeshData:
    rng = np.random.default_rng(seed + 31)
    count = int(params.get("count", 800))
    size = float(params.get("size", 0.15))
    spread = float(params.get("size_spread", 0.05))
    min_depth = int(params.get("min_depth", 2))
    cross = int(params.get("cross", 2))
    droop = float(params.get("droop", 0.35))

    cands = [n for n in skel.nodes if n.depth >= min_depth and len(n.children) <= 1]
    if not cands:
        cands = [n for n in skel.nodes if len(n.children) == 0]
    if not cands:
        cands = skel.nodes

    max_depth = max(skel.max_depth(), 1)
    R = max(skel.nodes[skel.root].radius, 1e-6)
    H = max(skel.height(), 1e-6)
    y0 = min(n.pos[1] for n in skel.nodes)
    # cluster foliage at twig tips: terminals + deep nodes get most cards
    w = np.array(
        [1.0 + 3.0 * (len(n.children) == 0) + 2.0 * (n.depth / max_depth) for n in cands],
        dtype=np.float64,
    )
    w /= w.sum()
    pick = rng.choice(len(cands), size=count, p=w)

    P, N_, UV, C, I, PV = [], [], [], [], [], []
    vi = 0
    for i in range(count):
        node = cands[int(pick[i])]
        s = max(size + rng.normal(0, spread), size * 0.35)
        # anchor at the twig, biased outward along the growth direction
        anchor = node.pos + node.tangent * rng.uniform(0.0, 0.22) + rng.normal(0, 0.035, 3)
        weight = float(np.clip(0.75 + 0.25 * (node.pos[1] - y0) / H + 0.1 * node.depth / max_depth, 0, 1))
        phase = float(rng.random())
        pivot = node.pos.copy()
        # card basis: random yaw, droop tilt
        yaw = rng.uniform(0, 2 * np.pi)
        tilt = rng.uniform(-0.2, 0.2) - droop * rng.uniform(0.2, 0.9)
        right = np.array([np.cos(yaw), 0.0, np.sin(yaw)])
        fwd = np.array([-np.sin(yaw), 0.0, np.cos(yaw)])
        up = normalize(np.array([0.0, 1.0, 0.0]) + fwd * tilt + rng.normal(0, 0.15, 3))
        n_cards = max(cross, 1)
        for k in range(n_cards):
            ang = (np.pi / n_cards) * k + rng.uniform(-0.15, 0.15)
            r = right * np.cos(ang) + fwd * np.sin(ang)
            u = np.cross(r, up)
            if np.linalg.norm(u) < 1e-6:
                u = np.array([0.0, 1.0, 0.0])
            u = normalize(u)
            nrm = normalize(np.cross(r, u))
            hw, hh = s * 0.5, s * 0.5
            # pivot at stem (bottom middle) so cards rotate from the twig
            corners = [
                anchor - r * hw,
                anchor + r * hw,
                anchor + r * hw + u * s,
                anchor - r * hw + u * s,
            ]
            for q, (cx, cy) in zip(corners, [(0, 0), (1, 0), (1, 1), (0, 1)]):
                P.append(q)
                N_.append(nrm)
                UV.append((cx, cy))
                C.append((weight, phase, 1.0, 1.0))
                PV.append(pivot)
            I.append((vi, vi + 1, vi + 2))
            I.append((vi, vi + 2, vi + 3))
            vi += 4

    return LeafMeshData(
        positions=np.array(P, dtype=np.float32),
        normals=np.array(N_, dtype=np.float32),
        uvs=np.array(UV, dtype=np.float32),
        colors=np.array(C, dtype=np.float32),
        indices=np.array(I, dtype=np.int64),
        pivots=np.array(PV, dtype=np.float32),
    )
