// graph.js — the processing chain, built once and used by both live playback and
// offline export.
//
// It previously existed twice: constructed node by node in the engine, and again
// by hand in renderOffline. The two had already drifted (the export applied a
// different default pre-delay, and baked the playback volume knob into the
// rendered file), which is the failure mode that arrangement guarantees. An
// export that does not match what was heard is worse than no export.
//
//   source ─► trim ─► subCut ─► in ─┬─► air ─► transients ─► crossfeed ─► dry ──┐
//                                   │              └─► vocal anchor ─────┘      │
//                                   │                  vocal brightness ─┘      │
//                                   └─► convolver (4-ch, true stereo) ─► wet ───┤
//                                                                               │
//   mix ◄──────────────────────────────────────────────────────────────────────┘
//   mix ─► loudness ─► glue ─► saturation ─► out ─► volume ─► limiter ─► destination
//                                                      └─► analyser
//
// Two structural points worth stating, because both are departures:
//
//   THERE IS NO PRE-DELAY NODE. The impulse response now carries the venue's
//   real initial time delay gap, from the geometry of the seat. The old
//   saturating pre-delay curve existed to stop a bulk delay from detaching the
//   reverb from the transient that caused it, a problem created entirely by
//   delaying the whole reverb by one number.
//
//   LOUDNESS COMPENSATION SITS AFTER THE ROOM, NOT BEFORE IT. It corrects for
//   listening at 75 dB to something mixed to be heard at 100, which is a fact
//   about the listener, not about the venue. Feeding a low-boosted signal into
//   the room, as the old chain did, drove the reverb's low end with energy the
//   room would never have received.

import { buildImpulseResponse, venueSeed } from './impulse.js';
import { SIDE_SHELF } from './binaural.js';
import {
  listeningDistance, roomAbsorption, DIRECTIVITY, DIRECTIVITY_Q,
  SYSTEM_LF_HZ, ROOM_RETURN_DB, VENUE_WET_DB, RIG_LOW_LIFT, RIG_POWER,
} from './venuerooms.js';
import { reverbTimes, reverberantRatio, midRT } from './roomacoustics.js';
import { liveApplies } from './live.js';

// Headroom taken off the front so the boosts downstream have somewhere to go.
// Without it the chain ran a limiter at −3 dBFS with 20:1 into a signal already
// lifted by 15 dB, which made the limiter the loudest tone control in the chain.
export const INPUT_TRIM_DB = -9;

// ── Listener-side loudness compensation ─────────────────────────────────────
//
// A concert runs at 100–105 dB SPL and headphones at perhaps 75. Equal-loudness
// contours are not parallel, so the same signal heard 25 dB quieter loses low
// end and, less severely, extreme top — which is the real reason concert
// playback at home sounds thin, and the real thing the old +15 dB low-end stack
// was reaching for.
//
// The difference is that this is shaped like the contours: one gentle,
// MONOTONIC shelf and a sub extension, instead of a shelf plus two resonant
// peaks. The old stack put its largest boost at 110 Hz — which is where boxiness
// lives, and where the bass guitar and the kick were already fighting — and
// tapered off below. The result here has slightly MORE energy at 45 Hz and
// about 9 dB less at 110 Hz: deeper and firmer rather than bigger and thicker.
const LOUDNESS = {
  shelfHz: 90,
  shelfDb: 11,
  shelfQ: 0.5,
  subHz: 45,
  subDb: 3,
  subQ: 0.7,
};

// Air absorption in dB per 100 m at 20 °C / 50 % RH, at 4 kHz and 10 kHz.
const AIR_4K = 3.4;
const AIR_10K = 12.0;
// A system tuned at the mix position compensates for air absorption, but only
// so far: holding 10 kHz flat across a stadium would need headroom no rig has
// and would cook the drivers. This is the share that survives compensation.
const AIR_RESIDUAL = 0.4;

// One sung syllable. Three to four a second is the ordinary rate for a sung
// line, so this is how long the room has to get out of the way before the next
// word arrives — see the vocal term in reverbSendTilt.
const SYLLABLE_SEC = 0.3;

// Above this directivity the building has a large-format line array in it, and
// below it the source is a cluster, a small rig or a stage full of people.
//
// The three large venues run 0.88–0.90 and everything else 0.18–0.55, so the
// split is not a threshold chosen to cut a continuum — it is the gap between two
// kinds of equipment. It matters because pattern control down into the low mids
// takes an array several metres tall; a proscenium cluster under a metre
// controls nothing below about 2 kHz, and an orchestra controls nothing at all.
const ARRAY_DIRECTIVITY = 0.55;

// ── How much of each band actually reaches the room ─────────────────────────
//
// HIGH FREQUENCY. Every real source is more directional as frequency rises, so
// the reverberant field receives proportionally less top than the direct sound.
// A human voice runs about 6 dB more directional at 4 kHz than at 250 Hz, and a
// line array far more. Modelling a source as equally loud in all directions at
// all frequencies put the whole presence band into the reverb, on top of the
// consonants that carry a lyric.
//
// LOW FREQUENCY. Large rigs use cardioid or end-fire subwoofer arrays, and how
// much control gets deployed depends on how badly the building rings — that is
// the entire reason the technique exists. Scaling this by directivity alone was
// wrong: directivity barely differs between the three large venues, so Tokyo
// Dome, whose 125 Hz reverberation runs past six seconds, was getting the same
// 4.6 dB of sub control as an open stadium at 2.7 s. It boomed accordingly.
// Control now follows the room's own low-frequency decay, which is what a system
// engineer would deploy against, with a floor under it because any deployed sub
// array is steered to some degree.
//
// The shelf sits at 160 Hz, which is above where a sub array usually hands over
// to the mains. It was at 100 Hz, and that was most of why the first attempt at
// this barely worked: the 125 Hz octave runs from 88 to 177 Hz, so the boom lay
// mostly ABOVE the corner and went almost untouched — raising the cut by 1.3 dB
// moved the measured low-end room by 0.2 dB. Placing it where these rooms
// actually ring is worth 2 to 3 dB in every large venue.
//
// LOW MID. A gentle dip where every instrument's body overlaps — bass, guitar,
// piano, the chest of a voice. Reverberation through that region is what fuses a
// mix into one wash, so removing a little of it from the SEND is the cheapest
// separation available, and it costs the direct sound nothing: the weight and
// the impact are carried by the dry path, which is untouched.
//
// This last one is a mix decision rather than a property of a building, and is
// the one place here that departs from letting the room simply do what rooms do.
// It is also what every live engineer reaches for first.
export function reverbSendTilt(venueId) {
  const d = DIRECTIVITY[venueId] ?? 0;
  const rts = reverbTimes(roomAbsorption(venueId));
  const lf125 = rts[0];

  // How little low end reaches the room, and why, differs by venue — but it is
  // never nothing. A venue with a rig steers its sub array; a venue without one
  // is driven by instruments that radiate very little below 60 Hz, so an
  // orchestra excites a hall's low end far less than a modern master would.
  //
  // Acoustic venues previously got no control at all, on the reasoning that
  // there is no array to steer. That left the concert hall — 2.6 s at 125 Hz and
  // warm by design — taking the full sub content of a pop master straight into
  // the one band it rings longest in, and it boomed.
  // Scaled with how much the venue's reverberant field was RAISED, as well as
  // with its low-frequency decay. The rooms whose reverberation went up the most
  // are the two that boomed first, and a sub cut fixed against the old level
  // hands the boom straight back: the dome's 125 Hz band rings for six seconds,
  // so every decibel added to its reverberant return is a decibel of boom.
  //
  // Both sources of lift count, and getting that wrong is measurable. Tracking
  // only the wet trim missed the larger of the two — the rig power behind the
  // late field — and the low-frequency room came up four and a half decibels in
  // every large venue while the control moved by one.
  const lift = 10 * Math.log10(RIG_POWER[venueId] ?? 1)
    + Math.max(0, (VENUE_WET_DB[venueId] ?? WET_OFFSET_DB) - WET_OFFSET_DB);
  const subControl = d > 0.5
    ? Math.min(16, 3 + 1.3 * lf125 + 0.9 * lift)
    : Math.min(6, 1.5 + 0.8 * lf125 + 0.9 * lift);

  // Ducking the voice out of the reverberation is what an engineer does when the
  // wash threatens the words. How much depends on how much wash there is, and
  // this was a flat figure regardless — so the arena, dome and stadium, whose
  // reverberation already sits 7 dB below the direct sound at the mix position,
  // were having a vocal ducked out of a room that was barely there.
  const rev = reverberantRatio({
    ...roomAbsorption(venueId),
    distance: listeningDistance(venueId),
    Q: DIRECTIVITY_Q[venueId] ?? 2,
  });

  // The low-mid dip that buys instrument separation costs body, and what it buys
  // depends on how much reverberation there is to untangle. A hall's reverberant
  // field is level with its direct sound and genuinely does fuse a mix into one
  // wash; the big rooms' sits below it, so the same cut there was mostly just
  // removing the body of the instruments from a room that was already thin. It
  // scales with the reverberant ratio instead of being a flat 2.5 dB.
  const mud = -(1.3 + 1.6 * Math.min(1, rev));

  // ── How much of the last syllable is still in the room ─────────────────────
  //
  // Reverberation costs you a lyric in two ways and the vocal dip tracked only
  // one of them. LEVEL is what `rev` measures: how loud the room is against the
  // direct sound. TIME is the other, and it is the one that actually fills the
  // gaps between words — a reverberant field sitting 7 dB down still smears
  // every syllable into the next if it rings for three and a half seconds.
  //
  // Tracking level alone put the dip BACKWARDS across the three large rooms.
  // The dome has the longest mid-band reverberation of any venue here at 3.63 s
  // and, because a directional rig at the mix position keeps the direct sound
  // well ahead, the lowest reverberant ratio of the three. So it received the
  // smallest vocal dip of any large venue — −1.46 dB against the stadium's
  // −1.48 at 2.15 s. The room that smears a lyric worst was the one being left
  // alone, and it is the one that sounded it.
  //
  // Sung syllables land three or four to the second, so what matters is how much
  // of the tail survives that long. At 60 dB per reverberation time a tail is
  // down 60·τ/RT60 after τ seconds: 24 dB in the club, 5 in the dome. That ratio
  // is the term, and it is a property of the room rather than a per-venue knob.
  const carry = Math.pow(10, -(60 * SYLLABLE_SEC) / Math.max(midRT(rts), 0.05) / 20);

  return {
    lf: -subControl,
    mud,
    hf: -(4.5 + 3 * d),
    // WHERE the high shelf starts is a property of the source, not a constant.
    //
    // The shelf exists because every real source is more directional as
    // frequency rises, so the reverberant field receives less top than the
    // direct sound does. How far down that begins depends on how big the source
    // is: a large array controls its pattern from a few hundred hertz upward,
    // while an orchestra is close to omnidirectional until much higher.
    //
    // Fixing it at 2 kHz split the difference and served neither. It left a
    // control gap between roughly 400 Hz and 1.5 kHz — the low shelf has
    // finished by 400, the mud bell is spent by 800, and the high shelf had not
    // started — which is exactly where instrument body and vocal first formants
    // sit, and where a big room reads as congested. Measured against how long
    // each octave rings, the arena's worst-controlled bands were 500 Hz and
    // 1 kHz, both at more than twice the club's figure.
    //
    // But it only moves where there is an array to justify it — see
    // ARRAY_DIRECTIVITY. Scaling it linearly with directivity was the obvious
    // thing and it was wrong: the theatre sits in the middle of the range at
    // 0.55, so a fix aimed at the arena dragged the theatre's corner down to
    // 1.7 kHz with it and took 0.8 dB out of what that hall returns at 2 kHz.
    // That band carries a belted vocal's power and the brilliance of strings and
    // brass, and losing it from the room is heard immediately as the hall
    // sounding smaller. Club, theatre and concert hall stay at 2 kHz exactly;
    // the arena, dome and stadium come down to about 1.4 kHz.
    hfHz: 2000 - 1700 * Math.max(0, d - ARRAY_DIRECTIVITY),
    vocal: -(1 + 2.5 * Math.min(1, rev) + 0.45 * carry),
  };
}

// The venue's low-frequency system, as a shelf on the DIRECT path — see
// RIG_LOW_LIFT.
export const rigLowLift = (venueId) => RIG_LOW_LIFT[venueId] ?? 0;

// Where the venue's low end stops — see SYSTEM_LF_HZ.
export const systemLowCut = (venueId) => SYSTEM_LF_HZ[venueId] ?? 30;

export function airTiltFor(venueId) {
  const d = listeningDistance(venueId);
  return {
    hf4k: -(AIR_4K * d) / 100 * AIR_RESIDUAL,
    hf10k: -(AIR_10K * d) / 100 * AIR_RESIDUAL,
  };
}

// tanh soft saturation. Normalised by 1/k rather than tanh(k) so quiet material
// passes through bit-identical and only peaks are compressed — the saturator can
// never push the limiter harder than the clean signal would. k ≈ 0 is the exact
// identity line.
const SAT_HEADROOM = 6;
export function makeSatCurve(k) {
  const drive = k >= 0.05 ? k : 0;
  const n = 4097; // odd, so there is an exact zero-crossing sample
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = ((i / (n - 1)) * 2 - 1) * SAT_HEADROOM;
    curve[i] = drive ? Math.tanh(drive * s) / drive : s;
  }
  return curve;
}

const dbToGain = (db) => Math.pow(10, db / 20);

// Transient emphasis bands. Each is a parallel send: the band is extracted, the
// worklet returns only the attack increment, and that is summed back. The main
// path is never filtered, so with no transient present the result is identical
// to the send not existing.
//
// Leaning on these is the safe way to add definition to a kit. They raise the
// ATTACK and not the sustain, so a kick gets more front without getting longer —
// which is the opposite of what a low-end EQ boost does, and the reason weight
// and impact can both go up while booming goes down.
const TRANSIENT_BANDS = [
  // The kick's chest thump. Low enough to sit under the bass guitar's body
  // rather than on top of it.
  { name: 'kickThump', type: 'bandpass', frequency: 70, Q: 1.2, amount: 1.5, gain: 1.0 },
  // The snare's body — the wooden thwack, distinct from its crack.
  { name: 'snareBody', type: 'bandpass', frequency: 220, Q: 1.2, amount: 1.3, gain: 0.9 },
  // Kick beater click and snare crack together. On in-ears this band does most
  // of the work: there is no chest to feel a kick with, so the attack has to be
  // heard rather than felt.
  { name: 'attack', type: 'bandpass', frequency: 4200, Q: 0.9, amount: 1.35, gain: 0.8 },
];

// ── FOH vocal brightness ────────────────────────────────────────────────────
//
// A voice heard over a big rig is brighter than the same voice on the record.
// The vocal mics a tour uses rise in the 4–6 kHz region to begin with, and the
// engineer adds more on top so the words stay above the band and the crowd. A
// record goes the other way: it is smoothed for hours of listening at home.
// Nothing here put that back, and the air absorption over the listening
// distance takes a little more off the top.
//
// It is a parallel send, like the transient bands: the centre's band around
// 4 kHz is extracted and ADDED back, so at zero it contributes exactly nothing
// and the chain is the chain it was. A bandpass rather than a shelf, because
// its phase is zero at the centre and stays within ±90° either side, so the sum
// never dips anywhere — and it tapers above 8 kHz, where sibilance lives.
// Measured as the sum: +0.5 dB at 1 kHz, +2.0–2.5 across 3–6 kHz, +1.4 at 8 kHz,
// +0.9 at 10 kHz.
//
// Only the centre is touched, so the guitars, keys and crowd spread either side
// are not brightened with it; whatever else sits in the middle — a hi-hat, a
// snare — is. It is part of the chain in every venue, chosen by ear.
const VOCAL_BRIGHT = { frequency: 4000, Q: 0.6, db: 2.5 };

// The send gain that puts the centre VOCAL_BRIGHT.db up at the band's peak,
// where the bandpass passes at unity and in phase.
const VOCAL_BRIGHT_GAIN = dbToGain(VOCAL_BRIGHT.db) - 1;

// A singing voice's range, for live mode: half power at about 315 Hz and
// 3.2 kHz — the body and the words; the brightness carries on above it.
const VOICE_BAND = { frequency: 1000, Q: 0.35 };

// The crowd lift's two bands. It READS the crowd in a single bandpass, half
// power at about 420 Hz and 5.4 kHz — the roar and the screams, not the hiss —
// which is the band its thresholds were measured in. It LIFTS a wider, flat
// band: lifting through the bandpass made the crowd honk, its middle 6 dB up on
// its own edges at the gains a live recording needs.
const CROWD_BAND = { frequency: 1500, Q: 0.3 };
const CROWD_LIFT_BAND = { low: 250, high: 8000 };

// ── Live mode ───────────────────────────────────────────────────────────────
//
// What changes in the big rooms when the track is a live recording — see
// live.js for when that is, and crowd-lift-processor.js for the crowd.
//
// The chain was run on a synthetic live mix — a centred voice, kick and bass,
// wide instruments, and an uncorrelated crowd that swells into a chant — with
// each stage taken out in turn, reading the crowd and the wide instruments
// against the centre, A-weighted. The ADDED ROOM is what buries the audience:
// taking it out brought the chanting crowd up 3.3 dB in the arena and 1.2–1.4
// in the dome and stadium. Everything else that looked like a suspect — the
// crossfeed, the rig's low end, the loudness compensation, the bus compression,
// the vocal anchor, even over a long chant — moved it by 0.2 dB or less, and is
// left alone.
//
// The room is not the thing to cut, though. That was tried, and by ear it left
// the big rooms small and flat: a live recording holds far less of its room
// than a seat in the building gives. So the room stays and the crowd is brought
// up over it, which takes a strong lift. On the Tokyo Dome recordings, in the
// dome, the room's side in the crowd band sits roughly 10 dB or more over the
// recording's own under a verse: tripling the recording's side moved the
// total side there by only 1.4 dB.
//
//   wetDb  — a trim on the venue's room: −1.4 dB, about 85 % of it, by ear —
//            the full room was a touch much over a recording that brings some
//            of its own;
//   bandDb, voiceDb — the band brought back under the singer, by ear: with the
//            room no longer washing over it, the whole backing stood out. The
//            mix bus comes down by bandDb and the centre's voice band — see
//            VOICE_BAND — goes up by as much, so the voice stays where it was,
//            room and all, and the kick, the bass, the synths, their room and
//            the crowd come down together. Trimming only the side was tried
//            first and did next to nothing here: in a big room the side of
//            what reaches the ears is mostly the room and the crowd.
//   crowd  — the crowd lift's send, steady: the crowd's side returned to each
//            ear four and a half times over. It is what the lift used to give
//            under the band, before it stopped riding up for cheers.
//
// The lift takes the side's noise, not its notes, and under the band only the
// audience's own top end — see crowd-lift-processor.js. Measured: a recorded
// vocal doubled either side comes through it unmoved, and the wide instruments
// stay where they were (−0.4 to +0.5 dB on the synthetic mix). On the Tokyo
// Dome recordings, in the dome, what it adds under a verse or chorus is within
// 3 dB of a cheer's own spectrum above 4 kHz, where it had run 7–12 dB brighter
// with the band's cymbals in it, and the output's L/R correlation is +0.14
// against the source's +0.44.
const LIVE = { wetDb: -1.4, bandDb: -1.5, voiceDb: 1.5, crowd: 4.5 };

// What the live-dependent parameters are for this venue, live mode on or off.
// Off, or outside the big rooms, it is exactly what the venue had before.
export function liveProfile(venue, on) {
  return liveApplies(venue.id, on) ? LIVE : { wetDb: 0, bandDb: 0, voiceDb: 0, crowd: 0 };
}

// Build the whole chain on any context. `worklets` says which AudioWorklet
// modules successfully loaded; anything missing is simply skipped, and its
// contribution was additive, so the chain stays correct without it.
//
// `deferResponse` builds everything except the room: the convolver slots are
// left empty for a later applyVenue to fill, which is how the engine avoids
// synthesising a response on the main thread when a worker can do it instead.
// The first applyVenue on such a graph simply brings the room up, since there
// is nothing to cross-fade from.
export function buildGraph(ctx, { venue, volume = 1, wetDb = 0, worklets = {}, deferResponse = false, live = false }) {
  const n = {};
  n.live = live;

  n.trim = ctx.createGain();
  n.trim.gain.value = dbToGain(INPUT_TRIM_DB);

  // A real rig reproduces almost nothing below its own tuning, and the system
  // processor high-passes the feed to protect drivers. Per venue: see
  // SYSTEM_LF_HZ for why a club and a stadium cannot stop in the same place.
  n.subCut = ctx.createBiquadFilter();
  n.subCut.type = 'highpass';
  n.subCut.frequency.value = systemLowCut(venue.id);
  n.subCut.Q.value = 0.7;

  n.in = ctx.createGain();
  n.trim.connect(n.subCut);
  n.subCut.connect(n.in);

  // ── direct path ───────────────────────────────────────────────────────────
  const air = airTiltFor(venue.id);
  n.air4k = ctx.createBiquadFilter();
  n.air4k.type = 'highshelf';
  n.air4k.frequency.value = 4000;
  n.air4k.gain.value = air.hf4k;
  n.air10k = ctx.createBiquadFilter();
  n.air10k.type = 'highshelf';
  n.air10k.frequency.value = 10000;
  n.air10k.gain.value = air.hf10k - air.hf4k;
  n.in.connect(n.air4k);
  n.air4k.connect(n.air10k);

  // transient emphasis sends
  n.direct = ctx.createGain();
  n.air10k.connect(n.direct);
  n.transients = [];
  if (worklets.transient) {
    for (const band of TRANSIENT_BANDS) {
      const bp = ctx.createBiquadFilter();
      bp.type = band.type;
      bp.frequency.value = band.frequency;
      bp.Q.value = band.Q;
      const node = new AudioWorkletNode(ctx, 'transient', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      node.parameters.get('amount').value = band.amount;
      const g = ctx.createGain();
      g.gain.value = band.gain;
      n.air10k.connect(bp);
      bp.connect(node);
      node.connect(g);
      g.connect(n.direct);
      n.transients.push({ name: band.name, bp, node, gain: g });
    }
  }

  // Everything the FOH engineer decided — the transient emphasis, the vocal
  // anchor, the vocal brightness — comes together here, and BOTH the listener
  // and the room hear it.
  //
  // The brightness is taken from what the other decisions made (mixIn) and
  // added after them (mixOut). It cannot tap and return to the same node: Web
  // Audio silences a cycle that has no delay in it.
  n.mixIn = ctx.createGain();
  n.mixOut = ctx.createGain();
  n.direct.connect(n.mixIn);
  n.mixIn.connect(n.mixOut);

  // ── vocal brightness — see VOCAL_BRIGHT ───────────────────────────────────
  n.brightMono = ctx.createGain();
  n.brightMono.channelCount = 1;
  n.brightMono.channelCountMode = 'explicit';
  n.brightMono.channelInterpretation = 'speakers';
  n.brightBand = ctx.createBiquadFilter();
  n.brightBand.type = 'bandpass';
  n.brightBand.frequency.value = VOCAL_BRIGHT.frequency;
  n.brightBand.Q.value = VOCAL_BRIGHT.Q;
  n.bright = ctx.createGain();
  n.bright.gain.value = VOCAL_BRIGHT_GAIN;
  n.mixIn.connect(n.brightMono);
  n.brightMono.connect(n.brightBand);
  n.brightBand.connect(n.bright);
  n.bright.connect(n.mixOut); // mono, up-mixed to the centre

  // ── the voice band, for live mode — see LIVE.voiceDb ──────────────────────
  // The same construction as the brightness, wider and lower: the centre's
  // voice range taken out and added back, nothing added while it is at zero,
  // which it is except in live mode. Before the send, so the room hears it too.
  n.voiceBand = ctx.createBiquadFilter();
  n.voiceBand.type = 'bandpass';
  n.voiceBand.frequency.value = VOICE_BAND.frequency;
  n.voiceBand.Q.value = VOICE_BAND.Q;
  n.voice = ctx.createGain();
  n.voice.gain.value = 0;
  n.brightMono.connect(n.voiceBand);
  n.voiceBand.connect(n.voice);
  n.voice.connect(n.mixOut);

  // ── crowd lift — see crowd-lift-processor.js ──────────────────────────────
  // Taken from the input, ahead of the air absorption: the audience is around
  // the listener, not 60 m away on the stage. Read from the side, where an
  // audience lives and the centre's voice, kick and bass do not; split there
  // into noise, which is the audience, and notes, which are the AR, the
  // harmonies and the wide instruments and stay where they are; and returned
  // to each ear through its own diffuser, so it comes back as uncorrelated as
  // the audience it was taken from.
  //
  // It joins at the mix bus, AFTER the room (see below), not with the FOH
  // decisions that the room hears. The recorded audience already carries the
  // room it was recorded in, and sending the lift into a second one was
  // measured to waste it: in the dome the lifted side went mostly into the
  // reverberation and came back as centre, and a send gain of 3 raised the side
  // under a verse by half a decibel.
  if (worklets.crowdLift) {
    n.crowdSplit = ctx.createChannelSplitter(2);
    const mono = (g) => { const node = ctx.createGain(); node.gain.value = g; return node; };
    const filter = (type, frequency, Q) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = Q;
      return f;
    };
    n.crowdSideL = mono(0.5); n.crowdSideR = mono(-0.5); n.crowdSide = mono(1);
    n.crowdMidL = mono(0.5); n.crowdMidR = mono(0.5); n.crowdMid = mono(1);
    // What is lifted: the crowd's whole range, flat — see CROWD_LIFT_BAND.
    n.crowdLiftHP = filter('highpass', CROWD_LIFT_BAND.low, 0.707);
    n.crowdLiftLP = filter('lowpass', CROWD_LIFT_BAND.high, 0.707);
    // What is read to decide how much: the band the thresholds were measured in.
    n.crowdSideBand = filter('bandpass', CROWD_BAND.frequency, CROWD_BAND.Q);
    n.crowdMidBand = filter('bandpass', CROWD_BAND.frequency, CROWD_BAND.Q);
    n.crowdLift = new AudioWorkletNode(ctx, 'crowd-lift', {
      numberOfInputs: 3, numberOfOutputs: 1, outputChannelCount: [2],
    });
    n.in.connect(n.crowdSplit);
    n.crowdSplit.connect(n.crowdSideL, 0); n.crowdSplit.connect(n.crowdSideR, 1);
    n.crowdSplit.connect(n.crowdMidL, 0); n.crowdSplit.connect(n.crowdMidR, 1);
    n.crowdSideL.connect(n.crowdSide); n.crowdSideR.connect(n.crowdSide);
    n.crowdMidL.connect(n.crowdMid); n.crowdMidR.connect(n.crowdMid);
    n.crowdSide.connect(n.crowdLiftHP);
    n.crowdLiftHP.connect(n.crowdLiftLP);
    n.crowdLiftLP.connect(n.crowdLift, 0, 0);
    n.crowdSide.connect(n.crowdSideBand);
    n.crowdSideBand.connect(n.crowdLift, 0, 1);
    n.crowdMid.connect(n.crowdMidBand);
    n.crowdMidBand.connect(n.crowdLift, 0, 2);
  }

  // ── crossfeed, as a shelf on the side signal ──────────────────────────────
  // Below ~700 Hz a head is small next to a wavelength and casts almost no
  // shadow, so real ears receive essentially no level difference there. Hard
  // panned low end is a cue no physical source could produce, and it is what
  // pins an image inside the skull on in-ears. Expressed on the side signal of a
  // mid/side split, the centre — vocal, kick, snare, bass — is untouched and the
  // mono sum is bit-identical.
  n.msSplit = ctx.createChannelSplitter(2);
  n.msMerge = ctx.createChannelMerger(2);
  n.midL = ctx.createGain(); n.midL.gain.value = 0.5;
  n.midR = ctx.createGain(); n.midR.gain.value = 0.5;
  n.mid = ctx.createGain();
  n.sideL = ctx.createGain(); n.sideL.gain.value = 0.5;
  n.sideR = ctx.createGain(); n.sideR.gain.value = -0.5;
  n.side = ctx.createGain();
  n.sideShelf = ctx.createBiquadFilter();
  n.sideShelf.type = 'lowshelf';
  n.sideShelf.frequency.value = SIDE_SHELF.frequency;
  n.sideShelf.gain.value = SIDE_SHELF.gain;
  n.sideShelf.Q.value = SIDE_SHELF.q;
  n.sideNeg = ctx.createGain(); n.sideNeg.gain.value = -1;

  n.mixOut.connect(n.msSplit);
  n.msSplit.connect(n.midL, 0); n.msSplit.connect(n.midR, 1);
  n.midL.connect(n.mid); n.midR.connect(n.mid);
  n.msSplit.connect(n.sideL, 0); n.msSplit.connect(n.sideR, 1);
  n.sideL.connect(n.side); n.sideR.connect(n.side);
  n.side.connect(n.sideShelf);
  n.sideShelf.connect(n.sideNeg);
  // L = M + S', R = M − S'
  n.mid.connect(n.msMerge, 0, 0); n.sideShelf.connect(n.msMerge, 0, 0);
  n.mid.connect(n.msMerge, 0, 1); n.sideNeg.connect(n.msMerge, 0, 1);

  // How much low-frequency system this venue has, above where it stops — see
  // RIG_LOW_LIFT. It sits on the DRY branch, after the send has already been
  // tapped off the mix, so a stadium's sub array is heard as weight and none of
  // it is fed to the room. Weight up, booming untouched: the same reasoning as
  // the transient shapers, which raise a kick's attack without lengthening it.
  n.rigLow = ctx.createBiquadFilter();
  n.rigLow.type = 'lowshelf';
  n.rigLow.frequency.value = 70;
  n.rigLow.gain.value = rigLowLift(venue.id);
  n.rigLow.Q.value = 0.7;

  n.dry = ctx.createGain();
  n.msMerge.connect(n.rigLow);
  n.rigLow.connect(n.dry);

  // ── vocal anchor ──────────────────────────────────────────────────────────
  // Reads the centre's presence band against the whole programme and returns
  // presence to the centre. It joins the mix BEFORE the room, not after — see
  // the reverberant path below.
  if (worklets.vocalAnchor) {
    n.vocalMono = ctx.createGain();
    n.vocalMono.channelCount = 1;
    n.vocalMono.channelCountMode = 'explicit';
    n.vocalMono.channelInterpretation = 'speakers';
    n.vocalBand = ctx.createBiquadFilter();
    n.vocalBand.type = 'bandpass';
    n.vocalBand.frequency.value = 2600;
    n.vocalBand.Q.value = 0.8;
    // The programme reference stays STEREO. It was a mono downmix, which
    // averages the two channels — so wide-panned material partially cancels and
    // barely registers. That made the anchor least sensitive to exactly the
    // arrangement it exists for: a chorus where the layers spread outward is
    // where the vocal gets buried, and it was the one the reference could not
    // see. The worklet takes the louder channel instead.
    // The programme level the anchor compares the voice against is weighted for
    // MASKING rather than measured flat.
    //
    // Masking is not symmetric: a loud low band raises the threshold well above
    // itself, while a loud top band barely touches what is below it. Measured
    // flat, a heavy sub and a bright hi-hat counted the same, so the anchor did
    // not react to the one case where a vocal actually disappears — a loud low
    // end. Weighting the reference toward the frequencies that do the masking
    // makes a bass-heavy passage read as a busier programme, which is what it is
    // as far as the voice is concerned.
    n.maskLow = ctx.createBiquadFilter();
    n.maskLow.type = 'lowshelf';
    n.maskLow.frequency.value = 300;
    n.maskLow.gain.value = 7;
    n.maskHigh = ctx.createBiquadFilter();
    n.maskHigh.type = 'highshelf';
    n.maskHigh.frequency.value = 5000;
    n.maskHigh.gain.value = -6;
    n.progTap = ctx.createGain();
    n.anchor = new AudioWorkletNode(ctx, 'vocal-anchor', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
    });
    n.anchorReturn = ctx.createGain();
    n.direct.connect(n.vocalMono);
    n.vocalMono.connect(n.vocalBand);
    n.vocalBand.connect(n.anchor, 0, 0);
    n.direct.connect(n.maskLow);
    n.maskLow.connect(n.maskHigh);
    n.maskHigh.connect(n.progTap);
    n.progTap.connect(n.anchor, 0, 1);
    n.anchor.connect(n.anchorReturn);
    n.anchorReturn.connect(n.mixIn); // mono, up-mixed to the centre
  }

  // ── reverberant path ──────────────────────────────────────────────────────
  // Fed from the finished mix, not from the raw input.
  //
  // The send used to come off the input bus, so the room never heard any of the
  // mix decisions: the emphasised drum attacks and the anchored vocal existed
  // only in the direct sound and had no reverberation on them at all, while
  // everything around them did. That is audible as the vocal sitting in a
  // different space from the band — worst in the club, where the room is short
  // and tight enough for the two to be told apart. A real venue hears whatever
  // the engineer sends it.
  n.sendLF = ctx.createBiquadFilter();
  n.sendLF.type = 'lowshelf';
  n.sendLF.frequency.value = 160;
  n.sendMud = ctx.createBiquadFilter();
  n.sendMud.type = 'peaking';
  n.sendMud.frequency.value = 320;
  n.sendMud.Q.value = 0.8;      // roughly 180–560 Hz
  n.sendHF = ctx.createBiquadFilter();
  n.sendHF.type = 'highshelf';
  // Corner and gain are both per venue — see reverbSendTilt. applyVenue sets
  // them below, the same way it sets the other two send filters' gains.
  n.sendHF.frequency.value = 2000;

  // ── Less room on the voice, without a drier room ──────────────────────────
  //
  // The lead sits in the centre and the band spreads around it, so cutting the
  // vocal range out of the MID of the send takes reverberation off the voice
  // while the guitars, keys and cymbals either side keep theirs. Dipping the
  // send as a whole would have worked too, and would have dried out the room
  // along with the singer.
  //
  // This is a mix decision rather than a property of the building — a room
  // reverberates everything it is given. It is the one every live engineer
  // makes: a lead vocal gets noticeably less reverb than the band, because at
  // concert level the wash is what costs you the words.
  n.sendSplit = ctx.createChannelSplitter(2);
  n.sendMerge = ctx.createChannelMerger(2);
  n.sendMidL = ctx.createGain(); n.sendMidL.gain.value = 0.5;
  n.sendMidR = ctx.createGain(); n.sendMidR.gain.value = 0.5;
  n.sendMid = ctx.createGain();
  n.sendSideL = ctx.createGain(); n.sendSideL.gain.value = 0.5;
  n.sendSideR = ctx.createGain(); n.sendSideR.gain.value = -0.5;
  n.sendSide = ctx.createGain();
  n.sendSideNeg = ctx.createGain(); n.sendSideNeg.gain.value = -1;
  n.sendVocalDip = ctx.createBiquadFilter();
  n.sendVocalDip.type = 'peaking';
  n.sendVocalDip.frequency.value = 1400;
  n.sendVocalDip.Q.value = 0.7;     // roughly 700 Hz – 2.8 kHz
  // set per venue in applyVenue

  n.mixOut.connect(n.sendSplit);
  n.sendSplit.connect(n.sendMidL, 0); n.sendSplit.connect(n.sendMidR, 1);
  n.sendMidL.connect(n.sendMid); n.sendMidR.connect(n.sendMid);
  n.sendSplit.connect(n.sendSideL, 0); n.sendSplit.connect(n.sendSideR, 1);
  n.sendSideL.connect(n.sendSide); n.sendSideR.connect(n.sendSide);
  n.sendSide.connect(n.sendSideNeg);
  n.sendMid.connect(n.sendVocalDip);
  // L = M + S, R = M − S
  n.sendVocalDip.connect(n.sendMerge, 0, 0); n.sendSide.connect(n.sendMerge, 0, 0);
  n.sendVocalDip.connect(n.sendMerge, 0, 1); n.sendSideNeg.connect(n.sendMerge, 0, 1);

  // TWO convolver slots, crossfaded. Changing venue swaps which one is live
  // rather than replacing the node, so the room being left rings out while the
  // new one comes up. Replacing it cut the tail dead mid-note, which is a large
  // part of what made switching venues sound like a dropout.
  //
  // The idle slot is disconnected and emptied once a crossfade finishes, so only
  // one convolution is ever running.
  n.convA = ctx.createConvolver();
  n.convA.normalize = false; // levels in the response are already physical
  n.convB = ctx.createConvolver();
  n.convB.normalize = false;
  n.convGainA = ctx.createGain();
  n.convGainB = ctx.createGain();
  n.convGainA.gain.value = 0;
  n.convGainB.gain.value = 0;
  n.active = null; // no slot loaded until a venue is applied
  n.wet = ctx.createGain();
  n.wet.gain.value = dbToGain(wetDb);
  n.sendMerge.connect(n.sendLF);
  n.sendLF.connect(n.sendMud);
  n.sendMud.connect(n.sendHF);
  n.convA.connect(n.convGainA);
  n.convB.connect(n.convGainB);
  n.convGainA.connect(n.wet);
  n.convGainB.connect(n.wet);

  // ── mix bus ───────────────────────────────────────────────────────────────
  n.mix = ctx.createGain();
  n.dry.connect(n.mix);
  if (n.crowdLift) n.crowdLift.connect(n.mix);
  // The room arrives as the response made it: decorrelated, not widened — see
  // ROOM_RETURN_DB for why the side boost that stood here came out.
  n.wet.connect(n.mix);

  n.loudShelf = ctx.createBiquadFilter();
  n.loudShelf.type = 'lowshelf';
  n.loudShelf.frequency.value = LOUDNESS.shelfHz;
  n.loudShelf.gain.value = LOUDNESS.shelfDb;
  n.loudShelf.Q.value = LOUDNESS.shelfQ;
  n.loudSub = ctx.createBiquadFilter();
  n.loudSub.type = 'lowshelf';
  n.loudSub.frequency.value = LOUDNESS.subHz;
  n.loudSub.gain.value = LOUDNESS.subDb;
  n.loudSub.Q.value = LOUDNESS.subQ;
  n.mix.connect(n.loudShelf);
  n.loudShelf.connect(n.loudSub);

  // Bus compression as a single serial stage whose depth is one ramped
  // parameter — see glue-processor.js. It replaced both a DynamicsCompressor
  // (which cost the hall 2.8 dB of vocal-band clarity even set to do nothing)
  // and the parallel bypass that was tried instead of it (whose latency
  // mismatch comb-filtered the two paths together on every venue change).
  n.satIn = ctx.createGain();
  n.satIn.gain.value = 1 / SAT_HEADROOM;
  n.sat = ctx.createWaveShaper();
  n.sat.oversample = '4x';
  if (worklets.glue) {
    n.glue = new AudioWorkletNode(ctx, 'glue', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    });
    n.loudSub.connect(n.glue);
    n.glue.connect(n.satIn);
  } else {
    // No worklet, no glue. Going without a light bus compressor is a far smaller
    // loss than the node it would have to fall back to.
    n.loudSub.connect(n.satIn);
  }
  n.satIn.connect(n.sat);

  // Put back most of the headroom taken at the input, less what the loudness
  // shelf added. Deliberately short of unity: the point of the input trim is
  // that the limiter goes back to being a safety net instead of the loudest
  // tone control in the chain, and handing the gain straight back would undo it.
  n.out = ctx.createGain();
  n.out.gain.value = dbToGain(-INPUT_TRIM_DB - LOUDNESS.shelfDb * 0.72);
  n.sat.connect(n.out);

  n.volume = ctx.createGain();
  n.volume.gain.value = volume;
  n.out.connect(n.volume);

  // Look-ahead peak limiter — see limiter-processor.js for why the
  // DynamicsCompressor it replaces could not do this job. Where the worklet is
  // unavailable, fall back to the old node rather than to no protection at all.
  if (worklets.limiter) {
    n.limiter = new AudioWorkletNode(ctx, 'limiter', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    });
    n.limiter.parameters.get('threshold').value = -1.5;
  } else {
    n.limiter = ctx.createDynamicsCompressor();
    n.limiter.threshold.value = -2;
    n.limiter.knee.value = 0;
    n.limiter.ratio.value = 20;
    n.limiter.attack.value = 0.002;
    n.limiter.release.value = 0.15;
  }
  n.volume.connect(n.limiter);

  applyVenue(ctx, n, venue, { fadeIn: 0, fadeOut: 0, loadResponse: !deferResponse });
  return n;
}

// A venue change is blended ASYMMETRICALLY: the new room comes up quickly, the
// old one is left to ring out.
//
// A symmetric fade dips, and unavoidably so. A convolver that has just been
// given a response starts from silence and takes the length of that response to
// reach steady state — seconds, in the dome — so fading the old one out on the
// same schedule removes reverberation faster than the new one can supply it.
// Measured on a steady tone, the total signal dropped nearly 4 dB.
//
// Letting the outgoing room decay over more than a second fixes it, and is what
// the change should sound like anyway: not a switch, but one space giving way to
// another.
export const VENUE_FADE_IN = 0.25;
export const VENUE_FADE_OUT = 1.2;

// A linear ramp from wherever a parameter is now, starting at `t`.
const rampFor = (t, fade) => (param, value) => {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + fade);
};

function applyLiveParams(n, venue, ramp) {
  const p = liveProfile(venue, n.live);
  if (n.voice) ramp(n.voice.gain, dbToGain(p.voiceDb) - 1);
  if (n.mix) ramp(n.mix.gain, dbToGain(p.bandDb));
  if (n.crowdLift) ramp(n.crowdLift.parameters.get('amount'), p.crowd);
}

// Switch live mode on a built graph. Parameters only, ramped over the time a
// venue's parameters take to arrive, so it lands as a change of balance rather
// than a step.
// The wet level moves with it, and is the caller's: see wetTrimDb.
export function setLive(ctx, n, venue, on) {
  n.live = !!on;
  applyLiveParams(n, venue, rampFor(ctx.currentTime, VENUE_FADE_IN));
}

// Apply a venue to an already-built graph.
//
// Everything a venue decides is a parameter: the response, the air absorption
// over the listening distance, how much of each band reaches the room, the bus
// compression and the saturation. None of it needs new nodes, and building new
// ones was costing an audible gap on every change — the source had to be
// detached and reattached, the reverberation tail was cut dead, and the graph
// left behind was only partly disconnected, so its worklets went on running.
export function applyVenue(ctx, n, venue, { fadeIn = VENUE_FADE_IN, fadeOut = VENUE_FADE_OUT, loadResponse = true } = {}) {
  const t = ctx.currentTime;

  // A change arriving before the previous one has finished blending is queued,
  // not applied on top. There are two slots, so the one a second change would
  // need is the one still fading out — and replacing a convolver's buffer while
  // it is audible resets its state and cuts its tail mid-ring. Interleaving two
  // fades also made the gain curves restart from zero rather than from where
  // they had got to, which measured as an 8 dB dip. Waiting is both simpler and
  // what the listener wants: the last venue asked for is the one they get.
  //
  // The test is whether the previous fade's release has actually RUN, not
  // whether its deadline has passed. Those are not the same clock. The deadline
  // was ctx.currentTime, which advances in real time no matter what; the release
  // is a setTimeout, which does not. A main thread busy decoding the next track
  // — or a backgrounded tab, where timers are clamped — runs the release long
  // after the audio clock has sailed past the deadline, and gating on the
  // deadline let a second fade start while the first slot was still connected
  // and still holding its response. The late release then disconnected and
  // cleared whichever convolver had since become the live one, so the tail
  // either vanished or rang on underneath the new room's. It reproduced only
  // under load, because only under load do the two clocks separate. The release
  // handle IS the state, and it cannot skew.
  if (n.releaseIdle) {
    n.pendingVenue = venue;
    return;
  }
  n.pendingVenue = null;
  const ramp = rampFor(t, fadeIn);

  const air = airTiltFor(venue.id);
  ramp(n.air4k.gain, air.hf4k);
  ramp(n.air10k.gain, air.hf10k - air.hf4k);

  const send = reverbSendTilt(venue.id);
  ramp(n.sendLF.gain, send.lf);
  ramp(n.sendMud.gain, send.mud);
  ramp(n.sendVocalDip.gain, send.vocal);
  ramp(n.subCut.frequency, systemLowCut(venue.id));
  if (n.rigLow) ramp(n.rigLow.gain, rigLowLift(venue.id));
  ramp(n.sendHF.gain, send.hf);
  ramp(n.sendHF.frequency, send.hfHz);

  const pa = venue.pa || {};
  if (n.glue) ramp(n.glue.parameters.get('amount'), pa.glue ?? 0);

  n.sat.curve = makeSatCurve(pa.drive ?? 0);

  applyLiveParams(n, venue, ramp);

  // Everything but the room — see buildGraph's `deferResponse`.
  if (!loadResponse) return;

  // Load the idle convolver slot and blend across to it. On the first call
  // there is no slot in use yet, so it simply comes up.
  const from = n.active;
  const to = from === 'A' ? 'B' : 'A';
  const fromConv = from ? n[`conv${from}`] : null;
  const toConv = n[`conv${to}`];
  const fromGain = from ? n[`convGain${from}`].gain : null;
  const toGain = n[`convGain${to}`].gain;

  toConv.buffer = buildImpulseResponse(ctx, venue.id, venueSeed(venue.id));
  try { n.sendHF.connect(toConv); } catch (e) { /* already connected */ }
  n.active = to;

  if (fadeIn <= 0 || !fromConv) {
    if (fromGain) fromGain.value = 0;
    toGain.value = 1;
    if (fromConv) { try { n.sendHF.disconnect(fromConv); } catch (e) { /* noop */ } }
    return;
  }

  const steps = 64;
  const curve = (fn) => {
    const c = new Float32Array(steps);
    for (let i = 0; i < steps; i++) c[i] = fn((i / (steps - 1)) * (Math.PI / 2));
    return c;
  };
  toGain.cancelScheduledValues(t);
  toGain.setValueCurveAtTime(curve(Math.sin), t, fadeIn);
  fromGain.cancelScheduledValues(t);
  fromGain.setValueCurveAtTime(curve(Math.cos), t, fadeOut);

  // Free the room that was left, once it has finished ringing out. Until this
  // has run, the slot it frees is not available and the guard above holds the
  // next change back.
  n.releaseIdle = setTimeout(() => {
    n.releaseIdle = null;
    try { n.sendHF.disconnect(fromConv); } catch (e) { /* noop */ }
    fromConv.buffer = null;
    if (n.pendingVenue) {
      const queued = n.pendingVenue;
      n.pendingVenue = null;
      applyVenue(ctx, n, queued, { fadeIn, fadeOut });
    }
  }, (fadeOut + 0.05) * 1000);
}

// Disconnect every node, so nothing is left running. Only needed for the one
// legitimate rebuild — when the worklets finish loading — but a partly
// disconnected graph keeps its worklet processors alive, and one was leaked per
// venue change before venue changes stopped rebuilding anything.
export function disposeGraph(n) {
  if (n.releaseIdle) { clearTimeout(n.releaseIdle); n.releaseIdle = null; }
  n.pendingVenue = null;
  for (const value of Object.values(n)) {
    if (value && typeof value.disconnect === 'function') {
      try { value.disconnect(); } catch (e) { /* already gone */ }
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        for (const node of Object.values(entry || {})) {
          if (node && typeof node.disconnect === 'function') {
            try { node.disconnect(); } catch (e) { /* already gone */ }
          }
        }
      }
    }
  }
}

// The venue's physically correct reverberant level is what the impulse response
// already carries, so the slider is a trim around it rather than a mix control.
// Centre is the venue's own default; the ends are ±12 dB.
//
// The dry level never moves. A room does not turn its direct sound down when it
// has more reverberation — the ratio changes because the LISTENER moved, and the
// old equal-power crossfade modelled that backwards.
// A standing offset on top of the venue's physical level. The reverberation got
// quieter when the diffuse field stopped starting late and swelling for a
// quarter of a second: total reverberant energy is fixed, so a response that
// decays from its start puts more of it inside the first 80 ms and less into the
// tail you hear as the room. This puts the audible level back where it was.
//
// It is the fallback now rather than the figure: each venue states its own — see
// VENUE_WET_DB for why one number for six rooms could not work.
export const WET_OFFSET_DB = 2.5;

// `venue` is the whole venue object, not just its default percentage, because
// the offset the trim is applied AROUND is now per venue. Taking the default
// alone was what made `position.wet` look like a per-venue control while doing
// nothing at all: the trim is the DIFFERENCE between the slider and the centre,
// so moving the centre moves the trim by exactly minus itself.
//
// ROOM_RETURN_DB is the level the return used to gain from being widened, kept
// now that it is not; `live` moves the centre itself, in the big rooms — see
// liveProfile.
export function wetTrimDb(percent, venue, live = false) {
  const delta = (percent - venue.position.wet) / 100;
  return Math.max(-40, (VENUE_WET_DB[venue.id] ?? WET_OFFSET_DB) + (ROOM_RETURN_DB[venue.id] ?? 0)
    + liveProfile(venue, live).wetDb + delta * 24);
}
