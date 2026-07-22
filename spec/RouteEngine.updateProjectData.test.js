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

const createProjectData = ({
  initialLineId,
  firstLineDialogue,
  secondLineDialogue,
}) => {
  return {
    screen: {
      width: 1920,
      height: 1080,
    },
    resources: {
      layouts: {
        adv: {
          id: "adv",
          name: "ADV",
          layoutType: "dialogue",
          elements: [
            {
              id: "adv-root",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
          ],
        },
        nvl: {
          id: "nvl",
          name: "NVL",
          layoutType: "nvl",
          elements: [
            {
              id: "nvl-root",
              type: "container",
              children: [
                {
                  id: "nvl-item-${i}",
                  type: "text",
                  $each: "line, i in dialogue.lines",
                  content: "${line.content[0].text}",
                },
              ],
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
              initialLineId,
              lines: [
                {
                  id: "line1",
                  actions: {
                    dialogue: firstLineDialogue,
                  },
                },
                {
                  id: "line2",
                  actions: {
                    dialogue: secondLineDialogue,
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
};

const createNameVariableProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    layouts: {
      adv: {
        elements: [
          {
            id: "speaker",
            type: "text",
            content: "${dialogue.character.name}",
          },
          {
            id: "body",
            type: "text",
            content: "${dialogue.content[0].text}",
          },
        ],
      },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {
      protagonist: {
        name: "Protagonist",
        nameVariableId: "playerName",
      },
    },
    variables: {
      playerName: {
        type: "string",
        scope: "context",
        default: "Guest",
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
                      resourceId: "adv",
                    },
                    characterId: "protagonist",
                    content: [
                      {
                        text: "Hello.",
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

const createStaticProjectData = (text) => {
  const projectData = createProjectData({
    initialLineId: "line1",
    firstLineDialogue: {
      content: [{ text }],
    },
    secondLineDialogue: {
      content: [{ text: `${text} second` }],
    },
  });
  projectData.resources.layouts = {};
  Object.values(projectData.story.scenes.scene1.sections).forEach((section) => {
    section.lines.forEach((line) => {
      line.actions = {};
    });
  });
  return projectData;
};

const addComputedCycle = (projectData) => {
  projectData.resources.variables = {
    a: {
      type: "number",
      scope: "context",
      computed: {
        expr: { var: "variables.b" },
      },
    },
    b: {
      type: "number",
      scope: "context",
      computed: {
        expr: { var: "variables.a" },
      },
    },
  };
  return projectData;
};

describe("RouteEngine updateProjectData", () => {
  it("treats projectData as opaque when processing action templates", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "nvl",
        ui: {
          resourceId: "nvl",
        },
        content: [{ text: "First" }],
      },
      secondLineDialogue: {
        content: [{ text: "Second" }],
      },
    });

    const nextProjectData = createProjectData({
      initialLineId: "line2",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "First" }],
      },
      secondLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Second" }],
      },
    });

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    expect(() => {
      engine.handleActions({
        updateProjectData: {
          projectData: nextProjectData,
        },
        jumpToLine: {
          sectionId: "section1",
          lineId: "line2",
        },
      });
    }).not.toThrow();

    expect(engine.selectSystemState().projectData).toEqual(nextProjectData);
    expect(engine.selectRenderState().elements).toEqual([
      {
        id: "story",
        type: "container",
        x: 0,
        y: 0,
        children: [
          {
            id: "adv-root",
            type: "text",
            content: "Second",
          },
        ],
      },
    ]);
  });

  it("resolves an event-bound updateProjectData payload at action time", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    const nextProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Replacement" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused replacement" }],
      },
    });

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    expect(() =>
      engine.handleActions(
        {
          updateProjectData: "_event.update",
        },
        {
          _event: {
            update: {
              projectData: nextProjectData,
            },
          },
        },
      ),
    ).not.toThrow();
    expect(engine.selectSystemState().projectData).toEqual(nextProjectData);
  });

  it("hydrates newly introduced defaults used by character nameVariableId", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    const nextProjectData = createNameVariableProjectData();

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    engine.handleActions({
      updateProjectData: {
        projectData: nextProjectData,
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.playerName).toBe(
      "Guest",
    );
    expect(
      findElementById(engine.selectRenderState().elements, "speaker"),
    ).toMatchObject({
      content: "Guest",
    });
  });

  it("restores action-batch state after invalid computed definitions", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "First" }],
      },
      secondLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Second" }],
      },
    });
    const invalidProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Replacement" }],
      },
      secondLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Replacement second" }],
      },
    });
    invalidProjectData.resources.variables = {
      a: {
        type: "number",
        scope: "context",
        computed: {
          expr: { var: "variables.b" },
        },
      },
      b: {
        type: "number",
        scope: "context",
        computed: {
          expr: { var: "variables.a" },
        },
      },
    };

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackByOffset", {});
    const previousState = structuredClone(engine.selectSystemState());

    expect(() =>
      engine.handleActions({
        updateProjectData: {
          projectData: invalidProjectData,
        },
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
    expect(engine.selectSystemState()).toEqual(previousState);
  });

  it("rolls back earlier actions when an event-bound conditional update is invalid", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    initialProjectData.resources.variables.score = {
      type: "number",
      scope: "context",
      default: 0,
    };
    const invalidProjectData = structuredClone(initialProjectData);
    invalidProjectData.resources.variables = {
      a: {
        type: "number",
        scope: "context",
        computed: {
          expr: { var: "variables.b" },
        },
      },
      b: {
        type: "number",
        scope: "context",
        computed: {
          expr: { var: "variables.a" },
        },
      },
    };

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });
    const previousState = structuredClone(engine.selectSystemState());

    expect(() =>
      engine.handleActions(
        {
          updateVariable: {
            id: "incrementBeforeInvalidUpdate",
            operations: [
              {
                variableId: "score",
                op: "increment",
                value: 1,
              },
            ],
          },
          conditional: "_event.conditional",
        },
        {
          _event: {
            conditional: {
              branches: [
                {
                  when: true,
                  actions: {
                    updateProjectData: {
                      projectData: invalidProjectData,
                    },
                  },
                },
              ],
            },
          },
        },
      ),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
    expect(engine.selectSystemState()).toEqual(previousState);
  });

  it("resolves dynamic project payloads from action-time variable state", () => {
    const handledEffects = [];
    const engine = createRouteEngine({
      handlePendingEffects: (effects) => handledEffects.push(...effects),
    });
    const validProjectData = createStaticProjectData("Valid replacement");
    const invalidProjectData = addComputedCycle(
      createStaticProjectData("Invalid replacement"),
    );
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    initialProjectData.resources.variables.nextProject = {
      type: "object",
      scope: "context",
      default: {
        projectData: validProjectData,
      },
    };

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });
    handledEffects.length = 0;
    const previousState = engine.selectSystemState();

    expect(() =>
      engine.handleActions({
        updateVariable: {
          id: "selectInvalidProject",
          operations: [
            {
              variableId: "nextProject",
              op: "set",
              value: {
                projectData: invalidProjectData,
              },
            },
          ],
        },
        updateProjectData: "${variables.nextProject}",
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
    expect(engine.selectSystemState()).toEqual(previousState);
    expect(handledEffects).toEqual([]);
  });

  it("does not reject a dynamic project payload from stale pre-batch state", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const validProjectData = createStaticProjectData("Valid replacement");
    const invalidProjectData = addComputedCycle(
      createStaticProjectData("Invalid replacement"),
    );
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    initialProjectData.resources.variables.nextProject = {
      type: "object",
      scope: "context",
      default: {
        projectData: invalidProjectData,
      },
    };

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    expect(() =>
      engine.handleActions({
        updateVariable: {
          id: "selectValidProject",
          operations: [
            {
              variableId: "nextProject",
              op: "set",
              value: {
                projectData: validProjectData,
              },
            },
          ],
        },
        updateProjectData: "${variables.nextProject}",
      }),
    ).not.toThrow();
    expect(engine.selectSystemState().projectData).toEqual(validProjectData);
  });

  it("does not resolve update bindings in unselected conditional branches", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    const selectedProjectData = createStaticProjectData("Selected project");

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    expect(() =>
      engine.handleActions(
        {
          conditional: {
            branches: [
              {
                when: true,
                actions: {
                  updateProjectData: "_event.projectA",
                },
              },
              {
                actions: {
                  updateProjectData: "_event.projectB",
                },
              },
            ],
          },
        },
        {
          _event: {
            projectA: {
              projectData: selectedProjectData,
            },
          },
        },
      ),
    ).not.toThrow();
    expect(engine.selectSystemState().projectData).toEqual(selectedProjectData);
  });
});
