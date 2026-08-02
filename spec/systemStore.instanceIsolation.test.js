import { describe, expect, it } from "vitest";
import { createSystemStore } from "../src/stores/system.store.js";
import { createIntegrationProject } from "./integration/helpers/createEngineIntegrationHarness.js";

const createProject = () =>
  createIntegrationProject({
    resources: {
      variables: {
        score: { type: "number", scope: "context", default: 0 },
      },
    },
    sections: {
      main: {
        lines: [{ id: "line1", actions: {} }],
      },
    },
  });

const currentCheckpointActions = (store) => {
  const context = store.selectSystemState().contexts.at(-1);
  return context.rollback.timeline[context.rollback.currentIndex]
    .executedActions;
};

describe("system store instance ownership", () => {
  it("does not share rollback action-batch source state between stores", () => {
    const first = createSystemStore({ projectData: createProject() });
    const second = createSystemStore({ projectData: createProject() });

    first.beginRollbackActionBatch({ source: "line" });
    second.updateVariable({
      id: "secondStoreUpdate",
      operations: [{ variableId: "score", op: "set", value: 7 }],
    });
    first.endRollbackActionBatch({});

    expect(currentCheckpointActions(first)).toBeUndefined();
    expect(currentCheckpointActions(second)).toEqual([
      {
        type: "updateVariable",
        payload: {
          id: "secondStoreUpdate",
          operations: [{ variableId: "score", op: "set", value: 7 }],
        },
      },
    ]);
  });
});
