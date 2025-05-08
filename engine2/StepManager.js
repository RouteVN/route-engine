import SeenSections from "../engine/SeenSections.js";
import StepPointer from "./StepPointer.js";
import History from "./History.js";

class StepManager {

  _vnData;

  /**
   * @type {Record<string, StepPointer>}
   * Step pointers for each mode
   */
  _stepPointers = {
    /**
     * Used for title screen and reading mode
     */
    read: new StepPointer(),
    /**
     * Used for menu screen
     */
    menu: new StepPointer(),
    /**
     * Used for history mode
     */
    history: new StepPointer(),
  };

  _mode = "read";

  /**
   * @type {SeenSections}
   * All the sections seen by the user
   */
  _seenSections = new SeenSections();

  /**
   * @type {History}
   * All the history of the user
   */
  _history = new History([]);

  /**
   * @type {boolean}
   * Whether the engine is in auto mode
   */
  _autoMode = false;

  /**
   * @type {boolean}
   * Whether the engine is in skip mode
   */
  _skipMode = false;

  _skipModeInterval;

  constructor(vnData) {
    this._vnData = vnData;
    const initialIds = vnData.initialIds;
    this._stepPointers.read.set(initialIds.sectionId, initialIds.stepId);
  }

  nextStep = () => {
    const sectionSteps = this._vnData.getSectionSteps(this._stepPointers.read._sectionId);
    const currentStepIndex = sectionSteps.findIndex(step => step.id === this._stepPointers.read._stepId);
    const nextStepIndex = currentStepIndex + 1;
    const nextStep = sectionSteps[nextStepIndex];
    if (nextStep) {
      this._stepPointers.read.set(this._stepPointers.read._sectionId, nextStep.id);
    }
  };

  getCurrentSteps = () => {
    const steps = this._vnData.getSectionSteps(this._stepPointers.read._sectionId);
    const currentStepIndex = steps.findIndex(step => step.id === this._stepPointers.read._stepId);
    return steps.slice(0, currentStepIndex + 1);
  }
}

export default StepManager;
