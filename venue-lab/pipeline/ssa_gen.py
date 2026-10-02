# Saitama Super Arena (arena mode, end stage 2): the stands laid out from the
# official seating map (ssa_chart.py -> ssa/ssa_chart.json, ssa_blocks.py): every
# seat where the map draws it, in the blocks and rows it has them, the doors at
# the map's 94 door badges; then the concourses, stairs, tunnels, walls and
# rails round them (standgen).
import sys, json, time, re, pickle, base64, os, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, sample, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels, front_parapet, cut_tunnels, tunnel_rows, tunnels_out, tunnel_decks
import ssa_blocks as SB
from scipy.spatial import cKDTree
T0=time.time()
G=Grid(-74,74,-68,68,0.1)
STRAIGHT.update(on=True,res=G.res)
C200,C300,C400,C500=6.2,11.44,16.2,23.0
CH=SB.load_chart(); OFF=SB.row_offsets(CH)
# each level's section (rake and depth of a row, the slab under a row): as before
SEC={'200':dict(D=0.865,h0=0.45,rise=0.33,bottom=lambda r,h: 0.0 if r<=24 else h-0.6,fascia=2.6),
     '300':dict(D=1.0,h0=10.6,rise=0.42,bottom=0.5,fascia=2.2),
     '400':dict(D=0.85,h0=14.5,rise=0.42,bottom=0.5,fascia=1.3),
     '500':dict(D=0.87,h0=22.0,rise=0.5,bottom=0.5,fascia=2.4)}
# ── the doors: the map's 94 badges (the level is the number's hundreds), metres ──
DOORS={lv:{int(g):tuple(SB.to_metres(CH,v['centre'],lv)) for g,v in CH['gates'].items() if str(v['level'])==lv[0]} for lv in ('200','300','400','500')}
print('doors',{k:len(v) for k,v in DOORS.items()})
LV={}
def gap_gates(l,gates):
    """the doors that stand in a gap of the stand's treads (a vomitory's mouth, or a notch open at the back)"""
    inv=((1-l.R)&(l.hull>0)&l.behind).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
    out=set()
    for g,(x,z) in gates.items():
        i_,j_=[int(round(float(c))) for c in G.g(x,z)]
        k=lab[j_,i_]
        if k>0 and st[k,4]*G.res**2>=3.0: out.add(g)
    return out
GAPDOOR={}
for lv in ('200','300','400','500'):
    S_=SB.level_seats(CH,lv,OFF)
    l0=SB.build_level(G,lv,S_,**SEC[lv]); GAPDOOR[lv]=gap_gates(l0,DOORS[lv])
    # a door stands at the end of a block (the stand's blocks are boxes, or pieces of one, with an aisle at each end): where
    # no block stands beyond that end the aisle is added beside it
    pts=[q for g,q in DOORS[lv].items() if g not in GAPDOOR[lv]]
    LV[lv]=SB.build_level(G,lv,S_,strips=SB.end_aisles(S_,pts,maxdist=3.6),**SEC[lv]); LV[lv].S=S_
print('doors in a gap of the treads',{k:sorted(v) for k,v in GAPDOOR.items() if v})
L2,L3,L4,L5=LV['200'],LV['300'],LV['400'],LV['500']
print('levels',round(time.time()-T0,1),{k:(l.nrows,len(l.seats)) for k,l in LV.items()})

# ── the tunnels in from the concourses (the vomitories), through the 200 level's sides and the 400 level's ──
gy,gx=np.mgrid[0:G.H,0:G.W]; X,Z=G.m(gx,gy)
def notches(l,gates,xmin=40.0):
    """the side doors that stand in a notch open at the stand's back (no rows behind it to close the gap round):
    make_voms only takes gaps the treads close round"""
    out=[]
    inv=((1-l.R)&(l.hull>0)&l.behind).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(inv,connectivity=4)
    for g,(x,z) in gates.items():
        if abs(x)<xmin: continue
        i_,j_=[int(round(float(c))) for c in G.g(x,z)]
        k=lab[j_,i_]
        if k<=0 or st[k,4]*G.res**2<3.0: continue
        m=lab==k; edge=(cv2.dilate(m.astype(np.uint8),disk(3))>0)&~m
        if (l.R[edge]>0).mean()>=0.9: continue            # closed round: make_voms finds it itself
        out.append(m)
    return out
VOMS={}
for name,l,floor in (('200',L2,C200),('400',L4,C400)):
    cands=notches(l,DOORS[name])
    VOMS[name]=l.make_voms(floor,head=1.9,wmax=3.0,cands=cands)
print('voms',{k:len(v) for k,v in VOMS.items()},round(time.time()-T0,1))
for k,v in VOMS.items():
    for o in sorted(v,key=lambda o:(round(o['p'][0]/5),o['p'][1])): print('  ',k,[round(c,1) for c in o['p']],'w',o['w'],'L',o['L'],'T',o['T'])

# ── concourses ──
def dil(m,r): return cv2.dilate(m.astype(np.uint8),disk(r/G.res))>0
backstage=(np.abs(X)<22)&(Z<-38)
c200=((dil(L2.R,7)&L2.behind&(L2.R==0))|((L2.R>0)&(L2.d>=24.5*L2.D))) & ~backstage
gaps=(L2.hull>0)&(L2.R==0)&L2.behind&(L2.d>15)
c200|=gaps
c300=dil(L3.R,6)&L3.behind&(L3.R==0)&(L3.d>2.0)
c400=((dil(L4.R,7)&L4.behind&(L4.R==0)&(L4.d>3.0))|((L4.R>0)&(L4.d>=8.3*L4.D/0.85)))
c500=dil(L5.R,6)&L5.behind&(L5.R==0)&(L5.d>1.8)
c300|=(L3.hull>0)&(L3.R==0)&L3.behind&(L3.d>0.8)
c500|=(L5.hull>0)&(L5.R==0)&L5.behind&(L5.d>0.8)
arena=(np.abs(X)<25)&(np.abs(Z)<40)
for c in (c200,c300,c400,c500): c&=~arena
allm=(L2.R|L3.R|L4.R|L5.R|c200|c300|c400|c500).astype(np.uint8)
cs_,_=cv2.findContours(allm,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
hull=np.zeros_like(allm); cv2.fillPoly(hull,[cv2.convexHull(np.vstack(cs_))],1)
outer=dil(hull,0.4)
for c in (c200,c300,c400,c500): c&=hull>0
frontgap=(L2.hull>0)&(L2.R==0)&(L2.d<8)
c200|=(outer&(L2.R==0)&L2.behind&(L2.d>0.5)&~arena&~backstage&~frontgap)
def tidy(c,w=1.0,minarea=50):
    o=cv2.morphologyEx(c.astype(np.uint8),cv2.MORPH_OPEN,disk(w/2/G.res))
    n,lab,st,_=cv2.connectedComponentsWithStats(o,connectivity=8)
    keep=np.zeros(n,bool); keep[1:]=st[1:,4]*G.res**2>=minarea
    return keep[lab]
c200=tidy(c200); c300=tidy(c300,0.8,10); c400=tidy(c400,0.8,10); c500=tidy(c500,0.8,10)
# (the 300 level's blocks stand a 1.8 m aisle apart: the concourse runs on behind the aisles' heads)
ext3=cv2.morphologyEx(L3.extent.astype(np.uint8),cv2.MORPH_CLOSE,disk(2.5/G.res))>0
c300&=ext3
# the 500 level's blocks stand in separate pieces with the doors' aisles at their ends; the corridor behind them runs
# on across the gaps (bays at the doors), no further than the ring's own ends
ext5=cv2.morphologyEx(L5.extent.astype(np.uint8),cv2.MORPH_CLOSE,disk(7.0/G.res))>0
c500&=ext5
c500=cv2.morphologyEx(c500.astype(np.uint8),cv2.MORPH_CLOSE,disk(2.0/G.res))>0
c300=tidy(c300,0.8,10); c500=tidy(c500,0.8,10)
print('concourses',round(time.time()-T0,1),{k:round(float(c.sum()*G.res**2)) for k,c in (('200',c200),('300',c300),('400',c400),('500',c500))})

# ── stairs between the concourses: straight flights ──
RISE,RUN,WID=0.19,0.28,1.6
def fits(mask,pts):
    gx_,gz_=G.g(pts[:,0],pts[:,1]); gx_=np.round(gx_).astype(int); gz_=np.round(gz_).astype(int)
    ok=(gx_>=0)&(gx_<G.W)&(gz_>=0)&(gz_<G.H)
    return ok.all() and mask[gz_,gx_].all()
def footprint(x0,z0,dx,dz,L,w,step=0.2):
    ts=np.arange(0,L+1e-6,step); ws=np.arange(-w/2,w/2+1e-6,step)
    T,Wd=np.meshgrid(ts,ws); return np.c_[(x0+dx*T-dz*Wd).ravel(),(z0+dz*T+dx*Wd).ravel()]
def find_flight(lower,upper,y0,y1,near,avoid):
    n=int(np.ceil((y1-y0)/RISE)); L=n*RUN
    dirs=[(np.cos(t),np.sin(t)) for t in np.linspace(0,2*np.pi,24,endpoint=False)]
    for r in np.arange(0,26,0.7):
        for a in np.linspace(0,2*np.pi,max(8,int(r*4)),endpoint=False):
            x0=near[0]+r*np.cos(a); z0=near[1]+r*np.sin(a)
            for dx,dz in dirs:
                fp=footprint(x0,z0,dx,dz,L,WID)
                top=footprint(x0+dx*L,z0+dz*L,dx,dz,1.8,WID)
                if fits(lower,fp) and fits(upper,top) and fits(~avoid,fp) and fits(~avoid,top):
                    return dict(x=x0,z=z0,dx=dx,dz=dz,n=n,L=L,y0=y0,y1=y1)
    return None
standany=(L2.R|L3.R|L4.R|L5.R)>0
used=np.zeros_like(standany)
def mark(f):
    for fp in (footprint(f['x'],f['z'],f['dx'],f['dz'],f['L'],WID+1.2),footprint(f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L'],f['dx'],f['dz'],2.2,WID+1.2),footprint(f['x']-f['dx']*2,f['z']-f['dz']*2,f['dx'],f['dz'],2.2,WID+1.2)):
        gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
        used[gz_,gx_]=True
    used[:]=cv2.dilate(used.astype(np.uint8),np.ones((5,5),np.uint8))>0
flights=[]
for sz in (1,-1):
    for sx in (1,-1):
        for lo,up,y0,y1,near in ((c200,c300,C200,C300,(sx*22,sz*60)),(c300,c400,C300,C400,(sx*30,sz*57)),(c400,c500,C400,C500,(sx*12,sz*59)),(c200,c400,C200,C400,(sx*52,sz*48))):
            f=find_flight(lo,up,y0,y1,near,standany|used)
            print('flight',sx,sz,y0,y1,f and {k:round(float(v),1) for k,v in f.items()})
            if f: flights.append(f); mark(f)
for f in flights:
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L']-0.3,WID+0.4,step=0.05)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
    for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500)):
        if f['y0']<y<=f['y1']+0.01 and y!=f['y1']: c[gz_,gx_]=False
        if y==f['y1']:
            m=np.zeros_like(c); m[gz_,gx_]=True; c&=~m
print('flights',len(flights),round(time.time()-T0,1))

# ── the doors: each at the head of its aisle, on the stand's back edge ──
from scipy.ndimage import distance_transform_edt
def snap_doors(l,gates,skip):
    """the door of each badge (not those at a vomitory): the aisle's cell nearest the badge, out along the rake to where
    the treads end -> {number: (point on the back edge, outward unit vector)}"""
    seatfoot=cv2.dilate(l.seatmask,disk(1)); A=((l.R>0)&(seatfoot==0)).astype(np.uint8)
    A=cv2.morphologyEx(A,cv2.MORPH_OPEN,disk(3))>0
    _,(iy,ix)=distance_transform_edt(~A,return_indices=True)
    gz_,gx_=np.gradient(cv2.GaussianBlur(np.where(l.d>-1e2,l.d,0).astype(np.float32),(0,0),8))
    out={}
    for g,(x,z) in gates.items():
        if g in skip: continue
        i_,j_=[int(round(float(c))) for c in G.g(x,z)]
        j2,i2=iy[j_,i_],ix[j_,i_]
        p=np.array(G.m(i2,j2)); v=np.array([gx_[j2,i2],gz_[j2,i2]]); v/=np.linalg.norm(v)+1e-9
        t=0.0; last=p
        while t<12.0:
            q=p+v*t; a_,b_=[int(round(float(c))) for c in G.g(q[0],q[1])]
            if not (0<=a_<G.W and 0<=b_<G.H) or not l.R[b_,a_]: break
            last=q; t+=0.1
        out[g]=(last+v*0.05,v)
    return out
SNAP={name:snap_doors(l,DOORS[name],GAPDOOR[name]) for name,l in (('200',L2),('300',L3),('400',L4),('500',L5))}
print('doors snapped',{k:len(v) for k,v in SNAP.items()},'; farthest move from the badge %.1f m'%max(np.hypot(*(p-np.array(DOORS[k][g]))) for k,v in SNAP.items() for g,(p,_) in v.items()))

# ── the doors' numbers on the vomitories ──
for name,vs in VOMS.items():
    gs=DOORS[name]
    for v in vs:
        k=min(gs,key=lambda g: np.hypot(gs[g][0]-v['p'][0],gs[g][1]-v['p'][1])); v['label']=str(k)
TUN=[]
slabs=[(grow_under(c,y,[L2,L3,L4,L5]),(0.0 if y==C200 else y-0.35),y) for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500))]
t=time.time()
doors={k:[tuple(p) for p,_ in v.values()] for k,v in SNAP.items()}
rooms=[{'name':name,'mask':cm,'y':cy,'cl':4.0,'own':[l],'doors':doors[name],'open':getattr(l,'pits',None),'toroof':name in ('400','500')}
       for name,l,cm,cy in (('200',L2,c200,C200),('300',L3,c300,C300),('400',L4,c400,C400),('500',L5,c500,C500))]
for name,cm in (('200',c200),('400',c400)): trim_tunnels(G,VOMS[name],cm)
encl,roomtop=enclose(G,rooms,[L2,L3,L4,L5],slabs,flights)
print('enclose',round(time.time()-t,1),{k:len(v) for k,v in encl.items()})
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0
fronts={'200':(0.0,0.75),'300':('tread',0.8),'400':('tread',0.8),'500':('tread',0.8)}
def outside_fn(cmask,y):
    def f(ox,oy): return y if cmask[oy,ox] else None
    return f
# the 300 level: the VIP balcony between the 200s and the 400s, its blocks boxes: a low partition along each block's
# end where another block stands across the aisle, over the two front rows (the back row, level with the concourse, stays
# open: the way in to the box from the aisle's head)
def partitions(l, rows=2, height=1.05):
    S=l.S; out=[]; tree=cKDTree(S['P'])
    for b in np.unique(S['block']):
        m=S['block']==b; idx=np.nonzero(m&(S['row']==0))[0]
        if not len(idx): continue
        f=np.array([np.sin(S['yaw'][idx[0]]),np.cos(S['yaw'][idx[0]])]); e=np.array([-f[1],f[0]])
        al=S['P'][idx]@e; ends=((idx[np.argmin(al)],-1.0),(idx[np.argmax(al)],1.0))
        for i,sg in ends:
            p,q=S['p'][i],S['q'][i]
            d2,j=tree.query(S['P'][i]+e*sg*(p+1.3))
            if d2>1.0 or S['block'][j]==b: continue          # no block across the aisle: its edge is a rail
            fe=S['P'][i]+e*sg*(p/2+0.03)+f*(q*0.5)          # the front edge of the end's row
            g=-f
            for r in range(rows):
                a_=fe+g*(r*q+0.05); b_=fe+g*((r+1)*q); h=float(l.h(r))
                out.append([round(float(a_[0]),2),round(float(a_[1]),2),round(float(b_[0]),2),round(float(b_[1]),2),round(h,2),round(h+height,2)])
    return out
PART300=partitions(L3)
print('300 partitions',len(PART300))
def _below(lows,floor):
    H_=np.full((G.H,G.W),floor,np.float32)
    for l_,cm_,top_ in lows:
        if l_ is not None:
            t_=np.where(l_.band>=0,l_.h(np.maximum(l_.band,0)),0.0); H_=np.maximum(H_,t_)
        if cm_ is not None: H_=np.maximum(H_,np.where(cm_,top_,0.0))
    return lambda ox,oy: float(H_[min(G.H-1,max(0,oy)),min(G.W-1,max(0,ox))])
CHEEK={'300':_below([(L2,c200,C200+4.0)],float(L2.h(L2.nrows-1))-0.3),'500':_below([(L4,c400,C400+4.0)],C400+2.5)}
levels=[]
for name,l,cm,cy in (('200',L2,c200,C200),('300',L3,c300,C300),('400',L4,c400,C400),('500',L5,c500,C500)):
    rails,walls=edge_walls(G,l,outside_fn(cm,cy),doors[name],skip=skip,front=fronts[name],cheek=CHEEK[name] if name in ('300','500') else False)
    rails+=front_parapet(G,l,fronts[name])
    rows_=l.rows_out()
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,'rows':rows_,'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),'partitions':PART300 if name=='300' else [],
                   'seats':l.seats_out(),'rails':rails,'walls':walls})
    print(name,'rows',len(levels[-1]['rows']),'steps',len(levels[-1]['steps']),'rails',len(rails),'walls',len(walls),round(time.time()-T0,1))
# ── the doors' frames and number plates (one plate on each face of the wall over the opening), and a check that
# nothing stands in an opening ──
DOOR_W,DOOR_H=1.8,2.5
FL={'200':(C200,L2),'300':(C300,L3),'400':(C400,L4),'500':(C500,L5)}
SIGNS=[]; FRAMES=[]; DOORLIST=[]
for name,sn in SNAP.items():
    y0,l=FL[name]
    for g,(p,v) in sn.items():
        yaw=float(np.arctan2(v[0],v[1]))
        FRAMES.append({'x':round(float(p[0]),2),'z':round(float(p[1]),2),'yaw':round(yaw,3),'w':DOOR_W,'h':DOOR_H,'y':y0,'label':str(g)})
        for face,sg in ((0,1.0),(np.pi,-1.0)):
            q=p+v*0.07*sg
            SIGNS.append({'x':round(float(q[0]),2),'y':round(y0+DOOR_H+0.38,2),'z':round(float(q[1]),2),'yaw':round(yaw+face,3),'w':1.1,'label':str(g)})
        a_,b_=[int(round(float(c))) for c in G.g(*(p-v*1.5))]
        r_=int(l.band[b_,a_]) if l.band[b_,a_]>=0 else 0
        DOORLIST.append({'n':g,'level':name,'p':[round(float(p[0]),2),round(float(p[1]),2)],'v':[round(float(v[0]),3),round(float(v[1]),3)],'y':y0,'yIn':round(float(l.h(r_)),2)})
def cut_doors(panels,doors,keep_lintel=True):
    """The panels [x0, z0, x1, z1, y0, y1] of walls (and rails), with an opening cut out of every one that crosses a
    door's: DOOR_W wide, DOOR_H high above the door's sill (a lintel left over it); the panels along the aisle (not across it) stay"""
    out=[]
    for pnl in panels:
        a=np.array(pnl[0:2],float); b=np.array(pnl[2:4],float); L=float(np.hypot(*(b-a)))
        if L<1e-6: out.append(list(pnl)); continue
        u=(b-a)/L; cuts=[]
        for dd in doors:
            p=np.array(dd['p']); v=np.array(dd['v']); t=np.array([-v[1],v[0]])
            if abs(u@v)>0.88: continue                           # runs along the aisle's axis: the aisle's side
            sill=None
            for yy in (dd['y'],dd['yIn']):
                if pnl[4]<=yy+DOOR_H and pnl[5]>yy+0.2: sill=yy if sill is None else min(sill,yy)
            if sill is None: continue                            # not at the door's height (another level's wall)
            # where along the panel it passes through the opening's slab (|across|<DOOR_W/2, |along the aisle|<1.3)
            s_t=((a-p)@t,(b-p)@t); s_v=((a-p)@v,(b-p)@v)
            # the panel's line as (lateral, depth) from a to b: clip to the slab
            lo_,hi_=0.0,1.0
            for (c0,c1,lim) in ((s_t[0],s_t[1],DOOR_W/2),(s_v[0],s_v[1],1.3)):
                dc=c1-c0
                if abs(dc)<1e-9:
                    if abs(c0)>lim: lo_,hi_=1.0,0.0
                else:
                    t0=(-lim-c0)/dc; t1=(lim-c0)/dc
                    if t0>t1: t0,t1=t1,t0
                    lo_=max(lo_,t0); hi_=min(hi_,t1)
            if lo_<hi_-1e-6: cuts.append((lo_*L,hi_*L,sill))
        if not cuts: out.append(list(pnl)); continue
        cuts.sort(key=lambda c:c[0]); s0=0.0
        for c0,c1,dd in cuts:   # (dd: the sill's height)
            if c0-s0>0.02: out.append([*(a+u*s0).round(2),*(a+u*c0).round(2),pnl[4],pnl[5]])
            top=max(pnl[4],min(pnl[5],max(pnl[4],dd)+DOOR_H))
            if keep_lintel and pnl[5]>top+0.05: out.append([*(a+u*c0).round(2),*(a+u*c1).round(2),round(top,2),pnl[5]])
            s0=max(s0,c1)
        if L-s0>0.02: out.append([*(a+u*s0).round(2),*b.round(2),pnl[4],pnl[5]])
    return [[round(float(c),2) for c in o] for o in out]
encl['walls']=cut_doors(encl['walls'],DOORLIST)
for L_ in levels:
    L_['walls']=cut_doors(L_['walls'],DOORLIST); L_['rails']=cut_doors(L_['rails'],DOORLIST,keep_lintel=False)
from shapely.geometry import LineString
blocked=[]
allw=[(w,'room') for w in encl['walls']]+[(w,L_['name']) for L_ in levels for w in L_['walls']+L_['rails']]
for dd in DOORLIST:
    p=np.array(dd['p']); v=np.array(dd['v']); t=np.array([-v[1],v[0]])
    seg=LineString([p+t*(DOOR_W/2-0.25)-v*0.05,p-t*(DOOR_W/2-0.25)-v*0.05])
    for w,kind in allw:
        if w[5]<=dd['y']+0.3 and w[5]<=dd['yIn']+0.3: continue
        lo,hi=w[4],w[5]
        if hi<dd['y']+0.3 or lo>dd['y']+2.2: 
            if hi<dd['yIn']+0.3 or lo>dd['yIn']+2.2: continue
        if LineString([(w[0],w[1]),(w[2],w[3])]).distance(seg)<0.06 and np.hypot(w[2]-w[0],w[3]-w[1])>0.2:
            blocked.append((dd['n'],kind,[round(c,2) for c in w])); break
print('doors with something across the opening:',len(blocked),blocked[:12])
json.dump(DOORLIST,open('/tmp/ssa_doors.json','w'))
# ── the suites (3rd floor) along the left side, seen from the floor's desk ──
# The VIP room and the suites (suite rooms): rooms on the 3rd floor behind the 200s' back, each with a glass front
# and a balcony of two rows in front of it behind a glass balustrade (the VIP room 12 seats, a suite 8), boxed off
# from each other; not on the public seating map.
sel=(L2.R>0)&(X<0)&(np.abs(Z)<30)
xb=float(X[sel].min())-0.3        # the 200s' back line on the -x side, less a gap
SY=10.6; SR=0.4; SZ=29.0
bx=[]; zz=-SZ
for i in range(7): bx.append((zz,zz+4.0,8)); zz+=4.0
bx.append((zz,zz+6.0,12)); zz+=6.0
for i in range(7): bx.append((zz,zz+4.0,8)); zz+=4.0
off=-(zz+SZ)/2-(-SZ)          # centre the run on z=0
bx=[(round(a+off,2),round(b+off,2),n) for a,b,n in bx]
z0s,z1s=bx[0][0],bx[-1][1]
rect=lambda x0,x1,za,zb: [[round(x0,2),round(za,2)],[round(x1,2),round(za,2)],[round(x1,2),round(zb,2)],[round(x0,2),round(zb,2)]]
srows=[{'r':0,'y':SY,'y0':SY-0.45,'polys':[[rect(xb-1.0,xb,z0s,z1s)]]},
       {'r':1,'y':SY+SR,'y0':SY-0.45,'polys':[[rect(xb-2.1,xb-1.0,z0s,z1s)]]}]
Ss=[]
for za,zb,n in bx:
    per=n//2; used_=per*0.6; z0=(za+zb)/2-used_/2+0.3
    for r in (0,1):
        for k in range(per): Ss.append((xb-0.45-r*1.0,z0+k*0.6,r))
Ss=np.array(Ss)
enc=np.c_[np.round(Ss[:,0]*10),np.round(Ss[:,1]*10),Ss[:,2],np.full(len(Ss),90)].astype('<i2')
parts=[]
for za,zb,n in bx[1:]:
    parts.append([round(xb,2),round(za,2),round(xb-2.1,2),round(za,2),SY,round(SY+SR+1.1,2)])
glass_rail=[[round(xb-0.05,2),round(z0s,2),round(xb-0.05,2),round(z1s,2),SY-0.45,round(SY+1.1,2)]]
suites={'xf':round(xb,2),'xg':round(xb-2.25,2),'xr':round(xb-7.5,2),'y':SY+SR,'yc':round(SY+SR+3.0,2),'boxes':[[a,b,n] for a,b,n in bx]}
print('suites',len(bx),'seats',len(Ss),'front x',round(xb,2),'z',z0s,z1s)
floors=[{'y':y,'y0':y0,'polys':mask_polys(G,m)} for m,y0,y in slabs]
ow=contours(G,outer.astype(np.uint8),eps=0.03,minarea=100)
data={'levels':levels,'floors':floors,'flights':[{k:(round(float(v),3) if not isinstance(v,int) else v) for k,v in f.items()} for f in flights],
      'outer':[poly_out(p) for p in ow],'rooms':encl,'tunnels':tunnels_out(TUN),'suites':suites,'signs':SIGNS,'frames':FRAMES}
data['levels'].append({'name':'300S','D':1.0,'h0':SY,'rise':SR,'rows':srows,'steps':[],'holes':[],'voms':[],'partitions':parts,
                       'seats':base64.b64encode(enc.tobytes()).decode('ascii'),'rails':glass_rail,'walls':[]})
json.dump(data,open('ssa_stands.json','w'),separators=(',',':'))
print('json KB',os.path.getsize('ssa_stands.json')//1024,round(time.time()-T0,1))
pickle.dump((c200,c300,c400,c500),open('ssa_conc.pkl','wb'))
