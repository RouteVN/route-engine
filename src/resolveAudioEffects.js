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

const compileUpdateProperty = ({ property, authored, speed, resourcePath }) => {
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
    keyframes: authored.keyframes.map((keyframe) =>
      compileKeyframe(keyframe, speed),
    ),
  };
};

export const applyAudioEffectUpdateEndpoints = ({ bgm, resources = {} }) => {
  const resourceId = bgm?.audioEffects?.resourceId;
  const resource = resources.audioEffects?.[resourceId];
  if (resource?.type !== "update") return bgm;

  const sounds = bgm.sounds ?? [];
  if (sounds.length !== 1) return bgm;

  const resolvedBgm = structuredClone(bgm);
  const sound = resolvedBgm.sounds[0];

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
      sound.volume = DEFAULT_AUDIO_VALUES.volume;
    } else if (property === "pan") {
      resolvedBgm.pan = finalKeyframe.value;
      sound.pan = DEFAULT_AUDIO_VALUES.pan;
    } else {
      sound.playbackRate = finalKeyframe.value;
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
  previousChannel,
  nextChannel,
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

const PER_SOUND_SOURCE_IDENTITY_FIELDS = [
  "resourceId",
  "startAt",
  "endAt",
  "startDelayMs",
];

const isSameAuthoredSoundSource = (previous, next) =>
  previous?.id === next?.id &&
  PER_SOUND_SOURCE_IDENTITY_FIELDS.every((field) => {
    const fallback = field === "endAt" ? null : 0;
    return (previous?.[field] ?? fallback) === (next?.[field] ?? fallback);
  });

const getRenderedSound = (channel, soundId) => {
  const targetId = `bgm:${soundId}`;
  return channel?.children?.find((sound) => sound.id === targetId);
};

const compilePerSoundTransitionPhase = ({
  selection,
  selectionPath,
  phase,
  target,
  resources,
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
  if (resource.type !== "transition") {
    throw new Error(
      `[${selectionPath}]\n[${resourcePath}] Per-sound incoming and outgoing transitions require an audio effect resource with type "transition".`,
    );
  }

  const speed = getPlaybackSpeed(selection, selectionPath);
  const fade = phase === "enter" ? resource.next?.fade : resource.prev?.fade;
  const fadePath = `${resourcePath}.${phase === "enter" ? "next" : "prev"}.fade`;
  if (!fade) {
    throw new Error(
      `[${selectionPath}]\n[${fadePath}] The selected audio effect does not define the required ${phase === "enter" ? "incoming" : "outgoing"} fade.`,
    );
  }
  return compileFade(fade, phase, speed, target, fadePath);
};

export const resolvePerSoundAudioTransitions = ({
  occurrence,
  resources = {},
  previousChannel,
  nextChannel,
  previousBgm,
  nextBgm,
}) => {
  const previousSounds = previousBgm?.sounds ?? [];
  const nextSounds = nextBgm?.sounds ?? [];
  const previousById = new Map(
    previousSounds.map((sound) => [sound.id, sound]),
  );
  const nextById = new Map(nextSounds.map((sound) => [sound.id, sound]));
  const soundIds = [
    ...previousSounds.map((sound) => sound.id),
    ...nextSounds
      .filter((sound) => !previousById.has(sound.id))
      .map((sound) => sound.id),
  ];
  const effects = [];
  const actionPath = occurrence?.actionPath ?? "bgm";

  soundIds.forEach((soundId) => {
    const previousSound = previousById.get(soundId);
    const nextSound = nextById.get(soundId);
    if (
      previousSound &&
      nextSound &&
      isSameAuthoredSoundSource(previousSound, nextSound)
    ) {
      return;
    }

    const previousRenderedSound = getRenderedSound(previousChannel, soundId);
    const nextRenderedSound = getRenderedSound(nextChannel, soundId);
    const volume = {};
    const outgoingPath = `${actionPath}.sounds[${JSON.stringify(soundId)}].outgoingTransition`;
    const incomingPath = `${actionPath}.sounds[${JSON.stringify(soundId)}].incomingTransition`;
    const exit = compilePerSoundTransitionPhase({
      selection: previousSound?.outgoingTransition,
      selectionPath: outgoingPath,
      phase: "exit",
      target: previousRenderedSound?.volume ?? DEFAULT_AUDIO_VALUES.volume,
      resources,
    });
    const enter = compilePerSoundTransitionPhase({
      selection: nextSound?.incomingTransition,
      selectionPath: incomingPath,
      phase: "enter",
      target: nextRenderedSound?.volume ?? DEFAULT_AUDIO_VALUES.volume,
      resources,
    });
    if (exit) volume.exit = exit;
    if (enter) volume.enter = enter;
    if (Object.keys(volume).length === 0) return;

    const targetId = previousRenderedSound?.id ?? nextRenderedSound?.id;
    if (!targetId) return;
    effects.push({
      id: `audio-effect:${occurrence.occurrenceId}:sound${effects.length + 1}`,
      type: "audio-transition",
      targetId,
      properties: { volume },
    });
  });

  return effects;
};

export const resolveAudioEffects = (options) => {
  const legacyEffect = resolveAudioEffect(options);
  const perSoundEffects = resolvePerSoundAudioTransitions(options);
  if (legacyEffect && perSoundEffects.length > 0) {
    const actionPath = options.occurrence?.actionPath ?? "bgm";
    throw new Error(
      `[${actionPath}] Channel-level audioEffects cannot be combined with per-sound incomingTransition or outgoingTransition selections.`,
    );
  }
  return legacyEffect ? [legacyEffect] : perSoundEffects;
};
