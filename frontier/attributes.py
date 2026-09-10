"""Per-vertex attributes: normals, UVs, wind data, colors, AO.

Wind model ("Frontier pivot wind", Unreal/ enclose friendly)
------------------------------------------------------------
Every vertex stores:

* ``wind_weight`` in ``[0, 1]`` — 0 at the root flare, 1 at twig tips.
  Grows with normalized height AND with thinning radius so the trunk
  stays near-rigid while twigs flutter.
* ``branch_phase`` in ``[0, 1)`` — stable random value per branch so
  neighbouring branches sway out of sync.
* ``pivot`` (vec3) — world position of the base of the vertex's branch
  (the point the branch rotates around). Stored into extra UV channels
  on export: ``UV2 = (pivot.x, pivot.y)``, ``UV3 = (pivot.z, phase)``.
* ``flutter`` — extra high-frequency amount (twigs/leaves only).

A vertex-color friendly packing (``COLOR_0``) is also produced::

    R = wind_weight, G = branch_phase, B = cavity AO, A = level01

where ``level01 = depth / max_depth``.
"""

from __future__ import annotations

from typing import Dict

import numpy as np

from frontier.meshing import K_CAP, K_CROTCH, K_JUNCTION, Mesh
from frontier.skeleton import Skeleton


def _accumulate_corners(V: np.ndarray, F: np.ndarray, N: np.ndarray):
    """Add (flat face normal * corner angle) into N for faces F (vectorized)."""
    if len(F) == 0:
        return
    p0, p1, p2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    ln = np.linalg.norm(fn, axis=1)
    ln[ln < 1e-12] = 1.0
    fn = fn / ln[:, None]
    k = F.shape[1]
    for j in range(k):
        cur = V[F[:, j]]
        a = V[F[:, (j - 1) % k]] - cur
        b = V[F[:, (j + 1) % k]] - cur
        la = np.linalg.norm(a, axis=1)
        lb = np.linalg.norm(b, axis=1)
        la[la < 1e-12] = 1.0
        lb[lb < 1e-12] = 1.0
        cosang = np.sum(a / la[:, None] * (b / lb[:, None]), axis=1)
        ang = np.arccos(np.clip(cosang, -1.0, 1.0))
        np.add.at(N, F[:, j], fn * ang[:, None])


def compute_normals(mesh: Mesh) -> np.ndarray:
    """Angle-weighted smooth vertex normals (vectorized)."""
    V = mesh.verts()
    N = np.zeros_like(V)
    if mesh.quads:
        _accumulate_corners(V, np.asarray(mesh.quads, dtype=np.int64), N)
    if mesh.tris:
        _accumulate_corners(V, np.asarray(mesh.tris, dtype=np.int64), N)
    L = np.linalg.norm(N, axis=1)
    L[L < 1e-12] = 1.0
    return N / L[:, None]


def compute_uvs(mesh: Mesh, skel: Skeleton, uv_scale: float = 2.0) -> np.ndarray:
    """Cylindrical bark UVs: u around the ring (3 tiles/turn), v along arclength."""
    n = len(mesh.positions)
    uv = np.zeros((n, 2))
    for i in range(n):
        nid = mesh.v_node[i]
        over = mesh.v_arc[i] if i < len(mesh.v_arc) else None
        if over is not None:
            arc = over
        else:
            arc = skel.nodes[nid].arclen if 0 <= nid < len(skel.nodes) else 0.0
        uv[i, 0] = mesh.v_u[i] * 3.0
        uv[i, 1] = arc / max(uv_scale, 1e-6)
    return uv


def _branch_bases(skel: Skeleton) -> Dict[int, np.ndarray]:
    """branch_id -> position of the branch base (pivot)."""
    bases: Dict[int, list] = {}
    for node in skel.nodes:
        bases.setdefault(node.branch_id, []).append(node)
    out = {}
    for bid, nodes in bases.items():
        # base = node of this branch closest to the root
        base = min(nodes, key=lambda nd: nd.arclen)
        out[bid] = base.pos.copy()
    return out


def compute_wind(
    mesh: Mesh,
    skel: Skeleton,
    seed: int = 1,
    height_power: float = 1.6,
    radius_mix: float = 0.45,
) -> Dict[str, np.ndarray]:
    """Wind attributes per vertex (see module docstring)."""
    rng = np.random.default_rng(seed + 7919)
    n = len(mesh.positions)
    weight = np.zeros(n)
    phase = np.zeros(n)
    flutter = np.zeros(n)
    pivot = np.zeros((n, 3))
    level01 = np.zeros(n)
    ao = np.ones(n)

    H = max(skel.height(), 1e-6)
    y0 = min(nd.pos[1] for nd in skel.nodes)
    R = max(skel.nodes[skel.root].radius, 1e-6)
    max_depth = max(skel.max_depth(), 1)
    bases = _branch_bases(skel)
    branch_phase = {bid: float(rng.random()) for bid in bases}

    for i in range(n):
        nid = mesh.v_node[i]
        node = skel.nodes[nid] if 0 <= nid < len(skel.nodes) else None
        if node is None:
            continue
        h = (node.pos[1] - y0) / H
        thin = 1.0 - min(node.radius / R, 1.0)
        w = (h**height_power) * (1.0 - radius_mix) + (thin**1.25) * radius_mix
        # crotches/junctions ride with the wood: slightly stiffen
        if mesh.v_kind[i] == K_CROTCH:
            w *= 0.9
        weight[i] = float(np.clip(w, 0.0, 1.0))
        ph = branch_phase.get(node.branch_id, 0.0)
        phase[i] = ph
        pivot[i] = bases.get(node.branch_id, node.pos)
        level01[i] = node.depth / max_depth
        # cavity AO: thin + deep + crotch => darker
        cav = 1.0 - 0.35 * thin - 0.15 * (node.depth / max_depth)
        if mesh.v_kind[i] in (K_CROTCH, K_JUNCTION):
            cav -= 0.12
        if mesh.v_kind[i] == K_CAP:
            cav -= 0.1
        ao[i] = float(np.clip(cav, 0.25, 1.0))
        fl = thin**2 * (0.4 + 0.6 * (node.depth / max_depth))
        flutter[i] = float(np.clip(fl, 0.0, 1.0))

    color = np.stack(
        [
            weight,
            phase,
            ao,
            np.clip(level01, 0.0, 1.0),
        ],
        axis=1,
    ).astype(np.float32)
    return {
        "weight": weight.astype(np.float32),
        "phase": phase.astype(np.float32),
        "flutter": flutter.astype(np.float32),
        "pivot": pivot.astype(np.float32),
        "level01": level01.astype(np.float32),
        "ao": ao.astype(np.float32),
        "color": color,
    }


def quad_leaf_uv_and_color(n: int, weight: float, phase: float):
    """Helper for leaf cards (constant wind values per card)."""
    color = np.zeros((n, 4), dtype=np.float32)
    color[:, 0] = weight
    color[:, 1] = phase
    color[:, 2] = 1.0
    color[:, 3] = 1.0
    return color
