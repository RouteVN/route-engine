import { describe, expect, it } from "vitest";
import {
  measureFrequency,
  measureMaxVolume,
  measureTone,
} from "../avt/analyzeAudio.js";

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
