import numpy as np
from layout import *
from rails import snap
from canopy_trace import roof_line, pillar_pts
from lamp_trace import trace as lamp_trace
CR=(-107.4,43.3); RR=44.6; CF=(175.0,43.5); RF=42.5
def arcpts(c,r0,r1,a0,a1,n=12):
    a=np.radians(np.linspace(a0,a1,n)); r=np.linspace(r0,r1,n)
    return np.stack([c[0]+r*np.cos(a),c[1]+r*np.sin(a)],1)
SEAM_W=0.0
def build_all(S,xcut=160.0):
    L=Layout(S)
    L.master_plan('CL',[(-181.1,0),(0,0),(259.8,0)],flat_y=True,step=1.0)
    Vfull=[(-138.5,-77.5),(-136.6,-73.5),(-133.5,-70),(-120,-66.5),(-90,-66),(-60,-70),(-30,-75),(0,-80.5),(40,-84),(80,-84.5),(120,-83.5),(140,-80),(155,-77),(165,-72),(172,-64),(178,-55),(183,-45),(187,-35),(190,-22),(192,-10),(192,0)]
    Vs=snap(S,np.array(Vfull,float),win=3.0)
    L.master_plan('V',Vs,step=1.0)
    H=np.load('out_half.npy'); O=np.r_[H[:88],H[176:]]
    O[0]=[O[0,0],0,O[0,2]]; O[-1]=[O[-1,0],0,O[-1,2]]
    t,Ltot=arclen_param(O); tt=np.linspace(0,1,int(Ltot)); Os=CubicSpline(t,O)(tt)
    Os=gaussian_filter1d(Os,2.0,axis=0,mode='nearest'); Os[0]=O[0]; Os[-1]=O[-1]
    L.master_pts('OUT',Os)
    LP=np.load('loop_half.npy').copy(); LP[0,1]=0; LP[-1,1]=0
    L.master_pts('LOOP',LP)
    # --- nodes on CL / V / OUT
    L.node_on('n2','CL',(-181.1,0)); L.node_on('A','CL',(-148.4,0)); L.node_on('Ap','CL',(-149.0,0)); L.node_on('Cx1','CL',(-64,0)); L.node_on('Cx2','CL',(xcut,0))
    L.node_on('E','CL',(192,0)); L.node_on('N0','CL',(259.8,0))
    L.node_on('B','V',(-138.5,-77.5)); L.node_on('V64','V',(-64,-70)); L.node_on('V160','V',(144.3,-79.6)); L.node_on('G','V',(178,-55))
    L.nodes['E']=L.masters['CL'][L.nodes['E#'][1]]; L.masters['V'][-1]=L.nodes['E']
    L.node_on('aL','OUT',(-150,-100)); L.node_on('aR','OUT',(-64,-107)); L.node_on('aF','OUT',(xcut,-111)); L.node_on('X','OUT',(205,-113))
    L.nodes['n2']=L.masters['OUT'][0].copy(); L.masters['CL'][0]=L.nodes['n2']
    L.nodes['N0']=L.masters['OUT'][-1].copy(); L.masters['CL'][-1]=L.nodes['N0']
    def reg(name,master,idx): L.nodes[name]=L.masters[master][idx].copy(); L.nodes[name+'#']=(master,idx)
    # --- canopy cut lines: roof edge L1 (crease -> frame rail -> header), nodes Rt,Rx,P0,H
    L1p,P0p,_=roof_line(S)
    L.master_plan('L1',L1p,step=1.0)
    L.node_on('H','CL',(122.7,0)); L.masters['L1'][-1]=L.nodes['H']
    L.node_on('Rt','L1',L1p[0]); L.node_on('Rx','L1',(-64.0,-55.8)); L.node_on('P0','L1',P0p)
    # V-end bookkeeping for E
    nE=L.nodes['E'].copy()
    # rails on CL
    L.nodes['n2#']=('CL',0); L.nodes['N0#']=('CL',len(L.masters['CL'])-1)
    for a,b in (('n2','Ap'),('A','Cx1'),('Cx1','H'),('H','Cx2'),('Cx2','E'),('E','N0')): L.rail_master(a,b,'CL')
    L.nodes['E#']=('V',len(L.masters['V'])-1)
    for a,b in (('B','V64'),('V64','V160'),('V160','G'),('G','E')): L.rail_master(a,b,'V')
    L.nodes['n2#']=('OUT',0); L.nodes['N0#']=('OUT',len(L.masters['OUT'])-1)
    for a,b in (('n2','aL'),('aL','aR'),('aR','aF'),('aF','X'),('X','N0')): L.rail_master(a,b,'OUT')
    # top-family cuts
    L.rail_line('A','Rt',via=[(-148.3,-10),(-148.1,-20),(-147.8,-30)])      # rear (canopy-side) edge of the open slot, upper part
    L.rail_line('Rt','B',via=[(-147.1,-40),(-146.3,-50),(-145.7,-55),(-144.7,-60),(-143.3,-65),(-141.5,-70),(-140.4,-73),(-139.6,-75),(-138.9,-77)])
    for a,b in (('Rt','Rx'),('Rx','P0'),('P0','H')): L.rail_master(a,b,'L1')                # roof edge / glass line
    L.rail_line('Cx1','Rx'); L.rail_line('Rx','V64')                                        # x=-64 divider, now through the roof edge
    L.rail_line('P0','V160',via=pillar_pts())                                                # A-pillar then valley
    L.rail_line('Ap','B',via=[(-148.9,-10),(-148.7,-20),(-148.4,-30),(-147.7,-40),(-146.9,-50),(-146.3,-55),(-145.3,-60),(-143.9,-65),(-142.1,-70),(-141.0,-73),(-140.2,-75),(-139.3,-77)])    # spoiler-plate rim
    # NOTE: the mesh has NO riser wall between plate and canopy: the plate is a separate overhanging sheet (open slot, floor at z~85 not modelled)
    for a,b in (('B','aL'),('V64','aR'),('Cx2','V160'),('V160','aF'),('G','X')): L.rail_line(a,b)
    L.quad('Roof_Rear',['A','Cx1','Rx','Rt']); L.quad('Side_Rear',['Rt','Rx','V64','B']); L.quad('Roof',['Cx1','H','P0','Rx'])
    L.quad('Side_Glass',['V64','V160','P0','Rx']); L.quad('Windscreen',['H','Cx2','V160','P0']); L.quad('Windscreen_Low',['Cx2','E','G','V160'])
    L.quad('Deck',['Ap','n2','aL','B']); L.quad('Sh_rear',['B','V64','aR','aL']); L.quad('Sh_door',['V64','V160','aF','aR'])
    L.quad('Hood_a',['V160','G','X','aF'])
    # --- headlight: lens pocket outline traced as a closed loop of 4 cut curves (step edge NW, rim edge SE), tied to the hood
    #     corners by 4 seams (O-grid).  The pointed SW tip is closed by a 3 cm cap so that no region wraps a reflex corner.
    N0x=L.nodes['N0'][0]
    A,B,_=lamp_trace(S); NE=np.array([239.0,-74.7]); A=A.copy(); A[-1]=NE; B=B.copy(); B[-1]=NE
    def lift(p): return S.ray(np.array([p],float),2,'max')[0]
    kA=len(A)//2; SWa=A[3]; SWb=np.array([211.8,-103.1]); MA=A[kA]
    L.nodes['SWa']=lift(SWa); L.nodes['MA']=lift(MA); L.nodes['NE']=lift(NE); L.nodes['SWb']=lift(SWb)
    sub=lambda P,i,j:[tuple(p) for p in P[i+3:j-2:4]]
    L.rail_line('SWa','MA',via=sub(A,3,kA),n=14); L.rail_line('MA','NE',via=sub(A,kA,len(A)-1))
    L.rail_line('SWb','NE',via=[(213.5,-103.2),(215.5,-103.3)]+[tuple(p) for p in B[0:-2:4]],n=14); L.rail_line('SWa','SWb')
    for a_,b_ in (('G','SWa'),('E','MA'),('X','SWb')): L.rail_line(a_,b_)
    _O=L.masters['OUT']; _O=_O[_O[:,0]>200]; _O=_O[np.argsort(_O[:,1])]
    _ys=np.array([-15.0,-30,-45,-60,-68]); _xs=np.interp(_ys,_O[:,1],_O[:,0]); _xl=NE[0]+(N0x-NE[0])*(_ys-NE[1])/(0.0-NE[1])
    L.rail_line('N0','NE',via=[(a_*SEAM_W+b_*(1-SEAM_W),y_) for a_,b_,y_ in zip(_xs,_xl,_ys)])
    L.quad('Headlight',['SWa','MA','NE','SWb'])
    L.quad('Hood_b1',['G','E','MA','SWa']); L.quad('Hood_b2',['E','N0','NE','MA']); L.quad('Hood_b3',['N0','X','SWb','NE']); L.quad('Hood_b4',['X','G','SWa','SWb'])
    # --- loop nodes
    for nm,idx in (('n1',0),('Tb',26),('P3',60),('NL',96),('NR',126),('Pbr',188),('Pbro',212),('Pfbl',268),('Pfbr',444),('K1',464),('K2',504),('N6',len(LP)-1)): reg(nm,'LOOP',idx)
    # make node coordinates of NL,NR exactly on radial lines (pick loop points nearest the radial angle)
    def rim_at(c,R,ang,lo,hi):
        a=np.radians(ang); tgt=np.array([c[0]+R*np.cos(a),c[1]+R*np.sin(a)])
        d=np.hypot(LP[lo:hi,0]-tgt[0],LP[lo:hi,2]-tgt[1]); return lo+int(np.argmin(d))
    ang_aL=np.degrees(np.arctan2(L.nodes['aL'][2]-CR[1],L.nodes['aL'][0]-CR[0])); ang_aR=np.degrees(np.arctan2(L.nodes['aR'][2]-CR[1],L.nodes['aR'][0]-CR[0]))
    reg('NL','LOOP',rim_at(CR,RR,ang_aL,70,110)); reg('NR','LOOP',rim_at(CR,RR,ang_aR,110,150))
    # loop rails
    for a,b in (('n1','Tb'),('Tb','P3'),('P3','NL'),('NL','NR'),('NR','Pbr'),('Pbr','Pbro'),('Pbro','Pfbl'),('Pfbr','K1'),('K1','K2'),('K2','N6')): L.rail_master(a,b,'LOOP')
    # front rim -> aF (with hop), and X -> Pfbr
    iF=int(np.argmin(np.hypot(LP[268:340,0]-xcut,LP[268:340,2]-L.nodes['aF'][2])))+268
    P=LP[268:iF+1].copy(); P=np.vstack([P,L.nodes['aF']]); L._add('Pfbl','aF',P,None)
    iX=int(np.argmin(np.linalg.norm(LP[340:445]-L.nodes['X'],axis=1)))+340
    P=LP[iX:445].copy(); P[0]=L.nodes['X']; L._add('X','Pfbr',P,None)
    # elevation cuts / outer arcs (y-ray, outermost)
    ang=lambda n,c: np.degrees(np.arctan2(L.nodes[n][2]-c[1],L.nodes[n][0]-c[0]))
    rad=lambda n,c: np.hypot(L.nodes[n][2]-c[1],L.nodes[n][0]-c[0])
    # FL outer arc Tb->aL
    aT=ang('Tb',CR); aA=ang('aL',CR); pts=arcpts(CR,rad('Tb',CR),rad('aL',CR),aT,aA,14)[1:-1]
    L.rail_line('Tb','aL',axis=1,pick='min',via=[tuple(p) for p in pts])
    L.rail_line('NL','aL',axis=1,pick='min'); L.rail_line('NR','aR',axis=1,pick='min')
    aR_=ang('aR',CR); aP=ang('Pbro',CR); pts=arcpts(CR,rad('aR',CR),rad('Pbro',CR),aR_,aP,14)[1:-1]
    L.rail_line('aR','Pbro',axis=1,pick='min',via=[tuple(p) for p in pts])
    k2,xx=L.nodes['K2'],L.nodes['X']
    th=lambda p:np.arctan2(p[2]-CF[1],p[0]-CF[0]); rr=lambda p:np.hypot(p[2]-CF[1],p[0]-CF[0])
    t=np.linspace(0,1,24); a=th(k2)+t*(th(xx)-th(k2)); r=rr(k2)+t*(rr(xx)-rr(k2)); y=k2[1]+t*(xx[1]-k2[1])
    Pk=np.stack([CF[0]+r*np.cos(a),y,CF[1]+r*np.sin(a)],1); Pk[0]=k2; Pk[-1]=xx; L._add('K2','X',Pk,None)
    # tail / nose centre-line faces (x-ray)
    L.rail_line('n1','n2',axis=0,pick='min'); L.rail_line('N6','N0',axis=0,pick='max')
    # wall quads
    L.quad('Tail',['n1','Tb','aL','n2'],axis=0,pick='min')
    L.quad('FL',['P3','NL','aL','Tb'],axis=1,pick='min')
    L.quad('RN',['NL','NR','aR','aL'],axis=1,pick='min')
    L.quad('FR',['NR','Pbr','Pbro','aR'],axis=1,pick='min')
    L.quad('Door',['Pbro','Pfbl','aF','aR'],axis=1,pick='min')
    L.quad('NQ1',['Pfbr','K1','K2','X'],axis=None)
    L.quad('NQ2',['K2','N6','N0','X'],axis=0,pick='max')
    return L
if __name__=='__main__':
    import pickle,time
    S=Surf(); t=time.time()
    L=build_all(S); L.solve(); L.build(); L.report(); print(time.time()-t)
    pickle.dump({k:(P.C,P.name,P.axis) for k,P in L.patches.items()},open('half.pkl','wb'))
