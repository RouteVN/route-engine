import {
  PixiTDR,
  SpriteRendererPlugin,
  SpriteInteractiveRendererPlugin,
  TextRendererPlugin,
  TextRevealingRendererPlugin,
  TextInteractiveRendererPlugin,
  ContainerRendererPlugin,
  FadeTransitionPlugin,
  ScaleTransitionPlugin,
  RepeatFadeTransitionPlugin,
  KeyframeTransitionPlugin,
  AnchorLayoutContainerRendererPlugin,
  GraphicsRendererPlugin,
  SoundPlugin,
  SliderRendererPlugin,
} from "./renderer.js";

class VnController {
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

  _history = [];
  // _history = [{
  //   sceneId: 'asdf',
  //   sections: [{
  //     sectionId: 'v4332',
  //     choices: [{
  //       stepId: 'v332a',
  //       choiceId: '3dfk32',
  //     }],
  //     lastStepId: 'va3'
  //   }]
  // }]

  // points to the current history step
  // _historyPointer = undefined;
  _historyPointer = {
    sceneId: undefined,
    sectionId: undefined,
    stepId: undefined,
  }

  _state = {
    currentPage: "main",
    mode: "menu", // read
  };

  _historyMode = false;

  get _currentSceneId() {
    if (this._historyMode) {
      return this._historyPointer.sceneId;
    }
    return this._latestSceneId;
  }

  get _currentSectionId() {
    if (this._historyMode) {
      return this._historyPointer.sectionId;
    }
    return this._latestSectionId;
  }

  get _currentStepId() {
    if (this._historyMode) {
      return this._historyPointer.stepId;
    }
    return this._latestStepId;
  }

  _latestSceneId;
  _latestSectionId;
  _latestStepId;

  _stage = {
    currentSceneId: undefined,
    currentSectionId: undefined,
    currentStepId: undefined,

    // currentHistoryIndex: -1,
    // historyMaxiumStepId: undefined,


    // elements: [],
    // transitions: [],
    // gameState: {
    //   hideDialogBox: false,
    //   endEffects: false,
    //   stepCompleted: false,
    // },
    config: {
      screenWidth: undefined,
      screenHeight: undefined,
    },
  };

  get _currentScene() {
    if (!this._currentSceneId) {
      return;
    }
    return this.gameData.story.scenes.items[this._currentSceneId];
  }

  get _currentSection() {
    if (!this._currentSectionId) {
      return;
    }
    return this._currentScene.sections.items[this._currentSectionId];
  }

  get _currentStep() {
    if (!this._currentStepId) {
      return;
    }
    return this._currentSection.steps.items[this._currentStepId];
  }

  get _currentState() {
    const currentSection = this._currentSection;
    const currentStepIndex = currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._stage.currentStepId
    );
    const stepIds = currentSection.steps.itemsOrder.slice(
      0,
      currentStepIndex + 1
    );
    const steps = stepIds.map((stepId) => currentSection.steps.items[stepId]);
    console.log("steps", steps);
    const state = steps.reduce((accState, step) => {
      if (step.actions.background) {
        if (step.actions.background.backgroundId) {
          accState.background = step.actions.background;
        } else {
          delete accState.background;
        }
      } else {
        if (accState.background) {
          if (accState.background.inAnimation) {
            accState.background.inAnimation = undefined;
          }
        }
      }
      if (step.actions.sfx) {
        accState.sfx = step.actions.sfx;
      } else {
        if (accState.sfx) {
          delete accState.sfx;
        }
      }

      if (step.actions.bgm) {
        accState.bgm = step.actions.bgm;
        if (step.actions.bgm.loop || step.actions.bgm.loop === undefined) {
          accState.bgm.loop = true;
        } else {
          accState.bgm.loop = false;
        }
      } else {
      }

      if (step.actions.visual) {
        accState.visual = step.actions.visual;
        for (const item of accState.visual.items) {
          // if (item.inAnimation) {
          //   item.inAnimation = undefined;
          // }
          // if (item.outAnimation) {
          //   item.outAnimation = undefined;
          // }
        }
      } else {
        if (accState.visual) {
          accState.visual.items = accState.visual.items.filter(
            (visual) => !!visual.visualId
          );
        }
      }
      if (step.actions.dialogue) {
        accState.dialogue = {
          ...accState.dialogue,
          ...step.actions.dialogue,
        };
        if (step.actions.dialogue.character) {
          if (!step.actions.dialogue.character.characterName) {
            delete accState.dialogue.character.characterName;
          }
        }
        if (step.actions.dialogue.incremental) {
          if (!accState.dialogue.texts) {
            accState.dialogue.texts = [];
          }
          accState.dialogue.texts.push({
            childItemId: step.actions.dialogue.childItemId,
            text: step.actions.dialogue.text,
          });
        }
      }

      if (step.actions.character) {
        if (!accState.character) {
          accState.character = step.actions.character;
        } else {
          for (const item of step.actions.character.items) {
            const accStateItemIndex = accState.character.items.findIndex(
              (i) => i.id === item.id
            );
            if (accStateItemIndex !== -1) {
              accState.character.items[accStateItemIndex] = {
                ...accState.character.items[accStateItemIndex],
                ...item,
              };
              if (!item.inAnimation) {
                delete accState.character.items[accStateItemIndex].inAnimation;
              }
              if (!item.outAnimation) {
                delete accState.character.items[accStateItemIndex].outAnimation;
              }
            } else {
              accState.character.items.push(item);
            }
          }
          for (const item of accState.character.items) {
            const foundCharacter = step.actions.character.items.find(
              (c) => c.id === item.id
            );
            if (foundCharacter) {
              if (!foundCharacter.inAnimation) {
                delete item.inAnimation;
              }
            } else {
              delete item.inAnimation;
            }
          }
        }
      }

      if (step.actions.animation) {
        accState.animation = step.actions.animation;
      } else {
        if (accState.animation) {
          delete accState.animation;
        }
      }

      if (step.actions.screen) {
        accState.screen = step.actions.screen;
      } else {
        if (accState.screen) {
          delete accState.screen;
        }
      }

      if (step.actions.cleanAll) {
        accState = {};
      }

      if (step.actions.moveToSection) {
        accState.moveToSection = step.actions.moveToSection;
      } else {
        if (accState.moveToSection) {
          delete accState.moveToSection;
        }
      }

      return accState;
    }, {});
    return state;
  }

  init = async () => {
    const gameData = await this.getData(this.gameDataPath);
    this.gameData = gameData;
    const { screen, story } = gameData;
    const { startSceneId } = story;

    this._stage.currentSceneId = startSceneId;

    const startScene = this._currentScene;
    const startSectionId = startScene.sections.itemsOrder[0];
    const startSection = startScene.sections.items[startSectionId];
    const startStepId = startSection.steps.itemsOrder[0];

    this._stage.currentSceneId = startSceneId;
    this._stage.currentSectionId = startSectionId;
    this._stage.currentStepId = startStepId;
    this._stage.config.screenWidth = screen.width;
    this._stage.config.screenHeight = screen.height;
  };

  updateStep = () => {
    const { resources } = this.gameData;
    const currentState = this._currentState;

    const elements = [];
    const transitions = [];

    elements.push({
      id: "bg-screen",
      type: "graphics",
      x1: 0,
      x2: this._stage.config.screenWidth,
      y1: 0,
      y2: this._stage.config.screenHeight,
      fill: "black",
    });

    console.log("currentState", currentState);

    if (currentState.moveToSection) {
      this._stage.currentSectionId = currentState.moveToSection.sectionId;
      this._stage.currentStepId = this._currentSection.steps.itemsOrder[0];
      // if (this._stage.currentHistoryIndex === this._stage.history.length - 1) {
      //   this._stage.history.push({
      //     sceneId: this._stage.currentSceneId,
      //     sectionId: this._stage.currentSectionId,
      //     jumps: [],
      //   });
      //   this._stage.currentHistoryIndex = this._stage.history.length - 1;
      //   this._stage.historyMaxiumStepId = this._stage.currentStepId;
      // } else {
      //   this._stage.currentHistoryIndex++;
      // }
      this.updateStep();
      return;
    }

    if (currentState.background) {
      const background =
        resources.background.items[currentState.background.backgroundId];
      if (background) {
        elements.push({
          id: "bg",
          type: "sprite",
          url: background.src,
          xa: 0.5,
          ya: 0.5,
          xp: 0.5,
          yp: 0.5,
        });
        if (currentState.background.inAnimation) {
          const animation =
            resources.animation.items[
              currentState.background.inAnimation.animationId
            ];
          transitions.push({
            elementId: "bg",
            type: "keyframes",
            event: "add",
            animationProperties: animation.properties,
          });
        }
        if (currentState.background.outAnimation) {
          const animation =
            resources.animation.items[
              currentState.background.outAnimation.animationId
            ];
          transitions.push({
            elementId: "bg",
            type: "keyframes",
            event: "remove",
            animationProperties: animation.properties,
          });
        }
      }
    }

    if (currentState.character) {
      for (const item of currentState.character.items) {
        const character = resources.character.items[item.characterId];
        if (character) {
          const position = resources.position.items[item.position.positionId];
          const containerElementId = `character-${character.id}`;
          const container = {
            id: containerElementId,
            type: "container",
            x: position.x,
            y: position.y,
            xa: position.xa,
            ya: position.ya,
            children: [],
          };
          for (const spritePart of item.spriteParts) {
            const sprite = character.sprites.items[spritePart.spriteId];
            if (sprite) {
              container.children.push({
                id: `character-${character.id}-${spritePart.partId}`,
                type: "sprite",
                url: sprite.src,
                x: 0,
                y: 0,
                xa: position.xa,
                ya: position.ya,
              });
            }
          }
          if (item.inAnimation) {
            const inAnimation =
              resources.animation.items[item.inAnimation.animationId];
            if (inAnimation) {
              transitions.push({
                elementId: containerElementId,
                type: "keyframes",
                event: "add",
                animationProperties: inAnimation.properties,
              });
            }
          }
          elements.push(container);
        }
      }
    }

    if (currentState.visual) {
      for (const item of currentState.visual.items) {
        const visual = resources.visual.items[item.visualId];
        const id = `visual-${item.id}`;
        const position = {
          ...resources.position.items[item.position?.positionId],
          ...item.position,
        };
        if (visual) {
          elements.push({
            id,
            type: "sprite",
            url: visual.src,
            xa: position.xa,
            ya: position.ya,
            x: position.x,
            y: position.y,
          });
        }

        if (item.inAnimation) {
          const inAnimation =
            resources.animation.items[item.inAnimation.animationId];
          if (inAnimation) {
            transitions.push({
              elementId: id,
              type: "keyframes",
              event: "add",
              animationProperties: inAnimation.properties,
            });
          }
        }
        if (item.outAnimation) {
          const outAnimation =
            resources.animation.items[item.outAnimation.animationId];
          if (outAnimation) {
            transitions.push({
              elementId: id,
              type: "keyframes",
              event: "remove",
              animationProperties: outAnimation.properties,
            });
          }
        }
      }
    }

    if (currentState.dialogue) {
      const _dialogueBox =
        resources.dialogueBox.items[currentState.dialogue.dialogueBoxId];
      if (_dialogueBox) {
        const dialogueBox = JSON.parse(
          JSON.stringify(_dialogueBox).replace(
            "$config.textSpeed",
            this.getPersistentData("textSpeed")?.value
          )
        );
        const id = `dialogueBox-${dialogueBox.id}-${Math.random()}`;
        const character =
          resources.character.items[
            currentState.dialogue?.character?.characterId
          ];
        const characterName = currentState.dialogue?.character
          ? currentState.dialogue.character.characterName
          : undefined;

        for (const item of dialogueBox.layout) {
          if (item.incremental) {
            for (const { text, childItemId } of currentState.dialogue.texts) {
              const childItem = JSON.parse(
                JSON.stringify(item.childItems)
              ).find((ci) => ci.id === childItemId);

              const child = {
                ...childItem,
                id: `${item.id}-${text}`,
                text,
              };

              if (childItem.contentSource === "dialogueContent") {
                child.text = text;
              }

              if (child.children) {
                for (const childItem of child.children) {
                  if (childItem.contentSource === "dialogueContent") {
                    childItem.text = text;
                  }
                }
              }

              item.children.push(child);
            }
          } else {
            for (const child of item.children) {
              if (child.contentSource === "dialogueContent") {
                child.text = currentState.dialogue.text;
              }
              if (character && child.contentSource === "characterName") {
                child.text = character.name;
                child.style.fill = character.whoColor;
              }
              if (characterName && child.contentSource === "characterName") {
                child.text = characterName;
              }
            }
          }

          elements.push({
            ...item,
            id,
          });
        }
      }
    }

    if (currentState.bgm) {
      const bgm = resources.bgm.items[currentState.bgm.bgmId];
      if (bgm) {
        elements.push({
          id: `bgm`,
          type: "sound",
          url: bgm.src,
          loop: currentState.bgm.loop,
        });
      }
    }

    if (currentState.sfx) {
      for (const item of currentState.sfx.items) {
        const sfx = resources.sfx.items[item.sfxId];
        if (sfx) {
          elements.push({
            id: item.id,
            type: "sound",
            url: sfx.src,
            delay: item.delay,
          });
        }
      }
    }

    if (currentState.animation) {
      const animation =
        resources.animation.items[currentState.animation.animationId];
      if (animation) {
        transitions.push({
          elementId: "root",
          type: "keyframes",
          event: "add",
          animationProperties: animation.properties,
        });
      }
    }

    if (currentState.screen) {
      for (const { id, screenId } of currentState.screen.items) {
        const screen = JSON.parse(
          JSON.stringify(resources.screen.items[screenId])
            .replace("$state.currentPage", this._state.currentPage)
            .replace(
              "$config.textSpeed",
              this.getPersistentData("textSpeed")?.value
            )
        );

        // Recursively replace data = $saveData with saveData
        const rawSaveData = this.getPersistentData("saveData") || {};
        const saveData = [1, 2, 3].map((slot) => {
          const res = rawSaveData[slot];
          if (res) {
            res.id = `saveSlot-${slot}`;
            return res;
          }
          return {};
        });

        const replaceSaveData = (obj) => {
          if (obj.data === "$saveData") {
            obj.data = saveData;
          }
          if (obj.children && Array.isArray(obj.children)) {
            obj.children.forEach((child) => replaceSaveData(child));
          }
          if (obj.layout && Array.isArray(obj.layout)) {
            obj.layout.forEach((item) => replaceSaveData(item));
          }
          if (Array.isArray(obj)) {
            obj.forEach((item) => replaceSaveData(item));
          }
        };
        replaceSaveData(screen);

        if (screen) {
          elements.push({
            id: `screen-${id}-${Math.random()}`,
            type: "container",
            children: screen.layout,
          });
        }
      }
    }

    // console.log("elements", elements);
    // console.log("transitions", transitions);

    // this._stage.historyMaxiumStepId = this._stage.currentStepId;
    // const index = this._currentSection.steps.itemsOrder.findIndex(stepId => stepId === this._stage.currentStepId);
    // if (this._stage.currentHistoryIndex < index) {
    //   this._stage.currentHistoryIndex = index;
    // }

    this.onChangeGameStage({
      elements: [
        {
          id: "root",
          type: "container",
          children: elements,
        },
      ],
      transitions,
      stepId: this._stage.currentStepId,
    });
  };

  /**
   * Read mode, go to next step
   */
  _goToNextStep = () => {

    if (this._historyMode) {
      // this._historyPointer.sectionIndex++;
      // if (this._historyPointer.sectionIndex >= this._currentScene.sections.length) {
      //   this._historyPointer.sectionIndex = 0;
      // }
      // this._historyPointer.stepId = this._currentSection.steps.itemsOrder[0];
    }

    const currentSection = this._currentSection;
    const currentStepIndex = currentSection.steps.itemsOrder.findIndex(
      (stepId) => stepId === this._stage.currentStepId
    );
    const nextStepId = currentSection.steps.itemsOrder[currentStepIndex + 1];
    const nextStep = currentSection.steps.items[nextStepId];
    if (nextStep) {
      this._stage.currentStepId = nextStepId;
      this.updateStep();
    } else {
      console.warn("no next step");
    }
  }

  handleAction = (action, payload) => {
    if (action === "init") {
      this.updateStep();
    }

    if (action === "rightClick" && this._state.mode === "read") {
      this.takeScreenshot().then((url) => {
        this._stage.previousSceneId = this._stage.currentSceneId;
        this._stage.previousSectionId = this._stage.currentSectionId;
        this._stage.previousStepId = this._stage.currentStepId;
        this._stage.previousMode = this._state.mode;
        this._stage.previousScreenshotUrl = url;

        this._state.mode = "menu";
        this._state.currentPage = "options";

        this._stage.currentSceneId =
          this.gameData.story.optionsConfig.rightClick.sceneId;
        this._stage.currentSectionId =
          this.gameData.story.optionsConfig.rightClick.sectionId;
        const firstStepId = this._currentSection.steps.itemsOrder[0];
        this._stage.currentStepId = firstStepId;
        this.updateStep();
        return;
      });
    }

    if (action === "click") {
      if (this._state.mode !== "read") {
        return;
      }
      this._goToNextStep();
    }

    if (action === "historyBack") {
      // console.log("history back", this._state.mode);
      // if (this._state.mode === "read") {
      //   console.log("this._stage.history.length", this._stage.history.length);
      //   if (this._stage.history.length > 0) {
      //     const history = this._stage.history[this._stage.currentHistoryIndex];
      //     console.log("history", history);
      //     if (history) {
      //       console.log(
      //         "this._currentSection.steps.itemsOrder",
      //         this._currentSection.steps.itemsOrder
      //       );
      //       console.log(
      //         "this._stage.currentHistoryIndex",
      //         this._stage.currentHistoryIndex
      //       );
      //       // const index = this._stage.currentHistoryIndex;
      //       const index = this._currentSection.steps.itemsOrder.findIndex(
      //         (stepId) => stepId === this._stage.currentStepId
      //       );
      //       console.log('history back index', index)
      //       if (index === 0) {
      //         console.log('HISTROY BACK first step ')
      //         this._stage.currentHistoryIndex--;
      //         if (!this._stage.history[this._stage.currentHistoryIndex]) {
      //           // pass
      //         } else {
      //           this._stage.currentSceneId = this._stage.history[this._stage.currentHistoryIndex].sceneId;
      //           this._stage.currentSectionId = this._stage.history[this._stage.currentHistoryIndex].sectionId;
      //           this._stage.currentStepId = this._currentSection.steps.itemsOrder[this._currentSection.steps.itemsOrder.length - 1];
      //           if (this._currentStep.actions.moveToSection) {
      //             this._stage.currentStepId = this._currentSection.steps.itemsOrder[this._currentSection.steps.itemsOrder.length - 2];
      //           }
      //           console.log('history back first step this._stage.currentStepId', this._stage.currentStepId)
      //           this.updateStep();
      //         }
      //       } else {
      //         const previousStepId =
      //           this._currentSection.steps.itemsOrder[index - 1];
      //         console.log("history back previousStepId", previousStepId);
      //         if (previousStepId) {
      //           this._stage.currentStepId = previousStepId;
      //           this.updateStep();
      //         }
      //       }

      //       // this._stage.historyMaxiumStepId;
      //     }
      //   }
      // }
    }

    if (action === "event") {
      if (payload.eventAction === "sliderEvent") {
        if (payload.eventPayload.eventName) {
          this.savePersistentData(payload.eventPayload.eventName, {
            value: payload.eventPayload.value,
          });
        }
      }

      if (
        payload.eventAction === "click" &&
        payload.eventPayload.eventName === "saveSlot"
      ) {
        const saveData = this.getPersistentData("saveData") || {};
        saveData[Number(payload.eventPayload.eventPayload.index) + 1] = {
          name: "Save Slot 2",
          date: Date.now(),
          url: this._stage.previousScreenshotUrl,
          data: {
            sceneId: this._stage.previousSceneId,
            sectionId: this._stage.previousSectionId,
            stepId: this._stage.previousStepId,
          },
        };
        this.savePersistentData("saveData", saveData);
        this.updateStep();

        return;
      }

      if (
        payload.eventAction === "click" &&
        payload.eventPayload.eventName === "loadSlot"
      ) {
        const saveData = this.getPersistentData("saveData") || {};
        const saveSlot =
          saveData[Number(payload.eventPayload.eventPayload.index) + 1];
        this._state.mode = "read";
        this._stage.currentSceneId = saveSlot.data.sceneId;
        this._stage.currentSectionId = saveSlot.data.sectionId;
        this._stage.currentStepId = saveSlot.data.stepId;
        this.updateStep();
        return;
      }
      if (payload.eventAction === "click") {
        const { eventName } = payload.eventPayload;
        const handler =
          this._currentStep?.eventHandlers?.[eventName] ||
          this._currentSection?.eventHandlers?.[eventName] ||
          this._currentScene?.eventHandlers?.[eventName];
        if (handler) {
          if (handler.actions.setState) {
            this._state = {
              ...this._state,
              ...handler.actions.setState,
            };
          }

          if (handler.actions.moveToSection) {
            // if (handler.actions.moveToSection.history) {
            //   this._stage.previousSceneId = this._stage.currentSceneId;
            //   this._stage.previousSectionId = this._stage.currentSectionId;
            //   this._stage.previousStepId = this._stage.currentStepId;
            //   this._stage.previousMode = this._state.mode;
            // }
            if (handler.actions.moveToSection.sceneId) {
              this._stage.currentSceneId =
                handler.actions.moveToSection.sceneId;
            }
            this._stage.currentSectionId =
              handler.actions.moveToSection.sectionId;
            const nextStepId = this._currentSection.steps.itemsOrder[0];
            this._stage.currentStepId = nextStepId;

            // if (
            //   this._stage.currentHistoryIndex ===
            //   this._stage.history.length - 1
            // ) {
            //   this._stage.history.push({
            //     sceneId: this._stage.currentSceneId,
            //     sectionId: this._stage.currentSectionId,
            //     jumps: [],
            //   });
            //   this._stage.currentHistoryIndex = this._stage.history.length - 1;
            //   this._stage.historyMaxiumStepId = this._stage.currentStepId;
            // } else {
            //   this._stage.currentHistoryIndex++;
            // }
          }

          if (handler.actions.back) {
            this._stage.currentSceneId = this._stage.previousSceneId;
            this._stage.currentSectionId = this._stage.previousSectionId;
            this._stage.currentStepId = this._stage.previousStepId;
            this._state.mode = this._stage.previousMode;
          }
          this.updateStep();
        }
        return;
      }
      if (payload.eventAction === "completed") {
        if (this._currentStep.autoNext) {
          setTimeout(() => {
            const currentSection = this._currentSection;
            const currentStepIndex = currentSection.steps.itemsOrder.findIndex(
              (stepId) => stepId === this._stage.currentStepId
            );
            const nextStepId =
              currentSection.steps.itemsOrder[currentStepIndex + 1];
            const nextStep = currentSection.steps.items[nextStepId];
            if (nextStep) {
              this._stage.currentStepId = nextStepId;
              this.updateStep();
            } else {
              const currentSectionIndex = this._currentScene.sections.findIndex(
                (section) => section.id === this._stage.currentSectionId
              );
              const nextSection =
                this._currentScene.sections[currentSectionIndex + 1];
              if (nextSection) {
                this._stage.currentSectionId = nextSection.id;
                this._stage.currentStepId = nextSection.steps[0].id;
                this.updateStep();
              }
            }
          }, this._currentStep.autoNextDelay || 0);
        }
      }
    }
  };
}

const applyWasmController = async (options) => {
  const controller = new VnController(options);
  await controller.init();
  return controller.handleAction;
};

const getAllValuesByPropertyName = (obj, propertyNames) => {
  const result = [];

  const traverse = (obj) => {
    if (typeof obj === "object" && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach((item) => traverse(item));
      } else {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (propertyNames.includes(key)) {
              result.push(obj[key]);
            }
            traverse(obj[key]);
          }
        }
      }
    }
  };

  traverse(obj);
  return result;
};

const initializeVnPlayer = async (element, onClose) => {
  const app = new PixiTDR();
  const controller = await applyWasmController({
    gameDataPath: "002",
    getData: (path) =>
      fetch(`/public/vndata/${path}.json`).then((res) => res.json()),
    getPersistentData: (key) => {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : undefined;
    },
    savePersistentData: (key, data) => {
      if (data === undefined) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(data));
    },
    onChangeGameStage: async ({ stepId, elements, transitions }) => {
      const fileUrls = getAllValuesByPropertyName(elements, ["url"]).filter(
        (url) => !!url
      );
      await app.loadAssets(
        fileUrls.filter((url) => !url.endsWith(".wav") && !url.endsWith(".ogg"))
      );
      const soundFileIds = fileUrls.filter(
        (url) => url.endsWith(".wav") || url.endsWith(".ogg")
      );
      await app.loadSoundAssets(soundFileIds);
      app.render({
        id: stepId,
        elements: elements,
        transitions: transitions,
      });
    },
    takeScreenshot: () => {
      const url = app._app.renderer.extract.base64(app._app.stage);
      return url;
    },
    onClose,
  });

  await app.init({
    width: 1280,
    height: 720,
    backgroundColor: "black",
    plugins: [
      new SpriteRendererPlugin(),
      new SpriteInteractiveRendererPlugin(),
      new TextRendererPlugin(),
      new TextRevealingRendererPlugin(),
      new TextInteractiveRendererPlugin(),
      new ContainerRendererPlugin(),
      new FadeTransitionPlugin(),
      new ScaleTransitionPlugin(),
      new RepeatFadeTransitionPlugin(),
      new KeyframeTransitionPlugin(),
      new AnchorLayoutContainerRendererPlugin(),
      new GraphicsRendererPlugin(),
      new SoundPlugin(),
      new SliderRendererPlugin(),
    ],
    eventHandler: (action, payload) =>
      controller("event", {
        eventAction: action,
        eventPayload: payload,
      }),
  });

  app._app.stage.eventMode = "static";
  app._app.stage.on("pointerdown", (e) => {
    if (e.data.button === 0) {
      controller("click", {
        eventAction: undefined,
        eventPayload: undefined,
      });
    } else if (e.data.button === 2) {
      controller("rightClick", {
        eventAction: undefined,
        eventPayload: undefined,
      });
    }
  });
  let lastWheelTime = 0;
  const throttleDelay = 300; // 1 second

  app._app.stage.on("wheel", (e) => {
    const currentTime = Date.now();
    if (currentTime - lastWheelTime < throttleDelay) {
      return; // Ignore wheel events within the throttle delay
    }
    lastWheelTime = currentTime;

    if (e.deltaY > 0) {
      console.log("Wheel scrolled down");
    } else {
      console.log("Wheel scrolled up");
      controller("historyBack", {
        eventAction: undefined,
        eventPayload: undefined,
      });
    }
  });

  app.loadAssets([
    "/public/first-contract/font/NomnomNami2.ttf",
    "/public/first-contract/gui/slider/horizontal_idle_thumb.png",
    "/public/first-contract/gui/slider/horizontal_hover_thumb.png",
    "/public/first-contract/gui/slider/horizontal_idle_bar.png",
    "/public/first-contract/gui/slider/horizontal_hover_bar.png",
    "/public/first-contract/gui/slider/vertical_idle_thumb.png",
    "/public/first-contract/gui/slider/vertical_hover_thumb.png",
    "/public/first-contract/gui/slider/vertical_idle_bar.png",
    "/public/first-contract/gui/slider/vertical_hover_bar.png",
  ]);

  element.appendChild(app.canvas);
  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  controller("init", {});
};

export default initializeVnPlayer;
