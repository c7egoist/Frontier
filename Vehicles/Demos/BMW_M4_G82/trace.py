#!/usr/bin/env python3
"""Trace the BMW M4 G82 4-view blueprint (the-blueprints.com preview) into 2D profile polylines.

Output: traces.json (all units METRES, x long [0..4.794] nose->tail, y lat +=right, z height)
        overlay_*.png verification images (traces drawn back over the blueprint)
"""
import json, math
import numpy as np
from PIL import Image, ImageDraw

SRC = 'Vehicles/Demos/BMW_M4_G82/M4_G82_Blueprint_Source.jpg'
OUT = 'Vehicles/Demos/BMW_M4_G82'

im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int32)
R, G, B = im[..., 0], im[..., 1], im[..., 2]

yellow = (R > 130) & (G > 130) & (B < 150) & (np.abs(R - G) < 70) & ((R + G) / 2 - B > 45)
dark = (R < 110) & (G < 110) & (B < 110)
mask = yellow | dark

# rough crops (full-image px), chosen to exclude dimension arrows / titles / scale bar
CROPS = dict(side=(0, 40, 860, 336), top=(0, 430, 860, 835), front=(865, 60, 1242, 332))

def biggest_blob_bbox(sub):
    """bbox (in sub coords) of the largest 4-connected blob."""
    from collections import deque
    seen = np.zeros(sub.shape, bool); best = (0, None)
    starts = np.nonzero(sub)
    for sy, sx in zip(*starts):
        if seen[sy, sx]: continue
        q = deque([(int(sy), int(sx))]); seen[sy, sx] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                yy, xx = y+dy, x+dx
                if 0 <= yy < sub.shape[0] and 0 <= xx < sub.shape[1] and sub[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx))
        if len(pts) > best[0]:
            a = np.array(pts); best = (len(pts), (int(a[:,1].min()), int(a[:,0].min()), int(a[:,1].max())+1, int(a[:,0].max())+1))
    return best[1]

def smooth_nan(v, k=7):
    k |= 1; p = k // 2
    v = v.astype(float); idx = np.arange(len(v)); ok = ~np.isnan(v)
    v = np.interp(idx, idx[ok], v[ok])
    return np.convolve(np.pad(v, p, mode='edge'), np.ones(k)/k, mode='valid')

def rdp(P, eps):
    if len(P) < 3: return P
    a, b = P[0], P[-1]; ab = b - a; L = np.hypot(*ab)
    d = np.abs(ab[0]*(P[:,1]-a[1]) - ab[1]*(P[:,0]-a[0])) / L if L else np.linalg.norm(P - a, axis=1)
    i = int(np.argmax(d))
    return np.vstack([rdp(P[:i+1], eps)[:-1], rdp(P[i:], eps)]) if d[i] > eps else np.array([a, b])

def env_cols(sub):
    """per-column first/last mask row."""
    top = np.full(sub.shape[1], np.nan); bot = np.full(sub.shape[1], np.nan)
    for c in np.nonzero(sub.any(axis=0))[0]:
        r = np.nonzero(sub[:, c])[0]; top[c], bot[c] = r.min(), r.max()
    return top, bot

def env_rows(sub):
    lft = np.full(sub.shape[0], np.nan); rgt = np.full(sub.shape[0], np.nan)
    for r in np.nonzero(sub.any(axis=1))[0]:
        c = np.nonzero(sub[r, :])[0]; lft[r], rgt[r] = c.min(), c.max()
    return lft, rgt

def fit_circle(X, Y):
    A = np.c_[2*X, 2*Y, np.ones(len(X))]; b = X**2 + Y**2
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    return sol[0], sol[1], math.sqrt(sol[2] + sol[0]**2 + sol[1]**2)

base = Image.open(SRC).convert('RGB')

def draw_poly(dr, pts_px, col, off, w=2):
    dr.line([(off[0]+x, off[1]+y) for x, y in pts_px], fill=col, width=w)

# ================================================================ SIDE VIEW
ax, ay, bx, by = CROPS['side']
sub = mask[ay:by, ax:bx]
bb = biggest_blob_bbox(sub)                       # sub-local
x0, y0, x1, y1 = bb
carS = sub[y0:y1, x0:x1]
topc, botc = env_cols(carS)
Npx = x1 - x0 - 1                                 # car length in px
s = 4.794 / Npx * 1000.0                          # mm per px
print(f'side: car {Npx+1}px, {s:.3f} mm/px, bbox rows {y0}..{y1}')

ground = float(np.nanpercentile(botc, 99.5))      # tyre contact row (local)
bs = smooth_nan(botc, 5); ts = smooth_nan(topc, 5)
cols = np.where(~np.isnan(botc))[0].astype(float)

# --- wheel zones: columns with DENSE dark fill in lower band (tyre+wheel), over rolling window
darkS = dark[ay+y0:ay+y1, ax+x0:ax+x1]
dens_zone = np.zeros(carS.shape[1])
for c in range(carS.shape[1]):
    if np.isnan(botc[c]): continue
    lo, hi = botc[c] - 125, botc[c] - 10           # tyre bulk band above contact patch
    if lo < 0 or hi <= lo: continue
    seg = darkS[int(lo):int(hi)+1, c]
    if len(seg): dens_zone[c] = seg.mean()
tyre_col = (dens_zone > 0.40) & (botc > ground - 15)
print('dbg: max dens %.2f, cols dens>0.4: %d, cols deep: %d, both: %d'
      % (dens_zone.max(), (dens_zone > 0.40).sum(), (botc > ground - 15).sum(), int(tyre_col.sum())))
def runs_of(b, min_len):
    out, i = [], 0
    while i < len(b):
        if b[i]:
            j = i
            while j+1 < len(b) and b[j+1]: j += 1
            out.append((i, j)); i = j+1
        else: i += 1
    return [r for r in out if r[1]-r[0] >= min_len - 1]

# morphological closing: merge true-runs separated by gaps < 15 cols
tc = tyre_col.copy()
for g0, g1 in runs_of(~tc, 1):
    if g1 - g0 < 15 and g0 > 0 and g1 < len(tc) - 1: tc[g0:g1+1] = True
runs = runs_of(tc, 40)
print('tyre column runs:', runs)

wheels = []
for za, zb in runs:
    # tyre centre x = depth-weighted centroid of the zone
    wts = dens_zone[za:zb+1] * np.clip(bs[za:zb+1] - (ground - 30), 0, None)
    cx_ = float((np.arange(za, zb+1) * wts).sum() / max(wts.sum(), 1e-9))
    # arch-edge points: envelope rows clearly ABOVE the sill line (sill = robust mid-car bottom)
    mid0, mid1 = int(runs[0][1]) + 30, int(runs[1][0]) - 30
    sill = float(np.median(bs[mid0:mid1]))
    X, Y = [], []
    for c in range(int(cx_) - 62, int(cx_) + 63):
        if 0 <= c < len(bs) and not np.isnan(bs[c]) and bs[c] < sill - 9:
            X.append(c); Y.append(bs[c])
    if len(X) < 15:
        X = np.arange(za, zb+1, dtype=float); Y = bs[za:zb+1]
    # 2-parameter robust fit: scan cx (±7px) and cy to minimise spread of point-radii
    best = None
    for cx0_ in np.arange(cx_ - 7, cx_ + 7.1, 0.5):
        for cy_ in np.arange(ground - 75, ground - 45, 0.5):   # arch centre 45..75px above ground
            r_i = np.hypot(np.asarray(X) - cx0_, np.asarray(Y) - cy_)
            med = np.median(r_i)
            dev = np.abs(r_i - med)
            inr = dev < max(2.0, med * 0.08)
            std = r_i[inr].std()
            if best is None or std < best[0]: best = (std, cx0_, cy_, r_i[inr].mean())
    cx_, cy_, rr = best[1], best[2], best[3]
    wheels.append(dict(cx=float(cx_), cy=float(cy_), r=float(rr), zone=(int(za), int(zb))))
    print(f'wheel: c=({cx_:.0f},{cy_:.0f})px r={rr:.1f}px = {rr*s:.0f} mm  (fit spread {best[0]:.2f}px)')

wheels.sort(key=lambda w: w['cx'])
wb_mm = (wheels[1]['cx'] - wheels[0]['cx']) * s
print(f'wheelbase traced: {wb_mm:.0f} mm (spec 2857)')

# --- outline in mm (x from nose; nose = LEFT edge x=0)
colsI = np.where(~np.isnan(botc))[0]
x_mm = colsI * s
z_top = (ground - ts[colsI]) * s
z_bot = (ground - bs[colsI]) * s
P_up = np.c_[x_mm, z_top]
P_lo = np.c_[x_mm, z_bot]
# arch spans excluded from lower spline (cut as circles in CAD):
arch_spans = [[w['cx'] - w['r'] - 10, w['cx'] + w['r'] + 10] for w in wheels]
arch_spans = [[(a)*s, (b)*s] for a, b in arch_spans]
keep = np.ones(len(P_lo), bool)
for a0, a1 in arch_spans:
    keep &= ~((P_lo[:, 0] > a0) & (P_lo[:, 0] < a1))
P_up_s = rdp(P_up, 6.0); P_lo_s = rdp(P_lo[keep], 6.0)
print(f'upper spline pts: {len(P_up_s)}, lower: {len(P_lo_s)}')

# overlay
dr = ImageDraw.Draw(base)
offS = (ax+x0, ay+y0)
draw_poly(dr, [(p[0]/s, ground - p[1]/s) for p in P_up_s], (255,0,0), offS)
draw_poly(dr, [(p[0]/s, ground - p[1]/s) for p in P_lo_s], (0,60,255), offS)
for w in wheels:
    dr.ellipse([offS[0]+w['cx']-w['r'], offS[1]+w['cy']-w['r'], offS[0]+w['cx']+w['r'], offS[1]+w['cy']+w['r']], outline=(255,0,255), width=2)
base.crop((ax+x0-15, ay+y0-15, ax+x1+15, ay+y1+15)).save(f'{OUT}/overlay_side.png')

# ================================================================ TOP VIEW
ax, ay, bx, by = CROPS['top']
sub = mask[ay:by, ax:bx]
x0, y0, x1, y1 = biggest_blob_bbox(sub)
carT = sub[y0:y1, x0:x1]
topT, botT = env_cols(carT)
NpxT = x1 - x0 - 1
st = 4.794 / NpxT * 1000.0
colsT = np.where(~np.isnan(topT))[0]
tT = smooth_nan(topT, 9)[colsT]; bT = smooth_nan(botT, 9)[colsT]
cT = (tT + bT) / 2
halfT = (bT - tT) / 2 * st
xT = colsT * st
# door-mirror spikes: local protrusions > 12 mm vs 41-col (~24 cm) median, then clamp to spec half-width
def medfilt(v, k):
    p = k//2; vv = np.pad(v, p, mode='edge')
    return np.array([np.median(vv[i:i+k]) for i in range(len(v))])
hm = medfilt(halfT, 41)
halfT = np.where(halfT - hm > 12, hm, halfT)
halfT = np.minimum(halfT, 943.5)
pw = 2 * halfT.max()
print(f'top: {NpxT+1}px, {st:.3f} mm/px, max width {pw:.0f} mm (spec 1887)')
PL = np.c_[xT, -halfT]; PR = np.c_[xT, halfT]
PL_s = rdp(PL, 5.0); PR_s = rdp(PR[::-1], 5.0)   # right reversed for closed-winding ease
print(f'plan spline pts L/R: {len(PL_s)}/{len(PR_s)}')
dr = ImageDraw.Draw(base)
offT = (ax+x0, ay+y0)
draw_poly(dr, [(p[0]/st, cT[int(np.argmin(np.abs(xT - p[0])))] + p[1]/st) for p in PL_s], (255,0,0), offT)
draw_poly(dr, [(p[0]/st, cT[int(np.argmin(np.abs(xT - p[0])))] + p[1]/st) for p in PR_s[::-1]], (0,60,255), offT)
base.crop((ax+x0-15, ay+y0-15, ax+x1+15, ay+y1+15)).save(f'{OUT}/overlay_top.png')

# ================================================================ FRONT VIEW
ax, ay, bx, by = CROPS['front']
sub = mask[ay:by, ax:bx]
x0, y0, x1, y1 = biggest_blob_bbox(sub)
carF = sub[y0:y1, x0:x1]
lftF, rgtF = env_rows(carF)
sf = 1.393 / (y1 - y0 - 1) * 1000.0
rowsF = np.where(~np.isnan(lftF))[0]
LF = smooth_nan(lftF, 5)[rowsF]; RF = smooth_nan(rgtF, 5)[rowsF]
cF = (LF + RF) / 2
halfF = (RF - LF) / 2 * sf
zF = ((y1 - y0 - 1) - rowsF) * sf
# mirror spike clip (medians over 51 rows ~= 25 cm of height), then clamp to spec half-width
hfm = medfilt(halfF, 51)
halfFc = np.where(halfF - hfm > 25, hfm, halfF)
halfFc = np.minimum(halfFc, 943.5)
print(f'front: width {2*halfFc.max():.0f} mm (spec 1887)')
PF = np.c_[halfFc, zF]                            # right half (y,z)
PF_s = rdp(PF, 8.0)
print(f'front section pts: {len(PF_s)}')
dr = ImageDraw.Draw(base)
offF = (ax+x0, ay+y0)
draw_poly(dr, [(cF[int(np.argmin(np.abs(zF - p[1])))] + p[0]/sf, (y1-y0-1) - p[1]/sf) for p in PF_s], (255,0,0), offF)
draw_poly(dr, [(cF[int(np.argmin(np.abs(zF - p[1])))] - p[0]/sf, (y1-y0-1) - p[1]/sf) for p in PF_s], (255,0,0), offF)
base.crop((ax+x0-15, ay+y0-15, ax+x1+15, ay+y1+15)).save(f'{OUT}/overlay_front.png')

# ================================================================ SAVE (metres)
def M(P): return [[round(float(x)/1000.0, 5), round(float(y)/1000.0, 5)] for x, y in P]
tr = dict(
    src='the-blueprints.com BMW M4 Competition G82 (2020) preview',
    dims=dict(length=4.794, width=1.887, height=1.393, wheelbase_spec=2.857, wheelbase_traced=round(wb_mm/1000, 3)),
    wheels=[dict(x=w['cx']*s/1000, z=(ground-w['cy'])*s/1000, arch_r=w['r']*s/1000+0.015) for w in wheels],
    side_upper=M(P_up_s), side_lower=M(P_lo_s),
    plan_left=M(PL_s), plan_right=M(PR_s),
    front_right=M(PF_s),
)
json.dump(tr, open(f'{OUT}/traces.json', 'w'), indent=1)
print('traces.json written')
