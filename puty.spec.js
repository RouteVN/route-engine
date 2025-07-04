import path from 'path'
import { setupTestSuiteFromYaml } from 'puty'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

await setupTestSuiteFromYaml(__dirname);
