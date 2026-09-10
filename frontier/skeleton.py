"""Branch skeleton (graph) generation for Frontier trees.

A skeleton is a rooted tree of :class:`SkelNode` objects. Each node has a
position, a radius, a parent and 0..N children. The meshing stage requires
*at most binary* junctions, so :func:`enforce_bifurcation` rewrites any
N-furcation (N > 2) into a short chain of binary (Y) junctions.

Two growers are provided:

* :func:`grow_recursive` — leader + laterals recursive model with species
  parameters (fast, controllable, the default).
* :func:`grow_colonization` — space-colonization model growing towards
  attractors inside an envelope (very natural crowns).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from frontier.math3d import make_frame, normalize, rotation_from_to, transport_frame


# --------------------------------------------------------------------------- #
# containers
# --------------------------------------------------------------------------- #


@dataclass
class SkelNode:
    id: int
    pos: np.ndarray
    radius: float
    parent: Optional[int] = None
    children: List[int] = field(default_factory=list)
    depth: int = 0  # branch level (0 = trunk)
    branch_id: int = 0  # id of the branch polyline this node belongs to
    # --- derived (filled by finalize) ---
    tangent: np.ndarray = field(default_factory=lambda: np.array([0.0, 1.0, 0.0]))
    normal: np.ndarray = field(default_factory=lambda: np.array([1.0, 0.0, 0.0]))
    binormal: np.ndarray = field(default_factory=lambda: np.array([0.0, 0.0, 1.0]))
    arclen: float = 0.0  # distance along skeleton from root
    ring_n: int = 8  # radial resolution used by the mesher
    is_junction: bool = False


class Skeleton:
    def __init__(self):
        self.nodes: List[SkelNode] = []
        self.root: Optional[int] = None

    def add_node(
        self,
        pos,
        radius: float,
        parent: Optional[int] = None,
        depth: int = 0,
        branch_id: int = 0,
    ) -> int:
        nid = len(self.nodes)
        node = SkelNode(
            id=nid,
            pos=np.asarray(pos, dtype=np.float64).reshape(3),
            radius=float(radius),
            parent=parent,
            depth=depth,
            branch_id=branch_id,
        )
        self.nodes.append(node)
        if parent is not None:
            self.nodes[parent].children.append(nid)
        else:
            self.root = nid
        return nid

    # -- derived data -------------------------------------------------- #
    def compute_frames(self):
        """Tangent + parallel-transport frames + arclength, root outward."""
        assert self.root is not None
        root = self.nodes[self.root]
        if root.children:
            c0 = self.nodes[root.children[0]]
            t = c0.pos - root.pos
        else:
            t = np.array([0.0, 1.0, 0.0])
        t, n, b = make_frame(t)
        root.tangent, root.normal, root.binormal = t, n, b
        root.arclen = 0.0
        stack = [self.root]
        while stack:
            nid = stack.pop()
            node = self.nodes[nid]
            for cid in node.children:
                child = self.nodes[cid]
                edge = child.pos - node.pos
                length = float(np.linalg.norm(edge))
                if length < 1e-9:
                    edge = node.tangent
                    length = 0.0
                t1 = edge / max(length, 1e-9) if length > 0 else node.tangent
                t1, n1, b1 = transport_frame(node.tangent, node.normal, t1)
                child.tangent, child.normal, child.binormal = t1, n1, b1
                child.arclen = node.arclen + length
                stack.append(cid)

    def finalize(self, ring_params: Dict):
        """Mark junctions, assign ring resolutions. Call after editing."""
        trunk_n = int(ring_params.get("trunk_n", 18))
        tip_n = int(ring_params.get("tip_n", 5))
        gamma = float(ring_params.get("ring_gamma", 0.7))
        # snap counts to a coarse ladder so straight runs share counts
        # (fewer count transitions => pure-quad lofts, minimal darts)
        ladder = [n for n in (4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24) if tip_n <= n <= trunk_n]
        if not ladder:
            ladder = [tip_n]
        r_trunk = max(self.nodes[self.root].radius, 1e-6)
        for node in self.nodes:
            node.is_junction = len(node.children) == 2
            frac = min(max(node.radius / r_trunk, 0.0), 1.0)
            n = int(round(tip_n + (trunk_n - tip_n) * (frac**gamma)))
            n = int(min(max(n, tip_n), trunk_n))
            node.ring_n = min(ladder, key=lambda L: (abs(L - n), L))

    def edge_list(self) -> List[Tuple[int, int]]:
        edges = []
        for node in self.nodes:
            for c in node.children:
                edges.append((node.id, c))
        return edges

    def max_depth(self) -> int:
        return max((n.depth for n in self.nodes), default=0)

    def height(self) -> float:
        ys = [n.pos[1] for n in self.nodes]
        return (max(ys) - min(ys)) if ys else 1.0


# --------------------------------------------------------------------------- #
# topology surgery
# --------------------------------------------------------------------------- #


def enforce_bifurcation(skel: Skeleton) -> Skeleton:
    """Rewrite nodes with >2 children into chains of binary junctions.

    Children are ordered so the most "continuation-like" child (smallest
    angle to the incoming direction) ends up deepest in the chain, which
    keeps the leader straight and puts laterals on the side — exactly how
    real branches attach.
    """
    # iterate over a snapshot: we append new nodes while rewriting
    for node in list(skel.nodes):
        while len(node.children) > 2:
            kids = list(node.children)
            if node.parent is not None:
                incoming = normalize(node.pos - skel.nodes[node.parent].pos)
            else:
                incoming = np.array([0.0, 1.0, 0.0])
            dirs = [normalize(skel.nodes[c].pos - node.pos) for c in kids]
            angles = [np.arccos(float(np.clip(np.dot(incoming, d), -1, 1))) for d in dirs]
            order = np.argsort(angles)  # straightest first ...
            order = order[::-1]  # ... but laterals attach first, leader last
            kids = [kids[i] for i in order]

            first, second = kids[0], kids[1]
            rest = kids[2:]
            eps = max(node.radius * 0.45, 1e-4)
            # new chain node slightly downstream
            cont_dir = normalize(skel.nodes[kids[-1]].pos - node.pos)
            new_pos = node.pos + cont_dir * eps
            new_id = skel.add_node(
                new_pos,
                radius=node.radius * 0.985,
                parent=node.id,
                depth=node.depth,
                branch_id=node.branch_id,
            )
            new_node = skel.nodes[new_id]
            # rewire: node keeps [first, new], new takes [second, *rest] or chain
            node.children = [first, new_id]
            new_node.children = [second] + rest
            for c in new_node.children:
                skel.nodes[c].parent = new_id
            node = new_node  # continue until <= 2 children
    return skel


def subdivide_long_edges(skel: Skeleton, factor: float = 2.5, min_len: float = 1e-4) -> Skeleton:
    """Split edges longer than ``factor * local_radius``.

    Short edges keep quad aspect ratios square-ish and give the wind
    shader enough vertices to bend smoothly.
    """
    for (pid, cid) in list(skel.edge_list()):
        p = skel.nodes[pid]
        c = skel.nodes[cid]
        vec = c.pos - p.pos
        length = float(np.linalg.norm(vec))
        r_avg = max(0.5 * (p.radius + c.radius), 1e-6)
        max_len = max(factor * r_avg, min_len)
        if length <= max_len:
            continue
        k = int(np.ceil(length / max_len))
        # do not subdivide the tiny anti-N-furcation chain links (they are
        # intentionally short); length check above already guards that.
        # NOTE: add_node() already appends to the parent's children list,
        # so we only need to drop the original pid -> cid link at the end.
        prev = pid
        for i in range(1, k):
            t = i / k
            pos = p.pos * (1.0 - t) + c.pos * t
            rad = p.radius * (1.0 - t) + c.radius * t
            nid = skel.add_node(pos, rad, parent=prev, depth=c.depth, branch_id=c.branch_id)
            prev = nid
        skel.nodes[prev].children.append(cid)
        c.parent = prev
        if cid in p.children:
            p.children.remove(cid)
    return skel


# --------------------------------------------------------------------------- #
# recursive grower
# --------------------------------------------------------------------------- #


def _rotate_dir(rng: np.random.Generator, direction, angle: float, azimuth: float):
    """Rotate `direction` by `angle` around an axis perpendicular to it."""
    d = normalize(direction)
    # pick a stable perpendicular
    up = np.array([0.0, 1.0, 0.0])
    if abs(float(np.dot(d, up))) > 0.95:
        up = np.array([1.0, 0.0, 0.0])
    e1 = normalize(np.cross(d, up))
    e2 = normalize(np.cross(d, e1))
    axis = e1 * np.cos(azimuth) + e2 * np.sin(azimuth)
    # Rodrigues
    k = normalize(axis)
    v = d * np.cos(angle) + np.cross(k, d) * np.sin(angle)
    return normalize(v)


def grow_recursive(params: Dict, seed: int = 1) -> Skeleton:
    """Leader + laterals recursive tree.

    Parameters (see :mod:`frontier.presets` for tuned species)::

        max_depth, trunk_len, trunk_radius, tip_radius, segs (per branch),
        seg_len, len_decay, lat_ratio, branch_angle, branch_angle_spread,
        laterals (base count), laterals2_prob, apical, phototropism,
        gravitrop, curl, envelope ('none'|'cone'|'sphere'), min_radius
    """
    rng = np.random.default_rng(seed)
    skel = Skeleton()

    max_depth = int(params.get("max_depth", 4))
    trunk_len = float(params.get("trunk_len", 3.0))
    trunk_radius = float(params.get("trunk_radius", 0.22))
    tip_radius = float(params.get("tip_radius", 0.012))
    segs = int(params.get("segs", 6))
    seg_len = float(params.get("seg_len", trunk_len / max(segs, 1)))
    len_decay = float(params.get("len_decay", 0.62))
    lat_ratio = float(params.get("lat_ratio", 0.5))
    branch_angle = float(params.get("branch_angle", np.radians(42)))
    branch_spread = float(params.get("branch_angle_spread", np.radians(10)))
    n_laterals = int(params.get("laterals", 1))
    lat2_prob = float(params.get("laterals2_prob", 0.25))
    lateral_every = max(int(params.get("lateral_every", 1)), 1)
    apical = float(params.get("apical", 0.55))  # leader length boost
    phototrop = float(params.get("phototropism", 0.06))
    upright = float(params.get("upright", 0.10))
    gravitrop = float(params.get("gravitrop", 0.02))
    curl = float(params.get("curl", 0.12))
    envelope = params.get("envelope", "none")
    min_radius = float(params.get("min_radius", tip_radius * 0.7))
    whorl = int(params.get("whorl", 0))  # extra laterals per node (pine)
    up_bias = float(params.get("up_bias", 0.0))  # birch-like upward sweep

    total_h = trunk_len * (1.0 + len_decay * max_depth * 0.8)

    branch_counter = [0]

    def envelope_scale(height_frac: float) -> float:
        if envelope == "cone":
            return float(np.clip(1.15 - 1.05 * height_frac, 0.12, 1.0))
        if envelope == "sphere":
            return float(np.clip(np.sin(np.pi * np.clip(height_frac, 0.02, 0.98)) ** 0.7, 0.12, 1.0))
        return 1.0

    def grow_branch(base_id, direction, length, r_base, depth, azim_offset):
        branch_counter[0] += 1
        my_branch = branch_counter[0]
        n_segs = max(segs - depth, 2)
        seg = length / n_segs
        r_tip = max(tip_radius * (1.0 + 0.35 * (max_depth - depth)), min_radius)
        d = normalize(direction)
        prev = base_id
        prev_node = skel.nodes[base_id]
        prev_node.branch_id = my_branch if base_id == skel.root else prev_node.branch_id
        golden = np.pi * (3.0 - np.sqrt(5.0))
        lat_index = 0
        depth_frac = depth / max(max_depth, 1)
        straight = 1.0 - 0.65 * (1.0 - depth_frac)  # trunk wanders less
        for s in range(1, n_segs + 1):
            t = s / n_segs
            # organic wander (reduced near the trunk so leaders stay true)
            wander_axis_az = rng.uniform(0, 2 * np.pi)
            d = _rotate_dir(rng, d, rng.normal(0, curl * 0.35 * straight), wander_axis_az)
            # phototropism: bend towards up (light); leaders pull upright
            eff_photo = phototrop + up_bias * 0.15 + upright * (1.0 - depth_frac) ** 2
            d = normalize(d + np.array([0.0, eff_photo, 0.0]))
            sag = gravitrop * (0.4 + 0.6 * depth / max(max_depth, 1))
            d = normalize(d - np.array([0.0, sag * (0.3 + 0.7 * t), 0.0]))
            pos = skel.nodes[prev].pos + d * seg
            # slight Leonardo-consistent taper along the branch
            r = r_base * (1.0 - t) + r_tip * t
            nid = skel.add_node(pos, max(r, min_radius), parent=prev, depth=depth, branch_id=my_branch)
            is_tip_joint = s == n_segs
            if depth < max_depth and not is_tip_joint and (s % lateral_every == 0):
                h_frac = float(np.clip(pos[1] / max(total_h, 1e-6), 0.0, 1.0))
                env = envelope_scale(h_frac)
                count = n_laterals + (1 if rng.random() < lat2_prob else 0) + whorl
                for li in range(count):
                    az = azim_offset + lat_index * golden + rng.normal(0, 0.35)
                    lat_index += 1
                    ang = branch_angle + rng.normal(0, branch_spread)
                    ang = float(np.clip(ang, np.radians(8), np.radians(150)))
                    ldir = _rotate_dir(rng, d, ang, az)
                    lr = max(r * (lat_ratio + rng.normal(0, 0.05)), min_radius)
                    if lr < min_radius * 1.02:
                        continue
                    llen = seg * max(n_segs - s, 1) * len_decay * env * rng.uniform(0.75, 1.25)
                    llen = max(llen, seg * 0.8)
                    if depth + 1 > max_depth:
                        continue
                    grow_branch(nid, ldir, llen, lr, depth + 1, rng.uniform(0, 2 * np.pi))
                    # leader keeps the remaining cross-section (Leonardo)
                    r = float(np.sqrt(max(r * r * 0.999 - lr * lr * 0.35, min_radius**2)))
                    skel.nodes[nid].radius = max(r, min_radius)
            prev = nid
        # apical continuation is implicit: the branch polyline IS the leader.

    root = skel.add_node(np.array([0.0, 0.0, 0.0]), trunk_radius, depth=0, branch_id=0)
    # small root flare handled in meshing; grow the trunk as branch 0
    grow_branch(root, np.array([0.0, 1.0, 0.0]), trunk_len * (1.0 + apical * 0.5), trunk_radius, 0, 0.0)

    # trunk leader extension for excurrent (pine-like) forms
    return skel


# --------------------------------------------------------------------------- #
# space colonization grower
# --------------------------------------------------------------------------- #


def grow_colonization(params: Dict, seed: int = 1) -> Skeleton:
    """Space-colonization grower (Runions et al. 2007, simplified).

    Attractors are scattered in an envelope; nodes grow towards the average
    direction of nearby attractors; attractors within `kill_dist` are
    removed. Produces great broadleaf crowns.
    """
    rng = np.random.default_rng(seed)
    skel = Skeleton()

    n_attractors = int(params.get("attractors", 900))
    trunk_len = float(params.get("trunk_len", 2.2))
    trunk_radius = float(params.get("trunk_radius", 0.2))
    tip_radius = float(params.get("tip_radius", 0.012))
    influence = float(params.get("influence", 1.1))
    kill = float(params.get("kill_dist", 0.22))
    step = float(params.get("step", 0.22))
    envelope = params.get("envelope", "sphere")
    crown_r = float(params.get("crown_radius", 2.2))
    crown_h = float(params.get("crown_height", 2.6))
    max_nodes = int(params.get("max_nodes", 4000))
    max_iter = int(params.get("max_iter", 220))
    min_radius = float(params.get("min_radius", tip_radius * 0.7))

    # --- attractors in envelope above the trunk ------------------------ #
    pts = []
    base_y = trunk_len * 0.55
    while len(pts) < n_attractors:
        batch = rng.uniform(-1, 1, size=(n_attractors, 3))
        if envelope == "cone":
            # cone wide at bottom
            y01 = (batch[:, 1] * 0.5 + 0.5)
            rr = np.sqrt(batch[:, 0] ** 2 + batch[:, 2] ** 2)
            keep = rr < (1.15 - 0.95 * y01)
            p = batch[keep]
            p = p.copy()
            p[:, 0] *= crown_r
            p[:, 2] *= crown_r
            p[:, 1] = base_y + (p[:, 1] * 0.5 + 0.5) * crown_h
        else:  # sphere / ellipsoid
            rr = np.sqrt((batch[:, 0]) ** 2 + (batch[:, 1]) ** 2 + (batch[:, 2]) ** 2)
            p = batch[rr < 1.0].copy()
            p[:, 0] *= crown_r
            p[:, 2] *= crown_r
            p[:, 1] = base_y + crown_h * 0.5 + p[:, 1] * crown_h * 0.5
        pts.extend([q for q in p])
    attractors = np.array(pts[:n_attractors])
    alive = np.ones(len(attractors), dtype=bool)

    # --- trunk --------------------------------------------------------- #
    root = skel.add_node(np.array([0.0, 0.0, 0.0]), trunk_radius, depth=0)
    prev = root
    n_trunk = max(int(trunk_len / step), 2)
    for i in range(1, n_trunk + 1):
        pos = np.array([rng.normal(0, 0.01), step * i, rng.normal(0, 0.01)])
        prev = skel.add_node(pos, trunk_radius * (1 - 0.25 * i / n_trunk), parent=prev, depth=0)

    # --- colonize ------------------------------------------------------ #
    for _ in range(max_iter):
        if len(skel.nodes) >= max_nodes or not alive.any():
            break
        node_pos = np.array([n.pos for n in skel.nodes])
        # for each alive attractor find nearest node (brute force, fine here)
        alive_idx = np.flatnonzero(alive)
        A = attractors[alive_idx]
        # chunked distance to bound memory
        nearest = np.zeros(len(A), dtype=int)
        nearest_d = np.zeros(len(A))
        CH = 4096
        for s in range(0, len(skel.nodes), CH):
            e = min(s + CH, len(skel.nodes))
            d2 = ((A[:, None, :] - node_pos[None, s:e, :]) ** 2).sum(-1)
            j = d2.argmin(1)
            dd = np.sqrt(d2[np.arange(len(A)), j])
            if s == 0:
                nearest, nearest_d = s + j, dd
            else:
                better = dd < nearest_d
                nearest[better] = s + j[better]
                nearest_d[better] = dd[better]
        # kill close ones
        kill_mask = nearest_d < kill
        alive[alive_idx[kill_mask]] = False
        # grow: accumulate directions per node
        infl_mask = (nearest_d >= kill) & (nearest_d < influence)
        if not infl_mask.any():
            # still kill-check next round; nudge: widen influence slightly
            influence *= 1.02
            continue
        acc: Dict[int, List[np.ndarray]] = {}
        for k in np.flatnonzero(infl_mask):
            nid = int(nearest[k])
            d = attractors[alive_idx[k]] - skel.nodes[nid].pos
            acc.setdefault(nid, []).append(normalize(d))
        grown = 0
        for nid, dirs in acc.items():
            avg = normalize(sum(dirs) + rng.normal(0, 0.08, 3))
            # mild upward bias keeps crowns from drooping oddly
            avg = normalize(avg + np.array([0.0, 0.06, 0.0]))
            new_pos = skel.nodes[nid].pos + avg * step * rng.uniform(0.85, 1.15)
            depth = skel.nodes[nid].depth + (1 if len(skel.nodes[nid].children) >= 1 else 0)
            skel.add_node(new_pos, tip_radius, parent=nid, depth=min(depth + 1, 12))
            grown += 1
        if grown == 0:
            break

    # --- radii bottom-up (Leonardo: area preserving) -------------------- #
    for node in reversed(skel.nodes):
        if node.children:
            area = sum(skel.nodes[c].radius ** 2 for c in node.children)
            node.radius = max(np.sqrt(area), tip_radius)
    # rescale so trunk matches requested radius
    have = skel.nodes[skel.root].radius
    if have > 1e-9:
        s = trunk_radius / have
        for node in skel.nodes:
            node.radius = max(node.radius * s, min_radius * 0.5)
    return skel


# --------------------------------------------------------------------------- #
# pipeline helper
# --------------------------------------------------------------------------- #


def build_skeleton(params: Dict, seed: int, ring_params: Dict) -> Skeleton:
    method = params.get("method", "recursive")
    if method == "colonization":
        skel = grow_colonization(params, seed)
    else:
        skel = grow_recursive(params, seed)
    enforce_bifurcation(skel)
    subdivide_long_edges(skel, factor=float(params.get("subdiv_factor", 2.5)))
    skel.compute_frames()
    skel.finalize(ring_params)
    return skel
