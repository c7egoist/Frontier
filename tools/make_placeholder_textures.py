#!/usr/bin/env python3
"""Procedural placeholder bark + leaf textures (PIL/numpy, no assets needed).

Outputs (assets/):
  bark_albedo.png — vertical furrowed bark
  bark_normal.png — tangent-space normal map derived from the same height
  leaf_alpha.png  — RGBA leaf card (alpha-tested foliage)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")


def _vnoise(size, cx, cy, seed):
    """Seamless periodic value noise on a cx*cy lattice, upsampled to size."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cy, cx))
    xs = np.arange(size) / size * cx
    ys = np.arange(size) / size * cy
    x0 = np.floor(xs).astype(int) % cx
    x1 = (x0 + 1) % cx
    fx = (xs - np.floor(xs)) ** 1.0
    fx = fx * fx * (3 - 2 * fx)
    y0 = np.floor(ys).astype(int) % cy
    y1 = (y0 + 1) % cy
    fy = ys - np.floor(ys)
    fy = fy * fy * (3 - 2 * fy)
    return (
        grid[y0][:, x0] * (1 - fx[None, :]) * (1 - fy[:, None])
        + grid[y0][:, x1] * fx[None, :] * (1 - fy[:, None])
        + grid[y1][:, x0] * (1 - fx[None, :]) * fy[:, None]
        + grid[y1][:, x1] * fx[None, :] * fy[:, None]
    )


def _fbm(size, seed, cx=6, cy=6, octaves=5):
    v = np.zeros((size, size))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        v += amp * _vnoise(size, cx * (2**o), cy * (2**o), seed + o * 131)
        tot += amp
        amp *= 0.5
    return v / tot


def bark(size=512, seed=7):
    # deep vertical furrows: high x-freq ridged noise, low y-freq
    lat = _fbm(size, seed, cx=14, cy=3, octaves=4)
    furrow = 1.0 - np.abs(2.0 * lat - 1.0)  # 1 on ridge lines
    crack = np.clip((furrow - 0.62) * 3.2, 0, 1) ** 1.4  # dark grooves
    plates = _fbm(size, seed + 11, cx=5, cy=7, octaves=4)  # tonal patches
    grain = _fbm(size, seed + 23, cx=48, cy=10, octaves=3)  # fine fiber
    h = 0.52 * (1 - crack) + 0.30 * plates + 0.18 * grain
    h = (h - h.min()) / (np.ptp(h) + 1e-9)
    # albedo: grey-brown plates, near-black furrows, pale worn tops
    top = np.clip((h - 0.62) * 3.0, 0, 1)
    albedo = np.zeros((size, size, 3))
    albedo[..., 0] = 0.32 + 0.26 * plates + 0.22 * top - 0.26 * crack
    albedo[..., 1] = 0.24 + 0.19 * plates + 0.17 * top - 0.20 * crack
    albedo[..., 2] = 0.18 + 0.13 * plates + 0.12 * top - 0.14 * crack
    albedo += np.random.default_rng(seed + 2).normal(0, 0.010, albedo.shape)
    albedo = np.clip(albedo, 0, 1)
    # normal map from height (tangent space, +Y up in UV)
    strength = 3.0
    dx = np.gradient(h, axis=1) * strength
    dy = np.gradient(h, axis=0) * strength
    nrm = np.stack([-dx, dy, np.ones_like(h)], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-9
    normal_img = ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)
    return (albedo * 255).astype(np.uint8), normal_img


def leaf(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = size / 2
    # blade: pointed-oval via two arcs
    top, bottom, half = size * 0.06, size * 0.90, size * 0.30
    steps = 48
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        y = bottom + (top - bottom) * t
        wdt = half * np.sin(np.pi * np.clip(t, 0.02, 0.98)) ** 0.8
        wdt *= 0.92 + 0.08 * np.sin(t * 40.0)  # faint serration
        left.append((cx - wdt, y))
        right.append((cx + wdt, y))
    blade = left + right[::-1]
    # vertical gradient greens
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for yy in range(size):
        t = yy / size
        g = (int(58 + 30 * (1 - t)), int(128 + 40 * (1 - t)), int(46 + 22 * (1 - t)), 255)
        gd.line([(0, yy), (size, yy)], fill=g)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(blade, fill=255)
    img = Image.composite(grad, img, mask)
    d = ImageDraw.Draw(img)
    # stem + midrib + veins
    d.line([(cx, size * 0.99), (cx, size * 0.10)], fill=(52, 96, 36, 255), width=4)
    d.line([(cx, size * 0.90), (cx, size * 0.10)], fill=(74, 132, 50, 255), width=2)
    for k in range(7):
        y = size * (0.82 - k * 0.10)
        wdt = size * (0.20 - k * 0.018)
        d.line([(cx, y), (cx - wdt, y - size * 0.09)], fill=(64, 118, 44, 255), width=2)
        d.line([(cx, y), (cx + wdt, y - size * 0.09)], fill=(64, 118, 44, 255), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    a = np.array(img)
    a[..., 3] = np.where(a[..., 3] > 128, 255, 0).astype(np.uint8)  # crisp alpha
    return Image.fromarray(a)


def main():
    os.makedirs(OUT, exist_ok=True)
    alb, nrm = bark()
    Image.fromarray(alb).save(os.path.join(OUT, "bark_albedo.png"))
    Image.fromarray(nrm).save(os.path.join(OUT, "bark_normal.png"))
    leaf().save(os.path.join(OUT, "leaf_alpha.png"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
