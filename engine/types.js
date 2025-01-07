
/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {Object} actions
 */

/**
 * @typedef {Object} Section
 * @property {string} sectionId
 * @property {Step[]} steps
 */

const Actions = {
  nextStep: "nextStep",
  prevStep: "prevStep",
  startRead: "startRead",
  openMenu: "openMenu",
  closeMenu: "closeMenu",
  exitHistory: "exitHistory",
};
