# Extract the REAL ControlVehicle body mesh from the Blender 5.2 .blend (no Blender needed).
# Blender 5.x stores geometry in AttributeStorage; the on-disk sharing pointers are indirect, so we
# locate each mesh's arrays by exact DATA-block size + file-order proximity + value-range, which is robust.
import struct, json
d=open('ControlVehicle.blend','rb').read(); N=len(d); E='<'; H=32
def walk(o):
    out=[]
    while o+H<=N:
        code=d[o:o+4].rstrip(b'\x00'); old=struct.unpack(E+'Q',d[o+8:o+16])[0]
        length=struct.unpack(E+'Q',d[o+16:o+24])[0]
        out.append((code,old,length,o+H))
        if code==b'ENDB': break
        o=o+H+length
    return out
B=walk(17)
oldmap={old:(off,length) for code,old,length,off in B}
ri=lambda p:struct.unpack(E+'I',d[p:p+4])[0]; rh=lambda p:struct.unpack(E+'H',d[p:p+2])[0]
dna=[b for b in B if b[0]==b'DNA1'][0]; p=dna[3]
assert d[p:p+4]==b'SDNA';p+=4;assert d[p:p+4]==b'NAME';p+=4
nn=ri(p);p+=4;names=[]
for _ in range(nn):
    s=p
    while d[p]:p+=1
    names.append(d[s:p].decode());p+=1
if p%4:p+=4-(p%4)
assert d[p:p+4]==b'TYPE';p+=4;nt=ri(p);p+=4;types=[]
for _ in range(nt):
    s=p
    while d[p]:p+=1
    types.append(d[s:p].decode());p+=1
if p%4:p+=4-(p%4)
assert d[p:p+4]==b'TLEN';p+=4;tlen=[rh(p+2*i) for i in range(nt)];p+=2*nt
if p%4:p+=4-(p%4)
assert d[p:p+4]==b'STRC';p+=4;ns=ri(p);p+=4
structs=[];byname={}
for si in range(ns):
    ti=rh(p);p+=2;fc=rh(p);p+=2;fs=[]
    for _ in range(fc):
        ft=rh(p);fn=rh(p+2);p+=4;fs.append((ft,fn))
    structs.append((ti,fs));byname[types[ti]]=si
PTR=8
def fsize(ft,nm):
    base=PTR if nm.startswith('*') else tlen[ft];mult=1;x=nm
    while '[' in x:
        l=x.index('[');r=x.index(']');mult*=int(x[l+1:r]);x=x[r+1:]
    return base*mult
def layout(si):
    ti,fs=structs[si];off=0;o={}
    for ft,fn in fs:
        nm=names[fn];o[nm]=(off,fsize(ft,nm));off+=fsize(ft,nm)
    return o
OBJ=layout(byname['Object']); ME=layout(byname['Mesh']); IDl=layout(byname['ID'])
def F(lay,base):
    for k in lay:
        if k.lstrip('*').split('[')[0]==base: return lay[k]
    raise KeyError(base)
name_off=[v[0] for k,v in IDl.items() if k.startswith('name[')][0]
read_name=lambda base: d[base+name_off:base+name_off+64].split(b'\x00')[0].decode('latin1')
me_by_old={old:off for code,old,length,off in B if code==b'ME'}
data_blocks=[(i,length,off) for i,(code,old,length,off) in enumerate(B) if code==b'DATA']

def read_ints(off,n): return list(struct.unpack(E+f'{n}i', d[off:off+4*n]))
def read_f3(off,n):
    a=struct.unpack(E+f'{3*n}f', d[off:off+12*n]); return [list(a[3*i:3*i+3]) for i in range(n)]
def first_after(me_idx, size, pred=None):
    best=None
    for i,length,off in data_blocks:
        if length==size and i>me_idx:
            if pred is None or pred(off,length):
                if best is None or i<best[0]: best=(i,off)
    return best[1] if best else None

WHEEL=('Rubber','Rim'); EXCL=('Plane','Camera','Empty','Socket_','UCX_')
meshes=[]
for idx,(code,old,length,off) in enumerate(B):
    if code!=b'OB': continue
    nm=read_name(off)[2:]
    if nm.startswith(WHEEL) or nm.startswith(EXCL): continue
    typ=struct.unpack(E+'h',d[off+F(OBJ,'type')[0]:off+F(OBJ,'type')[0]+2])[0]
    if typ!=1: continue
    dptr=struct.unpack(E+'Q',d[off+F(OBJ,'data')[0]:off+F(OBJ,'data')[0]+8])[0]
    if dptr not in me_by_old: continue
    mbase=me_by_old[dptr]; me_idx=[i for i,(c,o2,l2,of2) in enumerate(B) if c==b'ME' and of2==mbase][0]
    gv=lambda f:struct.unpack(E+'i',d[mbase+F(ME,f)[0]:mbase+F(ME,f)[0]+4])[0]
    tv,te,tp,tl=gv('totvert'),gv('totedge'),gv('totpoly'),gv('totloop')
    loc=struct.unpack(E+'fff',d[off+F(OBJ,'loc')[0]:off+F(OBJ,'loc')[0]+12])
    size=struct.unpack(E+'fff',d[off+F(OBJ,'size')[0]:off+F(OBJ,'size')[0]+12])
    pos_off=first_after(me_idx, tv*12)
    poly_off=first_after(me_idx, (tp+1)*4)
    corner_off=first_after(me_idx, tl*4, pred=lambda o2,l2:(max(read_ints(o2,l2//4))<tv and min(read_ints(o2,l2//4))>=0))
    if not(pos_off and poly_off and corner_off): print("skip",nm,"missing arrays",bool(pos_off),bool(poly_off),bool(corner_off)); continue
    verts=read_f3(pos_off,tv)
    corner=read_ints(corner_off,tl)
    offs=read_ints(poly_off,tp+1)
    tris=[]
    for pi in range(tp):
        a,b2=offs[pi],offs[pi+1]; loops=corner[a:b2]
        for k in range(1,len(loops)-1): tris.append([loops[0],loops[k],loops[k+1]])
    wv=[[v[0]*size[0]+loc[0], v[1]*size[1]+loc[1], v[2]*size[2]+loc[2]] for v in verts]
    meshes.append({'name':nm,'nv':tv,'nt':len(tris),'verts':wv,'tris':tris})
    print(f"{nm:14s} verts={tv} tris={len(tris)} loc={tuple(round(x,2) for x in loc)}")

allv=[v for m in meshes for v in m['verts']]
if allv:
    xs=[v[0] for v in allv];ys=[v[1] for v in allv];zs=[v[2] for v in allv]
    print("BODY bounds X %.3f..%.3f  Y %.3f..%.3f  Z %.3f..%.3f"%(min(xs),max(xs),min(ys),max(ys),min(zs),max(zs)))
json.dump({'meshes':meshes,'up':'Z','forward':'X'}, open('controlvehicle_mesh.json','w'))
print("wrote controlvehicle_mesh.json,", sum(m['nv'] for m in meshes),"verts,", sum(m['nt'] for m in meshes),"tris")
