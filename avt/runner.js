// Browser side of the audio output tests. It plays a spec's story through the
// real Route Engine, effects handler, and Route Graphics audio graph on
// Route Graphics' deterministic offline audio clock, encodes the rendered
// audio as a canonical PCM16 WAV, and measures that WAV.
// scripts/audioOutputTest.mjs serves this page, checks the measurements
// against the spec's expectations, and compares the WAV and its transcript
// with the references.

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
import { decodePcm16Wav, encodePcm16Wav, summarizeSignal } from "/wav.js";

const SAMPLE_RATE = 48000;
const DEFAULT_WINDOW_MS = 100;

// A mono sine tone of whole seconds, so it holds whole cycles and loops
// seamlessly. By default it outlasts the spec, like a real song, so end
// effects only play where a spec makes the sound end.
const createToneWav = ({ frequency, amplitude, seconds }) => {
  if (!Number.isInteger(frequency) || !Number.isInteger(seconds)) {
    throw new Error("Tones need whole-hertz frequencies and whole seconds.");
  }
  const samples = new Float32Array(SAMPLE_RATE * seconds);
  for (let frame = 0; frame < samples.length; frame++) {
    samples[frame] =
      amplitude * Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE);
  }
  return encodePcm16Wav([samples], SAMPLE_RATE).buffer;
};

// A render ID is render-<engine instance>-<generation>-<sequence>, and the
// instance part is random. The transcript keeps the deterministic rest.
const RENDER_ID = /^render-.+-(\d+-\d+)$/;
const normalizePayload = (payload) =>
  payload === undefined
    ? undefined
    : JSON.parse(
        JSON.stringify(payload, (_, value) =>
          typeof value === "string"
            ? value.replace(RENDER_ID, "render-$1")
            : value,
        ),
      );

const encodeBase64 = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
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
  Object.assign(
    result,
    measureTone(channels, SAMPLE_RATE, {
      frequency,
      amplitude: tone.amplitude,
      ...window,
    }),
  );
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
  const events = [];
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
        events.push({
          atMs: Math.round(runtime.nowMs() * 1000) / 1000,
          name,
          payload: normalizePayload(payload),
        });
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
    const wav = encodePcm16Wav(
      [rendered.getChannelData(0), rendered.getChannelData(1)],
      rendered.sampleRate,
    );
    const { channels } = decodePcm16Wav(wav);
    return {
      ok: true,
      errors,
      lines,
      events,
      measurements: spec.expect.map((expectation) =>
        measure(channels, tones, expectation),
      ),
      metadata: {
        sampleRate: rendered.sampleRate,
        numberOfChannels: rendered.numberOfChannels,
        frameCount: rendered.length,
        durationMs: (rendered.length / rendered.sampleRate) * 1000,
        byteLength: wav.byteLength,
        signal: summarizeSignal(wav),
      },
      wavBase64: encodeBase64(wav),
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
