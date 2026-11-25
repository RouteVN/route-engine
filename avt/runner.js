// Browser side of the audio output tests. It plays a spec's story through the
// real Route Engine, effects handler, and Route Graphics audio graph on
// Route Graphics' deterministic offline audio clock, then measures the
// rendered PCM. scripts/audioOutputTest.mjs serves this page and compares
// the measurements with the spec's expectations.

import createRouteEngine, { createEffectsHandler } from "/RouteEngine.js";
import createRouteGraphics, {
  configureAudioRuntime,
  containerPlugin,
  createDeterministicAudioRuntime,
  rectPlugin,
  resetAudioRuntime,
  soundPlugin,
  spritePlugin,
  textPlugin,
  tweenPlugin,
} from "/RouteGraphics.js";
import {
  measureFrequency,
  measureMaxVolume,
  measureTone,
} from "/analyzeAudio.js";

const SAMPLE_RATE = 48000;
const DEFAULT_WINDOW_MS = 100;

const writeText = (view, offset, value) => {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

// A mono PCM16 sine tone of whole seconds, so it holds whole cycles and
// loops seamlessly. By default it outlasts the spec, like a real song, so
// end effects only play where a spec makes the sound end.
const createToneWav = ({ frequency, amplitude, seconds }) => {
  if (!Number.isInteger(frequency) || !Number.isInteger(seconds)) {
    throw new Error("Tones need whole-hertz frequencies and whole seconds.");
  }
  const frameCount = SAMPLE_RATE * seconds;
  const dataSize = frameCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let frame = 0; frame < frameCount; frame++) {
    const sample = Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE);
    view.setInt16(44 + frame * 2, Math.round(sample * amplitude * 32767), true);
  }
  return buffer;
};

const getPointer = (engine) =>
  engine.selectSystemState().contexts.at(-1).pointers.read;

const measure = (channels, tones, expectation) => {
  const tone = tones[expectation.source];
  if (!tone) {
    throw new Error(`Unknown expectation source "${expectation.source}".`);
  }
  const frequency = tone.frequency * (expectation.rate ?? 1);
  const result = {};

  if (expectation.maxVolume !== undefined) {
    result.maxVolume = measureMaxVolume(channels, SAMPLE_RATE, {
      frequency,
      amplitude: tone.amplitude,
      fromMs: expectation.from,
      toMs: expectation.to,
    });
    return result;
  }

  const window = {
    startMs: expectation.at,
    windowMs: expectation.window ?? DEFAULT_WINDOW_MS,
  };
  const { volume, pan } = measureTone(channels, SAMPLE_RATE, {
    frequency,
    amplitude: tone.amplitude,
    ...window,
  });
  result.volume = volume;
  result.pan = pan;
  if (expectation.rate !== undefined) {
    const measuredFrequency = measureFrequency(channels, SAMPLE_RATE, window);
    result.rate =
      measuredFrequency === undefined
        ? undefined
        : measuredFrequency / tone.frequency;
  }
  return result;
};

const run = async (spec) => {
  const tones = spec.tones;
  const runtime = createDeterministicAudioRuntime({
    durationMs: spec.durationMs,
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 2,
  });
  configureAudioRuntime(runtime);

  let app;
  let engine;
  const errors = [];
  const lines = [];
  try {
    app = createRouteGraphics();
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: { render: (renderState) => app.render(renderState) },
      ticker: { add() {}, remove() {} },
      namespace: `avt:${spec.name}`,
      handleUnhandledEffect: (effect) => {
        throw new Error(`Unhandled effect "${effect.name}".`);
      },
    });
    const routeGraphicsEvents =
      effectsHandler.createRouteGraphicsEventHandler();

    await app.init({
      width: spec.projectData.screen.width,
      height: spec.projectData.screen.height,
      backgroundColor: 0x000000,
      plugins: {
        elements: [containerPlugin, rectPlugin, textPlugin, spritePlugin],
        animations: [tweenPlugin],
        audio: [soundPlugin],
      },
      eventHandler: (name, payload) => {
        Promise.resolve(routeGraphicsEvents(name, payload)).catch((error) => {
          errors.push(`Route Graphics event "${name}": ${error.message}`);
        });
      },
    });
    await app.loadAssets(
      Object.fromEntries(
        Object.entries(tones).map(([fileId, tone]) => [
          fileId,
          {
            buffer: createToneWav({
              seconds: Math.ceil(spec.durationMs / 1000) + 1,
              ...tone,
            }),
            type: "audio/wav",
          },
        ]),
      ),
    );

    engine = createRouteEngine({ handlePendingEffects: effectsHandler });
    engine.init({
      namespace: `avt:${spec.name}`,
      initialState: {
        global: { runtime: spec.runtime },
        projectData: spec.projectData,
      },
    });
    lines.push({ atMs: 0, lineId: getPointer(engine).lineId });

    for (const step of spec.steps ?? []) {
      runtime.scheduleAt(step.at, () => {
        try {
          engine.handleActions(step.actions);
          lines.push({ atMs: step.at, lineId: getPointer(engine).lineId });
        } catch (error) {
          errors.push(`Step at ${step.at}ms: ${error.message}`);
        }
      });
    }

    const rendered = await runtime.render();
    const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
    return {
      ok: true,
      errors,
      lines,
      measurements: spec.expect.map((expectation) =>
        measure(channels, tones, expectation),
      ),
    };
  } finally {
    app?.destroy();
    runtime.destroy();
    resetAudioRuntime();
  }
};

run(globalThis.__RE_AVT_SPEC__).then(
  (result) => {
    globalThis.__RE_AVT_RESULT__ = result;
  },
  (error) => {
    globalThis.__RE_AVT_RESULT__ = {
      ok: false,
      error: `${error.message}\n${error.stack ?? ""}`,
    };
  },
);
