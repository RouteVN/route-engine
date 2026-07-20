import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = ({
  includeIntro = false,
  submitActions = { nextLine: {} },
  extraLines = [],
} = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    layouts: {
      profileForm: {
        elements: [
          {
            id: "name-input",
            type: "input",
            field: "name",
            x: 100,
            y: 100,
            width: 300,
            height: 44,
          },
          {
            id: "email-input",
            type: "input",
            field: "email",
            x: 100,
            y: 160,
            width: 300,
            height: 44,
          },
          {
            id: "submit-button",
            type: "container",
            formRole: "submit",
            x: 100,
            y: 230,
            width: 120,
            height: 48,
            children: [
              {
                id: "submit-label",
                type: "rect",
                x: 0,
                y: 0,
                width: 120,
                height: 48,
                click: {
                  payload: {
                    actions: {
                      nextLine: {},
                    },
                  },
                },
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
    variables: {
      playerName: {
        type: "string",
        scope: "context",
        default: "",
      },
      playerEmail: {
        type: "string",
        scope: "device",
        default: "",
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
            initialLineId: includeIntro ? "intro" : "line1",
            lines: [
              ...(includeIntro
                ? [
                    {
                      id: "intro",
                      actions: {},
                    },
                  ]
                : []),
              {
                id: "line1",
                actions: {
                  form: {
                    id: "profile-contact-form",
                    resourceId: "profileForm",
                    fields: {
                      name: {
                        variableId: "playerName",
                        required: true,
                        trim: true,
                        placeholder: "Name",
                      },
                      email: {
                        variableId: "playerEmail",
                        required: true,
                        trim: true,
                        placeholder: "Email",
                      },
                    },
                    submitActions,
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  dialogue: {
                    content: [{ text: "Submitted" }],
                  },
                },
              },
              ...extraLines,
            ],
          },
        },
      },
    },
  },
});

const createEngine = ({
  global,
  handlePendingEffects = () => {},
  markLineCompleted = true,
  projectData = createProjectData(),
} = {}) => {
  const engine = createRouteEngine({
    handlePendingEffects,
  });

  engine.init({
    initialState: {
      global,
      projectData,
    },
  });

  if (markLineCompleted) {
    engine.handleAction("markLineCompleted", {});
  }

  return engine;
};

const findElement = (node, id) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElement(item, id);
      if (found) return found;
    }
    return undefined;
  }

  if (!node || typeof node !== "object") {
    return undefined;
  }

  if (node.id === id) {
    return node;
  }

  return findElement(node.children, id);
};

const setPlayerNameAction = (id, value) => ({
  updateVariable: {
    id,
    operations: [
      {
        variableId: "playerName",
        op: "set",
        value,
      },
    ],
  },
});

describe("RouteEngine forms", () => {
  it("renders form inputs with field drafts and formRole submit actions", () => {
    const engine = createEngine();
    const renderState = engine.selectRenderState();
    const nameInput = findElement(renderState.elements, "name-input");
    const submitButton = findElement(renderState.elements, "submit-button");
    expect(nameInput).toMatchObject({
      type: "input",
      value: "",
      placeholder: "Name",
      change: {
        payload: {
          _interactionSource: "form",
          actions: {
            updateFormField: {
              field: "name",
              value: "_event.value",
            },
          },
        },
      },
      submit: {
        payload: {
          _interactionSource: "form",
          actions: {
            submitForm: {
              formKey: "section1:line1:profile-contact-form",
            },
          },
        },
      },
    });
    expect(nameInput.change.payload).not.toHaveProperty("_formId");
    expect(nameInput.change.payload).not.toHaveProperty("_formKey");
    expect(nameInput.change.payload.actions.updateFormField.formKey).toBe(
      "section1:line1:profile-contact-form",
    );
    expect(nameInput.change.payload.actions.updateFormField).not.toHaveProperty(
      "formId",
    );
    expect(submitButton.click.payload).not.toHaveProperty("_formId");
    expect(submitButton.click.payload).not.toHaveProperty("_formKey");
    expect(submitButton.click.payload).toMatchObject({
      _interactionSource: "form",
      actions: {
        submitForm: {
          formKey: "section1:line1:profile-contact-form",
          actions: {
            nextLine: {},
          },
        },
      },
    });
    expect(submitButton.click.payload.actions.submitForm).not.toHaveProperty(
      "formId",
    );
    expect(Object.keys(submitButton.click.payload.actions)).toEqual([
      "submitForm",
    ]);
  });

  it("submits when clicking a child inside a submit-role container", () => {
    const engine = createEngine({ markLineCompleted: false });
    let renderState = engine.selectRenderState();
    const nameInput = findElement(renderState.elements, "name-input");
    const emailInput = findElement(renderState.elements, "email-input");
    let submitLabel = findElement(renderState.elements, "submit-label");

    expect(submitLabel.click.payload).toMatchObject({
      _interactionSource: "form",
      actions: {
        submitForm: {
          formKey: "section1:line1:profile-contact-form",
          actions: {
            nextLine: {},
          },
        },
      },
    });

    expect(Object.keys(submitLabel.click.payload.actions)).toEqual([
      "submitForm",
    ]);

    engine.handleActions(nameInput.change.payload.actions, {
      _event: {
        value: "Ada",
      },
    });
    engine.handleActions(emailInput.change.payload.actions, {
      _event: {
        value: "ada@example.com",
      },
    });

    renderState = engine.selectRenderState();
    submitLabel = findElement(renderState.elements, "submit-label");
    engine.handleActions(submitLabel.click.payload.actions);

    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line2",
    );
  });

  it("valid form submit advances even before the form line is marked completed", () => {
    const engine = createEngine({ markLineCompleted: false });
    let renderState = engine.selectRenderState();
    const nameInput = findElement(renderState.elements, "name-input");
    const emailInput = findElement(renderState.elements, "email-input");
    let submitButton = findElement(renderState.elements, "submit-button");

    expect(engine.selectSystemState().global.isLineCompleted).toBe(false);

    engine.handleActions(nameInput.change.payload.actions, {
      _event: {
        value: "Ada",
      },
    });
    engine.handleActions(emailInput.change.payload.actions, {
      _event: {
        value: "ada@example.com",
      },
    });

    renderState = engine.selectRenderState();
    submitButton = findElement(renderState.elements, "submit-button");
    engine.handleActions(submitButton.click.payload.actions);

    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line2",
    );
  });

  it.each([
    [
      "matched",
      [{ when: true, actions: setPlayerNameAction("matchedForm", "Matched") }],
      "Matched",
    ],
    [
      "default",
      [
        {
          when: false,
          actions: setPlayerNameAction("unreachableForm", "Unreachable"),
        },
        { actions: setPlayerNameAction("defaultForm", "Default") },
      ],
      "Default",
    ],
    [
      "unmatched",
      [
        {
          when: false,
          actions: setPlayerNameAction("unreachableForm", "Unreachable"),
        },
      ],
      "Ada",
    ],
  ])(
    "automatically continues a %s conditional submitted from the active form",
    (_outcome, branches, expectedPlayerName) => {
      const handledEffectNames = [];
      const engine = createEngine({
        global: {
          runtime: {
            skipUnseenText: true,
          },
        },
        handlePendingEffects: (effects) => {
          handledEffectNames.push(...effects.map((effect) => effect.name));
        },
        projectData: createProjectData({
          includeIntro: true,
          submitActions: {
            conditional: {
              branches,
            },
          },
        }),
      });
      engine.handleAction("startSkipMode", {});
      engine.handleAction("nextLineFromSystem", {});

      expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
        "line1",
      );
      expect(engine.selectSystemState().global.skipMode).toBe(true);

      let renderState = engine.selectRenderState();
      const nameInput = findElement(renderState.elements, "name-input");
      const emailInput = findElement(renderState.elements, "email-input");

      engine.handleActions(nameInput.change.payload.actions, {
        _event: {
          value: "Ada",
        },
      });
      engine.handleActions(emailInput.change.payload.actions, {
        _event: {
          value: "ada@example.com",
        },
      });

      renderState = engine.selectRenderState();
      const submitButton = findElement(renderState.elements, "submit-button");
      handledEffectNames.length = 0;
      engine.handleActions(submitButton.click.payload.actions);

      expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
        "line2",
      );
      expect(engine.selectSystemState().global.skipMode).toBe(true);
      expect(engine.selectSystemState().contexts[0].variables.playerName).toBe(
        expectedPlayerName,
      );
      expect(handledEffectNames).toContain("startSkipNextTimer");
    },
  );

  it("submits once into an unseen destination and stops active skip there", () => {
    const handledEffectNames = [];
    const engine = createEngine({
      global: {
        runtime: {
          skipUnseenText: true,
        },
      },
      handlePendingEffects: (effects) => {
        handledEffectNames.push(...effects.map((effect) => effect.name));
      },
      projectData: createProjectData({
        includeIntro: true,
        submitActions: {
          conditional: {
            branches: [
              {
                when: false,
                actions: setPlayerNameAction(
                  "unreachableUnseenForm",
                  "Unreachable",
                ),
              },
              {
                actions: setPlayerNameAction("defaultUnseenForm", "Default"),
              },
            ],
          },
        },
        extraLines: [{ id: "line3", actions: {} }],
      }),
    });
    engine.handleAction("startSkipMode", {});
    engine.handleAction("nextLineFromSystem", {});
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line1");
    engine.handleAction("setSkipUnseenText", { value: false });

    let renderState = engine.selectRenderState();
    const nameInput = findElement(renderState.elements, "name-input");
    const emailInput = findElement(renderState.elements, "email-input");
    engine.handleActions(nameInput.change.payload.actions, {
      _event: { value: "Ada" },
    });
    engine.handleActions(emailInput.change.payload.actions, {
      _event: { value: "ada@example.com" },
    });

    renderState = engine.selectRenderState();
    handledEffectNames.length = 0;
    const submitButton = findElement(renderState.elements, "submit-button");
    engine.handleActions(submitButton.click.payload.actions);

    const state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
    expect(state.contexts.at(-1).variables.playerName).toBe("Default");
    expect(state.global.skipMode).toBe(false);
    expect(handledEffectNames).toContain("clearSkipNextTimer");
    expect(handledEffectNames).not.toContain("startSkipNextTimer");
  });

  it("keeps edits transient until a valid multi-field submit commits variables and runs actions", () => {
    const engine = createEngine();
    let renderState = engine.selectRenderState();
    let nameInput = findElement(renderState.elements, "name-input");
    let submitButton = findElement(renderState.elements, "submit-button");

    engine.handleActions(nameInput.change.payload.actions, {
      _event: {
        value: " Ada ",
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.playerName).toBe(
      "",
    );

    engine.handleActions(submitButton.click.payload.actions);

    renderState = engine.selectRenderState();
    nameInput = findElement(renderState.elements, "name-input");
    const emailInput = findElement(renderState.elements, "email-input");

    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line1",
    );
    expect(nameInput.value).toBe(" Ada ");
    expect(emailInput.value).toBe("");
    expect(
      engine.selectSystemState().global.formDrafts[
        "section1:line1:profile-contact-form"
      ].errors.email,
    ).toBe("required");

    engine.handleActions(emailInput.change.payload.actions, {
      _event: {
        value: " ada@example.com ",
      },
    });

    renderState = engine.selectRenderState();
    submitButton = findElement(renderState.elements, "submit-button");
    engine.handleActions(submitButton.click.payload.actions);

    const systemState = engine.selectSystemState();
    expect(systemState.contexts[0].pointers.read.lineId).toBe("line2");
    expect(systemState.contexts[0].variables.playerName).toBe("Ada");
    expect(systemState.global.variables.playerEmail).toBe("ada@example.com");
    expect(systemState.global.formDrafts).toEqual({});
  });
});
