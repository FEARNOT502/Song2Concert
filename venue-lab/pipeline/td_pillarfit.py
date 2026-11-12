"""Place shafts on photographed aisle axes, then seat their bases on concrete.

A capacity optimizer may move chairs within a tread; it must not slide a
structural shaft sideways into a numbered block to make that row fit.
"""
import base64
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree


def align(data, real):
    level=next(l for l in data['levels'] if l['name']=='B')
    seats=np.frombuffer(base64.b64decode(level['seats']),'<i2').reshape(-1,4)
    labels=np.frombuffer(base64.b64decode(level['labels']),'<i2').reshape(-1,3)
    xy=seats[:,:2]/level.get('seatScale',10)
    groups=defaultdict(list)
    for i,(b,r,n) in enumerate(labels):groups[(data['blockNames'][b],int(r))].append(i)
    names=sorted({n for n,r in groups},key=lambda n:np.mean([np.arctan2(xy[i,0],xy[i,1]+60) for (nm,r),ii in groups.items() if nm==n for i in ii]))
    aisles=[]
    for a,b in zip(names,names[1:]):
        mid=[]
        for r in range(27,48):
            aa=groups.get((a,r),[]);bb=groups.get((b,r),[])
            if not aa or not bb:continue
            aa=sorted(aa,key=lambda i:labels[i,2]);bb=sorted(bb,key=lambda i:labels[i,2])
            pairs=[(np.linalg.norm(xy[i]-xy[j]),i,j) for i in (aa[0],aa[-1]) for j in (bb[0],bb[-1])]
            dist,i,j=min(pairs)
            if .65<dist<4:mid.append((r,(xy[i]+xy[j])/2))
        if len(mid)<3:continue
        p=np.array([v for r,v in sorted(mid)])
        # Use the rear part: an A/B crease farther forward is intentional.
        p=p[-min(8,len(p)):];centre=p.mean(axis=0)
        _,_,v=np.linalg.svd(p-centre,full_matrices=False);axis=v[0]
        if axis@(p[-1]-p[0])<0:axis=-axis
        aisles.append((LineString([centre-axis*25,centre+axis*25]),axis,a,b))
    walls=[LineString(sd['front']) for sd in data['balconyRooms']['sides']]
    original={v['id']:v['from'] for v in data['structureRevision']['columns']}
    changes=[]
    for column in data['pillars']:
        if not column.get('structuralId'):continue
        anchor=Point(original.get(column['structuralId'],[column['x'],column['z']]))
        line,axis,a,b=min(aisles,key=lambda v:v[0].distance(anchor))
        old=[column['x'],column['z']];wall=min(walls,key=lambda w:w.distance(anchor))
        hit=line.intersection(wall)
        points=[p for p in getattr(hit,'geoms',[hit]) if p.geom_type=='Point']
        if not points:
            # Keep the aisle axis, even where the finished wall turns.
            near=wall.interpolate(wall.project(anchor));p=line.interpolate(line.project(near))
        else:p=min(points,key=lambda p:p.distance(anchor))
        if axis@np.array([p.x,p.y+60])<0:axis=-axis
        column.update(x=round(p.x,3),z=round(p.y,3),ax=round(float(axis[0]),5),az=round(float(axis[1]),5))
        changes.append({'id':column['structuralId'],'from':old,'to':[column['x'],column['z']],'aisleBetween':[a,b],'axisDistance':round(line.distance(Point(column['x'],column['z'])),4)})
    # Recompute AFTER the final translation/rotation. The lowest supported
    # corner is embedded, so a shaft over an aisle half-step cannot float.
    surfaces=[];ys=[]
    for lv in data['levels']:
        if lv['name'] not in ('A','B','F'):continue
        for row in lv['rows']:
            if row['y']>14:continue
            for pp in row['polys']:
                surfaces.append(Polygon(pp[0],pp[1:]).buffer(0));ys.append(row['y'])
    for floor in data['floors']:
        if floor['y']>14:continue
        for pp in floor['polys']:
            surfaces.append(Polygon(pp[0],pp[1:]).buffer(0));ys.append(floor['y'])
    tree=STRtree(surfaces)
    for c in data['pillars']:
        if not c.get('structuralId'):continue
        axis=np.array([c['ax'],c['az']]);side=np.array([-axis[1],axis[0]])
        heights=[]
        for t,w in [(0,0),(-.39,-.29),(-.39,.29),(.39,-.29),(.39,.29)]:
            p=Point(np.array([c['x'],c['z']])+axis*(.3+t)+side*w)
            hs=[ys[int(i)] for i in tree.query(p.buffer(.08)) if surfaces[int(i)].distance(p)<.08]
            if hs:heights.append(max(hs))
        if heights:
            c['y0']=round(min(heights)-.05,3);c['sections'][0]['y0']=c['y0']
    data['signs']=[]
    data['structureRevision']['aisleAlignments']=changes
    data['structureRevision']['seatClearanceAdjustments']=[]
    return changes
