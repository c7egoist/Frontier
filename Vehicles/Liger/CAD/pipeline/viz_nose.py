import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from full_layout import *
S=Surf(); L=build_all(S); L.solve(); L.build()
P=S.P; m=(P[:,0]>185)&(P[:,1]<5)
fig,ax=plt.subplots(1,3,figsize=(21,7))
views=[(0,2,'elev x-z'),(1,2,'front y-z'),(0,1,'plan x-y')]
cols={'NQ1':'r','NQ2':'b','Hood_b':'g','Hood_a':'m','Door':'c'}
for a,(i,j,t) in zip(ax,views):
    a.plot(P[m][::6,i],P[m][::6,j],'.',ms=1,color='0.75'); a.set_title(t); a.set_aspect('equal')
    for k,c in cols.items():
        X=L.patches[k].eval(14,14)
        for q in range(14):
            a.plot(X[q,:,i],X[q,:,j],'-',color=c,lw=.6); a.plot(X[:,q,i],X[:,q,j],'-',color=c,lw=.6)
    a.set_xlim(185,265) if i==0 else a.set_xlim(-120,5)
plt.savefig('nose_fit.png',dpi=70,bbox_inches='tight')
