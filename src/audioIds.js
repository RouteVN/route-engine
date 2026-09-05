export const escapeAudioIdComponent = (component) =>
  String(component).replaceAll("%", "%25").replaceAll(":", "%3A");

export const createAudioRenderId = (...components) =>
  components.map(escapeAudioIdComponent).join(":");

export const getBgmSounds = (bgm) =>
  Array.isArray(bgm?.sounds)
    ? bgm.sounds
    : bgm?.resourceId
      ? [
          {
            id: bgm.resourceId,
            resourceId: bgm.resourceId,
            loop: bgm.loop ?? true,
            volume: bgm.volume,
            startDelayMs: bgm.startDelayMs ?? 0,
          },
        ]
      : [];

const hasLegacyDelay = (bgm) =>
  !Array.isArray(bgm?.sounds) && bgm?.startDelayMs > 0;

export const createBgmSoundRenderId = (bgm, sound) => {
  // A channel-loop handoff cancels pending starts in route-graphics 1.43.0.
  // Delayed legacy playback needs its own source to schedule the new start.
  if (hasLegacyDelay(bgm)) {
    return createAudioRenderId("bgm", "legacy-delay", sound.resourceId);
  }
  // Older channel drafts used "default" for legacy BGM. Membership is not
  // part of this alias: adding another sound must not restart the music.
  return createAudioRenderId(
    "bgm",
    sound.id === "default" ? sound.resourceId : sound.id,
  );
};

export const resolveBgmSoundRenderIds = ({
  bgm,
  resources,
  previousBgmRender,
}) => {
  const sounds = getBgmSounds(bgm).filter(
    (sound) => resources.sounds?.[sound.resourceId],
  );
  const previousSounds = getBgmSounds(previousBgmRender?.bgm)
    .filter((sound) => previousBgmRender.resources?.sounds?.[sound.resourceId])
    .map((sound, index) => ({
      sound,
      renderId: previousBgmRender.channel?.children[index]?.id,
    }))
    .filter(({ renderId }) => renderId !== undefined);
  const ids = new Map();
  const usedIds = new Set();
  const retain = (sound, previous) => {
    if (!previous || usedIds.has(previous.renderId)) return;
    ids.set(sound.id, previous.renderId);
    usedIds.add(previous.renderId);
  };

  if (hasLegacyDelay(bgm) === hasLegacyDelay(previousBgmRender?.bgm)) {
    // Reserve retained authored IDs before resolving compatibility aliases,
    // including when a new clip's ID collides with an existing alias.
    sounds.forEach((sound) =>
      retain(
        sound,
        previousSounds.find((item) => item.sound.id === sound.id),
      ),
    );
    sounds.forEach((sound) => {
      if (ids.has(sound.id)) return;
      retain(
        sound,
        previousSounds.find(
          (item) =>
            item.sound.resourceId === sound.resourceId &&
            createBgmSoundRenderId(previousBgmRender.bgm, item.sound) ===
              createBgmSoundRenderId(bgm, sound),
        ),
      );
    });
  }

  // On first entry, explicit IDs take precedence over the default alias.
  const explicitFirst = [...sounds].sort(
    (a, b) => Number(a.id === "default") - Number(b.id === "default"),
  );
  explicitFirst.forEach((sound) => {
    if (ids.has(sound.id)) return;
    let id = createBgmSoundRenderId(bgm, sound);
    if (usedIds.has(id)) id = createAudioRenderId("bgm", sound.id);
    if (usedIds.has(id)) id = createAudioRenderId("bgm", "clip", sound.id);
    let occurrence = 0;
    while (usedIds.has(id)) {
      id = createAudioRenderId("bgm", "clip", sound.id, ++occurrence);
    }
    ids.set(sound.id, id);
    usedIds.add(id);
  });
  return ids;
};
