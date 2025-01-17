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
  historyDialogue = [],
  skipMode = false,
  autoMode = false,
  canSkip = false,
  completedStep = false,
  pointerMode,
  rootElement,
  i18n = {},
  runtimeState,
  readthroughState,
  deviceState,
  persistentState,
}) => {
  const transitions = [];

  const applyTemplate = templatingEngine(
    {
      saveDataFilter,
      hashFilter,
    },
    {
      runtimeState,
      deviceState,
      persistentState,
    },
    {
      completedStep
    }
  );

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
          `"{{ state.dialogue.texts }}"`,
          JSON.stringify(state.dialogue.texts)
        );

        stringified = stringified.replaceAll(
          `"{{ skipMode }}"`,
          skipMode || false
        );

        stringified = stringified.replaceAll(
          `{{ stepId }}`,
          Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
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

        if (deviceState.muteAll) {
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
              character?.variables?.mainColor || "#000000"
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

              if (childItem.text === "{{ dialogue.text }}") {
                if (text.startsWith("{{ i18n.")) {
                  const [__, group, k] = text
                    .replace("{{ ", "")
                    .replace(" }}", "")
                    .split(".");

                  child.text = i18n[deviceState.language].keys[group][k];
                } else {
                  child.text = text;
                }
              }

              if (child.children) {
                for (const childItem of child.children) {
                  if (childItem.text === "{{ dialogue.text }}") {
                    if (text.startsWith("{{ i18n.")) {
                      const [__, group, k] = text
                        .replace("{{ ", "")
                        .replace(" }}", "")
                        .split(".");
                      childItem.text =
                        i18n[deviceState.language].keys[group][k];
                    } else {
                      childItem.text = text;
                    }
                  }
                }
              }

              item.children.push(child);
            }
          } else if (item.children) {
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
                    const [__, group, k] = state.dialogue.text
                      .replace("{{ ", "")
                      .replace(" }}", "")
                      .split(".");
                    child.text = child.text.replaceAll(
                      "{{ dialogue.text }}",
                      i18n[deviceState.language].keys[group][k]
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

    if (!deviceState.muteAll && state.sfx) {
      for (const item of state.sfx.items) {
        const sfx = resources.sfx.items[item.sfxId];
        if (sfx) {
          elements.push({
            id: item.id,
            type: "sound",
            url: sfx.src,
            delay: item.delay,
            volume: (deviceState.soundVolume ?? 50) / 100,
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

        if (deviceState.muteAll) {
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

    if (state.choices) {
      let choicesUi = resources.choices.items[state.choices.choicesId];
      if (choicesUi) {
        choicesUi = JSON.stringify(choicesUi).replaceAll(
          '"{{ dialogue.choices }}"',
          JSON.stringify(state.choices.items)
        );
        choicesUi = JSON.parse(choicesUi);

        elements.push({
          id: "choices-feaf4ec3",
          type: "container",
          children: choicesUi.layout,
        });
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
    ...rootElement,
    selectedTabId: pointerMode === "menu" ? "menu" : "read",
    animation: {
      ...rootElement.animation,
      key: pointerMode === "menu" ? "menu" : "read",
    },
    children: [
      {
        id: "root-tab-read",
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

  return {
    elements: finalElements,
    transitions:
      (skipMode && deviceState.skipTransitions)
        ? []
        : transitions,
  };
};

function hashFilter(target) {
  // Helper function to serialize the object into a JSON string
  const serialize = (obj) => {
    return JSON.stringify(obj, Object.keys(obj).sort());
  };

  // Simple hash function (e.g., DJB2 hash algorithm)
  const hashString = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Convert to unsigned 32-bit integer
  };

  const serializedObject = serialize(target);
  return hashString(serializedObject).toString(16); // Return as hexadecimal string
}

const saveDataFilter = (target, variables) => {
  const numOfSaveSlots = 6;
  const saveSlotRange = Array.from({ length: numOfSaveSlots }, (_, i) => i);
  const newSaveData = saveSlotRange
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

const templatingEngine = (filters = {}, variables = {}, options = {}) => {
  const { completedStep } = options;
  const applyTemplate = (string) => {
    // TODO remove hardcoded
    Object.keys(filters).forEach((filterKey) => {
      const filter = filters[filterKey];
      if (filterKey === "saveDataFilter") {
        if (
          string.indexOf(`{{ persistentState.saveData | ${filterKey} }}`) !== -1
        ) {
          string = string.replaceAll(
            `"{{ persistentState.saveData | ${filterKey} }}"`,
            JSON.stringify(
              filter(variables.persistentState.saveData, variables)
            )
          );
        }
      } else if (filterKey === "hashFilter") {
        if (
          string.indexOf(`{{ persistentState.saveData | ${filterKey} }}`) !== -1
        ) {
          string = string.replaceAll(
            `{{ persistentState.saveData | ${filterKey} }}`,
            hashFilter(variables.persistentState.saveData)
          );
        }
      }
    });

    Object.keys(variables).forEach((rootname) => {
      Object.keys(variables[rootname]).forEach((key) => {
        const value = variables[rootname][key];
        // TODO think of better solution other than hardcoding
        // if (rootname === 'deviceState' && key === 'textSpeed') {
        //   string = string.replaceAll(`"{{ ${rootname}.${key} }}"`, completedStep ? 100 : value);
        //   string = string.replaceAll(`{{ ${rootname}.${key} }}`, completedStep ? 100 : value);
        // } else
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

    string = string.replaceAll('"{{ completedStep }}"', completedStep);
    return string;
  };
  return applyTemplate;
};
