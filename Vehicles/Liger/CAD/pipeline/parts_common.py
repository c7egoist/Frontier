import numpy as np
from scipy.spatial import cKDTree
def tri_samples(V,T,sp=0.3):
    P=[]
    rng=np.random.default_rng(1)
    A,B,C=V[T[:,0]],V[T[:,1]],V[T[:,2]]
    ar=0.5*np.linalg.norm(np.cross(B-A,C-A),axis=1)
    for a,b,c,s in zip(A,B,C,ar):
        n=max(int(s/(sp*sp)),1)+2
        r1=np.sqrt(rng.random(n)); r2=rng.random(n)
        P.append(a+(b-a)*r1[:,None]+(c-b)*(r1*r2)[:,None] if False else (1-r1)[:,None]*a+(r1*(1-r2))[:,None]*b+(r1*r2)[:,None]*c)
        P.append(np.array([a,b,c]))
    return np.vstack(P)
def slice_y(V,T,y0):
    """segments of the mesh cut by plane y=y0"""
    d=V[T][:,:,1]-y0; segs=[]
    for t,dd in zip(T,d):
        P=V[t]; pts=[]
        for i in range(3):
            j=(i+1)%3
            if dd[i]*dd[j]<0 or (dd[i]==0 and dd[j]!=0):
                s=dd[i]/(dd[i]-dd[j]); pts.append(P[i]+s*(P[j]-P[i]))
        if len(pts)==2: segs.append(pts)
    return segs
def chain(segs,tol=1e-3):
    """order cut segments into one polyline"""
    pts=[];adj={}
    key=lambda p:tuple(np.round(p/tol).astype(int))
    for a,b in segs:
        ka,kb=key(a),key(b)
        if ka==kb: continue
        adj.setdefault(ka,[]).append((kb,b)); adj.setdefault(kb,[]).append((ka,a)); pts.append((ka,a)); pts.append((kb,b))
    P={k:p for k,p in pts}
    ends=[k for k,v in adj.items() if len(v)==1]
    start=ends[0] if ends else next(iter(adj)); path=[start]; seen={start}
    while True:
        nx=[k for k,_ in adj[path[-1]] if k not in seen]
        if not nx: break
        path.append(nx[0]); seen.add(nx[0])
    return np.array([P[k] for k in path])
