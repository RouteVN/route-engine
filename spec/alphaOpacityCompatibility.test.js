import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";

describe("alpha and opacity presentation compatibility", () => {
  it("accepts alpha as the preferred appearance field and gives it precedence", () => {
    const state = constructPresentationState([
      {
        screen: { alpha: 0.8, opacity: 0.1 },
        background: {
          resourceId: "background",
          alpha: 0.7,
          opacity: 0.2,
        },
        character: {
          items: [
            {
              id: "lead",
              transformId: "center",
              sprites: [{ id: "body", resourceId: "lead-body" }],
              alpha: 0.6,
              opacity: 0.3,
            },
          ],
        },
        visual: {
          items: [
            {
              id: "logo",
              resourceId: "logo",
              alpha: 0.5,
              opacity: 0.4,
            },
          ],
        },
      },
    ]);

    expect(state.screen).toEqual({ opacity: 0.8 });
    expect(state.background).toMatchObject({ opacity: 0.7 });
    expect(state.character.items[0]).toMatchObject({ opacity: 0.6 });
    expect(state.visual.items[0]).toMatchObject({ opacity: 0.5 });
    expect(state.background).not.toHaveProperty("alpha");
    expect(state.character.items[0]).not.toHaveProperty("alpha");
    expect(state.visual.items[0]).not.toHaveProperty("alpha");
  });

  it("keeps legacy opacity working and lets either alias update persisted appearance", () => {
    const state = constructPresentationState([
      {
        screen: { opacity: 0.9 },
        background: { resourceId: "background", opacity: 0.8 },
        visual: {
          items: [{ id: "logo", resourceId: "logo", alpha: 0.7 }],
        },
      },
      {
        screen: { alpha: 0.6 },
        background: { alpha: 0.5 },
        visual: {
          items: [{ id: "logo", opacity: 0.4 }],
        },
      },
    ]);

    expect(state.screen).toEqual({ opacity: 0.6 });
    expect(state.background).toMatchObject({
      resourceId: "background",
      opacity: 0.5,
    });
    expect(state.visual.items[0]).toMatchObject({
      id: "logo",
      resourceId: "logo",
      opacity: 0.4,
    });
  });
});
