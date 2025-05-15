import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    forceRerunTriggers: [
      '**/*.{test,spec}.yaml',
      '**/*.{test,spec}.yml'
    ],
  },
});