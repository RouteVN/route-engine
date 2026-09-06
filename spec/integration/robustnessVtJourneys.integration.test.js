import { readFileSync } from "node:fs";
import { loadAll } from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineIntegrationHarness } from "./helpers/createEngineIntegrationHarness.js";
import {
  createExpectedErrorHandler,
  dispatchEngineActionsEvent,
  readEngineCheckpoint,
} from "../../vt/static/engineRobustnessProbe.js";

const active = [];
afterEach(() => {
  active.splice(0).forEach(({ engine }) => engine.dispose());
  vi.restoreAllMocks();
});
const load = (name) =>
  loadAll(
    readFileSync(
      new URL(`../../vt/specs/robustness/${name}.yaml`, import.meta.url),
      "utf8",
    ),
  ).at(-1);
const setup = (name) => {
  const { l10nData, ...projectData } = load(name);
  const harness = createEngineIntegrationHarness({ projectData, l10nData });
  active.push(harness);
  harness.completeLatestRender();
  let observedError;
  const handleEvent = createExpectedErrorHandler({
    getEngine: () => harness.engine,
    handleEvent: harness.eventHandler,
    observe: (value) => {
      observedError = value;
    },
  });
  return {
    ...harness,
    checkpoint: () =>
      readEngineCheckpoint(harness.engine, {
        timerCount: harness.ticker.size,
        renderState: harness.renderStates.at(-1),
      }),
    getError: () => observedError,
    click: async (resourceId, elementId) => {
      const resource =
        projectData.resources.controls[resourceId] ??
        projectData.resources.layouts[resourceId];
      const element = resource.elements.find(
        (element) => element.id === elementId,
      );
      expect(element?.click?.payload).toBeDefined();
      const renderCount = harness.renderStates.length;
      await handleEvent("click", structuredClone(element.click.payload));
      if (harness.renderStates.length > renderCount)
        harness.completeLatestRender();
    },
  };
};

describe("robustness VT companion journeys", () => {
  it("rejects the exact VT duplicate project through renderer input and continues playing", async () => {
    const h = setup("duplicate-line-update-rejection");
    await h.click("main", "invalid");
    expect(h.getError()).toMatchObject({ matched: true, statePreserved: true });
    expect(h.checkpoint().pointer.lineId).toBe("entry");
    await h.click("main", "next");
    expect(h.checkpoint()).toMatchObject({
      pointer: { lineId: "next" },
      dialogueText: "Still playable after the rejected update.",
      pendingEffects: [],
    });
  });

  it("recovers from the exact VT cycle without admitting stale renderer completion", async () => {
    const h = setup("routing-cycle-recovery");
    const oldRenderId = h.renderStates.at(-1).id;
    const original = h.engine.handleLineActions;
    let entries = 0;
    vi.spyOn(h.engine, "handleLineActions").mockImplementation((...args) => {
      if (++entries > 1100)
        throw new Error("Test watchdog: immediate routing did not terminate");
      return original(...args);
    });
    await h.click("main", "loop");
    expect(h.getError().matched).toBe(true);
    expect(h.ticker.size).toBe(0);
    dispatchEngineActionsEvent(h.engine, {
      detail: {
        actions: JSON.stringify({ resetStoryAtSection: { sectionId: "safe" } }),
      },
    });
    h.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
      id: oldRenderId,
      aborted: false,
    });
    expect(h.checkpoint().completed).toBe(false);
    h.completeLatestRender();
    await h.click("safe", "next");
    expect(h.checkpoint()).toMatchObject({
      pointer: { sectionId: "safe", lineId: "recovered" },
      completed: true,
      pendingEffects: [],
      timerCount: 0,
    });
  });

  it("preserves appended dialogue across the VT checkpoint, rollback, save and load", async () => {
    const h = setup("cached-dialogue-save-rollback");
    await h.click("seek", "seek");
    for (let index = 0; index < 3; index += 1) await h.click("main", "next");
    const saved = h.checkpoint();
    expect(saved.dialogueText).toBe("Checkpoint prefix + appended tail.");
    expect(saved.pointer.lineId).toBe("line-64");
    await h.click("main", "save");
    await h.click("main", "next");
    await h.click("main", "back");
    expect(h.checkpoint().dialogueText).toBe(saved.dialogueText);
    await h.click("main", "next");
    await h.click("main", "load");
    expect(h.checkpoint()).toMatchObject({
      pointer: saved.pointer,
      dialogueText: saved.dialogueText,
      historyLineIds: saved.historyLineIds,
      pendingEffects: [],
    });
  });

  it("clears and reconstructs the exact VT NVL page without duplicating rows", async () => {
    const h = setup("cached-nvl-clear-reentry");
    await h.click("main", "next");
    const expected = ["First NVL row.", "Second NVL row."];
    expect(h.checkpoint().nvlTexts).toEqual(expected);
    await h.click("main", "next");
    expect(h.checkpoint().nvlTexts).toEqual(["Fresh page only."]);
    await h.click("main", "back");
    expect(h.checkpoint().nvlTexts).toEqual(expected);
    await h.click("main", "restart");
    await h.click("main", "next");
    expect(h.checkpoint().nvlTexts).toEqual(expected);
  });

  it("refreshes both cached backlog rows and speakers using the exact VT localization package", async () => {
    const h = setup("cached-backlog-localization");
    await h.click("main", "next");
    expect(h.checkpoint().textById).toMatchObject({
      "history-row-0": "Source speaker: Source first.",
      "history-row-1": "Source speaker: Source second.",
    });
    await h.click("history", "translate");
    expect(h.checkpoint().textById).toMatchObject({
      "history-row-0": "Translated speaker: Translated first.",
      "history-row-1": "Translated speaker: Translated second.",
    });
    await h.click("history", "source");
    expect(h.checkpoint().textById).toMatchObject({
      "history-row-0": "Source speaker: Source first.",
      "history-row-1": "Source speaker: Source second.",
    });
  });
});
