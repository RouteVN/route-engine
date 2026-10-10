// The pinned renderer loads video textures before metadata is available. Wait
// before creating sprites so their cached geometry uses decoded dimensions.
// Only fixtures with vtWaitForVideoTextures explicitly opt into this check.
export const waitForVtVideoTextures = async (textures) => {
  await Promise.all(
    textures
      .filter(
        (texture) => texture?.source?.resource instanceof HTMLVideoElement,
      )
      .map(
        (texture) =>
          new Promise((resolve, reject) => {
            const video = texture.source.resource;
            const deadline = performance.now() + 5000;
            const check = () => {
              if (video.error) {
                reject(
                  new Error(
                    `VT video failed to decode: ${video.error.message}`,
                  ),
                );
                return;
              }
              if (
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                video.videoWidth > 0 &&
                video.videoHeight > 0 &&
                texture.source.width === video.videoWidth &&
                texture.source.height === video.videoHeight &&
                texture.orig.width === video.videoWidth &&
                texture.orig.height === video.videoHeight
              ) {
                resolve();
                return;
              }
              if (performance.now() >= deadline) {
                reject(
                  new Error("Timed out waiting for decoded VT video textures"),
                );
                return;
              }
              requestAnimationFrame(check);
            };
            check();
          }),
      ),
  );
};
