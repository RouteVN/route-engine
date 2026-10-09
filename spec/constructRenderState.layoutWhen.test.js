import { describe, expect, it } from "vitest";
import { addBackgroundOrCg } from "../src/stores/constructRenderState.js";

const renderBackgroundLayout = (when, variables = {}) =>
  addBackgroundOrCg(
    {
      elements: [{ id: "story", type: "container", children: [] }],
      animations: [],
    },
    {
      presentationState: { background: { resourceId: "layout" } },
      resources: {
        layouts: {
          layout: {
            elements: [
              {
                id: "conditional",
                type: "rect",
                width: 10,
                height: 10,
                $when: when,
              },
            ],
          },
        },
      },
      variables: { flag: false, ...variables },
    },
  );

describe("layout visibility conditions", () => {
  it("rejects an incomplete condition instead of rendering the element", () => {
    expect(() => renderBackgroundLayout("variables.flag ==")).toThrow(
      /Malformed \$when condition/,
    );
  });

  it.each(["==", "!=", ">=", "<=", ">", "<", "&&", "||", "in", "+", "-"])(
    "rejects a missing operand for %s at the end and inside a group",
    (operator) => {
      for (const expression of [
        `variables.flag ${operator}`,
        `(variables.flag ${operator})`,
        `${operator} variables.flag`,
        `true && (variables.flag ${operator})`,
      ]) {
        expect(() => renderBackgroundLayout(expression)).toThrow(
          /Malformed \$when condition/,
        );
      }
    },
  );

  it.each([
    "",
    "!",
    "()",
    "variables.flag == == false",
    "variables.flag && || true",
    "(variables.flag",
    "variables.flag)",
    "variables[0",
    "'unterminated",
    "variables.flag === false",
  ])("rejects malformed condition %j", (condition) => {
    expect(() => renderBackgroundLayout(condition)).toThrow(
      /Malformed \$when condition/,
    );
  });

  it.each([
    ["variables.in", { in: true }],
    ["variables.flag-", { "flag-": true }],
    ["variables.flag+", { "flag+": true }],
    ["variables.nested.in", { nested: { in: true } }],
    ["variables.items[0]", { items: [true] }],
    ["variables.in == true", { in: true }],
    ["variables.word == 'in'", { word: "in" }],
    ["variables.word == '-'", { word: "-" }],
    ["variables.word == '+'", { word: "+" }],
    ["!variables.flag", {}],
    ["(variables.flag == false) && (true || false)", {}],
    ["variables.value + 1 == 3", { value: 2 }],
    ["variables.value - 1 == -2", { value: -1 }],
    ["variables.word in variables.items", { word: "yes", items: ["yes"] }],
    ["__arrayOrEmpty(variables.items)", { items: [true] }],
    [true, {}],
    [{ eq: [{ var: "variables.flag" }, false] }, {}],
  ])("preserves valid condition %j", (condition, variables) => {
    const rendered = renderBackgroundLayout(condition, variables);
    const container = rendered.elements[0].children.find(
      (element) => element.id === "bg-cg-background-container",
    );
    expect(container.children).toHaveLength(1);
  });

  it("keeps valid conditions and boolean guards working", () => {
    const conditionalLayout = renderBackgroundLayout("variables.flag == false");
    const booleanGuardLayout = renderBackgroundLayout(false);
    const conditionalContainer = conditionalLayout.elements[0].children.find(
      (element) => element.id === "bg-cg-background-container",
    );
    const booleanGuardContainer = booleanGuardLayout.elements[0].children.find(
      (element) => element.id === "bg-cg-background-container",
    );

    expect(conditionalContainer.children).toHaveLength(1);
    expect(booleanGuardContainer.children).toHaveLength(0);
  });
});
