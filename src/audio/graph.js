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
import { listeningDistance } from './venuerooms.js';

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

export function airTiltFor(venueId) {
  const d = listeningDistance(venueId);
  return {
    hf4k: -(AIR_4K * d) / 100 * AIR_RESIDUAL,
    hf10k: -(AIR_10K * d) / 100 * AIR_RESIDUAL,
  };
}

// Live mix-bus compression. Kept far lighter than before: the source is already
// a finished master that has been through a mastering engineer's bus, and a
// second helping of 3:1 on top of that is what "congested" sounds like.
export function glueSettings(glue) {
  const g = Math.max(0, Math.min(1, glue));
  return {
    threshold: -12 - 6 * g,
    ratio: 1.2 + 0.8 * g,   // 1.2:1 … 2:1
    knee: 12,
    attack: 0.03,
    release: 0.25,
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
const TRANSIENT_BANDS = [
  // The kick's chest thump. Low enough to sit under the bass guitar's body
  // rather than on top of it.
  { name: 'kickThump', type: 'bandpass', frequency: 70, Q: 1.2, amount: 1.3, gain: 1.0 },
  // The snare's body — the wooden thwack, distinct from its crack.
  { name: 'snareBody', type: 'bandpass', frequency: 220, Q: 1.2, amount: 1.1, gain: 0.9 },
  // Kick beater click and snare crack together. On in-ears this band does most
  // of the work: there is no chest to feel a kick with, so the attack has to be
  // heard rather than felt.
  { name: 'attack', type: 'bandpass', frequency: 4200, Q: 0.9, amount: 1.2, gain: 0.8 },
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

  n.direct.connect(n.msSplit);
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
  // Feeds off the centre channel's presence band, referenced against the whole
  // programme, and returns presence to the centre.
  if (worklets.vocalAnchor) {
    n.vocalBand = ctx.createBiquadFilter();
    n.vocalBand.type = 'bandpass';
    n.vocalBand.frequency.value = 2600;
    n.vocalBand.Q.value = 0.8;
    n.progMono = ctx.createGain();
    n.progMono.channelCount = 1;
    n.progMono.channelCountMode = 'explicit';
    n.progMono.channelInterpretation = 'speakers';
    n.anchor = new AudioWorkletNode(ctx, 'vocal-anchor', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
    });
    n.anchorReturn = ctx.createGain();
    n.mid.connect(n.vocalBand);
    n.vocalBand.connect(n.anchor, 0, 0);
    n.direct.connect(n.progMono);
    n.progMono.connect(n.anchor, 0, 1);
    n.anchor.connect(n.anchorReturn);
    n.anchorReturn.connect(n.dry); // mono, up-mixed to the centre
  }

  // ── reverberant path ──────────────────────────────────────────────────────
  n.convolver = ctx.createConvolver();
  n.convolver.normalize = false; // levels in the response are already physical
  n.convolver.buffer = buildImpulseResponse(ctx, venue.id, venueSeed(venue.id));
  n.wet = ctx.createGain();
  n.wet.gain.value = dbToGain(wetDb);
  n.in.connect(n.convolver);
  n.convolver.connect(n.wet);

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

  const pa = venue.pa || {};
  n.glue = ctx.createDynamicsCompressor();
  const gs = glueSettings(pa.glue ?? 0.15);
  n.glue.threshold.value = gs.threshold;
  n.glue.ratio.value = gs.ratio;
  n.glue.knee.value = gs.knee;
  n.glue.attack.value = gs.attack;
  n.glue.release.value = gs.release;
  n.loudSub.connect(n.glue);

  n.satIn = ctx.createGain();
  n.satIn.gain.value = 1 / SAT_HEADROOM;
  n.sat = ctx.createWaveShaper();
  n.sat.oversample = '4x';
  n.sat.curve = makeSatCurve(pa.drive ?? 0);
  n.glue.connect(n.satIn);
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

  n.limiter = ctx.createDynamicsCompressor();
  n.limiter.threshold.value = -2;
  n.limiter.knee.value = 0;
  n.limiter.ratio.value = 20;
  n.limiter.attack.value = 0.002;
  n.limiter.release.value = 0.15;
  n.volume.connect(n.limiter);

  return n;
}

// The venue's physically correct reverberant level is what the impulse response
// already carries, so the slider is a trim around it rather than a mix control.
// Centre is the venue's own default; the ends are ±12 dB.
//
// The dry level never moves. A room does not turn its direct sound down when it
// has more reverberation — the ratio changes because the LISTENER moved, and the
// old equal-power crossfade modelled that backwards.
export function wetTrimDb(percent, venueDefault) {
  const delta = (percent - venueDefault) / 100;
  return Math.max(-40, delta * 24);
}
