"""Software Z-buffer renderer for TRUE preview images.

Orthographic camera, smooth-shaded 3-point lighting (warm key + cool rim +
tinted hemisphere) + AO, textured bark/leaves with alpha-tested foliage,
sky-gradient background with soft contact shadow, optional wireframe
overlay. No GPU / no Blender needed.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image

from frontier.generate import generate_tree

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEX_CACHE = {}


def get_tex(name, size=None):
    """Load a repo asset texture as float array (cached).

    size: downsample target (mipmap-style) to kill minification moire
    in the software renderer, which has no per-pixel derivatives.
    """
    key = (name, size)
    if key not in _TEX_CACHE:
        img = Image.open(os.path.join(REPO, "assets", name))
        if size is not None:
            img = img.resize((size, size), Image.LANCZOS)
        _TEX_CACHE[key] = np.asarray(img).astype(float) / 255.0
    return _TEX_CACHE[key]


def _sample(tex, uu, vv, wrap):
    """Nearest sample. tex (H,W,C), uu/vv arrays. wrap: tile : clamp.

    Textures are pre-downsampled (mipmap-style) by the caller, so a
    single tap is both fast and moire-resistant.
    """
    H, W = tex.shape[:2]
    if wrap:
        xi = ((uu % 1.0) * W).astype(np.int64) % W
        yi = ((vv % 1.0) * H).astype(np.int64) % H
    else:
        xi = np.clip((uu * W).astype(np.int64), 0, W - 1)
        yi = np.clip(((1.0 - vv) * H).astype(np.int64), 0, H - 1)  # v=0 -> bottom
    return tex[yi, xi]


def _face_tint(fi):
    """Deterministic per-face RGB variation for foliage richness."""
    h1 = (np.sin(fi * 12.9898) * 43758.55) % 1.0
    h2 = (np.sin(fi * 78.233) * 12543.21) % 1.0
    return np.array([0.72 + 0.26 * h1, 0.76 + 0.24 * h1, 0.68 + 0.24 * h2])


def render(V, F, N, albedo, ao=None, size=(850, 1050), elev=8.0, azim=-75.0,
           wire=False, bg=(235, 238, 240), fit=None, uvs=None, face_tex=None,
           tex_bark=None, tex_leaf=None, sky=True, shadow=True):
    """Rasterize. face_tex: per-face 0=flat,1=bark,2=leaf; uvs per-vertex."""
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
    L2 = np.array([-0.55, 0.30, -0.75])  # cool rim from back-left
    L2 /= np.linalg.norm(L2)
    KEY = np.array([1.03, 0.98, 0.90])
    RIM = np.array([0.45, 0.55, 0.70])
    SKY_C = np.array([0.62, 0.70, 0.80])
    GND_C = np.array([0.38, 0.33, 0.26])

    zbuf = np.full((H, W), -np.inf)
    img = np.zeros((H, W, 3), float)
    if sky:
        t = np.linspace(0.0, 1.0, H)[:, None, None]
        top = np.array([233, 241, 247]) / 255.0
        mid = np.array([238, 233, 220]) / 255.0
        bot = np.array([205, 197, 181]) / 255.0
        m = np.clip(t * 2.0, 0, 1)
        img[:] = top * (1 - m) + mid * m
        m2 = np.clip(t * 2.0 - 1.0, 0, 1)
        img[:] = img * (1 - m2) + bot * m2
    else:
        img[:] = np.array(bg) / 255.0
    if shadow:
        yy0, xx0 = np.mgrid[0:H, 0:W]
        cx = float(fx.mean() * 0 + px.mean())
        base = float(py.max())
        rx = max(float(np.ptp(px)) * 0.30, 20.0)
        ry = max(H * 0.055, 12.0)
        dd = ((xx0 - cx) / rx) ** 2 + ((yy0 - base) / ry) ** 2
        sh = np.clip(1.0 - dd, 0, 1) ** 1.5 * 0.34
        img *= (1.0 - sh[..., None])

    alb = np.asarray(albedo, float)
    per_face_alb = alb.ndim == 2 and len(alb) == len(F)
    ao_arr = np.asarray(ao, float) if ao is not None else None
    textured = face_tex is not None and uvs is not None
    if textured:
        UV = np.asarray(uvs, float)
        face_tex = np.asarray(face_tex, np.int64)

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
        a = alb[fi] if per_face_alb else alb
        a = np.broadcast_to(a, (inside.shape[0], inside.shape[1], 3)).copy()
        if textured:
            ft = face_tex[fi]
            if ft == 1 and tex_bark is not None:
                uu = w0 * UV[i0, 0] + w1 * UV[i1, 0] + w2 * UV[i2, 0]
                vv = w0 * UV[i0, 1] + w1 * UV[i1, 1] + w2 * UV[i2, 1]
                a = _sample(tex_bark, uu, vv, True)[..., :3]
            elif ft == 2 and tex_leaf is not None:
                uu = w0 * UV[i0, 0] + w1 * UV[i1, 0] + w2 * UV[i2, 0]
                vv = w0 * UV[i0, 1] + w1 * UV[i1, 1] + w2 * UV[i2, 1]
                s = _sample(tex_leaf, uu, vv, False)
                inside = inside & (s[..., 3] >= 0.45)
                if not inside.any():
                    continue
                a = s[..., :3] * _face_tint(fi)[None, None, :]
        zz = w0 * az_ + w1 * bz_ + w2 * cz_
        region = zbuf[miny : maxy + 1, minx : maxx + 1]
        upd = inside & (zz > region)
        if not upd.any():
            continue
        # smooth normal + 3-point light
        nn = w0[..., None] * light[i0] + w1[..., None] * light[i1] + w2[..., None] * light[i2]
        nn /= np.linalg.norm(nn, axis=2, keepdims=True) + 1e-12
        diff = np.abs(nn @ L) * 0.70 + 0.30
        rim = np.clip(nn @ L2, 0, 1) ** 2 * 0.55
        hemi = SKY_C[None, None, :] * (0.5 + 0.5 * nn[..., 1])[..., None] \
            + GND_C[None, None, :] * (0.5 - 0.5 * nn[..., 1])[..., None]
        col = a * (KEY[None, None, :] * diff[..., None] + hemi * 0.55)
        col = col + a * RIM[None, None, :] * rim[..., None]
        if ao_arr is not None:
            aov = w0 * ao_arr[i0] + w1 * ao_arr[i1] + w2 * ao_arr[i2]
            col = col * (0.30 + 0.70 * aov[..., None])
        if wire:
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


def render_tree_preview(result, size=(760, 940), elev=8.0, azim=-75.0):
    """Full leafy textured preview of a GenerateResult. Returns uint8 image."""
    V = np.asarray(result.bark.verts(), float)
    F = np.asarray(result.bark.triangulate(), np.int64)
    N = np.asarray(result.bark_normals, float)
    UV = np.asarray(result.bark_uv, float)
    bark_alb = np.array([0.62, 0.47, 0.34])
    tex_bark = get_tex("bark_albedo.png", 128)
    if result.leaves is None:
        return render(V, F, N, bark_alb, ao=np.asarray(result.bark_wind["ao"], float),
                      size=size, elev=elev, azim=azim, uvs=UV,
                      face_tex=np.ones(len(F), np.int64), tex_bark=tex_bark)
    LP = np.asarray(result.leaves.positions, float)
    LI = np.asarray(result.leaves.indices)
    LN = np.asarray(result.leaves.normals, float)
    LUV = np.asarray(result.leaves.uvs, float)
    VV = np.vstack([V, LP])
    FF = np.vstack([F, LI + len(V)])
    NN = np.vstack([N, LN])
    UU = np.vstack([UV, LUV])
    alb = np.zeros((len(FF), 3))
    alb[: len(F)] = bark_alb
    alb[len(F):] = np.array([0.24, 0.46, 0.20])
    ft = np.zeros(len(FF), np.int64)
    ft[: len(F)] = 1
    ft[len(F):] = 2
    ao_full = np.concatenate(
        [np.asarray(result.bark_wind["ao"], float), np.ones(len(LP))])
    return render(VV, FF, NN, alb, ao=ao_full, size=size, elev=elev, azim=azim,
                  uvs=UU, face_tex=ft, tex_bark=tex_bark,
                  tex_leaf=get_tex("leaf_alpha.png"))


def main(preset="oak", seed=1, outdir="examples/output"):
    os.makedirs(outdir, exist_ok=True)
    r = generate_tree(preset, seed=seed)
    V = r.bark.verts()
    F = r.bark.triangulate()
    print(preset, "valid:", r.report["valid"], "V:", len(V), "F:", len(F))
    bark_alb = np.array([0.62, 0.47, 0.34])
    img = render(V, F, r.bark_normals, bark_alb, ao=r.bark_wind["ao"],
                 uvs=np.asarray(r.bark_uv, float),
                 face_tex=np.ones(len(F), np.int64),
                 tex_bark=get_tex("bark_albedo.png", 128))
    Image.fromarray(img).save(f"{outdir}/soft_{preset}_bark.png")
    # leafy composite
    if r.leaves is not None:
        img2 = render_tree_preview(r)
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
                          size=(800, 800), elev=15, azim=-50, wire=True,
                          sky=False, shadow=False)
            Image.fromarray(img3).save(f"{outdir}/soft_{preset}_junction.png")
            Uo = np.asarray(r.bark_uv, float)[used]
            img4 = render(Vs, Fs, Ns, np.array([0.62, 0.47, 0.34]),
                          size=(800, 800), elev=15, azim=-50, wire=False,
                          uvs=Uo, face_tex=np.ones(len(Fs), np.int64),
                          tex_bark=get_tex("bark_albedo.png", 128),
                          sky=False, shadow=False)
            Image.fromarray(img4).save(f"{outdir}/soft_{preset}_junction_shaded.png")
    print("wrote", outdir)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="oak")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    main(a.preset, a.seed)
