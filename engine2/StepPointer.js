
/**
 * Points to a specific section, step
 * This is used to navigate the user through the sections and steps
 */
class StepPointer {
  /**
   * @type {string | undefined}
   */
  _sectionId;

  /**
   * @type {string | undefined}
   */
  _stepId;

  constructor() {}

  /**
   * Whether the pointer is pointing to a section and step
   * @returns {boolean}
   */
  get isActive() {
    return !!this._sectionId && !!this._stepId;
  }

  /**
   * Clears the pointer
   */
  clear() {
    this._sectionId = undefined;
    this._stepId = undefined;
  }

  /**
   * Sets the pointer
   * @param {string} sectionId
   * @param {string} stepId
   */
  set(sectionId, stepId) {
    this._sectionId = sectionId;
    this._stepId = stepId;
  }
}

export default StepPointer;
