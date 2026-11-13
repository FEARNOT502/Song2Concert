"""Explicit photo-review exceptions, never silently changed PDF counts."""
OVERRIDES = {
    'G03':'User revision 3: remove the A03-side cell; keep G04 as the tapered terminal block.',
    'G47':'Mirrored G03 removal authorized by the revised block layout.',
    'D01':'User photo review: upper-deck wing is one block too long; shorten both ends.',
    'D51':'User photo review: upper-deck wing is one block too long; shorten both ends.',
    'F10':'User revision 4: green stepped screening, no seating on the left of the batter eye.',
}
def effective(real):
    return {k:v for k,v in real.items() if k not in OVERRIDES}

# User approved photographic block geometry over unofficial PDF capacities.
CUSTOM_LAYOUT = {f'G{n:02}' for n in list(range(4,16))+list(range(35,47))}
