/**
 * An approval is for the next run only (every-screen-reviewed spec §9): approving a request starts the next run
 * of its task or conversation, that run alone is given what was approved, with a note telling the agent, and an
 * unanswered request is replaced by any newer run. The run rows are held in memory, in the order they were made;
 * the real dispatch validator, `runTask`, `runChat` and the control handlers run on them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = {
  id: string
  sessionId: string
  taskId: string | null
  agentId: string
  manifestStatus: string | null
  pendingManifest: unknown
  status: string
  createdAt: Date
  [key: string]: unknown
}

const h = vi.hoisted(() => ({ rows: [] as Row[], engineRun: vi.fn(), status: vi.fn(), transcriptCreate: vi.fn() }))

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Record<string, unknown>[]).some(w => matches(row, w))
    if (value && typeof value === 'object' && 'not' in value) return row[key] !== (value as { not: unknown }).not
    return row[key] === value
  })
}

vi.mock('#db', () => {
  const newestFirst = (rows: Row[]) => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  let made = 0
  return {
    prisma: {
      agentRun: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => newestFirst(h.rows).find(r => matches(r, where)) ?? null),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.rows.find(r => r.id === where.id) ?? null),
        create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
          const row = { id: `new-${++made}`, createdAt: new Date(Date.now() + made * 1000), ...data } as Row
          h.rows.push(row)
          return row
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          const row = h.rows.find(r => r.id === where.id)!
          Object.assign(row, data)
          return row
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
          const hit = h.rows.filter(r => matches(r, where))
          for (const row of hit) Object.assign(row, data)
          return { count: hit.length }
        }),
      },
      agentSession: { findUnique: vi.fn(async () => ({ title: 'Named' })), update: vi.fn() },
      transcriptEntry: { create: h.transcriptCreate },
    },
  }
})
vi.mock('../../../agents/runtime/AgentEngine', () => ({ agentEngine: { run: h.engineRun } }))
vi.mock('../../../agents/runtime/SiteStreamEmitter', () => ({ siteStream: { stream: vi.fn(), status: h.status } }))

import { runTask } from '../taskExecution'
import { runChat } from '../chatExecution'
import { runDispatchParams } from '../dispatchParams'
import { handleRunApprove, handleRunReject } from '../dispatchHandler'

const AGENT = {
  id: 'agent-1', name: 'Ada', handle: 'ada', role: null, runtime: 'claude-sdk', approval: 'deferred',
  defaultModel: 'claude-sonnet-4-6', allowedTools: null, allowedBashPatterns: null, isKernel: false,
}
const PACKAGES = {
  agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
  org: null,
  platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
}
const SESSION = {
  id: 'sess-1', sessionKey: 'k', agentId: 'agent-1', userId: 'admin-1', sessionType: 'task', taskId: 'task-1',
  title: null, model: null, metadata: {}, primaryOwnerType: 'project', primaryOwnerId: 'proj-1', primaryWorkspaceId: null,
  runtime: 'claude-sdk', createdAt: '2026-09-27T00:00:00.000Z',
}

function taskDispatch() {
  return runDispatchParams.parse({
    kind: 'task', startedBy: 'person', capabilityJwt: 'jwt', session: SESSION,
    inputText: 'Execute your assigned task.', model: 'claude-sonnet-4-6', hideUserMessage: false, runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
    context: {
      agent: AGENT,
      task: {
        taskId: 'task-1', taskKey: 'WEB-1', title: 'Ship it', description: 'Do it.', projectId: 'proj-1',
        projectName: 'Web', projectSlug: 'web', boardName: 'Main', columns: '- todo',
      },
      mounts: { ownerSlugs: { 'proj-1': 'web' } }, riskRules: null, credential: null, packages: PACKAGES,
    },
  }) as Parameters<typeof runTask>[0]
}

function chatDispatch(inputText = 'Please continue.', hideUserMessage = true) {
  return runDispatchParams.parse({
    kind: 'chat', startedBy: 'person', capabilityJwt: 'jwt',
    session: { ...SESSION, id: 'chat-1', sessionType: 'chat', taskId: null, primaryOwnerType: null, primaryOwnerId: null },
    inputText, model: 'claude-sonnet-4-6', hideUserMessage, runLimits: { timeLimitMinutes: 60, turnLimit: 100 },
    context: { agent: AGENT, chat: { sessionContext: null }, mounts: { ownerSlugs: {} }, riskRules: null, credential: null, packages: PACKAGES },
  }) as Parameters<typeof runChat>[0]
}

let clock = Date.parse('2026-10-01T00:00:00.000Z')
function earlierRun(partial: Partial<Row> & { id: string }): Row {
  const row: Row = {
    sessionId: 'sess-1', taskId: 'task-1', agentId: 'agent-1', status: 'COMPLETED', manifestStatus: 'APPROVED',
    pendingManifest: null, createdAt: new Date((clock += 60_000)), ...partial,
  }
  h.rows.push(row)
  return row
}

const WEB_FETCH = { tools: [{ name: 'web_fetch', reason: 'read the docs' }], bashPatterns: [{ pattern: 'git push', reason: 'ship' }] }

function created(): Row {
  return h.rows[h.rows.length - 1]
}

/** What the run was given of WEB_FETCH's request, read off the tools and patterns it starts allowed. */
function extendedTools(row: Row): string[] {
  const { tools, bashPatterns } = row.approvedManifest as { tools: string[]; bashPatterns: string[] }
  return [...tools, ...bashPatterns].filter(name => name === 'web_fetch' || name === 'git push')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.rows.length = 0
  h.engineRun.mockResolvedValue({ status: 'COMPLETED' })
})

describe("a task's approval is for its next run only @SC-769", () => {
  it('the run after the approved one is given what was approved, with a note telling the agent', async () => {
    earlierRun({ id: 'asked', manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })

    await runTask(taskDispatch())

    const next = created()
    expect(extendedTools(next)).toEqual(['web_fetch', 'git push'])
    expect(next.inputText).toMatch(/approved your request to use: web_fetch, the command `git push`/)
    expect(next.inputText).toMatch(/in this run only/)
    expect(next.inputText).toMatch(/Execute your assigned task\.$/)
  })

  it('the run after that is given nothing: the agent\'s levels apply again', async () => {
    earlierRun({ id: 'asked', manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })
    earlierRun({ id: 'approved-run', manifestStatus: 'APPROVED', pendingManifest: null })

    await runTask(taskDispatch())

    expect(extendedTools(created())).toEqual([])
    expect(created().inputText).toBe('Execute your assigned task.')
  })

  it('an older approval is never carried past a newer request that was not approved', async () => {
    earlierRun({ id: 'asked', manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })
    earlierRun({ id: 'asked-again', manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: [{ name: 'bash' }], bashPatterns: [] } })

    await runTask(taskDispatch())

    expect(extendedTools(created())).toEqual([])
  })

  it('is not carried to another agent\'s run when the task is handed on', async () => {
    earlierRun({ id: 'asked', agentId: 'agent-2', manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })

    await runTask(taskDispatch())

    expect(extendedTools(created())).toEqual([])
    expect(created().inputText).toBe('Execute your assigned task.')
  })

  it("replaces the task's unanswered request, and only that", async () => {
    earlierRun({ id: 'waiting', manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })
    earlierRun({ id: 'elsewhere', sessionId: 'sess-other', taskId: 'task-2', manifestStatus: 'PENDING_APPROVAL' })

    await runTask(taskDispatch())

    expect(h.rows.find(r => r.id === 'waiting')!.manifestStatus).toBe('SUPERSEDED')
    expect(h.rows.find(r => r.id === 'elsewhere')!.manifestStatus).toBe('PENDING_APPROVAL')
  })

  it('a bypassed run replaces the unanswered request too', async () => {
    earlierRun({ id: 'waiting', manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })
    const dispatch = taskDispatch()
    dispatch.context.agent.approval = 'bypassed'

    await runTask(dispatch)

    expect(h.rows.find(r => r.id === 'waiting')!.manifestStatus).toBe('SUPERSEDED')
  })
})

describe("a conversation's approval is for its next run only @SC-769", () => {
  it('the next run is given what was approved, with the note before the message hq sent, written to no transcript', async () => {
    earlierRun({ id: 'asked', sessionId: 'chat-1', taskId: null, manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })

    await runChat(chatDispatch())

    const next = created()
    expect(extendedTools(next)).toEqual(['web_fetch', 'git push'])
    expect(next.inputText).toMatch(/^\[A person approved your request to use: web_fetch.*\]\n\nPlease continue\.$/s)
    expect(h.transcriptCreate).not.toHaveBeenCalled()
  })

  it('a later message is given nothing', async () => {
    earlierRun({ id: 'asked', sessionId: 'chat-1', taskId: null, manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })
    earlierRun({ id: 'approved-run', sessionId: 'chat-1', taskId: null, manifestStatus: 'APPROVED' })

    await runChat(chatDispatch('And now the tests', false))

    expect(extendedTools(created())).toEqual([])
    expect(created().inputText).toBe('And now the tests')
  })

  it('a new message replaces the unanswered request', async () => {
    earlierRun({ id: 'waiting', sessionId: 'chat-1', taskId: null, manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })

    await runChat(chatDispatch('Never mind, do this instead', false))

    expect(h.rows.find(r => r.id === 'waiting')!.manifestStatus).toBe('SUPERSEDED')
    expect(extendedTools(created())).toEqual([])
  })
})

describe('run.approve @SC-769', () => {
  it('approves the newest run of its session', async () => {
    earlierRun({ id: 'waiting', manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })
    await expect(handleRunApprove({ runId: 'waiting' })).resolves.toEqual({ approved: true })
    expect(h.rows[0].manifestStatus).toBe('APPROVED')
  })

  it('refuses a request a newer run has overtaken, and leaves it as it is', async () => {
    earlierRun({ id: 'waiting', manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })
    earlierRun({ id: 'newer', status: 'RUNNING' })
    await expect(handleRunApprove({ runId: 'waiting' })).resolves.toEqual({ approved: false })
    expect(h.rows[0].manifestStatus).toBe('PENDING_APPROVAL')
  })

  it('refuses a replaced request', async () => {
    earlierRun({ id: 'replaced', manifestStatus: 'SUPERSEDED', pendingManifest: WEB_FETCH })
    await expect(handleRunApprove({ runId: 'replaced' })).resolves.toEqual({ approved: false })
  })
})

describe('run.reject with replaced @SC-769', () => {
  it('marks an unanswered request replaced, and nothing else: no transcript entry, no status frame', async () => {
    earlierRun({ id: 'waiting', sessionId: 'chat-1', taskId: null, manifestStatus: 'PENDING_APPROVAL', pendingManifest: WEB_FETCH })

    await expect(handleRunReject({ runId: 'waiting', replaced: true })).resolves.toEqual({ ok: true })

    expect(h.rows[0]).toMatchObject({ manifestStatus: 'SUPERSEDED', status: 'COMPLETED' })
    expect(h.transcriptCreate).not.toHaveBeenCalled()
    expect(h.status).not.toHaveBeenCalled()
  })

  it('is safe to send twice, and leaves an answered request as it is', async () => {
    earlierRun({ id: 'answered', manifestStatus: 'APPROVED', pendingManifest: WEB_FETCH })
    await expect(handleRunReject({ runId: 'answered', replaced: true })).resolves.toEqual({ ok: true })
    await expect(handleRunReject({ runId: 'missing', replaced: true })).resolves.toEqual({ ok: true })
    expect(h.rows[0].manifestStatus).toBe('APPROVED')
  })

  it('refuses a replaced request being denied', async () => {
    earlierRun({ id: 'replaced', manifestStatus: 'SUPERSEDED' })
    await expect(handleRunReject({ runId: 'replaced', reason: 'no' })).rejects.toThrow(/not pending approval/)
  })
})
