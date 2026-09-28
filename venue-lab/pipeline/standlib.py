# Generic: seats (metres) of one level -> region, front edge, depth field, rows.
import numpy as np, cv2
class Grid:
    def __init__(s,x0,x1,z0,z1,res=0.1):
        s.x0,s.z0,s.res=x0,z0,res; s.W=int(round((x1-x0)/res)); s.H=int(round((z1-z0)/res))
    def g(s,x,z): return ((np.asarray(x)-s.x0)/s.res,(np.asarray(z)-s.z0)/s.res)
    def m(s,gx,gz): return (np.asarray(gx)*s.res+s.x0,np.asarray(gz)*s.res+s.z0)
    def empty(s,dtype=np.uint8): return np.zeros((s.H,s.W),dtype)
def disk(r): n=int(np.ceil(r)); y,x=np.ogrid[-n:n+1,-n:n+1]; return ((x*x+y*y)<=r*r).astype(np.uint8)
def seat_mask(G,S,r=0.42):
    M=G.empty(); gx,gz=G.g(S[:,0],S[:,1])
    rr=int(round(r/G.res))
    for x,z in zip(gx,gz): cv2.circle(M,(int(round(x)),int(round(z))),rr,1,-1)
    return M
def region(G,S,r=0.42,close=0.75,minhole=1.0):
    M=seat_mask(G,S,r)
    k=disk(close/G.res)
    R=cv2.morphologyEx(M,cv2.MORPH_CLOSE,k)
    # fill small holes only
    inv=(1-R).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(inv,connectivity=4)
    for i in range(1,n):
        if st[i,4]*G.res*G.res<minhole: R[lab==i]=1
    return R,M
def front_from(G,R,centre=(0,0),dth=0.0004,step=0.05,rmax=90,rmin=0):
    cx,cz=centre
    th=np.arange(0,2*np.pi,dth); rs=np.arange(rmin,rmax,step)
    F=G.empty()
    for chunk in np.array_split(th,40):
        X=cx+np.outer(np.cos(chunk),rs); Z=cz+np.outer(np.sin(chunk),rs)
        gx,gz=G.g(X,Z); gx=np.clip(gx.astype(int),0,G.W-1); gz=np.clip(gz.astype(int),0,G.H-1)
        hit=R[gz,gx]>0
        first=np.argmax(hit,axis=1); ok=hit[np.arange(len(chunk)),first]
        F[gz[ok,first[ok]],gx[ok,first[ok]]]=1
    return F
def depth(G,F):
    # exact Euclidean distance (the 5x5 chamfer's octagons show as facets in
    # the rows laid out along it)
    from scipy.ndimage import distance_transform_edt
    return (distance_transform_edt(F==0)*G.res).astype(np.float32)
def _smooth_open(p, sig, k, corner):
    # a chain smoothed along its length, its ends and its corners kept
    n=len(p)
    if n<5: return p
    q=np.r_[2*p[0]-p[k:0:-1],p,2*p[-1]-p[-2:-k-2:-1]] if n>k+1 else p
    closed=_smooth_chain(q.astype(np.float32),sig,k,corner)
    return closed[k:k+n] if n>k+1 else closed
def smooth_front(G,F,centre=(0,0),sig_m=2.0,corner=40.0,gap_m=1.5):
    """The front of a stand as the seats give it wobbles with them (a
    hull round seat circles); every row laid out behind it would carry the
    wobble. Trace it as seen from the centre, smooth it along its length —
    straight runs straight, curves even, corners kept — and draw it back."""
    cx,cz=centre
    fy,fx=np.nonzero(F)
    if not len(fx): return F
    X,Z=G.m(fx,fy); th=np.arctan2(Z-cz,X-cx); r=np.hypot(X-cx,Z-cz)
    nb=int(np.ceil(2*np.pi*r.max()/G.res))
    bi=((th+np.pi)/(2*np.pi)*nb).astype(int)%nb
    rmin=np.full(nb,np.inf); np.minimum.at(rmin,bi,r)
    ok=np.isfinite(rmin); idx=np.nonzero(ok)[0]
    tb=(idx+0.5)/nb*2*np.pi-np.pi
    P=np.c_[cx+rmin[idx]*np.cos(tb),cz+rmin[idx]*np.sin(tb)]
    # chains: split where the front has a gap (or jumps in or out)
    step=np.hypot(*np.diff(np.r_[P,P[:1]],axis=0).T)
    cuts=np.nonzero(step>gap_m)[0]
    if len(cuts)==0: chains=[(P,True)]
    else:
        P2=np.roll(P,-(cuts[0]+1),axis=0); st2=np.roll(step,-(cuts[0]+1))
        ends=np.nonzero(st2>gap_m)[0]; chains=[]; s0=0
        for e in ends: chains.append((P2[s0:e+1],False)); s0=e+1
    out=np.zeros_like(F)
    sig=sig_m/G.res; k=max(3,int(round(1.0/G.res)))
    for C,closed in chains:
        if len(C)<3: continue
        g=np.c_[G.g(C[:,0],C[:,1])].astype(np.float32)
        g=_smooth_chain(g,sig,k,corner) if closed else _smooth_open(g,sig,k,corner)
        g=_straighten(g,closed,int(round(4.0/G.res)),0.08/G.res)
        cv2.polylines(out,[np.round(g).astype(np.int32)],closed,1,1)
    return out
def _straighten(g,closed,minlen,tol):
    """Runs of a smoothed chain that are nearly straight made exactly
    straight: a line fitted to each, its points put on it. `minlen` points at
    least; within `tol` of the line all along."""
    n=len(g); g=g.copy()
    if n<minlen: return g
    i=0
    while i<n-minlen:
        j=i+minlen
        def fit(a,b):
            P=g[a:b]; c=P.mean(0); u=np.linalg.svd(P-c,full_matrices=False)[2][0]
            e=np.abs((P-c)@np.array([-u[1],u[0]])); return c,u,e.max()
        c,u,e=fit(i,j)
        if e>tol: i+=max(1,minlen//8); continue
        while j<n and fit(i,j+1)[2]<=tol: j+=max(1,minlen//16); j=min(j,n)
        c,u,_=fit(i,j)
        P=g[i:j]; g[i:j]=c+np.outer((P-c)@u,u)
        i=j
    return g
def sample(G,A,S):
    gx,gz=G.g(S[:,0],S[:,1]); return A[np.clip(np.round(gz).astype(int),0,G.H-1),np.clip(np.round(gx).astype(int),0,G.W-1)]
from skimage import measure
def _signed_area(p):
    x,y=p[:,0],p[:,1]; return 0.5*(np.dot(x,np.roll(y,-1))-np.dot(y,np.roll(x,-1)))
def _smooth_chain(p, sig=5.0, k=6, corner=40.0):
    """Smooth a dense closed chain along its length, leaving its corners sharp:
    a raster's staircase on a gentle curve is noise, a notch's corner is not."""
    n=len(p)
    if n<4*k: return p
    a=p-np.roll(p,k,axis=0); b=np.roll(p,-k,axis=0)-p
    ang=np.degrees(np.abs(np.arctan2(a[:,0]*b[:,1]-a[:,1]*b[:,0],(a*b).sum(1))))
    cand=ang>corner
    idx=[i for i in np.nonzero(cand)[0] if ang[i]>=ang[[(i+j)%n for j in range(-k,k+1)]].max()]
    # keep one per cluster
    idx=sorted(set(idx)); cs=[]
    for i in idx:
        if not cs or i-cs[-1]>k: cs.append(i)
    if len(cs)>1 and cs[0]+n-cs[-1]<=k: cs.pop()
    h=int(3*sig); w=np.exp(-0.5*(np.arange(-h,h+1)/sig)**2); w/=w.sum()
    if not cs:
        ext=np.r_[p[-h:],p,p[:h]]
        return np.c_[np.convolve(ext[:,0],w,'valid'),np.convolve(ext[:,1],w,'valid')].astype(np.float32)
    out=p.copy()
    for j,c0 in enumerate(cs):
        c1=cs[(j+1)%len(cs)]
        seg_i=np.arange(c0,c0+((c1-c0)%n or n)+1)%n
        seg=p[seg_i]
        m=len(seg)
        if m<3: continue
        hh=min(h,(m-1)//2)
        if hh<1: continue
        ww=np.exp(-0.5*(np.arange(-hh,hh+1)/sig)**2); ww/=ww.sum()
        # odd reflection about the fixed ends keeps them in place
        ext=np.r_[2*seg[0]-seg[hh:0:-1],seg,2*seg[-1]-seg[-2:-hh-2:-1]]
        sm=np.c_[np.convolve(ext[:,0],ww,'valid'),np.convolve(ext[:,1],ww,'valid')]
        out[seg_i[1:-1]]=sm[1:-1]
    return out.astype(np.float32)
# Straight mode: stands, walls and rails are built of straight runs meeting at
# corners, so outlines are traced without the blur and the along-the-chain
# smoothing (which round every corner and turn a raster's staircase into a
# wave) and simplified to a tolerance a little over the raster's step, which
# leaves each straight run one segment and a real curve a chain of chords.
STRAIGHT={'on':False,'eps':0.06,'res':0.1}
def rings_px(mask, eps_px=0.2, sigma=1.0, minarea_px=4, sig_chain=5.0):
    """The outline of a mask as smooth rings, in pixel coordinates (x right,
    y down, cell centres at integers): the mask blurred a little and cut at
    half height to sub-pixel precision, the chain smoothed along its length
    (corners kept), then Douglas-Peucker to `eps_px`. [(outer, [holes])]."""
    if STRAIGHT['on']:
        sigma=min(sigma,0.5); sig_chain=0; eps_px=max(eps_px,STRAIGHT['eps']/STRAIGHT['res'])
    m=(np.asarray(mask)>0)
    ys,xs=np.nonzero(m)
    if not len(xs): return []
    pad=int(3*sigma)+3
    x0=max(0,xs.min()-pad); y0=max(0,ys.min()-pad)
    x1=min(m.shape[1],xs.max()+pad+1); y1=min(m.shape[0],ys.max()+pad+1)
    f=np.zeros((y1-y0+2*pad,x1-x0+2*pad),np.float32)
    f[pad:pad+y1-y0,pad:pad+x1-x0]=m[y0:y1,x0:x1]
    if STRAIGHT['on']:
        # the outline as the zero level of the mask's signed distance: a
        # slanted edge comes out a straight line, not a blurred staircase
        from scipy.ndimage import distance_transform_edt
        b=f>0.5
        sd=np.where(b,distance_transform_edt(b)-0.5,-(distance_transform_edt(~b)-0.5)).astype(np.float32)
        return _rings_from(sd,0.0,np.array([x0-pad,y0-pad],np.float32),eps_px,minarea_px,0)
    if sigma>0: f=cv2.GaussianBlur(f,(0,0),sigma)
    return _rings_from(f,0.5,np.array([x0-pad,y0-pad],np.float32),eps_px,minarea_px,sig_chain)
def rings_field(field, eps_px=0.2, minarea_px=4, box=None):
    """Like rings_px, but the outline is the zero level of a continuous
    field (positive inside): sub-pixel, so a line the field draws straight or
    round comes out straight or round, not as the raster's steps."""
    if box is None: box=(0,field.shape[0],0,field.shape[1])
    y0,y1,x0,x1=box
    f=np.full((y1-y0+2,x1-x0+2),-1.0,np.float32)
    f[1:-1,1:-1]=field[y0:y1,x0:x1]
    return _rings_from(f,0.0,np.array([x0-1,y0-1],np.float32),eps_px,minarea_px,0)
def _rings_from(f,level,off,eps_px,minarea_px,sig_chain):
    outs,holes=[],[]
    for c in measure.find_contours(f,level):
        if len(c)<4: continue
        p=np.c_[c[:,1],c[:,0]].astype(np.float32)
        if np.hypot(*(p[0]-p[-1]))<1e-3: p=p[:-1]
        a=_signed_area(p)
        if abs(a)<minarea_px: continue
        # the polygon's own inside is left of its direction when a>0
        d=np.diff(np.r_[p,p[:1]],axis=0); L=np.hypot(d[:,0],d[:,1]); i=int(np.argmax(L))
        t=d[i]/L[i]; left=np.array([-t[1],t[0]])
        q_=p[i]+d[i]/2+(left if a>0 else -left)*0.7
        xx=min(f.shape[1]-1,max(0,int(round(q_[0])))); yy=min(f.shape[0]-1,max(0,int(round(q_[1]))))
        is_outer=f[yy,xx]>level
        if sig_chain>0: p=_smooth_chain(p,sig_chain)
        q=cv2.approxPolyDP(p.reshape(-1,1,2),eps_px,True)[:,0,:]
        if len(q)<3: continue
        (outs if is_outer else holes).append((abs(a),q+off,p+off))
    outs.sort(key=lambda t:t[0])
    placed=[[] for _ in outs]
    for ha,hq,hp in holes:
        pt=(float(hp[0,0]),float(hp[0,1]))
        for i,(oa,oq,op) in enumerate(outs):
            if oa>ha and cv2.pointPolygonTest(op.reshape(-1,1,2),pt,False)>=0: placed[i].append(hq); break
    return [(oq,placed[i]) for i,(oa,oq,op) in enumerate(outs)]
def contours(G,mask,eps=0.015,minarea=0.3,sigma=1.0):
    out=[]
    for o,hs in rings_px(mask,eps/G.res,sigma,minarea/(G.res*G.res)):
        out.append([np.c_[G.m(p[:,0],p[:,1])] for p in [o]+hs])
    return out
