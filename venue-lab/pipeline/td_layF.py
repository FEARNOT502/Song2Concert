# Tokyo Dome outfield: complete PDF rows on continuous row curves.
# The illustrated map's individual F boxes are not all at the same scale.
# Allocate their aisle spans together from the row capacities, rather than
# clip each box independently and silently lose its final seats.
import numpy as np
import td_lay2f as L2

PITCH = (0.42, 0.55)
BSC = 9.7
AISLE = 0.95


def lay(G, dist, ok, named, real, D, nrows, O, first=0.55, inset=0.18):
    O = np.asarray(O, float)
    dcs = [(r + first) * D for r in range(nrows)]
    curves = L2.row_curves(dist, None, G, O, dcs, th_lo=95, th_hi=265, dth=0.02)
    S, R, Y, labels, report = [], [], [], [], {}
    rows = {nm:{int(r):ivs for r,ivs in b['rows'].items()} for nm,b in real.items() if nm.startswith('F')}
    starts = {nm:min(a for ivs in rr.values() for a,b in ivs) for nm,rr in rows.items()}
    capacities = {nm:max(b-starts[nm]+1 for ivs in rr.values() for a,b in ivs) for nm,rr in rows.items()}
    for nm, rr in rows.items():
        report[nm] = [sum(b-a+1 for ivs in rr.values() for a,b in ivs), 0]

    # Anchor the two OUTER side boundaries on the last complete front row.
    # Project the pole boundary behind it; the inner aisles are allocated
    # smoothly by capacity below. A missing corner of the rear mask must
    # not shift every aisle when F01/F20 ends.
    reference=curves[dcs[13]]
    ths,x,z,arc,good=reference
    gi,gj=G.g(np.nan_to_num(x),np.nan_to_num(z))
    gi=np.clip(np.round(gi).astype(int),0,G.W-1);gj=np.clip(np.round(gj).astype(int),0,G.H-1)
    phi=np.degrees(np.abs(np.arctan2(np.nan_to_num(x),-np.nan_to_num(z))))
    windows=[]
    for side,names in [(1,[f'F{k:02d}' for k in range(20,11,-1)]),(-1,[f'F{k:02d}' for k in range(1,10)])]:
        idx=np.flatnonzero(good & (ok[gj,gi]>0) & (x*side>0) & (phi>=BSC+.1))
        pole,home=(arc[idx[0]],arc[idx[-1]]) if side>0 else (arc[idx[-1]],arc[idx[0]])
        direction=np.sign(home-pole);length=abs(home-pole)
        pitch=min(PITCH[1],(length-AISLE*(len(names)-1))/sum(capacities[n] for n in names))
        edges=[]
        for s in (pole,home):
            th=float(np.interp(s,arc,ths));point,normal=L2._normal(reference,th,O)
            edges.append((th,point,normal))
        windows.append((side,names,edges))

    def emit(nm, ri, curve, sa, sb):
        if ri+1 not in rows[nm]:
            return
        ths,x,z,arc,good = curve
        cap = max(b-starts[nm]+1 for r,ivs in rows[nm].items() if r <= ri+1 for a,b in ivs); length = abs(sb-sa)
        pitch = min(PITCH[1], length/cap)
        if pitch < PITCH[0]-0.02:
            raise ValueError(f'{nm} row {ri+1}: {pitch:.3f} m available per PDF seat')
        nums = [s for a,b in rows[nm][ri+1] for s in range(a,b+1)]
        ids = np.array(nums)-starts[nm]
        offset = max(0, (length-cap*pitch)/2)
        ss = sa+np.sign(sb-sa)*(offset+(ids+0.5)*pitch)
        angle = np.interp(ss, arc, ths)
        xs,zs = np.interp(angle,ths,x),np.interp(angle,ths,z)
        x2,z2 = np.interp(angle+0.05,ths,x),np.interp(angle+0.05,ths,z)
        nx,nz = z2-zs,-(x2-xs)
        outward = nx*(O[0]-xs)+nz*(O[1]-zs)<0
        nx=np.where(outward,-nx,nx);nz=np.where(outward,-nz,nz)
        S.extend(zip(xs,zs));R.extend([ri]*len(nums));Y.extend(np.arctan2(nx,nz))
        labels.extend((nm,ri+1,int(s)) for s in nums);report[nm][1]+=len(nums)

    for ri,dc in enumerate(dcs):
        curve=curves[dc];ths,x,z,arc,good=curve
        gi,gj=G.g(np.nan_to_num(x),np.nan_to_num(z))
        gi=np.clip(np.round(gi).astype(int),0,G.W-1);gj=np.clip(np.round(gj).astype(int),0,G.H-1)
        phi=np.degrees(np.abs(np.arctan2(np.nan_to_num(x),-np.nan_to_num(z))))
        inside=good & ok[gj,gi]
        for side,names,edges in windows:
            ss=[]
            for th0,point,normal in edges:
                th=L2._cross(curve,point,normal if ri>=13 else -normal)
                ss.append(float(np.interp(th0 if th is None else th,ths,arc)))
            pole,home=ss
            valid=np.flatnonzero(inside & (x*side>0) & (phi>=BSC+.1))
            if ri<=13:
                pole=arc[valid[0] if side>0 else valid[-1]]
            home=arc[valid[-1] if side>0 else valid[0]]
            direction=np.sign(home-pole);length=abs(home-pole)
            # Smooth block envelopes between the front and row 14, then
            # keep the rear aisles continuous. Missing rear seat numbers
            # create notches, not a new allocation of the whole stand.
            weights=[]
            for nm in names:
                front=max(b-starts[nm]+1 for a,b in rows[nm][min(rows[nm])])
                weights.append(float(np.interp(ri,[0,13],[front,capacities[nm]])))
            pitch=min(PITCH[1],(length-AISLE*(len(names)-1))/sum(weights))
            widths=np.array(weights)*pitch
            gap=(length-sum(widths))/(len(names)-1)
            cursor=pole
            for nm,width in zip(names,widths):
                emit(nm,ri,curve,cursor,cursor+direction*width)
                cursor+=direction*(width+gap)
        # The right-side Back Screen Club pocket has its own six PDF rows.
        if 'F11' in rows and ri+1 in rows['F11']:
            idx=np.flatnonzero(inside & (np.nan_to_num(x)>0.3) & (phi<BSC-0.2))
            if not len(idx):
                raise ValueError('No room for the F11 PDF pocket')
            run=max(np.split(idx,np.flatnonzero(np.diff(idx)>1)+1),key=len)
            emit('F11',ri,curve,arc[run[-1]],arc[run[0]])
    return np.asarray(S),np.asarray(R,int),np.asarray(Y),labels,report
