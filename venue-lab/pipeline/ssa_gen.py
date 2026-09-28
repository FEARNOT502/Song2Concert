import sys, json, time, re, pickle, numpy as np, cv2
sys.path.insert(0,'.')
from standlib import Grid, disk, contours, sample, STRAIGHT
from standgen import Level, poly_out, mask_polys, edge_walls, enclose, grow_under, trim_tunnels, front_parapet
from scipy.spatial import cKDTree
S=np.load('ssa_real.npy',allow_pickle=True)
def clean(s,eps=1.5,minn=12):
    from scipy.sparse.csgraph import connected_components
    from scipy.sparse import coo_matrix
    pr=cKDTree(s).query_pairs(eps,output_type='ndarray')
    M=coo_matrix((np.ones(len(pr)),(pr[:,0],pr[:,1])),shape=(len(s),len(s)))
    lab=connected_components(M,directed=False)[1]
    cnt=np.bincount(lab); return s[cnt[lab]>=minn]
S=[clean(s) for s in S]
G=Grid(-74,74,-68,68,0.1)
STRAIGHT.update(on=True,res=G.res)
C200,C300,C400,C500=6.2,11.44,18.7,25.5
t=time.time()
LV={}
LV['200']=Level(G,'200',S[0],0.865,0.45,0.33,bottom=lambda r,h: 0.0 if r<=24 else h-0.6,keep_hole=6,front_sig=3.0,max_rows=32)
LV['300']=Level(G,'300',S[1],1.0,10.6,0.42,0.5,2.2,close=0.9,keep_hole=6,open_w=4.5,hull_close=5.0,front_sig=5.0,max_rows=3)
LV['400']=Level(G,'400',S[2],0.85,17.0,0.42,0.5,2.8,close=1.3,front_sig=3.0,max_rows=24)
LV['500']=Level(G,'500',S[3],0.87,24.5,0.5,0.5,2.4,close=0.9,keep_hole=6,open_w=4.5,hull_close=5.0,front_sig=5.0,max_rows=3)
print('levels',round(time.time()-t,1), {k:(l.nrows,len(l.seats)) for k,l in LV.items()})
# the 200s and the 400s in blocks with straight rows, as the map draws them:
# the sides and ends straight across, each corner a fan of wedges
from standgen import straight_blocks
for k_,c_ in (('200',(15.0,33.0,33.0)),('400',(20.0,33.0,33.0))):
    print('blocks',k_,straight_blocks(LV[k_],c_))
# the tunnels in from the concourses, made straight: through the 200 level's
# sides at rows 18-27, through the 400 level's
VOMS={'200':LV['200'].make_voms(C200,head=1.9,wmax=3.0),'400':LV['400'].make_voms(C400,head=1.9,wmax=3.0)}
print('voms',{k:len(v) for k,v in VOMS.items()})

# ── concourses ──
def dil(m,r): return cv2.dilate(m.astype(np.uint8),disk(r/G.res))>0
L2,L3,L4,L5=LV['200'],LV['300'],LV['400'],LV['500']
gy,gx=np.mgrid[0:G.H,0:G.W]; X,Z=G.m(gx,gy)
backstage=(np.abs(X)<22)&(Z<-38)
c200=((dil(L2.R,7)&L2.behind&(L2.R==0))|((L2.R>0)&(L2.d>=24.5*L2.D))) & ~backstage
# the vomitory mouths in the 200 sides (gaps behind row 17) are part of it
gaps=(L2.hull>0)&(L2.R==0)&L2.behind&(L2.d>15)
c200|=gaps
c300=dil(L3.R,6)&L3.behind&(L3.R==0)&(L3.d>2.0)
c400=((dil(L4.R,7)&L4.behind&(L4.R==0)&(L4.d>3.0))|((L4.R>0)&(L4.d>=8.3*L4.D/0.85)))
c500=dil(L5.R,6)&L5.behind&(L5.R==0)&(L5.d>1.8)
# any gap left in a balcony's rows opens onto its concourse
c300|=(L3.hull>0)&(L3.R==0)&L3.behind&(L3.d>0.8)
c500|=(L5.hull>0)&(L5.R==0)&L5.behind&(L5.d>0.8)
# never under the arena floor
arena=(np.abs(X)<25)&(np.abs(Z)<40)
for c in (c200,c300,c400,c500): c&=~arena
# the building's outer wall: straight runs round everything
allm=(L2.R|L3.R|L4.R|L5.R|c200|c300|c400|c500).astype(np.uint8)
cs_,_=cv2.findContours(allm,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
hull=np.zeros_like(allm); cv2.fillPoly(hull,[cv2.convexHull(np.vstack(cs_))],1)
outer=dil(hull,0.4)
# trim concourses to the building
for c in (c200,c300,c400,c500): c&=hull>0
# the 200 concourse is the whole storey behind the 200 level, out to the wall;
# gaps at the front of the stand stay at the arena's level (passages in), and
# nothing of it stands in front of the stand: the floor runs up to its front row
frontgap=(L2.hull>0)&(L2.R==0)&(L2.d<8)
c200|=(outer&(L2.R==0)&L2.behind&(L2.d>0.5)&~arena&~backstage&~frontgap)
# no slivers or islands of it left standing about the arena floor
def tidy(c,w=1.0,minarea=50):
    o=cv2.morphologyEx(c.astype(np.uint8),cv2.MORPH_OPEN,disk(w/2/G.res))
    n,lab,st,_=cv2.connectedComponentsWithStats(o,connectivity=8)
    keep=np.zeros(n,bool); keep[1:]=st[1:,4]*G.res**2>=minarea
    return keep[lab]
c200=tidy(c200); c300=tidy(c300,0.8,10); c400=tidy(c400,0.8,10); c500=tidy(c500,0.8,10)

# ── stairs between the concourses: straight flights along the ends ──
RISE,RUN,WID=0.19,0.28,1.6
def fits(mask,pts):
    gx_,gz_=G.g(pts[:,0],pts[:,1]); gx_=np.round(gx_).astype(int); gz_=np.round(gz_).astype(int)
    ok=(gx_>=0)&(gx_<G.W)&(gz_>=0)&(gz_<G.H)
    return ok.all() and mask[gz_,gx_].all()
def footprint(x0,z0,dx,dz,L,w,step=0.2):
    ts=np.arange(0,L+1e-6,step); ws=np.arange(-w/2,w/2+1e-6,step)
    T,Wd=np.meshgrid(ts,ws); return np.c_[(x0+dx*T-dz*Wd).ravel(),(z0+dz*T+dx*Wd).ravel()]
blocked=[]   # stand regions a flight may not pass through
def find_flight(lower,upper,y0,y1,near,avoid):
    n=int(np.ceil((y1-y0)/RISE)); L=n*RUN
    best=None
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
# cut the upper slabs over each flight (and anything between), leaving the top landing
for f in flights:
    fp=footprint(f['x'],f['z'],f['dx'],f['dz'],f['L']-0.3,WID+0.4,step=0.05)
    gx_,gz_=G.g(fp[:,0],fp[:,1]); gx_=np.clip(np.round(gx_).astype(int),0,G.W-1); gz_=np.clip(np.round(gz_).astype(int),0,G.H-1)
    for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500)):
        if f['y0']<y<=f['y1']+0.01 and y!=f['y1']: c[gz_,gx_]=False
        if y==f['y1']: 
            m=np.zeros_like(c); m[gz_,gx_]=True; c&=~m
# ── doors (扉) from the official map, per level scale ──
import os
svg=open('map_end01.svg',encoding='utf-8').read() if os.path.exists('map_end01.svg') else ''
gates=[(int(g),float(x),float(y)) for g,x,y in re.findall(r'<g id="gate_(\d+)">\s*<path class="gate_back" d="M([\d.]+),([\d.]+)',svg)]
Cpx=np.array([1980.0,1907.0]); K={2:20.0,3:24.6,4:28.8,5:33.8}
def gate_xy(g,x,y):
    k=K[g//100]; return ((x-40-Cpx[0])/k,(y+12-Cpx[1])/k)
doors={lv:[gate_xy(g,x,y) for g,x,y in gates if g//100==int(lv[0])] for lv in ['200','300','400','500']}

def outside_fn(cmask,y):
    def f(ox,oy): return y if cmask[oy,ox] else None
    return f
# concourse floors reach a little under the stands they meet, so there is no crack
grow=lambda c: cv2.dilate(c.astype(np.uint8),np.ones((3,3),np.uint8),iterations=3)>0
# where the 200s are shallow (the far corners), narrow pockets of the
# concourse's storey would stand up behind their last rows as blocks: the
# stand's treads carry on up into them instead, to meet the concourse
op_=cv2.morphologyEx(c200.astype(np.uint8),cv2.MORPH_OPEN,disk(2.0/G.res))>0
pk_=c200&~op_&(np.abs(Z)>28)
# and where the 200s stop short of the concourse's floor, their rows carry
# on up to it (so its front wall stands behind their top row, as along the
# sides, not bare above a shallow corner)
low_=c200&(np.abs(Z)>28)&(L2.d>=0)&((L2.h0+L2.rise*np.floor(np.maximum(L2.d,0)/L2.D))<C200+0.2)&(cv2.dilate((L2.R>0).astype(np.uint8),disk(8.0/G.res))>0)
pk_|=low_
fill_=pk_&(L2.d>=0)&(L2.d<(L2.nrows+8)*L2.D)&(cv2.dilate((L2.R>0).astype(np.uint8),disk(8.0/G.res))>0)
if fill_.any():
    L2.nrows=max(L2.nrows,int(np.floor(L2.d[fill_].max()/L2.D))+1)
    L2.R[fill_]=1; L2.band[fill_]=np.clip(np.floor(L2.d[fill_]/L2.D).astype(int),0,L2.nrows-1)
c200&=~pk_
print('pockets filled',round(float(fill_.sum()*G.res**2),1),'m2; cleared',round(float((pk_&~fill_).sum()*G.res**2),1))
# ── the floor's corner tunnels ──
# At each corner of the arena floor a passage runs out under the 200s, along
# the aisle in the middle of the corner's fan of blocks (the X the floor's
# gangways make in the map), to the service ways inside the building.
from standgen import cut_tunnels, tunnel_rows, tunnels_out
TUN=[]
# each from the floor's corner along the middle of the corner's fan (where
# the plan leaves the passage unseated), from the stand's front: an open cut
# as far as the stand is low, then roofed, on under the concourse's storey
near2=(L2.hull>0)|(L2.R>0)
body_=((L2.R>0)|(L2.hull>0)|c200)&(hull>0)       # what they run under, before the cuts
# the passages the plan leaves unseated at the front of the 200s (where they
# meet at the corners) stay open at the floor's level: no concourse storey
# standing in them as a block
c200&=~(near2&(L2.R==0)&(L2.d<12.0)&(np.abs(Z)>28))
for sx_ in (-1,1):
    for sz_ in (-1,1):
        C_=np.array([sx_*15.0,sz_*33.0]); u_=np.array([sx_,sz_])/np.sqrt(2)
        q_=C_.copy()
        for _ in range(400):
            i_,j_=[int(round(float(c))) for c in G.g(q_[0],q_[1])]
            if near2[j_,i_]: break
            q_=q_+u_*0.1
        # open as far as 10 m into the stand; the concourse's storey not over that
        al_=(X-q_[0])*u_[0]+(Z-q_[1])*u_[1]; la_=np.abs(-(X-q_[0])*u_[1]+(Z-q_[1])*u_[0])
        c200&=~((la_<2.5+0.3)&(al_>-3)&(al_<10.0))
        TUN.append({'p':q_,'u':u_,'w':5.0,'h':4.0,'closed':True,'Lmax':30.0,'open':10.0})
# on under the stand and the 200 concourse's storey, to the building's wall
TUNM=cut_tunnels(G,LV['200'],TUN,body_)
print('tunnels',[(t['p'].round(1).tolist(),t['L'],t['deck']) for t in TUN])
slabs=[(grow_under(c,y,[L2,L3,L4,L5]),(0.0 if y==C200 else y-0.35),y) for c,y in ((c200,C200),(c300,C300),(c400,C400),(c500,C500))]
# under the 200 concourse the tunnels run on hollow
s0_=slabs[0][0]; slabs[0]=(s0_&~TUNM,0.0,C200)
if (s0_&TUNM).any(): slabs.insert(1,(s0_&TUNM,4.0,C200))
# ── the concourses closed in: ceilings 4 m up (or the stand over them), walls
# with the doors in them, lights ──
t=time.time()
rooms=[{'name':name,'mask':cm,'y':cy,'cl':4.0,'own':[l],'doors':doors[name]+l.aisle_doors(),'open':getattr(l,'pits',None),'toroof':name in ('400','500')}
       for name,l,cm,cy in (('200',L2,c200,C200),('300',L3,c300,C300),('400',L4,c400,C400),('500',L5,c500,C500))]
for name,cm in (('200',c200),('400',c400)): trim_tunnels(G,VOMS[name],cm)
# numbered round each level as the building numbers its doors (扉), the level
# first: 201, 202, … clockwise from the north-east
for name,vs in VOMS.items():
    vs.sort(key=lambda v: (np.arctan2(v['p'][0],-v['p'][1])+2*np.pi-0.3)%(2*np.pi))
    for i,v in enumerate(vs): v['label']=f"{name[0]}{i+1:02d}"
encl,roomtop=enclose(G,rooms,[L2,L3,L4,L5],slabs,flights)
print('enclose',round(time.time()-t,1),{k:len(v) for k,v in encl.items()})
skip=lambda ox,oy,h: roomtop[oy,ox]>=h+1.0
fronts={'200':(0.0,0.75),'300':('tread',0.8),'400':('tread',0.8),'500':('tread',0.8)}
# the 300 level: the VIP balcony between the 200s and the 400s, its rows
# boxed off every eight seats by low partitions stepping up with the rows
def partitions(l, every=8):
    out=[]
    gz_,gx_=np.gradient(cv2.GaussianBlur(l.d.astype(np.float32),(0,0),6))
    S=l.seats; r0=np.nonzero(l.row==0)[0]
    if not len(r0): return out
    P=S[r0]; th=np.arctan2(P[:,1],P[:,0]); o=np.argsort(th); P=P[o]
    gaps=np.r_[np.hypot(*np.diff(P,axis=0).T),9.0]
    run=[]
    def flush(run):
        for k in range(every,len(run)-2,every):
            m=(run[k-1]+run[k])/2
            g=np.array([sample(G,gx_,m[None])[0],sample(G,gz_,m[None])[0]]); g/=np.linalg.norm(g)+1e-9
            dm=float(sample(G,l.d,m[None])[0]); p0=m-g*dm
            for r in range(l.nrows):
                a_=p0+g*(r*l.D+0.05); b_=p0+g*((r+1)*l.D)
                h=float(l.h(r))
                out.append([round(float(a_[0]),2),round(float(a_[1]),2),round(float(b_[0]),2),round(float(b_[1]),2),round(h,2),round(h+1.05,2)])
    for i,p_ in enumerate(P):
        run.append(p_)
        if gaps[i]>0.9: flush(run); run=[]
    return out
PART300=partitions(L3)
print('300 partitions',len(PART300))
levels=[]
for name,l,cm,cy in (('200',L2,c200,C200),('300',L3,c300,C300),('400',L4,c400,C400),('500',L5,c500,C500)):
    rails,walls=edge_walls(G,l,outside_fn(cm,cy),doors[name]+l.aisle_doors(),skip=skip,front=fronts[name])
    rails+=front_parapet(G,l,fronts[name])
    rows_=l.rows_out()
    if name=='200': rows_=tunnel_rows(rows_,TUN)
    levels.append({'name':name,'D':l.D,'h0':l.h0,'rise':l.rise,'rows':rows_,'steps':l.aisles_out(),'holes':[],'voms':VOMS.get(name,[]),'partitions':PART300 if name=='300' else [],
                   'seats':l.seats_out(),'rails':rails,'walls':walls})
    print(name,'rows',len(levels[-1]['rows']),'steps',len(levels[-1]['steps']),'holes',len(levels[-1]['holes']),'rails',len(rails),'walls',len(walls))
# concourse floors reach a little under the stands they meet, so there is no crack
floors=[{'y':y,'y0':y0,'polys':mask_polys(G,m)} for m,y0,y in slabs]
ow=contours(G,outer.astype(np.uint8),eps=0.03,minarea=100)
data={'levels':levels,'floors':floors,'flights':[{k:(round(float(v),3) if not isinstance(v,int) else v) for k,v in f.items()} for f in flights],
      'outer':[poly_out(p) for p in ow],'rooms':encl,'tunnels':tunnels_out(TUN)}
json.dump(data,open('ssa_stands.json','w'),separators=(',',':'))
import os; print('json KB',os.path.getsize('ssa_stands.json')//1024)
pickle.dump((c200,c300,c400,c500),open('ssa_conc.pkl','wb'))

import standgen; pickle.dump({k:tuple(np.packbits(a) for a in v) for k,v in standgen.DEBUG.items()},open('ssa_dbg.pkl','wb'))
