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
import { listeningDistance, roomAbsorption, DIRECTIVITY } from './venuerooms.js';
import { reverbTimes } from './roomacoustics.js';

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
  const lf125 = reverbTimes(roomAbsorption(venueId))[0];
  // Only a venue with a deployed sub array has anything to steer.
  const subControl = d > 0.5 ? Math.min(10, 3 + 1.3 * lf125) : 0;
  return {
    lf: -subControl,
    mud: -2.5,
    hf: -(4.5 + 3 * d),
  };
}

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

// Build the whole chain on any context. `worklets` says which AudioWorklet
// modules successfully loaded; anything missing is simply skipped, and its
// contribution was additive, so the chain stays correct without it.
export function buildGraph(ctx, { venue, volume = 1, wetDb = 0, worklets = {} }) {
  const n = {};

  n.trim = ctx.createGain();
  n.trim.gain.value = dbToGain(INPUT_TRIM_DB);

  // A real rig reproduces almost nothing below the sub array's tuning, and the
  // system processor high-passes the feed to protect drivers. 25 Hz rather than
  // 30: in-ears do reproduce that octave, and both an orchestra and a stadium
  // sub array genuinely have content there.
  n.subCut = ctx.createBiquadFilter();
  n.subCut.type = 'highpass';
  n.subCut.frequency.value = 25;
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
  // anchor — comes together here, and BOTH the listener and the room hear it.
  n.mixOut = ctx.createGain();
  n.direct.connect(n.mixOut);

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

  n.dry = ctx.createGain();
  n.msMerge.connect(n.dry);

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
    n.progTap = ctx.createGain();
    n.anchor = new AudioWorkletNode(ctx, 'vocal-anchor', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
    });
    n.anchorReturn = ctx.createGain();
    n.direct.connect(n.vocalMono);
    n.vocalMono.connect(n.vocalBand);
    n.vocalBand.connect(n.anchor, 0, 0);
    n.direct.connect(n.progTap);
    n.progTap.connect(n.anchor, 0, 1);
    n.anchor.connect(n.anchorReturn);
    n.anchorReturn.connect(n.mixOut); // mono, up-mixed to the centre
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
  n.sendVocalDip.gain.value = -3.5;

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

  applyVenue(ctx, n, venue, { fadeIn: 0, fadeOut: 0 });
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

// Apply a venue to an already-built graph.
//
// Everything a venue decides is a parameter: the response, the air absorption
// over the listening distance, how much of each band reaches the room, the bus
// compression and the saturation. None of it needs new nodes, and building new
// ones was costing an audible gap on every change — the source had to be
// detached and reattached, the reverberation tail was cut dead, and the graph
// left behind was only partly disconnected, so its worklets went on running.
export function applyVenue(ctx, n, venue, { fadeIn = VENUE_FADE_IN, fadeOut = VENUE_FADE_OUT } = {}) {
  const t = ctx.currentTime;

  // A change arriving before the previous one has finished blending is queued,
  // not applied on top. There are two slots, so the one a second change would
  // need is the one still fading out — and replacing a convolver's buffer while
  // it is audible resets its state and cuts its tail mid-ring. Interleaving two
  // fades also made the gain curves restart from zero rather than from where
  // they had got to, which measured as an 8 dB dip. Waiting is both simpler and
  // what the listener wants: the last venue asked for is the one they get.
  if (n.fadeUntil && t < n.fadeUntil) {
    n.pendingVenue = venue;
    return;
  }
  n.pendingVenue = null;
  const ramp = (param, value) => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + fadeIn);
  };

  const air = airTiltFor(venue.id);
  ramp(n.air4k.gain, air.hf4k);
  ramp(n.air10k.gain, air.hf10k - air.hf4k);

  const send = reverbSendTilt(venue.id);
  ramp(n.sendLF.gain, send.lf);
  ramp(n.sendMud.gain, send.mud);
  ramp(n.sendHF.gain, send.hf);

  const pa = venue.pa || {};
  if (n.glue) ramp(n.glue.parameters.get('amount'), pa.glue ?? 0);

  n.sat.curve = makeSatCurve(pa.drive ?? 0);

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

  // Free the room that was left, once it has finished ringing out.
  n.fadeUntil = t + fadeOut;
  n.releaseIdle = setTimeout(() => {
    n.releaseIdle = null;
    n.fadeUntil = 0;
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
  if (n.releaseIdle) clearTimeout(n.releaseIdle);
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
export const WET_OFFSET_DB = 2.5;

export function wetTrimDb(percent, venueDefault) {
  const delta = (percent - venueDefault) / 100;
  return Math.max(-40, WET_OFFSET_DB + delta * 24);
}
