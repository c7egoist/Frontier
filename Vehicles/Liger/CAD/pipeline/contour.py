import numpy as np
from common import *
def vertex_normals(V,T):
    a,b,c=V[T[:,0]],V[T[:,1]],V[T[:,2]]
    fn=np.cross(b-a,c-a)
    N=np.zeros_like(V)
    for k in range(3): np.add.at(N,T[:,k],fn)
    N/=np.linalg.norm(N,axis=1)[:,None]+1e-12
    return N
def contour_segments(V,T,f,level):
    segs=[]
    fv=f[T]-level
    for t,(a,b,c) in enumerate(fv):
        s=[a>0,b>0,c>0]
        if all(s) or not any(s): continue
        pts=[]
        for i,j in ((0,1),(1,2),(2,0)):
            if (fv[t,i]>0)!=(fv[t,j]>0):
                w=fv[t,i]/(fv[t,i]-fv[t,j]); pts.append(V[T[t,i]]*(1-w)+V[T[t,j]]*w)
        if len(pts)==2: segs.append(pts)
    return np.array(segs)
def chain(segs,tol=1e-4):
    # join segments by endpoints
    from collections import defaultdict
    key=lambda p: tuple(np.round(p/tol).astype(np.int64))
    adj=defaultdict(list)
    for i,(p,q) in enumerate(segs): adj[key(p)].append((i,0)); adj[key(q)].append((i,1))
    used=np.zeros(len(segs),bool); chains=[]
    for i in range(len(segs)):
        if used[i]: continue
        used[i]=True; line=[segs[i][0],segs[i][1]]
        for direction in (0,1):
            while True:
                end=line[-1] if direction==0 else line[0]
                nxt=[(j,e) for j,e in adj[key(end)] if not used[j]]
                if not nxt: break
                j,e=nxt[0]; used[j]=True; other=segs[j][1-e]
                if direction==0: line.append(other)
                else: line.insert(0,other)
        chains.append(np.array(line))
    return chains
if __name__=='__main__':
    V,T=load(); N=vertex_normals(V,T)
    # outward-ness: ensure +z normal on roof
    print(N[np.argmax(V[:,2])])
    for lev in (0.5,0.7,0.85):
        segs=contour_segments(V,T,N[:,2],lev)
        ch=chain(segs); ch=sorted(ch,key=len,reverse=True)
        print(lev,len(segs),[len(c) for c in ch[:8]])
        np.save(f'cont_{lev}.npy',np.array(ch,dtype=object),allow_pickle=True)
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    ch=np.load('cont_0.7.npy',allow_pickle=True)
    fig,ax=plt.subplots(2,1,figsize=(20,12))
    for c in ch[:12]:
        if len(c)<20: continue
        ax[0].plot(c[:,0],c[:,1],lw=1); ax[1].plot(c[:,0],c[:,2],lw=1)
    for a in ax: a.set_aspect('equal'); a.grid(alpha=.3)
    plt.tight_layout(); plt.savefig('cont.png',dpi=55)
