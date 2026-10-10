// Read volume and playback from the actual renderer-owned HTMLVideoElements.
export const installVideoVolumeProbe = (routeGraphics) => {
  const previous = new Map();
  window.addEventListener("vt:videoVolumeCheckpoint", ({ detail }) => {
    window.__vtVideoGeometry = {};
    const videos = new Set();
    window.__vtVideoVolumes = Object.fromEntries(
      Object.entries(detail).map(([name, label]) => {
        const sprite = routeGraphics.findElementByLabel(label);
        const video = sprite?.texture?.source?.resource;
        window.__vtVideoGeometry[name] = {
          width: sprite?.width,
          height: sprite?.height,
          textureWidth: sprite?.texture?.width,
          textureHeight: sprite?.texture?.height,
          sourceWidth: sprite?.texture?.source?.width,
          sourceHeight: sprite?.texture?.source?.height,
          videoWidth: video?.videoWidth,
          videoHeight: video?.videoHeight,
        };
        if (!(video instanceof HTMLVideoElement))
          throw new Error(`No rendered video for ${label}`);
        if (videos.has(video))
          throw new Error("Volume fixture must use distinct video elements");
        videos.add(video);
        const before = previous.get(label);
        const snapshot = {
          volume: Number(video.volume.toFixed(6)),
          muted: video.muted,
          decoded: video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
          playing: !video.paused && !video.ended,
          hasProgress: video.currentTime > 0.1,
          continued: before
            ? video === before.video && video.currentTime > before.time + 0.05
            : null,
        };
        previous.set(label, { video, time: video.currentTime });
        return [name, snapshot];
      }),
    );
  });
};
