import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { isCallId, parseUsageReport } from '@agenthix/core'
import { CallMeter, upstreamErrorKind } from '../callMeter'

const at = () => new Date('2026-10-23T10:00:00.000Z')
const info = { runId: 'run-1', providerId: 'prov-1', api: 'anthropic' as const }
const anthropicBody = JSON.stringify({ type: 'message', usage: { input_tokens: 11, output_tokens: 5 } })

describe('a call measured by the relay', () => {
  it('reports its call id, run, provider, model, usage and status, in a shape hq accepts', async () => {
    const meter = new CallMeter(info, at)
    meter.answer(200, 'application/json', undefined)
    meter.chunk(Buffer.from(anthropicBody))
    const report = await meter.report('claude-sonnet-5')
    expect(isCallId(report.callId)).toBe(true)
    expect(report).toEqual({
      callId: meter.callId, runId: 'run-1', providerId: 'prov-1', model: 'claude-sonnet-5', at: '2026-10-23T10:00:00.000Z',
      usage: { inputTokens: 11, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }, upstreamStatus: 200,
    })
    expect(parseUsageReport(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it('reads a compressed answer from a copy, for each encoding a vendor uses', async () => {
    for (const [encoding, zip] of [['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]] as const) {
      const meter = new CallMeter(info, at)
      meter.answer(200, 'application/json', encoding)
      const bytes = zip(Buffer.from(anthropicBody))
      meter.chunk(bytes.subarray(0, 5))
      meter.chunk(bytes.subarray(5))
      expect((await meter.report('m')).usage?.inputTokens).toBe(11)
    }
  })

  it('reports no usage for an encoding it cannot read, and still reports the call', async () => {
    const meter = new CallMeter(info, at)
    meter.answer(200, 'application/json', 'zstd')
    meter.chunk(Buffer.from('?'))
    const report = await meter.report('m')
    expect(report.usage).toBeNull()
    expect(report.errorKind).toBeUndefined()
  })

  it('reports a call that got no answer as unavailable, with status 0', async () => {
    const report = await new CallMeter(info, at).report(null)
    expect(report).toMatchObject({ upstreamStatus: 0, errorKind: 'unavailable', usage: null, model: 'unknown' })
  })

  it('reports an answer the vendor broke off as unavailable, and one cut off by its turn as no failure', async () => {
    const broken = new CallMeter(info, at)
    broken.answer(200, 'text/event-stream', undefined)
    expect((await broken.report('m', true)).errorKind).toBe('unavailable')
    const cut = new CallMeter(info, at)
    cut.answer(200, 'text/event-stream', undefined)
    expect((await cut.report('m', false)).errorKind).toBeUndefined()
  })

  it('names a model it cannot report as unknown', async () => {
    expect((await new CallMeter(info, at).report('bad model name!')).model).toBe('unknown')
  })

  it('makes a new call id for every call', () => {
    expect(new CallMeter(info).callId).not.toBe(new CallMeter(info).callId)
  })
})

describe('the kind of failure an upstream answer names', () => {
  it('reads the status, and the words where the status alone does not say', () => {
    expect(upstreamErrorKind(200, '')).toBeUndefined()
    expect(upstreamErrorKind(401, '')).toBe('auth')
    expect(upstreamErrorKind(403, '')).toBe('auth')
    expect(upstreamErrorKind(402, '{"error":{}}')).toBe('quota')
    expect(upstreamErrorKind(402, '{"error":{"cloud_error":{"code":"cap_reached"}}}')).toBe('cap_reached')
    expect(upstreamErrorKind(429, 'Rate limited')).toBe('rate-limit')
    expect(upstreamErrorKind(429, 'You exceeded your current quota')).toBe('quota')
    expect(upstreamErrorKind(400, 'Your credit balance is too low')).toBe('quota')
    expect(upstreamErrorKind(400, 'bad request')).toBe('invalid')
    expect(upstreamErrorKind(408, '')).toBe('unavailable')
    expect(upstreamErrorKind(529, 'overloaded')).toBe('unavailable')
    expect(upstreamErrorKind(0, '')).toBe('unavailable')
  })
})
