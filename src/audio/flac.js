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

export async function audioBufferToFlac(buffer, { compression = 5, bitDepth = 16 } = {}) {
  const Flac = await getFlac();

  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  // Preserve the source's bit depth: 16-bit in → 16-bit out, 24-bit in → 24-bit
  // out. libFLAC supports both; anything else is normalized upstream.
  const bitsPerSample = bitDepth === 24 ? 24 : 16;
  const posMax = (1 << (bitsPerSample - 1)) - 1; // 0x7fff / 0x7fffff
  const negMax = 1 << (bitsPerSample - 1);       // 0x8000 / 0x800000

  // libFLAC wants signed-int samples in a 32-bit-wide array. Interleave the
  // float channels and clamp/scale to the chosen bit depth.
  const interleaved = new Int32Array(numFrames * numCh);
  const channels = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));

  let i = 0;
  for (let f = 0; f < numFrames; f++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, channels[ch][f]));
      s = s < 0 ? s * negMax : s * posMax;
      interleaved[i++] = s | 0;
    }
  }

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

  try {
    const ok = Flac.FLAC__stream_encoder_process_interleaved(encoder, interleaved, numFrames);
    if (!ok) throw new Error('FLAC encoding failed');
    Flac.FLAC__stream_encoder_finish(encoder);
  } finally {
    Flac.FLAC__stream_encoder_delete(encoder);
  }

  return new Blob(parts, { type: 'audio/flac' });
}
