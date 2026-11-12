"""Fit complete PDF rows to the finished tread, after openings and columns.

The geometry stages used to delete seats where their independent outlines
overlapped. Refit the complete numbered row in the available tread instead.
This stage never invents a seat number or silently truncates a PDF interval.
"""
import base64
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from scipy.spatial import cKDTree


def decode(s, width):
    return np.frombuffer(base64.b64decode(s), '<i2').reshape(-1, width).copy()


def encode(a):
    return base64.b64encode(np.asarray(a, '<i2').tobytes()).decode('ascii')


def intervals(ivs):
    return [n for a,b in ivs for n in range(a,b+1)]


def pillar_clear(points, heights, pillars, yaws=None, margin=.03):
    """Keep the complete folded chair clear of each actual shaft section.

    A chair extends 10–28 cm behind its origin and 22 cm to either side.
    Project its oriented footprint onto both shaft axes, with 3 cm clearance.
    Check its vertical body too: a shaft can start above the seat's tread.
    """
    clear=np.ones(len(points),bool)
    heights=np.asarray(heights)
    yaws=np.zeros(len(points)) if yaws is None else np.asarray(yaws)
    back=np.c_[np.sin(yaws),np.cos(yaws)]
    width=np.c_[np.cos(yaws),-np.sin(yaws)]
    centres=points-back*.19
    for c in pillars:
        axis=np.array([c.get('ax',0),c.get('az',1)],float)
        axis/=max(np.linalg.norm(axis),1e-6)
        across=np.array([-axis[1],axis[0]])
        along_pad=.22*abs(width@axis)+.09*abs(back@axis)+margin
        across_pad=.22*abs(width@across)+.09*abs(back@across)+margin
        for section in c.get('sections',[c]):
            q=centres-np.array([c['x'],c['z']])-axis*section.get('offsetAlong',0)
            active=(heights+.86>section['y0'])&(heights+.4<section['y1'])
            rz=section.get('rz',c.get('rz',c['r']))
            rx=section.get('rx',c.get('rx',c['r']))
            clear &= ~(active & (abs(q@axis)<rz+along_pad) & (abs(q@across)<rx+across_pad))
    return clear


def ordered_fit(s, target, separation=.44):
    """Minimum displacement assignment with a physical seat-width constraint."""
    n,m=len(target),len(s)
    if m<n:
        return None
    before=np.searchsorted(s,s-separation+1e-8,side='right')-1
    cost=(s-target[0])**2
    back=[]
    for t in target[1:]:
        ids=np.arange(m)
        best=np.minimum.accumulate(cost)
        owners=np.maximum.accumulate(np.where(cost<=best,ids,-1))
        ok=before>=0
        nxt=np.full(m,np.inf)
        nxt[ok]=best[before[ok]]+(s[ok]-t)**2
        back.append(np.where(ok,owners[np.maximum(before,0)],-1))
        cost=nxt
    end=int(np.argmin(cost))
    if not np.isfinite(cost[end]):
        return None
    out=[end]
    for b in reversed(back):
        end=int(b[end]);out.append(end)
    return s[np.array(out[::-1])]


def apply(data, real, side):
    from td_pillarfit import align
    align(data,real)
    names=data['blockNames']; bids={n:i for i,n in enumerate(names)}
    reference=defaultdict(list)
    for key in ('AB','F','D','E'):
        if key not in side:
            continue
        pts,labels=side[key]
        for p,(nm,r,n) in zip(pts,labels):
            reference[(nm,int(r))].append((int(n),np.array(p,float)))
    repairs=[]
    for level in data['levels']:
        seats=decode(level['seats'],4).astype(float)
        labels=decode(level['labels'],3)
        scale=level.get('seatScale',10)
        seats[:,:2]/=scale
        sy=np.array(level['hs'])[seats[:,2].astype(int)] if level.get('hs') else level['h0']+level['rise']*seats[:,2]
        shaft_clear=pillar_clear(seats[:,:2],sy,data.get('pillars',[]),np.deg2rad(seats[:,3]))
        groups=defaultdict(list)
        for i,(b,r,n) in enumerate(labels):groups[(names[b],int(r))].append(i)
        row_geoms=defaultdict(list)
        for row in level['rows']:
            if row.get('r',-1)<0:continue
            row_geoms[row['r']].extend(Polygon(p[0],p[1:]).buffer(0) for p in row['polys'])
        row_geoms={k:unary_union(v) for k,v in row_geoms.items()}
        remove=set();added=[];added_labels=[]
        for (nm,r),idx in list(groups.items()):
            spec=real.get(nm,{}).get('rows',{}).get(str(r))
            got=sorted(int(labels[i,2]) for i in idx)
            # Keep unverified C/S/press numbers as estimates, but do not
            # leave their chairs floating off a tapered end tread.
            want=intervals(spec) if spec is not None else got
            if level['name']=='G' and got==want:
                continue # G uses a fine height index, checked by height in verify_td_model.py
            supported=all(row_geoms[int(seats[i,2])].buffer(.025).covers(Point(seats[i,:2])) for i in idx)
            if got==want and supported and shaft_clear[idx].all():
                continue
            ref=sorted(reference.get((nm,r),[]),key=lambda q:q[0]) if spec is not None else sorted(
                [(int(labels[i,2]),seats[i,:2].copy()) for i in idx],key=lambda q:q[0])
            if [n for n,p in ref]!=want:
                raise ValueError(f'{nm}/{r}: no complete source row to fit')
            p=np.array([p for n,p in ref])
            if got==want:
                p=seats[sorted(idx,key=lambda i:labels[i,2]),:2].copy()
            ranks=np.unique(seats[idx,2]).astype(int)
            if level['name']=='F':
                # A labelled block can straddle two rake classes. They
                # share one plan row; choose its actual local height below.
                ranks=np.array([k for k in row_geoms if k%22==r-1])
            tread=unary_union([row_geoms[k] for k in ranks])
            # Extend along the same row, never cut a chord across its crease.
            va=p[1]-p[0] if len(p)>1 else np.array([1.,0.])
            vb=p[-1]-p[-2] if len(p)>1 else va
            va/=np.linalg.norm(va);vb/=np.linalg.norm(vb)
            curve=LineString([p[0]-va*1.8,*p,p[-1]+vb*1.8])
            targets=np.array([curve.project(Point(q)) for q in p])
            yaw_source=seats[sorted(idx,key=lambda i:labels[i,2]),3]
            if len(yaw_source)!=len(targets):
                yaw_source=seats[np.array(idx)[cKDTree(seats[idx,:2]).query(p)[1]],3]
            s=np.arange(0,curve.length+.001,.02)
            yaws=np.interp(s,targets,np.unwrap(np.deg2rad(yaw_source)))
            q=shapely.line_interpolate_point(curve,s)
            xy=np.c_[shapely.get_x(q),shapely.get_y(q)]
            # Do not move a repaired row into another block's seats.
            other=np.ones(len(seats),bool);other[idx]=False
            height=level['hs'][ranks[0]] if level.get('hs') else level['h0']+level['rise']*ranks[0]
            other &= abs(sy-height)<.23
            neighbours=cKDTree(seats[other,:2]) if other.any() else None
            tangent=np.gradient(xy,axis=0)
            normal=np.c_[-tangent[:,1],tangent[:,0]]/np.maximum(np.linalg.norm(tangent,axis=1)[:,None],1e-6)
            chosen=None
            # A shaft can clip just one end of a row. A uniform offset of
            # the whole row needlessly pushes its opposite end off the tread.
            # Retain the closest safe depth at each arc position as well.
            mixed=np.zeros(len(s),bool);mixed_xy=xy.copy()
            for depth in (0.,.08,-.08,.16,-.16,.24,-.24,.32,-.32):
                qxy=xy+normal*depth
                clear=neighbours.query(qxy)[0]>=.44 if neighbours else np.ones(len(s),bool)
                clear &= pillar_clear(qxy,height,data.get('pillars',[]),yaws,margin=.035)
                for margin in (.16,.10,.04):
                    ok=clear & shapely.contains_xy(tread.buffer(-margin),qxy[:,0],qxy[:,1])
                    fresh=ok & ~mixed
                    mixed_xy[fresh]=qxy[fresh];mixed|=ok
                    chosen=ordered_fit(s[ok],targets)
                    if chosen is not None:break
                if chosen is not None:break
            if chosen is None:
                chosen=ordered_fit(s[mixed],targets)
                if chosen is not None:qxy=mixed_xy
            if chosen is None:
                runs=np.split(s[ok],np.flatnonzero(np.diff(s[ok])>.021)+1)
                sizes=[round(float(a[-1]-a[0]),2) for a in runs if len(a)]
                raise ValueError(f'{nm}/{r}: {len(want)} PDF seats do not fit the finished tread; available runs {sizes}')
            points=np.c_[np.interp(chosen,s,qxy[:,0]),np.interp(chosen,s,qxy[:,1])]
            old=cKDTree(seats[idx,:2]);_,near=old.query(points)
            new=seats[np.array(idx)[near]].copy();new[:,:2]=points
            for a,point in zip(new,points):
                possible=[k for k in ranks if row_geoms[k].buffer(.025).covers(Point(point))]
                if not possible:raise ValueError(f'{nm}/{r}: seat without a tread')
                a[2]=min(possible,key=lambda k:abs(k-a[2]))
            remove.update(idx);added.extend(new);added_labels.extend((bids[nm],r,n) for n in want)
            repairs.append({'block':nm,'row':r,'before':len(idx),'after':len(want),
                            'maxMove':round(float(np.linalg.norm(points-p,axis=1).max()),3)})
        keep=[i for i in range(len(seats)) if i not in remove]
        if added:
            seats=np.vstack([seats[keep],added]);labels=np.vstack([labels[keep],added_labels])
        seats[:,:2]*=50
        level['seatScale']=50
        level['seats']=encode(np.round(seats));level['labels']=encode(labels)
    # Exact interval equality, not just equal totals; also check missing rows.
    actual=defaultdict(list)
    for l in data['levels']:
        for b,r,n in decode(l['labels'],3):actual[(names[b],int(r))].append(int(n))
    errors=[]
    for nm,b in real.items():
        for r,ivs in b['rows'].items():
            if sorted(actual[(nm,int(r))])!=intervals(ivs):errors.append((nm,r))
    if errors:raise ValueError(f'PDF row/seat mismatch: {errors}')
    data['seatAudit']={'pdfBlocks':len(real),'pdfRows':sum(len(b['rows']) for b in real.values()),
                       'intervalMismatches':0,'refittedRows':repairs,
                       'unverified':['C/S individual numbering; press/Platinum block assignments']}
    print('complete PDF rows verified; refitted',len(repairs),'rows')
    return data
