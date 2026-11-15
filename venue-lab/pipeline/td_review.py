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
 _narrow_outfield_voms(data)
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
 # Match the complete back-of-screen face to the LED's own curve.
 _front_parapets(data)
 upper=sorted(data['upperWall'],key=lambda w:w['pts'][-1][0])
 left,right=[np.array(w['pts'][-1]) for w in upper]
 data['scoreboardSetback']=2.5
 data['scoreboardCurve']={'radius':125.,'falloff':.012,'wallBehind':.4,'bandAngle':31.}
 c=data['scoreboardCurve'];angles=np.arange(-31.,31.01,.5)
 screen=[np.array([np.sin(np.radians(a))*(125-.012*a*a),-np.cos(np.radians(a))*(125-.012*a*a)-2.5-.4]) for a in angles]
 def connector(a,b,t0,t1):
  length=np.linalg.norm(b-a);t0=t0/np.linalg.norm(t0)*length*.7;t1=t1/np.linalg.norm(t1)*length*.7
  return [(2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*t0+(-2*t**3+3*t*t)*b+(t**3-t*t)*t1 for t in np.linspace(0,1,13)]
 join_left=connector(left,screen[0],left-np.array(upper[0]['pts'][-2]),screen[1]-screen[0])
 join_right=connector(screen[-1],right,screen[-1]-screen[-2],np.array(upper[1]['pts'][-2])-right)
 front=join_left[:-1]+screen+join_right[1:];back=[]
 for q in front:
  u=(q-O)/np.linalg.norm(q-O)
  hit=LineString([O,O+u*250]).intersection(envelope.boundary)
  points=[np.array(g.coords[0]) for g in getattr(hit,'geoms',[hit]) if g.geom_type=='Point']
  radius=max(np.dot(p-O,u) for p in points)
  back.append(O+u*(radius-.05))
 back[0]=np.array(upper[0]['ret'][-1]);back[-1]=np.array(upper[1]['ret'][-1])
 front=[list(np.round(p,3)) for p in front];back=[list(np.round(p,3)) for p in back]
 mass=Polygon(front+back[::-1]);data.pop('continuousUpperWall',None)
 data['upperOutfieldMass']={'front':front,'back':back,'y0':13.6,'screenRange':[12,12+len(screen)-1],'screenAngles':angles.tolist()}
 data['outfieldBackWall']={'pts':front,'y0':13.6,'back':back}
 # Remove the old, independent ceiling sheet through the new solid volume.
 for ceiling in room['ceils']+room['soffits']:
  if ceiling['y']>13.61:ceiling['polys']=polys(geom([ceiling]).difference(mass))
 data['outer']=polys(envelope.union(mass.buffer(.4,join_style=2)))
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
  S=np.frombuffer(base64.b64decode(lv['seats']),'<i2').reshape(-1,4).copy();L=np.frombuffer(base64.b64decode(lv['labels']),'<i2').reshape(-1,3)
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
   from shapely.affinity import translate
   # F11 belongs to the F12 aisle, not the old raster pocket under the LED.
   # Fit the existing aisle edge; preserve all 93 numbered chairs and their yaw.
   scale=lv.get('seatScale',10);xy=S[:,:2]/scale
   i11=np.flatnonzero(L[:,0]==names.index('F11'))
   edge12=np.array([min(xy[(L[:,0]==names.index('F12'))&(L[:,1]==r)],key=lambda p:p[0]) for r in range(1,11)])
   _,_,vh=np.linalg.svd(edge12-edge12.mean(0));normal=vh[-1];normal*=np.sign(normal[0])
   edge11=np.array([max(xy[i11[L[i11,1]==r]],key=lambda p:p[0]) for r in range(5,11)])
   shift=normal*((edge12@normal).mean()-1.5-max(xy[i11]@normal))
   # Bring the block .44m closer to its existing adjacent aisle.
   old=MultiPoint(xy[i11]).convex_hull.buffer(.5,join_style=2)
   moved=translate(old,*shift);rebuilt=[];data['F11Finish']=[]
   ranks=set(S[i11,2].tolist())
   for row in lv['rows']:
    g=geom([row]);part=g.intersection(old);rest=g.difference(old)
    if not rest.is_empty:rebuilt.append({**row,'polys':polys(rest)})
    if not part.is_empty:
     data['backscreen'].append({'y':row['y'],'polys':polys(part)})
     if row.get('r') in ranks:
      finish={**row,'polys':polys(translate(part,*shift))};rebuilt.append(finish)
      data['F11Finish'].append({**finish,'polys':polys(translate(part,*shift).buffer(.008,join_style=2)),'y':row['y']+.012})
   lv['rows']=rebuilt
   S[i11,:2]=np.round((xy[i11]+shift)*scale).astype('<i2')
   for row in data['backscreen']:row['polys']=polys(geom([row]).difference(moved.buffer(.025)))
   data['F11AisleJoin']={'block':'F12','clearWidth':.66,'shift':shift.tolist(),'normal':normal.tolist(),'edge':edge12.tolist()}
   # The official 1F panoramas 1053/1054/1260 show a well open to the
   # sky, between the front of F11 and the field fence. No roof or stairs.
   front=xy[i11[L[i11,1]==5]]+shift
   across=front[-1]-front[0];across/=np.linalg.norm(across)
   if across[0]<0:across=-across
   forward=np.array([-across[1],across[0]])
   back=front.mean(0)+forward*.65;length=4.;width=7.4
   corners=[back+across*a+forward*t for a,t in [(-width/2,0),(width/2,0),(width/2,length),(-width/2,length)]]
   field=Polygon(data['fence'][0][0]);cut=Polygon(corners).difference(field.buffer(.45,join_style=2)).simplify(.1)
   corners=np.array(cut.exterior.coords[:-1]);heights=[5.74 if abs((p-back)@forward)<.08 else 4.4 for p in corners]
   for row in lv['rows']+data['backscreen']+data['F11Finish']:row['polys']=polys(geom([row]).difference(cut))
   for floor in data['floors']:floor['polys']=polys(geom([floor]).difference(cut))
   data['F11Pit']={'pts':corners.tolist(),'center':list(cut.centroid.coords)[0],'heights':heights,'bottom':.35,'rim':4.6,'backRim':5.74,'fasciaBottom':4.15,'rearEdge':[(back-across*width/2).tolist(),(back+across*width/2).tolist()],'openTop':True}
   # RYOBI is a tall face immediately behind the last F11 row, not a
   # small box at the end of a second flight of green terraces.
   rear=xy[i11[L[i11,1]==10]]+shift
   outward=-forward;centre=rear.mean(0)+outward*.48
   span=np.ptp(rear@across)+1.35
   face=[centre-across*span/2,centre+across*span/2]
   backface=[p+outward*((-128.4-p[1])/outward[1]) for p in face]
   data['batterEyeRooms']=[{'front':[(p*np.array([sg,1])).tolist() for p in face],'back':[(p*np.array([sg,1])).tolist() for p in backface],'floor':float(lv['hs'][int(S[i11[-1],2])])} for sg in [-1,1]]
   _close_batter_rooms_to_hall(data)
  keep=np.array([names[b] not in OVERRIDES for b,r,n in L]);lv['seats']=base64.b64encode(S[keep].tobytes()).decode();lv['labels']=base64.b64encode(L[keep].tobytes()).decode()
  for key in ('gblocks','gnums','seatY'):
   if key in lv and len(lv[key])==len(keep):lv[key]=[v for v,k in zip(lv[key],keep) if k]
 return data


def _narrow_outfield_voms(data):
 import copy,pickle
 F=next(l for l in data['levels'] if l['name']=='F')
 P,labels=pickle.load(open(__import__('pathlib').Path(__file__).with_name('td_seatlab.pkl'),'rb'))['F']
 P=np.array(P);ids=np.array([b=='F12' for b,r,n in labels]);q=P[ids]
 rows=np.array([r for b,r,n in labels if b=='F12'])
 edge=np.array([min(q[rows==r],key=lambda p:p[0]) for r in range(1,11)])
 _,_,vh=np.linalg.svd(edge-edge.mean(0));n=vh[-1];n*=np.sign(n[0]);u=np.array([n[1],-n[0]])
 data['batterEyeVoms']=[]
 for sg in [-1,1]:
  v=copy.deepcopy(min([v for v in F['voms'] if not v.get('batterEye')],key=lambda v:abs(v['p'][0])))
  v.update(p=[sg*22.25,-124.55],u=(u*np.array([sg,1])).tolist(),w=2.4,batterEye=True)
  F['voms'].append(v);data['batterEyeVoms'].append(v)
  p=np.array(v['p']);axis=np.array(v['u']);side=np.array([-axis[1],axis[0]])
  frame=lambda a,b:Polygon([p+axis*t+side*s for t,s in [(a,-1.34),(b,-1.34),(b,1.34),(a,1.34)]])
  cut=frame(-.35,v['L']+3.9)
  for row in F['rows']+data['backscreen']:row['polys']=polys(geom([row]).difference(cut))
  steps=[]
  for st in F['steps']:steps.extend({**st,'polys':poly} for poly in polys(Polygon(st['polys'][0],st['polys'][1:]).difference(cut)))
  F['steps']=steps
  stair_cut=frame(-.35,v['L']-.2)
  for f in data['floors']+data['rooms']['lit']:f['polys']=polys(geom([f]).difference(stair_cut))

def _close_batter_rooms_to_hall(data):
 hall=LineString(data['outfieldConcourse']['path'])
 for room in data['batterEyeRooms']:
  P=np.array(room['front']);axis=P[1]-P[0];axis/=np.linalg.norm(axis)
  outward=np.array([axis[1],-axis[0]])
  if outward[1]>0:outward=-outward
  rear=[]
  for p in P:
   hit=LineString([p,p+outward*30]).intersection(hall)
   q=np.array(min(getattr(hit,'geoms',[hit]),key=lambda g:g.distance(Point(p))).coords[0])
   rear.append((q-outward*1.9).tolist())
  room['back']=rear


def _front_parapets(data):
 # Build complete centreline profiles, including each right-angle return.
 ends=data['upperEnds'];C=[e for e in ends if 'a' in e];D=[e for e in ends if len(e.get('pts',[]))==2]
 def wrap(rim,offset,y,targets):
  P=np.array(rim,float);rad=P-O;P-=rad/np.linalg.norm(rad,axis=1)[:,None]*offset
  ys=[y]*len(P);corners=[]
  for first in [True,False]:
   i=0 if first else len(P)-1;j=1 if first else len(P)-2
   q=P[i].copy()
   if abs(np.degrees(np.arctan2(q[0],q[1]+60)))<90:continue
   target=min(targets,key=lambda e:np.linalg.norm(np.array(e['back'])-q))
   b=np.array(target['back']);n=(b-q)/np.linalg.norm(b-q)
   tangent=np.array([-n[1],n[0]])
   if tangent@(P[j]-q)<0:tangent=-tangent
   P[j]=q+tangent*np.linalg.norm(P[j]-q)
   b=b+n*.18
   if first:
    P=np.vstack([b,P]);ys=[target['y']]+ys;corners=[k+1 for k in corners]+[1]
   else:
    corners.append(len(P)-1);P=np.vstack([P,b]);ys.append(target['y'])
  return {'pts':np.round(P,4).tolist(),'ys':ys,'corners':corners}
 ct=[{'back':e['b'],'y':e['y1']-1.05} for e in C]
 dt=[{'back':e['pts'][-1],'y':e['y1'][-1]-1.05} for e in D]
 data['frontParapets']={'C':[{'panel':wrap(r,.28,data['rimCY'],ct),'rail':wrap(r,.26,data['rimCY'],ct)} for r in data['rimCS']],
                        'D':[{'panel':wrap(sum(data['rimS'],[]),.17,data['rimY'],dt),'rail':wrap(sum(data['rimS'],[]),0,data['rimY'],dt)}]}
 data['upperEnds']=[e for e in ends if e not in C and e not in D]
