"""Trace the headlight (lens pocket) outline on the nose: gradient-ridge of the step edge (arc A) and SE rim edge.
Returns plan polylines (x,y) in cm."""
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.interpolate import CubicSpline
from rails import poly_dense
def grid(S,x0=200,x1=246,y0=-112,y1=-68,h=0.3):
    xs=np.arange(x0,x1,h); ys=np.arange(y0,y1,h); X,Y=np.meshgrid(xs,ys)
    Z=S.ray(np.stack([X.ravel(),Y.ravel()],1),2,'max')[:,2].reshape(X.shape)
    Zf=np.where(np.isnan(Z),np.nanmin(Z),Z); gy,gx=np.gradient(gaussian_filter(Zf,0.7),h); return xs,ys,np.hypot(gx,gy)
def sample(xs,ys,g,P):
    h=xs[1]-xs[0]; return map_coordinates(g,[(P[:,1]-ys[0])/h,(P[:,0]-xs[0])/h],order=1,mode='nearest')
def trace(S):
    xs,ys,g=grid(S)
    guess_A=np.array([(210.2,-102.8),(212,-98),(215,-92.5),(219,-87),(223,-83.3),(228,-79.2),(233,-76.5),(239.2,-74.8)])
    D,_=poly_dense(guess_A,1.0); T=np.gradient(D,axis=0); T/=np.linalg.norm(T,axis=1)[:,None]; N=np.stack([-T[:,1],T[:,0]],1)
    offs=np.arange(-2.5,2.51,0.1); out=[]
    for p,n in zip(D,N):
        Q=p[None]+offs[:,None]*n[None]; out.append(offs[np.argmax(sample(xs,ys,g,Q))])
    out=np.array(out); from scipy.ndimage import median_filter
    out=gaussian_filter(median_filter(out,7,mode='nearest'),2,mode='nearest'); A=D+out[:,None]*N
    guess_B=np.array([(217.5,-103.4),(221,-100.8),(225,-97.2),(229,-92.5),(232.5,-87),(235,-81.5),(237.5,-77),(239.2,-74.6)])
    D,_=poly_dense(guess_B,1.0); T=np.gradient(D,axis=0); T/=np.linalg.norm(T,axis=1)[:,None]; N=np.stack([-T[:,1],T[:,0]],1)
    # N points to the NW (lens side) for this direction? orient so that N has negative x+ component toward lens
    sgn=np.sign(np.mean(N[:,0]*-1+N[:,1])); 
    out=[]
    offs=np.arange(-3,3.01,0.1)
    for p,n in zip(D,N):
        Q=p[None]+offs[:,None]*n[None]; gg=sample(xs,ys,g,Q); k=np.where(gg>0.35)[0]
        # nearest threshold crossing to guess
        out.append(offs[k[np.argmin(np.abs(offs[k]))]] if len(k) else 0.0)
    out=np.array(out); out=gaussian_filter(median_filter(out,7,mode='nearest'),2,mode='nearest'); B=D+out[:,None]*N
    return A,B,(xs,ys,g)
if __name__=='__main__':
    from geom import Surf
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    S=Surf(); A,B,(xs,ys,g)=trace(S)
    print(np.round(A[::4],1).tolist()); print(np.round(B[::4],1).tolist())
    plt.figure(figsize=(9,8)); plt.imshow(np.clip(g,0,1.5),extent=[xs[0],xs[-1],ys[0],ys[-1]],origin='lower',cmap='magma')
    plt.plot(A[:,0],A[:,1],'c-',lw=1); plt.plot(B[:,0],B[:,1],'g-',lw=1); plt.savefig('/home/user/scratch/lamp_trace.png',dpi=65)
