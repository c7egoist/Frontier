"""Body_Roof_Glass_Frame: flat ribbons stored as triangle strips (a tree of triangles).
Each branch of the tree becomes one ruled-cubic ribbon patch: sections = shared edges between consecutive triangles,
left/right edge curves fitted as clamped cubic B-splines (same parameter), 4 poles across (exactly linear)."""
import numpy as np, collections
from common import load
from parts_common import *
from fitlib import basis_full, arc_patch
def dual(T):
    E=collections.defaultdict(list)
    for i,t in enumerate(T):
        for a,b in ((0,1),(1,2),(2,0)): E[tuple(sorted((int(t[a]),int(t[b]))))].append(i)
    adj=collections.defaultdict(list); shared={}
    for e,ts in E.items():
        if len(ts)==2: adj[ts[0]].append(ts[1]); adj[ts[1]].append(ts[0]); shared[frozenset(ts)]=e
    return adj,shared
def branches(T,adj):
    """split the triangle tree at junction triangles (deg 3) -> list of tri paths. junction tri is appended to ONE branch (the first to reach it)."""
    deg={i:len(adj[i]) for i in range(len(T))}; seen=set(); used_j=set(); out=[]
    nodes=[i for i in deg if deg[i]!=2]          # leaves + junctions
    def walk(start,nxt):
        path=[start,nxt]
        while deg[path[-1]]==2:
            n=[x for x in adj[path[-1]] if x!=path[-2]][0]; path.append(n)
        return path
    done=set()
    for s in nodes:
        if deg[s]==3: continue
        for nx in adj[s]:
            p=walk(s,nx); key=(p[0],p[-1]); rk=(p[-1],p[0])
            if rk in done: continue
            done.add(key)
            if deg[p[-1]]==3: p=p+['open']      # stop at the junction edge; the junction triangle belongs to the J-J strip
            out.append(p)
    # junction-to-junction paths
    for s in nodes:
        if deg[s]!=3: continue
        for nx in adj[s]:
            p=walk(s,nx)
            if deg[p[-1]]==3 and (p[-1],p[0]) not in done: done.add((p[0],p[-1])); out.append(p)
    return out
def sections(V,T,path,shared,adj):
    """ordered transverse sections (a,b) as vertex ids. Free ends taper to the apex of the end triangle (a,a);
    a branch that runs into a junction triangle stops on the shared edge (the junction triangle belongs to the J-J strip)."""
    open_end=path[-1]=='open'
    if open_end: path=path[:-1]               # [..., last_real, J]
    edges=[tuple(shared[frozenset((path[i],path[i+1]))]) for i in range(len(path)-1)]
    tris=[T[i] for i in path]
    secs=[]
    apex=list(set(map(int,tris[0]))-set(edges[0]))[0]
    secs.append((apex,apex)); secs.append(edges[0])
    for e in edges[1:]:
        pa,pb=secs[-1]
        if pa in e: secs.append((pa,e[0] if e[1]==pa else e[1]))
        elif pb in e: secs.append((e[0] if e[1]==pb else e[1],pb))
        else: secs.append(e)
    if not open_end:
        apex=list(set(map(int,tris[-1]))-set(edges[-1]))[0]; secs.append((apex,apex))
    return secs
def fit_strip(V,secs,pn=None):
    A=np.array([V[a] for a,b in secs]); B=np.array([V[b] for a,b in secs])
    mid=(A+B)/2; t=np.r_[0,np.cumsum(np.linalg.norm(np.diff(mid,axis=0),axis=1))]; L=t[-1]; t=t/L
    # keep strictly increasing t
    for i in range(1,len(t)):
        if t[i]<=t[i-1]: t[i]=t[i-1]+1e-6
    t=t/t[-1]
    K=max(int(L/0.7),40); tt=np.linspace(0,1,K)
    a=np.stack([np.interp(tt,t,A[:,k]) for k in range(3)],1); b=np.stack([np.interp(tt,t,B[:,k]) for k in range(3)],1)
    n=pn or int(np.clip(round(L/6.0)+4,5,40))
    Bu=basis_full(tt,n)
    def fit(G):
        C=np.zeros((n,3)); C[0]=G[0]; C[-1]=G[-1]
        R=G-np.outer(Bu[:,0],G[0])-np.outer(Bu[:,-1],G[-1]); C[1:-1]=np.linalg.lstsq(Bu[:,1:-1],R,rcond=None)[0]; return C
    Ca,Cb=fit(a),fit(b); w=np.array([0,1/3,2/3,1])
    C=np.stack([(1-x)*Ca+x*Cb for x in w],1)
    X=np.einsum('ia,jb,abk->ijk',basis_full(np.linspace(0,1,15),n),basis_full(np.linspace(0,1,5),4),C)
    nrm=np.cross(np.gradient(X,axis=0),np.gradient(X,axis=1)).reshape(-1,3).sum(0)
    if nrm[2]<0: C=C[::-1].copy()        # normals up (+z) for every ribbon
    return C,L
def build_frame():
    V,T=load('Body_Roof_Glass_Frame'); adj,shared=dual(T)
    out={}
    for k,p in enumerate(branches(T,adj)):
        secs=sections(V,T,p,shared,adj); C,L=fit_strip(V,secs); out[f'Frame_{k}']=C
        print('strip',k,'tris',len(p),'len %.1f'%L,'poles',C.shape[0])
    return V,T,out
if __name__=='__main__':
    from scipy.spatial import cKDTree
    V,T,P=build_frame(); S=tri_samples(V,T,0.25); kd=cKDTree(S)
    from fitlib import basis_full
    for k,C in P.items():
        n=C.shape[0]; u=np.linspace(0,1,200); v=np.linspace(0,1,9)
        X=np.einsum('ia,jb,abk->ijk',basis_full(u,n),basis_full(v,4),C).reshape(-1,3); d,_=kd.query(X)
        # reverse: mesh samples near this strip
        print(k,'patch->mesh mean %.2f p99 %.2f max %.2f'%(d.mean(),np.percentile(d,99),d.max()))
    lines=['# Liger Body_Roof_Glass_Frame: ribbons (units m)']+[arc_patch(k,C) for k,C in P.items()]
    open('/home/user/scratch/frame.arc','w').write('\n'.join(lines+['list'])+'\n')
