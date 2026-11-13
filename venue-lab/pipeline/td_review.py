"""Photo-review finishes. Unmeasured dimensions remain photographic estimates."""
import base64
from collections import defaultdict
import numpy as np
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import unary_union
from td_structure import geom,polys,pieces
C_END=117.5
O=np.array([0.,-60.])

def sector(end):
 return Polygon([O.tolist()]+[(O+np.array([np.sin(a),np.cos(a)])*240).tolist() for a in np.deg2rad(np.linspace(-end,end,801))])

def apply(data):
 keep=sector(C_END)
 # Remove all 55 raster end-cap slivers before adding the common end plane.
 data['rooms']['thinWalls']=[w for w in data['rooms']['thinWalls'] if not(abs(w[4]-13.3)<.02 and abs(w[5]-17.3)<.02)]
 for key in ('walls','thinWalls'):
  out=[]
  for w in data['rooms'][key]:
   ln=LineString([w[:2],w[2:4]])
   if 16.15<=w[4]<=16.25 and w[5]<=20.35:ln=ln.intersection(keep)
   for part in getattr(ln,'geoms',[ln]):
    if part.geom_type=='LineString' and part.length>.03:
     for a,b in zip(list(part.coords)[:-1],list(part.coords)[1:]):out.append([*a,*b,*w[4:]])
  data['rooms'][key]=out
 for key,y in [('ceils',20.),('lit',16.2)]:
  for f in data['rooms'][key]:
   if abs(f['y']-y)<.02:f['polys']=polys(geom([f]).intersection(keep))
 C=next(l for l in data['levels'] if l['name']=='C')
 for row in C['rows']:row['polys']=polys(geom([row]).intersection(keep))
 C['rows']=[r for r in C['rows'] if r['polys']]
 for step in C['steps']:
  raw=step['polys'];g=Polygon(raw[0],raw[1:]) if isinstance(raw[0][0],list) else Polygon(raw)
  q=g.intersection(keep);step['polys']=polys(q)[0] if not q.is_empty else []
 C['steps']=[s for s in C['steps'] if s['polys']]
 S=np.frombuffer(base64.b64decode(C['seats']),'<i2').reshape(-1,4);sk=C.get('seatScale',10)
 ok=np.abs(np.degrees(np.arctan2(S[:,0]/sk,S[:,1]/sk+60)))<C_END-.15
 C['seats']=base64.b64encode(S[ok].tobytes()).decode();C.pop('labels',None)
 C['rails']=[r for r in C['rails'] if abs(np.degrees(np.arctan2((r[0]+r[2])/2,(r[1]+r[3])/2+60)))<C_END]
 # Trim the actual 1.5m first-tier slab, not just its painted fascia.
 D=next(l for l in data['levels'] if l['name']=='D')
 for row in D['rows']:
  if abs(row['y']-18.6)<.02:row['y0']=18.48
 data['rimCS']=[[p for p in rim if abs(np.degrees(np.arctan2(p[0],p[1]+60)))<=C_END] for rim in data['rimCS']]
 for floor in data['floors']:
  if 13.5<floor['y']<18.7:floor['polys']=polys(geom([floor]).intersection(keep if floor['y']<18 else sector(104)))
 for c in data['pillars']:
  if c.get('vom') or c.get('aisle') or c['z']<-79:c.update(r=.4,rx=.3,rz=.4)
 return data

def carve_headroom(data,ceiling):
 g=geom([ceiling]);y=ceiling['y'];F=next(l for l in data['levels'] if l['name']=='F')
 stairs=data['flights']+data.get('accessFlights',[])+[dict(x=v['p'][0],z=v['p'][1],dx=v['u'][0],dz=v['u'][1],L=v['L'],y0=v['y'],y1=v['top'],w=v['w']-.7) for v in F['voms']]
 for f in stairs:
  if not f['y0']+.1<y<f['y1']+2:continue
  a=np.array([f['x'],f['z']]);u=np.array([f['dx'],f['dz']]);v=np.array([-u[1],u[0]])
  first=max(-.6,(y-f['y0']-2.1)*f['L']/(f['y1']-f['y0']))
  cut=Polygon([a+u*t+v*s for t,s in [(first,-(f.get('w',1.6)+.65)/2),(f['L']+.7,-(f.get('w',1.6)+.65)/2),(f['L']+.7,(f.get('w',1.6)+.65)/2),(first,(f.get('w',1.6)+.65)/2)]])
  g=g.difference(cut)
 return polys(g)

def finish(data):
 # The old A front extension was empty apron, not numbered seating. Recess
 # that unoccupied strip for the attached excite rear tread. Seat support
 # is independently checked after this operation; no seat IDs are removed.
 if data.get('exciteRearCut'):
  cut=unary_union([Polygon(p[0],p[1:]).buffer(0) for p in data['exciteRearCut']])
  A=next(l for l in data['levels'] if l['name']=='A')
  for row in A['rows']:row['polys']=polys(geom([row]).difference(cut))
  A['rows']=[r for r in A['rows'] if r['polys']]
 for c in data['pillars']:
  if c.get('vom') or c.get('aisle') or c['z']<-79:c.update(r=.4,rx=.3,rz=.4)
 room=data['rooms'];infield=geom([f for f in data['floors'] if abs(f['y']-10.6)<.02]).intersection(box(-150,-78,150,100))
 # C's lowest closed underside is 13.8. Carry its finish all the way
 # beneath C and its rear rooms, not only over the narrower C2 floor.
 # Otherwise the gaps exposed overlapping 15.85m slab strips above it.
 C=next(l for l in data['levels'] if l['name']=='C')
 balcony=geom(C['rows']).union(unary_union([Polygon(sd['front']+sd['back'][::-1]).buffer(0) for sd in data['balconyRooms']['sides']]))
 infield=infield.union(balcony).intersection(box(-150,-78,150,100)).buffer(.035).buffer(-.035).simplify(.025,preserve_topology=True)
 if not infield.is_empty:
  for key in ('ceils','soffits'):
   for f in room[key]:
    if 12.4<f['y']<16.3:f['polys']=polys(geom([f]).difference(infield.buffer(.2)))
  ceil={'y':13.8,'polys':polys(infield)};ceil['polys']=carve_headroom(data,ceil);room['ceils'].append(ceil)
  for lamp in room['lamps']:
   if 13.8<lamp[1]<16.3 and infield.covers(Point(lamp[0],lamp[2])):lamp[1]=13.77
 for key in ('ceils','soffits'):
  by=defaultdict(list)
  for f in room[key]:by[round(f['y'],3)].append(f)
  room[key]=[{'y':y,'polys':polys(geom(fs))} for y,fs in sorted(by.items()) if any(f['polys'] for f in fs)]
 # Finish each 1F covered entrance with a single lintel across the
 # squared opening; expose none of the stepped slab ends behind it.
 portals=data.get('infieldPortals',[])
 for portal in portals:
  front=np.array(portal['front']);back=np.array(portal['back']);axis=(back-front)/np.linalg.norm(back-front)
  side=np.array([-axis[1],axis[0]]);q=np.array(portal['entry'])-axis*.04
  a=q-side*portal['outerWidth']/2;b=q+side*portal['outerWidth']/2;head=portal['y']+portal['head']
  room['thinWalls'].append([*a,*b,head-.005,head+.65])
 data['infieldPortals']=portals
 F=next(l for l in data['levels'] if l['name']=='F');centres=[];doors=[]
 for v in F['voms']:
  p=np.array(v['p']);u=np.array(v['u']);q=p+u*(v['L']+3.6);centres.append(q)
  doors.append(LineString([p+u*(v['L']-.2),q+u*2]).buffer(v['w']/2-.15,cap_style=2))
 centres=sorted(centres,key=lambda q:np.arctan2(q[0],-q[1]));hall=LineString(centres).buffer(1.6,join_style=2).union(unary_union(doors))
 data['floors'].append({'y':10.6,'y0':10.3,'polys':polys(hall)});room['lit'].append({'y':10.6,'polys':polys(hall)})
 ceil={'y':13.15,'polys':polys(hall)};ceil['polys']=carve_headroom(data,ceil);room['ceils'].append(ceil)
 openings=unary_union(doors).buffer(.08)
 for poly in pieces(hall):
  boundary=LineString(poly.exterior.coords).difference(openings)
  for part in getattr(boundary,'geoms',[boundary]):
   if part.geom_type!='LineString':continue
   for a,b in zip(list(part.coords)[:-1],list(part.coords)[1:]):
    if np.linalg.norm(np.array(a)-b)>.05:room['thinWalls'].append([*a,*b,10.6,13.15])
 for key in ('walls','thinWalls'):
  out=[]
  for w in room[key]:
   ln=LineString([w[:2],w[2:4]])
   if w[4]<12.6 and w[5]>10.7:ln=ln.difference(hall.buffer(-.12))
   for p in getattr(ln,'geoms',[ln]):
    if p.geom_type=='LineString' and p.length>.04:
     for a,b in zip(list(p.coords)[:-1],list(p.coords)[1:]):out.append([*a,*b,*w[4:]])
  room[key]=out
 # Explicitly retain the lower portal doorway through the rebuilt C1
 # envelope. Raster boundary reconstruction used to close three mouths.
 for key in ('walls','thinWalls'):
  out=[]
  for w in room[key]:
   line=LineString([w[:2],w[2:4]])
   for portal in portals:
    if w[4]<portal['y']+1.8 and w[5]>portal['y']+.3:
     opening=LineString([portal['front'],portal['back']]).buffer(portal['width']/2+.15,cap_style=2)
     line=line.difference(opening)
   for part in getattr(line,'geoms',[line]):
    if part.geom_type=='LineString' and part.length>.04:
     for a,b in zip(list(part.coords)[:-1],list(part.coords)[1:]):out.append([*a,*b,*w[4:]])
  room[key]=out
 # The previous opening only cut room walls. The separate building outer
 # shell still crossed every portal. Extend that shell around the new hall.
 outer=unary_union([Polygon(p[0],p[1:]) for p in data['outer']])
 envelope=outer.union(hall.buffer(.45,join_style=2))
 for flight in data['flights']:
  if flight['y0']!=16.2:continue
  start=np.array([flight['x'],flight['z']]);axis=np.array([flight['dx'],flight['dz']])
  run=LineString([start-axis*1.2,start+axis*(flight['L']+1.2)])
  envelope=envelope.union(run.buffer(flight.get('w',1.6)/2+.55,cap_style=2))
  landing=LineString([start+axis*flight['L'],start+axis*(flight['L']+1.2)]).buffer(flight.get('w',1.6)/2+.15,cap_style=2)
  data['floors'].append({'y':24.,'y0':23.7,'polys':polys(landing)})
 data['outer']=polys(envelope)

 data['outfieldConcourse']={'y':10.6,'ceiling':13.15,'polys':polys(hall),'path':[list(np.round(p,3)) for p in centres],'mouths':len(F['voms'])}
 rear=[]
 for q in centres:
  radial=q-O;radial/=np.linalg.norm(radial);rear.append(list(np.round(q+radial*1.8,3)))
 ends=[]
 for sg in (-1,1):
  e=max([p for rim in data['rimCS'] for p in rim if np.sign(p[0])==sg],key=lambda p:abs(np.degrees(np.arctan2(p[0],p[1]+60))))
  r=np.array(e)-O;r/=np.linalg.norm(r);ends.append(list(np.round(np.array(e)+r*4,3)))
 # Continue the actual upper-wall endpoints, rather than a disconnected
 # wall behind them. Its underside roofs the seats behind the F pillars.
 upper=sorted(data['upperWall'],key=lambda w:w['pts'][-1][0])
 left,right=[w['pts'][-1] for w in upper]
 # Wrap the same upper wall behind the full scoreboard. The prior
 # route followed the mouth centres and doubled back at both ends.
 ret_left,ret_right=[w['ret'][1] for w in upper]
 start=np.degrees(np.arctan2(abs(ret_left[0]),-(ret_left[1]+60)))
 arc=[]
 for a in np.linspace(-start,start,181):
  # Angle zero points to centre field, behind the screen.
  rad=np.radians(a);r=float(np.interp(abs(a),[0,start],[77.5,np.linalg.norm(np.array(ret_left)-O)]))
  q=O+np.array([np.sin(rad),-np.cos(rad)])*r
  # This is an interior wall: retain a 0.6m setback from the actual shell.
  inner=envelope.buffer(-.6)
  for _ in range(100):
   if inner.covers(Point(q)):break
   q+=(O-q)/np.linalg.norm(O-q)*.2
  arc.append(list(np.round(q,3)))
 front=[left,*arc,right]
 data['outfieldBackWall']={'pts':front,'y0':16.2,'back':front}
 under=[left,*[list(np.round(q,3)) for q in centres],right]
 room['ceils'].append({'y':16.2,'polys':polys(Polygon(under+front[::-1]).buffer(0))})
 # Finish rooms along the inner edge of the rear circulation band.
 br=data['balconyRooms'];br['corridorWalls']=[];br['doors']=[]
 for sd in br['sides']:
  front_points=np.array(sd['front']);K=np.array(sd['back']);ang=np.array(sd['ang'])
  inward=front_points-K;inward/=np.linalg.norm(inward,axis=1)[:,None]
  edge=K+inward*2.35
  for a,b in sd['suites']:
   mask=(ang>=a-.001)&(ang<=b+.001)
   line=LineString(edge[mask])
   if line.length<1.5:continue
   mid=line.length/2;door=[list(line.interpolate(mid+d).coords[0]) for d in (-.52,.52)]
   opening=LineString(door).buffer(.025)
   rest=line.difference(opening)
   br['corridorWalls'].extend(list(g.coords) for g in getattr(rest,'geoms',[rest]) if g.geom_type=='LineString')
   br['doors'].append({'a':door[0],'b':door[1],'y':br['y'],'h':2.15})
 # Keep the service stair access opening through newly enclosed rooms.
 for connection in data.get('serviceStairLinks',[]):
  opening=LineString(connection['path']).buffer(1.15,cap_style=2)
  cut=[]
  for line in br['corridorWalls']:
   g=LineString(line).difference(opening)
   cut.extend(list(p.coords) for p in getattr(g,'geoms',[g]) if p.geom_type=='LineString' and p.length>.03)
  br['corridorWalls']=cut
 # The room renderer had its own uncut ceiling ribbon, independent of the
 # correctly cut room.ceils. Give it the same stair headroom openings.
 ceiling=unary_union([Polygon(sd['front']+sd['back'][::-1]).buffer(0) for sd in br['sides']])
 ce={'y':br['ceil'],'polys':polys(ceiling)}
 br['ceilingPolys']=carve_headroom(data,ce)
 # The central service stair has a continuous inclined soffit in the app.
 # Remove horizontal room-ceiling edges through that lined shaft.
 for f in data['flights']:
  if f['y0']!=16.2 or f['y1']!=24 or abs(f['x'])>=12:continue
  a=np.array([f['x'],f['z']]);u=np.array([f['dx'],f['dz']])
  shaft=LineString([a,a+u*f['L']]).buffer((f.get('w',1.6)+.4)/2,cap_style=2)
  for ceiling in room['ceils']+room['soffits']:
   if 16.3<ceiling['y']<26.2:ceiling['polys']=polys(geom([ceiling]).difference(shaft))


 data['reviewRevision']={'balconyEndDegrees':C_END,'upperEndDegrees':104.,'ceilingFinish':13.8,'outfieldMouthsConnected':len(F['voms']),'pillarSection':[.6,.8]}
 return data

def labelled(data):
 from td_overrides import OVERRIDES
 names=data['blockNames']
 for lv in data['levels']:
  S=np.frombuffer(base64.b64decode(lv['seats']),'<i2').reshape(-1,4);L=np.frombuffer(base64.b64decode(lv['labels']),'<i2').reshape(-1,3)
  if lv['name']=='F':
   from shapely.geometry import MultiPoint
   ids=[i for i,(b,r,n) in enumerate(L) if names[b]=='F10']
   if ids:
    pocket=MultiPoint(S[ids,:2]/lv.get('seatScale',10)).convex_hull.buffer(.45,join_style=2)
    for row in lv['rows']:
     g=geom([row]);paint=g.intersection(pocket)
     if not paint.is_empty:data['backscreen'].append({'y':row['y'],'polys':polys(paint)})
     row['polys']=polys(g.difference(pocket))
  if lv['name']=='F':
   tunnel={'x':11.2,'z':-119.8,'w':2.8,'L':8.0,'h':2.35,'floor':3.0}
   cut=box(tunnel['x']-tunnel['w']/2,tunnel['z']-tunnel['L'],tunnel['x']+tunnel['w']/2,tunnel['z'])
   rebuilt=[]
   for row in lv['rows']:
    g=geom([row]);inside=g.intersection(cut);outside=g.difference(cut)
    if not outside.is_empty:rebuilt.append({**row,'polys':polys(outside)})
    if not inside.is_empty and row['y']>tunnel['floor']+tunnel['h']+.25:rebuilt.append({**row,'y0':max(row.get('y0',0),tunnel['floor']+tunnel['h']+.25),'polys':polys(inside)})
   lv['rows']=rebuilt;data['F11Tunnel']=tunnel
  keep=np.array([names[b] not in OVERRIDES for b,r,n in L]);lv['seats']=base64.b64encode(S[keep].tobytes()).decode();lv['labels']=base64.b64encode(L[keep].tobytes()).decode()
  for key in ('gblocks','gnums','seatY'):
   if key in lv and len(lv[key])==len(keep):lv[key]=[v for v,k in zip(lv[key],keep) if k]
 return data
