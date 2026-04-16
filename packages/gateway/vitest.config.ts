import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './vitest.global-setup.ts',
    hookTimeout: 30000,
    testTimeout: 15000,
  },
})
