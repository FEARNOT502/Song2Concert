import json, numpy as np, cv2
d=json.load(open('insp_stands.json'))
sc=7; W=int(144*sc); H=int(148*sc)
img=np.full((H,W,3),30,np.uint8)
tf=lambda x,z:(int((x+72)*sc),int((z+74)*sc))
def fill(polys,col):
    for p in polys:
        cv2.fillPoly(img,[np.array([tf(x,z) for x,z in r],np.int32) for r in p],col)
for f,col in zip(d['floors'],[(90,70,40),(40,70,90)]): fill(f['polys'],col)
for L,base in zip(d['levels'],[(40,160,220),(200,110,190),(120,120,230)]):
    for r in L['rows']:
        k=0.5+0.5*(r['r']%2)
        fill(r['polys'],tuple(int(c*k) for c in base))
for fl in d['flights']:
    x,z,dx,dz,L=fl['x'],fl['z'],fl['dx'],fl['dz'],fl['L']
    cv2.line(img,tf(x,z),tf(x+dx*L,z+dz*L),(0,255,255),3)
for w in d['rooms']['walls']:
    cv2.line(img,tf(w[0],w[1]),tf(w[2],w[3]),(255,255,255),1)
for p in d['outer']:
    cv2.polylines(img,[np.array([tf(x,z) for x,z in p[0]],np.int32)],True,(0,255,0),1)
for p in d['stacks']: fill([p],(0,0,255))
cv2.imwrite('insp/plan_gen.png',img)
