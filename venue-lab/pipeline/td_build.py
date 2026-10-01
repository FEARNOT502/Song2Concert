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
LV['F']=Level(G,'F',st['SF'],0.74,H_F,R_F,'ground',centre=O,rmax=180,hull_close=2.0)
# The upper tiers' fronts are the lines their rings of seats were laid along
# (td_gen.py: the hull's distance, the balcony's and the 2nd floor's moved back
# beyond the poles), not the front a level finds for itself from its seats by
# looking along rays from the centre, which lay too far back where the ring ends
# (no tread under the last 2 degrees of the balcony's four rows) and ran the
# balcony's rows into one there (its row 0 had 42 seats to the others' 15)
import td_upper as U
def _front(field,val,mask): return ((np.abs(field-val)<G.res*0.75)&mask).astype(np.uint8)
LV['C']=Level(G,'C',st['SC'],0.9,H_C,R_C,0.5,1.2,centre=O,rmax=180,open_w=4.0,hull_close=4.0,max_rows=4,F=_front(dOut-U.tau_c(TH),C0W,(abs(TH)<=U.C_END)&(abs(TH)>=st['SUITE_TH'])))
LV['D']=Level(G,'D',st['SD'],0.8,H_D,R_D,0.5,1.5,centre=O,rmax=180,open_w=3.0,hull_close=3.0,max_rows=10,F=_front(dOut-U.tau_d(TH),D0,abs(TH)<=U.D_END))
LV['E']=Level(G,'E',st['SE'],0.8,H_E,R_E,0.5,0.6,centre=O,rmax=180,open_w=2.2,hull_close=3.0,F=_front(dOut,E0,abs(TH)<=84.2))
# the outfield stand's rows from the fence, level along it (4.6 m over the
# outfield's tall fence), each 0.333 m higher, up to the 1st-floor concourse
# at its 19th (the doors at the backs of its aisles open onto it)
_F=LV['F']
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
# circles, td_entrances.py): 48 round the back of the infield's 1st floor and
# 10 behind the outfield's, from the 1st-floor concourse (numbers 1-58); 14
# through the front rows of E, from the 2nd floor's (1-14). The map draws the
# 2nd floor out of scale, so there only their angles are taken.
import td_entrances
_f1,_f2=td_entrances.load(O)
ENT1=np.array([q for _,q in _f1]); ENT1N=[n for n,_ in _f1]
VOM2=[t for _,t in _f2]; VOM2N=[n for n,_ in _f2]
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
    # the sign over its mouth: the map's number for the entrance (the aisle number on a ticket)
    v['sign']=str(VOM2N[int(np.argmin([abs(th-t) for t in VOM2]))])
print('voms E',len(VOMS['E']),[(v['sign'],v['label']) for v in VOMS['E']])
def dil(m,r): return cv2.dilate(m.astype(np.uint8),disk(r/G.res))>0
# no seat stands over a vomitory's pit (td_gen.py leaves the notch at the same
# angle, this keeps the two from drifting apart)
_E=LV['E']; _pit=dil(_E.pits,0.25)
_gx,_gz=G.g(_E.seats[:,0],_E.seats[:,1])
_keep=~_pit[np.clip(np.round(_gz).astype(int),0,G.H-1),np.clip(np.round(_gx).astype(int),0,G.W-1)]
print('E seats over the vomitories dropped',int((~_keep).sum()))
_E.seats,_E.row,_E.yaw=_E.seats[_keep],_E.row[_keep],_E.yaw[_keep]
del _E,_pit,_gx,_gz,_keep
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
_gblocks=[]
for _w in _vec['words']:
    if not re.fullmatch(r'G\d\d',_w[4]) or _w[4] in ('G03','G04','G46','G47'): continue
    _m=np.zeros((_ink.shape[0]+2,_ink.shape[1]+2),np.uint8); _im=_ink.copy()
    _n=cv2.floodFill(_im,_m,(int((_w[0]+_w[2])/2*_K),int((_w[1]+_w[3])/2*_K)),128,flags=4)[0]
    if _n/_K**2/_s**2<120:
        _gm[_m[1:-1,1:-1]>0]=255
        # rows of the block: the "1-6" label beside its name (rows 1 to 6, as the A blocks' "15-40")
        _cx,_cy=(_w[0]+_w[2])/2,(_w[1]+_w[3])/2
        _lb=[w for w in _vec['words'] if re.fullmatch(r'1\W+\d',w[4]) and np.hypot((w[0]+w[2])/2-_cx,(w[1]+w[3])/2-_cy)<12]
        _gblocks.append((_w[4],(_m[1:-1,1:-1]>0),int(re.fullmatch(r'1\W+(\d)',min(_lb,key=lambda w:np.hypot((w[0]+w[2])/2-_cx,(w[1]+w[3])/2-_cy))[4]).group(1)) if _lb else 6))
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
# the blocks' outlines stay theirs (a half metre of tread before them the
# excite seats' own, not the block's)
_labc=json.load(open('td/td_labeled.json'))
_pmA=np.zeros(EX.shape,np.uint8); _pmB=np.zeros(EX.shape,np.uint8)
for _o in _labc:
    if _o['L'] not in 'ABF' or len(_o['nums'])>6: continue
    _a=np.array(_o['poly']); _a=np.c_[(_a[:,0]-_Hm[0])/_s,(_a[:,1]-_Hm[1])/_s]
    _gx,_gz=G.g(_a[:,0],_a[:,1]); cv2.fillPoly(_pmA if _o['L']=='A' else _pmB,[np.c_[_gx,_gz].round().astype(np.int32)],1)
EX&=~(dil(_pmA|_pmB,0.5))
EX=cv2.morphologyEx(EX.astype(np.uint8),cv2.MORPH_OPEN,disk(0.3/G.res))>0
field&=~EX
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
Fx=(EX&~cv2.erode(EX.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool))&~dil(_pmA,1.0)
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
# The excite seats as the map draws them: each block a strip with its rows
# (1-6, the label beside its name) counted along its long axis from the field's
# end, the rows square to that axis, a seat every 0.5 m across (as the A blocks')
_gs,_gr,_gy=[],[],[]
for _nm,_bm,_nr in _gblocks:
    _ys,_xs=np.nonzero(_bm)
    if len(_xs)<50: continue
    _pts=np.c_[_xs,_ys].astype(np.float32)
    _c,(_w1,_h1),_ang=cv2.minAreaRect(_pts); _box=cv2.boxPoints(((_c),(_w1,_h1),_ang))
    _e=[_box[(i+1)%4]-_box[i] for i in range(2)]; _long=_e[0] if np.hypot(*_e[0])>=np.hypot(*_e[1]) else _e[1]
    _u=_long/np.linalg.norm(_long)                       # px (map points x K): long axis
    _cm=(np.array(_c)/_K*_s*0+np.array(_c)/_K-_Hm)/_s      # centre in metres
    _um=_u.copy()
    _fc=np.array([O[0]+0.0,O[1]+0.0]) if False else np.array([0.0,0.0])   # (home plate: the field's end is the one nearer the field's middle)
    _mid=np.array([0.0,-60.0])
    if np.dot(_um,_mid-_cm)<0: _um=-_um                    # pointing toward the field
    _L=max(_w1,_h1)/_K/_s; _W=min(_w1,_h1)/_K/_s
    _vm=np.array([-_um[1],_um[0]])
    _nrow=max(1,_nr); _pitch=_L/_nrow
    for _r in range(_nrow):
        _p0=_cm-_um*(_L/2)+_um*0  # the strip's back end
        _pc=_cm+_um*(_L/2)-_um*(_r+0.5)*_pitch             # row 1 at the field end
        for _t in np.arange(-(_W/2-0.25),(_W/2-0.25)+1e-6,0.5):
            _gs.append(_pc+_vm*_t); _gr.append(_r); _gy.append(np.arctan2(_um[0],_um[1]))
_gs=np.array(_gs).reshape(-1,2); _gr=np.array(_gr,int); _gy=np.array(_gy)
print('excite blocks',len(_gblocks),'seats by block rows',len(_gs))
# the map draws the strip deeper than its six rows: the rows run on back to
# the A blocks' front, level past the sixth
Gx.hs=np.array([0.3+0.2*min(k,5) for k in range(Gx.nrows)])
print('excite seats',len(SG),'rows',Gx.nrows)
# the excite seats' treads fill their strip to the stand behind them
Gx.R[EX&(Gx.R==0)]=1
Gx.d[EX&(Gx.d<0.01)]=0.01          # (the floor out past the seats' front line too)
Gx.band=np.where(Gx.R>0,np.clip(np.floor(np.maximum(Gx.d,0)/Gx.D).astype(int),0,Gx.nrows-1),-1)
# (the seats' rows are the tread bands they stand on, so each stands on its own tread)
_ok=sample(G,EX.astype(np.uint8),_gs)>0
_gs,_gy=_gs[_ok],_gy[_ok]
_gx_,_gz_=G.g(_gs[:,0],_gs[:,1]); _bd=Gx.band[np.clip(np.round(_gz_).astype(int),0,G.H-1),np.clip(np.round(_gx_).astype(int),0,G.W-1)]
_ok=_bd>=0
Gx.seats,Gx.row,Gx.yaw=_gs[_ok],_bd[_ok],_gy[_ok]; Gx.raw=Gx.seats.copy(); Gx.seatmask=seat_mask(G,Gx.seats)
print('excite seats laid by block',len(Gx.seats))
field_out=field&~(cv2.dilate(((Gx.R>0)|EX).astype(np.uint8),disk(0.2/G.res))>0)
n_,lab_,st_,_=cv2.connectedComponentsWithStats(field_out.astype(np.uint8),connectivity=4)
field_out=lab_==(1+int(np.argmax(st_[1:,4])))
# ── the 1st floor's A and B stands, block by block as the map draws them
# (td_stand1.py): every block its own straight rows square to its own axis,
# its outline the map's, the aisle between two blocks the seam where one block's
# rows end and the next's begin, each block's back meeting the concourse; the
# walkway between A and B a strip of its own. Both sides (the 3B side is the 1B
# side's mirror image). The outfield's F blocks keep their rows from the fence,
# cut to their outlines. ──
import td_stand1 as T1
from shapely.ops import unary_union
import shapely
_A_ch,_B_ch,_F_ch=T1.chart_blocks(_labc,BOXL,BOXN,G)
_frames={b['blk']:(b['f'],b['sA']) for b in ra['blocks'] if b['poly'].mean(0)[0]>0 or b['blk']==25}
S1=T1.build(G,_A_ch,_B_ch,_F_ch,_frames,hull1>0,field|EX)
# The fingers' heights, fitted so that the stand is continuous across every aisle
# between blocks and into the outfield stand (td_stand1.fit_profiles_balanced): the
# section climbs from the infield's (A 0.17 m a row) to the outfield's (0.33 m) over
# the fingers before each pole, the change shared out evenly over the twelve aisles
# nearest it (a mean step of 0.1 m at each) instead of left to the poles' few short ones
_FhF=np.where(S1['zoneF'],np.minimum(C1F,H_F+_riseF*np.floor(_dFence/0.74)),np.nan).astype(np.float32)
_profs=T1.fit_profiles_balanced(G,S1,_FhF)
T1.apply_profiles(S1,_profs)
_st=T1.seam_steps(S1,T1.seam_pairs(G,S1,_FhF)); _cn=sum(v[0] for v in _st.values())
print('steps across the aisles: mean %.3f m, the largest %.2f m (between fingers); into the outfield stand: mean %.2f, largest %.2f m'%(
    sum(v[0]*v[1] for v in _st.values())/_cn,max(v[3] for k,v in _st.items() if -1 not in k),
    np.mean([v[1] for k,v in _st.items() if -1 in k]),max(v[3] for k,v in _st.items() if -1 in k)))
# The gates (td_stand1.gate_sites): the ten places where the map widens the aisle between two B blocks;
# each is a pit open to the walkway, a tunnel under the rows, then a stair cut up through the stand's back to the door of the
# aisle's entrance (the 1st-floor circle whose aisle it is: the nearest to where the stair comes out)
PILLAR_R=0.55
def _on_stand(p):
    i_,j_=[int(round(float(c))) for c in G.g(p[0],p[1])]
    return 0<=i_<G.W and 0<=j_<G.H and S1['band'][j_,i_]>=0
_sites=T1.gate_sites(_B_ch,S1['fingers'],_on_stand,[(q_[0],q_[1],PILLAR_R) for q_ in ENT1])
_gate_of={}
for _s in _sites:
    _w=_s['a']*_s['t_top']+_s['u']*_s['s_c']; _d=np.hypot(*(ENT1-_w).T); _i=int(np.argmin(_d))
    assert _d[_i]<12.0 and ENT1N[_i] not in _gate_of, ('gate without its entrance',_s['pair'],_d[_i])
    _gate_of[ENT1N[_i]]=_s
print('gates',len(_sites),{n_:'B%d|B%d%+d'%(s_['pair'][0],s_['pair'][1],s_['side']) for n_,s_ in sorted(_gate_of.items())})
_lv=T1.split_levels(S1)
_S1seats,_S1row,_S1yaw=T1.lay_seats(G,S1)
# no seat over a pit or a stair's cut
_gz=unary_union([s_['pit'] for s_ in _sites]+[s_['trench'] for s_ in _sites]).buffer(0.25)
_kg=~shapely.contains_xy(_gz,_S1seats[:,0],_S1seats[:,1])
print('seats over the gates dropped',int((~_kg).sum()))
_S1seats,_S1row,_S1yaw=_S1seats[_kg],_S1row[_kg],_S1yaw[_kg]
_S1kind=np.array([S1['meta'][i][1] for i in _S1row])
_dFE=(cv2.distanceTransform((~(field|EX)).astype(np.uint8),cv2.DIST_L2,5)*G.res).astype(np.float32)
def _shell(name,D,lv,kinds,rows_fn):
    """A level laid out by td_stand1: its own rows (ids `lv['ids']`), heights, tread and seats."""
    l=Level.__new__(Level)
    l.G=G; l.name=name; l.D=D; l.hs=lv['hs']; l.h0=float(lv['hs'].min()); l.rise=0.0
    l.bottom='ground'; l.fascia=2.6; l.centre=O
    l.band=lv['band']; l.R=(lv['band']>=0).astype(np.uint8); l.hull=l.R.copy(); l.nrows=len(lv['hs'])
    l.d=_dFE; l.behind=l.R>0
    k_=np.isin(_S1kind,list(kinds))
    l.seats=_S1seats[k_]; l.row=lv['remap'][_S1row[k_]]; l.yaw=_S1yaw[k_]; l.raw=l.seats.copy(); l.seatmask=seat_mask(G,l.seats)
    l.rows_out=rows_fn; l.aisles_out=lambda: []
    return l
A=_shell('A',0.74,_lv['A'],'A',lambda: T1.rows_out(G,S1,_lv['A']))
B=_shell('B',0.748,_lv['B'],'B',lambda: T1.rows_out(G,S1,_lv['B'],sites=_sites))
# the outfield: rows from the fence as before, on the cells of the F blocks' outlines
F=LV['F']
F.R=S1['zoneF'].astype(np.uint8)
F.band=np.where(F.R>0,np.clip(np.floor(F.d/F.D).astype(int),0,F.nrows-1),-1)
_kf=sample(G,F.R,F.seats)>0
F.seats,F.row,F.yaw=F.seats[_kf],F.row[_kf],F.yaw[_kf]
if len(F.raw): F.raw=F.raw[sample(G,F.R,F.raw)>0]
# the outfield's seats along its rows (each row at its distance from the fence,
# as its treads are), inside the map's F outlines
_Fm=np.zeros(F.R.shape,np.uint8)
for _p in _F_ch:
    _gx,_gz=G.g(*np.array(_p.exterior.coords).T); cv2.fillPoly(_Fm,[np.c_[_gx,_gz].round().astype(np.int32)],1)
_Fm=(cv2.erode(_Fm,disk(0.18/G.res))>0)&(F.R>0)
F.seats,F.row,F.yaw=T1.lay_curved(G,_Fm,_dFence,F.D,F.nrows,O)
F.raw=F.seats.copy()
F.seatmask=seat_mask(G,F.seats); F.hull=F.R.copy()
LV={'A':A,'B':B,'F':F,'C':LV['C'],'D':LV['D'],'E':LV['E'],'G':LV['G']}
# no two seats of a level within 0.3 m of each other (a stray double where two
# blocks' rows meet): the later one goes
_dup={}
for _n,_l in LV.items():
    if not len(_l.seats): continue
    _t=cKDTree(_l.seats); _drop=np.zeros(len(_l.seats),bool)
    for _i,_j in sorted(_t.query_pairs(0.3)):
        if not _drop[_i]: _drop[_j]=True
    if _drop.any(): _dup[_n]=int(_drop.sum()); _l.seats,_l.row,_l.yaw=_l.seats[~_drop],_l.row[~_drop],_l.yaw[~_drop]
print('seats on top of another, dropped:',_dup)
Cl,D,E=[LV[k] for k in 'CDE']
print('1st floor by blocks: A',len(A.seats),'seats',A.nrows,'rows; B',len(B.seats),'seats',B.nrows,'rows; F',len(F.seats),'seats',int(F.R.sum()*G.res**2),'m2')
# the treads' tops, for the edges between the 1st floor's stands
TOP1=np.zeros(A.R.shape,np.float32)
for l in (A,B,F):
    on=l.band>=0; TOP1[on]=np.maximum(TOP1[on],np.asarray(l.h(l.band[on]),np.float32))
# (no separate walkway floor: the walkway is a strip of each block's rows)
cross=np.zeros(A.R.shape,bool)
AISLES=[]
# 1st-floor concourse: everything behind the 1st floor's stands, 9 m deep
stand1=(A.R|B.R|F.R|cross.astype(np.uint8))>0
c1=(dOut1>0)&(dOut<=9.0)&~stand1&~field
# balcony concourse behind the balcony, out to the map's last balcony block
# (past the poles the balcony's front, and this, moves back over the outfield
# stand's rear: td_upper.py)
import td_upper as U
dOutC=dOut-U.tau_c(TH); dOutD=dOut-U.tau_d(TH)
cb=(dOutC>C0W+3.6)&(dOutC<=E0+6)&(np.abs(TH)<=U.C_END+2.0)&(Cl.R==0)
# 2nd-floor concourse: the D/E walkway, the hall under E behind its first
# rows (and the tunnel mouths through them), and 6 m behind it all
Eback=E0+23*DP
c2=(dOutD>=D0+8*DP)&(dOutD<=Eback+6)&(np.abs(TH)<=U.D_END+4.0)&(D.R==0)&~((E.R>0)&(dOutD<E0+4.0))
# the building's outer wall: the roof's plan, a superellipse set corner-on
# to home plate (201 m corner to corner at its ring beam, the sides bulging
# out to 180.6 m apart across the diagonals), centred 33 m out from home,
# the wall 5-7 m out from the ring; the concourses end at it
BN=1.53
bldg=((np.abs(_Xg/100.5)**BN+np.abs((_Zg+33.0)/100.5)**BN)**(1/BN))<=1.07
c1&=bldg; cb&=bldg; c2&=bldg
outer=bldg&~field
c1|=(outer&~stand1&~field&(dOut1>0)&(dOut<=9.5))
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
used|=dil(LV['E'].pits,2.5)      # the stairs keep off the vomitories' mouths (E25's was blocked by one)
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
    for r in np.arange(0,46,0.8):        # (behind home the only room is 40 m from where the 20 degree stairs would stand)
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
# the 1st floor's doors: each entrance on the map stands at the head of the
# aisle between two blocks; the door is where that aisle (its axis, out from
# the field) runs into the concourse's wall (behind the open walkway, under
# the balcony)
_overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
_walk=c1&~_overhead&dil(A.R|B.R|F.R,6.0)
_inside=c1&~_walk
AX1=T1.aisle_axes(S1,ENT1,_dFence,G)
DOORS1=[]; DOOR1=[]        # DOOR1: (entrance number, door, the axis out of the stand, the wall's point)
for n_,q,a_ in zip(ENT1N,ENT1,AX1):
    last=None; door=None; wall=None
    if n_ in _gate_of:
        # a gate's stair comes up through the wall along the gate's own axis, not the aisle's
        g_=_gate_of[n_]; a_=g_['a']; q=g_['a']*float(q@g_['a'])+g_['u']*g_['s_c']
    for k_ in range(-120,320):       # from 12 m in front of the circle (behind home, the wall is 7 m before it)
        pp=q+a_*(k_*0.1); i_,j_=[int(round(float(c))) for c in G.g(pp[0],pp[1])]
        if 0<=i_<G.W and 0<=j_<G.H and c1[j_,i_]: last=pp
        if 0<=i_<G.W and 0<=j_<G.H and _inside[j_,i_]:
            door=pp+a_*0.3; wall=pp; break
    else:
        # where the walkway runs on to the building's wall (behind the
        # outfield, the building's line close behind the stands) the door is
        # in that wall
        if last is not None: door=wall=last
        else:
            # (at the poles, where the stands now climb on over the corner,
            # the nearest of the concourse behind them)
            ys_,xs_=np.nonzero(c1)
            if len(xs_):
                CX,CZ=G.m(xs_,ys_); k_=int(np.argmin(np.hypot(CX-q[0],CZ-q[1])))
                if np.hypot(CX[k_]-q[0],CZ[k_]-q[1])<20: door=wall=np.array([CX[k_],CZ[k_]])
    if door is not None:
        DOORS1.append((float(door[0]),float(door[1]))); DOOR1.append((n_,door,a_,wall))
print('1st-floor doors placed',len(DOORS1),'of',len(ENT1),'; the furthest from its circle %.1f m'%max(np.hypot(*(d-ENT1[ENT1N.index(n)])) for n,d,_,_ in DOOR1))
rooms=[{'name':'1F','mask':c1,'y':C1F,'cl':4.0,'own':[A,B,F],'doors':DOORS1,'door_w':2.0},
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
# no rail or wall where one stand of the 1st floor meets another near level (within 0.9 m: the
# step between two blocks' rows at an aisle, up to 0.75 m round the poles, is a step, not a drop)
# (and none along the field's edge or the excite seats': the fence is the
# barrier there, the stands' fronts coming up to its top)
FENCEZ=cv2.dilate((field_out|EX|(Gx.R>0)).astype(np.uint8),disk(0.6/G.res))>0
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0 or (TOP1[oy,ox]>0 and abs(h-TOP1[oy,ox])<=0.9) or (WALK[oy,ox] and abs(h-C1F)<=0.6) or FENCEZ[oy,ox]
fronts={'C':('tread',0.8),'D':('tread',0.8)}
levels=[]
spec={'K':((c1,C1F),(cross,H_A+R_A*25)),'G':(),'A':((cross,H_A+R_A*25),),'B':((c1,C1F),),'F':((c1,C1F),),'P':((c1,C1F),),'C':((cb,CBAL),),'D':((c2,C2F),),'E':((c2,C2F),)}
flushmode={'K':'open','G':'open','A':'open','B':'doors','F':'doors','P':'doors','C':'doors','D':'open','E':'doors'}
voms={'E':C2F}
for name,l in LV.items():
    drs=DOORS1 if name in ('B','F','P') else l.aisle_doors()
    rails,walls=edge_walls(G,l,outside_fn(spec[name]),drs,flush=flushmode[name],skip=skip,front=fronts.get(name),**({'door_w':2.0} if drs is DOORS1 else {}))
    if fronts.get(name): rails+=front_parapet(G,l,fronts[name])
    if name=='B': rails=rails+[r_ for s_ in _sites for r_ in s_['rails']]
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
_trU=unary_union([s_['trench'] for s_ in _sites])
for _f in floors+encl['lit']:               # (the concourse's lit floor is a sheet of its own, 1 cm over the slab: the walker stands on it)
    if abs(_f['y']-C1F)<1e-6 and _f.get('y0',0.0)<0.01:
        _g=T1._geom_of(_f['polys'])
        if _g.intersects(_trU): _f['polys']=T1._polys_of(_g.difference(_trU))
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
# The 1st floor's circles are columns (the map marks each as a numbered circle at the head of an
# aisle; the building's photographs show a column there with the aisle's number on it, and the end of the aisle
# an open entrance): a round pillar at each, up to the ceiling where there is one, a plate with the number on
# either side of it (one to the stand, one to the concourse), the way between it and the nearest wall kept wide
# enough to walk through (0.8 m: the circles' centres stand 1.0-1.9 m out from the wall, a few at its corners).
PILLARS=[]; SIGNS=[]
_WS=np.array([w for w in encl['walls'] if abs(w[4]-C1F)<0.05],float).reshape(-1,6)      # the concourse's wall panels (the lintels over its openings are not in the way)
def _off_the_wall(q):
    """q moved away from the nearest wall panel until the way between it and the pillar is 0.8 m (a few passes: the corners)"""
    for _ in range(8):
        P0,P1=_WS[:,0:2],_WS[:,2:4]; D_=P1-P0; t_=np.clip(((q-P0)*D_).sum(1)/np.maximum((D_**2).sum(1),1e-9),0,1); C_=P0+D_*t_[:,None]
        dist=np.hypot(*(C_-q).T); k_=int(np.argmin(dist))
        if dist[k_]-PILLAR_R>=0.8: break
        v_=q-C_[k_]; v_=v_/(np.linalg.norm(v_)+1e-9); q=q+v_*(PILLAR_R+0.8-dist[k_]+0.02)
    return q
for n_,d_,a_,w_ in DOOR1:
    q_=_off_the_wall(ENT1[ENT1N.index(n_)].copy())
    i_,j_=[int(round(float(c))) for c in G.g(q_[0],q_[1])]
    y0=max(float(TOP1[j_,i_]),C1F if c1[j_,i_] else 0.0) or C1F
    rt=float(roomtop[j_,i_])
    y1=y0+(4.0 if np.isfinite(rt) and rt>y0+2.5 else 5.4)       # up to the concourse's ceiling (4 m over its floor), or 5.4 m where it is open to the dome
    PILLARS.append({'x':round(float(q_[0]),2),'z':round(float(q_[1]),2),'r':PILLAR_R,'y0':round(y0,2),'y1':round(y1,2)})
    yaw=float(np.arctan2(a_[0],a_[1]))
    for face in (0,np.pi):          # to the concourse (out of the stand), to the stand
        SIGNS.append({'x':round(float(q_[0]),2),'y':round(y0+2.2,2),'z':round(float(q_[1]),2),'yaw':round(yaw+face,3),'w':1.1,'r':PILLAR_R,'label':str(n_)})
print('pillars',len(PILLARS),'; the furthest one moved off its circle %.2f m'%max(np.hypot(*(np.array([p_['x'],p_['z']])-ENT1[ENT1N.index(n_)])) for p_,(n_,_,_,_) in zip(PILLARS,DOOR1)))
# (the building's own outer wall stands behind the outfield, up to the
# membrane's edge: no separate wall of the outfield's own)
data={'suites':{'line':suite_line,'y':H_C-0.4,'h':3.6,'depth':3.4},'levels':levels,'floors':floors,'flights':flights+aisle_flights,'outer':[poly_out(p) for p in ow],'field':[poly_out(p) for p in fw],'fence':[poly_out(p) for p in fnw],'rim':rim,'rimY':H_D,'rooms':encl,'signs':SIGNS,'pillars':PILLARS,'gateLamps':[{'x':l_[0],'y':l_[1],'z':l_[2],'yaw':l_[3]} for s_ in _sites for l_ in s_['lamps']]}
json.dump(data,open('td_stands.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('td_stands.json')//1024, round(time.time()-T0,1))

import standgen; pickle.dump({'doors':standgen.DOORLOG,'F':F.aisle_doors(),'B':B.aisle_doors(),'dbg':{k:tuple(np.packbits(a) for a in v) for k,v in standgen.DEBUG.items()},'FR':np.packbits(F.R>0)},open('td_dbg.pkl','wb'))
