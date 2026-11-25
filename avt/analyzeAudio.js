// Measures what a listener hears from rendered stereo PCM.
//
// Each test source is a mono sine tone with a known frequency and amplitude.
// Route Graphics plays a mono sound through a gain node and a stereo panner,
// so a sound with gain g and pan p comes out as
//
//   left  = amplitude * g * cos(x * PI / 2)
//   right = amplitude * g * sin(x * PI / 2)      where x = (p + 1) / 2
//
// (the Web Audio equal-power law for mono input). That makes both values
// recoverable without calibration: the volume is the stereo magnitude over
// the source amplitude, and the pan follows from the left/right angle. Every
// measurement is taken at one tone's frequency, so several tones that play
// at once are measured independently.

const TWO_PI = 2 * Math.PI;

const toFrameRange = (sampleRate, length, startMs, windowMs) => {
  const start = Math.round((startMs * sampleRate) / 1000);
  const end = Math.round(((startMs + windowMs) * sampleRate) / 1000);
  if (!(start >= 0 && end > start && end <= length)) {
    throw new Error(
      `Window ${startMs}ms + ${windowMs}ms is outside the rendered audio.`,
    );
  }
  return { start, end };
};

// Amplitude of one sinusoid in a Hann-windowed span of a channel.
export const measureToneAmplitude = (
  samples,
  sampleRate,
  { frequency, startMs, windowMs },
) => {
  const { start, end } = toFrameRange(
    sampleRate,
    samples.length,
    startMs,
    windowMs,
  );
  const count = end - start;
  const step = (TWO_PI * frequency) / sampleRate;
  let real = 0;
  let imaginary = 0;
  let weightSum = 0;
  for (let index = 0; index < count; index++) {
    const weight = 0.5 - 0.5 * Math.cos((TWO_PI * index) / (count - 1));
    const value = samples[start + index] * weight;
    const phase = step * (start + index);
    real += value * Math.cos(phase);
    imaginary -= value * Math.sin(phase);
    weightSum += weight;
  }
  return (2 * Math.hypot(real, imaginary)) / weightSum;
};

// Volume (0-100 of the source at full gain) and pan of one tone, plus each
// channel's amplitude (0-100 of the source amplitude) for graphs that the
// mono panning law does not describe, such as a panned channel of stereo
// sounds.
export const measureTone = (
  [left, right],
  sampleRate,
  { frequency, amplitude, startMs, windowMs },
) => {
  const window = { frequency, startMs, windowMs };
  const leftAmplitude = measureToneAmplitude(left, sampleRate, window);
  const rightAmplitude = measureToneAmplitude(right, sampleRate, window);
  const magnitude = Math.hypot(leftAmplitude, rightAmplitude);
  return {
    volume: (100 * magnitude) / amplitude,
    left: (100 * leftAmplitude) / amplitude,
    right: (100 * rightAmplitude) / amplitude,
    pan:
      magnitude === 0
        ? undefined
        : (4 / Math.PI) * Math.atan2(rightAmplitude, leftAmplitude) - 1,
  };
};

// Frequency of the only tone in a span, from interpolated rising zero
// crossings of the summed channels.
export const measureFrequency = (
  [left, right],
  sampleRate,
  { startMs, windowMs },
) => {
  const { start, end } = toFrameRange(
    sampleRate,
    left.length,
    startMs,
    windowMs,
  );
  let first;
  let last;
  let crossings = 0;
  let previous = left[start] + right[start];
  for (let index = start + 1; index < end; index++) {
    const current = left[index] + right[index];
    if (previous < 0 && current >= 0) {
      const time = index - 1 + previous / (previous - current);
      first ??= time;
      last = time;
      crossings += 1;
    }
    previous = current;
  }
  if (crossings < 2) return undefined;
  return ((crossings - 1) * sampleRate) / (last - first);
};

// Highest volume of one tone over a time range, in short overlapping windows.
export const measureMaxVolume = (
  channels,
  sampleRate,
  { frequency, amplitude, fromMs, toMs, windowMs = 20, stepMs = 5 },
) => {
  let max = 0;
  let atMs = fromMs;
  for (let startMs = fromMs; startMs + windowMs <= toMs; startMs += stepMs) {
    const { volume } = measureTone(channels, sampleRate, {
      frequency,
      amplitude,
      startMs,
      windowMs,
    });
    if (volume > max) {
      max = volume;
      atMs = startMs;
    }
  }
  return { volume: max, atMs };
};
