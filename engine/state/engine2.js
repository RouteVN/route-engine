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

  _rootElement;

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

  get _currentReadSteps() {
    const pointer = this._stepPointers.read;
    const section = this._sections[pointer._sectionId];
    const allSteps = section.steps;
    const index = allSteps.findIndex((step) => step.id === pointer._stepId);
    return allSteps.slice(0, index + 1);
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
      readState: this._mode === "menu" ? this._currentReadSteps.reduce(applyState, {}) : undefined,
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
      rootElement: this._rootElement,
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
    this._rootElement = gameData.rootElement;
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
    console.log('save aaaaaaaaa')
    this.onGetScreenShot().then((url) => {
      const { index } = payload;
      const time = Date.now();

      this._persistentSaveData[index] = {
        sectionId: this._stepPointers.read._sectionId,
        stepId: this._stepPointers.read._stepId,
        date: time,
        history: this._history._historySections,
        seenSections: this._seenSections._seenSections,
        title: "...",
        url
      };

      this.persistentSaveInterface.setAll(this._persistentSaveData);
      this._customState.saveDataCommitId = Date.now();

      this._render();
    });


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
  }
}

export default RvnEngine;
