import { describe, expect, it } from "vitest";
import { addDialogue } from "../src/stores/constructRenderState.js";

const renderScalar = (value, type) => {
  const state = {
    elements: [{ id: "story", type: "container", children: [] }],
    animations: [],
  };
  addDialogue(state, {
    presentationState: {
      dialogue: {
        ui: { resourceId: "dialogue" },
        content: [{ text: "${variables.value}" }],
        initialRevealedContent: [{ text: "${variables.value}" }],
        lines: [{ content: [{ text: "${variables.value}" }] }],
      },
    },
    resources: {
      layouts: {
        dialogue: {
          elements: [
            {
              id: "active",
              type,
              content:
                type === "text"
                  ? "${dialogue.content[0].text}"
                  : "${dialogue.content}",
              initialRevealedCharacters:
                "${dialogue.initialRevealedCharacters}",
            },
            {
              id: "nvl",
              type,
              content:
                type === "text"
                  ? "${dialogue.lines[0].content[0].text}"
                  : "${dialogue.lines[0].content}",
            },
          ],
        },
      },
    },
    variables: { value },
  });
  return state.elements[0].children;
};

describe("scalar dialogue renderer contract", () => {
  for (const type of ["text", "text-revealing"]) {
    it.each([0, 7, false, true])(
      `renders %j as a string through ${type}`,
      (value) => {
        const elements = renderScalar(value, type);
        const expected = String(value);
        for (const element of elements) {
          expect(
            type === "text" ? element.content : element.content[0].text,
          ).toBe(expected);
        }
        expect(elements[0].initialRevealedCharacters).toBe(expected.length);
      },
    );

    it(`preserves the authored text for object bindings through ${type}`, () => {
      for (const element of renderScalar({ nested: 7 }, type)) {
        expect(
          type === "text" ? element.content : element.content[0].text,
        ).toBe("${variables.value}");
      }
    });
  }
});
