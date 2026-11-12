"""Align estimated inner shafts with the capacity of complete numbered rows.

The photographic wall alignment is retained. Only a small displacement along
that wall is allowed; this never deletes seats or changes the concrete rake.
"""
import base64
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union


def capacity(s, allowed):
    count=0;last=-100.
    for x in s[allowed]:
        if x>=last+.44-1e-8:
            count+=1;last=x
    return count


def align(data, real):
    from td_seatfit import pillar_clear
    level=next(l for l in data['levels'] if l['name']=='B')
    seats=np.frombuffer(base64.b64decode(level['seats']),'<i2').reshape(-1,4)
    labels=np.frombuffer(base64.b64decode(level['labels']),'<i2').reshape(-1,3)
    xy=seats[:,:2]/level.get('seatScale',10)
    groups=defaultdict(list);geoms=defaultdict(list)
    for i,(b,r,n) in enumerate(labels):groups[(data['blockNames'][b],int(r))].append(i)
    for row in level['rows']:
        geoms[row['r']].extend(Polygon(p[0],p[1:]) for p in row['polys'])
    geoms={r:unary_union(pp) for r,pp in geoms.items()}
    records=[]
    for (name,r),idx in groups.items():
        spec=real.get(name,{}).get('rows',{}).get(str(r))
        want=sum(b-a+1 for a,b in spec) if spec else len(idx)
        ordered=sorted(idx,key=lambda i:labels[i,2]);p=xy[ordered]
        if len(p)!=want or len(p)<2:continue
        a=p[1]-p[0];a/=np.linalg.norm(a)
        b=p[-1]-p[-2];b/=np.linalg.norm(b)
        curve=LineString([p[0]-a*1.8,*p,p[-1]+b*1.8])
        s=np.arange(0,curve.length,.04)
        samples=shapely.line_interpolate_point(curve,s)
        centre=np.c_[shapely.get_x(samples),shapely.get_y(samples)]
        tangent=np.gradient(centre,axis=0)
        normal=np.c_[-tangent[:,1],tangent[:,0]]/np.linalg.norm(tangent,axis=1)[:,None]
        points=np.stack([centre+normal*d for d in (0,.08,-.08,.16,-.16,.24,-.24)])
        tread=geoms[int(seats[idx[0],2])].buffer(-.04)
        support=shapely.contains_xy(tread,points[:,:,0],points[:,:,1])
        targets=np.array([curve.project(Point(q)) for q in p])
        yaw=np.interp(s,targets,np.unwrap(np.deg2rad(seats[ordered,3])))
        height=level['hs'][seats[idx[0],2]]
        records.append(dict(s=s,xy=points,support=support,yaw=np.tile(yaw,len(points)),height=height,want=want))
    walls=[LineString(side['front']) for side in data['balconyRooms']['sides']]
    changes=[]
    for turn in range(2):
        for j,column in enumerate(data['pillars']):
            if not column.get('structuralId'):continue
            nearby=[r for r in records if np.min(np.linalg.norm(r['xy'][0]-[column['x'],column['z']],axis=1))<3.5]
            if not nearby:continue
            others=[c for k,c in enumerate(data['pillars']) if k!=j];cache=[]
            for row in nearby:
                points=row['xy'].reshape(-1,2)
                safe=row['support']&pillar_clear(points,row['height'],others,row['yaw'],margin=.035).reshape(row['support'].shape)
                cache.append((row,points,safe))
            old=Point(column['x'],column['z'])
            wall=min(walls,key=lambda line:line.distance(old));d=wall.project(old)
            candidates=[]
            for delta in np.arange(-1.5,1.51,.1):
                point=wall.interpolate(d+delta)
                trial={**column,'x':point.x,'z':point.y};loss=0;hits=0
                for row,points,safe in cache:
                    valid=safe&pillar_clear(points,row['height'],[trial],row['yaw'],margin=.035).reshape(safe.shape)
                    loss+=max(0,row['want']-capacity(row['s'],valid.any(axis=0)))**2
                    hits+=np.count_nonzero(~valid[0]&row['support'][0])
                candidates.append((loss,abs(delta)*.15+hits*.001,point))
            _,_,point=min(candidates,key=lambda c:c[:2])
            if old.distance(point)<.02:continue
            column.update(x=round(point.x,3),z=round(point.y,3))
            sign_anchor=Point(old.x+column['ax']*.3,old.y+column['az']*.3)
            for sign in data.get('signs',[]):
                if sign_anchor.distance(Point(sign['x'],sign['z']))<.05:
                    sign.update(x=round(column['x']+column['ax']*.3,3),z=round(column['z']+column['az']*.3,3))
            changes.append({'id':column['structuralId'],'from':[old.x,old.y],'to':[column['x'],column['z']]})
    data['structureRevision']['seatClearanceAdjustments']=changes
    return changes
