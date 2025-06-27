// import { produce } from 'immer';
// import { setupTestSuiteFromYaml, registerWrapper } from "./testutil.js";

// registerWrapper('immerProduce', (fn) => {
//   return (state, instructions) => {
//     return produce(state, (draft) => {
//       return fn(draft, instructions);
//     });
//   }
// })

// await setupTestSuiteFromYaml();


import path from 'path'
import { setupTestSuiteFromYaml } from 'puty'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

await setupTestSuiteFromYaml(__dirname);
