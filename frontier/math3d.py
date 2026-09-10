"""Small vector / frame math helpers used across Frontier.

Everything is plain NumPy, float64 internally. Conventions:

* Y-up, right-handed frames: ``B = T x N`` (so ``N x B = T``).
* A *ring* of ``N`` vertices around tangent ``T`` with frame ``(Nf, Bf)``
  is ordered counter-clockwise when looking along ``+T`` (from base
  towards the tip), i.e. ``p(j) = C + r*(cos Nf + sin Bf)``.
"""

from __future__ import annotations

import numpy as np

EPS = 1e-9


def as_vec(v) -> np.ndarray:
    return np.asarray(v, dtype=np.float64).reshape(3)


def norm(v) -> float:
    return float(np.linalg.norm(v))


def normalize(v) -> np.ndarray:
    v = as_vec(v)
    n = np.linalg.norm(v)
    if n < EPS:
        return np.array([0.0, 1.0, 0.0])
    return v / n


def rotation_from_to(a, b) -> np.ndarray:
    """Shortest-arc 3x3 rotation taking unit vector a to unit vector b."""
    a = normalize(a)
    b = normalize(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c > 1.0 - 1e-12:
        return np.eye(3)
    if c < -1.0 + 1e-12:
        # 180 degrees: pick any perpendicular axis
        axis = np.cross(a, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, np.array([0.0, 1.0, 0.0]))
        axis = normalize(axis)
        # R = -I + 2 axis axis^T
        return -np.eye(3) + 2.0 * np.outer(axis, axis)
    vx = np.array(
        [[0.0, -v[2], v[1]], [v[2], 0.0, -v[0]], [-v[1], v[0], 0.0]]
    )
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def make_frame(tangent, hint=None):
    """Build a right-handed (T, N, B) frame from a tangent direction."""
    t = normalize(tangent)
    if hint is None:
        hint = np.array([0.0, 0.0, 1.0])
        if abs(float(np.dot(t, hint))) > 0.9:
            hint = np.array([1.0, 0.0, 0.0])
    n = np.asarray(hint, dtype=np.float64)
    n = n - t * float(np.dot(n, t))
    if np.linalg.norm(n) < 1e-6:
        n = np.array([1.0, 0.0, 0.0])
        n = n - t * float(np.dot(n, t))
    n = normalize(n)
    b = np.cross(t, n)
    return t, n, b


def transport_frame(t0, n0, t1):
    """Parallel-transport normal n0 from tangent t0 to tangent t1."""
    r = rotation_from_to(t0, t1)
    n1 = r @ normalize(n0)
    t1n = normalize(t1)
    # re-orthogonalize (kills drift)
    n1 = n1 - t1n * float(np.dot(n1, t1n))
    if np.linalg.norm(n1) < 1e-8:
        _, n1, _ = make_frame(t1n)
    else:
        n1 = normalize(n1)
    b1 = np.cross(t1n, n1)
    return t1n, n1, b1


def slerp_dir(d0, d1, t: float) -> np.ndarray:
    """Spherical interpolation between two unit vectors."""
    d0 = normalize(d0)
    d1 = normalize(d1)
    c = float(np.clip(np.dot(d0, d1), -1.0, 1.0))
    if c > 1.0 - 1e-8:
        return normalize(d0 * (1.0 - t) + d1 * t)
    if c < -1.0 + 1e-8:
        # antipodal: rotate around any perpendicular axis
        axis = np.cross(d0, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(d0, np.array([0.0, 1.0, 0.0]))
        axis = normalize(axis)
        ang = np.pi * t
        return normalize(d0 * np.cos(ang) + np.cross(axis, d0) * np.sin(ang))
    omega = np.arccos(c)
    s = np.sin(omega)
    a = np.sin((1.0 - t) * omega) / s
    b = np.sin(t * omega) / s
    return normalize(d0 * a + d1 * b)


def newell_normal(pts: np.ndarray) -> np.ndarray:
    """Newell's method loop normal for an ordered (K,3) polygon."""
    pts = np.asarray(pts, dtype=np.float64)
    n = np.zeros(3)
    k = len(pts)
    for i in range(k):
        p = pts[i]
        q = pts[(i + 1) % k]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    nn = np.linalg.norm(n)
    if nn < EPS:
        return np.zeros(3)
    return n / nn


def signed_volume_of_closed_mesh(verts: np.ndarray, tris: np.ndarray) -> float:
    """Signed volume (all faces as triangles). Positive => outward winding."""
    v0 = verts[tris[:, 0]]
    v1 = verts[tris[:, 1]]
    v2 = verts[tris[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0)


def perp_in_plane(direction, plane_normal):
    """Component of `direction` perpendicular to `plane_normal`, normalized."""
    d = as_vec(direction)
    n = normalize(plane_normal)
    p = d - n * float(np.dot(d, n))
    if np.linalg.norm(p) < 1e-9:
        return None
    return p / np.linalg.norm(p)
