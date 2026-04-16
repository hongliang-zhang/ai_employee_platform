import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Runs in the main Vitest process before any worker is forked.
// process.env set here is inherited by all fork-based workers,
// so gateway/src/index.ts reads the correct values at module load time.
export function setup() {
  // Load root .env for local development (no-op in CI where vars are injected)
  config({ path: resolve(__dirname, '../../.env') })

  process.env.JWT_SECRET ??= 'test-secret-32-chars-minimum-len'
  process.env.DATABASE_URL ??= 'mysql://aaas:aaas@localhost:4000/aaas'
  process.env.LLM_API_KEY ??= 'test-key'
  process.env.LLM_API_URL ??= 'https://mock.example.com/v1/chat/completions'
}
