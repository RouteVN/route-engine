// Observe the renderer's actual media element, not just the engine render ID.
export const installVideoPlaybackProbe = (routeGraphics) => {
  const checkpoints = new Map();
  window.addEventListener("vt:videoCheckpoint", ({ detail }) => {
    const label = detail?.label;
    const sprite = routeGraphics.findElementByLabel(label);
    const video = sprite?.texture?.source?.resource;
    const previous = checkpoints.get(label);
    if (!(video instanceof HTMLVideoElement)) {
      throw new Error(`No rendered video for ${label}`);
    }
    window.__vtVideoCheckpoint = {
      decoded: video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      playing: !video.paused && !video.ended,
      hasProgress: video.currentTime > 0.1,
      sameElement: previous ? video === previous.video : null,
      sameSource: previous ? video.currentSrc === previous.src : null,
      advanced: previous ? video.currentTime > previous.time + 0.05 : null,
    };
    checkpoints.set(label, {
      video,
      time: video.currentTime,
      src: video.currentSrc,
    });
  });
};
