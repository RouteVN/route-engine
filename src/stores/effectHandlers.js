/**
 * Pure functions for handling effects with injected dependencies
 */

export const render = ({ processAndRender }) => {
  processAndRender();
};

export const saveVnData = async ({ timer, localStorage, captureElement }, effect) => {
  const { saveData: _saveData, slotIndex } = effect.options;
  const saveData = structuredClone(_saveData);
  const url = await captureElement('story');
  console.log('saveData', saveData);
  console.log('slotindex', slotIndex);
  saveData[slotIndex].image = url;
  localStorage.setItem('saveData', JSON.stringify(saveData));
  timer.setTimeout('saveData', {}, 0);
};

export const saveVariables = ({ localStorage, systemStore }) => {
  const deviceVariables = systemStore.selectDeviceVariables();
  localStorage.setItem('deviceVariables', JSON.stringify(deviceVariables));
};

export const startAutoNextTimer = ({ timer }) => {
  timer.setTimeout('autoMode', {
    nextLine: {
      forceSkipAutonext: true
    }
  }, 1000);
};

export const clearAutoNextTimer = ({ timer }) => {
  timer.clear('autoMode');
};

export const startSkipNextTimer = ({ timer }) => {
  timer.setTimeout('skipMode', {
    nextLine: {
      forceSkipAutonext: true
    }
  }, 300);
};

export const clearSkipNextTimer = ({ timer }) => {
  timer.clear('skipMode');
};

export const startTimer = ({ timer }, effect) => {
  const { timerId, payload, delay } = effect.options;
  timer.setTimeout(timerId, payload, delay);
};
