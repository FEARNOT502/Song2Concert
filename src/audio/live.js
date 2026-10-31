// live.js — is this track a live recording?
//
// A live recording already carries its room and its audience. Played through
// the chain as it is tuned for a studio master, the room is added on top of the
// one it has, and the audience — the reason to put on a live recording at all —
// is pushed back behind a mix that was shaped to keep the singer in front. Live
// mode retunes the big rooms for it (see liveProfile in graph.js).
//
// It applies to the three venues with a full touring rig. A club, a theatre or
// a concert hall is not where a live album was made, and nothing here changes
// them.
export const LIVE_VENUES = ['arena', 'dome', 'stadium'];

export const liveApplies = (venueId, on) => !!on && LIVE_VENUES.includes(venueId);

// Read the tags for the marks a live release leaves on itself.
//
// The title is where a single track says so — "HOT - Live", "Song (Live)",
// "Song [Live at Wembley]" — and the mark is set off by punctuation or followed
// by where it was played. A bare word is not enough: "Live My Life" and "Alive"
// are studio songs.
//
// The album is where a whole release says so, and the words that mean it there
// are weaker on their own. "Encore" is a studio album; "Tour Edition" is a
// studio album sold on a tour. So TOUR and CONCERT count only alongside a place
// or an occasion — "… TOUR … ENCORE IN TOKYO DOME" — while LIVE counts alone.
//
// Wrong guesses are cheap: the switch overrides this either way.
const TITLE_MARKS = [
  /[([\-–—~:|/]\s*live\b/i,
  /\blive\s+(at|in|from|on|@)\b/i,
  /\b(unplugged|in concert)\b/i,
  /ライブ|라이브|실황/,
];
const ALBUM_MARKS = [
  /\blive\b/i,
  /\b(tour|concert)\b.*\b(in|at|live|encore|final)\b/i,
  /\b(in|at|live|encore|final)\b.*\b(tour|concert)\b/i,
  /ライブ|コンサート|라이브|콘서트|실황/,
];

export function detectLive({ title, album, fileName } = {}) {
  const name = (fileName || '').replace(/\.[^.]+$/, '');
  if ([title, name].some((t) => t && TITLE_MARKS.some((re) => re.test(t)))) return true;
  return !!(album && ALBUM_MARKS.some((re) => re.test(album)));
}
