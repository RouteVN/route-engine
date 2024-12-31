
/**
 * Manages seen sections and steps
 */
class SeenSections {
  /**
   *
   * Key is sectionId
   * Value is stepId
   *
   * if Value is true, then the whole section has been seen
   *
   * Example
   *
   * {
   *   "asdklfje": true,
   *   "asdklfje2": 'fkeljwl,
   * }
   */
  _seenSections = {};

  /**
   * Value is choiceId
   */
  _seenChoices = [];

  constructor(seenSections = {}) {
    this._seenSections = seenSections;
  }

  /**
   * Adds a section's step as seen
   * @param {*} sectionId
   * @param {*} stepId
   * @returns
   */
  addStepId(sectionId, stepId) {
    if (this._seenSections[sectionId] === true) {
      return;
    }
    this._seenSections[sectionId] = stepId;
  }

  /**
   * Check whether a secion's and step has been seen
   * @param {*} section
   * @param {*} stepId
   * @returns
   */
  isStepIdSeen(section, stepId) {
    if (this._seenSections[section.sectionId] === true) {
      return true;
    }
    const currentIndex = section.steps.findIndex(step => step.id === stepId);
    const seenIndex = section.steps.findIndex(
      step => step.id === this._seenSections[section.sectionId]
    );
    return seenIndex >= currentIndex;
  }

  addChoice(choiceId) {
    if (this.isChoiceSeen(choiceId)) {
      return;
    }
    this._seenChoices.push(choiceId);
  }

  /**
   * Check whether a choice has been seen
   * @param {*} choiceId
   * @returns
   */
  isChoiceSeen(choiceId) {
    return this._seenChoices.includes(choiceId);
  }
}

export default SeenSections;
