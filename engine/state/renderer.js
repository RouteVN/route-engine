/**
 *
 *
 */
export const generateRenderTree = ({
  state,
  resources,
  screen,
  mode,
  config,
  saveData,
  gameState,
  customState,
}) => {
  const elements = [];
  const transitions = [];

  elements.push({
    id: "bg-screen",
    type: "graphics",
    x1: 0,
    x2: screen.width,
    y1: 0,
    y2: screen.height,
    fill: screen.fill,
    clickEventName: mode === "menu" ? undefined : "NextStep",
    rightClickEventName: mode === "menu" ? undefined : "OpenMenu",
    wheelEventName: "Wheel",
  });

  // console.log("state", state);

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
        stringified = stringified.replace(`{{ config.${key} }}`, config[key]);
      });

      const dialogueBox = JSON.parse(stringified);

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
              child.text = state.dialogue.text;
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

  if (state.bgm) {
    const bgm = resources.bgm.items[state.bgm.bgmId];
    if (bgm) {
      elements.push({
        id: `bgm`,
        type: "sound",
        url: bgm.src,
        loop: state.bgm.loop,
      });
    }
  }

  if (state.sfx) {
    for (const item of state.sfx.items) {
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

  if (state.screen) {
    for (const { id, screenId, inAnimation } of state.screen.items) {
      let stringified = JSON.stringify(resources.screen.items[screenId]);

      Object.keys(config).forEach((key) => {
        stringified = stringified.replaceAll(`{{ config.${key} }}`, config[key]);
      });
      
      Object.keys(customState).forEach((key) => {
        if (typeof customState[key] === 'number') {
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

      const screen = JSON.parse(stringified);
      // console.log('screen', screen)

      // Recursively replace data = $saveData with saveData
      const rawSaveData = saveData || {};
      console.log('customState', customState)

      const newSaveData = [0, 1, 2].map(x => 3 * (Number(customState.currentSavePageNumber) || 0) + x).map((slot) => {
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
        if (screen.transitions) {
          for (const transition of screen.transitions) {
            transitions.push(transition);
          }
        }
      }
    }
  }

  console.log("transitions", transitions);
  console.log("elements", elements);

  return {
    elements: [
      {
        id: "root",
        type: "container",
        children: elements,
      },
    ],
    transitions,
  };
};
