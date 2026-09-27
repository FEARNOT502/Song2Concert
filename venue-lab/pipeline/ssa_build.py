# Build SSA stand data from the official seat map.
import sys, json, numpy as np, cv2
sys.path.insert(0,'.')
from ssa_levels import P, classify
L=classify(P)
C=np.array([1980.0,1907.0])
K={'200':20.0,'300':24.6,'400s':28.8,'400e':28.8,'500':33.8}
RES=0.1                 # m per grid cell
X0,X1,Z0,Z1=-72,72,-66,66
W=int((X1-X0)/RES); H=int((Z1-Z0)/RES)
def toG(x,z): return ((x-X0)/RES,(z-Z0)/RES)
def toM(gx,gz): return (gx*RES+X0, gz*RES+Z0)

seats={}
for lv in ['200','300','400','500']:
    m=(L==lv) if lv!='400' else ((L=='400s')|(L=='400e'))
    Q=P[m].copy()
    k=np.where(L[m]=='400e',K['400e'],K.get(lv,K['400s']))
    X=(Q[:,0]-C[0])/k; Zr=(Q[:,1]-C[1])/k
    seats[lv]=np.c_[X,Zr]
# the stage end (end stage 2, top of the map, -z): the centre of the end 200
# blocks is where the stage and backstage stand
s=seats['200']; seats['200']=s[~((s[:,1]<-40)&(np.abs(s[:,0])<21))]
for lv,s in seats.items(): print(lv,len(s),s.min(0).round(1),s.max(0).round(1))
np.save('ssa_real.npy',np.array([seats[k] for k in ['200','300','400','500']],dtype=object),allow_pickle=True)
