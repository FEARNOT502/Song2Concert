# Saitama Super Arena: is every concourse closed in? Along each concourse's enclosed floor's outline ('lit'), every
# quarter metre: from its floor to its ceiling, is it shut by a wall, the stands' solid rows or a slab, but at a door, a
# vomitory's mouth or a stair? -> the gaps.  `python3 ssa_closure.py [ssa_stands.json]` reports them; ssa_gen.py
# closes them (`gaps(data)`: each gap a piece of the outline and the heights it is open over).
import json,sys,numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.prepared import prep
def _mp(polys): return unary_union([Polygon(p[0],p[1:]).buffer(0) for p in polys if len(p[0])>=3])
def gaps(d,step=0.25,min_gap=0.3):
    walls=list(d['rooms']['walls'])+list(d['rooms']['thinWalls'])
    for L in d['levels']: walls+=L['walls']
    WL=[LineString([(w[0],w[1]),(w[2],w[3])]) for w in walls]; WT=STRtree(WL)
    solids=[]
    for L in d['levels']:
        for r in L['rows']:
            if r['polys']: solids.append((r.get('y0',r['y']-0.5),r['y'],prep(_mp(r['polys']))))
    for f in d['floors']: solids.append((f['y0'],f['y'],prep(_mp(f['polys']))))
    over=[(c['y'],prep(_mp(c['polys']))) for c in d['rooms']['ceils']+d['rooms']['soffits']]
    frames=[(np.array([f['x'],f['z']]),f['y']) for f in d['frames']]
    skip=[]
    for L in d['levels']:
        for v in L['voms']:
            p=np.array(v['p']); u=np.array(v['u']); t=np.array([-u[1],u[0]]); hw=v['w']/2+0.4; LL=v['L']+v.get('T',0.5)+0.6
            skip.append((prep(Polygon([p+t*hw-u*0.3,p-t*hw-u*0.3,p-t*hw+u*LL,p+t*hw+u*LL])),-1e9,1e9))
    for s in d['flights']:
        p=np.array([s['x'],s['z']]); u=np.array([s['dx'],s['dz']]); t=np.array([-u[1],u[0]]); hw=1.6/2+0.5
        skip.append((prep(Polygon([p+t*hw-u*0.6,p-t*hw-u*0.6,p-t*hw+u*(s['L']+2.0),p+t*hw+u*(s['L']+2.0)])),s['y0']-0.1,s['y1']+0.1))
    out=[]
    for room in d['rooms']['lit']:
        y=room['y']
        for poly in room['polys']:
            g=Polygon(poly[0],poly[1:])
            for ring in poly:
                R=np.array(list(ring)+[ring[0]],float)
                for k in range(len(R)-1):
                    a,b=R[k],R[k+1]; L_=float(np.hypot(*(b-a)))
                    if L_<1e-6: continue
                    u=(b-a)/L_; n0=np.array([u[1],-u[0]])
                    for s in np.arange(min(step/2,L_/2),L_,step):
                        p=a+u*s; n=n0
                        if g.contains(Point(*(p+n*0.3))) and not g.contains(Point(*(p-n*0.3))): n=-n
                        pin=Point(*(p-n*0.3)); pout=Point(*(p+n*0.3)); q=Point(*p)
                        top=y+4.0
                        for cy,G_ in over:
                            if y+0.5<cy<top and G_.contains(pin): top=cy
                        if any(np.linalg.norm(p-fp)<2.1 and abs(fy-y)<3.5 for fp,fy in frames): continue
                        if any(G_.contains(q) and y0<=y<=y1 for G_,y0,y1 in skip): continue
                        iv=[(walls[i][4],walls[i][5]) for i in WT.query(q.buffer(0.2)) if WL[i].distance(q)<0.2]
                        iv+=[(y0,y1) for y0,y1,G_ in solids if y1>y and y0<top and (G_.contains(pout) or G_.contains(q))]
                        iv.sort(); cur=y+0.15; best=(0.0,None)
                        for lo,hi in iv:
                            if lo>cur+0.05 and lo-cur>best[0]: best=(lo-cur,(cur,lo))
                            cur=max(cur,hi)
                            if cur>=top-0.15: break
                        if cur<top-0.15 and top-0.15-cur>best[0]: best=(top-0.15-cur,(cur,top-0.15))
                        if best[0]>min_gap:
                            h=min(step,L_)/2
                            out.append({'y':y,'a':(p-u*h).tolist(),'b':(p+u*h).tolist(),'lo':best[1][0],'hi':best[1][1]})
    return out
if __name__=='__main__':
    d=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'ssa_stands.json'))
    G=gaps(d)
    print('concourse outline open over more than 0.3 m: %d pieces (%.1f m)'%(len(G),len(G)*0.25))
    for g in G[:40]: print(' y%.2f (%.1f,%.1f) %.2f-%.2f'%(g['y'],*g['a'],g['lo'],g['hi']))
