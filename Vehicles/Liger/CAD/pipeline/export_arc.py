import numpy as np, sys
from full_layout import *
from fitlib import arc_patch, mirrored
def export(path,L,views=True,sew=True,name='Liger_Body_Shell'):
    names=[]; lines=['# Liger Body_Main_Shell: conforming bicubic B-spline patch network fitted to the mesh (units m)']
    for k,P in L.patches.items():
        lines.append(arc_patch(k,P.C)); names.append(k)
    for k,P in L.patches.items():
        lines.append(arc_patch(k+'_m',mirrored(P.C))); names.append(k+'_m')
    if sew: lines.append('sew '+' '.join(names)+f' --name={name}')
    return lines,names
if __name__=='__main__':
    S=Surf(); L=build_all(S); L.solve(); L.build()
    for P in L.patches.values(): P.fix_orientation(S) if hasattr(P,'fix_orientation') else None
    lines,names=export('x',L,sew=False)
    open('raw.arc','w').write('\n'.join(lines+['show cages off','show shading plastic','view iso','view fit','render raw_iso --size=1400x900'])+'\n')
    lines,names=export('x',L,sew=True)
    open('Liger_Body_Shell.arc','w').write('\n'.join(lines+['describe Liger_Body_Shell','topology Liger_Body_Shell'])+'\n')
