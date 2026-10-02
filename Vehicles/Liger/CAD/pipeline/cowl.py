"""Body_Front_Cowl: a zero-thickness folded sheet, section = lip / 45deg slope / small nose arc / long lower face,
swept along Y (ends sheared forward beyond |y|=74.7, notch in the lower edge near the centre).
Rebuilt as 4 profile pieces x 3 Y-spans = 12 conforming bicubic patches (shared rails)."""
import numpy as np
from scipy.spatial import cKDTree
from common import load
from parts_common import *
from layout import Layout
from fitlib import arc_patch
class SheetSurf:
    def __init__(self,V,T):
        self.V,self.T=V,T; self.P=tri_samples(V,T,0.25); self.kd=cKDTree(self.P)
    def near(self,Q): return self.kd.query(Q)
ZL=[78.01,72.07,70.28]            # z-levels of the three profile creases (section z is monotone along the profile)
def station(V,T,y0):
    ch=chain(slice_y(V,T,y0))
    if ch[0,2]<ch[-1,2]: ch=ch[::-1]
    keys=[0]
    for z in ZL:
        k=int(np.argmax(ch[:,2]<z)); a,b=ch[k-1],ch[k]; s=(a[2]-z)/(a[2]-b[2]); P=a+s*(b-a)   # exact crossing
        ch=np.insert(ch,k,P,axis=0); keys.append(k)
    keys.append(len(ch)-1)
    return ch,keys
def build_cowl():
    V,T=load('Body_Front_Cowl'); S=SheetSurf(V,T)
    y0,y1=V[:,1].min()+0.01,V[:,1].max()-0.01
    BR=[y0,-74.7,74.7,y1]
    L=Layout(S)
    # stations per span
    st={}
    for s in range(3):
        ys=np.unique(np.r_[np.arange(np.ceil(BR[s]),BR[s+1],1.0),BR[s],BR[s+1]]); st[s]=[(y,)+station(V,T,y) for y in ys]
    for b in range(4):
        ch,keys=station(V,T,BR[b])
        for k in range(5): L.nodes[f'K{k}_{b}']=ch[keys[k]].copy()
    for s in range(3):
        for k in range(5):
            P=np.array([c[keys_k] for (y,c,keys) in st[s] for keys_k in [keys[k]]])
            P[0]=L.nodes[f'K{k}_{s}']; P[-1]=L.nodes[f'K{k}_{s+1}']
            # drop duplicates
            keep=np.r_[True,np.linalg.norm(np.diff(P,axis=0),axis=1)>1e-4]; P=P[keep]
            L._add(f'K{k}_{s}',f'K{k}_{s+1}',P,44 if s==1 else None)
    for b in range(4):
        ch,keys=station(V,T,BR[b])
        for j in range(4):
            P=ch[keys[j]:keys[j+1]+1].copy(); P[0]=L.nodes[f'K{j}_{b}']; P[-1]=L.nodes[f'K{j+1}_{b}']
            L._add(f'K{j}_{b}',f'K{j+1}_{b}',P,None)
    names={0:'Lip',1:'Slope',2:'NoseArc',3:'Lower'}
    for j in range(4):
        for s in range(3):
            L.quad(f'Cowl_{names[j]}_{s}',[f'K{j}_{s}',f'K{j}_{s+1}',f'K{j+1}_{s+1}',f'K{j+1}_{s}'],axis=None)
    L.solve(unit=8.0,nmin=4,nmax=44)
    from fitlib import Patch
    for q in L.quads:
        p00,p10,p11,p01=q['c']
        def R(a,b):
            r=L.rails[frozenset((a,b))]; sp=L.rspec[frozenset((a,b))]
            return r if sp['a']==a else (r,'r')
        P=Patch(q['name'],bottom=R(p00,p10),top=R(p01,p11),left=R(p00,p01),right=R(p10,p11),axis=None,nu=q['nu'],nv=q['nv'])
        P.build(S); P.flipped=False; L.patches[q['name']]=P
    # uniform orientation: lip normal must point up (+z)
    P=L.patches['Cowl_Lip_1']; X=P.eval(9,9); n=np.cross(np.gradient(X,axis=0),np.gradient(X,axis=1)).reshape(-1,3).mean(0)
    if n[2]<0:
        for P in L.patches.values(): P.flip()
    return L,S
if __name__=='__main__':
    L,S=build_cowl(); L.report()
    lines=['# Liger Body_Front_Cowl: folded sheet, 12 conforming bicubic patches (units m)']+[arc_patch(k,P.C) for k,P in L.patches.items()]
    lines.append('sew '+' '.join(L.patches)+' --name=Liger_Front_Cowl')
    open('/home/user/scratch/cowl.arc','w').write('\n'.join(lines+['describe Liger_Front_Cowl'])+'\n')
