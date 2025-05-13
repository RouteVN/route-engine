
const generateScreenBackgroundElement = ({elements, transitions, state, resources, screen}) => {
  const newElements = elements.concat([{
    id: "bg-screen",
    type: "graphics",
    x1: 0,
    x2: screen.width,
    y1: 0,
    y2: screen.height,
    fill: screen.backgroundColor,
    clickEventName: "LeftClick",
    rightClickEventName: "RightClick",
    wheelEventName: "ScrollUp",
  }]);
  return [newElements, transitions];
}

const addBackgrundOrCg = ({elements, transitions, state, resources, resolveFile}) => {
  let newElements = elements.concat([]);
  if (state.background) {
    const background = resources.backgrounds[state.background.backgroundId];
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
      url: resolveFile(background.fileId),
    }])
  }
  return [newElements, transitions];
}

const addCharacters = ({elements, transitions, state, resources, resolveFile}) => {
  let newElements = elements.concat([]);
  if (state.character) {
    const items = state.character.items;

    for (const item of items) {
      const { positionId, spriteParts } = item;
      const spritePartIds = spriteParts.map(({ spritePartId }) => spritePartId);
      const position = resources.positions[positionId];
      const characterContainer = {
        type: 'container',
        id: `character-container-${item.id}`,
        x: position.x,
        y: position.y,
        xa: position.xa,
        ya: position.ya,
        anchor: position.anchor,
        children: [],
      }

      const matchedSpriteParts = []
      Object.entries(resources.characters).flatMap(([key, character]) => {
        const { spriteParts } = character;
        Object.entries(spriteParts).map(([partId, part]) => {
          if (spritePartIds.includes(partId)) {
            matchedSpriteParts.push({
              partId,
              fileId: part.fileId,
            });
          }
        });
      });

      for (const spritePart of matchedSpriteParts) {
        // @ts-ignore
        characterContainer.children.push({
          type: 'sprite',
          id: `${item.id}-${spritePart.partId}`,
          url: resolveFile(spritePart.fileId),
        })
      }

      newElements.push(characterContainer);
    }
  }
  return [newElements, transitions];
}

const addVisuals = ({elements, transitions, state, resources, resolveFile }) => {
  let newElements = elements.concat([]);
  if (state.visual) {
    const items = state.visual.items;
    for (const item of items) {
      const visual = resources.visuals[item.visualId];
      const position = resources.positions[item.positionId];
      newElements = newElements.concat([{
        id: `${item.visualId}-${item.positionId}-fjk34l3`,
        type: 'sprite',
        url: resolveFile(visual.fileId),
        x: position.x,
        y: position.y,
        xa: position.xa,
        ya: position.ya,
      }])
    }
  }
  return [newElements, transitions];
}

const addDialogue = ({elements, transitions, state }) => {
  let newElements = elements.concat([]);
  if (state.dialogue) {
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
    }])
  }
  return [newElements, transitions];
}

const addScreens = ({elements, transitions, state }) => {
  let newElements = elements.concat([]);
  if (state.screens) {
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
    }])
  }
  return [newElements, transitions];
}

const addChoices = ({elements, transitions, state }) => {
  let newElements = elements.concat([]);
  if (state.choices) {
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
    }])
  }
  return [newElements, transitions];
}

const generateRenderElements = ({state, resources, resolveFile, screen}) => {
  let elements = [];
  let transitions = [];

  [elements, transitions] = generateScreenBackgroundElement({elements, transitions, state, resources, screen});
  [elements, transitions] = addBackgrundOrCg({elements, resolveFile, transitions, state, resources});
  [elements, transitions] = addCharacters({elements, transitions, state, resources, resolveFile});
  [elements, transitions] = addVisuals({elements, transitions, state, resources, resolveFile});
  [elements, transitions] = addDialogue({elements, transitions, state});
  [elements, transitions] = addScreens({elements, transitions, state});
  [elements, transitions] = addChoices({elements, transitions, state});

  return {
    elements,
    transitions,
  }
}

export default generateRenderElements;
