import struct, sys, math
path='ControlVehicle.blend'
d=open(path,'rb').read()
N=len(d); E='<'
HEADER=32
def walk(off):
    o=off; out=[]
    while o+HEADER<=N:
        code=d[o:o+4].rstrip(b'\x00')
        length=struct.unpack(E+'Q', d[o+16:o+24])[0]
        sdna =struct.unpack(E+'I', d[o+24:o+28])[0]
        nr   =struct.unpack(E+'I', d[o+28:o+32])[0]
        data_off=o+HEADER
        out.append((code,length,sdna,nr,data_off))
        if code==b'ENDB': break
        o=data_off+length
    return out
blocks=walk(17)
# find DNA1
dna=[b for b in blocks if b[0]==b'DNA1'][0]
doff=dna[4]
def rd_int(p): return struct.unpack(E+'I', d[p:p+4])[0]
def rd_short(p): return struct.unpack(E+'H', d[p:p+2])[0]
p=doff
assert d[p:p+4]==b'SDNA'; p+=4
assert d[p:p+4]==b'NAME'; p+=4
nname=rd_int(p); p+=4
names=[]
for _ in range(nname):
    s=p
    while d[p]!=0: p+=1
    names.append(d[s:p].decode()); p+=1
if p%4: p+=4-(p%4)
assert d[p:p+4]==b'TYPE', d[p:p+4]; p+=4
ntype=rd_int(p); p+=4
types=[]
for _ in range(ntype):
    s=p
    while d[p]!=0: p+=1
    types.append(d[s:p].decode()); p+=1
if p%4: p+=4-(p%4)
assert d[p:p+4]==b'TLEN'; p+=4
tlen=[rd_short(p+2*i) for i in range(ntype)]; p+=2*ntype
if p%4: p+=4-(p%4)
assert d[p:p+4]==b'STRC'; p+=4
nstrc=rd_int(p); p+=4
structs=[]  # (type_idx, [(field_type_idx, field_name_idx)])
struct_by_name={}
for si in range(nstrc):
    tidx=rd_short(p); p+=2
    fcnt=rd_short(p); p+=2
    fields=[]
    for _ in range(fcnt):
        ft=rd_short(p); fn=rd_short(p+2); p+=4
        fields.append((ft,fn))
    structs.append((tidx,fields))
    struct_by_name[types[tidx]]=si
print("structs:",nstrc,"types:",ntype,"names:",nname)

# Pointer size = 8 here
PTR=8
def type_size(tidx):
    return tlen[tidx]
def field_size(ft, fname):
    # pointer?
    base=tlen[ft]
    # count array dims from name
    mult=1
    nm=fname
    if nm.startswith('*'):  # pointer(s)
        base=PTR
    while '[' in nm:
        l=nm.index('['); r=nm.index(']')
        mult*=int(nm[l+1:r]); nm=nm[r+1:]
    if fname.startswith('*'): return PTR*mult
    return base*mult

# Build field offset map for a struct
def layout(struct_idx):
    tidx,fields=structs[struct_idx]
    off=0; lay=[]
    for ft,fn in fields:
        fname=names[fn]; sz=field_size(ft,fname)
        lay.append((fname, types[ft], off, sz))
        off+=sz
    return lay, tlen[tidx]

# Show Object struct layout for key fields
oi=struct_by_name['Object']
lay,osize=layout(oi)
print("\nObject size(SDNA)=",osize)
want=['id','loc[','dloc','rot[','drot','quat[','size[','dscale','scale[','object_to_world','obmat','parent','type','empty_drawsize','empty_drawtype']
for fname,ftype,off,sz in lay:
    if any(w in fname for w in want):
        print(f"  +{off:4d} {ftype} {fname} (sz {sz})")

# ---- find any 4x4 matrix fields in Object ----
print("\nObject matrix-like fields:")
for fname,ftype,off,sz in lay:
    if 'mat' in fname.lower() or 'world' in fname.lower():
        print(f"  +{off:4d} {ftype} {fname}")

# ---- ID.name offset ----
idi=struct_by_name['ID']
idlay,idsize=layout(idi)
name_off=None
for fname,ftype,off,sz in idlay:
    if fname=='name[66]' or fname.startswith('name['):
        name_off=off; print("\nID.name at +",off,"size",sz)
# offsets within Object
O_LOC=736; O_ROT=796; O_QUAT=820; O_SIZE=760; O_TYPE=416; O_PARENT=496; O_NAME=name_off
def f3(p): return struct.unpack(E+'fff', d[p:p+12])
def f4(p): return struct.unpack(E+'ffff', d[p:p+16])
OBJS=[]
for code,length,sdna,nr,doff in blocks:
    if code==b'OB':
        base=doff
        nm=d[base+O_NAME:base+O_NAME+64].split(b'\x00')[0].decode('latin1')
        typ=struct.unpack(E+'h', d[base+O_TYPE:base+O_TYPE+2])[0]
        loc=f3(base+O_LOC); rot=f3(base+O_ROT); quat=f4(base+O_QUAT); size=f3(base+O_SIZE)
        par=struct.unpack(E+'Q', d[base+O_PARENT:base+O_PARENT+8])[0]
        OBJS.append((nm,typ,loc,rot,quat,size,par))
tnames={0:'EMPTY',1:'MESH',2:'CURVE',3:'SURF',4:'FONT',5:'MBALL',11:'ARM',10:'LAMP',13:'CAM'}
print(f"\n{len(OBJS)} objects:")
for nm,typ,loc,rot,quat,size,par in sorted(OBJS, key=lambda x:x[0]):
    tn=tnames.get(typ,str(typ))
    print(f"  {nm[2:]:32s} {tn:6s} loc=({loc[0]:+.4f},{loc[1]:+.4f},{loc[2]:+.4f}) rot=({rot[0]:+.3f},{rot[1]:+.3f},{rot[2]:+.3f}) size=({size[0]:.3f},{size[1]:.3f},{size[2]:.3f})")
