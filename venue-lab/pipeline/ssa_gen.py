# Saitama Super Arena (arena mode, end stage 2): the stands laid out from the
# official seating map (ssa_chart.py -> ssa/ssa_chart.json, ssa_blocks.py): every
# seat where the map draws it, in the blocks and rows it has them, the doors at
# the map's 94 door badges; then the concourses, stairs, tunnels, walls and
# rails round them (standgen).
import sys, json, time, re, pickle, base64, os, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, sample, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels, front_parapet, cut_tunnels, tunnel_rows, tunnels_out, tunnel_decks
import ssa_blocks as SB, ssa_tunnels as ST, ssa_seats as SS
from scipy.spatial import cKDTree
T0=time.time()
G=Grid(-74,74,-68,68,0.1)
STRAIGHT.update(on=True,res=G.res)
C200,C300,C400,C500=6.2,11.44,16.2,23.0
CH=SB.load_chart(); OFF=SB.row_offsets(CH)
# each level's section (rake and depth of a row, the slab under a row): as before
SEC={'200':dict(D=0.865,h0=0.45,rise=0.33,bottom=lambda r,h: 0.0 if r<=24 else h-0.6,fascia=2.6),
     # (the 300 and 500 levels' fronts as the arena's photographs show them: the white band, front and parapet,
     # about 2.1 and 2.2 m, a door's height, with the parapet's 0.82 m: the front 1.3 and 1.4 m under the first row)
     # (the 300 and 500 levels, balconies hung over the tiers below: their undersides flat, level with the front's
     # foot, not stepped row by row; 3.9 and 4.4 m over the rows under them)
     '300':dict(D=1.0,h0=10.6,rise=0.42,bottom=lambda r,h: 10.6-1.3,fascia=1.3),
     '400':dict(D=0.85,h0=14.5,rise=0.42,bottom=0.5,fascia=1.3),
     '500':dict(D=0.87,h0=22.0,rise=0.5,bottom=lambda r,h: 22.0-1.4,fascia=1.4)}
# ── the doors: the map's 94 badges (the level is the number's hundreds), metres ──
DOORS={lv:{int(g):tuple(SB.to_metres(CH,v['centre'],lv)) for g,v in CH['gates'].items() if str(v['level'])==lv[0]} for lv in ('200','300','400','500')}
print('doors',{k:len(v) for k,v in DOORS.items()})
LV={}
def gap_gates(l,gates):
    """the doors that stand in a gap of the stand's treads (a vomitory's mouth, or a notch open at the back): {number: its gap}"""
    inv=((1-l.R)&(l.hull>0)&l.behind).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
    out={}
    for g,(x,z) in gates.items():
        i_,j_=[int(round(float(c))) for c in G.g(x,z)]
        k=lab[j_,i_]
        if k>0 and st[k,4]*G.res**2>=3.0: out[g]=lab==k
    return out
GAPDOOR={}
CORNER_BAY=lambda z: abs(z)>40.0         # the 200 level's corner notches: bays with a door, not vomitories
def corner_seams(l, reach=3.0):
    """The 400 level's four corner seams: where the end stand and the side stand meet, the map leaves a gap between
    their last blocks, a few metres across, which the aisles' closing does not take: a hole in the ring, its front
    rail and the band under it broken. Each is given back to the treads (as an aisle between the two stands), so the
    ring runs on round the corner. -> boolean masks, one for each seam"""
    gy,gx=np.mgrid[0:G.H,0:G.W]; X,Z=G.m(gx,gy)
    R=(l.R>0).astype(np.uint8)
    gap=(cv2.morphologyEx(R,cv2.MORPH_CLOSE,disk(reach/G.res))>0)&(R==0)&(l.hull>0)
    out=[]
    for sx in (1,-1):
        for sz in (1,-1):
            win=(np.sign(X)==sx)&(np.sign(Z)==sz)&(np.abs(X)>40.5)&(np.abs(X)<49.5)&(np.abs(Z)>35.5)&(np.abs(Z)<44.5)
            n,lab,st,_=cv2.connectedComponentsWithStats((gap&win).astype(np.uint8),connectivity=8)
            for i in range(1,n):
                if 3.0<=st[i,4]*G.res**2<=20.0: out.append(lab==i)
    print('400 corner seams filled',len(out),[round(float(m.sum()*G.res**2),1) for m in out])
    return out
for lv in ('200','300','400','500'):
    S_=SS.load_level(lv)          # the seats the official list numbers (ssa_seats.py), where the map draws them
    l0=SB.build_level(G,lv,S_,**SEC[lv]); gaps=gap_gates(l0,DOORS[lv])
    bays={g:m for g,m in gaps.items() if lv=='200' and CORNER_BAY(DOORS[lv][g][1])}
    GAPDOOR[lv]={g:m for g,m in gaps.items() if g not in bays}
    # a door stands at the end of a block (the stand's blocks are boxes, or pieces of one, with an aisle at each end): where
    # no block stands beyond that end the aisle is added beside it
    pts=[q for g,q in DOORS[lv].items() if g not in GAPDOOR[lv]]
    fills=list(bays.values())
    if lv=='400': fills+=corner_seams(l0)
    LV[lv]=SB.build_level(G,lv,S_,strips=SB.end_aisles(S_,pts,maxdist=3.6),fills=fills,**SEC[lv]); LV[lv].S=S_
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
for vs_ in VOMS.values():
    for v_ in vs_: v_['bridge']=True     # (the renderer lays a plate over the crack between a traced pit's mouth and the last tread)
print('voms',{k:len(v) for k,v in VOMS.items()},round(time.time()-T0,1))
for k,v in VOMS.items():
    for o in sorted(v,key=lambda o:(round(o['p'][0]/5),o['p'][1])): print('  ',k,[round(c,1) for c in o['p']],'w',o['w'],'L',o['L'],'T',o['T'])

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
        # (the depth's slope can turn at a stand's end: the way out is the way the nearby seats face from)
        S_=l.S; near_=np.linalg.norm(S_['P']-np.array([x,z]),axis=1)<4.0
        if near_.sum()>=3:
            vs=-np.array([np.sin(S_['yaw'][near_]).mean(),np.cos(S_['yaw'][near_]).mean()]); vs/=np.linalg.norm(vs)+1e-9
            if v@vs<np.cos(np.radians(30)): print('  door',g,'turned to its seats: %.0f deg'%np.degrees(np.arccos(np.clip(v@vs,-1,1))))
            else: vs=None
        else: vs=None
        t=0.0; last=p; gap=0
        while t<12.0:
            q=p+v*t; a_,b_=[int(round(float(c))) for c in G.g(q[0],q[1])]
            if not (0<=a_<G.W and 0<=b_<G.H): break
            if l.R[b_,a_]: last=q; gap=0
            else:
                gap+=1
                if gap>3: break                      # (a crack of a cell or two in the treads is not their end)
            t+=0.1
        out[g]=(last+v*0.05,v) if vs is None else (last+vs*0.05,vs)     # (found along the slope, facing as its seats do)
    return out
SNAP={name:snap_doors(l,DOORS[name],set(GAPDOOR[name])) for name,l in (('200',L2),('300',L3),('400',L4),('500',L5))}
print('doors snapped',{k:len(v) for k,v in SNAP.items()},'; farthest move from the badge %.1f m'%max(np.hypot(*(p-np.array(DOORS[k][g]))) for k,v in SNAP.items() for g,(p,_) in v.items()))

# ── the floor's corner tunnels: the map leaves a bowl of open floor at each of the floor's south corners (the north ones are
# behind the stage's masking), between the end stand's last block and the corner fan of blocks, a funnel in from the floor; a
# tunnel goes in along it, 7 m wide as a stadium's corner tunnel is: the funnel its open part, bounded by the stands' own end
# faces on the map's drawn outline (no wall of its own: a thin fence along the faces' tops), then covered, under the
# concourse to the building's wall. What the bowl has beside the faces is given to the stand (its rows going on into it,
# bare: the map has no seats there). ──
WALL_T=0.5                                       # the covered tunnel's walls' thickness
TREN=ST.corner_trenches(G,L2,theta=float(os.environ.get('SSA_TRENCH_THETA','32')))      # (SSA_TRENCH_THETA: the lean in degrees, 45 the diagonal, 0 straight back)
print('corner trenches',[(t['name'],t['o'].round(2).tolist(),t['u'].round(3).tolist(),'cuts',t['cuts']) for t in TREN],'; open cut',TREN[0]['open'],'m')
# the funnels follow the outline the map draws (ssa_corners.json, read off its image by ssa_outline.py): each corner as its own
# map has it
CORNERS=json.load(open('ssa/ssa_corners.json'))
FUN=ST.corner_funnels(G,L2,TREN,CORNERS)
OPEN=round(max([t['open'] for t in TREN]+[f['a_back'] for f in FUN]),2)
for t in TREN: t['open']=OPEN                    # (the pair alike: the tunnels begin where the back faces cross their lines)
# the north corners' bowls, with straight faces and fences as the south's (no outline drawn for them: their sides fitted
# to their own seats, ssa_tunnels.north_corners); the covered tunnels from their backs below
NCORN={}; NTREN=[]
for sx_ in (-1,1):
    c_,t_=ST.north_corners(L2,L2.S['block'],sx_); NCORN[t_['name']]=c_; NTREN.append(t_)
FUN+=ST.corner_funnels(G,L2,NTREN,NCORN,band=3.5,near=3.5,front_gap=3.5)
print('funnels',[(f['name'],'faces moved in by',f['shifts'],'back face at %.2f from the cut start'%f['a_back'],'open floor %.1f m2'%(f['mask'].sum()*G.res**2)) for f in FUN])
for f in FUN:
    print(f['name'],'treads in the open space, cut: %.1f m2, seats among them: %d'%(f['cut'].sum()*G.res**2,int((sample(G,f['cut'].astype(np.uint8),L2.seats)>0).sum())))
    L2.R[f['cut']]=0; L2.band[f['cut']]=-1
POCKET=np.zeros(L2.R.shape,bool)
for f in FUN: POCKET|=ST.fill_pocket(G,L2,f['pocket'])
print('given to the stand: %.1f m2'%(POCKET.sum()*G.res**2))
# the end stand's back: a block whose rows stop short of its neighbours' (the 200s' middle block, the 400s') has the rows go on, bare,
# to the same line, so the wall behind the stand is one straight wall (no door stands in either notch)
for l_ in (L2,L4):
    nm_,ref_=ST.back_notches(G,l_)
    if nm_.any(): ST.fill_pocket(G,l_,nm_); print('back of level',l_.name,'straightened to z %.1f: %.1f m2'%(ref_,nm_.sum()*G.res**2))
# the open floor of each funnel: no concourse storey stands in it
BOWLMASKS=[f['mask'] for f in FUN]

# ── the 300 and 500 balconies' ends: one straight line at each (along the rows' depth, a little past the rows' last
# seats) where the rows, and the concourse behind them, stop (see finish_ends) ──
def end_cuts(l,margin=0.35):
    S=l.S; P=S['P']; yaw=S['yaw']; row=S['row']
    cuts=[]
    for sx in (1,-1):
        for sz in (1,-1):
            m=(np.sign(P[:,0])==sx)&(np.sign(P[:,1])==sz)
            if m.sum()<5: continue
            phi=np.arctan2(np.abs(P[:,0]),np.abs(P[:,1]))
            idx=np.array([np.nonzero(m&(row==r))[0][np.argmax(phi[m&(row==r)])] for r in np.unique(row[m])])
            f=np.array([np.sin(yaw[idx]).mean(),np.cos(yaw[idx]).mean()]); f/=np.linalg.norm(f)
            e=np.array([-f[1],f[0]])
            if e@(P[idx].mean(0)-P[m].mean(0))<0: e=-e
            s=float((P[idx]@e).max())+margin
            cuts.append((e,s,f,P[idx].mean(0),sx,sz))
    return cuts
END_CUTS={lv:end_cuts(LV[lv]) for lv in ('300','500')}
def past_end(lv):
    """the cells past a balcony's end lines, each in its end's own quarter"""
    m=np.zeros(X.shape,bool)
    for e,s_,f,c,sx,sz in END_CUTS[lv]: m|=((X*e[0]+Z*e[1])>s_)&(np.sign(X)==sx)&(np.sign(Z)==sz)
    return m
# ── concourses ──
def dil(m,r): return cv2.dilate(m.astype(np.uint8),disk(r/G.res))>0
# (behind the north end stand, behind the stage, the concourse runs on as the south end's does: its doors 221-224 open
# onto it, and it joins the corners' concourses, so the 200 level's ring is whole)
backstage=np.zeros(X.shape,bool)
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
# the bowls stay open floor: no concourse storey standing in them
bowls=np.zeros_like(c200)
for m_ in BOWLMASKS: bowls|=m_
c200&=~dil(bowls,0.3)
# (the 300 level's blocks stand a 1.8 m aisle apart: the concourse runs on behind the aisles' heads)
ext3=cv2.morphologyEx(L3.extent.astype(np.uint8),cv2.MORPH_CLOSE,disk(2.5/G.res))>0
c300&=ext3
# the 500 level's blocks stand in separate pieces with the doors' aisles at their ends; the corridor behind them runs
# on across the gaps (bays at the doors), no further than the ring's own ends
ext5=cv2.morphologyEx(L5.extent.astype(np.uint8),cv2.MORPH_CLOSE,disk(7.0/G.res))>0
c500&=ext5
c500=cv2.morphologyEx(c500.astype(np.uint8),cv2.MORPH_CLOSE,disk(2.0/G.res))>0
c300=tidy(c300,0.8,10); c500=tidy(c500,0.8,10)
# (the concourses behind the balconies stop on the balconies' end lines: the end one flat face, cheek and wall)
c300&=~past_end('300'); c500&=~past_end('500')
c300=tidy(c300,0.8,10); c500=tidy(c500,0.8,10)
print('concourses',round(time.time()-T0,1),{k:round(float(c.sum()*G.res**2)) for k,c in (('200',c200),('300',c300),('400',c400),('500',c500))})

# ── the suites (3rd floor) along the left side, seen from the floor's desk ──
# The VIP room and the suites (suite rooms): rooms on the 3rd floor behind the 200s' back, each with a glass front
# and a balcony of two rows in front of it behind a glass balustrade (the VIP room 12 seats, a suite 8), boxed off
# from each other; not on the public seating map. Each room has a door in its glass front onto its balcony and one in
# its back wall onto a corridor that runs along the rooms (a catwalk over the 200 concourse's ceiling) and down a stair
# at each end to the concourse.
sel=(L2.R>0)&(X<0)&(np.abs(Z)<30)
xb=float(X[sel].min())-0.3        # the 200s' back line on the -x side, less a gap
SY=10.6; SR=0.4; SZ=29.0; SUY=SY+SR
bx=[]; zz=-SZ
for i in range(7): bx.append((zz,zz+4.0,8)); zz+=4.0
bx.append((zz,zz+6.0,12)); zz+=6.0
for i in range(7): bx.append((zz,zz+4.0,8)); zz+=4.0
off=-(zz+SZ)/2-(-SZ)          # centre the run on z=0
bx=[(round(a+off,2),round(b+off,2),n) for a,b,n in bx]
z0s,z1s=bx[0][0],bx[-1][1]
XR=xb-7.5; CORR_W=2.0          # the rooms' back wall, the corridor's width
xc1=XR-0.3; xc0=xc1-CORR_W    # the corridor behind the back wall
corr=(X>=xc0)&(X<=xc1)&(Z>=z0s-0.3)&(Z<=z1s+0.3)

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
# nothing stands in front of a door or at the foot of a vomitory (a stair's flank across it)
keepclear=np.zeros_like(used)
def clear_zone(x,z,dx,dz,L,w):
    fp=footprint(x,z,dx,dz,L,w,step=0.1)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); keepclear[np.clip(np.round(gz_).astype(int),0,G.H-1),np.clip(np.round(gx_).astype(int),0,G.W-1)]=True
for name,sn in SNAP.items():
    for g,(p,v) in sn.items(): clear_zone(p[0]-0.2*v[0],p[1]-0.2*v[1],v[0],v[1],2.0,2.4)
for name,vs in VOMS.items():
    for vm in vs:
        e=np.array(vm['p'])+np.array(vm['u'])*(vm['L']+vm['T']-0.3); clear_zone(e[0],e[1],vm['u'][0],vm['u'][1],2.0,2.8)
flights=[]
# the corridor's stairs: down from each end, beyond the rooms' run, to the 200 concourse; the corridor's floor runs out
# over their landings
rooms_zone=(X>=xc0-1.0)&(X<=xb)&(Z>=z0s-0.5)&(Z<=z1s+0.5)
for sg in (1,-1):
    za,zb=(z1s+0.3,z1s+3.3) if sg>0 else (z0s-3.3,z0s-0.3)
    plat=(X>=xc0)&(X<=xc0+9.0)&(Z>=za)&(Z<=zb)
    f=find_flight(c200,plat,C200,SUY,(xc0+4.5,sg*(abs(za)+3.0)),standany|used|keepclear|rooms_zone)
    print('suites stair','south' if sg>0 else 'north',f and {k:round(float(v),1) for k,v in f.items()})
    if not f: continue
    flights.append(f); mark(f)
    tx,tz=f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L']
    gx_,gz_=G.g(*footprint(tx,tz,f['dx'],f['dz'],2.0,WID+0.6,step=0.05).T)
    land=np.zeros_like(corr); land[np.clip(np.round(gz_).astype(int),0,G.H-1),np.clip(np.round(gx_).astype(int),0,G.W-1)]=True
    corr|=cv2.dilate(land.astype(np.uint8),disk(0.3/G.res))>0
    corr|=(X>=xc0)&(X<=xc1)&(Z*sg>=(z1s+0.3 if sg>0 else -z0s+0.3))&(Z*sg<=abs(tz)+0.4)
for sz in (1,-1):
    for sx in (1,-1):
        for lo,up,y0,y1,near in ((c200,c300,C200,C300,(sx*22,sz*60)),(c300,c400,C300,C400,(sx*30,sz*57)),(c400,c500,C400,C500,(sx*12,sz*59)),(c200,c400,C200,C400,(sx*52,sz*48))):
            f=find_flight(lo,up,y0,y1,near,standany|used|keepclear)
            print('flight',sx,sz,y0,y1,f and {k:round(float(v),1) for k,v in f.items()})
            if f: flights.append(f); mark(f)
# a door whose aisle stands well above the concourse's floor (a stand's back rows run up past it): the door's sill is
# up at the aisle's level and a short stair goes down from it to the floor
LVL={'200':(C200,L2),'300':(C300,L3),'400':(C400,L4),'500':(C500,L5)}
RAISED={}
# (what stands over a cell: the undersides of every level's rows, and of the concourses' slabs over the 200 level's, for the
# stairs' headroom)
from standgen import level_solid
_UNDER=[level_solid(l__)[0] for l__ in (L2,L3,L4,L5)]+[np.where(c__,y__-0.35,np.nan).astype(np.float32) for c__,y__ in ((c300,C300),(c400,C400),(c500,C500))]
def stair_headroom(p,u,y_top,y_bot,L_,w=1.6):
    """the least headroom over a stair from p (at y_top) down along u for L_ (to y_bot)"""
    t=np.array([-u[1],u[0]]); lo=99.0
    for a in np.arange(0.0,L_+0.31,0.2):
        ys=y_top-(y_top-y_bot)*min(1.0,a/L_)
        for b in np.linspace(-w/2,w/2,5):
            q=p+u*a+t*b; i_,j_=[int(round(float(c))) for c in G.g(*q)]
            if not (0<=i_<G.W and 0<=j_<G.H): continue
            for B in _UNDER:
                bb=B[j_,i_]
                if bb==bb and bb>ys+0.3: lo=min(lo,bb-ys)
    return lo
for name,sn in SNAP.items():
    yc_,l_=LVL[name]
    for g,(p,v) in sn.items():
        a_,b_=[int(round(float(c))) for c in G.g(*(p-v*0.4))]
        if not (0<=a_<G.W and 0<=b_<G.H) or l_.band[b_,a_]<0: continue
        yp=float(l_.h(l_.band[b_,a_]))
        if yp-yc_<=0.3: continue
        n=int(np.ceil((yp-yc_)/RISE)); L_=n*RUN
        RAISED[(name,g)]=yp
        # the stair straight out from the door, unless the next stand's back rows hang too low over it: then turned (the
        # least turn that leaves a head's room over all of it) on its landing at the door
        best=None
        for ang in (0,10,-10,20,-20,30,-30,40,-40,50,-50,60,-60):
            c_,s_=np.cos(np.radians(ang)),np.sin(np.radians(ang)); u=np.array([v[0]*c_-v[1]*s_,v[0]*s_+v[1]*c_])
            hr=stair_headroom(p,u,yp,yc_,L_)
            if best is None or hr>best[1]+1e-6: best=(u,hr,ang)
            if hr>=2.3: best=(u,hr,ang); break
        u,hr,ang=best
        if ang: print('  door',g,'its stair turned %d deg: headroom %.2f m'%(ang,hr))
        st=p
        flights.append(dict(x=float(st[0]+u[0]*L_),z=float(st[1]+u[1]*L_),dx=float(-u[0]),dz=float(-u[1]),n=n,L=L_,y0=yc_,y1=yp))
print('raised doors',{k:round(h,2) for k,h in RAISED.items()})
for f in flights:
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L']-0.3,WID+0.4,step=0.05)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
    for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500)):
        if f['y0']<y<=f['y1']+0.01 and y!=f['y1']: c[gz_,gx_]=False
        if y==f['y1']:
            m=np.zeros_like(c); m[gz_,gx_]=True; c&=~m
print('flights',len(flights),round(time.time()-T0,1))

# ── the doors' numbers on the vomitories ──
for name,vs in VOMS.items():
    gs=DOORS[name]
    for v in vs:
        k=min(gs,key=lambda g: np.hypot(gs[g][0]-v['p'][0],gs[g][1]-v['p'][1])); v['label']=str(k)
# ── the floor's corner tunnels ──
# Each trench goes on under the stand and the concourse's storey to the building's wall, shut there by its doors: the funnel
# an open cut through the rows too low to pass under (to the back face, at the least), then covered, its walls (inside, under
# the stand) thick, their faces straight and parallel.
TUN_H=4.4
body_=((L2.R>0)|(L2.hull>0)|c200)&(hull>0)       # what a tunnel runs under, before the cuts
def to_wall(p,u,step=0.2):
    """how far a line out from p goes inside the building's outline"""
    L=0.0
    while L<80.0:
        q=p+u*L; i_,j_=[int(round(float(c))) for c in G.g(q[0],q[1])]
        if not (0<=i_<G.W and 0<=j_<G.H) or not hull[j_,i_]: break
        L+=step
    return L
# The tunnels from the funnels: each one's whole back face its mouth (the square opening as wide as the wall, the
# user's ask), straight out from it, under the stands and the concourse to the building's wall; as high as the
# lowest row over it leaves room for (TUN_H at most), so the rows and their seats over it stay
gy_,gx_=np.mgrid[0:G.H,0:G.W]; XG,ZG=G.m(gx_,gy_)
TUN=[]
for f in FUN:
    a_,b_=f['back_seg']; u_=-np.asarray(f['back_n'],float); u_/=np.linalg.norm(u_)
    p_=(a_+b_)/2; w_=float(np.hypot(*(b_-a_)))-0.1; v_=np.array([-u_[1],u_[0]])
    al=(XG-p_[0])*u_[0]+(ZG-p_[1])*u_[1]; la=np.abs((XG-p_[0])*v_[0]+(ZG-p_[1])*v_[1])
    foot=(la<w_/2+0.3)&(al>0)&(al<to_wall(p_,u_))&(L2.band>=0)
    lowest=float(L2.h(L2.band[foot]).min()) if foot.any() else 9.0
    h=round(min(TUN_H,lowest-0.65),2)
    TUN.append({'p':p_.round(3).tolist(),'u':u_.round(4).tolist(),'w':round(w_,2),'h':h,'closed':True,'covered':True,'Lmax':80.0,'name':f['name'],
                'T':WALL_T,'sidesAsWalls':True,'along_margin':0.0,'slab':0.6})
    print('corner tunnel',f['name'],'mouth',TUN[-1]['p'],'w',TUN[-1]['w'],'h',h,'lowest tread over it',round(lowest,2))
for pair in (('SE','SW'),('NE','NW')):                 # (each end's pair one height)
    hh=min(t['h'] for t in TUN if t['name'] in pair)
    for t in TUN:
        if t['name'] in pair: t['h']=hh
TUNM=cut_tunnels(G,L2,TUN,body_,back=0.0)
# the funnels have no wall (the stands' own faces): no rail along the treads' edges there, a fence of their own on the faces
# (ST.funnel_fences), nor along the covered tunnel
WALLZONE=np.zeros(L2.R.shape,bool)
for t in TUN:
    p_,u_=np.asarray(t['p'],float),np.asarray(t['u'],float); v_=np.array([-u_[1],u_[0]])
    al=(X-p_[0])*u_[0]+(Z-p_[1])*u_[1]; la=np.abs((X-p_[0])*v_[0]+(Z-p_[1])*v_[1])
    WALLZONE|=(la<=t['w']/2+0.8)&(al>=-0.2)&(al<=t['L'])
for f in FUN: WALLZONE|=f['zone']
FENCES=[]; FUNWALLS=[]
# each straight piece of a funnel's faces: the rows' ends step up it, row by row; a wall laid over them on the face's line,
# from the floor up to one straight slope just over every step (the steps are under it, not seen), and the fence on that
# slope, not stepping with the rows
for f in FUN:
    segs=ST.funnel_fences(G,L2,f,floor=C200)
    path,norms=f['path'],f['normals']; i0=0
    for k in range(len(path)-1):
        a,b=np.asarray(path[k],float),np.asarray(path[k+1],float); Lk=float(np.hypot(*(b-a)))
        m=max(1,int(np.ceil(Lk/0.25))); piece=segs[i0:i0+m]; i0+=m
        if not piece: continue
        u=(b-a)/max(Lk,1e-9)
        S0=[(np.array(p[:2])-a)@u for p in piece]; S1=[(np.array(p[2:4])-a)@u for p in piece]; H=[p[4] for p in piece]
        if max(H)-min(H)<0.2 or max(H)>C200-0.1:          # (a level piece, or one along the concourse: as it was)
            FENCES+=piece; continue
        B_=(H[-1]-H[0])/max(S1[-1]-S0[0],1e-6)
        A_=max(max(h-B_*s0_,h-B_*s1_) for h,s0_,s1_ in zip(H,S0,S1))
        top=lambda s_: A_+B_*s_
        FENCES+=[[p[0],p[1],p[2],p[3],round(top(s0_),3),round(top(s1_),3)] for p,s0_,s1_ in zip(piece,S0,S1)]
        n_=np.asarray(norms[k],float); rn=np.array([u[1],-u[0]])
        pa,pb,ya,yb=(a,b,top(0.0),top(Lk)) if rn@n_<0 else (b,a,top(Lk),top(0.0))     # (thick away from the open floor)
        FUNWALLS.append([round(float(pa[0]),2),round(float(pa[1]),2),round(float(pb[0]),2),round(float(pb[1]),2),0.0,round(ya,2),0.0,round(yb,2),0.3,'struct'])
print('funnels\' faces walled on the slope: %d pieces'%len(FUNWALLS))
print('corner tunnels',[(t['name'],[round(float(c),1) for c in t['p']],t['w'],'L',t['L'],'open cut',t['deck']) for t in TUN],'; funnel fences',len(FENCES),'segments')
slabs=[(grow_under(c,y,[L2,L3,L4,L5]),(0.0 if y==C200 else y-0.35),y) for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500))]
slabs.append((corr,SUY-0.45,SUY))        # the suites' corridor
# under the 200 concourse the tunnels run on hollow
s0_=slabs[0][0]; slabs[0]=(s0_&~TUNM,0.0,C200)
if (s0_&TUNM).any(): slabs.insert(1,(s0_&TUNM,TUN_H,C200))
t=time.time()
doors={k:[tuple(p) for p,_ in v.values()] for k,v in SNAP.items()}
# (no part of a concourse left open onto the bowl: every one closed in, walls and ceiling, all round)
rooms=[{'name':name,'mask':cm,'y':cy,'cl':4.0,'own':[],'doors':doors[name],'open':getattr(l,'pits',None),'toroof':name in ('400','500')}
       for name,l,cm,cy in (('200',L2,c200,C200),('300',L3,c300,C300),('400',L4,c400,C400),('500',L5,c500,C500))]
for name,cm in (('200',c200),('400',c400)): trim_tunnels(G,VOMS[name],cm)
encl,roomtop=enclose(G,rooms,[L2,L3,L4,L5],slabs,flights)
print('enclose',round(time.time()-t,1),{k:len(v) for k,v in encl.items()})
# The 400 level's concourse: where nothing stands over it (no 500 level: down the sides and round the corners) its walls
# go on up to the arena's ceiling, so from the 500 balconies one looks at a wall, not over it onto the concourse's top;
# its own ceiling stays where it is
ROOF=30.0
from shapely.geometry import Polygon as SPoly, LineString as SLine
from shapely.strtree import STRtree
over4=dil((L5.band>=0)|(L5.hull>0)|c500,0.4)
def walls_to_roof(walls,top=20.5,piece=1.0):
    out=[]; n_=0
    for w in walls:
        if abs(w[5]-top)>0.05 or w[4]<15.5: out.append(w); continue
        a=np.array(w[:2],float); b=np.array(w[2:4],float); L=float(np.hypot(*(b-a)))
        if L<1e-6: out.append(w); continue
        u=(b-a)/L; nv=np.array([-u[1],u[0]]); k=max(1,int(np.ceil(L/piece)))
        for j in range(k):
            p0=a+(b-a)*j/k; p1=a+(b-a)*(j+1)/k; m=(p0+p1)/2; hi=w[5]
            if not any(over4[int(round(float(gz))),int(round(float(gx)))] for gx,gz in [G.g(*(m+nv*s)) for s in (0.6,-0.6,0.0)]):
                hi=ROOF; n_+=1
            out.append([*p0.round(2),*p1.round(2),w[4],hi])
    print('400 walls raised to the ceiling: %d pieces'%n_)
    return merge_runs(out)
from standgen import merge_runs
encl['walls']=walls_to_roof(encl['walls'])
# ── the 400 level's bowl wall: between its concourse and the bowl one wall, on the stand's outline (smoothed of the
# raster's steps), from the concourse's slab up to whatever stands over it (the 500 balcony's flat underside, its
# concourse's slab) or the arena's ceiling, 0.3 m thick into the concourse; the doors cut through it as through any
# wall (lintels over them). The concourse's own walls along that line, in pieces of differing heights with the
# doors' gaps run to the ceiling, go. ──
def bowl_wall(l,floor_y,yb,over,keep_off=0.6,piece=0.5,doors=(),skip=None,min_h=0.0,need_over=False,behind=None):
    m=((l.R>0)|(getattr(l,'pits',None) if getattr(l,'pits',None) is not None else False)).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,disk(0.4/G.res))
    # (a raised door stands in a notch of the outline, the aisle's head: the notch filled to the door's own line, so the
    # wall runs straight across it, through the door)
    for p_,v_ in doors:
        al_=(X-p_[0])*v_[0]+(Z-p_[1])*v_[1]; la_=np.abs(-(X-p_[0])*v_[1]+(Z-p_[1])*v_[0])
        box_=(la_<1.8/2+0.9)&(al_<0)&(al_>-3.5)
        # (only as far back as the stand: the box's cells with the stand somewhere behind them on their line)
        m[box_]=1
        # (and the treads' ends just past the door's line beside it cut back to it, short of the seats there 1.6 m out:
        # the wall straight across the door and its jambs)
        m[(la_<1.3)&(al_>=0)&(al_<1.5)]=0
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    cs=[c for c in cs if cv2.contourArea(c)*G.res**2>200]
    out=[]
    for c in cs:
        P=np.c_[G.m(c[:,0,0].astype(float),c[:,0,1].astype(float))]
        ring=SPoly(P).buffer(0.02).simplify(0.15)
        R_=np.array(ring.exterior.coords)
        # (its gentle bends rounded, as the concourses' walls are: Chaikin's cut at bends under 35 deg)
        for _ in range(2):
            Q_=[R_[0]]
            for k in range(1,len(R_)-1):
                a,b,c=R_[k-1],R_[k],R_[k+1]; u1=b-a; u2=c-b; l1,l2=np.linalg.norm(u1),np.linalg.norm(u2)
                if l1<1e-6 or l2<1e-6: continue
                ang=np.degrees(np.arccos(np.clip(u1@u2/l1/l2,-1,1)))
                if ang<35 and min(l1,l2)>0.3: c_=min(0.25*min(l1,l2),0.4); Q_+=[b-u1/l1*c_,b+u2/l2*c_]
                else: Q_.append(b)
            Q_.append(R_[-1]); R_=np.array(Q_)
        # clockwise in x, z: each piece's left side (where the renderer lays the thickness) the concourse's
        if SPoly(R_).exterior.is_ccw: R_=R_[::-1]
        for k in range(len(R_)-1):
            a,b=R_[k],R_[k+1]; L_=float(np.hypot(*(b-a)))
            if L_<1e-6: continue
            u=(b-a)/L_; nl=np.array([-u[1],u[0]]); n_=max(1,int(np.ceil(L_/piece)))
            for j in range(n_):
                p0=a+(b-a)*j/n_; p1=a+(b-a)*(j+1)/n_; mid=(p0+p1)/2
                top=ROOF
                for q in (mid,mid+nl*0.3,mid-nl*0.3):
                    i_,j_=[int(round(float(cc))) for cc in G.g(*q)]
                    if not (0<=i_<G.W and 0<=j_<G.H): continue
                    for B in over:
                        bb=B[j_,i_]
                        if bb==bb and floor_y+2.7<bb<top: top=float(bb)
                if skip is not None and skip(mid): continue
                if top-yb<min_h: continue
                if need_over and top>=ROOF: continue                     # (nothing over it: open to the bowl's air)
                if behind is not None:
                    i_,j_=[int(round(float(cc))) for cc in G.g(*(mid+nl*0.4))]
                    if not (0<=i_<G.W and 0<=j_<G.H and behind[j_,i_]): continue   # (not over its concourse)
                out.append([round(float(p0[0]),2),round(float(p0[1]),2),round(float(p1[0]),2),round(float(p1[1]),2),round(yb,2),round(top,2)])
    return merge_runs(out)
BOWL4=bowl_wall(L4,C400,C400-0.35,[level_solid(L5)[0],np.where(c500,C500-0.35,np.nan).astype(np.float32)],doors=[SNAP['400'][g_] for (n_,g_) in RAISED if n_=='400' and g_ in SNAP['400']])
_bl=[SLine([(w[0],w[1]),(w[2],w[3])]) for w in BOWL4]; _bt=STRtree(_bl)
def _near_bowl(w,d=0.6):
    q=SLine([(w[0],w[1]),(w[2],w[3])]).interpolate(0.5,normalized=True)
    return any(_bl[i].distance(q)<d for i in _bt.query(q.buffer(d)))
_n0=len(encl['walls'])
encl['walls']=[w for w in encl['walls'] if not (w[4]>=C400-0.6 and w[5]>C400+0.5 and w[4]<C500-0.5 and _near_bowl(w))]
encl['walls']+=BOWL4
print('400 bowl wall: %d panels, %.0f m; the concourse\'s walls along it taken out: %d'%(len(BOWL4),sum(np.hypot(w[2]-w[0],w[3]-w[1]) for w in BOWL4),_n0-len(encl['walls'])+len(BOWL4)))
# ── the 200 level's back, over its concourse: past the stand's last rows, between the concourse's ceiling and what stands
# over it (the 400 level's rows, a slab), the gap seen from the seats closed by a wall on the stand's outline, from just
# under that ceiling up; but along the suites' glass fronts (the west side between their ends), which are the wall there ──
_SUZ=(z0s-0.2,z1s+0.2)
BOWL2=bowl_wall(L2,C200,C200+4.0-0.05,[level_solid(L3)[0],level_solid(L4)[0],level_solid(L5)[0]]+[np.where(c_,y_-0.35,np.nan).astype(np.float32) for c_,y_ in ((c300,C300),(c400,C400),(c500,C500))]+[np.where(corr,SUY-0.45,np.nan).astype(np.float32)],
                skip=lambda q: q[0]<0 and _SUZ[0]<q[1]<_SUZ[1],min_h=0.3,need_over=True,behind=dil(c200,0.3))
encl['walls']+=BOWL2
print('200 upper bowl wall: %d panels, %.0f m'%(len(BOWL2),sum(np.hypot(w[2]-w[0],w[3]-w[1]) for w in BOWL2)))
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
    if name=='200':
        rows_=ST.clip_rows(rows_,[f['poly'] for f in FUN])      # (the faces straight to the line)
        rows_=tunnel_rows(rows_,TUN); dr_,drl_=tunnel_decks(G,L2,TUN); rows_+=dr_; rails+=drl_
        # the bowls' sides and the tunnels' cuts have walls of their own: no rail along the treads' edges there
        zone=WALLZONE
        def inzone(r):
            a,b=G.g((r[0]+r[2])/2,(r[1]+r[3])/2); a=int(round(float(a))); b=int(round(float(b)))
            return 0<=a<G.W and 0<=b<G.H and zone[b,a]
        rails=[r for r in rails if not inzone(r)]
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,'rows':rows_,'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),'partitions':[],
                   'seats':l.seats_out(),'rails':rails,'walls':walls,'fences':FENCES if name=='200' else [],'slopeWalls':FUNWALLS if name=='200' else []})
    print(name,'rows',len(levels[-1]['rows']),'steps',len(levels[-1]['steps']),'rails',len(rails),'walls',len(walls),round(time.time()-T0,1))
# ── the 300 and 500 balconies' ends: each cut square on one straight line (along the rows' depth, a little past the
# rows' last seats), every row run on to it, and closed there by a flat concrete cheek from the flat underside up
# to the rail's height over each row; the old end pieces and the rails past the line go, and the front's parapet
# and the rows' outlines are smoothed of the raster's steps ──
from shapely.geometry import Polygon as SPoly, LineString as SLine, MultiPolygon as SMulti
from shapely.ops import unary_union as sunion
from shapely import affinity as saff
def _polys_of(g):
    g=g.buffer(0)
    return [g] if isinstance(g,SPoly) else [p for p in getattr(g,'geoms',[]) if isinstance(p,SPoly)]
def _rows_geom(r):
    return sunion([SPoly(p[0],p[1:]).buffer(0) for p in r['polys'] if len(p[0])>=3])
def _out_poly(g):
    out=[]
    for p in _polys_of(g):
        if p.area<0.02: continue
        out.append([[[round(x,2),round(z,2)] for x,z in list(p.exterior.coords)[:-1]]]+[[[round(x,2),round(z,2)] for x,z in list(h.coords)[:-1]] for h in p.interiors])
    return out
def smooth_rails(rails,tol=0.15):
    """chains of rail panels at one height, end to end, as polylines smoothed of the raster's 0.1 m steps"""
    out=[]; i=0
    while i<len(rails):
        ch=[rails[i]]; j=i+1
        while j<len(rails) and abs(rails[j][0]-ch[-1][2])<0.03 and abs(rails[j][1]-ch[-1][3])<0.03 and rails[j][4:6]==ch[-1][4:6]: ch.append(rails[j]); j+=1
        if len(ch)<3: out+=ch
        else:
            ln=SLine([(c[0],c[1]) for c in ch]+[(ch[-1][2],ch[-1][3])]).simplify(tol)
            cs=list(ln.coords)
            for a,b in zip(cs[:-1],cs[1:]): out.append([round(a[0],2),round(a[1],2),round(b[0],2),round(b[1],2),ch[0][4],ch[0][5]])
        i=j
    return out
def finish_ends(entry,l,flat,rail=1.0,front_top=0.8):
    rows=entry['rows']; G_={r['r']:_rows_geom(r) for r in rows}
    cuts=END_CUTS[entry['name']]
    def beyond(e,s,sx,sz):
        # the half-plane past the line, as a large polygon, within the end's own quarter (the line runs on across the others)
        o=e*s; t=np.array([-e[1],e[0]])*90
        q=SPoly([(0,0),(sx*90,0),(sx*90,sz*90),(0,sz*90)])
        return SPoly([o+t,o-t,o-t+e*90,o+t+e*90]).intersection(q)
    cheeks=[]; faces=[]
    cm_=c300 if entry['name']=='300' else c500; cy_=C300 if entry['name']=='300' else C500
    for e,s,f,c,sx,sz in cuts:
        H=beyond(e,s,sx,sz); near=beyond(e,s-1.2,sx,sz); onl=[]
        for r in rows:
            g=G_[r['r']]
            if g.is_empty or not g.intersects(near): continue
            # the row's last metre run on, unchanged in section, to the line
            tail=g.intersection(near).difference(H)
            if not tail.is_empty and tail.area>0.01:
                ext=[tail]+[saff.translate(tail,*(e*k*0.1)) for k in range(1,16)]
                g=sunion([g]+ext)
            g=g.difference(H)
            G_[r['r']]=g
            # the cheek on the line across this row
            ln=SLine([c+e*0+(e*s-e*(c@e))-f*40,c+(e*s-e*(c@e))+f*40]).intersection(g.buffer(0.01))
            for seg in ([ln] if isinstance(ln,SLine) else list(getattr(ln,'geoms',[]))):
                if not isinstance(seg,SLine) or seg.length<0.1: continue
                (ax,az),(bx,bz)=seg.coords[0],seg.coords[-1]
                onl.append((r['r'],r['y'],np.array([ax,az]),np.array([bx,bz])))
        # the end's face: one flat wall on the line from the front row's front to the last row's back, from the flat
        # underside to the parapet's top at the front and the rail's over the last row at the back (its top on the
        # slope of the rows); on behind it to the concourse's back, closed from the underside up to the concourse's
        # floor (its own wall stands on from there), 0.25 m thick, in the front's finish
        if onl:
            o=c+e*(s-c@e)                                     # (a point on the line)
            P_=[q for _,_,a_,b_ in onl for q in (a_,b_)]; k_=[(q-o)@f for q in P_]
            F=P_[int(np.argmax(k_))]; B=P_[int(np.argmin(k_))]
            yF=min(y_ for _,y_,_,_ in onl)+front_top; yB=max(y_ for _,y_,_,_ in onl)+rail
            # the concourse behind: from B back along the line while the concourse is there
            k=0.0
            while k<12.0:
                i_,j_=[int(round(float(cc))) for cc in G.g(*(B-f*(k+0.1)-e*0.3))]
                if not (0<=i_<G.W and 0<=j_<G.H and cm_[j_,i_]): break
                k+=0.1
            Bc=B-f*k
            def face(a_,b_,ya0,ya1,yb0,yb1):
                # (thick inward, away from the end: thickPanel lays it out to the right of a->b)
                d_=b_-a_; rn=np.array([d_[1],-d_[0]])
                if rn@e>0: a_,b_,ya0,ya1,yb0,yb1=b_,a_,yb0,yb1,ya0,ya1
                faces.append([round(float(a_[0]),2),round(float(a_[1]),2),round(float(b_[0]),2),round(float(b_[1]),2),round(ya0,2),round(ya1,2),round(yb0,2),round(yb1,2),0.25,'front'])
            face(F,B,flat,yF,flat,yB)
        # what stood past the line, or along it at the end (the old end pieces): gone
        def keep(w):
            a=np.array(w[:2]); b=np.array(w[2:4]); u=b-a; L=np.linalg.norm(u)
            if not (np.sign((a+b)[0])==sx and np.sign((a+b)[1])==sz): return w
            if (a@e>s+0.02 and b@e>s+0.02): return None
            if L>1e-6 and abs(u@f)/L>0.6 and min(a@e,b@e)>s-0.9 and np.linalg.norm((a+b)/2-c)<12: return None
            if a@e>s+0.02 or b@e>s+0.02:            # clipped at the line
                ta=(s-a@e)/((b-a)@e)
                q=a+(b-a)*ta
                a,b=(a,q) if a@e<=s else (q,b)
            return [round(float(a[0]),2),round(float(a[1]),2),round(float(b[0]),2),round(float(b[1]),2),w[4],w[5]]
        entry['rails']=[w2 for w2 in (keep(w) for w in entry['rails']) if w2 is not None]
        entry['steps']=[st for st in entry['steps'] if not SPoly(st['polys'][0]).buffer(0).centroid.within(H)]
    for r in rows:
        r['polys']=_out_poly(G_[r['r']].simplify(0.06))
    entry['rails']=smooth_rails(entry['rails'])
    entry['slopeWalls']=faces
    print('balcony',entry['name'],'ends cut',len(cuts),'end faces',len(faces),[(round(float(s),2),e.round(2).tolist()) for e,s,*_ in cuts])
for entry_ in levels:
    if entry_['name'] in ('300','500'):
        finish_ends(entry_,LV[entry_['name']],SEC[entry_['name']]['bottom'](0,0))
# ── the stands' backs where they stand over the concourse behind them (a drop of more than a rail's worth: the 400
# level's long sides, 8 m over their concourse; the corners' raised doors): a wall up from the concourse's floor at the
# treads' back edge to its ceiling (the 400 level's, where nothing stands over it: to the arena's ceiling), not a rail
# with the concourse's floor seen past it; the doors cut through it as through any wall ──
def back_walls(entry,l,cm,cy,top_of):
    keep=[]; made=[]
    for w in entry['rails']:
        a=np.array(w[:2]); b=np.array(w[2:4]); L_=float(np.hypot(*(b-a)))
        if L_<1e-6 or w[5]-w[4]<0.7 or w[5]-w[4]>1.3: keep.append(w); continue          # (the back edge's own rails: a rail's height)
        m=(a+b)/2; u=(b-a)/L_; n_=np.array([-u[1],u[0]])
        side=[]
        for sg in (1,-1):
            i_,j_=[int(round(float(c))) for c in G.g(*(m+n_*sg*0.5))]
            side.append((i_,j_) if 0<=i_<G.W and 0<=j_<G.H else None)
        ins=[s_ for s_ in side if s_ is not None and l.R[s_[1],s_[0]]>0]; out=[s_ for s_ in side if s_ is not None and l.R[s_[1],s_[0]]==0]
        if len(ins)!=1 or len(out)!=1: keep.append(w); continue
        (ii,ij),(oi,oj)=ins[0],out[0]
        if l.d[ij,ii]<3.0 or (entry['name']=='200' and WALLZONE[oj,oi]): keep.append(w); continue   # (a front, or a funnel's side)
        if not cm[oj,oi]: keep.append(w); continue                     # (not over its concourse)
        if w[4]-cy<0.6: keep.append(w); continue
        made.append([w[0],w[1],w[2],w[3],round(cy,2),round(float(top_of(oi,oj,w[4])),2)])
    entry['rails']=keep; entry['walls']=entry['walls']+merge_runs(smooth_rails(made,0.12))
    print('back walls',entry['name'],len(made),'pieces, %.0f m'%sum(np.hypot(p[2]-p[0],p[3]-p[1]) for p in made))
def _top200(oi,oj,h): 
    t=roomtop[oj,oi]; return t if np.isfinite(t) and t>h+0.5 else C200+4.0
def _top400(oi,oj,h):
    if not over4[oj,oi]: return ROOF
    t=roomtop[oj,oi]; return t if np.isfinite(t) and t>h+0.5 else C400+4.0
for entry_ in levels:
    if entry_['name']=='200': back_walls(entry_,L2,c200,C200,_top200)
    if entry_['name']=='400': back_walls(entry_,L4,c400,C400,_top400)
# ── the doors' frames and number plates (one plate on each face of the wall over the opening), and a check that
# nothing stands in an opening ──
DOOR_W,DOOR_H=1.8,2.5
FL={'200':(C200,L2),'300':(C300,L3),'400':(C400,L4),'500':(C500,L5)}
# what hangs over the way through a door: the concourses' ceilings and the stands' undersides (soffits), the slabs and
# rows over it -> the lowest over the opening and the first metre or so beyond
from shapely.geometry import Point as SPt
from shapely.prepared import prep as sprep
OVER=[(c['y'],sprep(sunion([SPoly(p[0],p[1:]).buffer(0) for p in c['polys']]))) for c in encl['ceils']+encl['soffits']]
OVER+=[(y0_,sprep(sunion([SPoly(p[0],p[1:]).buffer(0) for p in mask_polys(G,m_)]))) for m_,y0_,_ in slabs if m_.any()]
for L_ in levels:
    for r_ in L_['rows']:
        if r_['polys']: OVER.append((r_.get('y0',r_['y']-0.5),sprep(sunion([SPoly(p[0],p[1:]).buffer(0) for p in r_['polys'] if len(p[0])>=3]))))
def headroom(p,v,sill):
    t=np.array([-v[1],v[0]]); lo=99.0
    for a in (0.15,0.6,1.2):
        for b in (-0.7,0.0,0.7):
            q=SPt(*(p+v*a+t*b))
            for y_,g_ in OVER:
                if sill+0.5<y_<lo and g_.contains(q): lo=y_
    return lo-sill
def over_at(q,y):
    """the lowest ceiling, underside or slab over the point q above the floor y (its own storey's top)"""
    lo=99.0; P_=SPt(*q)
    for y_,g_ in OVER:
        if y+0.5<y_<lo and g_.contains(P_): lo=y_
    return lo if lo<99 else None
SIGNS=[]; FRAMES=[]; DOORLIST=[]; LOWDOORS={}; WALLT=0.3
for name,sn in SNAP.items():
    y0,l=FL[name]
    for g,(p,v) in sn.items():
        y0=RAISED.get((name,g),FL[name][0])            # (the sill of a raised door)
        if name=='400':
            # (on the bowl wall's face: the nearest point of its line)
            q_=SPt(*p); best_=None
            for i_ in _bt.query(q_.buffer(1.0)):
                dd_=_bl[i_].distance(q_)
                if dd_<1.0 and (best_ is None or dd_<best_[0]): best_=(dd_,i_)
            if best_: pp_=_bl[best_[1]].interpolate(_bl[best_[1]].project(q_)); p=np.array([pp_.x,pp_.y])
        yaw=float(np.arctan2(v[0],v[1]))
        # a door under something lower than a door's height (a raised door at a corner, its stair under the next stand's
        # back rows): the opening as high as there is room for, the underside its lintel, not hanging across it
        hr=headroom(p,v,y0); dh=DOOR_H
        if hr<DOOR_H+0.05: dh=round(max(2.0,hr-0.05),2); LOWDOORS[g]=(round(hr,2),dh)
        # (the concourses' walls stand WALL_T thick from the door's line into the concourse: the frame through the
        # whole of it, a plate on each face)
        fc=p+v*WALLT/2
        FRAMES.append({'x':round(float(fc[0]),2),'z':round(float(fc[1]),2),'yaw':round(yaw,3),'w':DOOR_W,'h':dh,'y':y0,'label':str(g)})
        for face,sg in ((0,1.0),(np.pi,-1.0)):
            if sg>0 and dh+0.38+0.25>hr: continue          # (no plate on the concourse's face where its ceiling comes down to the opening)
            q=p+v*(WALLT+0.07) if sg>0 else p-v*0.07
            SIGNS.append({'x':round(float(q[0]),2),'y':round(y0+dh+0.38,2),'z':round(float(q[1]),2),'yaw':round(yaw+face,3),'w':1.1,'label':str(g)})
        a_,b_=[int(round(float(c))) for c in G.g(*(p-v*1.5))]
        r_=int(l.band[b_,a_]) if l.band[b_,a_]>=0 else 0
        DOORLIST.append({'n':g,'level':name,'p':[round(float(p[0]),2),round(float(p[1]),2)],'v':[round(float(v[0]),3),round(float(v[1]),3)],'y':y0,'yIn':round(float(l.h(r_)),2),'h':dh})
print('doors lowered to the headroom over them (headroom, opening):',LOWDOORS)
def cut_doors(panels,doors,keep_lintel=True):
    """The panels [x0, z0, x1, z1, y0, y1] of walls (and rails), with an opening cut out of every one that crosses a
    door's: DOOR_W wide, DOOR_H high above the door's sill (a lintel left over it); the panels along the aisle (not across it) stay"""
    out=[]
    for pnl in panels:
        a=np.array(pnl[0:2],float); b=np.array(pnl[2:4],float); L=float(np.hypot(*(b-a)))
        if L<1e-6: out.append(list(pnl)); continue
        u=(b-a)/L; cuts=[]; drop=False; extra=[]
        for dd in doors:
            p=np.array(dd['p']); v=np.array(dd['v']); t=np.array([-v[1],v[0]])
            if abs(u@v)>0.88:                                    # runs along the aisle's axis: the aisle's side
                # (a stub of it left in the opening itself goes)
                lat=[abs((q-p)@t) for q in (a,b)]; dep=[(q-p)@v for q in (a,b)]
                if L<0.6 and max(lat)<DOOR_W/2-0.2 and min(dep)>-1.5 and max(dep)<1.5: drop=True
                # (one in the way through, from the sill up: the part of it within the opening's depth starts over the
                # opening; the rest of it stays)
                elif max(lat)<DOOR_W/2 and min(dep)<1.3 and max(dep)>-1.3:
                    tp=max(dd['y'],dd['yIn'])+dd.get('h',DOOR_H)
                    if pnl[4]<tp and pnl[5]>dd['y']+0.3:
                        d0,d1=dep; t0=(-1.3-d0)/(d1-d0) if abs(d1-d0)>1e-9 else 0.0; t1=(1.3-d0)/(d1-d0) if abs(d1-d0)>1e-9 else 1.0
                        lo_,hi_=max(0.0,min(t0,t1)),min(1.0,max(t0,t1))
                        P_=lambda tt: (a+(b-a)*tt).round(2).tolist()
                        for (u0,u1) in ((0.0,lo_),(hi_,1.0)):
                            if u1-u0>1e-3: extra.append([*P_(u0),*P_(u1),pnl[4],pnl[5]])
                        if pnl[5]>tp+0.05: extra.append([*P_(lo_),*P_(hi_),round(tp,2),pnl[5]])
                        drop=True
                continue
            sill=None
            for yy in (dd['y'],dd['yIn']):
                if pnl[4]<=yy+dd.get('h',DOOR_H) and pnl[5]>yy+0.2: sill=yy if sill is None else max(sill,yy)
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
            if lo_<hi_-1e-6: cuts.append((lo_*L,hi_*L,sill,dd.get('h',DOOR_H)))
        if drop: out+=[list(e_) for e_ in extra]; continue
        if not cuts: out.append(list(pnl)); continue
        cuts.sort(key=lambda c:c[0]); s0=0.0
        for c0,c1,dd,dh_ in cuts:   # (dd: the sill's height, dh_ the opening's)
            if c0-s0>0.02: out.append([*(a+u*s0).round(2),*(a+u*c0).round(2),pnl[4],pnl[5]])
            top=max(pnl[4],min(pnl[5],max(pnl[4],dd)+dh_))
            if keep_lintel and pnl[5]>top+0.05: out.append([*(a+u*c0).round(2),*(a+u*c1).round(2),round(top,2),pnl[5]])
            s0=max(s0,c1)
        if L-s0>0.02: out.append([*(a+u*s0).round(2),*b.round(2),pnl[4],pnl[5]])
    return [[round(float(c),2) for c in o] for o in out]
# ── every concourse wall a clean line: each run of walls at one height, end to end, taken as one line and smoothed of the
# raster's steps (simplified to 0.12 m, then its gentle bends rounded: straight runs straight, curved ones a smooth
# curve, real corners kept), its ends where they were so the runs still meet ──
def smooth_walls(walls,tol=0.12,join=0.06):
    W=[list(w) for w in walls]; n=len(W)
    key=lambda w:(round(w[4],2),round(w[5],2))
    from collections import defaultdict
    starts=defaultdict(list)
    for i,w in enumerate(W): starts[(key(w),round(w[0]/join),round(w[1]/join))].append(i)
    used=[False]*n; out=[]
    def nxt(w):
        k=key(w)
        for dx in (-1,0,1):
            for dz in (-1,0,1):
                for j in starts.get((k,round(w[2]/join)+dx,round(w[3]/join)+dz),[]):
                    if not used[j] and np.hypot(W[j][0]-w[2],W[j][1]-w[3])<join: return j
        return None
    ends=set()
    for i,w in enumerate(W): ends.add((key(w),round(w[2]/join),round(w[3]/join)))
    order=sorted(range(n),key=lambda i:(key(W[i]),W[i][0],W[i][1]))
    for i in order:
        if used[i]: continue
        # walk back to the chain's start
        ch=[i]; used[i]=True; j=nxt(W[i])
        while j is not None: used[j]=True; ch.append(j); j=nxt(W[j])
        P=[(W[ch[0]][0],W[ch[0]][1])]+[(W[c][2],W[c][3]) for c in ch]
        if len(P)>=4:
            closed=np.hypot(P[0][0]-P[-1][0],P[0][1]-P[-1][1])<join
            Q=np.array(SLine(P).simplify(tol).coords)
            # (rounded where it bends gently: Chaikin's cut, only at bends under 35 deg)
            for _ in range(2):
                if len(Q)<3: break
                R=[Q[0]]
                for k in range(1,len(Q)-1):
                    a,b,c=Q[k-1],Q[k],Q[k+1]; u1=b-a; u2=c-b
                    l1,l2=np.linalg.norm(u1),np.linalg.norm(u2)
                    if l1<1e-6 or l2<1e-6: continue
                    ang=np.degrees(np.arccos(np.clip(u1@u2/l1/l2,-1,1)))
                    if ang<35 and min(l1,l2)>0.3: c_=min(0.25*min(l1,l2),0.4); R+=[b-u1/l1*c_,b+u2/l2*c_]
                    else: R.append(b)
                R.append(Q[-1]); Q=np.array(R)
            P=[tuple(q) for q in Q]
        y0,y1=W[ch[0]][4],W[ch[0]][5]
        for a,b in zip(P[:-1],P[1:]):
            if np.hypot(b[0]-a[0],b[1]-a[1])>1e-3: out.append([round(a[0],2),round(a[1],2),round(b[0],2),round(b[1],2),y0,y1])
    return out
_n0=len(encl['walls'])
encl['walls']=smooth_walls(encl['walls'])
print('concourse walls smoothed: %d panels -> %d'%(_n0,len(encl['walls'])))
encl['walls']=cut_doors(encl['walls'],DOORLIST)
# a raised door (up a stair from the concourse): its stair in a porch of its own, square, set on the stand's back
# edge: a face round the door (the frame's width and half a metre each side, up to over the opening; less where the
# rows beside the aisle rise above the sill) and a wall each side of the stair from the face's ends to the stair's foot,
# from the concourse's floor to its ceiling (or to the face's top where nothing is over it); so from the stands the door
# stands in a wall, and through it the stair goes down between walls
def _tread_at(q):
    i_,j_=[int(round(float(c))) for c in G.g(*q)]
    if not (0<=i_<G.W and 0<=j_<G.H): return None,None
    for l__ in (L2,L4):
        if l__.band[j_,i_]>=0: return float(l__.h(l__.band[j_,i_])),(i_,j_)
    return None,(i_,j_)
PORCH=[]; PORCH_BOX=[]; PORCH_LIDS=[]; FACES=[]
for dd in DOORLIST:
    if (dd['level'],dd['n']) not in RAISED: continue
    p=np.array(dd['p']); v=np.array(dd['v']); t=np.array([-v[1],v[0]]); sill=dd['y']; yc=LVL[dd['level']][0]
    fl=[f for f in flights if abs(f['y1']-sill)<0.02 and np.hypot(f['x']+f['dx']*f['L']-p[0],f['z']+f['dz']*f['L']-p[1])<0.3]
    if not fl: continue
    f=fl[0]; u=-np.array([f['dx'],f['dz']]); tu=np.array([-u[1],u[0]])
    # the box: square to the door, as wide as the door and the stair (turned or not) need, out to the stair's foot
    corners=[p+tu*sg*WID/2+u*l_ for sg in (1,-1) for l_ in (0.0,f['L'])]
    hw=max(DOOR_W/2+0.06,max(abs((c-p)@t) for c in corners)+0.15); d1=max((c-p)@v for c in corners)+0.3
    d0=WALLT if dd['level']=='400' else 0.0
    top=round(sill+dd['h']+0.45,2)
    for sg in (1,-1):
        # its sides, square to the door's wall, from the wall back to the stair's foot, floor to its storey's ceiling
        s0=p+t*sg*hw+v*d0; s1=p+t*sg*hw+v*d1; rt=over_at((s0+s1)/2,yc)
        A_,B_=(s0,s1) if sg>0 else (s1,s0)                          # (thick outward, away from the stair)
        PORCH.append([*np.round(A_,2),*np.round(B_,2),round(yc,2),round(rt if rt is not None and rt>yc+2.0 else top,2)])
        if dd['level']!='400':
            # (the 200's: a face round the door, floor to its storey's ceiling, out past the box's side to the concourse's
            # wall beside it: laid once the walls round the box are cleared, below)
            FACES.append((p,v,t,sg,hw,yc,sill,dd['h']))
    if dd['level']!='400':
        oc_=over_at(p+v*0.4,yc); PORCH.append([*np.round(p+t*(DOOR_W/2+0.06),2),*np.round(p-t*(DOOR_W/2+0.06),2),round(sill+dd['h'],2),round(oc_ if oc_ is not None and oc_<yc+6.0 else top,2)])
    PORCH_BOX.append((SPoly([p+t*hw+v*(d0+0.05),p-t*hw+v*(d0+0.05),p-t*hw+v*d1,p+t*hw+v*d1]).buffer(0.2),max(top,yc+4.5)))
    # a lid over the box, just over the opening (under its storey's ceiling): from the concourse the porch is a short
    # tunnel up to the door, whatever the stands' undersides do over it
    oc=over_at(p+v*(d0+d1)/2,yc); lid=min(sill+dd['h']+0.4,(oc-0.02) if oc is not None else 99.0)
    if lid>sill+dd['h']+0.05:
        ring=[p+t*hw+v*d0,p-t*hw+v*d0,p-t*hw+v*d1,p+t*hw+v*d1]
        PORCH_LIDS.append({'y':round(lid,3),'polys':[[[[round(float(q[0]),2),round(float(q[1]),2)] for q in ring]]]})
# in and round the box nothing else stands: the concourse's own walls through it or along its sides go
_n0=len(encl['walls'])
_B4=set(tuple(w_[:4]) for w_ in BOWL4)
encl['walls']=[w_ for w_ in encl['walls'] if tuple(w_[:4]) in _B4 or not any(SLine([(w_[0],w_[1]),(w_[2],w_[3])]).intersects(pg) and w_[4]<tp_ for pg,tp_ in PORCH_BOX)]
print('  walls taken out of the porches',_n0-len(encl['walls']))
_EW2=[SLine([(w_[0],w_[1]),(w_[2],w_[3])]) for w_ in encl['walls']]; _ET2=STRtree(_EW2)
for p,v,t,sg,hw,yc,sill,dh in FACES:
    oc=over_at(p+v*0.4,yc); ftop=oc if oc is not None and oc<yc+6.0 else sill+dh+0.45
    a0=DOOR_W/2+0.06; a=hw
    while a<hw+2.0:                                   # (on to the concourse's wall beside it, 2 m at most)
        q=SPt(*(p+t*sg*a+v*0.05))
        if any(_EW2[i].distance(q)<0.12 for i in _ET2.query(q.buffer(0.12))): break
        a+=0.1
    A_,B_=(p+t*sg*a,p+t*sg*a0) if sg>0 else (p-t*a0,p-t*a)     # (thick into the concourse)
    PORCH.append([*np.round(A_,2),*np.round(B_,2),round(yc,2),round(ftop,2)])
encl['walls']+=[[float(c) for c in w_] for w_ in PORCH]
encl['ceils']+=PORCH_LIDS
print('  porch lids',len(PORCH_LIDS))
# (slivers of the concourse's outline left beside a porch, under a storey's slab far over the door: gone; the closing
# below walls up what they shut, to the storey's own ceiling)
_RD=[(np.array(dd['p']),dd['y']+dd['h']) for dd in DOORLIST if (dd['level'],dd['n']) in RAISED and dd['level']=='200']
_n0=len(encl['walls'])
encl['walls']=[w_ for w_ in encl['walls'] if not (w_[4]<C200+0.5 and np.hypot(w_[2]-w_[0],w_[3]-w_[1])<0.6 and any(np.hypot((w_[0]+w_[2])/2-q_[0],(w_[1]+w_[3])/2-q_[1])<2.0 and w_[5]>t_+1.0 for q_,t_ in _RD))]
print('  slivers by the porches taken out',_n0-len(encl['walls']))
print('raised doors\' porches: %d panels'%len(PORCH))
# over every door the wall is whole: the concourse's walls leave a door's gap open to their tops (the frame and its wall
# standing only a door's height): a lintel across it from the opening's top to the walls' tops beside it
_EW=[SLine([(w[0],w[1]),(w[2],w[3])]) for w in encl['walls']]; _ET=STRtree(_EW); LINT=[]
for dd in DOORLIST:
    p=np.array(dd['p']); v=np.array(dd['v']); t=np.array([-v[1],v[0]]); top_o=max(dd['y'],dd['yIn'])+dd.get('h',DOOR_H)
    nb=[]
    for sg in (1,-1):
        q=SPt(*(p+t*sg*(DOOR_W/2+0.35)))
        for i in _ET.query(q.buffer(0.4)):
            w=encl['walls'][i]
            if _EW[i].distance(q)<0.4 and w[4]<top_o and w[5]>top_o+0.2: nb.append(w)
    if not nb: continue
    top=max(w[5] for w in nb)
    # (no higher than the concourse's own ceiling just inside the door: a taller wall beside it is another storey's)
    rt=over_at(p+v*0.8,dd['y'])
    top=min(top,rt if rt is not None else dd['y']+4.5)
    if top<=top_o+0.1: continue
    covered=any(_EW[i].distance(SPt(*p))<0.3 and encl['walls'][i][4]<=top_o+0.1 and encl['walls'][i][5]>=top-0.1 for i in _ET.query(SPt(*p).buffer(0.3)))
    if covered: continue
    a_,b_=p+t*(DOOR_W/2+0.2),p-t*(DOOR_W/2+0.2)          # (laid so its thickness goes into the concourse, the way the door faces)
    LINT.append([round(a_[0],2),round(a_[1],2),round(b_[0],2),round(b_[1],2),round(top_o,2),round(top,2)])
encl['walls']+=LINT
print('lintels over doors: %d'%len(LINT))
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
        if hi<dd['y']+0.3 or lo>dd['y']+dd.get('h',DOOR_H)-0.3: 
            if hi<dd['yIn']+0.3 or lo>dd['yIn']+dd.get('h',DOOR_H)-0.3: continue
        if LineString([(w[0],w[1]),(w[2],w[3])]).distance(seg)<0.06 and np.hypot(w[2]-w[0],w[3]-w[1])>0.2:
            blocked.append((dd['n'],kind,[round(c,2) for c in w])); break
print('doors with something across the opening:',len(blocked),blocked[:12])
if os.environ.get('SSA_DOORS_OUT'): json.dump(DOORLIST,open(os.environ['SSA_DOORS_OUT'],'w'))      # (for the gate-walk checks)
# (the suites' data: see above)
rect=lambda x0,x1,za,zb: [[round(x0,2),round(za,2)],[round(x1,2),round(za,2)],[round(x1,2),round(zb,2)],[round(x0,2),round(zb,2)]]
srows=[{'r':0,'y':SY,'y0':SY-0.45,'polys':[[rect(xb-1.0,xb,z0s,z1s)]]},
       {'r':1,'y':SUY,'y0':SY-0.45,'polys':[[rect(xb-2.25,xb-1.0,z0s,z1s)]]}]
Ss=[]
for za,zb,n in bx:
    per=n//2; used_=per*0.6; z0=(za+zb)/2-used_/2+0.3
    for r in (0,1):
        for k in range(per): Ss.append((xb-0.45-r*1.0,z0+k*0.6,r))
Ss=np.array(Ss)
enc=np.c_[np.round(Ss[:,0]*10),np.round(Ss[:,1]*10),Ss[:,2],np.full(len(Ss),90)].astype('<i2')
parts=[]
for za,zb,n in bx[1:]:
    parts.append([round(xb,2),round(za,2),round(xb-2.25,2),round(za,2),SY,round(SUY+1.1,2)])
glass_rail=[[round(xb-0.05,2),round(z0s,2),round(xb-0.05,2),round(z1s,2),SY-0.45,round(SY+1.1,2)]]
suites={'xf':round(xb,2),'xg':round(xb-2.25,2),'xr':round(XR,2),'xc0':round(xc0,2),'xc1':round(xc1,2),'y':SUY,'yc':round(SUY+3.0,2),
        'boxes':[[a,b,n] for a,b,n in bx],'doorW':1.2,'doorH':2.2}
print('suites',len(bx),'seats',len(Ss),'front x',round(xb,2),'z',z0s,z1s)
floors=[{'y':y,'y0':y0,'polys':mask_polys(G,m)} for m,y0,y in slabs]
ow=contours(G,outer.astype(np.uint8),eps=0.03,minarea=100)
data={'levels':levels,'floors':floors,'flights':[{k:(round(float(v),3) if not isinstance(v,int) else v) for k,v in f.items()} for f in flights],
      'outer':[poly_out(p) for p in ow],'rooms':encl,'tunnels':tunnels_out(TUN),'suites':suites,'signs':SIGNS,'frames':FRAMES,'cutWalls':[]}
data['levels'].append({'name':'300S','D':1.0,'h0':SY,'rise':SR,'rows':srows,'steps':[],'holes':[],'voms':[],'partitions':parts,
                       'seats':base64.b64encode(enc.tobytes()).decode('ascii'),'rails':glass_rail,'walls':[]})
# ── every concourse closed in: along each concourse's enclosed floor's outline, whatever is open between its floor and
# its ceiling (not a door, a vomitory's mouth or a stair: ssa_closure.py) is walled up, floor to ceiling ──
import ssa_closure as SCL
data['rooms']['thick']=WALLT          # (the concourses' walls 0.3 m thick, into the concourse)
_n=0
for _it in range(3):
    _gp=SCL.gaps(data)
    if not _gp: break
    _n+=len(_gp)
    _patch=[]
    for g_ in _gp:
        a_,b_=np.array(g_['a']),np.array(g_['b']); u_=b_-a_
        if np.array([-u_[1],u_[0]])@np.array(g_['n'])>0: a_,b_=b_,a_          # (its thickness into the concourse)
        _patch.append([round(a_[0],2),round(a_[1],2),round(b_[0],2),round(b_[1],2),round(g_['lo']-0.15,2),round(g_['hi']+0.15,2)])
    data['rooms']['walls']+=merge_runs(_patch)
print('concourses closed: %d gaps walled up (%.1f m); left open: %d'%(_n,_n*0.25,len(SCL.gaps(data))))
json.dump(data,open('ssa_stands.json','w'),separators=(',',':'))
print('json KB',os.path.getsize('ssa_stands.json')//1024,round(time.time()-T0,1))
pickle.dump((c200,c300,c400,c500),open('ssa_conc.pkl','wb'))
