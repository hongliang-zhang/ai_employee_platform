import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const exclude = process.env.VITEST_INTEGRATION === '1'
  ? ['**/node_modules/**']
  : ['**/node_modules/**', 'tests/integration/**']

export default defineConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 15000,
    exclude,
  },
})
