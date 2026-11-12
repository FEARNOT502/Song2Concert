"""Independent checks of the emitted Dome data, not the generator's report.

python verify_td_model.py [td_stands.json]
"""
import base64
import json
from pathlib import Path
import sys
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import Polygon
from shapely.ops import unary_union
from scipy.spatial import cKDTree

HERE=Path(__file__).resolve().parent


def verify(path):
    data=json.loads(Path(path).read_text())
    real=json.loads((HERE/'td/td_rows_real.json').read_text())
    names=data['blockNames'];actual=defaultdict(list);invalid=[];unsupported=[];near=[];shaft_hits=[]
    totals={}
    for level in data['levels']:
        s=np.frombuffer(base64.b64decode(level['seats']),'<i2').reshape(-1,4)
        labels=np.frombuffer(base64.b64decode(level['labels']),'<i2').reshape(-1,3)
        assert len(s)==len(labels),(level['name'],'label/position count')
        assert np.isfinite(s).all()
        hs=np.asarray(level.get('hs',[]))
        heights=hs[s[:,2]] if len(hs) else level['h0']+level['rise']*s[:,2]
        xy=s[:,:2]/level.get('seatScale',10)
        yaw=np.deg2rad(s[:,3]);back=np.c_[np.sin(yaw),np.cos(yaw)];across=np.c_[np.cos(yaw),-np.sin(yaw)]
        centre=xy-back*.19
        chairs=shapely.polygons(np.stack([centre+across*a+back*b for a,b in [(-.22,-.09),(.22,-.09),(.22,.09),(-.22,.09)]],axis=1))
        for j,c in enumerate(data.get('pillars',[])):
            axis=np.array([c.get('ax',0),c.get('az',1)],float);axis/=np.linalg.norm(axis)
            side=np.array([-axis[1],axis[0]])
            for section in c.get('sections',[c]):
                p=np.array([c['x'],c['z']])+axis*section.get('offsetAlong',0)
                rx=section.get('rx',c.get('rx',c['r']));rz=section.get('rz',c.get('rz',c['r']))
                shaft=Polygon([p+side*a+axis*b for a,b in [(-rx,-rz),(rx,-rz),(rx,rz),(-rx,rz)]])
                active=(heights+.86>section['y0'])&(heights+.4<section['y1'])
                hits=np.flatnonzero(active & shapely.intersects(chairs,shaft))
                shaft_hits.extend((level['name'],names[labels[i,0]],int(labels[i,1]),int(labels[i,2]),j) for i in hits)
        for b,r,n in labels:actual[(names[b],int(r))].append(int(n))
        groups=defaultdict(list)
        by_height=defaultdict(list)
        for row in level['rows']:
            for p in row['polys']:
                g=Polygon(p[0],p[1:])
                if not g.is_valid:invalid.append((level['name'],row.get('r'),shapely.is_valid_reason(g)))
                groups[row.get('r',-1)].append(g)
                by_height[round(row['y'],2)].append(g)
        for r in np.unique(s[:,2]):
            idx=np.flatnonzero(s[:,2]==r)
            if level['name']=='G':
                # G stores a fine height index rather than a chart-row id.
                pp=[g for y,gs in by_height.items() if abs(y-heights[idx[0]])<.025 for g in gs]
            else:pp=groups[int(r)]
            geom=unary_union(pp).buffer(.03)
            bad=idx[~shapely.covers(geom,shapely.points(xy[idx]))]
            unsupported.extend((level['name'],names[labels[i,0]],int(labels[i,1]),int(labels[i,2])) for i in bad)
        points=np.c_[xy[:,0],heights,xy[:,1]]
        for a,b in cKDTree(points).query_pairs(.3):
            near.append((level['name'],labels[a].tolist(),labels[b].tolist()))
        totals[level['name']]=len(s)
    mismatches=[]
    for block,b in real.items():
        for row,ivs in b['rows'].items():
            want=[n for a,z in ivs for n in range(a,z+1)]
            if sorted(actual[(block,int(row))])!=want:mismatches.append((block,row))
    duplicates=[(block,row) for (block,row),nums in actual.items() if len(nums)!=len(set(nums))]
    result={'seats':totals,'pdfBlocks':len(real),'pdfRows':sum(len(b['rows']) for b in real.values()),
            'intervalMismatches':mismatches,'duplicateRows':duplicates,'invalidRows':invalid,
            'unsupportedSeats':unsupported,'overlappingSeats':near,'pillarSeatIntersections':shaft_hits,
            'concourses':[r['id'] for r in data.get('concourseRoutes',[])],
            'flights':len(data.get('flights',[]))+len(data.get('accessFlights',[]))}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    assert not mismatches and not duplicates,'seat numbering mismatch'
    assert not invalid,'invalid concrete polygons'
    assert not unsupported,'seats without their tread'
    assert not near,'seats occupy the same space'
    assert not shaft_hits,'chair body intersects a pillar'
    assert result['concourses']==['C1','C2','C3','C4']
    return result


if __name__=='__main__':
    verify(sys.argv[1] if len(sys.argv)>1 else HERE/'td_stands.json')
