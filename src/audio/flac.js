// flac.js — encode an AudioBuffer to a 16-bit FLAC Blob.
// Used by the EXPORT FLAC button after rendering via OfflineAudioContext.
//
// Browsers can't encode FLAC natively, so we lazily pull in libflacjs (a WASM/
// asm.js port of libFLAC) only when the user actually exports. We use the
// self-contained asm.js build to avoid having to resolve a separate .wasm asset
// through Vite at runtime.

let _flacPromise = null;

// Load + initialize the libFLAC module once, then reuse it across exports.
async function getFlac() {
  if (!_flacPromise) {
    _flacPromise = import('libflacjs/dist/libflac.js').then((mod) => {
      const Flac = mod.default || mod;
      if (Flac.isReady()) return Flac;
      return new Promise((resolve) => {
        Flac.on('ready', () => resolve(Flac));
      });
    });
  }
  return _flacPromise;
}

// Frames handed to libFLAC per call. The encode runs in CHUNKS rather than in
// one call, for two reasons that have nothing to do with the progress bar it
// also makes possible:
//
//   · The single call was blocking. A five-minute track is tens of seconds of
//     synchronous WASM on the main thread, during which the page does not paint,
//     the transport does not respond, and — because this runs while the music is
//     still playing — the audio thread is sharing a core with it.
//   · The interleaved copy was allocated whole. At 4 bytes per sample that is
//     230 MB for five minutes of 24/96 stereo, on top of the AudioBuffer it was
//     copied from. A chunk is 1 MB and is reused.
const CHUNK_FRAMES = 1 << 17; // ~3 s at 44.1 kHz

// Give the browser a turn. setTimeout rather than a microtask: a resolved
// promise would let this loop starve rendering just as thoroughly as the single
// call did, because microtasks run before the next paint rather than after it.
const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0));

export async function audioBufferToFlac(buffer, { compression = 5, bitDepth = 16, onProgress } = {}) {
  const Flac = await getFlac();
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  // Preserve the source's bit depth: 16-bit in → 16-bit out, 24-bit in → 24-bit
  // out. libFLAC supports both; anything else is normalized upstream.
  const bitsPerSample = bitDepth === 24 ? 24 : 16;
  const posMax = (1 << (bitsPerSample - 1)) - 1; // 0x7fff / 0x7fffff
  const negMax = 1 << (bitsPerSample - 1);       // 0x8000 / 0x800000

  const channels = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));

  const encoder = Flac.create_libflac_encoder(
    sampleRate, numCh, bitsPerSample, compression, numFrames, /* verify */ false,
  );
  if (encoder === 0) throw new Error('failed to create FLAC encoder');

  const parts = [];
  const onWrite = (data) => {
    // copy: libFLAC reuses its internal heap buffer between callbacks
    parts.push(new Uint8Array(data));
  };

  const initStatus = Flac.init_encoder_stream(encoder, onWrite);
  if (initStatus !== 0) {
    Flac.FLAC__stream_encoder_delete(encoder);
    throw new Error('failed to init FLAC encoder (status ' + initStatus + ')');
  }

  // libFLAC wants signed-int samples in a 32-bit-wide array. Interleave the
  // float channels and clamp/scale to the chosen bit depth, a chunk at a time.
  const chunk = new Int32Array(Math.min(CHUNK_FRAMES, numFrames) * numCh);

  try {
    for (let start = 0; start < numFrames; start += CHUNK_FRAMES) {
      const n = Math.min(CHUNK_FRAMES, numFrames - start);
      let i = 0;
      for (let f = start; f < start + n; f++) {
        for (let ch = 0; ch < numCh; ch++) {
          let s = Math.max(-1, Math.min(1, channels[ch][f]));
          s = s < 0 ? s * negMax : s * posMax;
          chunk[i++] = s | 0;
        }
      }
      // The last chunk is short, and libFLAC reads `n` frames from the front of
      // the array, so the stale tail from the previous chunk is never seen.
      const ok = Flac.FLAC__stream_encoder_process_interleaved(encoder, chunk, n);
      if (!ok) throw new Error('FLAC encoding failed');
      report(Math.min(1, (start + n) / numFrames));
      await yieldToBrowser();
    }
    Flac.FLAC__stream_encoder_finish(encoder);
  } finally {
    Flac.FLAC__stream_encoder_delete(encoder);
  }

  report(1);
  return new Blob(parts, { type: 'audio/flac' });
}
