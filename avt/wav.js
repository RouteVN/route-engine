// Canonical PCM16 WAV encoding for the audio output tests, shared by the
// browser runner and the Node harness. References store the rendered audio
// in this form, and every measurement reads it back from the same bytes, so
// a reference's JSON is a pure function of its WAV.

const HEADER_BYTES = 44;

const writeText = (view, offset, value) => {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const toPcm16 = (sample) => {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0
    ? Math.round(clamped * 32768)
    : Math.round(clamped * 32767);
};

// Interleaved little-endian 16-bit PCM with a 44-byte RIFF header.
export const encodePcm16Wav = (channels, sampleRate) => {
  const channelCount = channels.length;
  const frameCount = channels[0].length;
  const bytesPerFrame = channelCount * 2;
  const dataSize = frameCount * bytesPerFrame;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
  const view = new DataView(buffer);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      view.setInt16(offset, toPcm16(channels[channel][frame]), true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
};

// The samples of a WAV from encodePcm16Wav, one Float32Array per channel.
export const decodePcm16Wav = (wav) => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const channelCount = view.getUint16(22, true);
  const frameCount = (wav.byteLength - HEADER_BYTES) / (channelCount * 2);
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frameCount),
  );
  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channelCount; channel++) {
      channels[channel][frame] = view.getInt16(offset, true) / 32768;
      offset += 2;
    }
  }
  return { channels, sampleRate: view.getUint32(24, true) };
};

// Peak, RMS, and count of non-zero samples over every channel.
export const summarizeSignal = (wav) => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleCount = (wav.byteLength - HEADER_BYTES) / 2;
  let peak = 0;
  let squareSum = 0;
  let nonZeroSamples = 0;
  for (let offset = HEADER_BYTES; offset < wav.byteLength; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    squareSum += sample * sample;
    if (sample !== 0) nonZeroSamples += 1;
  }
  return {
    peak,
    rms: Math.sqrt(squareSum / sampleCount),
    nonZeroSamples,
  };
};
