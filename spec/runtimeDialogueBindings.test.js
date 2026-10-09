import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadAll } from "js-yaml";
import {
  createEngineIntegrationHarness,
  findRenderElement,
} from "./integration/helpers/createEngineIntegrationHarness.js";
import { createSystemStore } from "../src/stores/system.store.js";
import { addDialogue } from "../src/stores/constructRenderState.js";

const createStore = (speed) =>
  createSystemStore({
    global: { runtime: { dialogueTextSpeed: speed } },
    projectData: {
      screen: { width: 640, height: 360 },
      resources: { variables: {} },
      story: {
        initialSceneId: "scene",
        scenes: {
          scene: {
            initialSectionId: "main",
            sections: {
              main: {
                lines: [
                  {
                    id: "bound",
                    actions: {
                      dialogue: {
                        content: [{ text: "${runtime.dialogueTextSpeed}" }],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  });

const render = (speed) => {
  const state = {
    elements: [{ id: "story", type: "container", children: [] }],
    animations: [],
  };
  addDialogue(state, {
    presentationState: {
      dialogue: {
        ui: { resourceId: "dialogue" },
        content: [{ text: "${runtime.dialogueTextSpeed}" }, { text: " units" }],
        initialRevealedContent: [{ text: "${runtime.dialogueTextSpeed}" }],
        lines: [{ content: [{ text: "Speed ${runtime.dialogueTextSpeed}" }] }],
      },
    },
    resources: {
      layouts: {
        dialogue: {
          elements: [
            {
              id: "plain",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
            {
              id: "reveal",
              type: "text-revealing",
              content: "${dialogue.content}",
              initialRevealedCharacters:
                "${dialogue.initialRevealedCharacters}",
            },
            {
              id: "nvl",
              type: "text",
              content: "${dialogue.lines[0].content[0].text}",
            },
          ],
        },
      },
    },
    variables: {},
    runtime: { dialogueTextSpeed: speed },
  });
  return state.elements[0].children;
};

describe("direct runtime dialogue bindings", () => {
  it.each([
    [84, 1120],
    [7, 1060],
    [100, 1180],
  ])(
    "counts rendered speed %s when calculating the auto deadline",
    (speed, delay) => {
      expect(createStore(speed).selectAutoForwardTimerDelay()).toBe(delay);
    },
  );

  it.each([84, 7, 100])(
    "interpolates speed %s in plain, revealing and NVL content and counts the appended prefix",
    (speed) => {
      const [plain, reveal, nvl] = render(speed);
      // Scalar string normalization is a separate renderer-contract change.
      expect(String(plain.content)).toBe(String(speed));
      expect(reveal.content.map(({ text }) => text).join("")).toBe(
        `${speed} units`,
      );
      expect(reveal.initialRevealedCharacters).toBe(String(speed).length);
      expect(nvl.content).toBe(`Speed ${speed}`);
    },
  );
});

const loadFixture = (name) =>
  loadAll(
    readFileSync(
      new URL(`../vt/specs/robustness/${name}.yaml`, import.meta.url),
      "utf8",
    ),
  ).at(-1);

describe("runtime dialogue VT companion journeys", () => {
  it("replaces the auto deadline when a direct runtime binding changes length", () => {
    const h = createEngineIntegrationHarness({
      projectData: loadFixture("runtime-dialogue-auto-delay"),
    });
    try {
      h.completeLatestRender();
      h.engine.handleAction("startAutoMode", {});
      h.ticker.tick(100);
      h.engine.handleAction("setDialogueTextSpeed", { value: 7 });
      h.completeLatestRender();
      h.ticker.tick(1059);
      expect(h.getPointer().lineId).toBe("bound");
      h.ticker.tick(1);
      expect(h.getPointer().lineId).toBe("continued");
    } finally {
      h.engine.dispose();
    }
  });

  it("keeps the rendered runtime prefix revealed when the live VT dialogue appends", () => {
    const h = createEngineIntegrationHarness({
      projectData: loadFixture("runtime-dialogue-bindings"),
    });
    try {
      h.completeLatestRender();
      h.engine.handleAction("setDialogueTextSpeed", { value: 91 });
      h.completeLatestRender();
      h.engine.handleAction("nextLine", {});
      expect(h.getPointer().lineId).toBe("appended");
      const revealed = findRenderElement(
        h.renderStates.at(-1).elements,
        "revealing",
      );
      expect(revealed.content.map(({ text }) => text).join("")).toBe(
        "Speed 91 units",
      );
      expect(revealed.initialRevealedCharacters).toBe(8);
    } finally {
      h.engine.dispose();
    }
  });
});
