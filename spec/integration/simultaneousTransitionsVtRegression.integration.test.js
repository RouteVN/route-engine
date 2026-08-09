import { readFileSync } from "node:fs";
import { loadAll } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createEngineIntegrationHarness,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";

const loadRegressionProject = () =>
  loadAll(
    readFileSync(
      new URL(
        "../../vt/specs/robustness/simultaneous-background-character-transitions.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  )
    .filter((document) => document !== undefined)
    .at(-1);

const getControlActions = (projectData, controlId) =>
  projectData.resources.controls[controlId].elements[0].click.payload.actions;

describe("simultaneous transition VT regression", () => {
  it("changes and removes the character while a background transition remains active", () => {
    const projectData = loadRegressionProject();
    const harness = createEngineIntegrationHarness({ projectData });

    expect(harness.getPointer().lineId).toBe("line8");

    harness.engine.handleActions(
      getControlActions(projectData, "go-to-line-9"),
    );
    const line9 = harness.renderStates.at(-1);

    expect(harness.getPointer().lineId).toBe("line9");
    expect(line9.animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-transition",
        targetId: "bg-cg-background-sprite",
        playback: { continuity: "persistent" },
      }),
    ]);
    expect(
      findRenderElement(line9.elements, "character-container-actor-body"),
    ).toMatchObject({ src: "char_sprite_1" });

    harness.engine.handleActions(
      getControlActions(projectData, "go-to-line-10"),
    );
    const line10 = harness.renderStates.at(-1);

    expect(harness.getPointer().lineId).toBe("line10");
    expect(line10.animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-transition",
        targetId: "bg-cg-background-sprite",
      }),
      expect.objectContaining({
        id: "character-container-actor-animation-transition",
        targetId: "character-container-actor",
      }),
    ]);
    expect(
      findRenderElement(line10.elements, "character-container-actor-body"),
    ).toMatchObject({ src: "char_sprite_3" });

    harness.engine.handleActions(
      getControlActions(projectData, "go-to-line-11"),
    );
    const line11 = harness.renderStates.at(-1);

    expect(harness.getPointer().lineId).toBe("line11");
    expect(
      findRenderElement(line11.elements, "character-container-actor"),
    ).toBeUndefined();
  });
});
