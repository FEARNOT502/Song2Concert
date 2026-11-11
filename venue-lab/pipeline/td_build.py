import sys, re, json, time, pickle, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, STRAIGHT, sample, seat_mask
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, redepth, trim_tunnels, front_parapet, relay_columns
T0=time.time()
st=pickle.load(open('td_stage1.pkl','rb'))
# The 2nd floor's seats (D, E): td_gen.py lays them from the chart (td_lay2f.py), each with its block, row and number
import os
from scipy.spatial import cKDTree
SEATLAB={'D':(np.asarray(st['SD'],float),list(st['SD_lab'])),'E':(np.asarray(st['SE'],float),list(st['SE_lab']))}
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
# the outfield's rows: the chart's 21 (F01/F20 18) and a standing aisle behind them, 0.66 m a row from the fence (the map's
# outline is 14-15 m deep behind centre field, 11-12 m near the poles: 21 rows at 0.74 m do not go in anywhere)
F_D,F_ROWS=0.66,21
T1_DF=F_D
LV['F']=Level(G,'F',st['SF'],F_D,H_F,R_F,'ground',centre=O,rmax=180,hull_close=2.0)
# The upper tiers' fronts are the lines their rings of seats were laid along
# (td_gen.py: the hull's distance, the balcony's and the 2nd floor's moved back
# beyond the poles), not the front a level finds for itself from its seats by
# looking along rays from the centre, which lay too far back where the ring ends
# (no tread under the last 2 degrees of the balcony's four rows) and ran the
# balcony's rows into one there (its row 0 had 42 seats to the others' 15)
import td_upper as U
def _front(field,val,mask): return ((np.abs(field-val)<G.res*0.75)&mask).astype(np.uint8)
# Behind home, either side of the VIP box, the map's S blocks (S101-114, S301-314): the balcony's four rows carried on through them,
# 14 blocks a side with an aisle between each, in place of what was a closed run of boxes
VIP_TH=2.6; S_NB=14; S_AISLE=0.45
_dC=dOut-U.tau_c(TH)
_sw=(33.7-VIP_TH)/S_NB
# Each balcony block laid whole, four rows of the same seats (6 a row, 7 in the S blocks: as many as a block's width takes at 0.52 m), about the angle of its label on the
# map; no published count of these seats, so the map's blocks and rows set it
_v0=json.load(open('td/td_vec.json')); _Hm0=np.array([579.2,441.7]); _s0=2.996; _W0=_v0['words']
_cA={1:[],3:[]}
for _i,_w in enumerate(_W0):
    if _w[4]=='C' and _i+1<len(_W0) and _W0[_i+1][4].isdigit():
        _n=int(_W0[_i+1][4])
        if not (1<=_n<=48 or 51<=_n<=97): continue
        _p=(np.array([(_w[0]+_W0[_i+1][2])/2,(_w[1]+_W0[_i+1][3])/2])-_Hm0)/_s0-np.array(O)
        _cA[1 if _n<=48 else 3].append(float(U.c_squeeze(abs(np.degrees(np.arctan2(_p[0],_p[1]))))))
# (the 3B side's C50, the mirror of C48 by home, has no label on the map: the 3B side C50-C97 is the 1B side's
# C48-C01 mirrored, block k across from block 98 - k)
_cA[3].append(min(_cA[1])); _cA[3].sort()
_cCentres=[t_ for t_ in sorted(_cA[1])]+[-t_ for t_ in sorted(_cA[3])]
_sCentres=[sg_*(VIP_TH+(k_+0.5)*_sw) for sg_ in (1,-1) for k_ in range(S_NB)]
_rs=np.arange(20.0,200.0,0.04)
def _rowR(th_,val_):
    u_=np.radians(th_); xs_=O[0]+_rs*np.sin(u_); zs_=O[1]+_rs*np.cos(u_)
    gi_,gj_=G.g(xs_,zs_); ok_=(gi_>=0)&(gi_<G.W-1)&(gj_>=0)&(gj_<G.H-1)
    v_=_dC[np.round(gj_[ok_]).astype(int),np.round(gi_[ok_]).astype(int)]; r__=_rs[ok_]
    k_=int(np.argmax(v_>=val_)); return float(r__[k_])
_laid=[]
def _span(A_):
    A_=sorted(A_); out_=[]
    for i_,t_ in enumerate(A_):
        lo_=(A_[i_-1]+t_)/2 if i_>0 else t_-(A_[1]-t_)/2; hi_=(t_+A_[i_+1])/2 if i_<len(A_)-1 else t_+(t_-A_[i_-1])/2
        out_.append((t_,hi_-lo_))
    return out_
# Seats: the Premium Lounge (the C blocks, 1,520 seats) and the Suite Balcony (the S blocks behind home, 284) are
# 1,804 in all (Kotobuki 2022): four rows of four a C block (96 blocks: 1,536), rows of 3, 3, 2 and 2 an S block
# (28: 280), the outline taking fewer where it is narrow
C_ROW=(4,4,4,4); S_ROW=(3,3,2,2)
_cSp=[(t_,w_,6) for t_,w_ in _span(_cA[1])]+[(-t_,w_,6) for t_,w_ in _span(_cA[3])]+[(t_,_sw,7) for t_ in _sCentres]
_perB=[]
for th0_,wd_,mx_ in _cSp:
    r0_=_rowR(th0_,-9.0)
    # (as many seats as the map's block takes, 0.5 m each and 0.35 m to spare: 6 a row at most, 7 in the S blocks; the same seats closed up a little to the block as built)
    _kq=1.0 if mx_==7 else (U.C_END-33.7)/(U.C_MAP_END-33.7)
    _r00=_rowR((33.7+(abs(th0_)-33.7)/_kq)*np.sign(th0_),-9.0) if mx_==6 else r0_
    per_=int(min(mx_,max(2,np.floor((np.radians(wd_/_kq)*_r00-0.35)/0.5)))); _perB.append(per_)
    _pit=min(0.5,(np.radians(wd_)*r0_-0.14)/per_)
    for r_ in range(4):
        nr_=min(per_,(S_ROW if mx_==7 else C_ROW)[r_])
        for k_ in range(nr_):
            off_=(k_-(nr_-1)/2)*min(0.55,(np.radians(wd_)*r0_-0.14)/nr_)
            th_=th0_+np.degrees(off_/r0_); rr_=_rowR(th_,-9.0+0.9*(r_+0.5))
            _laid.append([O[0]+rr_*np.sin(np.radians(th_)),O[1]+rr_*np.cos(np.radians(th_))])
_Sseats=np.array(_laid)
print('balcony blocks',len(_cCentres),'C',len(_sCentres),'S; seats laid',len(_Sseats),'seats a row, counted',{v_:_perB.count(v_) for v_ in sorted(set(_perB))})
LV['C']=Level(G,'C',_Sseats,0.9,H_C,R_C,0.5,1.2,centre=O,rmax=180,open_w=4.0,hull_close=4.0,max_rows=4,F=_front(dOut-U.tau_c(TH),C0W,(abs(TH)<=U.C_END)&(abs(TH)>=VIP_TH)))
LV['D']=Level(G,'D',np.vstack([st['SD'],st['SD_ph']]),0.8,H_D,R_D,0.5,1.5,centre=O,rmax=180,open_w=3.0,hull_close=3.0,max_rows=10,F=_front(dOut-U.tau_d(TH),D0,abs(TH)<=U.D_END))
LV['E']=Level(G,'E',np.vstack([st['SE'],st['SE_ph']]),0.8,H_E,R_E,0.5,0.6,centre=O,rmax=180,open_w=2.2,hull_close=3.0,F=_front(dOut-U.tau_d(TH),E0,abs(TH)<=84.2))
# (the one-row end blocks' phantom second rows, laid only for their treads: taken away again, each seat nearer a
# phantom than any seat the chart has)
for _k in 'DE':
    _l=LV[_k]; _d1,_=cKDTree(st['S'+_k]).query(_l.seats); _d2,_=cKDTree(st['S'+_k+'_ph']).query(_l.seats); _kp=_d1<=_d2
    print(_k,'phantom seats taken away',int((~_kp).sum()),'of',len(st['S'+_k+'_ph']))
    _l.seats,_l.row,_l.yaw=_l.seats[_kp],_l.row[_kp],_l.yaw[_kp]
    # (their raw positions and footprint stay: the treads are drawn round those later)
# the outfield stand's rows from the fence, level along it (4.6 m over the
# outfield's tall fence), each 0.286 m higher, the standing aisle behind the 21st at the 1st-floor concourse's
# height (the doors at the backs of its aisles open onto it)
_F=LV['F']
_nF=F_ROWS+1
_riseF=(C1F-H_F)/(_nF-1)
_F.hs=np.array([min(C1F,H_F+_riseF*b) for b in range(_nF)]); _F.h0=H_F
# its rows counted from the fence (the distance from the field), so its
# front row is level all along it
_dFence=(cv2.distanceTransform((~field).astype(np.uint8),cv2.DIST_L2,5)*G.res).astype(np.float32)
_F.set_depth(_dFence); _F.nrows=_nF
_F.band=np.where(_F.R>0,np.clip(np.floor(_F.d/F_D).astype(int),0,_nF-1),-1)
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
_dOutD0=dOut-U.tau_d(TH)
# each on the aisle the chart leaves it (rows 11-14 stop three seats short of it on either side: td_lay2f.vom_aisles),
# along the aisle (square to the rows), as wide as that gap less a little landing either side, four rows deep
VOM_W=3.2
def _vom_cand(p_,n_):
    w_=np.array([-n_[1],n_[0]]); s_=(_Xg-p_[0])*w_[0]+(_Zg-p_[1])*w_[1]
    return (np.abs(s_)<VOM_W/2)&(_dOutD0>=E0-0.3)&(_dOutD0<E0+4*DP)&(np.hypot(_Xg-p_[0],_Zg-p_[1])<12)
VOMA=sorted(st['VOMA'],key=lambda q: q[3]); VOM2=[q[3] for q in VOMA]; VOM2N=[q[0] for q in VOMA]
VOMS={'E':LV['E'].make_voms(C2F,head=1.85,detect=False,cands=[_vom_cand(q[1],q[2]) for q in VOMA])}
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
_E=LV['E']; _pit=_E.pits.copy()    # (its own raster: it runs 0.4 m into the first row over the mouth, short of that row's seats)
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
# The chart (くるみっこ, td_rows_real.json): each block's rows, 1 at the field, and the seats in each, so the rows
# a block has, not the map's label (some of those read wrongly: G10's '1-6' is its neighbour's), set how far out it stands
_chartG={k:[v_['rows'][str(r_+1)][0][1]-v_['rows'][str(r_+1)][0][0]+1 for r_ in range(len(v_['rows']))] for k,v_ in json.load(open('td/td_rows_real.json')).items() if k[0]=='G'}
_gblocks=[(n_,m_,len(_chartG[n_])) for n_,m_,_ in _gblocks]
# the fence in front of them runs on from G05's corner to the line between
# A02 and A03 (map points; G03 and G04, drawn dotted, left unseated: the
# floor behind the fence open)
_open_ex=np.zeros_like(_gm)
_gm=cv2.dilate(_gm,np.ones((3,3),np.uint8))    # over the outlines' own ink
_px=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _py=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
EX=cv2.remap(_gm,_px,_py,cv2.INTER_NEAREST,borderValue=0)>0
EXopen=np.zeros_like(EX)
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
# The strip only as deep as its rows: the map draws it on out to the field past its seats' front. Each
# block is cut to its rows' depth from the stand behind it (a row 0.8 m, 0.45 m before the first), the
# field running on up to it; the open floor at the pole's end (G03-G04) stays as drawn
_dS=cv2.distanceTransform((~dil(_pmA|_pmB,0.5)).astype(np.uint8),cv2.DIST_L2,5)*G.res
_pxb=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _pyb=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
_inblk=np.zeros(EX.shape,bool); _keep=np.zeros(EX.shape,bool)
for _nm,_bm,_nr in _gblocks:
    _gmk=(cv2.remap(_bm.astype(np.uint8),_pxb,_pyb,cv2.INTER_NEAREST,borderValue=0)>0)&EX
    _inblk|=_gmk; _keep|=_gmk
del _pxb,_pyb
_EX0=EX.copy()
EX=_keep|(EX&EXopen)|(EX&~_inblk&(_dS<=1.0))
EX=cv2.morphologyEx(EX.astype(np.uint8),cv2.MORPH_OPEN,disk(0.3/G.res))>0
print('excite strip cut to its rows: %d m2 of %d'%(EX.sum()*G.res**2,_EX0.sum()*G.res**2))
GP_SEAT,GP_ROW=0.65,0.85            # a seat's width and a row's depth for the blocks the map only dots in (G03, G04): as its solid blocks measure
def _gframe(gm):
    ys_,xs_=np.nonzero(gm); P_=np.c_[G.m(xs_,ys_)]
    (cx_,cz_),_,ang_=cv2.minAreaRect(P_.astype(np.float32))
    t_=np.radians(ang_); e1=np.array([np.cos(t_),np.sin(t_)]); e2=np.array([-np.sin(t_),np.cos(t_)])
    c_=np.array([cx_,cz_]); tf=np.array([0.0,-60.0])-c_; tf=tf/np.linalg.norm(tf)
    al=e1 if abs(e1@tf)<abs(e2@tf) else e2
    nf=np.array([-al[1],al[0]])
    if tf@nf<0: nf=-nf
    sv=(P_-c_)@nf; la=(P_-c_)@al
    return c_,al,nf,float(sv.max()),float(la.min()),float(la.max()),float(sv.min())
# G03-G04 (G46-G47): the map draws them dotted, so no outline to take; laid on past G05 (G45) along its line, their backs on its back
_px_=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _py_=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
_gextra=[]; _gf={}; _gfp={}
for _base,_names in (('G05',('G04','G03')),('G45',('G46','G47'))):
    _bm5=next(b_ for n_,b_,_ in _gblocks if n_==_base)
    _gm5=(cv2.remap(_bm5.astype(np.uint8),_px_,_py_,cv2.INTER_NEAREST,borderValue=0)>0)&EX
    c5,al5,nf5,sv5,l0,l1,svb5=_gframe(_gm5); _gf[_base]=(c5,al5,nf5,sv5,l0,l1,svb5)
    pole=-al5 if (al5@(np.array([0.0,0.0])-c5))>0 else al5        # along the line, away from home
    edge5=l1 if pole@al5>0 else -l0                                # how far G05 reaches that way
    back5=svb5
    run=edge5+0.5
    for n_ in _names:
        W_=max(_chartG[n_])*GP_SEAT
        cc=c5+pole*(run+W_/2)
        sv1=back5+len(_chartG[n_])*GP_ROW
        rect=[cc+pole*sg*W_/2+nf5*z_ for sg,z_ in ((-1,back5),(1,back5),(1,sv1),(-1,sv1))]
        gx_,gz_=G.g(*np.array(rect).T); gm_=np.zeros(EX.shape,np.uint8); cv2.fillPoly(gm_,[np.c_[gx_,gz_].round().astype(np.int32)],1)
        gm_=(gm_>0)&~dil(_pmA|_pmB,0.3); EX|=gm_; _gextra.append((n_,gm_,len(_chartG[n_])))
        run+=W_+0.5
        print('  excite block laid on',n_,'centre',np.round(cc,1))
del _px_,_py_
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
# (its treads the same rows as its seats: counted back from the fence in front, as the seats are)
# The excite seats as they stand: each block (G05-G15, G35-G45) a little stand of its own, its rows
# straight and parallel to its field-side edge (the map's stepped line: each block set back or forward
# of its neighbour), a row every 0.8 m back from that edge and a seat every 0.5 m along it, facing the
# field, as many rows as the map's label gives the block (1-6), a tread up a row. G03-G04 at the pole
# (drawn dotted) are left open: the floor the tunnel under A02 comes out onto.
_pxb=((_Xg*_s+_Hm[0])*_K).astype(np.float32); _pyb=((_Zg*_s+_Hm[1])*_K).astype(np.float32)
EX_PITCH,EX_SEAT=0.85,0.65          # a row's depth and a seat's width (the map's blocks stand deeper than their rows: the front comes in, the backs stay on the stand)
G_WALLED=('G03','G04','G05','G06','G44','G45','G46','G47')   # a low wall behind these; the others run straight on down from the 1st floor's stand
G_BACK={}   # (no block is moved back into the 1st floor's stand any more: td_excite.py lays the excite seats on the field in front of it, and the stand keeps its own front rows)
G_RISE=0.42                       # (the front rows down near the field, under the low fence: the stand's own front is about 2.1 m up)
_gs,_gy=[],[]
_Gd=np.maximum(dX-0.05,0.01).astype(np.float32)
_gr,_gb=[],[]
for _nm,_bm,_nr,_grid in [(n_,m_,r_,False) for n_,m_,r_ in _gblocks]+[(n_,m_,r_,True) for n_,m_,r_ in _gextra]:
    _gmk=_bm if _grid else (cv2.remap(_bm.astype(np.uint8),_pxb,_pyb,cv2.INTER_NEAREST,borderValue=0)>0)&EX
    _ys,_xs=np.nonzero(_gmk)
    if len(_xs)<20: continue
    _P=np.c_[G.m(_xs,_ys)]
    _c,_al,_nf,_svm,_lo,_hi,_svb=_gframe(_gmk)
    # (the back row against the stand, the rest a row's depth each towards the field; the tread as wide as the seats)
    _dy0=min(G_RISE,(2.15-0.45)/max(1,len(_chartG[_nm])-1)); _pitch=EX_PITCH if _nm in G_WALLED else float(np.clip(_dy0/0.4,EX_PITCH,1.05))   # (a row's depth for the stand's slope, about 0.4, carried on down)
    _seatw=min(EX_SEAT,(_hi-_lo-0.2)/max(_chartG[_nm])) if max(_chartG[_nm])>1 else EX_SEAT; _gfp[_nm]=_pitch
    _svb0=_svb; _svb=_svb-G_BACK.get(_nm,0.0)
    _svm=_svb+len(_chartG[_nm])*_pitch+0.25
    _lc0=(_lo+_hi)/2; _hw=max(0.8,max(_chartG[_nm])*_seatw/2+0.12)
    _gfo=(_lo,_hi); _lo,_hi=_lc0-_hw,_lc0+_hw
    _gf[_nm]=(_c,_al,_nf,_svm,_lo,_hi,_svb)
    _Gd[_ys,_xs]=np.maximum((_svm-(_P-_c)@_nf)*(0.8/_pitch),0.01)
    _home=1.0 if _al@(np.array([0.0,0.0])-_c)>0 else -1.0          # along the block towards home: a short row (the field's end of it) starts from that side, as the chart draws them
    _lc=(_lo+_hi)/2; _mx=max(_chartG[_nm])
    for _r,_n in enumerate(_chartG[_nm]):
        _dc=(_r+0.5)*_pitch
        for _k in range(_n):
            _q=_lc+_home*((_mx-1)/2-_k)*_seatw
            _pt=_c+_al*_q+_nf*(_svm-_dc)
            _gs.append(_pt); _gy.append(np.arctan2(_nf[0],_nf[1])); _gr.append(_r); _gb.append(_nm)
            _i0,_j0=[int(round(float(v_))) for v_ in G.g(_pt[0],_pt[1])]
            if not _gmk[_j0,_i0] and _nm not in G_BACK:
                _st=np.zeros(EX.shape,np.uint8); cv2.circle(_st,(_i0,_j0),int(0.45/G.res),1,-1); _st=_st>0
                EX|=_st; Gx.R[_st]=1; _Gd[_st]=(_r+0.5)*0.8; Gx.d[_st]=(_r+0.5)*0.8
del _pxb,_pyb
# what the map drew in front of the rows goes back to the field: the strip now ends at the line along the blocks' fronts
def _frontChain(names):
    # along the blocks' fronts, pole to home, each block's front flat and a slant across the aisle to the next, the corners eased once
    P_=[]
    for n_ in names:
        if n_ not in _gf: continue
        c__,al__,nf__,sm__,lo__,hi__,sb__=_gf[n_]
        a__,b__=c__+al__*lo__+nf__*sm__,c__+al__*hi__+nf__*sm__; hd__=al__ if (al__@(-c__))>0 else -al__
        P_+=[a__,b__] if ((b__-a__)@hd__)>0 else [b__,a__]
    from scipy.ndimage import gaussian_filter1d as _gfc
    P_=np.array(P_); A_=(P_[-1]-P_[0])/np.linalg.norm(P_[-1]-P_[0]); N_=np.array([-A_[1],A_[0]])
    if N_@(np.array([0.0,-60.0])-P_.mean(0))<0: N_=-N_
    u_=(P_-P_[0])@A_; v_=(P_-P_[0])@N_; o_=np.argsort(u_); u_,v_=u_[o_],v_[o_]
    ug_=np.append(np.arange(0.0,u_[-1]-0.5,1.0),u_[-1]); vi_=np.interp(ug_,u_,v_)
    vs_=_gfc(vi_,6.0,mode='nearest')
    vf_=vs_+max(0.0,float(np.max(v_-np.interp(u_,ug_,vs_))))        # (out just far enough that no block's front comes past it)
    w_=np.minimum(1.0,np.minimum(ug_,ug_[-1]-ug_)/3.0); vf_=w_*vf_+(1.0-w_)*vi_
    return P_[0]+A_[None,:]*ug_[:,None]+N_[None,:]*vf_[:,None]
def _frontPoly(names):
    # (the front line, and the same line moved 14 m back towards the stand: one simple shape, whatever the blocks' own frames do)
    C_=_frontChain(names); A_=(C_[-1]-C_[0])/np.linalg.norm(C_[-1]-C_[0]); N_=np.array([-A_[1],A_[0]])
    if N_@(np.array([0.0,-60.0])-C_.mean(0))>0: N_=-N_
    return np.vstack([C_,(C_+N_*14.0)[::-1]])
_GN=(['G%02d'%k_ for k_ in range(3,16)],['G%02d'%k_ for k_ in range(47,34,-1)])
_hm=np.zeros(EX.shape,np.uint8)
for _ns in _GN:
    P_=_frontPoly(_ns); gx_,gz_=G.g(P_[:,0],P_[:,1]); cv2.fillPoly(_hm,[np.c_[gx_,gz_].round().astype(np.int32)],1)
_EXold=EX.copy(); EX&=(_hm>0); field|=_EXold&~EX; Gx.R[_EXold&~EX]=0
print('excite strip drawn in to the blocks fronts: %d m2 back to the field'%((_EXold&~EX).sum()*G.res**2))
_gs=np.array(_gs).reshape(-1,2); _gy=np.array(_gy)
Gx.d=np.where(EX,_Gd,Gx.d).astype(Gx.d.dtype)
Gx.band=np.where(Gx.R>0,np.clip(np.floor(np.maximum(Gx.d,0)/Gx.D).astype(int),0,Gx.nrows-1),-1)
_gx_,_gz_=G.g(_gs[:,0],_gs[:,1]); _bd=Gx.band[np.clip(np.round(_gz_).astype(int),0,G.H-1),np.clip(np.round(_gx_).astype(int),0,G.W-1)]
_ok=_bd>=0
_gr=np.array(_gr,int); _gb=np.array(_gb); _ok|=np.isin(_gb,list(G_BACK))
Gx.seats,Gx.row,Gx.yaw=_gs[_ok],_gr[_ok],_gy[_ok]; Gx.raw=Gx.seats.copy(); Gx.seatmask=seat_mask(G,Gx.seats); Gx.gblock=_gb[_ok]
print('excite seats against the chart',{k:(int((Gx.gblock==k).sum()),sum(_chartG[k])) for k in sorted(_chartG)})
print('excite seats laid block by block in straight rows',len(Gx.seats))
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
T1.DF=T1_DF
from shapely.ops import unary_union
import shapely
from shapely.geometry import Polygon
_A_ch,_B_ch,_F_ch=T1.chart_blocks(_labc,BOXL,BOXN,G)
_frames={b['blk']:(b['f'],b['sA']) for b in ra['blocks'] if b['poly'].mean(0)[0]>0 or b['blk']==25}
# the wedge at each pole (A01, A49) and the block beside it (A02, A48) turned towards home, 15 and 8
# degrees off the map's frame: their rows face the infield, as the real ones do, and meet the outfield
# stand's and their neighbours' with less of a step
T1.ROT.update({1:15.0,2:8.0})
# (A01's rows and the turned rows of F20 behind the outfield's diagonal run the way B02's kinked half does:
# A02's frame turned 8 + 20 degrees towards home; A01 turned as far as that takes it from its own frame)
def _turn(f_,deg_,c_):
    f_=np.asarray(f_,float); hd_=-np.asarray(c_,float)/np.linalg.norm(c_); t_=hd_-(hd_@f_)*f_; t_=t_/np.linalg.norm(t_); a_=np.radians(deg_)
    return f_*np.cos(a_)+t_*np.sin(a_)
_cA2=np.array(_A_ch[2].centroid.coords[0]); _fK=_turn(_frames[2][0],28.0,_cA2)        # (towards the field: the kinked rows' facing)
_f1=np.asarray(_frames[1][0],float)
T1.ROT.update({1:8.0,2:8.0,3:4.0})
# Round the pole the outfield's rows run on into the infield's first blocks: on the pole's side of one
# diagonal, from the pole side of A02's front (beside its tunnel) back to the far corner of B02, the rows of
# A01, A02 and B02 run parallel to the concourse wall and outfield rows behind them; on its other side each block's own
_f2=np.asarray(_frames[2][0],float); _u2=np.array([-_f2[1],_f2[0]]); _P1=np.array(_A_ch[1].exterior.coords); _P2=np.array(_A_ch[2].exterior.coords); _PB2=np.array(_B_ch[2].exterior.coords)
_sg2=np.sign((np.array(_A_ch[1].centroid.coords[0])-np.array(_A_ch[2].centroid.coords[0]))@_u2)      # (towards the pole)
_Q0=np.array([75.5,-66.0])
_Q1=_PB2[int(np.argmax(-(_PB2@_f2)-_sg2*(_PB2@_u2)))]                                               # (B02's back corner away from the pole)
_p1b=_P1[int(np.argmax(-(_P1@_f2)+_sg2*(_P1@_u2)))]                                                 # (A01's pole-side back corner)
_db=_Q1-_p1b; _frA=np.array([-_db[1],_db[0]],float); _frA=_frA/np.linalg.norm(_frA)
T1.KINKR.update({1:(tuple(_frA),tuple(_Q0),tuple(_Q1)),2:(tuple(_frA),tuple(_Q0),tuple(_Q1))})
print('the outfield\'s rows run on into A01, A02, B02 behind the line',np.round(_Q0,1),np.round(_Q1,1))
S1=T1.build(G,_A_ch,_B_ch,_F_ch,_frames,hull1>0,field|EX)
_FhF=np.where(S1['zoneF'],np.minimum(C1F,H_F+_riseF*np.floor(_dFence/F_D)),np.nan).astype(np.float32)
_Fcls=T1.outfield_classes(G,S1,_F_ch,k=4)
_dF2=_dFence.copy()
for _sg in (-1, 1):
    _m1=(_Fcls==1)&S1['zoneF']&(np.sign(_Xg)==_sg); _m2=(_Fcls==2)&S1['zoneF']&(np.sign(_Xg)==_sg)
    if not (_m1.any() and _m2.any()): continue
    _n1=-(_frA*np.array([_sg,1.0]))                                                    # straight row direction matching A01 / A49
    # anchor at the front of the F20|F19 (F01|F02) boundary so F19/F02 transitions across a diagonal
    _bd=_m1&(cv2.dilate(_m2.astype(np.uint8),np.ones((5,5),np.uint8))>0)
    _j=np.argmin(np.where(_bd,_dFence,1e9)); _p0=np.array([_Xg.flat[_j],_Zg.flat[_j]]); _d0=float(_dFence.flat[_j])
    _dr1=(_Xg[_m1]-_p0[0])*_n1[0]+(_Zg[_m1]-_p0[1])*_n1[1]+_d0
    _dr1=_dr1-float(_dr1.min())+0.05
    _dF2[_m1]=_dr1
    _dr2=(_Xg[_m2]-_p0[0])*_n1[0]+(_Zg[_m2]-_p0[1])*_n1[1]+_d0
    _dF2[_m2]=np.maximum(_dFence[_m2],_dr2)
print('outfield pole blocks: F20/F01 straight rows matching A01/A49, F19/F02 diagonal transition, max diff %.1f m'%float(np.nanmax(np.where(S1['zoneF'],np.abs(_dF2-_dFence),0))))
_FhF=np.where(S1['zoneF'],np.minimum(C1F,H_F+_riseF*np.floor(_dF2/F_D)),np.nan).astype(np.float32)
_profs,_Fcl=T1.fit_rake(G,S1,_FhF,Fcls=_Fcls,dF=_dF2,nF=_nF,land=(4,3.5),wF=3.0)
T1.apply_profiles(S1,_profs)
# no excite seat with its footprint on the stand's treads behind it (they stood in the A blocks'
# front rows, up to 1 m under them, where the strip runs in under the stand)
_kx=sample(G,dil(S1['zoneAB']|S1['zoneF'],0.25).astype(np.uint8),Gx.seats)==0
_kx|=np.isin(Gx.gblock,list(G_BACK))       # (those moved back stand on the flat treads, cut away for them later)
print('excite seats under the stand dropped',int((~_kx).sum()))
Gx.seats,Gx.row,Gx.yaw,Gx.gblock=Gx.seats[_kx],Gx.row[_kx],Gx.yaw[_kx],Gx.gblock[_kx]; Gx.raw=Gx.seats.copy(); Gx.seatmask=seat_mask(G,Gx.seats)
_FhF2=_FhF.copy(); _rowF=np.clip(np.floor(_dF2/F_D),0,_nF-1).astype(int)
for _j,_h in _Fcl.items(): _FhF2[_Fcls==_j]=_h[_rowF[_Fcls==_j]]
_st=T1.seam_steps(S1,T1.seam_pairs(G,S1,_FhF2)); _cn=sum(v[0] for v in _st.values())
print('steps across the aisles: mean %.3f m, the largest %.2f m (between fingers); into the outfield stand: mean %.2f, largest %.2f m'%(
    sum(v[0]*v[1] for v in _st.values())/_cn,max(v[3] for k,v in _st.items() if -1 not in k),
    np.mean([v[1] for k,v in _st.items() if -1 in k]),max(v[3] for k,v in _st.items() if -1 in k)))
# The gates (td_stand1.gate_sites): the ten places where the map widens the aisle between two B blocks;
# each is a pit open to the walkway, a short tunnel under the rows into a lower concourse dug under the back of the stand
# (td_stand1.gate_corridors, once the concourse is laid out), the door of the gate's aisle at the stand's back on its axis
# (the 1st-floor circle whose aisle it is: the nearest to where the stand ends)
PILLAR_R=0.55
PILLAR_RX,PILLAR_RZ=0.6,0.8      # half the column's width across its aisle and along it, as measured off photographs (seats 0.5 m wide): an estimate
OUT_VOM_W,OUT_HEAD=3.4,2.4       # the outfield's vomitories: width (two ways out, the column between them), head room
COL_TO_C=(1,2,5,6,43,44,46,47,48,49,57,58)     # by the poles: these go on up to the balcony's height (the photographs)
OUT_NO_VOM=(53,54)                # the two either side of centre: no vomitory, a column carrying the screen, further back
# The outfield stand has no vomitories through its rows (photographs: Commons "Tokyo Dome (April 11, 2015).jpg" and
# "Interior of Tokyo Dome 2019" full views: every aisle's steps run unbroken from the front row to the top, the ways
# out are doors at the top, on the walkway behind the last row, either side of a column standing at the aisle's head;
# the seat chart agrees: rows 1-14 run full across every block, only the rows behind them stop short of the aisles).
# So no pits, tunnels or side walls: the columns stand at the aisles' heads behind the last row, light grey-white,
# about 0.8 m square (measured off the 2019 photograph against the blocks' width), numbered or hung with banners
OUT_VOMS=False
OUT_COL=dict(rx=0.4,rz=0.4,color=0xe4e2dc)
OUT_HEADS={}
def _on_stand(p):
    i_,j_=[int(round(float(c))) for c in G.g(p[0],p[1])]
    return 0<=i_<G.W and 0<=j_<G.H and S1['band'][j_,i_]>=0
_sites=T1.gate_sites(_B_ch,S1['fingers'],_on_stand)
_gate_of={}
for _s in _sites:
    _w=_s['a']*_s['t_wall']+_s['u']*_s['s_c']; _d=np.hypot(*(ENT1-_w).T); _i=int(np.argmin(_d))
    assert _d[_i]<12.0 and ENT1N[_i] not in _gate_of, ('gate without its entrance',_s['pair'],_d[_i])
    _gate_of[ENT1N[_i]]=_s
print('gates',len(_sites),{n_:'B%d|B%d%+d'%(s_['pair'][0],s_['pair'][1],s_['side']) for n_,s_ in sorted(_gate_of.items())})
_lv=T1.split_levels(S1)
# the seats as the detailed chart numbers them (td/td_rows_real.json, a fan's transcription of the
# ticket seller's block charts): each row its own count, from its home-side end (td_stand1.lay_real)
import td_chart, td_boxes
REAL=td_chart.load()
# (the map draws its aisles between blocks some 1.7 m clear: the seats run on 0.25 m past its outlines, leaving 1.2 m)
_S1seats,_S1row,_S1yaw,_S1tab,_rep,_S1lab,_spare=T1.lay_real(G,S1,REAL,inset=-0.25,avoid=unary_union([s_['pit'] for s_ in _sites]).buffer(0.25+0.22))
_rc=sum(v[0] for v in _rep.values()); _rl=sum(min(v[0],v[1]) for v in _rep.values() if v[0])
print('1st floor seats by the chart: %d of the chart %d laid (%d more where it has no line: B22/B28 past row 40)'%(_rl,_rc,len(_S1seats)-_rl))
print('  blocks off by more than 3:',[(n_,v_[0],v_[1]) for n_,v_ in sorted(_rep.items()) if v_[0] and abs(v_[0]-v_[1])>3])
# the 3B side's rows past the chart behind B31-B39: the press seats and the 3rd Platinum Box (td_boxes.py)
_bxS,_bxR,_bxY,_bxL,BOXROWS=td_boxes.lay(_spare,REAL)
if len(_bxS):
    _S1seats=np.vstack([_S1seats,_bxS]); _S1row=np.r_[_S1row,_bxR]; _S1yaw=np.r_[_S1yaw,_bxY]; _S1tab=np.r_[_S1tab,np.zeros(len(_bxS),int)]; _S1lab=list(_S1lab)+list(_bxL)
# no seat over a pit (or, below, a stair's cut)
_gz=unary_union([s_['pit'] for s_ in _sites]).buffer(0.25)
_kg=~shapely.contains_xy(_gz,_S1seats[:,0],_S1seats[:,1])
print('seats over the gates dropped',int((~_kg).sum()),sorted(set(_S1lab[i_][0] for i_ in np.nonzero(~_kg)[0])))
_S1seats,_S1row,_S1yaw,_S1tab=_S1seats[_kg],_S1row[_kg],_S1yaw[_kg],_S1tab[_kg]; _S1lab=[q for q,k_ in zip(_S1lab,_kg) if k_]
SEATLAB['AB']=(_S1seats.copy(),list(_S1lab))
_tabs=[]
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
B=_shell('B',0.748,_lv['B'],'B',lambda: T1.rows_out(G,S1,_lv['B'],sites=_sites,corrs=_corrs))
# the outfield: rows from the fence as before, on the cells of the F blocks' outlines
F=LV['F']
F.R=S1['zoneF'].astype(np.uint8)
F.d=np.where(S1['zoneF'],_dF2,F.d).astype(F.d.dtype)
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
# (each block by the number the map prints in its outline: the map has F06's outline twice)
_Fnamed={}
for _o in _labc:
    if _o['L']!='F' or len(_o['nums'])>6: continue
    _kF=next((v_ for v_ in _o['nums'][:2] if 1<=v_<=20),None)
    if _kF is not None: _Fnamed.setdefault('F%02d'%_kF,T1._outline([T1._toR(_o['poly'])]))
import td_layF
F.seats,F.row,F.yaw,_Flab,_Frep=td_layF.lay(G,np.where(S1['zoneF'],_dF2,_dFence).astype(np.float32),(F.R>0),sorted(_Fnamed.items()),REAL,F_D,F_ROWS,O,inset=-0.25)
print('outfield seats by the chart:',sum(v_[1] for v_ in _Frep.values()),'of',sum(v_[0] for v_ in _Frep.values()),{k_:tuple(v_) for k_,v_ in sorted(_Frep.items()) if v_[0]!=v_[1]})
SEATLAB['F']=(F.seats.copy(),list(_Flab))
F.raw=F.seats.copy()
F.seatmask=seat_mask(G,F.seats); F.hull=F.R.copy()
# the outfield's pole blocks at their own heights: row ids per block class (class c's row r is
# c*nF + r, its heights after the others'), the treads and aisle steps made class by class
_Fc=np.where(F.R>0,_Fcls,0).astype(int)
_hsF=[F.hs]+[_Fcl[j_] for j_ in sorted(_Fcl)]
F._band0=F.band.copy(); F._d0=F.d.copy(); F.hs=np.concatenate(_hsF)
F.band=np.where(F._band0>=0,F._band0+_Fc*_nF,-1)
_gxs,_gzs=G.g(F.seats[:,0],F.seats[:,1])
F.row=F.row+_Fc[np.clip(np.round(_gzs).astype(int),0,G.H-1),np.clip(np.round(_gxs).astype(int),0,G.W-1)]*_nF
# the seats of the outfield's blocks at the poles turned towards home, block by block (the nearer the
# pole, the more: the seats face the infield, changing at each aisle), not square to the fence
_cF=_Fc[np.clip(np.round(_gzs).astype(int),0,G.H-1),np.clip(np.round(_gxs).astype(int),0,G.W-1)]
_wturn=np.array([0.0,0.0,0.0,0.2,0.1])[np.clip(_cF,0,4)]      # (the two at the pole: their rows themselves turned, above)
_dv=np.c_[np.sin(F.yaw),np.cos(F.yaw)]; _hv=-F.seats/np.maximum(np.hypot(*F.seats.T),1e-6)[:,None]
_nv=(1-_wturn)[:,None]*_dv+_wturn[:,None]*_hv; F.yaw=np.arctan2(_nv[:,0],_nv[:,1])
def _F_by_class(fn):
    out=[]
    for c_ in range(len(_hsF)):
        sv=(F.band,F.hs,F.d); m_=_Fc==c_
        F.band=np.where(m_,F._band0,-1); F.hs=_hsF[c_]; F.d=np.where(m_,F._d0,-1.0).astype(F._d0.dtype)
        try:
            for o_ in fn():
                if 'r' in o_: o_['r']=o_['r']+c_*_nF
                out.append(o_)
        finally: F.band,F.hs,F.d=sv
    return out
F.rows_out=lambda: _F_by_class(lambda: Level.rows_out(F))
F.aisles_out=lambda: _F_by_class(lambda: Level.aisles_out(F))
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
cb=(dOutC>C0W+3.6)&(dOutC<=E0+6)&(np.abs(TH)<=U.C_END+0.2)&(Cl.R==0)
# (where D runs out by the poles its rows end ragged short of the concourse's wall: each row carried on to it)
_Dz=(np.abs(_Xg)>84)&(_Zg>-62)&(_Zg<-38)
_Dg=dil(D.R>0,1.6)&~(D.R>0)&_Dz&(E.R==0)&~field
if _Dg.any():
    _dst,_lbl=cv2.distanceTransformWithLabels((~(D.R>0)).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    _ys,_xs=np.nonzero(D.R>0); _bv=np.zeros(_lbl.max()+1,int); _bv[_lbl[_ys,_xs]]=D.band[_ys,_xs]
    _yy,_xx=np.nonzero(_Dg); D.R[_yy,_xx]=1; D.band[_yy,_xx]=_bv[_lbl[_yy,_xx]]
    print('D rows carried on to the wall',int(_Dg.sum()*G.res**2),'m2')
# 2nd-floor concourse: the open D/E walkway in the bowl and the enclosed hall
# under E's upper rows (restricted to |TH|<=72.5 so no concourse box sticks out at the 1B/3B ends)
Eback=E0+23*DP
_walk2=(dOutD>=D0+8*DP)&(dOutD<=E0+0.8)&(np.abs(TH)<=84.2)&(D.R==0)&~((E.R>0)&(dOutD<E0+4.0))
_hall2=(dOutD>=E0+3.2)&(dOutD<=Eback+5.0)&(np.abs(TH)<=72.5)&(D.R==0)&~((E.R>0)&(dOutD<E0+4.0))
c2=_walk2|_hall2
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
def find_flight(lower,upper,y0,y1,near,any_dir=False):
    n=int(np.ceil((y1-y0)/RISE)); L=n*RUN
    avoid=standany|used
    for r in np.arange(0,46,0.8):        # (behind home the only room is 40 m from where the 20 degree stairs would stand)
        for a in np.linspace(0,2*np.pi,max(8,int(r*4)),endpoint=False):
            x0=near[0]+r*np.cos(a); z0=near[1]+r*np.sin(a)
            # each flight runs along the concourse (square to the way out from the field), never across it
            rl=max(np.hypot(x0-O[0],z0-O[1]),1.0); tx,tz=-(z0-O[1])/rl,(x0-O[0])/rl
            for dx,dz in ([(np.cos(q_),np.sin(q_)) for q_ in np.linspace(0,2*np.pi,24,endpoint=False)] if any_dir else [(sg*(tx*np.cos(q_)-tz*np.sin(q_)),sg*(tz*np.cos(q_)+tx*np.sin(q_))) for sg in (1,-1) for q_ in np.radians((0,5,-5,10,-10,15,-15))]):
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
def _mirror(f): return {**f,'x':-f['x'],'dx':-f['dx']}
def _fits_flight(f,lo,up):
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L'],WID); top=footprint(f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L'],f['dx'],f['dz'],1.8,WID)
    return fits(lo,fp) and fits(up,top) and fits(~used,fp) and fits(~used,top) and clear(fp,f['y0'],f['y1'],f['L']) and clear(top,f['y1'],f['y1'],1)
# along the concourse's outer side, a pair mirrored about the centre line wherever the plan lets them be
for th in (20,68):
    for lo,up,y0,y1,dd in ((c1,cb,C1F,CBAL,7.0),(cb,c2,CBAL,C2F,E0+5.0)):
        p=ringpt(th,dd)
        f=find_flight(lo,up,y0,y1,p) if p else None
        if p and not f:          # (no room to run along the concourse here: any way that fits, so the floors stay joined)
            f=find_flight(lo,up,y0,y1,p,any_dir=True); print('  (any direction)')
        if p and not f and y0==CBAL and th==68:
            # (the place the balcony's stair has always had, along the concourse at the pole end of the balcony)
            f=dict(x=95.9,z=-59.7,dx=0.0,dz=1.0,n=int(np.ceil((y1-y0)/RISE)),L=int(np.ceil((y1-y0)/RISE))*RUN,y0=y0,y1=y1); print('  (kept at the end of the balcony) fits',_fits_flight(f,lo,up))
        print('flight',th,y0,y1,f and {k:round(v,1) for k,v in f.items()})
        if not f: continue
        # (behind home one flight, on the centre line, if there it fits: not a pair crowding the middle)
        mx_=f['x']+f['dx']*f['L']/2
        if abs(mx_)<8:
            c_f={**f,'x':f['x']-mx_}
            if _fits_flight(c_f,lo,up): flights.append(c_f); mark(c_f); print('  centred',round(c_f['x'],2)); continue
        flights.append(f); mark(f)
        g=_mirror(f)
        if not _fits_flight(g,lo,up):
            q=ringpt(-th,dd); g=(find_flight(lo,up,y0,y1,q) or find_flight(lo,up,y0,y1,q,any_dir=True)) if q else None
            print('  (not mirrored) flight',-th,y0,y1,g and {k:round(v,1) for k,v in g.items()})
        if g: flights.append(g); mark(g)
for f in flights:
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L']-0.3,WID+0.4,step=0.05)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
    for c,y in ((c1,C1F),(cb,CBAL),(c2,C2F)):
        if f['y0']<y<=f['y1']+0.01: c[gz_,gx_]=False
# The lower concourses the gates lead into (td_stand1.gate_corridors): under the back of the stand and the
# concourse's edge, with a stair at each end up through the concourse's floor, clear of the pillars and the balcony's stairs
from shapely.geometry import LineString as _LS
_blocked=unary_union([_LS([(f['x'],f['z']),(f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L'])]).buffer(WID/2+0.6) for f in flights]) if flights else None
# The outfield's vomitories, off the same lower concourse as the infield's gates, run on round under the back of its stand:
# a pit let into the top of the aisle (as wide as two ways out and the column between), a tunnel on under the last rows
_axF=T1.aisle_axes(S1,ENT1,_dFence,G)
_hF=min(s_['h0'] for s_ in _sites)
for n_,q,a_ in zip(ENT1N,ENT1,_axF):
    if n_<49 or n_ in OUT_NO_VOM: continue
    a=np.array(a_,float); a=a/np.linalg.norm(a); u=np.array([-a[1],a[0]]); s_c=float(q@u)
    def _tF(t):
        i_,j_=[int(round(float(c))) for c in G.g(*(a*t+u*s_c))]
        return float(TOP1[j_,i_]) if 0<=j_<G.H and 0<=i_<G.W else 0.0
    t0=float(q@a); tw=None
    for t in np.arange(t0+12,t0-20,-0.05):
        if _tF(t)>0.5: tw=float(t)+0.05; break
    if tw is None: print('no outfield rows at entrance',n_); continue
    t1=None; te=None
    for t in np.arange(tw-0.4,tw-20,-0.05):
        if te is None and _tF(t)-T1.GATE_SLAB-_hF<OUT_HEAD+0.15: te=float(t)
        if _tF(t)<=_hF+0.02: t1=float(t); break
    OUT_HEADS[n_]=(a,u,s_c,tw)
    if not OUT_VOMS: continue
    if t1 is None or te is None: print('no pit at',n_); continue
    te=max(te,t1+1.0)
    W_=OUT_VOM_W; pit=T1._tbox(a,u,t1,te,s_c-W_/2,s_c+W_/2)
    def _ftop(p_):
        i_,j_=[int(round(float(c))) for c in G.g(float(p_[0]),float(p_[1]))]
        return float(TOP1[j_,i_])
    _sites.append(dict(pair=(49,50),side=1 if q[0]>0 else -1,kA=None,kB=None,a=a,u=u,s_c=s_c,t_front=t1,t_end=te,t_wall=tw,h0=_hF,h_back=_tF(tw-0.3),pit=pit,rec=pit,rails=T1._side_rails(pit,a,lambda p_:_hF,_ftop),tunnel=None,w=W_,head=OUT_HEAD,out=True,n=n_))
print('outfield vomitories',[(s_['n'],round(s_['t_end']-s_['t_front'],1),round(s_['t_wall']-s_['t_end'],1)) for s_ in _sites if s_.get('out')])
_corrs=T1.gate_corridors(G,_sites,(B.R>0)|(F.R>0),c1,O,[(q_[0],q_[1],PILLAR_R) for q_ in ENT1],_blocked,ring=(dOut,TH))
print('lower concourse tunnels: outfield',[(s_['n'],s_['tunnel'] is not None) for s_ in _sites if s_.get('out')])
_pF=unary_union([s_['pit'] for s_ in _sites if s_.get('out')]+[st_['trench'] for c_ in _corrs for st_ in c_['stairs']]).buffer(0.25)
_kv=~shapely.contains_xy(_pF,F.seats[:,0],F.seats[:,1]); print('outfield seats over the pits',int((~_kv).sum()))
_tF_=cKDTree(SEATLAB['F'][0]); _iF_=_tF_.query(F.seats[~_kv])[1]
import collections as _co; print('  by block and row',sorted(_co.Counter((SEATLAB['F'][1][i_][0],SEATLAB['F'][1][i_][1]) for i_ in _iF_).items()))
F.seats,F.row,F.yaw=F.seats[_kv],F.row[_kv],F.yaw[_kv]
if len(F.raw): F.raw=F.raw[~shapely.contains_xy(_pF,F.raw[:,0],F.raw[:,1])]
print('lower concourses',{c_['name']:'%.0f m2, %d gates, floor %.2f'%(c_['poly'].area,len(c_['gates']),c_['floor']) for c_ in _corrs})
_trZ=unary_union([st_['trench'] for c_ in _corrs for st_ in c_['stairs']]).buffer(0.25)
_kg2=~shapely.contains_xy(_trZ,B.seats[:,0],B.seats[:,1])
print('seats over the stairs\' cuts dropped',int((~_kg2).sum()))
B.seats,B.row,B.yaw=B.seats[_kg2],B.row[_kg2],B.yaw[_kg2]
if len(B.raw): B.raw=B.raw[~shapely.contains_xy(_trZ,B.raw[:,0],B.raw[:,1])]
def outside_fn(pairs):
    def f(ox,oy):
        for m,y in pairs:
            if m[oy,ox]: return y
        return None
    return f
grow=lambda c: cv2.dilate(c.astype(np.uint8),np.ones((3,3),np.uint8),iterations=3)>0
gu=lambda c,y: grow_under(c,y,list(LV.values()))
SUITE_TH=VIP_TH                  # (only the VIP box is a box now: the S blocks either side of it are open rows)
suitem=(dOut>=C0W)&(dOut<=C0W+3.6)&(np.abs(TH)<SUITE_TH)&~field
# The balcony's deck carried on past C97/C01 to the aisle column between 50 and 51 (no seats on it); the 2nd floor's on past D51/D01 to end over C97
TH_C_EXT=U.C_END
_tC=dOut-U.tau_c(TH); _tD=dOut-U.tau_d(TH)
_cExt=(np.abs(TH)>=U.C_END-0.5)&(np.abs(TH)<=TH_C_EXT)&(_tC>=C0W)&(_tC<=C0W+3.6)
TH_D_EXT=U.D_END                   # (over the vomitories of columns 50 and 57)
_dExt=(np.abs(TH)>=U.D_END-0.5)&(np.abs(TH)<=TH_D_EXT)&(_tC>=C0W-0.1)&(dOutC<=E0+6.3)
_cExtF=_cExt&(_tC<C0W+0.12); _dExtF=_dExt&(_tD<D0+0.12)
slabs=[(_cExt,14.7,15.4),(_dExt,18.1,19.15),(gu(cross,H_A+R_A*25),0.0,H_A+R_A*25),(gu(c1,C1F),0.0,C1F),(gu(cb,CBAL),CBAL-0.35,CBAL),(gu(c2,C2F),C2F-0.35,C2F),(suitem,H_C-0.4-0.4,H_C-0.4)]
# ── the concourses closed in ──
t_=time.time()
# the 1st floor's doors: each entrance on the map stands at the head of the
# aisle between two blocks; the door is where that aisle (its axis, out from
# the field) runs into the concourse's wall (behind the open walkway, under
# the balcony)
_overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
_walk=c1&~_overhead&dil(A.R|B.R,6.0)
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
# (the outfield's ten, numbers 49-58, are the width of two openings with the column in the middle of them, as the photographs show)
DOORSC=[]
for th_ in _cCentres+_sCentres:
    u_=np.array([np.sin(np.radians(th_)),np.cos(np.radians(th_))]); last_=None
    for r_ in np.arange(30.0,200.0,0.1):
        p_=np.array(O,float)+u_*r_; i_,j_=[int(round(float(c_))) for c_ in G.g(p_[0],p_[1])]
        if 0<=j_<G.H and 0<=i_<G.W and Cl.R[j_,i_]>0: last_=p_
    if last_ is not None: DOORSC.append((float(last_[0]),float(last_[1])))
print('balcony blocks with a door',len(DOORSC),'of',len(_cCentres)+len(_sCentres))
rooms=[{'name':'1F','mask':c1,'y':C1F,'cl':5.3,'own':[A,B,F],'doors':DOORS1,'door_w':2.0,'door_ws':[0.0 if n_>=49 else 2.0 for n_,_,_,_ in DOOR1],'open_stand':True,'wall_on':F.R>0},
       {'name':'BAL','mask':cb,'y':CBAL,'cl':3.8,'own':[Cl],'doors':DOORSC,'door_w':1.5},
       {'name':'2F','mask':c2,'y':C2F,'cl':4.0,'own':[D,E],'doors':[]}]
rooms[2]['open']=E.pits|_walk2
# the walkway along the back of the 1st floor, out from under the balcony:
# open to the dome, the concourse's wall (with its doors) behind it
overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
WALK=c1&~overhead&dil(A.R|B.R,6.0)
rooms[0]['walk']=WALK
trim_tunnels(G,VOMS['E'],c2)
encl,roomtop=enclose(G,rooms,list(LV.values()),slabs,flights)
# the lower concourses and the gates' tunnels, closed in the same way: walls, ceilings, lit floors, lamps
_cr=T1.corridor_rooms(_corrs,_sites)
for k_ in ('ceils','lit','lamps'): encl[k_]+=_cr[k_]
encl['thinWalls']+=_cr['walls']
print('enclose',round(time.time()-t_,1),{k:len(v) for k,v in encl.items()})
encl['thick']=0.5                           # the concourses' walls (estimate: an ordinary concrete wall; no published figure)
# no rail or wall where one stand of the 1st floor meets another near level (within 0.9 m: the
# step between two blocks' rows at an aisle, up to 0.75 m round the poles, is a step, not a drop)
# (and none along the field's edge or the excite seats': the fence is the
# barrier there, the stands' fronts coming up to its top)
FENCEZ=cv2.dilate((field_out|EX|(Gx.R>0)).astype(np.uint8),disk(0.6/G.res))>0
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0 or (TOP1[oy,ox]>0 and abs(h-TOP1[oy,ox])<=0.9) or (WALK[oy,ox] and abs(h-C1F)<=0.6) or FENCEZ[oy,ox]
fronts={'C':('tread',0.8),'D':('tread',0.8)}
levels=[]
spec={'K':((c1,C1F),(cross,H_A+R_A*25)),'G':(),'A':((cross,H_A+R_A*25),),'B':((c1,C1F),),'F':((c1,C1F),),'P':((c1,C1F),),'C':((cb,CBAL),),'D':((c2,C2F),),'E':((c2,C2F),)}
flushmode={'K':'open','G':'open','A':'open','B':'doors','F':'doors','P':'doors','C':'doors','D':'open','E':'closed'}
voms={'E':C2F}
for name,l in LV.items():
    drs=DOORS1 if name in ('B','F','P') else ([] if name in ('D','E') else DOORSC if name=='C' else l.aisle_doors())
    rails,walls=edge_walls(G,l,outside_fn(spec[name]),drs,flush=flushmode[name],skip=skip,front=fronts.get(name),**({'door_w':2.0,'open_stand':True} if drs is DOORS1 else {}))
    if fronts.get(name): rails+=front_parapet(G,l,fronts[name])
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,**({'hs':[round(float(v),3) for v in l.hs]} if l.hs is not None else {}),'rows':l.rows_out(),'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),
                   'seats':l.seats_out(scale=50),**({'gblocks':[str(b_) for b_ in Gx.gblock]} if name=='G' else {}),'seatScale':50,**({'boxRows':BOXROWS} if name=='B' else {}),'rails':rails,'walls':walls,
                   **({'gateRails':[r_ for s_ in _sites for r_ in s_['rails']]+[r_ for c_ in _corrs for st_ in c_['stairs'] for r_ in st_['rails']],'gateRailT':T1.RAIL_T} if name=='B' else {})})
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
    if not (0<=i_<G.H and 0<=j_<G.W) or not nearF[i_,j_] or abs(TH_O[i_,j_])<U.D_END-1.0: continue
    back.append([w[0],w[1],w[2],w[3],round(w[5]-0.05,2),60.0])   # up into the membrane
print('outfield back wall',len(back))
# the boxes behind home (S101-110, S301-310 and the VIP box): a glass front
# along the balcony's line, the rooms behind it
sm=(np.abs(dOut-(C0W+0.2))<0.06)&(np.abs(TH)<SUITE_TH-0.5)
ys_,xs_=np.nonzero(sm); SX,SZ=G.m(xs_,ys_); oo=np.argsort(TH[ys_,xs_])
suite_line=[[round(float(SX[i]),2),round(float(SZ[i]),2)] for i in oo[::15]]
floors=[{'y':y,'y0':y0,'polys':mask_polys(G,m)} for m,y0,y in slabs]
# the stairs' cuts through the concourse's floor, and the lower concourses dug out of its slab (a roof of their own over
# each, from their ceiling up to the floor)
_site_corr={i_:c_ for c_ in _corrs for i_ in c_['gates']}
_trU=unary_union([st_['trench'] for c_ in _corrs for st_ in c_['stairs']])
_tuns=[(s_['tunnel'],_site_corr[i_]['floor']+s_.get('head',T1.GATE_HEAD)+0.05) for i_,s_ in enumerate(_sites) if s_['tunnel'] is not None]
_hollow=unary_union([c_['poly'] for c_ in _corrs]+[t_ for t_,_ in _tuns]+[_trU])
_roofs=[]
for _f in floors+encl['lit']:               # (the concourse's lit floor is a sheet of its own, 1 cm over the slab: the walker stands on it)
    if abs(_f['y']-C1F)<1e-6 and _f.get('y0',0.0)<0.01:
        _g=T1._geom_of(_f['polys'])
        if any(_f is e_ for e_ in encl['lit']):
            if _g.intersects(_trU): _f['polys']=T1._polys_of(_g.difference(_trU))
        else:
            for c_ in _corrs:
                _ig=_g.intersection(c_['poly'])
                if not _ig.is_empty: _roofs.append({'y':C1F,'y0':round(c_['floor']+T1.CORR_HEAD+0.05,3),'polys':T1._polys_of(_ig)})
            for t_,y_ in _tuns:
                _ig=_g.intersection(t_)
                if not _ig.is_empty: _roofs.append({'y':C1F,'y0':round(y_,3),'polys':T1._polys_of(_ig)})
            if _g.intersects(_hollow): _f['polys']=T1._polys_of(_g.difference(_hollow))
floors+=_roofs
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
ow=contours(G,bldg.astype(np.uint8),eps=0.03,minarea=100)
# the field's edge (the wall round it) eased along its length: straight
# runs straight, the curves even, no steps
from standlib import rings_px, _smooth_chain, _straighten
cs_,_=cv2.findContours(field_out.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c_=max(cs_,key=cv2.contourArea)[:,0,:].astype(np.float32)
# (lightly: the low fence follows the excite seats' blocks, each with its own front, out and back along them)
c_=_smooth_chain(c_,10.0,3,35.0)
c_=_straighten(c_,True,int(round(2.5/G.res)),0.05/G.res)
c_=cv2.approxPolyDP(c_.reshape(-1,1,2),0.02/G.res,True)[:,0,:]
fw=[[np.c_[G.m(c_[:,0],c_[:,1])]]]
# the fence: round the field and the excite seats' strip together (it
# stands behind them, along the A blocks' front)
# (the two outlines made both ways: eased hard, so the run round the catcher is one clean curve; eased lightly along the excite seats)
_rA=_smooth_chain(cv2.findContours(field_out.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0][0][:,0,:].astype(np.float32) if False else max(cv2.findContours(field_out.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea)[:,0,:].astype(np.float32),30.0,8,35.0)
_rA=_straighten(_rA,True,int(round(6.0/G.res)),0.05/G.res)
_fwSoft=Polygon(np.c_[G.m(_rA[:,0],_rA[:,1])]).buffer(0)
fence_in=field_out|(Gx.R>0)|EX
_fence_raw=fence_in.copy()
# (one sweep, no notches: the strip's jogs and the open floor's corners
# rounded off)
# (lightly, so it follows the blocks and never comes in front of the field's edge)
fence_in=cv2.morphologyEx(fence_in.astype(np.uint8),cv2.MORPH_CLOSE,disk(1.0/G.res))
fence_in=cv2.morphologyEx(fence_in,cv2.MORPH_OPEN,disk(0.5/G.res))
_kf=int(1.0/G.res)*2+1
fence_in=((cv2.GaussianBlur(fence_in.astype(np.float32),(_kf,_kf),0)>0.5)|(field_out>0)).astype(np.uint8)
cs_,_=cv2.findContours(fence_in,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c_=max(cs_,key=cv2.contourArea)[:,0,:].astype(np.float32)
c_=_smooth_chain(c_,10.0,3,35.0)
c_=_straighten(c_,True,int(round(2.5/G.res)),0.05/G.res)
c_=cv2.approxPolyDP(c_.reshape(-1,1,2),0.02/G.res,True)[:,0,:]
fnw=[[np.c_[G.m(c_[:,0],c_[:,1])]]]
_rB=max(cv2.findContours((cv2.GaussianBlur(cv2.morphologyEx(_fence_raw.astype(np.uint8),cv2.MORPH_CLOSE,disk(3.0/G.res)).astype(np.float32),(int(3.0/G.res)*2+1,int(3.0/G.res)*2+1),0)>0.5).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea)[:,0,:].astype(np.float32)
_rB=_straighten(_smooth_chain(_rB,30.0,8,35.0),True,int(round(6.0/G.res)),0.05/G.res)
_fnSoft=Polygon(np.c_[G.m(_rB[:,0],_rB[:,1])]).buffer(0)
_zoneX=Polygon()
from shapely.geometry import MultiPoint
_exy,_exx=np.nonzero(cv2.resize(EX.astype(np.uint8),None,fx=0.2,fy=0.2,interpolation=cv2.INTER_NEAREST)>0); _exX,_exZ=G.m(_exx*5.0,_exy*5.0)
_zoneX=unary_union([MultiPoint(np.c_[_exX[_sd*_exX>0],_exZ[_sd*_exX>0]]).convex_hull.buffer(4.0) for _sd in (-1,1)])
def _blend(light,soft):
    # the light outline near the excite seats, the hard-eased one everywhere else
    g=unary_union([soft.difference(_zoneX),light.intersection(_zoneX)]).buffer(0.25).buffer(-0.25)
    g=max(g.geoms,key=lambda q_:q_.area) if hasattr(g,'geoms') else g
    return np.array(g.exterior.coords)[:-1]
fnw=[[_blend(Polygon(fnw[0][0]).buffer(0),_fnSoft)]]
_fwB=_blend(Polygon(fw[0][0]).buffer(0),_fwSoft)
# at each end of the excite seats the low fence leaves the last block's corner in one straight line to the 1st floor's fence
_fnP2=Polygon(fnw[0][0]).buffer(0)
from shapely.geometry import LineString as _LS2
_fwG=Polygon(_fwB).buffer(0)
# (as the photographs show it: one line along the fronts of the excite blocks, not in and out with each of them)
for _ns in _GN:
    C_=_frontChain(_ns); A_=(C_[-1]-C_[0])/np.linalg.norm(C_[-1]-C_[0]); N_=np.array([-A_[1],A_[0]])
    if N_@(np.array([0.0,-60.0])-C_.mean(0))<0: N_=-N_
    _fwG=_fwG.union(Polygon(np.vstack([C_,(C_+N_*3.5)[::-1]])).buffer(0)).difference(Polygon(_frontPoly(_ns)).buffer(0).buffer(0.02))
_fwG=max(_fwG.geoms,key=lambda q_:q_.area) if hasattr(_fwG,'geoms') else _fwG
_fEnds={}
for _nm_ in ('G15','G35','G03','G47'):
    if _nm_ not in _gf: continue
    _c_,_al_,_nf_,_sm_,_lo_,_hi_,_sb_=_gf[_nm_]
    _hd=_al_ if (_al_@(np.array([0.0,0.0])-_c_))>0 else -_al_
    _to=_hd if _nm_ in ('G15','G35') else -_hd
    _e=(_hi_ if (_to@_al_)>0 else _lo_)
    _corner=_c_+_al_*_e+_nf_*_sm_
    # home end: square back along the block's side to the stand. Outfield end: to the 1st floor's fence just short of the swing gate (the tunnel under A02)
    _sd_=1.0 if _corner[0]>0 else -1.0
    _aim=_corner-_nf_*(_sm_-_sb_+1.5) if _nm_ in ('G15','G35') else np.array([72.18*_sd_,-63.95])-_to*2.0
    _j=_fnP2.exterior.interpolate(_fnP2.exterior.project(shapely.Point(_aim)))
    _J=np.array([_j.x,_j.y])
    _d=(_J-_corner)/np.linalg.norm(_J-_corner); _n=np.array([-_d[1],_d[0]])
    if (_n@_to<0 if _nm_ in ('G15','G35') else _n@_nf_<0): _n=-_n       # (the field's side of the line: home's, at the home end, where the line runs straight back from the block)
    _zone=_LS2([_corner-_d*0.3,_J+_d*0.3]).buffer(7.0,cap_style=2)
    _hp=Polygon([_corner-_d*40,_J+_d*40,_J+_d*40+_n*60,_corner-_d*40+_n*60])
    _fwG=unary_union([_fwG.difference(_zone),_fwG.intersection(_zone).intersection(_hp).union(_zone.intersection(_hp).intersection(_fnP2))]).buffer(0.02).buffer(-0.02)
    _fwG=max(_fwG.geoms,key=lambda q_:q_.area) if hasattr(_fwG,'geoms') else _fwG
    print('fence end',_nm_,'straight run',round(float(np.linalg.norm(_J-_corner)),1),'m'); _fEnds[_nm_]=(_corner.copy(),_J.copy())
_fwB=np.array(_fwG.exterior.coords)[:-1]
fw=[[_fwB]]
# The fence in front of the excite seats as one clean line each side: from the stand beside G15 (G35), along the blocks' fronts, to the 1st floor's fence at the pole;
# s0: how far along it the fence starts to climb (the middle of G05 / G45, as the photographs show it)
_xFront=[]
for _nh,_np,_n5,_names in (('G15','G03','G05',['G%02d'%k_ for k_ in range(3,16)]),('G35','G47','G45',['G%02d'%k_ for k_ in range(35,48)])):
    ch,Jh=_fEnds[_nh]; cp,Jp=_fEnds[_np]
    _chn=_frontChain(_GN[0] if _nh=='G15' else _GN[1])[::-1]
    _pl=[Jh]+[p_ for p_ in _chn]+[Jp]
    _c5=_gf[_n5][0]+_gf[_n5][2]*_gf[_n5][3]+_gf[_n5][1]*(_gf[_n5][4]+_gf[_n5][5])/2
    _ln=_LS2(_pl); _s0=float(_ln.project(shapely.Point(*_c5)))
    _xFront.append({'pts':[[round(float(v_),2) for v_ in p_] for p_ in _pl],'s0':round(_s0,2)})
print('excite front lines',[(len(x_['pts']),x_['s0']) for x_ in _xFront])
# The way to the excite seats, from the 1st floor's stand: a gap in the fence behind them where the aisle between two A
# blocks comes down, at the joint between every other pair of excite blocks
_egates=[]
for _a,_b in ():      # (made below, with the aisles, once the stand's heights are known)
    if _a not in _gf or _b not in _gf: continue
    ca,ala,nfa,sva,loa,hia,svba=_gf[_a]; cb,_,nfb,svb,lob,hib,svbb=_gf[_b]
    ends_a=[ca+ala*loa,ca+ala*hia]; ends_b=[cb+ala*lob,cb+ala*hib]
    ea=min(ends_a,key=lambda q_:np.hypot(*(q_-cb))); eb=min(ends_b,key=lambda q_:np.hypot(*(q_-ca)))
    m_=(ea+eb)/2
    pp=m_+nfa*(svba+0.3-(m_-ca)@nfa)
    _egates.append({'p':[round(float(pp[0]),2),round(float(pp[1]),2)],'u':[round(float(-nfa[0]),4),round(float(-nfa[1]),4)],'w':1.4})
print('excite gates',len(_egates))
# the 2nd floor's front edge, for the lights along it
fy,fx=np.nonzero(D.F>0); FX,FZ=G.m(fx,fy); ang=np.arctan2(FX-O[0],FZ-O[1]); o=np.argsort(ang)
rim=[[round(float(FX[i]),1),round(float(FZ[i]),1)] for i in o[::40]]
_cfy,_cfx=np.nonzero((Cl.F>0)|_cExtF); _CFX,_CFZ=G.m(_cfx,_cfy); _ca=np.arctan2(_CFX-O[0],_CFZ-O[1]); _co=np.argsort(_ca)
rimC=[[round(float(_CFX[i]),1),round(float(_CFZ[i]),1)] for i in _co[::40]]
# (the two fronts as one smooth line each, for their metal facing: the radius by the angle, eased)
def _smoothRim(X_,Z_):
    from scipy.ndimage import gaussian_filter1d as _gf1
    t_=np.degrees(np.arctan2(X_-O[0],Z_-O[1])); r_=np.hypot(X_-O[0],Z_-O[1]); out_=[]
    for lo_,hi_ in ((-180.0,-VIP_TH+0.01),(VIP_TH-0.01,180.0)):
        m_=(t_>=lo_)&(t_<=hi_)
        if m_.sum()<50: continue
        b_=np.arange(t_[m_].min(),t_[m_].max()+0.25,0.25); ix_=np.clip(np.digitize(t_[m_],b_)-1,0,len(b_)-1)
        v_=np.array([np.median(r_[m_][ix_==k_]) if (ix_==k_).any() else np.nan for k_ in range(len(b_))])
        ok_=~np.isnan(v_); v_=np.interp(b_,b_[ok_],v_[ok_]); v_=_gf1(v_,4.0,mode='nearest')
        a_=np.radians(b_)
        out_.append([[round(float(O[0]+v_[k_]*np.sin(a_[k_])),2),round(float(O[1]+v_[k_]*np.cos(a_[k_])),2)] for k_ in range(0,len(b_),2)])
    return out_
rimS=_smoothRim(FX,FZ); rimCS=_smoothRim(_CFX,_CFZ)
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
def _overhead_at(i_,j_,y0):
    """the lowest underside of anything standing over the cell above y0 (a stand's rows, a concourse's slab); inf if nothing does"""
    v=np.inf
    for on,bot,top in ZL:
        if on[j_,i_] and bot[j_,i_]>y0+2.2: v=min(v,float(bot[j_,i_]))
    for m_,sy0,_sy1 in slabs:
        if m_[j_,i_] and sy0>y0+2.2: v=min(v,float(sy0))
    return v
for n_,d_,a_,w_ in DOOR1:
    # the outfield's stand in the middle of its opening; the infield's where the map's circle has it
    # (the outfield's: in the mouth of its opening, on the top row, as the photographs show)
    _vf=next((s_ for s_ in _sites if s_.get('out') and s_['n']==n_),None)
    # (an outfield column in the middle of its vomitory's mouth; the infield's where the map's circle has it)
    _oh=OUT_HEADS.get(n_) if not OUT_VOMS and n_ not in OUT_NO_VOM else None
    q_=_vf['a']*(_vf['t_front']+0.55*(_vf['t_end']-_vf['t_front']))+_vf['u']*_vf['s_c'] if _vf else np.array(w_,float)-np.array(a_,float)*1.5 if n_ in OUT_NO_VOM else (_oh[0]*(_oh[3]+0.45)+_oh[1]*_oh[2]) if _oh else _off_the_wall(ENT1[ENT1N.index(n_)].copy())
    i_,j_=[int(round(float(c))) for c in G.g(q_[0],q_[1])]
    y0=_vf['h0'] if _vf else float(TOP1[j_,i_]) if n_ in OUT_NO_VOM else C1F if _oh else max(float(TOP1[j_,i_]),C1F if c1[j_,i_] else 0.0) or C1F
    rt=float(roomtop[j_,i_])
    # up to what it carries: the underside of the tier over it, or nothing over it but the roof (99: dome.js ends it)
    ov=_overhead_at(i_,j_,y0)
    y1=ov if np.isfinite(ov) else 99.0
    PILLARS.append({'x':round(float(q_[0]),2),'z':round(float(q_[1]),2),'r':PILLAR_RZ,'rx':0.4 if _vf else PILLAR_RX,'rz':0.6 if _vf else PILLAR_RZ,'y0':round(y0,2),'y1':round(y1,2),'ax':round(float(a_[0]),3),'az':round(float(a_[1]),3)})
    if n_>=49 and not OUT_VOMS: PILLARS[-1].update(OUT_COL)      # (ax, az: the way out of the stand, for the lights of the entrance)
    if n_ in COL_TO_C and PILLARS[-1]['y1']<=16.6:
        PILLARS[-1]['y1']=round(min(_overhead_at(i_,j_,16.8),19.0),2); PILLARS[-1]['upC']=True
    yaw=float(np.arctan2(a_[0],a_[1]))
    for face in (0,np.pi):          # to the concourse (out of the stand), to the stand
        SIGNS.append({'x':round(float(q_[0]),2),'y':round(y0+2.2,2),'z':round(float(q_[1]),2),'yaw':round(yaw+face,3),'w':1.1,'r':PILLAR_RZ,'label':str(n_)})
# Every aisle between two outfield blocks has a column at its head; those with no vomitory get theirs here (the map's boxes, F01-F20)
_Fa=[]
for o_ in _labc:
    if o_['L']!='F' or len(o_['nums'])>6: continue
    a_p=(np.array(o_['poly'],float)-np.array([579.2,441.7]))/2.996; t_=np.degrees(np.arctan2(a_p[:,0],-a_p[:,1])); _Fa.append((float(t_.min()),float(t_.max())))
_Fa=sorted(_Fa); _bnd=[(_Fa[k_][1]+_Fa[k_+1][0])/2 for k_ in range(len(_Fa)-1)]
_entA=[float(np.degrees(np.arctan2(ENT1[ENT1N.index(n_)][0],-ENT1[ENT1N.index(n_)][1]))) for n_ in ENT1N if n_>=49]
_extra=0
for b_ in _bnd:
    if abs(b_)<10.5 or min(abs(b_-e_) for e_ in _entA)<2.5: continue
    u_=np.array([np.sin(np.radians(b_)),-np.cos(np.radians(b_))]); q_=None
    for r_ in np.arange(200.0,100.0,-0.1):
        i_,j_=[int(round(float(c))) for c in G.g(*(u_*r_))]
        if 0<=j_<G.H and 0<=i_<G.W and TOP1[j_,i_]>0.5: q_=u_*(r_-3.6 if OUT_VOMS else r_+0.45); break
    if q_ is None: continue
    i_,j_=[int(round(float(c))) for c in G.g(q_[0],q_[1])]
    y0=float(TOP1[j_,i_]); ov=_overhead_at(i_,j_,y0)
    # (its foot down at the lowest tread round it: it stands in the aisle, whose steps are lower than the rows either side)
    _r0=int(round(1.1/G.res)); _nb=TOP1[max(0,j_-_r0):j_+_r0+1,max(0,i_-_r0):i_+_r0+1]; _nb=_nb[_nb>0.5]
    y0=(float(_nb.min())-0.3 if _nb.size else y0) if OUT_VOMS else C1F
    if not OUT_VOMS: ov=_overhead_at(i_,j_,y0)
    PILLARS.append({'x':round(float(q_[0]),2),'z':round(float(q_[1]),2),'r':0.6,'rx':0.4,'rz':0.6,'y0':round(y0,2),'y1':round(ov if np.isfinite(ov) else (99.0 if abs(b_)<21.6 else y0+5.4),2),'ax':round(float(u_[0]),3),'az':round(float(u_[1]),3),'aisle':True}); _extra+=1
    if not OUT_VOMS: PILLARS[-1].update(OUT_COL)
    # (the one between 49 and 50, and its mirror image, on up to the 2nd floor's deck)
    if False and abs(abs(q_[0])-64.1)<1.2 and abs(q_[1]+94.9)<1.2:
        PILLARS[-1]['y1']=round(min(_overhead_at(i_,j_,16.8),19.0),2); PILLARS[-1]['upC']=True
print('outfield aisle columns added',_extra)
print('pillars',len(PILLARS),'; the furthest one moved off its circle %.2f m'%max(np.hypot(*(np.array([p_['x'],p_['z']])-ENT1[ENT1N.index(n_)])) for p_,(n_,_,_,_) in zip(PILLARS,DOOR1)))
# (the building's own outer wall stands behind the outfield, up to the
# membrane's edge: no separate wall of the outfield's own)
# The tunnel under A02 (the 1B side's 2nd block from the pole; A48 has none): its rows in front of the chart's
# first (row 14) are the roof of a passage from the open floor at the end of the excite seats (G03-G04)
# in under the stand, as at the real dome; its mouth just out from the block's front, its doors shut a
# few metres under the rows. The treads over it stand on its roof, those lower than its roof are cut.
from shapely.geometry import Polygon
_tunnels=[]; _feet=[]
for _k in (2,):
    _fg=S1['fingers'][_k]
    _PA=np.array(_fg.pa.exterior.coords)
    # align tunnel axis with the top (pole-side) edge of A02's chart polygon
    _f0=np.asarray(_frames[_k][0],float); _u=-_f0/np.linalg.norm(_f0); _vv=np.array([-_u[1],_u[0]])
    _fr_=_PA[(_PA@_u)<=(_PA@_u).min()+3.0]
    _s_pole=float((_fr_@_vv).min()); _s_home=float((_fr_@_vv).max())
    _w=float(np.clip(_s_home-_s_pole-0.1,3.5,4.2))
    _s_cen=_s_pole+_w/2
    _u_min=float((_PA@_u).min()); _u_max=float((_PA@_u).max())
    _p=_u*(_u_min-0.4)+_vv*_s_cen; _L=(_u_max-_u_min)+3.5
    # (its mouth in the padded wall round the field: where its axis crosses the fence's line)
    _end=_p+_u*_L; _fr=_LS(poly_out(fnw[0])[0]+[poly_out(fnw[0])[0][0]])
    _xi=_fr.intersection(_LS([_p-_u*20,_p+_u*20]))
    _pts=[np.array(q_.coords[0]) for q_ in getattr(_xi,'geoms',[_xi]) if not q_.is_empty]
    if _pts:
        _q=min(_pts,key=lambda q_: np.hypot(*(q_-_p))); _p=_q+_u*0.08; _L=float((_end-_p)@_u)
    # an open cut through its front rows (to `deck`, 2.8 m in), then on under the rows
    _dk=2.8
    _hy=lambda a_: float(_fg.height(_fg.coord((_p+_u*a_)[None,:])[0]))
    _dY=_hy(_dk); _h=round(min(_dY,_hy(0.3))-0.55,2)
    _sd=[[round(float(a_),2),round(_hy(max(a_,0.05))+0.02,2)] for a_ in np.linspace(0.2,_dk,8)]
    _tunnels.append({'p':[round(float(_p[0]),2),round(float(_p[1]),2)],'u':[round(float(_u[0]),4),round(float(_u[1]),4)],'w':round(_w,2),'h':_h,'L':round(_L,2),
                     'deck':_dk,'deckY':round(_dY,2),'sides':[_sd,_sd],'closed':True,'gate':True})
    _hw=_w/2+0.12
    _rect=lambda a0_,a1_: Polygon([_p+_u*a0_-_vv*_hw,_p+_u*a1_-_vv*_hw,_p+_u*a1_+_vv*_hw,_p+_u*a0_+_vv*_hw])
    _feet.append((_rect(-0.4,_dk),None))          # the cut: no tread
    _feet.append((_rect(_dk,_L),_h+0.12))         # under the rows: the treads on its roof
print('tunnel under A02 (width, length, roof, deck)',[(t_['w'],t_['L'],t_['h'],t_['deck']) for t_ in _tunnels])
# clip 1st-floor concrete row polygons against the smoothed fence lines so zero concrete protrudes outside any fence
_fw_arr=np.array(poly_out(fw[0])[0],float)
_i1h=int(np.argmin(np.hypot(_fw_arr[:,0]-31.2,_fw_arr[:,1]+9.3)))
_i1p=int(np.argmin(np.hypot(_fw_arr[:,0]-61.3,_fw_arr[:,1]+54.0)))
_i1a=int(np.argmin(np.hypot(_fw_arr[:,0]-33.1,_fw_arr[:,1]+2.2)))
_i1b=int(np.argmin(np.hypot(_fw_arr[:,0]-68.5,_fw_arr[:,1]+54.4)))
_i3b=int(np.argmin(np.hypot(_fw_arr[:,0]+70.1,_fw_arr[:,1]+57.6)))
_i3a=int(np.argmin(np.hypot(_fw_arr[:,0]+31.6,_fw_arr[:,1]+0.4)))
if False and _i1a<_i1h<_i1p<_i1b and _i3b<_i3a:
    _ex1=np.vstack([[[34.1,-3.7]],_fw_arr[_i1h:_i1p+1],[[68.5,-54.4]]])
    _ex3=_ex1[::-1]*np.array([-1.0,1.0])
    _fw_arr=np.vstack([_fw_arr[:_i3b+1],_ex3,_fw_arr[_i3a:_i1a+1],_ex1,_fw_arr[_i1b+1:]])
    fw=[[_fw_arr]]
_fnw_poly=Polygon(poly_out(fnw[0])[0]).buffer(-0.08)
_fw_poly=Polygon(poly_out(fw[0])[0]).buffer(-0.05)
_fnw_g=Polygon(poly_out(fnw[0])[0]).buffer(0.05)
_diag_pads=unary_union([Polygon([[sx*34.1,-3.7],[sx*36.0,-6.2],[sx*31.2,-9.3]]).buffer(0.05) for sx in (-1,1)]+
                       [Polygon([[sx*61.3,-54.0],[sx*67.0,-51.6],[sx*68.5,-54.4]]).buffer(0.05) for sx in (-1,1)]).difference(_fw_poly).intersection(_fnw_g)
for _lvd in levels:
    if _lvd['name'] in ('A','B','F'):
        for _row in _lvd['rows']:
            _g=T1._geom_of(_row['polys'])
            if _g.intersects(_fnw_poly):
                _g=_g.difference(_fnw_poly)
                _row['polys']=T1._polys_of(_g) if not _g.is_empty else []
        _lvd['rows']=[r_ for r_ in _lvd['rows'] if r_['polys']]
    elif _lvd['name']=='G':
        for _row in _lvd['rows']:
            _g=T1._geom_of(_row['polys'])
            if _row['r']==0: _g=unary_union([_g,_diag_pads])
            _g=_g.difference(_fw_poly).intersection(_fnw_g)
            _row['polys']=T1._polys_of(_g) if not _g.is_empty else []
        _lvd['rows']=[r_ for r_ in _lvd['rows'] if r_['polys']]
_open=unary_union([Polygon(q_[0],q_[1:]).buffer(0) for q_ in mask_polys(G,EXopen&~cv2.erode(EXopen.astype(np.uint8),np.ones((1,1),np.uint8)).astype(bool)|EXopen)])
for _lvd in levels:
    if _lvd['name']!='G': continue
    _new=[]
    for _row in _lvd['rows']:
        _g=T1._geom_of(_row['polys'])
        if _row['y']>0.31 and _g.intersects(_open):
            _in=_g.intersection(_open); _g=_g.difference(_open)
            if not _in.is_empty: _new.append({**_row,'y':0.3,'y0':0.0,'polys':T1._polys_of(_in)})
            _row['polys']=T1._polys_of(_g) if not _g.is_empty else []
    _lvd['rows']=[r_ for r_ in _lvd['rows'] if r_['polys']]+_new
for _lvd in levels:
    if _lvd['name'] not in ('A','B'): continue
    _new=[]
    for _row in _lvd['rows']:
        _g=T1._geom_of(_row['polys'])
        for _ft,_top in _feet:
            if not _g.intersects(_ft): continue
            _in=_g.intersection(_ft); _g=_g.difference(_ft)
            if _top is not None and _row['y']>_top+0.05 and not _in.is_empty:
                _new.append({**_row,'y0':round(_top,3),'polys':T1._polys_of(_in)})
        _row['polys']=T1._polys_of(_g) if not _g.is_empty else []
    _lvd['rows']=[r_ for r_ in _lvd['rows'] if r_['polys']]+_new
# (and no seat over the open cut: its rows are cut away)
import base64 as _b64
_cuts=unary_union([ft_.buffer(0.3) for ft_,top_ in _feet if top_ is None]) if _feet else None
if _cuts is not None:
    for _lvd in levels:
        if _lvd['name'] not in ('A','B'): continue
        _S=np.frombuffer(_b64.b64decode(_lvd['seats']),'<i2').reshape(-1,4); _sc=_lvd.get('seatScale',10)
        _kc=~shapely.contains_xy(_cuts,_S[:,0]/_sc,_S[:,1]/_sc)
        if (~_kc).any(): print('seats over the tunnel cut dropped',_lvd['name'],int((~_kc).sum())); _lvd['seats']=_b64.b64encode(_S[_kc].tobytes()).decode('ascii')
# The excite seats' concrete, block by block as the map draws it: a straight tread for each row, over one level slab
_lvG=next(l_ for l_ in levels if l_['name']=='G')
from shapely.strtree import STRtree as _STR
_Ar=[(T1._geom_of(r_['polys']),float(r_['y'])) for r_ in next(l_ for l_ in levels if l_['name']=='A')['rows']]
_Atree=_STR([g_ for g_,_ in _Ar])
_fnP0=Polygon(poly_out(fnw[0])[0]).buffer(0); _fiP0=Polygon(poly_out(fw[0])[0]).buffer(0)
def _standY(p,nf):
    """the 1st floor's tread just behind the fence's line, going back from p along -nf"""
    for t_ in np.arange(0.2,6.0,0.2):
        q_=shapely.Point(*(np.asarray(p,float)-nf*t_))
        if _fnP0.contains(q_): continue
        ys_=[_Ar[int(i_)][1] for i_ in _Atree.query(q_) if _Ar[int(i_)][0].contains(q_)]
        if ys_: return min(ys_)
    return None
_gr2=[]; _gY={}
# Every block's first row right behind the fence (0.35 m): a block with fewer rows than its neighbours moves forward, and the rows it has no seats for
# carry the same slope on back up to the stand
_xL=[_LS2(x_['pts']) for x_ in _xFront]
_gShift={}
for _nm in list(_chartG):
    if _nm not in _gf: continue
    _c,_al,_nf,_svm,_lo,_hi,_svb=_gf[_nm]; _best=np.inf
    for t_ in (_lo,(_lo+_hi)/2,_hi):
        o_=_c+_al*t_+_nf*_svm; ray_=_LS2([o_-_nf*0.2,o_+_nf*14.0])
        for l_ in _xL:
            ip_=ray_.intersection(l_)
            for q_ in getattr(ip_,'geoms',[ip_]):
                if not q_.is_empty and q_.geom_type=='Point': _best=min(_best,float((np.array([q_.x,q_.y])-o_)@_nf))
    _gShift[_nm]=0.0
    _gf[_nm]=(_c,_al,_nf,_svm+_gShift[_nm],_lo,_hi,_svb)
print('excite blocks moved up to the fence',{k_:round(v_,2) for k_,v_ in sorted(_gShift.items())})
for _nm,_rows_ in _chartG.items():
    if _nm not in _gf: continue
    _c,_al,_nf,_svm,_lo,_hi,_svb=_gf[_nm]; _pt_=_gfp.get(_nm,EX_PITCH); _N=len(_rows_)
    _M=_N
    if _nm in G_WALLED: _ys=[0.3+0.2*min(r_,_N-1) for r_ in range(_M)]
    else:
        _yt=[v_ for v_ in (_standY(_c+_al*t_+_nf*_svb,_nf) for t_ in (_lo,(_lo+_hi)/2,_hi)) if v_ is not None]
        _Y=float(np.median(_yt)) if _yt else 2.2
        _dy=min(G_RISE,(_Y-0.45)/max(1,_M-1)); _ys=[max(0.3,_Y-0.15-(_M-1-r_)*_dy) for r_ in range(_M)]
    _gY[_nm]=_ys
print('excite heights',{k_:(round(v_[0],2),round(v_[-1],2)) for k_,v_ in sorted(_gY.items())})
# The aisles: between every two blocks a flight from the floor in front of the seats up to the stand's aisle; behind G03-G06 (G44-G47) through a gap in the low wall
_gAis=[]; _egates=[]; _gOpen=[]; _gMid=[]
_fnE=_fnP0.exterior
for _names in (['G%02d'%k_ for k_ in range(3,16)],['G%02d'%k_ for k_ in range(47,34,-1)]):
    for _a,_b in zip(_names,_names[1:]):
        if _a not in _gf or _b not in _gf: continue
        ca,ala,nfa,sma,loa,hia,sba=_gf[_a]; cb,alb,nfb,smb,lob,hib,sbb=_gf[_b]
        ta,tb=min(((t1,t2) for t1 in (loa,hia) for t2 in (lob,hib)),key=lambda v_:np.hypot(*((ca+ala*v_[0]+nfa*sba)-(cb+alb*v_[1]+nfb*sbb))))
        _eb=(ca+ala*ta+nfa*sba,cb+alb*tb+nfb*sbb); _ef=(ca+ala*ta+nfa*sma,cb+alb*tb+nfb*smb)
        _gap=float(np.hypot(*(_eb[0]-_eb[1]))); nf_=(nfa+nfb)/np.linalg.norm(nfa+nfb)
        Ta=(_eb[0]+_eb[1])/2
        _ip=_LS2([Ta+nf_*3.0,Ta-nf_*12.0]).intersection(_fnE)
        _pts=[np.array(q_.coords[0]) for q_ in getattr(_ip,'geoms',[_ip]) if not q_.is_empty]
        T=min(_pts,key=lambda q_:np.hypot(*(q_-Ta))) if _pts else Ta
        w_=float(np.clip(_gap-0.15,0.9,1.3)); y1_=_standY(T,nf_) or 2.2; y0_=0.22
        L_=max(float(np.hypot(*(T-(_ef[0]+_ef[1])/2))),(y1_-y0_)/0.19*0.27)
        while L_>1.5 and _fiP0.buffer(0.6).contains(shapely.Point(*(T+nf_*L_))): L_-=0.1
        _gMid.append((_ef[0]+_ef[1]+_eb[0]+_eb[1])/4)
        if _a in G_WALLED: _gAis.append({'a':[round(float(v_),2) for v_ in T+nf_*L_],'b':[round(float(v_),2) for v_ in T-nf_*0.3],'w':round(w_,2),'y0':y0_,'y1':round(float(y1_),2)})
        if _a in G_WALLED: _egates.append({'p':[round(float(T[0]),2),round(float(T[1]),2)],'u':[round(float(-nf_[0]),4),round(float(-nf_[1]),4)],'w':round(w_+0.15,2)})
        if _a in ('G06','G44'): _p0=T
    _lst=_names[-1]; _c,_al,_nf,_svm,_lo,_hi,_svb=_gf[_lst]
    _e=_hi if (_al@(np.array([0.0,0.0])-_c))>0 else _lo
    _p1=_c+_al*_e+_nf*_svb
    _ip=_LS2([_p1+_nf*3.0,_p1-_nf*12.0]).intersection(_fnE); _pts=[np.array(q_.coords[0]) for q_ in getattr(_ip,'geoms',[_ip]) if not q_.is_empty]
    _p1=min(_pts,key=lambda q_:np.hypot(*(q_-_p1))) if _pts else _p1
    _gOpen.append({'p0':[round(float(_p0[0]),2),round(float(_p0[1]),2)],'p1':[round(float(_p1[0]),2),round(float(_p1[1]),2)]})
print('excite aisles',len(_gAis),'gaps in the low wall',len(_egates),'open runs',_gOpen)
# Each row's tread right out to the flights either side (no strip left at the floor's level between a block and the steps), cut round them
_stU0=unary_union([_LS2([a_['a'],a_['b']]).buffer(a_['w']/2,cap_style=2) for a_ in _gAis]); _Acut=[]
for _names in (['G%02d'%k_ for k_ in range(3,16)],['G%02d'%k_ for k_ in range(47,34,-1)]):
    for _i,_nm in enumerate(_names):
        if _nm not in _gf: continue
        _c,_al,_nf,_svm,_lo,_hi,_svb=_gf[_nm]; _pt_=_gfp.get(_nm,EX_PITCH); _ys=_gY[_nm]; _N=len(_ys); _lx,_hx=_lo,_hi
        # (out to the middle of the flight either side, and cut round it: whatever the neighbour's own angle, nothing is left at the floor's level between them)
        for m_ in _gMid:
            ts_=float((m_-_c)@_al)
            if abs(float((m_-_c)@_nf))>12.0: continue
            if _hi-1.0<ts_<_hi+3.5: _hx=max(_hx,ts_+0.4)
            elif _lo-3.5<ts_<_lo+1.0: _lx=min(_lx,ts_-0.4)
        for _r in range(_N):
            _bk0=G_BACK.get(_nm,0.0)
            _s1=_svm-_r*_pt_; _s0=_svm-(_r+1)*_pt_ if _r<_N-1 else (_svb+0.1 if _bk0 else _svb-3.0)       # (the back row on back to the stand's front, cut at it; a block moved back: up to the tread of the stand's first seats)
            _rc=Polygon([_c+_al*_lx+_nf*_s0,_c+_al*_hx+_nf*_s0,_c+_al*_hx+_nf*_s1,_c+_al*_lx+_nf*_s1]).buffer(0)
            if _bk0: _band=Polygon([_c+_al*_lx+_nf*(_svb+0.1),_c+_al*_hx+_nf*(_svb+0.1),_c+_al*_hx+_nf*(_svb+_bk0+1.5),_c+_al*_lx+_nf*(_svb+_bk0+1.5)]).buffer(0); _Acut.append(_band)
            _rc=_rc.intersection(_fnP0.union(_band) if _bk0 else _fnP0).difference(_fiP0).difference(_stU0)
            if not _rc.is_empty: _gr2.append({'r':_r,'y':round(float(_ys[_r]),3),'polys':T1._polys_of(_rc)})
_lvG['rows']=_gr2; _lvG['rails']=[]; _lvG['walls']=[]; _lvG['steps']=[]
# (the stand's flat treads under the blocks moved back over them: gone)
_AcutU=unary_union(_Acut)
_lvA_=next(l_ for l_ in levels if l_['name']=='A'); _rowsA=[]
for r_ in _lvA_['rows']:
    g_=T1._geom_of(r_['polys'])
    if g_.intersects(_AcutU):
        g_=g_.difference(_AcutU)
        if g_.is_empty: continue
        r_={**r_,'polys':T1._polys_of(g_)}
    _rowsA.append(r_)
_lvA_['rows']=_rowsA
# (the seats go with their blocks)
_raw0=np.frombuffer(_b64.b64decode(_lvG['seats']),'<i2').reshape(-1,4).copy()
for _i,b_ in enumerate(_lvG['gblocks']):
    _sh=_gShift.get(str(b_),0.0); _nfb=_gf[str(b_)][2]
    _raw0[_i,0]+=int(round(_nfb[0]*_sh*50)); _raw0[_i,1]+=int(round(_nfb[1]*_sh*50))
_lvG['seats']=_b64.b64encode(_raw0.astype('<i2').tobytes()).decode('ascii')
# no seat on a flight
_S=np.frombuffer(_b64.b64decode(_lvG['seats']),'<i2').reshape(-1,4)/np.array([50.0,50.0,1.0,1.0])
_stU=unary_union([_LS2([a_['a'],a_['b']]).buffer(a_['w']/2+0.02,cap_style=2) for a_ in _gAis])
_kg2=~shapely.contains_xy(_stU,_S[:,0],_S[:,1]); print('excite seats on the flights dropped',int((~_kg2).sum()))
_raw=np.frombuffer(_b64.b64decode(_lvG['seats']),'<i2').reshape(-1,4)[_kg2]
_lvG['seats']=_b64.b64encode(_raw.tobytes()).decode('ascii'); _lvG['gblocks']=[b_ for b_,k_ in zip(_lvG['gblocks'],_kg2) if k_]
_lvG['seatY']=[round(float(_gY[str(b_)][int(r_)]),3) for b_,r_ in zip(_lvG['gblocks'],_raw[:,2])]
_lvF=next(l_ for l_ in levels if l_['name']=='F')
# The outfield's rows over its vomitories and the lower concourse run on under them: gone over the pits and the stairs' cuts, a roof slab over the rest
_fsites=[s_ for s_ in _sites if s_.get('out')]
_pitU=unary_union([s_['pit'] for s_ in _fsites]); _trenchU=unary_union([st_['trench'] for c_ in _corrs for st_ in c_['stairs']])
_roofU=unary_union([s_['tunnel'] for s_ in _fsites if s_['tunnel'] is not None]+[c_['poly'] for c_ in _corrs])
_cutU=_pitU.union(_trenchU); _zoneU=_cutU.union(_roofU).buffer(0.05)
_rowsF=[]
for _r2 in _lvF['rows']:
    g_=T1._geom_of(_r2['polys'])
    if not g_.intersects(_zoneU): _rowsF.append(_r2); continue
    rg=g_.intersection(_roofU); rest=g_.difference(_cutU).difference(_roofU)
    if not rest.is_empty: _rowsF.append({**_r2,'polys':T1._polys_of(rest)})
    if not rg.is_empty: _rowsF.append({**_r2,'y0':round(_r2['y']-T1.GATE_SLAB,3),'polys':T1._polys_of(rg)})
_lvF['rows']=_rowsF
# (and the aisle steps that ran up through it, or across the backscreen)
_wrS=[(0.0,0.0)]+[(np.sin(np.radians(a_))*220,-np.cos(np.radians(a_))*220) for a_ in (-9.7,0.0,9.7)]
_stCut=_cutU.buffer(0.05).union(_roofU.buffer(0.05)).union(Polygon(_wrS).buffer(0))
_stF=[]
for _st in _lvF.get('steps',[]):
    g_=Polygon(_st['polys'][0],_st['polys'][1:]).buffer(0)      # (a step's polys are one polygon's rings)
    if not g_.intersects(_stCut): _stF.append(_st); continue
    rest=g_.difference(_stCut)
    for piece in T1._polys_of(rest): _stF.append({**_st,'polys':piece})
_stB=[]
for _st in _stF:
    g_=Polygon(_st['polys'][0],_st['polys'][1:]).buffer(0.13,join_style=2)   # (a flight's two halves were laid a hair apart: a dark slit up the middle)
    for piece in T1._polys_of(g_): _stB.append({**_st,'polys':piece})
_lvF['steps']=_stB
# The backscreen: the outfield's rows between F09 and F12 set apart, to be drawn dark green with no seats
BSC_DEG=9.7
_wr=[(0.0,0.0)]+[(np.sin(np.radians(a_))*220,-np.cos(np.radians(a_))*220) for a_ in (-BSC_DEG,0.0,BSC_DEG)]
_wedge=Polygon(_wr).buffer(0)
_bsc=[]; _rowsF=[]
for _r2 in _lvF['rows']:
    g_=T1._geom_of(_r2['polys'])
    if not g_.intersects(_wedge): _rowsF.append(_r2); continue
    rest=g_.difference(_wedge); ins=g_.intersection(_wedge)
    if not rest.is_empty: _rowsF.append({**_r2,'polys':T1._polys_of(rest)})
    if not ins.is_empty: _bsc.append({'y':_r2['y'],'polys':T1._polys_of(ins)})
_lvF['rows']=_rowsF
print('backscreen rows set apart',len(_bsc))
# The balcony's blocks divided by a wall on the line of each column under it (all but the screen's, 51-56), straight across its rows,
# following them up, a rail's height over each
_cRows=next(l_ for l_ in levels if l_['name']=='C')['rows']
_cWalls=[]
from shapely.geometry import LineString as _LS3
_cB1=sorted(_cA[1]); _cB3=sorted(_cA[3])
_cBd=[0.5*(a_+b_) for a_,b_ in zip(_cB1,_cB1[1:])]+[-0.5*(a_+b_) for a_,b_ in zip(_cB3,_cB3[1:])]
for p_ in PILLARS:
    if not (14.0<=p_['y1']<=16.6): continue
    q0=np.array([p_['x'],p_['z']])
    _thp=float(np.degrees(np.arctan2(q0[0]-O[0],q0[1]-O[1])))
    if abs(_thp)<33.7: continue                  # (behind home the S blocks have their own walls, below)
    _thb=min(_cBd,key=lambda v_:abs(v_-_thp))
    ax_=np.array([np.sin(np.radians(_thb)),np.cos(np.radians(_thb))]); q0=np.array(O,float)+ax_*float(np.hypot(*(q0-np.array(O))))
    ln=_LS3([q0-ax_*25,q0+ax_*25])
    for r_ in _cRows:
        g_=T1._geom_of(r_['polys']); ig=ln.intersection(g_)
        for pc in (ig.geoms if hasattr(ig,'geoms') else [ig]):
            if pc.geom_type!='LineString' or pc.length<0.05: continue
            a0,a1=np.array(pc.coords[0]),np.array(pc.coords[-1])
            m_=(a0+a1)/2
            _cWalls.append({'x':round(float(m_[0]),2),'z':round(float(m_[1]),2),'ax':round(float(ax_[0]),4),'az':round(float(ax_[1]),4),'len':round(float(np.linalg.norm(a1-a0))+0.02,3),'y0':round(float(r_.get('y0',r_['y']-1.0)),2),'y1':round(float(r_['y'])+1.1,2)})
# (and between the S blocks: each boundary a radial line across the same rows)
for _sd in (1,-1):
    for k_ in range(0,S_NB+1):
        th_=_sd*(VIP_TH+k_*_sw if False else VIP_TH+k_*((33.7-VIP_TH)/S_NB)); ct_=np.radians(th_)
        u_=np.array([np.sin(ct_),np.cos(ct_)]); q0=np.array(O,float)
        ln=_LS3([q0,q0+u_*220])
        for r_ in _cRows:
            g_=T1._geom_of(r_['polys']); ig=ln.intersection(g_)
            for pc in (ig.geoms if hasattr(ig,'geoms') else [ig]):
                if pc.geom_type!='LineString' or pc.length<0.05: continue
                a0,a1=np.array(pc.coords[0]),np.array(pc.coords[-1]); m_=(a0+a1)/2
                _cWalls.append({'x':round(float(m_[0]),2),'z':round(float(m_[1]),2),'ax':round(float(u_[0]),4),'az':round(float(u_[1]),4),'len':round(float(np.linalg.norm(a1-a0))+0.02,3),'y0':round(float(r_.get('y0',r_['y']-1.0)),2),'y1':round(float(r_['y'])+1.1,2)})
print('balcony block walls',len(_cWalls))
if _cWalls:
    import base64 as _b64c
    _lvC2=next(l_ for l_ in levels if l_['name']=='C')
    _Sc=np.frombuffer(_b64c.b64decode(_lvC2['seats']),dtype='<i2').reshape(-1,4); _xy=_Sc[:,:2]/_lvC2.get('seatScale',10)
    _wcx=np.array([[w_['x'],w_['z'],w_['ax'],w_['az'],w_['len']] for w_ in _cWalls])
    _dv=_xy[:,None,:]-_wcx[None,:,:2]; _al=_dv[...,0]*_wcx[None,:,2]+_dv[...,1]*_wcx[None,:,3]; _ac=np.abs(_dv[...,0]*_wcx[None,:,3]-_dv[...,1]*_wcx[None,:,2])
    _kc2=~(((np.abs(_al)<=_wcx[None,:,4]/2+0.3)&(_ac<0.14)).any(axis=1))
    _cup=np.array([[p_['x'],p_['z']] for p_ in PILLARS if p_.get('upC')]).reshape(-1,2)
    if len(_cup): _kc2&=np.min(np.hypot(_xy[:,None,0]-_cup[None,:,0],_xy[:,None,1]-_cup[None,:,1]),axis=1)>1.0
    print('balcony seats under the walls',int((~_kc2).sum())); _lvC2['seats']=_b64c.b64encode(_Sc[_kc2].tobytes()).decode('ascii')
# The balcony's two ends closed: a wall from under its slab up to a rail's height over its top row, across each end
_lvC=next(l_ for l_ in levels if l_['name']=='C')
_cU=unary_union([T1._geom_of(r_['polys']) for r_ in _lvC['rows']]).buffer(0.1).buffer(-0.1)
_cY0=min(r_.get('y0',r_['y']) for r_ in _lvC['rows'])-0.5; _cY1=max(r_['y'] for r_ in _lvC['rows'])+1.1
_cEnd=0
for g_ in (_cU.geoms if hasattr(_cU,'geoms') else [_cU]):
    P_=np.array(g_.exterior.coords); th_=np.degrees(np.arctan2(P_[:,0]-O[0],P_[:,1]-O[1]))
    for k_ in range(len(P_)-1):
        if abs(th_[k_])>=U.C_END-1.2 and abs(th_[k_+1])>=U.C_END-1.2 and np.hypot(*(P_[k_+1]-P_[k_]))>0.02:
            encl['thinWalls'].append([round(float(P_[k_][0]),2),round(float(P_[k_][1]),2),round(float(P_[k_+1][0]),2),round(float(P_[k_+1][1]),2),round(float(_cY0),2),round(float(_cY1),2)]); _cEnd+=1
print('balcony ends closed: panels',_cEnd)
# Between S101 and S301 (the VIP box): shut off by plain walls, one down each block's side and one across the front, floor to the tier above
_vipW=[]
_rAt=lambda th_,val_: next((float(r_) for r_ in np.arange(30.0,200.0,0.05) if (lambda p_: (lambda ij_: 0<=ij_[1]<G.H and 0<=ij_[0]<G.W and (dOut[ij_[1],ij_[0]]-U.tau_c(th_))>=val_)([int(round(float(c_))) for c_ in G.g(p_[0],p_[1])]))(np.array(O,float)+np.array([np.sin(np.radians(th_)),np.cos(np.radians(th_))])*r_)),None)
_pv=lambda th_,r_: np.array(O,float)+np.array([np.sin(np.radians(th_)),np.cos(np.radians(th_))])*r_
_y0v,_y1v=H_C-1.4,H_D+0.2
_ths=np.arange(-VIP_TH,VIP_TH+0.01,0.5)
_rf=[_rAt(float(t_),C0W) for t_ in _ths]
for k_ in range(len(_ths)-1):
    a_,b_=_pv(float(_ths[k_]),_rf[k_]),_pv(float(_ths[k_+1]),_rf[k_+1])
    encl['thinWalls'].append([round(float(a_[0]),2),round(float(a_[1]),2),round(float(b_[0]),2),round(float(b_[1]),2),_y0v,_y1v])
for t_,r_ in ((_ths[0],_rf[0]),(_ths[-1],_rf[-1])):
    a_,b_=_pv(float(t_),r_),_pv(float(t_),r_+4.0)
    encl['thinWalls'].append([round(float(a_[0]),2),round(float(a_[1]),2),round(float(b_[0]),2),round(float(b_[1]),2),_y0v,_y1v])
# At each end of the upper deck the wall stands right behind the 2nd floor's back row (and its deck on past the seats), up to the roof: one
# line from the end of E round to where the outfield's wall takes over, and from E's end straight back to the building
_dv=next(l_ for l_ in levels if l_['name']=='D')
_cdU=unary_union([T1._geom_of(r_['polys']) for l_ in (_lvC,_dv) for r_ in l_['rows']]+[T1._geom_of(mask_polys(G,m_)) for m_,y0_,_y in slabs[:2]]).buffer(0.5).buffer(-0.5)
_ouP=Polygon(poly_out(ow[0])[0]).buffer(0)
_upW=[]
for _sd in (1,-1):
    _bk=[]
    for t_ in np.arange(84.4,U.D_END+0.31,1.0):
        u_=np.array([np.sin(np.radians(_sd*t_)),np.cos(np.radians(_sd*t_))]); ln=_LS3([O,np.array(O,float)+u_*220.0])
        ig=ln.intersection(_cdU)
        if ig.is_empty: continue
        rm_=max(float(np.hypot(*(np.array(c_)-np.array(O)))) for g_ in getattr(ig,'geoms',[ig]) for c_ in g_.coords)
        _bk.append((float(t_),rm_))
    _tt=np.array([v_[0] for v_ in _bk]); from scipy.ndimage import gaussian_filter1d as _gf1b
    _rr=_gf1b(np.array([v_[1] for v_ in _bk]),1.2,mode='nearest')+0.08
    pts_=[[round(float(O[0]+r_*np.sin(np.radians(_sd*t_))),2),round(float(O[1]+r_*np.cos(np.radians(_sd*t_))),2)] for t_,r_ in zip(_tt,_rr)]
    u0=np.array([np.sin(np.radians(_sd*84.4)),np.cos(np.radians(_sd*84.4))]); ix_=_LS3([O,np.array(O,float)+u0*220.0]).intersection(_ouP.exterior)
    q_=max(getattr(ix_,'geoms',[ix_]),key=lambda v_:np.hypot(v_.x-O[0],v_.y-O[1])) if not ix_.is_empty else None
    _upW.append({'pts':pts_,'y0':round(H_D-0.5,2)})
    if q_ is not None: _upW.append({'pts':[[round(float(q_.x),2),round(float(q_.y),2)],pts_[0]],'y0':round(H_D-0.5,2)})
    u1=np.array([np.sin(np.radians(_sd*float(_tt[-1]))),np.cos(np.radians(_sd*float(_tt[-1])))]); ix_=_LS3([O,np.array(O,float)+u1*220.0]).intersection(_ouP.exterior)
    q_=max(getattr(ix_,'geoms',[ix_]),key=lambda v_:np.hypot(v_.x-O[0],v_.y-O[1])) if not ix_.is_empty else None
    if q_ is not None: _upW.append({'pts':[pts_[-1],[round(float(q_.x),2),round(float(q_.y),2)]],'y0':round(H_D-0.5,2)})
print('upper deck ends: walls',[len(w_['pts']) for w_ in _upW])
# The cracks left between the excite seats' treads, the fence and the A stand's front: closed at the height of the back rows
_fnP=Polygon(poly_out(fnw[0])[0]).buffer(0); _fiP=Polygon(poly_out(fw[0])[0]).buffer(0)
_pg=[]
for _lv2 in levels:
    if _lv2['name'] in 'GABF':
        for _r2 in _lv2['rows']: _pg.append(T1._geom_of(_r2['polys']).buffer(0.01))
for _f2 in floors: _pg.append(T1._geom_of(_f2['polys']))
_holes=_fnP.difference(_fiP.buffer(0.05)).difference(unary_union([g_.buffer(0) for g_ in _pg if not g_.is_empty]))
_holes=_holes.buffer(0.12).intersection(_fnP).difference(_fiP.buffer(0.05))
print('cracks closed behind the excite seats: %.1f m2'%_holes.area)
_lvG['rows'].append({'r':0,'y':round(float(Gx.hs[0])-0.08,3),'polys':T1._polys_of(_holes)})       # (the floor between the fence and the seats: the seats' own concrete)
data={'suites':{'line':suite_line,'y':H_C-0.4,'h':3.6,'depth':3.4},'levels':levels,'floors':floors,'flights':flights+aisle_flights,'outer':[poly_out(p) for p in ow],'field':[poly_out(p) for p in fw],'fence':[poly_out(p) for p in fnw],'rim':rim,'rimY':H_D,'rimC':rimC,'rimS':rimS,'rimCS':rimCS,'upperWalls':_upW,'rimCY':H_C,'rooms':encl,'signs':SIGNS,'pillars':PILLARS,'tunnels':_tunnels,'exciteGates':_egates,'exciteAisles':_gAis,'exciteOpen':_gOpen,'exciteFront':_xFront,'backscreen':_bsc,'cWalls':_cWalls}
# What follows the raster build works on the finished outlines (td_post.py: the excite seats as the map and the photographs
# show them, the upper tiers' outfield ends): kept apart so it can be run again on its own (python3 td_post.py)
pickle.dump(data,open('td_pre.pkl','wb'))
# each seat's block, row and number as it was laid, by its position (td_labels.py)
pickle.dump(SEATLAB,open('td_seatlab.pkl','wb'))
import td_post; data=td_post.apply(data)
json.dump(data,open('td_stands.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('td_stands.json')//1024, round(time.time()-T0,1))

import standgen; pickle.dump({'doors':standgen.DOORLOG,'F':F.aisle_doors(),'B':B.aisle_doors(),'dbg':{k:tuple(np.packbits(a) for a in v) for k,v in standgen.DEBUG.items()},'FR':np.packbits(F.R>0)},open('td_dbg.pkl','wb'))

import td_labels
