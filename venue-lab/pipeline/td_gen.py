# Tokyo Dome: stands from the official seating map (dome_seating-map.pdf).
import sys, json, re, time, pickle, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, sample, front_from, depth
from standgen import Level, poly_out, mask_polys, edge_walls
T0=time.time()
lab=json.load(open('td/td_labeled.json'))
Hm=np.array([579.2,441.7]); s=2.996
def toR(poly): a=np.array(poly); return np.c_[(a[:,0]-Hm[0])/s,(a[:,1]-Hm[1])/s]   # metres: home at 0, CF at -z
G=Grid(-140,140,-200,110,0.1)
O=(0.0,-60.0)   # the dome's centre, near second base
def fill(polys, shrink=0.0):
    M=G.empty()
    for p in polys:
        gx,gz=G.g(p[:,0],p[:,1]); cv2.fillPoly(M,[np.c_[gx,gz].round().astype(np.int32)],1)
    if shrink>0: M=cv2.erode(M,disk(shrink/G.res))
    return M
def rows_of(o):
    n=[v for v in o['nums'] if v<60]
    return n
A=[o for o in lab if o['L']=='A']; B=[o for o in lab if o['L']=='B']; F=[o for o in lab if o['L']=='F']
C=[o for o in lab if o['L']=='C']; D=[o for o in lab if o['L']=='D']; E=[o for o in lab if o['L']=='E']
# block polygons in metres (1F drawn at the field's scale); leave out the
# container outlines (polygons holding many labels)
def blocks(L,maxn=6): return [toR(o['poly']) for o in L if len(o['nums'])<=maxn]
Ab,Bb,Fb=blocks(A),blocks(B),blocks(F)
# The map's 3B-side B blocks (B31-B39) are traced only as far as their labels;
# the building is symmetric, so that side is the 1B side mirrored
_Bc=[P for P in Bb if abs(P[:,0].mean())<=2]; _Br=[P for P in Bb if P[:,0].mean()>2]
Bb=_Br+_Bc+[P*np.array([-1.0,1.0]) for P in _Br]
print('blocks A',len(Ab),'B',len(Bb),'F',len(Fb))
# seats: rows parallel to each level's front, 0.5 m apart along the row, inside the blocks
def synth(blockpolys, pitch, rows, first=0.42, spacing=0.5):
    M=fill(blockpolys, shrink=0.2)
    hull=cv2.morphologyEx(M,cv2.MORPH_CLOSE,disk(30))
    Fm=front_from(G,hull,O,rmax=200)
    d=depth(G,Fm)
    pts=[]
    for r in range(rows):
        dc=first+r*pitch
        band=(np.abs(d-dc)<0.035)&(M>0)
        ys,xs=np.nonzero(band)
        if not len(xs): continue
        X,Z=G.m(xs,ys)
        P=np.c_[X,Z]
        # greedy thinning along the curve
        order=np.lexsort((P[:,1],P[:,0]))
        from scipy.spatial import cKDTree
        keep=[]; T=None
        taken=np.zeros(len(P),bool)
        tree=cKDTree(P)
        for i in np.argsort(np.arctan2(P[:,1]-O[1],P[:,0]-O[0])):
            if taken[i]: continue
            keep.append(i)
            for j in tree.query_ball_point(P[i],spacing*0.95): taken[j]=True
        pts.append(P[keep])
    return np.vstack(pts)
SA=synth(Ab,0.74,26); SB=synth(Bb,0.748,21); SF=synth(Fb,0.74,21)
print('seats A',len(SA),'B',len(SB),'F',len(SF), round(time.time()-T0,1))
np.save('td_seats1F.npy',np.array([SA,SB,SF],dtype=object),allow_pickle=True)

# ── the upper levels, in the building: rings round the 1st floor's back ──
M1=fill(Ab+Bb+Fb)
hull1=cv2.morphologyEx(M1,cv2.MORPH_CLOSE,disk(40))
k=int(2.0/G.res)*2+1
hull1=(cv2.GaussianBlur(hull1.astype(np.float32),(k,k),0)>0.5).astype(np.uint8)
# the field: the open ground inside the 1st floor
inv=(1-hull1).astype(np.uint8)
n,labm,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
gxo,gzo=G.g(np.array([O[0]]),np.array([O[1]])); field=(labm==labm[int(gzo[0]),int(gxo[0])])
solid1=(~field).astype(np.uint8)            # the 1st floor and everything outside it
dOut=cv2.distanceTransform((1-hull1).astype(np.uint8),cv2.DIST_L2,5)*G.res
dOut[field]=-1
# The building above the 1st floor does not follow the ins and outs of its
# blocks' backs: the balcony, the 2nd floor and the outer wall run straight
# down the lines and in a curve behind home, round the 1st floor's convex hull
cs_,_=cv2.findContours(hull1.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
hullC=np.zeros_like(hull1); cv2.fillPoly(hullC,[cv2.convexHull(np.vstack(cs_))],1)
dOut1=dOut
dOut=cv2.distanceTransform((1-hullC).astype(np.uint8),cv2.DIST_L2,5)*G.res
# The balcony and the 2nd floor stand out over the 1st floor's back rows
# (the building's section: the upper stand's front 12 m in from the lower
# stand's back, the balcony's 9 m), so the distance is signed, negative in
# from the hull; never out over the field, nor within 6 m of it
dIn=cv2.distanceTransform(hullC.astype(np.uint8),cv2.DIST_L2,5)*G.res
dOut=np.where(hullC>0,-dIn,dOut)
dFld=cv2.distanceTransform((~field).astype(np.uint8),cv2.DIST_L2,5)*G.res
dOut[dFld<6.0]=-999
gy,gx=np.mgrid[0:G.H,0:G.W]; X,Z=G.m(gx,gy)
RRO=np.maximum(np.hypot(X-O[0],Z-O[1]),1.0)     # distance from the dome's centre
TH=np.degrees(np.arctan2(X-O[0],Z-O[1]))   # 0 towards home, + towards +x (1st base side)
lab=json.load(open('td/td_labeled.json'))
Hm=np.array([579.2,441.7]); s=2.996
def spans(L):
    out=[]
    for o in lab:
        if o['L']!=L or len(o['nums'])>6: continue
        a=np.array(o['poly']); a=np.c_[(a[:,0]-Hm[0])/s,(a[:,1]-Hm[1])/s]-np.array(O)
        t=np.degrees(np.arctan2(a[:,0],a[:,1]))
        n=[v for v in o['nums'] if v<60]
        out.append((t.min(),t.max(),n))
    return sorted(out)
Dsp=[x for x in spans('D') if len(x[2])>=3]; Esp=spans('E')
AISLE=1.2
import td_upper as U
# (the balcony's and the 2nd floor's fronts move back over the outfield stand
# beyond the poles: their distance from the hull is measured from that line)
dOutC=dOut-U.tau_c(TH)
dOutD=dOut-U.tau_d(TH)
def sector_mask(t0,t1,dlo,dhi,fld=None):
    fld=dOut if fld is None else fld
    m=(fld>=dlo)&(fld<dhi)&(TH>=t0)&(TH<=t1)
    return m
def ring_seats(mask, dlo, pitch, rows, spacing=0.5, first=0.45, fld=None):
    from scipy.spatial import cKDTree
    fld=dOut if fld is None else fld
    pts=[]
    for r in range(rows):
        dc=dlo+first+r*pitch
        # half a cell either side: where the hull runs straight along the grid
        # (behind home) the distance steps by whole cells
        band=(np.abs(fld-dc)<0.051)&mask
        ys,xs=np.nonzero(band)
        if not len(xs): continue
        P=np.c_[G.m(xs,ys)]
        tree=cKDTree(P); taken=np.zeros(len(P),bool); keep=[]
        for i in np.argsort(TH[ys,xs]):
            if taken[i]: continue
            keep.append(i)
            for j in tree.query_ball_point(P[i],spacing*0.95): taken[j]=True
        pts.append(P[keep])
    return np.vstack(pts) if pts else np.zeros((0,2))
def shrink_sector(t0,t1,r):
    dt=np.degrees(AISLE/2/r); return t0+dt,t1-dt
# balcony (C): four rows over the back of the 1st floor, its front 9 m in
# from the 1st floor's back, pole to pole round home
C0,CP,CR=-9.0,0.9,4
SUITE_TH=33.7
# (behind home, inside the lines from about D20 to D32, the balcony level is
# the boxes, S101-110 and S301-310 either side of the VIP box)
# The balcony runs on past the foul poles (98.5 degrees from the dome's
# centre) to the map's last blocks, C01 and C97, at 130.4 degrees, over the
# outfield stand's rear (td_upper.py)
Cmask=sector_mask(-U.C_END,U.C_END,C0,C0+CP*CR,dOutC)&(np.abs(TH)>=SUITE_TH)
# aisles every 12 m round the ring
cm=Cmask.copy()
for t in np.linspace(-U.C_END,U.C_END,39): cm&=~((np.abs(TH-t)<np.degrees(0.6/75)))
SC=ring_seats(cm,C0,CP,CR,fld=dOutC)
# 2nd floor: D rows 1–10 from 12.3 m in over the 1st floor, a walkway, E
# rows 11–33
D0,DP=-12.3,0.8
E0=D0+10*DP+1.2
SDl=[]; SEl=[]
for t0,t1,n in Dsp:
    rows=max(v for v in n if v<=10) if any(v<=10 for v in n) else 10
    a,b=shrink_sector(t0,t1,70)
    SDl.append(ring_seats(sector_mask(a,b,D0,D0+rows*DP,dOutD),D0,DP,rows,fld=dOutD))
# the 2nd floor's ring on past D04 and E09 to the map's last blocks: D03, D02,
# D01 (D49, D50, D51) beside the rest of the ring, their front moving back over
# the outfield stand's rear (td_upper.py); E08, E07, E06 (E44, E45, E46)
for t0,t1,rows in U.both_sides(U.DX):
    a,b=shrink_sector(t0,t1,70)
    SDl.append(ring_seats(sector_mask(a,b,D0,D0+rows*DP,dOutD),D0,DP,rows,fld=dOutD))
VOM=[]   # tunnel mouths through the first rows of E, at every other gap between D blocks
for i in range(len(Dsp)-1):
    if i%2: continue
    VOM.append((Dsp[i][1]+Dsp[i+1][0])/2)
Ex=[(t0,t1,max(n[1:])-10 if len(n)>1 else 17) for t0,t1,n in Esp]+U.both_sides(U.EX)
for t0,t1,rows in Ex:
    a,b=shrink_sector(t0,t1,85)
    m=sector_mask(a,b,E0,E0+rows*DP)
    for tv in VOM:
        m&=~((np.abs(TH-tv)<np.degrees(1.1/RRO))&(dOut<E0+5*DP))
    SEl.append(ring_seats(m,E0,DP,rows))
SD=np.vstack(SDl); SE=np.vstack(SEl)
print('seats C',len(SC),'D',len(SD),'E',len(SE),round(time.time()-T0,1))
pickle.dump(dict(SA=SA,SB=SB,SF=SF,SC=SC,SD=SD,SE=SE,hull1=hull1,hullC=hullC,field=field,dOut=dOut,dOut1=dOut1,TH=TH,VOM=VOM,E0=E0,SUITE_TH=SUITE_TH),open('td_stage1.pkl','wb'))
