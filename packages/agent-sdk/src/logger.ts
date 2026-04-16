import pino from 'pino'

// Use pino-pretty only when stdout is a TTY (local dev).
// In sandbox (non-TTY), fall back to plain JSON to avoid
// the "unable to determine transport target for pino-pretty" error
// when pino-pretty is not installed as a production dependency.
const transport = process.stdout.isTTY
  ? { transport: { target: 'pino-pretty' } }
  : {}

export const logger = pino(transport)
