import generateRenderElements from "./stateTo2dRenderElements";
import actions from "./actions.js";
import StepManager from "./StepManager.js";
import { applyState } from "./state.js";
import VnData from "./VnData.js";

class Engine {
  constructor() {}

  vnData;
  deps;

  init = (vnData, callback) => {
    this.vnData = new VnData(vnData);
    this.deps = {
      stepManager: new StepManager(this.vnData),
      generateRender: this.generateRender,
      dispatchEvent: this.dispatchEvent,
      _dialogueContent: [],
    };
    this.on = callback;

    const renderObject = this.generateRender();
    console.log('renderObject', renderObject)
    this.dispatchEvent("render", renderObject);
  };

  generateRender = () => {
    const steps = this.deps.stepManager.getCurrentSteps();
    const state = steps.reduce(applyState, {});

    console.log('state', state)

    if (state.goToSectionScene) {
      this.handleAction("goToSectionScene", state.goToSectionScene);
      return;
    }

    const resources = this.vnData.resources;
    const resolveFile = (fileId) => {
      return `file:${fileId}`;
    }
    const result = generateRenderElements({state, resources, resolveFile, screen: this.vnData.screen});
    return result;
  }

  handleAction = (action, payload) => {
    const foundAction = actions[action];
    if (!foundAction) {
      throw new Error(`Action ${action} not found`);
    }
    foundAction(payload, this.deps);
  };

  dispatchEvent = (event, payload) => {
    this.on(event, payload);
  }
}

export default Engine;
