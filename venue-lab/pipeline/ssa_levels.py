import numpy as np
from scipy.spatial import cKDTree
P=np.load('ssa_P.npy')
C=np.array([1979.0,1908.0])
def classify(P):
    u=P[:,0]-C[0]; v=P[:,1]-C[1]
    L=np.full(len(P),'',dtype=object)
    lett=(np.abs(u)<470)&(np.abs(v)<800)
    s200=(~lett)&(np.abs(u)<1120)&(np.abs(v)<1175)
    side=(np.abs(u)>1250)&(np.abs(v)<1150)
    r=np.sqrt(0.6*u*u+v*v)
    L[:]='x'
    rest=~(lett|s200|side)
    L[lett]='L'; L[s200]='200'; L[side]='400s'
    L[rest&(r<1420)]='300'; L[rest&(r>=1420)&(r<1670)]='400e'; L[rest&(r>=1670)]='500'
    return L
L=classify(P)
