import { describe, expect, it } from "vitest";
import {
  measureFrequency,
  measureMaxVolume,
  measureTone,
} from "../avt/analyzeAudio.js";
import { decodePcm16Wav, encodePcm16Wav, summarizeSignal } from "../avt/wav.js";

// The audio output tests are only as good as these measurements, so they are
// checked here against synthetic signals with known volume, pan, and pitch.

const SAMPLE_RATE = 48000;
const AMPLITUDE = 0.5;

const render = (durationMs, sources) => {
  const length = Math.round((durationMs * SAMPLE_RATE) / 1000);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (const { frequency, volume, pan = 0, gainAt } of sources) {
    const x = (pan + 1) / 2;
    const leftGain = Math.cos((x * Math.PI) / 2);
    const rightGain = Math.sin((x * Math.PI) / 2);
    for (let index = 0; index < length; index++) {
      const time = index / SAMPLE_RATE;
      const gain = (gainAt ? gainAt(time * 1000) : volume) / 100;
      const sample =
        AMPLITUDE * gain * Math.sin(2 * Math.PI * frequency * time);
      left[index] += sample * leftGain;
      right[index] += sample * rightGain;
    }
  }
  return [left, right];
};

describe("audio output analysis", () => {
  it.each([
    [75, 0],
    [24, -0.5],
    [100, 1],
    [6.75, 0.25],
    [37.5, -1],
  ])("measures volume %s at pan %s", (volume, pan) => {
    const channels = render(200, [{ frequency: 400, volume, pan }]);
    const measured = measureTone(channels, SAMPLE_RATE, {
      frequency: 400,
      amplitude: AMPLITUDE,
      startMs: 50,
      windowMs: 100,
    });

    expect(measured.volume).toBeCloseTo(volume, 2);
    expect(measured.pan).toBeCloseTo(pan, 3);
  });

  it("measures each channel's amplitude", () => {
    const channels = render(200, [{ frequency: 400, volume: 40, pan: 0.5 }]);
    const measured = measureTone(channels, SAMPLE_RATE, {
      frequency: 400,
      amplitude: AMPLITUDE,
      startMs: 50,
      windowMs: 100,
    });

    // Pan 0.5 sends cos(67.5°) of the gain left and sin(67.5°) right.
    expect(measured.left).toBeCloseTo(40 * Math.cos((3 * Math.PI) / 8), 2);
    expect(measured.right).toBeCloseTo(40 * Math.sin((3 * Math.PI) / 8), 2);
  });

  it("measures each of several tones that play at once", () => {
    const channels = render(200, [
      { frequency: 400, volume: 60, pan: -0.25 },
      { frequency: 600, volume: 15, pan: 0.5 },
      { frequency: 900, volume: 0 },
    ]);
    const measure = (frequency) =>
      measureTone(channels, SAMPLE_RATE, {
        frequency,
        amplitude: AMPLITUDE,
        startMs: 50,
        windowMs: 100,
      });

    expect(measure(400).volume).toBeCloseTo(60, 1);
    expect(measure(400).pan).toBeCloseTo(-0.25, 2);
    expect(measure(600).volume).toBeCloseTo(15, 1);
    expect(measure(600).pan).toBeCloseTo(0.5, 2);
    expect(measure(900).volume).toBeLessThan(0.1);
  });

  it("measures the midpoint of a linear fade", () => {
    const channels = render(1000, [
      { frequency: 400, gainAt: (ms) => (75 * ms) / 1000 },
    ]);

    expect(
      measureTone(channels, SAMPLE_RATE, {
        frequency: 400,
        amplitude: AMPLITUDE,
        startMs: 450,
        windowMs: 100,
      }).volume,
    ).toBeCloseTo(37.5, 1);
  });

  it("finds a brief overshoot as the maximum volume", () => {
    const channels = render(1000, [
      {
        frequency: 400,
        gainAt: (ms) => (ms >= 300 && ms < 400 ? 100 : 75),
      },
    ]);
    const max = measureMaxVolume(channels, SAMPLE_RATE, {
      frequency: 400,
      amplitude: AMPLITUDE,
      fromMs: 0,
      toMs: 1000,
    });

    expect(max.volume).toBeCloseTo(100, 0);
    expect(max.atMs).toBeGreaterThanOrEqual(300);
    expect(max.atMs).toBeLessThan(400);
  });

  it.each([400, 500, 312.5])("measures a frequency of %s Hz", (frequency) => {
    const channels = render(200, [{ frequency, volume: 40, pan: 0.3 }]);

    expect(
      measureFrequency(channels, SAMPLE_RATE, { startMs: 0, windowMs: 200 }),
    ).toBeCloseTo(frequency, 1);
  });

  it("rejects a window outside the rendered audio", () => {
    const channels = render(100, [{ frequency: 400, volume: 50 }]);

    expect(() =>
      measureTone(channels, SAMPLE_RATE, {
        frequency: 400,
        amplitude: AMPLITUDE,
        startMs: 50,
        windowMs: 100,
      }),
    ).toThrow("outside the rendered audio");
  });
});

describe("audio output references", () => {
  const readText = (wav, offset, length) =>
    String.fromCharCode(...wav.subarray(offset, offset + length));

  it("writes a canonical 16-bit PCM WAV header", () => {
    const wav = encodePcm16Wav(
      [new Float32Array(10), new Float32Array(10)],
      SAMPLE_RATE,
    );
    const view = new DataView(wav.buffer);

    expect(wav.byteLength).toBe(44 + 10 * 2 * 2);
    expect(readText(wav, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(readText(wav, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(SAMPLE_RATE * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readText(wav, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10 * 2 * 2);
  });

  it("interleaves channels and clamps samples to full scale", () => {
    const wav = encodePcm16Wav(
      [Float32Array.of(1, -1, 2), Float32Array.of(0.5, -2, 0)],
      SAMPLE_RATE,
    );
    const view = new DataView(wav.buffer);
    const samples = Array.from({ length: 6 }, (_, index) =>
      view.getInt16(44 + index * 2, true),
    );

    expect(samples).toEqual([32767, 16384, -32768, -32768, 32767, 0]);
  });

  it("reads back the samples it wrote within 16-bit precision", () => {
    const [left, right] = render(100, [
      { frequency: 400, volume: 75, pan: -0.25 },
    ]);
    const { channels, sampleRate } = decodePcm16Wav(
      encodePcm16Wav([left, right], SAMPLE_RATE),
    );

    expect(sampleRate).toBe(SAMPLE_RATE);
    expect(channels[0].length).toBe(left.length);
    for (let index = 0; index < left.length; index++) {
      expect(Math.abs(channels[0][index] - left[index])).toBeLessThan(1e-4);
      expect(Math.abs(channels[1][index] - right[index])).toBeLessThan(1e-4);
    }
  });

  it("measures the same volume and pan from the encoded audio", () => {
    const channels = render(200, [{ frequency: 400, volume: 37.5, pan: 0.5 }]);
    const decoded = decodePcm16Wav(encodePcm16Wav(channels, SAMPLE_RATE));
    const measured = measureTone(decoded.channels, SAMPLE_RATE, {
      frequency: 400,
      amplitude: AMPLITUDE,
      startMs: 50,
      windowMs: 100,
    });

    expect(measured.volume).toBeCloseTo(37.5, 2);
    expect(measured.pan).toBeCloseTo(0.5, 3);
  });

  it("summarizes the peak, RMS, and audible samples", () => {
    const wav = encodePcm16Wav(
      [Float32Array.of(0.5, -0.5, 0, 0), Float32Array.of(0, 0, 0, 0.25)],
      SAMPLE_RATE,
    );
    const signal = summarizeSignal(wav);

    expect(signal.peak).toBeCloseTo(0.5, 4);
    expect(signal.nonZeroSamples).toBe(3);
    expect(signal.rms).toBeCloseTo(Math.sqrt((0.25 + 0.25 + 0.0625) / 8), 4);
  });
});
