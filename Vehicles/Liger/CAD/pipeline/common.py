import numpy as np
YC=-47.718
def load(name='Body_Main_Shell', half=True):
    import os; d=np.load(os.path.join(os.environ.get('LIGER_MESH_DIR','/home/user/src_frontier/Vehicles/Liger/mesh'),f'{name}.npz'))
    V=d['V'].astype(float).copy(); V[:,1]-=YC; T=d['T']
    return V,T
