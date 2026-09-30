#!/usr/bin/env python3
# ======================================================================================================================
# PreviewExtraction.py -- verification render for ExtractVehicle.py.
#
# This is NOT a renderer for delivery; it is the Phase-A proof gate.  It rasterises the extracted scene with the
# authored Principled base colours so the material ASSIGNMENT can be checked against the Blender viewport by eye
# and by pixel statistics.  The engine render is the shipped path; this exists only to prove the extraction.
# ======================================================================================================================
import json, math, os, struct, zlib, sys

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, 'controlvehicle_scene.json')))
MAT = {m['name']: m['inputs'] for m in S['materials']}


def srgb(c):
    return 0.0 if c <= 0 else (12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055)


def write_png(path, w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))
    open(path, 'wb').write(png)


def build():
    """Flatten every object into world triangles tagged with their authored material name."""
    tris = []
    for o in S['objects']:
        V, slots = o['verts'], o['slots']
        for t, mi in zip(o['tris'], o['tri_material']):
            name = slots[mi] if mi < len(slots) else None
            tris.append((V[t[0]], V[t[1]], V[t[2]], name, o['name']))
    return tris


def render(tris, path, eye, target, up, fov, w=720, h=440, ortho=None):
    fwd = [target[i] - eye[i] for i in range(3)]
    n = math.sqrt(sum(c * c for c in fwd)); fwd = [c / n for c in fwd]
    rt = [fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2], fwd[0] * up[1] - fwd[1] * up[0]]
    n = math.sqrt(sum(c * c for c in rt)); rt = [c / n for c in rt]
    u2 = [rt[1] * fwd[2] - rt[2] * fwd[1], rt[2] * fwd[0] - rt[0] * fwd[2], rt[0] * fwd[1] - rt[1] * fwd[0]]
    f = 1.0 / math.tan(math.radians(fov) * 0.5)
    aspect = w / h
    L = [0.45, -0.7, 0.75]
    ln = math.sqrt(sum(c * c for c in L)); L = [c / ln for c in L]

    buf = [0] * (w * h * 3)
    for i in range(w * h):
        t = (i // w) / h
        c = [0.10 + 0.22 * (1 - t), 0.11 + 0.24 * (1 - t), 0.13 + 0.28 * (1 - t)]
        buf[i * 3:i * 3 + 3] = [int(255 * srgb(x)) for x in c]
    zb = [1e30] * (w * h)

    def project(p):
        d = [p[i] - eye[i] for i in range(3)]
        x = sum(d[i] * rt[i] for i in range(3))
        y = sum(d[i] * u2[i] for i in range(3))
        z = sum(d[i] * fwd[i] for i in range(3))
        if ortho:
            return (w * 0.5 + x / ortho * w * 0.5, h * 0.5 - y / ortho * w * 0.5, z)
        if z <= 1e-4:
            return None
        return (w * 0.5 + (x * f / aspect / z) * w * 0.5, h * 0.5 - (y * f / z) * h * 0.5, z)

    for a, b, c, mname, oname in tris:
        pa, pb, pc = project(a), project(b), project(c)
        if not (pa and pb and pc):
            continue
        area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if abs(area) < 1e-9:
            continue
        e1 = [b[i] - a[i] for i in range(3)]
        e2 = [c[i] - a[i] for i in range(3)]
        nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        nl = math.sqrt(sum(x * x for x in nr)) or 1.0
        nr = [x / nl for x in nr]
        inp = MAT.get(mname, {})
        base = inp.get('Base Color', [0.8, 0.0, 0.8])
        emC = inp.get('Emission Color', [0, 0, 0]); emS = inp.get('Emission Strength', 0.0) or 0.0
        ndl = abs(sum(nr[i] * L[i] for i in range(3)))
        shade = 0.18 + 0.82 * ndl
        col = [min(1.0, base[i] * shade + (emC[i] * min(emS, 4.0) * 0.25 if emS > 0 else 0)) for i in range(3)]
        px = [int(255 * srgb(x)) for x in col]

        x0 = max(0, int(min(pa[0], pb[0], pc[0]))); x1 = min(w - 1, int(max(pa[0], pb[0], pc[0])) + 1)
        y0 = max(0, int(min(pa[1], pb[1], pc[1]))); y1 = min(h - 1, int(max(pa[1], pb[1], pc[1])) + 1)
        for py in range(y0, y1 + 1):
            for pxx in range(x0, x1 + 1):
                sx, sy = pxx + 0.5, py + 0.5
                w0 = ((pb[0] - pa[0]) * (sy - pa[1]) - (sx - pa[0]) * (pb[1] - pa[1])) / area
                w1 = ((sx - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (sy - pa[1])) / area
                if w0 < 0 or w1 < 0 or w0 + w1 > 1:
                    continue
                z = pa[2] * (1 - w0 - w1) + pb[2] * w1 + pc[2] * w0
                k = py * w + pxx
                if z < zb[k]:
                    zb[k] = z
                    buf[k * 3:k * 3 + 3] = px
    write_png(path, w, h, buf)
    return sum(1 for z in zb if z < 1e29)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/prev'
    os.makedirs(out, exist_ok=True)
    tris = build()
    print('%d triangles' % len(tris))
    views = {
        'FrontQuarter': ([7.0, -6.5, 3.4], [0, 0, 0.6], 50),
        'Side':         ([0.2, -9.5, 1.4], [0.2, 0, 0.7], 42),
        'RearQuarter':  ([-7.2, -6.2, 3.0], [0, 0, 0.6], 50),
        'Top':          ([0.0, -0.001, 11.0], [0, 0, 0], 42),
    }
    for name, (eye, tgt, fov) in views.items():
        px = render(tris, os.path.join(out, 'Extract%s.png' % name), eye, tgt, [0, 0, 1], fov)
        print('   %-14s %d px covered' % (name, px))
