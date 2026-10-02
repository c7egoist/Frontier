import numpy as np
from numba import njit
CELL=1.0
class RayGrid:
    def __init__(self,V,T,axis):
        self.axis=axis; cols=[c for c in range(3) if c!=axis]; self.cols=np.array(cols)
        P=V[:,cols]; self.V=V; self.T=T
        self.lo=P.min(0)-1; hi=P.max(0)+1
        self.nx=int((hi[0]-self.lo[0])/CELL)+1; self.ny=int((hi[1]-self.lo[1])/CELL)+1
        tp=P[T]  # (nt,3,2)
        i0=np.floor((tp[:,:,0].min(1)-self.lo[0])/CELL).astype(np.int64); i1=np.floor((tp[:,:,0].max(1)-self.lo[0])/CELL).astype(np.int64)
        j0=np.floor((tp[:,:,1].min(1)-self.lo[1])/CELL).astype(np.int64); j1=np.floor((tp[:,:,1].max(1)-self.lo[1])/CELL).astype(np.int64)
        cnt=np.zeros(self.nx*self.ny,np.int64)
        self.start,self.items=_build(i0,i1,j0,j1,self.nx,self.ny)
    def hits(self,Q,pick):
        """returns (n,) coordinate along axis of extreme hit (nan if none), plus triangle id"""
        return _query(np.ascontiguousarray(Q,float),self.V,self.T,self.cols,self.axis,self.lo,self.nx,self.ny,self.start,self.items,1 if pick=='max' else -1)
@njit(cache=True)
def _build(i0,i1,j0,j1,nx,ny):
    n=nx*ny; cnt=np.zeros(n+1,np.int64)
    for t in range(len(i0)):
        for i in range(i0[t],i1[t]+1):
            for j in range(j0[t],j1[t]+1):
                cnt[i*ny+j+1]+=1
    for k in range(n): cnt[k+1]+=cnt[k]
    fill=cnt[:-1].copy(); items=np.empty(cnt[-1],np.int64)
    for t in range(len(i0)):
        for i in range(i0[t],i1[t]+1):
            for j in range(j0[t],j1[t]+1):
                items[fill[i*ny+j]]=t; fill[i*ny+j]+=1
    return cnt,items
@njit(cache=True)
def _query(Q,V,T,cols,axis,lo,nx,ny,start,items,sgn):
    n=len(Q); out=np.full(n,np.nan); tid=np.full(n,-1,np.int64)
    c0=cols[0]; c1=cols[1]
    for q in range(n):
        px=Q[q,0]; py=Q[q,1]
        i=int((px-lo[0])/CELL); j=int((py-lo[1])/CELL)
        if i<0 or j<0 or i>=nx or j>=ny: continue
        best=-1e30*sgn if False else (-1e30 if sgn>0 else 1e30)
        found=False
        for k in range(start[i*ny+j],start[i*ny+j+1]):
            t=items[k]; a=T[t,0]; b=T[t,1]; c=T[t,2]
            ax_=V[a,c0]; ay=V[a,c1]; bx=V[b,c0]; by=V[b,c1]; cx=V[c,c0]; cy=V[c,c1]
            den=(by-cy)*(ax_-cx)+(cx-bx)*(ay-cy)
            if abs(den)<1e-14: continue
            l0=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den
            l1=((cy-ay)*(px-cx)+(ax_-cx)*(py-cy))/den
            l2=1-l0-l1
            e=-1e-9
            if l0<e or l1<e or l2<e: continue
            z=l0*V[a,axis]+l1*V[b,axis]+l2*V[c,axis]
            if (sgn>0 and z>best) or (sgn<0 and z<best):
                best=z; found=True; tid[q]=t
        if found: out[q]=best
    return out,tid
