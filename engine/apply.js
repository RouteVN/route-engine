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
    const { gameDataPath, onChangeGameStage, onClose, getData } = options;
    this.gameDataPath = gameDataPath;
    this.onChangeGameStage = onChangeGameStage;
    this.onClose = onClose;
    this.getData = getData;
  }

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
    return this.gameData.story.scenes.find(
      (scene) => scene.id === this._stage.currentSceneId
    );
  }

  get _currentSection() {
    return this._currentScene.sections.find(
      (section) => section.id === this._stage.currentSectionId
    );
  }

  get _currentStep() {
    return this._currentSection.steps.find(
      (step) => step.id === this._stage.currentStepId
    );
  }

  get _currentState() {
    const currentSection = this._currentSection;
    const currentStep = this._currentStep;
    const steps = currentSection.steps.slice(
      0,
      currentSection.steps.findIndex((step) => step.id === currentStep.id) + 1
    );
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

      if (step.actions.visuals) {
        accState.visuals = step.actions.visuals;
        for (const item of accState.visuals.items) {
          // if (item.inAnimation) {
          //   item.inAnimation = undefined;
          // }
          // if (item.outAnimation) {
          //   item.outAnimation = undefined;
          // }
        }
      } else {
        if (accState.visuals) {
          accState.visuals.items = accState.visuals.items.filter(
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
            text: step.actions.dialogue.text
          });
        }
      }

      if (step.actions.characters) {
        if (!accState.characters) {
          accState.characters = step.actions.characters;
        } else {
          for (const item of step.actions.characters.items) {
            const accStateItemIndex = accState.characters.items.findIndex(
              (i) => i.id === item.id
            );
            if (accStateItemIndex !== -1) {
              accState.characters.items[accStateItemIndex] = {
                ...accState.characters.items[accStateItemIndex],
                ...item,
              };
              if (!item.inAnimation) {
                delete accState.characters.items[accStateItemIndex].inAnimation;
              }
              if (!item.outAnimation) {
                delete accState.characters.items[accStateItemIndex]
                  .outAnimation;
              }
            } else {
              accState.characters.items.push(item);
            }
          }
          for (const item of accState.characters.items) {
            const foundCharacter = step.actions.characters.items.find(
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

      if (step.actions.cleanAll) {
        accState = {};
      }

      return accState;
    }, {});
    return state;
  }

  init = async () => {
    const gameData = await this.getData(this.gameDataPath);
    this.gameData = gameData;
    const { screen, story } = gameData;
    const { startSceneId, scenes } = story;

    this._stage.currentSceneId = startSceneId;

    const startScene = this._currentScene;
    const startSection = startScene.sections[0];
    const startStep = startSection.steps[0];

    this._stage.currentSceneId = startScene.id;
    this._stage.currentSectionId = startSection.id;
    this._stage.currentStepId = startStep.id;
    this._stage.config.screenWidth = screen.width;
    this._stage.config.screenHeight = screen.height;
  };

  updateStep = () => {
    const { resources } = this.gameData;
    const currentState = this._currentState;

    const elements = [];
    const transitions = [];

    console.log("currentState", currentState);

    if (currentState.background) {
      const background = resources.background.find(
        (bg) => bg.id === currentState.background.backgroundId
      );
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
          const animation = resources.animation.find(
            (ani) => ani.id === currentState.background.inAnimation.animationId
          );
          transitions.push({
            elementId: "bg",
            type: "keyframes",
            event: "add",
            animationProperties: animation.properties,
          });
        }
        if (currentState.background.outAnimation) {
          const animation = resources.animation.find(
            (ani) => ani.id === currentState.background.outAnimation.animationId
          );
          transitions.push({
            elementId: "bg",
            type: "keyframes",
            event: "remove",
            animationProperties: animation.properties,
          });
        }
      }
    }

    if (currentState.characters) {
      for (const item of currentState.characters.items) {
        const character = resources.characters.find(
          (c) => c.id === item.characterId
        );
        if (character) {
          const position = resources.position.find(
            (p) => p.id === item.position.positionId
          );
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
          for (const spriteId of item.spriteIds) {
            const sprite = character.sprites.find(
              (sprite) => sprite.id === spriteId
            );

            if (sprite) {
              container.children.push({
                id: `character-${character.id}-${sprite.id}`,
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
            const inAnimation = resources.animation.find(
              (a) => a.id === item.inAnimation.animationId
            );
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

    if (currentState.visuals) {
      for (const item of currentState.visuals.items) {
        const visual = resources.visuals.find((v) => v.id === item.visualId);
        const id = `visual-${item.id}`;
        const position = {
          ...resources.position.find((p) => p.id === item.position?.positionId),
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
          const inAnimation = resources.animation.find(
            (a) => a.id === item.inAnimation.animationId
          );
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
          const outAnimation = resources.animation.find(
            (a) => a.id === item.outAnimation.animationId
          );
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
      const _dialogueBox = resources.dialogueBoxes.find(
        (db) => db.id === currentState.dialogue.dialogueBoxId
      );
      if (_dialogueBox) {
        const dialogueBox = JSON.parse(JSON.stringify(_dialogueBox));
        const id = `dialogueBox-${dialogueBox.id}-${Math.random()}`;
        const character = resources.characters.find(
          (c) => c.id === currentState.dialogue?.character?.characterId
        );
        const characterName = currentState.dialogue?.character
          ? currentState.dialogue.character.characterName
          : undefined;

        for (const item of dialogueBox.layout) {
          if (item.incremental) {
            for (const { text, childItemId } of currentState.dialogue.texts) {
              const childItem = JSON.parse(JSON.stringify(item.childItems)).find(
                (ci) => ci.id === childItemId
              );

              const child = {
                ...childItem,
                id: `${item.id}-${text}`,
                text,
              }

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
      const bgm = resources.bgm.find((b) => b.id === currentState.bgm.bgmId);
      if (bgm) {
        elements.push({
          id: `bgm-${bgm.id}`,
          type: "sound",
          url: bgm.src,
          loop: currentState.bgm.loop,
        });
      }
    }

    if (currentState.sfx) {
      for (const item of currentState.sfx.items) {
        const sfx = resources.sfx.find((s) => s.id === item.sfxId);
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
      const animation = resources.animation.find(
        (a) => a.id === currentState.animation.animationId
      );
      if (animation) {
        transitions.push({
          elementId: "root",
          type: "keyframes",
          event: "add",
          animationProperties: animation.properties,
        });
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
    if (action === "init") {
      this.updateStep();
    }

    if (action === "click") {
      const currentSection = this._currentSection;
      const currentStepIndex = currentSection.steps.findIndex(
        (step) => step.id === this._stage.currentStepId
      );
      const nextStep = currentSection.steps[currentStepIndex + 1];
      if (nextStep) {
        this._stage.currentStepId = nextStep.id;
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
        } else {
          this.onClose && this.onClose();
        }
      }
    }

    if (action === "event") {
      if (payload.eventAction === "completed") {
        if (this._currentStep.autoNext) {
          setTimeout(() => {
            const currentSection = this._currentSection;
            const currentStepIndex = currentSection.steps.findIndex(
              (step) => step.id === this._stage.currentStepId
            );
            const nextStep = currentSection.steps[currentStepIndex + 1];
            if (nextStep) {
              this._stage.currentStepId = nextStep.id;
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
    gameDataPath: "001",
    getData: (path) =>
      fetch(`/public/vndata/${path}.json`).then((res) => res.json()),
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
