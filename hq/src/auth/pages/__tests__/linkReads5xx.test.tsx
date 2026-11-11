// @vitest-environment jsdom
/** An HQ 5xx on a link read is retried and then said as HQ not answering, never as a verdict on the link. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('wasp/client/api', () => ({ getSessionId: () => null }))

import { readInvite } from '../parts/linkApi'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('readInvite on an HQ failure @SC-1937', () => {
  it('retries a 503 and then says unreachable', async () => {
    const fetchMock = vi.fn(async () => ({ status: 503, json: async () => ({}) }) as unknown as Response)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = readInvite('tok')
    await vi.runAllTimersAsync()
    const read = await result
    expect(fetchMock.mock.calls.length).toBe(4)
    expect(read.ok === false && read.refusal.reason).toBe('unreachable')
  })

  it('keeps a 4xx as the final refusal, without retrying', async () => {
    const fetchMock = vi.fn(async () => ({ status: 404, json: async () => ({ reason: 'unknown', error: 'No.' }) }) as unknown as Response)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = readInvite('tok')
    await vi.runAllTimersAsync()
    const read = await result
    expect(fetchMock.mock.calls.length).toBe(1)
    expect(read.ok === false && read.refusal.reason).toBe('unknown')
  })
})
