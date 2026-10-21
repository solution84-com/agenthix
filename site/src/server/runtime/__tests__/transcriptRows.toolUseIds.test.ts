import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: { transcriptEntry: { findMany } } }))

import { listTranscript } from '../transcriptRows'

const entry = { id: 'e1', sessionId: 's1', role: 'TOOL', authorId: null, content: 'bash', thought: null, thinkingDurationMs: null,
  toolName: 'bash', toolInput: {}, toolOutput: 'ok', toolUseId: 'toolu_a', model: null, usage: null, createdAt: new Date('2026-01-01') }

beforeEach(() => { vi.clearAllMocks(); findMany.mockResolvedValue([entry]) })

describe('transcript lines asked for by call id @SC-772', () => {
  it('reads only the TOOL lines with those ids, and returns each line\'s id', async () => {
    const rows = await listTranscript('s1', { toolUseIds: ['toolu_a'] })
    expect(findMany.mock.calls[0][0].where).toEqual({ sessionId: 's1', role: 'TOOL', toolUseId: { in: ['toolu_a'] } })
    expect(rows[0].toolUseId).toBe('toolu_a')
  })

  it('reads every line when no ids are given', async () => {
    await listTranscript('s1')
    expect(findMany.mock.calls[0][0].where).toEqual({ sessionId: 's1' })
  })
})
