import { describe, expect, it } from 'vitest'
import { parseUsageReport } from '../usageReport.js'

const report = {
  callId: '7f3c2a10-1b2c-4d5e-8f90-123456789abc', runId: 'run-1', providerId: 'prov-1', model: 'deepseek/deepseek-v3.2',
  at: '2026-10-23T10:00:00Z', usage: { inputTokens: 10, outputTokens: 5 }, upstreamStatus: 200,
}

describe('the usage report', () => {
  it('reads a report, cache tokens 0 when absent', () => {
    expect(parseUsageReport(report)).toEqual({
      ...report, at: '2026-10-23T10:00:00.000Z', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it('reads an answer with no usage, and a failed call with its kind', () => {
    expect(parseUsageReport({ ...report, usage: null })?.usage).toBeNull()
    expect(parseUsageReport({ ...report, upstreamStatus: 401, errorKind: 'auth' })?.errorKind).toBe('auth')
    expect(parseUsageReport({ ...report, upstreamStatus: 0, errorKind: 'unavailable' })?.upstreamStatus).toBe(0)
  })

  it('refuses a report that is not its shape', () => {
    for (const bad of [
      { ...report, callId: 'x' }, { ...report, usage: { inputTokens: -1, outputTokens: 0 } }, { ...report, upstreamStatus: 700 },
      { ...report, errorKind: 'nope' }, { ...report, at: 'later' }, { ...report, usage: undefined }, null,
    ]) expect(parseUsageReport(bad)).toBeNull()
  })
})
