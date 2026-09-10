#!/usr/bin/env python3
"""Procedural placeholder bark + leaf textures (PIL, no assets needed)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")


def bark(size=512, seed=7):
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, size)
    y = np.linspace(0, 1, size)
    xx, yy = np.meshgrid(x, y)
    v = np.zeros((size, size))
    f = 6.0
    amp = 1.0
    for _ in range(5):
        ph = rng.uniform(0, 6.28, 3)
        v += amp * (
            np.sin(xx * f * 6.28 + ph[0] + 2.0 * np.sin(yy * f * 3.0 + ph[1]))
            * (0.6 + 0.4 * np.sin(yy * f * 12.0 + ph[2]))
        )
        f *= 2.1
        amp *= 0.5
    v = (v - v.min()) / (np.ptp(v) + 1e-9)
    # dark cracks: threshold ridges
    crack = np.clip((0.5 - np.abs(v - 0.5)) * 4.0, 0, 1)
    base = np.stack(
        [v * 0.42 + 0.10, v * 0.30 + 0.07, v * 0.22 + 0.05], axis=-1
    )
    base *= 0.55 + 0.45 * crack[..., None]
    img = (np.clip(base, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(img)


def leaf(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    # leaf blade: pointed ellipse
    blade = [(cx + np.cos(t) * size * 0.30 * (0.55 + 0.45 * np.sin(t)),
              cy + np.sin(t) * size * 0.44) for t in np.linspace(0, 2 * np.pi, 64)]
    # taper to tip at top
    pts = []
    for i, (px, py) in enumerate(blade):
        f = 1.0
        pts.append((px, py))
    d.polygon(pts, fill=(56, 122, 44, 255))
    # midrib + veins
    d.line([(cx, size * 0.94), (cx, size * 0.08)], fill=(38, 88, 30, 255), width=3)
    for k in range(6):
        y = size * (0.80 - k * 0.11)
        w = size * (0.20 - k * 0.02)
        d.line([(cx, y), (cx - w, y - size * 0.07)], fill=(44, 100, 34, 255), width=2)
        d.line([(cx, y), (cx + w, y - size * 0.07)], fill=(44, 100, 34, 255), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    bark().save(os.path.join(OUT, "bark_albedo.png"))
    leaf().save(os.path.join(OUT, "leaf_alpha.png"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
