"""Mesh integrity validation: the "no compromise" gate.

A Frontier bark mesh must be:

* **closed** — every edge is shared by exactly 2 faces (no boundary),
* **manifold** — no edge with 3+ faces, no inconsistent winding,
* **one component** — a single connected surface,
* **genus 0** — ``V - E + F == 2`` (topological ball, like a real trunk),
* **clean** — no NaN, no degenerate faces.

:func:`validate_mesh` returns a report dict; :func:`assert_valid` raises
on failure (used by tests and the CLI ``--strict`` flag).
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from frontier.math3d import signed_volume_of_closed_mesh
from frontier.meshing import Mesh


class MeshValidationError(RuntimeError):
    pass


def _faces(mesh: Mesh) -> List[Tuple[int, ...]]:
    return [tuple(q) for q in mesh.quads] + [tuple(t) for t in mesh.tris]


def _directed_edges(F: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """All directed edges of faces F (n,k) -> (edges (m,2), face_ids (m,))."""
    n, k = F.shape
    E = np.stack([F[:, j] for j in range(k)] + [F[:, 0]], axis=1)
    edges = np.stack([E[:, :-1].ravel(), E[:, 1:].ravel()], axis=1)
    fids = np.repeat(np.arange(n), k)
    return edges, fids


def validate_mesh(mesh: Mesh) -> Dict:
    V = mesh.verts()
    Q = np.asarray(mesh.quads, dtype=np.int64).reshape(-1, 4) if mesh.quads else np.zeros((0, 4), np.int64)
    T = np.asarray(mesh.tris, dtype=np.int64).reshape(-1, 3) if mesh.tris else np.zeros((0, 3), np.int64)
    n_faces = len(Q) + len(T)
    report: Dict = {
        "verts": len(V),
        "quads": len(Q),
        "tris": len(T),
        "faces": n_faces,
    }
    # NaN / Inf
    report["nan_verts"] = int(np.isnan(V).sum() + np.isinf(V).sum())

    # degenerate faces (vectorized area check)
    deg = 0
    if len(T):
        a2 = np.linalg.norm(np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]]), axis=1)
        deg += int(np.sum(a2 < 1e-14))
        deg += int(np.sum((T[:, 0] == T[:, 1]) | (T[:, 1] == T[:, 2]) | (T[:, 2] == T[:, 0])))
    if len(Q):
        a2 = np.linalg.norm(np.cross(V[Q[:, 1]] - V[Q[:, 0]], V[Q[:, 2]] - V[Q[:, 0]]), axis=1)
        a2 += np.linalg.norm(np.cross(V[Q[:, 2]] - V[Q[:, 0]], V[Q[:, 3]] - V[Q[:, 0]]), axis=1)
        deg += int(np.sum(a2 < 1e-14))
    report["degenerate_faces"] = deg

    # directed edges of every face, grouped by undirected key
    parts_e, parts_f = [], []
    if len(Q):
        e, f = _directed_edges(Q)
        parts_e.append(e)
        parts_f.append(f)
    if len(T):
        e, f = _directed_edges(T)
        parts_e.append(e)
        parts_f.append(f + len(Q))
    if parts_e:
        E = np.concatenate(parts_e, axis=0)
        Fids = np.concatenate(parts_f, axis=0)
    else:
        E = np.zeros((0, 2), np.int64)
        Fids = np.zeros((0,), np.int64)
    lo = np.minimum(E[:, 0], E[:, 1])
    hi = np.maximum(E[:, 0], E[:, 1])
    sgn = np.where(E[:, 0] < E[:, 1], 1, -1).astype(np.int8)
    order = np.lexsort((hi, lo))
    lo, hi, sgn, Fids = lo[order], hi[order], sgn[order], Fids[order]
    change = np.ones(len(lo), bool)
    if len(lo):
        change[1:] = (lo[1:] != lo[:-1]) | (hi[1:] != hi[:-1])
    starts = np.flatnonzero(change)
    run_len = np.diff(np.concatenate([starts, [len(lo)]]))
    n_edges = len(starts)
    report["edges"] = int(n_edges)
    report["boundary_edges"] = int(np.sum(run_len == 1))
    report["nonmanifold_edges"] = int(np.sum(run_len > 2))
    # winding consistency for 2-runs: signs must differ
    two = starts[run_len == 2]
    report["inconsistent_edges"] = int(np.sum(sgn[two] == sgn[two + 1])) if len(two) else 0
    report["closed"] = bool(report["boundary_edges"] == 0 and report["nonmanifold_edges"] == 0)
    report["oriented"] = bool(report["inconsistent_edges"] == 0)

    # euler
    euler = len(V) - n_edges + n_faces
    report["euler"] = int(euler)
    report["genus0"] = bool(euler == 2)

    # components via union-find over shared edges
    parent = np.arange(n_faces)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    if len(two):
        fa, fb = Fids[two], Fids[two + 1]
        for a, b in zip(fa.tolist(), fb.tolist()):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
    comps = len({find(i) for i in range(n_faces)}) if n_faces else 0
    report["components"] = int(comps)
    report["single_component"] = bool(comps == 1)

    # volume sign
    if n_faces:
        report["signed_volume"] = float(signed_volume_of_closed_mesh(V, mesh.triangulate()))
    else:
        report["signed_volume"] = 0.0
    report["outward"] = bool(report["signed_volume"] > 0)

    ok = (
        report["nan_verts"] == 0
        and report["degenerate_faces"] == 0
        and report["closed"]
        and report["oriented"]
        and report["genus0"]
        and report["single_component"]
        and report["outward"]
    )
    report["valid"] = bool(ok)
    return report


def assert_valid(mesh: Mesh, label: str = "mesh"):
    report = validate_mesh(mesh)
    if not report["valid"]:
        bad = {k: v for k, v in report.items() if k not in ("signed_volume",)}
        raise MeshValidationError(f"{label} FAILED validation: {bad}")
    return report
