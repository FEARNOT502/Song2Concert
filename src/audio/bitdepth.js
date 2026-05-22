// bitdepth.js — read a lossless file's original PCM format from its header.
//
// Web Audio decodes everything to a 32-bit float AudioBuffer at the context's
// sample rate, erasing both the source bit depth AND (when decoding into a
// fixed-rate context) the source sample rate. To export 16-bit/44.1k sources as
// 16-bit/44.1k and 24-bit/96k sources as 24-bit/96k, we parse the container
// header ourselves. Compressed formats (MP3/OGG/…) carry no meaningful PCM bit
// depth, so we return null and the caller falls back to sensible defaults.

// FLAC STREAMINFO: sample rate is a 20-bit field, bits-per-sample is 5 bits.
// Both are bit-packed across the body bytes following the metadata header.
function flacInfo(view) {
  if (view.getUint32(0) !== 0x664c6143) return null; // "fLaC"
  const blockType = view.getUint8(4) & 0x7f;
  if (blockType !== 0) return null; // STREAMINFO is always first per spec
  // STREAMINFO body starts at byte 8.
  //   sample rate : 20 bits → body bytes 10,11 + top 4 bits of byte 12
  //   bits/sample :  5 bits → low bit of byte 12 (after the 3 channel bits) +
  //                  top 4 bits of byte 13... actually: bit 36..40 of the body.
  const b10 = view.getUint8(8 + 10);
  const b11 = view.getUint8(8 + 11);
  const b12 = view.getUint8(8 + 12);
  const b13 = view.getUint8(8 + 13);
  const sampleRate = (b10 << 12) | (b11 << 4) | (b12 >> 4);
  const bitDepth = (((b12 & 0x01) << 4) | (b13 >> 4)) + 1;
  return { sampleRate, bitDepth };
}

// WAV (RIFF): walk chunks to find "fmt ", read nSamplesPerSec + wBitsPerSample.
function wavInfo(view) {
  if (view.getUint32(0) !== 0x52494646) return null; // "RIFF"
  if (view.getUint32(8) !== 0x57415645) return null; // "WAVE"
  let off = 12;
  const len = view.byteLength;
  while (off + 8 <= len) {
    const id = view.getUint32(off);
    const size = view.getUint32(off + 4, true);
    if (id === 0x666d7420) { // "fmt "
      const sampleRate = view.getUint32(off + 8 + 4, true); // nSamplesPerSec
      const bitDepth = view.getUint16(off + 8 + 14, true);  // wBitsPerSample
      return { sampleRate, bitDepth };
    }
    off += 8 + size + (size & 1); // chunks are word-aligned
  }
  return null;
}

// AIFF "COMM": sampleSize (16-bit) + sampleRate as an 80-bit IEEE 754 extended
// (long double). We decode the extended float to a plain number.
function readExtended80(view, off) {
  const sign = view.getUint8(off) & 0x80 ? -1 : 1;
  const exponent = ((view.getUint8(off) & 0x7f) << 8) | view.getUint8(off + 1);
  const hi = view.getUint32(off + 2);
  const lo = view.getUint32(off + 6);
  if (exponent === 0 && hi === 0 && lo === 0) return 0;
  // mantissa is an explicit 64-bit integer; bias for extended is 16383.
  const mantissa = hi * 0x100000000 + lo;
  return sign * mantissa * Math.pow(2, exponent - 16383 - 63);
}

function aiffInfo(view) {
  if (view.getUint32(0) !== 0x464f524d) return null; // "FORM"
  const form = view.getUint32(8);
  if (form !== 0x41494646 && form !== 0x41494643) return null; // "AIFF"/"AIFC"
  let off = 12;
  const len = view.byteLength;
  while (off + 8 <= len) {
    const id = view.getUint32(off);
    const size = view.getUint32(off + 4); // big-endian
    if (id === 0x434f4d4d) { // "COMM"
      const bitDepth = view.getUint16(off + 8 + 6);          // sampleSize
      const sampleRate = Math.round(readExtended80(view, off + 8 + 8));
      return { sampleRate, bitDepth };
    }
    off += 8 + size + (size & 1);
  }
  return null;
}

// Returns { bitDepth, sampleRate } where bitDepth is 16 or 24 (clamped to what
// our FLAC encoder supports), or null if the format carries no PCM info.
// Reading only the first ~64KB is plenty for the header chunks we care about.
export function readAudioFormat(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 16) return null;
    const magic = view.getUint32(0);
    let info = null;
    if (magic === 0x664c6143) info = flacInfo(view);          // "fLaC"
    else if (magic === 0x52494646) info = wavInfo(view);      // "RIFF"
    else if (magic === 0x464f524d) info = aiffInfo(view);     // "FORM"
    if (!info || !info.bitDepth) return null;
    // FLAC encoding supports 16 and 24; map anything else to the nearest useful
    // depth (e.g. 20-bit → 24, 8-bit → 16, 32-bit → 24).
    const bitDepth = info.bitDepth <= 16 ? 16 : 24;
    const sampleRate = info.sampleRate > 0 ? info.sampleRate : null;
    return { bitDepth, sampleRate };
  } catch {
    return null;
  }
}
