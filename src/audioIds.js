export const escapeAudioIdComponent = (component) =>
  String(component).replaceAll("%", "%25").replaceAll(":", "%3A");

export const createAudioRenderId = (...components) =>
  components.map(escapeAudioIdComponent).join(":");
