import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";
import { diffPresentationState } from "../src/util.js";

const atlas = {
  frames: {
    "cloud-1.png": {
      frame: { x: 0, y: 0, w: 1920, h: 1080 },
    },
    "cloud-2.png": {
      frame: { x: 1920, y: 0, w: 1920, h: 1080 },
    },
  },
  meta: {
    size: { w: 3840, h: 1080 },
    scale: "1",
  },
};

const createResources = () => ({
  spritesheets: {
    animatedSky: {
      fileId: "animated-sky.png",
      width: 1920,
      height: 1080,
      jsonData: atlas,
      animations: {
        calm: {
          frames: [0],
          animationSpeed: 0.25,
          loop: false,
        },
        storm: {
          frames: [0, 1],
          animationSpeed: 0.5,
          loop: true,
        },
      },
    },
  },
});

const findBackground = (renderState) => {
  const story = renderState.elements.find((element) => element.id === "story");
  return story.children.find(
    (element) => element.id === "bg-cg-background-spritesheet-animation",
  );
};

describe("constructRenderState spritesheet backgrounds", () => {
  it("persists the selected playback while patching the current background", () => {
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "animatedSky",
          animationName: "calm",
          animationSpeed: 0.25,
          loop: false,
        },
      },
      {
        background: {
          animationName: "storm",
          opacity: 0.6,
        },
      },
    ]);

    expect(presentationState.background).toEqual({
      resourceId: "animatedSky",
      animationName: "storm",
      animationSpeed: 0.25,
      loop: false,
      opacity: 0.6,
    });
  });

  it("renders the selected animation with background appearance and transform", () => {
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "animatedSky",
          animationName: "storm",
          animationSpeed: 0.75,
          loop: false,
          opacity: 0.6,
          x: 900,
          y: 500,
          scaleX: 1.2,
          scaleY: 1.1,
        },
      },
    ]);

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      screen: { width: 1920, height: 1080 },
    });

    expect(findBackground(renderState)).toEqual({
      id: "bg-cg-background-spritesheet-animation",
      type: "spritesheet-animation",
      x: 900,
      y: 500,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 0,
      scaleX: 1.2,
      scaleY: 1.1,
      alpha: 0.6,
      width: 1920,
      height: 1080,
      src: "animated-sky.png",
      atlas,
      playback: {
        frames: [0, 1],
        animationSpeed: 0.75,
        loop: false,
      },
    });
  });

  it("uses the first spritesheet animation when animationName is omitted", () => {
    const renderState = constructRenderState({
      presentationState: {
        background: {
          resourceId: "animatedSky",
        },
      },
      resources: createResources(),
      screen: { width: 1920, height: 1080 },
    });

    expect(findBackground(renderState)).toMatchObject({
      x: 960,
      y: 540,
      playback: {
        frames: [0],
        animationSpeed: 0.25,
        loop: false,
      },
    });
  });

  it("rejects an unknown spritesheet animation", () => {
    expect(() =>
      constructRenderState({
        presentationState: {
          background: {
            resourceId: "animatedSky",
            animationName: "missing",
          },
        },
        resources: createResources(),
      }),
    ).toThrow(
      "Animation 'missing' not found in spritesheet resource 'animatedSky'",
    );
  });

  it("keeps spritesheet playback fields in background presentation diffs", () => {
    expect(
      diffPresentationState(
        {},
        {
          background: {
            resourceId: "animatedSky",
            animationName: "storm",
            animationSpeed: 0.75,
            loop: false,
          },
        },
      ),
    ).toEqual({
      background: {
        resource: {
          changeType: "add",
          data: {
            resourceId: "animatedSky",
            animationName: "storm",
            animationSpeed: 0.75,
            loop: false,
          },
        },
      },
    });
  });
});
