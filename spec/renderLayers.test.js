import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_LAYER,
  RENDER_LAYER,
  VISUAL_LAYER,
  VISUAL_LAYER_VALUES,
} from "../src/renderLayers.js";

describe("render layer constants", () => {
  it("keeps choice between behind-choice and foreground visuals", () => {
    expect(RENDER_LAYER).toMatchObject({
      VISUAL_BEHIND_BACKGROUND: 10,
      BACKGROUND: 20,
      VISUAL_BEHIND_CHARACTER: 30,
      CHARACTER: 40,
      VISUAL_BEHIND_DIALOGUE: 50,
      DIALOGUE: 60,
      VISUAL_BEHIND_CHOICE: 70,
      CHOICE: 80,
      VISUAL_FOREGROUND: 90,
    });
    expect(VISUAL_LAYER.BEHIND_CHOICE).toBe(70);
    expect(VISUAL_LAYER.FOREGROUND).toBe(90);
    expect(VISUAL_LAYER_VALUES).toEqual([10, 30, 50, 70, 90]);
    expect(DEFAULT_VISUAL_LAYER).toBe(50);
  });
});
