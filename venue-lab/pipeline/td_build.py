import sys, re, json, time, pickle, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, STRAIGHT, sample, seat_mask
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, redepth, trim_tunnels, front_parapet, relay_columns
T0=time.time()
st=pickle.load(open('td_stage1.pkl','rb'))
G=Grid(-140,140,-200,110,0.1)
STRAIGHT.update(on=True,res=G.res)
O=(0.0,-60.0)
dOut,TH,hull1,field=st['dOut'],st['TH'],st['hull1'],st['field']
dOut1=st['dOut1']
E0=st['E0']; D0,DP=-12.3,0.8
_gy,_gx=np.mgrid[0:G.H,0:G.W]; _Xg,_Zg=G.m(_gx,_gy); RRO=np.maximum(np.hypot(_Xg-O[0],_Zg-O[1]),1.0); del _gy,_gx
# Heights from the building's section (the infield, the field 5.5 m under
# GL): the lower stand shallow at the front and steeper towards its back,
# up to the open concourse behind it (10.6 m); the balcony at the next
# floor (15.6 m); the upper stand from 18.6 m, over the 4th-floor concourse,
# up to 35.6 m under the ring
H_A,R_A=1.0,0.17; H_B,R_B=5.5,0.255; H_F,R_F=4.6,0.46
H_C,R_C=15.0,0.4; H_D,R_D=18.6,0.55; H_E,R_E=24.4,0.5
C1F,CBAL,C2F=10.6,16.2,24.0
C0W=-9.0           # the balcony's front, in from the 1st floor's hull (over its back rows)
LV={}
# the A seats as the building rows them (td_rowsA.py): each block's rows
# parallel to its back, numbered back from the walkway behind row 26, the
# fence cutting across them; A01/A49 (the wedges at the poles, rows 15-40)
# on past the walkway to row 40, as B. Each block its own, the outfield's
# F20/F01 beside them another stand
ra=pickle.load(open('td_rowsA.pkl','rb'))
bl=ra['blocks']
LV['A']=Level(G,'A',ra['SA'],0.74,H_A,R_A,'ground',centre=O,rmax=180,hull_close=2.0)
redepth(LV['A'],G,ra['secA'],np.array([b['f'] for b in bl]),np.array([26*0.74+b['sA'] for b in bl]),ra['rowA'])
LV['B']=Level(G,'B',np.r_[st['SB'],ra['SBx']],0.748,H_B,R_B,'ground',centre=O,rmax=180,hull_close=2.0)
LV['F']=Level(G,'F',st['SF'],0.74,H_F,R_F,'ground',centre=O,rmax=180,hull_close=2.0)
LV['C']=Level(G,'C',st['SC'],0.9,H_C,R_C,0.5,1.2,centre=O,rmax=180,open_w=4.0,hull_close=4.0,max_rows=4)
LV['D']=Level(G,'D',st['SD'],0.8,H_D,R_D,0.5,1.5,centre=O,rmax=180,open_w=3.0,hull_close=3.0,max_rows=10)
LV['E']=Level(G,'E',st['SE'],0.8,H_E,R_E,0.5,0.6,centre=O,rmax=180,open_w=2.2,hull_close=3.0)
# the outfield stand's rows from the fence, level along it (4.6 m over the
# outfield's tall fence), each 0.333 m higher, up to the 1st-floor concourse
# at its 19th (the doors at the backs of its aisles open onto it)
_F=LV['F']
_st1=cv2.morphologyEx(((_F.R>0)|(LV['A'].R>0)|(LV['B'].R>0)).astype(np.uint8),cv2.MORPH_CLOSE,disk(6.0/G.res))>0
_open=~(_st1|(cv2.dilate(field.astype(np.uint8),disk(4.0/G.res))>0))     # behind the stands' back line: the concourse
_nF=_F.nrows
_riseF=(C1F-H_F)/18
_F.hs=np.array([min(C1F,H_F+_riseF*b) for b in range(_nF)]); _F.h0=H_F
# its rows counted from the fence (the distance from the field), so its
# front row is level all along it
_dFence=(cv2.distanceTransform((~field).astype(np.uint8),cv2.DIST_L2,5)*G.res).astype(np.float32)
_F.set_depth(_dFence); _F.nrows=_nF
_F.band=np.where(_F.R>0,np.clip(np.floor(_F.d/0.74).astype(int),0,_nF-1),-1)
_ff=(_F.R>0)&(cv2.dilate(field.astype(np.uint8),disk(2.0/G.res))>0)
print('outfield front band median',np.median(_F.band[_ff]) if _ff.any() else None)
print('outfield stand rows',_nF,'seats',len(_F.seats))
print('levels',round(time.time()-T0,1),{k:(l.nrows,len(l.seats)) for k,l in LV.items()})
# The entrances as the official seating map marks them (the numbered
# circles, td/entrances.json, in the map's own points): 48 round the back of
# the infield's 1st floor and 10 behind the outfield's, from the 1st-floor
# concourse; 14 through the front rows of E, from the 2nd floor's. The map
# draws the 2nd floor out of scale, so there only their angles are taken.
_ent=np.array([c['c'] for c in json.load(open('td/entrances.json'))])
_ent=(_ent-np.array([579.2,441.7]))/2.996
_eth=np.degrees(np.arctan2(_ent[:,0]-O[0],_ent[:,1]-O[1])); _er=np.hypot(_ent[:,0]-O[0],_ent[:,1]-O[1])
ENT1=_ent[_er<125]; VOM2=sorted(_eth[_er>=125])
print('entrances: 1st floor',len(ENT1),'2nd floor',len(VOM2))
# the tunnels from the 2nd-floor concourse through E's first rows, made straight
VOMS={'E':LV['E'].make_voms(C2F,detect=False,cands=[(np.abs(TH-tv)<np.degrees(1.1/RRO))&(dOut>=E0-0.3)&(dOut<E0+5*DP) for tv in VOM2])}
# each named for the E block it runs under, as the signs over them are
_lab=json.load(open('td/td_labeled.json')); _Hm=np.array([579.2,441.7]); _s=2.996
_Esp=[]
for o in _lab:
    if o['L']!='E' or len(o['nums'])>6: continue
    a_=np.array(o['poly']); a_=np.c_[(a_[:,0]-_Hm[0])/_s,(a_[:,1]-_Hm[1])/_s]-np.array(O)
    t_=np.degrees(np.arctan2(a_[:,0],a_[:,1])); _Esp.append((t_.min(),t_.max(),o['nums'][0]))
for v in VOMS['E']:
    th=np.degrees(np.arctan2(v['p'][0]-O[0],v['p'][1]-O[1]))
    best=min(_Esp,key=lambda e: 0 if e[0]<=th<=e[1] else min(abs(th-e[0]),abs(th-e[1])))
    v['label']=f"E{best[2]}"
print('voms E',len(VOMS['E']),[v['label'] for v in VOMS['E']])
def dil(m,r): return cv2.dilate(m.astype(np.uint8),disk(r/G.res))>0
A,B,F,Cl,D,E=[LV[k] for k in 'ABFCDE']
# at the poles the infield runs on into the outfield: the aisles between them
# are treads, stepping with the rows either side
R1=(A.R>0)|(B.R>0)|(F.R>0)
clo=cv2.morphologyEx(R1.astype(np.uint8),cv2.MORPH_CLOSE,disk(3.0/G.res))>0
gap=clo&~R1&~field&dil(A.R|B.R,4.0)&dil(F.R,4.0)
dist=[cv2.distanceTransform((l.R==0).astype(np.uint8),cv2.DIST_L2,5) for l in (A,B,F)]
near=np.argmin(np.stack(dist),axis=0)
for k,l in enumerate((A,B,F)):
    add=gap&(near==k)
    l.R[add]=1
    l.band=np.where(l.R>0,np.clip(np.floor(l.d/l.D).astype(int),0,l.nrows-1),-1)
print('pole aisles filled', int(gap.sum()*G.res**2), 'm2')
# and the notch at each pole between the infield's B blocks, the pole block
# and the outfield: the B stand runs on across it, row for row, so the
# infield and the outfield stands meet as one, with no block of concourse
# standing up between them
R1=(A.R>0)|(B.R>0)|(F.R>0)
clo6=cv2.morphologyEx(R1.astype(np.uint8),cv2.MORPH_CLOSE,disk(7.0/G.res))>0
notch=clo6&~R1&~field&dil(B.R,4.0)&dil(F.R,14.0)&(B.d>0)&(B.d<B.nrows*B.D)
B.R[notch]=1
B.band=np.where(B.R>0,np.clip(np.floor(B.d/B.D).astype(int),0,B.nrows-1),-1)
print('pole notch filled',int(notch.sum()*G.res**2),'m2')
# the front: the 1st floor's stands run right up to the field's edge, so the
# wall in front of them follows the field's line. Where the fence cuts the
# rows off (towards the poles) the front row's tread runs on level to it.
R1=(A.R>0)|(B.R>0)|(F.R>0)
frontgap=~field&dil(field,3.0)&~R1&dil(A.R|F.R,3.0)
for l in (A,F):
    seed=np.where(l.band>=0,0,1).astype(np.uint8)
    _,labp=cv2.distanceTransformWithLabels(seed,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    zy,zx=np.nonzero(seed==0); bl=np.r_[-1,l.band[zy,zx]]; dl=np.r_[0,l.d[zy,zx]]
    other=[m for m in (A,F) if m is not l][0]
    mine=frontgap&(cv2.distanceTransform(seed,cv2.DIST_L2,5)<=cv2.distanceTransform(np.where(other.band>=0,0,1).astype(np.uint8),cv2.DIST_L2,5))
    l.R[mine]=1; l.band[mine]=bl[labp[mine]]; l.d[mine]=dl[labp[mine]]
    frontgap&=~mine
print('front filled to the field')
# holes inside the 1st floor's stands (where the map's blocks leave a gap
# with stand all round it) are treads too, not a well down to the concourse
R1=(A.R>0)|(B.R>0)|(F.R>0)
inv=(~R1&~field).astype(np.uint8)
n_,lab_,st_,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
holes=np.zeros_like(R1)
for i in range(1,n_):
    x_,y_,w_,h_,a_=st_[i]
    if a_*G.res**2<80 and x_>1 and y_>1 and x_+w_<G.W-1 and y_+h_<G.H-1:
        m_=lab_==i
        ring=cv2.dilate(m_.astype(np.uint8),np.ones((3,3),np.uint8))>0
        if R1[ring&~m_].mean()>0.9: holes|=m_
dist=[cv2.distanceTransform((l.R==0).astype(np.uint8),cv2.DIST_L2,5) for l in (A,B,F)]
near=np.argmin(np.stack(dist),axis=0)
for k,l in enumerate((A,B,F)):
    add=holes&(near==k)
    l.R[add]=1
    l.band=np.where(l.R>0,np.clip(np.floor(l.d/l.D).astype(int),0,l.nrows-1),-1)
print('holes in the 1st floor filled',int(holes.sum()*G.res**2),'m2')
# ── the excite seats (エキサイトシート): low stands on the field in foul
# territory, in front of the A blocks from about A03 to A15 and A35 to A47,
# blocks G03-G15 and G35-G47 of the map, one to six rows each. The map draws
# their front as a stepped line (3B side); the 1B side is its mirror. ──
# Each block as the map draws it: the solid outlines flood-filled from
# their labels; G03-G04 (and G46-G47) are drawn dotted, so traced by hand
# (map points), each run on a little past the A blocks' front and cut there
_vec=json.load(open('td/td_vec.json')); _K=6.0
_ink=np.zeros((int(900*_K),int(1200*_K)),np.uint8)
for _p in _vec['polys']:
    cv2.polylines(_ink,[(np.array(_p['pts'],float)*_K).round().astype(np.int32)],bool(_p['closed']),255,2)
_gm=np.zeros_like(_ink)
for _w in _vec['words']:
    if not re.fullmatch(r'G\d\d',_w[4]) or _w[4] in ('G03','G04','G46','G47'): continue
    _m=np.zeros((_ink.shape[0]+2,_ink.shape[1]+2),np.uint8); _im=_ink.copy()
    _n=cv2.floodFill(_im,_m,(int((_w[0]+_w[2])/2*_K),int((_w[1]+_w[3])/2*_K)),128,flags=4)[0]
    if _n/_K**2/_s**2<120: _gm[_m[1:-1,1:-1]>0]=255
# the fence in front of them runs on from G05's corner to the line between
# A02 and A03 (map points; G03 and G04, drawn dotted, left unseated: the
# floor behind the fence open)
_open_ex=np.zeros_like(_gm)
_Pq=[(756.8,277.4),(794.9,256.2),(798.0,257.0),(790.5,274.6),(783.2,288.8),(780.2,287.0)]
for _sx in (1,-1):
    _Q=np.array([(_Hm[0]+_sx*(x-_Hm[0]),y) for x,y in _Pq])
    cv2.fillPoly(_open_ex,[(_Q*_K).round().astype(np.int32)],255)
_open_ex&=~cv2.dilate(_gm,np.ones((3,3),np.uint8))
_gm|=_open_ex
_gm=cv2.dilate(_gm,np.ones((3,3),np.uint8))    # over the outlines' own ink
_px=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _py=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
EX=cv2.remap(_gm,_px,_py,cv2.INTER_NEAREST,borderValue=0)>0
EXopen=cv2.remap(_open_ex,_px,_py,cv2.INTER_NEAREST,borderValue=0)>0
del _px,_py
# the blocks' seats stay theirs; the bare tread before them the excite seats'
EX&=~((B.R>0)|(F.R>0)|dil(A.seatmask,0.6))
EX=cv2.morphologyEx(EX.astype(np.uint8),cv2.MORPH_OPEN,disk(0.3/G.res))>0
field&=~EX
A.R[EX]=0; A.band[EX]=-1
# The 1st floor's blocks as the map draws them (A, B and F boxes, each
# flood-filled from its letter, named by the number beside it), for seating
# a box the model left bare and the corners at the poles block by block
BOXN=['']; _lk=np.zeros(_ink.shape,np.int16)
for _w in _vec['words']:
    cx_,cy_=(_w[0]+_w[2])/2,(_w[1]+_w[3])/2
    if re.fullmatch(r'[ABF]\d\d',_w[4]): _w=list(_w); _num=_w[4][1:]; _w[4]=_w[4][0]      # 'B02' written as one word
    elif _w[4] in ('A','B','F'):
        _nn=[w for w in _vec['words'] if re.fullmatch(r'\d\d',w[4]) and abs((w[0]+w[2])/2-cx_)<14 and abs((w[1]+w[3])/2-cy_)<14]
        if not _nn: continue
        _num=min(_nn,key=lambda w:np.hypot((w[0]+w[2])/2-cx_,(w[1]+w[3])/2-cy_))[4]
    else: continue
    _m=np.zeros((_ink.shape[0]+2,_ink.shape[1]+2),np.uint8)
    _n=cv2.floodFill(_ink.copy(),_m,(int(cx_*_K),int(cy_*_K)),128,flags=4)[0]
    if _n/_K**2/_s**2>400: continue
    BOXN.append(_w[4]+_num); _lk[(_m[1:-1,1:-1]>0)&(_lk==0)]=len(BOXN)-1
_pxb=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _pyb=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
BOXL=cv2.remap(_lk,_pxb,_pyb,cv2.INTER_NEAREST,borderValue=0)
del _pxb,_pyb,_lk
print('map boxes',len(BOXN)-1)
print('excite seats',int(EX.sum()*G.res**2),'m2')
EXe=cv2.erode(EX.astype(np.uint8),disk(0.35/G.res))>0
# the rows from the fence: every edge of the strip but the one against the A blocks
Fx=(EX&~cv2.erode(EX.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool))&~dil(A.R,0.4)
dX=cv2.distanceTransform((~Fx).astype(np.uint8),cv2.DIST_L2,5)*G.res
SG=[]
from scipy.spatial import cKDTree
for r_ in range(20):
    band=(np.abs(dX-(0.45+r_*0.8))<0.051)&EXe
    ys,xs=np.nonzero(band)
    if not len(xs): continue
    P_=np.c_[G.m(xs,ys)]; tree=cKDTree(P_); taken=np.zeros(len(P_),bool); keep=[]
    for i in np.argsort(np.arctan2(P_[:,0]-O[0],P_[:,1]-O[1])):
        if taken[i]: continue
        keep.append(i)
        for j in tree.query_ball_point(P_[i],0.5*0.95): taken[j]=True
    SG.append(P_[keep])
SG=np.vstack(SG)
SG=SG[sample(G,EXopen.astype(np.uint8),SG)==0]
LV['G']=Level(G,'G',SG,0.8,0.3,0.2,'ground',centre=O,rmax=180,hull_close=1.5,front_sig=4.0)
Gx=LV['G']
# the map draws the strip deeper than its six rows: the rows run on back to
# the A blocks' front, level past the sixth
Gx.hs=np.array([0.3+0.2*min(k,5) for k in range(Gx.nrows)])
print('excite seats',len(SG),'rows',Gx.nrows)
# the excite seats' treads fill their strip to the stand behind them
Gx.R[EX&(Gx.R==0)]=1
Gx.d[EX&(Gx.d<0.01)]=0.01          # (the floor out past the seats' front line too)
Gx.band=np.where(Gx.R>0,np.clip(np.floor(np.maximum(Gx.d,0)/Gx.D).astype(int),0,Gx.nrows-1),-1)
field_out=field&~(cv2.dilate(((Gx.R>0)|EX).astype(np.uint8),disk(0.2/G.res))>0)
n_,lab_,st_,_=cv2.connectedComponentsWithStats(field_out.astype(np.uint8),connectivity=4)
field_out=lab_==(1+int(np.argmax(st_[1:,4])))
# Near the poles the B stand's rows counted from the walkway behind row 26
# (its outline's front runs astray there on the 1B side, B02 having had no
# seats traced, and row 27 stood 1.3 m over the walkway): as everywhere
# else, row 27 a step up from the walkway
_crB=(cv2.morphologyEx(((A.R>0)|(B.R>0)).astype(np.uint8),cv2.MORPH_CLOSE,disk(25))>0)&(A.R==0)&(B.R==0)&~field
_crB&=dil(A.R,2.5)&dil(B.R,2.5)
_dcw=(cv2.distanceTransform((~_crB).astype(np.uint8),cv2.DIST_L2,5)*G.res).astype(np.float32)
# (every cell there, not only B's treads now: the pole's fills give B more)
_selB=(np.abs(TH)>=75)&(np.abs(TH)<=125)&(_dcw<30)&~field&((B.R>0)|((A.R==0)&(F.R==0)))
_ndB=B.d.copy(); _ndB[_selB]=np.where(B.d[_selB]>0,np.minimum(B.d[_selB],_dcw[_selB]),_dcw[_selB])
print('B rows from the walkway at the poles: moved',int((_ndB<B.d-0.3).sum()*G.res**2),'m2')
_nrB=B.nrows; B.set_depth(_ndB); B.nrows=max(B.nrows,_nrB)
B.band=np.where(B.R>0,np.clip(np.floor(B.d/B.D).astype(int),0,B.nrows-1),-1)
# the treads' tops, for the edges between the 1st floor's stands
TOP1=np.zeros(A.R.shape,np.float32)
for l in (A,B,F):
    on=l.band>=0; TOP1[on]=np.maximum(TOP1[on],np.asarray(l.h(l.band[on]),np.float32))
# the walkway between A and B
cross=(cv2.morphologyEx(((A.R>0)|(B.R>0)).astype(np.uint8),cv2.MORPH_CLOSE,disk(25))>0)&(A.R==0)&(B.R==0)&~field
cross&=dil(A.R,2.5)&dil(B.R,2.5)
# 1st-floor concourse: everything behind the 1st floor's stands, 9 m deep
stand1=(A.R|B.R|F.R|cross.astype(np.uint8))>0
c1=(dOut1>0)&(dOut<=9.0)&~stand1&~field
# balcony concourse behind the balcony
cb=(dOut>C0W+3.6)&(dOut<=E0+6)&(np.abs(TH)<=98.5)&(Cl.R==0)
# 2nd-floor concourse: the D/E walkway, the hall under E behind its first
# rows (and the tunnel mouths through them), and 6 m behind it all
Eback=E0+23*DP
c2=(dOut>=D0+8*DP)&(dOut<=Eback+6)&(np.abs(TH)<=106)&(D.R==0)&~((E.R>0)&(dOut<E0+4.0))
# the building's outer wall: the roof's plan, a superellipse set corner-on
# to home plate (201 m corner to corner at its ring beam, the sides bulging
# out to 180.6 m apart across the diagonals), centred 33 m out from home,
# the wall 5-7 m out from the ring; the concourses end at it
BN=1.53
bldg=((np.abs(_Xg/100.5)**BN+np.abs((_Zg+33.0)/100.5)**BN)**(1/BN))<=1.07
c1&=bldg; cb&=bldg; c2&=bldg
outer=bldg&~field
c1|=(outer&~stand1&~field&(dOut1>0)&(dOut<=9.5))
# At the poles the infield's and the outfield's stands climb on up to the
# concourse behind them, as they do everywhere else: their rows carry on
# over the corner the blocks leave, no wall of concourse standing up between
# them and the walkway
_poles=(np.abs(TH)>=85)&(np.abs(TH)<=112)&c1&~field
_dist=[cv2.distanceTransform((l.R==0).astype(np.uint8),cv2.DIST_L2,5)*G.res for l in (B,F)]
_near=np.argmin(np.stack(_dist),axis=0)
for k,l in enumerate((B,F)):
    add=_poles&(_near==k)&(_dist[k]<=12.0)&(l.d>0)
    l.R[add]=1
    l.band=np.where(l.R>0,np.clip(np.floor(l.d/l.D).astype(int),0,l.nrows-1),-1)
    c1&=~add
    print('pole climb',l.name,int(add.sum()*G.res**2),'m2')
# any well left through the 1st floor (a pocket no stand, concourse or
# field covers, stand round it: where the blocks' outlines and the
# concourse's line leave a gap) is tread of the stand nearest it
_L1=(A,B,F)
_cov=np.zeros(A.R.shape,bool)
for l in _L1+(Gx,): _cov|=l.R>0
_cov|=c1|cross|field
_n,_lab,_st,_=cv2.connectedComponentsWithStats((~_cov).astype(np.uint8),connectivity=4)
_wells=np.zeros_like(_cov)
for i in range(1,_n):
    x_,y_,w_,h_,a_=_st[i]
    if a_*G.res**2<120 and x_>1 and y_>1 and x_+w_<G.W-1 and y_+h_<G.H-1: _wells|=_lab==i
_wall=_wells.copy()
_dist=[cv2.distanceTransform((l.R==0).astype(np.uint8),cv2.DIST_L2,5) for l in _L1]
_near=np.argmin(np.stack(_dist),axis=0)
for k,l in enumerate(_L1):
    add=_wells&(_near==k)&(l.d>=0)
    l.R[add]=1
    l.band[add]=np.clip(np.floor(l.d[add]/l.D).astype(int),0,(len(l.hs) if l.hs is not None else l.nrows)-1)
    _wells&=~add
    TOP1[add]=np.asarray(l.h(l.band[add]),np.float32)
print('wells in the 1st floor filled',int((_wall&~_wells).sum()*G.res**2),'m2, left',int(_wells.sum()*G.res**2),'m2')
# where one stand's treads run on under another's seats (at the poles, the
# outlines traced loosely), each cell the stand whose seats are nearer
def _sd(P):
    m=np.ones(field.shape,np.uint8); gx_,gz_=G.g(P[:,0],P[:,1])
    m[np.clip(np.round(gz_).astype(int),0,G.H-1),np.clip(np.round(gx_).astype(int),0,G.W-1)]=0
    return cv2.distanceTransform(m,cv2.DIST_L2,5)*G.res
_L3=(A,B,F); _ds=np.stack([_sd(l.seats) for l in _L3]); _win=np.argmin(_ds,axis=0); _dmin=_ds.min(axis=0)
_any=np.zeros(field.shape,bool)
for l in _L3: _any|=l.R>0
_moved=0
for k,l in enumerate(_L3):
    take=_any&(_win==k)&((_dmin<1.0)|((np.abs(TH)>=80)&(np.abs(TH)<=120)&(_dmin<3.0)))&(l.R==0)&(l.d>=0)
    for j,o in enumerate(_L3):
        if j!=k: o.R[take]=0; o.band[take]=-1
    l.R[take]=1; l.band[take]=np.clip(np.floor(l.d[take]/l.D).astype(int),0,(len(l.hs) if l.hs is not None else l.nrows)-1)
    _moved+=int(take.sum())
print('treads under another stand\'s seats given to it',int(_moved*G.res**2),'m2')
# The corner at each pole (F20/F01, A01/A49, A02/B02 and their neighbours
# near the join): one stepped surface under all of them, so the heights run
# on from one block to the next with no wall or slot between: the height
# laid smoothly between the treads round it (the stands beyond, the
# concourse behind, the fronts along the fence kept as they are), then
# stepped in 0.333 m risers (the outfield's own). Each block keeps its own seats (the map's),
# set on those steps; the gaps between blocks stay seatless, stairs. The
# walkway behind row 26 kept back from the outfield (it had run in between).
_pz=(np.abs(TH)>=80)&(np.abs(TH)<=120)
_tr=(A.R>0)|(B.R>0)|(F.R>0)
_dToF=cv2.distanceTransform((F.R==0).astype(np.uint8),cv2.DIST_L2,5)*G.res
_dToAB=cv2.distanceTransform(((A.R==0)&(B.R==0)).astype(np.uint8),cv2.DIST_L2,5)*G.res
_crossIn=cross&_pz&(_dToF<=3.0)
_U=_pz&(_tr|_crossIn)&(_dToF<=12.0)&(_dToAB<=12.0)
cross&=~_U
def _hgt(l):
    h=np.full(field.shape,np.nan,np.float32); on=(l.band>=0)&(l.R>0)
    h[on]=np.asarray(l.h(l.band[on]),np.float32); return h
_known=np.full(field.shape,np.nan,np.float32)
for l in (A,B,F):
    hh=_hgt(l); _known=np.where(np.isnan(_known),hh,_known)
_known[cross]=H_A+R_A*25; _known[c1]=C1F
# The stair aisles either side of A01 (A49), set out first as lines: each
# the boundary the map draws between the blocks (A01|F20, A01|A02-B02),
# from the front of the stand up to the concourse; along it one straight
# flight, 1.2 m wide, every tread the same, every riser 0.333 m, from the
# front row's level up to the concourse's. The stand round it is laid to
# meet it (its line held at the flight's rise while the rest is laid).
def _boxline(p,qs):
    ip=BOXN.index(p); dp=cv2.distanceTransform((BOXL!=ip).astype(np.uint8),cv2.DIST_L2,5)*G.res
    mq=np.isin(BOXL,[BOXN.index(q) for q in qs if q in BOXN])
    dq=cv2.distanceTransform((~mq).astype(np.uint8),cv2.DIST_L2,5)*G.res
    ys,xs=np.nonzero((dp<=1.0)&(dq<=1.0)); P_=np.c_[G.m(xs,ys)]
    c=P_.mean(0); u=np.linalg.svd(P_-c)[2][0]
    return c,u
AISLES=[]; AW=1.2
_fixS=np.zeros(field.shape,bool); _rampS=np.zeros(field.shape,np.float32)
_dFld=cv2.distanceTransform((~field).astype(np.uint8),cv2.DIST_L2,5)*G.res
_trS=(A.R>0)|(B.R>0)|(F.R>0)|_U
def _at(m,p):
    gx_,gz_=G.g(p[:,0],p[:,1]); i_=np.clip(np.round(gz_).astype(int),0,G.H-1); j_=np.clip(np.round(gx_).astype(int),0,G.W-1)
    return m[i_,j_]
for p,qs in (('A01',('F20',)),('A01',('A02','B02')),('A49',('F01',)),('A49',('A48','B48'))):
    if p not in BOXN or not any(q in BOXN for q in qs): continue
    c,u=_boxline(p,qs)
    if _at(_dFld,np.array([c+u*8]))[0]<_at(_dFld,np.array([c-u*8]))[0]: u=-u      # away from the field
    ts=np.arange(-30,30,0.1); pts=c[None,:]+ts[:,None]*u[None,:]
    tr=_at(_trS,pts)&~_at(field,pts)
    if not tr.any(): continue
    k0=int(np.argmax(tr)); k1=k0
    while k1+1<len(ts) and (tr[k1+1] or (k1+6<len(ts) and tr[k1+2:k1+6].any())): k1+=1
    t0,t1=float(ts[k0]),float(ts[k1])
    h0=_at(np.nan_to_num(_known,nan=H_F),np.array([c+u*(t0+0.3)]))[0]
    h0=round(h0/0.333)*0.333; h1=C1F
    n=max(1,int(round((h1-h0)/0.333)))
    tt=(_Xg-c[0])*u[0]+(_Zg-c[1])*u[1]; pp=np.abs(-(_Xg-c[0])*u[1]+(_Zg-c[1])*u[0])
    strip=(pp<=AW/2)&(tt>=t0)&(tt<=t1)&~field
    _fixS|=strip; _rampS[strip]=(h0+(tt[strip]-t0)/(t1-t0)*(h1-h0)).astype(np.float32)
    AISLES.append(dict(c=c,u=u,t0=t0,t1=t1,y0=h0,y1=h1,n=n,strip=strip,tt=tt,pp=pp,name=p+'|'+'/'.join(qs)))
    print('stair aisle',p,qs,'from',(c+u*t0).round(1),'to',(c+u*t1).round(1),'length',round(t1-t0,1),'m',n,'risers of',round((h1-h0)/n,3),'treads',round((t1-t0)/n,2),'m')
_U|=_fixS&_trS
_fix=(_U&(cv2.dilate(field.astype(np.uint8),disk(1.2/G.res))>0))|_fixS     # the fronts along the fence as they are, and the aisles' lines
_live=_U&~_fix
_K0=_known.copy(); _K0[_fixS]=_rampS[_fixS]; _K0[_live]=np.nan
def _harmonic(V,fixed,live,iters):
    Wm=(fixed|live).astype(np.float32); ker=np.array([[0,1,0],[1,0,1],[0,1,0]],np.float32)
    den=np.maximum(cv2.filter2D(Wm,-1,ker,borderType=cv2.BORDER_CONSTANT),1e-6)
    for _it in range(iters):
        V=np.where(live,cv2.filter2D(V*Wm,-1,ker,borderType=cv2.BORDER_CONSTANT)/den,V)
    return V
_Hc=np.full(field.shape,np.nan,np.float32)
ys_,xs_=np.nonzero(_U)
for _side in (xs_>G.W//2, xs_<=G.W//2):
    if not _side.any(): continue
    y0_,y1_=max(0,ys_[_side].min()-40),min(G.H,ys_[_side].max()+40); x0_,x1_=max(0,xs_[_side].min()-40),min(G.W,xs_[_side].max()+40)
    live=_live[y0_:y1_,x0_:x1_]; Kc=_K0[y0_:y1_,x0_:x1_]; fixed=~np.isnan(Kc)
    V=np.where(fixed,Kc,np.where(live,np.nan_to_num(_known[y0_:y1_,x0_:x1_],nan=6.0),0)).astype(np.float32)
    sh=(V.shape[1]//4,V.shape[0]//4)
    Vc=cv2.resize(V,sh,interpolation=cv2.INTER_AREA)
    fc=cv2.resize(fixed.astype(np.uint8),sh,interpolation=cv2.INTER_NEAREST)>0
    lc=(cv2.resize(live.astype(np.uint8),sh,interpolation=cv2.INTER_NEAREST)>0)&~fc
    Vc=_harmonic(Vc,fc,lc,6000)
    V=np.where(live,cv2.resize(Vc,(V.shape[1],V.shape[0]),interpolation=cv2.INTER_LINEAR),V)
    V=_harmonic(V,fixed,live,2000)
    sub=_Hc[y0_:y1_,x0_:x1_]; m_=_U[y0_:y1_,x0_:x1_]; sub[m_]=V[m_]
KST=0.333
_seedK=[]
for l in (A,B,F):
    k_=sample(G,_U.astype(np.uint8),l.seats)>0
    _seedK.append(l.seats[k_])
    l.seats,l.row,l.yaw=l.seats[~k_],l.row[~k_],l.yaw[~k_]; l.seatmask=seat_mask(G,l.seats)
    if len(l.raw): l.raw=l.raw[sample(G,_U.astype(np.uint8),l.raw)==0]
    l.R[_U]=0; l.band[_U]=-1
_seedK=np.vstack(_seedK)
LV['K']=Level(G,'K',_seedK,0.74,0.0,KST,'ground',centre=O,rmax=180,hull_close=1.0)
Kl=LV['K']; Kl.R=_U.astype(np.uint8); Kl.hull=Kl.R.copy()
Kl.d=np.where(_U,np.nan_to_num(_Hc)/KST*0.74,-1.0).astype(np.float32); Kl.behind=_U
Kl.nrows=int(np.ceil(np.nanmax(_Hc[_U])/KST))+1
Kl.band=np.where(_U,np.clip(np.floor(Kl.d/0.74).astype(int),0,Kl.nrows-1),-1)
# the seats: block by block, each map box pulled in 0.55 m from its edges
# (the stair aisles between blocks, 1.1 m, seatless), along every step
# within it, 0.5 m apart, facing down the steps; none on a step too
# shallow for a seat, none outside the boxes (aisles, the standing area)
_gz,_gx=np.gradient(cv2.GaussianBlur(Kl.d,(0,0),6)/G.res)
_gn=np.maximum(np.hypot(_gx,_gz),1e-6); _depth=0.74/_gn
_bxe=np.zeros(field.shape,bool)
for i in np.unique(BOXL[_U]):
    if i==0: continue
    _bxe|=cv2.erode((BOXL==i).astype(np.uint8),disk(0.55/G.res))>0
from scipy.spatial import cKDTree as _KD
_S,_Rw,_Yw=[],[],[]
for r in range(Kl.nrows):
    line=_U&_bxe&(Kl.band==r)&(np.abs(Kl.d-(r+0.55)*0.74)<0.06)&(_depth>=0.55)
    ys_,xs_=np.nonzero(line)
    if not len(xs_): continue
    P_=np.c_[G.m(xs_,ys_)]; t_=_KD(P_); tk=np.zeros(len(P_),bool)
    for i in np.argsort(np.arctan2(P_[:,0]-O[0],P_[:,1]-O[1])):
        if tk[i]: continue
        _S.append(P_[i]); _Rw.append(r); _Yw.append(np.arctan2(-_gx[ys_[i],xs_[i]],-_gz[ys_[i],xs_[i]]))
        for j in t_.query_ball_point(P_[i],0.5*0.95): tk[j]=True
Kl.seats=np.array(_S).reshape(-1,2); Kl.row=np.array(_Rw,int); Kl.yaw=np.array(_Yw); Kl.raw=Kl.seats.copy()
Kl.seatmask=seat_mask(G,Kl.seats)
# a pocket left in the 1st floor's treads here with tread all round it
# (under 3 m2) is tread, of the stand most round it, level with it
_t1=(A.R>0)|(B.R>0)|(F.R>0)|(Kl.R>0)
# (scraps of the walkway the corner left, too small to be floor, first)
_n,_lab,_st,_=cv2.connectedComponentsWithStats(cross.astype(np.uint8),connectivity=4)
for k_ in range(1,_n):
    if _st[k_,4]*G.res**2<3.0: cross[_lab==k_]=False
_n,_lab,_st,_=cv2.connectedComponentsWithStats((~_t1&~field&~cross&~c1).astype(np.uint8),connectivity=4)
for k_ in range(1,_n):
    if _st[k_,4]*G.res**2<3.0:
        m_=_lab==k_
        if not (m_&(cv2.dilate(_U.astype(np.uint8),disk(3.0/G.res))>0)).any(): continue
        rg=(cv2.dilate(m_.astype(np.uint8),np.ones((3,3),np.uint8))>0)&~m_
        if _t1[rg].mean()<0.9: continue
        l=max((A,B,F,Kl),key=lambda l:int((l.R[rg]>0).sum()))
        b_=int(np.median(l.band[rg&(l.R>0)]))
        l.R[m_]=1; l.band[m_]=b_; l.d[m_]=(b_+0.5)*l.D
        TOP1[m_]=float(l.h(b_))
on_=Kl.band>=0; TOP1[on_]=np.asarray(Kl.h(Kl.band[on_]),np.float32)
print('pole corners one stepped surface',int(_U.sum()*G.res**2),'m2, seats',len(Kl.seats),'(map seats there',len(_seedK),')')
# the aisles out of the stands: no tread, no seat within them (a seat's back
# 0.25 m clear of the flight's edge); the flight's own treads there instead
for a_ in AISLES:
    st_=a_['strip']; run_=(a_['t1']-a_['t0'])/a_['n']
    for l in (A,B,F,Kl):
        l.R[st_]=0; l.band[st_]=-1
        if len(l.seats):
            sp=l.seats-a_['c'][None,:]; tt_=sp@a_['u']; pp_=np.abs(-sp[:,0]*a_['u'][1]+sp[:,1]*a_['u'][0])
            k_=~((pp_<AW/2+0.3)&(tt_>=a_['t0']-0.5)&(tt_<=a_['t1']+0.5))
            l.seats,l.row,l.yaw=l.seats[k_],l.row[k_],l.yaw[k_]; l.seatmask=seat_mask(G,l.seats)
    i_=np.clip(np.floor((a_['tt'][st_]-a_['t0'])/run_),0,a_['n']-1)
    TOP1[st_]=(a_['y0']+(i_+1)*(a_['y1']-a_['y0'])/a_['n']).astype(np.float32)
    cross&=~st_; c1&=~st_
    # the landing at its head, level with the concourse: 2.5 m on and a
    # little wider than the flight, with whatever pocket of open space it
    # leaves between the stand's top and the concourse (floor, not a hole)
    land=(a_['pp']<=AW/2+0.5)&(a_['tt']>a_['t1'])&(a_['tt']<=a_['t1']+2.5)&~field
    for l in (A,B,F,Kl): land&=~(l.R>0)
    _cv=(A.R>0)|(B.R>0)|(F.R>0)|(Kl.R>0)|cross|c1|field|land|st_
    _n,_lab,_st,_=cv2.connectedComponentsWithStats((~_cv).astype(np.uint8),connectivity=4)
    near_=cv2.dilate(land.astype(np.uint8),disk(0.3/G.res))>0
    for k_ in range(1,_n):
        if _st[k_,4]*G.res**2<25 and (near_&(_lab==k_)).any(): land|=_lab==k_
    c1|=land
    print('  landing at the head of',a_['name'],int(land.sum()*G.res**2),'m2')
# A box the model left bare (the map's B02/B48 had no seats traced): its
# level's rows laid across it, pulled in from its edges as above
for i in range(1,len(BOXN)):
    l={'A':A,'B':B,'F':F}[BOXN[i][0]]
    m_=(BOXL==i)&~_U&(l.R>0)
    if m_.sum()*G.res**2<20: continue
    have=int((sample(G,m_.astype(np.uint8),l.seats)>0).sum())
    if have>=0.3*m_.sum()*G.res**2/(0.5*0.75): continue
    me=(cv2.erode((BOXL==i).astype(np.uint8),disk(0.55/G.res))>0)&m_
    print('bare box',BOXN[i],'seated',relay_columns(l,me,back=0.0,near=99.0,replace=True))
# Behind home the map's B blocks are traced out of true (rows skipping,
# running askew): laid again in straight rows, block by block
print('B behind home re-laid',relay_columns(B,(B.R>0)&(_Zg>34)&(np.abs(_Xg)<22),back=1.6,fwd=1.6,replace=True,near=0.35))
print('masks',round(time.time()-T0,1))
# ── stairs ──
RISE,RUN,WID=0.19,0.28,1.6
def fits(mask,pts):
    gx_,gz_=G.g(pts[:,0],pts[:,1]); gx_=np.round(gx_).astype(int); gz_=np.round(gz_).astype(int)
    ok=(gx_>=0)&(gx_<G.W)&(gz_>=0)&(gz_<G.H)
    return ok.all() and mask[gz_,gx_].all()
def footprint(x0,z0,dx,dz,L,w,step=0.2):
    ts=np.arange(0,L+1e-6,step); ws=np.arange(-w/2,w/2+1e-6,step)
    T,Wd=np.meshgrid(ts,ws); return np.c_[(x0+dx*T-dz*Wd).ravel(),(z0+dz*T+dx*Wd).ravel()]
standany=(A.R|B.R|F.R|Cl.R|D.R|E.R)>0
used=np.zeros_like(standany)
# per level, per cell: the underside and top of what stands there
def level_z(l):
    r=np.maximum(l.band,0)
    top=np.asarray(l.h(r),float)
    if callable(l.bottom): bot=np.vectorize(lambda rr,hh: l.bottom(rr,hh))(r,top)
    elif l.bottom=='ground': bot=np.zeros_like(top)
    else: bot=top-np.where(r==0,l.fascia,l.bottom)
    return (l.band>=0),bot,top
ZL=[level_z(l) for l in LV.values()]
def clear(pts,y0,y1,L):
    gx_,gz_=G.g(pts[:,0],pts[:,1]); gx_=np.round(gx_).astype(int); gz_=np.round(gz_).astype(int)
    if not ((gx_>=0)&(gx_<G.W)&(gz_>=0)&(gz_<G.H)).all(): return False
    # the height of the flight over each point, from its distance along it
    for on,bot,top in ZL:
        o=on[gz_,gx_]
        if not o.any(): continue
        b=bot[gz_,gx_][o]; t=top[gz_,gx_][o]
        if ((b<y1+2.2)&(t>y0-0.2)).any(): return False
    return True
def mark(f):
    for fp in (footprint(f['x'],f['z'],f['dx'],f['dz'],f['L'],WID+1.2,0.1),footprint(f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L'],f['dx'],f['dz'],2.2,WID+1.2,0.1),footprint(f['x']-f['dx']*2,f['z']-f['dz']*2,f['dx'],f['dz'],2.2,WID+1.2,0.1)):
        gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
        used[gz_,gx_]=True
def find_flight(lower,upper,y0,y1,near):
    n=int(np.ceil((y1-y0)/RISE)); L=n*RUN
    dirs=[(np.cos(t),np.sin(t)) for t in np.linspace(0,2*np.pi,24,endpoint=False)]
    avoid=standany|used
    for r in np.arange(0,30,0.8):
        for a in np.linspace(0,2*np.pi,max(8,int(r*4)),endpoint=False):
            x0=near[0]+r*np.cos(a); z0=near[1]+r*np.sin(a)
            for dx,dz in dirs:
                fp=footprint(x0,z0,dx,dz,L,WID); top=footprint(x0+dx*L,z0+dz*L,dx,dz,1.8,WID)
                if fits(lower,fp) and fits(upper,top) and fits(~used,fp) and fits(~used,top) and clear(fp,y0,y1,L) and clear(top,y1,y1,1):
                    return dict(x=float(x0),z=float(z0),dx=float(dx),dz=float(dz),n=n,L=L,y0=y0,y1=y1)
def ringpt(theta,d):
    # a point at angle theta (about O) and outward distance d from the 1st floor
    m=(np.abs(TH-theta)<0.4)&(np.abs(dOut-d)<0.3)
    ys,xs=np.nonzero(m)
    if not len(xs): return None
    X,Z=G.m(xs.mean(),ys.mean()); return (float(X),float(Z))
flights=[]
for th in (-75,-20,20,75):
    for lo,up,y0,y1,dd in ((c1,cb,C1F,CBAL,3.0),(cb,c2,CBAL,C2F,E0+5.0)):
        p=ringpt(th,dd)
        f=find_flight(lo,up,y0,y1,p) if p else None
        print('flight',th,y0,y1,f and {k:round(v,1) for k,v in f.items()})
        if f: flights.append(f); mark(f)
for f in flights:
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L']-0.3,WID+0.4,step=0.05)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
    for c,y in ((c1,C1F),(cb,CBAL),(c2,C2F)):
        if f['y0']<y<=f['y1']+0.01: c[gz_,gx_]=False
def outside_fn(pairs):
    def f(ox,oy):
        for m,y in pairs:
            if m[oy,ox]: return y
        return None
    return f
grow=lambda c: cv2.dilate(c.astype(np.uint8),np.ones((3,3),np.uint8),iterations=3)>0
gu=lambda c,y: grow_under(c,y,list(LV.values()))
SUITE_TH=st.get('SUITE_TH',33.7)
suitem=(dOut>=C0W)&(dOut<=C0W+3.6)&(np.abs(TH)<SUITE_TH)&~field
slabs=[(gu(cross,H_A+R_A*25),0.0,H_A+R_A*25),(gu(c1,C1F),0.0,C1F),(gu(cb,CBAL),CBAL-0.35,CBAL),(gu(c2,C2F),C2F-0.35,C2F),(suitem,H_C-0.4-0.4,H_C-0.4)]
# ── the concourses closed in ──
t_=time.time()
# the 1st floor's doors: each entrance on the map, carried out along its
# ray to the concourse's wall (behind the open walkway, under the balcony)
_overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
_walk=c1&~_overhead&dil(A.R|B.R|F.R,6.0)
_inside=c1&~_walk
DOORS1=[]
for q in ENT1:
    u_=(q-np.array(O))/np.linalg.norm(q-np.array(O))
    last=None
    for t_ in np.arange(-6.0,32.0,0.1):
        pp=q+u_*t_; i_,j_=[int(round(float(c))) for c in G.g(pp[0],pp[1])]
        if 0<=i_<G.W and 0<=j_<G.H and c1[j_,i_]: last=pp
        if 0<=i_<G.W and 0<=j_<G.H and _inside[j_,i_]:
            DOORS1.append((float(pp[0]+u_[0]*0.3),float(pp[1]+u_[1]*0.3))); last=None; break
    else:
        # where the walkway runs on to the building's wall (behind the
        # outfield, the building's line close behind the stands) the door is
        # in that wall
        if last is not None: DOORS1.append((float(last[0]),float(last[1])))
        else:
            # (at the poles, where the stands now climb on over the corner,
            # the nearest of the concourse behind them)
            ys_,xs_=np.nonzero(c1)
            if len(xs_):
                CX,CZ=G.m(xs_,ys_); k_=int(np.argmin(np.hypot(CX-q[0],CZ-q[1])))
                if np.hypot(CX[k_]-q[0],CZ[k_]-q[1])<20: DOORS1.append((float(CX[k_]),float(CZ[k_])))
print('1st-floor doors placed',len(DOORS1),'of',len(ENT1))
rooms=[{'name':'1F','mask':c1,'y':C1F,'cl':4.0,'own':[A,B,F],'doors':DOORS1},
       {'name':'BAL','mask':cb,'y':CBAL,'cl':3.8,'own':[Cl],'doors':Cl.aisle_doors()},
       {'name':'2F','mask':c2,'y':C2F,'cl':4.0,'own':[D,E],'doors':D.aisle_doors()+E.aisle_doors()}]
rooms[2]['open']=E.pits
# the walkway along the back of the 1st floor, out from under the balcony:
# open to the dome, the concourse's wall (with its doors) behind it
overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
WALK=c1&~overhead&dil(A.R|B.R|F.R,6.0)
rooms[0]['walk']=WALK
trim_tunnels(G,VOMS['E'],c2)
encl,roomtop=enclose(G,rooms,list(LV.values()),slabs,flights)
print('enclose',round(time.time()-t_,1),{k:len(v) for k,v in encl.items()})
# no rail or wall where one stand of the 1st floor meets another near level
# (and none along the field's edge or the excite seats': the fence is the
# barrier there, the stands' fronts coming up to its top)
FENCEZ=cv2.dilate((field_out|EX|(Gx.R>0)).astype(np.uint8),disk(0.6/G.res))>0
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0 or (TOP1[oy,ox]>0 and abs(h-TOP1[oy,ox])<=0.6) or (WALK[oy,ox] and abs(h-C1F)<=0.6) or FENCEZ[oy,ox]
fronts={'C':('tread',0.8),'D':('tread',0.8)}
levels=[]
spec={'K':((c1,C1F),(cross,H_A+R_A*25)),'G':(),'A':((cross,H_A+R_A*25),),'B':((c1,C1F),),'F':((c1,C1F),),'P':((c1,C1F),),'C':((cb,CBAL),),'D':((c2,C2F),),'E':((c2,C2F),)}
flushmode={'K':'open','G':'open','A':'open','B':'doors','F':'doors','P':'doors','C':'doors','D':'open','E':'doors'}
voms={'E':C2F}
for name,l in LV.items():
    drs=DOORS1 if name in ('B','F','P') else l.aisle_doors()
    rails,walls=edge_walls(G,l,outside_fn(spec[name]),drs,flush=flushmode[name],skip=skip,front=fronts.get(name))
    if fronts.get(name): rails+=front_parapet(G,l,fronts[name])
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,**({'hs':[round(float(v),3) for v in l.hs]} if l.hs is not None else {}),'rows':l.rows_out(),'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),
                   'seats':l.seats_out(),'rails':rails,'walls':walls})
    print(name,'rows',len(levels[-1]['rows']),'steps',len(levels[-1]['steps']),'holes',len(levels[-1]['holes']),'rails',len(rails),'walls',len(walls))
# Behind the outfield there is no upper tier: the wall behind its top rows
# runs on up to the roof, over the concourse behind them
TH_O=np.degrees(np.arctan2(_Xg-O[0],_Zg-O[1]))
nearF=dil(F.R,1.5)
back=[]
for w in encl['walls']:
    if w[4]>C1F+3.0 or w[5]<C1F+3.5: continue
    mx,mz=(w[0]+w[2])/2,(w[1]+w[3])/2
    gx_,gz_=G.g(mx,mz); i_,j_=int(round(float(gz_))),int(round(float(gx_)))
    if not (0<=i_<G.H and 0<=j_<G.W) or not nearF[i_,j_] or abs(TH_O[i_,j_])<125: continue
    back.append([w[0],w[1],w[2],w[3],round(w[5]-0.05,2),60.0])   # up into the membrane
print('outfield back wall',len(back))
# the boxes behind home (S101-110, S301-310 and the VIP box): a glass front
# along the balcony's line, the rooms behind it
sm=(np.abs(dOut-(C0W+0.2))<0.06)&(np.abs(TH)<SUITE_TH-0.5)
ys_,xs_=np.nonzero(sm); SX,SZ=G.m(xs_,ys_); oo=np.argsort(TH[ys_,xs_])
suite_line=[[round(float(SX[i]),2),round(float(SZ[i]),2)] for i in oo[::15]]
floors=[{'y':y,'y0':y0,'polys':mask_polys(G,m)} for m,y0,y in slabs]
# the aisle stairs at the poles: each flight on a solid base up to its
# first tread (the stand is solid concrete under it), a handrail each side
aisle_flights=[]
for a_ in AISLES:
    c_,u_=a_['c'],a_['u']; nv=np.array([-u_[1],u_[0]])
    p0=c_+u_*a_['t0']; p1=c_+u_*a_['t1']
    rect=[p0+nv*AW/2,p1+nv*AW/2,p1-nv*AW/2,p0-nv*AW/2]
    floors.append({'y':round(float(a_['y0']),3),'y0':0.0,'polys':[[[[round(float(x),2),round(float(z),2)] for x,z in rect]]]})
    aisle_flights.append({'x':float(p0[0]),'z':float(p0[1]),'dx':float(u_[0]),'dz':float(u_[1]),'n':int(a_['n']),'L':float(a_['t1']-a_['t0']),
                          'y0':float(a_['y0']),'y1':float(a_['y1']),'w':AW,'open':True})
ow=contours(G,outer.astype(np.uint8),eps=0.03,minarea=100)
# the field's edge (the wall round it) eased along its length: straight
# runs straight, the curves even, no steps
from standlib import rings_px, _smooth_chain, _straighten
cs_,_=cv2.findContours(field_out.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c_=max(cs_,key=cv2.contourArea)[:,0,:].astype(np.float32)
c_=_smooth_chain(c_,30.0,8,35.0)
c_=_straighten(c_,True,int(round(6.0/G.res)),0.05/G.res)
c_=cv2.approxPolyDP(c_.reshape(-1,1,2),0.02/G.res,True)[:,0,:]
fw=[[np.c_[G.m(c_[:,0],c_[:,1])]]]
# the fence: round the field and the excite seats' strip together (it
# stands behind them, along the A blocks' front)
fence_in=field_out|(Gx.R>0)|EX
# (one sweep, no notches: the strip's jogs and the open floor's corners
# rounded off)
fence_in=cv2.morphologyEx(fence_in.astype(np.uint8),cv2.MORPH_CLOSE,disk(3.0/G.res))
fence_in=cv2.morphologyEx(fence_in,cv2.MORPH_OPEN,disk(1.5/G.res))
_kf=int(3.0/G.res)*2+1
fence_in=(cv2.GaussianBlur(fence_in.astype(np.float32),(_kf,_kf),0)>0.5).astype(np.uint8)
cs_,_=cv2.findContours(fence_in,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c_=max(cs_,key=cv2.contourArea)[:,0,:].astype(np.float32)
c_=_smooth_chain(c_,30.0,8,35.0)
c_=_straighten(c_,True,int(round(6.0/G.res)),0.05/G.res)
c_=cv2.approxPolyDP(c_.reshape(-1,1,2),0.02/G.res,True)[:,0,:]
fnw=[[np.c_[G.m(c_[:,0],c_[:,1])]]]
# the 2nd floor's front edge, for the lights along it
fy,fx=np.nonzero(D.F); FX,FZ=G.m(fx,fy); ang=np.arctan2(FX-O[0],FZ-O[1]); o=np.argsort(ang)
rim=[[round(float(FX[i]),1),round(float(FZ[i]),1)] for i in o[::40]]
# (the building's own outer wall stands behind the outfield, up to the
# membrane's edge: no separate wall of the outfield's own)
data={'suites':{'line':suite_line,'y':H_C-0.4,'h':3.6,'depth':3.4},'levels':levels,'floors':floors,'flights':flights+aisle_flights,'outer':[poly_out(p) for p in ow],'field':[poly_out(p) for p in fw],'fence':[poly_out(p) for p in fnw],'rim':rim,'rimY':H_D,'rooms':encl}
json.dump(data,open('td_stands.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('td_stands.json')//1024, round(time.time()-T0,1))

import standgen; pickle.dump({'doors':standgen.DOORLOG,'F':F.aisle_doors(),'B':B.aisle_doors(),'dbg':{k:tuple(np.packbits(a) for a in v) for k,v in standgen.DEBUG.items()},'FR':np.packbits(F.R>0)},open('td_dbg.pkl','wb'))
