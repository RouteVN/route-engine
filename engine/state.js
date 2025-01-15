

/**
 * Takes an array of Steps and outputs a state object
 * @param {*} state 
 * @param {*} step 
 * @returns 
 */
export const applyState = (state, step) => {
  if (!step.actions) {
    return {}
  }
  if (step.actions.background) {
    if (step.actions.background.backgroundId) {
      state.background = step.actions.background;
    } else {
      delete state.background;
    }
  } else {
    if (state.background) {
      if (state.background.inAnimation) {
        state.background.inAnimation = undefined;
      }
    }
  }
  if (step.actions.sfx) {
    state.sfx = step.actions.sfx;
  } else {
    if (state.sfx) {
      delete state.sfx;
    }
  }

  if (step.actions.bgm) {
    state.bgm = step.actions.bgm;
    if (step.actions.bgm.loop || step.actions.bgm.loop === undefined) {
      state.bgm.loop = true;
    } else {
      state.bgm.loop = false;
    }
  } else {
  }

  if (step.actions.visual) {
    state.visual = step.actions.visual;
    for (const item of state.visual.items) {
      // if (item.inAnimation) {
      //   item.inAnimation = undefined;
      // }
      // if (item.outAnimation) {
      //   item.outAnimation = undefined;
      // }
    }
  } else {
    if (state.visual) {
      state.visual.items = state.visual.items.filter(
        (visual) => !!visual.visualId
      );
    }
  }
  if (step.actions.dialogue) {
    state.dialogue = {
      ...state.dialogue,
      ...step.actions.dialogue,
    };
    if (step.actions.dialogue.segments) {
      delete state.dialogue.text;
    }
    if (step.actions.dialogue.text) {
      delete state.dialogue.segments;
    }
    if (step.actions.dialogue.character) {
      if (!step.actions.dialogue.character.characterName) {
        delete state.dialogue.character.characterName;
      }
    }
    if (step.actions.dialogue.incremental) {
      if (!state.dialogue.texts) {
        state.dialogue.texts = [];
      }
      state.dialogue.texts.push({
        template: step.actions.dialogue.template,
        text: step.actions.dialogue.text,
      });
    }
  }

  if (step.actions.character) {
    if (!state.character) {
      state.character = JSON.parse(JSON.stringify(step.actions.character));
    } else {
      for (const item of step.actions.character.items) {
        const accStateItemIndex = state.character.items.findIndex(
          (i) => i.id === item.id
        );
        if (accStateItemIndex !== -1) {
          state.character.items[accStateItemIndex] = {
            ...state.character.items[accStateItemIndex],
            ...item,
          };
          if (!item.inAnimation) {
            delete state.character.items[accStateItemIndex].inAnimation;
          }
          if (!item.outAnimation) {
            delete state.character.items[accStateItemIndex].outAnimation;
          }
        } else {
          state.character.items.push(item);
        }
      }
      for (const item of state.character.items) {
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
    state.animation = step.actions.animation;
  } else {
    if (state.animation) {
      delete state.animation;
    }
  }

  if (step.actions.screen) {
    state.screen = step.actions.screen;
  } else {
    if (state.screen) {
      delete state.screen;
    }
  }

  if (step.actions.choices) {
    state.choices = step.actions.choices;
  } else {
    if (state.choices) {
      delete state.choices;
    }
  }

  if (step.actions.cleanAll) {
    state = {};
  }

  return state;
}