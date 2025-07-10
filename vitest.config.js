import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    forceRerunTriggers: [
      '**/*.js',
      '**/*.{test,spec}.yaml',
      '**/*.{test,spec}.yml'
    ],
  },
});