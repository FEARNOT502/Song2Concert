# Seats (metres) per level -> stand data for the renderer: row treads as
# polygons with heights, seats snapped onto their treads, aisle half-steps,
# vomitory mouths, concourse floors, rails and door openings.
import numpy as np, cv2, json
from standlib import Grid, disk, seat_mask, front_from, depth, sample, contours, rings_px

def smooth_hull(G, M, close=3.0, blur=1.0):
    hull=cv2.morphologyEx(M,cv2.MORPH_CLOSE,disk(close/G.res))
    k=int(blur/G.res)*2+1
    return (cv2.GaussianBlur(hull.astype(np.float32),(k,k),0)>0.5).astype(np.uint8)

def behind_mask(G,F,centre=(0,0)):
    # cells farther from the centre than the front along their ray
    gy,gx=np.mgrid[0:G.H,0:G.W]; X,Z=G.m(gx,gy); X=X-centre[0]; Z=Z-centre[1]
    th=np.arctan2(Z,X); r=np.hypot(X,Z)
    fy,fx=np.nonzero(F); FX,FZ=G.m(fx,fy); FX=FX-centre[0]; FZ=FZ-centre[1]
    fth=np.arctan2(FZ,FX); fr=np.hypot(FX,FZ)
    nb=3600; bi=((fth+np.pi)/(2*np.pi)*nb).astype(int)%nb
    rmin=np.full(nb,np.inf); np.minimum.at(rmin,bi,fr)
    # bridge gaps in the stand (aisles, gaps between blocks) up to 15 degrees
    # wide by interpolating the front across them
    ok=np.isfinite(rmin)
    if ok.any():
        idx=np.arange(nb); good=idx[ok]
        ext=np.r_[good-nb,good,good+nb]; val=np.r_[rmin[ok],rmin[ok],rmin[ok]]
        interp=np.interp(idx,ext,val)
        # distance (in bins) to the nearest good bin on each side
        nxt=np.searchsorted(ext,idx); gap=ext[np.clip(nxt,0,len(ext)-1)]-ext[np.clip(nxt-1,0,len(ext)-1)]
        fill=(~ok)&(gap<=nb*15/360)
        rmin[fill]=interp[fill]
    cb=((th+np.pi)/(2*np.pi)*nb).astype(int)%nb
    return (r>=rmin[cb]-0.05)

def poly_out(polys, nd=1):
    return [[[round(float(x),nd),round(float(z),nd)] for x,z in ring] for ring in polys]

class Level:
    def __init__(s, G, name, seats, D, h0, rise, bottom='ground', fascia=2.6, close=1.1, keep_hole=3.0, centre=(0,0), open_w=3.0, hull_close=3.0, rmax=90, F=None, hs=None):
        s.G,s.name,s.D,s.h0,s.rise=G,name,D,h0,rise
        s.hs=None if hs is None else np.asarray(hs,float)
        s.bottom,s.fascia=bottom,fascia
        s.centre=centre
        M=seat_mask(G,seats)
        s.hull=smooth_hull(G,M,close=hull_close)
        s.F=front_from(G,s.hull,centre,rmax=rmax) if F is None else F
        s.d=depth(G,s.F)
        s.behind=behind_mask(G,s.F,centre)
        # the tread: everything inside the stand's outline that is near a seat,
        # less the openings wider than `open_w` (tunnel mouths); narrower gaps
        # (aisles, gangways between blocks) are treads too
        near=cv2.dilate(M,disk(1.6/G.res))>0
        seated=cv2.morphologyEx(M,cv2.MORPH_CLOSE,disk(0.5/G.res))>0
        gaps=(s.hull>0)&~seated
        big=cv2.morphologyEx(gaps.astype(np.uint8),cv2.MORPH_OPEN,disk(open_w/2/G.res))>0
        R=((s.hull>0)&near&~big).astype(np.uint8)
        inv=(1-R).astype(np.uint8)
        n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
        for i in range(1,n):
            if st[i,4]*G.res*G.res<keep_hole: R[lab==i]=1
        R[~s.behind]=0
        s.R=R
        s.seatmask=M
        ds=sample(G,s.d,seats)
        s.row=np.clip(np.floor(ds/D).astype(int),0,None)
        s.nrows=int(s.row.max())+1
        s.band=np.where(R>0,np.clip(np.floor(s.d/D).astype(int),0,s.nrows-1),-1)
        # snap each seat onto the middle-back of its tread, along the depth gradient
        gz,gx=np.gradient(cv2.GaussianBlur(s.d.astype(np.float32),(9,9),0))
        g=np.c_[sample(G,gx,seats),sample(G,gz,seats)]
        g/=np.maximum(1e-6,np.linalg.norm(g,axis=1))[:,None]
        want=s.row*D+D*0.55
        s.seats=seats+g*(want-ds)[:,None]
        s.yaw=np.arctan2(-g[:,0],-g[:,1])     # facing the front (down the gradient)
    def h(s,r):
        if s.hs is not None: return s.hs[np.clip(np.asarray(r),0,len(s.hs)-1)]
        return s.h0+s.rise*np.asarray(r)
    def rows_out(s):
        out=[]
        k=np.ones((3,3),np.uint8)
        for r in range(s.nrows):
            m=(s.band==r).astype(np.uint8)
            if not m.any(): continue
            # reach a little under the next row up, so the treads meet with no crack
            m=(m|(cv2.dilate(m,k,iterations=3)&(s.band>r))).astype(np.uint8)
            top=float(s.h(r))
            if callable(s.bottom): bot=float(s.bottom(r,top))
            elif s.bottom=='ground': bot=0.0
            else: bot=top-(s.fascia if r==0 else s.bottom)
            out.append({'r':r,'y':round(top,3),'y0':round(bot,3),'polys':[poly_out(p,2) for p in contours(s.G,m,eps=0.012,minarea=0.2)]})
        return out
    def aisles_out(s):
        # tread cells with no seat on them: aisles; a half step on the rear half of each
        seatfoot=cv2.dilate(s.seatmask,disk(1))
        A=((s.R>0)&(seatfoot==0)).astype(np.uint8)
        A=cv2.morphologyEx(A,cv2.MORPH_OPEN,disk(3))          # at least 0.6 m across
        out=[]
        for r in range(s.nrows-1):
            rise=float(s.h(r+1)-s.h(r))
            if rise<0.3: continue          # a low riser is a step in itself
            rear=((s.band==r)&(s.d>=r*s.D+s.D*0.5)&(A>0)).astype(np.uint8)
            if not rear.any(): continue
            y=float(s.h(r)+rise/2)
            for p in contours(s.G,rear,eps=getattr(s,'step_eps',0.02),minarea=0.15,sigma=0.7):
                out.append({'y':round(y,3),'y0':round(float(s.h(r)),3),'polys':poly_out(p,2)})
        return out
    def holes_out(s, floor, open_upto=-1):
        # enclosed gaps in the stand (vomitory mouths), with the tread height round them
        inv=((1-s.R)&s.hull.astype(bool)&s.behind).astype(np.uint8)
        cs,hier=cv2.findContours(inv,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
        out=[]
        bandd=cv2.dilate((s.band+1).astype(np.float32),np.ones((5,5),np.uint8))
        for c in cs:
            a=cv2.contourArea(c)*s.G.res**2
            if a<3: continue
            x,y,w,h=cv2.boundingRect(c)
            if x<=1 or y<=1 or x+w>=s.G.W-1 or y+h>=s.G.H-1: continue
            # is it closed on all sides by the stand? (a notch at the back is not)
            mask=np.zeros_like(inv); cv2.drawContours(mask,[c],-1,1,-1)
            edge=cv2.dilate(mask,disk(3))-mask
            if (s.R[edge>0]>0).mean()<0.9: continue
            rp=rings_px(mask,0.02/s.G.res,sigma=0.8)
            if not rp: continue
            ring=rp[0][0]
            ri=np.round(ring).astype(int)
            rs=[max(0,int(bandd[min(s.G.H-1,max(0,py)),min(s.G.W-1,max(0,px))])-1) for px,py in ri]
            tops=[float(s.h(r)) for r in rs]
            def bot(r):
                h=float(s.h(r))
                if callable(s.bottom): return float(s.bottom(r,h))
                if s.bottom=='ground': return 0.0
                return h-(s.fascia if r==0 else s.bottom)
            opens=[1 if (bot(r)>=floor+1.9 or r<=open_upto) else 0 for r in rs]
            X,Z=s.G.m(ring[:,0],ring[:,1])
            out.append({'floor':floor,'ring':[[round(float(a),2),round(float(b),2)] for a,b in zip(X,Z)],'tops':[round(t,2) for t in tops],'open':opens})
        return out
    def bot(s, r):
        h=float(s.h(r))
        if callable(s.bottom): return float(s.bottom(r,h))
        if s.bottom=='ground': return 0.0
        return h-(s.fascia if r==0 else s.bottom)
    def make_voms(s, floor, head=1.95, minarea=3.0, wmin=1.4, wmax=4.2, cands=None, detect=True):
        """Every enclosed gap in the treads (a tunnel mouth) made a straight
        vomitory: a rectangle along the rake, the rows too low to walk under
        cut away over it (the open pit, floor at `floor`), the rows above left
        over it (the roof of the tunnel on to the concourse), and the rest of
        the gap round the rectangle given back to the treads. `cands`: extra
        masks to treat as gaps. Returns the vomitories for the renderer."""
        G=s.G
        inv=((1-s.R)&(s.hull>0)&s.behind).astype(np.uint8)
        n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
        gz,gx=np.gradient(cv2.GaussianBlur(s.d.astype(np.float32),(0,0),6))
        s.pits=getattr(s,'pits',np.zeros(s.R.shape,bool))
        comps=[]
        for i in range(1,n if detect else 1):
            if st[i,4]*G.res**2<minarea: continue
            x,y,w,h=st[i,:4]
            if x<=1 or y<=1 or x+w>=G.W-1 or y+h>=G.H-1: continue
            sub=(lab[y:y+h,x:x+w]==i)
            m=np.zeros(s.R.shape,bool); m[y:y+h,x:x+w]=sub
            edge=(cv2.dilate(m.astype(np.uint8),disk(3))>0)&~m
            if (s.R[edge]>0).mean()<0.9: continue
            comps.append(m)
        for m in (cands or []): comps.append(m.astype(bool))
        voms=[]
        for m in comps:
            ys,xs=np.nonzero(m)
            edge=(cv2.dilate(m.astype(np.uint8),disk(3))>0)&~m
            ey,ex=np.nonzero(edge)
            u=np.array([gx[ey,ex].mean(),gz[ey,ex].mean()]); u/=np.linalg.norm(u)+1e-9
            v=np.array([-u[1],u[0]])
            X,Z=G.m(xs,ys); P=np.c_[X,Z]; a=P@u; b=P@v
            a0,a1=float(a.min()),float(a.max())
            bins=np.linspace(a0,a1,12); ws=[]
            for k in range(2,10):
                sel=(a>=bins[k])&(a<bins[k+1])
                if sel.sum()>5: ws.append(b[sel].max()-b[sel].min()+G.res)
            w=float(np.clip(round((np.median(ws) if ws else b.max()-b.min())*10)/10,wmin,wmax))
            bc=float(np.median(b))
            # the gap back to the treads, rows by depth
            s.R[m]=1
            s.band[m]=np.clip(np.floor(s.d[m]/s.D).astype(int),0,s.nrows-1)
            # the rectangle, from the gap's front out to the back of the stand
            y0_,y1_=max(0,ys.min()-400),min(G.H,ys.max()+400); x0_,x1_=max(0,xs.min()-400),min(G.W,xs.max()+400)
            gyy,gxx=np.mgrid[y0_:y1_,x0_:x1_]; GX,GZ=G.m(gxx,gyy)
            A=GX*u[0]+GZ*u[1]; B=GX*v[0]+GZ*v[1]
            # as far out as the stand goes behind the gap, no further
            pc=np.array([bc*v[0],bc*v[1]])
            t=a1+0.1
            while t<a1+60:
                gx_,gz_=G.g(*(pc+u*t)); i_,j_=int(round(float(gz_))),int(round(float(gx_)))
                if not (0<=i_<G.H and 0<=j_<G.W) or not s.R[i_,j_]: break
                t+=0.1
            rect=(np.abs(B-bc)<=w/2)&(A>=a0)&(A<=t)
            band=s.band[y0_:y1_,x0_:x1_]
            low=np.zeros_like(rect)
            on=rect&(band>=0)
            bots=np.array([s.bot(r) for r in range(s.nrows)])
            low[on]=bots[band[on]]<floor+head
            # the pit: the low rows over the rectangle, as far as they go
            if not low.any(): continue
            L=float(A[low].max()-a0+G.res)
            pit=rect&(A<=a0+L)
            sub=s.R[y0_:y1_,x0_:x1_]; subb=s.band[y0_:y1_,x0_:x1_]
            sub[pit]=0; subb[pit]=-1
            s.pits[y0_:y1_,x0_:x1_]|=pit
            # the roof beyond it, to the back of the stand
            p0=np.array([a0*u[0]+bc*v[0],a0*u[1]+bc*v[1]])
            def band_at(pt):
                gx_,gz_=G.g(pt[0],pt[1]); i_,j_=int(round(float(gz_))),int(round(float(gx_)))
                if not (0<=i_<G.H and 0<=j_<G.W): return -1
                return int(s.band[i_,j_]) if s.R[i_,j_] else -1
            T=0.0; roof=None
            t=L+0.15
            while t<L+60:
                r=band_at(p0+u*t)
                if r<0: break
                if roof is None: roof=round(s.bot(r),2)
                T=t-L+0.1; t+=0.1
            sides=[]
            for sg in (-1,1):
                cur=None
                for t in np.arange(0.05,L,0.1):
                    r=band_at(p0+u*t+v*sg*(w/2+0.25))
                    top=round(float(s.h(r)),2) if r>=0 else None
                    if cur and cur[3]==top: cur[2]=round(float(t+0.05),2)
                    else:
                        if cur and cur[3] is not None: sides.append(cur)
                        cur=[sg,round(float(max(0,t-0.05)),2),round(float(t+0.05),2),top]
                if cur and cur[3] is not None: sides.append(cur)
            voms.append({'p':[round(float(p0[0]),2),round(float(p0[1]),2)],'u':[round(float(u[0]),4),round(float(u[1]),4)],
                         'w':w,'L':round(L,2),'T':round(T,2),'y':round(float(floor),2),'roof':roof,'sides':sides,'label':''})
        return voms
    def aisle_doors(s):
        # where an aisle meets the back of the stand, there is a door
        seatfoot=cv2.dilate(s.seatmask,disk(1))
        A=((s.R>0)&(seatfoot==0)).astype(np.uint8)
        A=cv2.morphologyEx(A,cv2.MORPH_OPEN,disk(3))
        outside=((s.R==0)&(s.hull==0)).astype(np.uint8)
        backband=cv2.dilate(outside,disk(12))>0
        m=(A>0)&backband
        n,lab,st,cen=cv2.connectedComponentsWithStats(m.astype(np.uint8),connectivity=8)
        out=[]
        for i in range(1,n):
            if st[i,4]<20: continue
            x,z=s.G.m(cen[i][0],cen[i][1]); out.append((float(x),float(z)))
        return out
    def seats_out(s, sold=None):
        # little-endian int16 quads (x dm, z dm, row, yaw in degrees), base64
        import base64
        a=np.c_[np.round(s.seats[:,0]*10),np.round(s.seats[:,1]*10),s.row,np.round(np.degrees(s.yaw))].astype('<i2')
        return base64.b64encode(a.tobytes()).decode('ascii')

def mask_polys(G, m, eps=0.025, minarea=1.0):
    return [poly_out(p) for p in contours(G, m.astype(np.uint8), eps=eps, minarea=minarea)]

def edge_walls(G, lvl, outside_level, doors=(), door_w=1.8, rail=1.0, doorwall=2.6, flush='doors', skip=None, front=None):
    """Walls along a level's outline: a rail where it drops away, a wall with
    door openings where it meets a concourse at its own height. `skip(ox, oy,
    h)` leaves an edge to the concourse's own walls; `front` = (y0, above) puts
    a parapet along the front of the stand, from y0 (None: the front row's
    underside) to `above` over the front row."""
    R=lvl.R.astype(np.uint8)
    bandd=cv2.dilate((lvl.band+1).astype(np.float32),np.ones((5,5),np.uint8))
    rails=[]; walls=[]
    D=np.array(doors) if len(doors) else np.zeros((0,2))
    def inR(p):
        x,y=int(round(p[0])),int(round(p[1]))
        return 0<=x<G.W and 0<=y<G.H and R[y,x]>0
    pits=getattr(lvl,'pits',None)
    def pieces(ring):
        # each edge of the outline in pieces of at most half a metre, so a
        # long straight run is judged all along its length (a rail here, a
        # wall with doors there); the pieces are joined up again after
        n=len(ring)
        for i in range(n):
            a=ring[i]; b=ring[(i+1)%n]; L=np.hypot(*(b-a))
            k=max(1,int(np.ceil(L*G.res/0.5)))
            for j in range(k): yield a+(b-a)*j/k, a+(b-a)*(j+1)/k
    for o,hs in rings_px(R,0.02/G.res,sigma=0.8,minarea_px=2/G.res**2):
      for ring in [o]+list(hs):
        for a,b in pieces(ring):
            m=(a+b)/2
            t=b-a; L=np.hypot(*t)
            if L<1e-6: continue
            nrm=np.array([t[1],-t[0]])/L
            # which side is outside: sample both
            p1=m+nrm*4; p2=m-nrm*4
            out=p1 if not inR(p1) else p2
            if inR(out): continue
            ox,oy=int(round(out[0])),int(round(out[1]))
            ox=min(G.W-1,max(0,ox)); oy=min(G.H-1,max(0,oy))
            if pits is not None and pits[oy,ox]: continue      # a vomitory's side: its own walls
            ix,iy=int(round((m-(out-m))[0])),int(round((m-(out-m))[1]))
            ix=min(G.W-1,max(0,ix)); iy=min(G.H-1,max(0,iy))
            r=int(bandd[iy,ix])-1
            if r<0: continue
            h=float(lvl.h(r))
            A=G.m(a[0],a[1]); B=G.m(b[0],b[1])
            seg=[round(float(A[0]),2),round(float(A[1]),2),round(float(B[0]),2),round(float(B[1]),2)]
            if lvl.d[oy,ox]<0.6:                     # the front of the stand
                if front is not None and r==0:
                    y0=front[0]
                    if y0=='tread': y0=h-0.02
                    elif y0 is None:
                        if callable(lvl.bottom): y0=float(lvl.bottom(0,h))
                        elif lvl.bottom=='ground': y0=0.0
                        else: y0=h-lvl.fascia
                    # just proud of the front face
                    so=(out-m)/np.linalg.norm(out-m)*0.04
                    Af=np.array(G.m(a[0],a[1]))+so; Bf=np.array(G.m(b[0],b[1]))+so
                    rails.append([round(float(Af[0]),2),round(float(Af[1]),2),round(float(Bf[0]),2),round(float(Bf[1]),2),round(y0,2),round(h+front[1],2)])
                continue
            below=outside_level(ox,oy)
            if skip is not None and skip(ox,oy,h): continue
            notch=lvl.hull[oy,ox]>0          # a gap in the stand (a tunnel mouth), not its back
            if notch:
                if below is None or h-below>0.3: rails.append(seg+[round(h,2),round(h+rail,2)])
                continue
            if below is None or h-below>0.6: rails.append(seg+[round(h,2),round(h+rail,2)])
            elif flush=='open': continue
            else:
                # split round any door on this edge
                P0=np.array(A,np.float64); P1=np.array(B,np.float64); u=P1-P0; Lm=np.linalg.norm(u)
                cuts=[]
                for dx,dz in D:
                    q=np.array([dx,dz]); tt=np.dot(q-P0,u)/Lm/Lm
                    dist=np.linalg.norm(P0+u*np.clip(tt,0,1)-q)
                    if dist<2.5: cuts.append((tt*Lm-door_w/2,tt*Lm+door_w/2))
                s0=0
                for c0,c1 in sorted(cuts):
                    if c0>s0: walls.append([float(v) for v in np.round(np.r_[P0+u*s0/Lm,P0+u*min(c0,Lm)/Lm],2)]+[round(h,2),round(h+doorwall,2)])
                    s0=max(s0,c1)
                if s0<Lm: walls.append([float(v) for v in np.round(np.r_[P0+u*s0/Lm,P1],2)]+[round(h,2),round(h+doorwall,2)])
    return merge_runs(rails), merge_runs(walls)

def merge_runs(segs, tol=0.02):
    """Consecutive panels [x0,z0,x1,z1,y0,y1] that continue one another in a
    straight line at the same heights, as one."""
    out=[]
    for s in segs:
        if out:
            m=out[-1]
            d0=np.array([m[2]-m[0],m[3]-m[1]]); d1=np.array([s[2]-s[0],s[3]-s[1]])
            l0,l1=np.hypot(*d0),np.hypot(*d1)
            if (abs(m[2]-s[0])<tol and abs(m[3]-s[1])<tol and abs(m[4]-s[4])<0.01 and abs(m[5]-s[5])<0.01
                    and l0>1e-6 and l1>1e-6 and abs(d0[0]*d1[1]-d0[1]*d1[0])/(l0*l1)<0.01 and (d0@d1)>0):
                m[2],m[3]=s[2],s[3]; continue
        out.append(list(s))
    return out

# ── concourses closed in: ceilings, walls, lights ─────────────────────────────
def level_solid(l):
    """Per cell, the underside and top of a level's treads (each row reaching
    a little under the next, as rows_out draws them); NaN where there are none."""
    bot=np.full(l.band.shape,np.nan,np.float32); top=np.full(l.band.shape,np.nan,np.float32)
    k=np.ones((3,3),np.uint8)
    for r in range(l.nrows):
        m=(l.band==r)
        if not m.any(): continue
        m=m|((cv2.dilate(m.astype(np.uint8),k,iterations=3)>0)&(l.band>r))
        t=float(l.h(r))
        if callable(l.bottom): b=float(l.bottom(r,t))
        elif l.bottom=='ground': b=0.0
        else: b=t-(l.fascia if r==0 else l.bottom)
        bot[m]=np.fmin(bot[m],b); top[m]=np.fmax(top[m],t)
    return bot,top
def flight_solid(G,f,margin=0.0):
    """A flight's footprint, with the height of its treads over each cell."""
    gy,gx=np.mgrid[0:G.H,0:G.W]
    x0,z0,dx,dz,L=f['x'],f['z'],f['dx'],f['dz'],f['L']; w=f.get('w',1.6)
    # only a box round it, for speed
    xs=[x0,x0+dx*L]; zs=[z0,z0+dz*L]
    X0,Z0=G.g(min(xs)-w-margin-1,min(zs)-w-margin-1); X1,Z1=G.g(max(xs)+w+margin+1,max(zs)+w+margin+1)
    i0,i1=max(0,int(Z0)),min(G.H,int(Z1)+1); j0,j1=max(0,int(X0)),min(G.W,int(X1)+1)
    X,Z=G.m(gx[i0:i1,j0:j1],gy[i0:i1,j0:j1])
    al=(X-x0)*dx+(Z-z0)*dz; la=np.abs(-(X-x0)*dz+(Z-z0)*dx)
    on=(al>=-margin)&(al<=L+margin)&(la<=w/2+margin)
    top=f['y0']+(f['y1']-f['y0'])*np.clip(np.ceil(np.clip(al,0,L)/(L/f['n'])),1,f['n'])/f['n']
    return (i0,i1,j0,j1),on,top,al,la

def _resample(ring,step):
    out=[]
    n=len(ring)
    for i in range(n):
        a=ring[i]; b=ring[(i+1)%n]; L=np.hypot(*(b-a)); k=max(1,int(np.ceil(L/step)))
        for j in range(k): out.append(a+(b-a)*j/k)
    return np.array(out,np.float32)

def _chains(vals):
    """Per-vertex values round a closed ring (None where there is no wall) ->
    runs of consecutive vertices, joined across the ring's start."""
    n=len(vals)
    if n==0: return []
    if all(v is not None for v in vals): return [vals+vals[:1]]
    k=next(i for i,v in enumerate(vals) if v is None)
    rot=vals[k:]+vals[:k]
    out=[]; cur=[]
    for v in rot:
        if v is None:
            if len(cur)>1: out.append(cur)
            cur=[]
        else: cur.append(v)
    if len(cur)>1: out.append(cur)
    return out

def _emit(G,chains,out,inset=0.06):
    """Chains of (point_px, lo, hi, inward_px) -> merged wall panels
    [x0,z0,x1,z1,lo,hi] whose front faces the room (see buildStands)."""
    for ch in chains:
        if len(ch)<2: continue
        segs=[]
        for (p,lo,hi,nin),(q,lo2,hi2,nin2) in zip(ch[:-1],ch[1:]):
            l_=min(lo,lo2); h_=max(hi,hi2)
            if h_-l_<0.05: continue
            segs.append([p+nin*inset/G.res,q+nin2*inset/G.res,l_,h_,(nin+nin2)/2])
        # merge straight runs of equal height
        merged=[]
        for s in segs:
            if merged:
                m=merged[-1]
                d0=m[1]-m[0]; d1=s[1]-s[0]
                c=(d0[0]*d1[1]-d0[1]*d1[0])/(np.hypot(*d0)*np.hypot(*d1)+1e-9)
                if np.hypot(*(m[1]-s[0]))<0.05 and abs(c)<0.03 and (d0*d1).sum()>0 and abs(m[2]-s[2])<0.06 and abs(m[3]-s[3])<0.06:
                    m[1]=s[1]; m[2]=min(m[2],s[2]); m[3]=max(m[3],s[3]); continue
            merged.append(list(s))
        for p,q,lo,hi,nin in merged:
            P=G.m(p[0],p[1]); Q=G.m(q[0],q[1])
            dx,dz=Q[0]-P[0],Q[1]-P[1]
            # the panel's front is to the left of P->Q: (-dz, dx); make it the room's side
            if -dz*nin[0]+dx*nin[1]<0: P,Q=Q,P
            out.append([round(float(P[0]),2),round(float(P[1]),2),round(float(Q[0]),2),round(float(Q[1]),2),round(float(lo),2),round(float(hi),2)])

DEBUG={}
DOORLOG=[]
def enclose(G, rooms, levels, slabs, flights, lamp_step=6.0, door_w=1.8, door_h=2.5):
    """Close the concourses in. Each room: {'mask','y','cl','own':[Level],
    'doors':[(x,z)]}. The part of the room open to the bowl (inside the back of
    its own stands, with nothing over it) stays open; the rest gets a ceiling
    `cl` over the floor, or the underside of whatever is lower above it, and
    walls wherever it would otherwise look out: up from the stand or floor
    beside it to the ceiling, with doors where a stand meets it flush, left
    open onto the bowl-side part and at the head of each stair. Returns
    (data for the renderer, per-cell enclosed-ceiling map for edge_walls)."""
    solids=[level_solid(l) for l in levels]+[(np.where(m,y0,np.nan).astype(np.float32),np.where(m,y1,np.nan).astype(np.float32)) for m,y0,y1 in slabs]
    gy,gx=np.mgrid[0:G.H,0:G.W]
    res={'walls':[],'ceils':[],'lit':[],'lamps':[],'soffits':[]}
    roomtop_all=np.full((G.H,G.W),-np.inf,np.float32)
    for R_ in rooms:
        y=R_['y']; cl=R_.get('cl',3.8); Hk=y+cl; A=R_['mask'].copy()
        # what stands on the floor here, and what is overhead
        rise=np.full((G.H,G.W),-np.inf,np.float32); over=np.full((G.H,G.W),np.inf,np.float32); overtop=np.full((G.H,G.W),np.inf,np.float32)
        for bot,top in solids:
            ok=~np.isnan(bot)
            r_=ok&(bot<=y+0.3)&(top>y-0.35)
            rise[r_]=np.maximum(rise[r_],top[r_])
            o_=ok&(bot>y+0.3)
            upd=o_&(bot<over)
            over[upd]=bot[upd]; overtop[upd]=top[upd]
        # a stand standing on this floor is not part of the room
        A&=~(rise>y+0.3)
        # stairs up from this floor through its ceiling: a shaft
        shaft=np.zeros_like(A); landings=[]
        for f in flights:
            (i0,i1,j0,j1),on,top,al,la=flight_solid(G,f,0.0)
            sub=(slice(i0,i1),slice(j0,j1))
            rise[sub]=np.where(on,np.maximum(rise[sub],top),rise[sub])
            if abs(f['y0']-y)<0.05 and f['y1']>Hk-0.3:
                (i0,i1,j0,j1),on2,_,_,_=flight_solid(G,f,0.45)
                shaft[i0:i1,j0:j1]|=on2
            if abs(f['y1']-y)<0.05:
                landings.append(f)
        # open to the bowl: inside the back of the room's own stands
        inbowl=np.zeros_like(A)
        for l in R_.get('own',[]):
            cx,cz=l.centre; X,Z=G.m(gx,gy); th=np.arctan2(Z-cz,X-cx); rr=np.hypot(X-cx,Z-cz)
            nb=3600; bi=((th+np.pi)/(2*np.pi)*nb).astype(int)%nb
            on=l.hull>0; rb=np.zeros(nb); np.maximum.at(rb,bi[on],rr[on])
            inbowl|=(rb[bi]>0)&(rr<=rb[bi]+0.05)
        low=A&(over<Hk+1.0)
        # open: a gap in the room's own stands (a tunnel mouth, a walkway): no
        # rows of theirs over it, whatever higher tier overhangs it
        ownrows=np.zeros_like(A)
        for l in R_.get('own',[]): ownrows|=(l.band>=0)
        openm=A&inbowl&~low&~shaft&~ownrows
        # the vomitories' pits: open, with no wall across their mouths (they
        # have their own walls)
        if R_.get('open') is not None:
            op=R_['open']&~(rise>y+0.3)
            A|=op; openm|=op
        ceil=A&~low&~openm
        encl=A&~openm
        roomtop=np.where(low,over,Hk).astype(np.float32)
        DEBUG[R_.get('name')]=(ceil,low,openm,shaft,A)
        roomtop_all[encl]=np.maximum(roomtop_all[encl],roomtop[encl])
        print('  room',R_.get('name'),'y',y,'cells: enclosed',int(encl.sum()),'ceiling',int(ceil.sum()),'under',int(low.sum()),'open',int(openm.sum()),'shaft',int(shaft.sum()))
        # ceilings, the lit floor, and soffit linings under the stands
        cp=[poly_out(p,2) for p in contours(G,ceil,eps=0.02,minarea=0.5)]
        if cp: res['ceils'].append({'y':round(Hk,3),'polys':cp})
        lp=[poly_out(p,2) for p in contours(G,encl,eps=0.02,minarea=0.5)]
        if lp: res['lit'].append({'y':round(y,3),'polys':lp})
        if low.any():
            q=np.round(np.where(low,over,0)*20)/20
            for v in np.unique(q[low]):
                mm=low&(q==v)
                if mm.sum()*G.res**2<0.5: continue
                sp=[poly_out(p,2) for p in contours(G,mm,eps=0.02,minarea=0.5,sigma=0.6)]
                if sp: res['soffits'].append({'y':round(float(v)-0.012,3),'polys':sp})
                # the risers up to the next row's underside, lined too
                ch=[]
                for o,hs in rings_px(mm,0.02/G.res,sigma=0.6,minarea_px=0.5/G.res**2):
                    for ring in [o]+list(hs):
                        P=_resample(ring,3.0); n=len(P)
                        d=np.roll(P,-1,axis=0)-np.roll(P,1,axis=0); d/=np.maximum(1e-6,np.hypot(d[:,0],d[:,1]))[:,None]
                        nrm=np.c_[d[:,1],-d[:,0]]
                        vals=[]
                        for i in range(n):
                            seg=None
                            for sgn in (1,-1):
                                pi=P[i]+nrm[i]*sgn*1.5; po=P[i]-nrm[i]*sgn*2.0
                                ii=(int(round(min(G.H-1,max(0,pi[1])))),int(round(min(G.W-1,max(0,pi[0])))))
                                io=(int(round(min(G.H-1,max(0,po[1])))),int(round(min(G.W-1,max(0,po[0])))))
                                if mm[ii] and not mm[io]:
                                    if low[io] and q[io]>v+0.02: seg=(v-0.012,float(q[io]),-nrm[i]*sgn)   # seen from under the higher row
                                    break
                            vals.append(None if seg is None else (P[i],seg[0],seg[1],seg[2]))
                        ch+=_chains(vals)
                _emit(G,ch,res['walls'],inset=0.03)
        # doors, as points
        doors=np.array(R_.get('doors',[]),float).reshape(-1,2)
        def cls(px,py):
            x,y_=int(round(px)),int(round(py))
            if not (0<=x<G.W and 0<=y_<G.H): return 'out'
            if encl[y_,x]: return 'in'
            if openm[y_,x]: return 'open'
            return 'out'
        chains_wall=[]; chains_step=[]
        for o,hs in rings_px(encl,0.02/G.res,sigma=0.8,minarea_px=0.5/G.res**2):
            for ring in [o]+list(hs):
                P=_resample(ring,3.0)
                n=len(P)
                d=np.roll(P,-1,axis=0)-np.roll(P,1,axis=0); d/=np.maximum(1e-6,np.hypot(d[:,0],d[:,1]))[:,None]
                nrm=np.c_[d[:,1],-d[:,0]]
                # which way is in
                ins=[]
                for i in range(n):
                    a=cls(*(P[i]+nrm[i]*2.5)); b=cls(*(P[i]-nrm[i]*2.5))
                    ins.append(1 if (a=='in' and b!='in') else (-1 if (b=='in' and a!='in') else 0))
                ins=np.array(ins)
                s_=np.sign(ins.sum()) or 1
                nin=nrm*s_
                XY=np.c_[G.m(P[:,0],P[:,1])]
                isdoor=np.zeros(n,bool)
                for dxz in doors:
                    dd=np.hypot(XY[:,0]-dxz[0],XY[:,1]-dxz[1]); j=int(np.argmin(dd))
                    if dd[j]<3.0: isdoor|=np.hypot(XY[:,0]-XY[j,0],XY[:,1]-XY[j,1])<door_w/2
                    DOORLOG.append((R_.get('name'),float(dxz[0]),float(dxz[1]),float(dd[j])))
                land=np.zeros(n,bool)
                for f in landings:
                    al=(XY[:,0]-f['x'])*f['dx']+(XY[:,1]-f['z'])*f['dz']; la=np.abs(-(XY[:,0]-f['x'])*f['dz']+(XY[:,1]-f['z'])*f['dx'])
                    land|=(al>f['L']-1.4)&(al<f['L']+0.6)&(la<f.get('w',1.6)/2+0.12)
                vals=[]
                for i in range(n):
                    pin=P[i]+nin[i]*1.5; pout=P[i]-nin[i]*2.5
                    ai=(int(round(min(G.H-1,max(0,pin[1])))),int(round(min(G.W-1,max(0,pin[0])))))
                    bo=(int(round(min(G.H-1,max(0,pout[1])))),int(round(min(G.W-1,max(0,pout[0])))))
                    top_a=float(roomtop[ai]) if encl[ai] else Hk
                    kind=cls(pout[0],pout[1])
                    seg=None
                    if land[i]: seg=None
                    elif kind=='open':
                        if ceil[ai]: seg=(y+door_h+0.2,Hk+0.3)       # a lintel over the way out to the bowl
                    elif kind=='out':
                        lo=max(y,float(rise[bo])) if np.isfinite(rise[bo]) else y
                        hi=top_a+(0.3 if ceil[ai] else 0.0)
                        ob=float(over[bo])
                        if lo<ob<hi: hi=ob
                        if isdoor[i] and abs(lo-y)<0.45: lo=max(lo,y+door_h)
                        if hi-lo>0.05: seg=(lo,hi)
                    vals.append(None if seg is None else (P[i],seg[0],seg[1],nin[i]))
                chains_wall+=_chains(vals)
        # steps in the ceiling: where a ceiling meets the underside of a stand
        if low.any() and ceil.any():
            for o,hs in rings_px(low,0.02/G.res,sigma=0.8,minarea_px=0.5/G.res**2):
                for ring in [o]+list(hs):
                    P=_resample(ring,3.0); n=len(P)
                    d=np.roll(P,-1,axis=0)-np.roll(P,1,axis=0); d/=np.maximum(1e-6,np.hypot(d[:,0],d[:,1]))[:,None]
                    nrm=np.c_[d[:,1],-d[:,0]]
                    vals=[]
                    for i in range(n):
                        seg=None
                        for sgn in (1,-1):
                            pl=P[i]+nrm[i]*sgn*1.5; pc=P[i]-nrm[i]*sgn*1.5
                            il=(int(round(min(G.H-1,max(0,pl[1])))),int(round(min(G.W-1,max(0,pl[0])))))
                            ic=(int(round(min(G.H-1,max(0,pc[1])))),int(round(min(G.W-1,max(0,pc[0])))))
                            if low[il] and ceil[ic]:
                                b_,t_=float(over[il]),float(overtop[il])
                                if t_<Hk-0.05: seg=(t_,Hk+0.02,-nrm[i]*sgn)    # seen from under the ceiling
                                elif b_>Hk+0.05: seg=(Hk-0.02,b_,nrm[i]*sgn)   # seen from under the stand
                                break
                        vals.append(None if seg is None else (P[i],seg[0],seg[1],seg[2]))
                    chains_step+=_chains(vals)
        # the shafts round the stairs, from the ceiling up to the floor above
        for f in flights:
            if abs(f['y0']-y)<0.05 and f['y1']>Hk-0.3:
                w=f.get('w',1.6)/2+0.45; L=f['L']
                ux,uz=f['dx'],f['dz']; vx,vz=-uz,ux
                c=[(f['x']+ux*a_+vx*b_,f['z']+uz*a_+vz*b_) for a_,b_ in ((-0.45,-w),(L+0.45,-w),(L+0.45,w),(-0.45,w))]
                top=f['y1']-0.35
                if top>Hk:
                    for k_ in range(4):
                        (x0,z0),(x1,z1)=c[k_],c[(k_+1)%4]
                        # face in, to the stair
                        mx,mz=(x0+x1)/2,(z0+z1)/2; cx_,cz_=f['x']+ux*L/2,f['z']+uz*L/2
                        if -(z1-z0)*(cx_-mx)+(x1-x0)*(cz_-mz)<0: x0,z0,x1,z1=x1,z1,x0,z0
                        res['walls'].append([round(x0,2),round(z0,2),round(x1,2),round(z1,2),round(Hk-0.02,2),round(top,2)])
        _emit(G,chains_wall,res['walls'])
        _emit(G,chains_step,res['walls'],inset=0.0)
        # lights: a lattice over the enclosed floor, kept off the walls
        inner=cv2.erode(encl.astype(np.uint8),disk(1.0/G.res))>0
        dist=cv2.distanceTransform(encl.astype(np.uint8),cv2.DIST_L2,5)
        sm=cv2.GaussianBlur(dist,(0,0),8); gzz,gxx=np.gradient(sm)
        st=int(lamp_step/G.res)
        for i in range(st//2,G.H,st):
            for j in range(st//2,G.W,st):
                # snap to the nearest inner cell within the lattice cell
                blk=inner[max(0,i-st//2):i+st//2,max(0,j-st//2):j+st//2]
                if not blk.any(): continue
                bi_,bj_=np.nonzero(blk); k_=np.argmin((bi_-st//2)**2+(bj_-st//2)**2)
                ii,jj=max(0,i-st//2)+bi_[k_],max(0,j-st//2)+bj_[k_]
                h_=float(roomtop[ii,jj])-0.03
                if h_-y<2.1: continue
                X,Z=G.m(jj,ii)
                # along the corridor: across the gradient of the distance from its walls
                yaw=float(np.arctan2(gxx[ii,jj],gzz[ii,jj])) if (gxx[ii,jj]**2+gzz[ii,jj]**2)>1e-8 else 0.0
                res['lamps'].append([round(float(X),2),round(h_,2),round(float(Z),2),round(yaw,3)])
    return res, roomtop_all

def trim_tunnels(G, voms, room):
    """A vomitory's tunnel runs on under the roof rows only until it reaches
    the concourse (`room`), where it opens into it."""
    for v in voms:
        if not v['T']: continue
        p=np.array(v['p']); u=np.array(v['u'])
        t=v['L']+0.2
        while t<v['L']+v['T']:
            gx_,gz_=G.g(*(p+u*t)); i_,j_=int(round(float(gz_))),int(round(float(gx_)))
            if 0<=i_<G.H and 0<=j_<G.W and room[i_,j_]: break
            t+=0.1
        v['T']=round(max(0.0,t-v['L']),2)
    return voms

def grow_under(c, y, levels, px=3):
    """A concourse floor reaching a little under the stands it meets, so there
    is no crack — but only under the stands higher than it, never over a row
    below it (which it would bury)."""
    g=cv2.dilate(c.astype(np.uint8),np.ones((3,3),np.uint8),iterations=px)>0
    for l in levels:
        on=l.band>=0
        low=np.zeros_like(on); low[on]=l.h(l.band[on])<y-0.05
        g&=~(low&~c)
    return g

def redepth(l, G, sec, fvecs, K, rows=None):
    """Rows counted by each section's own line rather than the stand's front:
    seat i belongs to section sec[i], which faces fvecs[s] (unit, toward the
    field) and has depth K[s] - p·fvecs[s] at a point p. Every cell takes the
    section of its nearest seat. `rows` (optional) are the seats' row indices
    as the plan numbers them; otherwise they come from the depth."""
    from standlib import sample
    S = l.seats
    seed = np.ones((G.H, G.W), np.uint8); lab_of = np.zeros((G.H, G.W), np.int32)
    gx_, gz_ = G.g(S[:, 0], S[:, 1]); gx_ = np.clip(np.round(gx_).astype(int), 0, G.W - 1); gz_ = np.clip(np.round(gz_).astype(int), 0, G.H - 1)
    seed[gz_, gx_] = 0; lab_of[gz_, gx_] = sec
    _, lab = cv2.distanceTransformWithLabels(seed, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(seed == 0); sec_of_label = np.r_[0, lab_of[zy, zx]]
    cs = sec_of_label[lab]
    gy, gx = np.mgrid[0:G.H, 0:G.W]; GX, GZ = G.m(gx, gy)
    fx, fz = fvecs[:, 0], fvecs[:, 1]
    l.d = (K[cs] - (GX * fx[cs] + GZ * fz[cs])).astype(np.float32)
    ds = sample(G, l.d, S)
    l.row = np.asarray(rows, int) if rows is not None else np.clip(np.floor(ds / l.D).astype(int), 0, None)
    l.nrows = int(l.row.max()) + 1
    l.band = np.where(l.R > 0, np.clip(np.floor(l.d / l.D).astype(int), 0, l.nrows - 1), -1)
    f = np.c_[fx[sec], fz[sec]]
    l.seats = S - f * ((l.row * l.D + l.D * 0.55) - ds)[:, None]
    l.yaw = np.arctan2(f[:, 0], f[:, 1])
    l.secmap = cs
