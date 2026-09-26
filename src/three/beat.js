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
//   sec     which section the rig should be playing: a loud stretch is a
//           chorus, a quiet one a break, and a section is held for a few
//           seconds so the lighting does not flicker between two moods
//
// It only reads. The analyser is the engine's own tap; nothing is connected,
// and nothing about the sound changes.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

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
  }

  update(dt, { level = 0, analyser = null, playing = false }) {
    this.sinceKick += dt;
    this.secT += dt;
    if (!playing) {
      this.kick *= Math.exp(-dt * 6);
      this.energy += (0.3 - this.energy) * Math.min(1, dt);
      this.hold('verse');
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
  }

  // a section is kept for at least six seconds
  hold(next) {
    if (next === this.sec || this.secT < 6) return;
    this.sec = next;
    this.secT = 0;
  }
}
