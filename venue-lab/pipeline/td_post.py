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
