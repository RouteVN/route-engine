import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
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
            type: "rect",
            x: 100,
            y: 230,
            width: 120,
            height: 48,
            click: {
              payload: {
                actions: "${form.submitActions}",
              },
            },
          },
          {
            id: "cancel-button",
            type: "rect",
            x: 240,
            y: 230,
            width: 120,
            height: 48,
            click: {
              payload: {
                actions: "${form.cancelActions}",
              },
            },
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
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  form: {
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
                    submitActions: {
                      nextLine: {},
                    },
                    cancelActions: {
                      rollbackByOffset: {},
                    },
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
            ],
          },
        },
      },
    },
  },
});

const createEngine = () => {
  const engine = createRouteEngine({
    handlePendingEffects: () => {},
  });

  engine.init({
    initialState: {
      projectData: createProjectData(),
    },
  });
  engine.handleAction("markLineCompleted", {});

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

describe("RouteEngine forms", () => {
  it("renders form inputs with field drafts and prepared submit/cancel actions", () => {
    const engine = createEngine();
    const renderState = engine.selectRenderState();
    const nameInput = findElement(renderState.elements, "name-input");
    const submitButton = findElement(renderState.elements, "submit-button");
    const cancelButton = findElement(renderState.elements, "cancel-button");

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
              _interactionSource: "form",
            },
          },
        },
      },
      submit: {
        payload: {
          _interactionSource: "form",
          actions: {
            submitForm: {
              formId: "profileForm",
            },
          },
        },
      },
    });
    expect(nameInput.change.payload._formKey).toBe(
      "section1:line1:profileForm",
    );
    expect(submitButton.click.payload).toMatchObject({
      _interactionSource: "form",
      _formKey: "section1:line1:profileForm",
      actions: {
        submitForm: {
          formId: "profileForm",
          formKey: "section1:line1:profileForm",
          actions: {
            nextLine: {},
          },
        },
      },
    });
    expect(cancelButton.click.payload.actions).toEqual({
      cancelForm: {
        formId: "profileForm",
        formKey: "section1:line1:profileForm",
        actions: {
          rollbackByOffset: {},
        },
      },
    });
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
      engine.selectSystemState().global.formDrafts["section1:line1:profileForm"]
        .errors.email,
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
