// Runs in the main Vitest process before any worker is forked.
// process.env set here is inherited by all fork-based workers,
// so gateway/src/index.ts reads the correct values at module load time.
export function setup() {
  process.env.JWT_SECRET ??= 'test-secret-32-chars-minimum-len'
  process.env.DATABASE_URL ??= 'postgres://aaas:aaas@localhost:5432/aaas'
  process.env.LLM_API_KEY ??= 'test-key'
  process.env.LLM_API_URL ??= 'https://mock.example.com/v1/chat/completions'
}
