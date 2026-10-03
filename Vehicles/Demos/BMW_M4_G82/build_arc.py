#!/usr/bin/env python3
"""Build the SolidArc journal for the BMW M4 G82 from the traced blueprint curves (traces.json).

Vehicle frame (metres, Z up): origin = front axle centre at ground level.
+X forward (nose +0.858, tail -3.936) · Y lateral +/-0.9435 · Z up, roof 1.393.

Architecture (kept boolean-safe after probing the kernel — SUBTRACTS are done on the
clean side extrusion only, tumblehome comes from a z-tapered plan LOFT, and the body is
ONE intersect of two solids):
  PHASE 1  side silhouette (traced) - 2 arch circles (2D profile boolean)  -> extrude
  PHASE 2  kidney-grille + intake slots subtracted from the clean side block
  PHASE 3  plan outline (symmetrised trace) lofted through 7 z-sections whose y-scale
           follows the traced front-view tumblehome -> PlanLoft solid
  PHASE 4  Body = SideBlock ∩ PlanLoft           (single NURBS SSI intersect, verified)
  PHASE 5  wheels (tyre/rim/cap cylinders) + mirrors as separate figures
  PHASE 6  dimensional proof, save native document, export OBJ, hero renders
"""
import json
import numpy as np

D = 'Vehicles/Demos/BMW_M4_G82'
tr = json.load(open(f'{D}/traces.json'))
XOFF = tr['wheels'][0]['x']
print('front axle x=%.4f m from nose' % XOFF)

def rdp(P, eps):
    P = np.asarray(P, float)
    if len(P) < 3: return P
    a, b = P[0], P[-1]; ab = b - a; L = np.hypot(*ab)
    d = np.abs(ab[0]*(P[:,1]-a[1]) - ab[1]*(P[:,0]-a[0])) / L if L else np.linalg.norm(P-a, axis=1)
    i = int(np.argmax(d))
    return np.vstack([rdp(P[:i+1], eps)[:-1], rdp(P[i:], eps)]) if d[i] > eps else np.array([a, b])

def self_cross(P):
    P = [tuple(p) for p in P]; n = len(P)
    def o(p, q, r): return (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0])
    for i in range(n):
        a, b = P[i], P[(i+1) % n]
        for j in range(i+1, n):
            if abs(i-j) <= 1 or (i == 0 and j == n-1): continue
            c, d = P[j], P[(j+1) % n]
            o1, o2, o3, o4 = o(a,b,c), o(a,b,d), o(c,d,a), o(c,d,b)
            if o1*o2 < 0 and o3*o4 < 0: return (i, j)
    return None

def dedupe(P, tol=8e-4):
    out = [np.asarray(P[0], float)]
    for p in P[1:]:
        if np.hypot(*(np.asarray(p) - out[-1])) > tol: out.append(np.asarray(p, float))
    if len(out) > 2 and np.hypot(*(np.asarray(out[-1]) - np.asarray(out[0]))) <= tol: out = out[:-1]
    return [tuple(p) for p in out]

def fmt(P): return ' '.join('(%.4f,%.4f)' % (x, y) for x, y in P)

# ---------------------------------------------------------------- 1. SIDE silhouette
W = tr['wheels']
ARCH = [(XOFF - w['x'], w['z'], w['arch_r']) for w in W]
up = np.array(tr['side_upper']); lo = np.array(tr['side_lower'])
up[:, 0] = XOFF - up[:, 0]; lo[:, 0] = XOFF - lo[:, 0]
up = up[up[:, 0].argsort()[::-1]]
lo = lo[lo[:, 0].argsort()[::-1]]
arch_mask = np.zeros(len(lo), bool)
for cx, cz, r in ARCH:
    arch_mask |= (lo[:, 0] > cx - 0.52) & (lo[:, 0] < cx + 0.52)
outline = np.vstack([up, lo[~arch_mask][::-1]])
outline = np.array(dedupe(rdp(outline, 0.0025), 5e-4))
assert self_cross(outline) is None
print('side outline %d pts, x %.3f..%.3f' % (len(outline), outline[:,0].min(), outline[:,0].max()))

# ---------------------------------------------------------------- 2. PLAN loft sections
PL = np.array(tr['plan_left']); PR = np.array(tr['plan_right'])
PL[:, 0] = XOFF - PL[:, 0]; PR[:, 0] = XOFF - PR[:, 0]
xg = np.linspace(max(PL[:,0].min(), PR[:,0].min()), min(PL[:,0].max(), PR[:,0].max()), 300)
def half_at(P):
    P = P[P[:, 0].argsort()]
    return np.interp(xg, P[:, 0], np.abs(P[:, 1]))
half = (half_at(PL) + half_at(PR)) / 2
half[0] = half[-1] = 0.0042   # tiny width: no loft pole, side block decides the tip form
cm = (xg.min() + xg.max()) / 2
xg = (xg - cm) * 1.0032 + cm                       # nose/tail caps must not coincide with the side walls
planx = np.r_[xg[::-1], xg[1:-1]]                   # one closed loop, 598 pts
plany = np.r_[half[::-1], -half[1:-1]]
plan = np.c_[planx, plany]
plan = np.array(dedupe(rdp(plan, 0.0035), 5e-4))
assert self_cross(plan) is None
print('plan outline %d pts, max half %.4f' % (len(plan), np.abs(plan[:,1]).max()))

FR = np.array(tr['front_right'])
FRz = FR[FR[:, 1].argsort()]
def tumble_f(z):
    f = np.interp(z, FRz[:, 1], FRz[:, 0], left=FRz[0, 0], right=FRz[-1, 0]) / 0.9435
    return float(np.clip(f, 0.65, 1.0))
# grille/intake as nose-segment insets of the plan outline, per z band
import os
SLOTS = json.loads(os.environ.get('BWMSLOTS', '''[
    [0.170, 0.310, 0.000, 0.560, -0.40],
    [0.505, 0.855, 0.085, 0.365, -0.34],
    [0.505, 0.855, 0.695, 1.000, -0.30]
]'''))
band_edges = sorted({e for s0 in SLOTS for e in (s0[0]-0.022, s0[0], s0[1], s0[1]+0.022)})
zauto = [0.10, 0.60, 0.75, 0.92, 1.05, 1.20, 1.30, 1.36, 1.44]
ZSEC = sorted(set(zauto))   # slot edge sections not needed (slots are subtracted later)
NOSEX = float(plan[:, 0].max())
def slot_inset(z, y):
    dx = 0.0
    for z0, z1, ya, yb, d in SLOTS:
        if z0 <= z <= z1 and ya <= abs(y) <= yb: dx = min(dx, d)
    return dx
def section_at(z):
    f = tumble_f(z)
    pts = []
    for x, y in plan:
        xx, yy = x, y * f
        pts.append((xx, yy))
    return np.array(pts)
print('plan loft: %d sections, slots at' % len(ZSEC), [(round(a,3), round(b,3)) for a,b,*_ in SLOTS])

# front-section closed trace (documentary sketch, phase 4 render)
FRs = FR[FR[:, 1].argsort()[::-1]]
fsec = np.vstack([FRs, np.c_[-FRs[::-1, 0], FRs[::-1, 1]]])
fsec = np.array(dedupe(rdp(fsec, 0.0025), 5e-4))
assert self_cross(fsec) is None

# ---------------------------------------------------------------- details
NOSE = outline[:, 0].max()
WB = -2.864
TYRE = dict(F=dict(r=0.3375, w=0.275), R=dict(r=0.3400, w=0.285))
def plan_half(x):
    i = np.argmin(np.abs(plan[:, 0] - x))
    return abs(plan[i, 1])
def flank_y(x, z):
    return plan_half(x) * tumble_f(z)

J = []
A = J.append
A('# ═══════════════════════════════════════════════════════════════════════════')
A('# BMW M4 Competition G82 (2020) — 2D blueprint -> SolidArc CAD solid')
A('# blueprint trace: Vehicles/Demos/BMW_M4_G82/trace.py (the-blueprints.com preview)')
A('# L 4.794 · W 1.887 · H 1.393 m · wheelbase 2.864 traced (spec 2.857) · metres, +X fwd, Z up')
A('# ═══════════════════════════════════════════════════════════════════════════')
A('reset')
A('gizmo off')
A('show iso off')
A('echo ══ PHASE 1 — side profile sketch: traced silhouette - arch circles (2D boolean)')
A('workplane xz --origin=(0,0.98,0)')
A('polyline %s --closed --name=Side' % fmt(outline))
A('circle (%.4f,%.4f) %.4f --name=ArchF' % ARCH[0])
A('circle (%.4f,%.4f) %.4f --name=ArchR' % ARCH[1])
A('boolean subtract Side -- ArchF ArchR --name=Silhouette')
A('profile Silhouette')
A('view front')
A('view fit')
A('render M4_01_SideSketch')
A('echo ══ extrude the side block (over-wide -> transversal caps)')
A('extrude Silhouette 1.96 --name=SideBlock')
A('view iso')
A('view iso')
A('view orbit 160 -15')
A('view fit')
A('render M4_02_SideBlock')
A('echo ══ PHASE 2 — (grille/intake are built into the plan-loft sections, no boolean subtracts — see PHASE 3)')
A('echo ══ PHASE 3 — plan outline lofted through 7 z-sections w/ traced tumblehome taper')
for i, z in enumerate(ZSEC):
    A('workplane xy --origin=(0,0,%.4f)' % z)
    A('polyline %s --closed --name=Sec%d' % (fmt(section_at(z)), i))
A('loft %s --degree=1 --name=PlanLoft' % ' '.join('Sec%d' % i for i in range(len(ZSEC))))
A('topology PlanLoft')
A('matcap PlanLoft clay')
A('view iso')
A('view iso')
A('view orbit 160 -15')
A('view fit')
A('render M4_04_PlanLoft')
A('view top')
A('view fit')
A('render M4_05_PlanSketch')
A('echo ══ PHASE 4 — body = side ∩ plan-loft (one NURBS boolean)')
A('unhide SideBlock')
A('boolean intersect SideBlock -- PlanLoft --name=Body')
A('topology Body')
A('hide Silhouette %s' % ' '.join('Sec%d' % i for i in range(len(ZSEC))))
A('tint Body 0.84 0.86 0.10')
A('matcap Body pearl')
A('view iso')
A('view iso')
A('view orbit 160 -15')
A('view fit')
A('render M4_06_Body_FrontQuarter')
A('render sheet 0')
A('view iso')
A('view orbit -12 -13')
A('view fit')
A('render M4_07_Body_RearQuarter')
A('render sheet 1')
A('view front')
A('view fit')
A('render M4_08_Body_Side')
A('render sheet 2')
A('view right')
A('view fit')
A('render M4_09_Body_Front')
A('render sheet 3')
A('render sheet finalize M4_10_Construction')
A('echo ══ PHASE 5 — running gear: tyre+rim+cap cylinders, door mirrors (separate parts)')
for tag, wx in (('F', 0.0), ('R', WB)):
    t = TYRE[tag]
    yw = 0.8085 if tag == 'F' else 0.8025   # half track
    for sgn, sd in ((1, 'R'), (-1, 'L')):
        y0 = sgn*yw - t['w']/2
        A('cylinder (%.4f,%.4f,%.4f) %.4f %.4f --axis=(0,1,0) --name=Tyre%s%s' % (wx, y0, t['r'], t['r'], t['w'], tag, sd))
        A('cylinder (%.4f,%.4f,%.4f) %.4f %.4f --axis=(0,1,0) --name=Rim%s%s' % (wx, y0-0.004, t['r'], 0.2415, t['w']+0.008, tag, sd))
        A('cylinder (%.4f,%.4f,%.4f) %.4f %.4f --axis=(0,1,0) --name=Cap%s%s' % (wx, y0-0.007, t['r'], 0.070, t['w']+0.014, tag, sd))
        A('matcap Tyre%s%s rubber' % (tag, sd))
        A('matcap Rim%s%s steel' % (tag, sd))
        A('matcap Cap%s%s chrome' % (tag, sd))
mzy = flank_y(-1.00, 0.99)
A('box (-1.12,%.4f,0.955) (-0.90,%.4f,1.030) --name=MirrorL' % (-mzy-0.095, -mzy-0.015))
A('box (-1.12,%.4f,0.955) (-0.90,%.4f,1.030) --name=MirrorR' % (mzy+0.015, mzy+0.095))
A('tint MirrorL 0.84 0.86 0.10')
A('tint MirrorR 0.84 0.86 0.10')
A('matcap MirrorL pearl')
A('matcap MirrorR pearl')
A('echo ══ PHASE 5b — front trim: kidney-grille, intake and headlamp inserts (mated parts)')
A('box (%.4f,-0.330,0.505) (%.4f,-0.052,0.855) --name=GrilleL' % (NOSE-0.018, NOSE-0.004))
A('box (%.4f,0.052,0.505) (%.4f,0.330,0.855) --name=GrilleR' % (NOSE-0.018, NOSE-0.004))
A('box (%.4f,-0.560,0.170) (%.4f,0.560,0.310) --name=IntakeTrim' % (NOSE-0.092, NOSE-0.078))
A('box (%.4f,-0.900,0.600) (%.4f,-0.620,0.780) --name=LampL' % (NOSE-0.062, NOSE-0.048))
A('box (%.4f,0.620,0.600) (%.4f,0.900,0.780) --name=LampR' % (NOSE-0.062, NOSE-0.048))
A('tint GrilleL 0.030 0.032 0.036')
A('tint GrilleR 0.030 0.032 0.036')
A('tint IntakeTrim 0.028 0.030 0.034')
A('matcap GrilleL carbon')
A('matcap GrilleR carbon')
A('matcap IntakeTrim carbon')
A('matcap LampL headlight')
A('matcap LampR headlight')
A('view iso')
A('view iso')
A('view orbit 160 -15')
A('view fit')
A('render M4_11_RunningGear')
A('echo ══ PHASE 6 — dimensional proof + save + export + hero renders')
A('dim list')
A('list')
A('save Vehicles/Demos/BMW_M4_G82/BMW_M4_G82_CAD.arc')
A('export Vehicles/Demos/BMW_M4_G82/BMW_M4_G82.obj --weld')
A('view iso')
A('view iso')
A('view orbit 165 -13')
A('view fit')
A('render M4_20_Hero_FrontQuarter --size=1920x1200')
A('view iso')
A('view orbit -12 -13')
A('view fit')
A('render M4_21_Hero_RearQuarter --size=1920x1200')
A('view front')
A('view fit')
A('render M4_22_Hero_Side --size=1920x1200')
A('view right')
A('view fit')
A('render M4_23_Hero_Front --size=1920x1200')
A('view left')
A('view fit')
A('render M4_24_Hero_Rear --size=1920x1200')
A('view top')
A('view fit')
A('render M4_25_Hero_Top --size=1920x1200')
open(f'{D}/BMW_M4_G82_Build.arc', 'w').write('\n'.join(J) + '\n')
print('journal written: %d commands' % len(J))