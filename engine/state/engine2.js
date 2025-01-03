import { applyState } from "./state.js";
import { generateRenderTree } from "./renderer.js";
import StepPointer from "./StepPointer.js";
import SeenSections from "./SeenSections.js";
import History from "./History.js";

/**
 * @typedef {Object} Step
 * @property {string} id
 */

/**
 * @typedef {Object} Section
 * @property {string} sectionId
 * @property {Step[]} steps
 */

const Events = {
  rightClick: "rightClick",
  leftClick: "leftClick",
  scrollUp: "scrollUp",
};

const Actions = {
  nextStep: "nextStep",
  prevStep: "prevStep",
  startRead: "startRead",
  openMenu: "openMenu",
  closeMenu: "closeMenu",
  exitHistory: "exitHistory",
};

class RvnEngine {
  _initial = {
    sectionId: undefined,
    mode: "read",
  };

  /**
   * Used so that when returning from menu to read, it will show the final state
   * of the step without revealing text, animations etc...
   */
  _completedStep = false;

  /**
   * @type {Record<string, any>}
   * Temporary state that is not persisted
   */
  _customState = {};

  _initialCustomState = {};

  _staticData = {};

  /**
   * @type {Record<string, any>}
   * Persistent save data
   */
  _persistentSaveData = {};

  /**
   * @type {Record<string, any>}
   * Initial persistent config
   */
  _initialPersistentConfig = {};

  /**
   * @type {Record<string, any>}
   * Persisted config
   */
  _persistentConfig = {};

  /**
   * @type {Record<string, Section>}
   * All the sections loaded in the engine
   */
  _sections = {};

  /**
   * All presets loaded in the engine
   */
  _presets = {};

  _autoMode = false;

  _skipMode = false;

  _skipModeInterval;

  _persistentVariables = {};

  /**
   * contains all content of internationalization such as translations
   */
  _i18n = {};

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

  _resources = {};

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
   * @type {string}
   */
  _mode = "read";

  /**
   * @type {string}
   * The id of the preset selected by the user
   */
  _selectedPresetId;

  /**
   * @type {Preset}
   * The preset selected by the user
   */
  get _selectedPreset() {
    return this._presets[this._selectedPresetId];
  }

  constructor() {}

  get _isNextStepSeen() {
    return false;
  }

  /**
   * @returns {StepPointer}
   * The current step pointer
   */
  _currentStepPointer() {
    return this._stepPointers[this._mode];
  }

  /**
   * Initialize the engine
   */
  init() {
    this._mode = this._initial.mode;
    // this._history.addSection({
    //   sectionId: this._initial.sectionId,
    //   clearHistory: false,
    // });
    this._selectedPresetId = this._initial.presetId;
    const stepId = this._sections[this._initial.sectionId].steps[0].id;
    this._currentStepPointer().set(this._initial.sectionId, stepId);
    this._seenSections.addStepId(this._initial.sectionId, this._initial.stepId);
    this._persistentConfig =
      this.persistentConfigInterface.getAll() || this._initialPersistentConfig;
    this._persistentSaveData = this.persistentSaveInterface.getAll() || {};
    this._persistentVariables =
      this.persistentVariablesInterface.getAll() || {};
    this._customState = this._initialCustomState;
    this._render();
  }

  /**
   * @returns {Step[]}
   * The current steps
   */
  get _currentSteps() {
    const pointer = this._currentStepPointer();
    const section = this._sections[pointer._sectionId];
    const allSteps = section.steps;
    const index = allSteps.findIndex((step) => step.id === pointer._stepId);
    return allSteps.slice(0, index + 1);
  }

  get _currentStep() {
    return this._currentSteps[this._currentSteps.length - 1];
  }

  get _hasNextStep() {
    const pointer = this._currentStepPointer();
    const section = this._sections[pointer._sectionId];
    const index = section.steps.findIndex(
      (step) => step.id === pointer._stepId
    );
    const nextIndex = index + 1;
    const nextStep = section.steps[nextIndex];
    return !!nextStep;
  }

  get historyDialogue() {
    const steps = this._sections[this._stepPointers.read._sectionId].steps;
    const lastIndex = steps.findIndex(
      (step) => step.id === this._stepPointers.read._stepId
    );
    const seenSteps = steps.slice(0, lastIndex);
    const stepsWithDialogue = seenSteps.filter((step) => step.actions.dialogue);
    return stepsWithDialogue.map((step) => {
      const dialogue = step?.actions?.dialogue;
      const characterName = dialogue?.character?.characterId;
      const content = dialogue?.text;
      return {
        characterName,
        content,
        sectionId: this._stepPointers.read._sectionId,
        stepId: step.id,
      };
    });
  }

  _render() {
    const state = this._currentSteps.reduce(applyState, {});
    const { elements, transitions } = generateRenderTree({
      state,
      resources: this._resources,
      screen: {
        width: 1280,
        height: 720,
        fill: "#000000",
      },
      mode: "read",
      customState: this._customState,
      config: {
        ...this._initialPersistentConfig,
        ...this._persistentConfig,
      },
      saveData: this._persistentSaveData,
      canSkip: this._hasNextStep,
      autoMode: this._autoMode,
      skipMode: this._skipMode,
      persistentVariables: this._persistentVariables,
      // completedStep: this._completedStep,
      pointerMode: this._mode,
      data: this._staticData,
      i18n: this._i18n,
      historyDialogue: this.historyDialogue,
    });

    console.log({
      elements,
      transitions,
    });

    // this.onChangeGameStage({
    //   elements,
    //   transitions,
    // })

    if (this.onTriggerRender) {
      this.onTriggerRender({
        elements,
        transitions,
      });
    }

    const lastStep = this._currentSteps[this._currentSteps.length - 1];

    if (lastStep.actions && lastStep.actions.setPersistentVariables) {
      this.setPersistentVariables(lastStep.actions.setPersistentVariables);
    }

    if (!lastStep) {
      return;
    }
    if (lastStep.actions && lastStep.actions.moveToSection) {
      this.moveToSection(lastStep.actions.moveToSection);
    }
  }

  moveToSection({ sectionId, stepId, mode, presetId, addToSection }) {
    if (mode) {
      this._mode = mode;
      if (mode === "read") {
        this._stepPointers.menu.clear();
      }
    }
    if (presetId) {
      this._selectedPresetId = presetId;
    }
    const pointer = this._currentStepPointer();
    const section = this._sections[sectionId];
    pointer.set(sectionId, stepId || section.steps[0].id);
    const isStepSeen = this._seenSections.isStepIdSeen(
      {
        ...this._sections[pointer._sectionId],
        sectionId: pointer._sectionId,
      },
      pointer._stepId
    );
    if (!isStepSeen) {
      this._seenSections.addStepId(pointer._sectionId, pointer._stepId);
    }
    if (addToSection) {
      this._history.addSection({
        sectionId,
        clearHistory: true,
      });
    }
    this._render();
  }

  _prevStepHistory() {
    const historyPointer = this._stepPointers.history;

    let section = this._sections[historyPointer._sectionId];
    let index = section.steps.findIndex(
      (step) => step.id === historyPointer._stepId
    );
    let prevIndex = index - 1;

    if (index === 0) {
      this._history._historyModeSectionIndex -= 1;
      section = this._sections[this._history.historyModeSectionId];
      index = section.steps.length - 1;
      prevIndex = index;
    }
    historyPointer.set(
      this._history.historyModeSectionId,
      section.steps[prevIndex].id
    );
    this._render();
  }

  _prevStepRead() {
    const readPointer = this._stepPointers.read;
    if (!readPointer._sectionId) {
      return;
    }
    const section = this._sections[readPointer._sectionId];
    const index = section.steps.findIndex(
      (step) => step.id === readPointer._stepId
    );
    const prevIndex = index - 1;

    this._history._historyModeSectionIndex =
      this._history._historySections.length - 1;
    const historyPointer = this._stepPointers.history;

    const prevStep = section.steps[prevIndex];
    if (!prevStep) {
      return;
    }

    historyPointer.set(readPointer._sectionId, prevStep.id);
    this._mode = "history";
    this._history.setLastStepId(readPointer._stepId);
  }

  prevStep() {
    if (this._mode === "history") {
      this._prevStepHistory();
    } else if (this._mode === "read") {
      this._prevStepRead();
    }
  }

  _nextStepHistory() {
    const historyPointer = this._stepPointers.history;
    let section = this._sections[historyPointer._sectionId];
    let index = section.steps.findIndex(
      (step) => step.id === historyPointer._stepId
    );
    let nextIndex = index + 1;
    if (nextIndex === section.steps.length) {
      this._history._historyModeSectionIndex += 1;
      section = this._sections[this._history.historyModeSectionId];
      index = 0;
      nextIndex = 0;
    }
    if (this._history.lastStepId === section.steps[nextIndex].id) {
      this._mode = "read";
      historyPointer.clear();
    } else {
      historyPointer.set(
        this._history.historyModeSectionId,
        section.steps[nextIndex].id
      );
    }
    this._completedStep = false;
    this._render();
  }

  _nextStepRead() {
    const pointer = this._currentStepPointer();
    const section = this._sections[pointer._sectionId];
    const index = section.steps.findIndex(
      (step) => step.id === pointer._stepId
    );
    const nextIndex = index + 1;
    const nextStep = section.steps[nextIndex];
    if (!nextStep) {
      if (this._skipModeInterval) {
        clearInterval(this._skipModeInterval);
      }
      this._skipMode = false;
      this._render();
      return;
    }
    pointer.set(pointer._sectionId, nextStep.id);
    this._seenSections.addStepId(pointer._sectionId, pointer._stepId);
    this._completedStep = false;
    this._render();
  }

  nextStep() {
    if (this._mode === "history") {
      this._nextStepHistory();
    } else {
      this._nextStepRead();
    }
  }

  exitHistory() {
    this._mode = "read";
    this._stepPointers.history.clear();
  }

  loadGameData(gameData) {
    this._initial = {
      sectionId: gameData.initial.sectionId,
      stepId: gameData.initial.stepId,
      presetId: gameData.initial.presetId,
      mode: gameData.initial.mode,
    };
    this._sections = gameData.story.sections;
    this._presets = gameData.presets;
    this._resources = gameData.resources;
    this._initialPersistentConfig = gameData.initialPersistentConfig;
    this._initialCustomState = gameData.initialCustomState;
    this._staticData = gameData.staticData;
    this._i18n = gameData.i18n;
  }

  exitMenu({ presetId, sectionId, stepId, mode }) {
    if (mode) {
      this._mode = mode;
    } else {
      this._mode = "read";
    }
    this._selectedPresetId = presetId;
    this._stepPointers.menu.clear();
    if (sectionId) {
      this._currentStepPointer().set(
        sectionId,
        stepId || this._sections[sectionId].steps[0].id
      );
    }
    this._completedStep = true;
    this._render();
  }

  setCustomState(payload) {
    this._customState = {
      ...this._customState,
      ...payload,
    };
    this._render();
  }

  setPersistentConfig(payload) {
    const config = this.persistentConfigInterface.getAll();
    Object.entries(payload).forEach(([key, value]) => {
      if (typeof value === "object" && value.op === "toggle") {
        const val = config[key];
        config[key] = !val;
      } else {
        config[key] = value;
      }
    });
    this.persistentConfigInterface.setAll(config);
    this._persistentConfig = config;
    this._render();
  }

  save(payload) {
    const { index } = payload;

    const time = Date.now();

    this._persistentSaveData[index] = {
      sectionId: this._stepPointers.read._sectionId,
      stepId: this._stepPointers.read._stepId,
      date: time,
      history: this._history._historySections,
      seenSections: this._seenSections._seenSections,
      title: "...",
      url: "data:image/png;base64,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",
    };
    this.persistentSaveInterface.setAll(this._persistentSaveData);
    this._render();
  }

  load(payload) {
    const { index } = payload;
    const data = this._persistentSaveData[index];
    this.exitMenu({
      mode: "read",
      presetId: "read",
      sectionId: data.sectionId,
      stepId: data.stepId,
    });
    this._history = new History(data.history);
    this._seenSections = new SeenSections(data.seenSections);
    // this._render();
  }

  startAutoMode(payload) {
    this._autoMode = true;

    const intervalTime = (1 / this._persistentConfig.autoForwardTime) * 100000;

    setTimeout(() => {
      this.nextStep();
    }, intervalTime);
    // this._autoModeInterval = setInterval(() => {
    //   this.nextStep();
    // }, (1 / this._persistentConfig.autoForwardTime) * 100000);
    this._render();
  }

  stopAutoMode() {
    this._autoMode = false;
    clearInterval(this._autoModeInterval);
    this._render();
  }

  toggleAutoMode() {
    if (this._autoMode) {
      this.stopAutoMode();
    } else {
      this.startAutoMode();
    }
    this._render();
  }

  startSkipMode() {
    this._skipMode = true;
    this._autoMode = false;

    this._skipModeInterval = setInterval(() => {
      this.nextStep();
    }, 100);
    this._render();
  }

  stopSkipMode() {
    this._skipMode = false;
    clearInterval(this._skipModeInterval);
    this._render();
  }

  toggleSkipMode() {
    if (this._skipMode) {
      this.stopSkipMode();
    } else {
      this.startSkipMode();
    }
    this._render();
  }

  setPersistentVariables(payload) {
    Object.entries(payload).forEach(([key, value]) => {
      this.persistentVariablesInterface.set(key, value);
    });
  }

  triggerStepEvent(payload) {
    const { stepEventName, stepEventPayload } = payload;
    const actions = this._currentStep.eventHandlers?.[stepEventName]?.actions;
    if (!actions) {
      return;
    }
    Object.entries(actions).forEach(([key, value]) => {
      this.handleAction(key, value);
    });
  }

  handleAction(action, payload) {
    if (action === "init") {
      this.init();
    } else if (action === "nextStep") {
      this.nextStep();
    } else if (action === "prevStep") {
      this.prevStep();
    } else if (action === "moveToSection") {
      this.moveToSection(payload);
    } else if (action === "exitHistory") {
      this.exitHistory();
    } else if (action === "exitMenu") {
      // TODO test
      this.exitMenu(payload);
    } else if (action === "setCustomState") {
      // TODO test
      this.setCustomState(payload);
    } else if (action === "setPersistentConfig") {
      this.setPersistentConfig(payload);
    } else if (action === "save") {
      this.save(payload);
    } else if (action === "load") {
      this.load(payload);
    } else if (action === "startAutoMode") {
      this.startAutoMode(payload);
    } else if (action === "stopAutoMode") {
      this.stopAutoMode();
    } else if (action === "toggleAutoMode") {
      this.toggleAutoMode();
    } else if (action === "startSkipMode") {
      this.startSkipMode();
    } else if (action === "stopSkipMode") {
      this.stopSkipMode();
    } else if (action === "toggleSkipMode") {
      this.toggleSkipMode();
    } else if (action === "setPersistentVariables") {
      this.setPersistentVariables(payload);
    } else if (action === "triggerStepEvent") {
      this.triggerStepEvent(payload);
    }
    // this._render();
  }

  completed() {
    const pointer = this._currentStepPointer();
    const section = this._sections[pointer._sectionId];
    const step = section.steps.find((step) => step.id === pointer._stepId);

    if (!step) {
      return;
    }

    if (step.autoNext) {
      this.nextStep();
      return;
    }

    if (this._autoMode) {
      const intervalTime =
        (1 / this._persistentConfig.autoForwardTime) * 100000;
      setTimeout(() => {
        this.nextStep();
      }, intervalTime);
    }
  }

  actions(payload) {
    Object.entries(payload.actions).forEach(([key, value]) => {
      this.handleAction(key, value);
    });
  }

  handleEvent(event, payload) {
    console.log('handleEvent',{ event, payload })
    if (!event) {
      return;
    }

    if (event === "completed") {
      this.completed();
      return;
    }

    if (event === "Actions") {
      this.actions(payload);
      return;
    }

    if (!this._selectedPreset.events[event]) {
      return;
    }

    Object.entries(this._selectedPreset.events[event].actions).forEach(
      ([action, payload2]) => {
        this.handleAction(action, payload || payload2);
      }
    );

    // this._selectedPreset.events[event].actions.forEach((action) => {

    // })
  }
}

export default RvnEngine;
