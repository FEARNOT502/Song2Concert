"""Explicit photo-review exceptions, never silently changed PDF counts."""
OVERRIDES = {
    'D01':'User photo review: upper-deck wing is one block too long; shorten both ends.',
    'D51':'User photo review: upper-deck wing is one block too long; shorten both ends.',
    'F11':'User photo review: remove seats beneath modern scoreboard and restore batter eye.',
}
def effective(real):
    return {k:v for k,v in real.items() if k not in OVERRIDES}
