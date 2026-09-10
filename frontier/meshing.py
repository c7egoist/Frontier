"""Single-mesh fused-branch meshing.

This module turns a :class:`~frontier.skeleton.Skeleton` into ONE closed,
manifold triangle/quad mesh in which every branch is topologically fused
to its parent (an ``L``-style welded junction with a closed junction loop
— never an ``I``-style intersecting placed tube).

Technique — "webbed Y" (pair-of-pants) junctions
-----------------------------------------------
At every binary junction J (parent P, children C1, C2) we build:

* a parent-side ring ``P`` (``2a`` verts) just before J,
* two child-side rings ``L1`` (``2b1+1`` verts) and ``L2`` (``2b2+1``
  verts) just past J, sharing ONE crotch vertex ``C`` between the two
  children (the fork notch),
* a front disk and a back disk of pure quads bridging the parent arcs to
  the concatenated child arcs (``a = b1 + b2``), plus two small side
  triangles closing the outer elbows.

Straight runs of rings are lofted with quads; rings with different vertex
counts are joined with a "dart" bridge (mostly quads + a few triangles).
The whole tree — trunk, branches, twigs — is therefore a single closed
surface of genus 0 (``V - E + F == 2``), which bends under wind without
ever cracking open at the junctions.

Winding: faces are CCW seen from outside. :func:`Mesh.ensure_outward`
flips the mesh if the signed volume is negative (safety net; the
construction itself already produces outward faces).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

from frontier.math3d import (
    make_frame,
    newell_normal,
    normalize,
    perp_in_plane,
    signed_volume_of_closed_mesh,
    slerp_dir,
)
from frontier.skeleton import Skeleton


class JunctionError(RuntimeError):
    pass


# vertex kinds (for attributes / relaxation)
K_TUBE = 0
K_JUNCTION = 1
K_CROTCH = 2
K_CAP = 3


@dataclass
class RingInfo:
    indices: List[int]
    center: np.ndarray
    radius: float
    tangent: np.ndarray


class Mesh:
    def __init__(self):
        self.positions: List[np.ndarray] = []
        self.quads: List[Tuple[int, int, int, int]] = []
        self.tris: List[Tuple[int, int, int]] = []
        # per-vertex tags for attributes
        self.v_node: List[int] = []
        self.v_u: List[float] = []  # angular fraction around ring
        self.v_kind: List[int] = []
        self.v_center: List[np.ndarray] = []  # ring center (radial ref)
        self.flipped_by_guard = False

    # -- construction ------------------------------------------------ #
    def add_vert(self, pos, node=-1, u=0.0, kind=K_TUBE, center=None) -> int:
        pos = np.asarray(pos, dtype=np.float64).reshape(3)
        self.positions.append(pos)
        self.v_node.append(int(node))
        self.v_u.append(float(u))
        self.v_kind.append(int(kind))
        self.v_center.append(
            np.asarray(center if center is not None else pos, dtype=np.float64).reshape(3)
        )
        return len(self.positions) - 1

    def add_quad(self, a, b, c, d):
        if len({a, b, c, d}) < 4:
            return
        self.quads.append((a, b, c, d))

    def add_tri(self, a, b, c):
        if len({a, b, c}) < 3:
            return
        self.tris.append((a, b, c))

    # -- queries ----------------------------------------------------- #
    def verts(self) -> np.ndarray:
        return np.array(self.positions, dtype=np.float64)

    def triangulate(self) -> np.ndarray:
        out = [t for t in self.tris]
        for (a, b, c, d) in self.quads:
            out.append((a, b, c))
            out.append((a, c, d))
        return np.array(out, dtype=np.int64)

    def face_count(self) -> int:
        return len(self.quads) + len(self.tris)

    def ensure_outward(self) -> bool:
        """Flip all faces if signed volume is negative. Returns flipped?"""
        V = self.verts()
        T = self.triangulate()
        if len(T) == 0:
            return False
        vol = signed_volume_of_closed_mesh(V, T)
        if vol < 0:
            self.quads = [(a, d, c, b) for (a, b, c, d) in self.quads]
            self.tris = [(a, c, b) for (a, b, c) in self.tris]
            self.flipped_by_guard = True
            return True
        return False


# --------------------------------------------------------------------------- #
# bridges
# --------------------------------------------------------------------------- #


def _align_loop_starts(V: np.ndarray, A: List[int], B: List[int]) -> List[int]:
    """Rotate loop B so its seam best matches loop A's seam."""
    n, m = len(A), len(B)
    Apos = V[np.array(A)]
    Bpos = V[np.array(B)]
    if n == m:
        best_k, best = 0, float("inf")
        for k in range(m):
            idx = [(j + k) % m for j in range(m)]
            d = float(np.sum((Apos - Bpos[idx]) ** 2))
            if d < best:
                best, best_k = d, k
        return [B[(j + best_k) % m] for j in range(m)]
    k = int(np.argmin(np.sum((Bpos - Apos[0]) ** 2, axis=1)))
    return [B[(j + k) % m] for j in range(m)]


def bridge_loops(mesh: Mesh, A: List[int], B: List[int]):
    """Bridge closed loop A (root side) to closed loop B (tip side).

    Equal counts -> pure quads. Unequal counts -> "dart" walk mixing
    quads and triangles. Always manifold.
    """
    V = mesh.verts()
    B = _align_loop_starts(V, A, B)
    n, m = len(A), len(B)
    A2 = A + [A[0]]
    B2 = B + [B[0]]
    i = j = 0
    guard = 0
    while (i < n or j < m) and guard < n + m + 8:
        guard += 1
        inext = (i + 1) / n if i < n else float("inf")
        jnext = (j + 1) / m if j < m else float("inf")
        if abs(inext - jnext) < 1e-12:
            mesh.add_quad(A2[i], A2[i + 1], B2[j + 1], B2[j])
            i += 1
            j += 1
        elif inext < jnext:
            mesh.add_tri(A2[i], A2[i + 1], B2[j])
            i += 1
        else:
            mesh.add_tri(A2[i], B2[j + 1], B2[j])
            j += 1


# --------------------------------------------------------------------------- #
# rings
# --------------------------------------------------------------------------- #


def surface_radius(u: float, arclen: float, base_r: float, surf: Dict | None) -> float:
    """Bark surface detail: root flare + buttress lobes + trunk flutes.

    Pure radial displacement, so topology/manifoldness is untouched.
    """
    r = base_r
    if not surf:
        return r
    trunk_r = max(float(surf.get("trunk_r", base_r)), 1e-6)
    if surf.get("flare", True):
        over = flare_factor(arclen, trunk_r) - 1.0
        if over > 1e-4:
            lobes = max(int(surf.get("buttress_lobes", 6)), 1)
            lamp = float(surf.get("buttress_amp", 0.30))
            lobe = 1.0 + lamp * np.cos(2.0 * np.pi * u * lobes) * float(
                np.exp(-arclen / (0.8 * trunk_r))
            )
            r *= 1.0 + over * max(lobe, 0.25)
    flute_amp = float(surf.get("flute_amp", 0.0))
    if flute_amp > 0:
        flutes = max(int(surf.get("flutes", 9)), 2)
        twist = float(surf.get("flute_twist", 1.4))
        mask = min(max((base_r - 0.22 * trunk_r) / (0.45 * trunk_r), 0.0), 1.0)
        mask = mask * mask * (3.0 - 2.0 * mask)
        r *= 1.0 + flute_amp * mask * np.sin(2.0 * np.pi * u * flutes + arclen * twist)
    return r


def add_tube_ring(
    mesh: Mesh,
    center,
    radius: float,
    frame_n,
    frame_b,
    n: int,
    node_id: int,
    undulation: float = 0.0,
    arclen: float = 0.0,
    surf: Dict | None = None,
) -> RingInfo:
    center = np.asarray(center, dtype=np.float64).reshape(3)
    t = normalize(np.cross(frame_n, frame_b))
    idx = []
    for j in range(n):
        th = 2.0 * np.pi * j / n
        direction = np.cos(th) * np.asarray(frame_n) + np.sin(th) * np.asarray(frame_b)
        direction = normalize(direction)
        r = surface_radius(j / n, arclen, radius, surf)
        if undulation > 0:
            wob = np.sin(arclen * 2.1 + j * 2.39996) * 0.6 + np.sin(arclen * 5.7 + j * 1.3) * 0.4
            r = r * (1.0 + undulation * wob)
        p = center + direction * r
        idx.append(mesh.add_vert(p, node=node_id, u=j / n, kind=K_TUBE, center=center))
    return RingInfo(indices=idx, center=center, radius=radius, tangent=t)


# --------------------------------------------------------------------------- #
# junctions
# --------------------------------------------------------------------------- #


def _junction_plane_normal(u0, u1, u2) -> np.ndarray:
    w = np.cross(u1, u2)
    if np.linalg.norm(w) < 1e-6:
        w = np.cross(u0, u1)
    if np.linalg.norm(w) < 1e-6:
        w = np.cross(u0, u2)
    if np.linalg.norm(w) < 1e-6:
        # all collinear: arbitrary perpendicular
        _t, n, _b = make_frame(u0)
        return n
    return normalize(w)


def build_junction(
    mesh: Mesh,
    skel: Skeleton,
    jid: int,
    prev_center,
    undulation: float = 0.0,
    mesh_opts: Dict | None = None,
) -> Tuple[RingInfo, Dict[int, RingInfo]]:
    """Build the fused Y junction at node `jid`.

    Returns (parent_ring, {child_id: child_ring}).
    """
    Jn = skel.nodes[jid]
    assert len(Jn.children) == 2
    c1, c2 = Jn.children
    C1n, C2n = skel.nodes[c1], skel.nodes[c2]
    J = Jn.pos
    if Jn.parent is not None:
        P = skel.nodes[Jn.parent].pos
        u0 = normalize(J - P)
    else:
        u0 = None  # root junction: no incoming tube
    u1 = normalize(C1n.pos - J)
    u2 = normalize(C2n.pos - J)
    r0, r1, r2 = Jn.radius, C1n.radius, C2n.radius
    prev_center = np.asarray(prev_center, dtype=np.float64).reshape(3)

    collar_parent = float(mesh_opts.get("collar_parent", 1.12)) if isinstance(mesh_opts, dict) else 1.12
    collar_child = float(mesh_opts.get("collar_child", 1.06)) if isinstance(mesh_opts, dict) else 1.06
    mo = mesh_opts if isinstance(mesh_opts, dict) else {}
    surf: Dict = {
        "trunk_r": skel.nodes[skel.root].radius,
        "flare": bool(mo.get("flare", True)),
        "buttress_lobes": int(mo.get("buttress_lobes", 6)),
        "buttress_amp": float(mo.get("buttress_amp", 0.30)),
        "flutes": int(mo.get("flutes", 9)),
        "flute_amp": float(mo.get("flute_amp", 0.055)),
        "flute_twist": float(mo.get("flute_twist", 1.4)),
    }
    # collar swelling (branch collar like real trees) also keeps the throat full
    R0, R1, R2 = r0 * collar_parent, r1 * collar_child, r2 * collar_child

    u0ref = u0 if u0 is not None else -normalize(u1 + u2 + 1e-9)
    w = _junction_plane_normal(u0ref, u1, u2)

    # -- resolution -------------------------------------------------- #
    a = max(4, int(round(Jn.ring_n / 2)))
    frac = r1 / max(r1 + r2, 1e-9)
    b1 = min(max(int(round(a * frac)), 2), a - 2)
    b2 = a - b1
    n0 = 2 * a

    u0v = u0 if u0 is not None else -normalize(u1 + u2 + 1e-9)

    # fork bisector (points between the children, away from J)
    m = u1 + u2
    if np.linalg.norm(m) < 1e-6:
        m = normalize(u0v)
    else:
        m = normalize(m)

    # -- parent ring center ------------------------------------------ #
    dist_prev = float(np.linalg.norm(J - prev_center))
    h0 = min(r0 * 1.0, 0.4 * max(dist_prev, 1e-6))
    h0 = max(h0, 1e-5)
    C0 = J - u0v * h0

    # -- child ring centers: pushed out so the two rings separate ---- #
    # (overlapping rings near J would cinch the throat into an hourglass)
    e1 = float(np.linalg.norm(C1n.pos - J))
    e2 = float(np.linalg.norm(C2n.pos - J))
    half_angle = np.arccos(float(np.clip(np.dot(u1, u2), -1.0, 1.0))) * 0.5
    sin_half = max(np.sin(half_angle), 0.30)
    o_want = (R1 + R2) * 0.45 / sin_half
    o_max = min(1.1 * r0, 0.4 * max(min(e1, e2), 1e-6))
    o = min(max(o_want, 0.25 * min(R1, R2)), max(o_max, 1e-5))
    o1 = min(max(o, 0.15 * R1), 0.45 * max(e1, 1e-6))
    o2 = min(max(o, 0.15 * R2), 0.45 * max(e2, 1e-6))
    Cc1 = J + u1 * o1
    Cc2 = J + u2 * o2

    # -- crotch: just ahead of both child ring planes (short V notch) - #
    cos_a1 = max(float(np.dot(m, u1)), 0.30)
    cos_a2 = max(float(np.dot(m, u2)), 0.30)
    t = max((o1 + 0.35 * R1) / cos_a1, (o2 + 0.35 * R2) / cos_a2)
    t = min(t, 2.0 * min(R1, R2))
    t = max(t, 0.25 * min(R1, R2))
    C = J + m * t

    def outer_points(sign_w):
        ww = w * sign_w
        e_1 = perp_in_plane(np.cross(ww, u1), ww)
        e_2 = perp_in_plane(np.cross(ww, u2), ww)
        if e_1 is None:
            e_1 = perp_in_plane(Cc1 - Cc2, u1)
        if e_2 is None:
            e_2 = perp_in_plane(Cc2 - Cc1, u2)
        if e_1 is None or e_2 is None:
            raise JunctionError(f"degenerate junction frame at node {jid}")
        if float(np.dot(e_1, Cc1 - Cc2)) < 0:
            e_1 = -e_1
        if float(np.dot(e_2, Cc2 - Cc1)) < 0:
            e_2 = -e_2
        O1 = Cc1 + e_1 * R1
        O2 = Cc2 + e_2 * R2
        bev1 = max(R1 * 0.16, 1e-4)
        bev2 = max(R2 * 0.16, 1e-4)
        return (O1 + ww * bev1, O1 - ww * bev1, O2 + ww * bev2, O2 - ww * bev2, ww)

    def parent_ring_points(ww):
        nJ, bJ = Jn.normal, Jn.binormal
        Acoef = float(np.dot(nJ, ww))
        Bcoef = float(np.dot(bJ, ww))
        th_star = np.arctan2(-Acoef, Bcoef)

        def ring_pt(th, j=0):
            rr = surface_radius((j % n0) / n0, Jn.arclen, R0, surf)
            return C0 + rr * (np.cos(th) * nJ + np.sin(th) * bJ)

        # S_L (index 0) must sit on the child-1 side
        side_ref = Cc1 - J
        if float(np.dot(ring_pt(th_star + np.pi) - J, side_ref)) > float(
            np.dot(ring_pt(th_star) - J, side_ref)
        ):
            th_star += np.pi
        pts = [ring_pt(th_star + 2.0 * np.pi * j / n0, j) for j in range(n0)]
        return pts

    def arc_points(center, radius, p_from, p_to, segs):
        d0 = normalize(p_from - center)
        d1 = normalize(p_to - center)
        return [center + slerp_dir(d0, d1, k / segs) * radius for k in range(segs + 1)]

    # orientation check with auto-fix (flip w if both loops come out CW)
    for attempt in range(2):
        sign_w = 1.0 if attempt == 0 else -1.0
        O1F, O1B, O2F, O2B, ww = outer_points(sign_w)
        Ppts = parent_ring_points(ww)
        F1 = arc_points(Cc1, R1, O1F, C, b1)  # O1F -> C
        B1 = arc_points(Cc1, R1, C, O1B, b1)  # C -> O1B
        Bk2 = arc_points(Cc2, R2, O2B, C, b2)  # O2B -> C
        F2 = arc_points(Cc2, R2, C, O2F, b2)  # C -> O2F
        L1pts = F1 + B1[1:]
        L2pts = Bk2 + F2[1:]
        s1 = float(np.dot(newell_normal(np.array(L1pts)), u1))
        s2 = float(np.dot(newell_normal(np.array(L2pts)), u2))
        if s1 > 0 and s2 > 0:
            break
        if attempt == 0 and (s1 < 0 and s2 < 0):
            continue  # retry with flipped w
        raise JunctionError(
            f"junction {jid}: cannot orient junction loops "
            f"(newell dots {s1:.3f}, {s2:.3f}); try a larger branch angle"
        )
    else:  # pragma: no cover
        raise JunctionError(f"junction {jid}: orientation failed")

    # -- emit -------------------------------------------------------- #
    def und(base_radius, pt, center, k):
        if undulation <= 0:
            return pt
        wob = np.sin(Jn.arclen * 2.1 + k * 2.39996) * 0.6 + np.sin(Jn.arclen * 5.7 + k * 1.3) * 0.4
        d = normalize(pt - center)
        # preserve incoming radius (collar/flute modulation), add wobble
        return center + d * (float(np.linalg.norm(pt - center)) * (1.0 + undulation * wob))

    Pidx = [
        mesh.add_vert(und(R0, p, C0, j), node=jid, u=j / n0, kind=K_JUNCTION, center=C0)
        for j, p in enumerate(Ppts)
    ]
    crotch_idx = mesh.add_vert(C, node=jid, u=0.5, kind=K_CROTCH, center=J)

    L1idx = []
    for k, p in enumerate(F1):
        if k == len(F1) - 1:
            L1idx.append(crotch_idx)
        else:
            L1idx.append(
                mesh.add_vert(und(R1, p, Cc1, k), node=jid, u=k / (2 * b1 + 1), kind=K_JUNCTION, center=Cc1)
            )
    for k, p in enumerate(B1[1:], start=1):
        L1idx.append(
            mesh.add_vert(und(R1, p, Cc1, len(F1) + k), node=jid, u=(len(F1) + k) / (2 * b1 + 1),
                          kind=K_JUNCTION, center=Cc1)
        )

    L2idx = []
    for k, p in enumerate(Bk2):
        if k == len(Bk2) - 1:
            L2idx.append(crotch_idx)
        else:
            L2idx.append(
                mesh.add_vert(und(R2, p, Cc2, k), node=jid, u=k / (2 * b2 + 1), kind=K_JUNCTION, center=Cc2)
            )
    for k, p in enumerate(F2[1:], start=1):
        L2idx.append(
            mesh.add_vert(und(R2, p, Cc2, len(Bk2) + k), node=jid, u=(len(Bk2) + k) / (2 * b2 + 1),
                          kind=K_JUNCTION, center=Cc2)
        )

    # arcs (index space)
    pf = Pidx[0 : a + 1]  # front S_L -> S_R
    # back S_R -> S_L: P[a] -> P[a+1] -> ... -> P[2a-1] -> P[0]
    pb = [Pidx[(a + k) % n0] for k in range(a + 1)]
    F1i = L1idx[: b1 + 1]  # O1F -> C
    B1i = L1idx[b1:]  # C -> O1B
    Bk2i = L2idx[: b2 + 1]  # O2B -> C
    F2i = L2idx[b2:]  # C -> O2F

    cf = F1i + F2i[1:]  # O1F -> C -> O2F  (a+1)
    cb = Bk2i + B1i[1:]  # O2B -> C -> O1B  (a+1)
    assert len(cf) == a + 1 and len(cb) == a + 1, (len(cf), len(cb), a)
    assert len(pf) == a + 1 and len(pb) == a + 1

    for i in range(a):
        mesh.add_quad(pf[i], pf[i + 1], cf[i + 1], cf[i])  # front disk
    for i in range(a):
        mesh.add_quad(pb[i], pb[i + 1], cb[i + 1], cb[i])  # back disk

    S_L, S_R = Pidx[0], Pidx[a]
    O1F_i, O1B_i = L1idx[0], L1idx[-1]
    O2B_i, O2F_i = L2idx[0], L2idx[-1]
    mesh.add_tri(S_L, O1F_i, O1B_i)
    mesh.add_tri(S_R, O2B_i, O2F_i)

    Pring = RingInfo(indices=Pidx, center=C0, radius=R0, tangent=u0v)
    return Pring, {
        c1: RingInfo(indices=L1idx, center=Cc1, radius=R1, tangent=u1),
        c2: RingInfo(indices=L2idx, center=Cc2, radius=R2, tangent=u2),
    }


# --------------------------------------------------------------------------- #
# caps
# --------------------------------------------------------------------------- #


def add_root_cap(mesh: Mesh, ring: RingInfo, node_id: int):
    apex = ring.center - ring.tangent * ring.radius * 0.7
    ai = mesh.add_vert(apex, node=node_id, u=0.5, kind=K_CAP, center=ring.center)
    idx = ring.indices
    n = len(idx)
    for j in range(n):
        mesh.add_tri(idx[(j + 1) % n], idx[j], ai)


def add_tip_cap(mesh: Mesh, ring: RingInfo, node_id: int):
    apex = ring.center + ring.tangent * max(ring.radius * 1.6, 1e-4)
    ai = mesh.add_vert(apex, node=node_id, u=0.5, kind=K_CAP, center=ring.center)
    idx = ring.indices
    n = len(idx)
    for j in range(n):
        mesh.add_tri(idx[j], idx[(j + 1) % n], ai)


# --------------------------------------------------------------------------- #
# relaxation
# --------------------------------------------------------------------------- #


def relax_junctions(mesh: Mesh, iterations: int = 2, lam: float = 0.25):
    """Light Laplacian smoothing of junction verts only (topology-safe)."""
    if iterations <= 0:
        return
    V = mesh.verts()
    adj: Dict[int, set] = {}
    for f in list(mesh.quads) + list(mesh.tris):
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
    move = [i for i, k in enumerate(mesh.v_kind) if k in (K_JUNCTION, K_CROTCH)]
    for _ in range(iterations):
        new = V.copy()
        for i in move:
            nb = adj.get(i)
            if not nb:
                continue
            c = np.mean(V[list(nb)], axis=0)
            new[i] = V[i] + lam * (c - V[i])
        V = new
    mesh.positions = [V[i] for i in range(len(V))]


# --------------------------------------------------------------------------- #
# driver
# --------------------------------------------------------------------------- #


def flare_factor(arclen: float, trunk_radius: float) -> float:
    if trunk_radius <= 0:
        return 1.0
    x = arclen / max(trunk_radius * 1.6, 1e-6)
    return 1.0 + 0.55 * np.exp(-x * x)


def build_tree_mesh(skel: Skeleton, opts: Dict | None = None) -> Mesh:
    """Build the single fused mesh for a skeleton."""
    opts = opts or {}
    undulation = float(opts.get("undulation", 0.03))
    do_flare = bool(opts.get("flare", True))
    relax_it = int(opts.get("relax", 2))

    mesh = Mesh()
    assert skel.root is not None
    trunk_r = skel.nodes[skel.root].radius
    surf: Dict = {
        "trunk_r": trunk_r,
        "flare": do_flare,
        "buttress_lobes": int(opts.get("buttress_lobes", 6)),
        "buttress_amp": float(opts.get("buttress_amp", 0.30)),
        "flutes": int(opts.get("flutes", 9)),
        "flute_amp": float(opts.get("flute_amp", 0.055)),
        "flute_twist": float(opts.get("flute_twist", 1.4)),
    }

    in_ring: Dict[int, RingInfo] = {}
    out_rings: Dict[int, Dict[int, RingInfo]] = {}

    def tube_radius(node) -> float:
        return node.radius  # flare/flutes applied per-vertex in surface_radius

    # root ring
    root = skel.nodes[skel.root]
    if len(root.children) == 2:
        # root junction: parent ring capped at the base
        Pring, outs = build_junction(mesh, skel, root.id, root.pos - root.tangent * trunk_r,
                                     undulation, opts)
        in_ring[root.id] = Pring
        out_rings[root.id] = outs
        add_root_cap(mesh, Pring, root.id)
    else:
        ring = add_tube_ring(mesh, root.pos, tube_radius(root), root.normal, root.binormal,
                             root.ring_n, root.id, undulation, root.arclen, surf)
        in_ring[root.id] = ring
        out_rings[root.id] = {c: ring for c in root.children}
        add_root_cap(mesh, ring, root.id)

    # BFS downstream
    queue = list(root.children)
    order = []
    seen = {skel.root}
    while queue:
        nid = queue.pop(0)
        if nid in seen:
            continue
        seen.add(nid)
        order.append(nid)
        queue.extend(skel.nodes[nid].children)

    for nid in order:
        node = skel.nodes[nid]
        if len(set(node.children)) != len(node.children):  # pragma: no cover
            raise JunctionError(f"node {nid} has duplicate children {node.children}")
        parent_out = out_rings[node.parent][nid]
        if len(node.children) == 2:
            Pring, outs = build_junction(mesh, skel, nid, parent_out.center, undulation, opts)
            in_ring[nid] = Pring
            out_rings[nid] = outs
            bridge_loops(mesh, parent_out.indices, Pring.indices)
        elif len(node.children) == 1:
            ring = add_tube_ring(mesh, node.pos, tube_radius(node), node.normal, node.binormal,
                                 node.ring_n, nid, undulation, node.arclen, surf)
            in_ring[nid] = ring
            out_rings[nid] = {node.children[0]: ring}
            bridge_loops(mesh, parent_out.indices, ring.indices)
        elif len(node.children) == 0:
            ring = add_tube_ring(mesh, node.pos, tube_radius(node), node.normal, node.binormal,
                                 node.ring_n, nid, undulation, node.arclen, surf)
            in_ring[nid] = ring
            bridge_loops(mesh, parent_out.indices, ring.indices)
            add_tip_cap(mesh, ring, nid)
        else:  # pragma: no cover - enforced binary upstream
            raise JunctionError(f"node {nid} has {len(node.children)} children (need <= 2)")

    relax_junctions(mesh, relax_it)
    mesh.ensure_outward()
    return mesh
