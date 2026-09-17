import { afterEach, describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { processActionTemplates } from "../src/util.js";
import { cloneLiteralVariableValue } from "../src/literalVariableValues.js";

const engines = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});
const createEngine = (config = {}) => {
  const engine = createRouteEngine({ handlePendingEffects: () => {} });
  engines.push(engine);
  engine.init({
    namespace: "project-one",
    initialState: {
      projectData: {
        resources: {
          variables: {
            source: { type: "string", scope: "context", default: "REPLACED" },
            objectOne: {
              type: "object",
              scope: "context",
              default: {},
              ...config,
            },
          },
        },
        story: {
          initialSceneId: "sceneOne",
          scenes: {
            sceneOne: {
              initialSectionId: "sectionOne",
              sections: {
                sectionOne: {
                  lines: [
                    { id: "lineOne", actions: {} },
                    { id: "lineTwo", actions: {} },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
  return engine;
};
const actions = (value, extra = {}) => ({
  updateVariable: {
    id: "updateOne",
    operations: [{ variableId: "objectOne", op: "set", value, ...extra }],
  },
});
const objectValue = (engine) =>
  engine.selectSystemState().contexts.at(-1).variables.objectOne;
const literal = { valueMode: "literal" };

for (const value of [
  {
    text: "${variables.source}",
    event: "_event.value",
    nested: [{ text: "${variables.source}" }],
  },
  [
    "${variables.source}",
    "_event.value",
    { actions: { nextLine: {} }, valueMode: "not-a-marker" },
  ],
  JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"text":"${variables.source}"}}}',
  ),
]) {
  it("preserves every marked JSON value without interpolation or prototype mutation", () => {
    const engine = createEngine();
    const input = structuredClone(value);
    engine.handleActions(actions(input, literal), {
      _event: { value: "EVENT" },
    });
    expect(objectValue(engine)).toEqual(value);
    expect(Object.getPrototypeOf(objectValue(engine))).toBe(
      Array.isArray(value) ? Array.prototype : Object.prototype,
    );
    expect({}.polluted).toBeUndefined();
    expect(input).toEqual(value);
  });
}

it("retains old interpolation for unmarked objects and arrays beside literal writes", () => {
  const engine = createEngine();
  for (const value of [
    { text: "${variables.source}", event: "_event.value" },
    ["${variables.source}", "_event.value"],
  ]) {
    engine.handleActions(actions(value), { _event: { value: "EVENT" } });
    expect(objectValue(engine)).toEqual(
      Array.isArray(value)
        ? ["REPLACED", "EVENT"]
        : { text: "REPLACED", event: "EVENT" },
    );
    engine.handleActions(actions(value, literal), {
      _event: { value: "EVENT" },
    });
    expect(objectValue(engine)).toEqual(value);
  }
});

it("does not treat action-like objects inside unmarked user data as new operations", () => {
  const engine = createEngine();
  const value = {
    updateVariable: {
      operations: [
        {
          op: "set",
          valueMode: "literal",
          value: { text: "${variables.source}" },
        },
      ],
    },
  };
  engine.handleActions(actions(value));
  expect(objectValue(engine).updateVariable.operations[0].value.text).toBe(
    "REPLACED",
  );
});

it("preserves marked immediate conditional operations", () => {
  const engine = createEngine();
  const value = { text: "${variables.source}", event: "_event.value" };
  engine.handleActions({
    conditional: {
      branches: [{ when: true, actions: actions(value, literal) }],
    },
  });
  expect(objectValue(engine)).toEqual(value);
});

it("preserves deferred confirmation actions and their marker until execution", () => {
  const engine = createEngine();
  const value = { text: "${variables.source}", event: "_event.value" };
  engine.handleActions({
    showConfirmDialog: {
      resourceId: "confirmOne",
      confirmActions: actions(value, literal),
    },
  });
  const deferred =
    engine.selectSystemState().global.confirmDialog.confirmActions;
  expect(deferred.updateVariable.operations[0].valueMode).toBe("literal");
  engine.handleActions(deferred);
  expect(objectValue(engine)).toEqual(value);
});

it("keeps marked choice click payloads inert during presentation preparation", () => {
  const value = { text: "${variables.source}" };
  const prepared = processActionTemplates(
    {
      choice: {
        items: [
          {
            content: "Choice One",
            events: { click: { actions: actions(value, literal) } },
          },
        ],
      },
    },
    { variables: { source: "REPLACED" } },
  );
  expect(
    prepared.choice.items[0].events.click.actions.updateVariable.operations[0]
      .value,
  ).toEqual(value);
});

it.each([
  [{ valueMode: "template" }, {}],
  [{ valueMode: undefined }, {}],
  [{ valueMode: "literal", op: "increment" }, {}],
  [{ valueMode: "literal", roundTo: 2 }, {}],
  [literal, null],
  [literal, "${variables.source}"],
])(
  "rejects malformed explicit marker operations without changing state",
  (options, value) => {
    const engine = createEngine();
    expect(() => engine.handleActions(actions(value, options))).toThrow(
      /literal|Literal/,
    );
    expect(objectValue(engine)).toEqual({});
  },
);

it("still enforces variable type and readonly permission", () => {
  const engine = createEngine();
  const request = actions({}, literal);
  request.updateVariable.operations[0].variableId = "source";
  expect(() => engine.handleActions(request)).toThrow(/object variable/);
  const readonly = createEngine({ readonly: true });
  expect(() => readonly.handleActions(actions({}, literal))).toThrow(
    /readonly/,
  );
});

it("records the marker in rollback actions and preserves object arrays in save/load", () => {
  const engine = createEngine();
  const value = ["${variables.source}", { event: "_event.value" }];
  engine.handleActions(actions(value, literal));
  expect(
    JSON.stringify(engine.selectSystemState().contexts.at(-1).rollback),
  ).toContain('"valueMode":"literal"');
  engine.handleActions({ saveSlot: { slotId: "one" } });
  engine.handleActions(actions({ changed: true }, literal));
  engine.handleActions({ loadSlot: { slotId: "one" } });
  expect(objectValue(engine)).toEqual(value);
});

it("preserves literal values when replaying recorded operations during rollback", () => {
  const engine = createEngine();
  const value = { text: "${variables.source}", event: "_event.value" };
  engine.handleActions(actions(value, literal));
  engine.handleActions({ nextLine: { bypassChoice: true } });
  engine.handleActions({ nextLine: { bypassChoice: true } });
  expect(engine.selectSystemState().contexts.at(-1).pointers.read.lineId).toBe(
    "lineTwo",
  );
  engine.handleActions(actions({ changed: true }, literal));
  engine.handleActions({ rollbackByOffset: { offset: -1 } });
  expect(engine.selectSystemState().contexts.at(-1).pointers.read.lineId).toBe(
    "lineOne",
  );
  expect(objectValue(engine)).toEqual(value);
});

it("preserves marked deferred form callbacks without retaining an originating event", () => {
  const engine = createEngine();
  const value = { text: "${variables.source}", event: "_event.value" };
  const prepared = processActionTemplates(
    {
      form: {
        submitActions: actions(value, literal),
        cancelActions: actions(value, literal),
      },
    },
    { variables: { source: "REPLACED" }, _event: { value: "EVENT" } },
  );
  for (const callback of [
    prepared.form.submitActions,
    prepared.form.cancelActions,
  ]) {
    expect(callback.updateVariable.operations[0].valueMode).toBe("literal");
    engine.handleActions(callback);
    expect(objectValue(engine)).toEqual(value);
  }
});

describe("literal JSON copying", () => {
  it("rejects sparse arrays even when an extra numeric property hides the hole", () => {
    const value = [];
    value.length = 1;
    value[4294967295] = "not an array index";
    expect(() => cloneLiteralVariableValue(value)).toThrow(/dense/);
  });
  it("rejects accessors without invoking them, custom prototypes and cycles", () => {
    let invoked = false;
    const getter = Object.defineProperty({}, "field", {
      enumerable: true,
      get() {
        invoked = true;
        return "bad";
      },
    });
    expect(() => cloneLiteralVariableValue(getter)).toThrow(/accessors/);
    expect(invoked).toBe(false);
    const cycle = {};
    cycle.self = cycle;
    for (const value of [
      cycle,
      { date: new Date() },
      { value: Infinity },
      { value: undefined },
      { value: () => {} },
    ])
      expect(() => cloneLiteralVariableValue(value)).toThrow();
  });
});
