import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  ACTION_EXECUTION_PHASES,
  assertUnambiguousNavigationActions,
  orderActionEntries,
} from "../src/actionExecutionOrder.js";

const readSchemaActionTypes = (path) =>
  Object.keys(load(readFileSync(path, "utf8")).properties);

const readStoreActionTypes = () => {
  const source = readFileSync("src/stores/system.store.js", "utf8");
  const actionBlock = source
    .split("    // Actions\n", 2)
    .at(1)
    ?.split("  };\n\n  return createStore", 1)
    .at(0);
  if (!actionBlock) {
    throw new Error("Unable to locate the system-store action inventory");
  }
  return [...actionBlock.matchAll(/^    ([A-Za-z][A-Za-z0-9]+),$/gm)].map(
    ([, actionType]) => actionType,
  );
};

describe("canonical action execution order", () => {
  it("covers every authored system and presentation action", () => {
    const supportedActionTypes = new Set([
      ...readSchemaActionTypes("src/schemas/systemActions.yaml"),
      ...readSchemaActionTypes("src/schemas/presentationActions.yaml"),
      ...readStoreActionTypes(),
    ]);
    const scheduledActionTypes = ACTION_EXECUTION_PHASES.flatMap(
      ({ actions }) => actions,
    ).map((actionKey) => actionKey.split(":")[0]);

    expect(new Set(scheduledActionTypes)).toEqual(supportedActionTypes);
    expect(
      scheduledActionTypes.filter((actionType) => actionType === "random"),
    ).toHaveLength(2);
    expect(scheduledActionTypes).toHaveLength(supportedActionTypes.size + 1);
  });

  it("orders known actions by semantics instead of object insertion", () => {
    const actions = {
      nextLine: {},
      background: {},
      conditional: {},
      random: { distribution: { type: "integer" } },
      updateVariable: {},
      cleanAll: {},
    };

    expect(
      orderActionEntries(actions).map(([actionType]) => actionType),
    ).toEqual([
      "cleanAll",
      "updateVariable",
      "random",
      "conditional",
      "background",
      "nextLine",
    ]);
    expect(
      orderActionEntries(Object.fromEntries(Object.entries(actions).reverse())),
    ).toEqual(orderActionEntries(actions));
  });

  it("places weighted random in the decision phase before conditional", () => {
    const orderedTypes = orderActionEntries({
      conditional: {},
      background: {},
      random: { distribution: { type: "weighted" } },
      updateVariable: {},
    }).map(([actionType]) => actionType);

    expect(orderedTypes).toEqual([
      "updateVariable",
      "random",
      "conditional",
      "background",
    ]);
  });

  it("sorts host extensions before persistence/navigation by code unit", () => {
    expect(
      orderActionEntries({
        nextLine: {},
        zebraExtension: {},
        background: {},
        alpha: {},
        saveSlot: {},
      }).map(([actionType]) => actionType),
    ).toEqual([
      "background",
      "alpha",
      "zebraExtension",
      "saveSlot",
      "nextLine",
    ]);
  });

  it("rejects multiple direct navigation actions", () => {
    const entries = orderActionEntries({
      jumpToLine: { lineId: "line2" },
      nextLine: {},
    });

    expect(() => assertUnambiguousNavigationActions(entries)).toThrow(
      "action batch cannot contain multiple navigation actions: jumpToLine, nextLine",
    );
  });
});
