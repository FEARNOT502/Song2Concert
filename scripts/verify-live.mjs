#!/usr/bin/env node
// verify-live.mjs — when live mode is on, and what it is allowed to touch.
//
// Two things are pure and checked here in plain node: reading a live release
// off its tags, and the profile that says what live mode changes. What the
// crowd lift does to the sound is measured in the browser, by audio-smoke.
import { detectLive, LIVE_VENUES } from '../src/audio/live.js';
import { liveProfile, wetTrimDb, WET_OFFSET_DB } from '../src/audio/graph.js';
import { VENUE_WET_DB, ROOM_RETURN_DB } from '../src/audio/venuerooms.js';
import { VENUES } from '../src/data.js';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── the tags ────────────────────────────────────────────────────────────────
const LIVE = [
  { title: 'HOT - Live' },
  { title: 'SPAGHETTI (Member ver.) - Live' },
  { title: 'Fix You (Live)' },
  { title: 'Bohemian Rhapsody [Live at Wembley]' },
  { title: 'Song - Live from Seoul' },
  { title: '사랑하기 때문에 (라이브)' },
  { fileName: '03. HOT - Live.flac' },
  { title: 'HOT', album: "2025 LE SSERAFIM TOUR 'EASY CRAZY HOT' ENCORE IN TOKYO DOME" },
  { title: 'Intro', album: 'Live at Budokan' },
  { title: 'Intro', album: '2024 콘서트 실황' },
];
const STUDIO = [
  { title: 'Live My Life' },
  { title: 'Alive' },
  { title: 'Live Forever' },
  { title: 'Mockingbird', album: 'Encore' },
  { title: 'Anti-Hero', album: 'Midnights (Tour Edition)' },
  { title: 'Delivery' },
  { fileName: 'oliver.flac' },
  {},
];
for (const tags of LIVE) check(`live: ${JSON.stringify(tags)}`, detectLive(tags));
for (const tags of STUDIO) check(`studio: ${JSON.stringify(tags)}`, !detectLive(tags));

// ── what it touches ─────────────────────────────────────────────────────────
for (const venue of VENUES) {
  const big = LIVE_VENUES.includes(venue.id);
  const on = liveProfile(venue, true);
  const off = liveProfile(venue, false);
  check(`${venue.id}: off changes nothing`, off.crowd === 0 && off.wetDb === 0 && off.bandDb === 0 && off.voiceDb === 0);
  if (big) {
    check(`${venue.id}: on lifts the crowd`, on.crowd > 0, `crowd ${on.crowd}`);
    // the band comes down under the voice by exactly what the voice goes up by
    check(`${venue.id}: the voice holds while the band comes down`, on.bandDb < 0 && on.voiceDb === -on.bandDb, `band ${on.bandDb} dB, voice +${on.voiceDb} dB`);
  } else {
    check(`${venue.id}: on changes nothing outside the big rooms`, on.crowd === 0 && on.wetDb === 0 && on.bandDb === 0 && on.voiceDb === 0);
  }
  // Off must be the wet level the venue has without live mode, to the bit.
  for (const pct of [0, venue.position.wet, 100]) {
    const was = Math.max(-40, (VENUE_WET_DB[venue.id] ?? WET_OFFSET_DB) + ROOM_RETURN_DB[venue.id]
      + ((pct - venue.position.wet) / 100) * 24);
    check(`${venue.id}: wet ${pct}% unchanged with live off`, wetTrimDb(pct, venue, false) === was);
  }
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
