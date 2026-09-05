export const escapeAudioIdComponent = (component) =>
  String(component).replaceAll("%", "%25").replaceAll(":", "%3A");

export const createAudioRenderId = (...components) =>
  components.map(escapeAudioIdComponent).join(":");

// Older single-clip channel drafts used "default" for legacy BGM.
export const createBgmSoundRenderId = (bgm, sound) =>
  createAudioRenderId(
    "bgm",
    bgm.sounds?.length === 1 && sound.id === "default"
      ? sound.resourceId
      : sound.id,
  );
