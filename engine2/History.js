
/**
 * Stores all sections that the user has taken
 * @typedef {Object} HistorySection
 * @property {string} sectionId
 * @property {boolean} [clearHistory=false]
 */

/**
 * Manages the history of the Visual Novel
 * It should lineally know all the sections that the user has taken
 * so that the user could go back to previous sections all the way to the first one
 */
class History {
  /**
   * @type {HistorySection[]}
   */
  _historySections = []

  /**
   * Index of the section that the user is currently in history mode
   * @type {number | undefined}
   */
  _historyModeSectionIndex = undefined;

  _lastStepId = undefined;

  setLastStepId(stepId) {
    this._lastStepId = stepId;
  }

  get lastStepId() {
    return this._lastStepId;
  }

  /**
   * @param {HistorySection[]} sections
   */
  constructor(sections) {
    this._historySections = sections;
  }

  /**
   * Returns current section id in history mode
   * @returns {string | undefined}
   */
  get historyModeSectionId() {
    if (this._historyModeSectionIndex === undefined) {
      return undefined;
    }
    return this._historySections[this._historyModeSectionIndex].sectionId;
  }

  clear() {
    this._historySections = [];
  }

  /**
   * Adds a section to the history
   * @param {HistorySection} historySection
   */
  addSection(historySection) {
    this._historySections.push(historySection)
  }

  /**
   * Clears the history mode index
   */
  clearHistoryModeIndex() {
    this._historyModeSectionIndex = undefined;
  }

  /**
   * Moves to the next section in history mode
   */
  nextSection() {
    if (this._historyModeSectionIndex === undefined) {
      return;
    }
    if (this._historyModeSectionIndex === this._historySections.length - 1) {
      return;
    }
    this._historyModeSectionIndex++;
  }

  /**
   * Moves to the previous section in history mode
   */
  previousSection() {
    if (this._historyModeSectionIndex === undefined) {
      return;
    }
    if (this._historyModeSectionIndex === 0) {
      return;
    }
    this._historyModeSectionIndex--;
  }
}

export default History;
