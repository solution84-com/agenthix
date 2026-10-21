/** A run's rows in the transcript: the conversation's whole record (core's transcript.ts). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMany = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    transcriptEntry: { createMany },
    toolCallLog: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import { persistRunOutput, NO_REPLY_TEXT } from '../runPersistence'
import { newStreamedRun, type StreamedRun } from '../runEventLoop'

beforeEach(() => vi.clearAllMocks())

const t = (s: number) => new Date(Date.UTC(2026, 9, 10, 10, 40, s))
const rows = () => createMany.mock.calls[0][0].data as Array<Record<string, unknown>>

function streamed(over: Partial<StreamedRun> = {}): StreamedRun {
  return { ...newStreamedRun(), ...over }
}

describe("a run's rows @SC-771 @SC-777", () => {
  it("record the harness's call id, the run and when each call was made", async () => {
    await persistRunOutput({
      sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'completed' },
      streamed: streamed({
        fullReply: 'done',
        toolCallMap: new Map([
          ['toolu_a', { toolName: 'bash', toolInput: { command: 'ls' }, output: 'a.txt', at: t(1) }],
          ['call_b', { toolName: 'read_file', toolInput: { path: 'x' }, at: t(2) }],
        ]),
      }),
    })
    const tools = rows().filter(r => r.role === 'TOOL')
    expect(tools.map(l => l.toolUseId)).toEqual(['toolu_a', 'call_b'])
    expect(tools[0]).toMatchObject({ runId: 'r1', toolName: 'bash', toolOutput: 'a.txt', createdAt: t(1) })
    expect(rows().find(r => r.role === 'ASSISTANT')).toMatchObject({ runId: 'r1', content: 'done' })
  })

  it('keep each stretch of thinking where it happened', async () => {
    await persistRunOutput({
      sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'completed' },
      streamed: streamed({ fullReply: 'ok', thoughts: [{ at: t(1), text: 'Read first.' }, { at: t(5), text: 'Now fix it.' }] }),
    })
    expect(rows().filter(r => r.kind === 'THOUGHT').map(r => [r.content, r.createdAt])).toEqual([['Read first.', t(1)], ['Now fix it.', t(5)]])
  })

  it('keep what a stopped run wrote, then say who stopped it', async () => {
    await persistRunOutput({
      sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'stopped', cause: 'person', by: 'Avery' },
      streamed: streamed({ fullReply: 'Half an ans', toolCallMap: new Map([['c', { toolName: 'edit_file', toolInput: {}, at: t(1) }]]) }),
    })
    expect(rows().map(r => r.kind ?? r.role)).toEqual(['TOOL', 'ASSISTANT', 'RUN_STOPPED'])
    expect(rows().at(-1)).toMatchObject({ role: 'SYSTEM', runId: 'r1', detail: { cause: 'person', by: 'Avery' } })
  })

  it('keep what a failed run did, then its reason in plain words', async () => {
    await persistRunOutput({
      sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'failed', reason: 'The site lost its connection to the model.' },
      streamed: streamed({ toolCallMap: new Map([['c', { toolName: 'read_file', toolInput: {}, at: t(1) }]]) }),
    })
    expect(rows().map(r => r.kind ?? r.role)).toEqual(['TOOL', 'RUN_FAILED'])
    expect(rows().at(-1)).toMatchObject({ detail: { reason: 'The site lost its connection to the model.' } })
  })

  it('record where the runtime summarised, naming who asked for a manual summary', async () => {
    await persistRunOutput({
      sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'completed' }, summarise: true, personId: 'u-avery',
      streamed: streamed({ compactions: [{ at: t(3), trigger: 'manual', summary: 'Avery is redesigning…', tokensBefore: 188000 }] }),
    })
    expect(rows()).toEqual([expect.objectContaining({
      kind: 'CONTEXT_SUMMARISED', runId: 'r1', createdAt: t(3),
      detail: { trigger: 'manual', summary: 'Avery is redesigning…', tokensBefore: 188000, byId: 'u-avery' },
    })])
  })

  it('say plainly when a turn did nothing — but not for a summary asked for', async () => {
    await persistRunOutput({ sessionId: 's1', runId: 'r1', resolvedModel: 'm', ending: { kind: 'completed' }, streamed: streamed() })
    expect(rows()).toEqual([expect.objectContaining({ role: 'ASSISTANT', content: NO_REPLY_TEXT })])
    createMany.mockClear()
    await persistRunOutput({ sessionId: 's1', runId: 'r2', resolvedModel: 'm', ending: { kind: 'completed' }, summarise: true, streamed: streamed() })
    expect(createMany).not.toHaveBeenCalled()
  })
})
