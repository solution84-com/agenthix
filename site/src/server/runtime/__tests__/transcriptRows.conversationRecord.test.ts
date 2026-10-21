/** A transcript row names its run, and two rows carry their run's state (core's transcript.ts). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ entries: vi.fn(), runs: vi.fn() }))
vi.mock('#db', () => ({ prisma: { transcriptEntry: { findMany: h.entries }, agentRun: { findMany: h.runs } } }))

import { listTranscript } from '../transcriptRows'

const at = new Date('2026-10-10T10:45:00Z')
const base = { sessionId: 's1', authorId: null, thought: null, thinkingDurationMs: null, toolName: null, toolInput: null,
  toolOutput: null, toolUseId: null, model: null, usage: null, detail: null, kind: null, createdAt: at }

beforeEach(() => vi.clearAllMocks())

describe('the conversation record on the wire @SC-772', () => {
  it("gives a person's message its run's status, so a waiting one reads as waiting", async () => {
    h.entries.mockResolvedValue([{ ...base, id: 'e1', role: 'USER', content: 'Also the phone.', runId: 'r2' }])
    h.runs.mockResolvedValue([{ id: 'r2', status: 'PENDING', manifestStatus: 'APPROVED', pendingManifest: null, manifestDecidedById: null, manifestDecidedAt: null, error: null }])
    const [row] = await listTranscript('s1')
    expect(row).toMatchObject({ runId: 'r2', runStatus: 'PENDING' })
    expect(row.approval).toBeNull()
  })

  it('gives an approval request its answer — who, when, and the reason a denial gave', async () => {
    const request = { tools: [{ name: 'web_fetch' }], bashPatterns: [] }
    h.entries.mockResolvedValue([{ ...base, id: 'e2', role: 'SYSTEM', kind: 'APPROVAL_REQUESTED', content: '', runId: 'r1' }])
    h.runs.mockResolvedValue([{ id: 'r1', status: 'CANCELLED', manifestStatus: 'REJECTED', pendingManifest: request, manifestDecidedById: 'u-avery', manifestDecidedAt: at, error: 'Not now' }])
    const [row] = await listTranscript('s1')
    expect(row.approval).toEqual({ status: 'REJECTED', request, decidedById: 'u-avery', decidedAt: at.toISOString(), reason: 'Not now' })
  })

  it('reads no runs for a page with nothing that needs them', async () => {
    h.entries.mockResolvedValue([{ ...base, id: 'e3', role: 'TOOL', content: 'bash', runId: 'r1', kind: null }])
    const [row] = await listTranscript('s1')
    expect(h.runs).not.toHaveBeenCalled()
    expect(row).toMatchObject({ runId: 'r1', kind: null })
  })
})
