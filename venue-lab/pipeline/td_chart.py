# Canonical row/seat intervals transcribed from the detailed Tokyo Dome PDFs.
# A missing row remains unseated; a single number is one seat, not an invitation
# to interpolate from neighbouring rows. See docs/TOKYO_DOME_REMODEL_PLAN.ko.md.
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def load(path=None):
    with open(path or os.path.join(HERE, 'td', 'td_rows_real.json')) as f:
        return json.load(f)

if __name__ == '__main__':
    real = load()
    for name in ('A01', 'A49'):
        print(name, real[name]['rows'])
