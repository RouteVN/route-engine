const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const DEFAULT_AUDIO_VALUES = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

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

const getPlaybackSpeed = (selection, actionPath) => {
  const speed = selection?.playback?.speed ?? 1;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
    throw new Error(
      `[${actionPath}.audioEffects.playback.speed] Audio effect speed must be a finite number greater than 0.`,
    );
  }
  return speed;
};

const compileKeyframe = (keyframe, speed, target) => ({
  ...(hasOwn(keyframe, "startValue")
    ? { startValue: keyframe.startValue }
    : {}),
  value: keyframe.value === "target" ? target : keyframe.value,
  delay: (keyframe.delay ?? 0) / speed,
  duration: keyframe.duration / speed,
  easing: keyframe.easing ?? "linear",
  ...(keyframe.relative === true ? { relative: true } : {}),
});

const compileFade = (fade, phase, speed, target) => {
  if (!fade) return undefined;
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
  target,
  speed,
  resourcePath,
}) => {
  const finalKeyframe = authored.keyframes.at(-1);
  if (finalKeyframe?.value !== "target" || finalKeyframe.relative === true) {
    throw new Error(
      `[${resourcePath}.tween.${property}.keyframes] The final keyframe must use the absolute value "target".`,
    );
  }

  return {
    keyframes: authored.keyframes.map((keyframe) =>
      compileKeyframe(keyframe, speed, target),
    ),
  };
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

  const speed = getPlaybackSpeed(selection, actionPath);
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
      0,
    );
    const enter = compileFade(
      nextSound ? resource.next?.fade : undefined,
      "enter",
      speed,
      nextSound?.volume ?? DEFAULT_AUDIO_VALUES.volume,
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
  if (sameGraph) return null;

  const properties = {};
  for (const property of ["volume", "pan", "playbackRate"]) {
    if (!hasOwn(resource.tween, property)) continue;
    const previousValue =
      previousSound[property] ?? DEFAULT_AUDIO_VALUES[property];
    const nextValue = nextSound[property] ?? DEFAULT_AUDIO_VALUES[property];
    if (Object.is(previousValue, nextValue)) continue;
    properties[property] = {
      update: compileUpdateProperty({
        property,
        authored: resource.tween[property],
        target: nextValue,
        speed,
        resourcePath,
      }),
    };
  }

  if (Object.keys(properties).length === 0) {
    throw new Error(
      `[${actionPath}.audioEffects]\n[${resourcePath}] Audio update resource "${resourceId}" does not animate a BGM sound property changed by this action.`,
    );
  }

  return {
    ...createBaseEffect(occurrence, targetId),
    properties,
  };
};
