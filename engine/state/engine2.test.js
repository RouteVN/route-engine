import { expect, test } from "vitest";
import RvnEngine from "./engine2.js";

const gameData = {
  initial: {
    sectionId: "section1",
    stepId: "step1",
    presetId: "title",
    mode: 'read',
  },
  story: {
    sections: {
      section1: {
        type: 'read',
        id: "section1",
        steps: [
          {
            id: "step1",
          },
          {
            id: "step2",
          },
        ],
      },
      section2: {
        type: 'read',
        id: "section2",
        steps: [
          {
            id: "s2step1",
          },
          {
            id: "s2step2",
          },
          {
            id: "s2step3",
          },
        ],
      },
      section3: {
        type: 'menu',
        id: "section3",
        steps: [
          {
            id: "s3step1",
          },
        ],
      },
      section4: {
        type: 'menu',
        id: "section4",
        steps: [
          {
            id: "s4step1",
          },
        ],
      },
    },
  },
  presets: {
    title: {
      history: false,
      // leftClick: {
      //   action: 'nextStep',
      // }
    },
    read: {
      leftClick: {
        action: 'nextStep',
      },
      rightClick: {
        action: 'moveToMenuSection',
        payload: {
          sectionId: "section3",
          presetId: 'menu',
        }
      },
      scrollUp: {
        action: 'prevStep',
      },
      history: true,
    },
    menu: {
      rightClick: {
        action: 'clearMenu',
        presetId: 'read',
      }
    }
  }
};

test("init", () => {
  const engine = new RvnEngine();
  engine.loadGameData(gameData);
  engine.init();
  expect(engine._mode).toBe("read");
  expect(engine._selectedPresetId).toBe("title");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step1");
});

test("next", () => {
  const engine = new RvnEngine();
  engine.loadGameData(gameData);
  engine.init();

  expect(engine._mode).toBe("read");
  expect(engine._selectedPresetId).toBe("title");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step1");

  // engine.nextStep();

  engine.handleAction('nextStep');

  expect(engine._mode).toBe("read");
  expect(engine._selectedPresetId).toBe("title");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step2");

  // engine.handleEvent('rightClick');

  engine.moveToSection({ sectionId: "section2", mode: 'read', presetId: 'read', addToSection: true });
  expect(engine._mode).toBe("read");
  expect(engine._selectedPresetId).toBe("read");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step1");

  engine.handleEvent('leftClick');
  expect(engine._mode).toBe("read");
  expect(engine._selectedPresetId).toBe("read");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step2");

  engine.handleEvent('scrollUp')
  expect(engine._mode).toBe("history");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step1");

  engine.handleEvent('scrollUp')
  expect(engine._mode).toBe("history");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step2");

  engine.handleEvent('scrollUp')
  expect(engine._mode).toBe("history");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step1");

  engine.handleEvent('leftClick')
  expect(engine._mode).toBe("history");
  expect(engine._selectedPresetId).toBe("read");
  expect(engine._currentStepPointer()._sectionId).toEqual("section1");
  expect(engine._currentStepPointer()._stepId).toEqual("step2");

  engine.handleEvent('leftClick');
  expect(engine._mode).toBe("history");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step1");

  engine.handleEvent('leftClick');
  expect(engine._mode).toBe("read");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step2");

  engine.handleEvent('leftClick');
  expect(engine._mode).toBe("read");
  expect(engine._currentStepPointer()._sectionId).toEqual("section2");
  expect(engine._currentStepPointer()._stepId).toEqual("s2step3");

  engine.moveToSection({ sectionId: "section3", mode: "menu", addToSection: false, presetId: 'menu' });
  expect(engine._mode).toBe("menu");
  expect(engine._currentStepPointer()._sectionId).toEqual("section3");
  expect(engine._currentStepPointer()._stepId).toEqual("s3step1");

  engine.moveToSection({ sectionId: "section3", mode: "menu", addToSection: false, presetId: 'menu' });
  expect(engine._mode).toBe("menu");
  expect(engine._currentStepPointer()._sectionId).toEqual("section3");
  expect(engine._currentStepPointer()._stepId).toEqual("s3step1");

  engine.moveToSection({ sectionId: "section4", mode: "menu", addToSection: false, presetId: 'menu' });
  expect(engine._mode).toBe("menu");
  expect(engine._currentStepPointer()._sectionId).toEqual("section4");
  expect(engine._currentStepPointer()._stepId).toEqual("s4step1");
});

// test('previous', () => {
//   const engine = new RvnEngine();
//   engine.loadGameData(gameData);
//   engine.init();
//   engine.nextStep();
//   engine.previousStep();
// })

// read mode
// disable click and menu
// autonext

// move to menu



/**
 * scenarios:
 * 
 * title opening -> title screen -> menu -> title
 * title opening -> title screen -> read start -> menu -> title
 * title opening -> title screen -> read start -> menu -> read
 * title opening -> title screen -> menu -> replay -> menu
 */
