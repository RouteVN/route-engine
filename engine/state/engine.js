import { applyState } from "./state.js";
import { generateRenderTree } from "./renderer.js";

export const HandlerActions = {
  Init: "Init",
  OpenMenu: "OpenMenu",
  HideMenu: "HideMenu",
  NextStep: "NextStep",
  PreviousStep: "PreviousStep",
  SaveSlot: "SaveSlot",
  LoadSlot: "LoadSlot",
  StepCompleted: "completed",
  ForceCompleteStep: "ForceCompleteStep",
  Slider: "Slider",
  Actions: "Actions",
  Wheel: "Wheel",
  Skip: "Skip",
  StopSkip: "StopSkip",
};

/**
 * the rvn engine.
 *
 * implementation of the rvn specification
 *
 */
export class RvnEngine {
  constructor(options) {
    const {
      gameDataPath,
      onChangeGameStage,
      onClose,
      getData,
      savePersistentData,
      getPersistentData,
      takeScreenshot,
    } = options;

    this.gameDataPath = gameDataPath;
    this.onChangeGameStage = onChangeGameStage;
    this.onClose = onClose;
    this.getData = getData;
    this.savePersistentData = savePersistentData;
    this.getPersistentData = getPersistentData;
    this.takeScreenshot = takeScreenshot;
  }

  _seenSections = {};

  /**
   * example history
   * _history = [{
   *   sceneId: 'asdf',
   *   sections: [{
   *     sectionId: 'v4332',
   *     choices: [{
   *       stepId: 'v332a',
   *       choiceId: '3dfk32',
   *     }],
   *   }]
   * }]
   */
  _history = [];

  get _canSkip() {
    if (this._mode !== "read") {
      return false;
    }
    const config = this.getPersistentData("config") || {};
    if (
      config.skipUnseenText ||
      this._seenSections[this._currentSectionId] === true
    ) {
      return true;
    }

    const existingIndex = this._currentSection.steps.itemsOrder.indexOf(
      this._seenSections[this._currentSectionId]
    );
    const currentIndex = this._currentSection.steps.itemsOrder.indexOf(
      this._currentStepId
    );
    return existingIndex > currentIndex;
  }

  get _historyDialogue() {
    const scene = this.gameData.story.scenes.items[this._latestSceneId];

    if (!scene) {
      return [];
    }

    const section = scene.sections.items[this._latestSectionId];

    const currentStepIndex = section.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._latestStepId
    );
    const stepIds = section.steps.itemsOrder.slice(0, currentStepIndex + 1);
    let steps = stepIds.map((stepId) => section.steps.items[stepId]);
    const dialogueSteps = steps.filter(
      (step) => !!step.actions.dialogue && !!step.actions.dialogue.text
    );
    const chatData = dialogueSteps.map((step) => {
      return {
        characterName: step.actions.dialogue.character?.characterId || "-",
        content: step.actions.dialogue.text,
      };
    });
    return chatData;
  }

  /**
   * points to the current history step
   * example
   * {
   *   sceneIndex: undefined,
   *   sectionIndex: undefined,
   *   stepId: undefined,
   * }
   */
  _historyPointer;

  _setHistoryPointer = (pointer) => {
    const { sceneIndex, sectionIndex, stepId } = pointer;
    this._historyPointer = {
      sceneIndex,
      sectionIndex,
      stepId,
    };
  };

  _clearHistoryPointer = () => {
    this._historyPointer = undefined;
  };

  /**
   * points to the current menu step
   * example:
   * {
   *   sceneId: 'asdf',
   *   sectionId: 'asdf',
   *   stepId: 'asdf',
   * }
   */
  _menuPointer;

  _customState = {
    currentSavePageNumber: 0,
    currentSavePageTitle: "Auto Save",
    returnToMainMenuConfirmationVisible: false,
    autoMode: false,
    skipMode: false,
  };

  _setMenuPointer = (pointer) => {
    const { sceneId, sectionId, stepId } = pointer;
    if (this._mode === "read") {
      this._menuPointer = {
        sceneId,
        sectionId,
        stepId,
        // screenShotUrl: url,
      };
      this.takeScreenshot().then((url) => {
        this._previousScreenshotUrl = url;
      });
    } else {
      this._menuPointer = {
        sceneId,
        sectionId,
        stepId,
      };
    }
  };

  _clearMenuPointer = () => {
    this._menuPointer = undefined;
  };

  /**
   * the current mode
   * @returns {'menu' | 'history' | 'read'} menu | read | history
   */
  get _mode() {
    if (this._menuPointer) {
      return "menu";
    }
    if (this._historyPointer) {
      return "history";
    }
    return "read";
  }

  /**
   * the latest scene id
   */
  _latestSceneId;

  /**
   * the latest section id
   */
  _latestSectionId;

  /**
   * the latest step id
   */
  _latestStepId;

  /**
   * Temporarary states to track game progression
   * This state is safe to be lost on refresh or save or load
   */
  _gameState = {
    /**
     * Whether to hide the dialog box
     */
    hideDialogBox: false,

    /**
     * Whether to render end state by skipping all transitions and text reveal
     * This is to be used when user click while transition or text reveal is still running
     */
    skipTransitions: false,

    /**
     * Whether the step including all transitions and text reveal has completed
     */
    stepCompleted: false,
  };

  _screen = {
    width: undefined,
    height: undefined,
    fill: "#000000",
  };

  _tempGlobalActions = {};

  /**
   * returns the current scene id
   * this is what is used for rendering the screen
   */
  get _currentSceneId() {
    if (this._mode === "menu") {
      return this._menuPointer.sceneId;
    }
    if (this._mode === "history") {
      if (this._historyPointer.sceneIndex === undefined) {
        return;
      }
      return this._history[this._historyPointer.sceneIndex].sceneId;
    }
    return this._latestSceneId;
  }

  /**
   * returns the current section id
   * this is what is used for rendering the screen
   */
  get _currentSectionId() {
    if (this._mode === "menu") {
      return this._menuPointer.sectionId;
    }
    if (this._mode === "history") {
      if (
        this._historyPointer.sceneIndex === undefined ||
        this._historyPointer.sectionIndex === undefined
      ) {
        return;
      }
      const historyScene = this._history[this._historyPointer.sceneIndex];
      if (!historyScene) {
        return;
      }
      const historySection =
        historyScene.sections[this._historyPointer.sectionIndex];
      if (!historySection) {
        return;
      }
      return historySection.sectionId;
    }
    return this._latestSectionId;
  }

  /**
   * returns the current step id
   * this is what is used for rendering the screen
   */
  get _currentStepId() {
    if (this._mode === "menu") {
      return this._menuPointer.stepId;
    }
    if (this._mode === "history") {
      return this._historyPointer.stepId;
    }
    return this._latestStepId;
  }

  /**
   * returns the current scene
   */
  get _currentScene() {
    if (!this._currentSceneId) {
      return;
    }
    return this.gameData.story.scenes.items[this._currentSceneId];
  }

  /**
   * returns the current section
   */
  get _currentSection() {
    if (!this._currentSectionId) {
      return;
    }
    return this._currentScene.sections.items[this._currentSectionId];
  }

  /**
   * returns the current step
   */
  get _currentStep() {
    if (!this._currentStepId) {
      return;
    }
    return this._currentSection.steps.items[this._currentStepId];
  }

  /**
   * returns the current state
   */
  get _currentState() {
    const currentSection = this._currentSection;
    const currentStepIndex = currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._currentStepId
    );
    const stepIds = currentSection.steps.itemsOrder.slice(
      0,
      currentStepIndex + 1
    );
    let steps = stepIds.map((stepId) => currentSection.steps.items[stepId]);
    // if (this._tempGlobalActions && Object.keys(this._tempGlobalActions).length > 0) {
    //   steps.push(this._tempGlobalActions);
    // }
    const state = steps.reduce(applyState, {});
    return state;
  }

  /**
   * Renders screen based on current state
   */
  _updateStep = () => {
    const { resources } = this.gameData;
    const currentState = this._currentState;

    if (currentState.bgm) {
      this._customState.bgmId = currentState.bgm.bgmId;
    }

    console.log("currentState1", currentState);

    const { elements, transitions } = generateRenderTree({
      state: currentState,
      resources,
      screen: this._screen,
      config: this.getPersistentData("config"),
      saveData: this.getPersistentData("saveData"),
      // gameState: this.gameState,
      mode: this._mode,
      customState: this._customState,
      historyDialogue: this._historyDialogue,
      skipMode: this._customState.skipMode,
      data: this.gameData.data,
      canSkip: this._canSkip,
      modalScreenId: this._modalScreenId,
      persistentVariables: this.getPersistentData("persistentVariables") || {},
    });

    if (this._currentStep.actions.setPersistentVariables) {
      const persistentVariables =
        this.getPersistentData("persistentVariables") || {};
      Object.keys(this._currentStep.actions.setPersistentVariables).forEach(
        (key) => {
          persistentVariables[key] =
            this._currentStep.actions.setPersistentVariables[key];
        }
      );
      this.savePersistentData("persistentVariables", persistentVariables);
    }

    this.onChangeGameStage({
      elements,
      transitions,
    });

    console.log("mode", this._mode);
  };

  /**
   * Loads game data and initializes the stage
   */
  init = async () => {
    const gameData = await this.getData(this.gameDataPath);
    this.gameData = gameData;

    const { screen } = gameData;

    this._setInitialScene();

    this._screen.width = screen.width;
    this._screen.height = screen.height;

    this._seenSections = this.getPersistentData("seenSections") || {};
  };

  _setInitialScene = () => {
    const { story } = this.gameData;
    const { startSceneId } = story;

    this._latestSceneId = startSceneId;

    const startScene = this._currentScene;
    const startSectionId = startScene.sections.itemsOrder[0];
    const startSection = startScene.sections.items[startSectionId];
    const startStepId = startSection.steps.itemsOrder[0];

    this._latestSectionId = startSectionId;
    this._latestStepId = startStepId;

    this._setMenuPointer({
      sceneId: startSceneId,
      sectionId: startSectionId,
      stepId: startStepId,
    });
  };

  _goToNextStepInHistory = () => {
    // 1. go to next step index
    // 2. if current step is last, then go to next section index
    // 3. if current section is last, then go to next scene index

    const historyScene = this._history[this._historyPointer.sceneIndex];
    const nextHistoryScene = this._history[this._historyPointer.sceneIndex + 1];
    const historySceneIsLast =
      this._historyPointer.sceneIndex === this._history.length - 1;
    const historySection =
      historyScene.sections[this._historyPointer.sectionIndex];
    const nextHistorySection =
      historyScene.sections[this._historyPointer.sectionIndex + 1];
    const historySectionIsLast =
      this._historyPointer.sectionIndex === historyScene.sections.length - 1;

    const currentStepIndex = this._currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._currentStepId
    );
    const nextStepId =
      this._currentSection.steps.itemsOrder[currentStepIndex + 1];

    if (!nextStepId) {
      // check if can go to next section
      if (nextHistorySection) {
        this._historyPointer.sectionIndex = this._historyPointer.sceneIndex + 1;
        this._historyPointer.stepId = this._currentSection.steps.itemsOrder[0];
        this._updateStep();
        return;
      }
      //  check if can go to next scene
      if (nextHistoryScene) {
        this._historyPointer.sceneIndex = this._historyPointer.sceneIndex + 1;
        this._historyPointer.sectionIndex = 0;
        this._historyPointer.stepId = this._currentSection.steps.itemsOrder[0];
        this._updateStep();
        return;
      } else {
        console.warn("not expected");
        this._clearHistoryPointer();
        this._updateStep();
        return;
      }
    }

    // move to next history step
    this._historyPointer.stepId = nextStepId;

    if (
      historySceneIsLast &&
      historySectionIsLast &&
      this._historyPointer.stepId === this._latestStepId
    ) {
      this._clearHistoryPointer();
      this._updateStep();
      return;
    }

    this._updateStep();
    return;
  };

  _goToNextStepInReadMode = () => {
    // normal mode
    const currentStepIndex = this._currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._latestStepId
    );
    const nextStepId =
      this._currentSection.steps.itemsOrder[currentStepIndex + 1];
    const nextStep = this._currentSection.steps.items[nextStepId];

    if (nextStep) {
      if (nextStep.actions.clearHistory) {
        this._history = [];
        this._clearHistoryPointer();
      }

      // TODO don't add history for extra
      if (nextStep.actions.moveToSection) {
        const sceneId =
          nextStep.actions.moveToSection.sceneId || this._currentSceneId;
        const scene = this.gameData.story.scenes.items[sceneId];

        if (scene.mode === "read") {
          this._latestSceneId = sceneId;
          const latestHistoryScene = this._history[this._history.length - 1];
          if (!latestHistoryScene || latestHistoryScene.sceneId !== sceneId) {
            if (scene.noHistory !== true) {
              this._history.push({
                sceneId: this._latestSceneId,
                sections: [],
              });
            }
          }

          if (nextStep.actions.moveToSection.sectionId) {
            if (this._seenSections[this._currentSectionId] !== true) {
              this._seenSections[this._currentSectionId] = true;
              this.savePersistentData("seenSections", this._seenSections);
            }
            if (
              this._latestSectionId !== nextStep.actions.moveToSection.sectionId
            ) {
              this._latestSectionId = nextStep.actions.moveToSection.sectionId;
              this._latestStepId = this._currentSection.steps.itemsOrder[0];
              if (scene.noHistory !== true) {
                const lastHistoryScene =
                  this._history[this._history.length - 1];
                lastHistoryScene.sections.push({
                  sectionId: this._latestSectionId,
                  lastStepId: undefined,
                });
              }
            }
          }
        } else if (scene.mode === "menu") {
          this._setMenuPointer({
            sceneId,
            sectionId: nextStep.actions.moveToSection.sectionId,
            stepId:
              scene.sections.items[nextStep.actions.moveToSection.sectionId]
                .steps.itemsOrder[0],
          });
        }

        this._updateStep();
        return;
      }
      this._latestStepId = nextStepId;

      if (!this._canSkip) {
        this._seenSections[this._currentSectionId] = this._currentStepId;
        this.savePersistentData("seenSections", this._seenSections);
      }
      this._updateStep();
    } else {
      console.warn("no next step");
    }
  };

  /**
   * Read mode, go to next step
   * if in history mode, then navigate to the next step in history
   */
  _goToNextStep = () => {
    if (this._mode === "history") {
      this._goToNextStepInHistory();
      return;
    }

    if (this._mode === "read") {
      this._goToNextStepInReadMode();
      return;
    }

    if (this._mode === "menu") {
      this._goToNextStepInMenuMode();
      return;
    }

    throw new Error("not expected mode for next step");
  };

  _goToNextStepInMenuMode = () => {
    // normal mode
    const currentStepIndex = this._currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._currentStepId
    );
    const nextStepId =
      this._currentSection.steps.itemsOrder[currentStepIndex + 1];
    const nextStep = this._currentSection.steps.items[nextStepId];
    if (nextStep) {
      if (nextStep.actions.clearHistory) {
        this._history = [];
        this._clearHistoryPointer();
      }

      let latestSceneId = this._currentSceneId;
      let latestSectionId = this._currentSectionId;
      let latestStepId = this._currentSection.steps.itemsOrder[0];

      // TODO don't add history for extra
      if (nextStep.actions.moveToSection) {
        const sceneId =
          nextStep.actions.moveToSection.sceneId || this._currentSceneId;
        const sectionId =
          nextStep.actions.moveToSection.sectionId || this._currentSectionId;
        if (latestSectionId !== sectionId) {
          latestSectionId = sectionId;
          latestStepId = this._currentSection.steps.itemsOrder[0];
        }
        const scene = this.gameData.story.scenes.items[sceneId];

        if (scene.mode === "read") {
          latestSceneId = sceneId;
          latestSectionId = nextStep.actions.moveToSection.sectionId;
          latestStepId = this._currentSection.steps.itemsOrder[0];
        }

        this._setMenuPointer({
          sceneId: latestSceneId,
          sectionId: latestSectionId,
          stepId: latestStepId,
        });

        this._updateStep();
        return;
      }
      this._setMenuPointer({
        sceneId: latestSceneId,
        sectionId: latestSectionId,
        stepId: nextStepId,
      });
      this._updateStep();
    } else {
      console.warn("no next step");
    }
  };

  /**
   * Read mode, go to previous step
   * If is not in history mode, then enter history mode
   */
  _goToPreviousStep = () => {
    if (this._mode === "menu") {
      return;
    }

    if (this._mode === "history") {
      if (this._history.length === 0) {
        return;
      }

      const stepIndex = this._currentSection.steps.itemsOrder.findIndex(
        (stepId) => stepId === this._currentStepId
      );

      if (stepIndex === 0) {
        if (this._historyPointer.sectionIndex === 0) {
          if (this._historyPointer.sceneIndex === 0) {
            return;
          } else {
            this._historyPointer.sceneIndex =
              this._historyPointer.sceneIndex - 1;
            this._historyPointer.sectionIndex =
              this._history[this._historyPointer.sceneIndex].sections.length -
              1;
            this._historyPointer.stepId =
              this._currentSection.steps.itemsOrder[
                this._currentSection.steps.itemsOrder.length - 1
              ];
            this._updateStep();
            return;
          }
        } else {
          this._historyPointer.sectionIndex =
            this._historyPointer.sectionIndex - 1;
          this._historyPointer.stepId =
            this._currentSection.steps.itemsOrder[
              this._currentSection.steps.itemsOrder.length - 1
            ];
          this._updateStep();
          return;
        }
      }

      const previousStepId =
        this._currentSection.steps.itemsOrder[stepIndex - 1];
      this._setHistoryPointer({
        sceneIndex: this._historyPointer.sceneIndex,
        sectionIndex: this._historyPointer.sectionIndex,
        stepId: previousStepId,
      });
      this._updateStep();
      return;
    }

    this._setHistoryPointer({
      sceneIndex: this._history.length - 1,
      sectionIndex:
        this._history.length === 0
          ? 0
          : this._history[this._history.length - 1].sections.length - 1,
      stepId: this._latestStepId,
    });
    this._goToPreviousStep();
  };

  _clearLatest = () => {
    this._latestSceneId = undefined;
    this._latestSectionId = undefined;
    this._latestStepId = undefined;
  };

  /**
   * start the game by rendering the first step
   */
  _start = () => {
    this._updateStep();
  };

  /**
   * open the menu
   * we take screenshot to be used as the thumbnail for the save slot
   */
  _openMenu = () => {
    this._eventActionHandler(this.gameData.story.optionsConfig.rightClick);
  };

  /**
   * update persistent data
   */
  _updateConfig = (key, value) => {
    const config = this.getPersistentData("config") || {};
    config[key] = value;
    this.savePersistentData("config", config);
  };

  _toggleConfig = (key) => {
    const config = this.getPersistentData("config") || {};
    config[key] = !config[key];
    this.savePersistentData("config", config);
  };

  /**
   * load a save slot
   * @param {*} index
   */
  _loadSlot = (index) => {
    const saveData = this.getPersistentData("saveData") || {};
    const saveSlot = saveData[index];
    this._latestSceneId = saveSlot.data.sceneId;
    this._latestSectionId = saveSlot.data.sectionId;
    this._latestStepId = saveSlot.data.stepId;
    this._history = saveSlot.data.history || [];
    this._clearMenuPointer();
    this._updateStep();
  };

  /**
   * save a slot
   * @param {*} index
   */
  _saveSlot = (index) => {
    const saveData = this.getPersistentData("saveData") || {};
    saveData[index] = {
      date: Date.now(),
      url: this._previousScreenshotUrl,
      data: {
        sceneId: this._latestSceneId,
        sectionId: this._latestSectionId,
        stepId: this._latestStepId,
        history: this._history,
      },
    };
    this.savePersistentData("saveData", saveData);
    this._updateStep();
  };

  /**
   * handle event actions
   * @param {*} payload
   */
  _eventActionHandler = (payload) => {
    if (payload.actions.setCustomState) {
      Object.keys(payload.actions.setCustomState).forEach((key) => {
        const value = payload.actions.setCustomState[key];
        if (typeof value === "object" && value.op) {
          if (value.op === "dec") {
            if (this._customState[key] - value.value < value.min) {
              // pass
            } else {
              this._customState[key] = this._customState[key] - value.value;
            }
          } else if (value.op === "inc") {
            if (this._customState[key] + value.value > value.max) {
              // pass
            } else {
              this._customState[key] = this._customState[key] + value.value;
            }
          }
        } else {
          this._customState[key] = value;
        }
      });

      // this._customState = {
      //   ...this._customState,
      //   ...payload.actions.setCustomState,
      // };

      console.log("this._customState", this._customState);
    }

    if (payload.actions.clearHistory) {
      this._history = [];
      this._clearHistoryPointer();
    }

    if (payload.actions.moveToSection) {
      let scene;

      if (payload.actions.moveToSection.sceneId) {
        scene =
          this.gameData.story.scenes.items[
            payload.actions.moveToSection.sceneId
          ];
      } else {
        scene = this._currentScene;
      }

      if (scene.mode === "read") {
        if (this._mode !== "read") {
          this._clearHistoryPointer();
          this._clearMenuPointer();
        }

        if (payload.actions.moveToSection.sceneId) {
          this._latestSceneId = payload.actions.moveToSection.sceneId;
        }
        this._latestSectionId = payload.actions.moveToSection.sectionId;
        const nextStepId = this._currentSection.steps.itemsOrder[0];
        this._latestStepId = nextStepId;

        const lastHistoryScene = this._history[this._history.length - 1];

        if (scene.noHistory !== true) {
          if (lastHistoryScene) {
            if (lastHistoryScene.sceneId !== this._latestSceneId) {
              this._history.push({
                sceneId: this._latestSceneId,
                sections: [],
              });
            } else {
              lastHistoryScene.sections.push({
                sectionId: this._latestSectionId,
              });
            }
          } else {
            this._history.push({
              sceneId: this._latestSceneId,
              sections: [
                {
                  sectionId: this._latestSectionId,
                },
              ],
            });
          }
        }
      }

      if (scene.mode === "menu") {
        const sceneId =
          payload.actions.moveToSection.sceneId || this._currentSceneId;
        const stepId =
          this.gameData.story.scenes.items[sceneId].sections.items[
            payload.actions.moveToSection.sectionId
          ].steps.itemsOrder[0];

        this._setMenuPointer({
          sceneId,
          sectionId: payload.actions.moveToSection.sectionId,
          stepId,
        });
      }
    }

    if (payload.actions.setConfig) {
      Object.keys(payload.actions.setConfig).forEach((key) => {
        if (
          typeof payload.actions.setConfig[key] === "object" &&
          payload.actions.setConfig[key].op === "toggle"
        ) {
          this._toggleConfig(key);
        } else {
          this._updateConfig(key, payload.actions.setConfig[key]);
        }
      });
    }

    if (payload.actions.clearTempAction) {
      this._modalScreenId = undefined;
    }

    // if (payload.actions.screen) {
    //   this._tempGlobalActions = payload;
    // }
    if (payload.actions.modalScreenId) {
      this._modalScreenId = payload.actions.modalScreenId;
    }

    if (payload.actions.clearMenu) {
      this._clearMenuPointer();
    }

    if (payload.actions.back) {
      this._goToPreviousStep();
    }

    if (payload.actions.toggleSkipMode) {
      this._customState.skipMode = !this._customState.skipMode;
      if (this._customState.skipMode) {
        this._skipInterval = setInterval(() => {
          if (this._canSkip) {
            this._goToNextStep();
          } else {
            clearInterval(this._skipInterval);
            this._customState.skipMode = false;
            this._updateStep();
          }
        }, 200);
      } else {
        clearInterval(this._skipInterval);
        this._updateStep();
      }
    }

    if (payload.actions.clearLatest) {
      this._clearHistoryPointer();
      // this._clearLatest();
      // this._setInitialScene();
    }

    if (payload.actions.toggleAutoMode) {
      this._customState.autoMode = !this._customState.autoMode;
      if (this._customState.autoMode) {
        this._goToNextStep();
        this._updateStep();
      } else {
        this._updateStep();
      }
      return;
    }

    this._updateStep();
  };

  _lastWheelTime = 0;
  handleAction = (action, payload = {}) => {
    console.log("handleAction", action, payload);
    if (action === HandlerActions.Init) {
      this._start();
      return;
    }

    if (action === HandlerActions.OpenMenu) {
      this._openMenu();
      return;
    }

    if (action === HandlerActions.HideMenu) {
      this._clearMenuPointer();
      this._updateStep();
      return;
    }

    if (action === HandlerActions.NextStep) {
      this._goToNextStep();
      console.log("this._historyDialogue", this._historyDialogue);
      return;
    }

    if (action === HandlerActions.PreviousStep) {
      this._goToPreviousStep();
      return;
    }

    // if (action === HandlerActions.Slider) {
    //   this._updateConfig(payload.eventName, payload.value);
    //   return;
    // }

    if (action === HandlerActions.SaveSlot) {
      this._saveSlot(payload.index);
      return;
    }

    if (action === HandlerActions.LoadSlot) {
      this._loadSlot(payload.index);
      return;
    }

    if (action === HandlerActions.Actions) {
      this._eventActionHandler(payload);
      return;
    }

    if (action === HandlerActions.StepCompleted) {
      if (this._currentStep.autoNext) {
        setTimeout(() => {
          this._goToNextStep();
        }, this._currentStep.autoNextDelay || 0);
      } else if (this._customState.autoMode) {
        const config = this.getPersistentData("config") || {};
        const interval = Math.max(100 - config.autoForwardTime, 1) * 50;
        if (this._autoModeTimeout) {
          clearTimeout(this._autoModeTimeout);
        }
        this._autoModeTimeout = setTimeout(() => {
          if (this._mode === "read") {
            this._goToNextStep();
          }
        }, interval);
      }
    }

    if (action === HandlerActions.Skip) {
      if (this._mode === "menu") {
        return;
      }
      if (this._customState.skipMode === true) {
        return;
      }

      if (this._canSkip) {
        this._customState.skipMode = true;
        this._goToNextStep();
        this._skipInterval = setInterval(() => {
          if (this._canSkip) {
            this._goToNextStep();
          } else {
            clearInterval(this._skipInterval);
            this._customState.skipMode = false;
            this._updateStep();
          }
        }, 200);
      } else {
        clearInterval(this._skipInterval);
        this._customState.skipMode = false;
      }
    }

    if (action === HandlerActions.StopSkip) {
      if (this._customState.skipMode === false) {
        return;
      }
      this._customState.skipMode = false;
      clearInterval(this._skipInterval);
      this._updateStep();
    }

    if (action === HandlerActions.Wheel) {
      const currentTime = Date.now();
      if (!this._lastWheelTime || currentTime - this._lastWheelTime >= 500) {
        this._lastWheelTime = currentTime;
        if (payload.deltaY > 0) {
          // Handle scroll down if needed
        } else {
          this._goToPreviousStep();
        }
      }
    }
  };
}
