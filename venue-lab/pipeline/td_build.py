import sys, json, time, pickle, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, redepth, trim_tunnels
T0=time.time()
st=pickle.load(open('td_stage1.pkl','rb'))
G=Grid(-140,140,-200,110,0.1)
STRAIGHT.update(on=True,res=G.res)
O=(0.0,-60.0)
dOut,TH,hull1,field=st['dOut'],st['TH'],st['hull1'],st['field']
dOut1=st['dOut1']
E0=st['E0']; D0,DP=4.0,0.8
_gy,_gx=np.mgrid[0:G.H,0:G.W]; _Xg,_Zg=G.m(_gx,_gy); RRO=np.maximum(np.hypot(_Xg-O[0],_Zg-O[1]),1.0); del _gy,_gx
H_A,R_A=1.3,0.28; H_B,R_B=8.6,0.28; H_F,R_F=4.6,0.46
H_C,R_C=17.8,0.4; H_D,R_D=23.0,0.5; H_E,R_E=28.0,0.55
C1F,CBAL,C2F=14.2,19.0,27.5
C0W=0.3            # the balcony's front, out from the 1st floor's hull
LV={}
# the A seats as the building rows them (td_rowsA.py): each block's rows
# parallel to its back, numbered back from the walkway behind row 26, the
# fence cutting across them; A01/A49 on past the walkway to row 40 (as B)
ra=pickle.load(open('td_rowsA.pkl','rb'))
LV['A']=Level(G,'A',ra['SA'],0.74,H_A,R_A,'ground',centre=O,rmax=180,hull_close=2.0)
bl=ra['blocks']
redepth(LV['A'],G,ra['secA'],np.array([b['f'] for b in bl]),np.array([26*0.74+b['sA'] for b in bl]),ra['rowA'])
LV['B']=Level(G,'B',np.r_[st['SB'],ra['SBx']],0.748,H_B,R_B,'ground',centre=O,rmax=180,hull_close=2.0)
LV['F']=Level(G,'F',st['SF'],0.74,H_F,R_F,'ground',centre=O,rmax=180,hull_close=2.0)
LV['C']=Level(G,'C',st['SC'],0.9,H_C,R_C,0.5,1.2,centre=O,rmax=180,open_w=4.0,hull_close=4.0)
LV['D']=Level(G,'D',st['SD'],0.8,H_D,R_D,0.5,1.5,centre=O,rmax=180,open_w=3.0,hull_close=3.0)
LV['E']=Level(G,'E',st['SE'],0.8,H_E,R_E,0.5,0.6,centre=O,rmax=180,open_w=2.2,hull_close=3.0)
# the outfield stands climb to the 1st-floor concourse, as B does: their back
# row is level with it, and the doors at the backs of their aisles open onto it
LV['F'].rise=(C1F-H_F)/(LV['F'].nrows-1)
print('levels',round(time.time()-T0,1),{k:(l.nrows,len(l.seats)) for k,l in LV.items()},'F rise',round(LV['F'].rise,3))
# the tunnels from the 2nd-floor concourse through E's first rows, made straight
VOMS={'E':LV['E'].make_voms(C2F,detect=False,cands=[(np.abs(TH-tv)<np.degrees(1.1/RRO))&(dOut>=E0-0.3)&(dOut<E0+5*DP) for tv in st['VOM']])}
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
cb=(dOut>3.9)&(dOut<=E0+6)&(np.abs(TH)<=130)&(Cl.R==0)
# 2nd-floor concourse: the D/E walkway, the hall under E behind its first
# rows (and the tunnel mouths through them), and 6 m behind it all
Eback=E0+23*DP
c2=(dOut>=D0+8*DP)&(dOut<=Eback+6)&(np.abs(TH)<=106)&(D.R==0)&~((E.R>0)&(dOut<E0+4.0))
# the building's outer wall
allm=(stand1|c1|cb|c2|(Cl.R>0)|(D.R>0)|(E.R>0))
# the outer wall: straight runs round it all
cs_,_=cv2.findContours(allm.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
hull=np.zeros(allm.shape,np.uint8); cv2.fillPoly(hull,[cv2.convexHull(np.vstack(cs_))],1)
hull=(hull>0)&(~field)
outer=dil(hull,0.4)&~field
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
# per level, per cell: the underside and top of what stands there
def level_z(l):
    r=np.maximum(l.band,0)
    top=l.h0+l.rise*r
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
    for lo,up,y0,y1,dd in ((c1,cb,C1F,CBAL,6.5),(cb,c2,CBAL,C2F,E0+5.0)):
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
suitem=(dOut>=C0W)&(dOut<=3.9)&(np.abs(TH)<SUITE_TH)&~field
slabs=[(gu(cross,H_A+R_A*25),0.0,H_A+R_A*25),(gu(c1,C1F),0.0,C1F),(gu(cb,CBAL),CBAL-0.35,CBAL),(gu(c2,C2F),C2F-0.35,C2F),(suitem,H_C-0.4-0.4,H_C-0.4)]
# ── the concourses closed in ──
t_=time.time()
rooms=[{'name':'1F','mask':c1,'y':C1F,'cl':4.0,'own':[A,B,F],'doors':B.aisle_doors()+F.aisle_doors()},
       {'name':'BAL','mask':cb,'y':CBAL,'cl':3.8,'own':[Cl],'doors':Cl.aisle_doors()},
       {'name':'2F','mask':c2,'y':C2F,'cl':4.0,'own':[D,E],'doors':D.aisle_doors()+E.aisle_doors()}]
rooms[2]['open']=E.pits
# the walkway along the back of the 1st floor, out from under the balcony:
# open to the dome, the concourse's wall (with its doors) behind it
overhead=(Cl.R>0)|(D.R>0)|(E.R>0)|cb|c2|suitem
WALK=c1&~overhead&dil(A.R|B.R|F.R,4.0)&(np.abs(TH)<125)
rooms[0]['walk']=WALK
trim_tunnels(G,VOMS['E'],c2)
encl,roomtop=enclose(G,rooms,list(LV.values()),slabs,flights)
print('enclose',round(time.time()-t_,1),{k:len(v) for k,v in encl.items()})
# no rail or wall where one stand of the 1st floor meets another near level
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0 or (TOP1[oy,ox]>0 and abs(h-TOP1[oy,ox])<=0.6) or (WALK[oy,ox] and abs(h-C1F)<=0.6)
fronts={'C':('tread',0.8),'D':('tread',0.8)}
levels=[]
spec={'A':((cross,H_A+R_A*25),),'B':((c1,C1F),),'F':((c1,C1F),),'C':((cb,CBAL),),'D':((c2,C2F),),'E':((c2,C2F),)}
flushmode={'A':'open','B':'doors','F':'doors','C':'doors','D':'open','E':'doors'}
voms={'E':C2F}
for name,l in LV.items():
    rails,walls=edge_walls(G,l,outside_fn(spec[name]),l.aisle_doors(),flush=flushmode[name],skip=skip,front=fronts.get(name))
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,'rows':l.rows_out(),'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),
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
ow=contours(G,outer.astype(np.uint8),eps=0.03,minarea=100)
fw=contours(G,field.astype(np.uint8),eps=0.03,minarea=100)
# the 2nd floor's front edge, for the lights along it
fy,fx=np.nonzero(D.F); FX,FZ=G.m(fx,fy); ang=np.arctan2(FX-O[0],FZ-O[1]); o=np.argsort(ang)
rim=[[round(float(FX[i]),1),round(float(FZ[i]),1)] for i in o[::40]]
for L_ in levels:
    if L_['name']=='F': L_['walls']=L_['walls']+back
data={'suites':{'line':suite_line,'y':H_C-0.4,'h':3.6,'depth':3.4},'levels':levels,'floors':floors,'flights':flights,'outer':[poly_out(p) for p in ow],'field':[poly_out(p) for p in fw],'rim':rim,'rimY':H_D,'rooms':encl}
json.dump(data,open('td_stands.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('td_stands.json')//1024, round(time.time()-T0,1))

import standgen; pickle.dump({'doors':standgen.DOORLOG,'F':F.aisle_doors(),'B':B.aisle_doors(),'dbg':{k:tuple(np.packbits(a) for a in v) for k,v in standgen.DEBUG.items()},'FR':np.packbits(F.R>0)},open('td_dbg.pkl','wb'))
