from PIL import Image
import numpy as np, cv2
def detect(fn, minfill=0.38, smin=5, smax=19, amin=18, amax=200):
    im=np.array(Image.open(fn).convert('RGB')).astype(int)
    gray=((abs(im[...,0]-im[...,1])<20)&(abs(im[...,1]-im[...,2])<20)&(im[...,0]>70)&(im[...,0]<140))  # seat outline grey
    dark=(im.sum(2)<90).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(dark,connectivity=4)
    out=[]
    for i in range(1,n):
        x,y,w,h,a=st[i]
        if smin<=w<=smax and smin<=h<=smax and amin<=a<=amax and a>=minfill*w*h:
            # must be ringed by seat-outline grey (or the cyan highlight) on most sides
            x0,y0,x1,y1=max(0,x-2),max(0,y-2),min(im.shape[1],x+w+2),min(im.shape[0],y+h+2)
            ring=gray[y0:y1,x0:x1].sum()
            cyan=((im[y0:y1,x0:x1,2]>150)&(im[y0:y1,x0:x1,0]<80)).sum()
            if ring+cyan>=1.2*(w+h): out.append((cen[i][0],cen[i][1],w,h))
    return np.array(out)

def detect_cyan(fn):
    im=np.array(Image.open(fn).convert('RGB')).astype(int)
    cy=((im[...,2]>140)&(im[...,0]<90)&(im[...,1]>110)).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(cy,connectivity=4)
    out=[]
    for i in range(1,n):
        x,y,w,h,a=st[i]
        if 6<=w<=16 and 6<=h<=16 and a>=0.55*w*h and 0.6<w/h<1.7: out.append((cen[i][0],cen[i][1],w,h))
    return np.array(out)

def all_seats(fns):
    from scipy.spatial import cKDTree
    P=None
    for fn in fns:
        for Q in (detect(fn), detect_cyan(fn)):
            if len(Q)==0: continue
            Q=Q[:,:2]
            if P is None: P=Q; continue
            d,_=cKDTree(P).query(Q)
            P=np.vstack([P,Q[d>4]])
    return P
