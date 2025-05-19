import { produce } from 'immer';
import { setupTestSuiteFromYaml, registerWrapper } from "./testutil.js";

registerWrapper('immerProduce', (fn) => {
  return (state, instructions) => {
    return produce(state, (draft) => {
      return fn(draft, instructions);
    });
  }
})

await setupTestSuiteFromYaml();
