# Tokyo Dome: what is laid on the finished outlines, after td_build.py's raster build.
#
#   td_excite.py  the excite seats, as the official map and the photographs show them
#   td_ends.py    the outfield ends of the balcony (C) and the 2nd floor (D), and the walls there
#   td_tidy.py    the upper rows' (E) vomitories squared off, the outfield's aisle columns on their aisles' middles
#   td_steps.py   the half steps up the 1st floor's rear aisles (B), where a row rises more than 0.2 m
#   td_balcony.py the rooms behind the balcony (suites, lounge), its glazing, the 2nd floor's smooth underside over it and its end
#
# td_build.py pickles its stands (td_pre.pkl) and calls apply(); `python3 td_post.py` runs these
# stages again on that pickle, writes td_stands.json and relabels the seats (td_labels.py): seconds,
# where td_build.py takes five minutes.
import json, pickle, importlib
STAGES = ('td_excite', 'td_review', 'td_ends', 'td_tidy', 'td_steps', 'td_balcony', 'td_structure')
def apply(data):
    # The continuous 2.2m backstop needs its first seated eye above it.
    # Lift only the lowest infield treads; fade to the unchanged 3m level.
    # The upper A/B junction and the outfield-side portals stay fixed.
    def front_height(y):return round(y+.7*max(0,min(1,(3.-y)/2.4)),3)
    A=next(l for l in data['levels'] if l['name']=='A')
    import base64,numpy as np
    from scipy.spatial import cKDTree
    from pathlib import Path
    P,labels=pickle.load(open(Path(__file__).with_name('td_seatlab.pkl'),'rb'))['AB']
    seats=np.frombuffer(base64.b64decode(A['seats']),'<i2').reshape(-1,4)
    nearest=cKDTree(P).query(seats[:,:2]/A.get('seatScale',10))[1]
    lift_weight={}
    for seat,j in zip(seats,nearest):
        block=labels[j][0]
        if not block.startswith('A'):continue
        num=int(block[1:]);weight=max(0.,min(1.,(num-16)/3,(34-num)/3))
        lift_weight[int(seat[2])]=weight
    A['hs']=[round(y+lift_weight.get(i,0)*(front_height(y)-y),3) for i,y in enumerate(A['hs'])]
    for row in A['rows']:
        y=row['y'];row['y']=round(y+lift_weight.get(row['r'],0)*(front_height(y)-y),3)
    # Behind G the padded wall is removed, so those A rows do not need a
    # sightline lift; keep their existing aisle/landing heights.
    data['backstopFrontFloor']=1.3
    for name in STAGES:
        try: m = importlib.import_module(name)
        except ModuleNotFoundError as e:
            if e.name != name: raise
            continue
        data = m.apply(data)
    from td_review import finish
    return finish(data)
if __name__ == '__main__':
    data = apply(pickle.load(open('td_pre.pkl', 'rb')))
    json.dump(data, open('td_stands.json', 'w'), separators=(',', ':'))
    import td_labels
