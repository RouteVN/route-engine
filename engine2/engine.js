import generateRenderElements from "./stateTo2dRenderElements";
import actions from "./actions.js";
import StepManager from "./StepManager.js";
import { applyState } from "./state.js";
import VnData from "./VnData.js";

class Engine {
  constructor() {}

  vnData;
  deps;
  _ticker;

  init = (vnData, params) => {
    const { callback, ticker } = params;
    this._ticker = ticker;
    this.vnData = new VnData(vnData);
    this.deps = {
      stepManager: new StepManager(this.vnData),
      vnData: this.vnData,
      generateRender: this.generateRender,
      dispatchEvent: this.dispatchEvent,
      _dialogueContent: [],
      autoNext: undefined,
      variables: {
        runtime: {
          currentMenuTabId: "options",
        },
      },
      currentPreset: this.vnData.initialPreset,
    };
    this.on = callback;

    const renderObject = this.generateRender();
    console.log("renderObject", renderObject);
    this.dispatchEvent("render", renderObject);
  };

  generateRender = () => {
    const steps = this.deps.stepManager.getCurrentSteps();

    const lastStep = steps[steps.length - 1];

    if (lastStep.autoNext) {
      this.deps.autoNext = lastStep.autoNext;
      let elapsedInMs = 0;

      let stepId = lastStep.id;

      const effect = (time) => {
        const currentSteps = this.deps.stepManager.getCurrentSteps();
        if (currentSteps[currentSteps.length - 1].id !== stepId) {
          this._ticker.remove(effect);
          this.deps.autoNext = undefined;
          return;
        }

        elapsedInMs += time.deltaMS;
        if (elapsedInMs >= this.deps.autoNext.delay) {
          this._ticker.remove(effect);
          this.deps.autoNext = undefined;
          this.handleAction("nextStep", {});
        }
      };

      this._ticker.add(effect);
    } else {
      this.deps.autoNext = undefined;
    }

    const state = steps.reduce(applyState, {});

    console.log("state", state);

    if (lastStep.actions.goToSectionScene) {
      this.handleAction("goToSectionScene", state.goToSectionScene);
      return;
    }

    if (lastStep.actions.preset) {
      this.handleAction("setPreset", lastStep.actions.preset);
    }


    const resources = this.vnData.resources;
    const resolveFile = (fileId) => {
      return `file:${fileId}`;
    };
    const result = generateRenderElements({
      state,
      resources,
      resolveFile,
      screen: this.vnData.screen,
      ui: this.vnData.ui,
      variables: this.deps.variables,
    });
    return result;
  };

  // event from pixijs 2drender
  handleEvent = (event, payload) => {

    if (event === "Actions") {
      const { actions } = payload;
      if (actions.goToSectionScene) {
        this.handleAction("goToSectionScene", actions.goToSectionScene);
      }
      if (actions.setRuntimeVariable) {
        this.handleAction("setRuntimeVariable", actions.setRuntimeVariable);
      }
      return;
    }

    const { currentPreset } = this.deps;
    const { eventsMap } = currentPreset;

    const matchedMap = eventsMap[event];

    if (!matchedMap) {
      return;
    }

    const { actions } = matchedMap;

    Object.keys(actions).forEach((action) => {
      const payload = actions[action];
      this.handleAction(action, payload);
    });

  };

  handleAction = (action, payload) => {
    const foundAction = actions[action];
    if (!foundAction) {
      throw new Error(`Action ${action} not found`);
    }
    foundAction(payload, this.deps);
  };

  dispatchEvent = (event, payload) => {
    this.on(event, payload);
  };
}

export default Engine;
