import applyPresentationInstructions from "./applyPresentationInstructions";
import applySystemInstructions from "./applySystemInstructions";
import combineSystemState from "./combineSystemState";
import SystemState from "./SystemState";
import VnData from "./VnData";

class RouteEngine {
  _effects = [];
  _vnData;
  _systemState;

  constructor() {}

  init = ({ vnData, render }) => {
    this._vnData = new VnData(vnData);

    const initialIds = this._vnData.initialIds;
    const { sectionId, stepId } = initialIds;
    if (!sectionId || !stepId) {
      throw new Error("No sectionId found");
    }
    this._systemState = new SystemState({
      sectionId,
      stepId,
      presetId: this._vnData.initialIds.presetId,
    });

    this._render = render;
    this.registerEffects({
      name: "render",
      effect: this.render,
    });

    this.render();
  };

  systemEventHandler = (event) => {
    // use presets to map event to system instructions

    const { systemInstruction } = {};

    const { systemState, effects } = applySystemInstructions({
      systemInstructions: systemInstruction,
      systemState: this._systemState,
      vnData: this._vnData,
    });

    this._systemState = systemState;
    // handle effects

    for (const effect of effects) {
      const { name, options } = effect;
      this._effects[name](options);
    }
  };

  /**
   * Renders the current state
   *
   * Path: [engine3/design.md](engine3/design.md)
   *
   * @see engine3/design.md
   */
  render = () => {
    const currentSteps = this._vnData.getSectionSteps(
      this._systemState.currentPointer.sectionId,
      this._systemState.currentPointer.stepId
    );
    const presentationInstructions = currentSteps.map((step) => {
      return step.presentation || {};
    });

    const presentationTemplate = applyPresentationInstructions(
      presentationInstructions
    );

    const presentationState = combineSystemState({
      template: presentationTemplate,
      state: this._systemState,
      data: this._vnData,
    });

    this._render(presentationState);
  };

  registerEffects = (options) => {
    this._effects[options.name] = options.effect;
  };
}

export default RouteEngine;
