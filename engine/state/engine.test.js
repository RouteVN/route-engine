import { expect, test } from "vitest";
import { RvnEngine, HandlerActions } from "./engine.js";

const gameData = {
  screen: {
    width: 100,
    height: 100,
  },
  
  story: {
    optionsConfig: {
      rightClick: {
        sceneId: "sceneGameMenu",
        sectionId: "sectionOptions",
      },
    },
    startSceneId: "scene1",
    scenes: {
      itemsOrder: ["scene1", "scene2", "sceneGameMenu"],
      items: {
        scene1: {
          id: "scene1",
          sections: {
            itemsOrder: ["section1", "section2"],
            items: {
              section1: {
                id: "section1",
                steps: {
                  itemsOrder: ["step1", "step2", "step23"],
                  items: {
                    step1: {
                      id: "step1",
                      actions: {}
                    },
                    step2: {
                      id: "step2",
                      actions: {}
                    },
                    step23: {
                      id: "step23",
                      actions: {
                        moveToSection: {
                          sectionId: 'section2',
                        }
                      }
                    },
                  },
                },
              },
              section2: {
                id: "section2",
                steps: {
                  itemsOrder: ["step3", "step4"],
                  items: {
                    step3: {
                      id: "step3",
                      actions: {}
                    },
                    step4: {
                      id: "step4",
                      actions: {}
                    },
                  },
                },
              },
            },
          },
        },
        scene2: {
          id: "scene2",
          sections: {
            itemsOrder: ["section3"],
            items: {
              section3: {
                id: "section3",
                steps: {
                  itemsOrder: ["step5", "step6", "step7"],
                  items: {
                    step5: {
                      id: "step5",
                      actions: {}
                    },
                    step6: {
                      id: "step6",
                      actions: {}
                    },
                    step7: {
                      id: "step7",
                      actions: {}
                    },
                  },
                },
              },
            },
          },
        },
        sceneGameMenu: {
          id: "sceneGameMenu",
          sections: {
            itemsOrder: ["sectionOptions"],
            items: {
              sectionOptions: {
                id: "sectionOptions",
                steps: {
                  itemsOrder: ["stepMenu1"],
                  items: {
                    stepMenu1: {
                      id: "stepMenu1",
                      actions: {},
                    },  
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

test("history pointer", () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => {},
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  engine._historyPointer = undefined;
  engine._setHistoryPointer({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: "a",
  });

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: "a",
  });

  engine._clearHistoryPointer();

  expect(engine._historyPointer).toBeUndefined();
});

test("menu pointer", () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => {},
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  engine._menuPointer = undefined;
  engine._setMenuPointer({
    sceneId: "a",
    sectionId: "b",
    stepId: "c",
  });

  expect(engine._menuPointer).toEqual({
    sceneId: "a",
    sectionId: "b",
    stepId: "c",
  });

  engine._clearMenuPointer();

  expect(engine._menuPointer).toBeUndefined();
});

test("mode", () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => {},
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  expect(engine._mode).toBe("read");

  engine._historyPointer = {
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: "a",
  };

  expect(engine._mode).toBe("history");

  engine._menuPointer = {
    sceneId: "a",
    sectionId: "b",
    stepId: "c",
  };

  expect(engine._mode).toBe("menu");

  engine._clearMenuPointer();

  expect(engine._mode).toBe("history");

  engine._clearHistoryPointer();

  expect(engine._mode).toBe("read");
});

test("current scene id", async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();

  engine._clearMenuPointer();

  expect(engine._latestSceneId).toBe("scene1");
  engine._latestSceneId = "scene2";
  expect(engine._currentSceneId).toBe("scene2");

  engine._history = [
    {
      sceneId: "scene1",
    },
  ];
  engine._setHistoryPointer({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: "a",
  });

  expect(engine._currentSceneId).toBe("scene1");

  engine._setMenuPointer({
    sceneId: "scene3",
  });

  expect(engine._currentSceneId).toBe("scene3");
});

test("current section id", async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();


  expect(engine._latestSectionId).toBe("section1");
  expect(engine._currentSectionId).toBe("section1");
  expect(engine._currentSection.id).toBe("section1");

  engine._history = [
    {
      sceneId: "scene1",
      sections: [
        {
          sectionId: "section1",
        },
        {
          sectionId: "section2",
        },
      ],
    },
  ];

  engine._setHistoryPointer({
    sceneIndex: 0,
    sectionIndex: 1,
    stepId: "a",
  });

  expect(engine._currentSectionId).toBe("section2");
  expect(engine._currentSection.id).toBe("section2");

  engine._setMenuPointer({
    sceneId: "scene1",
    sectionId: "section1",
  });

  expect(engine._currentSectionId).toBe("section1");
  expect(engine._currentSection.id).toBe("section1");
});

test("current step id", async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();

  expect(engine._latestStepId).toBe("step1");
  expect(engine._currentStepId).toBe("step1");
  expect(engine._currentStep.id).toBe("step1");

  engine._history = [
    {
      sceneId: "scene1",
      sections: [
        {
          sectionId: "section1",
        },
      ],
    },
  ];
  engine._setHistoryPointer({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: "step2",
  });

  expect(engine._currentStepId).toBe("step2");
  expect(engine._currentStep.id).toBe("step2");

  engine._setMenuPointer({
    sceneId: "scene2",
    sectionId: "section3",
    stepId: "step5",
  });

  expect(engine._currentStepId).toBe("step5");
  expect(engine._currentStep.id).toBe("step5");

});

test('init', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
})

test('_currentState', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();

  expect(engine._currentState).toEqual({});
})

test('_updateStep', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();

  engine._updateStep();

  // todo assert called with right params
})

test('_goToNextStepInHistory', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();

  engine._latestStepId = 'step6';

  engine._history = [{
    sceneId: 'scene1',
    sections: [{
      sectionId: 'section1',
    }, {
      sectionId: 'section2',
    }]
  }, {
    sceneId: 'scene2',
    sections: [{
      sectionId: 'section3',
    }]
  }]

  engine._setHistoryPointer({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step1',
  });

  engine._goToNextStepInHistory();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step2',
  });

  engine._goToNextStepInHistory();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step23',
  });


  engine._goToNextStepInHistory();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 1,
    stepId: 'step3',
  });


  engine._goToNextStepInHistory();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 1,
    stepId: 'step4',
  });

  engine._goToNextStepInHistory();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 1,
    sectionIndex: 0,
    stepId: 'step5',
  });

  engine._goToNextStepInHistory();
  expect(engine._historyPointer).toBeUndefined();

  engine._latestStepId = 'stepe125';

  engine._history = [{
    sceneId: 'scene1',
    sections: [{
      sectionId: 'section1',
    }, {
      sectionId: 'section2',
    }]
  }, {
    sceneId: 'scene2',
    sections: [{
      sectionId: 'section3',
    }]
  }]

  engine._setHistoryPointer({
    sceneIndex: 1,
    sectionIndex: 0,
    stepId: 'step7',
  });

  engine._goToNextStepInHistory();
  expect(engine._historyPointer).toBeUndefined();

})

test('_goToPreviousStep', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();

  engine._history = [{
    sceneId: 'scene1',
    sections: [{
      sectionId: 'section1',
    }, {
      sectionId: 'section2',
    }]
  }, {
    sceneId: 'scene2',  
    sections: [{
      sectionId: 'section3',
    }]
  }]

  engine._latestSceneId = 'scene2';
  engine._latestSectionId = 'section3';
  engine._latestStepId = 'step7';

  expect(engine._historyPointer).toBeUndefined();
  expect(engine._mode).toBe('read');

  engine._goToPreviousStep();

  expect(engine._mode).toBe('history');
  expect(engine._historyPointer).toEqual({
    sceneIndex: 1,
    sectionIndex: 0,
    stepId: 'step6',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 1,
    sectionIndex: 0,
    stepId: 'step5',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 1,
    stepId: 'step4',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 1,
    stepId: 'step3',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step23',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step2',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step1',
  });

  engine._goToPreviousStep();

  expect(engine._historyPointer).toEqual({
    sceneIndex: 0,
    sectionIndex: 0,
    stepId: 'step1',
  });
})

test('_goToNextStepInReadMode', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();

  expect(engine._latestSceneId).toBe('scene1');
  expect(engine._latestSectionId).toBe('section1');
  expect(engine._latestStepId).toBe('step1');

  engine._goToNextStepInReadMode();

  expect(engine._latestSceneId).toBe('scene1');
  expect(engine._latestSectionId).toBe('section1');
  expect(engine._latestStepId).toBe('step2');

  engine._goToNextStepInReadMode();

  expect(engine._latestSceneId).toBe('scene1');
  expect(engine._latestSectionId).toBe('section2');
  expect(engine._latestStepId).toBe('step3');

  engine._goToNextStepInReadMode();

  expect(engine._latestSceneId).toBe('scene1');
  expect(engine._latestSectionId).toBe('section2');
  expect(engine._latestStepId).toBe('step4');
})

test('_openMenu', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: async () => {},
  }); 

  await engine.init();

  engine._openMenu();

  expect(engine._menuPointer).toEqual({
    sceneId: "sceneGameMenu",
    sectionId: "sectionOptions",
    stepId: "stepMenu1",
  });

  engine._clearMenuPointer();

  expect(engine._menuPointer).toBeUndefined();

  expect(engine._currentSceneId).toBe('scene1');
  expect(engine._currentSectionId).toBe('section1');
  expect(engine._currentStepId).toBe('step1');


})

test('_updateConfig', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {},
  });

  await engine.init();

  engine._updateConfig();
})

test('_loadSlot', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {
      return {}
    },
    getPersistentData: () => {
      return {
        a: {
          data: {
            sceneId: 'scene1',
            sectionId: 'section1',
            stepId: 'step1',
          }
        }
      }
    },
    takeScreenshot: () => {},
  });

  await engine.init();

  engine._loadSlot('a');
})


test('_saveSlot', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {
      return {}
    },
    getPersistentData: () => {
      return {
        a: {
          data: {
            sceneId: 'scene1',
            sectionId: 'section1',
            stepId: 'step1',
          }
        }
      }
    },
    takeScreenshot: () => {},
  });

  await engine.init();

  engine._saveSlot('a');
})


test('handleAction', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {
      return {}
    },
    getPersistentData: () => {
      return {
        a: {
          data: {
            sceneId: 'scene1',
            sectionId: 'section1',
            stepId: 'step1',
          }
        }
      }
    },
    takeScreenshot: () => {},
  });

  await engine.init();
  engine._clearMenuPointer();

  engine.handleAction(HandlerActions.Init);
  engine.handleAction(HandlerActions.NextStep);
  engine.handleAction(HandlerActions.Slider);
  engine.handleAction(HandlerActions.SaveSlot, { index: 'a'});
  engine.handleAction(HandlerActions.LoadSlot, { index: 'a'});
  engine.handleAction(HandlerActions.StepCompleted);
  engine.handleAction(HandlerActions.Actions);
  // engine.handleAction(HandlerActions.PreviousStep);
  engine.handleAction(HandlerActions.OpenMenu);
})

test('_eventActionHandler', async () => {
  const engine = new RvnEngine({
    gameDataPath: "data/game.json",
    onChangeGameStage: () => {},
    onClose: () => {},
    getData: () => gameData,
    savePersistentData: () => {},
    getPersistentData: () => {},
    takeScreenshot: () => {}, 
  });

  await engine.init();

  engine._eventActionHandler({
    actions: {
      clearMenu: true,
    }
  })
})