const removeClickSoundUrl = (item) => {
  if (!item || typeof item !== "object") return;

  if (item.clickSoundUrl) {
    delete item.clickSoundUrl;
  }

  // Handle both object properties and arrays
  Object.values(item).forEach((value) => {
    if (value && typeof value === "object") {
      removeClickSoundUrl(value);
    }
  });
};

/**
 *
 *
 */
export const generateRenderTree = ({
  state,
  resources,
  screen,
  mode,
  config = {
    clickSoundVolume: 1,
    soundVolume: 1,
    musicVolume: 1,
    language: "en_default",
  },
  saveData = {},
  gameState,
  customState = {},
  historyDialogue = [],
  skipMode = false,
  autoMode = false,
  data = {
    saveLoadSlots: [],
  },
  canSkip = false,
  modalScreenId = "",
  persistentVariables = {},
  completedStep = false,
  pointerMode,
  i18n = {},
}) => {
  const elements = [];
  const transitions = [];

  console.log({
    config
  })

  elements.push({
    id: "bg-screen",
    type: "graphics",
    x1: 0,
    x2: screen.width,
    y1: 0,
    y2: screen.height,
    fill: screen.fill,
    clickEventName: "LeftClick",
    rightClickEventName: "RightClick",
    wheelEventName: "ScrollUp",
  });

  if (state.background) {
    const background =
      resources.background.items[state.background.backgroundId];
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
      if (state.background.inAnimation) {
        const animation =
          resources.animation.items[state.background.inAnimation.animationId];
        transitions.push({
          elementId: "bg",
          type: "keyframes",
          event: "add",
          animationProperties: animation.properties,
        });
      }
      if (state.background.outAnimation) {
        const animation =
          resources.animation.items[state.background.outAnimation.animationId];
        transitions.push({
          elementId: "bg",
          type: "keyframes",
          event: "remove",
          animationProperties: animation.properties,
        });
      }
    }
  }

  if (state.character) {
    for (const item of state.character.items) {
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
            // @ts-ignore
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

  if (state.visual) {
    for (const item of state.visual.items) {
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

  if (state.dialogue) {
    const _dialogueBox =
      resources.dialogueBox.items[state.dialogue.dialogueBoxId];
    if (_dialogueBox) {
      let stringified = JSON.stringify(_dialogueBox);
      Object.keys(config).forEach((key) => {
        if (typeof config[key] === "string") {
          stringified = stringified.replace(`{{ config.${key} }}`, config[key]);
        } else {
          if ((skipMode || completedStep) && key === "textSpeed") {
            stringified = stringified.replace(`"{{ config.${key} }}"`, "100");
          } else {
            stringified = stringified.replace(
              `"{{ config.${key} }}"`,
              JSON.stringify(config[key])
            );
          }
        }
      });

      Object.keys(customState).forEach((key) => {
        if (typeof customState[key] === "string") {
          stringified = stringified.replaceAll(
            `{{ customState.${key} }}`,
            customState[key]
          );
        } else {
          stringified = stringified.replaceAll(
            `"{{ customState.${key} }}"`,
            customState[key]
          );
        }
      });

      stringified = stringified.replaceAll(
        `"{{ skipMode }}"`,
        skipMode || false
      );

      stringified = stringified.replaceAll(
        `"{{ autoMode }}"`,
        autoMode || false
      );

      stringified = stringified.replaceAll(
        `"{{ cannotSkip }}"`,
        JSON.stringify(!canSkip)
      );

      const dialogueBox = JSON.parse(stringified);

      if (config.muteAll) {
        removeClickSoundUrl(dialogueBox);
      }

      const id = `dialogueBox-${dialogueBox.id}-${Math.random()}`;
      const character =
        resources.character.items[state.dialogue?.character?.characterId];
      const characterName = state.dialogue?.character
        ? state.dialogue.character.characterName
        : undefined;

      for (const item of dialogueBox.layout) {
        if (item.incremental) {
          for (const { text, childItemId } of state.dialogue.texts) {
            const childItem = JSON.parse(JSON.stringify(item.childItems)).find(
              (ci) => ci.id === childItemId
            );

            const child = {
              ...childItem,
              id: `${item.id}-${text}`,
              text,
            };

            if (childItem.contentSource === "dialogueContent") {
              if (text.startsWith("{{ i18n.")) {
                const [__, ___, k] = text.replace('{{ ', '').replace(' }}', '').split(".");
                child.text = i18n[config.language].keys[k];
              } else {
                child.text = text;
              }
            }

            if (child.children) {
              for (const childItem of child.children) {
                if (childItem.contentSource === "dialogueContent") {
                  if (text.startsWith("{{ i18n.")) {
                    const [__, ___, k] = text.replace('{{ ', '').replace(' }}', '').split(".");
                    childItem.text = i18n[config.language].keys[k];
                  } else {
                    childItem.text = text;
                  }
                }
              }
            }

            item.children.push(child);
          }
        } else {
          for (const child of item.children) {
            if (child.contentSource === "dialogueContent") {
              if (state.dialogue.segments) {
                child.segments = state.dialogue.segments.map((segment) => {
                  return {
                    ...segment,
                    style: segment.style || child.style,
                  };
                });
                delete child.text;
              } else {
                if (state.dialogue.text.startsWith("{{ i18n.")) {
                  const [__, ___, k] = state.dialogue.text.replace('{{ ', '').replace(' }}', '').split(".");
                  child.text = i18n[config.language].keys[k];
                } else {
                  child.text = state.dialogue.text;
                }
                delete child.segments;
              }
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

  if (!config.muteAll && customState.bgmId) {
    const bgm = resources.bgm.items[customState.bgmId];
    if (bgm) {
      elements.push({
        id: `bgm-${bgm.src}`,
        type: "sound",
        url: bgm.src,
        loop: true,
        volume: config.musicVolume ?? 50 / 100,
      });
    }
  }

  if (!config.muteAll && state.sfx) {
    for (const item of state.sfx.items) {
      const sfx = resources.sfx.items[item.sfxId];
      if (sfx) {
        elements.push({
          id: item.id,
          type: "sound",
          url: sfx.src,
          delay: item.delay,
          volume: (config.soundVolume ?? 50) / 100,
        });
      }
    }
  }

  if (state.animation) {
    const animation = resources.animation.items[state.animation.animationId];
    if (animation) {
      transitions.push({
        elementId: "root",
        type: "keyframes",
        event: "add",
        animationProperties: animation.properties,
      });
    }
  }

  const stateScreen = state.screen
    ? JSON.parse(JSON.stringify(state.screen))
    : { items: [] };

  if (modalScreenId) {
    stateScreen.items.push({
      id: "modal-screen",
      screenId: modalScreenId,
    });
  }

  if (stateScreen) {
    for (const {
      id,
      screenId,
      condition,
      inAnimation,
      outAnimation,
    } of stateScreen.items) {
      let stringified = JSON.stringify(resources.screen.items[screenId]);

      Object.keys(data).forEach((key) => {
        stringified = stringified.replaceAll(
          `"{{ data.${key} }}"`,
          JSON.stringify(data[key])
        );
      });

      stringified = stringified.replaceAll(
        "{{ data.saveLoadSlots[customState.currentSavePageNumber].title }}",
        data.saveLoadSlots.find(
          (x) => x.value === customState.currentSavePageNumber
        )?.title
      );

      Object.keys(config).forEach((key) => {
        if (typeof config[key] === "string") {
          stringified = stringified.replaceAll(
            `{{ config.${key} }}`,
            config[key]
          );
        } else {
          if ((skipMode || completedStep) && key === "textSpeed") {
            stringified = stringified.replaceAll(
              `"{{ config.${key} }}"`,
              "100"
            );
          } else {
            stringified = stringified.replaceAll(
              `"{{ config.${key} }}"`,
              JSON.stringify(config[key])
            );
          }
        }
      });

      Object.keys(customState).forEach((key) => {
        if (
          typeof customState[key] === "number" ||
          typeof customState[key] === "boolean"
        ) {
          stringified = stringified.replaceAll(
            `"{{ customState.${key} }}"`,
            customState[key]
          );
        } else {
          stringified = stringified.replaceAll(
            `{{ customState.${key} }}`,
            customState[key]
          );
        }
      });

      Object.keys(persistentVariables).forEach((key) => {
        if (typeof persistentVariables[key] === "string") {
          stringified = stringified.replaceAll(
            `{{ persistentVariables.${key} }}`,
            persistentVariables[key]
          );
        } else {
          stringified = stringified.replaceAll(
            `"{{ persistentVariables.${key} }}"`,
            persistentVariables[key]
          );
        }
      });

      stringified = stringified.replaceAll(
        '"{{ historyDialogue }}"',
        JSON.stringify(historyDialogue || [])
      );

      const screen = JSON.parse(stringified);

      console.log("screen", screen);

      // Recursively replace data = $saveData with saveData
      const rawSaveData = saveData || {};

      if (condition) {
        let stringifiedCondition = JSON.stringify(condition);
        Object.keys(persistentVariables).forEach((key) => {
          if (typeof persistentVariables[key] === "string") {
            stringifiedCondition = stringifiedCondition.replaceAll(
              `{{ persistentVariables.${key} }}`,
              persistentVariables[key]
            );
          } else {
            stringifiedCondition = stringifiedCondition.replaceAll(
              `"{{ persistentVariables.${key} }}"`,
              persistentVariables[key]
            );
          }
        });
        const parsedCondition = JSON.parse(stringifiedCondition);

        const { op, value1, value2 } = parsedCondition;
        if (op === "eq" && value1 !== value2) {
          continue;
        }
      }

      const newSaveData = [0, 1, 2]
        .map((x) => 3 * (Number(customState.currentSavePageNumber) || 0) + x)
        .map((slot) => {
          const res = rawSaveData[slot];
          if (res) {
            res.id = `saveSlot-${slot}`;
            return {
              index: slot,
              ...res,
            };
          }
          return {
            index: slot,
          };
        });

      const replaceSaveData = (obj) => {
        if (obj.data === "$saveData") {
          obj.data = newSaveData;
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

      if (config.muteAll) {
        removeClickSoundUrl(screen);
      }

      if (screen) {
        const screenId = `screen-${id}-${Math.random()}`;
        elements.push({
          id: screenId,
          type: "container",
          children: screen.layout,
        });

        if (inAnimation) {
          const animation = resources.animation.items[inAnimation.animationId];
          if (animation) {
            transitions.push({
              elementId: screenId,
              type: "keyframes",
              event: "add",
              animationProperties: animation.properties,
            });
          }
        }
        if (outAnimation) {
          const animation = resources.animation.items[outAnimation.animationId];
          if (animation) {
            transitions.push({
              elementId: screenId,
              type: "keyframes",
              event: "remove",
              animationProperties: animation.properties,
            });
          }
        }
        if (screen.transitions) {
          for (const transition of screen.transitions) {
            transitions.push(transition);
          }
        }
      }
    }
  }

  // TODO don't make it hardcoded
  if (skipMode) {
    const skipGui = resources.screen.items["skipMenu"];
    if (skipGui) {
      skipGui.layout.forEach((item) => {
        elements.push(item);
      });
    }
  }

  const menuTransitions = [
    {
      elementId: `root-menu`,
      type: "keyframes",
      event: "add",
      animationProperties: [
        {
          property: "alpha",
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 1,
              easing: "linear",
            },
          ],
        },
      ],
    },
    {
      elementId: `root-read`,
      type: "keyframes",
      event: "add",
      animationProperties: [
        {
          property: "alpha",
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 1,
              easing: "linear",
            },
          ],
        },
      ],
    },
    {
      elementId: `root-read`,
      type: "keyframes",
      event: "remove",
      animationProperties: [
        {
          property: "alpha",
          initialValue: 1,
          keyframes: [{ duration: 500, value: 0, easing: "linear" }],
        },
      ],
    },
    {
      elementId: `root-menu`,
      type: "keyframes",
      event: "remove",
      animationProperties: [
        {
          property: "alpha",
          initialValue: 1,
          keyframes: [{ duration: 500, value: 0, easing: "linear" }],
        },
      ],
    },
  ];

  if (pointerMode === "menu") {
    // menuTransitions.forEach((transition) => {
    //   transitions.push(transition)
    // })
  }

  return {
    elements: [
      {
        id: `root`,
        type: "container",
        children: elements,
      },
    ],
    transitions:
      (skipMode && config.skipTransitions) || completedStep
        ? menuTransitions
        : transitions,
  };
};
