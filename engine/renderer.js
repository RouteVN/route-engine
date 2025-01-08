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
  readState,
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
  historyDialogue = [],
  skipMode = false,
  autoMode = false,
  canSkip = false,
  completedStep = false,
  pointerMode,
  rootElement,
  i18n = {},
  runtimeState,
  deviceState,
  persistentState,
}) => {
  const transitions = [];

  const applyTemplate = templatingEngine({
    saveDataFilter
  }, {
    runtimeState,
    deviceState,
    persistentState,
  });

  console.log("render", {
    runtimeState,
  });

  const generateElements = (state) => {
    const elements = [];

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
            resources.animation.items[
              state.background.outAnimation.animationId
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

        stringified = applyTemplate(stringified);

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

        const character =
          resources.character.items[state.dialogue?.character?.characterId] ||
          state.dialogue?.character;

        const layout = JSON.parse(
          JSON.stringify(dialogueBox.layout)
            .replaceAll("{{ character.name }}", character?.name || "")
            .replaceAll(
              "{{ character.variables.mainColor }}",
              character?.variables?.mainColor
            )
        );

        for (const item of layout) {
          if (item.incremental) {
            for (const { text, childItemId } of state.dialogue.texts) {
              const childItem = JSON.parse(
                JSON.stringify(item.childItems)
              ).find((ci) => ci.id === childItemId);

              const child = {
                ...childItem,
                id: `${item.id}-${text}`,
                text,
              };

              if (childItem.contentSource === "dialogueContent") {
                if (text.startsWith("{{ i18n.")) {
                  const [__, ___, k] = text
                    .replace("{{ ", "")
                    .replace(" }}", "")
                    .split(".");
                  child.text = i18n[config.language].keys[k];
                } else {
                  child.text = text;
                }
              }

              if (child.children) {
                for (const childItem of child.children) {
                  if (childItem.contentSource === "dialogueContent") {
                    if (text.startsWith("{{ i18n.")) {
                      const [__, ___, k] = text
                        .replace("{{ ", "")
                        .replace(" }}", "")
                        .split(".");
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
              if (child.text) {
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
                    const [__, ___, k] = state.dialogue.text
                      .replace("{{ ", "")
                      .replace(" }}", "")
                      .split(".");
                    child.text = child.text.replaceAll(
                      "{{ dialogue.text }}",
                      i18n[config.language].keys[k]
                    );
                  } else {
                    child.text = child.text.replaceAll(
                      "{{ dialogue.text }}",
                      state.dialogue.text
                    );
                  }
                  delete child.segments;
                }
              }
            }
          }
          elements.push(item);
        }
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

    if (stateScreen) {
      for (const {
        id,
        screenId,
        condition,
        inAnimation,
        outAnimation,
      } of stateScreen.items) {
        let stringified = JSON.stringify(resources.screen.items[screenId]);

        stringified = stringified.replaceAll(
          "{{ runtimeState.saveLoadSlots[runtimeState.currentSavePageNumber].title }}",
          runtimeState.saveLoadSlots?.find(
            (x) => x.value === runtimeState.currentSavePageNumber
          )?.title
        );

        stringified = applyTemplate(stringified);

        stringified = stringified.replaceAll(
          '"{{ historyDialogue }}"',
          JSON.stringify(historyDialogue || [])
        );

        const screen = JSON.parse(stringified);

        if (condition) {
          let stringifiedCondition = JSON.stringify(condition);
          stringifiedCondition = applyTemplate(stringifiedCondition);
          const parsedCondition = JSON.parse(stringifiedCondition);

          const { op, value1, value2 } = parsedCondition;
          if (op === "eq" && value1 !== value2) {
            continue;
          }
        }

        if (config.muteAll) {
          removeClickSoundUrl(screen);
        }

        if (screen) {
          const screenId = `screen-${id}`;
          elements.push({
            id: screenId,
            type: "container",
            children: screen.layout,
          });

          if (inAnimation) {
            const animation =
              resources.animation.items[inAnimation.animationId];
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
            const animation =
              resources.animation.items[outAnimation.animationId];
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

    return elements;
  };

  const finalElements = [];

  finalElements.push({
    id: "root",
    type: "container",
    selectedTabId: pointerMode === "menu" ? "menu" : "read",
    animationKey: pointerMode === "menu" ? "menu" : "read",
    animated: true,
    animation: {
      out: {
        type: "keyframes",
        event: "remove",
        animationProperties: [
          {
            property: "alpha",
            initialValue: 0.8,
            keyframes: [
              {
                duration: 600,
                value: 0,
                easing: "linear",
              },
            ],
          },
        ],
      },
      in: {
        type: "keyframes",
        event: "add",
        animationProperties: [
          {
            property: "alpha",
            initialValue: 0.2,
            keyframes: [
              {
                duration: 600,
                value: 1,
                easing: "linear",
              },
            ],
          },
        ],
      },
    },
    children: [
      {
        id: "asdeadk3f",
        type: "container",
        tabId: "read",
        children: generateElements(readState),
      },
      {
        id: "asfeawkjdf",
        type: "container",
        tabId: "menu",
        children: generateElements(state),
      },
    ],
  });

  console.log({
    finalElements,
  });

  return {
    elements: finalElements,
    transitions:
      (skipMode && config.skipTransitions) || completedStep ? [] : transitions,
  };
};

const saveDataFilter = (target, variables) => {
  const numOfSaveSlots = 3;
  const newSaveData = [0, 1, 2]
    .map(
      (x) =>
        numOfSaveSlots *
          (Number(variables.runtimeState.currentSavePageNumber) || 0) +
        x
    )
    .map((slot) => {
      const res = target[slot];
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

  return newSaveData;
};

const templatingEngine = (filters = {}, variables = {}) => {
  const applyTemplate = (string) => {

    // TODO remove hardcoded
    Object.keys(filters).forEach((filterKey) => {
      const filter = filters[filterKey];
      if (string.indexOf(`{{ persistentState.saveData | ${filterKey} }}`) !== -1) {
        string = string.replaceAll(
          `"{{ persistentState.saveData | ${filterKey} }}"`,
          JSON.stringify(filter(variables.persistentState.saveData, variables))
        );
      }
    });

    Object.keys(variables).forEach((rootname) => {
      Object.keys(variables[rootname]).forEach((key) => {
        const value = variables[rootname][key];
        if (typeof value === "number" || typeof value === "boolean") {
          string = string.replaceAll(`"{{ ${rootname}.${key} }}"`, value);
          string = string.replaceAll(`{{ ${rootname}.${key} }}`, value);
        } else if (typeof value === "object") {
          string = string.replaceAll(
            `"{{ ${rootname}.${key} }}"`,
            JSON.stringify(value)
          );
          string = string.replaceAll(
            `{{ ${rootname}.${key} }}`,
            JSON.stringify(value)
          );
        } else {
          string = string.replaceAll(`{{ ${rootname}.${key} }}`, value);
        }
      });
    });
    return string;
  };
  return applyTemplate;
};
