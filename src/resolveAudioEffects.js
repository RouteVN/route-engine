import { createBgmSoundRenderId, getBgmSounds } from "./audioIds.js";
import { getOwnProperty } from "./util.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const DEFAULT_AUDIO_VALUES = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

// Audio effects play relative to the mix they are applied to: volume is a
// percentage of that mix, pan an offset from it, and playback rate a multiple
// of it. A value at these identities leaves the mix unchanged, so an effect
// that ends at them settles on the authored mix.
export const AUDIO_EFFECT_IDENTITY = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

const AUDIO_EFFECT_PROPERTIES = ["volume", "pan", "playbackRate"];

const SOURCE_IDENTITY_FIELDS = ["src", "startAt", "endAt", "startDelayMs"];

const getSingleBgmSound = (channel, actionPath) => {
  if (!channel) return null;

  const children = channel.children ?? [];
  if (children.length !== 1) {
    throw new Error(
      `[${actionPath}.audioEffects] Audio effects require exactly one BGM sound on each present side.`,
    );
  }

  return children[0];
};

const isSameSourceIdentity = (previous, next) =>
  previous?.id === next?.id &&
  SOURCE_IDENTITY_FIELDS.every(
    (field) =>
      (previous?.[field] ?? (field === "endAt" ? null : 0)) ===
      (next?.[field] ?? (field === "endAt" ? null : 0)),
  );

const areEquivalentAudioValues = (authored, rendered) =>
  authored === rendered ||
  Math.abs(authored - rendered) <=
    Number.EPSILON * Math.max(1, Math.abs(authored), Math.abs(rendered));

export const clampAudioPan = (pan) => Math.max(-1, Math.min(1, pan));

// Scales a volume by a percentage. Either side at 100 returns the other one
// unchanged, so an identity never introduces floating-point drift.
export const scaleAudioVolume = (volume, percent) => {
  if (percent === 100) return volume;
  if (volume === 100) return percent;
  return (volume * percent) / 100;
};

// Composes a channel volume with a sound volume, as the BGM render does.
export const composeAudioVolume = (channelVolume, soundVolume) =>
  (channelVolume * soundVolume) / 100;

// The channel layer of the BGM mix. `audioEffectMix` holds the final values of
// the line's audio effect that differ from the identities; it modulates the
// authored channel instead of replacing it. Legacy single-sound BGM has no
// channel volume layer, so its volume is undefined unless an effect sets one.
export const getBgmChannelMix = (bgm, { includeEffectMix = true } = {}) => {
  const effectMix = includeEffectMix ? (bgm?.audioEffectMix ?? {}) : {};
  let volume = Array.isArray(bgm?.sounds) ? (bgm.volume ?? 100) : undefined;
  if (effectMix.volume !== undefined) {
    volume = scaleAudioVolume(volume ?? 100, effectMix.volume);
  }
  return {
    volume,
    pan:
      effectMix.pan === undefined ? bgm?.pan : (bgm?.pan ?? 0) + effectMix.pan,
    playbackRate: effectMix.playbackRate,
  };
};

const findAuthoredBgmSound = (bgm, renderedSound) => {
  const sounds = getBgmSounds(bgm);
  if (sounds.length === 1) return sounds[0];
  return sounds.find(
    (sound) => createBgmSoundRenderId(bgm, sound) === renderedSound?.id,
  );
};

// The layers an audio effect value is applied to for one rendered BGM sound.
// Incoming and update tracks play against the authored mix and end at the
// persistent mix; outgoing tracks play against the mix the sound is currently
// rendered with, including the previous line's audio effect.
const getBgmSoundLayers = ({
  bgm,
  resources,
  renderedSound,
  includeEffectMix,
}) => {
  // Without authored BGM state there is no mix to play against, and values
  // are emitted as written. The engine always passes the BGM state.
  if (!bgm) return undefined;

  const sound = findAuthoredBgmSound(bgm, renderedSound);
  const resource = getOwnProperty(resources?.sounds, sound?.resourceId);
  const channel = getBgmChannelMix(bgm, { includeEffectMix });
  return {
    channelVolume: channel.volume,
    soundVolume:
      sound?.volume ?? resource?.volume ?? DEFAULT_AUDIO_VALUES.volume,
    channelPan: channel.pan ?? DEFAULT_AUDIO_VALUES.pan,
    soundPan: sound?.pan ?? resource?.pan ?? DEFAULT_AUDIO_VALUES.pan,
    playbackRate:
      (sound?.playbackRate ??
        resource?.playbackRate ??
        DEFAULT_AUDIO_VALUES.playbackRate) *
      (channel.playbackRate ?? AUDIO_EFFECT_IDENTITY.playbackRate),
  };
};

// Maps one channel audio effect value onto a rendered BGM sound. Volume and
// playback rate scale linearly, so relative deltas map the same way as
// absolute values. Relative pan is resolved by
// resolveRelativeChannelPanKeyframes.
const mapChannelEffectValue = ({ property, value, relative, layers }) => {
  if (!layers) return value;
  if (property === "volume") {
    return composeAudioVolume(
      scaleAudioVolume(layers.channelVolume ?? 100, value),
      layers.soundVolume,
    );
  }
  if (property === "playbackRate") {
    return layers.playbackRate * value;
  }
  if (relative) return value;
  return clampAudioPan(layers.channelPan + value + layers.soundPan);
};

// Relative pan keyframes move the channel pan before Route Graphics composes
// it with the local pan and clamps it, so they are resolved to absolute
// rendered values here. Absolute pan values are offsets from the channel pan
// the track plays against; relative values continue from the previous
// keyframe, or from the channel pan before the line.
const resolveRelativeChannelPanKeyframes = ({
  authored,
  baselineChannelPan,
  compiledKeyframes,
  layers,
}) => {
  let channelPan = hasOwn(authored, "initialValue")
    ? layers.channelPan + authored.initialValue
    : (baselineChannelPan ?? layers.channelPan);

  return compiledKeyframes.map((compiled, index) => {
    const keyframe = authored.keyframes[index];
    if (keyframe.relative !== true) {
      channelPan = layers.channelPan + keyframe.value;
      return compiled;
    }

    const startChannelPan = hasOwn(keyframe, "startValue")
      ? channelPan + keyframe.startValue
      : channelPan;
    const nextChannelPan = startChannelPan + keyframe.value;
    const { relative: _, ...absolute } = compiled;
    channelPan = nextChannelPan;

    if (hasOwn(keyframe, "startValue")) {
      absolute.startValue = clampAudioPan(startChannelPan + layers.soundPan);
    }
    absolute.value = clampAudioPan(nextChannelPan + layers.soundPan);
    return absolute;
  });
};

const getPlaybackSpeed = (selection, selectionPath) => {
  const speed = selection?.playback?.speed ?? 1;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
    throw new Error(
      `[${selectionPath}.playback.speed] Audio effect speed must be a finite number greater than 0.`,
    );
  }
  return speed;
};

const compileKeyframe = (keyframe, speed) => ({
  ...(hasOwn(keyframe, "startValue")
    ? { startValue: keyframe.startValue }
    : {}),
  value: keyframe.value,
  delay: (keyframe.delay ?? 0) / speed,
  duration: keyframe.duration / speed,
  easing: keyframe.easing ?? "linear",
  ...(keyframe.relative === true ? { relative: true } : {}),
});

const compileProperty = ({
  property,
  authored,
  speed,
  propertyPath,
  normalizeValue = ({ value }) => value,
}) => {
  const finalKeyframe = authored.keyframes.at(-1);
  if (
    typeof finalKeyframe?.value !== "number" ||
    !Number.isFinite(finalKeyframe.value) ||
    finalKeyframe.relative === true
  ) {
    throw new Error(
      `[${propertyPath}.keyframes] The final keyframe must use an absolute finite numeric value.`,
    );
  }

  const compiled = {
    keyframes: authored.keyframes.map((keyframe) => {
      const compiled = compileKeyframe(keyframe, speed);
      const relative = compiled.relative === true;
      compiled.value = normalizeValue({
        property,
        value: compiled.value,
        relative,
      });
      if (hasOwn(compiled, "startValue")) {
        compiled.startValue = normalizeValue({
          property,
          value: compiled.startValue,
          relative,
        });
      }
      return compiled;
    }),
  };
  if (hasOwn(authored, "initialValue")) {
    compiled.initialValue = normalizeValue({
      property,
      value: authored.initialValue,
      relative: false,
    });
  }
  return compiled;
};

const compileChannelProperty = ({
  authored,
  bgm,
  baselineChannelPan,
  includeEffectMix,
  property,
  propertyPath,
  renderedSound,
  resources,
  speed,
}) => {
  const layers = getBgmSoundLayers({
    bgm,
    resources,
    renderedSound,
    includeEffectMix,
  });
  const compiled = compileProperty({
    property,
    authored,
    speed,
    propertyPath,
    normalizeValue: ({ value, relative }) =>
      mapChannelEffectValue({ property, value, relative, layers }),
  });
  if (property === "pan" && bgm) {
    compiled.keyframes = resolveRelativeChannelPanKeyframes({
      authored,
      baselineChannelPan,
      compiledKeyframes: compiled.keyframes,
      layers,
    });
  }
  return compiled;
};

// The channel pan of a BGM state as it was rendered, including its audio
// effect, or as authored for a channel that only starts now.
const getRenderedChannelPan = (bgm, { includeEffectMix = true } = {}) =>
  bgm
    ? (getBgmChannelMix(bgm, { includeEffectMix }).pan ??
      DEFAULT_AUDIO_VALUES.pan)
    : undefined;

const settlePropertyEndpoint = ({
  actionPath,
  compiled,
  property,
  propertyPath,
  renderedSound,
}) => {
  const persistentValue =
    renderedSound[property] ?? DEFAULT_AUDIO_VALUES[property];
  const finalKeyframe = compiled.keyframes.at(-1);
  if (!areEquivalentAudioValues(finalKeyframe.value, persistentValue)) {
    throw new Error(
      `[${actionPath}.audioEffects]\n[${propertyPath}.keyframes] The final keyframe value must match the persistent BGM ${property} value.`,
    );
  }
  finalKeyframe.value = persistentValue;
};

// Maps one boundary effect value onto the mix a sound declares to Route
// Graphics. Route Graphics plays boundary keyframes as written, so a fade
// that ends at 100 must end at the sound's declared volume, not at full
// volume.
const mapSoundEffectValue = ({ property, value, relative, mix }) => {
  if (property === "volume") return scaleAudioVolume(mix.volume, value);
  if (property === "playbackRate") return mix.playbackRate * value;
  if (relative) return value;
  return clampAudioPan(mix.pan + value);
};

// `mix` is the sound's declared volume, pan, and playback rate after every
// authored layer that Route Graphics applies to the sound node itself. It
// defaults to the identities, which emit the authored values unchanged.
export const resolveSoundBoundaryEffect = ({
  selection,
  selectionPath,
  resources = {},
  mix = {},
}) => {
  if (!selection) return undefined;

  const resourceId = selection.resourceId;
  const resourcePath = `resources.audioEffects.${resourceId}`;
  const resource = getOwnProperty(resources.audioEffects, resourceId);
  if (!resource) {
    throw new Error(
      `[${selectionPath}.resourceId]\n[${resourcePath}] Unknown audio effect resource "${resourceId}".`,
    );
  }
  if (resource.type !== "update") {
    throw new Error(
      `[${selectionPath}]\n[${resourcePath}] Sound beginEffect and endEffect selections require an audio effect resource with type "update".`,
    );
  }

  const speed = getPlaybackSpeed(selection, selectionPath);
  const soundMix = {
    volume: mix.volume ?? DEFAULT_AUDIO_VALUES.volume,
    pan: mix.pan ?? DEFAULT_AUDIO_VALUES.pan,
    playbackRate: mix.playbackRate ?? DEFAULT_AUDIO_VALUES.playbackRate,
  };
  const properties = {};
  for (const property of AUDIO_EFFECT_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;
    properties[property] = compileProperty({
      property,
      authored: resource.tween[property],
      speed,
      propertyPath: `${resourcePath}.tween.${property}`,
      normalizeValue: ({ value, relative }) =>
        mapSoundEffectValue({ property, value, relative, mix: soundMix }),
    });
  }

  return properties;
};

// Records the final values of the BGM audio effect that persist after it
// finishes. The authored volume, pan, and playback rate stay as written; a
// final value other than its identity is kept in `audioEffectMix` and
// modulates them when the BGM renders. An effect that ends at the identities
// leaves the authored mix exactly as it was.
export const applyAudioEffectEndpoints = ({ bgm, resources = {} }) => {
  if (!bgm) return bgm;

  const resolvedBgm = structuredClone(bgm);
  delete resolvedBgm.audioEffectMix;

  const resourceId = bgm.audioEffects?.resourceId;
  const resource = getOwnProperty(resources.audioEffects, resourceId);
  const propertyTracks =
    resource?.type === "update"
      ? resource.tween
      : resource?.type === "transition"
        ? resource.next
        : undefined;
  if (!propertyTracks || getBgmSounds(bgm).length === 0) return resolvedBgm;

  const effectMix = {};
  for (const property of AUDIO_EFFECT_PROPERTIES) {
    if (!hasOwn(propertyTracks, property)) continue;

    const finalKeyframe = propertyTracks[property].keyframes.at(-1);
    if (
      typeof finalKeyframe?.value !== "number" ||
      !Number.isFinite(finalKeyframe.value) ||
      finalKeyframe.relative === true
    ) {
      continue;
    }

    if (finalKeyframe.value !== AUDIO_EFFECT_IDENTITY[property]) {
      effectMix[property] = finalKeyframe.value;
    }
  }

  if (Object.keys(effectMix).length > 0) {
    resolvedBgm.audioEffectMix = effectMix;
  }
  return resolvedBgm;
};

const createBaseEffect = (occurrence, targetId) => ({
  id: `audio-effect:${occurrence.occurrenceId}`,
  type: "audio-transition",
  targetId,
});

// Compile one authored property track on one side of a handoff. `side` is the
// sound with its BGM and resources: the outgoing side for an exit track, the
// incoming side otherwise. An exit track plays against the mix the outgoing
// sound is rendered with; enter and update tracks play against the incoming
// sound's authored mix and must end at its persistent mix.
// `baselineChannelPan` is the channel pan that relative pan keyframes start
// from.
const compileLifecycleTrack = ({
  phase,
  side,
  baselineChannelPan,
  authored,
  property,
  propertyPath,
  actionPath,
  speed,
}) => {
  const track = compileChannelProperty({
    authored,
    bgm: side.bgm,
    baselineChannelPan,
    includeEffectMix: phase === "exit",
    property,
    propertyPath,
    renderedSound: side.sound,
    resources: side.resources,
    speed,
  });
  if (phase !== "exit") {
    settlePropertyEndpoint({
      actionPath,
      compiled: track,
      property,
      propertyPath,
      renderedSound: side.sound,
    });
  }
  return track;
};

// The phase an update resource plays on one sound, as a visual update
// animation does when its element appears, changes, or is removed: a retained
// sound updates, an added or source-replaced sound plays the tween as its
// incoming track, and a removed sound plays it as its outgoing track.
// resolveAudioEffects passes removed sounds only when a line stops them all.
const getUpdatePhase = (previousSound, nextSound) => {
  if (!nextSound) return "exit";
  if (!previousSound || !isSameSourceIdentity(previousSound, nextSound)) {
    return "enter";
  }
  return "update";
};

export const resolveAudioEffect = ({
  occurrence,
  resources = {},
  previousResources = resources,
  nextResources = resources,
  previousChannel,
  nextChannel,
  previousBgm,
  nextBgm,
}) => {
  if (!occurrence?.selection) return null;

  const selection = occurrence.selection;
  const actionPath = occurrence.actionPath ?? "bgm";
  const resourceId = selection.resourceId;
  const resourcePath = `resources.audioEffects.${resourceId}`;
  const resource = getOwnProperty(resources.audioEffects, resourceId);
  if (!resource) {
    throw new Error(
      `[${actionPath}.audioEffects.resourceId]\n[${resourcePath}] Unknown audio effect resource "${resourceId}".`,
    );
  }

  const speed = getPlaybackSpeed(selection, `${actionPath}.audioEffects`);
  const previousSound = getSingleBgmSound(previousChannel, actionPath);
  const nextSound = getSingleBgmSound(nextChannel, actionPath);
  if (!previousSound && !nextSound) return null;

  if (previousSound && nextSound && previousSound.id !== nextSound.id) {
    throw new Error(
      `[${actionPath}.audioEffects] Audio effects require a stable BGM sound id across a handoff.`,
    );
  }

  const targetId = previousSound?.id ?? nextSound.id;
  const previous = {
    sound: previousSound,
    bgm: previousBgm,
    resources: previousResources,
  };
  const next = { sound: nextSound, bgm: nextBgm, resources: nextResources };
  const properties = {};

  if (resource.type === "transition") {
    // A transition plays only when a sound starts, stops, or changes source.
    // Whether a line keeps the music playing depends on how the player reached
    // it, so a kept sound takes its new mix at once instead of failing the line.
    if (isSameSourceIdentity(previousSound, nextSound)) return null;

    for (const property of AUDIO_EFFECT_PROPERTIES) {
      const lifecycle = {};
      const previousTrack = previousSound
        ? resource.prev?.[property]
        : undefined;
      if (previousTrack) {
        lifecycle.exit = compileLifecycleTrack({
          phase: "exit",
          side: previous,
          baselineChannelPan: getRenderedChannelPan(previousBgm),
          authored: previousTrack,
          property,
          propertyPath: `${resourcePath}.prev.${property}`,
          actionPath,
          speed,
        });
      }

      const nextTrack = nextSound ? resource.next?.[property] : undefined;
      if (nextTrack) {
        lifecycle.enter = compileLifecycleTrack({
          phase: "enter",
          side: next,
          baselineChannelPan: getRenderedChannelPan(nextBgm, {
            includeEffectMix: false,
          }),
          authored: nextTrack,
          property,
          propertyPath: `${resourcePath}.next.${property}`,
          actionPath,
          speed,
        });
      }

      if (Object.keys(lifecycle).length > 0) {
        properties[property] = lifecycle;
      }
    }
  } else if (resource.type === "update") {
    const phase = getUpdatePhase(previousSound, nextSound);
    // Relative pan continues from the channel as it was rendered before the
    // line; a channel that only starts now has its own authored pan.
    const baselineChannelPan =
      phase === "enter" && !previousBgm
        ? getRenderedChannelPan(nextBgm, { includeEffectMix: false })
        : getRenderedChannelPan(previousBgm);
    for (const property of AUDIO_EFFECT_PROPERTIES) {
      if (!hasOwn(resource.tween, property)) continue;
      const track = compileLifecycleTrack({
        phase,
        side: phase === "exit" ? previous : next,
        baselineChannelPan,
        authored: resource.tween[property],
        property,
        propertyPath: `${resourcePath}.tween.${property}`,
        actionPath,
        speed,
      });

      // A retained update only animates values that change.
      if (
        phase === "update" &&
        (previousSound[property] ?? DEFAULT_AUDIO_VALUES[property]) ===
          (nextSound[property] ?? DEFAULT_AUDIO_VALUES[property])
      ) {
        continue;
      }
      properties[property] = { [phase]: track };
    }
  } else {
    throw new Error(
      `[${resourcePath}.type] Unsupported audio effect type "${resource.type}".`,
    );
  }

  if (Object.keys(properties).length === 0) return null;

  return {
    ...createBaseEffect(occurrence, targetId),
    properties,
  };
};

// The persistent BGM mix is recorded from the line's authored selection, while
// the effect plays the selection as resolved when the line starts. Templated
// resource IDs only resolve then, so the recorded mix cannot hold their final
// values. Reject the line instead of playing an effect that settles on a mix
// it was not compiled against.
const assertRecordedAudioEffectMix = ({ occurrence, nextBgm, resources }) => {
  if (!nextBgm || getBgmSounds(nextBgm).length === 0) return;

  const expected = applyAudioEffectEndpoints({
    bgm: { ...nextBgm, audioEffects: occurrence.selection },
    resources,
  }).audioEffectMix;
  if (
    JSON.stringify(expected ?? {}) ===
    JSON.stringify(nextBgm.audioEffectMix ?? {})
  ) {
    return;
  }

  const actionPath = occurrence.actionPath ?? "bgm";
  throw new Error(
    `[${actionPath}.audioEffects] Audio effect "${occurrence.selection.resourceId}" ends at values that persist in the BGM mix, but the mix was recorded without them. A selection that only resolves when the line starts, such as a templated resource ID, must end at volume 100, pan 0, and playbackRate 1.`,
  );
};

export const resolveAudioEffects = (options) => {
  const nextResources = options.nextResources ?? options.resources;
  const occurrence = options.occurrence;
  if (!occurrence?.selection) return [];

  const previousSounds = options.previousChannel?.children ?? [];
  const nextSounds = options.nextChannel?.children ?? [];
  const resourceId = occurrence.selection.resourceId;
  const resource = nextResources?.audioEffects?.[resourceId];
  if (resource && ["transition", "update"].includes(resource.type)) {
    assertRecordedAudioEffectMix({
      occurrence,
      nextBgm: options.nextBgm,
      resources: nextResources,
    });
  }

  const createSingleSoundChannel = (channel, sound) => {
    if (!sound) return null;
    return {
      ...channel,
      children: [sound],
    };
  };
  // Match the authored sound by its position in the complete rendered
  // channel before splitting effects into individual targets. Runtime IDs
  // can retain aliases, and multiple clips can share the same resource.
  const createSingleSoundBgm = (bgm, resources, channel, sound) => {
    if (!Array.isArray(bgm?.sounds)) return bgm;
    const index = channel?.children?.indexOf(sound) ?? -1;
    const authored = bgm.sounds.filter((item) =>
      getOwnProperty(resources.sounds, item.resourceId),
    )[index];
    return { ...bgm, sounds: authored ? [authored] : [] };
  };
  const resolveTargets = (targets) =>
    targets
      .map(({ previousSound, nextSound }, index) =>
        resolveAudioEffect({
          ...options,
          occurrence:
            index === 0
              ? occurrence
              : {
                  ...occurrence,
                  occurrenceId: `${occurrence.occurrenceId}:${index}`,
                },
          resources: nextResources,
          previousBgm: createSingleSoundBgm(
            options.previousBgm,
            options.previousResources ?? nextResources,
            options.previousChannel,
            previousSound,
          ),
          nextBgm: createSingleSoundBgm(
            options.nextBgm,
            nextResources,
            options.nextChannel,
            nextSound,
          ),
          previousChannel: createSingleSoundChannel(
            options.previousChannel,
            previousSound,
          ),
          nextChannel: createSingleSoundChannel(options.nextChannel, nextSound),
        }),
      )
      .filter(Boolean);

  if (!resource || !["transition", "update"].includes(resource.type)) {
    return resolveTargets([
      {
        previousSound: previousSounds[0],
        nextSound: nextSounds[0],
      },
    ]);
  }

  const previousById = new Map(
    previousSounds.map((sound) => [sound.id, sound]),
  );

  if (resource.type === "update") {
    // Like a visual update animation, prefer the current sounds: retained
    // sounds update, and added or replaced sounds enter. Removed sounds play
    // the update as their outgoing track only when the line stops them all.
    if (nextSounds.length === 0) {
      return resolveTargets(
        previousSounds.map((previousSound) => ({ previousSound })),
      );
    }
    return resolveTargets(
      nextSounds.map((nextSound) => ({
        previousSound: previousById.get(nextSound.id),
        nextSound,
      })),
    );
  }

  const nextById = new Map(nextSounds.map((sound) => [sound.id, sound]));
  const targets = [];
  for (const previousSound of previousSounds) {
    const nextSound = nextById.get(previousSound.id);
    if (!nextSound || !isSameSourceIdentity(previousSound, nextSound)) {
      targets.push({ previousSound, nextSound });
    }
  }
  for (const nextSound of nextSounds) {
    if (!previousById.has(nextSound.id)) {
      targets.push({ nextSound });
    }
  }

  if (targets.length > 0) {
    return resolveTargets(targets);
  }

  // Every sound keeps playing, so the transition has nothing to play. Resolve
  // one kept sound anyway so a selection that is invalid on every path, such
  // as a bad playback speed, still fails here.
  const [previousSound] = previousSounds;
  return resolveTargets([
    { previousSound, nextSound: nextById.get(previousSound?.id) },
  ]);
};
