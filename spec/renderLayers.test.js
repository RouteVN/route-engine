import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_LAYER,
  RENDER_LAYER,
  VISUAL_LAYER,
  VISUAL_LAYER_VALUES,
} from "../src/renderLayers.js";

describe("render layer constants", () => {
  it("reserves choice above dialogue and keeps foreground visuals above choice", () => {
    expect(RENDER_LAYER).toMatchObject({
      VISUAL_BEHIND_BACKGROUND: 10,
      BACKGROUND: 20,
      VISUAL_BEHIND_CHARACTER: 30,
      CHARACTER: 40,
      VISUAL_BEHIND_DIALOGUE: 50,
      DIALOGUE: 60,
      CHOICE: 70,
      VISUAL_FOREGROUND: 80,
    });
    expect(VISUAL_LAYER.FOREGROUND).toBe(80);
    expect(VISUAL_LAYER_VALUES).toEqual([10, 30, 50, 80]);
    expect(DEFAULT_VISUAL_LAYER).toBe(50);
  });
});
