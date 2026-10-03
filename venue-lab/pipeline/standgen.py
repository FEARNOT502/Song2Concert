# Seats (metres) per level -> stand data for the renderer: row treads as
# polygons with heights, seats snapped onto their treads, aisle half-steps,
# vomitory mouths, concourse floors, rails and door openings.
import numpy as np, cv2, json
from standlib import Grid, disk, seat_mask, front_from, depth, sample, contours, rings_px, rings_field, smooth_front, STRAIGHT

SMOOTH_FRONT={'on':True,'sig':2.0}

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
    def __init__(s, G, name, seats, D, h0, rise, bottom='ground', fascia=2.6, close=1.1, keep_hole=3.0, centre=(0,0), open_w=3.0, hull_close=3.0, rmax=90, F=None, hs=None, front_sig=None, max_rows=None):
        s.G,s.name,s.D,s.h0,s.rise=G,name,D,h0,rise
        s.hs=None if hs is None else np.asarray(hs,float)
        s.bottom,s.fascia=bottom,fascia
        s.centre=centre
        M=seat_mask(G,seats)
        s.hull=smooth_hull(G,M,close=hull_close)
        if F is None:
            s.F=front_from(G,s.hull,centre,rmax=rmax)
            if SMOOTH_FRONT['on']: s.F=smooth_front(G,s.F,centre,front_sig or SMOOTH_FRONT['sig'])
        else: s.F=F
        s.d=depth(G,s.F)
        s.behind=behind_mask(G,s.F,centre)
        # the depth signed: negative in front of the front line, so the
        # front row's front edge is the line itself
        s.d=np.where(s.behind,s.d,-s.d).astype(np.float32)
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
        # no slivers: tongues of tread narrower than a metre (where the
        # front's trace and the rays from the centre disagree by a cell) go
        R=cv2.morphologyEx(R,cv2.MORPH_OPEN,disk(0.5/G.res))
        s.R=R
        s.seatmask=M
        ds=sample(G,s.d,seats)
        s.row=np.clip(np.floor(ds/D).astype(int),0,None)
        if max_rows is not None:
            # the few seats a smoothed front leaves a row or more too deep are
            # strays of the plan's tracing: they go
            keep=s.row<max_rows
            seats,ds,s.row=seats[keep],ds[keep],s.row[keep]
        s.raw=seats.copy()
        s.nrows=int(s.row.max())+1
        s.band=np.where(R>0,np.clip(np.floor(s.d/D).astype(int),0,s.nrows-1),-1)
        # snap each seat onto the middle-back of its tread, along the depth gradient
        gz,gx=np.gradient(cv2.GaussianBlur(s.d.astype(np.float32),(9,9),0))
        g=np.c_[sample(G,gx,seats),sample(G,gz,seats)]
        g/=np.maximum(1e-6,np.linalg.norm(g,axis=1))[:,None]
        want=s.row*D+D*0.55
        s.seats=seats+g*(want-ds)[:,None]
        s.yaw=np.arctan2(-g[:,0],-g[:,1])     # facing the front (down the gradient)
    def set_depth(s, d, grad=None):
        """The rows counted from another depth field (signed metres, the
        stand positive): the seats' rows, the treads' bands, and the seats
        snapped on to their treads again. `grad`: the field to take the
        seats' facing from, where `d` jumps (one section to the next)."""
        G=s.G; seats=s.raw
        s.d=d.astype(np.float32); s.behind=s.d>=0
        ds=sample(G,s.d,seats)
        s.row=np.clip(np.floor(ds/s.D).astype(int),0,None)
        s.nrows=int(s.row.max())+1
        s.band=np.where(s.R>0,np.clip(np.floor(s.d/s.D).astype(int),0,s.nrows-1),-1)
        gz,gx=grad if grad is not None else np.gradient(cv2.GaussianBlur(s.d,(9,9),0))
        g=np.c_[sample(G,gx,seats),sample(G,gz,seats)]
        g/=np.maximum(1e-6,np.linalg.norm(g,axis=1))[:,None]
        s.seats=seats+g*(s.row*s.D+s.D*0.55-ds)[:,None]
        s.yaw=np.arctan2(-g[:,0],-g[:,1])
    def h(s,r):
        if s.hs is not None: return s.hs[np.clip(np.asarray(r),0,len(s.hs)-1)]
        return s.h0+s.rise*np.asarray(r)
    def rows_out(s):
        # Each row traced as the zero level of a continuous field: the depth
        # between its front and its back (and a little under the next row
        # up, so the treads meet with no crack), within the tread's own
        # outline — so a row laid out along a straight or curved front is
        # straight or curved, not the raster's steps.
        from scipy.ndimage import distance_transform_edt
        out=[]
        k=np.ones((3,3),np.uint8)
        G=s.G; R=s.band>=0
        # where the tread's raster outline falls short of the front line, the
        # front row runs on to the line: cells just in front of the tread
        # (the tread met within a metre going back from them) are the row's
        from scipy.ndimage import map_coordinates
        gz_,gx_=np.gradient(cv2.GaussianBlur(np.abs(s.d).astype(np.float32),(0,0),4))
        gn=np.maximum(np.hypot(gx_,gz_),1e-6)
        cand=(~R)&(s.d>-0.05)&(s.d<s.D)&(cv2.dilate(R.astype(np.uint8),disk(1.0/G.res))>0)
        cy,cx=np.nonzero(cand); hit=np.zeros(len(cy),bool)
        for t in (2,4,6,8,10):
            sy=cy+gz_[cy,cx]/gn[cy,cx]*t; sx=cx+gx_[cy,cx]/gn[cy,cx]*t
            hit|=map_coordinates(R.astype(np.float32),[sy,sx],order=0,mode='constant')>0.5
        R=R.copy(); R[cy[hit],cx[hit]]=True
        sdR=(np.where(R,distance_transform_edt(R)-0.5,-(distance_transform_edt(~R)-0.5))*G.res).astype(np.float32)
        for r in range(s.nrows):
            m=(s.band==r).astype(np.uint8)
            if not m.any(): continue
            top=float(s.h(r))
            if callable(s.bottom): bot=float(s.bottom(r,top))
            elif s.bottom=='ground': bot=0.0
            else: bot=top-(s.fascia if r==0 else s.bottom)
            ys,xs=np.nonzero(m); pad=8
            box=(max(0,ys.min()-pad),min(G.H,ys.max()+pad+1),max(0,xs.min()-pad),min(G.W,xs.max()+pad+1))
            sl=(slice(box[0],box[1]),slice(box[2],box[3]))
            d=s.d[sl]; b=s.band[sl]
            lo=d-r*s.D
            if r>0: lo=np.where(d<0,-1.0,lo)
            hi=(r+1)*s.D+0.3-d
            # where the rows stop (the last row, or a section's last) the row
            # runs on to the tread's back
            capped=(b==r)&(d>=(r+1)*s.D-1e-3)
            capped=cv2.dilate(capped.astype(np.uint8),k,iterations=2)>0
            hi=np.where(capped,10.0,hi)
            # and no further than the raster says it may (a section's edge
            # where the depth jumps, the rows either side of a gap)
            f=np.minimum(np.minimum(lo,hi),sdR[sl])
            if getattr(s,'secmap',None) is not None or getattr(s,'sec',None) is not None:
                # a level measured section by section: its depth jumps at the
                # sections' edges, so a row stops at its own section's edge
                mb=(m[sl]|(cv2.dilate(m[sl],k,iterations=3)&(b>r))).astype(np.uint8)
                mb=cv2.dilate(mb,k,iterations=2)>0
                sdm=np.where(mb,distance_transform_edt(mb)-0.5,-(distance_transform_edt(~mb)-0.5))*G.res
                f=np.minimum(f,sdm)
            f=f.astype(np.float32)
            full=np.full((G.H,G.W),-1.0,np.float32); full[sl]=f
            polys=[]
            for o,hs in rings_field(full,0.03/G.res,0.2/G.res**2,box=box):
                ring=lambda q: np.c_[G.m(q[:,0],q[:,1])]
                polys.append(poly_out([ring(o)]+[ring(h) for h in hs],2))
            out.append({'r':r,'y':round(top,3),'y0':round(bot,3),'polys':polys})
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
            # each half step a clean rectangle: the tightest one round the
            # aisle's cells on this row (the seats either side leave its edges
            # ragged by a cell or two)
            n_,lab_=cv2.connectedComponents(rear,connectivity=8)
            for k_ in range(1,n_):
                ys_,xs_=np.nonzero(lab_==k_)
                if len(xs_)*s.G.res**2<0.15: continue
                (cx_,cy_),(w_,h_),a_=cv2.minAreaRect(np.c_[xs_,ys_].astype(np.float32))
                if min(w_,h_)*s.G.res<0.3: continue
                # an aisle's step is one row's rear half, an aisle wide: a
                # longer or deeper patch is a gangway along the row (a front
                # row left empty, a cross-aisle), flat, and its rectangle
                # would bridge the curve's chord out over the bowl
                if max(w_,h_)*s.G.res>3.5 or min(w_,h_)*s.G.res>s.D*0.75: continue
                box=cv2.boxPoints(((cx_,cy_),(w_+1,h_+1),a_))
                X_,Z_=s.G.m(box[:,0]-0.5+0.5,box[:,1]-0.5+0.5)
                out.append({'y':round(y,3),'y0':round(float(s.h(r)),3),'polys':[[[round(float(u),2),round(float(v),2)] for u,v in zip(X_,Z_)]]})
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
            # (0.4 m on past the last low row: its outline, traced smooth,
            # runs a little beyond its cells, and would stand in the tunnel's
            # way as a sliver of solid tread)
            L=float(A[low].max()-a0+G.res)+0.4
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

def edge_walls(G, lvl, outside_level, doors=(), door_w=1.8, rail=1.0, doorwall=2.6, flush='doors', skip=None, front=None, parapet=True, cheek=False, open_stand=False):
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
                if parapet and front is not None: continue      # front_parapet draws it whole
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
            end_=False
            if below is None and cheek and getattr(lvl,'_blk',None) is not None:
                # a balcony's end (an edge running back from its front, square
                # to it): closed down to its underside, a flat cheek rather
                # than a rail on a slab cut off in the air
                sb=int(lvl._blk['sec'][min(G.H-1,max(0,int(round(m[1])))),min(G.W-1,max(0,int(round(m[0]))))])
                fv=lvl._blk['fin'][sb]; tv=(np.array(B)-np.array(A)); tv=tv/(np.linalg.norm(tv)+1e-9)
                end_=abs(float(tv@fv))>0.8
            if end_:
                # down to whatever stands under it (a callable `cheek` says what)
                yb=float(cheek(ix,iy)) if callable(cheek) else float(lvl.bot(r))
                rails.append(seg+[round(min(yb,h-0.02),2),round(h+rail,2)])
            elif below is None or h-below>0.6: rails.append(seg+[round(h,2),round(h+rail,2)])
            elif flush=='open': continue
            elif open_stand:
                # no wall behind the stand: where it stands lower than the concourse, a rail-high wall up the step
                if below-h>=0.4: walls.append(seg+[round(h,2),round(below+rail,2)])
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
def enclose(G, rooms, levels, slabs, flights, lamp_step=6.0, door_w=1.8, door_h=2.5, roof=None):
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
        # a walkway: open overhead, but closed off from the room by a wall with
        # doors (unlike the open part, which the room opens onto)
        walk=None
        if R_.get('walk') is not None:
            walk=R_['walk']&A&~low&~shaft&~openm
            openm=openm|walk
        ceil=A&~low&~openm
        encl=A&~openm
        roomtop=np.where(low,over,Hk).astype(np.float32)
        # under nothing but the roof: no ceiling of its own, its walls go on
        # up to the roof (no box standing in the air behind the top rows)
        if roof is not None and R_.get('toroof',True):
            tall=ceil&~np.isfinite(over)
            tall=cv2.morphologyEx(tall.astype(np.uint8),cv2.MORPH_OPEN,disk(2.5/G.res))>0
            ceil&=~tall
            roomtop=np.where(tall,roof,roomtop).astype(np.float32)
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
            if walk is not None and walk[y_,x]: return 'walk'
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
                    if dd[j]<3.0: isdoor|=np.hypot(XY[:,0]-XY[j,0],XY[:,1]-XY[j,1])<R_.get('door_w',door_w)/2
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
                    elif kind in ('out','walk'):
                        lo=max(y,float(rise[bo])) if np.isfinite(rise[bo]) else y
                        hi=top_a+(0.3 if ceil[ai] else 0.0)
                        ob=float(over[bo])
                        if lo<ob<hi: hi=ob
                        if isdoor[i] and abs(lo-y)<0.45: lo=max(lo,y+door_h)
                        if R_.get('open_stand') and ownrows[bo]: hi=lo      # no wall between the room and its own stands' rows
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
                if h_-y<2.1 or h_>Hk+0.5: continue
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

def straight_blocks(l, corner, wedges=4, pitch=0.5, aisle=0.4, extra_rows=1, retract=(), fill=False, full_corners=False):
    """A bowl laid out in blocks, each with straight rows, as a building with
    a polygonal plan has them: each side and each end one block across, every
    corner a fan of `wedges` blocks converging on the corner's centre
    `corner` = (cx, cz at -z, cz at +z) (where the straight sides and ends
    stop), each facing back along its middle, a radial aisle between them.
    The level's depth is recomputed block by block (each block's front a
    straight line through the old front's most forward points), its treads
    run on to that line, and its seats are laid again along the straight rows
    wherever the plan had seats (its aisles and tunnel mouths kept), `pitch`
    apart, facing the block's way."""
    from standlib import sample, seat_mask
    G = l.G; D = l.D
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    cx, czn, czp = corner
    sx = np.where(X >= 0, 1, -1); sz = np.where(Z >= 0, 1, -1)
    cz = np.where(Z >= 0, czp, czn)
    ax_, az_ = np.abs(X) - cx, np.abs(Z) - cz
    phi = np.degrees(np.arctan2(np.maximum(az_, 0), np.maximum(ax_, 1e-6)))
    k = np.clip(np.floor(phi / (90.0 / wedges)).astype(int), 0, wedges - 1)
    qi = (sx > 0).astype(int) + 2 * (sz > 0).astype(int)          # corner 0..3
    sec = np.where(az_ <= 0, np.where(sx > 0, 0, 1), np.where(ax_ <= 0, np.where(sz > 0, 2, 3), 4 + qi * wedges + k))
    nsec = 4 + 4 * wedges
    R0 = l.R > 0
    if fill and len(l.raw):
        # a balcony: its treads wherever the plan seats it (the level's own
        # trace, made from rays out of the room's centre, loses the angled
        # ends of a band that runs on round a corner)
        R0 |= cv2.morphologyEx(seat_mask(G, l.raw), cv2.MORPH_CLOSE, disk(1.0 / G.res)) > 0
    near = cv2.dilate(R0.astype(np.uint8), disk(2.0 / G.res)) > 0
    front = R0 & (l.d < 0.35)
    # The front as one polygon: each side and end a straight line, each
    # corner's blocks chords between vertices on the rays that part them,
    # each vertex where the old front crosses its ray — so neighbouring
    # blocks' fronts meet at a point, and the fascia and the parapet run on
    # round the corner unbroken.
    def side_line(axis_sel, coord, sgn):
        m = front & axis_sel
        return float(np.median(sgn * coord[m])) if m.any() else None
    xs_ = {1: side_line((sec == 0), X, 1), -1: side_line((sec == 1), X, -1)}
    zs_ = {1: side_line((sec == 2), Z, 1), -1: side_line((sec == 3), Z, -1)}
    # `retract`: the sides (+1, -1 in x) whose front rows are movable seats
    # standing in front of the fixed stand across a walkway (a telescopic
    # block, lettered A-H on the map): they are put away, the fixed stand's
    # front row becomes the front, and the rows are counted from it
    # (the walkway shows clearest in the plan's seats across the middle of a
    # side; the building is symmetric, so the depth found on one side is put
    # away on both)
    l.retracted = {}
    dr = None
    for sgn in (1, -1):
        v_ = xs_.get(sgn)
        if v_ is None or not retract: continue
        S_ = l.raw[(np.sign(l.raw[:, 0]) == sgn) & (np.abs(l.raw[:, 1]) < 6.0)]
        a_ = np.sort(np.abs(S_[:, 0])); a_ = a_[a_ < v_ + 10]
        g_ = np.nonzero(np.diff(a_) > 1.2)[0]
        if len(g_): dr = float(a_[g_[0] + 1]) - 0.55 * D - v_; break
    if dr is not None:
        for sgn in retract:
            if xs_.get(sgn) is not None: xs_[sgn] += dr; l.retracted[sgn] = round(dr, 2)
    def ray_hit(c0, u):
        t = np.arange(0.0, 60.0, 0.05); P = c0[None, :] + t[:, None] * u[None, :]
        i_ = np.clip(np.round((P[:, 0] - G.x0) / G.res).astype(int), 0, G.W - 1)
        j_ = np.clip(np.round((P[:, 1] - G.z0) / G.res).astype(int), 0, G.H - 1)
        hit = np.nonzero(R0[j_, i_])[0]
        return float(t[hit[0]]) if len(hit) else None
    fin = np.zeros((nsec, 2)); K = np.zeros(nsec); CORN = {}
    fin[0], fin[1], fin[2], fin[3] = (-1, 0), (1, 0), (0, -1), (0, 1)
    # K = V·f for a point V on the line: +x side, V = (x_side, *), f = (-1, 0)
    if xs_[1] is not None: K[0] = -xs_[1]
    if xs_[-1] is not None: K[1] = -xs_[-1]
    if zs_[1] is not None: K[2] = -zs_[1]
    if zs_[-1] is not None: K[3] = -zs_[-1]
    for q_ in range(4):
        s_x = 1 if q_ & 1 else -1; s_z = 1 if q_ & 2 else -1
        C0 = np.array([s_x * cx, s_z * (czp if s_z > 0 else czn)])
        rho = []
        for kk in range(wedges + 1):
            th_ = np.radians(kk * 90.0 / wedges)
            if kk == 0 and xs_[s_x] is not None: rho.append(xs_[s_x] - cx); continue
            if kk == wedges and zs_[s_z] is not None: rho.append(zs_[s_z] - abs(C0[1])); continue
            hs_ = [ray_hit(C0, np.array([s_x * np.cos(th_ + e), s_z * np.sin(th_ + e)])) for e in np.radians([-1.5, -0.75, 0, 0.75, 1.5])]
            hs_ = [h_ for h_ in hs_ if h_ is not None]
            rho.append(float(np.median(hs_)) if hs_ else None)
        # a ray that meets nothing (a corner running out to the backstage):
        # carry on the neighbour's
        for kk in range(wedges + 1):
            if rho[kk] is None:
                nb = [rho[j] for j in (kk - 1, kk + 1) if 0 <= j <= wedges and rho[j] is not None]
                rho[kk] = nb[0] if nb else 10.0
        # the plan's front round a corner is traced from its seats, which the
        # aisles and mouths break up: take it as a smooth arc from the side's
        # front to the end's, bowed as the traced one is on average
        lin = [rho[0] + (rho[wedges] - rho[0]) * kk / wedges for kk in range(wedges + 1)]
        bow = [np.sin(np.pi * kk / wedges) for kk in range(wedges + 1)]
        c_ = float(np.sum([(rho[kk] - lin[kk]) * bow[kk] for kk in range(1, wedges)]) / max(1e-9, np.sum([b * b for b in bow[1:wedges]])))
        c_ = max(0.0, c_)          # never bowed in toward the field: at worst a straight chamfer
        rho = [lin[kk] + c_ * bow[kk] for kk in range(wedges + 1)]
        V = [C0 + rho[kk] * np.array([s_x * np.cos(np.radians(kk * 90.0 / wedges)), s_z * np.sin(np.radians(kk * 90.0 / wedges))]) for kk in range(wedges + 1)]
        CORN[q_] = (C0, V, s_x, s_z)
        # Each corner block faces square to a front of its own: the one
        # beside the side faces as the side does, the one beside the end as
        # the end does, those between the corner's diagonal; blocks facing
        # the same way share one front line (their rows run on across the
        # aisle between them)
        side_s, end_s = (0 if s_x > 0 else 1), (2 if s_z > 0 else 3)
        n45 = -np.array([s_x, s_z]) / np.sqrt(2.0)
        # (the diagonal front through the middle of the fan's inner wedges' fronts,
        # so the diagonal blocks keep the share of the corner the plan gives them)
        K45 = float(((V[1] + V[wedges - 1]) / 2) @ n45)
        for kk in range(wedges):
            s_ = 4 + q_ * wedges + kk
            if kk == 0 and xs_[s_x] is not None: fin[s_] = fin[side_s]; K[s_] = K[side_s]
            elif kk == wedges - 1 and zs_[s_z] is not None: fin[s_] = fin[end_s]; K[s_] = K[end_s]
            else: fin[s_] = n45; K[s_] = K45
    # Each point belongs to the block it is deepest behind: the blocks part
    # along the bisectors of their fronts (mitred, as a bowl with a polygonal
    # plan is laid out), so a row on one side of an aisle is at the height of
    # the same row on the other, not a step up or down from it
    have = {0: xs_[1], 1: xs_[-1], 2: zs_[1], 3: zs_[-1]}
    best = np.full(X.shape, -1e9, np.float32); arg = np.full(X.shape, -1, np.int32)
    for s_ in range(nsec):
        if s_ < 4 and have[s_] is None: continue
        ds_ = (K[s_] - (X * fin[s_, 0] + Z * fin[s_, 1])).astype(np.float32)
        up_ = ds_ > best; best[up_] = ds_[up_]; arg[up_] = s_
    # blocks sharing a front line tie: each point goes to the one of them
    # nearest it round the corner
    arg = np.where(arg >= 0, arg, sec)
    for q_ in range(4):
        s_x = 1 if q_ & 1 else -1; s_z = 1 if q_ & 2 else -1
        order = {(0 if s_x > 0 else 1): -1, (2 if s_z > 0 else 3): wedges}
        for kk in range(wedges): order[4 + q_ * wedges + kk] = kk
        qm = (qi == q_)
        oa = np.full(X.shape, np.nan, np.float32)
        for s_, o_ in order.items(): oa[qm & (sec == s_)] = o_
        groups = {}
        for s_ in order:
            if s_ < 4 and have[s_] is None: continue
            groups.setdefault((round(float(fin[s_, 0]), 5), round(float(fin[s_, 1]), 5), round(float(K[s_]), 4)), []).append(s_)
        for g_ in groups.values():
            if len(g_) < 2: continue
            m = qm & np.isin(arg, g_) & ~np.isnan(oa)
            if not m.any(): continue
            os_ = np.array([order[s_] for s_ in g_], np.float32)
            pick = np.argmin(np.abs(oa[m][:, None] - os_[None, :]), axis=1)
            arg[m] = np.array(g_)[pick]
    sec = arg
    d = np.full(l.d.shape, -1e3, np.float32)
    # the depth laid out well beyond the treads, so anything added behind or
    # beside them later (a pocket filled, a gap bridged) is counted from the
    # same straight fronts
    near_d = cv2.dilate(R0.astype(np.uint8), disk(12.0 / G.res)) > 0
    for s_ in range(nsec):
        m = near_d & (sec == s_)
        if not m.any(): continue
        f = fin[s_]
        d[m] = K[s_] - (X[m] * f[0] + Z[m] * f[1])
    # the treads: the old ones, run forward to each block's straight front
    # where the stand lies just behind (a sliver in front of a curved front)
    back = np.zeros_like(R0)
    fx = fin[np.clip(sec, 0, nsec - 1), 0]; fz = fin[np.clip(sec, 0, nsec - 1), 1]
    for step in (0.5, 1.0, 1.5):
        ix = np.clip(np.round(gx - fx * step / G.res).astype(int), 0, G.W - 1)
        iy = np.clip(np.round(gy - fz * step / G.res).astype(int), 0, G.H - 1)
        back |= R0[iy, ix]
    sliver = near & ~R0 & (d >= 0) & (l.d > -1.6) & back
    R = (R0 | sliver) & (d >= 0)
    R = cv2.morphologyEx(R.astype(np.uint8), cv2.MORPH_OPEN, disk(0.3 / G.res)) > 0
    nrows = int(min(np.floor(d[R].max() / D) + 1, l.nrows + extra_rows))
    R &= d < nrows * D
    if fill:
        # a balcony: each block's treads the whole band from its straight
        # front to its last row, across the block as far as the plan's seats
        # go (its aisles bridged), its ends cut square to its front
        nrows = l.nrows
        R = np.zeros_like(R0); E = np.zeros_like(R0)
        for s_ in range(nsec):
            f = fin[s_]; u = np.array([-f[1], f[0]])
            m0 = R0 & (sec == s_) & (d > -1.0)
            if m0.sum() * G.res ** 2 < 2.0: continue
            U = X * u[0] + Z * u[1]
            lo_, hi_ = np.percentile(U[m0], [0.3, 99.7])
            R |= (sec == s_) & (U >= lo_) & (U <= hi_) & (d >= 0) & (d < nrows * D)
            E |= (sec == s_) & (U >= lo_) & (U <= hi_)
        l.extent = E
    # where the plan had seats: its seats' footprints closed over the gaps
    # between rows and seats, not over its aisles; a sliver takes the cover
    # of the stand just behind it
    cover = cv2.morphologyEx(l.seatmask.astype(np.uint8), cv2.MORPH_CLOSE, disk(0.35 / G.res)) > 0
    ix = np.clip(np.round(gx - fx * 1.2 / G.res).astype(int), 0, G.W - 1)
    iy = np.clip(np.round(gy - fz * 1.2 / G.res).astype(int), 0, G.H - 1)
    cover = np.where(sliver, cover[iy, ix], cover) & R
    if full_corners and not fill:
        # each corner block whole: a band from its straight front to its own
        # last row (the deepest the plan seats it), seated all along
        # the back a straight chord from ray to ray, from the side block's
        # back (the ray square to the side) to the end block's (square to the
        # end), so the backs run on unbroken round the corner
        rs = sample(G, sec, l.raw); dr = sample(G, d, l.raw)
        def depth_of(ids):
            k_ = np.isin(rs, ids)
            return (np.floor(np.percentile(dr[k_], 99.5) / D) + 1) * D if k_.sum() > 20 else None
        # the sides and the ends whole too, to the edges of their blocks
        # (their own gaps, a vomitory's mouth, kept)
        hull_gap = (l.hull > 0) & ~R0
        for s_ in range(4):
            dd_ = depth_of([s_])
            if dd_ is None: continue
            band_ = (sec == s_) & (d >= 0) & (d < dd_) & near_d & ~hull_gap
            R = (R & ~(sec == s_)) | band_
            cover = (cover & ~(sec == s_)) | (band_ & (cover | ~R0))
        for q_, (C0, V, s_x, s_z) in CORN.items():
            wids = [4 + q_ * wedges + kk for kk in range(wedges)]
            dside = depth_of([0 if s_x > 0 else 1]); dend = depth_of([2 if s_z > 0 else 3])
            if dend is None: dend = depth_of(wids[-1:]) or depth_of(wids)
            if dside is None: dside = depth_of(wids[:1]) or depth_of(wids)
            if dside is None or dend is None: continue
            Vb = []
            for kk in range(wedges + 1):
                dirv = np.array([s_x * np.cos(np.radians(kk * 90.0 / wedges)), s_z * np.sin(np.radians(kk * 90.0 / wedges))])
                Vb.append(V[kk] + dirv * (dside + (dend - dside) * kk / wedges))
            for kk in range(wedges):
                s_ = 4 + q_ * wedges + kk
                tb = Vb[kk + 1] - Vb[kk]; nb = np.array([-tb[1], tb[0]]) / (np.linalg.norm(tb) + 1e-9)
                if nb @ (C0 - Vb[kk]) < 0: nb = -nb           # toward the field
                inside = ((X - Vb[kk][0]) * nb[0] + (Z - Vb[kk][1]) * nb[1]) >= 0
                band_ = (sec == s_) & (d >= 0) & inside & near_d
                R = (R & ~(sec == s_)) | band_
                cover = (cover & ~(sec == s_)) | band_
        nrows = int(max(nrows, np.floor(d[R].max() / D) + 1))
    if fill:
        # a balcony's rows seated all the way along wherever the plan has a
        # seat in any of them (its aisles, seatless in every row, kept)
        cover = np.zeros_like(R)
        for s_ in range(nsec):
            f = fin[s_]; u = np.array([-f[1], f[0]])
            m = R & (sec == s_)
            if not m.any(): continue
            Ss = l.raw[sample(G, sec, l.raw) == s_] if len(l.raw) else l.raw
            if not len(Ss): continue
            us_ = np.sort(Ss @ u)
            U = X * u[0] + Z * u[1]
            idx = np.clip(np.searchsorted(us_, U[m]), 1, len(us_) - 1)
            dmin = np.minimum(np.abs(U[m] - us_[idx - 1]), np.abs(U[m] - us_[idx]))
            cm = np.zeros_like(R); cm[m] = dmin < 0.45
            cover |= cm
    # the aisles between the blocks
    secR = np.where(R, sec, -1)
    edge = np.zeros_like(R)
    for dy_, dx_ in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = secR; b = np.roll(np.roll(secR, dy_, 0), dx_, 1)
        edge |= (a >= 0) & (b >= 0) & (a != b)
    aisles = cv2.dilate(edge.astype(np.uint8), disk(aisle / G.res)) > 0
    cover &= ~aisles
    # the seats, block by block, row by row
    S, rows, yaws = [], [], []
    for s_ in range(nsec):
        f = fin[s_]; u = np.array([-f[1], f[0]])
        m = (secR == s_)
        if not m.any(): continue
        ys, xs = np.nonzero(m); P = np.c_[X[ys, xs], Z[ys, xs]]
        lo, hi = (P @ u).min(), (P @ u).max()
        us = np.arange(lo, hi, 0.05)
        for r in range(nrows):
            cc = K[s_] - (r + 0.55) * D                     # p·f on the row's line
            C = u[None, :] * us[:, None] + f[None, :] * cc
            i_ = np.clip(np.round((C[:, 0] - G.x0) / G.res).astype(int), 0, G.W - 1)
            j_ = np.clip(np.round((C[:, 1] - G.z0) / G.res).astype(int), 0, G.H - 1)
            ok = cover[j_, i_] & (secR[j_, i_] == s_)
            idx = np.nonzero(ok)[0]
            if not len(idx): continue
            for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                L_ = us[run[-1]] - us[run[0]] + 0.05
                n = int(np.floor(L_ / pitch + 1e-6))
                if n < 1: continue
                t0 = us[run[0]] - 0.025 + (L_ - n * pitch) / 2 + pitch / 2
                for kk in range(n):
                    S.append(u * (t0 + kk * pitch) + f * cc); rows.append(r); yaws.append(np.arctan2(f[0], f[1]))
    l.seats = np.array(S); l.row = np.array(rows); l.yaw = np.array(yaws); l.raw = l.seats.copy()
    l.d = np.where(R | (d > -1e2), d, l.d).astype(np.float32)
    l.behind = l.d >= 0
    l.hull = ((l.hull > 0) | sliver).astype(np.uint8)
    l.R = R.astype(np.uint8); l.nrows = nrows
    l.band = np.where(R, np.clip(np.floor(l.d / D).astype(int), 0, nrows - 1), -1)
    l.seatmask = seat_mask(G, l.seats)
    l.secmap = np.where(R, sec, 0).astype(np.int32)
    l._blk = {'fin': fin, 'K': K, 'sec': sec, 'aisles': aisles, 'pitch': pitch, 'corners': CORN}
    return {'sections': nsec, 'seats': len(S), 'rows': nrows, 'sliver_m2': float(sliver.sum() * G.res ** 2)}

def cut_tunnels(G, l, tunnels, body, deck_t=0.6, back=3.0):
    """Tunnels at floor level straight out under a stand: each `t` = {p: its
    mouth's centre on the stand's front, u: outward, w, h, closed, Lmax}. It
    runs from `back` metres in front of the mouth to where `body` ends (or
    Lmax); the rows too low to roof it are cut away over it (an open cut, its
    deck at its end), the rows above left as its roof. Adds L, deck, rect to
    each; returns the union of their footprints."""
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    allm = np.zeros((G.H, G.W), bool)
    for t in tunnels:
        p, u = np.asarray(t['p'], float), np.asarray(t['u'], float); v = np.array([-u[1], u[0]])
        L_ = 2.0
        while L_ < t.get('Lmax', 90.0):
            q = p + u * L_; i_, j_ = [int(round(float(c))) for c in G.g(q[0], q[1])]
            if not (0 <= i_ < G.W and 0 <= j_ < G.H) or not body[j_, i_]: break
            L_ += 0.2
        t['L'] = round(float(max(L_, t.get('Lmin', 0.0)) + (0.0 if t.get('closed') else 1.5)), 2)
        al = (X - p[0]) * u[0] + (Z - p[1]) * u[1]; la = np.abs((X - p[0]) * v[0] + (Z - p[1]) * v[1])
        m = (la < t['w'] / 2) & (al > -back) & (al < t['L'])
        t['mask'] = m; allm |= m
        on = m & (l.band >= 0)
        dt_ = t.get('slab', deck_t)
        low = on & (l.h(np.maximum(l.band, 0)) < t['h'] + dt_ + 0.01)
        t['deck'] = round(max(float(al[low].max()) + 0.05 if low.any() else 0.0, min(t.get('open', 0.0), t['L'])), 2)
        if t.get('trapezoid'):
            # the portal where the rows along the tunnel's middle clear it;
            # low rows beside it further in (a fan's side blocks) are a flat
            # deck over its roof
            mid_ = low & (la < 0.6)
            t['deck'] = round(float(al[mid_].max()) + 0.05 if mid_.any() else 0.0, 2)
            t['deckMask'] = low & (al > t['deck'])
            low = low & (al <= t['deck'])
        if t.get('covered'):
            # the rows too low to pass under, over the tunnel, are a flat
            # deck on its roof, level with the first row high enough
            t['deckMask'] = low.copy()
        l.R[low] = 0; l.band[low] = -1
        if t.get('trapezoid') and t['deckMask'].any():
            l.R[t['deckMask']] = 0; l.band[t['deckMask']] = -1
            ds_ = sample(l.G, t['deckMask'].astype(np.uint8), l.seats) > 0
            l.seats, l.row, l.yaw = l.seats[~ds_], l.row[~ds_], l.yaw[~ds_]
        q = l.seats - p
        keep = ~((np.abs(q @ v) < t['w'] / 2 + 0.3) & (q @ u > -back) & (q @ u < t['deck'] + 0.3))
        l.seats, l.row, l.yaw = l.seats[keep], l.row[keep], l.yaw[keep]
        t['rect'] = [(p + u * a + v * b).round(3).tolist() for a, b in ((-back, -t['w'] / 2), (t['L'], -t['w'] / 2), (t['L'], t['w'] / 2), (-back, t['w'] / 2))]
        t['deckY'] = t['h'] + dt_
        # the cut's side walls: a rail's height over the rows beside it, as
        # far as its deck (no higher than the deck's own parapet)
        sides = []
        for sg in (-1, 1):
            prof = []
            for a in np.arange(-back, t['deck'] + 0.01, 0.5):
                qq = p + u * a + v * sg * (t['w'] / 2 + 0.45)
                i_, j_ = [int(round(float(c))) for c in G.g(qq[0], qq[1])]
                b_ = int(l.band[j_, i_]) if (0 <= i_ < G.W and 0 <= j_ < G.H) else -1
                top = float(l.h(b_)) + 1.0 if b_ >= 0 else 1.1
                prof.append([round(float(a), 2), round(min(top, t['deckY'] + 1.0), 2)])
            # a straight slope, not the rows' steps: the upper envelope of
            # the steps, simplified
            if len(prof) > 2:
                P_ = np.array(prof, np.float32)
                q_ = cv2.approxPolyDP(P_.reshape(-1, 1, 2), 0.4, False)[:, 0, :]
                prof = [[round(float(a), 2), round(float(np.interp(a, P_[:, 0], np.maximum.accumulate(P_[:, 1]))), 2)] for a in q_[:, 0]]
            sides.append(prof)
        if t.get('trapezoid'):
            # the same wall either side: one straight rake (a trapezoid),
            # from a rail's height over the front row up to the deck's
            # parapet (not steepened to clear rows beside it that belong to
            # a block facing another way: those stand back from the cut)
            y0_ = float(l.h(0)) + 1.0
            sl_ = (t['deckY'] + 1.0 - y0_) / (t['deck'] + 0.4)
            sides = [[[-0.4, round(y0_, 2)], [round(t['deck'], 2), round(y0_ + sl_ * (t['deck'] + 0.4), 2)]]] * 2
        t['sides'] = sides
    return allm

def tunnel_rows(rows, tunnels, deck_t=0.6):
    deck_t = {id(t): t.get('slab', deck_t) for t in tunnels}
    """Over a tunnel the rows stand on its flat roof, not the ground."""
    from shapely.geometry import Polygon
    rects = [(Polygon(t['rect']), t['h'], deck_t[id(t)]) for t in tunnels]
    out = []
    def emit(geoms):
        ps = []
        for g in geoms:
            for q in (g.geoms if hasattr(g, 'geoms') else [g]):
                if q.geom_type != 'Polygon' or q.area < 0.05: continue
                ps.append([[[round(float(x), 2), round(float(z), 2)] for x, z in list(q.exterior.coords)[:-1]]] +
                          [[[round(float(x), 2), round(float(z), 2)] for x, z in list(h.coords)[:-1]] for h in q.interiors])
        return ps
    for r in rows:
        keep, over, touched = [], {}, False
        for polys in r['polys']:
            g = Polygon(polys[0], polys[1:]).buffer(0)
            for rc, th, dt in rects:
                if r['y0'] >= th or not g.intersects(rc): continue         # on the roof already, or clear of the tunnel
                if r['y'] < th + dt:
                    # lower than the roof's top: none of it stands over the tunnel (a sliver left by the row's
                    # overlap under the next one up goes too)
                    g = g.difference(rc); touched = True; continue
                i_ = g.intersection(rc)
                if not i_.is_empty: over.setdefault(th, []).append(i_)
                g = g.difference(rc); touched = True
            keep.append(g)
        if not touched: out.append(r); continue
        out.append({**r, 'polys': emit(keep)})
        for th, gs in over.items():
            ov = emit(gs)
            if ov: out.append({**r, 'y0': th, 'polys': ov})
    return out

def tunnels_out(tunnels):
    # (`T`, the walls' thickness, and `sidesAsWalls`, the cut's side walls drawn as data.cutWalls: only where a venue sets them)
    return [{'p': [round(float(c), 3) for c in t['p']], 'u': [round(float(c), 4) for c in t['u']], 'w': t['w'], 'h': t['h'], 'L': t['L'],
             'deck': t['deck'], 'deckY': t['deckY'], 'closed': bool(t.get('closed')), 'covered': bool(t.get('covered')), 'sides': t.get('sides'),
             **{k: t[k] for k in ('T', 'sidesAsWalls') if k in t}} for t in tunnels]

def front_parapet(G, l, front, eps=0.05, minlen=1.0):
    """The parapet along a tier's front, traced whole: the front line (the
    depth's zero level) wherever the front row stands behind it, drawn as one
    run at one height (the front row's, plus `front[1]`), from `front[0]`
    ('tread': the front row's tread; a number: that height) — not piece by
    piece off the raster's outline, which leaves it broken wherever the row
    behind a piece is not the front row, and stepped."""
    from skimage import measure
    near = cv2.dilate((l.band == 0).astype(np.uint8), disk(0.6 / G.res)) > 0
    pits = getattr(l, 'pits', None)
    if pits is not None and pits.any(): near &= ~(cv2.dilate(pits.astype(np.uint8), disk(0.25 / G.res)) > 0)
    ys, xs = np.nonzero(near)
    if not len(xs): return []
    y0_, y1_ = max(0, ys.min() - 2), min(G.H, ys.max() + 3); x0_, x1_ = max(0, xs.min() - 2), min(G.W, xs.max() + 3)
    f = l.d[y0_:y1_, x0_:x1_].astype(np.float64); msk = near[y0_:y1_, x0_:x1_]
    h = float(l.h(0))
    if front[0] == 'tread': yb = h - 0.02
    elif front[0] is None:
        yb = float(l.bottom(0, h)) if callable(l.bottom) else (0.0 if l.bottom == 'ground' else h - l.fascia)
    else: yb = float(front[0])
    yt = h + front[1]
    out = []
    for c in measure.find_contours(f, 0.0, mask=msk):
        if len(c) < 3: continue
        P = np.c_[c[:, 1] + x0_, c[:, 0] + y0_].astype(np.float32)
        closed = np.hypot(*(P[0] - P[-1])) < 1e-3
        q = cv2.approxPolyDP(P.reshape(-1, 1, 2), eps / G.res, closed)[:, 0, :]
        X, Z = G.m(q[:, 0], q[:, 1])
        L_ = float(np.sum(np.hypot(np.diff(X), np.diff(Z))))
        if L_ < minlen: continue
        n = len(q) if closed else len(q) - 1
        for i in range(n):
            j = (i + 1) % len(q)
            out.append([round(float(X[i]), 2), round(float(Z[i]), 2), round(float(X[j]), 2), round(float(Z[j]), 2), round(yb, 2), round(yt, 2)])
    return out

def lay_seats(l, mask):
    """Seats along the straight rows of a level laid out by straight_blocks,
    over `mask` (treads added after it: a pocket filled), 0.5 m apart, its
    aisles kept clear. Returns how many."""
    from standlib import seat_mask
    G = l.G; D = l.D; b = l._blk; fin, K, sec = b['fin'], b['K'], b['sec']
    gy, gx = np.mgrid[0:G.H, 0:G.W]; X, Z = G.m(gx, gy)
    ok_m = mask & (l.band >= 0) & ~b['aisles']
    S, rows, yaws = [], [], []
    for s_ in np.unique(sec[ok_m]):
        f = fin[s_]; u = np.array([-f[1], f[0]])
        m = ok_m & (sec == s_)
        ys, xs = np.nonzero(m); P = np.c_[X[ys, xs], Z[ys, xs]]
        us = np.arange((P @ u).min(), (P @ u).max(), 0.05)
        for r in np.unique(l.band[m]):
            cc = K[s_] - (r + 0.55) * D
            C = u[None, :] * us[:, None] + f[None, :] * cc
            i_ = np.clip(np.round((C[:, 0] - G.x0) / G.res).astype(int), 0, G.W - 1)
            j_ = np.clip(np.round((C[:, 1] - G.z0) / G.res).astype(int), 0, G.H - 1)
            idx = np.nonzero(m[j_, i_] & (l.band[j_, i_] == r))[0]
            if not len(idx): continue
            for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
                L_ = us[run[-1]] - us[run[0]] + 0.05; n = int(np.floor(L_ / b['pitch'] + 1e-6))
                if n < 1: continue
                t0 = us[run[0]] - 0.025 + (L_ - n * b['pitch']) / 2 + b['pitch'] / 2
                for kk in range(n):
                    S.append(u * (t0 + kk * b['pitch']) + f * cc); rows.append(r); yaws.append(np.arctan2(f[0], f[1]))
    if S:
        l.seats = np.r_[l.seats, np.array(S)]; l.row = np.r_[l.row, np.array(rows)]; l.yaw = np.r_[l.yaw, np.array(yaws)]
        l.seatmask = seat_mask(G, l.seats)
    return len(S)

def tunnel_decks(G, l, tunnels):
    """For covered tunnels: each deck as a tread (rows data), and a rail
    round its edges where the treads beside it are lower."""
    rows, rails = [], []
    for t in tunnels:
        m = t.get('deckMask')
        if m is None or not m.any(): continue
        ps = mask_polys(G, m, eps=0.03, minarea=0.5)
        rows.append({'r': -1, 'y': round(t['deckY'], 3), 'y0': round(t['h'], 3), 'polys': ps})
        for poly in ps:
            ring = np.array(poly[0]); n = len(ring)
            for i in range(n):
                a, b = ring[i], ring[(i + 1) % n]
                mid = (a + b) / 2; tv = b - a; L_ = np.linalg.norm(tv)
                if L_ < 1e-3: continue
                nv = np.array([tv[1], -tv[0]]) / L_
                lower = True
                for sg in (1, -1):
                    q = mid + nv * sg * 0.35; i_, j_ = [int(round(float(c))) for c in G.g(q[0], q[1])]
                    if not (0 <= i_ < G.W and 0 <= j_ < G.H): continue
                    if m[j_, i_]: continue
                    bnd = l.band[j_, i_]
                    lower = bnd < 0 or float(l.h(bnd)) < t['deckY'] - 0.3
                rows_ok = lower
                if rows_ok: rails.append([round(float(a[0]), 2), round(float(a[1]), 2), round(float(b[0]), 2), round(float(b[1]), 2), round(t['deckY'], 2), round(t['deckY'] + 1.0, 2)])
    return rows, rails

def relay_columns(l, sel, back=8.0, fwd=0.0, replace=False, near=0.3, pitch=0.5, cols=None, mindepth=0.0):
    """Seats along a level's rows over `sel`, wherever a row's cell lies in
    one of its blocks' columns: a seat within `near` of the line down the
    rake through it, from `fwd` in front to `back` behind (so a block runs on
    over the bare rows in front of it, and an aisle stays an aisle). With
    `replace`, the seats already over `sel` go first and are laid again, in
    straight rows. `cols`: the seats whose columns count (default: the
    level's own); `mindepth`: no seat on a tread shallower than this (where
    the rows crowd together). Returns how many seats were laid."""
    from scipy.spatial import cKDTree
    G = l.G; D = l.D
    tree0 = cKDTree(l.seats if cols is None else cols)
    gz, gx = np.gradient(cv2.GaussianBlur(l.d.astype(np.float32), (0, 0), 8))
    tdep = D / np.maximum(np.hypot(gx, gz) / G.res, 1e-6)      # each tread's depth
    if replace:
        k = sample(G, sel.astype(np.uint8), l.seats) == 0
        l.seats, l.row, l.yaw = l.seats[k], l.row[k], l.yaw[k]
    keep = cKDTree(l.seats) if len(l.seats) else None
    S, rows, yaws = [], [], []
    for r in range(l.nrows):
        line = sel & (l.R > 0) & (l.band == r) & (np.abs(l.d - (r + 0.55) * D) < 0.06) & (tdep >= mindepth)
        if getattr(l, 'pits', None) is not None: line &= ~l.pits
        ys, xs = np.nonzero(line)
        if not len(xs): continue
        X, Z = G.m(xs, ys); P = np.c_[X, Z]
        g = np.c_[gx[ys, xs], gz[ys, xs]]; g /= np.maximum(1e-6, np.linalg.norm(g, axis=1))[:, None]
        if keep is not None:
            ok = keep.query(P)[0] >= 0.45
            P, g = P[ok], g[ok]
        if not len(P): continue
        best = np.full(len(P), 9.0)
        for t in np.arange(-fwd, back + 1e-6, 0.1):
            best = np.minimum(best, tree0.query(P + g * t)[0])
        ok = best < near
        P, g = P[ok], g[ok]
        if not len(P): continue
        tr = cKDTree(P); taken = np.zeros(len(P), bool)
        th = np.arctan2(P[:, 0] - l.centre[0], P[:, 1] - l.centre[1])
        for i in np.argsort(th):
            if taken[i]: continue
            S.append(P[i]); rows.append(r); yaws.append(np.arctan2(-g[i, 0], -g[i, 1]))
            for j in tr.query_ball_point(P[i], pitch * 0.95): taken[j] = True
    if S:
        l.seats = np.r_[l.seats, np.array(S)]; l.row = np.r_[l.row, np.array(rows)]; l.yaw = np.r_[l.yaw, np.array(yaws)]
    l.seatmask = seat_mask(G, l.seats)
    return len(S)
