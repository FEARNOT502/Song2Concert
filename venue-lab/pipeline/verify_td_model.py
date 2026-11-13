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
    from td_overrides import effective, OVERRIDES, CUSTOM_LAYOUT
    real=effective(json.loads((HERE/'td/td_rows_real.json').read_text()))
    assert {v['block'] for v in data.get('seatOverrides',[])}==set(OVERRIDES)
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
        padded=level['name'] in ('G','C')
        centre=xy-back*(.055 if padded else .19)
        hw,hd=(.325,.245) if padded else (.22,.09)
        chairs=shapely.polygons(np.stack([centre+across*a+back*b for a,b in [(-hw,-hd),(hw,-hd),(hw,hd),(-hw,hd)]],axis=1))
        for j,c in enumerate(data.get('pillars',[])):
            axis=np.array([c.get('ax',0),c.get('az',1)],float);axis/=np.linalg.norm(axis)
            side=np.array([-axis[1],axis[0]])
            for section in c.get('sections',[c]):
                p=np.array([c['x'],c['z']])+axis*section.get('offsetAlong',0)
                rx=section.get('rx',c.get('rx',c['r']));rz=section.get('rz',c.get('rz',c['r']))
                shaft=Polygon([p+side*a+axis*b for a,b in [(-rx,-rz),(rx,-rz),(rx,rz),(-rx,rz)]])
                active=(heights+(1.03 if padded else .86)>section['y0'])&(heights+.4<section['y1'])
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
        if block in CUSTOM_LAYOUT:continue
        for row,ivs in b['rows'].items():
            want=[n for a,z in ivs for n in range(a,z+1)]
            if sorted(actual[(block,int(row))])!=want:mismatches.append((block,row))
    # User review regressions: a common front and attached rear rows.
    from shapely.geometry import Point,LineString
    G=next(l for l in data['levels'] if l['name']=='G')
    gs=np.frombuffer(base64.b64decode(G['seats']),'<i2').reshape(-1,4)
    gl=np.frombuffer(base64.b64decode(G['labels']),'<i2').reshape(-1,3)
    wall=Polygon(data['fence'][0][0]).exterior
    fences=[LineString(f['pts']) for f in data['exciteFence']]
    rear_distances=[];front_distances=[];main_distances=[];front_by_block={}
    A=next(l for l in data['levels'] if l['name']=='A')
    aa=np.frombuffer(base64.b64decode(A['seats']),'<i2').reshape(-1,4)
    main_tree=cKDTree(aa[:,:2]/A['seatScale'])
    tapered={'G03','G04','G05','G45','G46','G47'}
    for name in {names[b] for b,r,n in gl}:
        idx=np.flatnonzero(gl[:,0]==names.index(name));last=gl[idx,1].max()
        for i in idx:
            q=Point(gs[i,:2]/G['seatScale'])
            if gl[i,1]==last and name not in tapered:
                rear_distances.append(wall.distance(q));main_distances.append(float(main_tree.query(gs[i,:2]/G['seatScale'])[0]))
            if gl[i,1]==1:
                distance=min(f.distance(q) for f in fences)
                front_distances.append(distance);front_by_block.setdefault(name,[]).append(distance)
    excite_review={'rearWallDistanceRange':[round(min(rear_distances),3),round(max(rear_distances),3)],
                   'frontFenceDistanceRange':[round(min(front_distances),3),round(max(front_distances),3)],
                   'rearToMainChairDistanceMedian':round(float(np.median(main_distances)),3),
                   'rearToMainChairDistanceMin':round(min(main_distances),3)}
    assert min(main_distances)>.55 and np.median(main_distances)<1.3,'excite rear rows collide with or detach from main stand'
    # A continuous pole taper crosses three- and five-row cells whose
    # rows remain parallel to A. The resulting triangular end apron is
    # intentionally wider; a uniform .85m limit recreated the sawtooth.
    for block,distances in front_by_block.items():
        limit=2.6 if block in {'G04','G05','G45','G46'} else (2.1 if block in {'G14','G36'} else 1.3)
        assert .2<min(distances) and max(distances)<limit,(block,'front row outside photographic apron',min(distances),max(distances))
    excite_review['frontFenceByBlock']={b:[round(min(d),3),round(max(d),3)] for b,d in sorted(front_by_block.items())}
    # The home-side rows must follow the actual A rows, not the wall's
    # smoothed outline; assert orientation for both asymmetrical extensions.
    home_angles={}
    for name in sorted({names[b] for b,r,n in gl}):
        idx=np.flatnonzero(gl[:,0]==names.index(name))
        _,nearest=main_tree.query(gs[idx,:2]/G['seatScale'])
        expected=float(np.median(aa[nearest,3]));error=np.abs((gs[idx,3]-expected+180)%360-180)
        assert np.max(error)<=2.5,(name,'home rows differ from main stand',error.max())
        assert np.ptp(gs[idx,3])<=1,(name,'home rows are not parallel')
        home_angles[name]={'yaw':int(np.median(gs[idx,3])),'mainYaw':expected}
    tunnel=next(t for t in data['tunnels'] if t.get('gate'))
    p=np.array(tunnel['p']);u=np.array(tunnel['u']);side=np.array([-u[1],u[0]])
    jamb=max((p+side*tunnel['w']/2,p-side*tunnel['w']/2),key=lambda v:v[1])
    for i,fence in enumerate(data['exciteFence']):
        target=jamb*np.array([1 if i==0 else -1,1])
        assert np.linalg.norm(np.array(fence['pts'][-1])-target)<.003,'pole fence attached to wrong door edge'
        assert len(fence['pts'])==len(fence['hs'])
        assert fence['hs'][0]>fence['hs'][1] and fence['hs'][-1]>fence['hs'][-2],'end padding slopes down toward stand'
        assert min(np.linalg.norm(np.diff(np.array(fence['pts']),axis=0),axis=1))>.015,'duplicate fence points'
    excite_review['homeRowAngles']=home_angles
    # Revision 4: the actual thin slab and the continuous rear building
    # arc are checked independently of painted trim/materials.
    deck=next(l for l in data['levels'] if l['name']=='D')
    assert all(r['y0']>=18.47 for r in deck['rows'] if abs(r['y']-18.6)<.02)
    arc=data['outfieldBackWall']['pts']
    assert min(p[1] for p in arc)<-130.5
    assert np.linalg.norm(np.array(arc[0])-data['upperWall'][0]['pts'][-1])<.01
    assert np.linalg.norm(np.array(arc[-1])-data['upperWall'][1]['pts'][-1])<.01
    assert actual[('F11',5)] and not any(b=='F10' for b,r in actual if actual[(b,r)])
    assert len(data['exciteRearOpen'])==2
    for a,b in [('G14','G15'),('G36','G35')]:
        ia=np.flatnonzero((gl[:,0]==names.index(a))&(gl[:,1]==4))
        ib=np.flatnonzero((gl[:,0]==names.index(b))&(gl[:,1]==4))
        q=gs[ib,:2]/G['seatScale'];direction=q[-1]-q[0];direction/=np.linalg.norm(direction)
        normal=np.array([-direction[1],direction[0]])
        assert np.max(np.abs((gs[ia,:2]/G['seatScale']-q.mean(0))@normal))<.045,'home rear rows are not collinear'
    assert not data.get('signs'),'column number plates remain'
    assert not any(abs(w[4]-13.3)<.02 and abs(w[5]-17.3)<.02 for w in data['rooms']['thinWalls']),'legacy jagged balcony end caps remain'
    duplicates=[(block,row) for (block,row),nums in actual.items() if len(nums)!=len(set(nums))]
    result={'seats':totals,'exciteReview':excite_review,'pdfBlocks':len(real),'pdfRows':sum(len(b['rows']) for b in real.values()),
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
