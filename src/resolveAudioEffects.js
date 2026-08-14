import { createAudioRenderId } from "./audioIds.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const DEFAULT_AUDIO_VALUES = Object.freeze({
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

const normalizeChannelPropertyValue = ({
  property,
  value,
  relative,
  bgm,
  resources,
  renderedSound,
}) => {
  if (!bgm || !renderedSound) return value;

  if (property === "volume") {
    const soundVolume = getCanonicalSoundProperty({
      bgm,
      resources,
      renderedSound,
      property,
    });
    return (value * soundVolume) / 100;
  }

  if (property === "pan" && !relative) {
    const soundPan = getCanonicalSoundProperty({
      bgm,
      resources,
      renderedSound,
      property,
    });
    return clampAudioPan(value + soundPan);
  }

  return value;
};

const resolveRelativeChannelPanKeyframes = ({
  authoredInitialValue,
  authoredKeyframes,
  baselineBgm,
  compiledKeyframes,
  bgm,
  resources,
  renderedSound,
}) => {
  if (!bgm || !renderedSound) return compiledKeyframes;

  const localPan = getCanonicalSoundProperty({
    bgm,
    resources,
    renderedSound,
    property: "pan",
  });
  let channelPan =
    authoredInitialValue ?? baselineBgm?.pan ?? DEFAULT_AUDIO_VALUES.pan;

  return compiledKeyframes.map((compiled, index) => {
    const authored = authoredKeyframes[index];
    if (authored.relative !== true) {
      channelPan = authored.value;
      return compiled;
    }

    const startChannelPan = hasOwn(authored, "startValue")
      ? channelPan + authored.startValue
      : channelPan;
    const nextChannelPan = startChannelPan + authored.value;
    const { relative: _, ...absolute } = compiled;
    channelPan = nextChannelPan;

    return {
      ...absolute,
      ...(hasOwn(authored, "startValue")
        ? { startValue: clampAudioPan(startChannelPan + localPan) }
        : {}),
      value: clampAudioPan(nextChannelPan + localPan),
    };
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
  baselineBgm = bgm,
  property,
  propertyPath,
  renderedSound,
  resources,
  speed,
}) => {
  const compiled = compileProperty({
    property,
    authored,
    speed,
    propertyPath,
    normalizeValue: ({ value, relative }) =>
      normalizeChannelPropertyValue({
        property,
        value,
        relative,
        bgm,
        resources,
        renderedSound,
      }),
  });
  if (property === "pan") {
    compiled.keyframes = resolveRelativeChannelPanKeyframes({
      authoredInitialValue: authored.initialValue,
      authoredKeyframes: authored.keyframes,
      baselineBgm,
      compiledKeyframes: compiled.keyframes,
      bgm,
      resources,
      renderedSound,
    });
  }
  return compiled;
};

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
  for (const property of AUDIO_EFFECT_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;
    properties[property] = compileProperty({
      property,
      authored: resource.tween[property],
      speed,
      propertyPath: `${resourcePath}.tween.${property}`,
    });
  }

  return properties;
};

export const applyAudioEffectEndpoints = ({ bgm, resources = {} }) => {
  const resourceId = bgm?.audioEffects?.resourceId;
  const resource = resources.audioEffects?.[resourceId];
  const propertyTracks =
    resource?.type === "update"
      ? resource.tween
      : resource?.type === "transition"
        ? resource.next
        : undefined;
  if (!propertyTracks) return bgm;

  const sounds = bgm.sounds ?? [];
  if (sounds.length === 0) return bgm;

  const resolvedBgm = structuredClone(bgm);

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

const getTopLevelTransitionSoundGraph = (sound) => {
  if (!sound) return sound;
  const graph = { ...sound };
  delete graph.beginEffect;
  delete graph.endEffect;
  return graph;
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
  const sameGraph = isSameValue(
    getTopLevelTransitionSoundGraph(previousSound),
    getTopLevelTransitionSoundGraph(nextSound),
  );

  if (resource.type === "transition") {
    if (sameSource) {
      if (sameGraph) return null;
      throw new Error(
        `[${actionPath}.audioEffects]\n[${resourcePath}] Audio effect resource "${resourceId}" has type "transition", but the BGM action only updates a retained sound. Use an update resource.`,
      );
    }

    const properties = {};
    for (const property of AUDIO_EFFECT_PROPERTIES) {
      const lifecycle = {};
      const previousTrack = previousSound
        ? resource.prev?.[property]
        : undefined;
      if (previousTrack) {
        lifecycle.exit = compileChannelProperty({
          authored: previousTrack,
          bgm: previousBgm,
          property,
          propertyPath: `${resourcePath}.prev.${property}`,
          renderedSound: previousSound,
          resources: previousResources,
          speed,
        });
      }

      const nextTrack = nextSound ? resource.next?.[property] : undefined;
      if (nextTrack) {
        lifecycle.enter = compileChannelProperty({
          authored: nextTrack,
          bgm: nextBgm,
          property,
          propertyPath: `${resourcePath}.next.${property}`,
          renderedSound: nextSound,
          resources: nextResources,
          speed,
        });
        settlePropertyEndpoint({
          actionPath,
          compiled: lifecycle.enter,
          property,
          propertyPath: `${resourcePath}.next.${property}`,
          renderedSound: nextSound,
        });
      }

      if (Object.keys(lifecycle).length > 0) {
        properties[property] = lifecycle;
      }
    }
    if (Object.keys(properties).length === 0) return null;

    return {
      ...createBaseEffect(occurrence, targetId),
      properties,
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
  for (const property of AUDIO_EFFECT_PROPERTIES) {
    if (!hasOwn(resource.tween, property)) continue;
    const propertyPath = `${resourcePath}.tween.${property}`;
    const update = compileChannelProperty({
      property,
      authored: resource.tween[property],
      speed,
      propertyPath,
      baselineBgm: previousBgm,
      bgm: nextBgm,
      resources: nextResources,
      renderedSound: nextSound,
    });
    const nextValue = nextSound[property] ?? DEFAULT_AUDIO_VALUES[property];
    settlePropertyEndpoint({
      actionPath,
      compiled: update,
      property,
      propertyPath,
      renderedSound: nextSound,
    });

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
