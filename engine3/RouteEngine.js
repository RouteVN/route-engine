import applyPresentationInstructions from "./applyPresentationInstructions";
import applySystemInstructions from "./applySystemInstructions";
import combineSystemState from "./combineSystemState";
import * as systemStateSelectors from "./systemStateSelectors";
import * as vnDataSelectors from "./vnDataSelectors";

class RouteEngine {
  _effects = [];
  _vnData;
  _systemState;

  constructor() {}

  init = ({ vnData, render }) => {
    this._vnData = vnData;

    const initialIds = vnDataSelectors.selectInitialIds(vnData);
    const { sectionId, stepId } = initialIds;
    if (!sectionId || !stepId) {
      throw new Error("No sectionId found");
    }
    this._systemState = systemStateSelectors.createSystemState({
      sectionId,
      stepId,
      presetId: initialIds.presetId,
    });

    this._render = render;
    this.registerEffects({
      name: "render",
      effect: this.render,
    });

    this.render();
  };

  systemEventHandler = (event, payload) => {
    // use presets to map event to system instructions
    if (event === "systemInstructions") {
      const { systemState, effects } = applySystemInstructions({
        systemInstructions: payload.systemInstructions,
        systemState: this._systemState,
        vnData: this._vnData,
      });
      this._systemState = systemState;
      this.render();
      return;
    }

    const preset = vnDataSelectors.selectPreset(
      this._vnData,
      systemStateSelectors.selectCurrentPresetId(this._systemState)
    );

    const foundEvent = preset.eventsMap[event];
    if (!foundEvent) {
      console.log("no event found", { event, preset });
      return;
    }
    const { systemInstruction } = foundEvent;

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
    console.log("this._systemState", this._systemState);
    const currentPointer = systemStateSelectors.selectCurrentPointer(
      this._systemState
    );
    const currentSteps = vnDataSelectors.selectSectionSteps(
      this._vnData,
      currentPointer.sectionId,
      currentPointer.stepId
    );

    const lastStep = currentSteps[currentSteps.length - 1];

    // TODO figure out how to order this and put this properly
    if (lastStep.systemInstructions) {
      const { systemState, effects } = applySystemInstructions({
        systemInstructions: lastStep.systemInstructions,
        systemState: this._systemState,
        vnData: this._vnData,
      });
      this._systemState = systemState;
      this.render();
      return;
    }

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

    // console.log({
    //   currentSteps,
    //   presentationTemplate,
    //   presentationState,
    // });

    this._render(presentationState);
  };

  registerEffects = (options) => {
    this._effects[options.name] = options.effect;
  };
}

export default RouteEngine;
