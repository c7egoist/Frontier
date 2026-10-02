"""Canopy cut lines. The roof edge ('L1') is, from the rear: a crease ridge in the mesh surface (found here as the Laplacian
ridge of the plan height field) that runs into the start of the Roof_Glass_Frame side rail, then the frame rail centreline,
the header centreline (average of the two header ribbons) and ends on the centreline.  The A-pillar is the Frame_2 ribbon centreline."""
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates, median_filter
def crease(S,x0=-147.4,y0=-38.8,x1=-12.0,h=0.5,half=2.0):
    xs=np.arange(-152,-5,h); ys=np.arange(-80,-20,h); X,Y=np.meshgrid(xs,ys)
    Z=S.ray(np.stack([X.ravel(),Y.ravel()],1),2,'max')[:,2].reshape(X.shape); Z=np.where(np.isnan(Z),np.nanmean(Z),Z)
    Zs=gaussian_filter(Z,1.2); Lp=(np.gradient(np.gradient(Zs,h,axis=0),h,axis=0)+np.gradient(np.gradient(Zs,h,axis=1),h,axis=1))
    gx_=[-147.4,-125,-100,-75,-50,-25,-12]; gy_=[-38.8,-44,-49.8,-55.5,-60.5,-64.5,-66.3]; px=np.arange(x0,x1+1e-9,2.0); gy=np.interp(px,gx_,gy_); out=[]
    for x,g in zip(px,gy):
        dy=np.arange(-half,half+1e-9,0.1); Q=np.stack([(g+dy-ys[0])/h,np.full_like(dy,(x-xs[0])/h)],0)
        v=map_coordinates(Lp,Q,order=1); out.append(g+dy[np.argmin(v)])
    out=np.array(out); out=gaussian_filter(median_filter(out,5,mode='nearest'),1.5,mode='nearest'); out[0]=y0
    return np.stack([px,out],1)
def frame_lines():
    from frame import build_frame
    from fitlib import basis_full
    import io,contextlib
    with contextlib.redirect_stdout(io.StringIO()): V,T,FR=build_frame()
    mid={}
    for k in ('Frame_4','Frame_5','Frame_2'):
        C=FR[k]; B=basis_full(np.linspace(0,1,200),C.shape[0]); mid[k]=(B@C[:,0,:]+B@C[:,3,:])/2
    return mid
def roof_line(S):
    cr=crease(S); mid=frame_lines()
    rail=mid['Frame_4'][:,:2]; rail=rail[np.argsort(rail[:,0])]; rail=rail[(rail[:,0]>-3)&(rail[:,0]<99.5)]; rail=rail[::10]
    P0=np.array([104.5,-57.0])
    h5=mid['Frame_5'][:,:2]; h2=mid['Frame_2'][:,:2]
    sel=lambda m:(m[(m[:,1]<0)&(m[:,1]>-55)] if True else m)
    a=sel(h5); b=sel(h2); a=a[np.argsort(a[:,1])]; b=b[np.argsort(b[:,1])]
    ys=np.array([-51,-44,-37,-30,-23,-16,-9,-3.0,0.0])
    hx=(np.interp(ys,a[:,1],a[:,0])+np.interp(ys,b[:,1],b[:,0]))/2
    hdr=np.stack([hx,ys],1); hdr[-1,1]=0.0
    L1=np.vstack([cr[::3],rail,P0[None],hdr])
    return L1,P0,hdr
def pillar_pts():
    return [(108.5,-60.0),(112.6,-64.3),(122.8,-70.2),(132.7,-76.1),(140.0,-78.8)]
if __name__=='__main__':
    from geom import Surf
    S=Surf(); L1,P0,h=roof_line(S); print(np.round(L1,1).tolist()); print(hdr:=np.round(h,1).tolist())
