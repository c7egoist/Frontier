import numpy as np, os
from scipy.spatial import cKDTree
from common import *
import os; _cache=os.path.join(os.path.dirname(os.path.abspath(__file__)),'samples.npy')
def build_samples(V,T,spacing=0.35,seed=1):
    rng=np.random.default_rng(seed)
    a,b,c=V[T[:,0]],V[T[:,1]],V[T[:,2]]
    A=0.5*np.linalg.norm(np.cross(b-a,c-a),axis=1)
    n=np.maximum(1,np.round(A/spacing**2)).astype(int)
    idx=np.repeat(np.arange(len(T)),n)
    r1=np.sqrt(rng.random(len(idx))); r2=rng.random(len(idx))
    P=a[idx]*(1-r1)[:,None]+b[idx]*(r1*(1-r2))[:,None]+c[idx]*(r1*r2)[:,None]
    nn=np.cross(b-a,c-a)[idx]; nn/=np.linalg.norm(nn,axis=1)[:,None]+1e-12
    return P,idx
class Surf:
    def __init__(self):
        self.V,self.T=load()
        self.P,self.tri=build_samples(self.V,self.T)
        a,b,c=self.V[self.T[:,0]],self.V[self.T[:,1]],self.V[self.T[:,2]]
        n=np.cross(b-a,c-a); self.N=n/(np.linalg.norm(n,axis=1)[:,None]+1e-12)
        self.kd=cKDTree(self.P)
        self._k2={}
        from raycast import RayGrid
        self._rg={ax:RayGrid(self.V,self.T,ax) for ax in range(3)}
    def near(self,Q):
        d,i=self.kd.query(Q); return d,i
    def kd2(self,axis):
        if axis not in self._k2:
            cols=[c for c in range(3) if c!=axis]
            self._k2[axis]=(cols,cKDTree(self.P[:,cols]))
        return self._k2[axis]
    def ray(self,Q2,axis,pick='max',eps=0.3,zlim=None):
        """Q2: (n,2) in the remaining two coords (ascending). Returns (n,3) hit points (nan if none)."""
        cols,kd=self.kd2(axis)
        res=np.full((len(Q2),3),np.nan)
        lists=kd.query_ball_point(Q2,eps)
        for k,l in enumerate(lists):
            if not l: continue
            h=self.P[l]; v=h[:,axis]
            if zlim is not None:
                m=(v>=zlim[0][k])&(v<=zlim[1][k]); 
                if not m.any(): continue
                h=h[m]; v=v[m]
            j=np.argmax(v) if pick=='max' else np.argmin(v)
            # average of hits within 0.3cm of the extreme
            m=np.abs(v-v[j])<0.4
            res[k]=h[m].mean(0)
            res[k][cols]=Q2[k]
        return res

def _ray_exact(self,Q2,axis,pick='max',eps=None,zlim=None):
    Q2=np.asarray(Q2,float)
    h,tid=self._rg[axis].hits(Q2,pick)
    res=np.full((len(Q2),3),np.nan); cols=[c for c in range(3) if c!=axis]
    res[:,cols]=Q2; res[:,axis]=h
    return res
Surf.ray=_ray_exact
