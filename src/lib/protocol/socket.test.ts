import { describe, expect, it } from 'vitest'
import { backoffDelay } from './socket'

describe('reconnect backoff', () => {
  it('grows exponentially and caps at ~30s', () => {
    // With the jitter pinned to its maximum, each step is the full base delay.
    expect(backoffDelay(0, () => 1)).toBe(1_000)
    expect(backoffDelay(1, () => 1)).toBe(2_000)
    expect(backoffDelay(2, () => 1)).toBe(4_000)
    expect(backoffDelay(3, () => 1)).toBe(8_000)
    expect(backoffDelay(20, () => 1)).toBe(30_000)
  })

  it('always jitters — clients reconnecting in lockstep after a blip is the incident to avoid', () => {
    const delays = Array.from({ length: 50 }, () => backoffDelay(4))
    expect(new Set(delays).size).toBeGreaterThan(1)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(8_000)
      expect(delay).toBeLessThanOrEqual(16_000)
    }
  })
})
