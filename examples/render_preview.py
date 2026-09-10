"""Matplotlib preview renders (shape / wireframe / wind weights / skeleton)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

from frontier.generate import generate_tree

ELEV, AZIM = 10, -75


def view_dir():
    el, az = np.radians(ELEV), np.radians(AZIM)
    return np.array(
        [-np.cos(el) * np.cos(az), -np.sin(el), -np.cos(el) * np.sin(az)]
    )


def shaded(ax, V, faces, max_faces=9000):
    if len(faces) > max_faces:
        sel = np.linspace(0, len(faces) - 1, max_faces).astype(int)
        faces = faces[sel]
    light = np.array([0.5, 0.8, 0.6])
    light /= np.linalg.norm(light)
    vd = view_dir()
    cent = V[faces].mean(axis=1)
    order = np.argsort(cent @ vd)  # far first (painter)
    faces = faces[order]
    polys = V[faces]
    fn = np.cross(polys[:, 1] - polys[:, 0], polys[:, 2] - polys[:, 0])
    ln = np.linalg.norm(fn, axis=1)
    ln[ln < 1e-12] = 1.0
    shade = np.abs((fn / ln[:, None]) @ light) * 0.7 + 0.3
    cols = np.stack([shade * 0.48, shade * 0.34, shade * 0.25], axis=1)
    pc = Poly3DCollection(polys, facecolors=cols, edgecolors="none")
    ax.add_collection3d(pc)
    return polys


def frame_axes(ax, p):
    p = np.asarray(p).reshape(-1, 3)
    ax.set_xlim(p[:, 0].min(), p[:, 0].max())
    ax.set_ylim(p[:, 1].min(), p[:, 1].max())
    ax.set_zlim(p[:, 2].min(), p[:, 2].max())
    ax.set_box_aspect(
        (np.ptp(p[:, 0]) or 1, np.ptp(p[:, 1]) or 1, np.ptp(p[:, 2]) or 1)
    )
    ax.view_init(elev=ELEV, azim=AZIM)
    ax.set_axis_off()


def main(preset="oak", seed=1, outdir="examples/output"):
    os.makedirs(outdir, exist_ok=True)
    r = generate_tree(preset, seed=seed)
    V = r.bark.verts().astype(float)
    F = r.bark.triangulate()
    print(preset, "valid:", r.report["valid"], "V:", len(V), "F:", len(F))

    fig = plt.figure(figsize=(9, 11))
    ax = fig.add_subplot(111, projection="3d")
    polys = shaded(ax, V, F)
    frame_axes(ax, polys)
    fig.savefig(f"{outdir}/preview_{preset}_shaded.png", dpi=100, bbox_inches="tight")
    plt.close(fig)

    # skeleton
    fig = plt.figure(figsize=(9, 11))
    ax = fig.add_subplot(111, projection="3d")
    sk = r.skeleton
    for p, c in sk.edge_list():
        a, b = sk.nodes[p].pos, sk.nodes[c].pos
        lw = 0.3 + 2.2 * min(sk.nodes[p].radius / 0.26, 1.0)
        ax.plot([a[0], b[0]], [a[1], b[1]], [a[2], b[2]], "k-", lw=lw, alpha=0.8)
    frame_axes(ax, np.array([n.pos for n in sk.nodes]))
    fig.savefig(f"{outdir}/preview_{preset}_skeleton.png", dpi=100, bbox_inches="tight")
    plt.close(fig)

    # junction crop wireframe
    jnode = None
    for n in sk.nodes:
        if n.is_junction and 0.8 < n.arclen < 3.0 and n.radius > 0.03:
            jnode = n
            break
    if jnode is not None:
        c = jnode.pos
        R = jnode.radius * 7.0
        keep = np.linalg.norm(V - c, axis=1) < R
        edges = set()
        for f in F:
            if all(keep[v] for v in f):
                for k in range(3):
                    a, b = f[k], f[(k + 1) % 3]
                    edges.add((min(a, b), max(a, b)))
        fig = plt.figure(figsize=(9, 9))
        ax = fig.add_subplot(111, projection="3d")
        for a, b in edges:
            ax.plot([V[a, 0], V[b, 0]], [V[a, 1], V[b, 1]], [V[a, 2], V[b, 2]], "k-", lw=0.5)
        ax.scatter([c[0]], [c[1]], [c[2]], c="r", s=40)
        frame_axes(ax, V[keep])
        fig.savefig(f"{outdir}/preview_{preset}_junction.png", dpi=100, bbox_inches="tight")
        plt.close(fig)

    # wind weights scatter
    fig = plt.figure(figsize=(9, 11))
    ax = fig.add_subplot(111, projection="3d")
    w = r.bark_wind["weight"]
    ax.scatter(V[:, 0], V[:, 1], V[:, 2], c=w, s=2.0, cmap="coolwarm", vmin=0, vmax=1)
    frame_axes(ax, V)
    fig.savefig(f"{outdir}/preview_{preset}_wind.png", dpi=100, bbox_inches="tight")
    plt.close(fig)

    # leaves on top of shaded bark
    if r.leaves is not None:
        fig = plt.figure(figsize=(9, 11))
        ax = fig.add_subplot(111, projection="3d")
        shaded(ax, V, F, max_faces=5000)
        LP = np.asarray(r.leaves.positions, dtype=float)
        LI = np.asarray(r.leaves.indices)
        if len(LI) > 4000:
            LI = LI[np.linspace(0, len(LI) - 1, 4000).astype(int)]
        lpolys = LP[LI]
        ax.add_collection3d(
            Poly3DCollection(lpolys, facecolors=(0.25, 0.5, 0.2, 0.85), edgecolors="none")
        )
        frame_axes(ax, np.vstack([V, LP]))
        fig.savefig(f"{outdir}/preview_{preset}_leafy.png", dpi=100, bbox_inches="tight")
        plt.close(fig)
    print("wrote", outdir)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="oak")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    main(a.preset, a.seed)
