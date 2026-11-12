"""Compact excite stands, rebuilt from real 2023/2026 photographs and PDF rows.

The fence is one continuous photographic outline. Complete numbered rows fit
inside it; rear rows attach to the 1F wall except the tapered pole blocks.
Metric pitch/depth is a photographic estimate, not a surveyed dimension.
See docs/references/tokyo-dome-review-2-sources.json.
"""
import json, base64, numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

# Only two schematic anchors select the wall side and pole endpoint. The
# schematic lot outlines are NEVER used as metric stand cells.
MAP_1B = {
    'G15': [[32.37,-13.31],[30.03,-10.41],[35.98,-5.57],[38.43,-8.58]],
    'G03': [[67.80,-61.72],[65.63,-57.46],[69.70,-56.11],[71.75,-61.03]],
}
ORDER = ['G%02d' % k for k in range(15, 2, -1)]          # home to pole
END_GAP = 0.0                    # along that wall, between the diagonal's end and the tunnel mouth's jamb
PITCH = 1.00                     # common fore/aft row pitch; photographic estimate
Y0, RISE = 0.05, 0.10            # the first row's floor over the field, and a row's step
SEAT_W = 0.82
HOME_ACCESS = 2.4  # light side access beside the single-column home extension; photo estimate
FENCE_H = 1.15                   # over the field: a padded fence about 0.85 m over the first row's floor
GATES = (('G14', 'G13'), ('G12', 'G11'), ('G10', 'G09'), ('G08', 'G07'), ('G06', 'G05'))   # steps up to the stand's aisle between these
STAIR_W = 1.0

def _u(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def _geom(polys): return unary_union([Polygon(p[0], p[1:]).buffer(0) for p in polys])
def _polys(g):
    out = []
    for q in getattr(g, 'geoms', [g]):
        if q.geom_type != 'Polygon' or q.area < 0.01: continue
        q = q.simplify(0.01)
        out.append([[[round(float(x), 2), round(float(z), 2)] for x, z in list(r.coords)[:-1]] for r in [q.exterior] + list(q.interiors)])
    return out

# Real photographs (2023 expansion, 2026 field/row views) show a compact
# attached stand. The seating chart is topological, not a metric floor plan.
# Stations below come from complete PDF row capacities; the rear datum is the
# actual lower stand wall, shared by every row, stair and end return.
def _side(sg, chart, FN, standY, mouth=None):
    name = (lambda n:n) if sg>0 else (lambda n:'G%02d'%(50-int(n[1:])))
    from scipy.ndimage import gaussian_filter1d
    # A raster wall contour is an ownership boundary, not a smooth row
    # datum. Smooth it before offsetting; otherwise normal flips at tiny
    # notches fold six parallel rows over one another.
    raw=FN.exterior
    sample=np.array([raw.interpolate(t).coords[0] for t in np.arange(0,raw.length,.25)])
    smooth=gaussian_filter1d(sample,6.,axis=0,mode='wrap')
    wall=LineString(np.vstack([smooth,smooth[0]]))
    nominal=np.array(MAP_1B['G03'][3])*[sg,1]
    if mouth is not None:
        mp=np.array(mouth['p'])*[sg,1];mu=np.array(mouth['u'])*[sg,1]
        mv=np.array([-mu[1],mu[0]])
        nominal=max((mp+mv*mouth['w']/2,mp-mv*mouth['w']/2),key=lambda q:q[1])
    end=wall.project(Point(nominal))
    home=wall.project(Point(np.array(MAP_1B['G15']).mean(axis=0)*[sg,1]))
    direction=1 if (end-home)%wall.length<wall.length/2 else -1
    end-=direction*END_GAP
    aisle_after={a for a,b in GATES}
    widths={n:max(map(len,chart[name(n)]))*SEAT_W+(HOME_ACCESS if n=='G15' else 0) for n in ORDER}
    total=sum(widths.values())+len(GATES)*STAIR_W+.4
    begin=end-direction*(total-.2)
    endpoint_delta=nominal-np.array(wall.interpolate(end%wall.length).coords[0])
    def at(t,depth=0):
        d=begin+direction*t
        p=np.array(wall.interpolate(d%wall.length).coords[0])
        a=np.array(wall.interpolate((d-direction*.15)%wall.length).coords[0])
        b=np.array(wall.interpolate((d+direction*.15)%wall.length).coords[0])
        along=_u(b-a); inward=np.array([-along[1],along[0]])
        if inward@(-p)<0:inward=-inward
        p=p+endpoint_delta*np.clip((t-(total-1.7))/1.5,0,1)
        return p+inward*depth,along,inward
    spans={};t=.2
    for n in ORDER:
        spans[n]=(t,t+widths[n]);t+=widths[n]+(STAIR_W if n in aisle_after else 0)
    # Follow the actual first A seat, not an assumed uniform apron. Some
    # first rows already approach the wall: retain their complete tread.
    from scipy.ndimage import maximum_filter1d
    stations=np.arange(0,total+.15,.15);required=[]
    for station in stations:
        p,al,inside=at(station);ids=standY.seatTree.query_ball_point(p,4.)
        q=standY.seatPoints[ids]-p
        along=q@al;depth=-(q@inside)
        good=(abs(along)<.65)&(depth>-.5)&(depth<4.)
        first=float(depth[good].min()) if good.any() else 1.7
        required.append(max(-1.5,.80-first))
    rear_profile=np.maximum(required,gaussian_filter1d(maximum_filter1d(np.array(required),size=21,mode='nearest'),5.,mode='nearest'))
    def rear_at(station):return float(np.interp(station,stations,rear_profile))
    def edge_at(station):return rear_at(station)-.40
    tapered={'G05','G04','G03'}
    def raw_front(station,n):
        rear=.60 if n in tapered else rear_at(station)
        return rear+(len(chart[name(n)])-1)*PITCH+.60
    def depth_at(station,n):
        # Photograph: one outward diagonal through the five-row transition,
        # then one straight taper from the deep six-row lots to the tunnel.
        # Rows remain parallel at a common pitch within each such plane.
        if n in ('G10','G09'):
            a,b=spans['G10'][0]-.6,spans['G08'][0]
            diagonal=float(np.interp(station,[a,b],[raw_front(a,'G10'),raw_front(b,'G08')]))
            return max(raw_front(station,n),diagonal)
        if n in tapered:
            a,b=spans['G06'][1],spans['G03'][1]
            return max(.65+(len(chart[name(n)])-1)*PITCH,float(np.interp(station,[a,b],[raw_front(a,'G06'),raw_front(b,'G03')])))
        return raw_front(station,n)
    def rear_row(station,n):
        return depth_at(station,n)-.60-(len(chart[name(n)])-1)*PITCH
    rows=[];seats=[];footprints=[];front=[];aisles=[];gates=[];finishes=[]
    for n in ORDER:
        lo,hi=spans[n];nums=chart[name(n)];nr=len(nums)
        rear_attached=n not in ('G05','G04','G03')
        base_y=Y0
        back_y=base_y+RISE*(nr-1)
        def height_at(r):return base_y+(back_y-base_y)*r/(nr-1)
        rear_edge=edge_at if rear_attached else (lambda v:0.)
        # The home extension uses the row direction immediately above it,
        # not the smoothed padded wall's tangent. Intersect each wall-normal
        # sample with the same parallel row lines so seats AND treads agree.
        main_frame=None
        if n in ('G15','G14'):
            mid=(lo+hi)/2;origin,al,inside=at(mid,rear_at(mid))
            ids=standY.seatTree.query_ball_point(origin,5.)
            axes=standY.seatAxes[ids]
            if len(axes):
                axes=axes.copy();axes[axes@al<0]*=-1
                axis=_u(np.median(axes,axis=0));normal=np.array([-axis[1],axis[0]])
                if normal@inside<0:normal=-normal
                # Keep the last chair clear of the actual A front chairs.
                probes=np.linspace(lo,hi,24)
                needed=max((at(v,rear_at(v))[0]-origin)@normal for v in probes)
                origin=origin+normal*needed
                main_frame=(origin,axis,normal)
        def row_depth(station,r):
            if main_frame is None:return rear_row(station,n)+(nr-1-r)*PITCH
            origin,axis,normal=main_frame;p,al,inside=at(station)
            return float(((origin-p)@normal+(nr-1-r)*PITCH)/(inside@normal))
        def patch(lower,upper):
            ts=np.linspace(lo,hi,max(2,int((hi-lo)/.2)+1))
            g=Polygon([at(v,lower(v))[0] for v in ts]+[at(v,upper(v))[0] for v in ts[::-1]]).buffer(0)
            return g
        cell=patch(rear_edge,lambda v:row_depth(v,0)+.60);footprints.append(cell)
        front_lo=lo
        front.extend([at(front_lo,row_depth(front_lo,0)+.60)[0],at(hi,row_depth(hi,0)+.60)[0]])
        for r,ns in enumerate(nums):
            ts=lo+SEAT_W*.5+np.arange(len(ns))*SEAT_W
            for station,sn in zip(ts,ns):
                q,al,inside=at(station,row_depth(station,r))
                # Follow the same curved/diagonal row as its tread.
                a=at(station-.025,row_depth(station-.025,r))[0]
                b=at(station+.025,row_depth(station+.025,r))[0]
                tangent=_u(b-a);facing=np.array([-tangent[1],tangent[0]])
                if facing@inside<0:facing=-facing
                seats.append((q[0],q[1],r,float(np.degrees(np.arctan2(facing[0],facing[1]))),name(n),height_at(r),sn))
            lower=rear_edge if r==nr-1 else (lambda v,r=r:row_depth(v,r+.5))
            upper=(lambda v:row_depth(v,0)+.60) if r==0 else (lambda v,r=r:row_depth(v,r-.5))
            band=patch(lower,upper)
            rows.append({'r':r,'y':round(height_at(r),3),'y0':0.,'polys':_polys(band)})
            if n=='G15':
                access_start=lo+max(map(len,nums))*SEAT_W+.12
                access=Polygon([at(v,lower(v))[0] for v in (access_start,hi)]+
                               [at(v,upper(v))[0] for v in (hi,access_start)]).buffer(0)
                finishes.append({'y':round(height_at(r)+.012,3),'polys':_polys(band.intersection(access))})
        if n in aisle_after:
            nxt=ORDER[ORDER.index(n)+1];nl,nh=spans[nxt]
            station=hi+STAIR_W/2;T,al,inside=at(station)
            y1=standY(T,-inside)
            # A real stepped aisle spans the whole excite stand. The old
            # high, flat bridge and short rear flight exaggerated its gap.
            y0=Y0
            if y1 is not None and 0<y1-y0:
                run=(depth_at(hi,n)+depth_at(nl,nxt))/2-.25
                foot=T+inside*run
                aisles.append({'a':list(np.round(foot,3)),'b':list(np.round(T-inside*.25,3)),
                               'w':STAIR_W,'y0':round(y0,3),'y1':round(y1,3)})
                gates.append({'p':list(np.round(T,3)),'u':list(np.round(-inside,5)),'w':STAIR_W+.15})
            pp=Polygon([at(hi,0)[0],at(nl,0)[0],at(nl,depth_at(nl,nxt))[0],at(hi,depth_at(hi,n))[0]])
            footprints.append(pp)
    X=unary_union(footprints).buffer(0)
    # A continuous padded envelope with separate home/pole returns.
    # The five-row transition and the two/three-row pole lots taper
    # diagonally instead of producing a comb of independent rectangles.
    # One padded front, closed to the existing wall at both ends.
    fence=[at(spans[ORDER[0]][0],edge_at(spans[ORDER[0]][0]))[0],*front,nominal]
    # End padding joins the TOP above the main tread, not the tread itself.
    home_y=max(FENCE_H+.25,(standY(at(spans['G15'][0])[0],-at(spans['G15'][0])[2]) or .6)+.90)
    pole_y=max((side[0][1] for side in (mouth or {}).get('sides',[]) if side),default=4.0)
    fence_heights=[round(home_y,3)]+[FENCE_H]*len(front)+[round(pole_y,3)]
    keep=[0]+[i for i in range(1,len(fence)) if np.linalg.norm(fence[i]-fence[i-1])>.015]
    fence=[fence[i] for i in keep];fence_heights=[fence_heights[i] for i in keep]
    return dict(X=X,rows=rows,seats=seats,finishes=finishes,fence=[list(np.round(p,3)) for p in fence],aisles=aisles,gates=gates,
                fence_heights=fence_heights,attachment={'point':list(np.round(nominal,3)),'height':round(pole_y,3),'edge':'A03-side outer door hinge; not the two-leaf centre' if sg>0 else 'mirrored wall junction; 3B corner dimensions estimated'},
                rear=[list(np.round(at(t)[0],3)) for t in np.linspace(spans['G15'][0],spans['G06'][1],180)],
                cut=_polys(Polygon([at(t,min(0.,edge_at(t)))[0] for t in np.linspace(spans['G15'][0],spans['G06'][1],180)]+[at(t,.05)[0] for t in np.linspace(spans['G06'][1],spans['G15'][0],180)]).buffer(0)))

def apply(data, chart_path='td/td_rows_real.json'):
    real = json.load(open(chart_path))
    # each block's rows as the chart numbers them, its own (the two sides differ a little: G15 one seat a row, G35 four)
    chart = {k: [[sn for lo, hi in v['rows'][str(r + 1)] for sn in range(lo, hi + 1)] for r in range(len(v['rows']))] for k, v in real.items() if k[0] == 'G'}
    FN = Polygon(data['fence'][0][0]).buffer(0)
    LA = next(l for l in data['levels'] if l['name'] == 'A')
    Ar = [(_geom(r['polys']), float(r['y'])) for r in LA['rows']]; tree = STRtree([g for g, _ in Ar])
    def standY(T, d):
        """the 1st floor's tread just behind its wall at T, going back along d"""
        for t in np.arange(0.3, 4.0, 0.15):
            q = Point(*(np.asarray(T, float) + d * t))
            ys = [Ar[int(i)][1] for i in tree.query(q) if Ar[int(i)][0].contains(q)]
            if ys: return min(ys)
        return None
    from scipy.spatial import cKDTree
    sa=np.frombuffer(base64.b64decode(LA['seats']),'<i2').reshape(-1,4)
    standY.seatPoints=sa[:,:2]/LA.get('seatScale',10)
    standY.seatTree=cKDTree(standY.seatPoints)
    yaw=np.deg2rad(sa[:,3]);standY.seatAxes=np.c_[np.cos(yaw),-np.sin(yaw)]
    mouth = next((t for t in data.get('tunnels', []) if t.get('gate')), None)
    if mouth is not None: mouth = {**mouth, 'p': [abs(mouth['p'][0]), mouth['p'][1]], 'u': [abs(mouth['u'][0]), mouth['u'][1]]}
    sides = [_side(sg, chart, FN, standY, mouth) for sg in (1, -1)]
    seats = [s for sd in sides for s in sd['seats']]
    S = np.array([[round(s[0] * 50), round(s[1] * 50), s[2], round(s[3])] for s in seats], '<i2')
    G = {'name': 'G', 'D': PITCH, 'h0': Y0, 'rise': RISE, 'hs': [round(Y0 + RISE * k, 3) for k in range(8)],
         'rows': [r for sd in sides for r in sd['rows']], 'steps': [], 'holes': [], 'voms': [],
         'seats': base64.b64encode(S.tobytes()).decode('ascii'), 'seatScale': 50, 'gblocks': [s[4] for s in seats], 'gnums': [s[6] for s in seats], 'seatY': [round(s[5], 3) for s in seats],
         'rails': [], 'walls': [], 'chairStyle':'padded-excite'}
    data = dict(data)
    data['levels'] = [G if l['name'] == 'G' else l for l in data['levels']]
    field = FN.difference(unary_union([sd['X'] for sd in sides]).buffer(0.02))
    field = max(getattr(field, 'geoms', [field]), key=lambda g: g.area).simplify(0.02)
    data['field'] = [[[[round(float(x), 2), round(float(z), 2)] for x, z in list(field.exterior.coords)[:-1]]]]
    data['exciteFence'] = [{'pts': sd['fence'], 'h': FENCE_H,'hs':sd['fence_heights'],'attachment':sd['attachment']} for sd in sides]
    data['exciteAisles'] = [a for sd in sides for a in sd['aisles']]
    data['exciteGates'] = [g for sd in sides for g in sd['gates']]
    data['exciteRear']=[{'pts':sd['rear'],'top':1.30} for sd in sides]
    data['exciteRearCut']=[p for sd in sides for p in sd['cut']]
    data['exciteHomeFinishes']=[f for sd in sides for f in sd['finishes']]
    for k in ('exciteOpen', 'exciteFront'): data.pop(k, None)
    by = {}
    for s in seats: by[s[4]] = by.get(s[4], 0) + 1
    print('excite seats', len(seats), 'of the chart\'s', sum(len(q) for v in chart.values() for q in v), {k: (by.get(k, 0), sum(len(q) for q in chart[k])) for k in sorted(chart)})
    print('excite stands: %.0f m2 each, fence %d points, steps up to the stand' % (sides[0]['X'].area, len(sides[0]['fence'])), [(a['y0'], a['y1']) for a in data['exciteAisles']])
    return data
