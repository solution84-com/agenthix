import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageReport } from '@agenthix/core'
import { MAX_PENDING, USAGE_BATCH, UsageOutbox } from '../usageOutbox'
import { createCloudTokenSource } from '../cloudToken'

const report = (n: number): UsageReport => ({
  callId: `call-${String(n).padStart(6, '0')}`, runId: 'run-1', providerId: 'prov-1', model: 'm', at: '2026-10-23T10:00:00.000Z',
  usage: { inputTokens: n, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, upstreamStatus: 200,
})

let dir: string
let logs: string[]
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-outbox-'))
  logs = []
})
afterEach(async () => {
  vi.useRealTimers()
  await fs.rm(dir, { recursive: true, force: true })
})

const files = async () => (await fs.readdir(dir)).filter(n => n.endsWith('.json')).sort()

describe('usage reports on their way to hq @SC-1229', () => {
  it('are kept on disk until hq acknowledges them, then removed', async () => {
    const send = vi.fn(async (rs: UsageReport[]) => rs.map(r => r.callId))
    const outbox = new UsageOutbox({ dir, send, log: l => logs.push(l) })
    outbox.stop()
    await outbox.add(report(1))
    await outbox.add(report(2))
    expect(await files()).toEqual(['call-000001.json', 'call-000002.json'])
    await outbox.flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].map(r => r.callId).sort()).toEqual(['call-000001', 'call-000002'])
    expect(await files()).toEqual([])
  })

  it('keep what hq could not be asked about, and what it did not acknowledge, for the next try', async () => {
    let fail = true
    const send = vi.fn(async (rs: UsageReport[]) => {
      if (fail) throw new Error('HQ answered 503')
      return rs.slice(0, 1).map(r => r.callId)
    })
    const outbox = new UsageOutbox({ dir, send, log: l => logs.push(l) })
    outbox.stop()
    await outbox.add(report(1))
    await outbox.add(report(2))
    await outbox.flush()
    expect(await files()).toHaveLength(2)
    expect(logs.join()).toContain('HQ answered 503')
    fail = false
    await outbox.flush()
    expect(await files()).toHaveLength(1)
  })

  it('are delivered after a restart of the site, from what is on disk', async () => {
    const first = new UsageOutbox({ dir, send: async () => { throw new Error('down') }, log: () => {} })
    first.stop()
    await first.add(report(7))
    const send = vi.fn(async (rs: UsageReport[]) => rs.map(r => r.callId))
    const second = new UsageOutbox({ dir, send, log: () => {} })
    await second.flush()
    expect(send.mock.calls[0][0]).toEqual([report(7)])
  })

  it('go in batches no larger than hq takes', async () => {
    const sizes: number[] = []
    const outbox = new UsageOutbox({ dir, send: async rs => { sizes.push(rs.length); return rs.map(r => r.callId) }, log: () => {} })
    outbox.stop()
    for (let i = 0; i < USAGE_BATCH + 5; i++) await outbox.add(report(i))
    await outbox.flush()
    expect(sizes).toEqual([USAGE_BATCH, 5])
  })

  it('are sent soon after a call ends', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async (rs: UsageReport[]) => rs.map(r => r.callId))
    const outbox = new UsageOutbox({ dir, send, log: () => {} })
    await outbox.add(report(1))
    await vi.advanceTimersByTimeAsync(1_000)
    vi.useRealTimers()
    await outbox.flush()
    expect(send).toHaveBeenCalled()
    outbox.stop()
  })

  it('remove a file that cannot be read rather than retry it forever', async () => {
    await fs.writeFile(path.join(dir, 'call-broken1.json'), '{not json')
    const outbox = new UsageOutbox({ dir, send: async rs => rs.map(r => r.callId), log: l => logs.push(l) })
    outbox.stop()
    await outbox.flush()
    expect(await files()).toEqual([])
    expect(logs.join()).toContain('could not be read')
  })

  it('stop filling the disk past their limit, saying so', async () => {
    const outbox = new UsageOutbox({ dir, send: async () => [], log: l => logs.push(l) })
    outbox.stop()
    ;(outbox as unknown as { pending: number }).pending = MAX_PENDING
    await outbox.add(report(1))
    expect(await files()).toEqual([])
    expect(logs.join()).toContain('dropped')
  })
})

describe("hq's Cloud token, as the relay holds it @SC-1230", () => {
  it('is asked for once, kept until a minute before it lapses, then asked for again', async () => {
    let now = 0
    const request = vi.fn(async () => ({ ok: true as const, token: { token: `t${request.mock.calls.length}`, expiresAt: 600_000 } }))
    const token = createCloudTokenSource({ request, now: () => now })
    const [a, b] = await Promise.all([token(), token()])
    expect(a).toEqual(b)
    expect(request).toHaveBeenCalledTimes(1)
    now = 539_000
    await token()
    expect(request).toHaveBeenCalledTimes(1)
    now = 541_000
    await token()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('remembers a refusal briefly, so a burst of calls asks hq once', async () => {
    let now = 0
    const request = vi.fn(async () => ({ ok: false as const, refusal: 'not_available' as const }))
    const token = createCloudTokenSource({ request, now: () => now })
    expect(await token()).toEqual({ ok: false, refusal: 'not_available' })
    await token()
    expect(request).toHaveBeenCalledTimes(1)
    now = 31_000
    await token()
    expect(request).toHaveBeenCalledTimes(2)
  })
})
