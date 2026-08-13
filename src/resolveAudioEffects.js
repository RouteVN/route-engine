import { createAudioRenderId } from "./audioIds.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const DEFAULT_AUDIO_VALUES = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

const UPDATE_PROPERTIES = ["volume", "pan", "playbackRate"];

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

const isSameValue = (previous, next) =>
  JSON.stringify(previous) === JSON.stringify(next);

const areEquivalentAudioValues = (authored, rendered) =>
  authored === rendered ||
  Math.abs(authored - rendered) <=
    Number.EPSILON * Math.max(1, Math.abs(authored), Math.abs(rendered));

const clampAudioPan = (pan) => Math.max(-1, Math.min(1, pan));

const getCanonicalSoundProperty = ({
  bgm,
  resources,
  renderedSound,
  property,
}) => {
  const sound = bgm?.sounds?.find(
    ({ id }) => createAudioRenderId("bgm", id) === renderedSound?.id,
  );
  const resource = resources.sounds?.[sound?.resourceId];
  return (
    sound?.[property] ?? resource?.[property] ?? DEFAULT_AUDIO_VALUES[property]
  );
};

const normalizeChannelUpdateValue = ({
  property,
  value,
  relative,
  nextBgm,
  nextResources,
  nextSound,
}) => {
  if (!nextBgm || !nextSound) return value;

  if (property === "volume") {
    const soundVolume = getCanonicalSoundProperty({
      bgm: nextBgm,
      resources: nextResources,
      renderedSound: nextSound,
      property,
    });
    return (value * soundVolume) / 100;
  }

  if (property === "pan" && !relative) {
    const soundPan = getCanonicalSoundProperty({
      bgm: nextBgm,
      resources: nextResources,
      renderedSound: nextSound,
      property,
    });
    return clampAudioPan(value + soundPan);
  }

  return value;
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

const compileFadeKeyframe = (keyframe, speed, target) => {
  const compiled = compileKeyframe(keyframe, speed);
  compiled.value = (compiled.value * target) / 100;
  if (hasOwn(compiled, "startValue")) {
    compiled.startValue = (compiled.startValue * target) / 100;
  }
  return compiled;
};

const compileFade = (fade, phase, speed, target, resourcePath) => {
  if (!fade) return undefined;
  const authoredKeyframes = fade.keyframes;
  if (authoredKeyframes) {
    if (authoredKeyframes.some((keyframe) => keyframe.relative === true)) {
      throw new Error(
        `[${resourcePath}.keyframes] Transition fade keyframes must use absolute values.`,
      );
    }
    if (phase === "enter" && authoredKeyframes.at(-1)?.value !== 100) {
      throw new Error(
        `[${resourcePath}.keyframes] The final incoming transition fade value must be 100.`,
      );
    }

    const keyframes = authoredKeyframes.map((keyframe) =>
      compileFadeKeyframe(keyframe, speed, target),
    );
    if (phase === "enter") {
      keyframes.at(-1).value = target;
    }

    return {
      ...(phase === "enter" ? { initialValue: 0 } : {}),
      keyframes,
    };
  }

  return {
    ...(phase === "enter" ? { initialValue: 0 } : {}),
    keyframes: [
      {
        value: phase === "exit" ? 0 : target,
        delay: (fade.delay ?? 0) / speed,
        duration: fade.duration / speed,
        easing: fade.easing ?? "linear",
      },
    ],
  };
};

const compileUpdateProperty = ({
  property,
  authored,
  speed,
  resourcePath,
  normalizeValue = ({ value }) => value,
}) => {
  const finalKeyframe = authored.keyframes.at(-1);
  if (
    typeof finalKeyframe?.value !== "number" ||
    !Number.isFinite(finalKeyframe.value) ||
    finalKeyframe.relative === true
  ) {
    throw new Error(
      `[${resourcePath}.tween.${property}.keyframes] The final keyframe must use an absolute finite numeric value.`,
    );
  }

  return {
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
};

export const resolveSoundBoundaryEffect = ({
  selection,
  selectionPath,
  resources = {},
}) => {
  if (!selection) return undefined;

  const resourceId = selection.resourceId;
  const resourcePath = `resources.audioEffects.${resourceId}`;
  const resource = resources.audioEffects?.[resourceId];
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
  const properties = {};
  for (const property of UPDATE_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;
    properties[property] = compileUpdateProperty({
      property,
      authored: resource.tween[property],
      speed,
      resourcePath,
    });
  }

  return properties;
};

export const applyAudioEffectUpdateEndpoints = ({ bgm, resources = {} }) => {
  const resourceId = bgm?.audioEffects?.resourceId;
  const resource = resources.audioEffects?.[resourceId];
  if (resource?.type !== "update") return bgm;

  const sounds = bgm.sounds ?? [];
  if (sounds.length === 0) return bgm;

  const resolvedBgm = structuredClone(bgm);

  for (const property of UPDATE_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;

    const finalKeyframe = resource.tween[property].keyframes.at(-1);
    if (
      typeof finalKeyframe?.value !== "number" ||
      !Number.isFinite(finalKeyframe.value) ||
      finalKeyframe.relative === true
    ) {
      continue;
    }

    if (property === "volume") {
      resolvedBgm.volume = finalKeyframe.value;
    } else if (property === "pan") {
      resolvedBgm.pan = finalKeyframe.value;
    } else {
      resolvedBgm.sounds.forEach((sound) => {
        sound.playbackRate = finalKeyframe.value;
      });
    }
  }

  return resolvedBgm;
};

const createBaseEffect = (occurrence, targetId) => ({
  id: `audio-effect:${occurrence.occurrenceId}`,
  type: "audio-transition",
  targetId,
});

export const resolveAudioEffect = ({
  occurrence,
  resources = {},
  nextResources = resources,
  previousChannel,
  nextChannel,
  nextBgm,
}) => {
  if (!occurrence?.selection) return null;

  const selection = occurrence.selection;
  const actionPath = occurrence.actionPath ?? "bgm";
  const resourceId = selection.resourceId;
  const resourcePath = `resources.audioEffects.${resourceId}`;
  const resource = resources.audioEffects?.[resourceId];
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
  const sameSource = isSameSourceIdentity(previousSound, nextSound);
  const sameGraph = isSameValue(previousSound, nextSound);

  if (resource.type === "transition") {
    if (sameSource) {
      if (sameGraph) return null;
      throw new Error(
        `[${actionPath}.audioEffects]\n[${resourcePath}] Audio effect resource "${resourceId}" has type "transition", but the BGM action only updates a retained sound. Use an update resource.`,
      );
    }

    const volume = {};
    const exit = compileFade(
      previousSound ? resource.prev?.fade : undefined,
      "exit",
      speed,
      previousSound?.volume ?? DEFAULT_AUDIO_VALUES.volume,
      `${resourcePath}.prev.fade`,
    );
    const enter = compileFade(
      nextSound ? resource.next?.fade : undefined,
      "enter",
      speed,
      nextSound?.volume ?? DEFAULT_AUDIO_VALUES.volume,
      `${resourcePath}.next.fade`,
    );
    if (exit) volume.exit = exit;
    if (enter) volume.enter = enter;
    if (Object.keys(volume).length === 0) return null;

    return {
      ...createBaseEffect(occurrence, targetId),
      properties: { volume },
    };
  }

  if (resource.type !== "update") {
    throw new Error(
      `[${resourcePath}.type] Unsupported audio effect type "${resource.type}".`,
    );
  }
  if (!previousSound || !nextSound || !sameSource) {
    throw new Error(
      `[${actionPath}.audioEffects]\n[${resourcePath}] Audio effect resource "${resourceId}" has type "update", but the BGM action changes source identity. Use a transition resource.`,
    );
  }
  const properties = {};
  for (const property of UPDATE_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;
    const update = compileUpdateProperty({
      property,
      authored: resource.tween[property],
      speed,
      resourcePath,
      normalizeValue: ({ value, relative }) =>
        normalizeChannelUpdateValue({
          property,
          value,
          relative,
          nextBgm,
          nextResources,
          nextSound,
        }),
    });
    const nextValue = nextSound[property] ?? DEFAULT_AUDIO_VALUES[property];
    const finalValue = update.keyframes.at(-1).value;
    if (!areEquivalentAudioValues(finalValue, nextValue)) {
      throw new Error(
        `[${actionPath}.audioEffects]\n[${resourcePath}.tween.${property}.keyframes] The final keyframe value must match the persistent BGM ${property} value.`,
      );
    }
    update.keyframes.at(-1).value = nextValue;

    const previousValue =
      previousSound[property] ?? DEFAULT_AUDIO_VALUES[property];
    if (previousValue === nextValue) continue;

    properties[property] = {
      update,
    };
  }

  if (Object.keys(properties).length === 0) return null;

  return {
    ...createBaseEffect(occurrence, targetId),
    properties,
  };
};

export const resolveAudioEffects = (options) => {
  const nextResources = options.nextResources ?? options.resources;
  const occurrence = options.occurrence;
  if (!occurrence?.selection) return [];

  const previousSounds = options.previousChannel?.children ?? [];
  const nextSounds = options.nextChannel?.children ?? [];
  const resourceId = occurrence.selection.resourceId;
  const resource = nextResources?.audioEffects?.[resourceId];

  const createSingleSoundChannel = (channel, sound) => {
    if (!sound) return null;
    return {
      ...channel,
      children: [sound],
    };
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
  const nextById = new Map(nextSounds.map((sound) => [sound.id, sound]));

  if (resource.type === "update") {
    const targets = nextSounds.map((nextSound) => ({
      previousSound: previousById.get(nextSound.id),
      nextSound,
    }));
    const missingPreviousSound = targets.find(
      ({ previousSound }) => !previousSound,
    );
    if (missingPreviousSound) {
      return resolveTargets([missingPreviousSound]);
    }
    const removedSound = previousSounds.find(
      (previousSound) => !nextById.has(previousSound.id),
    );
    if (removedSound) {
      return resolveTargets([{ previousSound: removedSound }]);
    }
    return resolveTargets(targets);
  }

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

  const changedRetainedSound = previousSounds.find((previousSound) => {
    const nextSound = nextById.get(previousSound.id);
    return nextSound && !isSameValue(previousSound, nextSound);
  });
  return resolveTargets([
    {
      previousSound: changedRetainedSound ?? previousSounds[0],
      nextSound: changedRetainedSound
        ? nextById.get(changedRetainedSound.id)
        : nextSounds[0],
    },
  ]);
};
