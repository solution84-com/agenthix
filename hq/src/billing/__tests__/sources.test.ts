import { describe, expect, it } from 'vitest'
import type { RunDispatchPayload, RunStatusEvent } from '@agenthix/core'
import { costingForReport, ledgerTime, readyToLedger, relayCallRow, WAIT_FOR_RUN_MS, type RelayReportRow } from '../sources/relay'
import { runCostingOf, subscriptionRunRow, type RunCostingRow } from '../sources/runs'
import { sealSttTicket, sttSessionRow, ttsCallRow, STT_SESSION_MAX_MS, type VoiceCallAccess } from '../sources/voice'

const report: RelayReportRow = {
  callId: 'call-relay-1', siteId: 's-1', runId: 'run-1', providerId: 'p-ant', model: 'claude-sonnet-4-5', at: new Date('2026-10-23T10:00:00Z'),
  receivedAt: new Date('2026-10-23T10:00:01Z'), hasUsage: true, inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 1,
}
const costing: RunCostingRow = {
  runId: 'run-1', siteId: 's-1', sessionId: 'sess-1', agentId: 'a-1', userId: 'u-1', projectId: 'proj-1', conversationId: 'c-1',
  billingProfileId: 'bp-2', providerId: 'p-sub', model: 'claude-sonnet-4-5', subscription: true,
  baseInputTokens: 1000, baseOutputTokens: 100, baseCacheReadTokens: 0, baseCacheWriteTokens: 0,
}

describe("the relay's reports @SC-1214", () => {
  it("are written to the run's place and profile, with the relay's call id", () => {
    const row = relayCallRow(report, costing, { name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key' })
    expect(row).toMatchObject({
      callId: 'call-relay-1', purpose: 'worker', basis: 'ESTIMATED', billingProfileId: 'bp-2', projectId: 'proj-1', agentId: 'a-1',
      userId: 'u-1', conversationId: 'c-1', runId: 'run-1', vendor: 'anthropic', usage: { inputTokens: 100, cacheWriteTokens: 1 },
    })
  })

  it('go through Cloud awaiting the actual cost, and without usage unpriced', () => {
    expect(relayCallRow(report, costing, { name: 'Agenthix Cloud', vendor: 'cloud', credentialKind: 'cloud_token' as never }).basis).toBe('AWAITING_ACTUAL')
    expect(relayCallRow({ ...report, hasUsage: false }, costing, null)).toMatchObject({ hasUsage: false, providerName: 'Removed provider', vendor: '' })
  })

  it('wait a little for a run hq has not kept yet, then go to the default profile', () => {
    const at = report.receivedAt.getTime()
    expect(readyToLedger(report, true, new Date(at))).toBe(true)
    expect(readyToLedger(report, false, new Date(at + 1000))).toBe(false)
    expect(readyToLedger(report, false, new Date(at + WAIT_FOR_RUN_MS))).toBe(true)
    expect(relayCallRow(report, null, null).billingProfileId).toBe('')
  })
})

describe("a relay report's run and time are checked against what hq kept @SC-1214", () => {
  it("uses a run's costing only for a report from the site the run went to", () => {
    expect(costingForReport(report, costing)).toBe(costing)
    expect(costingForReport({ siteId: 's-other' }, costing)).toBeNull()
    expect(costingForReport(report, undefined)).toBeNull()
  })

  it('books a call no later than its report arrived and no earlier than its run was dispatched', () => {
    const dispatchedAt = new Date('2026-10-23T09:00:00Z')
    expect(ledgerTime(report, dispatchedAt)).toEqual(report.at)
    expect(ledgerTime({ ...report, at: new Date('2031-01-01T00:00:00Z') }, dispatchedAt)).toEqual(report.receivedAt)
    expect(ledgerTime({ ...report, at: new Date('2020-01-01T00:00:00Z') }, dispatchedAt)).toEqual(dispatchedAt)
    expect(ledgerTime({ ...report, at: new Date('2020-01-01T00:00:00Z') })).toEqual(new Date('2020-01-01T00:00:00Z'))
    expect(relayCallRow({ ...report, at: new Date('2031-01-01T00:00:00Z') }, costing, null).at).toEqual(report.receivedAt)
  })
})

describe("a run's costing @SC-1214", () => {
  const payload = {
    session: { id: 'sess-1', agentId: 'a-1', userId: 'u-owner', primaryOwnerType: 'project', primaryOwnerId: 'proj-9', taskId: null },
    onBehalfOfUserId: 'u-1',
    context: {
      modelAccess: { model: { providerId: 'p-sub', model: 'claude-sonnet-4-5' }, provider: { kind: 'subscription' }, billingProfileId: 'bp-2' },
      task: { projectId: 'proj-1' },
    },
  } as unknown as RunDispatchPayload

  it('is what the run was sent, with the totals its session began at', () => {
    expect(runCostingOf('s-1', 'run-1', payload, { conversationId: 'c-1', totalInputTokens: 1000, totalOutputTokens: 100, totalCacheReadTokens: 0, totalCacheWriteTokens: 0 }))
      .toEqual(costing)
  })

  it("writes a subscription run once it ends, included, the tokens it added", () => {
    const ended = { runId: 'run-1', status: 'COMPLETED', sessionPatch: { totalInputTokens: 1500, totalOutputTokens: 160 } } as RunStatusEvent
    expect(subscriptionRunRow(costing, ended, 'Your Claude subscription', new Date())).toMatchObject({
      callId: 'run-1', basis: 'INCLUDED', billingProfileId: 'bp-2', usage: { inputTokens: 500, outputTokens: 60, cacheReadTokens: 0 },
    })
    expect(subscriptionRunRow(costing, { ...ended, status: 'RUNNING' }, 'x', new Date())).toBeNull()
    expect(subscriptionRunRow({ ...costing, subscription: false }, ended, 'x', new Date())).toBeNull()
  })
})

describe('voice @SC-1215', () => {
  const access: VoiceCallAccess = {
    providerId: 'p-aai', providerName: 'AssemblyAI', vendor: 'assemblyai', model: 'u3-rt-pro',
    costing: { purpose: 'stt', basis: 'ESTIMATED', billingProfileId: 'bp-1', agentId: 'a-1' },
  }
  // A stand-in for hq's sealing: the real one encrypts with hq's secrets key.
  const seal = (s: string) => Buffer.from(s).toString('base64')
  const open = (s: string) => Buffer.from(s, 'base64').toString('utf8')
  const issued = new Date('2026-10-23T10:00:00Z')

  it('counts the characters a text-to-speech call sent', () => {
    expect(ttsCallRow({ ...access, vendor: 'inworld' }, 42, issued, { conversationId: 'c-1' })).toMatchObject({ purpose: 'tts', conversationId: 'c-1', usage: { characters: 42 } })
  })

  it('caps a listening session at the time since its token was issued', () => {
    const { callId, ticket } = sealSttTicket(access, 'u-1', issued, undefined, seal)
    const later = new Date(issued.getTime() + 60_000)
    const answer = sttSessionRow(ticket, 'u-1', 10 * 60_000, later, open)
    expect(answer).toMatchObject({ ok: true, row: { callId, purpose: 'stt', userId: 'u-1', billingProfileId: 'bp-1', usage: { audioMs: 60_000 } } })
    const long = sttSessionRow(ticket, 'u-1', 10 * 3_600_000, new Date(issued.getTime() + 5 * 3_600_000), open)
    expect(long.ok && long.row.usage.audioMs).toBe(STT_SESSION_MAX_MS)
  })

  it("refuses someone else's ticket, one hq did not seal, and an old one", () => {
    const { ticket } = sealSttTicket(access, 'u-1', issued, undefined, seal)
    expect(sttSessionRow(ticket, 'u-2', 1000, issued, open).ok).toBe(false)
    expect(sttSessionRow('rubbish', 'u-1', 1000, issued, () => { throw new Error('bad') }).ok).toBe(false)
    expect(sttSessionRow(ticket, 'u-1', 1000, new Date(issued.getTime() + 25 * 3_600_000), open).ok).toBe(false)
  })
})
