import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const findElementById = (elements, id) => {
  for (const element of elements || []) {
    if (element?.id === id) {
      return element;
    }

    const nested = findElementById(element?.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const createGenericLayoutProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      advDialogue: {
        mode: "adv",
        elements: [
          {
            id: "dialogue-text",
            type: "text",
            content: "${dialogue.content[0].text}",
          },
        ],
      },
      conditionalLayout: {
        elements: [
          {
            "$if dialogue": [
              {
                id: "dialogue-present",
                type: "text",
                content: "${dialogue.content[0].text}",
              },
            ],
          },
          {
            id: "always-present",
            type: "text",
            content: "No active dialogue",
          },
        ],
      },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {},
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "advDialogue",
                    },
                    content: [
                      {
                        text: "Line 1",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  layout: {
                    resourceId: "conditionalLayout",
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
});

const createPersistedDialogueUiProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      advDialogue: {
        mode: "adv",
        elements: [
          {
            id: "speaker",
            type: "text",
            content: "${dialogue.character.name}",
          },
          {
            id: "body",
            type: "text-revealing",
            content: "${dialogue.content}",
            revealEffect: "typewriter",
            displaySpeed: 30,
          },
        ],
      },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {
      alice: {
        name: "Alice",
      },
    },
    variables: {},
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "advDialogue",
                    },
                    characterId: "alice",
                    persistCharacter: true,
                    content: [
                      {
                        text: "Line 1",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {},
              },
            ],
          },
        },
      },
    },
  },
});

const createAppendDialogueProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      advDialogue: {
        mode: "adv",
        elements: [
          {
            id: "body",
            type: "text-revealing",
            content: "${dialogue.content}",
            initialRevealedCharacters: "${dialogue.initialRevealedCharacters}",
            revealEffect: "typewriter",
            displaySpeed: 30,
          },
        ],
      },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {
      prefix: {
        type: "string",
        scope: "context",
        default: "Held prefix: ",
      },
      suffix: {
        type: "string",
        scope: "context",
        default: "continuing from the same line.",
      },
    },
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "advDialogue",
                    },
                    content: [
                      {
                        text: "${variables.prefix}",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  dialogue: {
                    append: true,
                    content: [
                      {
                        text: "${variables.suffix}",
                      },
                    ],
                  },
                },
              },
              {
                id: "line3",
                actions: {
                  dialogue: {
                    content: [
                      {
                        text: "Replacement line",
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
});

describe("RouteEngine layout dialogue templates", () => {
  it("does not expose persisted ADV dialogue shells on the next non-dialogue line", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createGenericLayoutProjectData(),
      },
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    const renderState = engine.selectRenderState();

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(
      findElementById(renderState.elements, "dialogue-present"),
    ).toBeNull();
    expect(
      findElementById(renderState.elements, "always-present"),
    ).toMatchObject({
      content: "No active dialogue",
    });
  });

  it("preserves persisted ADV shell template data for the dialogue UI", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createPersistedDialogueUiProjectData(),
      },
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    const renderState = engine.selectRenderState();

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(findElementById(renderState.elements, "speaker")).toMatchObject({
      content: "Alice",
    });
    expect(findElementById(renderState.elements, "body")).toMatchObject({
      type: "text-revealing",
      content: [
        {
          text: "",
        },
      ],
      revealEffect: "typewriter",
    });
  });

  it("exposes an interpolated reveal offset for appended ADV dialogue content", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const prefix = "Held prefix: ";
    const suffix = "continuing from the same line.";

    engine.init({
      initialState: {
        projectData: createAppendDialogueProjectData(),
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "body"),
    ).toEqual(
      expect.objectContaining({
        content: [
          {
            text: prefix,
          },
        ],
        initialRevealedCharacters: 0,
      }),
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    expect(
      findElementById(engine.selectRenderState().elements, "body"),
    ).toEqual(
      expect.objectContaining({
        content: [
          {
            text: prefix,
          },
          {
            text: suffix,
          },
        ],
        initialRevealedCharacters: prefix.length,
      }),
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    expect(
      findElementById(engine.selectRenderState().elements, "body"),
    ).toEqual(
      expect.objectContaining({
        content: [
          {
            text: "Replacement line",
          },
        ],
        initialRevealedCharacters: 0,
      }),
    );
  });
});
