"""Conforming quad layout engine: nodes (3D points), rails (curves between two nodes), quads (4 corner nodes).
Rails are fitted once and shared by neighbouring patches -> identical boundary poles."""
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter1d
from fitlib import *
from rails import poly_dense
class Layout:
    def __init__(self,S):
        self.S=S; self.nodes={}; self.masters={}; self.rspec={}; self.quads=[]; self.rails={}; self.patches={}
    # ---- masters: dense lifted polylines
    def master_plan(self,name,pts2,axis=2,pick='max',step=1.0,flat_y=False,smooth=1.0):
        D,_=poly_dense(pts2,step)
        H=self.S.ray(D,axis,pick); ok=~np.isnan(H[:,0])
        assert ok.mean()>0.9,(name,ok.mean())
        if (~ok).any():
            for k in range(3): H[~ok,k]=np.interp(np.where(~ok)[0],np.where(ok)[0],H[ok,k])
        if flat_y: H[:,1]=0
        if smooth: 
            Hs=gaussian_filter1d(H,smooth,axis=0,mode='nearest'); Hs[0]=H[0]; Hs[-1]=H[-1]; H=Hs
        self.masters[name]=H; return H
    def master_pts(self,name,P):
        self.masters[name]=np.asarray(P,float)
    def node_on(self,nname,master,near):
        """near: 3D (or 2-vector matching two plan coords -> use full 3D distance on available dims)"""
        M=self.masters[master]; near=np.asarray(near,float)
        if len(near)==2: d=np.hypot(M[:,0]-near[0],M[:,1]-near[1])
        elif len(near)==3: d=np.linalg.norm(M-near,axis=1)
        i=int(np.argmin(d)); self.nodes[nname]=M[i].copy(); self.nodes[nname+'#']=(master,i); return i
    # ---- rails
    def rail_master(self,a,b,master,n=None):
        ma,ia=self.nodes[a+'#']; 
        mb,ib=self.nodes[b+'#']
        i_a=self._idx(a,master); i_b=self._idx(b,master)
        M=self.masters[master]
        P=M[i_a:i_b+1] if i_a<=i_b else M[i_b:i_a+1][::-1]
        P=P.copy(); P[0]=self.nodes[a]; P[-1]=self.nodes[b]
        self._add(a,b,P,n)
    def _idx(self,node,master):
        M=self.masters[master]; return int(np.argmin(np.linalg.norm(M-self.nodes[node],axis=1)))
    def rail_line(self,a,b,axis=2,pick='max',n=None,via=None,smooth=1.0,step=1.0):
        if axis is None:
            pts=[self.nodes[a]]+([np.asarray(v,float) for v in via] if via else [])+[self.nodes[b]]
            pa=np.array(pts); dd=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pa,axis=0),axis=1))]; tt=np.linspace(0,dd[-1],max(int(dd[-1]/step),3)); D=np.stack([np.interp(tt,dd,pa[:,k]) for k in range(3)],1)
            d,ii=self.S.near(D); D2=self.S.P[ii]; D2[0]=self.nodes[a]; D2[-1]=self.nodes[b]
            D2=gaussian_filter1d(D2,2.0,axis=0,mode='nearest'); D2[0]=self.nodes[a]; D2[-1]=self.nodes[b]
            self._add(a,b,D2,n); return
        cols=[c for c in range(3) if c!=axis]
        pts=[self.nodes[a][cols]]+([np.asarray(v,float) for v in via] if via else [])+[self.nodes[b][cols]]
        D,_=poly_dense(np.array(pts),step)
        H=self.S.ray(D,axis,pick); ok=~np.isnan(H[:,0])
        assert ok.mean()>0.85,(a,b,ok.mean())
        if (~ok).any():
            for k in range(3): H[~ok,k]=np.interp(np.where(~ok)[0],np.where(ok)[0],H[ok,k])
        for idx,node in ((0,a),(-1,b)):
            dlt=self.nodes[node]-H[idx]; m=len(H)
            w=np.clip(1-np.arange(m)/12.0,0,1) if idx==0 else np.clip(1-(m-1-np.arange(m))/12.0,0,1)
            H=H+w[:,None]*dlt[None,:]
        if smooth:
            Hs=gaussian_filter1d(H,smooth,axis=0,mode='nearest'); Hs[0]=H[0]; Hs[-1]=H[-1]; H=Hs
        self._add(a,b,H,n)
    def _add(self,a,b,P,n):
        key=frozenset((a,b)); assert key not in self.rspec,('dup rail',a,b)
        self.rspec[key]=dict(a=a,b=b,P=P,n=n)
    def quad(self,name,c,axis=2,pick='max',nu=None,nv=None):
        self.quads.append(dict(name=name,c=c,axis=axis,pick=pick,nu=nu,nv=nv))
    # ---- solve pole counts, fit rails, build patches
    def solve(self,unit=8.0,nmin=7,nmax=44):
        parent={}
        def find(x):
            while parent.setdefault(x,x)!=x: parent[x]=parent[parent[x]]; x=parent[x]
            return x
        def uni(a,b): parent[find(a)]=find(b)
        for q in self.quads:
            p00,p10,p11,p01=q['c']
            ks=[frozenset((p00,p10)),frozenset((p01,p11)),frozenset((p00,p01)),frozenset((p10,p11))]
            for k in ks: assert k in self.rspec,(q['name'],'missing rail',tuple(k))
            uni(ks[0],ks[1]); uni(ks[2],ks[3])
        for k,s in self.rspec.items(): find(k)
        grp={}
        for k,s in self.rspec.items():
            L=np.linalg.norm(np.diff(s['P'],axis=0),axis=1).sum()
            auto=int(np.clip(round(L/unit)+3,nmin,nmax)); 
            g=find(k); grp[g]=max(grp.get(g,0),s['n'] or auto)
        for k,s in self.rspec.items():
            n=grp[find(k)]
            self.rails[k]=Rail(s['a']+'-'+s['b'],s['P'],n,flat_y=False)
    def build(self):
        for q in self.quads:
            p00,p10,p11,p01=q['c']
            def R(a,b):
                r=self.rails[frozenset((a,b))]; s=self.rspec[frozenset((a,b))]
                return r if s['a']==a else (r,'r')
            P=Patch(q['name'],bottom=R(p00,p10),top=R(p01,p11),left=R(p00,p01),right=R(p10,p11),axis=q['axis'],pick=q['pick'],nu=q['nu'],nv=q['nv'])
            P.build(self.S); P.fix_orientation(self.S); self.patches[q['name']]=P
    def report(self):
        print(f"{'patch':14s} {'poles':>7s} {'mean':>6s} {'p99':>6s} {'max':>6s} {'fold':>5s} {'miss':>5s} {'flip':>4s}")
        for n,P in self.patches.items():
            d=P.deviation(self.S)
            print(f"{n:14s} {P.pu:3d}x{P.pv:<3d} {d.mean():6.2f} {np.percentile(d,99):6.2f} {d.max():6.2f} {P.fold:5.2f} {P.miss:5.2f} {str(P.flipped)[0]:>4s}")
