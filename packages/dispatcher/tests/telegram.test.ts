import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('undici', () => ({
  fetch: fetchMock,
  ProxyAgent: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createTelegramClient listen', () => {
  it('returns a stop function that aborts the current poll and prevents further polling', async () => {
    const { createTelegramClient } = await import('../src/im/telegram.js')
    fetchMock.mockImplementation((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))

    const { listen } = createTelegramClient('token')
    const stop = listen(vi.fn(), 'im:cfg')

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal

    stop()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(signal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses exponential backoff after consecutive polling errors', async () => {
    const { createTelegramClient } = await import('../src/im/telegram.js')
    fetchMock.mockRejectedValue(new Error('telegram unavailable'))

    const { listen } = createTelegramClient('token')
    const stop = listen(vi.fn(), 'im:cfg')

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    stop()
  })
})
