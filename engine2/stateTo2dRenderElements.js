
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
      src: resolveFile(background.fileId),
    }])
  }
  return [newElements, transitions];
}

const addCharacters = ({elements, transitions, state}) => {
  let newElements = elements.concat([]);
  if (state.characters) {
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
    }])
  }
  return [newElements, transitions];
}

const addVisuals = ({elements, transitions, state }) => {
  let newElements = elements.concat([]);
  if (state.visuals) {
    newElements = newElements.concat([{
      id: "bg-cg",
      type: "sprite",
      x: 0,
      y: 0,
    }])
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
  [elements, transitions] = addCharacters({elements, transitions, state});
  [elements, transitions] = addVisuals({elements, transitions, state});
  [elements, transitions] = addDialogue({elements, transitions, state});
  [elements, transitions] = addScreens({elements, transitions, state});
  [elements, transitions] = addChoices({elements, transitions, state});

  return {
    elements,
    transitions,
  }
}

export default generateRenderElements;
