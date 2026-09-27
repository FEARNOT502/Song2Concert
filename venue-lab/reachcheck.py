import json, sys, numpy as np
from scipy.spatial import cKDTree
venue, datafile, oz = sys.argv[1], sys.argv[2], float(sys.argv[3])
sc=float(sys.argv[4]) if len(sys.argv)>4 else 5
N=np.array([n[:3] for n in json.load(open(f'reach-{venue}.json'))])
d=json.load(open(datafile))
T=cKDTree(N[:,[0,2]])
from PIL import Image, ImageDraw
img=Image.new('RGB',(900,900),'black'); dr=ImageDraw.Draw(img)
cx,cz=450,450
for x,y,z in N: dr.point((cx+x*sc, cz+(z-oz)*sc), fill=(60,60,90))
for L in d['levels']:
    import base64
    S=np.frombuffer(base64.b64decode(L['seats']),dtype='<i2').reshape(-1,4).astype(float); S[:,0]/=10; S[:,1]/=10
    X=S[:,0]; Z=S[:,1]+oz; Y=np.array(L['hs'])[np.minimum(S[:,2].astype(int),len(L['hs'])-1)] if L.get('hs') else L['h0']+L['rise']*S[:,2]
    ok=np.zeros(len(S),bool)
    for i,(x,z,y) in enumerate(zip(X,Z,Y)):
        for j in T.query_ball_point([x,z],1.2):
            if abs(N[j,1]-y)<0.7: ok[i]=True; break
    print(L['name'],'reachable seats',ok.sum(),'/',len(S), f'{ok.mean()*100:.1f}%')
    for x,z,o in zip(X,Z,ok):
        dr.point((cx+x*sc,cz+(z-oz)*sc),fill=(0,200,0) if o else (255,40,40))
img.save(f'reach-{venue}.png')
