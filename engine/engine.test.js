import { expect, test } from "vitest";
import RvnEngine from "./engine.js";
import testData from "./tests/init.json";
import testData2 from "./tests/nextStep.json";
import testData3 from "./tests/moveToSection.json";
import testData4 from "./tests/prevStep.json";
import testData5 from "./tests/exitHistory.json";
import testData6 from "./tests/seenSections.json";

test("test", () => {
  const runTest = (testData) => {
    const engine = new RvnEngine();
    engine.loadGameData(testData.gameData);

    for (const { action, event, assert } of testData.sequences) {
      if (action) {
        engine.handleAction(action.name, action.payload);
      }

      if (event) {
        engine.handleEvent(event.name, event.payload);
      }

      if (assert.pointerMode) {
        expect(engine._mode).toEqual(assert.pointerMode);
      }

      if (assert.preset) {
        expect(engine._selectedPresetId).toEqual(assert.preset);
      }

      if (assert.sectionId) {
        expect(engine._currentStepPointer()._sectionId).toEqual(
          assert.sectionId
        );
      }

      if (assert.stepId) {
        expect(engine._currentStepPointer()._stepId).toEqual(assert.stepId);
      }

      if (assert.seenSections) {
        expect(engine._seenSections._seenSections).toEqual(assert.seenSections);
      }
    }

  };

  runTest(testData);

  runTest(testData2);

  runTest(testData3);

  runTest(testData4);

  runTest(testData5);

  runTest(testData6);
});
