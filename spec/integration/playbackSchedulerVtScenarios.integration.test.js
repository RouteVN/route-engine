import { readFileSync } from "node:fs";
import { loadAll } from "js-yaml";
import { describe, expect, it } from "vitest";
import { createEngineIntegrationHarness } from "./helpers/createEngineIntegrationHarness.js";

const loadVtProject = (filename) => {
  const documents = loadAll(
    readFileSync(
      new URL(`../../vt/specs/robustness/${filename}`, import.meta.url),
      "utf8",
    ),
  ).filter((document) => document !== undefined);
  return documents.at(-1);
};

const getControlActions = (projectData, controlId, elementId) =>
  projectData.resources.controls[controlId].elements.find(
    (element) => element.id === elementId,
  ).click.payload.actions;

describe("playback scheduler VT companion journeys", () => {
  it("executes the exact auto-plus-authored VT project without skipping its success sentinel", () => {
    const projectData = loadVtProject("playback-auto-authored-co-due.yaml");
    const harness = createEngineIntegrationHarness({ projectData });
    harness.completeLatestRender();

    harness.engine.handleActions(
      getControlActions(projectData, "startControl", "start-button"),
    );
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(800);

    expect(harness.getPointer().lineId).toBe("success");
  });

  it("executes the exact skip-plus-authored VT project without skipping its success sentinel", () => {
    const projectData = loadVtProject("playback-skip-authored-co-due.yaml");
    const harness = createEngineIntegrationHarness({ projectData });

    harness.engine.handleActions(
      getControlActions(projectData, "startControl", "start-button"),
    );
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(80);

    expect(harness.getPointer().lineId).toBe("success");
  });

  it("executes the exact manual-completion VT project with the original remainder", () => {
    const projectData = loadVtProject(
      "playback-from-start-manual-completion.yaml",
    );
    const harness = createEngineIntegrationHarness({ projectData });

    harness.ticker.tick(4000);
    harness.engine.handleActions({ nextLine: {} });
    expect(harness.getState().global.isLineCompleted).toBe(true);
    harness.completeLatestRender();

    harness.ticker.tick(5999);
    expect(harness.getPointer().lineId).toBe("source");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("success");
  });
});
