"""Tiny software Z-buffer renderer for TRUE preview images.

Orthographic camera, smooth-shaded lambert + AO, optional barycentric
wireframe overlay. No GPU / no Blender needed.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image

from frontier.generate import generate_tree


def render(V, F, N, albedo, ao=None, size=(850, 1050), elev=8.0, azim=-75.0,
           wire=False, bg=(235, 238, 240), fit=None):
    V = np.asarray(V, float)
    F = np.asarray(F, np.int64)
    N = np.asarray(N, float)
    W, H = size
    el, az = np.radians(elev), np.radians(azim)
    fwd = np.array([np.cos(el) * np.cos(az), np.sin(el), np.cos(el) * np.sin(az)])
    right = np.array([-np.sin(az), 0.0, np.cos(az)])
    up = np.cross(right, fwd)
    x = V @ right
    y = V @ up
    z = V @ fwd  # larger = nearer
    if fit is None:
        fx, fy = x, y
    else:
        fx, fy = fit
    sc = min(W / (np.ptp(fx) or 1), H / (np.ptp(fy) or 1)) * 0.90
    px = (x - fx.mean()) * sc + W / 2
    py = (fy.mean() - y) * sc + H / 2
    P = np.stack([px, py, z], axis=1)

    light = N.copy()
    light = light / (np.linalg.norm(light, axis=1, keepdims=True) + 1e-12)
    L = np.array([0.45, 0.75, 0.55])
    L /= np.linalg.norm(L)

    zbuf = np.full((H, W), -np.inf)
    img = np.zeros((H, W, 3), float)
    img[:] = np.array(bg) / 255.0

    alb = np.asarray(albedo, float)
    per_face_alb = alb.ndim == 2 and len(alb) == len(F)
    ao_arr = np.asarray(ao, float) if ao is not None else None

    for fi in range(len(F)):
        i0, i1, i2 = F[fi]
        ax_, ay_, az_ = P[i0]
        bx_, by_, bz_ = P[i1]
        cx_, cy_, cz_ = P[i2]
        minx = max(int(min(ax_, bx_, cx_)), 0)
        maxx = min(int(max(ax_, bx_, cx_)) + 1, W - 1)
        miny = max(int(min(ay_, by_, cy_)), 0)
        maxy = min(int(max(ay_, by_, cy_)) + 1, H - 1)
        if maxx < minx or maxy < miny:
            continue
        area = (bx_ - ax_) * (cy_ - ay_) - (cx_ - ax_) * (by_ - ay_)
        if abs(area) < 1e-9:
            continue
        yy, xx = np.mgrid[miny : maxy + 1, minx : maxx + 1]
        w0 = ((bx_ - xx) * (cy_ - yy) - (cx_ - xx) * (by_ - yy)) / area
        w1 = ((cx_ - xx) * (ay_ - yy) - (ax_ - xx) * (cy_ - yy)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        zz = w0 * az_ + w1 * bz_ + w2 * cz_
        region = zbuf[miny : maxy + 1, minx : maxx + 1]
        upd = inside & (zz > region)
        if not upd.any():
            continue
        # smooth normal + lambert
        nn = w0[..., None] * light[i0] + w1[..., None] * light[i1] + w2[..., None] * light[i2]
        nn /= np.linalg.norm(nn, axis=2, keepdims=True) + 1e-12
        diff = np.abs(nn @ L) * 0.62 + 0.38
        hemi = 0.5 + 0.5 * nn[..., 1]
        diff = diff * (0.75 + 0.25 * hemi)
        a = alb[fi] if per_face_alb else alb
        col = diff[..., None] * a[None, None, :]
        if ao_arr is not None:
            aov = w0 * ao_arr[i0] + w1 * ao_arr[i1] + w2 * ao_arr[i2]
            col = col * (0.35 + 0.65 * aov[..., None])
        if wire:
            # pixel distance to nearest edge
            e0 = np.abs((by_ - cy_) * xx + (cx_ - bx_) * yy + bx_ * cy_ - cx_ * by_)
            e0 /= np.hypot(by_ - cy_, cx_ - bx_) + 1e-9
            e1 = np.abs((cy_ - ay_) * xx + (ax_ - cx_) * yy + cx_ * ay_ - ax_ * cy_)
            e1 /= np.hypot(cy_ - ay_, ax_ - cx_) + 1e-9
            e2 = np.abs((ay_ - by_) * xx + (bx_ - ax_) * yy + ax_ * by_ - bx_ * ay_)
            e2 /= np.hypot(ay_ - by_, bx_ - ax_) + 1e-9
            em = np.minimum(np.minimum(e0, e1), e2)
            col = np.where((em < 1.1)[..., None], 0.12, col)
        sub = img[miny : maxy + 1, minx : maxx + 1]
        sub[upd] = col[upd]
        region[upd] = zz[upd]
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


def main(preset="oak", seed=1, outdir="examples/output"):
    os.makedirs(outdir, exist_ok=True)
    r = generate_tree(preset, seed=seed)
    V = r.bark.verts()
    F = r.bark.triangulate()
    print(preset, "valid:", r.report["valid"], "V:", len(V), "F:", len(F))
    bark_alb = np.array([0.62, 0.47, 0.34])
    img = render(V, F, r.bark_normals, bark_alb, ao=r.bark_wind["ao"])
    Image.fromarray(img).save(f"{outdir}/soft_{preset}_bark.png")
    # leafy composite
    if r.leaves is not None:
        LP = np.asarray(r.leaves.positions, float)
        LI = np.asarray(r.leaves.indices)
        LN = np.asarray(r.leaves.normals, float)
        VV = np.vstack([V, LP])
        FF = np.vstack([F, LI + len(V)])
        NN = np.vstack([r.bark_normals, LN])
        alb = np.zeros((len(FF), 3))
        alb[: len(F)] = bark_alb
        alb[len(F) :] = np.array([0.22, 0.45, 0.18])
        ao_full = np.concatenate([r.bark_wind["ao"], np.ones(len(LP))])
        img2 = render(VV, FF, NN, alb, ao=ao_full)
        Image.fromarray(img2).save(f"{outdir}/soft_{preset}_leafy.png")
    # junction crop wireframe
    sk = r.skeleton
    jn = next((n for n in sk.nodes if n.is_junction and 0.8 < n.arclen < 3.0 and n.radius > 0.03), None)
    if jn is not None:
        c = jn.pos
        R = jn.radius * 8.0
        keep = np.linalg.norm(V - c, axis=1) < R
        sel = np.array([f for f in F if all(keep[v] for v in f)])
        if len(sel):
            used = np.unique(sel)
            remap = np.full(len(V), -1)
            remap[used] = np.arange(len(used))
            Vs = V[used]
            Ns = np.asarray(r.bark_normals)[used]
            Fs = remap[sel]
            img3 = render(Vs, Fs, Ns, np.array([0.72, 0.66, 0.60]),
                          size=(800, 800), elev=15, azim=-50, wire=True)
            Image.fromarray(img3).save(f"{outdir}/soft_{preset}_junction.png")
            img4 = render(Vs, Fs, Ns, np.array([0.62, 0.47, 0.34]),
                          size=(800, 800), elev=15, azim=-50, wire=False)
            Image.fromarray(img4).save(f"{outdir}/soft_{preset}_junction_shaded.png")
    print("wrote", outdir)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="oak")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    main(a.preset, a.seed)
