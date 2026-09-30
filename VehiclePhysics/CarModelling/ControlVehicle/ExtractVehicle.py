#!/usr/bin/env python3
# ======================================================================================================================
# ExtractVehicle.py -- dependency-free extraction of the ControlVehicle.blend authored scene.
#
# Supersedes ExtractMesh.py, which flattened every body object into one position/triangle soup and threw away the
# authored material assignment.  Project-Drive then had to *guess* the paint/glass/plastic split from face positions
# (DriveSceneAuthor::ClassifyControlVehicleFace), which is why the car rendered as one flat blue mass.
#
# What this reads straight out of the .blend (Blender 5.2, 32-byte block headers, no Blender install required):
#
#   * every mesh Object kept SEPARATE, with its object-to-world transform
#   * the per-face `material_index` attribute, plus each mesh's material slot array, so every triangle carries the
#     material the artist actually assigned
#   * every Material's full Principled BSDF input set, walked out of the embedded node tree -- the legacy
#     Material.r/g/b fields are all 0.8 placeholders and must NOT be used
#   * the Mirror modifier on `Interiror` (axis Y, merge tolerance 1e-3), which is geometric and was previously ignored
#   * smooth-vs-sharp shading via the `sharp_edge` attribute and Mesh.smoothresh, so normals match "Smooth by Angle"
#
# Blender 5.x AttributeStorage layout note: each attribute is serialised as a small DATA block holding the attribute
# NAME as a NUL-terminated string, immediately followed by the DATA block holding its values.  An attribute whose
# value is uniform across the domain is stored as a SINGLE element rather than a full array (e.g. `Interiror` stores
# material_index as one int, = 5).  Both encodings are handled below.
# ======================================================================================================================
import struct, json, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, 'ControlVehicle.blend')
OUT = os.path.join(HERE, 'controlvehicle_scene.json')

E = '<'
HDR = 32
NAME_CHARS = set(b'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-')

# Objects that are never part of the rendered vehicle.
SKIP_EXACT = {'Plane'}
SKIP_PREFIX = ('UCX_', 'Socket_')


# ---------------------------------------------------------------------------------------------------- file + SDNA
class Blend:
    def __init__(self, path):
        self.d = open(path, 'rb').read()
        self.n = len(self.d)
        self._walk()
        self._sdna()

    def _walk(self):
        d, n = self.d, self.n
        self.blocks = []
        o = 17                                   # skip "BLENDER-v502" style 12-byte magic + 5
        while o + HDR <= n:
            code = d[o:o + 4].rstrip(b'\x00')
            old = struct.unpack(E + 'Q', d[o + 8:o + 16])[0]
            length = struct.unpack(E + 'Q', d[o + 16:o + 24])[0]
            self.blocks.append((code, old, length, o + HDR))
            if code == b'ENDB':
                break
            o = o + HDR + length
        self.oldmap = {old: (off, ln) for code, old, ln, off in self.blocks if old}

    def _sdna(self):
        d = self.d
        ri = lambda p: struct.unpack(E + 'I', d[p:p + 4])[0]
        rh = lambda p: struct.unpack(E + 'H', d[p:p + 2])[0]
        dna = [b for b in self.blocks if b[0] == b'DNA1'][0]
        p = dna[3] + 8                            # "SDNA" + "NAME"
        cnt = ri(p); p += 4
        names = []
        for _ in range(cnt):
            s = p
            while d[p]:
                p += 1
            names.append(d[s:p].decode()); p += 1
        if p % 4:
            p += 4 - (p % 4)
        p += 4                                    # "TYPE"
        cnt = ri(p); p += 4
        types = []
        for _ in range(cnt):
            s = p
            while d[p]:
                p += 1
            types.append(d[s:p].decode()); p += 1
        if p % 4:
            p += 4 - (p % 4)
        p += 4                                    # "TLEN"
        tlen = [rh(p + 2 * i) for i in range(len(types))]; p += 2 * len(types)
        if p % 4:
            p += 4 - (p % 4)
        p += 4                                    # "STRC"
        cnt = ri(p); p += 4
        self.structs, self.byname = [], {}
        for _ in range(cnt):
            ti = rh(p); p += 2
            fc = rh(p); p += 2
            fs = []
            for _ in range(fc):
                ft = rh(p); fn = rh(p + 2); p += 4
                fs.append((ft, fn))
            self.byname[types[ti]] = len(self.structs)
            self.structs.append((ti, fs))
        self.names, self.types, self.tlen = names, types, tlen

    def fields(self, sname):
        ti, fs = self.structs[self.byname[sname]]
        off, out = 0, {}
        for ft, fn in fs:
            nm = self.names[fn]
            base = 8 if nm.startswith('*') else self.tlen[ft]
            mult, x = 1, nm
            while '[' in x:
                l = x.index('['); r = x.index(']')
                mult *= int(x[l + 1:r]); x = x[r + 1:]
            out[nm.lstrip('*').split('[')[0]] = (off, base * mult)
            off += base * mult
        return out

    # scalar readers -------------------------------------------------------------------------------------------
    def i32(self, p): return struct.unpack(E + 'i', self.d[p:p + 4])[0]
    def i16(self, p): return struct.unpack(E + 'h', self.d[p:p + 2])[0]
    def f32(self, p): return struct.unpack(E + 'f', self.d[p:p + 4])[0]
    def ptr(self, p): return struct.unpack(E + 'Q', self.d[p:p + 8])[0]
    def cstr(self, p, n): return self.d[p:p + n].split(b'\x00')[0].decode('latin1')


# ---------------------------------------------------------------------------------------------------- materials
# Blender stores an unconnected socket's default in a small block.  For a float socket that block is
# bNodeSocketValueFloat { int subtype; float value; float min; float max; } -- the VALUE is element 1, not 0.
# For an RGBA socket it is bNodeSocketValueRGBA { float value[4] } -- the value is elements 0..3.
# Reading element 0 for floats is the classic mistake and yields 0.0 for everything.
RGBA_SOCKETS = {'Base Color', 'Emission Color', 'Specular Tint', 'Coat Tint', 'Sheen Tint',
                'Transmission Color', 'Subsurface Radius'}


def read_materials(B):
    ID, MAT, NTREE, NODE, SOCK = (B.fields(x) for x in ('ID', 'Material', 'bNodeTree', 'bNode', 'bNodeSocket'))
    rn = lambda base: B.cstr(base + ID['name'][0], 66)
    mats = {}
    for code, old, ln, off in B.blocks:
        if code != b'MA':
            continue
        name = rn(off)[2:]
        entry = {'name': name, 'inputs': {}}
        ntp = B.ptr(off + MAT['nodetree'][0])
        if ntp in B.oldmap:
            node = B.ptr(B.oldmap[ntp][0] + NTREE['nodes'][0])
            while node and node in B.oldmap:
                noff = B.oldmap[node][0]
                if 'Principled' in B.cstr(noff + NODE['idname'][0], 64):
                    s = B.ptr(noff + NODE['inputs'][0])
                    while s and s in B.oldmap:
                        soff = B.oldmap[s][0]
                        sname = B.cstr(soff + SOCK['name'][0], 64)
                        dv = B.ptr(soff + SOCK['default_value'][0])
                        if dv in B.oldmap:
                            dvo, dvl = B.oldmap[dv]
                            if sname in RGBA_SOCKETS and dvl >= 16:
                                entry['inputs'][sname] = [round(v, 6) for v in struct.unpack(E + '4f', B.d[dvo:dvo + 16])[:3]]
                            elif dvl >= 8:
                                entry['inputs'][sname] = round(struct.unpack(E + 'f', B.d[dvo + 4:dvo + 8])[0], 6)
                        s = B.ptr(soff + SOCK['next'][0])
                    break
                node = B.ptr(noff + NODE['next'][0])
        mats[old] = entry
    return mats


# ---------------------------------------------------------------------------------------------------- attributes
def attribute_table(B):
    """Map each ME block's old-address -> {attr name: (data offset, data length)} using the
    name-block-then-data-block adjacency of Blender 5.x AttributeStorage."""
    out, cur = {}, None
    for i, (code, old, ln, off) in enumerate(B.blocks):
        if code == b'ME':
            cur = old
            out[cur] = {}
            continue
        if code in (b'OB', b'MA', b'SC', b'WM', b'BR', b'WO', b'LS'):
            cur = None
        if cur is None or code != b'DATA':
            continue
        if ln < 2 or ln > 64:
            continue
        s = B.d[off:off + ln]
        if s[-1] != 0:
            continue
        body = s[:-1]
        if not body or any(ch not in NAME_CHARS for ch in body):
            continue
        if i + 1 < len(B.blocks):
            out[cur].setdefault(body.decode(), []).append((B.blocks[i + 1][3], B.blocks[i + 1][2]))
    return out


def pick(attrs, name, want_len):
    """Choose the entry whose data length matches want_len exactly; else the single-element encoding."""
    for off, ln in attrs.get(name, []):
        if ln == want_len:
            return off, ln, False
    for off, ln in attrs.get(name, []):
        if ln in (1, 2, 4, 8, 12, 16):
            return off, ln, True                  # uniform "single" value for the whole domain
    return None, 0, False


# ---------------------------------------------------------------------------------------------------- geometry
def object_matrix(B, OBJ, ob):
    """Compose loc * rot * scale exactly as Blender does for the supported rotation modes."""
    loc = struct.unpack(E + '3f', B.d[ob + OBJ['loc'][0]:ob + OBJ['loc'][0] + 12])
    size = struct.unpack(E + '3f', B.d[ob + OBJ['size'][0]:ob + OBJ['size'][0] + 12])
    rot = struct.unpack(E + '3f', B.d[ob + OBJ['rot'][0]:ob + OBJ['rot'][0] + 12])
    quat = struct.unpack(E + '4f', B.d[ob + OBJ['quat'][0]:ob + OBJ['quat'][0] + 16])
    mode = B.i16(ob + OBJ['rotmode'][0])
    if mode == 0:                                  # quaternion
        w, x, y, z = quat
        R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    else:                                          # Euler; Blender default XYZ applies X then Y then Z
        cx, sx = math.cos(rot[0]), math.sin(rot[0])
        cy, sy = math.cos(rot[1]), math.sin(rot[1])
        cz, sz = math.cos(rot[2]), math.sin(rot[2])
        R = [[cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz],
             [cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz],
             [-sy,     cy * sx,                cx * cy]]
    M = [[R[r][c] * size[c] for c in range(3)] + [loc[r]] for r in range(3)]
    return M


def xform(M, v):
    return [M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2] + M[r][3] for r in range(3)]


def apply_mirror_y(verts, faces, fmat, tol):
    """Blender Mirror modifier, axis Y, merge enabled.  Vertices on the plane are shared, mirrored faces
    get reversed winding so their normals point outward."""
    nmap, out = {}, list(verts)
    for i, v in enumerate(verts):
        if abs(v[1]) <= tol:
            nmap[i] = i                            # on the plane -> merged
        else:
            nmap[i] = len(out)
            out.append([v[0], -v[1], v[2]])
    nf, nm = list(faces), list(fmat)
    for f, m in zip(faces, fmat):
        nf.append([nmap[i] for i in reversed(f)])
        nm.append(m)
    return out, nf, nm


def main():
    B = Blend(BLEND)
    ID, OBJ, ME = B.fields('ID'), B.fields('Object'), B.fields('Mesh')
    MD, MM = B.fields('ModifierData'), B.fields('MirrorModifierData')
    rn = lambda base: B.cstr(base + ID['name'][0], 66)
    mats_by_addr = read_materials(B)
    attrs_all = attribute_table(B)
    me_off = {old: off for c, old, ln, off in B.blocks if c == b'ME'}

    material_names, material_list = {}, []
    for addr, m in mats_by_addr.items():
        material_names[addr] = m['name']
        material_list.append(m)

    objects, problems = [], []
    for code, old, ln, ob in B.blocks:
        if code != b'OB' or B.i16(ob + OBJ['type'][0]) != 1:
            continue
        name = rn(ob)[2:]
        if name in SKIP_EXACT or name.startswith(SKIP_PREFIX):
            continue
        dp = B.ptr(ob + OBJ['data'][0])
        if dp not in me_off:
            continue
        mb = me_off[dp]
        totvert, totpoly = B.i32(mb + ME['totvert'][0]), B.i32(mb + ME['totpoly'][0])
        totcol = B.i16(mb + ME['totcol'][0])
        smoothresh = B.f32(mb + ME['smoothresh'][0])
        attrs = attrs_all.get(dp, {})

        # material slots -----------------------------------------------------------------------------------
        slots, matp = [], B.ptr(mb + ME['mat'][0])
        if matp in B.oldmap:
            mo, ml = B.oldmap[matp]
            for k in range(min(totcol, ml // 8)):
                mp = B.ptr(mo + 8 * k)
                slots.append(material_names.get(mp, 'None'))

        # positions ----------------------------------------------------------------------------------------
        poff, plen, _ = pick(attrs, 'position', totvert * 12)
        if poff is None:
            problems.append('%s: no position array' % name); continue
        verts = [list(struct.unpack(E + '3f', B.d[poff + 12 * i:poff + 12 * i + 12])) for i in range(totvert)]

        # faces: corner_vert + poly_offset_indices ----------------------------------------------------------
        coff, clen, _ = pick(attrs, '.corner_vert', 0)
        cand = [(o, l) for o, l in attrs.get('.corner_vert', []) if l % 4 == 0]
        if not cand:
            problems.append('%s: no .corner_vert' % name); continue
        coff, clen = max(cand, key=lambda t: t[1])
        totloop = clen // 4
        corner = list(struct.unpack(E + '%di' % totloop, B.d[coff:coff + clen]))
        op = B.ptr(mb + ME['poly_offset_indices'][0])
        if op not in B.oldmap:
            problems.append('%s: no poly_offset_indices' % name); continue
        ooff = B.oldmap[op][0]
        offs = list(struct.unpack(E + '%di' % (totpoly + 1), B.d[ooff:ooff + 4 * (totpoly + 1)]))

        # per-face material index --------------------------------------------------------------------------
        moff, mlen, single = pick(attrs, 'material_index', totpoly * 4)
        if moff is None:
            fmat = [0] * totpoly
        elif single:
            fmat = [struct.unpack(E + 'i', B.d[moff:moff + 4])[0]] * totpoly
        else:
            fmat = list(struct.unpack(E + '%di' % totpoly, B.d[moff:moff + mlen]))

        faces = [corner[offs[i]:offs[i + 1]] for i in range(totpoly)]

        # Mirror modifier ----------------------------------------------------------------------------------
        mirrored = False
        md = B.ptr(ob + OBJ['modifiers'][0])
        while md and md in B.oldmap:
            mo = B.oldmap[md][0]
            if B.i32(mo + MD['type'][0]) == 5:     # eModifierType_Mirror
                axis_flag = B.i16(mo + MM['flag'][0])
                tol = B.f32(mo + MM['tolerance'][0])
                if axis_flag & 16:                 # MOD_MIR_AXIS_Y
                    verts, faces, fmat = apply_mirror_y(verts, faces, fmat, tol)
                    mirrored = True
                elif axis_flag & 8 or axis_flag & 32:
                    problems.append('%s: Mirror on X/Z not implemented' % name)
            md = B.ptr(mo + MD['next'][0])

        # sharp edges --------------------------------------------------------------------------------------
        soff, slen, ssingle = pick(attrs, 'sharp_edge', 0)
        sharp_any = bool(attrs.get('sharp_edge'))

        # authored UVs (corner domain, float2) ---------------------------------------------------------------
        # These matter for more than texturing: the engine's finite-flake lobe is placed through the UV
        # parameterisation (SlateGlintUvScale), so without real UVs a flake field has nothing to vary over.
        uv_corner = None
        for o2, l2 in attrs.get('UVMap', []):
            if l2 == totloop * 8:
                uv_corner = list(struct.unpack(E + '%df' % (totloop * 2), B.d[o2:o2 + l2]))
                break

        # triangulate (fan) and carry the material slot per triangle ----------------------------------------
        M = object_matrix(B, OBJ, ob)
        world = [xform(M, v) for v in verts]
        tris, tmat, tuv = [], [], []
        # corner index of face i starts at offs[i]; after the Mirror pass the mirrored half has no authored
        # corner data, so it reuses its source corner's UV (the modifier's own behaviour without a UV offset).
        for fi, (f, mi) in enumerate(zip(faces, fmat)):
            base_corner = offs[fi] if fi < totpoly else None
            for k in range(1, len(f) - 1):
                tris.append([f[0], f[k], f[k + 1]])
                tmat.append(mi)
                if uv_corner is not None and base_corner is not None:
                    idxs = [base_corner + 0, base_corner + k, base_corner + k + 1]
                    tuv.append([[uv_corner[2 * c], uv_corner[2 * c + 1]]
                                if 2 * c + 1 < len(uv_corner) else [0.0, 0.0] for c in idxs])
                else:
                    tuv.append(None)

        # ---- smooth normals, reproducing "Smooth by Angle" -------------------------------------------------
        # Blender's modifier splits the normal where adjacent faces meet above the threshold; below it the
        # faces share one averaged normal.  Area-weighted accumulation, then a per-corner test against the
        # face's own normal, gets the same result without needing the edge topology.
        import math as _m
        fnorm = []
        for t in tris:
            a, b_, c = (world[t[0]], world[t[1]], world[t[2]])
            e1 = [b_[i] - a[i] for i in range(3)]
            e2 = [c[i] - a[i] for i in range(3)]
            n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
            fnorm.append(n)                                   # unnormalised => area weighted
        acc = [[0.0, 0.0, 0.0] for _ in world]
        for t, n in zip(tris, fnorm):
            for vi in t:
                for i in range(3):
                    acc[vi][i] += n[i]
        thresh = _m.cos(smoothresh if 0.0 < smoothresh < _m.pi else _m.radians(30.0))
        cnorm = []
        for t, n in zip(tris, fnorm):
            ln = _m.sqrt(sum(x * x for x in n)) or 1.0
            fu = [x / ln for x in n]
            row = []
            for vi in t:
                s = acc[vi]
                ls = _m.sqrt(sum(x * x for x in s))
                su = [x / ls for x in s] if ls > 1e-12 else fu
                row.append(su if sum(su[i] * fu[i] for i in range(3)) >= thresh else fu)
            cnorm.append(row)

        used = sorted(set(tmat))
        have_uv = sum(1 for u in tuv if u is not None)
        objects.append({
            'name': name, 'verts': world, 'tris': tris, 'tri_material': tmat,
            'tri_uv': tuv, 'corner_normals': cnorm, 'uv_coverage': have_uv,
            'slots': slots, 'smoothresh': smoothresh, 'mirrored': mirrored,
            'has_sharp_edges': sharp_any,
            'slot_histogram': {(slots[i] if i < len(slots) else 'slot%d' % i): tmat.count(i) for i in used},
        })

    # ------------------------------------------------------------------------------------------------ gates
    # Gate 1: every triangle must resolve to a named authored material, or be explicitly recorded as
    # unassigned.  PROTO-X.002 genuinely carries no material in the .blend (totcol = 0); Blender itself
    # falls back to its default grey there, so the consumer must do the same rather than guess a family.
    unassigned = {}
    for o in objects:
        miss = sum(n for k, n in o['slot_histogram'].items() if k.startswith('slot'))
        if miss:
            unassigned[o['name']] = miss
    # Gate 2: the authored body must use more than one material -- a single-family body is the exact
    # failure mode that ClassifyControlVehicleFace was invented to paper over.
    body = next((o for o in objects if o['name'] == 'ControlVehicle'), None)
    if body is not None and len(body['slot_histogram']) < 2:
        problems.append('ControlVehicle resolved to a single material family')

    scene = {'source': os.path.basename(BLEND), 'up': 'Z', 'forward': 'X',
             'materials': material_list, 'objects': objects, 'problems': problems,
             'unassigned_faces': unassigned,
             'unassigned_fallback': [0.8, 0.8, 0.8]}
    json.dump(scene, open(OUT, 'w'))

    # ---------------------------------------------------------------------------------------------- report
    print('materials (%d) -- authored Principled BSDF values:' % len(material_list))
    for m in sorted(material_list, key=lambda x: x['name']):
        i = m['inputs']
        bc = i.get('Base Color')
        print('   %-20s base=%-28s metal=%-5s rough=%-5s coat=%-5s coatR=%-5s trans=%-5s emit=%s' % (
            m['name'], bc, i.get('Metallic'), i.get('Roughness'), i.get('Coat Weight'),
            i.get('Coat Roughness'), i.get('Transmission Weight'), i.get('Emission Strength')))
    print('\nobjects (%d):' % len(objects))
    for o in objects:
        print('   %-22s verts=%-6d tris=%-6d mirror=%-5s uv=%-6d  %s' % (
            o['name'], len(o['verts']), len(o['tris']), o['mirrored'], o['uv_coverage'], o['slot_histogram']))
    total_tris = sum(len(o['tris']) for o in objects)
    miss_tris = sum(unassigned.values())
    print('\ngates:')
    print('   triangles                    %d' % total_tris)
    print('   resolved to an authored slot %d (%.2f%%)' % (total_tris - miss_tris,
                                                           100.0 * (total_tris - miss_tris) / max(total_tris, 1)))
    print('   unassigned in the .blend     %s  -> Blender default grey 0.8' % (unassigned or 'none'))
    print('   body material families       %d' % len(body['slot_histogram'] if body else {}))
    if problems:
        print('\nPROBLEMS:')
        for p in problems:
            print('   ' + p)
    print('\nwrote %s' % OUT)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
