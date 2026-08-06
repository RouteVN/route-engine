const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isSameSourceIdentity = (previous, next) =>
  previous?.src === next?.src &&
  (previous?.startAt ?? 0) === (next?.startAt ?? 0) &&
  (previous?.endAt ?? null) === (next?.endAt ?? null) &&
  (previous?.startDelayMs ?? 0) === (next?.startDelayMs ?? 0);

export const hasSameBgmSourceTopology = (previous, next) => {
  if (!previous || !next) return false;
  const previousChildren = previous.children ?? [];
  const nextChildren = next.children ?? [];
  return (
    previousChildren.length === nextChildren.length &&
    previousChildren.every(
      (sound, index) =>
        sound.id === nextChildren[index]?.id &&
        isSameSourceIdentity(sound, nextChildren[index]),
    )
  );
};

const isSameValue = (previous, next) =>
  JSON.stringify(previous) === JSON.stringify(next);

const getPlaybackSpeed = (selection, actionPath) => {
  const speed = selection?.playback?.speed ?? 1;
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
    throw new Error(
      `[${actionPath}.animations.playback.speed] Audio animation speed must be a finite number greater than 0.`,
    );
  }
  return speed;
};

const compileFade = (fade, side, speed) => {
  if (!fade) return undefined;
  return {
    ...(side === "next" ? { initialValue: 0 } : {}),
    keyframes: [
      {
        value: side === "prev" ? 0 : 100,
        delay: (fade.delay ?? 0) / speed,
        duration: fade.duration / speed,
        easing: fade.easing ?? "linear",
      },
    ],
  };
};

const compileTransitionSide = (channel, authoredSide, side, speed) => {
  if (!channel) return undefined;
  const fade = compileFade(authoredSide?.fade, side, speed);
  return {
    channel: structuredClone(channel),
    ...(fade ? { fade } : {}),
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
    keyframes: authored.keyframes.map((keyframe) => ({
      value: keyframe.value === "target" ? target : keyframe.value,
      delay: (keyframe.delay ?? 0) / speed,
      duration: keyframe.duration / speed,
      easing: keyframe.easing ?? "linear",
      ...(keyframe.relative === true ? { relative: true } : {}),
    })),
  };
};

const createBaseAnimation = (occurrence, type) => ({
  id: `audio-animation:${occurrence.occurrenceId}`,
  occurrenceId: occurrence.occurrenceId,
  type,
  targetId: occurrence.targetId ?? "channel:bgm",
});

export const resolveAudioAnimation = ({
  occurrence,
  resources = {},
  previousChannel,
  nextChannel,
}) => {
  if (!occurrence?.selection) return null;

  const selection = occurrence.selection;
  const actionPath = occurrence.actionPath ?? "bgm";
  const resourceId = selection.resourceId;
  const resourcePath = `resources.audioAnimations.${resourceId}`;
  const resource = resources.audioAnimations?.[resourceId];
  if (!resource) {
    throw new Error(
      `[${actionPath}.animations.resourceId]\n[${resourcePath}] Unknown audio animation resource "${resourceId}".`,
    );
  }

  const speed = getPlaybackSpeed(selection, actionPath);
  const sameTopology = hasSameBgmSourceTopology(previousChannel, nextChannel);
  const sameGraph = isSameValue(previousChannel, nextChannel);

  if (resource.type === "transition") {
    if (!previousChannel && !nextChannel) return null;
    if (sameTopology) {
      if (sameGraph) return null;
      throw new Error(
        `[${actionPath}.animations]\n[${resourcePath}] Audio animation resource "${resourceId}" has type "transition", but the BGM action only updates a retained graph. Use an update resource.`,
      );
    }

    return {
      ...createBaseAnimation(occurrence, "transition"),
      ...(previousChannel
        ? {
            prev: compileTransitionSide(
              previousChannel,
              resource.prev,
              "prev",
              speed,
            ),
          }
        : {}),
      ...(nextChannel
        ? {
            next: compileTransitionSide(
              nextChannel,
              resource.next,
              "next",
              speed,
            ),
          }
        : {}),
    };
  }

  if (resource.type !== "update") {
    throw new Error(
      `[${resourcePath}.type] Unsupported audio animation type "${resource.type}".`,
    );
  }
  if (!previousChannel || !nextChannel || !sameTopology) {
    throw new Error(
      `[${actionPath}.animations]\n[${resourcePath}] Audio animation resource "${resourceId}" has type "update", but the BGM action changes source identity or topology. Use a transition resource.`,
    );
  }
  if (sameGraph) return null;

  const tween = {};
  for (const property of ["volume", "pan"]) {
    if (!hasOwn(resource.tween, property)) continue;
    const previousValue =
      previousChannel[property] ?? (property === "volume" ? 100 : 0);
    const nextValue =
      nextChannel[property] ?? (property === "volume" ? 100 : 0);
    if (Object.is(previousValue, nextValue)) continue;
    tween[property] = compileUpdateProperty({
      property,
      authored: resource.tween[property],
      target: nextValue,
      speed,
      resourcePath,
    });
  }

  if (Object.keys(tween).length === 0) {
    throw new Error(
      `[${actionPath}.animations]\n[${resourcePath}] Audio update resource "${resourceId}" does not animate a BGM channel property changed by this action.`,
    );
  }

  return {
    ...createBaseAnimation(occurrence, "update"),
    tween,
  };
};
