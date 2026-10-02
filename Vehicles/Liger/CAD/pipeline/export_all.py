"""Build every Liger CAD part and write the .arc journals one level up (../).
  python export_all.py        (set LIGER_MESH_DIR to Vehicles/Liger/mesh)"""
import numpy as np, os, sys
from geom import Surf
from full_layout import build_all
from export_arc import export
from cowl import build_cowl
from frame import build_frame
from fitlib import arc_patch
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
def w(name,lines): open(os.path.join(OUT,name),'w').write('\n'.join(lines)+'\n')
S=Surf(); L=build_all(S); L.solve(); L.build(); L.report()
body,names=export('x',L,sew=False); body_sewn,_=export('x',L,sew=True)
w('Liger_Body_Patches_Unsewn.arc',body); w('Liger_Body_Shell.arc',body_sewn+['describe Liger_Body_Shell'])
CL,CS=build_cowl(); CL.report()
cowl=['# Liger Body_Front_Cowl: folded sheet, 12 conforming bicubic patches (units m)']+[arc_patch(k,P.C) for k,P in CL.patches.items()]
cowl_sewn=cowl+['sew '+' '.join(CL.patches)+' --name=Liger_Front_Cowl']
w('Liger_Front_Cowl.arc',cowl_sewn+['describe Liger_Front_Cowl'])
V,T,FR=build_frame()
frame=['# Liger Body_Roof_Glass_Frame: 6 ribbon patches (units m)']+[arc_patch(k,C) for k,C in FR.items()]
w('Liger_Roof_Glass_Frame.arc',frame)
full=[l for l in body_sewn if not l.startswith('#')]+cowl_sewn[1:]+frame[1:]
full+=['tint Liger_Body_Shell 0.80 0.82 0.86','tint Liger_Front_Cowl 0.15 0.15 0.18']+[f'tint {k} 0.10 0.10 0.12' for k in FR]
w('Liger_Full_Vehicle.arc',['# Liger: body shell + front cowl + roof/glass frame (units m, centreline Y=0)']+full)
print('written')
