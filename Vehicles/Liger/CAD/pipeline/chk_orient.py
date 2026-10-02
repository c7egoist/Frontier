import numpy as np
from full_layout import *
S=Surf(); L=build_all(S); L.solve(); L.build()
for k,P in L.patches.items():
    P.fix_orientation(S)
    X=P.eval(21,21); du=np.gradient(X,axis=0); dv=np.gradient(X,axis=1); n=np.cross(du,dv).reshape(-1,3)
    n/= np.linalg.norm(n,axis=1)[:,None]+1e-12
    d,ii=S.near(X.reshape(-1,3)); mn=S.N[S.tri[ii]] if hasattr(S,'tri') and S.tri.ndim==1 else None
    dot=(n*mn).sum(1) if mn is not None else np.zeros(len(n))
    print(f'{k:8s} frac_agree_mesh {np.mean(dot>0):.2f}  frac_out {P.normal_sign(S)[1]:.2f} flipped={P.flipped}')
