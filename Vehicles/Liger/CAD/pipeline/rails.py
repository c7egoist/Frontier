import numpy as np
from scipy.interpolate import CubicSpline, UnivariateSpline
from fitlib import *
def poly_dense(pts,step=1.0):
    pts=np.asarray(pts,float); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))]
    cs=CubicSpline(d,pts,bc_type='natural') if len(pts)>2 else None
    tt=np.arange(0,d[-1],step); tt=np.r_[tt,d[-1]]
    return (cs(tt) if cs is not None else np.interp(tt,d,pts[:,0])[:,None]*[1,0]+np.interp(tt,d,pts[:,1])[:,None]*[0,1]),tt
def snap(S,pts2,axis=2,pick='max',win=4.0,kind='valley',step=2.0,smooth=30.0):
    """move each dense point perpendicular to the polyline to the sharpest kink of the surface profile; then smooth."""
    D,tt=poly_dense(pts2,step)
    T=np.gradient(D,axis=0); T/=np.linalg.norm(T,axis=1)[:,None]; N=np.stack([-T[:,1],T[:,0]],1)
    offs=np.arange(-win,win+1e-9,0.5)
    out=[]
    for p,n in zip(D,N):
        Q=p[None,:]+offs[:,None]*n[None,:]
        H=S.ray(Q,axis,pick,eps=0.5); z=H[:,axis]
        zz=np.where(np.isnan(z),np.nanmean(z) if (~np.isnan(z)).any() else 0,z)
        d2=np.zeros_like(zz); d2[1:-1]=zz[2:]-2*zz[1:-1]+zz[:-2]
        d2[:2]=0;d2[-2:]=0
        j=np.argmax(d2) if kind=='valley' else np.argmin(d2)
        out.append(offs[j])
    out=np.array(out)
    # smooth offsets (median then spline)
    from scipy.ndimage import median_filter, gaussian_filter1d
    out=gaussian_filter1d(median_filter(out,5,mode='nearest'),2,mode='nearest')
    out[0]=0; out[-1]=0
    return D+out[:,None]*N
def rail_from_plan(S,name,pts2,n,axis=2,pick='max',flat_y=False,step=1.0,do_snap=None,kind='valley',win=4.0,lift_eps=0.6,ends=None):
    P2=np.asarray(pts2,float)
    if do_snap: P2=snap(S,P2,axis,pick,win=win,kind=kind)
    D,tt=poly_dense(P2,step)
    H=S.ray(D,axis,pick,eps=lift_eps)
    ok=~np.isnan(H[:,0])
    if (~ok).any():
        for k in range(3): H[~ok,k]=np.interp(np.where(~ok)[0],np.where(ok)[0],H[ok,k])
    if flat_y: H[:,1]=0
    if ends is not None:
        for idx,node in ((0,ends[0]),(-1,ends[1])):
            if node is None: continue
            dlt=np.asarray(node,float)-H[idx]; m=len(H)
            w=np.clip(1-np.arange(m)/10.0,0,1) if idx==0 else np.clip(1-(m-1-np.arange(m))/10.0,0,1)
            H=H+w[:,None]*dlt[None,:]
    # light smoothing along the curve of the lifted coordinate
    from scipy.ndimage import gaussian_filter1d
    Hs=gaussian_filter1d(H,1.0,axis=0,mode='nearest'); Hs[0]=H[0]; Hs[-1]=H[-1]
    return Rail(name,Hs,n,flat_y=flat_y)
