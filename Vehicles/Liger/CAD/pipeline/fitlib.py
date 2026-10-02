"""Patch-fitting toolkit: rails (boundary curves on the mesh) + Coons-domain grids projected onto the mesh,
fitted as bicubic clamped-uniform B-spline patches with fixed (shared) boundary poles."""
import numpy as np
from scipy.interpolate import BSpline, CubicSpline
from geom import Surf
DEG=3
def knots(n):
    return np.concatenate([[0]*DEG,np.linspace(0,1,n-DEG+1),[1]*DEG])
def basis(t,n):
    t=np.clip(np.asarray(t,float),0,1-1e-12)
    k=knots(n); B=np.zeros((len(t),n))
    for j in range(n):
        c=np.zeros(n); c[j]=1; B[:,j]=BSpline(k,c,DEG,extrapolate=False)(t)
    B[np.isnan(B)]=0
    B[-1 if t[-1]>=1-1e-9 else 0:0]
    return B
def basis_full(t,n):
    t=np.asarray(t,float); B=basis(np.minimum(t,1-1e-12),n)
    B[t>=1-1e-12]=0; B[t>=1-1e-12,n-1]=1
    return B
def arclen_param(P):
    d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))]
    return d/d[-1], d[-1]
class Rail:
    """3D curve from dense samples; fitted B-spline with n poles; endpoints interpolated."""
    def __init__(self,name,P,n,flat_y=False):
        self.name=name; P=np.asarray(P,float)
        if flat_y: P=P.copy(); P[:,1]=0
        # drop duplicates
        keep=np.r_[True,np.linalg.norm(np.diff(P,axis=0),axis=1)>1e-6]; P=P[keep]
        t,self.length=arclen_param(P)
        self.P=P; self.t=t; self.n=n; self.cs=CubicSpline(t,P)
        tt=np.linspace(0,1,max(400,6*n)); D=self.cs(tt)
        B=basis_full(tt,n)
        C=np.zeros((n,3)); C[0]=P[0]; C[-1]=P[-1]
        rhs=D-np.outer(B[:,0],C[0])-np.outer(B[:,-1],C[-1])
        C[1:-1]=np.linalg.lstsq(B[:,1:-1],rhs,rcond=None)[0]
        if flat_y: C[:,1]=0
        self.C=C
        self.err=np.linalg.norm(B@C-D,axis=1).max()
    def pt(self,t): return self.cs(t)               # dense (true) curve
    def spl(self,t): return basis_full(np.atleast_1d(t),self.n)@self.C
class DegRail:
    """zero-length rail (a collapsed patch edge): all n poles at one point"""
    def __init__(self,name,pt,n):
        self.name=name; self.n=n; self.length=0.0; self.P=np.array([pt,pt]); self.C=np.tile(np.asarray(pt,float),(n,1)); self.err=0.0
    def pt(self,t): t=np.atleast_1d(t); return np.tile(self.C[0],(len(t),1)) if t.ndim else self.C[0]
    def spl(self,t): return self.pt(t)
def lift(S,xy,axis=2,pick='max',eps=0.6):
    H=S.ray(np.asarray(xy,float),axis,pick,eps=eps); return H
def fill_nan(G):
    # G (nu,nv,3) with nans: iterative neighbour fill
    for _ in range(50):
        bad=np.isnan(G[...,0])
        if not bad.any(): break
        Gp=np.pad(G,((1,1),(1,1),(0,0)),constant_values=np.nan)
        nb=np.stack([Gp[:-2,1:-1],Gp[2:,1:-1],Gp[1:-1,:-2],Gp[1:-1,2:]])
        m=np.nanmean(nb,axis=0)
        G[bad]=m[bad]
    return G
def orient_pts(S,G):
    P=G.reshape(-1,3)
    cen=np.stack([np.clip(P[:,0],-150,200),np.zeros(len(P)),np.full(len(P),50.)],1)
    return P-cen
class Patch:
    def __init__(self,name,bottom,top,left,right,axis=2,pick='max',nu=None,nv=None,eps=0.6):
        """bottom: rail at v=0 running u:0..1 ; top at v=1 ; left at u=0 running v:0..1 ; right at u=1.
        Corner coincidence required (reverse rails by passing (rail,'r'))."""
        self.name=name; self.axis=axis; self.pick=pick
        def g(r):
            return (r,False) if not isinstance(r,tuple) else (r[0],r[1]=='r')
        (self.rb,fb),(self.rt,ft),(self.rl,fl),(self.rr,fr)=g(bottom),g(top),g(left),g(right)
        self.fl=(fb,ft,fl,fr)
        assert self.rb.n==self.rt.n and self.rl.n==self.rr.n,(name,self.rb.n,self.rt.n,self.rl.n,self.rr.n)
        self.pu,self.pv=self.rb.n,self.rl.n
        self.nu=nu or max(40,self.pu*5); self.nv=nv or max(40,self.pv*5)
    def curve(self,which,t):
        r,f=self.__dict__[{'b':'rb','t':'rt','l':'rl','r':'rr'}[which]],self.fl['btlr'.index(which)]
        t=1-t if f else t
        return r.pt(t)
    def corners_ok(self,tol=0.05):
        c=[self.curve('b',0),self.curve('b',1),self.curve('t',0),self.curve('t',1)]
        d=[np.linalg.norm(self.curve('l',0)-c[0]),np.linalg.norm(self.curve('r',0)-c[1]),np.linalg.norm(self.curve('l',1)-c[2]),np.linalg.norm(self.curve('r',1)-c[3])]
        return max(d)
    def build(self,S):
        self.cd=self.corners_ok()
        nu,nv=self.nu,self.nv
        u=np.linspace(0,1,nu); v=np.linspace(0,1,nv)
        cols=[c for c in range(3) if c!=self.axis] if self.axis is not None else [0,1,2]
        Cb=self.curve('b',u)[:,cols]; Ct=self.curve('t',u)[:,cols]
        Cl=self.curve('l',v)[:,cols]; Cr=self.curve('r',v)[:,cols]
        p00,p10,p01,p11=Cb[0],Cb[-1],Ct[0],Ct[-1]
        U,Vv=np.meshgrid(u,v,indexing='ij')
        U=U[...,None];Vv=Vv[...,None]
        X=(1-Vv)*Cb[:,None,:]+Vv*Ct[:,None,:]+(1-U)*Cl[None,:,:]+U*Cr[None,:,:] \
          -((1-U)*(1-Vv)*p00+U*(1-Vv)*p10+(1-U)*Vv*p01+U*Vv*p11)
        # jacobian sign check (fold detection)
        if self.axis is None:
            d,ii=S.near(X.reshape(-1,3)); H=S.P[ii].reshape(nu,nv,3); self.fold=0.0
        else:
            du=np.diff(X,axis=0)[:,:-1]; dv=np.diff(X,axis=1)[:-1]
            jac=du[...,0]*dv[...,1]-du[...,1]*dv[...,0]
            self.fold=float((np.sign(jac)!=np.sign(np.median(jac))).mean())
            H=S.ray(X.reshape(-1,2),self.axis,self.pick,eps=0.6).reshape(nu,nv,3)
        self.miss=float(np.isnan(H[...,0]).mean())
        G=fill_nan(H.copy())
        # boundary = fitted rail splines
        G[:,0]=self.rb.spl(1-u if self.fl[0] else u)
        G[:,-1]=self.rt.spl(1-u if self.fl[1] else u)
        G[0,:]=self.rl.spl(1-v if self.fl[2] else v)
        G[-1,:]=self.rr.spl(1-v if self.fl[3] else v)
        self.G=G; self.u=u; self.v=v
        pu,pv=self.pu,self.pv
        Bu=basis_full(u,pu); Bv=basis_full(v,pv)
        C=np.zeros((pu,pv,3))
        cb=self.rb.C[::-1] if self.fl[0] else self.rb.C
        ct=self.rt.C[::-1] if self.fl[1] else self.rt.C
        cl=self.rl.C[::-1] if self.fl[2] else self.rl.C
        cr=self.rr.C[::-1] if self.fl[3] else self.rr.C
        C[:,0]=cb; C[:,-1]=ct; C[0,:]=cl; C[-1,:]=cr
        Cbnd=C.copy()
        Dp=G-np.einsum('ia,jb,abk->ijk',Bu,Bv,Cbnd)
        Bui=np.linalg.pinv(Bu[:,1:-1]); Bvi=np.linalg.pinv(Bv[:,1:-1])
        C[1:-1,1:-1]=np.einsum('ai,jb,ijk->abk',Bui,Bvi,Dp) if False else np.einsum('ai,bj,ijk->abk',Bui,Bvi,Dp)
        self.C=C
        self.fit_err=np.linalg.norm(np.einsum('ia,jb,abk->ijk',Bu,Bv,C)-G,axis=2)
        return self
    def eval(self,nu=60,nv=60):
        u=np.linspace(0,1,nu); v=np.linspace(0,1,nv)
        return np.einsum('ia,jb,abk->ijk',basis_full(u,self.pu),basis_full(v,self.pv),self.C)
    def deviation(self,S,n=60):
        X=self.eval(n,n).reshape(-1,3); d,_=S.near(X); return d
    def flip(self):
        self.C=self.C[::-1].copy()
    def normal_sign(self,S):
        X=self.eval(11,11); du=np.gradient(X,axis=0); dv=np.gradient(X,axis=1)
        n=np.cross(du,dv).reshape(-1,3); out=orient_pts(S,X)
        return np.sign((n*out).sum(1).mean()), (np.sign((n*out).sum(1))>0).mean()
    def fix_orientation(self,S):
        s,frac=self.normal_sign(S)
        if s<0: self.flip(); self.flipped=True
        else: self.flipped=False
def mirrored(C):
    M=C.copy(); M[...,1]*=-1; return M[::-1].copy()
def arc_patch(name,C,scale=0.01):
    pu,pv=C.shape[:2]
    pts=' '.join('(%.5f,%.5f,%.5f)'%tuple(C[i,j]*scale) for i in range(pu) for j in range(pv))
    return f'patch {pu} {pv} {pts} --degree=3 --name={name}'

def _sub(self,t0,t1,n,name):
    tt=np.linspace(t0,t1,max(2,int((t1-t0)*self.length)+2))
    P=self.cs(tt); r=Rail(name,P,n); return r
Rail.sub=_sub
