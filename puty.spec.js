import path from 'path'
import { afterEach, beforeEach, vi } from 'vitest'
import { setupTestSuiteFromYaml } from 'puty'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const FIXED_TIMESTAMP = 1700000000000

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIMESTAMP)
})

afterEach(() => {
  vi.restoreAllMocks()
})

await setupTestSuiteFromYaml(__dirname);
