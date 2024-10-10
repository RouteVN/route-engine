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

  _state = {
    currentPage: "main",
  };

  _stage = {
    currentSceneId: undefined,
    currentSectionId: undefined,
    currentStepId: undefined,
    elements: [],
    transitions: [],
    gameState: {
      hideDialogBox: false,
      endEffects: false,
      stepCompleted: false,
    },
    config: {
      screenWidth: undefined,
      screenHeight: undefined,
    },
  };

  get _currentScene() {
    if (!this._stage.currentSceneId) {
      return;
    }
    return this.gameData.story.scenes.items[this._stage.currentSceneId];
  }

  get _currentSection() {
    if (!this._stage.currentSectionId) {
      return;
    }
    return this._currentScene.sections.items[this._stage.currentSectionId];
  }

  get _currentStep() {
    if (!this._stage.currentStepId) {
      return;
    }
    return this._currentSection.steps.items[this._stage.currentStepId];
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

    console.log("currentState", currentState);

    if (currentState.moveToSection) {
      this._stage.currentSectionId = currentState.moveToSection.sectionId;
      this._stage.currentStepId = this._currentSection.steps.itemsOrder[0];
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
        const dialogueBox = JSON.parse(JSON.stringify(_dialogueBox));
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
          JSON.stringify(resources.screen.items[screenId]).replace(
            "$state.currentPage",
            this._state.currentPage
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

    console.log("elements", elements);
    console.log("transitions", transitions);

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

  handleAction = (action, payload) => {
    // console.log('action', action, payload)
    if (action === "init") {
      this.updateStep();
    }

    if (action === "rightClick") {
      console.log("rightClick", action, payload);
      this.takeScreenshot().then((url) => {
        this._stage.previousSceneId = this._stage.currentSceneId;
        this._stage.previousSectionId = this._stage.currentSectionId;
        this._stage.previousStepId = this._stage.currentStepId;
        this._stage.previousScreenshotUrl = url;

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
      // return;
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
        return;
        const currentSectionIndex =
          this._currentScene.sections.itemsOrder.findIndex(
            (sectionId) => sectionId === this._stage.currentSectionId
          );
        const nextSectionId =
          this._currentScene.sections.itemsOrder[currentSectionIndex + 1];
        const nextSection = this._currentScene.sections.items[nextSectionId];
        if (nextSection) {
          const nextStepId = nextSection.steps.itemsOrder[0];
          this._stage.currentSectionId = nextSectionId;
          this._stage.currentStepId = nextStepId;
          this.updateStep();
        } else {
          this.onClose && this.onClose();
        }
      }
    }

    if (action === "event") {
      console.log("event", action, payload);
      if (
        payload.eventAction === "click" &&
        payload.eventPayload.eventName === "saveSlot"
      ) {
        console.log("saveSlot", payload);
        const saveData = this.getPersistentData("saveData") || {};
        console.log("saveData", saveData);
        // this.takeScreenshot().then((url) => {
        saveData[Number(payload.eventPayload.eventPayload.index) + 1] = {
          name: "Save Slot 2",
          date: Date.now(),
          // url: '/public/first-contract/images/cg holdhands.png',
          url: this._stage.previousScreenshotUrl,
          data: {
            sceneId: this._stage.previousSceneId,
            sectionId: this._stage.previousSectionId,
            stepId: this._stage.previousStepId,
          },
        };
        this.savePersistentData("saveData", saveData);
        this.updateStep();
        // })

        return;
      }

      if (
        payload.eventAction === "click" &&
        payload.eventPayload.eventName === "loadSlot"
      ) {
        console.log("loadSlot", payload);
        const saveData = this.getPersistentData("saveData") || {};
        const saveSlot =
          saveData[Number(payload.eventPayload.eventPayload.index) + 1];
        console.log("saveSlot", saveSlot);
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
          console.log("handler", handler);

          if (handler.actions.setState) {
            this._state = {
              ...this._state,
              ...handler.actions.setState,
            };
            console.log("this._state", this._state);
          }

          if (handler.actions.moveToSection) {
            if (handler.actions.moveToSection.history) {
              this._stage.previousSceneId = this._stage.currentSceneId;
              this._stage.previousSectionId = this._stage.currentSectionId;
              this._stage.previousStepId = this._stage.currentStepId;
            }
            if (handler.actions.moveToSection.sceneId) {
              this._stage.currentSceneId =
                handler.actions.moveToSection.sceneId;
            }
            this._stage.currentSectionId =
              handler.actions.moveToSection.sectionId;
            const nextStepId = this._currentSection.steps.itemsOrder[0];
            this._stage.currentStepId = nextStepId;
          }

          if (handler.actions.back) {
            this._stage.currentSceneId = this._stage.previousSceneId;
            this._stage.currentSectionId = this._stage.previousSectionId;
            this._stage.currentStepId = this._stage.previousStepId;
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
              console.log("nextSection", nextSection);
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
  const contorller = new VnController(options);
  await contorller.init();
  return contorller.handleAction;
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
    ],
    eventHandler: (action, payload) =>
      controller("event", {
        eventAction: action,
        eventPayload: payload,
      }),
  });

  app.loadAssets(["/public/first-contract/font/NomnomNami2.ttf"]);

  element.appendChild(app.canvas);
  element.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller("click", {
      eventAction: e.action,
      eventPayload: e.payload,
    });
  });
  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller("rightClick", {
      eventAction: e.action,
      eventPayload: e.payload,
    });
  });
  controller("init", {});
};

export default initializeVnPlayer;
