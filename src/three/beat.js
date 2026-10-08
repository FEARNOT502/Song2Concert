// beat.js — what the lighting needs to know about the music.
//
// The rig is choreographed in song sections (verse, pre-chorus, chorus, break)
// and flashes on the kick; the audio engine hands the scene a single smoothed
// level. This turns that, and the analyser's spectrum when there is one, into
// the handful of numbers the show runs on:
//
//   kick    1 on a detected low-end onset, decaying after it
//   energy  how loud the track is running now, against its own loudest so far
//   beat    a count of kicks; `bar` is every fourth
//   sec     which section the rig should be playing (verse, pre, chorus, break)
//   part    the section by its own name (intro, verse, pre, chorus, post, break,
//           bridge, dance, solo, outro), for the rooms that play each its own
//   phase   where the beat is: beats so far plus the way through this one, so
//           the movers run in time with the song rather than the clock
//
// With the song's map (songmap.js: the whole track read when it loaded) all of
// that comes from where playback is in the song: the beats and bars as
// tracked, the kicks as found, the section as named, so the chorus lands on
// its first downbeat and a seek lands in the right place. The map also gives
// what a live guess cannot: the section's name (intro, verse, pre-chorus,
// chorus, post-chorus, bridge, dance break, outro), how far through it the
// song is, what comes next and how soon, and whether this is the last chorus.
//
// Without a map (the first seconds of a track while it is read, a file that
// will not decode for it, the club's own loop) it guesses from the level as it
// always has: a loud stretch is a chorus, a quiet one a break, each held for a
// few seconds so the lighting does not flicker between two moods.
//
// It only reads. The analyser is the engine's own tap; nothing is connected,
// and nothing about the sound changes.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
// the index of the last time in a sorted list at or before t (-1 if none)
function last(list, t) {
  let lo = 0, hi = list.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

export class BeatFollower {
  constructor() {
    this.kick = 0;
    this.energy = 0.3;
    this.beat = 0;
    this.bar = 0;
    this.sec = 'verse';
    this.secT = 0;
    this.peak = 0.15;       // the loudest the track has run, decaying slowly
    this.avgLow = 0;
    this.fast = 0;
    this.sinceKick = 1;
    this.bins = null;
    // from the map (null without one)
    this.role = null;      // the section's name
    this.secProg = null;   // 0..1 through the section
    this.secBar = null;    // whole bars since the section began
    this.next = null;      // the next section's `sec`, and the seconds to it
    this.toNext = null;
    this.final = false;    // the last chorus
    this.kickAt = -1;
    this.part = 'verse';
    this.phase = 0;
    this.bpm = 120;         // the map's tempo, or the one the kicks keep
    this.period = 0.5;      // seconds a beat, live
  }

  update(dt, { level = 0, analyser = null, playing = false, map = null, time = NaN }) {
    this.sinceKick += dt;
    this.secT += dt;
    if (playing && map && map.sections?.length && Number.isFinite(time)) { this.follow(dt, map, time); return; }
    this.role = this.secProg = this.secBar = this.next = this.toNext = null;
    this.final = false;
    this.phase += dt / this.period;
    if (!playing) {
      this.kick *= Math.exp(-dt * 6);
      this.energy += (0.3 - this.energy) * Math.min(1, dt);
      this.hold('verse');
      this.part = this.sec;
      return;
    }
    // onsets: the low band against its own recent average when the spectrum is
    // there; otherwise the level against a quicker average of itself
    let onset = false;
    if (analyser) {
      if (!this.bins || this.bins.length !== analyser.frequencyBinCount) this.bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.bins);
      const hz = analyser.context.sampleRate / analyser.fftSize;
      const top = Math.max(2, Math.floor(140 / hz));
      let low = 0;
      for (let i = 1; i < top; i++) low += this.bins[i] / 255;
      low /= top - 1;
      onset = low > this.avgLow * 1.18 + 0.03;
      this.avgLow += (low - this.avgLow) * Math.min(1, dt * 3);
    } else {
      onset = level > this.fast + 0.06;
      this.fast += (level - this.fast) * Math.min(1, dt * 4);
    }
    if (onset && this.sinceKick > 0.22) {
      // the tempo the kicks keep: an interval near the beat (or two of them)
      // pulls the period toward it, and the phase is drawn onto the beat
      const iv = this.sinceKick, p = this.period;
      const m = iv > p * 1.5 ? iv / 2 : iv;
      if (m > 0.3 && m < 0.9 && Math.abs(m - p) < p * 0.25) this.period += (m - p) * 0.15;
      else if (m > 0.3 && m < 0.9) this.period += (m - p) * 0.03;
      this.bpm = 60 / this.period;
      this.phase += (Math.round(this.phase) - this.phase) * 0.5;
      this.kick = 1;
      this.sinceKick = 0;
      this.beat++;
      if (this.beat % 4 === 0) this.bar++;
    } else {
      this.kick *= Math.exp(-dt * 7);
    }
    // energy against the track's own range, so a quiet recording still gets a
    // chorus when it opens up
    this.peak = Math.max(level, this.peak * Math.exp(-dt / 40));
    const norm = clamp(level / Math.max(0.05, this.peak));
    this.energy += (norm - this.energy) * Math.min(1, dt * 0.8);
    const e = this.energy;
    this.hold(e > 0.78 ? 'chorus' : e > 0.6 ? 'pre' : e > 0.3 ? 'verse' : 'break');
    this.part = this.sec;
  }

  // the map's account of where the song is
  follow(dt, map, time) {
    const { beats, downbeats, kicks, energy, sections } = map;
    // the kick: a mapped kick just passed. A jump (a seek) fires nothing.
    const k = last(kicks, time);
    if (k !== this.kickAt) {
      if (k === this.kickAt + 1 && time - kicks[k] < 0.12) { this.kick = 1; this.sinceKick = 0; }
      this.kickAt = k;
    }
    if (this.sinceKick > 0) this.kick *= Math.exp(-dt * 7);
    const b = last(beats, time);
    this.beat = Math.max(0, b);
    // the phase from the tracked beats themselves, so a seek lands in time
    const p0 = beats[Math.max(0, b)], p1 = beats[Math.max(0, b) + 1];
    const per = p1 != null ? p1 - p0 : (map.bpm ? 60 / map.bpm : 0.5);
    if (!beats.length) this.phase += dt / this.period;
    else this.phase = b < 0 ? (time - beats[0]) / per : b + clamp((time - p0) / Math.max(0.05, per));
    if (map.bpm) { this.bpm = map.bpm; this.period = 60 / map.bpm; }
    const bar = last(downbeats, time);
    this.bar = Math.max(0, bar);
    // energy against the song's own range, held up off the floor as the live
    // guess was, and eased so a beat's change does not jump
    const e = 0.25 + 0.75 * (energy[Math.max(0, b)] ?? 0.5);
    this.energy += (e - this.energy) * Math.min(1, dt * 2.5);
    let i = sections.findIndex((q) => time < q.end);
    if (i < 0) i = sections.length - 1;
    const s = sections[i], n = sections[i + 1];
    this.sec = s.light;
    this.role = s.role;
    this.part = s.role || s.light;
    this.secT = Math.max(0, time - s.start);
    this.secProg = clamp(this.secT / Math.max(0.1, s.end - s.start));
    this.secBar = Math.max(0, bar - last(downbeats, s.start + 0.05));
    this.next = n ? n.light : null;
    this.toNext = n ? n.start - time : null;
    this.final = !!s.final;
  }

  // a section is kept for at least six seconds
  hold(next) {
    if (next === this.sec || this.secT < 6) return;
    this.sec = next;
    this.secT = 0;
  }
}
