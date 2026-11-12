"""Finish the Dome's structural connections after balcony/door geometry.

Positions and heights here are photographic estimates, not surveyed dimensions.
Sources and the four concourse definitions are in docs/TOKYO_DOME_REMODEL_PLAN.ko.md.
"""
import numpy as np
from shapely import make_valid, set_precision
from shapely.geometry import Polygon, Point, LineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union


def pieces(g):
    if g.geom_type == 'Polygon':
        return [g] if g.area > 0.0001 else []
    return [p for q in getattr(g, 'geoms', []) for p in pieces(q)]


def geom(items):
    return unary_union([Polygon(q[0], q[1:]).buffer(0) for f in items for q in f['polys']])


def polys(g):
    g = set_precision(make_valid(g), 0.001)
    def ring(r):
        return [[round(float(x), 3), round(float(z), 3)] for x, z in list(r.coords)[:-1]]
    return [[ring(q.exterior)] + [ring(r) for r in q.interiors] for q in pieces(g)]


def _columns(data):
    import base64
    from td_seatfit import pillar_clear
    br = data.get('balconyRooms')
    if not br:
        return []
    fronts = [LineString(s['front']) for s in br['sides']]
    lower = [(Polygon(q[0], q[1:]).buffer(0), r['y']) for l in data['levels']
             if l['name'] in ('A', 'B') for r in l['rows'] for q in r['polys']]
    moved, piers = [], list(br['piers'])
    seat_sets=[]
    for level in data['levels']:
        if level['name'] not in ('B','C'):continue
        s=np.frombuffer(base64.b64decode(level['seats']),'<i2').reshape(-1,4)
        height=np.asarray(level['hs'])[s[:,2]] if level.get('hs') else level['h0']+level['rise']*s[:,2]
        seat_sets.append((s[:,:2]/level.get('seatScale',10),height,np.deg2rad(s[:,3]),8 if level['name']=='B' else 1))
    for i, c in enumerate(data['pillars']):
        # Outfield/board columns have their own structure and mouth alignment.
        if c.get('vom') or c.get('aisle') or c['z'] < -79 or c['y0'] < 9.0:
            continue
        old = Point(c['x'], c['z'])
        line = min(fronts, key=lambda l: l.distance(old))
        if not 1.0 < line.distance(old) < 9.0:
            continue
        d = line.project(old)
        q = line.interpolate(d)
        a, b = line.interpolate(max(0, d - 0.3)), line.interpolate(min(line.length, d + 0.3))
        t = np.array([b.x - a.x, b.y - a.y]); t /= np.linalg.norm(t)
        normal = np.array([-t[1], t[0]])
        if normal @ np.array([q.x, q.y + 60]) < 0:
            normal = -normal
        foot = max([h for g, h in lower if g.covers(q)] or [c['y0']])
        cap = br['y'] - 0.35
        c.update(x=round(q.x, 3), z=round(q.y, 3), ax=round(float(normal[0]), 5),
                 az=round(float(normal[1]), 5), y0=round(foot, 3), y1=br['ceil'],r=.4,rx=.3,rz=.4,
                 structuralId=f'infield-{i}', sections=[
                     # The visible FACE follows the wall, not the shaft's
                     # centre. Both sections share that face at -0.10 m.
                     {'y0': round(foot, 3), 'y1': cap, 'rx': 0.30, 'rz': 0.40, 'offsetAlong':.30},
                     {'y0': cap, 'y1': br['ceil'], 'rx': 0.30, 'rz': 0.20, 'offsetAlong':.10},
                 ])
        # The wall position is a photographic estimate. Keep its continuous
        # vertical alignment, but align it locally with the seat/aisle gaps
        # rather than putting a nearest-point projection through a block end.
        delta=0.0
        for s in data.get('signs', []):
            if old.distance(Point(s['x'], s['z'])) < 0.05:
                s.update(x=round(c['x']+c['ax']*.3,3), z=round(c['z']+c['az']*.3,3),
                         y=round(foot + 2.2, 3),w=.55,r=.4)
        # The old decorative pier was disconnected from the supporting shaft.
        piers = [p for p in piers if Point(*p).distance(q) > 1.8]
        moved.append({'id': c['structuralId'], 'from': [old.x, old.y], 'to': [q.x, q.y], 'wallAdjustment':round(float(delta),2),'foot': foot, 'top': br['ceil']})
    br['piers'] = piers
    return moved


def _lower_concourse(data):
    room = data['rooms']
    old = [f for f in room['lit'] if 5.0 < f['y'] < 8.0]
    high = [f for f in data['floors'] if abs(f['y'] - 10.6) < 0.02]
    if not old or not high:
        return None
    y = min(f['y'] for f in old)
    ceiling = y + 2.8
    old_area = geom(old)
    # Carry the corridor under the rear gangway, rather than leave the
    # infield side/home corridors as three disconnected rooms.
    ring = geom(high).buffer(0.12).buffer(-0.12).simplify(0.04)
    whole = unary_union([old_area, ring]).buffer(0)
    low_walls = [w for key in ('walls','thinWalls') for w in room[key] if 5 < w[4] < 8 and w[5] < 10]
    wall_lines = unary_union([LineString([w[:2], w[2:4]]) for w in low_walls])
    # Preserve every existing tunnel/stair opening when rebuilding the wall.
    mouths = old_area.boundary.difference(wall_lines.buffer(0.12)).buffer(0.22)
    room['walls'] = [w for w in room['walls'] if w not in low_walls]
    room['thinWalls'] = [w for w in room['thinWalls'] if w not in low_walls]
    for p in pieces(whole):
        p = orient(p, 1.0)
        for edge in [p.exterior] + list(p.interiors):
            rest = LineString(edge.coords).difference(mouths)
            for part in getattr(rest, 'geoms', [rest]):
                if part.geom_type != 'LineString':
                    continue
                for a, b in zip(list(part.coords)[:-1], list(part.coords)[1:]):
                    if np.linalg.norm(np.array(a) - b) > 0.03:
                        room['walls'].append([*map(float, a), *map(float, b), y, ceiling])
    room['lit'] = [f for f in room['lit'] if f not in old] + [{'y': y, 'polys': polys(whole)}]
    # Keep the shallower ceilings in the gates; replace the three corridor ceilings.
    room['ceils'] = [f for f in room['ceils'] if not 9.3 < f['y'] < 9.6]
    room['ceils'].append({'y': ceiling, 'polys': polys(whole)})
    # The rear gangway must be a roof slab over this space, not a solid prism
    # down to field level. Retain all of its original staircase cut-outs.
    floors = []
    for f in data['floors']:
        if abs(f['y'] - 10.6) > 0.02 or f.get('y0', 0) >= ceiling:
            floors.append(f); continue
        g = geom([f]); cut = g.intersection(whole); rest = g.difference(whole)
        if not rest.is_empty:
            floors.append({**f, 'polys': polys(rest)})
        if not cut.is_empty:
            floors.append({**f, 'y0': ceiling, 'polys': polys(cut)})
    floors.append({'y': y - 0.01, 'y0': y - 0.31, 'polys': polys(whole)})
    data['floors'] = floors
    # The corridor also passes below the rear tread/end-cap extensions.
    # Leave roof slabs over it, rather than concrete prisms to field level.
    for level in data['levels']:
        if level['name'] not in ('A','B','F'):continue
        rows=[]
        for row in level['rows']:
            if row['y'] < y+2.1:
                rows.append(row);continue
            g=geom([row]);inside=g.intersection(whole);outside=g.difference(whole)
            if not outside.is_empty:rows.append({**row,'polys':polys(outside)})
            if not inside.is_empty:
                rows.append({**row,'y0':max(row.get('y0',0),min(ceiling,row['y']-.3)),'polys':polys(inside)})
        level['rows']=rows
    # Fixtures follow a continuous room boundary; no internal shop fixtures.
    for p in pieces(ring):
        path = LineString(p.exterior.coords)
        for d in np.arange(3, path.length, 6):
            q = path.interpolate(d); c = p.representative_point()
            # Pull boundary fixtures inside, onto the corridor ceiling.
            v = np.array([c.x-q.x, c.y-q.y]); v /= max(np.linalg.norm(v), 1e-6)
            room['lamps'].append([round(q.x+v[0]*0.7, 3), ceiling-0.04, round(q.y+v[1]*0.7, 3), 0.0])
    loop=max(pieces(whole.buffer(-.9)),key=lambda p:p.area).exterior
    walk=[[round(loop.interpolate(d).x,3),round(loop.interpolate(d).y,3)] for d in np.arange(0,loop.length,1.5)]
    walk.append(walk[0])
    return {'id': 'C1', 'y': y, 'ceiling': ceiling, 'polys': polys(whole), 'components': len(pieces(whole)), 'walkLine':walk}


def _balcony_concourse(data):
    """A clear rear circulation band; no new shop/lounge interiors."""
    br=data['balconyRooms'];bands=[];ends=[];centre=Point(0,-60)
    for sd in br['sides']:
        back=LineString(sd['back'])
        a=back.buffer(2.25,single_sided=True)
        b=back.buffer(-2.25,single_sided=True)
        inside=min((a,b),key=lambda g:g.centroid.distance(centre))
        bands.append(inside.difference(back.buffer(.18)))
        p=np.array(sd['back'][0]);v=np.array([0,-60])-p;v/=np.linalg.norm(v);ends.append(p+v*1.1)
    bands.append(LineString(ends).buffer(1.,cap_style=2))
    band=unary_union(bands).buffer(.03)
    parts=[]
    for w in br['walls']:
        g=LineString([w[:2],w[2:4]]).difference(band)
        for p in getattr(g,'geoms',[g]):
            if p.geom_type=='LineString' and p.length>.03:
                a,b=p.coords[0],p.coords[-1];parts.append([*a,*b])
    br['walls']=parts
    for key in ('walls','thinWalls'):
        out=[]
        for w in data['rooms'][key]:
            g=LineString([w[:2],w[2:4]])
            if 16.1<=w[4]<18.3 and w[5]>17.8:g=g.difference(band)
            for p in getattr(g,'geoms',[g]):
                if p.geom_type=='LineString' and p.length>.03:
                    a,b=p.coords[0],p.coords[-1];out.append([*a,*b,*w[4:]])
        data['rooms'][key]=out
    return band


def _outfield_access(data, lower):
    """Local stair branches from the lower ring to the outfield mouths.

    The previous lower room stopped on the infield side: reaching an
    outfield mouth meant returning to a distant infield stair first.
    These service-side positions are estimates within the known envelope.
    """
    floor=geom([f for f in data['floors'] if abs(f['y']-10.6)<.02])
    low=geom([lower]);common=floor.intersection(low).buffer(-.08)
    flevel=next(l for l in data['levels'] if l['name']=='F')
    used=[]
    for v in flevel['voms']:
        p=np.array(v['p']);u=np.array(v['u']);s=np.array([-u[1],u[0]])
        used.append(Polygon([p+u*t+s*w for t,w in [(-.4,-2.),(v['L']+2.5,-2.),(v['L']+2.5,2.),(-.4,2.)]]))
    for f in data['flights']:
        used.append(LineString([(f['x'],f['z']),(f['x']+f['dx']*f['L'],f['z']+f['dz']*f['L'])]).buffer(1.2))
    n=int(np.ceil((10.6-lower['y'])/.19));length=n*.28
    for i in (0,7):
        v=flevel['voms'][i];p=np.array(v['p']);out=np.array(v['u']);across=np.array([-out[1],out[0]])
        found=None
        # Reserve the renderer's 2.4 m mouth passage: a transverse flight
        # belongs beside or behind it, clear of its green side walls.
        for back in (1.4,2.,2.6,3.4,4.,5.,6.):
            for offset in (0,1.,-1.,2.,-2.,3.,-3.,4.,-4.,5.,-5.,6.,-6.,8.,-8.,10.,-10.,12.,-12.):
                top=p+out*(v['L']+back)+across*offset
                for sign in (-1,1):
                    axis=across*sign;start=top-axis*length
                    line=LineString([start-axis*.8,top+axis*.8]);foot=line.buffer(.85,cap_style=2)
                    if common.covers(foot) and not any(g.intersects(foot.buffer(.3)) for g in used):
                        found=dict(x=float(start[0]),z=float(start[1]),dx=float(axis[0]),dz=float(axis[1]),n=n,L=length,
                                   y0=lower['y'],y1=10.6,w=1.6,scope='outfield-C1');used.append(foot);break
                if found:break
            if found:break
        if found:data['flights'].append(found)
        else:raise ValueError(f'No lower-concourse stair space by outfield mouth {i}')


def _stairs(data):
    """Clear the complete walking/headroom envelope, including the landings.

    The old raster cut stopped 30 cm before each top landing. Its slab and
    room ceiling blocked descent. The central 3F/4F flight also intersected
    the later-added suite ceiling; put it in the rear service corridor.
    Exact service stair locations remain a photographic/section estimate.
    """
    from shapely.ops import nearest_points
    room = data['rooms']
    for f in data['flights']:
        if f['y0'] == 16.2 and f['y1'] == 24 and abs(f['x']) < 12:
            old = LineString([(f['x'], f['z']), (f['x']+f['dx']*f['L'], f['z']+f['dz']*f['L'])]).buffer(1.0, cap_style=2)
            upper = geom([p for p in data['floors'] if abs(p['y']-24)<.02])
            patch = old.intersection(upper.buffer(1.3))
            data['floors'].append({'y':24., 'y0':23.7, 'polys':polys(patch)})
            for key in ('walls','thinWalls'):
                walls=[]
                for w in room[key]:
                    g=LineString([w[:2],w[2:4]])
                    if w[4]<25.8 and w[5]>16.3:g=g.difference(old.buffer(.5))
                    for p in getattr(g,'geoms',[g]):
                        if p.geom_type=='LineString' and p.length>.03:
                            a,b=p.coords[0],p.coords[-1];walls.append([*a,*b,*w[4:]])
                room[key]=walls
            f['z'] = 59.0
            lower = geom([p for p in data['floors'] if abs(p['y']-16.2)<.02])
            base = Point(f['x']-f['dx']*.7, f['z']-f['dz']*.7)
            # The generic slab already extends behind K, so its nearest point
            # can be the stair base itself. Start at the actual room's rear
            # corridor and cross its back wall deliberately.
            backs=unary_union([LineString(sd['back']) for sd in data['balconyRooms']['sides']])
            near=nearest_points(backs,base)[0]
            inward=np.array([0.,-60.])-np.array([near.x,near.y]);inward/=np.linalg.norm(inward)
            entry=np.array([near.x,near.y])+inward*1.1
            path=[list(np.round(entry,3)),[round(base.x,3),round(base.y,3)]]
            data.setdefault('serviceStairLinks',[]).append({'y':16.2,'path':path})
            link = LineString(path).buffer(1.1, cap_style=2)
            link = unary_union([link, base.buffer(1.1, cap_style=3)])
            data['floors'].append({'y':16.2, 'y0':15.9, 'polys':polys(link)})
            room['lit'].append({'y':16.2, 'polys':polys(link)})
            room['ceils'].append({'y':20., 'polys':polys(link)})
            for sd in data.get('balconyRooms',{}).get('sides',[]):
                back = LineString(sd['back']).difference(link.buffer(.2))
                sd['backSegments'] = [list(p.coords) for p in getattr(back,'geoms',[back]) if p.geom_type=='LineString']
            # Open the connector through the old service-room back wall.
            for key in ('walls','thinWalls'):
                out=[]
                for w in room[key]:
                    line=LineString([w[:2],w[2:4]])
                    rest=line.difference(link.buffer(.2)) if w[4]<18 and w[5]>16.3 else line
                    for p in getattr(rest,'geoms',[rest]):
                        if p.geom_type=='LineString' and p.length>.03:
                            a,b=p.coords[0],p.coords[-1];out.append([*a,*b,*w[4:]])
                room[key]=out
    vom_stairs=[dict(x=v['p'][0],z=v['p'][1],dx=v['u'][0],dz=v['u'][1],L=v['L'],y0=v['y'],y1=v['top'],w=v['w']-.7)
                for v in next(l for l in data['levels'] if l['name']=='F')['voms']]
    for f in data['flights']+data.get('accessFlights',[])+vom_stairs:
        start=np.array([f['x'],f['z']]);axis=np.array([f['dx'],f['dz']]);side=np.array([-axis[1],axis[0]])
        def box(a,b,width):
            return Polygon([start+axis*t+side*s for t,s in [(a,-width/2),(b,-width/2),(b,width/2),(a,width/2)]])
        clear=box(-.7,f['L']+.7,(f.get('w',1.6)+.55))
        br=data.get('balconyRooms')
        if br and f['y0'] < br['ceil'] and f['y1'] >= br['y']:
            # Rooms are drawn separately from rooms.walls in the app.
            # Their back walls and suite partitions need the same doorway.
            for sd in br['sides']:
                lines=sd.get('backSegments',[sd['back']])
                segments=[]
                for line in lines:
                    g=LineString(line).difference(clear)
                    segments.extend(list(p.coords) for p in getattr(g,'geoms',[g])
                                    if p.geom_type=='LineString' and p.length>.03)
                sd['backSegments']=segments
            parts=[]
            for wall in br['walls']:
                g=LineString([wall[:2],wall[2:4]]).difference(clear)
                for p in getattr(g,'geoms',[g]):
                    if p.geom_type=='LineString' and p.length>.03:
                        a,b=p.coords[0],p.coords[-1];parts.append([*a,*b])
            br['walls']=parts
        for floor in data['floors']:
            if floor['y'] <= f['y0']+.05 or floor['y'] > f['y1']+.05:
                continue
            # Keep the landing beyond the final tread, with no hanging lip.
            opening=box(-.1,f['L']+.025,f.get('w',1.6)+.35)
            floor['polys']=polys(geom([floor]).difference(opening))
        for floor in room['lit']:
            if f['y0']+.05 < floor['y'] <= f['y1']+.05:
                floor['polys']=polys(geom([floor]).difference(box(-.1,f['L']+.025,f.get('w',1.6)+.35)))
        for ceiling in room['ceils']+room['soffits']:
            y=ceiling['y']
            if not f['y0']+.1 < y < f['y1']+1.9:
                continue
            first=max(-.6,(y-f['y0']-2.05)*f['L']/(f['y1']-f['y0']))
            ceiling['polys']=polys(geom([ceiling]).difference(box(first,f['L']+.7,f.get('w',1.6)+.6)))
        for level in data['levels']:
            for row in level['rows']:
                # Embedded access-stair treads are r=-1 and must stay.
                if row.get('r',-1)<0 or not f['y0']+.05<row['y']<=f['y1']+.05:continue
                row['polys']=polys(geom([row]).difference(box(-.1,f['L']+.025,f.get('w',1.6)+.35)))
        for key in ('walls','thinWalls'):
            out=[]
            for w in room[key]:
                line=LineString([w[:2],w[2:4]])
                rest=line.difference(clear) if w[4]<f['y1']+1.9 and w[5]>f['y0']+.1 else line
                for p in getattr(rest,'geoms',[rest]):
                    if p.geom_type=='LineString' and p.length>.03:
                        a,b=p.coords[0],p.coords[-1];out.append([*a,*b,*w[4:]])
            room[key]=out
    for v in next(l for l in data['levels'] if l['name']=='F')['voms']:
        p=np.array(v['p']);u=np.array(v['u']);w=np.array([-u[1],u[0]])
        cut=Polygon([p+u*t+w*s for t,s in [(-.45,-v['w']/2+.35),(v['L']+.025,-v['w']/2+.35),(v['L']+.025,v['w']/2-.35),(-.45,v['w']/2-.35)]])
        for f in room['lit']:
            if abs(f['y']-v['top'])<.05:f['polys']=polys(geom([f]).difference(cut))
        level=next(l for l in data['levels'] if l['name']=='F')
        for row in level['rows']:
            if v['y']+.03<row['y']<=v['top']+.05:
                row['polys']=polys(geom([row]).difference(cut))
        steps=[]
        for step in level['steps']:
            pp=step['polys']
            multi=isinstance(pp[0][0][0],list)
            g=geom([{'polys':pp if multi else [pp]}])
            if v['y']-.02<step['y']<=v['top']+.05:g=g.difference(cut)
            steps.extend({**step,'polys':p} for p in polys(g))
        level['steps']=steps


def apply(data):
    data['tunnelFinish']={'wall':0xb8b9b6,'floor':0x666969}
    for tunnel in data.get('tunnels',[]):
        if tunnel.get('upperFence'):
            tunnel['upperFence'].update(height=.6,openFront=True)
    for v in next(l for l in data['levels'] if l['name']=='F')['voms']:
        v['bridge']=True
    columns = _columns(data)
    lower = _lower_concourse(data)
    balcony = _balcony_concourse(data)
    if lower:_outfield_access(data,lower)
    _stairs(data)
    if lower:
        # Route around the solid stair bodies rather than through their
        # lower steps. The circulation path stays on the C1 floor.
        obstacles=[]
        for f in data['flights']+data.get('accessFlights',[]):
            if abs(f['y0']-lower['y'])<.05:
                a=np.array([f['x'],f['z']]);b=a+np.array([f['dx'],f['dz']])*f['L']
                obstacles.append(LineString([a,b]).buffer(f.get('w',1.6)/2+.5,cap_style=2))
        walkable=geom([lower]).buffer(-.95).difference(unary_union(obstacles))
        loop=max(pieces(walkable),key=lambda p:p.area).simplify(.03).exterior
        walk=[]
        for a,b in zip(list(loop.coords)[:-1],list(loop.coords)[1:]):
            a=np.array(a);b=np.array(b)
            for t in np.arange(max(1,int(np.ceil(np.linalg.norm(b-a)/.8)))):
                n=max(1,int(np.ceil(np.linalg.norm(b-a)/.8)))
                walk.append([round(float(x),3) for x in a+(b-a)*t/n])
        lower['walkLine']=walk+[walk[0]]
    routes = [lower] if lower else []
    for name, y in [('C2', 10.6), ('C3', 16.2), ('C4', 24.0)]:
        floor = geom([f for f in data['floors'] if abs(f['y'] - y) < 0.04])
        if name=='C3':floor=balcony
        routes.append({'id': name, 'y': y, 'polys': polys(floor), 'components': len(pieces(floor))})
    data['concourseRoutes'] = routes
    data['structureRevision'] = {'sources': '2026 seat PDFs; 2016 building section; balcony/concourse photos; user latest blue-seat specification',
                                 'estimates': ['column wall alignment and upper pier section', 'continuous lower concourse envelope', 'rear service stair and its 3F connector'],
                                 'columns': columns}
    repaired = 0
    for level in data['levels']:
        steps=[]
        for step in level['steps']:
            pp=step['polys']
            multi=isinstance(pp[0][0][0],list)
            steps.extend({**step,'polys':p} for p in polys(geom([{'polys':pp if multi else [pp]}])))
        level['steps']=steps
        for row in level['rows']:
            clean = []
            for q in row['polys']:
                g = Polygon(q[0], q[1:])
                repaired += not g.is_valid
                clean.extend(polys(g))
            row['polys'] = clean
    data['structureRevision']['repairedRowPolygons'] = repaired
    print('structure: infield columns aligned with balcony wall', len(columns), '; C1 components', lower and lower['components'])
    return data
